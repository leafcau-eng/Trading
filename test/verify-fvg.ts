import type { Candle, FVG } from '../src/types';
import { FVGEngine, detectFVGs } from '../src/fvgEngine';

let pass = 0;
let fail = 0;

function check(label: string, condition: boolean, detail: string) {
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition || process.env.VERBOSE) console.log(`       ${detail}`);
  condition ? pass++ : fail++;
}

function c(high: number, low: number, i: number, close?: number): Candle {
  const cl = close ?? (high + low) / 2;
  return {
    timestamp: `2026-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
    open: cl,
    close: cl,
    high,
    low,
  };
}

// =======================================================================
// 1. Formasi bullish FVG dasar
// =======================================================================
{
  // A: high=10, B: candle tengah bebas, C: low=15 -> gap [10,15], bullish
  const candles = [c(10, 5, 0), c(20, 12, 1), c(25, 15, 2)];
  const result = detectFVGs(candles);
  check('Bullish FVG kebentuk', result.length === 1, `result=${JSON.stringify(result)}`);
  if (result.length === 1) {
    check('type=bullish', result[0].type === 'bullish', `type=${result[0].type}`);
    check('gap_low = high[A] = 10', result[0].gap_low === 10, `gap_low=${result[0].gap_low}`);
    check('gap_high = low[C] = 15', result[0].gap_high === 15, `gap_high=${result[0].gap_high}`);
    check('formed_at_candle_index = index C = 2', result[0].formed_at_candle_index === 2, `formed_at=${result[0].formed_at_candle_index}`);
  }
}

// =======================================================================
// 2. Formasi bearish FVG dasar
// =======================================================================
{
  // A: low=20, B: bebas, C: high=15 -> gap [15,20], bearish
  const candles = [c(25, 20, 0), c(18, 10, 1), c(15, 8, 2)];
  const result = detectFVGs(candles);
  check('Bearish FVG kebentuk', result.length === 1, `result=${JSON.stringify(result)}`);
  if (result.length === 1) {
    check('type=bearish', result[0].type === 'bearish', `type=${result[0].type}`);
    check('gap_low = high[C] = 15', result[0].gap_low === 15, `gap_low=${result[0].gap_low}`);
    check('gap_high = low[A] = 20', result[0].gap_high === 20, `gap_high=${result[0].gap_high}`);
  }
}

// =======================================================================
// 3. Overlap (gak ada gap) -> gak kebentuk FVG
// =======================================================================
{
  const candles = [c(10, 5, 0), c(12, 8, 1), c(11, 6, 2)]; // C overlap A, gak ada gap
  const result = detectFVGs(candles);
  check('Overlap candle -> tidak ada FVG', result.length === 0, `result=${JSON.stringify(result)}`);
}

// =======================================================================
// 4. Candle B gak pernah dipakai di perbandingan (proof + empiris)
// =======================================================================
{
  // Ganti-ganti nilai B secara ekstrem, gap A-C harusnya identik terus
  const base = () => [c(10, 5, 0), c(999, -999, 1), c(25, 15, 2)];
  const withExtremeB = detectFVGs(base());
  const withNormalB = detectFVGs([c(10, 5, 0), c(12, 8, 1), c(25, 15, 2)]);
  check(
    'Gap identik walau candle B diubah ekstrem (B gak dipakai di formula)',
    JSON.stringify(withExtremeB.map((f) => [f.gap_low, f.gap_high])) ===
      JSON.stringify(withNormalB.map((f) => [f.gap_low, f.gap_high])),
    `extreme=${JSON.stringify(withExtremeB)}, normal=${JSON.stringify(withNormalB)}`
  );
}

// =======================================================================
// 5. Edge case: <3 candle -> kosong, bukan error
// =======================================================================
{
  check('0 candle -> kosong', detectFVGs([]).length === 0, 'ok');
  check('1 candle -> kosong', detectFVGs([c(10, 5, 0)]).length === 0, 'ok');
  check('2 candle -> kosong', detectFVGs([c(10, 5, 0), c(12, 6, 1)]).length === 0, 'ok');
}

// =======================================================================
// 6. Mitigasi: SATU candle full-fill langsung
// =======================================================================
{
  const engine = new FVGEngine();
  engine.ingestCandle(c(10, 5, 0)); // A
  engine.ingestCandle(c(20, 12, 1)); // B
  const formed = engine.ingestCandle(c(25, 15, 2)); // C -> gap [10,15]
  const fvg = formed.find((f) => f.mitigation_status === 'ACTIVE')!;
  check('FVG terbentuk ACTIVE', fvg !== undefined, `formed=${JSON.stringify(formed)}`);

  // candle berikutnya, range [8,17] -> full cover [10,15] dalam 1 candle
  const mitigated = engine.ingestCandle(c(17, 8, 3));
  check('Full-fill 1 candle -> MITIGATED', mitigated.some((f) => f.fvg_id === fvg.fvg_id && f.mitigation_status === 'MITIGATED'), `mitigated=${JSON.stringify(mitigated)}`);
  check('mitigated_at_candle_index = 3', engine.getFVGs()[0].mitigated_at_candle_index === 3, `idx=${engine.getFVGs()[0].mitigated_at_candle_index}`);
}

// =======================================================================
// 7. Mitigasi KUMULATIF: sisi bawah kena candle X, sisi atas kena candle Y
//    beda. Dilacak by fvg_id spesifik (bukan asumsi "changed" list kosong)
//    karena candle di sekitarnya bisa aja incidentally bikin FVG lain dari
//    window 3-candle yang berbeda -- itu perilaku benar, bukan bug, jadi
//    assertion di sini harus tahan terhadap noise itu.
// =======================================================================
{
  const engine = new FVGEngine();
  engine.ingestCandle(c(10, 5, 0)); // A
  engine.ingestCandle(c(20, 8, 1)); // B
  engine.ingestCandle(c(25, 15, 2)); // C -> gap [10,15], fvg_id=0

  engine.ingestCandle(c(11, 9, 3)); // low=9<=10 (bottom kena), high=11<15 (top belum)
  let target = engine.getFVGs().find((f) => f.fvg_id === 0)!;
  check('Kena bottom doang -> fvg_id=0 masih ACTIVE', target.mitigation_status === 'ACTIVE', `status=${target.mitigation_status}`);

  engine.ingestCandle(c(12, 10, 4)); // masih belum nyentuh top
  target = engine.getFVGs().find((f) => f.fvg_id === 0)!;
  check('Masih belum nyentuh top -> fvg_id=0 masih ACTIVE', target.mitigation_status === 'ACTIVE', `status=${target.mitigation_status}`);

  engine.ingestCandle(c(16, 14, 5)); // high=16>=15 -> top akhirnya kena
  target = engine.getFVGs().find((f) => f.fvg_id === 0)!;
  check('Top akhirnya kena (candle beda dari yang kena bottom) -> fvg_id=0 MITIGATED', target.mitigation_status === 'MITIGATED', `status=${target.mitigation_status}`);
  check('mitigated_at_candle_index = candle yang melengkapi (5), bukan yang duluan (3)', target.mitigated_at_candle_index === 5, `idx=${target.mitigated_at_candle_index}`);
}

// =======================================================================
// 8. Mitigasi one-directional: sekali MITIGATED gak bisa balik ACTIVE
// =======================================================================
{
  const engine = new FVGEngine();
  engine.ingestCandle(c(10, 5, 0));
  engine.ingestCandle(c(20, 8, 1));
  engine.ingestCandle(c(25, 15, 2)); // fvg_id=0, gap [10,15]
  engine.ingestCandle(c(17, 8, 3)); // full fill langsung -> MITIGATED
  let target = engine.getFVGs().find((f) => f.fvg_id === 0)!;
  check('Status MITIGATED (setup)', target.mitigation_status === 'MITIGATED', 'setup check');
  const mitigatedAtSetup = target.mitigated_at_candle_index;

  engine.ingestCandle(c(100, 90, 4)); // candle jauh di luar gap, gak relevan
  target = engine.getFVGs().find((f) => f.fvg_id === 0)!;
  check('Tetap MITIGATED setelah candle lain lewat', target.mitigation_status === 'MITIGATED', `status=${target.mitigation_status}`);
  check('mitigated_at_candle_index gak berubah', target.mitigated_at_candle_index === mitigatedAtSetup, `idx=${target.mitigated_at_candle_index}, expected=${mitigatedAtSetup}`);
}

// =======================================================================
// 9. fvg_id sequential/monoton -- dites sebagai properti umum (0..N-1,
//    berurutan, gak ada duplikat) di atas hasil random walk yang sudah
//    dites di bagian 11&12, bukan hitungan pasti dari contoh manual kecil
//    (contoh manual kecil rawan meleset dari incidental window overlap
//    yang gak sengaja, seperti yang kejadian di percobaan pertama saya).
// =======================================================================
{
  const candles: Candle[] = [];
  for (let i = 0; i < 60; i++) {
    // pola zigzag lebar biar ada beberapa FVG kebentuk
    const base = 100 + (i % 6) * 5;
    candles.push(c(base + 3, base - 3, i));
  }
  const result = detectFVGs(candles);
  const ids = result.map((f) => f.fvg_id);
  const expectedIds = Array.from({ length: ids.length }, (_, i) => i);
  check(
    `fvg_id sequential 0..N-1 tanpa gap/duplikat (N=${ids.length})`,
    JSON.stringify(ids) === JSON.stringify(expectedIds),
    `ids=${JSON.stringify(ids)}`
  );
}

// =======================================================================
// 10. Batch === incremental (trivial di sini krn batch literally drive
//     incremental, tapi tetap dites biar eksplisit, bukan diasumsikan)
// =======================================================================
{
  const candles = [c(10, 5, 0), c(20, 12, 1), c(25, 15, 2), c(17, 8, 3)];
  const batchResult = detectFVGs(candles);
  const engine = new FVGEngine();
  for (const candle of candles) engine.ingestCandle(candle);
  check(
    'Batch === manual step-by-step',
    JSON.stringify(batchResult) === JSON.stringify(engine.getFVGs()),
    `batch=${JSON.stringify(batchResult)}, manual=${JSON.stringify(engine.getFVGs())}`
  );
}

// =======================================================================
// 11 & 12. Mutual exclusivity (proof + empiris) + differential vs reference
//          independen, di atas random walk deterministik
// =======================================================================
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

function generateSeries(length: number, seed: number, volatility: number): Candle[] {
  const rand = mulberry32(seed);
  const series: Candle[] = [];
  let base = 100;
  for (let i = 0; i < length; i++) {
    base += (rand() - 0.5) * volatility;
    const high = base + rand() * (volatility / 2);
    const low = base - rand() * (volatility / 2);
    const close = low + rand() * (high - low);
    series.push(c(Number(high.toFixed(4)), Number(low.toFixed(4)), i, Number(close.toFixed(4))));
  }
  return series;
}

/** Reference independen: dua pass terpisah (formasi lalu mitigasi), gak
 *  reuse struktur incremental single-pass punya engine utama. */
function referenceDetectFVGs(candles: readonly Candle[]): FVG[] {
  const raw: Array<{ type: 'bullish' | 'bearish'; gap_low: number; gap_high: number; formed_at_candle_index: number }> = [];

  for (let i = 0; i + 2 < candles.length; i++) {
    const a = candles[i];
    const cc = candles[i + 2];
    if (a.high < cc.low) {
      raw.push({ type: 'bullish', gap_low: a.high, gap_high: cc.low, formed_at_candle_index: i + 2 });
    } else if (a.low > cc.high) {
      raw.push({ type: 'bearish', gap_low: cc.high, gap_high: a.low, formed_at_candle_index: i + 2 });
    }
  }

  return raw.map((r, idx) => {
    let mitigatedAt: number | null = null;
    let bottomHit = false;
    let topHit = false;
    for (let j = r.formed_at_candle_index + 1; j < candles.length; j++) {
      if (candles[j].low <= r.gap_low) bottomHit = true;
      if (candles[j].high >= r.gap_high) topHit = true;
      if (bottomHit && topHit) {
        mitigatedAt = j;
        break;
      }
    }
    return {
      fvg_id: idx,
      type: r.type,
      gap_high: r.gap_high,
      gap_low: r.gap_low,
      formed_at_candle_index: r.formed_at_candle_index,
      mitigation_status: mitigatedAt !== null ? 'MITIGATED' : 'ACTIVE',
      mitigated_at_candle_index: mitigatedAt,
    };
  });
}

for (const [seed, length, volatility] of [
  [21, 300, 4],
  [22, 300, 1],
  [23, 800, 6],
] as const) {
  const candles = generateSeries(length, seed, volatility);
  const result = detectFVGs(candles);

  const violatesExclusivity = (() => {
    for (let i = 0; i + 2 < candles.length; i++) {
      const a = candles[i];
      const cc = candles[i + 2];
      if (a.high < cc.low && a.low > cc.high) return true;
    }
    return false;
  })();
  check(
    `Mutual exclusivity bullish/bearish (bukti matematis, dites empiris) — seed=${seed}`,
    !violatesExclusivity,
    'tidak ada window yang lolos dua kondisi sekaligus'
  );

  const reference = referenceDetectFVGs(candles);
  check(
    `Differential vs reference independen (2-pass) — seed=${seed} len=${length} vol=${volatility}`,
    JSON.stringify(result) === JSON.stringify(reference),
    `engine=${result.length} FVG, reference=${reference.length} FVG` +
      (JSON.stringify(result) !== JSON.stringify(reference)
        ? `\n       engine[0..2]=${JSON.stringify(result.slice(0, 3))}\n       ref[0..2]=${JSON.stringify(reference.slice(0, 3))}`
        : '')
  );
}

console.log(`\n${pass}/${pass + fail} passed.`);
if (fail > 0) {
  console.log(`${fail} FAILED.`);
  process.exit(1);
}
