'use strict';

const {
  callbackMap,
} = internalBinding('module_wrap');
const {
  ERR_INVALID_TYPE_FLAG,
  ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING,
} = require('internal/errors').codes;

const type = require('internal/options').getOptionValue('--type');
if (type && type !== 'commonjs' && type !== 'module')
  throw new ERR_INVALID_TYPE_FLAG(type);
exports.typeFlag = type;

const { Loader } = require('internal/modules/esm/loader');
const {
  wrapToModuleMap,
} = require('internal/vm/source_text_module');

exports.initializeImportMetaObject = function(wrap, meta) {
  if (callbackMap.has(wrap)) {
    const { initializeImportMeta } = callbackMap.get(wrap);
    if (initializeImportMeta !== undefined) {
      initializeImportMeta(meta, wrapToModuleMap.get(wrap) || wrap);
    }
  }
};

exports.importModuleDynamicallyCallback = async function(wrap, specifier) {
  if (callbackMap.has(wrap)) {
    const { importModuleDynamically } = callbackMap.get(wrap);
    if (importModuleDynamically !== undefined) {
      return importModuleDynamically(
        specifier, wrapToModuleMap.get(wrap) || wrap);
    }
  }
  throw new ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING();
};

let loaderResolve;
exports.loaderPromise = new Promise((resolve) => loaderResolve = resolve);

exports.ESMLoader = undefined;

exports.initializeLoader = function(cwd, userLoader) {
  const ESMLoader = new Loader();
  const loaderPromise = (async () => {
    return ESMLoader;
  })();
  loaderResolve(loaderPromise);

  exports.ESMLoader = ESMLoader;
};
