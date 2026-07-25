import type { Candle, StructureBreakEvent, TrendState } from '../src/types';
import { BOSCHOCHEngine, classifyByTrendAndDirection } from '../src/bosChochEngine';
import { SwingDetectionEngine } from '../src/swingDetectionEngine';
import { InternalStructureEngine } from '../src/internalStructureEngine';

let pass = 0;
let fail = 0;

function check(label: string, condition: boolean, detail: string) {
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition || process.env.VERBOSE) console.log(`       ${detail}`);
  condition ? pass++ : fail++;
}

function brk(overrides: Partial<StructureBreakEvent>): StructureBreakEvent {
  return {
    structure_id: 1,
    type: 'high',
    classification: 'EXTERNAL',
    candle_index: 10,
    prior_trend: { status: 'BLOCKED', reason: 'test', literal_spec_value: 'ranging' },
    ...overrides,
  };
}

const BLOCKED: TrendState = { status: 'BLOCKED', reason: 'test', literal_spec_value: 'ranging' };

// =======================================================================
// 1. Tabel klasifikasi (5 kasus) — LANGSUNG ke fungsi murni, bypass
//    gerbang TREND_BLOCKED, membuktikan algoritma lengkap SEKARANG.
// =======================================================================
{
  const c1 = classifyByTrendAndDirection('bullish', 'up');
  check('bullish + up -> BOS, direction=bullish', c1.event_type === 'BOS' && c1.direction === 'bullish' && !c1.isRanging, `c1=${JSON.stringify(c1)}`);

  const c2 = classifyByTrendAndDirection('bearish', 'down');
  check('bearish + down -> BOS, direction=bearish', c2.event_type === 'BOS' && c2.direction === 'bearish' && !c2.isRanging, `c2=${JSON.stringify(c2)}`);

  const c3 = classifyByTrendAndDirection('bullish', 'down');
  check('bullish + down -> CHOCH, direction=bearish', c3.event_type === 'CHOCH' && c3.direction === 'bearish' && !c3.isRanging, `c3=${JSON.stringify(c3)}`);

  const c4 = classifyByTrendAndDirection('bearish', 'up');
  check('bearish + up -> CHOCH, direction=bullish', c4.event_type === 'CHOCH' && c4.direction === 'bullish' && !c4.isRanging, `c4=${JSON.stringify(c4)}`);

  const c5 = classifyByTrendAndDirection('ranging', 'up');
  check('ranging (arah manapun) -> isRanging=true, event_type null', c5.isRanging && c5.event_type === null && c5.direction === null, `c5=${JSON.stringify(c5)}`);
  const c5b = classifyByTrendAndDirection('ranging', 'down');
  check('ranging + down juga isRanging=true (simetris)', c5b.isRanging, `c5b=${JSON.stringify(c5b)}`);
}

// =======================================================================
// 2. Engine ASLI dengan TrendState BLOCKED (kondisi nyata saat ini) ->
//    SELALU UNKNOWN/TREND_BLOCKED, BUKAN NO_PRIOR_TREND
// =======================================================================
{
  const engine = new BOSCHOCHEngine();
  const results = engine.ingestCandle([brk({ type: 'high', classification: 'EXTERNAL', structure_id: 5, candle_index: 20 })], BLOCKED);
  check('status UNKNOWN', results.length === 1 && results[0].status === 'UNKNOWN', `results=${JSON.stringify(results)}`);
  check(
    'failure_reason = TREND_BLOCKED (BUKAN NO_PRIOR_TREND — beda makna)',
    results[0].failure_reason === 'TREND_BLOCKED',
    `reason=${results[0].failure_reason}`
  );
  check('event_type null', results[0].event_type === null, `event_type=${results[0].event_type}`);
  check('source_structure_id dibaca dari break event (5), bukan dihitung ulang', results[0].source_structure_id === 5, `id=${results[0].source_structure_id}`);
  check('candle_index dibaca dari break event (20)', results[0].candle_index === 20, `idx=${results[0].candle_index}`);
}

