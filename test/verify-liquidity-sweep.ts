import type { Candle, StructuralPoint, StructureBreakEvent, LiquiditySweepResult } from '../src/types';
import { LiquiditySweepEngine, type LiquiditySweepConfig } from '../src/liquiditySweepEngine';
import { SwingDetectionEngine } from '../src/swingDetectionEngine';
import { InternalStructureEngine } from '../src/internalStructureEngine';
import { SessionEngine } from '../src/sessionEngine';

let pass = 0;
let fail = 0;

function check(label: string, condition: boolean, detail: string) {
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition || process.env.VERBOSE) console.log(`       ${detail}`);
  condition ? pass++ : fail++;
}

function c(utcTimestamp: string, high: number, low: number, open?: number, close?: number): Candle {
  const mid = (high + low) / 2;
  return { timestamp: utcTimestamp, open: open ?? mid, close: close ?? mid, high, low };
}

function point(overrides: Partial<StructuralPoint>): StructuralPoint {
  return {
    structure_id: 0,
    type: 'high',
    price: 100,
    candle_index: 0,
    label: 'HH',
    classification: 'EXTERNAL',
    significance: 'UNSPECIFIED',
    broken_status: 'ACTIVE',
    broken_at_candle_index: null,
    ...overrides,
  };
}

function breakEvt(overrides: Partial<StructureBreakEvent>): StructureBreakEvent {
  return {
    structure_id: 0,
    type: 'high',
    classification: 'EXTERNAL',
    candle_index: 5,
    prior_trend: { status: 'BLOCKED', reason: 'test', literal_spec_value: 'ranging' },
    ...overrides,
  };
}

const cfg = (sweepTarget: LiquiditySweepConfig['sweepTarget'], sweepTargetSessionWindow?: string): LiquiditySweepConfig => ({
  sweepTarget,
  sweepTargetSessionWindow,
});

// =======================================================================
// 1. Structure target: wick nembus, TIDAK break candle ini -> VALID
// =======================================================================
{
  const engine = new LiquiditySweepEngine(cfg('external_structure'));
  const activePoint = point({ structure_id: 5, type: 'high', price: 100, classification: 'EXTERNAL', broken_status: 'ACTIVE' });
  const results = engine.ingestCandle(c('2026-01-15T15:00:00Z', 105, 95, 96, 98), 10, [activePoint], [], null); // wick high=105>100, close=98 (gak break)
  check('1 hasil VALID', results.length === 1 && results[0].status === 'VALID', `results=${JSON.stringify(results)}`);
  check('swept_structure_id = 5 (dibaca dari point, bukan dihitung ulang)', results[0].swept_structure_id === 5, `id=${results[0].swept_structure_id}`);
  check('swept_level_price = 100 (dibaca dari point.price)', results[0].swept_level_price === 100, `price=${results[0].swept_level_price}`);
  check('failure_reason null saat VALID', results[0].failure_reason === null, `reason=${results[0].failure_reason}`);
  check('swept_side = high (dibaca dari point.type)', results[0].swept_side === 'high', `side=${results[0].swept_side}`);
}

// =======================================================================
// 2. Structure target: wick nembus DAN break di candle yang sama -> INVALID/NO_CLOSE_BACK
//    (dibaca dari structureBreaksThisCandle, BUKAN dihitung ulang dari close)
// =======================================================================
{
  const engine = new LiquiditySweepEngine(cfg('external_structure'));
  const activePoint = point({ structure_id: 5, type: 'high', price: 100, classification: 'EXTERNAL', broken_status: 'BROKEN', broken_at_candle_index: 10 });
  const theBreakEvent = breakEvt({ structure_id: 5, type: 'high', classification: 'EXTERNAL', candle_index: 10 });
  const results = engine.ingestCandle(c('2026-01-15T15:00:00Z', 105, 95, 96, 103), 10, [activePoint], [theBreakEvent], null);
  check('1 hasil INVALID/NO_CLOSE_BACK', results.length === 1 && results[0].status === 'INVALID' && results[0].failure_reason === 'NO_CLOSE_BACK', `results=${JSON.stringify(results)}`);
}

// =======================================================================
// 3. Classification filtering: config internal_structure abaikan point EXTERNAL
// =======================================================================
{
  const engine = new LiquiditySweepEngine(cfg('internal_structure'));
  const externalPoint = point({ structure_id: 1, type: 'high', price: 100, classification: 'EXTERNAL' });
  const results = engine.ingestCandle(c('2026-01-15T15:00:00Z', 105, 95), 10, [externalPoint], [], null);
  check('config internal_structure, point EXTERNAL -> diabaikan', results.length === 0, `results=${JSON.stringify(results)}`);
}

