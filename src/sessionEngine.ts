/**
 * Engine D — Session Engine (SEBAGIAN — cuma Session High/Low)
 * Spec: ict-rule-specification.md, section "Engine D. Session Engine"
 * Status spec: HAMPIR FINAL — mekanisme window & Session High/Low FINAL.
 * Dependencies: Time Engine (Engine C, FINAL).
 *
 * DIIMPLEMENTASI: window membership check, Session High/Low tracking
 * (IN_PROGRESS -> COMPLETE), lookup occurrence COMPLETE terakhir per window.
 *
 * SENGAJA BELUM DIIMPLEMENTASI (di luar scope Rule #3 saat ini, bukan
 * diasumsikan kosong):
 * - `reference_levels` (termasuk `midnight_open`, yang sebenarnya FINAL di
 *   spec dan dipakai strategi) -- Rule #3 (Liquidity Sweep) cuma butuh
 *   Session High/Low, gak butuh reference level, jadi ditunda sampai ada
 *   consumer yang benar-benar butuh.
 * - `window_buffer_before`/`window_buffer_after` -- eksplisit UNSPECIFIED
 *   di spec sendiri (nunggu bukti backtest).
 *
 * `session_windows` (isi asli: nama + jam per window) TETAP KOSONG/WAJIB
 * diisi caller -- ini bukan keputusan strategi, cuma mekanisme generik.
 *
 * KETERBATASAN implementasi (bukan bug, belum diuji/didukung): window yang
 * overnight (start > end, mis. 22:00-02:00) TIDAK ditangani benar -- kode
 * ini asumsikan window selalu dalam satu hari kalender NY yang sama.
 */

import type { Candle, SessionHighLow, SessionWindow } from './types';
import { resolveNYTime, isTimeEngineFailure } from './timeEngine';

interface WindowDayState {
  high: number;
  low: number;
  status: 'IN_PROGRESS' | 'COMPLETE';
}

function timeOfDay(nyTime: string): string {
  // ny_time format: "YYYY-MM-DDTHH:mm:ss" -> ambil "HH:MM"
  return nyTime.slice(11, 16);
}

function isWithinWindow(nyTime: string, window: SessionWindow): boolean {
  const t = timeOfDay(nyTime);
  // Asumsi: window dalam satu hari (start <= end). Lihat catatan file-level
  // soal overnight window yang gak didukung.
  return t >= window.start && t <= window.end;
}

function isPastWindowEnd(nyTime: string, window: SessionWindow): boolean {
  return timeOfDay(nyTime) > window.end;
}

export class SessionEngine {
  private readonly windows: readonly SessionWindow[];
  private readonly dayState = new Map<string, WindowDayState>(); // key: `${windowId}|${ny_date}`
  private readonly latestComplete = new Map<string, { ny_date: string; high: number; low: number }>(); // windowId -> occurrence COMPLETE terbaru

  constructor(windows: readonly SessionWindow[]) {
    this.windows = windows;
  }

  /** Panggil per candle baru. Return SessionHighLow yang berubah (diupdate
   *  atau baru jadi COMPLETE) di panggilan ini -- bisa kosong. */
  ingestCandle(candle: Candle): SessionHighLow[] {
    const timeResult = resolveNYTime(candle.timestamp);
    if (isTimeEngineFailure(timeResult)) return []; // timestamp invalid -- gak bisa dievaluasi, bukan dianggap masuk window manapun

    const changed: SessionHighLow[] = [];

    for (const window of this.windows) {
      if (!window.active) continue;
      const key = `${window.id}|${timeResult.ny_date}`;
      const existing = this.dayState.get(key);

      if (isWithinWindow(timeResult.ny_time, window)) {
        const next: WindowDayState = existing
          ? { high: Math.max(existing.high, candle.high), low: Math.min(existing.low, candle.low), status: 'IN_PROGRESS' }
          : { high: candle.high, low: candle.low, status: 'IN_PROGRESS' };
        this.dayState.set(key, next);
        changed.push({
          session_window_id: window.id,
          ny_date: timeResult.ny_date,
          session_high: next.high,
          session_low: next.low,
          status: next.status,
        });
      } else if (existing && existing.status === 'IN_PROGRESS' && isPastWindowEnd(timeResult.ny_time, window)) {
        existing.status = 'COMPLETE';
        this.dayState.set(key, existing);
        this.latestComplete.set(window.id, { ny_date: timeResult.ny_date, high: existing.high, low: existing.low });
        changed.push({
          session_window_id: window.id,
          ny_date: timeResult.ny_date,
          session_high: existing.high,
          session_low: existing.low,
          status: 'COMPLETE',
        });
      }
    }

    return changed;
  }

  /**
   * session_high/session_low dari occurrence ter-COMPLETE TERAKHIR buat
   * window tertentu -- sesuai "Catatan untuk Rule #3" di spec Engine D.
   * null kalau belum pernah ada occurrence yang COMPLETE sama sekali.
   */
  getLastCompleteOccurrence(windowId: string): { high: number; low: number } | null {
    const entry = this.latestComplete.get(windowId);
    return entry ? { high: entry.high, low: entry.low } : null;
  }
}
