/**
 * Helpers matemáticos para Handlebars
 */
module.exports = {
  add: function(a, b) {
    return Number(a) + Number(b);
  },
  subtract: function(a, b) {
    return Number(a) - Number(b);
  },
  multiply: function(a, b) {
    return Number(a) * Number(b);
  },
  divide: function(a, b) {
    return b !== 0 ? Number(a) / Number(b) : 0;
  },
  mod: function(a, b) {
    return Number(a) % Number(b);
  },
  round: function(num, decimals) {
    decimals = typeof decimals === 'number' ? decimals : 0;
    return Number(Math.round(num + 'e' + decimals) + 'e-' + decimals);
  },
  abs: function(num) {
    return Math.abs(Number(num));
  },
  currency: function(amount, currency, locale) {
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
  },
  formatNumber: function(num, locale) {
    locale = typeof locale === 'string' ? locale : 'es-MX';
    try {
      return new Intl.NumberFormat(locale).format(num);
    } catch (e) {
      return num;
    }
  }
};
