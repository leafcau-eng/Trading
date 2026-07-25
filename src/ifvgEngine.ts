/**
 * Engine F — IFVG (Inversion Fair Value Gap)
 * Spec: ict-rule-specification.md, section "Engine F. IFVG"
 * Status: FINAL secara algoritma. Dependencies: Engine E (FVG Detection).
 *
 * BUKAN pattern baru dari candle — murni transformasi state dari FVG yang
 * sudah MITIGATED (polaritas dibalik, range angkanya sama persis, gak
 * dihitung ulang). Trigger formasi = event mitigation Engine E langsung,
 * BUKAN pemeriksaan baru terhadap candle.
 *
 * Lifecycle IFVG sendiri (ACTIVE -> USED) REUSE primitive full-fill yang
 * sama persis dengan Engine E, diterapkan ke `ifvg_range` — tracking-nya
 * mulai FRESH per IFVG (bottomReached/topReached direset di titik formasi
 * IFVG), bukan warisan dari tracking FVG asalnya. Ini penting: walau
 * ifvg_range == gap FVG asal yang BARU SELESAI di-full-fill, IFVG-nya
 * sendiri butuh candle BARU (setelah formasi) buat re-cover range yang
 * sama itu dari nol sebelum bisa USED — gak otomatis USED di detik yang
 * sama dia terbentuk.
 */

import type { Candle, FVG, IFVG } from './types';
import { FVGEngine } from './fvgEngine';

interface IFVGState {
  ifvg: IFVG;
  bottomReached: boolean;
  topReached: boolean;
}

export class IFVGEngine {
  private candleCount = 0;
  private ifvgIdCounter = 0;
  private readonly states: IFVGState[] = [];

  /**
   * Panggil per candle baru. `newlyMitigatedFVGs` = FVG yang BARU jadi
   * MITIGATED di candle ini (dari nilai balik FVGEngine.ingestCandle(),
   * filter mitigation_status === 'MITIGATED'; kosongkan array kalau gak
   * ada). Urutan internal: cek USED buat IFVG yang udah ada DULU, baru
   * spawn IFVG baru dari newlyMitigatedFVGs sesudahnya — supaya IFVG yang
   * baru terbentuk gak langsung dicek USED oleh candle konfirmasinya
   * sendiri (pola yang sama dengan Engine B dan Engine E).
   */
  ingestCandle(candle: Candle, newlyMitigatedFVGs: readonly FVG[]): IFVG[] {
    const candleIndex = this.candleCount++;
    const changed: IFVG[] = [];

    // 1. Cek USED buat IFVG yang masih ACTIVE.
    for (const state of this.states) {
      if (state.ifvg.lifecycle_status === 'USED') continue;
      if (candle.low <= state.ifvg.range_low) state.bottomReached = true;
      if (candle.high >= state.ifvg.range_high) state.topReached = true;
      if (state.bottomReached && state.topReached) {
        state.ifvg.lifecycle_status = 'USED';
        state.ifvg.used_at_candle_index = candleIndex;
        changed.push(state.ifvg);
      }
    }

    // 2. Spawn IFVG baru dari tiap FVG yang baru MITIGATED di candle ini.
    //    Polaritas dibalik, range angkanya sama persis dari FVG asal.
    for (const fvg of newlyMitigatedFVGs) {
      const newIfvg: IFVG = {
        ifvg_id: this.ifvgIdCounter++,
        source_fvg_id: fvg.fvg_id,
        type: fvg.type === 'bullish' ? 'bearish' : 'bullish',
        range_high: fvg.gap_high,
        range_low: fvg.gap_low,
        formed_at_candle_index: candleIndex,
        lifecycle_status: 'ACTIVE',
        used_at_candle_index: null,
      };
      this.states.push({ ifvg: newIfvg, bottomReached: false, topReached: false });
      changed.push(newIfvg);
    }

    return changed;
  }

  getIFVGs(): readonly IFVG[] {
    return this.states.map((s) => s.ifvg);
  }
}

/**
 * Mode batch — drive FVGEngine (Engine E) + IFVGEngine (Engine F) sekaligus
 * dari candle mentah, satu-satunya cara Engine F berdiri sendiri (dia
 * gak bisa jalan tanpa Engine E, sesuai dependency di spec). Pola sama
 * kayak Engine B: konsistensi terjamin by construction.
 */
export function detectIFVGs(candles: readonly Candle[]): IFVG[] {
  const fvgEngine = new FVGEngine();
  const ifvgEngine = new IFVGEngine();

  for (const candle of candles) {
    const fvgChanges = fvgEngine.ingestCandle(candle);
    const newlyMitigated = fvgChanges.filter((f) => f.mitigation_status === 'MITIGATED');
    ifvgEngine.ingestCandle(candle, newlyMitigated);
  }

  return [...ifvgEngine.getIFVGs()];
}
