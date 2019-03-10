const identifier = 'package-without-type';
console.log(identifier);
if (typeof module !== 'undefined')
  module.exports = identifier;
