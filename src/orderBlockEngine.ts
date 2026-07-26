/**
 * Engine G — Order Block (SEBAGIAN, sesuai instruksi eksplisit)
 * Spec: ict-rule-specification.md, section "Engine G. Order Block"
 * Status spec: SEBAGIAN — identifikasi zona FINAL, lifecycle UNSPECIFIED.
 * Dependencies: Internal Structure Engine (Engine B) — sumber event
 * `structure_break`.
 *
 * DIIMPLEMENTASI (final, deterministik):
 * - Identifikasi candle Order Block via backward scan dari structure_break
 * - Config `structure_scope` dan `ob_area` (gak ada default — wajib diisi
 *   eksplisit, sama seperti swing_fractal_n di Engine A)
 * - Zona OB (full_candle / body_only)
 * - Output schema lengkap
 * - Skip/failure reason NO_OPPOSITE_CANDLE
 *
 * SENGAJA BELUM DIIMPLEMENTASI (TODO, bukan diasumsikan):
 * - Lifecycle ACTIVE -> MITIGATED (3 kandidat belum diputuskan pemilik
 *   spec: A. Touch / B. Full Fill / C. Body Close — lihat "Lifecycle:
 *   UNSPECIFIED" di spec). `lifecycle_status` SELALU 'UNSPECIFIED',
 *   `mitigated_at_candle_index` SELALU null di implementasi ini.
 * - Mitigation logic apapun (gak ada tracking wick/body terhadap zone).
 * - Invalidation logic yang bergantung lifecycle.
 * Begitu lifecycle diputuskan: tambah tracking state (mirip pola
 * bottomReached/topReached di Engine E/F) dan isi TODO di ingestCandle()
 * di bawah — TIDAK perlu ubah OrderBlock type, constructor, atau cara
 * caller manggil engine ini.
 */

import type { Candle, OrderBlock, OrderBlockSkip, StructureBreakEvent } from './types';
import { SwingDetectionEngine } from './swingDetectionEngine';
import { InternalStructureEngine, breakDirectionOf } from './internalStructureEngine';

export interface OrderBlockConfig {
  structureScope: 'internal' | 'external' | 'both';
  obArea: 'full_candle' | 'body_only';
}

type BreakDirection = 'up' | 'down';

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
  private readonly obs: OrderBlock[] = [];

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
    const results: (OrderBlock | OrderBlockSkip)[] = [];

    for (const breakEvent of structureBreaks) {
      if (!matchesScope(breakEvent.classification, this.config.structureScope)) continue;

      const result = this.identifyOrderBlock(breakEvent);
      results.push(result);
      if ('ob_id' in result) this.obs.push(result);
    }

    // TODO (lifecycle UNSPECIFIED — jangan isi sebelum pemilik spec
    // memutuskan A/B/C): begitu diputuskan, loop di sini buat cek OB yang
    // masih ACTIVE terhadap `candle` (wick/body sesuai kandidat terpilih),
    // set lifecycle_status='MITIGATED' + mitigated_at_candle_index, push
    // ke `results`. Pola persis sama dengan bottomReached/topReached di
    // FVGEngine/IFVGEngine (lihat fvgEngine.ts, ifvgEngine.ts) — TIDAK
    // perlu algoritma baru, tinggal terapin primitive yang sudah ada ke
    // kandidat yang dipilih.

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
      lifecycle_status: 'UNSPECIFIED',
      mitigated_at_candle_index: null,
    };
  }

  getOrderBlocks(): readonly OrderBlock[] {
    return this.obs;
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
