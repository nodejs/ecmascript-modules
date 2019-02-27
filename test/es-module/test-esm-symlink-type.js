'use strict';
const common = require('../common');
const path = require('path');
const assert = require('assert');
const exec = require('child_process').execFile;

// Check that running the symlink executes the target as the correct type
const symlinks = [
  {
    source: 'extensionless-symlink-to-mjs-file',
    prints: '.mjs file',
    errorsWithPreserveSymlinksMain: false
  }, {
    source: 'extensionless-symlink-to-cjs-file',
    prints: '.cjs file',
    errorsWithPreserveSymlinksMain: false
  }, {
    source: 'extensionless-symlink-to-file-in-module-scope',
    prints: 'package-type-module',
    // The package scope of the symlinks' sources is commonjs, and this
    // symlink's target is a .js file in a module scope, so when the scope
    // is evaluated based on the source (commonjs) this esm file should error
    errorsWithPreserveSymlinksMain: true
  }, {
    source: 'extensionless-symlink-to-file-in-explicit-commonjs-scope',
    prints: 'package-type-commonjs',
    errorsWithPreserveSymlinksMain: false
  }, {
    source: 'extensionless-symlink-to-file-in-implicit-commonjs-scope',
    prints: 'package-without-type',
    errorsWithPreserveSymlinksMain: false
  }
];

symlinks.forEach((symlink) => {
  const argv = [
    path.join(__dirname, '../fixtures/es-modules/', symlink.source)
  ];
  // TODO: Update when --experimental-modules is unflagged
  const flags = [
    '--experimental-modules',
    '--experimental-modules --preserve-symlinks-main'
  ];
  flags.forEach((nodeOptions) => {
    const opts = {
      env: Object.assign({}, process.env, { NODE_OPTIONS: nodeOptions }),
      maxBuffer: 1e6,
    };
    exec(process.execPath, argv, opts, common.mustCall(
      (err, stdout, stderr) => {
        if (nodeOptions.includes('--preserve-symlinks-main')) {
          if (symlink.errorsWithPreserveSymlinksMain &&
              stderr.includes('Error')) return;
          else if (!symlink.errorsWithPreserveSymlinksMain &&
                    stdout.includes(symlink.prints)) return;
          assert.fail(`For ${JSON.stringify(symlink)}, ${
            (symlink.errorsWithPreserveSymlinksMain) ?
              'failed to error' : 'errored unexpectedly'
          } with --preserve-symlinks-main`);
        } else {
          if (stdout.includes(symlink.prints)) return;
          assert.fail(`For ${JSON.stringify(symlink)}, failed to find ` +
            `${symlink.prints} in: <\n${stdout}\n>`);
        }
      }
    ));
  });
});
