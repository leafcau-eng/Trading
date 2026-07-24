import type { Candle, SwingPoint } from '../src/types';
import { detectSwings, SwingDetectionEngine } from '../src/swingDetectionEngine';

let pass = 0;
let fail = 0;

function check(label: string, condition: boolean, detail: string) {
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition || process.env.VERBOSE) console.log(`       ${detail}`);
  condition ? pass++ : fail++;
}

function candle(high: number, low: number, i: number): Candle {
  // open/close gak relevan buat Swing Detection (cuma high/low), diisi
  // nilai wajar aja biar tipenya valid.
  return {
    timestamp: `2026-01-01T${String(i).padStart(2, '0')}:00:00Z`,
    open: (high + low) / 2,
    close: (high + low) / 2,
    high,
    low,
  };
}

function pointKey(p: SwingPoint): string {
  return `${p.type}@${p.candle_index}=${p.price}`;
}

// ---------------------------------------------------------------------
// 1. Sanity: satu peak jelas, N=1
// ---------------------------------------------------------------------
{
  // index:  0   1   2   3   4
  // high:  10  12  20  11  9   <- index 2 jelas swing high
  // low:    5   6   8   4   3   <- index 3 jelas swing low (4 < 8 dan 4 < 3? NO -> bukan)
  const series = [
    candle(10, 5, 0),
    candle(12, 6, 1),
    candle(20, 8, 2),
    candle(11, 4, 3),
    candle(9, 3, 4),
  ];
  const result = detectSwings(series, 1);
  const keys = result.points.map(pointKey).sort();
  check(
    'Sanity peak N=1 — swing high di index 2',
    keys.includes('high@2=20'),
    `points: ${JSON.stringify(keys)}`
  );
  check(
    'Sanity N=1 — swing_fractal_n ke-record di output',
    result.swing_fractal_n === 1,
    `swing_fractal_n=${result.swing_fractal_n}`
  );
}

// ---------------------------------------------------------------------
// 2. Edge case: data < 2N+1 -> kosong, bukan error
// ---------------------------------------------------------------------
{
  const shortSeries = [candle(10, 5, 0), candle(12, 6, 1)]; // N=2 butuh minimal 5 candle
  const result = detectSwings(shortSeries, 2);
  check(
    'Edge case: data < 2N+1 -> list kosong tanpa throw',
    result.points.length === 0,
    `points.length=${result.points.length}`
  );
}

// ---------------------------------------------------------------------
// 3. Equal-high di window yang sama -> DUA-DUANYA gagal (strict >, no dedup)
// ---------------------------------------------------------------------
{
  // index 2 dan index 1 sama-sama high=20 — index 2 (kandidat) gak "lebih
  // tinggi" dari tetangga kirinya yang setara, jadi harus gagal jadi swing.
  const seriesEqual = [
    candle(10, 5, 0),
    candle(20, 6, 1), // kiri, sama tingginya dengan index 2
    candle(20, 6, 2), // kandidat
    candle(15, 6, 3), // kanan, lebih rendah
    candle(10, 5, 4),
  ];
  const result = detectSwings(seriesEqual, 1);
  const hasHighAt2 = result.points.some((p) => p.type === 'high' && p.candle_index === 2);
  check(
    'Equal-high vs tetangga kiri -> candidate GAGAL swing high (strict >)',
    !hasHighAt2,
    `points: ${JSON.stringify(result.points.map(pointKey))}`
  );
}

// ---------------------------------------------------------------------
// 4. Outside candle -> confirmed sebagai swing high DAN swing low sekaligus
// ---------------------------------------------------------------------
{
  const series = [
    candle(10, 5, 0),
    candle(25, 1, 1), // outside candle: high tertinggi DAN low terendah di window-nya
    candle(10, 5, 2),
  ];
  const result = detectSwings(series, 1);
  const types = result.points.filter((p) => p.candle_index === 1).map((p) => p.type).sort();
  check(
    'Outside candle -> dapat status high DAN low di index yang sama',
    JSON.stringify(types) === JSON.stringify(['high', 'low']),
    `types at index 1: ${JSON.stringify(types)}`
  );
}

