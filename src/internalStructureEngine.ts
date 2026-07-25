/**
 * Engine B — Internal Structure Engine
 * Spec: ict-rule-specification.md, section "Engine B. Internal Structure Engine"
 * Status: FINAL menurut spec untuk bagian (a)-(d). Bagian (e) Trend: BLOCKED
 * v0.3.2 — lihat "Specification Conflict: Trend" di ict-rule-specification.md.
 * Dependencies: Swing Detection Engine (Engine A).
 *
 * TREND BLOCKED (keputusan eksplisit pemilik spec, bukan diperbaiki diam-diam
 * oleh Claude): classification (bagian c) terbukti membuat CEL monoton tidak
 * naik dan CEH monoton tidak turun (induction — lihat proof lengkap di
 * Specification Conflict). Akibatnya swing low yang EXTERNAL PASTI berlabel
 * LL (gak pernah HL), swing high yang EXTERNAL PASTI HH (gak pernah LH).
 * Trend rule (e) minta "external low=HL" buat bullish dan "external high=LH"
 * buat bearish — dua kondisi yang barusan dibuktikan mustahil. Trend literal
 * sesuai (c)+(e) SELALU 'ranging', dikonfirmasi empiris (1.400 candle, 3
 * random walk independen, lihat test).
 *
 * Komputasi literal (c)+(e) TETAP dijalankan di bawah (buat referensi/debug),
 * tapi getTrendState() mengembalikan status BLOCKED secara eksplisit — bukan
 * 'ranging' polos yang bisa dikira nilai valid. Pemilik spec secara eksplisit
 * menolak penerapan hipotesis perbaikan (pakai last high/low apapun
 * classification-nya) sampai section (e) direvisi resmi di dokumen.
 */

import type {
  Candle,
  StructuralPoint,
  StructureBreakEvent,
  SwingPoint,
  Trend,
  TrendState,
} from './types';

const TREND_BLOCKED_REASON =
  'Spec section (e) kontradiktif dengan section (c) -- lihat "Specification ' +
  'Conflict: Trend" di ict-rule-specification.md. Trend TIDAK BOLEH ' +
  'dikonsumsi sampai spec direvisi oleh pemilik spec.';

export class InternalStructureEngine {
  private candleCount = 0;
  private structureIdCounter = 0;
  private readonly points: StructuralPoint[] = [];
  private readonly breakEvents: StructureBreakEvent[] = [];

  private lastHighPoint: StructuralPoint | null = null;
  private lastLowPoint: StructuralPoint | null = null;
  private currentExternalHigh: number | null = null; // CEH
  private currentExternalLow: number | null = null; // CEL
  private lastExternalHighPoint: StructuralPoint | null = null;
  private lastExternalLowPoint: StructuralPoint | null = null;
  private currentTrend: Trend = 'ranging';

  /**
   * Panggil per candle baru, SEBELUM addSwingPoint() buat titik yang baru
   * confirmed di candle yang sama — urutan ini yang bikin titik yang baru
   * confirmed gak ke-cek break oleh candle konfirmasinya sendiri (gak perlu
   * tracking confirmed_at_index terpisah, cukup dari urutan panggilan).
   *
   * Break: body CLOSE nembus level, wick doang gak cukup (sesuai spec,
   * konsisten sama Liquidity Sweep). One-directional — titik yang udah
   * BROKEN di-skip, gak pernah balik ACTIVE.
   */
  ingestCandle(candle: Candle): StructureBreakEvent[] {
    const candleIndex = this.candleCount++;
    const newBreaks: StructureBreakEvent[] = [];

    for (const point of this.points) {
      if (point.broken_status === 'BROKEN') continue;

      const brokeThrough =
        (point.type === 'high' && candle.close > point.price) ||
        (point.type === 'low' && candle.close < point.price);

      if (brokeThrough) {
        point.broken_status = 'BROKEN';
        point.broken_at_candle_index = candleIndex;
        const event: StructureBreakEvent = {
          structure_id: point.structure_id,
          type: point.type,
          classification: point.classification,
          candle_index: candleIndex,
          prior_trend: this.getTrendState(),
        };
        this.breakEvents.push(event);
        newBreaks.push(event);
      }
    }

    return newBreaks;
  }

