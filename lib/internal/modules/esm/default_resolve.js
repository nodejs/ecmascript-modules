'use strict';

const { NativeModule } = require('internal/bootstrap/loaders');
const { ERR_TYPE_MISMATCH,
        ERR_UNKNOWN_FILE_EXTENSION } = require('internal/errors').codes;
const { getOptionValue } = require('internal/options');
const experimentalJsonModules = getOptionValue('--experimental-json-modules');
const { resolve: moduleWrapResolve } = internalBinding('module_wrap');
const { pathToFileURL, fileURLToPath } = require('internal/url');
const asyncESM = require('internal/process/esm_loader');
const preserveSymlinks = getOptionValue('--preserve-symlinks');
const preserveSymlinksMain = getOptionValue('--preserve-symlinks-main');
const { extname } = require('path');

const extensionFormatMap = {
  '__proto__': null,
  '.cjs': 'commonjs',
  '.js': 'module',
  '.mjs': 'module'
};

const legacyExtensionFormatMap = {
  '__proto__': null,
  '.cjs': 'commonjs',
  '.js': 'commonjs',
  '.json': 'commonjs',
  '.mjs': 'module',
  '.node': 'commonjs'
};

if (experimentalJsonModules) {
  // This is a total hack
  Object.assign(extensionFormatMap, {
    '.json': 'json'
  });
  Object.assign(legacyExtensionFormatMap, {
    '.json': 'json'
  });
}

function resolve(specifier, parentURL) {
  if (NativeModule.canBeRequiredByUsers(specifier)) {
    return {
      url: specifier,
      format: 'builtin'
    };
  }

  const isMain = parentURL === undefined;
  if (isMain)
    parentURL = pathToFileURL(`${process.cwd()}/`).href;

  const { url, type } =
      moduleWrapResolve(specifier, parentURL,
                        isMain ? !preserveSymlinksMain : !preserveSymlinks);

  const ext = extname(url.pathname);
  let format =
      (type !== 2 ? legacyExtensionFormatMap : extensionFormatMap)[ext];

  if (isMain && asyncESM.typeFlag) {
    // Conflict between explicit extension (.mjs, .cjs) and --type
    if (ext === '.cjs' && asyncESM.typeFlag === 'module' ||
        ext === '.mjs' && asyncESM.typeFlag === 'commonjs') {
      throw new ERR_TYPE_MISMATCH(
        fileURLToPath(url), ext, asyncESM.typeFlag, 'extension');
    }

    // Conflict between package scope type and --type
    if (ext === '.js') {
      if (type === 2 && asyncESM.typeFlag === 'commonjs' ||
          type === 1 && asyncESM.typeFlag === 'module') {
        throw new ERR_TYPE_MISMATCH(
          fileURLToPath(url), ext, asyncESM.typeFlag, 'scope');
      }
    }
  }
  if (!format) {
    if (isMain && asyncESM.typeFlag)
      format = asyncESM.typeFlag;
    else if (isMain)
      format = type === 2 ? 'module' : 'commonjs';
    else
      throw new ERR_UNKNOWN_FILE_EXTENSION(fileURLToPath(url),
                                           fileURLToPath(parentURL));
  }
  return { url: `${url}`, format };
}

module.exports = resolve;
