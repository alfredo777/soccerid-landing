/**
 * Utilidades de Handlebars para el cliente
 * Proyecto: landing-soccerid-v2_0
 */

(function() {
  'use strict';

  // Comparación
  Handlebars.registerHelper('eq', function(a, b, options) {
    return a === b ? options.fn(this) : options.inverse(this);
  });
  
  Handlebars.registerHelper('neq', function(a, b, options) {
    return a !== b ? options.fn(this) : options.inverse(this);
  });
  
  Handlebars.registerHelper('gt', function(a, b, options) {
    return a > b ? options.fn(this) : options.inverse(this);
  });
  
  Handlebars.registerHelper('lt', function(a, b, options) {
    return a < b ? options.fn(this) : options.inverse(this);
  });
  
  Handlebars.registerHelper('and', function(a, b, options) {
    return a && b ? options.fn(this) : options.inverse(this);
  });
  
  Handlebars.registerHelper('or', function(a, b, options) {
    return a || b ? options.fn(this) : options.inverse(this);
  });
  
  // Strings
  Handlebars.registerHelper('uppercase', function(str) {
    return str ? str.toUpperCase() : '';
  });
  
  Handlebars.registerHelper('lowercase', function(str) {
    return str ? str.toLowerCase() : '';
  });
  
  Handlebars.registerHelper('capitalize', function(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  });
  
  Handlebars.registerHelper('truncate', function(str, len, suffix) {
    if (!str) return '';
    suffix = typeof suffix === 'string' ? suffix : '...';
    if (str.length <= len) return str;
    return str.substring(0, len) + suffix;
  });
  
  Handlebars.registerHelper('concat', function(...args) {
    args.pop();
    return args.join('');
  });
  
  // Arrays
  Handlebars.registerHelper('length', function(arr) {
    return Array.isArray(arr) ? arr.length : 0;
  });
  
  Handlebars.registerHelper('first', function(arr) {
    return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
  });
  
  Handlebars.registerHelper('last', function(arr) {
    return Array.isArray(arr) && arr.length > 0 ? arr[arr.length - 1] : null;
  });
  
  Handlebars.registerHelper('join', function(arr, separator) {
    if (!Array.isArray(arr)) return '';
    return arr.join(typeof separator === 'string' ? separator : ', ');
  });
  
  // Matemáticas
  Handlebars.registerHelper('add', function(a, b) {
    return Number(a) + Number(b);
  });
  
  Handlebars.registerHelper('subtract', function(a, b) {
    return Number(a) - Number(b);
  });
  
  Handlebars.registerHelper('multiply', function(a, b) {
    return Number(a) * Number(b);
  });
  
  Handlebars.registerHelper('divide', function(a, b) {
    return b !== 0 ? Number(a) / Number(b) : 0;
  });
  
  // Misceláneos
  Handlebars.registerHelper('json', function(obj) {
    return JSON.stringify(obj, null, 2);
  });
  
  Handlebars.registerHelper('default', function(value, defaultValue) {
    return value != null && value !== '' ? value : defaultValue;
  });
  
  Handlebars.registerHelper('ternary', function(condition, ifTrue, ifFalse) {
    return condition ? ifTrue : ifFalse;
  });
  
  // Formateo
  Handlebars.registerHelper('currency', function(amount, currency, locale) {
    currency = typeof currency === 'string' ? currency : 'MXN';
    locale = typeof locale === 'string' ? locale : 'es-MX';
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency
      }).format(amount);
    } catch (e) {
      return amount;
    }
  });
  
  Handlebars.registerHelper('formatDate', function(date, locale) {
    if (!date) return '';
    locale = typeof locale === 'string' ? locale : 'es-MX';
    try {
      return new Date(date).toLocaleDateString(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (e) {
      return date;
    }
  });

  console.log('[HBS Utils] Helpers del cliente registrados.');
})();
