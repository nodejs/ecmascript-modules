'use strict';

const acorn = require('internal/deps/acorn/acorn/dist/acorn');

// Detect the module type of a file: CommonJS or ES module.
// An ES module, for the purposes of this algorithm, is defined as any
// JavaScript file containing an import or export statement.
// Since our detection is so simple, we can avoid needing to use Acorn for a
// full parse; we can detect import or export statements just from the tokens.
// Also as of this writing, Acorn doesn't support import() expressions as they
// are only Stage 3; yet Node already supports them.
function detectType(source) {
  try {
    let prevToken, prevPrevToken;
    for (const { type: token } of acorn.tokenizer(source)) {
      if (prevToken &&
          // By definition import or export must be followed by another token.
          (prevToken.keyword === 'import' || prevToken.keyword === 'export') &&
          // Skip `import(`; look only for import statements, not expressions.
          // import() expressions are allowed in both CommonJS and ES modules.
          token.label !== '(' &&
          // Also ensure that the keyword we just saw wasn't an allowed use
          // of a reserved word as a property name; see
          // test/fixtures/es-modules/type-auto-scope/
          //   cjs-with-property-named-import.js
          !(prevPrevToken && prevPrevToken.label === '.') &&
          token.label !== ':')
        return 'module';
      prevPrevToken = prevToken;
      prevToken = token;
    }
  } catch {
    return 'commonjs';
  }
  return 'commonjs';
}

module.exports = detectType;
