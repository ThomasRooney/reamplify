module.exports = {
  env: {
    browser: true,
    es6: true,
  },
  extends: ["plugin:prettier/recommended", "prettier"],
  globals: {},
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: "module",
  },
  root: true,
  plugins: ["@typescript-eslint", "flowtype"],
  ignorePatterns: ["*.js.map", "schema.ts", "index.js", "lib/**/*.js"],
  rules: {},
};
