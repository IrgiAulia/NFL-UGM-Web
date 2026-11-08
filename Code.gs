/**
 * NFL 2026 — Google Apps Script (backend tunggal website statis)
 *
 * Dipasang sebagai script TERIKAT pada Spreadsheet pendaftaran (Extensions → Apps Script) dan
 * di-deploy sebagai Web App ("Execute as: Me", "Who has access: Anyone"). Website (GitHub Pages)
 * memanggilnya langsung dari browser: POST dengan Content-Type text/plain (tanpa preflight CORS),
 * body JSON {action, payload, session}. Setiap respons berstatus HTTP 200 dengan bentuk
 *   {ok:true, data:…}  atau  {ok:false, code:"…", error:"…", …}
 * Panduan lengkap: docs/SETUP-GOOGLE.md
 *
 * Script Properties (Project Settings → Script properties). Wajib:
 *   AUTH_SECRET        ≥ 16 karakter acak: kunci tanda tangan token verifikasi & sesi panitia
 *   PANITIA_TOKEN      ≥ 20 karakter acak: token universal masuk portal /panitia (kosong = portal tertutup)
 *   ROOT_FOLDER_ID     ID folder Drive induk berkas pendaftar
 *   SITE_URL           mis. https://nflugm.com (dipakai tautan verifikasi; tautan lain ditolak)
 *   RECAPTCHA_SECRET   secret key reCAPTCHA v3 (atau RECAPTCHA_DISABLED=true hanya untuk uji)
 * Opsional:
 *   REGISTRATION_OPEN       "true" (bawaan) / "false"
 *   REGISTRATION_DEADLINE   ISO 8601, mis. 2026-11-20T23:59:00+07:00
 *   WHATSAPP_GROUP_URL      tautan grup WhatsApp peserta
 *   SENDER_NAME, REPLY_TO   pengirim & alamat balasan email
 *   SHEET_TAB               nama tab (bawaan "Pendaftar")
 *   RECAPTCHA_MIN_SCORE     ambang skor (bawaan 0.5)
 *   ALLOWED_HOSTNAMES       daftar hostname yang diterima reCAPTCHA, dipisah koma (bawaan: host SITE_URL + www)
 *   MAX_TOTAL_UPLOAD_MB     batas total unggahan lima berkas (bawaan 9.5)
 *   DAILY_REGISTRATION_LIMIT  batas pendaftaran per hari (bawaan 300)
 *
 * Fungsi yang bisa dijalankan dari editor / menu Spreadsheet: setupSheet, generateSecrets, checkSetup.
 */

// ───────────── Konstanta (sinkron dengan src/lib/registration/*, diuji tests/gas/parity.test.ts) ─────────────
var STATUSES = ['Menunggu Verifikasi Email', 'Menunggu Review', 'Sedang Direview', 'Lolos', 'Cadangan', 'Tidak Lolos'];
var FINAL = ['Lolos', 'Cadangan', 'Tidak Lolos'];
var COLUMNS = [
  ['id', 'ID'], ['createdAt', 'Waktu Daftar'], ['fullName', 'Nama Lengkap'], ['email', 'Email'],
  ['whatsapp', 'WhatsApp'], ['instagram', 'Instagram'], ['schoolName', 'Sekolah'], ['city', 'Kota/Kabupaten'],
  ['province', 'Provinsi'], ['region', 'Wilayah'], ['grade', 'Kelas'], ['orgName', 'Organisasi'],
  ['orgPosition', 'Jabatan'], ['orgTerm', 'Masa Jabatan'], ['folderUrl', 'Link Folder'], ['essayUrl', 'Link Esai Motivasi (PDF)'],
  ['cvUrl', 'Link CV'], ['twibbonUrl', 'Link Twibbon'], ['emailVerified', 'Email Terverifikasi'],
  ['verifiedAt', 'Waktu Verifikasi'], ['emailStatus', 'Status Email Verifikasi'], ['scoreEssay', 'Skor Esai'],
  ['scoreLeadership', 'Skor Kepemimpinan'], ['scoreContribution', 'Skor Kontribusi'], ['totalScore', 'Total Skor'],
  ['status', 'Status Seleksi'], ['notes', 'Catatan Reviewer'], ['reviewedBy', 'Direview Oleh'],
  ['updatedAt', 'Diperbarui Pada'], ['decisionEmailSentAt', 'Email Hasil Terkirim'],
  // Kolom baru hanya boleh di paling kanan (sheet yang sudah berisi data tidak boleh bergeser).
  ['videoUrl', 'Link Video (GDrive)'], ['paymentUrl', 'Link Bukti Pembayaran'], ['innovationUrl', 'Link Esai Inovasi (PDF)']
];
var NUMERIC_KEYS = ['scoreEssay', 'scoreLeadership', 'scoreContribution', 'totalScore'];

