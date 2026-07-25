/**
 * Rule #3 — Liquidity Sweep
 * Spec: ict-rule-specification.md, section "3. Liquidity Sweep"
 * Status spec: PARTIALLY BLOCKED (default target session_high_low nunggu
 * session_windows) — target external_structure/internal_structure bisa
 * jalan sekarang.
 *
 * INI COMPOSITE PERTAMA (Rule, bukan Engine) yang diimplementasi. Prinsip
 * arsitektur: Rule #3 CUMA orkestrasi, 100% konsumsi output engine, TIDAK
 * menghitung ulang fakta apa pun yang sudah dihitung engine:
 *
 * - Level harga TARGET (structure point price, atau session_high/low) --
 *   DIBACA dari Engine B / Session Engine, TIDAK dihitung ulang di sini.
 * - "Apakah level ini beneran BREAK (bukan sweep)" untuk target Engine B --
 *   DIBACA dari event structure_break Engine B (apakah structure_id ini
 *   muncul di break event candle ini), TIDAK dihitung ulang dengan
 *   membandingkan close vs level sendiri. Ini beda dari target Session
 *   Engine, yang emang HARUS dicek close-vs-level langsung di sini karena
 *   Session Engine sendiri gak punya konsep "break" -- itu SATU-SATUNYA
 *   perhitungan close-vs-level yang legitimate dilakukan Rule #3 sendiri,
 *   sesuai literal spec ("untuk target Session Engine: close kembali ke
 *   sisi dalam session_high/session_low").
 * - "Apakah wick menembus level" -- INI genuinely computation baru milik
 *   Rule #3 sendiri (gak ada engine manapun yang punya konsep "wick
 *   menyentuh level X" sebagai fakta yang sudah dihitung) -- inilah
 *   evaluasi yang literal jadi tugas Rule #3 sesuai definisi konseptualnya.
 *
 * Desain reaktif (konsisten dengan Engine E/F/G): cuma emit hasil kalau
 * ADA wick-touch yang terdeteksi. Failure reason NO_SWEEP/NO_ACTIVE_LEVEL/
 * TARGET_SOURCE_UNAVAILABLE mewakili "gak ada apa-apa buat dievaluasi" --
 * direpresentasikan lewat TIDAK ADA output sama sekali di candle itu,
 * bukan objek skip eksplisit per candle (itu bakal terlalu berisik, sama
 * kayak Engine B gak emit apa pun tiap candle yang gak ada break).
 *
 * OUTSIDE_SESSION: ada di daftar failure reason spec TAPI TIDAK ADA config
 * parameter yang mendefinisikan mekanismenya (section Config Rule #3 cuma
 * punya sweep_target + sweep_target_session_window, gak ada semacam
 * "evaluate only within window X"). Tipe-nya disiapkan (lengkap sesuai
 * spec) tapi implementasi ini TIDAK PERNAH menghasilkannya -- bukan
 * diasumsikan, mekanismenya belum didefinisikan spec.
 */

import type { Candle, LiquiditySweepResult, StructuralPoint, StructureBreakEvent } from './types';

export interface LiquiditySweepConfig {
  sweepTarget: 'session_high_low' | 'external_structure' | 'internal_structure';
  /** Wajib diisi kalau sweepTarget='session_high_low' -- id dari session_windows. */
  sweepTargetSessionWindow?: string;
}

export class LiquiditySweepEngine {
  constructor(private readonly config: LiquiditySweepConfig) {}

