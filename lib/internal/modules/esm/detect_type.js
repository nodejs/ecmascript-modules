'use strict';

const acorn = require('internal/deps/acorn/acorn/dist/acorn');

// Detect the module type of a file: CommonJS or ES module.
// An ES module, for the purposes of this algorithm, is defined as any
// JavaScript file containing an import or export statement.
// Since our detection is so simple, we can avoid needing to use Acorn for a
// full parse; we can detect import or export statements just from the tokens.
function detectType(source) {
  try {
    let sawImport = false;
    for (var token of acorn.tokenizer(source)) {
      if (token.type.keyword === 'export')
        return 'module';
      if (token.type.keyword === 'import')
        sawImport = true;
      if (sawImport) {
        // Skip `import(`; look only for import statements, not expressions.
        if (token.type.label === '(')
          sawImport = false;
        else
          return 'module';
      }
    }
  } catch {
    return 'commonjs';
  }
  return 'commonjs';
}

module.exports = detectType;