var GRADES = ['X', 'XI', 'XII'];
var POSITIONS = ['Ketua', 'Wakil Ketua', 'Pengurus Inti Lainnya'];
var MIN_SCORE = 1;
var MAX_SCORE = 10;
var MAX_TOTAL_SCORE = 30; // tiga kriteria × MAX_SCORE
var VIDEO_URL_MAX = 300;
// Tautan Google Drive (file, folder, open?id=, uc?id=) di drive.google.com saja — cermin DRIVE_LINK_RE di src/lib/registration/schema.ts.
var DRIVE_LINK_RE = /^https:\/\/drive\.google\.com\/(?:[^\s?#]*\/(?:d|folders)\/[A-Za-z0-9_-]{10,}|(?:open|uc)\?(?:[^\s#]*&)?id=[A-Za-z0-9_-]{10,})\S*$/;
var MB = 1024 * 1024;
var IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
var FILE_KINDS = ['essay', 'innovation', 'cv', 'twibbon', 'payment'];
// label = nama di pesan galat; fileLabel = nama berkas di Drive.
var FILE_RULES = {
  essay: { label: 'Esai motivasi', fileLabel: 'Esai Motivasi', mimes: ['application/pdf'], maxBytes: 2 * MB, typeMessage: 'Esai motivasi harus berupa file PDF' },
  innovation: { label: 'Esai inovasi', fileLabel: 'Esai Inovasi', mimes: ['application/pdf'], maxBytes: 2 * MB, typeMessage: 'Esai inovasi harus berupa file PDF' },
  cv: { label: 'CV', fileLabel: 'CV', mimes: ['application/pdf'], maxBytes: 1.5 * MB, typeMessage: 'CV harus berupa file PDF' },
  twibbon: { label: 'Bukti twibbon', fileLabel: 'Twibbon', mimes: IMAGE_MIMES, maxBytes: 2 * MB, typeMessage: 'Bukti twibbon harus berupa gambar JPG, PNG, atau WebP' },
  payment: { label: 'Bukti pembayaran', fileLabel: 'Bukti Pembayaran', mimes: IMAGE_MIMES.concat(['application/pdf']), maxBytes: 2 * MB, typeMessage: 'Bukti pembayaran harus berupa gambar JPG, PNG, WebP, atau file PDF' }
};
var GOOGLE_DOC_MIME = 'application/vnd.google-apps.document'; // esai pendaftar lama (sebelum esai berupa PDF)
var EXT_BY_MIME = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

var VERIFY_TTL_SECONDS = 48 * 3600;
var SESSION_TTL_SECONDS = 8 * 3600;
var MIN_FILL_MS = 10000;
var MIN_TOKEN_LENGTH = 20;
var LOGIN_MAX_FAILS = 10;
var LOGIN_WINDOW_SECONDS = 900;
var RESEND_COOLDOWN_SECONDS = 120;
var ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
var ID_RE = /^NFL26-[A-Z2-9]{6}$/;
var TZ = 'Asia/Jakarta';

var PROVINCE_REGION = (function () {
  var groups = {
    'Sumatera': ['Aceh', 'Sumatera Utara', 'Sumatera Barat', 'Riau', 'Kepulauan Riau', 'Jambi', 'Sumatera Selatan', 'Kepulauan Bangka Belitung', 'Bengkulu', 'Lampung'],
    'Jawa': ['DKI Jakarta', 'Banten', 'Jawa Barat', 'Jawa Tengah', 'DI Yogyakarta', 'Jawa Timur'],
    'Kalimantan': ['Kalimantan Barat', 'Kalimantan Tengah', 'Kalimantan Selatan', 'Kalimantan Timur', 'Kalimantan Utara'],
    'Sulawesi & Papua': ['Sulawesi Utara', 'Gorontalo', 'Sulawesi Tengah', 'Sulawesi Barat', 'Sulawesi Selatan', 'Sulawesi Tenggara', 'Papua', 'Papua Barat', 'Papua Barat Daya', 'Papua Selatan', 'Papua Tengah', 'Papua Pegunungan'],
    'Nusa Tenggara, Bali, dan Maluku': ['Bali', 'Nusa Tenggara Barat', 'Nusa Tenggara Timur', 'Maluku', 'Maluku Utara']
  };
  var map = {};
  Object.keys(groups).forEach(function (region) { groups[region].forEach(function (p) { map[p] = region; }); });
  return map;
})();

// ───────────── Utilitas umum ─────────────
function ApiError_(code, message, extra) {
  this.name = 'ApiError';
  this.code = code;
  this.message = message;
  this.extra = extra || {};
}
ApiError_.prototype = Object.create(Error.prototype);

function fail_(code, message, extra) { return new ApiError_(code, message, extra); }

function prop_(name, fallback) {
  var v = PropertiesService.getScriptProperties().getProperty(name);
  return v ? v : (fallback === undefined ? '' : fallback);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function str_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function colIndex_(key) { // 1-based
  for (var i = 0; i < COLUMNS.length; i++) if (COLUMNS[i][0] === key) return i + 1;
  throw new Error('Kolom tidak dikenal: ' + key);
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function bytesEqual_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= (a[i] ^ b[i]);
  return diff === 0;
}

function sha256_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
}

/** Perbandingan waktu-konstan lewat hash SHA-256 (panjang input tidak bocor). */
function safeEqual_(a, b) {
  return bytesEqual_(sha256_(String(a)), sha256_(String(b)));
}

function b64uEncodeBytes_(bytes) { return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, ''); }
function b64uEncodeString_(s) { return Utilities.base64EncodeWebSafe(s, Utilities.Charset.UTF_8).replace(/=+$/, ''); }
function b64uDecodeToString_(s) {
  var padded = String(s);
  while (padded.length % 4 !== 0) padded += '=';
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString('UTF-8');
}

function hmac_(purpose, data, keyMaterial) {
  var sig = Utilities.computeHmacSha256Signature(purpose + '.' + data, keyMaterial);
  return b64uEncodeBytes_(sig);
}

function nowMs_() { return Date.now(); }
function nowIso_() { return new Date().toISOString(); }
function dayKey_() { return Utilities.formatDate(new Date(), TZ, 'yyyyMMdd'); }

function lockedRun_(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (err) {
    throw fail_('busy', 'Server sedang sibuk. Coba lagi beberapa detik lagi.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** Pencacah harian di Script Properties (dipanggil di dalam lock). Mengembalikan false bila batas terlampaui. */
function dailyCount_(name, limit) {
  var props = PropertiesService.getScriptProperties();
  var key = 'CNT_' + name + '_' + dayKey_();
  var n = Number(props.getProperty(key) || 0);
  if (n >= limit) return false;
  props.setProperty(key, String(n + 1));
  return true;
}

function newRegistrationId_() {
  var hex = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  var s = '';
  for (var i = 0; i < 6; i++) s += ID_ALPHABET.charAt(parseInt(hex.substr(i * 2, 2), 16) % ID_ALPHABET.length);
  return 'NFL26-' + s;
}

// ───────────── Web App ─────────────
function doGet() {
  return json_({ ok: true, data: { service: 'nfl-apps-script', time: nowIso_() } });
}

var PUBLIC_ACTIONS = {
  getConfig: function () { return getConfig_(); },
  register: function (p) { return register_(p); },
  verifyEmail: function (p) { return verifyEmail_(p); },
  resendVerification: function (p) { return resendVerificationPublic_(p); },
  panitiaLogin: function (p) { return panitiaLogin_(p); }
};

var PANITIA_ACTIONS = {
  poll: function (p) { return poll_(p); },
  get: function (p) { return getRegistration_(p); },
  review: function (p, s) { return review_(p, s); },
  getFile: function (p) { return getFile_(p); },
  resendToRegistrant: function (p, s) { return resendToRegistrant_(p, s); },
  sendDecision: function (p) { return sendDecision_(p); }
};

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents ? String(e.postData.contents) : '';
    if (raw.length > maxRequestBytes_()) throw fail_('too_large', 'Data terlalu besar.');
    var req;
    try { req = JSON.parse(raw); } catch (err) { throw fail_('bad_request', 'Permintaan tidak valid.'); }
    if (!req || typeof req !== 'object' || Array.isArray(req)) throw fail_('bad_request', 'Permintaan tidak valid.');
    var action = String(req.action || '');
    var payload = req.payload && typeof req.payload === 'object' ? req.payload : {};

    if (Object.prototype.hasOwnProperty.call(PUBLIC_ACTIONS, action)) return json_({ ok: true, data: PUBLIC_ACTIONS[action](payload) });
    if (Object.prototype.hasOwnProperty.call(PANITIA_ACTIONS, action)) {
      var session = requireSession_(req.session);
      return json_({ ok: true, data: PANITIA_ACTIONS[action](payload, session) });
    }
    throw fail_('unknown_action', 'Aksi tidak dikenal.');
  } catch (err) {
    if (err instanceof ApiError_) {
      var out = { ok: false, code: err.code, error: err.message };
      Object.keys(err.extra).forEach(function (k) { out[k] = err.extra[k]; });
      return json_(out);
    }
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, code: 'server', error: 'Terjadi kesalahan di server. Coba lagi beberapa saat lagi.' });
  }
}

// ───────────── Konfigurasi & status pendaftaran ─────────────
function registrationDeadline_() {
  var raw = prop_('REGISTRATION_DEADLINE').trim();
  if (!raw) return null;
  var d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function isOpen_() {
  if (prop_('REGISTRATION_OPEN', 'true').trim().toLowerCase() === 'false') return false;
  var d = registrationDeadline_();
  return !(d && new Date().getTime() > d.getTime());
}

function getConfig_() {
  var d = registrationDeadline_();
  return { open: isOpen_(), deadline: d ? d.toISOString() : '', whatsappGroupUrl: prop_('WHATSAPP_GROUP_URL').trim() };
}

// ───────────── Validasi pendaftaran (cermin src/lib/registration/schema.ts) ─────────────
var EMAIL_RE = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;

function normalizeWhatsapp_(raw) {
  var digits = String(raw).replace(/[^\d+]/g, '').replace(/^\+/, '');
  return digits.indexOf('0') === 0 ? '62' + digits.slice(1) : digits;
}

function normalizeInstagram_(raw) {
  var handle = String(raw).trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[\/?].*$/, '').replace(/^@/, '');
  return handle ? '@' + handle : '';
}

