'use strict';

const acorn = require('internal/deps/acorn/acorn/dist/acorn');
const walk = require('internal/deps/acorn/acorn-walk/dist/walk');

class BreakWalk extends Error {}

// Detect the module type of a file: CommonJS or ES module.
// An ES module, for the purposes of this algorithm, is defined as any
// JavaScript file containing an import or export statement.
function detectType(source) {
  let ast;
  try {
    ast = acorn.parse(source, {
      ecmaVersion: 10, // Highest supported version as of 2019
      allowReserved: true,
      allowImportExportEverywhere: true,
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true, // Required to parse CommonJS
      allowHashBang: true // Required to parse hashbang scripts
    });
  } catch {
    return 'commonjs';
  }

  // Walk the AST until we encounter an import or export statement.
  // We put this in try/catch so that we can stop walking as soon as we find
  // either. Acorn-walk has no built-in break/early termination functionality,
  // so try/catch provides it (https://github.com/acornjs/acorn/issues/685).
  const walkedIntoImportOrExport = () => {
    throw new BreakWalk();
  };
  try {
    walk.simple(ast, {
      ImportDeclaration: walkedIntoImportOrExport,
      ExportNamedDeclaration: walkedIntoImportOrExport,
      ExportDefaultDeclaration: walkedIntoImportOrExport,
      ExportAllDeclaration: walkedIntoImportOrExport
    });
  } catch (err) {
    if (err instanceof BreakWalk)
      return 'module';
  }
  return 'commonjs';
}

module.exports = detectType;