// =======================================================================
// 4. Point yang BROKEN di candle SEBELUMNYA (bukan candle ini) -> gak dievaluasi lagi
// =======================================================================
{
  const engine = new LiquiditySweepEngine(cfg('external_structure'));
  const oldBrokenPoint = point({ structure_id: 1, type: 'high', price: 100, classification: 'EXTERNAL', broken_status: 'BROKEN', broken_at_candle_index: 3 });
  const results = engine.ingestCandle(c('2026-01-15T15:00:00Z', 105, 95), 10, [oldBrokenPoint], [], null);
  check('Point broken dari candle lama -> diabaikan, gak dievaluasi ulang', results.length === 0, `results=${JSON.stringify(results)}`);
}

// =======================================================================
// 5. Wick TIDAK nembus -> gak ada hasil (bukan NO_SWEEP eksplisit, sesuai desain reaktif)
// =======================================================================
{
  const engine = new LiquiditySweepEngine(cfg('external_structure'));
  const activePoint = point({ structure_id: 1, type: 'high', price: 100, classification: 'EXTERNAL' });
  const results = engine.ingestCandle(c('2026-01-15T15:00:00Z', 98, 90), 10, [activePoint], [], null);
  check('Wick gak nembus -> 0 hasil (silent)', results.length === 0, `results=${JSON.stringify(results)}`);
}

// =======================================================================
// 6. Multiple active point ke-sweep sekaligus di candle yang sama -> 2 hasil terpisah
// =======================================================================
{
  const engine = new LiquiditySweepEngine(cfg('external_structure'));
  const p1 = point({ structure_id: 1, type: 'high', price: 100, classification: 'EXTERNAL' });
  const p2 = point({ structure_id: 2, type: 'high', price: 102, classification: 'EXTERNAL' });
  const results = engine.ingestCandle(c('2026-01-15T15:00:00Z', 105, 95, 96, 98), 10, [p1, p2], [], null);
  check('2 hasil terpisah (2 point tersweep sekaligus)', results.length === 2, `results=${JSON.stringify(results)}`);
  check('Dua-duanya VALID', results.every((r) => r.status === 'VALID'), 'ok');
}

// =======================================================================
// 7 & 8. Session target: VALID di sisi high dan sisi low
// =======================================================================
{
  const engine = new LiquiditySweepEngine(cfg('session_high_low', 'w1'));
  const sessionLevel = { high: 100, low: 90 };

  const highSweep = engine.ingestCandle(c('2026-01-15T15:00:00Z', 105, 95, 96, 98), 10, [], [], sessionLevel);
  check('Sweep sisi high VALID', highSweep.length === 1 && highSweep[0].status === 'VALID' && highSweep[0].swept_level_price === 100, `results=${JSON.stringify(highSweep)}`);
  check('swept_structure_id null buat target session', highSweep[0].swept_structure_id === null, `id=${highSweep[0].swept_structure_id}`);
  check('swept_side = high', highSweep[0].swept_side === 'high', `side=${highSweep[0].swept_side}`);

  const lowSweep = engine.ingestCandle(c('2026-01-15T15:05:00Z', 95, 85, 93, 92), 11, [], [], sessionLevel);
  check('Sweep sisi low VALID', lowSweep.length === 1 && lowSweep[0].status === 'VALID' && lowSweep[0].swept_level_price === 90, `results=${JSON.stringify(lowSweep)}`);
  check('swept_side = low', lowSweep[0].swept_side === 'low', `side=${lowSweep[0].swept_side}`);
}

// =======================================================================
// 9. Session target: wick nembus, close TIDAK balik -> INVALID/NO_CLOSE_BACK
// =======================================================================
{
  const engine = new LiquiditySweepEngine(cfg('session_high_low', 'w1'));
  const sessionLevel = { high: 100, low: 90 };
  const results = engine.ingestCandle(c('2026-01-15T15:00:00Z', 105, 95, 96, 103), 10, [], [], sessionLevel);
  check('Close gak balik -> INVALID/NO_CLOSE_BACK', results.length === 1 && results[0].status === 'INVALID' && results[0].failure_reason === 'NO_CLOSE_BACK', `results=${JSON.stringify(results)}`);
}

// =======================================================================
// 10. Session target: sessionLevel null (belum ada occurrence COMPLETE) -> silent
// =======================================================================
{
  const engine = new LiquiditySweepEngine(cfg('session_high_low', 'w1'));
  const results = engine.ingestCandle(c('2026-01-15T15:00:00Z', 105, 95), 10, [], [], null);
  check('sessionLevel null -> 0 hasil (TARGET_SOURCE_UNAVAILABLE, silent per desain)', results.length === 0, `results=${JSON.stringify(results)}`);
}