function validateRegistration_(raw) {
  var errors = {};
  var v = {};
  function isStr(x) { return typeof x === 'string'; }
  function text(key, label, min, max) {
    var x = raw[key];
    if (!isStr(x)) { errors[key] = label + ' wajib diisi'; return; }
    x = x.trim();
    v[key] = x;
    if (x.length < min) errors[key] = label + ' wajib diisi';
    else if (x.length > max) errors[key] = label + ' maksimal ' + max + ' karakter';
  }
  text('fullName', 'Nama lengkap', 3, 100);

  if (!isStr(raw.email)) errors.email = 'Email wajib diisi';
  else {
    var email = raw.email.trim().toLowerCase();
    v.email = email;
    if (email.length > 160) errors.email = 'Email terlalu panjang';
    else if (!EMAIL_RE.test(email)) errors.email = 'Format email tidak valid';
  }

  if (!isStr(raw.whatsapp)) errors.whatsapp = 'Nomor WhatsApp wajib diisi';
  else {
    v.whatsapp = normalizeWhatsapp_(raw.whatsapp.trim());
    if (!/^628\d{7,12}$/.test(v.whatsapp)) errors.whatsapp = 'Gunakan nomor WhatsApp Indonesia, mis. 0812xxxxxxx';
  }

  if (!isStr(raw.instagram)) errors.instagram = 'Akun Instagram wajib diisi';
  else {
    v.instagram = normalizeInstagram_(raw.instagram.trim());
    if (!/^@[A-Za-z0-9._]{1,30}$/.test(v.instagram)) errors.instagram = 'Akun Instagram tidak valid, mis. @nfl.ugm';
  }

  text('schoolName', 'Nama sekolah', 3, 120);
  text('city', 'Kota/kabupaten', 2, 80);
  if (!isStr(raw.province) || !Object.prototype.hasOwnProperty.call(PROVINCE_REGION, raw.province)) errors.province = 'Pilih provinsi';
  else v.province = raw.province;
  if (GRADES.indexOf(raw.grade) < 0) errors.grade = 'Pilih kelas';
  else v.grade = raw.grade;
  text('orgName', 'Nama organisasi', 2, 100);
  if (POSITIONS.indexOf(raw.orgPosition) < 0) errors.orgPosition = 'Pilih jabatan';
  else v.orgPosition = raw.orgPosition;
  text('orgTerm', 'Masa jabatan', 4, 30);

  if (!isStr(raw.videoUrl)) errors.videoUrl = 'Tautan video wajib diisi';
  else {
    var videoUrl = raw.videoUrl.trim();
    v.videoUrl = videoUrl;
    if (!videoUrl) errors.videoUrl = 'Tautan video wajib diisi';
    else if (videoUrl.length > VIDEO_URL_MAX) errors.videoUrl = 'Tautan video terlalu panjang';
    else if (!DRIVE_LINK_RE.test(videoUrl)) errors.videoUrl = 'Gunakan tautan Google Drive (drive.google.com) ke video Anda';
  }

  if (raw.consent !== true) errors.consent = 'Anda perlu menyetujui pernyataan ini';
  return { values: v, errors: errors };
}

/** Deteksi tipe sebenarnya dari byte awal. `bytes` dari Utilities.base64Decode bertanda (−128..127), jadi di-AND 0xff. */
function sniffMime_(bytes) {
  function startsWith(sig, offset) {
    offset = offset || 0;
    for (var i = 0; i < sig.length; i++) if ((bytes[offset + i] & 0xff) !== sig[i]) return false;
    return true;
  }
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return null;
}

function base64ByteLength_(b64) {
  var len = b64.length;
  var pad = b64.slice(-2) === '==' ? 2 : b64.slice(-1) === '=' ? 1 : 0;
  return Math.floor(len * 3 / 4) - pad;
}

/** Batas total unggahan (byte mentah, sebelum base64). */
function maxTotalUploadBytes_() {
  return Math.max(0.5, Number(prop_('MAX_TOTAL_UPLOAD_MB', '9.5')) || 9.5) * MB;
}

/** Batas ukuran badan permintaan: total berkas dalam base64 (×4/3) + ruang untuk isian teks. */
function maxRequestBytes_() {
  return Math.ceil(maxTotalUploadBytes_() * 4 / 3) + 512 * 1024;
}

function validateFiles_(rawFiles, errors) {
  var out = [];
  var total = 0;
  var maxTotal = maxTotalUploadBytes_();
  var list = Array.isArray(rawFiles) ? rawFiles : [];
  FILE_KINDS.forEach(function (kind) {
    var rule = FILE_RULES[kind];
    var entry = null;
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].kind === kind) { entry = list[i]; break; }
    if (!entry || typeof entry.base64 !== 'string' || !entry.base64) { errors[kind] = rule.label + ' wajib diunggah'; return; }
    if (!/^[A-Za-z0-9+\/]+={0,2}$/.test(entry.base64)) { errors[kind] = rule.label + ' tidak terbaca'; return; }
    if (base64ByteLength_(entry.base64) > rule.maxBytes) { errors[kind] = rule.label + ' melebihi ' + (rule.maxBytes / 1024 / 1024).toFixed(1) + ' MB'; return; }
    var bytes = Utilities.base64Decode(entry.base64);
    var mime = sniffMime_(bytes);
    if (!mime || rule.mimes.indexOf(mime) < 0) {
      errors[kind] = rule.typeMessage;
      return;
    }
    total += bytes.length;
    out.push({ kind: kind, mime: mime, bytes: bytes });
  });
  if (total > maxTotal) errors.form = 'Total ukuran berkas melebihi ' + (maxTotal / 1024 / 1024).toFixed(1) + ' MB';
  return out;
}

// ───────────── reCAPTCHA v3 ─────────────
function allowedHostnames_() {
  var explicit = prop_('ALLOWED_HOSTNAMES').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  if (explicit.length) return explicit;
  var m = prop_('SITE_URL').match(/^https?:\/\/([^\/:]+)/i);
  if (!m) return [];
  var host = m[1].toLowerCase();
  return [host, host.indexOf('www.') === 0 ? host.slice(4) : 'www.' + host];
}

function verifyRecaptcha_(token, action) {
  if (prop_('RECAPTCHA_DISABLED').toLowerCase() === 'true') return;
  var secret = prop_('RECAPTCHA_SECRET');
  if (!secret) throw fail_('captcha_unconfigured', 'Pendaftaran belum dapat diproses (verifikasi keamanan belum dikonfigurasi). Hubungi panitia.');
  if (typeof token !== 'string' || !token || token.length > 4096) throw fail_('captcha', 'Verifikasi keamanan gagal. Muat ulang halaman lalu coba lagi.');
  var body;
  try {
    var res = UrlFetchApp.fetch('https://www.google.com/recaptcha/api/siteverify', { method: 'post', payload: { secret: secret, response: token }, muteHttpExceptions: true });
    body = JSON.parse(res.getContentText());
  } catch (err) {
    console.error('reCAPTCHA: ' + err);
    throw fail_('captcha', 'Verifikasi keamanan belum berhasil. Coba lagi beberapa saat lagi.');
  }
  var minScore = Number(prop_('RECAPTCHA_MIN_SCORE', '0.5'));
  var hosts = allowedHostnames_();
  var hostOk = hosts.length === 0 || hosts.indexOf(String(body.hostname || '').toLowerCase()) >= 0;
  if (!body.success || body.action !== action || !(Number(body.score) >= minScore) || !hostOk) {
    console.warn('reCAPTCHA ditolak: ' + JSON.stringify({ success: body.success, action: body.action, score: body.score, hostname: body.hostname, errors: body['error-codes'] }));
    throw fail_('captcha', 'Verifikasi keamanan gagal. Muat ulang halaman lalu coba lagi.');
  }
}

// ───────────── Sheet: baca/tulis baris ─────────────
/** Sheet baru bawaan hanya 26 kolom × 1000 baris; pastikan cukup untuk 30 kolom dan baris yang akan ditulis. */
function ensureGrid_(sh, minRows) {
  if (sh.getMaxColumns() < COLUMNS.length) sh.insertColumnsAfter(sh.getMaxColumns(), COLUMNS.length - sh.getMaxColumns());
  if (minRows && sh.getMaxRows() < minRows) sh.insertRowsAfter(sh.getMaxRows(), minRows - sh.getMaxRows());
}

