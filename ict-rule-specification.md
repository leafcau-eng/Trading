# ICT Rule Specification — Silver Bullet Strategy
**Status: v0.3.1 — Roadmap direstrukturisasi. Rule #1 & #2 DOWNGRADE ke BLOCKED (bergantung engine yang belum ada) — histori v0.3, dipertahankan. KOREKSI v0.3.1: Rule #1 (Session Engine) & #2 (Swing Detection Engine) TIDAK lagi BLOCKED — keduanya sudah FINAL/ALMOST FINAL sebagai Engine D & Engine A (lihat section masing-masing). BOS/CHOCH juga dikonsolidasi jadi satu section unified di v0.3.1; dua section standalone versi lama dihapus (jejaknya ditinggal sebagai catatan di lokasi asal). KOREKSI v0.3.2: Engine B section (e) [Trend] terbukti kontradiktif secara matematis dengan section (c) — lihat section "Specification Conflict: Trend" (setelah Engine B). BLOCKED sampai direvisi; BOS/CHOCH ikut terdampak (lihat section yang sama). KOREKSI v0.3.3: audit arsitektur menyeluruh (dependency graph acyclic, no duplicate logic, output consistency) setelah Rule #3/#5/#4&6 selesai diimplementasi — 1 duplikasi kode ditemukan & diperbaiki (`breakDirectionOf` dipindah ke Engine B, dipakai bersama Order Block & BOS/CHOCH), 2 gap dokumentasi ditutup (`swept_side` di Rule #3, `TREND_BLOCKED` di BOS/CHOCH — lihat masing-masing section). Tidak ada kontradiksi baru, tidak ada circular dependency. KOREKSI v0.3.4: Engine G lifecycle diputuskan — B. Full Fill (dari 3 kandidat Touch/Full Fill/Body Close), reuse primitive full-fill yang sama dengan Engine E/F. Engine G sekarang FINAL sepenuhnya (identifikasi zona + lifecycle). Item #9 di roadmap diperbarui dari UNSPECIFIED. KOREKSI v0.3.5: prinsip "Primitive→Composite" diganti "Engine→Rule→Decision Layer" — klarifikasi eksplisit bahwa dependency antar-Rule DIPERBOLEHKAN (MSS mengonsumsi Rule #3 tetap sah), prinsip intinya single source of truth (jangan hitung ulang), bukan larangan Rule-mengonsumsi-Rule. Lihat "Prinsip kerja". KOREKSI v0.3.6: riset variasi definisi komunitas untuk DRT & PD Array ditambahkan sebagai lampiran referensi (lihat akhir dokumen) -- BUKAN definisi operasional, DRT dan PD Array TETAP UNSPECIFIED. KOREKSI v0.3.7: hasil dialog Q0-Q13 soal klasifikasi & arsitektur DRT dikunci (lihat section "DRT: Keputusan Arsitektur" sebelum Lampiran) -- Core Definition completion (Q13) MASIH menunggu analisis chart pemilik spec, BELUM final.**

Dokumen ini adalah single source of truth untuk implementasi bot decision-support Silver Bullet.

## Prinsip kerja
- **Engine → Rule → Decision Layer (v0.3.5 — menggantikan formulasi "Primitive→Composite" yang lama, yang ambigu soal dependency antar-Rule).** Engine menghasilkan fakta objektif yang deterministik (swing, structure_break, session level, FVG, Order Block, dll) — tidak mengambil keputusan trading. Rule mengevaluasi fakta yang berasal dari Engine DAN/ATAU Rule sebelumnya untuk menghasilkan keputusan (`VALID`/`INVALID`/`UNKNOWN`) — dependency antar-Rule DIPERBOLEHKAN (mis. MSS mengonsumsi status Liquidity Sweep), SELAMA Rule berikutnya cuma membaca status/metadata yang sudah established, TANPA menghitung ulang logika yang menghasilkannya. Decision Layer (Entry Validation, Risk Rules, Exit Rules) mengambil keputusan trading berdasarkan output Rule dan/atau Engine sesuai strategi Silver Bullet. **Prinsip inti yang berlaku di SEMUA layer, bukan cuma antar dua layer tertentu: single source of truth.** Kalau data yang dibutuhkan belum ada atau salah, yang diperbaiki adalah SUMBERNYA (Engine atau Rule yang pertama kali menghasilkan fakta itu) — bukan menambah logika duplikat di layer manapun di atasnya. Berlaku untuk seluruh dokumen.
- **Core definition** vs **Quality filter**: core = kondisi struktural minimum, deterministik. Quality filter = parameter tambahan (retrace %, candle count, dll), status `UNSPECIFIED` sampai ada dasar backtest.
- **Status rule**: setiap rule punya tiga kemungkinan hasil evaluasi:
  - `VALID` — kondisi terpenuhi
  - `INVALID` — kondisi dievaluasi dan tidak terpenuhi
  - `UNKNOWN` — tidak bisa dievaluasi (data kurang, dependency belum ready, di luar cakupan definisi)
- **Failure reason**: setiap `INVALID`/`UNKNOWN` wajib punya kode alasan (enum), bukan cuma boolean false — dipakai untuk debugging dan alasan alert.
- **Dependencies**: setiap rule/engine mendeklarasikan modul apa yang harus sudah tersedia sebelum ia bisa dievaluasi.
- Konsep yang belum punya definisi operasional dari Anda (bukan definisi umum komunitas ICT) ditandai `UNSPECIFIED` secara eksplisit dan tidak diimplementasikan.

## Roadmap (urutan dependency, bukan urutan prioritas fitur)
0. Time Engine (termasuk penanganan DST — lihat catatan risiko di bawah)
1. Session Engine (Silver Bullet Window, Kill Zone, dll — bergantung Time Engine)
2. Swing Detection Engine
2.5. Internal Structure Engine (Internal/External High-Low, Major/Minor Swing — bergantung Swing Detection Engine)
3. Liquidity Sweep
4. BOS
5. MSS
6. CHOCH
7. FVG
8. IFVG
9. Order Block
10. DRT — UNSPECIFIED, menunggu definisi operasional Anda
11. PD Array — UNSPECIFIED, menunggu definisi kategori mana yang Anda anggap valid
12. Entry Validation
13. Risk Rules
14. Exit Rules
15. Journal Rules

**Catatan risiko Time Engine [Pasti]:** Silver Bullet Window didefinisikan dalam jam New York lokal (misal 10:00–11:00 NY), tapi NY berpindah DST dua kali setahun (Maret & November) sementara WIB tidak. Kalau Time Engine hardcode offset jam tanpa update otomatis mengikuti kalender DST NY, window alert akan meleset 1 jam selama beberapa minggu setiap tahun — bug klasik di bot trading yang baru ketahuan saat sudah salah alert. Harus pakai timezone-aware library (misal `America/New_York` di IANA tz database), bukan offset fixed.

---

## Status Rule Template
Setiap rule di bawah mengikuti format ini:

```
### Definisi konseptual
### Dependencies
### Input data
### Preconditions
### Core definition (langkah evaluasi deterministik)
### Output (status: VALID | INVALID | UNKNOWN, + field lain)
### Failure reason (enum)
### Quality filter (UNSPECIFIED — opsional, pasca-backtest)
```

---

## 0-2.5. Time Engine / Session Engine / Swing Detection Engine / Internal Structure Engine
**Status: SUPERSEDED (v0.3.1) — lihat Engine A/B/C/D di bawah, semua sudah FINAL atau ALMOST FINAL.**
Section ini historis — ditulis waktu Time/Session/Swing/Internal Structure Engine ("Rule #1 dan #2" di angka roadmap lama = Session Engine & Swing Detection Engine) belum punya spec. Dipertahankan sebagai jejak versi awal, bukan status yang berlaku. Tiga poin di bawah yang tadinya "belum ada definisi operasional" sudah terjawab: Swing Detection = Engine A (Fractal N-bar, FINAL), Internal Structure = Engine B (FINAL), Session Engine/DST = Engine C+D (FINAL/ALMOST FINAL).
- ~~Bagaimana Swing Detection Engine menentukan swing high/low valid~~ → Engine A
- ~~Bagaimana Internal Structure Engine membedakan Internal High/Low vs External High/Low vs Major/Minor Swing~~ → Engine B
- ~~Bagaimana Session Engine menghitung Silver Bullet Window dengan DST-aware time handling~~ → Engine C + D

