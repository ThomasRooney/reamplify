module.exports = {
  env: {
    browser: true,
    es6: true,
  },
  extends: ['plugin:prettier/recommended', 'plugin:react/recommended', 'prettier'],
  globals: {},
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 2018,
    sourceType: 'module',
  },
  plugins: ['react', 'json', 'react-hooks', '@typescript-eslint', 'flowtype', 'unused-imports'],
  settings: {
    react: {
      version: 'detect',
    },
    rules: {
      'linebreak-style': 'off',
      'no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
    },
  },
  ignorePatterns: ['**/*.css', '**/*.svg'],
  rules: {},
};