function sheet_() {
  var ss = SpreadsheetApp.getActive();
  var name = prop_('SHEET_TAB', 'Pendaftar');
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  ensureGrid_(sh, 2);
  return sh;
}

function blankRegistration_(id, v, nowIso) {
  return {
    id: id, createdAt: nowIso, fullName: v.fullName, email: v.email, whatsapp: v.whatsapp, instagram: v.instagram,
    schoolName: v.schoolName, city: v.city, province: v.province, region: PROVINCE_REGION[v.province] || '', grade: v.grade,
    orgName: v.orgName, orgPosition: v.orgPosition, orgTerm: v.orgTerm, folderUrl: '', essayUrl: '', cvUrl: '', twibbonUrl: '',
    emailVerified: false, verifiedAt: '', emailStatus: '', scoreEssay: null, scoreLeadership: null, scoreContribution: null,
    totalScore: null, status: 'Menunggu Verifikasi Email', notes: '', reviewedBy: '', updatedAt: nowIso, decisionEmailSentAt: '',
    videoUrl: v.videoUrl, paymentUrl: '', innovationUrl: ''
  };
}

function computeTotal_(a, b, c) {
  if (a == null && b == null && c == null) return null;
  return (a || 0) + (b || 0) + (c || 0);
}

function toNumber_(v) {
  if (v === '' || v === null || v === undefined) return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}

function regFromRow_(row) {
  var o = {};
  COLUMNS.forEach(function (c, i) { o[c[0]] = row[i]; });
  var id = str_(o.id).trim();
  if (!id) return null;
  var s1 = toNumber_(o.scoreEssay), s2 = toNumber_(o.scoreLeadership), s3 = toNumber_(o.scoreContribution);
  var statusRaw = str_(o.status).trim();
  return {
    id: id, createdAt: str_(o.createdAt), fullName: str_(o.fullName), email: str_(o.email).toLowerCase(), whatsapp: str_(o.whatsapp),
    instagram: str_(o.instagram), schoolName: str_(o.schoolName), city: str_(o.city), province: str_(o.province), region: str_(o.region),
    grade: str_(o.grade), orgName: str_(o.orgName), orgPosition: str_(o.orgPosition), orgTerm: str_(o.orgTerm), folderUrl: str_(o.folderUrl),
    essayUrl: str_(o.essayUrl), cvUrl: str_(o.cvUrl), twibbonUrl: str_(o.twibbonUrl),
    emailVerified: str_(o.emailVerified).trim().toLowerCase() === 'ya', verifiedAt: str_(o.verifiedAt), emailStatus: str_(o.emailStatus),
    scoreEssay: s1, scoreLeadership: s2, scoreContribution: s3,
    // Total selalu dihitung dari komponen agar tahan terhadap rumus/ketikan manual di sheet.
    totalScore: computeTotal_(s1, s2, s3),
    status: STATUSES.indexOf(statusRaw) >= 0 ? statusRaw : 'Menunggu Review',
    notes: str_(o.notes), reviewedBy: str_(o.reviewedBy), updatedAt: str_(o.updatedAt) || str_(o.createdAt),
    decisionEmailSentAt: str_(o.decisionEmailSentAt), videoUrl: str_(o.videoUrl), paymentUrl: str_(o.paymentUrl), innovationUrl: str_(o.innovationUrl)
  };
}

function toRow_(reg) {
  return COLUMNS.map(function (c) {
    var v = reg[c[0]];
    if (c[0] === 'emailVerified') return v ? 'Ya' : 'Belum';
    return v === null || v === undefined ? '' : v;
  });
}

/** Format per kolom: teks biasa ('@') untuk semua kolom kecuali skor, agar nilai berawalan = + - @ tidak dibaca sebagai rumus. */
function columnFormats_() {
  return COLUMNS.map(function (c) { return NUMERIC_KEYS.indexOf(c[0]) >= 0 ? '0' : '@'; });
}

function readAll_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, COLUMNS.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var reg = regFromRow_(values[i]);
    if (reg) out.push({ reg: reg, row: i + 2 });
  }
  return out;
}

function writeRow_(sh, row, reg) {
  var range = sh.getRange(row, 1, 1, COLUMNS.length);
  range.setNumberFormats([columnFormats_()]);
  range.setValues([toRow_(reg)]);
}

function findRow_(sh, id) {
  var all = readAll_(sh);
  for (var i = 0; i < all.length; i++) if (all[i].reg.id === id) return all[i];
  return null;
}

function getRev_() { return prop_('REV', '0'); }
/** Revisi = token unik (bukan penghitung) agar dua perubahan serentak tidak pernah menghasilkan nilai yang sama. */
function bumpRev_() {
  var next = nowMs_().toString(36) + '.' + Utilities.getUuid().slice(0, 6);
  PropertiesService.getScriptProperties().setProperty('REV', next);
  return next;
}

// ───────────── Token & sesi ─────────────
function authSecret_() {
  var s = prop_('AUTH_SECRET');
  if (s.length < 16) throw fail_('unconfigured', 'Server belum dikonfigurasi (AUTH_SECRET). Hubungi pengelola website.');
  return s;
}

function panitiaToken_() {
  var t = prop_('PANITIA_TOKEN').trim();
  return t.length >= MIN_TOKEN_LENGTH ? t : null;
}

function createVerifyToken_(rid) {
  var payload = b64uEncodeString_(JSON.stringify({ rid: rid, exp: Math.floor(nowMs_() / 1000) + VERIFY_TTL_SECONDS }));
  return payload + '.' + hmac_('verify', payload, authSecret_());
}

function checkVerifyToken_(token) {
  var parts = String(token || '').split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'invalid' };
  if (!safeEqual_(parts[1], hmac_('verify', parts[0], authSecret_()))) return { ok: false, reason: 'invalid' };
  try {
    var data = JSON.parse(b64uDecodeToString_(parts[0]));
    if (typeof data.rid !== 'string' || typeof data.exp !== 'number') return { ok: false, reason: 'invalid' };
    if (data.exp * 1000 < nowMs_()) return { ok: false, reason: 'expired', rid: data.rid };
    return { ok: true, rid: data.rid };
  } catch (err) {
    return { ok: false, reason: 'invalid' };
  }
}

/** Kunci sesi = AUTH_SECRET + PANITIA_TOKEN: mengganti token otomatis membuat semua sesi lama tidak valid. */
function sessionKey_() {
  var token = panitiaToken_();
  if (!token) throw fail_('unconfigured', 'Portal belum dikonfigurasi. Hubungi pengelola website.');
  return authSecret_() + '|' + token;
}

function cleanReviewerName_(raw) {
  var s = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  return s || 'Panitia';
}

function createSession_(name) {
  var exp = Math.floor(nowMs_() / 1000) + SESSION_TTL_SECONDS;
  var payload = b64uEncodeString_(JSON.stringify({ name: name, exp: exp }));
  return { session: payload + '.' + hmac_('session', payload, sessionKey_()), expiresAt: exp * 1000 };
}

function requireSession_(token) {
  var unauthorized = fail_('unauthorized', 'Sesi tidak valid atau sudah berakhir. Silakan masuk lagi.');
  var parts = String(token || '').split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw unauthorized;
  var key;
  try { key = sessionKey_(); } catch (err) { throw unauthorized; }
  if (!safeEqual_(parts[1], hmac_('session', parts[0], key))) throw unauthorized;
  try {
    var data = JSON.parse(b64uDecodeToString_(parts[0]));
    if (typeof data.exp !== 'number' || data.exp * 1000 < nowMs_()) throw unauthorized;
    return { name: cleanReviewerName_(data.name) };
  } catch (err) {
    throw unauthorized;
  }
}

