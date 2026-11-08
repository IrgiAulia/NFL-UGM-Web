# Panduan Setup Google (Apps Script sebagai backend tunggal)

Dikerjakan **sekali** oleh akun Google panitia (disarankan akun Workspace UGM atau Gmail khusus NFL). Estimasi 20–30 menit. Website sendiri statis dan dihosting di GitHub Pages (lihat [`DEPLOY-GITHUB-PAGES.md`](DEPLOY-GITHUB-PAGES.md)); **semua yang dinamis** (pendaftaran, verifikasi email, portal panitia) dijalankan oleh satu skrip Apps Script yang terikat ke Spreadsheet.

> Tidak perlu proyek Google Cloud, service account, kunci JSON, maupun Node.js di server.
> **Jangan menempelkan rahasia ke chat, issue, atau commit.** Semua rahasia diisi langsung di *Script properties* Apps Script.

## 0. Daftar kebutuhan

| # | Apa | Dari mana | Rahasia? | Disimpan di |
|---|---|---|---|---|
| 1 | Akun Google panitia | Gmail khusus NFL / Workspace UGM | password: ya | dipegang panitia |
| 2 | Spreadsheet "NFL 2026 — Pendaftar" | dibuat di langkah 1 | akses dibatasi | Google Drive |
| 3 | `ROOT_FOLDER_ID` | URL folder Drive "NFL 2026 — Berkas" | tidak | Script property |
| 4 | `AUTH_SECRET`, `PANITIA_TOKEN` | menu **NFL 2026 → Buat rahasia acak** | **ya** | Script property (token juga dibagikan ke panitia lewat kanal tertutup) |
| 5 | reCAPTCHA v3: *site key* + *secret key* | <https://www.google.com/recaptcha/admin> | secret: **ya** | secret → Script property `RECAPTCHA_SECRET`; site key (publik) → variabel repo GitHub |
| 6 | URL Web App (`…/exec`) | langkah 4 | tidak (publik, semua aksi dijaga) | variabel repo GitHub `NEXT_PUBLIC_APPS_SCRIPT_URL` |

Siapa boleh apa: Apps Script berjalan **sebagai akun panitia** (membuat folder/Docs/berkas di Drive miliknya, mengirim email dari alamatnya). Pengunjung hanya bisa memanggil aksi publik (`getConfig`, `register`, `verifyEmail`, `resendVerification`, `panitiaLogin`); aksi panitia (`poll`, `get`, `review`, `getFile`, `resendToRegistrant`, `sendDecision`) menolak tanpa sesi bertanda tangan HMAC.

## 1. Spreadsheet dan folder Drive

1. Buat Spreadsheet **NFL 2026 — Pendaftar**; ganti nama tab pertama menjadi `Pendaftar`.
2. Buat folder Drive **NFL 2026 — Berkas**. ID folder = bagian URL `…/folders/`**`<ID>`**.

## 2. Pasang Apps Script

1. Di Spreadsheet: **Extensions → Apps Script**.
2. Ganti isi `Code.gs` dengan [`apps-script/Code.gs`](../apps-script/Code.gs). **Project Settings → Show "appsscript.json"** lalu ganti isinya dengan [`apps-script/appsscript.json`](../apps-script/appsscript.json).
3. **Project Settings → Script properties** → tambahkan:

   | Properti | Nilai |
   |---|---|
   | `ROOT_FOLDER_ID` | ID folder Drive (langkah 1) |
   | `SITE_URL` | `https://nflugm.com` (tautan verifikasi di luar domain ini **ditolak**) |
   | `RECAPTCHA_SECRET` | *secret key* reCAPTCHA v3 (langkah 3) |
   | `REGISTRATION_OPEN` | opsional: `true` (bawaan) / `false` untuk menutup pendaftaran seketika |
   | `REGISTRATION_DEADLINE` | opsional, mis. `2026-11-20T23:59:00+07:00` |
   | `WHATSAPP_GROUP_URL` | opsional, tautan grup peserta |
   | `SENDER_NAME`, `REPLY_TO` | opsional |
   | `DAILY_REGISTRATION_LIMIT` | opsional, bawaan 300/hari |
   | `MAX_TOTAL_UPLOAD_MB` | opsional, batas total lima berkas per pendaftar, bawaan 9,5 (esai motivasi 2 + esai inovasi 2 + CV 1,5 + twibbon 2 + bukti pembayaran 2) |

