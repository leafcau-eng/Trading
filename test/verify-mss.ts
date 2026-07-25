import type { LiquiditySweepResult, StructureBreakEvent, Candle, StructuralPoint, MSSResult } from '../src/types';
import { MSSEngine } from '../src/mssEngine';
import { SwingDetectionEngine } from '../src/swingDetectionEngine';
import { InternalStructureEngine } from '../src/internalStructureEngine';
import { LiquiditySweepEngine } from '../src/liquiditySweepEngine';

let pass = 0;
let fail = 0;

function check(label: string, condition: boolean, detail: string) {
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition || process.env.VERBOSE) console.log(`       ${detail}`);
  condition ? pass++ : fail++;
}

function sweep(overrides: Partial<LiquiditySweepResult>): LiquiditySweepResult {
  return {
    status: 'VALID',
    swept_target_type: 'external_structure',
    swept_side: 'low',
    swept_structure_id: 1,
    swept_level_price: 100,
    sweep_candle_index: 10,
    failure_reason: null,
    ...overrides,
  };
}

function brk(overrides: Partial<StructureBreakEvent>): StructureBreakEvent {
  return {
    structure_id: 99,
    type: 'high',
    classification: 'INTERNAL',
    candle_index: 15,
    prior_trend: { status: 'BLOCKED', reason: 'test', literal_spec_value: 'ranging' },
    ...overrides,
  };
}

// =======================================================================
// 1. Sweep sisi low VALID -> MSS bullish begitu internal HIGH break muncul
// =======================================================================
{
  const engine = new MSSEngine();
  engine.ingestCandle([sweep({ swept_side: 'low', sweep_candle_index: 10 })], []);
  const results = engine.ingestCandle([], [brk({ type: 'high', classification: 'INTERNAL', structure_id: 55, candle_index: 11 })]);
  check('MSS VALID bullish', results.length === 1 && results[0].status === 'VALID' && results[0].mss_direction === 'bullish', `results=${JSON.stringify(results)}`);
  check('broken_structure_id dibaca dari break event (55)', results[0].broken_structure_id === 55, `id=${results[0].broken_structure_id}`);
  check('mss_candle_index = candle_index break (11)', results[0].mss_candle_index === 11, `idx=${results[0].mss_candle_index}`);
}

// =======================================================================
// 2. Sweep sisi high VALID -> MSS bearish begitu internal LOW break muncul
// =======================================================================
{
  const engine = new MSSEngine();
  engine.ingestCandle([sweep({ swept_side: 'high', sweep_candle_index: 10 })], []);
  const results = engine.ingestCandle([], [brk({ type: 'low', classification: 'INTERNAL', structure_id: 56, candle_index: 11 })]);
  check('MSS VALID bearish', results.length === 1 && results[0].status === 'VALID' && results[0].mss_direction === 'bearish', `results=${JSON.stringify(results)}`);
}

// =======================================================================
// 3. Break EXTERNAL (bukan INTERNAL) -> TIDAK confirm MSS walau type cocok
// =======================================================================
{
  const engine = new MSSEngine();
  engine.ingestCandle([sweep({ swept_side: 'low' })], []);
  const results = engine.ingestCandle([], [brk({ type: 'high', classification: 'EXTERNAL' })]);
  check('Break EXTERNAL tidak confirm MSS', results.length === 0, `results=${JSON.stringify(results)}`);
}

// =======================================================================
// 4. Break type salah (LOW, padahal butuh HIGH buat bullish) -> tidak confirm
// =======================================================================
{
  const engine = new MSSEngine();
  engine.ingestCandle([sweep({ swept_side: 'low' })], []);
  const results = engine.ingestCandle([], [brk({ type: 'low', classification: 'INTERNAL' })]);
  check('Break type salah tidak confirm MSS', results.length === 0, `results=${JSON.stringify(results)}`);
}

// =======================================================================
// 5. Break di CANDLE YANG SAMA dengan sweep -> tidak confirm (harus "setelah")
// =======================================================================
{
  const engine = new MSSEngine();
  const results = engine.ingestCandle(
    [sweep({ swept_side: 'low', sweep_candle_index: 10 })],
    [brk({ type: 'high', classification: 'INTERNAL', candle_index: 10 })]
  );
  check('Break di candle sama dengan sweep -> TIDAK confirm (belum "setelah")', results.length === 0, `results=${JSON.stringify(results)}`);
  check('Sweep tetap pending buat candle berikutnya', engine.getPendingCount() === 1, `pending=${engine.getPendingCount()}`);
}

// =======================================================================
// 6. Beberapa candle lewat tanpa break qualifying -> tetap pending, silent
// =======================================================================
{
  const engine = new MSSEngine();
  engine.ingestCandle([sweep({ swept_side: 'low' })], []);
  for (let i = 0; i < 5; i++) {
    const r = engine.ingestCandle([], []);
    check(`Candle ke-${i}: masih silent (belum ada break)`, r.length === 0, `r=${JSON.stringify(r)}`);
  }
  check('Masih pending setelah 5 candle', engine.getPendingCount() === 1, `pending=${engine.getPendingCount()}`);
}

// =======================================================================
// 7. One-shot: begitu confirmed, sweep yang sama gak confirm lagi
// =======================================================================
{
  const engine = new MSSEngine();
  engine.ingestCandle([sweep({ swept_side: 'low' })], []);
  const first = engine.ingestCandle([], [brk({ type: 'high', classification: 'INTERNAL', structure_id: 1, candle_index: 11 })]);
  check('Confirm pertama VALID', first.length === 1, `first=${JSON.stringify(first)}`);
  check('Pending abis setelah confirm', engine.getPendingCount() === 0, `pending=${engine.getPendingCount()}`);

  const second = engine.ingestCandle([], [brk({ type: 'high', classification: 'INTERNAL', structure_id: 2, candle_index: 12 })]);
  check('Break internal HIGH berikutnya TIDAK confirm apa-apa (gak ada pending lagi)', second.length === 0, `second=${JSON.stringify(second)}`);
}

