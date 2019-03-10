'use strict';
require('../common');
const fixtures = require('../common/fixtures');
const { spawn } = require('child_process');
const assert = require('assert');

spawn(process.execPath, ['--experimental-modules', '-m',
                         fixtures.path('es-modules/esm-main.js')],
      { stdio: 'inherit' }).on('exit', (code) => {
  assert.strictEqual(code, 0);
});
