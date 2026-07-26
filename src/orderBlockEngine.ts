/**
 * Engine G — Order Block
 * Spec: ict-rule-specification.md, section "Engine G. Order Block"
 * Status spec: FINAL — identifikasi zona FINAL, lifecycle FINAL (Full Fill,
 * kandidat B, diputuskan pemilik spec — lihat "Catatan keputusan lifecycle"
 * di bawah). Dependencies: Internal Structure Engine (Engine B) — sumber
 * event `structure_break`.
 *
 * DIIMPLEMENTASI LENGKAP:
 * - Identifikasi candle Order Block via backward scan dari structure_break
 * - Config `structure_scope` dan `ob_area` (gak ada default — wajib diisi
 *   eksplisit, sama seperti swing_fractal_n di Engine A)
 * - Zona OB (full_candle / body_only)
 * - Lifecycle ACTIVE -> MITIGATED via Full Fill (kandidat B dari 3 opsi
 *   spec: Touch/Full Fill/Body Close) -- REUSE primitive full-fill yang
 *   PERSIS sama dengan Engine E (FVG) dan Engine F (IFVG): cumulative
 *   coverage (bottomReached DAN topReached, dari candle manapun sejak
 *   formasi, gak harus candle yang sama), bukan algoritma baru. Konsisten
 *   sama prinsip "satu algoritma, satu sumber kebenaran" -- primitive
 *   full-fill sudah ada, di sini cuma diterapkan ke zone Order Block.
 * - Output schema lengkap, termasuk lifecycle_status & mitigated_at_candle_index
 * - Skip/failure reason NO_OPPOSITE_CANDLE
 *
 * Catatan keputusan lifecycle: dari 3 kandidat (A. Touch / B. Full Fill /
 * C. Body Close), pemilik spec memilih B. Full Fill secara eksplisit.
 * TIDAK ada perubahan pada OrderBlock type, OrderBlockConfig, atau cara
 * caller memanggil engine ini -- persis seperti yang direncanakan waktu
 * bagian ini masih di-stub (lihat commit sebelumnya).
 */

import type { Candle, OrderBlock, OrderBlockSkip, StructureBreakEvent } from './types';
import { SwingDetectionEngine } from './swingDetectionEngine';
import { InternalStructureEngine, breakDirectionOf } from './internalStructureEngine';

export interface OrderBlockConfig {
  structureScope: 'internal' | 'external' | 'both';
  obArea: 'full_candle' | 'body_only';
}

type BreakDirection = 'up' | 'down';

interface OrderBlockState {
  ob: OrderBlock;
  bottomReached: boolean; // ada candle (sejak formasi) yang low <= zone_low
  topReached: boolean; // ada candle (sejak formasi) yang high >= zone_high
}

/**
 * [Menebak] Spec gak eksplisit nyebut kasus doji (close===open). Di sini
 * doji dianggap BUKAN "searah" break_direction manapun (gak strictly
 * bullish, gak strictly bearish) -- jadi scan mundur berhenti DI doji itu,
 * doji-nya jadi candle Order Block. Ini interpretasi yang perlu
 * dikonfirmasi kalau muncul di data asli, bukan fakta dari spec.
 */
function isSameDirectionAsBreak(candle: Candle, direction: BreakDirection): boolean {
  if (direction === 'up') return candle.close > candle.open; // bullish, searah break naik
  return candle.close < candle.open; // bearish, searah break turun
}

function matchesScope(classification: 'EXTERNAL' | 'INTERNAL', scope: OrderBlockConfig['structureScope']): boolean {
  if (scope === 'both') return true;
  if (scope === 'internal') return classification === 'INTERNAL';
  return classification === 'EXTERNAL';
}

export class OrderBlockEngine {
  private readonly candles: Candle[] = [];
  private obIdCounter = 0;
  private readonly obStates: OrderBlockState[] = [];

  constructor(private readonly config: OrderBlockConfig) {}