Rule yang bergantung pada keempat engine ini TIDAK lagi otomatis BLOCKED oleh section ini — status masing-masing rule mengikuti dependency yang tertulis di section rule itu sendiri.

---

## 3. Liquidity Sweep
**Status: PARTIALLY BLOCKED — generic sweep evaluation FINAL. Default config (`session_high_low`) menunggu `session_windows` diisi. Target alternatif (`external_structure`/`internal_structure`) sudah bisa jalan sekarang karena Internal Structure Engine FINAL.**

**Definisi konseptual:**
Harga menembus (wick) level target tertentu, lalu body candle close kembali ke sisi dalam range — tanpa memicu break sungguhan di level tersebut.

**Dependencies:**
- Session Engine (mekanisme HAMPIR FINAL, tapi isi `session_windows` UNSPECIFIED — dibutuhkan untuk target `session_high_low`)
- Internal Structure Engine (FINAL — untuk target `external_structure`/`internal_structure`)

**Config (bukan hardcoded):**
- `sweep_target: "session_high_low" | "external_structure" | "internal_structure"` — default untuk strategi Silver Bullet: **`session_high_low`**.
- `sweep_target_session_window: <id dari session_windows>` — hanya relevan kalau `sweep_target = session_high_low`. Menunjuk ke window mana (Asia/London/NY/dll) yang high-low-nya jadi target sweep. UNSPECIFIED — menunggu Anda pilih setelah `session_windows` diisi.

**Core definition (generic sweep evaluation — FINAL, tidak peduli sumber target):**
1. Resolve level target sesuai `sweep_target`:
   - `session_high_low` → `session_high`/`session_low` dari occurrence ter-`COMPLETE` terakhir pada window `sweep_target_session_window`
   - `external_structure` → structure point ACTIVE, `classification=EXTERNAL` dari Internal Structure Engine
   - `internal_structure` → structure point ACTIVE, `classification=INTERNAL` dari Internal Structure Engine
2. Ada candle dengan wick menembus level target tersebut.
3. Body candle close kembali ke sisi dalam level (untuk target Engine B: berarti tidak memicu `structure_break` di titik tersebut; untuk target Session Engine: close kembali ke sisi dalam `session_high`/`session_low`).

Jika 1–3 terpenuhi → `status = VALID`.

**Output:**
```
status: VALID | INVALID | UNKNOWN
swept_target_type: "session_high_low" | "external_structure" | "internal_structure"
swept_side: "high" | "low"   // [Ditambahkan saat implementasi Rule #5/MSS — lihat catatan]
swept_structure_id: number | null   // hanya terisi kalau target dari Engine B
swept_level_price: number
sweep_candle_index: number
```

