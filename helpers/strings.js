/**
 * Helpers de manipulación de strings para Handlebars
 */
module.exports = {
  uppercase: function(str) {
    return str ? str.toUpperCase() : '';
  },
  lowercase: function(str) {
    return str ? str.toLowerCase() : '';
  },
  capitalize: function(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  },
  truncate: function(str, len, suffix) {
    if (!str) return '';
    suffix = typeof suffix === 'string' ? suffix : '...';
    if (str.length <= len) return str;
    return str.substring(0, len) + suffix;
  },
  replace: function(str, search, replace) {
    if (!str) return '';
    return str.split(search).join(replace);
  },
  concat: function(...args) {
    args.pop();
    return args.join('');
  },
  contains: function(str, search, options) {
    if (!str || !search) return options.inverse(this);
    return str.includes(search) ? options.fn(this) : options.inverse(this);
  }
};
