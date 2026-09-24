// ESLint flat config. Next 16 removed `next lint`, so ESLint runs directly;
// this carries the same rule set the old .eslintrc.json extended.
import coreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
  ...coreWebVitals,
  {
    ignores: ['.next/**', 'out/**', 'node_modules/**', 'public/**', 'next-env.d.ts'],
  },
];

export default config;
