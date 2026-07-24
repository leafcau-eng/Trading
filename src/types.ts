/**
 * Tipe bersama yang dipakai lintas engine — satu definisi, dipakai berulang.
 * Konsisten sama prinsip spec: primitif menghasilkan fakta objektif,
 * bentuknya harus sama persis buat semua consumer.
 */

/**
 * OHLC candle mentah dari data feed. `timestamp` diasumsikan sudah dalam
 * format yang diterima Engine C (ISO8601 dengan timezone eksplisit) —
 * validasi timestamp itu sendiri bukan tanggung jawab Swing Detection
 * Engine atau engine primitif lain, itu domain Engine C / data feed layer.
 */
export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Output Swing Detection Engine (Engine A), per spec section "Engine A".
 * Immutable begitu CONFIRMED — engine gak pernah revisi titik yang udah
 * masuk list.
 */
export interface SwingPoint {
  type: 'high' | 'low';
  price: number;
  candle_index: number;
  timestamp: string;
  status: 'CONFIRMED';
  /** = candle_index + N — index candle yang bikin titik ini confirmed. */
  confirmed_at_index: number;
}