  /**
   * Panggil per candle baru. `structureBreaks` = event structure_break
   * yang terjadi TEPAT di candle ini (dari nilai balik
   * InternalStructureEngine.ingestCandle()) -- kosongkan array kalau gak
   * ada. Asumsi: engine ini di-feed candle stream yang SAMA persis, dari
   * index 0, dengan yang di-feed ke Swing Detection + Internal Structure
   * Engine -- supaya candle_index di structure_break selaras sama posisi
   * di buffer internal engine ini.
   */
  ingestCandle(candle: Candle, structureBreaks: readonly StructureBreakEvent[]): (OrderBlock | OrderBlockSkip)[] {
    this.candles.push(candle);
    const candleIndex = this.candles.length - 1;
    const results: (OrderBlock | OrderBlockSkip)[] = [];

    // 1. Cek Full Fill buat OB yang SUDAH ADA (dari candle sebelumnya) DULU
    //    -- urutan ini (cek dulu, baru tambah OB baru di langkah 2) yang
    //    bikin OB yang baru kebentuk di candle ini gak langsung dicek
    //    balik ke candle konfirmasinya sendiri. Pola sama persis dengan
    //    Engine B/E/F/Rule#3/MSS/BOS-CHOCH.
    for (const state of this.obStates) {
      if (state.ob.lifecycle_status === 'MITIGATED') continue;
      if (candle.low <= state.ob.zone_low) state.bottomReached = true;
      if (candle.high >= state.ob.zone_high) state.topReached = true;
      if (state.bottomReached && state.topReached) {
        state.ob.lifecycle_status = 'MITIGATED';
        state.ob.mitigated_at_candle_index = candleIndex;
        results.push(state.ob);
      }
    }

    // 2. Identifikasi OB baru dari structure_break candle ini (ditambah
    //    SETELAH pengecekan di atas -- lihat penjelasan di langkah 1)
    for (const breakEvent of structureBreaks) {
      if (!matchesScope(breakEvent.classification, this.config.structureScope)) continue;

      const result = this.identifyOrderBlock(breakEvent);
      results.push(result);
      if ('ob_id' in result) {
        this.obStates.push({ ob: result, bottomReached: false, topReached: false });
      }
    }

    return results;
  }

  private identifyOrderBlock(breakEvent: StructureBreakEvent): OrderBlock | OrderBlockSkip {
    const direction = breakDirectionOf(breakEvent);
    const breakCandleIndex = breakEvent.candle_index;

    let obCandleIndex: number | null = null;
    for (let i = breakCandleIndex - 1; i >= 0; i--) {
      if (isSameDirectionAsBreak(this.candles[i], direction)) continue;
      obCandleIndex = i;
      break;
    }

    if (obCandleIndex === null) {
      return {
        status: 'SKIPPED',
        reason: 'NO_OPPOSITE_CANDLE',
        source_structure_break_candle_index: breakCandleIndex,
      };
    }

    const obCandle = this.candles[obCandleIndex];
    const [zone_low, zone_high] =
      this.config.obArea === 'full_candle'
        ? [obCandle.low, obCandle.high]
        : [Math.min(obCandle.open, obCandle.close), Math.max(obCandle.open, obCandle.close)];

    return {
      ob_id: this.obIdCounter++,
      source_structure_break_candle_index: breakCandleIndex,
      // Type OB = ARAH BREAK, bukan warna candle OB itu sendiri (candle
      // OB warnanya justru BERLAWANAN, by construction — itu yang bikin
      // dia jadi "Order Block": candle terakhir lawan arah sebelum leg
      // impulsif). Break naik -> OB "bullish" (support), break turun ->
      // OB "bearish" (resistance), sesuai konvensi ICT standar.
      type: direction === 'up' ? 'bullish' : 'bearish',
      zone_high,
      zone_low,
      formed_at_candle_index: obCandleIndex,
      structure_scope_used: breakEvent.classification === 'INTERNAL' ? 'internal' : 'external',
      lifecycle_status: 'ACTIVE',
      mitigated_at_candle_index: null,
    };
  }

  getOrderBlocks(): readonly OrderBlock[] {
    return this.obStates.map((s) => s.ob);
  }
}

/**
 * Mode batch — drive Swing Detection (Engine A) + Internal Structure
 * (Engine B) + Order Block (Engine G) sekaligus dari candle mentah.
 * Engine G gak butuh trend (Engine B bagian e, yang BLOCKED) -- cuma
 * butuh event structure_break, jadi status BLOCKED trend TIDAK menghalangi
 * pipeline ini jalan.
 */
export function detectOrderBlocks(
  candles: readonly Candle[],
  swingFractalN: number,
  config: OrderBlockConfig
): (OrderBlock | OrderBlockSkip)[] {
  const swingEngine = new SwingDetectionEngine(swingFractalN);
  const structEngine = new InternalStructureEngine();
  const obEngine = new OrderBlockEngine(config);
  const results: (OrderBlock | OrderBlockSkip)[] = [];

  for (const candle of candles) {
    const newSwings = swingEngine.ingest(candle);
    const breaks = structEngine.ingestCandle(candle);
    for (const swing of newSwings) structEngine.addSwingPoint(swing);
    results.push(...obEngine.ingestCandle(candle, breaks));
  }

  return results;
}
