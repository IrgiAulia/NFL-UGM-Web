# PRD — Perbaikan Website Nusantara Future Leaders (NFL) 2026

| | |
|---|---|
| Status | Draft final, siap implementasi |
| Pemilik | Irgi (NFL 2026 · Serikat Mahasiswa UGM) |
| Repo | `nflugm/website` |
| Terakhir diperbarui | 6 November 2026 (arsitektur: situs statis GitHub Pages + Apps Script, tanpa Node.js) |

## 1. Ringkasan

Website NFL sebelumnya adalah satu halaman statis (HTML/CSS/JS) dengan tombol **Daftar** yang mengarah ke Google Forms. Dokumen ini mendefinisikan pembangunan ulang website di atas **Next.js** yang di-*export* menjadi situs **statis** (GitHub Pages, tanpa server Node.js) dengan:

1. **Struktur halaman dan arsitektur informasi mengikuti iflhub.web.id**: beranda ringkas + subhalaman program lengkap dengan registrasi.
2. **Identitas NFL dipertahankan, tampilan diperbarui**: palet hijau hutan + emas + krem dari desain awal (header/footer hijau tua berlogo putih, hero hijau polos), dengan gaya komponen terinspirasi skydive.com (kartu putih, tombol pil), Poppins untuk teks isi dan Pilar Typeface untuk judul hero.
3. **Pendaftaran langsung di website** (bukan Google Forms), tersimpan **realtime** ke Google Spreadsheet, dengan berkas (esai motivasi PDF, esai inovasi PDF, CV, twibbon, bukti pembayaran) disimpan di Google Drive dan video dilampirkan sebagai tautan Google Drive, plus **email verifikasi otomatis** lewat Google Apps Script.
4. **Portal panitia privat** untuk mereview berkas pendaftar langsung di website; setiap penilaian ter-update ke Spreadsheet dalam hitungan detik, dan sebaliknya.
5. **Animasi scroll dan kartu** terinspirasi dari eduardbodak.com (implementasi sendiri, tanpa menyalin aset atau kode).

## 2. Latar belakang dan masalah

| Masalah sekarang | Dampak |
|---|---|
| Pendaftaran lewat Google Forms eksternal | Pengalaman terputus dari brand; tidak ada verifikasi email; data berkas tersebar |
| Berkas (esai motivasi, esai inovasi, CV, twibbon, bukti pembayaran) dikumpulkan lewat tautan Drive buatan pendaftar | Akses sering tertutup, format tidak seragam, panitia harus membuka satu per satu |
| Review dilakukan manual di Sheets/Drive | Lambat, rawan dobel kerja antar reviewer, tidak ada jejak penilaian terpusat |
| Situs satu halaman, konten tersusun di satu scroll panjang | Sulit menampilkan detail program dan status pendaftaran seperti iflhub |
| Animasi hanya fade-in sederhana | Kurang terasa premium dibanding referensi |

## 3. Sasaran, bukan-sasaran, metrik

**Sasaran**
- Calon peserta dapat mendaftar end-to-end di website dalam ≤ 10 menit, termasuk unggah berkas.
- 100% pendaftaran tercatat di Spreadsheet maksimal 5 detik setelah submit; email verifikasi terkirim otomatis.
- Panitia dapat membuka, membaca esai, melihat CV/twibbon, memberi skor dan keputusan tanpa meninggalkan website.
- Tampilan visual NFL identik dengan versi sekarang pada section yang sudah ada.

**Bukan-sasaran (tahap ini)**
- Pembayaran, CMS konten, portal peserta (login peserta), multi-bahasa.
- Penggantian desain, logo, atau copywriting resmi.
- Notifikasi WhatsApp otomatis (hanya tautan grup).

