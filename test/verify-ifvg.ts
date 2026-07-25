import type { Candle, FVG } from '../src/types';
import { FVGEngine } from '../src/fvgEngine';
import { IFVGEngine, detectIFVGs } from '../src/ifvgEngine';

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

function fakeMitigatedFVG(overrides: Partial<FVG>): FVG {
  return {
    fvg_id: 0,
    type: 'bullish',
    gap_high: 15,
    gap_low: 10,
    formed_at_candle_index: 2,
    mitigation_status: 'MITIGATED',
    mitigated_at_candle_index: 5,
    ...overrides,
  };
}

// =======================================================================
// 1. Bullish FVG mitigated -> bearish IFVG, range sama persis
// =======================================================================
{
  const engine = new IFVGEngine();
  for (let i = 0; i < 5; i++) engine.ingestCandle(c(1000, -1000, i), []);
  const fvg = fakeMitigatedFVG({ fvg_id: 7, type: 'bullish', gap_high: 15, gap_low: 10, mitigated_at_candle_index: 5 });
  const spawned = engine.ingestCandle(c(1000, -1000, 5), [fvg]);
  check('IFVG kebentuk', spawned.length === 1, `spawned=${JSON.stringify(spawned)}`);
  check('Polaritas dibalik: bullish FVG -> bearish IFVG', spawned[0].type === 'bearish', `type=${spawned[0].type}`);
  check('range_high = gap_high FVG asal (15), gak dihitung ulang', spawned[0].range_high === 15, `range_high=${spawned[0].range_high}`);
  check('range_low = gap_low FVG asal (10)', spawned[0].range_low === 10, `range_low=${spawned[0].range_low}`);
  check('source_fvg_id merujuk balik ke fvg_id=7', spawned[0].source_fvg_id === 7, `source_fvg_id=${spawned[0].source_fvg_id}`);
  check('formed_at_candle_index = candle saat ini (5)', spawned[0].formed_at_candle_index === 5, `formed_at=${spawned[0].formed_at_candle_index}`);
  check('lifecycle_status awal ACTIVE', spawned[0].lifecycle_status === 'ACTIVE', `status=${spawned[0].lifecycle_status}`);
}

// =======================================================================
// 2. Bearish FVG mitigated -> bullish IFVG
// =======================================================================
{
  const engine = new IFVGEngine();
  const fvg = fakeMitigatedFVG({ fvg_id: 3, type: 'bearish', gap_high: 50, gap_low: 40 });
  const spawned = engine.ingestCandle(c(1000, -1000, 0), [fvg]);
  check('Polaritas dibalik: bearish FVG -> bullish IFVG', spawned[0].type === 'bullish', `type=${spawned[0].type}`);
  check('range copied exact (50/40)', spawned[0].range_high === 50 && spawned[0].range_low === 40, `range=${spawned[0].range_low}-${spawned[0].range_high}`);
}

// =======================================================================
// 3. FVG yang gak pernah MITIGATED -> gak pernah ada IFVG buat dia
// =======================================================================
{
  const candles = [c(10, 5, 0), c(20, 12, 1), c(25, 15, 2)]; // FVG kebentuk, tapi gak ada candle setelahnya buat mitigasi
  const result = detectIFVGs(candles);
  check('FVG ACTIVE (gak pernah mitigated) -> 0 IFVG', result.length === 0, `result=${JSON.stringify(result)}`);
}

// =======================================================================
// 4. USED: satu candle full-fill langsung
// =======================================================================
{
  const engine = new IFVGEngine();
  const fvg = fakeMitigatedFVG({ fvg_id: 0, type: 'bullish', gap_high: 15, gap_low: 10, mitigated_at_candle_index: 0 });
  const [ifvg] = engine.ingestCandle(c(1000, -1000, 0), [fvg]); // ifvg bearish, range [10,15]
  check('IFVG ACTIVE setelah formasi', ifvg.lifecycle_status === 'ACTIVE', `status=${ifvg.lifecycle_status}`);

  const used = engine.ingestCandle(c(17, 8, 1), []); // range [8,17] full cover [10,15]
  check('Full-fill 1 candle -> USED', used.some((f) => f.ifvg_id === ifvg.ifvg_id && f.lifecycle_status === 'USED'), `used=${JSON.stringify(used)}`);
  check('used_at_candle_index = 1', engine.getIFVGs()[0].used_at_candle_index === 1, `idx=${engine.getIFVGs()[0].used_at_candle_index}`);
}

// =======================================================================
// 5. USED kumulatif lintas candle beda, dan gak self-trigger di candle formasi
// =======================================================================
{
  const engine = new IFVGEngine();
  const fvg = fakeMitigatedFVG({ fvg_id: 0, type: 'bullish', gap_high: 15, gap_low: 10, mitigated_at_candle_index: 0 });
  // Candle formasi ITU SENDIRI dikasih range [8,17] yang SECARA GEOMETRI full-cover
  // range IFVG [10,15] -- tapi HARUS gak ke-trigger krn ini candle formasinya sendiri.
  const [ifvg] = engine.ingestCandle(c(17, 8, 0), [fvg]);
  check('IFVG gak langsung USED walau candle formasinya sendiri geometris full-cover range', ifvg.lifecycle_status === 'ACTIVE', `status=${ifvg.lifecycle_status}`);

  const afterBottom = engine.ingestCandle(c(11, 9, 1), []); // bottom doang
  check('Kena bottom doang -> masih ACTIVE', afterBottom.length === 0, `after=${JSON.stringify(afterBottom)}`);

  const afterTop = engine.ingestCandle(c(16, 14, 2), []); // top nyusul di candle beda
  check('Top nyusul di candle beda -> USED', afterTop.length === 1 && afterTop[0].lifecycle_status === 'USED', `after=${JSON.stringify(afterTop)}`);
  check('used_at_candle_index = 2 (candle yang melengkapi)', engine.getIFVGs()[0].used_at_candle_index === 2, `idx=${engine.getIFVGs()[0].used_at_candle_index}`);
}

