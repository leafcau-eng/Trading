import type { Candle, SwingPoint } from '../src/types';
import { InternalStructureEngine, buildInternalStructure } from '../src/internalStructureEngine';
import { detectSwings, SwingDetectionEngine } from '../src/swingDetectionEngine';

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

function sp(
  type: 'high' | 'low',
  price: number,
  candle_index: number,
  confirmed_at_index: number
): SwingPoint {
  return {
    type,
    price,
    candle_index,
    confirmed_at_index,
    timestamp: `2026-01-01T00:00:00Z`,
    status: 'CONFIRMED',
  };
}

// =======================================================================
// 1. Hand-traced scenario — label + classification + trend, 6 titik manual
// =======================================================================
{
  const engine = new InternalStructureEngine();
  const cur = { i: 0 };
  const advanceTo = (targetIndex: number) => {
    while (cur.i <= targetIndex) {
      engine.ingestCandle(c(1000, -1000, cur.i, 0)); // netral, gak nembus level manapun
      cur.i++;
    }
  };

  advanceTo(3);
  const p1 = engine.addSwingPoint(sp('high', 100, 2, 3));
  check('Titik 1 (high pertama) -> UNLABELED', p1.label === 'UNLABELED', `label=${p1.label}`);
  check('Titik 1 -> EXTERNAL (CEH belum ada)', p1.classification === 'EXTERNAL', `classification=${p1.classification}`);

  advanceTo(6);
  const p2 = engine.addSwingPoint(sp('low', 90, 5, 6));
  check('Titik 2 (low pertama) -> UNLABELED', p2.label === 'UNLABELED', `label=${p2.label}`);
  check('Titik 2 -> EXTERNAL (CEL belum ada)', p2.classification === 'EXTERNAL', `classification=${p2.classification}`);
  check(
    'getTrendState().status selalu BLOCKED (v0.3.2 -- keputusan pemilik spec)',
    engine.getTrendState().status === 'BLOCKED',
    `status=${engine.getTrendState().status}`
  );
  check(
    'literal_spec_value setelah titik 1+2 (dua-duanya UNLABELED) -> ranging',
    engine.getTrendState().literal_spec_value === 'ranging',
    `literal_spec_value=${engine.getTrendState().literal_spec_value}`
  );

  advanceTo(9);
  const p3 = engine.addSwingPoint(sp('high', 110, 8, 9));
  check('Titik 3 (110 > 100) -> HH', p3.label === 'HH', `label=${p3.label}`);
  check('Titik 3 (110 > CEH=100) -> EXTERNAL', p3.classification === 'EXTERNAL', `classification=${p3.classification}`);

  advanceTo(12);
  const p4 = engine.addSwingPoint(sp('low', 95, 11, 12));
  check('Titik 4 (95 > 90, bukan lebih rendah) -> HL', p4.label === 'HL', `label=${p4.label}`);
  check('Titik 4 (95 >= CEL=90) -> INTERNAL', p4.classification === 'INTERNAL', `classification=${p4.classification}`);
  check(
    'literal_spec_value gak berubah krn titik 4 INTERNAL (masih ranging)',
    engine.getTrendState().literal_spec_value === 'ranging',
    `literal_spec_value=${engine.getTrendState().literal_spec_value}`
  );

  advanceTo(15);
  engine.addSwingPoint(sp('high', 115, 14, 15));
  advanceTo(18);
  const p6 = engine.addSwingPoint(sp('low', 80, 17, 18));
  check('Titik 6 (80 < 90) -> LL', p6.label === 'LL', `label=${p6.label}`);
  check('Titik 6 (80 < CEL=90) -> EXTERNAL', p6.classification === 'EXTERNAL', `classification=${p6.classification}`);
  check(
    'literal_spec_value: HH(high) + LL(low) -> kombinasi campuran -> ranging (sesuai contoh eksplisit di spec)',
    engine.getTrendState().literal_spec_value === 'ranging',
    `literal_spec_value=${engine.getTrendState().literal_spec_value}`
  );
}