**Metrik sukses**
- Lighthouse mobile: Performance ≥ 85, Accessibility ≥ 95, SEO ≥ 95 pada beranda.
- Waktu submit → baris muncul di Sheet ≤ 5 dtk (p95); perubahan di portal → Sheet ≤ 5 dtk; perubahan di Sheet → portal ≤ 10 dtk.
- 0 pendaftar ganda per email; 0 berkas tidak valid lolos (tipe/ukuran).

## 4. Pengguna

| Persona | Kebutuhan utama |
|---|---|
| **Calon peserta** (ketua OSIS/MPK/Pramuka/PMR SMA/sederajat, 15–18 th, sebagian besar mobile) | Memahami program, tahu syarat, mendaftar mudah dari ponsel, mendapat konfirmasi jelas |
| **Panitia** (reviewer dan pengambil keputusan, satu peran) | Masuk cukup dengan token universal; antrean pendaftar yang bisa difilter, baca esai + berkas dalam satu layar, beri skor/catatan, tetapkan keputusan (Lolos/Cadangan/Tidak Lolos), kirim email hasil, tidak menabrak rekan panitia lain |

## 5. Arsitektur informasi

Mengikuti pola iflhub.web.id: **beranda ringkas** yang mengarahkan ke **subhalaman program** berisi detail, jadwal, persyaratan, status/form pendaftaran, dan FAQ.

| iflhub.web.id | Padanan NFL | Rute |
|---|---|---|
| Hero (judul, deskripsi, CTA, kartu info jadwal & lokasi) | Hero NFL (judul, subjudul, CTA Jelajahi/Daftar) | `/` |
| Tentang Organisasi | "Apa itu NFL?" + statistik | `/#tentang` |
| Lima Lensa Eksplorasi | Isu yang Diangkat (5 kartu) | `/#isu` |
| Featured Program (NSLC 2026) | Featured Program: **NFL Camp 2026** + status pendaftaran + tautan detail | `/#program` |
| (dokumentasi NFL, sudah ada di situs lama) | Cerita Perjalanan (galeri; testimoni dihapus atas permintaan panitia) | `/#cerita` |
| Subhalaman `/nslc-2026`: hero program + 4 info utama | Hero program + Tanggal, Rangkaian, Sasaran, Format | `/nfl-2026` |
| Empat Dimensi Kegiatan | Kegiatan NFL Camp (kartu bertumpuk) | `/nfl-2026#kegiatan` |
| Paket/Fasilitas Peserta | Benefit Eksklusif | `/nfl-2026#benefit` |
| Rundown | Rangkaian Acara (Pre Camp, Camp, Pasca Camp) | `/nfl-2026#agenda` |
| Timeline Seleksi | Tahapan Seleksi | `/nfl-2026#seleksi` |
| Persyaratan Peserta | Persyaratan & berkas | `/nfl-2026#syarat` |
| Status/Form Pendaftaran + modal "Pendaftaran Berhasil" | Form pendaftaran, kartu status, modal sukses | `/nfl-2026#register` |
| FAQ NSLC | FAQ NFL | `/nfl-2026#faq` |
| — | Verifikasi email | `/verifikasi` |
| — | Portal panitia (privat) | `/panitia` |

Konten yang belum ada di situs lama (mis. tanggal registrasi/seleksi, lokasi camp, grup WhatsApp) **tidak diisi tebakan**; ditampilkan "Akan diumumkan" dan dapat diubah dari satu file konten atau env var.

## 6. Persyaratan fungsional

### 6.1 Situs publik
- **F-1** Semua section lama dipertahankan dengan markup/kelas CSS yang sama (hero, tentang, isu, benefit, rangkaian acara, galeri, CTA, FAQ, footer; testimoni dihapus atas permintaan panitia).
- **F-2** Navigasi header: Tentang · Isu · Program · FAQ · Daftar↗. Menu mobile identik dengan sekarang.
- **F-3** Metadata SEO/OG per halaman, `sitemap.xml`, `robots.txt` (portal `noindex`).
- **F-4** Status pendaftaran dikendalikan konfigurasi (`REGISTRATION_OPEN`, `REGISTRATION_DEADLINE`): Buka → form; Tutup → kartu "Pendaftaran Ditutup".