  /**
   * Panggil per candle baru.
   * - `activeStructuralPoints`: snapshot TERKINI seluruh structural point
   *   dari Engine B (InternalStructureEngine.getPoints()) -- dipakai kalau
   *   sweepTarget = external_structure/internal_structure.
   * - `structureBreaksThisCandle`: event structure_break yang TEPAT terjadi
   *   di candle ini (nilai balik InternalStructureEngine.ingestCandle()) --
   *   ini yang dipakai buat nentuin "beneran break atau cuma sweep", BUKAN
   *   Rule #3 hitung sendiri.
   * - `sessionLevel`: { high, low } dari
   *   SessionEngine.getLastCompleteOccurrence(sweepTargetSessionWindow),
   *   null kalau belum ada occurrence COMPLETE -- dipakai kalau
   *   sweepTarget = session_high_low.
   */
  ingestCandle(
    candle: Candle,
    candleIndex: number,
    activeStructuralPoints: readonly StructuralPoint[],
    structureBreaksThisCandle: readonly StructureBreakEvent[],
    sessionLevel: { high: number; low: number } | null
  ): LiquiditySweepResult[] {
    if (this.config.sweepTarget === 'session_high_low') {
      return this.evaluateSessionTarget(candle, candleIndex, sessionLevel);
    }
    return this.evaluateStructureTarget(candle, candleIndex, activeStructuralPoints, structureBreaksThisCandle);
  }

  private evaluateStructureTarget(
    candle: Candle,
    candleIndex: number,
    activeStructuralPoints: readonly StructuralPoint[],
    structureBreaksThisCandle: readonly StructureBreakEvent[]
  ): LiquiditySweepResult[] {
    const targetType = this.config.sweepTarget as 'external_structure' | 'internal_structure';
    const targetClassification = targetType === 'external_structure' ? 'EXTERNAL' : 'INTERNAL';
    const brokenThisCandleIds = new Set(structureBreaksThisCandle.map((b) => b.structure_id));
    const results: LiquiditySweepResult[] = [];

    for (const point of activeStructuralPoints) {
      if (point.classification !== targetClassification) continue;

      // Eligible buat dievaluasi candle ini kalau masih ACTIVE, ATAU baru
      // BROKEN persis di candle ini (perlu tetap dievaluasi biar kena
      // NO_CLOSE_BACK, bukan cuma di-skip diam-diam).
      const brokeThisCandle = brokenThisCandleIds.has(point.structure_id);
      if (point.broken_status === 'BROKEN' && !brokeThisCandle) continue;

      const wickPierces = point.type === 'high' ? candle.high > point.price : candle.low < point.price;
      if (!wickPierces) continue;

      results.push({
        status: brokeThisCandle ? 'INVALID' : 'VALID',
        failure_reason: brokeThisCandle ? 'NO_CLOSE_BACK' : null,
        swept_target_type: targetType,
        swept_side: point.type,
        swept_structure_id: point.structure_id,
        swept_level_price: point.price,
        sweep_candle_index: candleIndex,
      });
    }

    return results;
  }

  private evaluateSessionTarget(
    candle: Candle,
    candleIndex: number,
    sessionLevel: { high: number; low: number } | null
  ): LiquiditySweepResult[] {
    if (sessionLevel === null) return []; // TARGET_SOURCE_UNAVAILABLE -- gak emit apapun, konsisten sama desain reaktif

    const results: LiquiditySweepResult[] = [];

    if (candle.high > sessionLevel.high) {
      const closedBack = candle.close <= sessionLevel.high;
      results.push({
        status: closedBack ? 'VALID' : 'INVALID',
        failure_reason: closedBack ? null : 'NO_CLOSE_BACK',
        swept_target_type: 'session_high_low',
        swept_side: 'high',
        swept_structure_id: null,
        swept_level_price: sessionLevel.high,
        sweep_candle_index: candleIndex,
      });
    }

    if (candle.low < sessionLevel.low) {
      const closedBack = candle.close >= sessionLevel.low;
      results.push({
        status: closedBack ? 'VALID' : 'INVALID',
        failure_reason: closedBack ? null : 'NO_CLOSE_BACK',
        swept_target_type: 'session_high_low',
        swept_side: 'low',
        swept_structure_id: null,
        swept_level_price: sessionLevel.low,
        sweep_candle_index: candleIndex,
      });
    }

    return results;
  }
}