// =======================================================================
// 2. Tie-case classification (harga == CEH persis) -> INTERNAL (literal spec: "≤")
// =======================================================================
{
  const engine = new InternalStructureEngine();
  const cur = { i: 0 };
  const advanceTo = (t: number) => {
    while (cur.i <= t) {
      engine.ingestCandle(c(1000, -1000, cur.i, 0));
      cur.i++;
    }
  };
  advanceTo(1);
  engine.addSwingPoint(sp('high', 100, 0, 1)); // CEH = 100
  advanceTo(3);
  const tie = engine.addSwingPoint(sp('high', 100, 2, 3)); // persis 100 lagi
  check(
    'Swing high tie persis dengan CEH -> INTERNAL (bukan EXTERNAL)',
    tie.classification === 'INTERNAL',
    `classification=${tie.classification}, price=${tie.price}, CEH lama=100`
  );
}

// =======================================================================
// 3. Break: body close doang, wick gak cukup. Break gak kejadian di candle
//    konfirmasi sendiri. Break one-directional (gak bisa balik ACTIVE).
// =======================================================================
{
  const engine = new InternalStructureEngine();
  for (let i = 0; i < 4; i++) engine.ingestCandle(c(50, -50, i, 0));
  const point = engine.addSwingPoint(sp('high', 100, 1, 4));

  const wickOnly = engine.ingestCandle(c(150, 90, 5, 95));
  check('Wick nembus level tapi close di bawah -> BELUM break', wickOnly.length === 0, `breaks=${JSON.stringify(wickOnly)}`);
  check('Point masih ACTIVE setelah wick-only', point.broken_status === 'ACTIVE', `status=${point.broken_status}`);

  const realBreak = engine.ingestCandle(c(120, 105, 6, 110));
  check('Body close nembus level -> break terjadi', realBreak.length === 1, `breaks=${JSON.stringify(realBreak)}`);
  check('Point jadi BROKEN', point.broken_status === 'BROKEN', `status=${point.broken_status}`);
  check('broken_at_candle_index = 5', point.broken_at_candle_index === 5, `broken_at=${point.broken_at_candle_index}`);

  const afterReversal = engine.ingestCandle(c(99, 80, 7, 85));
  check(
    'Setelah broken, harga balik ke bawah level -> TETAP BROKEN (one-directional)',
    point.broken_status === 'BROKEN',
    `status=${point.broken_status}`
  );
  check('Gak ada break event baru buat point yang sama', afterReversal.length === 0, `breaks=${JSON.stringify(afterReversal)}`);
}

// =======================================================================
// 4. structure_break event: classification & prior_trend ke-carry bener
// =======================================================================
{
  const engine = new InternalStructureEngine();
  for (let i = 0; i < 2; i++) engine.ingestCandle(c(50, -50, i, 0));
  const point = engine.addSwingPoint(sp('high', 100, 0, 2));
  const trendStateAtBreakTime = engine.getTrendState();
  const breaks = engine.ingestCandle(c(120, 105, 3, 110));
  check('Break event ke-emit persis 1', breaks.length === 1, `${JSON.stringify(breaks)}`);
  check('Break event bawa classification yang benar', breaks[0].classification === point.classification, `event.classification=${breaks[0].classification}`);
  check(
    'Break event bawa prior_trend berstatus BLOCKED juga (wrapper yang sama)',
    breaks[0].prior_trend.status === 'BLOCKED',
    `event.prior_trend.status=${breaks[0].prior_trend.status}`
  );
  check(
    'prior_trend.literal_spec_value konsisten sama snapshot sesaat sebelum break',
    breaks[0].prior_trend.literal_spec_value === trendStateAtBreakTime.literal_spec_value,
    `event=${breaks[0].prior_trend.literal_spec_value}, expected=${trendStateAtBreakTime.literal_spec_value}`
  );
}

// =======================================================================
// 5. structure_id sequential/monoton
// =======================================================================
{
  const engine = new InternalStructureEngine();
  for (let i = 0; i < 10; i++) engine.ingestCandle(c(1000, -1000, i, 0));
  engine.addSwingPoint(sp('high', 100, 0, 1));
  engine.addSwingPoint(sp('low', 90, 2, 3));
  engine.addSwingPoint(sp('high', 105, 4, 5));
  const ids = engine.getPoints().map((p) => p.structure_id);
  check('structure_id sequential 0,1,2,...', JSON.stringify(ids) === JSON.stringify([0, 1, 2]), `ids=${JSON.stringify(ids)}`);
}