function panitiaLogin_(p) {
  var expected = panitiaToken_();
  if (!expected) throw fail_('unconfigured', 'Portal belum dikonfigurasi. Hubungi pengelola website.');
  var input = typeof p.token === 'string' ? p.token.trim() : '';
  if (!input || input.length > 200) throw fail_('invalid_token', 'Token tidak valid');
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('login_fails') || 0);
  if (fails >= LOGIN_MAX_FAILS) throw fail_('rate', 'Terlalu banyak percobaan. Coba lagi dalam beberapa menit.');
  if (!safeEqual_(input, expected)) {
    cache.put('login_fails', String(fails + 1), LOGIN_WINDOW_SECONDS);
    Utilities.sleep(400); // memperlambat tebakan beruntun
    throw fail_('invalid_token', 'Token tidak valid');
  }
  cache.remove('login_fails');
  var name = cleanReviewerName_(p.name);
  var s = createSession_(name);
  return { session: s.session, name: name, expiresAt: s.expiresAt };
}

// ───────────── Pendaftaran ─────────────
function register_(p) {
  if (!isOpen_()) throw fail_('closed', 'Pendaftaran NFL 2026 sedang ditutup.');

  // Honeypot: bot mengisi kolom tersembunyi → pura-pura sukses agar tidak memicu percobaan ulang.
  if (String(p.website || '').trim() !== '') return { id: 'NFL26-XXXXXX', email: '', whatsappGroupUrl: '', emailSent: false };
  var startedAt = Number(p.startedAt);
  if (!isFinite(startedAt) || nowMs_() - startedAt < MIN_FILL_MS) {
    throw fail_('too_fast', 'Formulir terkirim terlalu cepat. Periksa kembali isian Anda lalu kirim ulang.');
  }

  verifyRecaptcha_(p.recaptchaToken, 'register');

  var checked = validateRegistration_(p);
  var errors = checked.errors;
  var files = validateFiles_(p.files, errors);
  if (Object.keys(errors).length > 0) throw fail_('validation', 'Periksa kembali isian yang ditandai.', { fieldErrors: errors });
  var v = checked.values;

  // 1) Cek email ganda + pesan baris awal (di bawah lock) sebelum pembuatan folder/berkas yang lambat.
  var reg;
  var rowNumber;
  lockedRun_(function () {
    if (!dailyCount_('REG', Number(prop_('DAILY_REGISTRATION_LIMIT', '300')) || 300)) {
      throw fail_('daily_limit', 'Pendaftaran hari ini sudah mencapai batas. Silakan coba lagi besok atau hubungi panitia.');
    }
    var sh = sheet_();
    var all = readAll_(sh);
    var ids = {};
    for (var i = 0; i < all.length; i++) {
      if (all[i].reg.email === v.email) throw fail_('duplicate', 'Email ini sudah terdaftar.', { fieldErrors: { email: 'Email ini sudah dipakai untuk mendaftar' } });
      ids[all[i].reg.id] = true;
    }
    var id = newRegistrationId_();
    while (ids[id]) id = newRegistrationId_();
    reg = blankRegistration_(id, v, nowIso_());
    rowNumber = Math.max(sh.getLastRow(), 1) + 1;
    ensureGrid_(sh, rowNumber + 200);
    writeRow_(sh, rowNumber, reg);
    bumpRev_();
  });

  // 2) Folder Drive + berkas (lambat, di luar lock).
  var assets;
  try {
    assets = createAssets_(reg, files);
  } catch (err) {
    console.error('Gagal menyimpan berkas: ' + (err && err.stack ? err.stack : err));
    lockedRun_(function () {
      var sh = sheet_();
      var found = findRow_(sh, reg.id);
      if (found) sh.deleteRow(found.row);
      bumpRev_();
    });
    throw fail_('save_failed', 'Pendaftaran belum dapat disimpan. Coba lagi beberapa saat lagi.');
  }

  // 3) Catat tautan berkas, lalu kirim email verifikasi (kegagalan email tidak menggagalkan pendaftaran).
  var emailSent = false;
  var emailStatus;
  try {
    sendVerificationEmail_(reg.email, reg.fullName, reg.id, verifyUrlFor_(reg.id));
    emailSent = true;
    emailStatus = 'Terkirim ' + nowIso_();
  } catch (err) {
    emailStatus = ('Gagal: ' + (err && err.message ? err.message : err)).slice(0, 200);
    console.error('Email verifikasi gagal: ' + emailStatus);
  }
  lockedRun_(function () {
    var sh = sheet_();
    var found = findRow_(sh, reg.id);
    if (!found) return;
    var next = found.reg;
    next.folderUrl = assets.folderUrl;
    next.essayUrl = assets.essayUrl;
    next.cvUrl = assets.cvUrl;
    next.twibbonUrl = assets.twibbonUrl;
    next.paymentUrl = assets.paymentUrl;
    next.innovationUrl = assets.innovationUrl;
    next.emailStatus = emailStatus;
    writeRow_(sh, found.row, next);
    bumpRev_();
  });
  return { id: reg.id, email: reg.email, whatsappGroupUrl: prop_('WHATSAPP_GROUP_URL').trim(), emailSent: emailSent };
}

