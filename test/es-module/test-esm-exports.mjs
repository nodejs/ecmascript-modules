// Flags: --experimental-modules

import { mustCall } from '../common/index.mjs';
import { ok, strictEqual } from 'assert';

import { asdf, asdf2 } from '../fixtures/pkgexports.mjs';
import { loadMissing, loadFromNumber } from '../fixtures/pkgexports-missing.mjs';

strictEqual(asdf, 'asdf');
strictEqual(asdf2, 'asdf');

loadMissing().catch(mustCall((err) => {
  ok(err.message.toString().startsWith('Package exports'));
  ok(err.message.toString().indexOf('do not define a \'./missing\' subpath'));
}));

loadFromNumber().catch(mustCall((err) => {
  ok(err.message.toString().startsWith('Package exports'));
  ok(err.message.toString().indexOf('do not define a \'./missing\' subpath'));
}));
