path = "ict-rule-specification.md"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

OLD_SECTION = '''## DRT — Keputusan Arsitektur Terkunci (Q0–Q13)
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
  3. Verifikasi tidak melanggar keputusan yang sudah terkunci di atas -- **terutama dependency-only-Engine**: pastikan istilah dari analisis chart ("raid"/"sweep"/dll.) sudah direduksi ke fakta Engine mentah, bukan diam-diam merujuk status Rule #3.'''

NEW_SECTION = '''## DRT — Keputusan Arsitektur (v0.3.8)
**STATUS: SEBAGIAN, LEBIH DEKAT KE FINAL.** Klasifikasi, bentuk, lifecycle, DAN sebagian besar Core Definition sudah terkunci lewat dialog Q&A panjang + riset chart bertahap dengan pemilik spec (bukan riset komunitas -- itu di Lampiran, terpisah). Dua UNKNOWN presisi tersisa (lihat di bawah) -- keduanya butuh bukti chart historis eksplisit, BUKAN tebakan Claude. JANGAN mulai implementasi sebelum dua UNKNOWN itu terjawab.

**Sudah terkunci (Q0-Q11, tidak berubah dari v0.3.7):**
- **Klasifikasi:** DRT adalah **Engine**, bukan Rule. Menghasilkan fakta objektif; keputusan `VALID`/`INVALID`/`UNKNOWN` tetap domain Rule di atasnya (mis. Entry Validation).
- **Bentuk output:** satu record berisi BEBERAPA level sekaligus dalam satu objek -- `range_high`, `range_low`, `equilibrium`, `derived_levels` (isi belum diputuskan), `range_id`, lifecycle. Field bernama eksplisit, bukan array posisional.
- **Lifecycle record:** growing-list beridentitas (append-only). Record immutable begitu terbentuk -- cuma `lifecycle_status` yang boleh berubah; `range_high`/`range_low` tidak pernah berubah lagi.
- **Dependency:** DRT HANYA boleh bergantung ke Engine lain -- TIDAK BOLEH bergantung ke status `VALID` Rule mana pun.
- **Sumber boundary:** StructuralPoint (Engine B), bukan SwingPoint mentah (Engine A) langsung.
- **Classification boundary:** hanya `classification=EXTERNAL`. INTERNAL tidak dipakai.
- **DITOLAK -- CEH/CEL:** boundary bukan `current_external_high`/`current_external_low` Engine B (monoton seumur-hidup-engine). DRT bangun state sendiri dari stream StructuralPoint + StructureBreakEvent.
- **Formasi:** satu record butuh SEPASANG boundary (satu External High + satu External Low).
- **Order-dependent:** completion berbasis URUTAN event, bukan kondisi status yang benar kapan saja.
- **Anchor:** StructuralPoint EXTERNAL pertama yang belum pernah diklaim (high ATAU low) jadi anchor pembuka. Anchor TIDAK PERNAH diganti sebelum sequence selesai/dibatalkan.
- **Sisi sama dengan anchor:** titik EXTERNAL baru bertipe SAMA seperti anchor TIDAK diserap sequence berjalan -- tetap `unclaimed`, kandidat anchor sequence LAIN.
- **Completion tidak instan:** bukan sekadar "titik lawan pertama muncul" -- butuh event struktural lanjutan.
- **Boundary reuse:** StructuralPoint yang sudah jadi boundary satu record DRT tidak boleh jadi boundary record DRT lain -- tapi bebas dipakai Engine/Rule lain manapun.

**Core Definition (SEBAGIAN terkunci, v0.3.8):**
**Quality Filter (ditunda, BUKAN bagian Core):**
- **Displacement:** beberapa sumber (riset komunitas maupun chart pemilik spec) menyebut StructureBreakEvent idealnya disertai candle "impulsif"/"displacement" -- TAPI seluruh sumber itu deskriptif ("jelas", "kuat"), tidak ada satu pun yang beri ambang algoritmik (body >= X kali ATR, body >= rata-rata N candle, dll). Karena itu displacement EKSPLISIT DIKELUARKAN dari Core -- StructureBreakEvent MENTAH (tanpa syarat ukuran) yang jadi completion trigger. Kalau backtest nanti membuktikan break kecil menghasilkan banyak sinyal jelek, displacement bisa ditambah sebagai Quality Filter terpisah -- TANPA mengubah Core Definition ini.
- Verifikasi logis (bukan bukti chart, murni konsekuensi definisi): karena structure_break Engine B tidak punya ambang margin sama sekali, SECARA MATEMATIS mungkin ada kasus break "tipis" (body cuma lewat 1 pip) yang lolos jadi completion padahal secara visual bukan displacement sungguhan. Belum terbukti terjadi di data yang sudah diperiksa (chart yang ada semuanya nunjukin setup yang berhasil, bukan yang gagal) -- tapi jangan disamakan "belum terlihat" dengan "tidak akan terjadi". Ini alasan tambahan kenapa Quality Filter tetap relevan ditunggu, bukan dihapus permanen.

**DITOLAK sebagai mekanisme completion (dua-duanya, alasan yang sama):**
- **MSS (Rule #5):** ditolak karena dia Rule, bukan Engine -- pakai status VALID MSS sebagai trigger DRT berarti Engine bergantung ke Rule, pelanggaran dependency yang sudah dikunci di atas.
- **BOS (Rule #4&6):** ditolak dengan alasan sama, DITAMBAH BOS saat ini PRACTICALLY BLOCKED oleh Trend (lihat "Specification Conflict: Trend") -- kalau dipakai, DRT ikut BLOCKED tanpa perlu, bertentangan dengan tujuan awal DRT dibangun lebih dulu dari PD Array/Entry Validation.

**BELUM DIPUTUSKAN -- dua UNKNOWN presisi, keduanya butuh bukti chart eksplisit:**
- **UNKNOWN 1 -- Seleksi kandidat lawan:** kalau ADA LEBIH DARI SATU StructuralPoint EXTERNAL bertipe lawan anchor yang sama-sama ACTIVE bersamaan, dan lebih dari satu berpotensi menghasilkan StructureBreakEvent yang qualifying -- yang mana yang jadi completion? Belum ada bukti chart yang eksplisit menunjukkan kasus ini terjadi, jadi TIDAK diisi tebakan (bukan "pakai yang terbaru/terdekat/FIFO" -- itu semua tebakan tanpa bukti).
- **UNKNOWN 2 -- Relasi Sweep vs Anchor:** apakah Liquidity Sweep harus mengenai LEVEL ANCHOR ITU SENDIRI (Model A: anchor terbentuk, lalu anchor itu yang di-sweep, baru StructureBreakEvent lawan terjadi) -- atau Sweep cukup terjadi di level LAIN sebagai precondition independen, tidak harus level anchor (Model B: anchor sudah ada, sweep di level manapun, lalu StructureBreakEvent). Bukti chart yang sudah diperiksa menunjukkan CAMPURAN -- beberapa contoh sweep terjadi di level lama (HOTD/Old Low) sementara anchor tampak dari swing berbeda -- tidak cukup buat memilih salah satu model.

**Catatan proses (bukan keputusan, cuma jejak metodologi):** satu ilustrasi hipotesis yang dibuat pemilik spec sendiri (bukan sumber eksternal) sempat dipakai sebagai basis analisis sebelum dikoreksi dan dibuang dari evidence -- gambar buatan sendiri tidak sah jadi bukti buat memvalidasi hipotesis sendiri. Dicatat di sini supaya tidak terulang di sesi mendatang.'''