function createAssets_(reg, files) {
  var root = DriveApp.getFolderById(prop_('ROOT_FOLDER_ID'));
  var safeName = String(reg.fullName || '').replace(/[\\\/:*?"<>|]/g, ' ').slice(0, 60);
  var folder = root.createFolder(reg.id + ' - ' + safeName);
  var out = { folderUrl: folder.getUrl(), essayUrl: '', cvUrl: '', twibbonUrl: '', paymentUrl: '', innovationUrl: '' };
  files.forEach(function (f) {
    var name = reg.id + ' - ' + FILE_RULES[f.kind].fileLabel + ' - ' + safeName + '.' + (EXT_BY_MIME[f.mime] || 'bin');
    out[f.kind + 'Url'] = folder.createFile(Utilities.newBlob(f.bytes, f.mime, name)).getUrl();
  });
  return out;
}

function verifyUrlFor_(rid) {
  var site = prop_('SITE_URL').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(site)) throw new Error('SITE_URL belum diatur');
  return site + '/verifikasi/?token=' + encodeURIComponent(createVerifyToken_(rid));
}

function verifyEmail_(p) {
  var check = checkVerifyToken_(p.token);
  if (!check.ok) throw fail_(check.reason, check.reason === 'expired' ? 'Tautan verifikasi sudah kedaluwarsa.' : 'Tautan verifikasi tidak valid.', { status: check.reason });
  return lockedRun_(function () {
    var sh = sheet_();
    var found = findRow_(sh, check.rid);
    if (!found) throw fail_('invalid', 'Tautan verifikasi tidak valid.', { status: 'invalid' });
    var reg = found.reg;
    var first = reg.fullName.split(' ')[0];
    if (reg.emailVerified) return { status: 'already', name: first };
    var now = nowIso_();
    reg.emailVerified = true;
    reg.verifiedAt = now;
    if (reg.status === 'Menunggu Verifikasi Email') reg.status = 'Menunggu Review';
    reg.updatedAt = now;
    writeRow_(sh, found.row, reg);
    bumpRev_();
    return { status: 'verified', name: first };
  });
}

var GENERIC_RESEND = { ok: true, message: 'Jika email tersebut terdaftar dan belum terverifikasi, tautan verifikasi baru sudah dikirim.' };

function resendVerificationPublic_(p) {
  var email = typeof p.email === 'string' ? p.email.trim().toLowerCase() : '';
  if (!email || email.length > 160 || !EMAIL_RE.test(email)) throw fail_('validation', 'Email tidak valid');
  var cache = CacheService.getScriptCache();
  var key = 'resend_' + b64uEncodeBytes_(sha256_(email));
  if (cache.get(key)) throw fail_('rate', 'Terlalu sering. Tunggu beberapa menit sebelum mencoba lagi.');
  cache.put(key, '1', RESEND_COOLDOWN_SECONDS);
  var allowed = lockedRun_(function () { return dailyCount_('RESEND', 200); });
  if (!allowed) throw fail_('rate', 'Terlalu sering. Tunggu beberapa menit sebelum mencoba lagi.');
  try {
    var found = lockedRun_(function () { return (readAll_(sheet_()).filter(function (x) { return x.reg.email === email; })[0]) || null; });
    if (found && !found.reg.emailVerified) {
      sendVerificationEmail_(found.reg.email, found.reg.fullName, found.reg.id, verifyUrlFor_(found.reg.id));
      setField_(found.reg.id, 'emailStatus', 'Terkirim ulang ' + nowIso_());
    }
  } catch (err) {
    console.error('resend gagal: ' + err);
  }
  // Respons selalu sama agar tidak membocorkan email mana yang terdaftar.
  return GENERIC_RESEND;
}

function setField_(id, key, value) {
  lockedRun_(function () {
    var sh = sheet_();
    var found = findRow_(sh, id);
    if (!found) return;
    sh.getRange(found.row, colIndex_(key)).setNumberFormat('@');
    sh.getRange(found.row, colIndex_(key)).setValue(value);
    bumpRev_();
  });
}

// ───────────── Portal panitia ─────────────
function poll_(p) {
  var rev = getRev_();
  if (typeof p.rev === 'string' && p.rev === rev) return { rev: rev, changed: false };
  var regs = readAll_(sheet_()).map(function (x) { return x.reg; });
  regs.sort(function (a, b) { return b.createdAt < a.createdAt ? -1 : b.createdAt > a.createdAt ? 1 : 0; });
  return { rev: rev, changed: true, registrations: regs, sheetUrl: SpreadsheetApp.getActive().getUrl() };
}

function requireId_(p) {
  var id = typeof p.id === 'string' ? p.id : '';
  if (!ID_RE.test(id)) throw fail_('validation', 'ID tidak valid');
  return id;
}

function getRegistration_(p) {
  var id = requireId_(p);
  var rev = getRev_();
  if (typeof p.rev === 'string' && p.rev === rev) return { rev: rev, changed: false };
  var found = findRow_(sheet_(), id);
  if (!found) throw fail_('not_found', 'Pendaftar tidak ditemukan');
  return { rev: rev, changed: true, registration: found.reg };
}

function googleIdFromUrl_(url) {
  var u = String(url || '');
  var m = u.match(/\/d\/([A-Za-z0-9_-]{15,})/) || u.match(/[?&]id=([A-Za-z0-9_-]{15,})/) || u.match(/folders\/([A-Za-z0-9_-]{15,})/);
  return m ? m[1] : null;
}

function validatePatch_(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw fail_('validation', 'Data penilaian tidak valid');
  var allowed = ['scoreEssay', 'scoreLeadership', 'scoreContribution', 'status', 'notes'];
  Object.keys(patch).forEach(function (k) { if (allowed.indexOf(k) < 0) throw fail_('validation', 'Data penilaian tidak valid'); });
  ['scoreEssay', 'scoreLeadership', 'scoreContribution'].forEach(function (k) {
    if (!(k in patch) || patch[k] === null) return;
    var n = patch[k];
    if (typeof n !== 'number' || n % 1 !== 0 || n < MIN_SCORE || n > MAX_SCORE) throw fail_('validation', 'Data penilaian tidak valid');
  });
  if ('status' in patch && STATUSES.indexOf(patch.status) < 0) throw fail_('validation', 'Data penilaian tidak valid');
  if ('notes' in patch && (typeof patch.notes !== 'string' || patch.notes.length > 4000)) throw fail_('validation', 'Data penilaian tidak valid');
  return patch;
}

function review_(p, session) {
  var id = requireId_(p);
  var patch = validatePatch_(p.patch);
  var expected = typeof p.expectedUpdatedAt === 'string' ? p.expectedUpdatedAt : '';
  var result = lockedRun_(function () {
    var sh = sheet_();
    var found = findRow_(sh, id);
    if (!found) throw fail_('not_found', 'Pendaftar tidak ditemukan');
    var current = found.reg;
    if (expected && current.updatedAt !== expected) {
      throw fail_('conflict', 'Data ini baru saja diubah oleh pengguna lain.', { conflict: true, registration: current });
    }
    var next = JSON.parse(JSON.stringify(current));
    ['scoreEssay', 'scoreLeadership', 'scoreContribution'].forEach(function (k) { if (k in patch) next[k] = patch[k] === undefined ? null : patch[k]; });
    if (patch.status) next.status = patch.status;
    if ('notes' in patch) next.notes = patch.notes;

    // Pertama kali dinilai → otomatis "Sedang Direview" bila status masih menunggu.
    var changedScoreOrNote =
      next.scoreEssay !== current.scoreEssay || next.scoreLeadership !== current.scoreLeadership ||
      next.scoreContribution !== current.scoreContribution || next.notes !== current.notes;
    var statusUntouched = patch.status === undefined || patch.status === current.status;
    if (statusUntouched && changedScoreOrNote && current.status === 'Menunggu Review') next.status = 'Sedang Direview';

    next.totalScore = computeTotal_(next.scoreEssay, next.scoreLeadership, next.scoreContribution);
    next.reviewedBy = session.name;
    // updatedAt = nomor versi (optimistic concurrency): harus selalu naik, walau dua simpanan jatuh di milidetik yang sama.
    var prev = Date.parse(current.updatedAt);
    var nowT = nowMs_();
    next.updatedAt = new Date(isFinite(prev) && nowT <= prev ? prev + 1 : nowT).toISOString();

    // Kolom hasil review bersebelahan: Skor Esai … Diperbarui Pada
    var first = colIndex_('scoreEssay');
    var last = colIndex_('updatedAt');
    var cells = toRow_(next).slice(first - 1, last);
    var range = sh.getRange(found.row, first, 1, last - first + 1);
    range.setNumberFormats([columnFormats_().slice(first - 1, last)]);
    range.setValues([cells]);
    bumpRev_();
    return { current: current, next: next };
  });

  return { registration: result.next };
}

function getFile_(p) {
  var id = requireId_(p);
  if (FILE_KINDS.indexOf(p.kind) < 0) throw fail_('validation', 'Permintaan tidak valid');
  var found = findRow_(sheet_(), id);
  if (!found) throw fail_('not_found', 'Berkas tidak ditemukan');
  var fileId = googleIdFromUrl_(found.reg[p.kind + 'Url']);
  if (!fileId) throw fail_('not_found', 'Berkas tidak ditemukan');
  var file = DriveApp.getFileById(fileId);
  // Esai pendaftar lama berupa Google Docs: tampilkan sebagai PDF.
  var blob = file.getMimeType() === GOOGLE_DOC_MIME ? file.getAs('application/pdf') : file.getBlob();
  var bytes = blob.getBytes();
  if (bytes.length > 6 * 1024 * 1024) throw fail_('too_large', 'Berkas terlalu besar untuk ditampilkan.');
  var mime = blob.getContentType();
  if (FILE_RULES[p.kind].mimes.indexOf(mime) < 0) mime = 'application/octet-stream';
  return { mime: mime, filename: blob.getName(), base64: Utilities.base64Encode(bytes) };
}

function resendToRegistrant_(p, session) {
  var id = requireId_(p);
  var found = findRow_(sheet_(), id);
  if (!found) throw fail_('not_found', 'Pendaftar tidak ditemukan');
  if (found.reg.emailVerified) throw fail_('conflict_state', 'Email sudah terverifikasi.');
  try {
    sendVerificationEmail_(found.reg.email, found.reg.fullName, found.reg.id, verifyUrlFor_(found.reg.id));
  } catch (err) {
    throw fail_('email_failed', 'Email gagal dikirim: ' + (err && err.message ? err.message : err));
  }
  setField_(id, 'emailStatus', 'Terkirim ulang ' + nowIso_() + ' oleh ' + session.name);
  return { sent: true };
}

function sendDecision_(p) {
  var id = requireId_(p);
  var found = findRow_(sheet_(), id);
  if (!found) throw fail_('not_found', 'Pendaftar tidak ditemukan');
  var reg = found.reg;
  if (FINAL.indexOf(reg.status) < 0) throw fail_('conflict_state', 'Tetapkan status Lolos/Cadangan/Tidak Lolos terlebih dahulu.');
  if (reg.decisionEmailSentAt && p.force !== true) throw fail_('conflict_state', 'Email hasil sudah pernah dikirim.', { sentAt: reg.decisionEmailSentAt });
  try {
    sendDecisionEmail_(reg.email, reg.fullName, reg.id, reg.status);
  } catch (err) {
    throw fail_('email_failed', 'Email gagal dikirim: ' + (err && err.message ? err.message : err));
  }
  setField_(id, 'decisionEmailSentAt', nowIso_());
  return { sent: true };
}

// ───────────── Email ─────────────
function sendMail_(to, subject, plain, html) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to))) throw new Error('Alamat email tidak valid');
  if (MailApp.getRemainingDailyQuota() < 1) throw new Error('Kuota email harian habis');
  var opts = { to: to, subject: subject, body: plain, htmlBody: html, name: prop_('SENDER_NAME', 'Panitia NFL 2026') };
  var reply = prop_('REPLY_TO');
  if (reply) opts.replyTo = reply;
  MailApp.sendEmail(opts);
}