  /** Panggil buat tiap SwingPoint yang baru CONFIRMED Engine A di candle
   *  yang barusan di-ingest lewat ingestCandle(). */
  addSwingPoint(swingPoint: SwingPoint): StructuralPoint {
    let label: StructuralPoint['label'];
    let classification: StructuralPoint['classification'];

    if (swingPoint.type === 'high') {
      if (this.lastHighPoint === null) {
        label = 'UNLABELED';
      } else if (swingPoint.price > this.lastHighPoint.price) {
        label = 'HH';
      } else {
        // Spec cuma bilang "lebih tinggi"/"lebih rendah", gak eksplisit
        // soal tie (harga sama persis). Saya treat tie sebagai LH
        // (bukan higher-high baru) — konsisten sama strict > yang
        // dipakai di semua perbandingan lain di spec ini. [Menebak]
        label = 'LH';
      }

      if (this.currentExternalHigh === null || swingPoint.price > this.currentExternalHigh) {
        classification = 'EXTERNAL';
        this.currentExternalHigh = swingPoint.price;
      } else {
        classification = 'INTERNAL'; // termasuk tie — spec eksplisit pakai "≤"
      }
    } else {
      if (this.lastLowPoint === null) {
        label = 'UNLABELED';
      } else if (swingPoint.price < this.lastLowPoint.price) {
        label = 'LL';
      } else {
        label = 'HL'; // [Menebak] tie -> HL, simetris sama kasus high di atas
      }

      if (this.currentExternalLow === null || swingPoint.price < this.currentExternalLow) {
        classification = 'EXTERNAL';
        this.currentExternalLow = swingPoint.price;
      } else {
        classification = 'INTERNAL';
      }
    }

    const point: StructuralPoint = {
      structure_id: this.structureIdCounter++,
      type: swingPoint.type,
      price: swingPoint.price,
      candle_index: swingPoint.candle_index,
      label,
      classification,
      significance: 'UNSPECIFIED', // algoritma UNSPECIFIED di spec — gak ada logika buat diimplementasi
      broken_status: 'ACTIVE',
      broken_at_candle_index: null,
    };

    this.points.push(point);

    if (swingPoint.type === 'high') this.lastHighPoint = point;
    else this.lastLowPoint = point;

    // Trend cuma dipengaruhi titik EXTERNAL (bagian e spec eksplisit
    // nyebut "external swing high/low terakhir") — lihat peringatan
    // di atas file soal kenapa ini gak akan pernah keluar dari ranging.
    if (classification === 'EXTERNAL') {
      if (swingPoint.type === 'high') this.lastExternalHighPoint = point;
      else this.lastExternalLowPoint = point;
      this.recomputeTrend();
    }

    return point;
  }

  private recomputeTrend(): void {
    if (this.lastExternalHighPoint === null || this.lastExternalLowPoint === null) {
      this.currentTrend = 'ranging';
      return;
    }
    const highLabel = this.lastExternalHighPoint.label;
    const lowLabel = this.lastExternalLowPoint.label;
    if (highLabel === 'HH' && lowLabel === 'HL') {
      this.currentTrend = 'bullish';
    } else if (highLabel === 'LH' && lowLabel === 'LL') {
      this.currentTrend = 'bearish';
    } else {
      this.currentTrend = 'ranging';
    }
  }

  getPoints(): readonly StructuralPoint[] {
    return this.points;
  }

  getBreakEvents(): readonly StructureBreakEvent[] {
    return this.breakEvents;
  }

  /**
   * v0.3.2 — BLOCKED. Lihat komentar file-level dan "Specification
   * Conflict: Trend" di ict-rule-specification.md. `literal_spec_value`
   * SELALU 'ranging' (dibuktikan matematis + empiris) -- disediakan buat
   * referensi/debug, BUKAN buat dipakai sebagai trend yang valid.
   */
  getTrendState(): TrendState {
    return {
      status: 'BLOCKED',
      reason: TREND_BLOCKED_REASON,
      literal_spec_value: this.currentTrend,
    };
  }
}

export interface InternalStructureResult {
  points: StructuralPoint[];
  breakEvents: StructureBreakEvent[];
}

/**
 * Mode batch — secara harfiah cuma drive InternalStructureEngine yang sama
 * dari awal sampai selesai dalam satu panggilan. Sengaja gak ditulis
 * sebagai algoritma terpisah (beda dari Engine A yang punya 2 jalur kode
 * berbeda tapi terverifikasi identik) — di sini batch DAN incremental
 * literally satu jalur kode yang sama, jadi konsistensi terjamin by
 * construction, bukan cuma by testing.
 */
export function buildInternalStructure(
  candles: readonly Candle[],
  swingPoints: readonly SwingPoint[]
): InternalStructureResult {
  const engine = new InternalStructureEngine();

  const swingsByConfirmedIndex = new Map<number, SwingPoint[]>();
  for (const sp of swingPoints) {
    const arr = swingsByConfirmedIndex.get(sp.confirmed_at_index) ?? [];
    arr.push(sp);
    swingsByConfirmedIndex.set(sp.confirmed_at_index, arr);
  }

  for (let i = 0; i < candles.length; i++) {
    engine.ingestCandle(candles[i]);
    const due = swingsByConfirmedIndex.get(i) ?? [];
    for (const sp of due) {
      engine.addSwingPoint(sp);
    }
  }

  return {
    points: [...engine.getPoints()],
    breakEvents: [...engine.getBreakEvents()],
  };
}