### 6.2 Pendaftaran
Kolom form:

| Bagian | Field | Validasi |
|---|---|---|
| Data diri | Nama lengkap, email aktif, WhatsApp, akun Instagram | Email valid + unik; WA format Indonesia |
| Sekolah | Nama sekolah, kota/kabupaten, **provinsi** (38 provinsi), kelas | Wajib; provinsi menentukan **wilayah sesi Get To Know** secara otomatis |
| Organisasi | Nama organisasi, jabatan (harus ketua/wakil sesuai kriteria), masa jabatan | Wajib |
| Berkas & video | **Esai motivasi** (PDF ≤ 2 MB; panduan 450–800 kata, tidak dihitung otomatis), **CV** (PDF ≤ 1,5 MB), **Tautan video** (Google Drive, `drive.google.com`, ≤ 300 karakter), **Bukti twibbon** (JPG/PNG/WebP ≤ 2 MB, dikompresi di sisi klien) | Cek tipe via magic bytes + ukuran di Apps Script; tautan video dicek pola Drive saja (isinya tidak diunduh) |
| Pembayaran | **Bukti pembayaran** (JPG/PNG/WebP/PDF ≤ 2 MB; gambar dikompresi di sisi klien) | Cek tipe via magic bytes + ukuran di Apps Script |
| Persetujuan | Data benar; persetujuan pemrosesan data pribadi | Wajib dicentang |

- **F-5** Satu email = satu pendaftaran (cek di Spreadsheet).
- **F-6** Proteksi spam (diverifikasi di Apps Script): reCAPTCHA v3, honeypot, waktu isi minimum 10 dtk, satu pendaftaran per email, batas harian. Pembatasan per-IP tidak tersedia (Apps Script tidak melihat IP).
- **F-7** Setelah submit: modal "Pendaftaran Berhasil" berisi ID pendaftaran, instruksi cek email, dan tautan grup WhatsApp (jika dikonfigurasi).
- **F-8** Esai diunggah sebagai **PDF** (permintaan panitia 2026-11-06; sebelumnya diketik dan dibuat menjadi Google Docs). Video tidak diunggah ke website: pendaftar menempelkan tautan Google Drive dan mengatur aksesnya sendiri; panitia diminta memastikan tautan terbuka saat screening.

### 6.3 Verifikasi email
1. Apps Script membuat token bertanda tangan HMAC (berisi ID + kedaluwarsa 48 jam) dan mengirim email bermerek NFL dengan tautan `https://nflugm.com/verifikasi/?token=…` (hanya tautan berasal dari `SITE_URL` yang mau dikirim).
2. Pendaftar membuka tautan dan menekan **Konfirmasi Email** (aksi dari tombol, agar tidak terpicu pemindai tautan email).
3. Apps Script memverifikasi dan mengubah baris di Sheet: `Email Terverifikasi = Ya`, status `Menunggu Review`. Tidak ada email konfirmasi kedua (menghemat kuota MailApp).
4. Token kedaluwarsa → halaman menyediakan **kirim ulang** (respons selalu sama, tanpa membocorkan apakah email terdaftar; jeda 2 menit per alamat).

