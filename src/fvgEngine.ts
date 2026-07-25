/**
 * Engine E — FVG Detection Engine
 * Spec: ict-rule-specification.md, section "Engine E. FVG Detection Engine"
 * Status: FINAL secara algoritma. Dependencies: tidak ada — primitif
 * langsung dari OHLC candle series, sama seperti Engine A.
 *
 * Beda penting dari Engine B: mitigation lifecycle FVG pakai WICK (bukan
 * body close) dan FULL FILL (bukan touch pertama) — keputusan sadar spec,
 * beda dari Structure Break/Liquidity Sweep yang pakai body close.
 *
 * INTERPRETASI implementasi (spec bilang "wick... telah menjangkau seluruh
 * gap range" tanpa eksplisit bilang harus 1 candle atau kumulatif lintas
 * candle): saya implementasi KUMULATIF — gap_low dan gap_high masing-masing
 * dianggap "tersentuh" begitu ADA candle manapun (sejak formasi) yang
 * wick-nya nyampe ke situ, gak harus candle yang sama, gak harus berurutan.
 * MITIGATED begitu KEDUA sisi udah pernah tersentuh. [Kemungkinan Besar
 * ini yang dimaksud — "telah" berarti akumulasi dari waktu ke waktu, bukan
 * syarat satu candle langsung penuh — tapi ini interpretasi, bukan tertulis
 * eksplisit di spec, jadi ditandai di sini.]
 */

import type { Candle, FVG } from './types';

interface FVGState {
  fvg: FVG;
  bottomReached: boolean; // ada candle (sejak formasi) yang low <= gap_low
  topReached: boolean; // ada candle (sejak formasi) yang high >= gap_high
}

export class FVGEngine {
  private candleCount = 0;
  private fvgIdCounter = 0;
  private readonly recentCandles: Candle[] = []; // rolling buffer, max 3
  private readonly states: FVGState[] = [];

  /** Panggil per candle baru. Return FVG yang statusnya BERUBAH di panggilan
   *  ini — baru terbentuk (ACTIVE) dan/atau yang baru jadi MITIGATED. */
  ingestCandle(candle: Candle): FVG[] {
    const candleIndex = this.candleCount++;
    const changed: FVG[] = [];

    // 1. Cek mitigation buat FVG yang masih ACTIVE, pakai candle ini.
    //    Jalan SEBELUM formasi baru di bawah, supaya FVG yang baru
    //    terbentuk di candle yang sama gak langsung dicek balik ke
    //    dirinya sendiri di iterasi ini (secara geometri emang gak akan
    //    pernah kena diri sendiri, tapi urutan ini bikin itu eksplisit,
    //    bukan cuma kebetulan dari matematika).
    for (const state of this.states) {
      if (state.fvg.mitigation_status === 'MITIGATED') continue;
      if (candle.low <= state.fvg.gap_low) state.bottomReached = true;
      if (candle.high >= state.fvg.gap_high) state.topReached = true;
      if (state.bottomReached && state.topReached) {
        state.fvg.mitigation_status = 'MITIGATED';
        state.fvg.mitigated_at_candle_index = candleIndex;
        changed.push(state.fvg);
      }
    }

    // 2. Cek formasi FVG baru pakai 3 candle terakhir (A, B, C=candle ini).
    //    B gak dipakai di perbandingan sama sekali — sesuai spec, cuma A
    //    dan C yang menentukan gap.
    this.recentCandles.push(candle);
    if (this.recentCandles.length > 3) this.recentCandles.shift();

    if (this.recentCandles.length === 3) {
      const a = this.recentCandles[0];
      const c = this.recentCandles[2];

      let newFvg: FVG | null = null;
      if (a.high < c.low) {
        newFvg = {
          fvg_id: this.fvgIdCounter++,
          type: 'bullish',
          gap_high: c.low,
          gap_low: a.high,
          formed_at_candle_index: candleIndex,
          mitigation_status: 'ACTIVE',
          mitigated_at_candle_index: null,
        };
      } else if (a.low > c.high) {
        newFvg = {
          fvg_id: this.fvgIdCounter++,
          type: 'bearish',
          gap_high: a.low,
          gap_low: c.high,
          formed_at_candle_index: candleIndex,
          mitigation_status: 'ACTIVE',
          mitigated_at_candle_index: null,
        };
      }

      if (newFvg) {
        this.states.push({ fvg: newFvg, bottomReached: false, topReached: false });
        changed.push(newFvg);
      }
    }

    return changed;
  }

  getFVGs(): readonly FVG[] {
    return this.states.map((s) => s.fvg);
  }
}

/**
 * Mode batch — drive FVGEngine yang sama dari awal, sama pola kayak
 * buildInternalStructure di Engine B (konsistensi by construction).
 */
export function detectFVGs(candles: readonly Candle[]): FVG[] {
  const engine = new FVGEngine();
  for (const candle of candles) {
    engine.ingestCandle(candle);
  }
  return [...engine.getFVGs()];
}