// =======================================================================
// 6 & 7. INVARIANT (bukti matematis) + FULL PIPELINE consistency, di atas
//         random walk panjang lewat Engine A asli -> Engine B asli
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

function generateSeries(length: number, seed: number): Candle[] {
  const rand = mulberry32(seed);
  const series: Candle[] = [];
  let base = 100;
  for (let i = 0; i < length; i++) {
    base += (rand() - 0.5) * 4;
    const high = base + rand() * 2;
    const low = base - rand() * 2;
    const close = low + rand() * (high - low);
    series.push(c(Number(high.toFixed(4)), Number(low.toFixed(4)), i, Number(close.toFixed(4))));
  }
  return series;
}

for (const [seed, length, n] of [
  [11, 300, 2],
  [12, 300, 3],
  [13, 800, 2],
] as const) {
  const candles = generateSeries(length, seed);
  const { points: swingPoints } = detectSwings(candles, n);

  const { points: structuralPoints } = buildInternalStructure(candles, swingPoints);
  const violatesInvariant = structuralPoints.some(
    (p) =>
      (p.type === 'high' && p.classification === 'EXTERNAL' && p.label === 'LH') ||
      (p.type === 'low' && p.classification === 'EXTERNAL' && p.label === 'HL')
  );
  check(
    `Invariant: EXTERNAL high never LH / EXTERNAL low never HL — seed=${seed} len=${length} N=${n}`,
    !violatesInvariant,
    `${structuralPoints.length} structural points checked`
  );

  let sawNonRanging = false;
  {
    const engine2 = new InternalStructureEngine();
    const swingsByIdx = new Map<number, SwingPoint[]>();
    for (const p of swingPoints) {
      const arr = swingsByIdx.get(p.confirmed_at_index) ?? [];
      arr.push(p);
      swingsByIdx.set(p.confirmed_at_index, arr);
    }
    for (let i = 0; i < candles.length; i++) {
      engine2.ingestCandle(candles[i]);
      for (const p of swingsByIdx.get(i) ?? []) engine2.addSwingPoint(p);
      if (engine2.getTrendState().literal_spec_value !== 'ranging') sawNonRanging = true;
    }
  }
  check(
    `Trend per spec literal NEVER leaves 'ranging' (confirms the proof) — seed=${seed} len=${length} N=${n}`,
    !sawNonRanging,
    sawNonRanging ? 'trend LEFT ranging -- proof would be WRONG' : 'trend stayed ranging for the entire run, as proven'
  );

  const manualEngine = new InternalStructureEngine();
  const swingsByIdx2 = new Map<number, SwingPoint[]>();
  for (const p of swingPoints) {
    const arr = swingsByIdx2.get(p.confirmed_at_index) ?? [];
    arr.push(p);
    swingsByIdx2.set(p.confirmed_at_index, arr);
  }
  for (let i = 0; i < candles.length; i++) {
    manualEngine.ingestCandle(candles[i]);
    for (const p of swingsByIdx2.get(i) ?? []) manualEngine.addSwingPoint(p);
  }
  const manualPoints = JSON.stringify(manualEngine.getPoints());
  const batchPoints = JSON.stringify(structuralPoints);
  check(
    `Batch (buildInternalStructure) === manual step-by-step drive — seed=${seed}`,
    manualPoints === batchPoints,
    `batch ${structuralPoints.length} pts vs manual ${manualEngine.getPoints().length} pts`
  );

  const swingEngine = new SwingDetectionEngine(n);
  const structEngine = new InternalStructureEngine();
  for (const candle of candles) {
    const newSwings = swingEngine.ingest(candle);
    structEngine.ingestCandle(candle);
    for (const swing of newSwings) structEngine.addSwingPoint(swing);
  }
  const fullyIncrementalPoints = JSON.stringify(structEngine.getPoints());
  check(
    `Full pipeline fully-incremental (A.ingest -> B.ingest per candle) === full batch — seed=${seed}`,
    fullyIncrementalPoints === batchPoints,
    `incremental ${structEngine.getPoints().length} pts vs batch ${structuralPoints.length} pts`
  );
}

console.log(`\n${pass}/${pass + fail} passed.`);
if (fail > 0) {
  console.log(`${fail} FAILED.`);
  process.exit(1);
}
