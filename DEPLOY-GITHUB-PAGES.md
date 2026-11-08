# Deploy ke GitHub Pages (nflugm.com) tanpa Node.js

Situs di-build menjadi folder statis `out/` oleh GitHub Actions ([`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)) dan disajikan GitHub Pages. Tidak ada server Node.js. Backend = Apps Script ([`SETUP-GOOGLE.md`](SETUP-GOOGLE.md)).

## 1. Variabel repo (publik) — sekali

Settings → Secrets and variables → Actions → tab **Variables**:

| Variabel | Isi |
|---|---|
| `NEXT_PUBLIC_APPS_SCRIPT_URL` | URL Web App Apps Script (`https://script.google.com/macros/s/…/exec`) |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | *site key* reCAPTCHA v3 |

Workflow **menolak deploy** bila keduanya kosong/salah bentuk (mencegah situs tayang tanpa backend). Mengubah nilai ini = jalankan ulang workflow (Actions → *Deploy ke GitHub Pages* → Run workflow), karena ditanam saat build.

## 2. Cutover aman (situs lama tidak pernah mati)

Situs lama (HTML statis) disajikan dari branch `main`. Agar `main` bisa diganti tanpa jeda dan mudah dibatalkan:

1. Buat branch **`legacy`** dari `main` yang sekarang (isinya situs lama + `CNAME`).
2. Settings → Pages → *Source*: **Deploy from a branch** → `legacy` / `(root)`. Situs tetap tampil seperti semula; domain tetap `nflugm.com`.
3. Gabungkan PR Next.js ke `main` (tidak memengaruhi situs live karena sumber Pages sedang `legacy`). Workflow *Deploy* akan berjalan di `main` tetapi tahap deploy-nya gagal selama sumber Pages belum "GitHub Actions" (wajar; situs live tidak berubah).
4. Pastikan Apps Script sudah di-deploy dan variabel repo terisi (bagian 1), lalu uji build `main` (artifact workflow).
5. Settings → Pages → *Source*: **GitHub Actions**. Jalankan ulang workflow *Deploy ke GitHub Pages* bila perlu → situs baru tayang.
6. Uji akhir (`SETUP-GOOGLE.md` bagian 5) di `https://nflugm.com`.

**Rollback** (< 1 menit): Settings → Pages → *Source* → **Deploy from a branch** → `legacy`. Situs lama kembali tayang; data pendaftar yang sudah masuk Sheet tidak terpengaruh.

## 3. Domain dan sertifikat HTTPS

Sertifikat dikeluarkan dan diperbarui **otomatis** oleh GitHub Pages (Let's Encrypt) selama DNS benar. Yang perlu ada:

| Nama | Jenis | Nilai |
|---|---|---|
| `nflugm.com` (apex) | A | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` |
| `nflugm.com` (apex) | AAAA | `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` |
| `www` | CNAME | `nflugm.github.io` |

(Periksa nilai terbaru di dokumentasi GitHub Pages "Managing a custom domain" sebelum mengubah DNS.)

1. Settings → Pages → *Custom domain*: `nflugm.com` (berkas `CNAME` ikut ke build dari `public/CNAME`).
2. Centang **Enforce HTTPS** setelah muncul "DNS check successful" dan sertifikat terbit (bisa sampai ±1 jam; jika tombol abu-abu, hapus lalu isi ulang custom domain).
3. Disarankan **verifikasi domain** (Settings akun/organisasi → Pages → Add a domain, tambahkan rekaman TXT `_github-pages-challenge-…`) agar domain tidak bisa dibajak repo lain.
4. Jangan ada rekaman A/AAAA/CNAME lain ke host berbeda untuk `nflugm.com`/`www` (merusak penerbitan sertifikat).
5. Workflow **Pantau sertifikat HTTPS** (tiap Senin) gagal bila sertifikat < 14 hari atau HTTP tidak dialihkan ke HTTPS → GitHub mengirim email.

## 4. Batasan hosting statis

- GitHub Pages tidak bisa mengirim header HTTP khusus. CSP dipasang lewat `<meta>` (tanpa `frame-ancestors`); portal panitia menolak tampil dalam iframe lewat skrip. Header seperti HSTS dikelola GitHub.
- `script-src 'unsafe-inline'` diperlukan oleh skrip hidrasi Next; tidak ada HTML buatan pengguna yang dirender (React meng-escape semua teks).
- Rute dinamis tidak ada: ID pendaftar dan token verifikasi dibaca dari query (`/panitia/?id=…`, `/verifikasi/?token=…`; tautan lama `/panitia/pendaftar/?id=…` dialihkan).
- Batas GitHub Pages: situs ≤ 1 GB, ±100 GB transfer/bulan (soft) — jauh di atas kebutuhan.
