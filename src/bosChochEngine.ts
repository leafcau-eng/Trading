/**
 * Rule #4 & #6 — BOS (Break of Structure) & CHOCH (Change of Character)
 * Spec: ict-rule-specification.md, section "4 & 6. BOS & CHOCH"
 * Status spec: FINAL secara algoritma — tapi PRAKTIS BLOCKED v0.3.2 (lihat
 * catatan di bawah). Dependencies: Internal Structure Engine (Engine B)
 * SAJA — sumber `structure_break` event dan `trend`.
 *
 * MURNI konsumsi Engine B, TIDAK menghitung ulang swing, structure_break,
 * ataupun trend:
 * - `structure_id`, `type`, `candle_index` dari structure_break event --
 *   dibaca langsung.
 * - `prior_trend` dari TrendState Engine B -- dibaca langsung, TIDAK
 *   dihitung ulang dari label/classification manapun.
 * - `structure_scope: EXTERNAL` (FINAL, bukan configurable seperti Rule #3)
 *   -- INTERNAL diabaikan total di sini (domain MSS terpisah, lihat
 *   "Hubungan dengan MSS" di spec).
 *
 * PRAKTIS BLOCKED: TrendState saat ini SELALU {status:'BLOCKED'} (lihat
 * "Specification Conflict: Trend" di ict-rule-specification.md). Kode ini
 * SENGAJA TIDAK membaca `literal_spec_value` sebagai basis klasifikasi
 * selama status BLOCKED -- itu PERSIS fallback/asumsi yang dilarang
 * eksplisit (literal_spec_value SELALU 'ranging', bukan representasi
 * trend pasar sesungguhnya). Selama BLOCKED: status SELALU UNKNOWN,
 * failure_reason SELALU 'TREND_BLOCKED' -- BUKAN 'NO_PRIOR_TREND' (dua
 * makna beda, lihat catatan di types.ts).
 *
 * Tabel klasifikasi (bagian yang benar-benar FINAL & testable) dipisah
 * jadi fungsi murni `classifyByTrendAndDirection` -- membuktikan
 * algoritmanya lengkap & benar SEKARANG, terlepas dari status BLOCKED.
 * Begitu Trend direvisi (Specification Conflict diselesaikan), yang
 * perlu diubah CUMA cara baca TrendState di ingestCandle() -- tabel
 * klasifikasi di bawah TIDAK perlu disentuh.
 *
 * Desain reaktif (pola sama dengan Rule #3/MSS/Engine E-G): cuma emit
 * hasil kalau ADA structure_break EXTERNAL. NO_STRUCTURE_BREAK/
 * ENGINE_UNAVAILABLE direpresentasikan lewat TIDAK ADA output (silent),
 * bukan diemit eksplisit tiap candle tanpa break.
 */

import type { BOSCHOCHResult, StructureBreakEvent, TrendState } from './types';

type BreakDirection = 'up' | 'down';

interface ClassificationOutcome {
  event_type: 'BOS' | 'CHOCH' | null;
  direction: 'bullish' | 'bearish' | null;
  isRanging: boolean;
}

/**
 * Tabel klasifikasi FINAL (spec langkah 3) — fungsi murni, gak baca
 * TrendState/StructureBreakEvent langsung, cuma dua nilai sudah-diekstrak.
 * DIEKSPOR eksplisit supaya bisa dites langsung terlepas dari gerbang
 * TREND_BLOCKED di ingestCandle() -- buat membuktikan algoritmanya sendiri
 * lengkap sekarang, bukan nunggu Trend direvisi buat divalidasi.
 */
export function classifyByTrendAndDirection(
  priorTrend: 'bullish' | 'bearish' | 'ranging',
  breakDirection: BreakDirection
): ClassificationOutcome {
  if (priorTrend === 'ranging') {
    return { event_type: null, direction: null, isRanging: true };
  }
  if (priorTrend === 'bullish' && breakDirection === 'up') {
    return { event_type: 'BOS', direction: 'bullish', isRanging: false };
  }
  if (priorTrend === 'bearish' && breakDirection === 'down') {
    return { event_type: 'BOS', direction: 'bearish', isRanging: false };
  }
  if (priorTrend === 'bullish' && breakDirection === 'down') {
    return { event_type: 'CHOCH', direction: 'bearish', isRanging: false };
  }
  // priorTrend === 'bearish' && breakDirection === 'up'
  return { event_type: 'CHOCH', direction: 'bullish', isRanging: false };
}

export class BOSCHOCHEngine {
  /**
   * Panggil per candle.
   * - `structureBreaksThisCandle`: SEMUA event structure_break Engine B di
   *   candle ini (EXTERNAL & INTERNAL campur boleh — filter EXTERNAL
   *   terjadi DI DALAM, sesuai structure_scope FINAL. INTERNAL diabaikan
   *   total, gak menghasilkan output apa pun, bukan UNKNOWN/skip).
   * - `priorTrend`: TrendState Engine B TEPAT SEBELUM candle ini (panggil
   *   InternalStructureEngine.getTrendState() SETELAH ingestCandle() tapi
   *   SEBELUM addSwingPoint() candle yang sama, biar "sebelum break ini"
   *   akurat).
   */
  ingestCandle(structureBreaksThisCandle: readonly StructureBreakEvent[], priorTrend: TrendState): BOSCHOCHResult[] {
    const results: BOSCHOCHResult[] = [];

    for (const breakEvent of structureBreaksThisCandle) {
      if (breakEvent.classification !== 'EXTERNAL') continue; // structure_scope FINAL, INTERNAL = domain MSS

      const breakDirection: BreakDirection = breakEvent.type === 'high' ? 'up' : 'down';

      if (priorTrend.status === 'BLOCKED') {
        // Lihat catatan file-level: TIDAK membaca literal_spec_value di
        // sini walau secara sintaks bisa -- itu akan jadi fallback ke
        // 'ranging' yang gak reliable, persis yang dilarang eksplisit.
        results.push({
          status: 'UNKNOWN',
          event_type: null,
          direction: null,
          source_structure_id: breakEvent.structure_id,
          candle_index: breakEvent.candle_index,
          failure_reason: 'TREND_BLOCKED',
        });
        continue;
      }

      const classification = classifyByTrendAndDirection(priorTrend.literal_spec_value, breakDirection);
      if (classification.isRanging) {
        results.push({
          status: 'UNKNOWN',
          event_type: null,
          direction: null,
          source_structure_id: breakEvent.structure_id,
          candle_index: breakEvent.candle_index,
          failure_reason: 'NO_PRIOR_TREND',
        });
      } else {
        results.push({
          status: 'VALID',
          event_type: classification.event_type,
          direction: classification.direction,
          source_structure_id: breakEvent.structure_id,
          candle_index: breakEvent.candle_index,
          failure_reason: null,
        });
      }
    }

    return results;
  }
}