### 6.4 Portal panitia (privat)
- **F-9 Akses**: **satu token universal** (Script property `PANITIA_TOKEN`, minimal 20 karakter) tanpa akun per orang. Panitia memasukkan token (dan opsional nama) di `/panitia/login/`; Apps Script membandingkannya dengan waktu-konstan lalu mengembalikan **sesi bertanda tangan HMAC** (8 jam; kunci = `AUTH_SECRET` + token, sehingga **mengganti token mengeluarkan semua sesi**) yang disimpan di `sessionStorage` browser dan dikirim di setiap aksi panitia. Tanpa `PANITIA_TOKEN` portal tertutup (fail closed). Kegagalan login dibatasi secara global (10 per 15 menit) karena IP tidak terlihat. **Pemeriksaan sesi yang sebenarnya selalu di Apps Script**; gerbang di halaman hanya kenyamanan karena situs statis tidak memuat data pendaftar.
- **F-10 Hak akses**: seluruh panitia setara (skor, catatan, semua status, kirim ulang verifikasi, kirim email hasil). Konsekuensi yang diterima: satu token berarti tidak ada pembatasan atau jejak audit per orang; kolom *Direview Oleh* berisi nama yang diketik sendiri (default "Panitia") dan hanya penanda. Bila token bocor atau panitia berganti, ganti `PANITIA_TOKEN`.
- **F-11 Ruang kurasi tiga kolom** (`/panitia/`, setinggi layar, tiap kolom menggulir sendiri; di bawah 1024 px satu panel sekaligus lewat tab *Pendaftar · Berkas · Penilaian*). **Kiri**: daftar pendaftar dengan status seleksi (Lolos/Cadangan/Tidak Lolos/…), skor, dan status email; pencarian (nama/sekolah/email/ID), filter status (dengan jumlah) dan wilayah, urut terbaru/terlama/skor/nama; ↑/↓ memindah pilihan; penanda "belum disimpan". Pendaftar terpilih ada di alamat (`/panitia/?id=…`).
- **F-12 Berkas (tengah)**: identitas ringkas + panel *Profil & kontak* (lipat), tombol pendaftar sebelumnya/berikutnya, dan penampil bertab *Esai motivasi · Esai inovasi · CV · Twibbon · Bukti bayar* (PDF atau gambar) yang diambil sebagai base64 lewat Apps Script lalu ditampilkan dari `blob:` lokal; tautan video Google Drive dan folder Drive. Berkas diunduh hanya saat tabnya dibuka (jeda 200 ms agar penelusuran cepat tidak memicu unduhan), dan 16 berkas terakhir disimpan di memori sehingga bolak-balik tidak mengunduh ulang. Satu polling untuk seluruh daftar; pendaftar terpilih dibaca dari daftar itu.
- **F-13 Penilaian (kanan)**: rubrik skor **1–10** (bilangan bulat, total maksimal 30) untuk *Esai & motivasi*, *Rekam jejak kepemimpinan (CV)*, *Kontribusi/dampak*, total otomatis; catatan reviewer; status; nama pengisi + waktu otomatis. Tombol simpan selalu terlihat; isian yang belum disimpan tetap ada saat pindah ke pendaftar lain.
- **F-14 Realtime dua arah**: portal memanggil `poll` tiap 8 detik (hanya saat tab terlihat); Apps Script menjawab ringan (`changed:false`) selama penanda revisi `REV` tidak berubah. Tulis dari portal langsung ke Sheet; edit manual di Sheet menaikkan `REV` lewat trigger `onSheetEdit` sehingga tampil di portal ≤ ~10 dtk. Indikator "Live". Catatan reviewer disimpan di kolom *Catatan Reviewer*.
- **F-15 Konflik**: penyimpanan memakai *optimistic concurrency* (`Diperbarui Pada`, selalu naik); bila reviewer lain sudah mengubah baris, tampil peringatan dan data terbaru, bukan menimpa diam-diam. Penulisan diserialkan dengan `LockService`.
- **F-16 Email hasil**: panitia dapat mengirim email Lolos/Cadangan/Tidak Lolos (sekali per pendaftar kecuali "kirim lagi"; dicatat di Sheet).

## 7. Arsitektur

```
Browser ──► GitHub Pages (situs statis hasil `next build` → out/, sertifikat HTTPS otomatis)
   │
   └──► Apps Script Web App  (satu-satunya backend; POST text/plain JSON; "Execute as: Me")
          ├─ SpreadsheetApp  ── tabel "Pendaftar" (sumber kebenaran)
          ├─ DriveApp ── folder pendaftar: esai motivasi (PDF), esai inovasi (PDF), CV, twibbon, bukti pembayaran
          ├─ MailApp ── email verifikasi / hasil
          ├─ UrlFetchApp ── verifikasi reCAPTCHA v3
          ├─ LockService · CacheService · PropertiesService ── antrean tulis, batas laju, rahasia & penanda revisi
          └─ trigger onEdit ── menjaga total skor + penanda revisi saat Sheet diedit manual
```

