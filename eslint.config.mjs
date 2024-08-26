import { config } from 'eslint-config-decent';

export default [
  ...config({
    tsconfigRootDir: import.meta.dirname,
  }),
  {
    files: ['**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
];
