/* eslint-disable strict no-global-assign */
try {
  NaN = undefined;
  module.exports = false;
} catch (e) {
  module.exports = true;
}
