/**
 * Engine A — Swing Detection Engine
 * Spec: ict-rule-specification.md, section "Engine A. Swing Detection Engine"
 * Status: ALGORITHM FINAL (Fractal N-bar). Dependencies: tidak ada — base
 * primitive, cuma butuh OHLC candle series mentah.
 *
 * Titik balik harga lokal pada rangkaian candle. Primitif paling dasar yang
 * dikonsumsi semua rule struktural (Internal Structure, BOS, MSS, CHOCH,
 * Liquidity Sweep, Order Block). Generator data (list titik) — BUKAN gate
 * kayak Rule, jadi gak ada status VALID/INVALID/UNKNOWN di sini.
 *
 * `swing_fractal_n`: WAJIB config-driven, gak boleh hardcoded jadi default
 * di dalam engine — spec eksplisit bilang nilainya belum diputuskan
 * (nunggu kalibrasi vs backtest). Karena itu setiap fungsi publik di sini
 * MEWAJIBKAN parameter N, gak ada default value di signature manapun.
 */

import type { Candle, SwingPoint } from './types';

export interface SwingDetectionResult {
  /** Versioning parameter — spec eksplisit minta ini dicatat per hasil,
   *  biar pas kalibrasi beberapa nilai N gak ketuker. */
  swing_fractal_n: number;
  points: SwingPoint[];
}

function validateSwingFractalN(n: number): void {
  if (!Number.isInteger(n) || n < 1) {
    throw new TypeError(
      `swing_fractal_n harus integer positif — dapet ${n}. ` +
        'Ini config-driven per spec (bukan konstanta di engine), jadi ' +
        'caller wajib nentuin eksplisit, gak ada default di sini.'
    );
  }
}

/**
 * Core definition (FINAL): cek satu candidate index terhadap window N-kiri
 * dan N-kanan. Dipakai bareng oleh mode batch (detectSwings) dan mode
 * incremental (SwingDetectionEngine.ingest) — satu algoritma, satu sumber
 * kebenaran, sesuai prinsip spec.
 *
 * Precondition (dijamin caller): candidateIndex - n >= 0 dan
 * candidateIndex + n <= candles.length - 1 (window kiri-kanan lengkap).
 *
 * Perbandingan pakai strict > / < (bukan >=/<=) sesuai kata spec "lebih
 * tinggi"/"lebih rendah" — konsekuensinya: equal-high/low yang bersaing di
 * window yang sama gagal dua-duanya, dan itu memang bukan tanggung jawab
 * engine ini buat di-dedupe (spec: itu domain Equal High/Low Rule
 * terpisah).
 */
function evaluateCandidate(
  candles: readonly Candle[],
  candidateIndex: number,
  n: number
): SwingPoint[] {
  const candidate = candles[candidateIndex];
  let isSwingHigh = true;
  let isSwingLow = true;

  for (let offset = 1; offset <= n; offset++) {
    const left = candles[candidateIndex - offset];
    const right = candles[candidateIndex + offset];

    if (isSwingHigh && !(candidate.high > left.high && candidate.high > right.high)) {
      isSwingHigh = false;
    }
    if (isSwingLow && !(candidate.low < left.low && candidate.low < right.low)) {
      isSwingLow = false;
    }
    if (!isSwingHigh && !isSwingLow) break;
  }

  // Catatan: swing high dan swing low dievaluasi independen (satu axis
  // harga tinggi, satu axis harga rendah) — candle outside/engulfing yang
  // sekaligus jadi titik tertinggi DAN terendah di window-nya sah dapat
  // dua-duanya, bukan saling eksklusif.
  const results: SwingPoint[] = [];
  if (isSwingHigh) {
    results.push({
      type: 'high',
      price: candidate.high,
      candle_index: candidateIndex,
      timestamp: candidate.timestamp,
      status: 'CONFIRMED',
      confirmed_at_index: candidateIndex + n,
    });
  }
  if (isSwingLow) {
    results.push({
      type: 'low',
      price: candidate.low,
      candle_index: candidateIndex,
      timestamp: candidate.timestamp,
      status: 'CONFIRMED',
      confirmed_at_index: candidateIndex + n,
    });
  }
  return results;
}

/**
 * Mode batch — buat backtest/historical, dikasih seluruh candle series
 * sekaligus. Edge case sesuai spec: data < 2N+1 candle → list kosong,
 * BUKAN error.
 */
export function detectSwings(
  candles: readonly Candle[],
  swingFractalN: number
): SwingDetectionResult {
  validateSwingFractalN(swingFractalN);

  if (candles.length < 2 * swingFractalN + 1) {
    return { swing_fractal_n: swingFractalN, points: [] };
  }

  const points: SwingPoint[] = [];
  for (let i = swingFractalN; i <= candles.length - 1 - swingFractalN; i++) {
    points.push(...evaluateCandidate(candles, i, swingFractalN));
  }

  return { swing_fractal_n: swingFractalN, points };
}

/**
 * Mode incremental — buat live/streaming, per spec "Update mechanism
 * (incremental, per candle baru masuk)". Nyimpen state (candle history +
 * swing list) di instance, karena itu jalan sebagai proses persistent
 * (pm2 worker), bukan serverless function stateless.
 *
 * Catatan skala: instance ini nyimpen SELURUH history candle selama hidup
 * proses (dibutuhin karena candle_index harus tetap bisa dirujuk balik).
 * Buat stream yang jalan berbulan-bulan tanpa restart, ini pelan-pelan
 * makan memori — kalau itu jadi masalah nyata, perlu strategi eviction/
 * paging yang TIDAK dibahas spec saat ini, jadi sengaja belum diimplementasi
 * di sini.
 */
export class SwingDetectionEngine {
  private readonly n: number;
  private readonly candles: Candle[] = [];
  private readonly confirmed: SwingPoint[] = [];

  constructor(swingFractalN: number) {
    validateSwingFractalN(swingFractalN);
    this.n = swingFractalN;
  }

  /**
   * Masukin satu candle baru. Return swing point yang BARU jadi CONFIRMED
   * di panggilan ini (0, 1, atau 2 titik — lihat catatan evaluateCandidate
   * soal outside candle). List kosong kalau belum cukup candle kanan buat
   * konfirmasi candidate manapun.
   */
  ingest(candle: Candle): SwingPoint[] {
    this.candles.push(candle);
    const currentIndex = this.candles.length - 1;
    const candidateIndex = currentIndex - this.n;

    if (candidateIndex < this.n) {
      return [];
    }

    const newlyConfirmed = evaluateCandidate(this.candles, candidateIndex, this.n);
    this.confirmed.push(...newlyConfirmed);
    return newlyConfirmed;
  }

  getSwingFractalN(): number {
    return this.n;
  }

  /** Snapshot append-only dari semua swing point yang udah CONFIRMED sejauh ini. */
  getConfirmedPoints(): readonly SwingPoint[] {
    return this.confirmed;
  }
}