**Mengapa Apps Script saja**: berjalan sebagai akun panitia (kuota Drive & alamat email resmi milik akun tersebut), tanpa service account, kunci JSON, proyek Cloud, maupun server. Rahasia hanya ada di Script properties; situs statis tidak memuat rahasia apa pun (variabel `NEXT_PUBLIC_*` bersifat publik).

**Kontrak API** (`POST` ke URL `/exec`, `Content-Type: text/plain`, body `{action, payload, session}`; selalu HTTP 200 dengan `{ok:true,data}` atau `{ok:false,code,error,…}`):
publik: `getConfig`, `register`, `verifyEmail`, `resendVerification`, `panitiaLogin`; panitia (butuh `session`): `poll`, `get`, `review`, `getFile`, `resendToRegistrant`, `sendDecision`. Klien: `src/lib/client/api.ts`. Server: `apps-script/Code.gs`. Konstanta dan validasi dijaga identik oleh `tests/gas/parity.test.ts`.

**Skema Sheet `Pendaftar`** (baris 1 = header, dibuat `setupSheet()`)

`ID · Waktu Daftar · Nama · Email · WhatsApp · Instagram · Sekolah · Kota/Kab · Provinsi · Wilayah · Kelas · Organisasi · Jabatan · Masa Jabatan · Link Folder · Link Esai Motivasi (PDF) · Link CV · Link Twibbon · Email Terverifikasi · Waktu Verifikasi · Status Email Verifikasi · Skor Esai · Skor Kepemimpinan · Skor Kontribusi · Total Skor · Status Seleksi · Catatan Reviewer · Direview Oleh · Diperbarui Pada · Email Hasil Terkirim · Link Video (GDrive) · Link Bukti Pembayaran · Link Esai Inovasi (PDF)`

Kolom baru hanya ditambah di paling kanan agar sheet berisi data tidak bergeser. Esai pendaftar lama (sebelum 2026-11-06) berupa Google Docs dan tetap ditampilkan portal sebagai PDF.

**Status Seleksi**: `Menunggu Verifikasi Email → Menunggu Review → Sedang Direview → Lolos | Cadangan | Tidak Lolos`.

**Batasan yang harus diketahui**
- `MailApp` Gmail biasa **100 penerima/hari** (Workspace 1.500/hari). Bila pendaftar > 100/hari, gunakan akun Workspace UGM; kegagalan terkirim dicatat di `Status Email Verifikasi` dan dapat dikirim ulang dari portal.
- Total berkas per pendaftaran dibatasi 9,5 MB (esai motivasi ≤ 2 MB + esai inovasi ≤ 2 MB + CV ≤ 1,5 MB + twibbon ≤ 2 MB + bukti pembayaran ≤ 2 MB; atur lewat `MAX_TOTAL_UPLOAD_MB`), dikirim sebagai base64 dalam JSON (±13 MB per permintaan; batas permintaan mengikuti pengaturan itu). Batas ini diambil dari praktik umum; ukuran maksimum badan POST Web App tidak terdokumentasi resmi, jadi uji unggahan terbesar di deploy asli.
- Apps Script tidak menampilkan IP pengunjung dan tidak dapat mengirim header/cookie kustom → pembatasan laju bersifat global dan sesi memakai token di `sessionStorage` (bukan cookie `HttpOnly`).
- Kuota waktu eksekusi harian Apps Script (akun Gmail biasa ±6 jam) cukup untuk polling ringan beberapa panitia; lihat `docs/SETUP-GOOGLE.md`.

## 8. Animasi dan interaksi

