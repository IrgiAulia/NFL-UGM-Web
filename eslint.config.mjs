import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: ['.next/**', 'out/**', 'node_modules/**', 'apps-script/**', 'tests/e2e/**', 'next-env.d.ts'] },
  {
    rules: {
      // Font dimuat lewat <link> agar sama persis dengan situs lama dan tidak butuh fetch saat build.
      '@next/next/no-page-custom-font': 'off',
    },
  },
];

export default config;
