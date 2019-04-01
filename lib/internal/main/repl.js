'use strict';

// Create the REPL if `-i` or `--interactive` is passed, or if
// the main module is not specified and stdin is a TTY.

const {
  prepareMainThreadExecution
} = require('internal/bootstrap/pre_execution');

const {
  evalScript
} = require('internal/process/execution');

prepareMainThreadExecution();

// --input-type flag not supported in REPL
if (require('internal/options').getOptionValue('--input-type')) {
  const { ERR_INPUT_TYPE_NOT_ALLOWED } = require('internal/errors').codes;
  // Cannot specify --input-type for REPL.
  throw new ERR_INPUT_TYPE_NOT_ALLOWED();
}

const cliRepl = require('internal/repl');
cliRepl.createInternalRepl(process.env, (err, repl) => {
  if (err) {
    throw err;
  }
  repl.on('exit', () => {
    if (repl._flushing) {
      repl.pause();
      return repl.once('flushHistory', () => {
        process.exit();
      });
    }
    process.exit();
  });
});

// If user passed '-e' or '--eval' along with `-i` or `--interactive`,
// evaluate the code in the current context.
if (process._eval != null) {
  evalScript('[eval]', process._eval, process._breakFirstLine);
}

markBootstrapComplete();
