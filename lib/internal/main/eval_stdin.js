'use strict';

// Stdin is not a TTY, we will read it and execute it.

const {
  prepareMainThreadExecution
} = require('internal/bootstrap/pre_execution');

const { getOptionValue } = require('internal/options');

const {
  evalModule,
  evalScript,
  readStdin
} = require('internal/process/execution');

prepareMainThreadExecution();
markBootstrapComplete();

readStdin((code) => {
  process._eval = code;
  const typeFlag = getOptionValue('--input-type');
  if (typeFlag === 'module' ||
    (typeFlag === 'auto' &&
    require('internal/modules/esm/detect_type')(code, '[stdin]') === 'module'))
    evalModule(process._eval);
  else
    evalScript('[stdin]', process._eval, process._breakFirstLine);
});
