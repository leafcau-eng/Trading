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
 * Output Rule #3 (Liquidity Sweep), per spec section "3. Liquidity Sweep".
 * `failure_reason` DITAMBAHIN di sini (bukan literal di Output block spec,
 * yang misahin "Output" dan "Failure reason" jadi dua block terpisah) --
 * satu shape gabungan ini yang dipakai implementasi, biar failure_reason
 * ke-carry di objek yang sama, bukan hilang.
 *
 * `swept_side` JUGA DITAMBAHIN (gak ada di literal Output spec) -- ketauan
 * pas bangun MSS (Rule #5), yang precondition-nya eksplisit butuh tau sisi
 * mana yang ke-sweep ("sweep terjadi pada sisi low" utk bullish MSS). Buat
 * target Engine B, sisi ini BISA diturunkan balik dari type milik point
 * yang direferensikan swept_structure_id -- tapi buat target
 * session_high_low, swept_structure_id null, gak ada jalan nurunin balik
 * tanpa consumer ikut nyimpen session_high/low sendiri (persis pelanggaran
 * "jangan hitung ulang fakta yang udah diketahui sumbernya"). Rule #3
 * SUDAH TAU sisi ini di titik dia bikin objeknya -- diekspos langsung.
 */
export interface LiquiditySweepResult {
  status: 'VALID' | 'INVALID' | 'UNKNOWN';
  swept_target_type: 'session_high_low' | 'external_structure' | 'internal_structure';
  swept_side: 'high' | 'low';
  swept_structure_id: number | null;
  swept_level_price: number;
  sweep_candle_index: number;
  failure_reason:
    | 'TARGET_SOURCE_UNAVAILABLE'
    | 'NO_ACTIVE_LEVEL'
    | 'NO_SWEEP'
    | 'NO_CLOSE_BACK'
    | 'OUTSIDE_SESSION'
    | null;
}

/**
 * Output Rule #5 (MSS - Market Structure Shift), per spec section "5. MSS".
 * `failure_reason` ditambahin (sama alasannya kayak LiquiditySweepResult).
 */
export interface MSSResult {
  status: 'VALID' | 'INVALID' | 'UNKNOWN';
  mss_direction: 'bullish' | 'bearish';
  broken_structure_id: number;
  mss_candle_index: number;
  failure_reason: 'SWEEP_NOT_VALID' | 'NO_SUBSEQUENT_INTERNAL_BREAK' | 'ENGINE_UNAVAILABLE' | null;
}

/**
 * Config Session Engine (Engine D). `session_windows` isinya kosong secara
 * default -- WAJIB diisi eksplisit oleh caller, sama seperti swing_fractal_n.
 * Asumsi implementasi (belum diverifikasi terhadap kasus overnight): window
 * dianggap TIDAK melewati tengah malam (start <= end dalam sehari). Window
 * yang overnight (mis. start="22:00", end="02:00") TIDAK didukung versi ini
 * -- lihat catatan di sessionEngine.ts.
 */
export interface SessionWindow {
  id: string;
  start: string; // "HH:MM", NY local
  end: string; // "HH:MM", NY local
  timezone: string; // harus "America/New_York" per spec (selalu lewat Time Engine)
  active: boolean;
}

/**
 * Output Session Engine (Engine D) — bagian Session High/Low saja.
 * `reference_levels` (termasuk midnight_open) BELUM diimplementasikan --
 * di luar scope Rule #3, yang cuma butuh session_high/session_low.
 */
export interface SessionHighLow {
  session_window_id: string;
  ny_date: string;
  session_high: number;
  session_low: number;
  status: 'IN_PROGRESS' | 'COMPLETE';
}

/**
 * Output Order Block Engine (Engine G), per spec section "Engine G".
 *
 * `lifecycle_status`/`mitigated_at_candle_index` sengaja tetap didefinisikan
 * FULL sesuai union yang tertulis di spec (bukan dipersempit ke cuma
 * 'UNSPECIFIED'/null) walau implementasi saat ini CUMA PERNAH ngisi
 * 'UNSPECIFIED'/null — biar begitu lifecycle (A/B/C) diputuskan, cukup isi
 * logikanya di ObEngine, TANPA perlu ubah kontrak tipe ini lagi.
 */
export interface OrderBlock {
  ob_id: number;
  source_structure_break_candle_index: number;
  type: 'bullish' | 'bearish';
  zone_high: number;
  zone_low: number;
  formed_at_candle_index: number;
  structure_scope_used: 'internal' | 'external';
  /** UNSPECIFIED sampai lifecycle (touch/full-fill/body-close) diputuskan
   *  pemilik spec — lihat TODO di orderBlockEngine.ts. */
  lifecycle_status: 'ACTIVE' | 'MITIGATED' | 'UNSPECIFIED';
  mitigated_at_candle_index: number | null;
}

/** Skip/failure sesuai spec Engine G. */
export interface OrderBlockSkip {
  status: 'SKIPPED';
  reason: 'NO_OPPOSITE_CANDLE' | 'NO_STRUCTURE_BREAK' | 'ENGINE_UNAVAILABLE';
  source_structure_break_candle_index: number;
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

/**
 * Output Rule #4 & #6 (BOS & CHOCH, unified), per spec section
 * "4 & 6. BOS & CHOCH". `failure_reason` digabung ke objek yang sama
 * (pola konsisten dengan LiquiditySweepResult/MSSResult).
 *
 * `TREND_BLOCKED` DITAMBAHIN di failure_reason -- BUKAN bagian literal
 * spec (spec cuma punya NO_PRIOR_TREND/NO_STRUCTURE_BREAK/
 * ENGINE_UNAVAILABLE). Dibutuhkan buat MEMBEDAKAN dua situasi yang beda
 * makna tapi sama-sama "trend ranging" kalau dibaca mentah: (a)
 * NO_PRIOR_TREND = trend ENGINE FUNGSIONAL, benar-benar menghitung
 * ranging -- ini gak pernah kejadian saat ini. (b) TREND_BLOCKED = trend
 * ENGINE gak fungsional (Engine B bagian e BLOCKED, literal_spec_value
 * SELALU 'ranging' terlepas dari kondisi market sesungguhnya). Tanpa
 * pembeda ini, membaca `literal_spec_value` langsung dan menganggapnya
 * NO_PRIOR_TREND adalah PERSIS fallback/asumsi yang dilarang eksplisit.
 */
export interface BOSCHOCHResult {
  status: 'VALID' | 'UNKNOWN';
  event_type: 'BOS' | 'CHOCH' | null;
  direction: 'bullish' | 'bearish' | null;
  source_structure_id: number;
  candle_index: number;
  failure_reason: 'NO_PRIOR_TREND' | 'NO_STRUCTURE_BREAK' | 'ENGINE_UNAVAILABLE' | 'TREND_BLOCKED' | null;
}