// =======================================================================
// 6. USED one-directional
// =======================================================================
{
  const engine = new IFVGEngine();
  const fvg = fakeMitigatedFVG({ fvg_id: 0, gap_high: 15, gap_low: 10, mitigated_at_candle_index: 0 });
  engine.ingestCandle(c(1000, -1000, 0), [fvg]);
  engine.ingestCandle(c(17, 8, 1), []); // full fill -> USED
  const usedAt = engine.getIFVGs()[0].used_at_candle_index;
  check('USED (setup)', engine.getIFVGs()[0].lifecycle_status === 'USED', 'setup check');

  engine.ingestCandle(c(100, 90, 2), []); // gak relevan
  check('Tetap USED', engine.getIFVGs()[0].lifecycle_status === 'USED', `status=${engine.getIFVGs()[0].lifecycle_status}`);
  check('used_at_candle_index gak berubah', engine.getIFVGs()[0].used_at_candle_index === usedAt, `idx=${engine.getIFVGs()[0].used_at_candle_index}`);
}

// =======================================================================
// 7. ifvg_id sequential
// =======================================================================
{
  const engine = new IFVGEngine();
  const fvg1 = fakeMitigatedFVG({ fvg_id: 10, gap_high: 15, gap_low: 10, mitigated_at_candle_index: 0 });
  const fvg2 = fakeMitigatedFVG({ fvg_id: 11, gap_high: 30, gap_low: 25, mitigated_at_candle_index: 0 });
  const spawned = engine.ingestCandle(c(1000, -1000, 0), [fvg1, fvg2]);
  const ids = spawned.map((f) => f.ifvg_id).sort();
  check('ifvg_id sequential 0,1', JSON.stringify(ids) === JSON.stringify([0, 1]), `ids=${JSON.stringify(ids)}`);
}

// =======================================================================
// 8 & 9. Full pipeline (random walk) — bijection MITIGATED-FVG <-> IFVG,
//        polaritas selalu kebalik, range selalu match; + batch===manual
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

for (const [seed, length, volatility] of [
  [31, 400, 4],
  [32, 400, 1.5],
  [33, 900, 6],
] as const) {
  const candles = generateSeries(length, seed, volatility);

  const fvgEngineOnly = new FVGEngine();
  const mitigatedFvgs: FVG[] = [];
  for (const candle of candles) {
    const changes = fvgEngineOnly.ingestCandle(candle);
    for (const f of changes) if (f.mitigation_status === 'MITIGATED') mitigatedFvgs.push(f);
  }

  const ifvgs = detectIFVGs(candles);

  check(
    `Bijection: jumlah IFVG === jumlah FVG yang MITIGATED — seed=${seed} (${mitigatedFvgs.length} mitigated)`,
    ifvgs.length === mitigatedFvgs.length,
    `ifvgs=${ifvgs.length}, mitigatedFvgs=${mitigatedFvgs.length}`
  );

  const sourceIds = ifvgs.map((f) => f.source_fvg_id).sort((x, y) => x - y);
  const mitigatedIds = mitigatedFvgs.map((f) => f.fvg_id).sort((x, y) => x - y);
  check(
    `Setiap source_fvg_id di IFVG persis cocok sama set fvg_id yang MITIGATED — seed=${seed}`,
    JSON.stringify(sourceIds) === JSON.stringify(mitigatedIds),
    `sourceIds=${JSON.stringify(sourceIds.slice(0, 5))}..., mitigatedIds=${JSON.stringify(mitigatedIds.slice(0, 5))}...`
  );

  const bySource = new Map(mitigatedFvgs.map((f) => [f.fvg_id, f]));
  const polarityOk = ifvgs.every((ifvg) => {
    const src = bySource.get(ifvg.source_fvg_id)!;
    const expectedType = src.type === 'bullish' ? 'bearish' : 'bullish';
    return ifvg.type === expectedType && ifvg.range_high === src.gap_high && ifvg.range_low === src.gap_low;
  });
  check(`Semua IFVG: polaritas terbalik + range match sumbernya persis — seed=${seed}`, polarityOk, 'ok');

  const fvgManual = new FVGEngine();
  const ifvgManual = new IFVGEngine();
  for (const candle of candles) {
    const changes = fvgManual.ingestCandle(candle);
    const newlyMitigated = changes.filter((f) => f.mitigation_status === 'MITIGATED');
    ifvgManual.ingestCandle(candle, newlyMitigated);
  }
  check(
    `Batch (detectIFVGs) === manual step-by-step — seed=${seed}`,
    JSON.stringify(ifvgs) === JSON.stringify(ifvgManual.getIFVGs()),
    `batch=${ifvgs.length}, manual=${ifvgManual.getIFVGs().length}`
  );
}

console.log(`\n${pass}/${pass + fail} passed.`);
if (fail > 0) {
  console.log(`${fail} FAILED.`);
  process.exit(1);
}
