/**
 * Tipe bersama yang dipakai lintas engine — satu definisi, dipakai berulang.
 * Konsisten sama prinsip spec: primitif menghasilkan fakta objektif,
 * bentuknya harus sama persis buat semua consumer.
 */

/**
 * OHLC candle mentah dari data feed. `timestamp` diasumsikan sudah dalam
 * format yang diterima Engine C (ISO8601 dengan timezone eksplisit).
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
 */
export interface SwingPoint {
  type: 'high' | 'low';
  price: number;
  candle_index: number;
  timestamp: string;
  status: 'CONFIRMED';
  confirmed_at_index: number;
}

export type Trend = 'bullish' | 'bearish' | 'ranging';

/**
 * v0.3.2 — Trend (spec Engine B bagian e) BLOCKED atas keputusan eksplisit
 * pemilik spec (lihat "Specification Conflict: Trend" di
 * ict-rule-specification.md). Wrapper ini WAJIB dipakai di manapun trend
 * terekspos publik — literal_spec_value SELALU 'ranging' (dibuktikan
 * matematis + diverifikasi empiris), disediakan buat referensi/debug,
 * BUKAN buat dikonsumsi seolah itu trend yang valid.
 */
export interface TrendState {
  status: 'BLOCKED';
  reason: string;
  literal_spec_value: Trend;
}

/**
 * Output Internal Structure Engine (Engine B), per spec section "Engine B".
 */
export interface StructuralPoint {
  structure_id: number;
  type: 'high' | 'low';
  price: number;
  candle_index: number;
  label: 'HH' | 'HL' | 'LH' | 'LL' | 'UNLABELED';
  classification: 'EXTERNAL' | 'INTERNAL';
  significance: 'MAJOR' | 'MINOR' | 'UNSPECIFIED';
  broken_status: 'ACTIVE' | 'BROKEN';
  broken_at_candle_index: number | null;
}

/**
 * Output FVG Detection Engine (Engine E), per spec section "Engine E".
 */
export interface FVG {
  fvg_id: number;
  type: 'bullish' | 'bearish';
  gap_high: number;
  gap_low: number;
  formed_at_candle_index: number;
  mitigation_status: 'ACTIVE' | 'MITIGATED';
  mitigated_at_candle_index: number | null;
}

/**
 * Output IFVG Engine (Engine F), per spec section "Engine F". Transformasi
 * state dari FVG yang sudah MITIGATED -- bukan pattern baru dari candle.
 */
export interface IFVG {
  ifvg_id: number;
  source_fvg_id: number;
  type: 'bullish' | 'bearish';
  range_high: number;
  range_low: number;
  formed_at_candle_index: number;
  lifecycle_status: 'ACTIVE' | 'USED';
  used_at_candle_index: number | null;
}

/**
 * BUKAN field yang eksplisit disebut spec Engine B sebagai output terpisah —
 * spec cuma nyebut field state per titik (broken_status/broken_at_candle_index).
 * Saya tambahin event stream ini karena BOS, CHOCH, MSS, DAN Order Block
 * (4 rule berbeda) semua mendeskripsikan "ambil event structure_break dari
 * Internal Structure Engine" seolah itu satu stream queryable, bukan hasil
 * scan manual ke seluruh point list tiap butuh.
 */
export interface StructureBreakEvent {
  structure_id: number;
  type: 'high' | 'low';
  classification: 'EXTERNAL' | 'INTERNAL';
  candle_index: number;
  /** v0.3.2: TrendState (BLOCKED), bukan Trend telanjang — lihat catatan di atas. */
  prior_trend: TrendState;
}