4. Pilih fungsi **`setupSheet`** → Run (otorisasi akun; layar "belum diverifikasi" → *Advanced → Go to … (unsafe)* wajar untuk skrip milik sendiri). Ini memasang header, format teks (mencegah formula injection), validasi skor 1–10 dan dropdown status, pewarnaan, baris beku, dan trigger `onSheetEdit`.
5. Muat ulang Spreadsheet → menu **NFL 2026 → Buat rahasia acak**: membuat `AUTH_SECRET` (tidak ditampilkan) dan `PANITIA_TOKEN` (**ditampilkan sekali** — salin sekarang dan bagikan ke panitia lewat kanal tertutup). Token tetap bisa dilihat di Script properties oleh pemilik skrip.
6. Menu **NFL 2026 → Periksa pengaturan** → harus melapor semua wajib terisi dan menampilkan sisa kuota email.

## 3. reCAPTCHA v3

1. <https://www.google.com/recaptcha/admin/create> → jenis **reCAPTCHA v3**, domain: `nflugm.com` dan `www.nflugm.com`.
2. *Secret key* → Script property `RECAPTCHA_SECRET`. *Site key* → variabel repo GitHub `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` (publik).
3. Apps Script memverifikasi tiap pendaftaran (skor ≥ 0,5, aksi `register`, hostname situs). Ambang dapat diubah lewat `RECAPTCHA_MIN_SCORE`; hostname lain lewat `ALLOWED_HOSTNAMES`.

## 4. Deploy Web App

**Deploy → New deployment → Web app** → *Execute as*: **Me**, *Who has access*: **Anyone** → salin URL `/exec`.
Setiap mengubah `Code.gs`: **Deploy → Manage deployments → Edit → New version** (URL tetap sama).
Isi variabel repo GitHub (Settings → Secrets and variables → Actions → **Variables**):
`NEXT_PUBLIC_APPS_SCRIPT_URL` dan `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`. Lanjut ke [`DEPLOY-GITHUB-PAGES.md`](DEPLOY-GITHUB-PAGES.md).

## 5. Uji akhir (checklist)

1. `curl -sL "$URL" | head` → `{"ok":true,"data":{"service":"nfl-apps-script",…}}`.
2. Uji CORS (harus ada `access-control-allow-origin`): `curl -sI -X POST "$URL" -H 'Content-Type: text/plain' -H 'Origin: https://nflugm.com' -d '{"action":"getConfig"}'` lalu ikuti redirect `Location` dengan `curl -sI -H 'Origin: https://nflugm.com' <Location>`.
3. Buka situs → `/nfl-2026/`: status pendaftaran terbaca dari server.
4. Daftar dengan email sendiri: baris baru di Sheet (*Menunggu Verifikasi Email*), folder + lima berkas (esai motivasi PDF, esai inovasi PDF, CV, twibbon, bukti pembayaran) di Drive, tautan video di kolom *Link Video (GDrive)*, email verifikasi masuk (cek Spam). Kolom WhatsApp tetap berbentuk `62…` (teks).
5. Klik tautan email → **Konfirmasi Email** → Sheet: `Email Terverifikasi = Ya`, status *Menunggu Review*.
6. `/panitia/` → token → buka pendaftar → tab Esai, CV, Twibbon, dan Bukti Bayar tampil dan tautan video terbuka → beri skor 1–10 → Simpan; Sheet ter-update (total maksimal 30).
7. Ubah *Status Seleksi* langsung di Sheet → portal ikut berubah ≤ ~10 dtk (badge **Live**).
8. Set *Lolos* → kirim email hasil → kolom *Email Hasil Terkirim* terisi.
9. Ganti `PANITIA_TOKEN` di Script properties → sesi lama langsung keluar; token lama ditolak.