function layout_(heading, innerHtml, ctaLabel, ctaUrl, noteHtml) {
  var cta = ctaUrl
    ? '<p style="margin:28px 0"><a href="' + esc_(ctaUrl) + '" style="display:inline-block;background:#e8b640;color:#032d22;font-weight:800;text-decoration:none;padding:14px 26px;border-radius:3px">' + esc_(ctaLabel) + '</a></p>'
    : '';
  return '<div style="background:#faf6e9;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#173a2c">' +
    '<div style="max-width:560px;margin:0 auto;background:#fffdf6;border:1px solid #e2d9bd">' +
    '<div style="background:#07543b;padding:22px 28px;border-bottom:4px solid #e8b640"><div style="color:#f4d77b;font-size:11px;letter-spacing:.2em;font-weight:700">NUSANTARA FUTURE LEADERS · 2026</div>' +
    '<div style="color:#ffffff;font-size:20px;font-weight:800;margin-top:6px">' + esc_(heading) + '</div></div>' +
    '<div style="padding:28px;font-size:15px;line-height:1.65">' + innerHtml + cta + (noteHtml || '') + '</div>' +
    '<div style="padding:16px 28px;background:#032d22;color:#fff5db;font-size:12px">Berakar pada daerah, bergerak untuk Indonesia.<br>Serikat Mahasiswa UGM</div>' +
    '</div></div>';
}

function sendVerificationEmail_(to, name, registrationId, verifyUrl) {
  var site = prop_('SITE_URL').trim().replace(/\/+$/, '');
  if (!site || String(verifyUrl).indexOf(site + '/') !== 0) throw new Error('Tautan verifikasi tidak berasal dari SITE_URL');
  var html = layout_('Verifikasi email pendaftaran',
    '<p>Halo <strong>' + esc_(name) + '</strong>,</p>' +
    '<p>Terima kasih telah mendaftar Nusantara Future Leaders 2026. Berkas Anda sudah kami terima dengan ID pendaftaran <strong>' + esc_(registrationId) + '</strong>.</p>' +
    '<p>Satu langkah lagi: verifikasi alamat email ini agar pendaftaran Anda dapat diproses panitia. Tautan berlaku <strong>48 jam</strong>.</p>',
    'Verifikasi Email', verifyUrl,
    '<p style="font-size:12px;color:#66776b;word-break:break-all">Tombol tidak berfungsi? Salin tautan ini ke browser:<br>' + esc_(verifyUrl) + '</p>');
  var plain = 'Halo ' + name + ',\n\nTerima kasih telah mendaftar NFL 2026 (ID ' + registrationId + ').\nVerifikasi email Anda (berlaku 48 jam):\n' + verifyUrl + '\n\nJika Anda tidak merasa mendaftar, abaikan email ini.';
  sendMail_(to, 'Verifikasi email pendaftaran NFL 2026 (' + registrationId + ')', plain, html);
}

function sendDecisionEmail_(to, name, id, decision) {
  var wa = prop_('WHATSAPP_GROUP_URL');
  var copy = {
    'Lolos': { subject: 'Selamat! Anda lolos seleksi NFL 2026', heading: 'Selamat, Anda terpilih!',
      text: 'Kami dengan senang hati menyampaikan bahwa Anda dinyatakan <strong>lolos seleksi</strong> sebagai peserta Nusantara Future Leaders 2026. Informasi lanjutan akan disampaikan melalui email ini dan kanal resmi peserta.' },
    'Cadangan': { subject: 'Hasil seleksi NFL 2026: daftar cadangan', heading: 'Anda masuk daftar cadangan',
      text: 'Terima kasih atas partisipasi Anda. Saat ini Anda berada pada <strong>daftar cadangan</strong> peserta NFL 2026. Panitia akan menghubungi Anda bila terdapat kuota yang tersedia.' },
    'Tidak Lolos': { subject: 'Hasil seleksi NFL 2026', heading: 'Terima kasih atas partisipasi Anda',
      text: 'Terima kasih telah mendaftar dan meluangkan waktu menyiapkan berkas. Mohon maaf, Anda <strong>belum dapat kami pilih</strong> pada seleksi NFL 2026. Semoga tetap semangat berkarya untuk daerah dan Indonesia.' }
  }[decision];
  if (!copy) throw new Error('Keputusan tidak dikenal');
  var html = layout_(copy.heading,
    '<p>Halo <strong>' + esc_(name) + '</strong>,</p><p>' + copy.text + '</p><p style="color:#66776b;font-size:13px">ID pendaftaran: ' + esc_(id) + '</p>',
    decision === 'Lolos' && wa ? 'Gabung Grup WhatsApp Peserta' : '', decision === 'Lolos' ? wa : '');
  sendMail_(to, copy.subject, 'Halo ' + name + ',\n\n' + copy.text.replace(/<[^>]+>/g, '') + '\n\nID pendaftaran: ' + id, html);
}

// ───────────── Spreadsheet: setup, menu, trigger ─────────────
function onOpen() {
  SpreadsheetApp.getUi().createMenu('NFL 2026')
    .addItem('Setup sheet (sekali saja)', 'setupSheet')
    .addItem('Buat rahasia acak (AUTH_SECRET & PANITIA_TOKEN)', 'generateSecrets')
    .addItem('Periksa pengaturan', 'checkSetup')
    .addSeparator()
    .addItem('Kirim email hasil: baris terpilih', 'sendDecisionForSelection')
    .addItem('Kirim email hasil: semua yang sudah diputuskan', 'sendDecisionBatch')
    .addToUi();
}

