const browserGlobals = {
  window: "readonly",
  document: "readonly",
  console: "readonly",
  Math: "readonly",
  JSON: "readonly",
  parseFloat: "readonly",
  MathJax: "readonly",
  Chart: "readonly",
  setTimeout: "readonly"
};

const rules = {
  "no-unused-vars": "warn",
  "no-undef": "error"
};

export default [
  {
    files: ["script.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      // `sequences` comes from sequences.js, `referenceData` from reference-data.js
      globals: { ...browserGlobals, sequences: "readonly", referenceData: "readonly" }
    },
    rules
  },
  {
    files: ["sequences.js", "reference-data.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      // `module` is only there in Node.js (tests)
      globals: { ...browserGlobals, module: "readonly" }
    },
    rules
  },
  {
    files: ["test/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs"
    },
    rules
  }
];
