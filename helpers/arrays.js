/**
 * Helpers de arrays para Handlebars
 */
module.exports = {
  length: function(arr) {
    return Array.isArray(arr) ? arr.length : 0;
  },
  first: function(arr) {
    return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
  },
  last: function(arr) {
    return Array.isArray(arr) && arr.length > 0 ? arr[arr.length - 1] : null;
  },
  at: function(arr, index) {
    return Array.isArray(arr) ? arr[index] : null;
  },
  join: function(arr, separator) {
    if (!Array.isArray(arr)) return '';
    separator = typeof separator === 'string' ? separator : ', ';
    return arr.join(separator);
  },
  limit: function(arr, count, options) {
    if (!Array.isArray(arr)) return options.inverse(this);
    const limited = arr.slice(0, count);
    let result = '';
    limited.forEach((item, index) => {
      result += options.fn({ ...item, '@index': index, '@first': index === 0, '@last': index === limited.length - 1 });
    });
    return result;
  },
  includes: function(arr, value, options) {
    if (!Array.isArray(arr)) return options.inverse(this);
    return arr.includes(value) ? options.fn(this) : options.inverse(this);
  }
};