// =======================================================================
// 3. Break INTERNAL diabaikan total (bukan UNKNOWN, bukan apa-apa)
// =======================================================================
{
  const engine = new BOSCHOCHEngine();
  const results = engine.ingestCandle([brk({ classification: 'INTERNAL' })], BLOCKED);
  check('Break INTERNAL -> 0 hasil (diabaikan total, domain MSS)', results.length === 0, `results=${JSON.stringify(results)}`);
}

// =======================================================================
// 4. Campuran EXTERNAL + INTERNAL di candle yang sama -> cuma EXTERNAL diproses
// =======================================================================
{
  const engine = new BOSCHOCHEngine();
  const results = engine.ingestCandle(
    [
      brk({ classification: 'EXTERNAL', structure_id: 1, candle_index: 5 }),
      brk({ classification: 'INTERNAL', structure_id: 2, candle_index: 5 }),
    ],
    BLOCKED
  );
  check('Cuma 1 hasil (yang EXTERNAL doang)', results.length === 1 && results[0].source_structure_id === 1, `results=${JSON.stringify(results)}`);
}

// =======================================================================
// 5. Multiple EXTERNAL break di candle yang sama -> multiple hasil terpisah
// =======================================================================
{
  const engine = new BOSCHOCHEngine();
  const results = engine.ingestCandle(
    [
      brk({ classification: 'EXTERNAL', structure_id: 1, type: 'high', candle_index: 5 }),
      brk({ classification: 'EXTERNAL', structure_id: 2, type: 'low', candle_index: 5 }),
    ],
    BLOCKED
  );
  check('2 hasil terpisah', results.length === 2, `results=${JSON.stringify(results)}`);
}

// =======================================================================
// 6. Tidak ada structure_break sama sekali -> 0 hasil (silent, sesuai desain reaktif)
// =======================================================================
{
  const engine = new BOSCHOCHEngine();
  const results = engine.ingestCandle([], BLOCKED);
  check('0 structure_break -> 0 hasil', results.length === 0, `results=${JSON.stringify(results)}`);
}

// =======================================================================
// 7. Full pipeline: Engine A + B + BOSCHOCH asli di random walk panjang --
//    buktikan EMPIRIS bahwa SEMUA hasil UNKNOWN/TREND_BLOCKED (bukan cuma
//    diklaim), konsisten dengan Trend yang selalu ranging (dibuktikan di
//    fase Engine B).
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

let totalResultsAcrossAllSeeds = 0;
let allUnknownAndBlocked = true;

for (const [seed, length, volatility] of [
  [71, 500, 4],
  [72, 500, 2],
  [73, 900, 6],
] as const) {
  const candles = generateSeries(length, seed, volatility);
  const swingEngine = new SwingDetectionEngine(2);
  const structEngine = new InternalStructureEngine();
  const bosChochEngine = new BOSCHOCHEngine();

  let seedResultCount = 0;

  for (const candle of candles) {
    const breaks = structEngine.ingestCandle(candle);
    const priorTrend = structEngine.getTrendState(); // TEPAT setelah ingestCandle, SEBELUM addSwingPoint
    const newSwings = swingEngine.ingest(candle);
    for (const sw of newSwings) structEngine.addSwingPoint(sw);

    const results = bosChochEngine.ingestCandle(breaks, priorTrend);
    seedResultCount += results.length;
    for (const r of results) {
      if (r.status !== 'UNKNOWN' || r.failure_reason !== 'TREND_BLOCKED') {
        allUnknownAndBlocked = false;
      }
    }
  }

  totalResultsAcrossAllSeeds += seedResultCount;
  check(`Seed ${seed}: ada structure_break EXTERNAL yang diproses (${seedResultCount} hasil)`, seedResultCount > 0, `count=${seedResultCount}`);
}

check(
  `EMPIRIS: seluruh ${totalResultsAcrossAllSeeds} hasil BOS/CHOCH lintas 3 seed adalah UNKNOWN/TREND_BLOCKED (bukan diklaim doang)`,
  allUnknownAndBlocked && totalResultsAcrossAllSeeds > 0,
  allUnknownAndBlocked ? 'terbukti' : 'ADA hasil yang bukan TREND_BLOCKED -- klaim salah'
);

console.log(`\n${pass}/${pass + fail} passed.`);
if (fail > 0) {
  console.log(`${fail} FAILED.`);
  process.exit(1);
}