/** Jalankan sekali: header, validasi, format teks, pewarnaan, pembekuan baris, dan trigger onEdit. */
function setupSheet() {
  var sh = sheet_();
  var headers = COLUMNS.map(function (c) { return c[1]; });
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setFontColor('#f4d77b').setBackground('#07543b').setWrap(true).setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.setFrozenColumns(3);
  var max = 2000;
  ensureGrid_(sh, max + 1);

  // Format teks biasa agar isian berawalan = + - @ tidak pernah dievaluasi sebagai rumus.
  sh.getRange(2, 1, max, COLUMNS.length).setNumberFormats(Array.apply(null, Array(max)).map(function () { return columnFormats_(); }));

  var status = sh.getRange(2, colIndex_('status'), max, 1);
  status.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build());
  var scores = sh.getRange(2, colIndex_('scoreEssay'), max, 3);
  scores.setDataValidation(SpreadsheetApp.newDataValidation().requireNumberBetween(MIN_SCORE, MAX_SCORE).setAllowInvalid(false).setHelpText('Skor ' + MIN_SCORE + '–' + MAX_SCORE).build());

  var rules = [
    ['Lolos', '#d9ead3'], ['Cadangan', '#fff2cc'], ['Tidak Lolos', '#f4cccc'], ['Sedang Direview', '#d9e8f5']
  ].map(function (r) {
    return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(r[0]).setBackground(r[1]).setRanges([status]).build();
  });
  sh.setConditionalFormatRules(rules);

  // Kolom identitas/berkas dilindungi (peringatan saja) agar tidak tertimpa tanpa sengaja. Hapus perlindungan lama
  // dulu supaya menjalankan setupSheet berulang tidak menumpuk duplikat.
  sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (pr) {
    if (pr.getDescription() === 'Diisi otomatis oleh website') pr.remove();
  });
  sh.getRange(2, 1, max, colIndex_('emailStatus')).protect().setDescription('Diisi otomatis oleh website').setWarningOnly(true);
  sh.getRange(2, colIndex_('videoUrl'), max, 2).protect().setDescription('Diisi otomatis oleh website').setWarningOnly(true);

  sh.setColumnWidths(1, headers.length, 150);
  sh.setColumnWidth(colIndex_('notes'), 360);

  // Trigger onEdit terpasang (penulisan oleh script tidak memicunya → tidak ada loop).
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'onSheetEdit') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
  SpreadsheetApp.getActive().toast('Sheet siap. Header, validasi, format, dan trigger sudah dipasang.', 'NFL 2026', 6);
}

/** Edit manual di sheet: naikkan revisi agar portal ikut menyegarkan; di kolom penilaian juga hitung total + catat editor/waktu. */
function onSheetEdit(e) {
  var r = e.range;
  var sh = r.getSheet();
  if (sh.getName() !== prop_('SHEET_TAB', 'Pendaftar') || r.getLastRow() < 2) return;
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (err) { return; }
  try {
    var first = colIndex_('scoreEssay');
    var last = colIndex_('notes');
    if (r.getLastColumn() >= first && r.getColumn() <= last) {
      for (var row = Math.max(2, r.getRow()); row <= r.getLastRow(); row++) {
        var s = sh.getRange(row, first, 1, 3).getValues()[0];
        var any = s.some(function (v) { return v !== ''; });
        sh.getRange(row, colIndex_('totalScore')).setValue(any ? s.reduce(function (a, v) { return a + (Number(v) || 0); }, 0) : '');
        sh.getRange(row, colIndex_('reviewedBy')).setValue(Session.getActiveUser().getEmail() || 'Spreadsheet');
        sh.getRange(row, colIndex_('updatedAt')).setValue(nowIso_());
      }
    }
    bumpRev_();
  } finally {
    lock.releaseLock();
  }
}

/** Membuat AUTH_SECRET (tidak ditampilkan) dan PANITIA_TOKEN (ditampilkan sekali) bila belum ada. */
function generateSecrets() {
  var props = PropertiesService.getScriptProperties();
  var ui = SpreadsheetApp.getUi();
  function random(n) { var s = ''; while (s.length < n) s += Utilities.getUuid().replace(/-/g, ''); return s.slice(0, n); }
  var created = [];
  if (!props.getProperty('AUTH_SECRET')) { props.setProperty('AUTH_SECRET', random(48)); created.push('AUTH_SECRET (tidak ditampilkan)'); }
  if (!props.getProperty('PANITIA_TOKEN')) {
    var token = random(40);
    props.setProperty('PANITIA_TOKEN', token);
    created.push('PANITIA_TOKEN');
    ui.alert('Token panitia (salin sekarang, bagikan lewat kanal tertutup):\n\n' + token + '\n\nToken juga tersimpan di Project Settings → Script properties.');
  }
  ui.alert(created.length ? 'Dibuat: ' + created.join(', ') : 'AUTH_SECRET dan PANITIA_TOKEN sudah ada. Tidak ada yang diubah.');
}

/** Memeriksa kelengkapan pengaturan (tanpa menampilkan nilai rahasia). */
function checkSetup() {
  var problems = [];
  if (prop_('AUTH_SECRET').length < 16) problems.push('AUTH_SECRET belum ada/terlalu pendek (jalankan "Buat rahasia acak").');
  if (!panitiaToken_()) problems.push('PANITIA_TOKEN belum ada/kurang dari ' + MIN_TOKEN_LENGTH + ' karakter (portal tertutup).');
  try { DriveApp.getFolderById(prop_('ROOT_FOLDER_ID')).getName(); } catch (err) { problems.push('ROOT_FOLDER_ID kosong atau folder tidak dapat diakses.'); }
  if (!/^https:\/\//.test(prop_('SITE_URL'))) problems.push('SITE_URL harus berawalan https://');
  if (!prop_('RECAPTCHA_SECRET') && prop_('RECAPTCHA_DISABLED').toLowerCase() !== 'true') problems.push('RECAPTCHA_SECRET belum diisi (pendaftaran akan ditolak).');
  if (prop_('RECAPTCHA_DISABLED').toLowerCase() === 'true') problems.push('PERINGATAN: RECAPTCHA_DISABLED=true. Matikan sebelum publik.');
  var msg = (problems.length ? 'Perlu diperbaiki:\n- ' + problems.join('\n- ') : 'Semua pengaturan wajib sudah terisi.') +
    '\n\nSisa kuota email hari ini: ' + MailApp.getRemainingDailyQuota() + '\nPendaftaran: ' + (isOpen_() ? 'DIBUKA' : 'DITUTUP');
  try { SpreadsheetApp.getUi().alert(msg); } catch (err) { console.log(msg); }
  return problems;
}

function rowObject_(sh, row) {
  var values = sh.getRange(row, 1, 1, COLUMNS.length).getValues()[0];
  var o = {};
  COLUMNS.forEach(function (c, i) { o[c[0]] = values[i]; });
  return o;
}

function sendDecisionRow_(sh, row) {
  var o = rowObject_(sh, row);
  if (!o.id || FINAL.indexOf(o.status) < 0 || o.decisionEmailSentAt) return false;
  sendDecisionEmail_(o.email, o.fullName, o.id, o.status);
  sh.getRange(row, colIndex_('decisionEmailSentAt')).setValue(nowIso_());
  bumpRev_();
  return true;
}

function sendDecisionForSelection() {
  var ui = SpreadsheetApp.getUi();
  var sh = sheet_();
  var range = SpreadsheetApp.getActiveRange();
  if (!range || range.getSheet().getName() !== sh.getName()) { ui.alert('Pilih baris pendaftar pada tab "' + sh.getName() + '".'); return; }
  var sent = 0;
  for (var row = Math.max(2, range.getRow()); row <= range.getLastRow(); row++) if (sendDecisionRow_(sh, row)) sent++;
  ui.alert(sent + ' email hasil terkirim. (Baris yang belum diputuskan atau sudah pernah dikirimi dilewati.)');
}

function sendDecisionBatch() {
  var ui = SpreadsheetApp.getUi();
  var sh = sheet_();
  if (ui.alert('Kirim email hasil ke SEMUA pendaftar yang statusnya sudah Lolos/Cadangan/Tidak Lolos dan belum dikirimi?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  var sent = 0, failed = 0;
  for (var row = 2; row <= sh.getLastRow(); row++) {
    if (MailApp.getRemainingDailyQuota() < 1) { ui.alert('Kuota email harian habis. Lanjutkan besok.'); break; }
    try { if (sendDecisionRow_(sh, row)) sent++; } catch (err) { failed++; console.error('Baris ' + row + ': ' + err); }
  }
  ui.alert('Terkirim: ' + sent + '. Gagal: ' + failed + '.');
}
