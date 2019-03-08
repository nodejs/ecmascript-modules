'use strict';
const common = require('../common');
const assert = require('assert');
const exec = require('child_process').execFile;

const version = process.version;

expect('esm-with-import-statement.js', version);
expect('esm-with-export-statement.js', version);

expect('cjs-with-require.js', version);
expect('cjs-with-import-expression.js', version);
expect('cjs-with-property-named-import.js', version);
expect('cjs-with-string-containing-import.js', version);

expect('print-version.js', version);
expect('ambiguous-with-import-expression.js', version);

function expect(file, want) {
  const argv = [
    require.resolve(`../fixtures/es-modules/type-auto-scope/${file}`)
  ];
  ['--type=auto', '-a'].forEach((opt) => {
    // TODO: Remove when --experimental-modules is unflagged
    opt = `--experimental-modules ${opt}`;
    const opts = {
      env: Object.assign({}, process.env, { NODE_OPTIONS: opt }),
      maxBuffer: 1e6,
    };
    exec(process.execPath, argv, opts,
         common.mustCall((err, stdout, stderr) => {
           if (stdout.includes(want)) return;
           assert.fail(
             `For ${file}, failed to find ${want} in: <\n${stdout}\n>`);
         }));
  });
}