Animasi komponen memakai pustaka Motion (motion.dev, MIT) lewat `LazyMotion` agar bundel kecil; semuanya mati pada `prefers-reduced-motion`. Tidak ada aset, kode, atau teks dari situs rujukan yang disalin.

| Pola | Penerapan di NFL |
|---|---|
| Smooth scrolling berinersia | Seluruh situs publik; anchor menggulir halus dengan offset header |
| Judul muncul per kata dari balik mask | Judul hero (NUSANTARA / FUTURE / LEADER) dan semua judul section |
| Hero bereaksi terhadap scroll | Judul mengecil dan naik, pohon/gunungan/ring bergerak dengan kecepatan berbeda (parallax) |
| Kartu terbuka dengan *clip-path* + stagger | Kartu isu dan benefit |
| Kartu menumpuk (sticky stacking) dengan skala turun | Kegiatan NFL Camp pada `/nfl-2026` |
| Sorotan mengikuti kursor + tilt halus pada kartu | Kartu isu (desktop, pointer halus) |
| Angka menghitung naik | Statistik "Tentang" |
| Gambar parallax di dalam bingkai | Featured Program |
| Akordeon dengan transisi tinggi | FAQ dan detail acara |

Aturan: semua animasi dimatikan pada `prefers-reduced-motion`; konten tetap terlihat tanpa JavaScript; hanya `transform`/`opacity`/`clip-path` yang dianimasikan (tanpa layout thrash); tidak ada animasi yang menghalangi navigasi keyboard.

## 9. Keamanan dan privasi

- Data peserta di bawah umur: kumpulkan seperlunya, persetujuan eksplisit, akses hanya panitia pemegang token (selaras UU PDP No. 27/2022).
- Berkas tidak pernah dibuat publik; hanya terbaca lewat aksi `getFile` yang butuh sesi panitia, ditampilkan dari `blob:` lokal.
- Rahasia (`AUTH_SECRET`, `PANITIA_TOKEN`, `RECAPTCHA_SECRET`, `ROOT_FOLDER_ID`) hanya di Script properties; repo dan situs tidak memuat rahasia.
- Validasi di Apps Script (cermin skema zod di klien), tipe berkas via magic bytes (byte `base64Decode` bertanda diperhitungkan), kolom Sheet berformat teks `@` sebelum menulis (isi berawalan `= + - @` tidak pernah dievaluasi sebagai rumus), React meng-escape semua teks, HTML email di-escape, perbandingan token/secret waktu-konstan (via hash), token verifikasi dan sesi dipisah tujuannya (`verify.` vs `session.`), reCAPTCHA v3 (skor, aksi, hostname), honeypot, jeda isi minimum, satu pendaftaran per email, batas harian, tautan email hanya dari `SITE_URL`.
- Hosting statis: CSP lewat `<meta>` (tanpa `frame-ancestors`; portal menolak iframe lewat skrip), `Referrer-Policy: no-referrer` untuk halaman verifikasi, `script-src 'unsafe-inline'` diperlukan hidrasi Next.
- Masuk portal: token acak panjang (≥ 20 karakter), jeda 400 ms tiap kegagalan, batas 10 gagal/15 menit global, portal tertutup bila token belum dikonfigurasi, mengganti token mencabut semua sesi.

## 10. Persyaratan non-fungsional

- **Performa**: semua halaman publik statis; JS animasi hanya aktif di klien; `LCP < 2.5 dtk` pada 4G.
- **Aksesibilitas**: WCAG 2.2 AA — fokus terlihat, label form, `aria-live` untuk error/sukses, modal dengan focus trap dan Esc, kontras mengikuti palet asli.
- **Responsif**: breakpoint sama dengan CSS lama (1100px, 760px); form dan portal nyaman di ponsel.
- **Operasional**: tanpa server; build lolos `lint`, `typecheck`, uji unit (termasuk `Code.gs` asli di sandbox) dan uji browser; deploy lewat GitHub Actions.