// =======================================================================
// 11. Full pipeline: Engine A + B + D + Rule #3 asli, differential vs
//     reference independen buat logika Rule #3 doang
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
  const startMs = Date.parse('2026-01-15T00:00:00Z');
  for (let i = 0; i < length; i++) {
    const o = base;
    const cl = base + (rand() - 0.5) * volatility * 0.8;
    const high = Math.max(o, cl) + rand() * (volatility / 2);
    const low = Math.min(o, cl) - rand() * (volatility / 2);
    const ts = new Date(startMs + i * 30 * 60 * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
    series.push(c(ts, Number(high.toFixed(4)), Number(low.toFixed(4)), Number(o.toFixed(4)), Number(cl.toFixed(4))));
    base = cl;
  }
  return series;
}

function referenceEvaluateStructureTarget(
  candles: readonly Candle[],
  allPointsPerCandle: readonly (readonly StructuralPoint[])[],
  breaksPerCandle: readonly (readonly StructureBreakEvent[])[],
  targetClassification: 'EXTERNAL' | 'INTERNAL',
  targetType: 'external_structure' | 'internal_structure'
): LiquiditySweepResult[] {
  const results: LiquiditySweepResult[] = [];
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const points = allPointsPerCandle[i];
    const breaks = breaksPerCandle[i];
    const brokenIds = new Set(breaks.map((b) => b.structure_id));
    for (const p of points) {
      if (p.classification !== targetClassification) continue;
      const brokeNow = brokenIds.has(p.structure_id);
      if (p.broken_status === 'BROKEN' && !brokeNow) continue;
      const pierces = p.type === 'high' ? candle.high > p.price : candle.low < p.price;
      if (!pierces) continue;
      results.push({
        status: brokeNow ? 'INVALID' : 'VALID',
        failure_reason: brokeNow ? 'NO_CLOSE_BACK' : null,
        swept_target_type: targetType,
        swept_side: p.type,
        swept_structure_id: p.structure_id,
        swept_level_price: p.price,
        sweep_candle_index: i,
      });
    }
  }
  return results;
}

for (const [seed, length, volatility, target] of [
  [51, 400, 4, 'external_structure'],
  [52, 400, 4, 'internal_structure'],
  [53, 800, 6, 'external_structure'],
] as const) {
  const candles = generateSeries(length, seed, volatility);

  const swingEngine = new SwingDetectionEngine(2);
  const structEngine = new InternalStructureEngine();
  const sweepEngine = new LiquiditySweepEngine(cfg(target));

  const allPointsPerCandle: StructuralPoint[][] = [];
  const breaksPerCandle: StructureBreakEvent[][] = [];
  const engineResults: LiquiditySweepResult[] = [];

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const newSwings = swingEngine.ingest(candle);
    const breaks = structEngine.ingestCandle(candle);
    for (const swing of newSwings) structEngine.addSwingPoint(swing);
    const currentPoints = structEngine.getPoints();

    allPointsPerCandle.push(currentPoints.map((p) => ({ ...p })));
    breaksPerCandle.push([...breaks]);

    const results = sweepEngine.ingestCandle(candle, i, currentPoints, breaks, null);
    engineResults.push(...results);
  }

  const targetClassification = target === 'external_structure' ? 'EXTERNAL' : 'INTERNAL';
  const referenceResults = referenceEvaluateStructureTarget(candles, allPointsPerCandle, breaksPerCandle, targetClassification, target);

  check(
    `Differential vs reference independen (logika Rule #3) — seed=${seed} target=${target}`,
    JSON.stringify(engineResults) === JSON.stringify(referenceResults),
    `engine=${engineResults.length} hasil, reference=${referenceResults.length} hasil`
  );
}

// =======================================================================
// 12. Full pipeline session_high_low: Engine D beneran + Rule #3
// =======================================================================
{
  const testWindow = { id: 'test_window', start: '10:00', end: '11:00', timezone: 'America/New_York', active: true };
  const sessionEngine = new SessionEngine([testWindow]);
  const sweepEngine = new LiquiditySweepEngine(cfg('session_high_low', 'test_window'));

  sessionEngine.ingestCandle(c('2026-01-15T15:00:00Z', 100, 90));
  sessionEngine.ingestCandle(c('2026-01-15T16:05:00Z', 50, 50));

  const sweepCandle = c('2026-02-16T15:00:00Z', 105, 95, 96, 98);
  const sessionLevel = sessionEngine.getLastCompleteOccurrence('test_window');
  const results = sweepEngine.ingestCandle(sweepCandle, 100, [], [], sessionLevel);
  check(
    'Pipeline Engine D asli -> Rule #3: sweep session_high_low dari occurrence COMPLETE beneran',
    results.length === 1 && results[0].status === 'VALID' && results[0].swept_level_price === 100,
    `results=${JSON.stringify(results)}, sessionLevel=${JSON.stringify(sessionLevel)}`
  );
}

console.log(`\n${pass}/${pass + fail} passed.`);
if (fail > 0) {
  console.log(`${fail} FAILED.`);
  process.exit(1);
}
