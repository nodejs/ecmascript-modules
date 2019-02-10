'use strict';

// test we can use commonjs require
require('path');

Object.defineProperty(exports, 'name', {
  value: 'value'
});
exports.你好 = 'yay';

// invalid identifiers must be ignored:
exports['👎'] = exports['||'] = 'nay';

exports.execTime = +Date.now();