## 11. Konfigurasi

Sisi situs (publik, saat build): `NEXT_PUBLIC_APPS_SCRIPT_URL`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, `NEXT_PUBLIC_SITE_URL` (lihat `.env.example`). Sisi Apps Script (Script properties): `AUTH_SECRET`, `PANITIA_TOKEN`, `ROOT_FOLDER_ID`, `SITE_URL`, `RECAPTCHA_SECRET`, `REGISTRATION_OPEN`, `REGISTRATION_DEADLINE`, `WHATSAPP_GROUP_URL`, dll. Panduan: `docs/SETUP-GOOGLE.md` dan `docs/DEPLOY-GITHUB-PAGES.md`.

## 12. Rencana rilis

| Tahap | Isi | Kriteria selesai |
|---|---|---|
| M1 | Port situs ke Next.js (kelas CSS sama), struktur beranda + `/nfl-2026` | Tampilan section lama identik pada 3 lebar layar |
| M2 | Animasi scroll/kartu | Reduced-motion & no-JS terverifikasi |
| M3 | Pendaftaran + verifikasi email | Uji browser lulus |
| M4 | Backend Apps Script + export statis | Uji harness `Code.gs` + uji browser terhadap mock lulus; uji dengan kredensial asli (butuh akun panitia) |
| M5 | Portal panitia | Masuk dengan token, review, simpan, realtime, konflik terverifikasi |
| M6 | Hardening, dokumentasi, deploy GitHub Pages | Checklist keamanan dan uji akhir lulus di nflugm.com |

## 13. Risiko dan asumsi

| Risiko / asumsi | Mitigasi |
|---|---|
| Layanan Google (Drive/Mail/reCAPTCHA) hanya dapat diuji penuh dengan akun asli | Code.gs diuji di sandbox dengan tiruan yang meniru perilaku penting (byte bertanda, format sel, batas grid, lock); uji akhir `SETUP-GOOGLE.md` bagian 5 dijalankan setelah deploy |
| Perilaku CORS/redirect Web App sungguhan | Uji `curl` dengan header Origin (bagian 5 langkah 2) dan uji pendaftaran nyata sebelum diumumkan |
| Kuota email Gmail 100/hari | Gunakan Workspace; status gagal tercatat; kirim ulang dari portal |
| Kuota waktu eksekusi Apps Script | Polling ringan, berhenti saat tab tersembunyi; pantau di dashboard Apps Script |
| Pelajar menunda sampai menit akhir (lonjakan) | Halaman statis; penulisan diserialkan lock (±1–3 dtk/pendaftar), batas harian dapat diatur |
| `gambar-4.jpeg` dirujuk skrip lama tetapi tidak ada di repo | Galeri memakai 4 foto yang ada; tambah berkas lalu daftarkan di `src/content/site.ts` |
| Foto galeri masih foto ilustrasi | Tetap diberi label ilustrasi sampai diganti panitia |

## 14. Pertanyaan terbuka (butuh keputusan/data dari Irgi)

1. Pembuatan Spreadsheet/folder/Apps Script + reCAPTCHA oleh akun panitia (langkah di `docs/SETUP-GOOGLE.md`), serta akun pengirim email (Gmail biasa vs Workspace).
2. Siapa saja yang menerima `PANITIA_TOKEN` dan lewat kanal apa.
3. Tanggal registrasi, screening, pengumuman, dan lokasi camp; tautan grup WhatsApp resmi.
4. Berkas wajib kini esai motivasi (PDF, 450–800 kata), esai inovasi (PDF, 1000–1500 kata), CV, twibbon, bukti pembayaran, dan tautan video; rentang kata esai hanya panduan di formulir (tidak dihitung otomatis). Rekening pembayaran (Bank Mandiri 1370016308617 a.n. WELLA APRILLIANA PUTRI) tampil di formulir dan FAQ; nominal biaya pendaftaran belum dicantumkan di situs.
