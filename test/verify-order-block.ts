import type { Candle, StructureBreakEvent, OrderBlock, OrderBlockSkip } from '../src/types';
import { OrderBlockEngine, detectOrderBlocks, type OrderBlockConfig } from '../src/orderBlockEngine';
import { SwingDetectionEngine } from '../src/swingDetectionEngine';
import { InternalStructureEngine } from '../src/internalStructureEngine';

let pass = 0;
let fail = 0;

function check(label: string, condition: boolean, detail: string) {
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition || process.env.VERBOSE) console.log(`       ${detail}`);
  condition ? pass++ : fail++;
}

function c(high: number, low: number, i: number, open: number, close: number): Candle {
  return {
    timestamp: `2026-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
    open,
    close,
    high,
    low,
  };
}

function bull(i: number): Candle {
  return c(12, 8, i, 9, 11); // close > open
}
function bear(i: number): Candle {
  return c(12, 8, i, 11, 9); // close < open
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

const cfg = (structureScope: OrderBlockConfig['structureScope'], obArea: OrderBlockConfig['obArea']): OrderBlockConfig => ({
  structureScope,
  obArea,
});

// =======================================================================
// 1. Bullish break (type=high) -> scan mundur nemu candle BEARISH -> OB
//    type=bullish (arah break, BUKAN warna candle OB)
// =======================================================================
{
  const engine = new OrderBlockEngine(cfg('both', 'full_candle'));
  const candles = [bear(0), bull(1), bull(2), bull(3)]; // index 0 bearish, 1-3 bullish (leg impulsif)
  for (const cnd of candles) engine.ingestCandle(cnd, []);
  const results = engine.ingestCandle(bull(4), [breakEvt({ type: 'high', candle_index: 4 })]);
  const ob = results[0] as OrderBlock;
  check('OB kebentuk (bukan skip)', 'ob_id' in ob, `result=${JSON.stringify(results)}`);
  check('formed_at_candle_index = 0 (candle bearish sebelum leg)', ob.formed_at_candle_index === 0, `formed_at=${ob.formed_at_candle_index}`);
  check(
    'type = bullish (arah break naik), MESKI candle OB-nya sendiri BEARISH',
    ob.type === 'bullish',
    `type=${ob.type} (candle OB index 0 warnanya bearish)`
  );
}

// =======================================================================
// 2. Bearish break (type=low) -> scan mundur nemu candle BULLISH -> OB
//    type=bearish
// =======================================================================
{
  const engine = new OrderBlockEngine(cfg('both', 'full_candle'));
  const candles = [bull(0), bear(1), bear(2)];
  for (const cnd of candles) engine.ingestCandle(cnd, []);
  const results = engine.ingestCandle(bear(3), [breakEvt({ type: 'low', candle_index: 3 })]);
  const ob = results[0] as OrderBlock;
  check('OB kebentuk', 'ob_id' in ob, `result=${JSON.stringify(results)}`);
  check('formed_at_candle_index = 0', ob.formed_at_candle_index === 0, `formed_at=${ob.formed_at_candle_index}`);
  check('type = bearish (arah break turun)', ob.type === 'bearish', `type=${ob.type}`);
}

// =======================================================================
// 3. Zona: full_candle vs body_only
// =======================================================================
{
  // OB candle: high=20, low=5, BEARISH (open=17, close=8 -> close<open) supaya
  // jadi lawan arah dari break naik. Body [8,17], full [5,20].
  const obCandle = c(20, 5, 0, 17, 8);
  const leg = [c(25, 15, 1, 16, 24), c(30, 20, 2, 21, 29)]; // bullish continuation

  const engineFull = new OrderBlockEngine(cfg('both', 'full_candle'));
  engineFull.ingestCandle(obCandle, []);
  for (const cnd of leg) engineFull.ingestCandle(cnd, []);
  const resFull = engineFull.ingestCandle(c(35, 25, 3, 26, 34), [breakEvt({ type: 'high', candle_index: 3 })]);
  const obFull = resFull[0] as OrderBlock;
  check('full_candle: zone = [low, high] candle OB', obFull.zone_low === 5 && obFull.zone_high === 20, `zone=[${obFull.zone_low},${obFull.zone_high}]`);

  const engineBody = new OrderBlockEngine(cfg('both', 'body_only'));
  engineBody.ingestCandle(obCandle, []);
  for (const cnd of leg) engineBody.ingestCandle(cnd, []);
  const resBody = engineBody.ingestCandle(c(35, 25, 3, 26, 34), [breakEvt({ type: 'high', candle_index: 3 })]);
  const obBody = resBody[0] as OrderBlock;
  check('body_only: zone = [min(open,close), max(open,close)]', obBody.zone_low === 8 && obBody.zone_high === 17, `zone=[${obBody.zone_low},${obBody.zone_high}]`);
}

// =======================================================================
// 4. Scan mundur ngelewatin BANYAK candle kontinuasi sebelum nemu OB
// =======================================================================
{
  const engine = new OrderBlockEngine(cfg('both', 'full_candle'));
  const candles = [bear(0), bull(1), bull(2), bull(3), bull(4), bull(5)]; // 4 candle bullish beruntun
  for (const cnd of candles) engine.ingestCandle(cnd, []);
  const results = engine.ingestCandle(bull(6), [breakEvt({ type: 'high', candle_index: 6 })]);
  const ob = results[0] as OrderBlock;
  check('Scan ngelewatin 5 candle kontinuasi, nemu OB di index 0', ob.formed_at_candle_index === 0, `formed_at=${ob.formed_at_candle_index}`);
}

// =======================================================================
// 5. Doji (close===open) -> BUKAN "searah" arah manapun -> scan berhenti
//    di doji itu [Menebak, interpretasi yang ditandai eksplisit di kode]
// =======================================================================
{
  const doji = c(12, 8, 0, 10, 10); // open===close
  const engine = new OrderBlockEngine(cfg('both', 'full_candle'));
  engine.ingestCandle(doji, []);
  engine.ingestCandle(bull(1), []);
  const results = engine.ingestCandle(bull(2), [breakEvt({ type: 'high', candle_index: 2 })]);
  const ob = results[0] as OrderBlock;
  check('Doji dianggap bukan searah break -> jadi OB (scan berhenti di situ)', ob.formed_at_candle_index === 0, `formed_at=${ob.formed_at_candle_index}`);
}

// =======================================================================
// 6. NO_OPPOSITE_CANDLE: scan habis history tanpa nemu candle berlawanan
// =======================================================================
{
  const engine = new OrderBlockEngine(cfg('both', 'full_candle'));
  const candles = [bull(0), bull(1), bull(2)]; // semua bullish, gak ada yang bearish
  for (const cnd of candles) engine.ingestCandle(cnd, []);
  const results = engine.ingestCandle(bull(3), [breakEvt({ type: 'high', candle_index: 3 })]);
  const skip = results[0] as OrderBlockSkip;
  check('NO_OPPOSITE_CANDLE terdeteksi', skip.status === 'SKIPPED' && skip.reason === 'NO_OPPOSITE_CANDLE', `result=${JSON.stringify(results)}`);
}

// =======================================================================
// 7. structure_scope filtering
// =======================================================================
{
  const setup = () => {
    const engine = new OrderBlockEngine(cfg('internal', 'full_candle'));
    engine.ingestCandle(bear(0), []);
    engine.ingestCandle(bull(1), []);
    return engine;
  };

  const engineInternalScope = setup();
  const externalIgnored = engineInternalScope.ingestCandle(bull(2), [breakEvt({ type: 'high', candle_index: 2, classification: 'EXTERNAL' })]);
  check('scope=internal, break EXTERNAL -> diabaikan (0 hasil)', externalIgnored.length === 0, `result=${JSON.stringify(externalIgnored)}`);

  const engineInternalScope2 = setup();
  const internalProcessed = engineInternalScope2.ingestCandle(bull(2), [breakEvt({ type: 'high', candle_index: 2, classification: 'INTERNAL' })]);
  check('scope=internal, break INTERNAL -> diproses', internalProcessed.length === 1, `result=${JSON.stringify(internalProcessed)}`);
}

// =======================================================================
// 8. structure_scope_used mencerminkan classification break yang sebenarnya
// =======================================================================
{
  const engine = new OrderBlockEngine(cfg('both', 'full_candle'));
  engine.ingestCandle(bear(0), []);
  const results = engine.ingestCandle(bull(1), [breakEvt({ type: 'high', candle_index: 1, classification: 'INTERNAL' })]);
  const ob = results[0] as OrderBlock;
  check('structure_scope_used = internal (sesuai classification break)', ob.structure_scope_used === 'internal', `used=${ob.structure_scope_used}`);
}

// =======================================================================
// 9. ob_id sequential
// =======================================================================
{
  const engine = new OrderBlockEngine(cfg('both', 'full_candle'));
  engine.ingestCandle(bear(0), []);
  engine.ingestCandle(bull(1), []);
  engine.ingestCandle(bear(2), []);
  const results = engine.ingestCandle(bull(3), [
    breakEvt({ type: 'high', candle_index: 1 }),
    breakEvt({ type: 'high', candle_index: 3 }),
  ]);
  const ids = (results as OrderBlock[]).map((o) => o.ob_id).sort();
  check('ob_id sequential 0,1', JSON.stringify(ids) === JSON.stringify([0, 1]), `ids=${JSON.stringify(ids)}, results=${JSON.stringify(results)}`);
}

// =======================================================================
// 10. lifecycle_status SELALU UNSPECIFIED, mitigated_at_candle_index
//     SELALU null -- verifikasi eksplisit gak ada lifecycle yang
//     kesenggol/diasumsikan
// =======================================================================
{
  const engine = new OrderBlockEngine(cfg('both', 'full_candle'));
  engine.ingestCandle(bear(0), []);
  const results = engine.ingestCandle(bull(1), [breakEvt({ type: 'high', candle_index: 1 })]);
  const ob = results[0] as OrderBlock;
  // kasih banyak candle setelahnya yang SECARA GEOMETRI bisa aja
  // "mitigate" zona OB kalau ada logika lifecycle -- harus tetap gak ngaruh.
  for (let i = 2; i < 20; i++) {
    engine.ingestCandle(c(1000, -1000, i, 0, 0), []);
  }
  const finalState = engine.getOrderBlocks().find((o) => o.ob_id === ob.ob_id)!;
  check('lifecycle_status tetap UNSPECIFIED walau candle ekstrem lewat', finalState.lifecycle_status === 'UNSPECIFIED', `status=${finalState.lifecycle_status}`);
  check('mitigated_at_candle_index tetap null', finalState.mitigated_at_candle_index === null, `idx=${finalState.mitigated_at_candle_index}`);
}

// =======================================================================
// 11. Full pipeline (Engine A+B+G asli) di random walk, differential vs
//     reference independen buat logika Engine G doang (Engine A/B sudah
//     diverifikasi terpisah di fase sebelumnya, gak diulang di sini)
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
    series.push(c(Number(high.toFixed(4)), Number(low.toFixed(4)), i, Number(o.toFixed(4)), Number(cl.toFixed(4))));
    base = cl;
  }
  return series;
}

function referenceIdentifyOrderBlocks(
  candles: readonly Candle[],
  breaks: readonly StructureBreakEvent[],
  config: OrderBlockConfig
): (OrderBlock | OrderBlockSkip)[] {
  const results: (OrderBlock | OrderBlockSkip)[] = [];
  let obId = 0;
  for (const breakEvent of breaks) {
    if (config.structureScope === 'internal' && breakEvent.classification !== 'INTERNAL') continue;
    if (config.structureScope === 'external' && breakEvent.classification !== 'EXTERNAL') continue;

    const direction = breakEvent.type === 'high' ? 'up' : 'down';
    let obIndex = -1;
    for (let i = breakEvent.candle_index - 1; i >= 0; i--) {
      const cnd = candles[i];
      const sameDir = direction === 'up' ? cnd.close > cnd.open : cnd.close < cnd.open;
      if (!sameDir) {
        obIndex = i;
        break;
      }
    }
    if (obIndex === -1) {
      results.push({ status: 'SKIPPED', reason: 'NO_OPPOSITE_CANDLE', source_structure_break_candle_index: breakEvent.candle_index });
      continue;
    }
    const obCandle = candles[obIndex];
    const zoneLow = config.obArea === 'full_candle' ? obCandle.low : Math.min(obCandle.open, obCandle.close);
    const zoneHigh = config.obArea === 'full_candle' ? obCandle.high : Math.max(obCandle.open, obCandle.close);
    results.push({
      ob_id: obId++,
      source_structure_break_candle_index: breakEvent.candle_index,
      type: direction === 'up' ? 'bullish' : 'bearish',
      zone_high: zoneHigh,
      zone_low: zoneLow,
      formed_at_candle_index: obIndex,
      structure_scope_used: breakEvent.classification === 'INTERNAL' ? 'internal' : 'external',
      lifecycle_status: 'UNSPECIFIED',
      mitigated_at_candle_index: null,
    });
  }
  return results;
}

for (const [seed, length, volatility, scope, area] of [
  [41, 400, 4, 'both', 'full_candle'],
  [42, 400, 4, 'internal', 'body_only'],
  [43, 800, 6, 'external', 'full_candle'],
] as const) {
  const candles = generateSeries(length, seed, volatility);
  const config = cfg(scope, area);

  const swingEngine = new SwingDetectionEngine(2);
  const structEngine = new InternalStructureEngine();
  const allBreaks: StructureBreakEvent[] = [];
  for (const candle of candles) {
    const newSwings = swingEngine.ingest(candle);
    const breaks = structEngine.ingestCandle(candle);
    allBreaks.push(...breaks);
    for (const swing of newSwings) structEngine.addSwingPoint(swing);
  }

  const engineResult = detectOrderBlocks(candles, 2, config);
  const referenceResult = referenceIdentifyOrderBlocks(candles, allBreaks, config);

  check(
    `Differential vs reference independen (logika Engine G) — seed=${seed} scope=${scope} area=${area}`,
    JSON.stringify(engineResult) === JSON.stringify(referenceResult),
    `engine=${engineResult.length} hasil, reference=${referenceResult.length} hasil`
  );

  const allUnspecified = (engineResult as OrderBlock[])
    .filter((r): r is OrderBlock => 'ob_id' in r)
    .every((ob) => ob.lifecycle_status === 'UNSPECIFIED' && ob.mitigated_at_candle_index === null);
  check(`Semua OB: lifecycle_status=UNSPECIFIED, mitigated_at=null — seed=${seed}`, allUnspecified, 'ok');
}

console.log(`\n${pass}/${pass + fail} passed.`);
if (fail > 0) {
  console.log(`${fail} FAILED.`);
  process.exit(1);
}