## Operasional dan batasan

- **Kuota email** (`MailApp`): Gmail biasa 100/hari, Workspace 1.500/hari. Bila gagal, kolom *Status Email Verifikasi* berisi `Gagal …` dan panitia bisa **Kirim ulang** dari portal.
- **Kuota Apps Script**: akun Gmail biasa sekitar 6 jam waktu eksekusi/hari. Polling portal hanya membaca satu penanda revisi (ringan) dan berhenti saat tab tersembunyi.
- **Waktu kirim pendaftaran**: mengunggah lima berkas (hingga ±13 MB dalam base64) lalu membuat folder dan berkas di Drive butuh ±10–40 dtk, tergantung koneksi pendaftar; form menampilkan "Mengirim…". Maksimal 180 dtk sebelum dianggap gagal (data tidak hilang; ulangi kirim).
- **Jangan** menyisipkan kolom di tengah atau mengubah urutan/judul header; kolom baru hanya di **paling kanan** (kontrak dengan `Code.gs`, diuji di `tests/gas/parity.test.ts`).
- Edit manual di Sheet aman (trigger menghitung total dan menaikkan penanda revisi). Dua orang menyimpan baris yang sama bersamaan → portal menampilkan peringatan konflik.
- Rotasi: ganti `AUTH_SECRET` mengeluarkan semua sesi **dan** membatalkan tautan verifikasi lama (pendaftar bisa minta kirim ulang); ganti `PANITIA_TOKEN` mengeluarkan semua sesi.
- Apps Script tidak melihat alamat IP pengunjung, sehingga pembatasan laju bersifat **global** (mis. 10 gagal login/15 menit untuk semua orang) dan tidak per-IP. Perlindungan utama pendaftaran: reCAPTCHA v3, honeypot, jeda isi minimum 10 dtk, satu pendaftaran per email, batas harian.
- Data pendaftar adalah data pribadi (sebagian di bawah umur): batasi akses Spreadsheet/folder ke panitia inti dan hapus data sesuai kebijakan setelah acara.

## Memperbarui Code.gs yang sudah terpasang

Dipakai setiap kali `apps-script/Code.gs` berubah (mis. saat formulir menambah berkas/kolom). Pendaftar yang sudah ada **tidak** terpengaruh: kolom baru selalu di paling kanan dan baris lama dibiarkan.

1. Di editor Apps Script: ganti isi `Code.gs` dengan [`apps-script/Code.gs`](../apps-script/Code.gs); **Project Settings → Show "appsscript.json"** lalu ganti isinya dengan [`apps-script/appsscript.json`](../apps-script/appsscript.json) (izin Google Docs tidak lagi diperlukan).
2. Pilih fungsi **`setupSheet`** → Run. Ini aman diulang: memperbarui header (menambah *Link Esai Inovasi (PDF)* di kolom paling kanan dan mengganti judul *Link Esai (PDF)* menjadi *Link Esai Motivasi (PDF)*), validasi skor 1–10, dan perlindungan kolom, tanpa menghapus data.
3. **Deploy → Manage deployments → Edit → New version** (URL `/exec` tetap sama).
4. Terbitkan situs versi baru **segera setelah** langkah 3 (merge ke `main` → workflow *Deploy*). Selama beberapa menit di antara keduanya pendaftaran dari situs lama ditolak server baru (dan sebaliknya); untuk menghindari galat, set `REGISTRATION_OPEN` = `false` lebih dulu, lalu kembalikan ke `true` setelah situs baru tayang.
5. Uji dengan checklist bagian 5 (butir 4 dan 6 khususnya).

Catatan perubahan skala nilai: skor lama 1–5 tetap valid pada skala 1–10 tetapi **tidak sebanding** dengan skor baru; nilai ulang bila perlu. Esai pendaftar lama (Google Docs) tetap tampil di portal sebagai PDF.
