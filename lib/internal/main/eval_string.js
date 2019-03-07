'use strict';

// User passed `-e` or `--eval` arguments to Node without `-i` or
// `--interactive`.

const {
  prepareMainThreadExecution
} = require('internal/bootstrap/pre_execution');
const { evalModule, evalScript } = require('internal/process/execution');
const { addBuiltinLibsToObject } = require('internal/modules/cjs/helpers');

const { getOptionValue } = require('internal/options');
const source = getOptionValue('--eval');
prepareMainThreadExecution();
addBuiltinLibsToObject(global);
markBootstrapComplete();

const typeFlag = getOptionValue('--input-type');
if (typeFlag === 'module' ||
  (typeFlag === 'auto' &&
   require('internal/modules/esm/detect_type')(code) === 'module'))
  evalModule(source);
else
  evalScript('[eval]', source, process._breakFirstLine);