assert content.count(OLD_SECTION) == 1, "OLD_SECTION not found exactly once: " + str(content.count(OLD_SECTION))
content = content.replace(OLD_SECTION, NEW_SECTION, 1)

marker_v06 = 'KOREKSI v0.3.6: riset variasi definisi komunitas untuk DRT & PD Array ditambahkan sebagai lampiran referensi (lihat akhir dokumen) -- BUKAN definisi operasional, DRT dan PD Array TETAP UNSPECIFIED. '
marker_v07_full = marker_v06 + 'KOREKSI v0.3.7: hasil dialog Q0-Q13 soal klasifikasi & arsitektur DRT dikunci (lihat section "DRT: Keputusan Arsitektur" sebelum Lampiran) -- Core Definition completion (Q13) MASIH menunggu analisis chart pemilik spec, BELUM final.**'

marker_v08_full = marker_v06 + 'KOREKSI v0.3.7: hasil dialog Q0-Q13 soal klasifikasi & arsitektur DRT dikunci. KOREKSI v0.3.8: setelah 3 putaran riset chart (community charts, indikator TradingView independen, chart pribadi pemilik spec), Core Definition DRT SEBAGIAN terkunci -- Anchor->Sweep->StructureBreakEvent(EXTERNAL, tipe lawan)->DRT Created. MSS dan BOS eksplisit DITOLAK sebagai completion (dependency ke Rule). Displacement dipisah jadi Quality Filter tertunda. 2 UNKNOWN presisi tersisa (seleksi kandidat lawan; relasi Sweep-Anchor) -- lihat section "DRT: Keputusan Arsitektur".**'

assert content.count(marker_v07_full) == 1, "marker_v07_full not found exactly once: " + str(content.count(marker_v07_full))
content = content.replace(marker_v07_full, marker_v08_full, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("OK: section DRT diganti v0.3.8, header diupdate.")