**Catatan implementasi (v0.3.2):** `swept_side` awalnya tidak ada di Output. Ketauan wajib ada saat implementasi MSS (Rule #5) — precondition MSS eksplisit butuh tau sisi mana yang di-sweep ("sweep terjadi pada sisi low" utk bullish MSS), dan tanpa field ini, target `session_high_low` (swept_structure_id-nya null) gak punya cara direct buat consumer nurunin sisi itu tanpa consumer ikut menghitung ulang sendiri. Ditambah di sini, bukan ditambal di MSS.

**Failure reason:**
- `TARGET_SOURCE_UNAVAILABLE` — Session Engine belum ready, atau `sweep_target_session_window` belum ada occurrence `COMPLETE` → `status = UNKNOWN`
- `NO_ACTIVE_LEVEL` — tidak ada level ACTIVE untuk dievaluasi
- `NO_SWEEP` — tidak ada wick yang menembus level
- `NO_CLOSE_BACK` — wick menembus tapi body tidak close kembali (atau malah jadi `structure_break` sungguhan, bukan sweep)
- `OUTSIDE_SESSION` — di luar Silver Bullet Window (belum ada mekanisme config yang mendefinisikan ini — lihat catatan)

**Catatan implementasi (v0.3.2) — `OUTSIDE_SESSION`:** section Config di atas cuma punya `sweep_target` dan `sweep_target_session_window` — gak ada parameter yang mendefinisikan "evaluasi cuma dalam window X". Failure reason ini ada di daftar tapi implementasi saat ini TIDAK PERNAH menghasilkannya, karena mekanismenya belum didefinisikan di sini. Bukan diasumsikan/diisi sendiri — dicatat sebagai gap terbuka.

**Quality filter (UNSPECIFIED, tidak berubah):**
- `retrace_min_pct`, `max_candle_confirm` — bukan bagian core, dikalibrasi pasca-backtest

---

## 4. BOS — lihat section "4 & 6. BOS & CHOCH" di bawah (status FINAL, digabung dengan CHOCH)

## 5. MSS (Market Structure Shift)
**Status: FINAL secara algoritma — Internal Structure Engine FINAL. Menunggu Rule #3 unblocked (kalau target sweep default `session_high_low` dipakai) dan kalibrasi `swing_fractal_n`.**

**Definisi konseptual:**
Perubahan struktur pasar jangka pendek yang mengonfirmasi reversal arah setelah liquidity sweep — ditandai `structure_break` pada internal high/low berikutnya.

**Dependencies:**
- Liquidity Sweep (Rule #3) — PARTIALLY BLOCKED
- Internal Structure Engine (FINAL)

**Preconditions:**
- `liquidity_sweep.status == VALID` (catatan: MSS tidak peduli `swept_target_type` apa — sweep terhadap `session_high_low` sekalipun tetap valid sebagai precondition, karena MSS hanya butuh fakta "sweep terjadi", bukan sumber levelnya)

**Core definition (FINAL — murni konsumsi Engine B, tanpa logika struktur sendiri):**
1. `liquidity_sweep.status == VALID` (untuk bullish MSS: sweep terjadi pada sisi low).
2. Ambil event `structure_break` dari Internal Structure Engine pada structure point dengan `type=high`, `classification=INTERNAL`, dengan `candle_index` setelah `sweep_candle_index`.
3. Jika event tersebut ada → `status = VALID`, `mss_direction = bullish`.

Simetris untuk bearish (sweep sisi high → cari `structure_break` pada `type=low`, `classification=INTERNAL`).

**Output:**
```
status: VALID | INVALID | UNKNOWN
mss_direction: "bullish" | "bearish"
broken_structure_id: number    // referensi ke Engine B
mss_candle_index: number       // = broken_at_candle_index dari Engine B
```

**Failure reason:**
- `SWEEP_NOT_VALID` — precondition liquidity sweep gagal
- `NO_SUBSEQUENT_INTERNAL_BREAK` — tidak ada `structure_break` internal setelah sweep
- `ENGINE_UNAVAILABLE` — dependency belum ready → `status = UNKNOWN`

**Quality filter:** tidak ada — deterministik penuh begitu Rule #3 unblocked.

---

## 6. CHOCH — lihat section "4 & 6. BOS & CHOCH" di bawah (status FINAL, digabung dengan BOS)
## 7. FVG — lihat Engine E (direklasifikasi jadi Primitive sesuai prinsip Primitive→Composite)
## 8. IFVG — UNSPECIFIED
## 9. Order Block — lihat Engine G di bawah (status FINAL, lifecycle Full Fill)
## 10. DRT — lihat section "DRT: Keputusan Arsitektur" di bawah (Q0-Q13 terkunci, Core Definition BELUM final)
## 11. PD Array — UNSPECIFIED, menunggu definisi kategori mana yang Anda anggap valid
## 12. Entry Validation — bergantung 3-11
## 13. Risk Rules — UNSPECIFIED
## 14. Exit Rules — UNSPECIFIED
## 15. Journal Rules — UNSPECIFIED

---

## Engine A. Swing Detection Engine
**Status: ALGORITHM FINAL — Fractal N-bar. Parameter `swing_fractal_n` UNSPECIFIED (config-driven, dikalibrasi nanti, bukan hardcoded).**

**Definisi konseptual:**
Titik balik harga lokal pada rangkaian candle. Swing high = titik lokal tertinggi dibanding sekitarnya; swing low = titik lokal terendah. Ini primitif paling dasar yang dikonsumsi semua rule struktural (Internal Structure, BOS, MSS, CHOCH, Liquidity Sweep, Order Block). Generik — tidak spesifik ICT.

**Dependencies:** tidak ada. Base primitive, hanya butuh OHLC candle series mentah.

**Input data:**
- OHLC candle series pada timeframe kerja
- Parameter `N` (lihat Parameter di bawah)

**Metode: Fractal N-bar**

**Core definition — Swing High:**
Candle di index `i` adalah swing high jika `high[i]` lebih tinggi dari `high` semua candle N kiri (`i-N .. i-1`) dan N kanan (`i+1 .. i+N`).

**Core definition — Swing Low:** simetris — `low[i]` lebih rendah dari `low` N candle kiri dan kanan.

**Provisional vs Confirmed:**
- Titik di index `i` baru bisa dievaluasi setelah candle `i+N` close (butuh N candle ke kanan sebagai konfirmasi) — sebelum itu titik tidak exist sama sekali di sistem, bukan "provisional".
- Begitu candle `i+N` close dan syarat fractal terpenuhi → `status = CONFIRMED`, masuk swing list.
- Kalau syarat tidak terpenuhi → titik itu bukan swing, tidak pernah masuk list (bukan status "INVALID" — cukup tidak ada).
- Swing yang sudah CONFIRMED bersifat immutable — tidak direvisi walau muncul swing lebih ekstrem setelahnya (itu jadi swing baru terpisah). Menentukan swing mana yang masih "relevan/major" adalah tugas Internal Structure Engine, bukan engine ini.

**Catatan penting:** Engine ini generator data (menghasilkan list titik), bukan gate seperti Rule — jadi tidak pakai status VALID/INVALID/UNKNOWN. Rule yang mengonsumsi output engine inilah yang menghasilkan status itu.

**Update mechanism (incremental, per candle baru masuk):**
1. Cek candidate di index `(current - N)`: apakah sekarang confirmed (karena N candle kanan sudah lengkap).
2. Kalau ya → tambahkan ke swing list, status `CONFIRMED`.
3. Kalau tidak → buang, tidak pernah masuk list.

**Equal High/Low handling:**
Engine ini TIDAK melakukan merge/dedup swing yang levelnya sama atau berdekatan. Ia hanya melaporkan swing point mentah (price, index, type). Deduplikasi/toleransi "equal high" adalah tanggung jawab rule terpisah (Equal High/Low Rule) yang mengonsumsi output engine ini + parameter toleransi (masih UNSPECIFIED). Ini menjaga engine tetap generic — kalau toleransi dimasukkan ke sini, nilainya akan beda-beda tiap rule yang memakainya nanti.

**Output (per swing point):**
```
{
  type: "high" | "low",
  price: number,
  candle_index: number,
  timestamp: ISO8601,
  status: "CONFIRMED",
  confirmed_at_index: number   // = candle_index + N
}
```
Output total: array swing point terurut kronologis, append-only, immutable per titik.

**Edge case:**
- Data OHLC < `2N+1` candle → swing list kosong, bukan error.
- Gap data (candle hilang) ditangani di Data Feed layer, bukan di sini — engine asumsikan input continuous.

**Algoritma vs Konfigurasi:**
- **Algoritma: FINAL** — Fractal N-bar seperti didefinisikan di atas.
- **Parameter `swing_fractal_n`: UNSPECIFIED** — nilai N belum ditentukan. Implementasi WAJIB mengambil nilai ini dari konfigurasi (config/env/database), bukan hardcoded, sehingga bisa diganti tanpa mengubah kode engine.
- Nilai default akan diputuskan setelah dibandingkan dengan cara swing ditandai manual di chart dan hasil backtest — bukan sebelumnya.
- **Catatan implementasi:** karena hasil swing detection berubah tergantung `N`, setiap swing list yang dihasilkan harus dicatat sedang pakai `swing_fractal_n` berapa (versioning parameter) — supaya saat membandingkan beberapa nilai N untuk kalibrasi, hasilnya tidak tercampur.

---

## Engine B. Internal Structure Engine
**Status: FINAL — semua core definition deterministik. Parameter yang diwarisi dari Engine A (`swing_fractal_n`) masih UNSPECIFIED; field `significance` (Major/Minor) UNSPECIFIED algoritmanya sampai dibutuhkan rule turunan.**

**Definisi konseptual:**
Transformasi non-trading dari daftar swing mentah (output Swing Detection Engine) menjadi model struktur pasar: identitas stabil per titik, klasifikasi internal/external, status aktif, label HH/HL/LH/LL, dan trend struktur objektif. Tidak mengambil keputusan trading — satu-satunya sumber data struktur untuk BOS, MSS, CHOCH, Liquidity Sweep, dan rule lain.

**Dependencies:** Swing Detection Engine

**Input:** array swing point dari Swing Detection Engine (type, price, candle_index, timestamp, status=CONFIRMED)

### a) Structure ID (FINAL)
Setiap swing point yang masuk diberi `structure_id`: integer sekuensial, monoton naik, immutable, berbasis urutan `confirmed_at_index`. Semua rule turunan (BOS/MSS/CHOCH) mereferensikan swing yang terlibat lewat `structure_id` ini untuk keperluan trace/debug/replay.

### b) HH / HL / LH / LL labeling (FINAL)
Bandingkan setiap swing high baru dengan swing high CONFIRMED sebelumnya (urutan structure_id):
- price lebih tinggi → `HH`
- price lebih rendah → `LH`

Bandingkan setiap swing low baru dengan swing low CONFIRMED sebelumnya:
- price lebih rendah → `LL`
- price lebih tinggi → `HL`

Swing high/low pertama dalam series (tidak ada pembanding) → `status: UNLABELED`.

### c) External vs Internal — FINAL: Kandidat 1 (Range-based)
Simpan running `current_external_high` (CEH) dan `current_external_low` (CEL).
- Swing high baru > CEH → `classification = EXTERNAL`, jadi CEH baru.
- Swing high baru ≤ CEH → `classification = INTERNAL`.
- Simetris untuk swing low dengan CEL.
Tidak ada parameter tambahan — murni relasional terhadap swing sebelumnya, tidak mengubah/membuat ulang swing dari Swing Detection Engine.

### c.1) Major vs Minor — axis terpisah dari External/Internal (FINAL keputusan pemisahan, algoritma UNSPECIFIED)
External/Internal = hirarki lokasi struktur. Major/Minor = signifikansi swing — dua hal berbeda, tidak dipaksa sinonim.
Field `significance: MAJOR | MINOR | UNSPECIFIED` ditambahkan ke output sebagai slot independen. Algoritma penentuannya UNSPECIFIED untuk v1 — baru didefinisikan kalau BOS/MSS/CHOCH nanti benar-benar membutuhkannya, bukan diasumsikan sekarang.

### d) Active vs Inactive (broken) — Price-based (keputusan Anda), dengan definisi "break" generik milik engine ini sendiri
**Kenapa perlu definisi sendiri, bukan menunggu BOS/CHOCH:** roadmap menetapkan Internal Structure Engine → BOS → MSS → CHOCH (BOS/CHOCH mengonsumsi Internal Structure Engine). Kalau Active/Inactive di sini menunggu "definisi break dari BOS/CHOCH", terjadi circular dependency — BOS belum ada, tidak bisa jadi prasyarat untuk engine yang harus ada sebelum BOS. Karena itu, "break" di level Internal Structure Engine harus generik (fakta struktural murni), bukan interpretasi trading:

**Core definition (FINAL — body close, konsisten dengan Liquidity Sweep):**
Sebuah structure point (swing high/low) berubah dari `ACTIVE` menjadi `BROKEN` ketika ada candle live yang **body close** menembus level harga structure tersebut, searah invalidasi (close di bawah swing low untuk structure low, close di atas swing high untuk structure high). Wick saja tidak cukup.

Internal Structure Engine hanya menghasilkan event generik `structure_break` — tidak menentukan apakah itu BOS atau CHOCH. BOS/CHOCH mengonsumsi event ini + konteks trend (field `label`) untuk klasifikasi masing-masing. Dependency tetap satu arah.

**Output tambahan per structure point:**
```
broken_status: "ACTIVE" | "BROKEN"
broken_at_candle_index: number | null
```

### e) Trend struktur (bullish/bearish/ranging) — tergantung (c) selesai
- Bullish: external swing high terakhir = `HH` DAN external swing low terakhir = `HL`
- Bearish: external swing high terakhir = `LH` DAN external swing low terakhir = `LL`
- Ranging: kombinasi campuran (mis. HH+LL atau LH+HL) → `RANGING`, tidak ada trend struktur objektif.

**Output (per structural point):**
```
{
  structure_id: number,
  type: "high" | "low",
  price: number,
  candle_index: number,
  label: "HH" | "HL" | "LH" | "LL" | "UNLABELED",
  classification: "EXTERNAL" | "INTERNAL",
  significance: "MAJOR" | "MINOR" | "UNSPECIFIED",
  broken_status: "ACTIVE" | "BROKEN",
  broken_at_candle_index: number | null
}
```

---

## Specification Conflict: Trend (Engine B, bagian e) — BLOCKED
**Status: BLOCKED v0.3.2 — kontradiksi internal terbukti matematis + dikonfirmasi empiris (1.400 candle, 3 random walk independen). Section (e) TIDAK BOLEH diimplementasikan/dipakai sampai direvisi. Ditemukan saat implementasi Engine B (TypeScript); keputusan didokumentasikan di sini atas instruksi eksplisit pemilik spec, bukan diperbaiki diam-diam.**

### Kontradiksi

**Lemma (CEH/CEL monoton):** Berdasar section (c), CEL (`current_external_low`) hanya bisa turun atau tetap, tidak pernah naik. Simetris, CEH cuma naik atau tetap.
*Bukti:* titik pertama menetapkan CEL = harga sendiri (base case). Titik berikutnya: kalau EXTERNAL (syarat price < CEL lama), CEL baru = price < CEL lama (turun). Kalau INTERNAL, CEL tidak berubah. Induksi selesai.

**Corollary:** Kapan pun, CEL_saat_ini ≤ harga SETIAP titik low yang pernah diproses sebelumnya — termasuk titik low immediately-preceding yang jadi acuan label di section (b).

**Akibat:** Kalau titik low baru classified EXTERNAL (syarat: price < CEL_sebelum), maka per corollary, CEL_sebelum ≤ harga titik low sebelumnya manapun. Jadi price_baru < CEL_sebelum ≤ harga titik low sebelumnya — PASTI "lebih rendah". Per section (b), labelnya PASTI `LL`, TIDAK PERNAH `HL` (kecuali titik pertama → `UNLABELED`). Simetris: EXTERNAL high PASTI `HH`, TIDAK PERNAH `LH`.

Section (e):
- Bullish butuh: external swing low terakhir = `HL`
- Bearish butuh: external swing high terakhir = `LH`

Dua-duanya barusan dibuktikan mustahil buat titik EXTERNAL. **Bullish dan Bearish sama-sama unsatisfiable — bukan langka, betul-betul mustahil, untuk data harga apapun.** Trend literal sesuai (c)+(e) akan SELALU `RANGING`.

**Verifikasi empiris:** 3 random walk independen (seed berbeda, total 1.400 candle, N=2 dan N=3) — trend tidak pernah keluar dari `ranging` di ketiganya, sepanjang seluruh run. Lihat `test/verify-internal-structure.ts`.

### Dependency yang terdampak

- **BOS & CHOCH** (section "4 & 6"): langkah pertama core definition minta trend sebelum `structure_break`. Trend selalu `ranging` → BOS/CHOCH selalu jatuh ke `status = UNKNOWN` (via `NO_ESTABLISHED_TREND`), tidak pernah `VALID`, berapa pun kondisi market. Praktis BLOCKED juga meski algoritmanya sendiri tidak berubah.
- **MSS** (section 5): precondition tidak langsung baca `trend`, tapi kegunaan konseptualnya (menandai shift setelah sweep) berhubungan erat sama transisi trend yang tidak pernah valid. Perlu ditinjau ulang begitu trend direvisi.
- **Order Block** (Engine G): berpotensi kena kalau filtering-nya nanti pakai `trend` — belum final, belum pasti.
- Rule masa depan manapun yang membaca `trend`/`prior_trend` dari Internal Structure Engine.

### Alternatif desain (didaftar, belum dipilih)

1. Trend dari swing terakhir apapun classification-nya (label dari titik terakhir per axis, bukan cuma yang EXTERNAL) — match definisi textbook uptrend. *(Hipotesis Claude, belum diterapkan.)*
2. Definisi EXTERNAL di section (c) diubah dulu (mis. window/lookback, bukan running max/min sepanjang waktu) supaya label EXTERNAL tidak selalu HH/LL — ini mengubah (c), bukan cuma (e).
3. Trend dilepas dari Internal Structure Engine, jadi rule terpisah dengan akses data lebih kaya dari label swing saja.
4. Kemungkinan lain yang belum terpikirkan — daftar ini tidak diklaim lengkap.

Tidak satupun di atas diterapkan. Section (e) tetap seperti aslinya di atas, ditandai BLOCKED, menunggu keputusan pemilik spec.

### Status implementasi kode

`InternalStructureEngine` tetap menjalankan komputasi literal section (e) secara internal (buat referensi), tapi method publiknya (`getTrendState()`) mengembalikan status `BLOCKED` secara eksplisit — bukan mengembalikan `"ranging"` seolah itu nilai valid. `StructureBreakEvent.prior_trend` memakai wrapper yang sama.

---

## Engine C. Time Engine
**Status: FINAL — generik, minim ambiguitas.**

**Definisi konseptual:**
Menyediakan waktu New York yang timezone-aware (bukan fixed offset) untuk dikonsumsi Session Engine dan rule manapun yang butuh waktu NY lokal. Primitif dasar, tidak spesifik ICT.

**Dependencies:** tidak ada. Base primitive.

**Input data:**
- Timestamp candle dari data feed (harus diketahui timezone aslinya, biasanya UTC dari broker/provider)

**Core definition (FINAL):**
1. Konversi timestamp UTC ke waktu lokal `America/New_York` menggunakan IANA timezone database (`zoneinfo`/`pytz`/`date-fns-tz`, dsb) — **bukan fixed offset**, supaya otomatis benar melewati transisi DST (awal Maret & awal November).
2. `ny_date` = tanggal kalender NY (bukan tanggal UTC) — penting karena "Midnight Open" dan batas hari trading mengikuti kalender NY, bukan UTC.

**Output (per timestamp):**
```
{
  utc_timestamp: ISO8601,
  ny_time: datetime (local America/New_York),
  ny_date: "YYYY-MM-DD",   // kalender NY
  is_dst: boolean
}
```

**Edge case:**
- Saat transisi DST, ada jam yang tidak exist (spring forward) atau muncul dua kali (fall back) secara lokal NY — wajib pakai library timezone standar yang sudah menangani ini (jangan reinvent kalkulasi offset manual).

**Failure reason:**
- `INVALID_SOURCE_TIMEZONE` — timestamp input tidak punya info timezone yang jelas → `status = UNKNOWN` untuk konsumen di atasnya.

**Quality filter:** tidak ada — deterministik penuh, tidak ada parameter untuk dikalibrasi.

---

## Engine D. Session Engine
**Status: HAMPIR FINAL — mekanisme window, Session High/Low, dan Reference Level generik semua FINAL. Isi `session_windows` (jam per window) masih UNSPECIFIED (bukan blocker desain, tinggal isi config). `true_open`/`true_close` UNSPECIFIED, tidak dipakai v1.**

**Definisi konseptual:**
Menghasilkan window waktu sesi (named windows), level harga berbasis sesi (session high/low), dan reference level berbasis waktu/event (midnight open, dll) — dikonsumsi Rule #3 (Liquidity Sweep) dan rule lain yang butuh konteks sesi. Murni menghasilkan data, tidak ada interpretasi trading.

**Dependencies:** Time Engine (FINAL), OHLC candle series.

**Core definition — Window sesi (FINAL, struktur Multiple Named Windows):**
Session Engine mengelola daftar window bernama, bukan satu window hardcoded untuk Silver Bullet saja — supaya reusable untuk strategi/session lain (London, NY Open, Lunch, PM Session, dll) tanpa mengubah kode engine.

Config `session_windows` (list, bukan hardcoded):
```
session_windows:
  - id: <string, unik>
    start: "HH:MM"
    end: "HH:MM"
    timezone: "America/New_York"   // selalu via Time Engine, IANA tz
    active: boolean
```

Rule memilih window lewat config, contoh: `active_session_window: <id>`. Rule/engine lain query "apakah candle ini masuk window X" dengan bandingkan `ny_time` (dari Time Engine) terhadap rentang window `id` yang dipilih.

**Buffer (opsional, terpisah dari core):**
`window_buffer_before` / `window_buffer_after` (menit) — parameter opsional per window, default `0`. UNSPECIFIED apakah perlu diaktifkan sampai ada bukti dari backtest bahwa buffer meningkatkan kualitas sinyal. Bukan bagian dari core definition window.

**Isi `session_windows` (nama, jam mulai/akhir per window) — masih UNSPECIFIED, menunggu Anda.** Struktur/skema di atas final, tapi window apa saja yang mau didaftarkan dan jam persisnya belum saya isi.

**Core definition — Session High/Low (FINAL, generik, reuse `session_windows`):**
Untuk tiap window bernama di `session_windows` dan tiap `ny_date`:
- `session_high` = harga tertinggi (`high`) dari seluruh candle yang `ny_time`-nya jatuh dalam rentang window tersebut pada tanggal itu.
- `session_low` = harga terendah (`low`) dari candle yang sama.
- `status: "IN_PROGRESS" | "COMPLETE"` — `COMPLETE` begitu `ny_time` sekarang sudah melewati `end` window pada tanggal itu; sebelum itu `IN_PROGRESS` (nilainya masih bisa berubah, belum final).

Definisi level ini generik dan reusable — Asia Session High/Low, London Session High/Low, NY Session High/Low, atau window apa pun di `session_windows`, semua pakai rumus yang sama. Yang membedakan hanya `id` window mana yang dipilih via config.

**Output (per window per hari):**
```
{
  session_window_id: <string>,
  ny_date: "YYYY-MM-DD",
  session_high: number,
  session_low: number,
  status: "IN_PROGRESS" | "COMPLETE"
}
```

**Catatan untuk Rule #3:** karena window berulang tiap hari, "Session High/Low" yang relevan untuk sweep adalah **occurrence ter-COMPLETE terakhir** dari window target — bukan window yang sedang berjalan (belum final nilainya).

**Core definition — Reference Level (FINAL, generik, tidak saling diturunkan satu sama lain):**
Session Engine menyediakan mekanisme generik untuk menghasilkan level harga berbasis waktu/event tertentu. Config `reference_levels` (list, bukan hardcoded):
```
reference_levels:
  - id: <string, unik>              // mis. "midnight_open", "true_open", "daily_open"
    anchor: "time" | "session_open" | "session_close"
    anchor_time: "HH:MM"            // wajib kalau anchor="time"
    anchor_session_window: <id>     // wajib kalau anchor="session_open"/"session_close", merujuk session_windows
```

**Perhitungan per anchor type:**
- `anchor: "time"` → harga open candle pertama yang `ny_time`-nya ≥ `anchor_time` pada `ny_date` tersebut.
- `anchor: "session_open"` → harga open candle pertama dalam rentang `anchor_session_window`.
- `anchor: "session_close"` → harga close candle terakhir dalam rentang `anchor_session_window`.

Setiap `reference_levels` entry independen — tidak ada yang diturunkan dari entry lain.

**Output (per reference level per hari):**
```
{
  reference_level_id: <string>,
  ny_date: "YYYY-MM-DD",
  price: number,
  computed_at_candle_index: number
}
```

**Konfigurasi untuk Silver Bullet v1:**
- `midnight_open`: `anchor: "time"`, `anchor_time: "00:00"` — **FINAL**, ini yang dipakai strategi Anda sekarang.
- `true_open` / `true_close`: **UNSPECIFIED** — belum dikonfigurasi, menunggu definisi operasional Anda. Tidak diisi dengan definisi umum ICT, dan tidak memblokir v1 karena belum dipakai strategi Silver Bullet Anda saat ini.



---

## [DIHAPUS v0.3.1] BOS dan CHOCH versi standalone lama dipindah ke sini

Section BOS dan CHOCH yang sebelumnya berdiri sendiri di titik ini (masing-masing dengan output contract `VALID | INVALID | UNKNOWN`) dihapus di v0.3.1 karena konflik dengan section unified di bawah (`VALID | UNKNOWN`, tanpa INVALID). Catatan edge case ranging-trend dari section BOS lama sudah dipindah ke bagian "Edge case belum diputuskan" di section unified. Lihat section "4 & 6" di bawah untuk spec yang berlaku.

---

## 4 & 6. BOS (Break of Structure) & CHOCH (Change of Character)
**Status: FINAL secara algoritma — tapi PRAKTIS BLOCKED v0.3.2: input `trend` dari Engine B section (e) BLOCKED (lihat "Specification Conflict: Trend" setelah Engine B). Selama trend belum direvisi, langkah 1 di bawah selalu jatuh ke `prior_trend = ranging`, jadi status yang dihasilkan selalu `UNKNOWN`, tidak pernah `VALID`.**

**Catatan arsitektur:** BOS dan CHOCH ternyata dua output dari satu logika klasifikasi yang sama (bukan dua rule terpisah yang independen) — keduanya menjawab pertanyaan yang sama: "`structure_break` ini searah trend atau melawan trend?". BOS = searah (continuation), CHOCH = melawan (potensi reversal). Ditulis sebagai satu core logic di sini, tapi tetap dua entri terpisah di roadmap sesuai konvensi ICT.

**Definisi konseptual:**
Klasifikasi generik dari event `structure_break` (Internal Structure Engine) berdasarkan apakah arah break itu sejalan atau berlawanan dengan trend struktur yang berlaku sebelum break terjadi.

**Dependencies:**
- Internal Structure Engine (FINAL) — sumber `structure_break` event dan field `trend`

**Input data:**
- Event `structure_break` dari Engine B (structure_id, type, broken_at_candle_index)
- `trend` (bullish/bearish/ranging, dari rule (e) Engine B) — dievaluasi pada state tepat SEBELUM structure_break ini terjadi

**Config (FINAL):**
- `structure_scope: "EXTERNAL"` — BOS/CHOCH hanya dievaluasi pada `structure_break` dengan `classification=EXTERNAL` (structure signifikan/major). Break pada INTERNAL tidak diklasifikasi BOS/CHOCH di sini (tapi tetap bisa dipakai MSS, lihat catatan di bawah).

**Core definition (FINAL, generik):**
Untuk tiap event `structure_break` yang classification-nya sesuai `structure_scope`:
1. Ambil `prior_trend` = trend struktur tepat sebelum break ini (`bullish` / `bearish` / `ranging`).
2. Tentukan `break_direction`: `"up"` kalau structure point bertipe `high` yang broken, `"down"` kalau `low`.
3. Klasifikasi:
   - `prior_trend=bullish` + `break_direction=up` → **BOS**, `direction=bullish` (continuation)
   - `prior_trend=bearish` + `break_direction=down` → **BOS**, `direction=bearish` (continuation)
   - `prior_trend=bullish` + `break_direction=down` → **CHOCH**, `direction=bearish` (potensi reversal)
   - `prior_trend=bearish` + `break_direction=up` → **CHOCH**, `direction=bullish` (potensi reversal)
   - `prior_trend=ranging` → **status = UNKNOWN** (tidak ada baseline trend untuk diklasifikasi — lihat "Edge case belum diputuskan" di bawah, bukan tebakan saya isi sendiri)

**Output:**
```
{
  status: "VALID" | "UNKNOWN",
  event_type: "BOS" | "CHOCH" | null,
  direction: "bullish" | "bearish" | null,
  source_structure_id: number,   // referensi Engine B
  candle_index: number
}
```

**Failure reason:**
- `NO_PRIOR_TREND` — `prior_trend = ranging`, tidak bisa diklasifikasi BOS/CHOCH → `status = UNKNOWN`
- `NO_STRUCTURE_BREAK` — tidak ada event `structure_break` untuk classification yang dipilih
- `ENGINE_UNAVAILABLE` — Internal Structure Engine belum ready
- `TREND_BLOCKED` — [Ditambahkan v0.3.2] Trend (bagian e) BLOCKED, lihat "Specification Conflict: Trend". BEDA dari `NO_PRIOR_TREND`: itu berarti trend engine fungsional dan BENERAN menghitung ranging; `TREND_BLOCKED` berarti trend engine-nya sendiri gak fungsional (`literal_spec_value` SELALU 'ranging' terlepas kondisi market). Membaca `literal_spec_value` mentah lalu menganggapnya `NO_PRIOR_TREND` akan MENYAMARKAN kegagalan sebagai hasil valid — itu sebabnya reason terpisah ini dibutuhkan, bukan didaftar semula.

**Catatan implementasi (v0.3.2):** selama Trend BLOCKED, SEMUA evaluasi BOS/CHOCH (untuk classification EXTERNAL manapun) akan `status=UNKNOWN, failure_reason=TREND_BLOCKED` — dikonfirmasi empiris (58 evaluasi, 3 random walk independen). `NO_PRIOR_TREND` secara struktural tidak pernah terpicu saat ini, disiapkan buat begitu Trend direvisi.

**Edge case belum diputuskan — trend RANGING saat break external pertama terjadi:**
Behavior saat ini (`status = UNKNOWN` saat `prior_trend = ranging`) adalah default aman, bukan keputusan final. Pertanyaan yang belum dijawab: kalau belum ada trend established dan tiba-tiba ada `structure_break` external, apakah break itu otomatis dianggap BOS (trend baru langsung terbentuk, lebih responsif) atau tetap `UNKNOWN` sampai ada konfirmasi break kedua searah (lebih konservatif, mengurangi false signal di market choppy)? Ini keputusan Anda, bukan diasumsikan di sini — dampaknya ke seberapa cepat sistem "percaya" pada trend baru yang baru mulai terbentuk.

**Quality filter:** tidak ada parameter numerik tambahan — deterministik penuh begitu `structure_scope` diputuskan.

**Hubungan dengan MSS (Rule #5):** MSS TIDAK memakai core logic ini — MSS sudah final independen, mensyaratkan `structure_break` classification=INTERNAL SETELAH liquidity sweep spesifik. BOS/CHOCH di sini tidak punya syarat liquidity sweep. Dua konsep ini bisa terjadi bersamaan (structure_break yang sama bisa memicu MSS DAN diklasifikasi BOS/CHOCH sekaligus) — tidak saling menggantikan.

---

## Engine E. FVG Detection Engine
**Status: FINAL secara algoritma.**

**Definisi konseptual:**
Mendeteksi Fair Value Gap — celah harga pada 3 candle berurutan yang mengindikasikan inefisiensi harga. Primitif objektif, tidak melakukan interpretasi trading (itu tugas Composite Rule seperti PD Array/Entry Validation).

**Dependencies:** tidak ada — primitif langsung dari OHLC candle series, seperti Swing Detection Engine.

**Input data:** OHLC candle series timeframe kerja.

**Core definition (FINAL, tanpa parameter — sudah disepakati sejak awal diskusi):**
Untuk 3 candle berurutan A (index i), B (index i+1), C (index i+2):
- **Bullish FVG**: `high[A] < low[C]` → gap range = `[high[A], low[C]]`
- **Bearish FVG**: `low[A] > high[C]` → gap range = `[high[C], low[A]]`

FVG confirmed begitu candle C close (index `i+2`) — tidak butuh lookahead tambahan seperti swing fractal, murni geometri 3 candle.

**Mitigation lifecycle (FINAL — geometri murni, bukan konfirmasi candle):**
- `ACTIVE` — masih ada bagian gap range yang belum pernah disentuh wick harga.
- `MITIGATED` — wick harga (bukan body close) telah menjangkau seluruh gap range (full fill).

Body close TIDAK menjadi bagian lifecycle Engine E — ini keputusan sadar berbeda dari Liquidity Sweep/Structure Break (yang pakai body close) karena Engine E murni geometri, bukan konfirmasi. Kalau strategi butuh body-close-based mitigation, itu jadi Composite Rule terpisah yang mengonsumsi output Engine E, bukan mengubah definisi dasar di sini.

**Output (per FVG):**
```
{
  fvg_id: number,          // sekuensial, immutable, seperti structure_id
  type: "bullish" | "bearish",
  gap_high: number,
  gap_low: number,
  formed_at_candle_index: number,   // = index C
  mitigation_status: "ACTIVE" | "MITIGATED",
  mitigated_at_candle_index: number | null
}
```

**Failure reason / edge case:**
- Data < 3 candle → tidak ada FVG yang bisa dievaluasi, list kosong, bukan error.

**Quality filter (UNSPECIFIED):**
- `min_gap_size` — ambang minimal ukuran gap (pip/ATR) supaya gap yang terlalu kecil tidak dihitung. Bukan bagian core, dikalibrasi pasca-backtest — sama seperti `retrace_min_pct` di Liquidity Sweep.

---

## Engine F. IFVG (Inversion Fair Value Gap)
**Status: FINAL secara algoritma.**

**Definisi konseptual:**
IFVG adalah transformasi state dari FVG (Engine E) yang sudah tervalidasi/violated — polaritasnya terbalik (bullish FVG yang tervalidasi menjadi level bearish, dan sebaliknya). Bukan pattern baru dari OHLC — murni derivasi state dari Engine E, tidak boleh menghitung ulang geometri gap.

**Dependencies:** Engine E (FVG Detection Engine, FINAL).

**Input data:** output FVG dari Engine E (`fvg_id`, `type`, `gap_high`, `gap_low`, `mitigation_status`, `mitigated_at_candle_index`).

**Core definition — relasi polaritas (FINAL, tidak perlu keputusan lagi):**
- FVG `type=bullish` yang trigger konversi terpenuhi → IFVG `type=bearish` (jadi level resistance)
- FVG `type=bearish` yang trigger konversi terpenuhi → IFVG `type=bullish` (jadi level support)
- `ifvg_range` = `gap_high`/`gap_low` yang sama dari FVG asal — cuma peran/polaritasnya dibalik, bukan geometri baru.

**a) Trigger konversi FVG → IFVG (FINAL):**
Sama dengan `mitigation_status = MITIGATED` di Engine E (wick full fill) — IFVG langsung derive begitu Engine E flag MITIGATED pada suatu FVG, tanpa event/pemeriksaan baru terhadap raw candle. `formed_at_candle_index` IFVG = `mitigated_at_candle_index` dari FVG asal.

**b) Lifecycle IFVG sendiri (FINAL):**
IFVG punya status sendiri: `ACTIVE` → `USED`. Trigger `USED` reuse geometri full-fill yang sama dengan Engine E (wick menjangkau seluruh `ifvg_range`) — bukan logika baru, murni terapkan primitive full-fill yang sudah ada ke range yang berbeda. Konsisten dengan prinsip satu algoritma satu sumber kebenaran.

**Output (FINAL):**
```
{
  ifvg_id: number,
  source_fvg_id: number,      // referensi ke Engine E
  type: "bullish" | "bearish",
  range_high: number,
  range_low: number,
  formed_at_candle_index: number,
  lifecycle_status: "ACTIVE" | "USED",
  used_at_candle_index: number | null
}
```

---

## Engine G. Order Block
**Status: FINAL v0.3.4 — identifikasi zona OB FINAL, lifecycle FINAL. Dari 3 kandidat (Touch/Full Fill/Body Close), pemilik spec memilih B. Full Fill — lihat detail di bawah.**

**Definisi konseptual:**
Order Block = candle terakhir berlawanan arah (opposite-color) sebelum leg impulsif yang berujung pada `structure_break`. Primitive engine — hanya identifikasi, lifecycle, dan fakta objektif. Tidak ada logika entry/scoring/confluence (itu tugas PD Array/Entry Validation).

**Dependencies:** Internal Structure Engine (FINAL) — sumber event `structure_break`.

**Input data:** OHLC candle series; event `structure_break` dari Engine B (candle_index, classification, break_direction).

**Config (bukan hardcoded):**
- `structure_scope: "internal" | "external" | "both"` — `structure_break` classification mana yang jadi trigger OB. Default strategi ditentukan nanti di fase kalibrasi.
- `ob_area: "full_candle" | "body_only"` — geometri zona OB.

**Core definition (FINAL):**
1. Ambil event `structure_break` sesuai `structure_scope` yang dikonfigurasi, pada candle_index `K`, dengan `break_direction` (up/bullish atau down/bearish).
2. Scan mundur dari candle `K-1`, `K-2`, ... selama warna candle SAMA dengan `break_direction` (candle kontinuasi/impulsif).
3. Berhenti di candle pertama yang warnanya BERLAWANAN dengan `break_direction` — itulah candle Order Block.
4. Tentukan zona OB sesuai `ob_area`:
   - `full_candle` → `[low, high]` candle OB
   - `body_only` → `[open, close]` candle OB (diurutkan low ke high)

**Lifecycle: FINAL v0.3.4 — B. Full Fill dipilih pemilik spec.** Tiga kandidat yang sebelumnya dipertimbangkan (dipertahankan sebagai jejak keputusan):
- ~~A. Touch — `MITIGATED` begitu wick pertama kali menyentuh zona OB.~~ (tidak dipilih)
- **B. Full Fill — `MITIGATED` setelah seluruh zona OB terlewati harga (sama seperti definisi Engine E/F). DIPILIH.**
- ~~C. Body Close — `MITIGATED` setelah body candle close memenuhi kriteria tertentu (bukan sekadar wick).~~ (tidak dipilih)

**Core definition lifecycle (FINAL — reuse primitive full-fill yang sama dengan Engine E/F, bukan algoritma baru):** sejak candle SETELAH `formed_at_candle_index`, `ACTIVE` → `MITIGATED` begitu ADA candle (candle apapun, gak harus sama, gak harus berurutan) yang wick-nya mencakup sisi bawah zona (`low <= zone_low`) DAN ADA candle (bisa candle lain) yang wick-nya mencakup sisi atas zona (`high >= zone_high`). One-directional — sekali `MITIGATED`, tidak pernah balik `ACTIVE`. `mitigated_at_candle_index` = candle yang melengkapi sisi TERAKHIR yang belum tersentuh.

Field `lifecycle_status` di output di bawah sekarang benar-benar terisi `ACTIVE`/`MITIGATED` (bukan `UNSPECIFIED` lagi).

**Output:**
```
{
  ob_id: number,
  source_structure_break_candle_index: number,   // = K
  type: "bullish" | "bearish",
  zone_high: number,
  zone_low: number,
  formed_at_candle_index: number,   // index candle OB itu sendiri
  structure_scope_used: "internal" | "external",
  lifecycle_status: "ACTIVE" | "MITIGATED",   // FINAL v0.3.4, Full Fill
  mitigated_at_candle_index: number | null
}
```

**Failure/Skip reason:**
- `NO_STRUCTURE_BREAK` — tidak ada event `structure_break` sesuai `structure_scope` untuk dievaluasi
- `NO_OPPOSITE_CANDLE` — tidak ditemukan candle berlawanan warna sebelum leg impulsif (kasus langka, data tidak cukup ke belakang)
- `ENGINE_UNAVAILABLE` — Internal Structure Engine belum ready

**Quality filter (UNSPECIFIED, sesuai prinsip Anda — displacement bukan syarat inti):**
- Filter displacement/signifikansi (mis. minimum range candle impulsif) — bukan bagian core, bisa ditambahkan sebagai composite rule/quality filter nanti, tidak mengubah definisi dasar Engine G.

---

## DRT — Keputusan Arsitektur Terkunci (Q0–Q13)
**STATUS: SEBAGIAN.** Klasifikasi dan seluruh keputusan bentuk/lifecycle sudah FINAL lewat dialog Q&A panjang dengan pemilik spec (bukan riset komunitas -- ini keputusan proyek sendiri, beda dari Lampiran di bawah). **Core Definition (event/kondisi objektif yang menutup satu sequence) BELUM diisi** -- menunggu definisi operasional dari analisis chart pemilik spec sendiri, BUKAN dari asumsi/tebakan Claude. JANGAN mulai implementasi dari section ini sebelum Core Definition-nya (Q13) lengkap dan lolos verifikasi di bawah.

**Sudah terkunci:**
- **Klasifikasi:** DRT adalah **Engine**, bukan Rule. Menghasilkan fakta objektif tentang dealing range; keputusan `VALID`/`INVALID`/`UNKNOWN` tetap domain Rule di atasnya (mis. Entry Validation).
- **Bentuk output:** satu record berisi BEBERAPA level sekaligus dalam satu objek (bukan satu angka/label tunggal) -- `range_high`, `range_low`, `equilibrium`, `derived_levels` (isi belum diputuskan), `range_id`, lifecycle. Semua field bernama eksplisit, konsisten pola Engine A-G -- bukan array posisional.
- **Lifecycle record:** growing-list beridentitas (append-only), sama seperti Engine A/B/E/F/G. Record immutable begitu terbentuk -- cuma `lifecycle_status` yang boleh berubah setelahnya; fakta pembentuk (`range_high`/`range_low`) tidak pernah berubah lagi.
- **Dependency:** DRT HANYA boleh bergantung ke Engine lain (Swing Detection, Internal Structure) -- TIDAK BOLEH bergantung ke status `VALID` Rule mana pun (termasuk Liquidity Sweep/Rule #3). Kalau definisi completion nanti memakai istilah seperti "raid"/"sweep", itu WAJIB direduksi ke fakta Engine mentah (mis. wick menembus level struktural tertentu), bukan status Rule #3.
- **Sumber boundary:** `range_high`/`range_low` berasal dari StructuralPoint (Engine B), bukan SwingPoint mentah (Engine A) langsung.
- **Classification boundary:** hanya StructuralPoint `classification=EXTERNAL` yang jadi kandidat boundary. INTERNAL tidak dipakai (tidak perlu aturan seleksi tambahan seperti kasus INTERNAL yang bisa ada banyak ACTIVE sekaligus).
- **DITOLAK -- CEH/CEL:** boundary BUKAN `current_external_high`/`current_external_low` milik Engine B. CEH/CEL monoton seumur-hidup-engine (tidak pernah mengecil, tidak pernah reset) -- bertentangan dengan konsep dealing range yang bisa digantikan range baru. DRT membangun state SENDIRI dari konsumsi stream StructuralPoint + StructureBreakEvent, bukan baca snapshot CEH/CEL Engine B (pola sama seperti IFVG terhadap FVG: konsumsi event, bangun lifecycle sendiri).
- **Formasi:** satu record baru butuh SEPASANG boundary (satu External High + satu External Low), bukan terbentuk dari satu titik saja.
- **Order-dependent:** aturan completion berbasis URUTAN kemunculan event (bukan kondisi status yang bisa benar kapan saja terlepas urutan). DRT merepresentasikan satu peristiwa terstruktur (anchor -> berkembang -> selesai), bukan evaluator state global.
- **Anchor:** StructuralPoint EXTERNAL pertama yang belum pernah diklaim (high ATAU low, siapa pun duluan) jadi anchor pembuka sequence. Anchor TIDAK PERNAH diganti kandidat lain sebelum sequence selesai atau dibatalkan -- tidak ada mekanisme replacement/kompetisi kandidat di sisi anchor.
- **Sisi sama dengan anchor:** titik EXTERNAL baru dengan tipe SAMA seperti anchor (mis. High baru selagi anchor = High) TIDAK diserap sequence yang sedang berjalan -- tetap `unclaimed`, jadi kandidat anchor untuk sequence LAIN nanti.
- **Completion tidak instan:** completion BUKAN sekadar "titik lawan pertama muncul" -- butuh event struktural lanjutan yang menutup sequence (bentuk presisinya di Q13).
- **Boundary reuse:** StructuralPoint yang sudah jadi boundary satu record DRT tidak boleh jadi boundary record DRT lain -- tapi tetap boleh dipakai Engine/Rule lain (BOS, CHOCH, Liquidity Sweep, Order Block, dll.) tanpa batasan.

**BERSYARAT -- baru aktif tergantung isi Q13:**
- **Seleksi kandidat lawan (dulu disebut Q12b):** kalau completion event (Q13) TIDAK merujuk satu entitas Engine spesifik (disebut "kelas 2" dalam dialog), maka definisi completion WAJIB SEKALIGUS menjawab "kandidat lawan mana yang dipakai kalau lebih dari satu muncul sebelum completion terpicu" -- bukan pertanyaan terpisah yang menyusul, harus lahir bersamaan dengan Q13. Kalau completion event MERUJUK satu entitas spesifik ("kelas 1"), pertanyaan ini gugur otomatis.

**BELUM DIPUTUSKAN -- satu-satunya yang tersisa:**
- **Q13 -- Core Definition completion:** event/kondisi objektif yang menutup satu sequence DRT (menghasilkan `range_high`/`range_low`/`equilibrium`/dst final, langsung dipublikasikan sebagai record immutable). HARUS berasal dari analisis chart pemilik spec sendiri -- bukan tebakan Claude, bukan disalin dari Lampiran riset komunitas di bawah. Begitu dijawab, checklist verifikasi wajib dijalankan berurutan:
  1. Klasifikasikan: apakah completion event merujuk SATU entitas Engine spesifik (kelas 1, seleksi kandidat lawan otomatis gugur) atau kondisi umum tanpa rujukan entitas tunggal (kelas 2, wajib jawab seleksi kandidat lawan bersamaan)?
  2. Kalau kelas 2, selesaikan seleksi kandidat lawan pada saat yang sama (jangan ditunda).
  3. Verifikasi tidak melanggar keputusan yang sudah terkunci di atas -- **terutama dependency-only-Engine**: pastikan istilah dari analisis chart ("raid"/"sweep"/dll.) sudah direduksi ke fakta Engine mentah, bukan diam-diam merujuk status Rule #3.

---

## Lampiran: Riset Variasi Definisi Komunitas — DRT & PD Array
**PERINGATAN: BAGIAN INI REFERENSI SAJA, BUKAN SOURCE OF TRUTH PROYEK.** Ditambahkan v0.3.6 setelah riset eksternal (web search, dilakukan atas permintaan eksplisit pemilik spec) yang tujuannya MEMBUKTIKAN bahwa DRT dan PD Array tidak punya definisi tunggal yang disepakati komunitas ICT -- bukan untuk dijadikan basis implementasi apa pun. Definisi operasional final dua konsep ini masih menunggu keputusan pemilik spec sendiri (status UNSPECIFIED di roadmap dan section masing-masing tetap berlaku). Siapa pun yang membaca dokumen ini -- termasuk instance Claude di sesi mendatang -- TIDAK BOLEH memperlakukan isi lampiran ini sebagai definisi yang sudah diputuskan.

### DRT ("Dealing Range" / "Dealing Range Theory") -- variasi ditemukan
Akronim "DRT" merujuk ke DUA hal berbeda: "Dealing Range Theory" (konsep ICT, relevan) vs "Dynamic Range Theory" (indikator TradingView tidak berhubungan, kebetulan akronim sama). Untuk konsep ICT-nya, ditemukan minimal 3 varian formasi range:
- **Varian A** (materi "Ali Khan"): range terbentuk kalau sudah raid liquiditas KEDUA sisi (sellside DAN buyside).
- **Varian B** (skrip komunitas TradingView, tanpa atribusi individual jelas): urutan swing terstruktur -- Initial High, Initial Low, Higher High, Lower Low, break di atas Higher High sebagai konfirmasi (simetris untuk bearish).
- **Varian C** (artikel umum): swing high-low yang "bermakna", tanpa syarat pembentukan spesifik.

Provenance: istilah "Dealing Range" balik ke materi asli Michael J. Huddleston (2013, "Intermediate Term Dealing Range High/Low"). Sistem kuadran 0/0.25/0.50/0.75/1.00 dan akronim "DRT" sendiri tampak sistematisasi turunan (Ali Khan), bukan istilah asli Huddleston dengan struktur identik. Ditemukan juga sebutan "Type 2 Dealing Range" di satu sumber tanpa definisi presisi yang membedakannya dari "Type 1" -- gap riset, tidak diisi tebakan.

**Objektif (begitu salah satu varian dipilih):** perhitungan 50%/kuadran dari range yang sudah ditentukan (murni aritmetika); syarat Varian B (bisa dibangun murni dari Swing Detection Engine + Internal Structure Engine yang sudah ada, tanpa primitive baru).
**Subjektif:** pemilihan swing MANA jadi batas range kalau ada beberapa kandidat di timeframe berbeda; kapan range dianggap invalid/diganti range baru; presisi "raid" pada Varian A (apakah sama dengan definisi Liquidity Sweep/Rule #3 yang sudah ada, atau beda).

### PD Array (Premium/Discount Array) -- variasi ditemukan
Variasi kategori yang termasuk jauh lebih besar dari DRT:
- **Sempit** (kerangka "ICT 2022 Model"): 3 kategori -- Fair Value Gap, Order Block, Balanced Price Range (BPR).
- **Menengah:** 7 kategori berpasangan premium/discount -- Old High/Low, Order Block, FVG, Breaker, Mitigation Block, Rejection Block, Volume Imbalance.
- **Luas & terus bertambah:** satu sumber (2026) memakai hierarki tier S-A-B-C dan secara eksplisit mencatat "Suspension Block" sebagai penambahan tahun 2025 -- bukti daftar ini bukan daftar tertutup di komunitas, terus diperluas beda-beda oleh tiap edukator.

Ranking/prioritas antar kategori saat tumpang tindih juga bervariasi antar sumber, tanpa formula presisi/algoritmik di sumber manapun yang ditemukan -- cuma heuristik longgar ("timeframe lebih tinggi lebih berat").

**Objektif:** split premium/discount dari range yang sudah ditentukan (aritmetika murni); primitive yang SUDAH ADA di proyek ini (Order Block/Engine G, FVG/Engine E, IFVG/Engine F) kalau dipakai tanpa hitung ulang.
**Subjektif:** daftar kategori mana yang "sah" masuk PD Array; ranking/prioritas antar kategori.
**BELUM ADA primitive-nya di proyek ini sama sekali:** Breaker Block, Mitigation Block, Rejection Block, Balanced Price Range (BPR), Vacuum Block, Suspension Block. Kalau salah satu masuk definisi final PD Array, itu perlu Engine baru dibangun dari nol -- bukan sekadar isi definisi DRT/PD Array. Prinsip proyek ini eksplisit: primitive baru HANYA dibuat kalau memang masuk definisi final strategi, bukan karena muncul di literatur.

*Riset lengkap (kutipan sumber per klaim, tanggal akses per Juli 2026) ada di histori percakapan proyek -- lampiran ini ringkasannya, bukan reproduksinya.*