// ---------------------------------------------------------------------
// 5. Invalid swing_fractal_n -> throw, bukan silent default
// ---------------------------------------------------------------------
{
  const series = [candle(10, 5, 0), candle(12, 6, 1), candle(14, 7, 2)];
  let threwForZero = false;
  let threwForNegative = false;
  let threwForFloat = false;
  try {
    detectSwings(series, 0);
  } catch {
    threwForZero = true;
  }
  try {
    detectSwings(series, -1);
  } catch {
    threwForNegative = true;
  }
  try {
    detectSwings(series, 1.5);
  } catch {
    threwForFloat = true;
  }
  check('Invalid N=0 -> throws', threwForZero, 'expected throw');
  check('Invalid N=-1 -> throws', threwForNegative, 'expected throw');
  check('Invalid N=1.5 -> throws', threwForFloat, 'expected throw');
}

// ---------------------------------------------------------------------
// 6 & 7. Differential test vs brute-force reference + batch===incremental
//         konsistensi, di atas deret pseudo-random deterministik (seeded)
// ---------------------------------------------------------------------

/** Reference implementation naif — sengaja ditulis terpisah dari engine
 *  utama, gak reuse kode apapun, biar jadi oracle independen. */
function referenceDetectSwings(candles: readonly Candle[], n: number): SwingPoint[] {
  const points: SwingPoint[] = [];
  for (let i = n; i <= candles.length - 1 - n; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - n; j <= i + n; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) {
      points.push({
        type: 'high',
        price: candles[i].high,
        candle_index: i,
        timestamp: candles[i].timestamp,
        status: 'CONFIRMED',
        confirmed_at_index: i + n,
      });
    }
    if (isLow) {
      points.push({
        type: 'low',
        price: candles[i].low,
        candle_index: i,
        timestamp: candles[i].timestamp,
        status: 'CONFIRMED',
        confirmed_at_index: i + n,
      });
    }
  }
  return points;
}

/** mulberry32 — PRNG kecil, deterministik dari seed tetap, biar test
 *  reproducible persis sama tiap run (bukan Math.random()). */
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateSeries(length: number, seed: number): Candle[] {
  const rand = mulberry32(seed);
  const series: Candle[] = [];
  let base = 100;
  for (let i = 0; i < length; i++) {
    base += (rand() - 0.5) * 4;
    const high = base + rand() * 2;
    const low = base - rand() * 2;
    series.push(candle(Number(high.toFixed(4)), Number(low.toFixed(4)), i));
  }
  return series;
}

for (const [seed, length, n] of [
  [1, 200, 1],
  [2, 200, 2],
  [3, 200, 3],
  [4, 50, 5],
  [5, 500, 2],
] as const) {
  const series = generateSeries(length, seed);

  const batchResult = detectSwings(series, n).points;
  const referenceResult = referenceDetectSwings(series, n);

  const batchKeys = batchResult.map(pointKey).sort();
  const referenceKeys = referenceResult.map(pointKey).sort();

  check(
    `Differential vs brute-force reference — seed=${seed} len=${length} N=${n}`,
    JSON.stringify(batchKeys) === JSON.stringify(referenceKeys),
    `batch=${batchKeys.length} pts, reference=${referenceKeys.length} pts` +
      (JSON.stringify(batchKeys) !== JSON.stringify(referenceKeys)
        ? `\n       DIFF batch-only: ${JSON.stringify(batchKeys.filter((k) => !referenceKeys.includes(k)))}` +
          `\n       DIFF reference-only: ${JSON.stringify(referenceKeys.filter((k) => !batchKeys.includes(k)))}`
        : '')
  );

  // Mode incremental harus hasilin persis titik yang sama, urutan confirmed
  // (by confirmed_at_index) kalau di-feed satu-satu.
  const engine = new SwingDetectionEngine(n);
  const incrementalPoints: SwingPoint[] = [];
  for (const c of series) {
    incrementalPoints.push(...engine.ingest(c));
  }
  const incrementalKeys = incrementalPoints.map(pointKey).sort();

  check(
    `Batch === Incremental — seed=${seed} len=${length} N=${n}`,
    JSON.stringify(batchKeys) === JSON.stringify(incrementalKeys),
    `batch=${batchKeys.length} pts, incremental=${incrementalKeys.length} pts`
  );

  check(
    `Incremental engine.getConfirmedPoints() cocok sama hasil ingest() — seed=${seed}`,
    JSON.stringify(engine.getConfirmedPoints().map(pointKey).sort()) === JSON.stringify(incrementalKeys),
    'internal state harus sinkron sama return value ingest()'
  );
}

console.log(`\n${pass}/${pass + fail} passed.`);
if (fail > 0) {
  console.log(`${fail} FAILED.`);
  process.exit(1);
}