// =======================================================================
// 8. Sweep INVALID tidak pernah masuk pending
// =======================================================================
{
  const engine = new MSSEngine();
  engine.ingestCandle([sweep({ status: 'INVALID', failure_reason: 'NO_CLOSE_BACK' })], []);
  check('Sweep INVALID tidak masuk pending', engine.getPendingCount() === 0, `pending=${engine.getPendingCount()}`);
  const results = engine.ingestCandle([], [brk({ type: 'high', classification: 'INTERNAL' })]);
  check('Gak ada MSS confirm dari sweep yang INVALID', results.length === 0, `results=${JSON.stringify(results)}`);
}

// =======================================================================
// 9. Dua sweep pending arah sama, satu break qualifying -> confirm DUA-DUANYA
// =======================================================================
{
  const engine = new MSSEngine();
  engine.ingestCandle([sweep({ swept_side: 'low', sweep_candle_index: 10 })], []);
  engine.ingestCandle([sweep({ swept_side: 'low', sweep_candle_index: 11 })], []);
  check('2 sweep pending', engine.getPendingCount() === 2, `pending=${engine.getPendingCount()}`);
  const results = engine.ingestCandle([], [brk({ type: 'high', classification: 'INTERNAL', structure_id: 77, candle_index: 12 })]);
  check('Satu break qualifying confirm KEDUA pending sekaligus', results.length === 2, `results=${JSON.stringify(results)}`);
  check('Pending kosong setelahnya', engine.getPendingCount() === 0, `pending=${engine.getPendingCount()}`);
}

// =======================================================================
// 10. Full pipeline: Engine A+B+Rule#3+MSS asli, differential vs reference
//     independen (forward-scan sederhana)
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
    const o = base;
    const cl = base + (rand() - 0.5) * volatility * 0.8;
    const high = Math.max(o, cl) + rand() * (volatility / 2);
    const low = Math.min(o, cl) - rand() * (volatility / 2);
    series.push({
      timestamp: `2026-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
      open: Number(o.toFixed(4)),
      close: Number(cl.toFixed(4)),
      high: Number(high.toFixed(4)),
      low: Number(low.toFixed(4)),
    });
    base = cl;
  }
  return series;
}

function referenceMSS(validSweeps: readonly LiquiditySweepResult[], breaksPerCandle: readonly (readonly StructureBreakEvent[])[]): MSSResult[] {
  const results: MSSResult[] = [];
  for (const s of validSweeps) {
    const direction: 'bullish' | 'bearish' = s.swept_side === 'low' ? 'bullish' : 'bearish';
    const requiredType = direction === 'bullish' ? 'high' : 'low';
    for (let i = s.sweep_candle_index + 1; i < breaksPerCandle.length; i++) {
      const found = breaksPerCandle[i].find((b) => b.classification === 'INTERNAL' && b.type === requiredType);
      if (found) {
        results.push({ status: 'VALID', mss_direction: direction, broken_structure_id: found.structure_id, mss_candle_index: found.candle_index, failure_reason: null });
        break;
      }
    }
  }
  return results;
}

for (const [seed, length, volatility, target] of [
  [61, 500, 4, 'external_structure'],
  [62, 500, 4, 'internal_structure'],
  [63, 900, 6, 'internal_structure'],
] as const) {
  const candles = generateSeries(length, seed, volatility);

  const swingEngine = new SwingDetectionEngine(2);
  const structEngine = new InternalStructureEngine();
  const sweepEngine = new LiquiditySweepEngine({ sweepTarget: target });
  const mssEngine = new MSSEngine();

  const allValidSweeps: LiquiditySweepResult[] = [];
  const breaksPerCandle: StructureBreakEvent[][] = [];
  const engineMSSResults: MSSResult[] = [];

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const newSwings = swingEngine.ingest(candle);
    const breaks = structEngine.ingestCandle(candle);
    for (const sw of newSwings) structEngine.addSwingPoint(sw);
    const currentPoints = structEngine.getPoints();

    breaksPerCandle.push([...breaks]);

    const sweepResults = sweepEngine.ingestCandle(candle, i, currentPoints, breaks, null);
    const newValidSweeps = sweepResults.filter((r) => r.status === 'VALID');
    allValidSweeps.push(...newValidSweeps);

    const mssResults = mssEngine.ingestCandle(newValidSweeps, breaks);
    engineMSSResults.push(...mssResults);
  }

  const referenceResults = referenceMSS(allValidSweeps, breaksPerCandle);

  const sortKey = (r: MSSResult) => `${r.mss_candle_index}|${r.broken_structure_id}|${r.mss_direction}`;
  const sortedEngine = [...engineMSSResults].sort((a, b) => (sortKey(a) > sortKey(b) ? 1 : -1));
  const sortedReference = [...referenceResults].sort((a, b) => (sortKey(a) > sortKey(b) ? 1 : -1));

  check(
    `Differential vs reference independen (logika MSS, dibandingkan sebagai SET) — seed=${seed} target=${target}`,
    JSON.stringify(sortedEngine) === JSON.stringify(sortedReference),
    `engine=${engineMSSResults.length} hasil (${allValidSweeps.length} sweep VALID total), reference=${referenceResults.length} hasil`
  );
}

console.log(`\n${pass}/${pass + fail} passed.`);
if (fail > 0) {
  console.log(`${fail} FAILED.`);
  process.exit(1);
}
