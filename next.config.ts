import type { NextConfig } from 'next';

/**
 * Situs statis penuh (`next build` → folder out/) untuk GitHub Pages: tanpa server Node.js.
 * Semua data dinamis (pendaftaran, verifikasi, portal panitia) dilayani Google Apps Script dari browser.
 * Header keamanan HTTP tidak bisa diatur di GitHub Pages → CSP dipasang lewat <meta> (lihat src/lib/csp.ts).
 */
const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true, // /nfl-2026/index.html → tautan stabil di hosting statis
  reactStrictMode: true,
  images: { unoptimized: true }, // optimasi gambar butuh server
};

export default nextConfig;
