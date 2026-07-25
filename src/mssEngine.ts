/**
 * Rule #5 — MSS (Market Structure Shift)
 * Spec: ict-rule-specification.md, section "5. MSS (Market Structure Shift)"
 * Status spec: FINAL secara algoritma. Dependencies: Liquidity Sweep
 * (Rule #3), Internal Structure Engine (Engine B, FINAL).
 *
 * MURNI konsumsi Engine B + Rule #3, gak ada logika struktur sendiri sesuai
 * literal spec. Precondition: liquidity_sweep.status == VALID. Sisi yang
 * ke-sweep (high/low) dibaca dari `swept_side` Rule #3 (lihat patch di
 * liquiditySweepEngine.ts) -- bukan dihitung ulang.
 *
 * Desain reaktif (sama pola dengan Engine E/F/G, Rule #3): sweep VALID jadi
 * "pending", dicek terhadap structure_break INTERNAL yang cocok tiap
 * candle berikutnya. Begitu ketemu -> MSS VALID, pending itu SELESAI
 * (one-shot per sweep). NO_SUBSEQUENT_INTERNAL_BREAK/SWEEP_NOT_VALID
 * direpresentasikan lewat TIDAK ADA output (silent), konsisten sama
 * Rule #3 -- bukan diemit eksplisit tiap candle yang gak ada progress.
 *
 * KEPUTUSAN DESAIN yang gak eksplisit di spec (ditandai, bukan
 * diasumsikan tersembunyi): kalau ADA LEBIH DARI SATU sweep VALID
 * ber-arah sama yang masih pending sekaligus, dan SATU structure_break
 * qualifying muncul, implementasi ini mengonfirmasi SEMUA pending yang
 * arahnya cocok (masing-masing "IF event tersebut ada" literally benar
 * buat masing-masing) -- BUKAN cuma yang paling baru. Spec gak nyebut
 * aturan "sweep baru menggantikan yang lama", jadi saya gak menciptakan
 * itu sendiri. Konsekuensinya: bisa keluar 2+ MSSResult identik (sama
 * broken_structure_id/mss_candle_index) kalau itu terjadi -- ini akurat
 * terhadap definisi literal, bukan bug.
 */

import type { LiquiditySweepResult, MSSResult, StructureBreakEvent } from './types';

interface PendingSweep {
  sweepCandleIndex: number;
  direction: 'bullish' | 'bearish';
}

export class MSSEngine {
  private pendingSweeps: PendingSweep[] = [];

  /**
   * Panggil per candle baru.
   * - `newValidSweeps`: LiquiditySweepResult yang BARU VALID di candle ini
   *   (dari nilai balik LiquiditySweepEngine.ingestCandle(), filter
   *   status==='VALID'). Kosongkan kalau gak ada.
   * - `structureBreaksThisCandle`: event structure_break TEPAT di candle
   *   ini (nilai balik InternalStructureEngine.ingestCandle()).
   */
  ingestCandle(newValidSweeps: readonly LiquiditySweepResult[], structureBreaksThisCandle: readonly StructureBreakEvent[]): MSSResult[] {
    const results: MSSResult[] = [];

    // 1. Cek pending sweep (dari SEBELUM candle ini) terhadap break candle
    //    ini DULU -- supaya sweep yang baru ditambahkan di langkah 2 gak
    //    langsung ke-confirm oleh break di candle yang sama (pola sama
    //    dengan Rule #3/Engine E/F/G: cek dulu, baru tambah).
    const stillPending: PendingSweep[] = [];
    for (const pending of this.pendingSweeps) {
      const requiredType = pending.direction === 'bullish' ? 'high' : 'low';
      const matchingBreak = structureBreaksThisCandle.find(
        (b) => b.classification === 'INTERNAL' && b.type === requiredType
      );
      if (matchingBreak) {
        results.push({
          status: 'VALID',
          mss_direction: pending.direction,
          broken_structure_id: matchingBreak.structure_id,
          mss_candle_index: matchingBreak.candle_index,
          failure_reason: null,
        });
      } else {
        stillPending.push(pending);
      }
    }
    this.pendingSweeps = stillPending;

    // 2. Tambah sweep VALID baru dari candle ini ke pending -- baru mulai
    //    dicek MULAI candle berikutnya, bukan candle ini (lihat penjelasan
    //    di atas soal urutan).
    for (const sweep of newValidSweeps) {
      if (sweep.status !== 'VALID') continue;
      // sweep sisi low -> MSS bullish (cari internal HIGH break berikutnya).
      // sweep sisi high -> MSS bearish (cari internal LOW break berikutnya).
      const direction: 'bullish' | 'bearish' = sweep.swept_side === 'low' ? 'bullish' : 'bearish';
      this.pendingSweeps.push({ sweepCandleIndex: sweep.sweep_candle_index, direction });
    }

    return results;
  }

  /** Buat debug/observability -- jumlah sweep yang masih nunggu konfirmasi. */
  getPendingCount(): number {
    return this.pendingSweeps.length;
  }
}
