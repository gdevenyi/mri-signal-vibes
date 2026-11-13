const browserGlobals = {
  window: "readonly",
  document: "readonly",
  console: "readonly",
  MathJax: "readonly",
  Chart: "readonly",
  Blob: "readonly",
  URL: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly"
};

// Globals of sequences.js and logic.js that script.js uses
const appGlobals = {
  sequences: "readonly",
  paramDefinitions: "readonly",
  referenceData: "readonly",
  relaxivityData: "readonly",
  REFERENCE_PRESETS: "readonly",
  EXTRA_TISSUES: "readonly",
  findPresetSource: "readonly",
  paramLimit: "readonly",
  applyContrastAgent: "readonly",
  limitT2s: "readonly",
  ernstAngle: "readonly",
  analyzeContrast: "readonly",
  buildCsv: "readonly",
  encodeState: "readonly",
  decodeState: "readonly",
  MAX_NAME_LENGTH: "readonly"
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
      globals: { ...browserGlobals, ...appGlobals }
    },
    rules
  },
  {
    files: ["sequences.js", "logic.js", "presets.js", "reference-data.js"],
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
