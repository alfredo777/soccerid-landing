/**
 * Helpers misceláneos para Handlebars
 */
module.exports = {
  json: function(obj) {
    return JSON.stringify(obj, null, 2);
  },
  uuid: function() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },
  repeat: function(count, options) {
    let result = '';
    for (let i = 0; i < count; i++) {
      result += options.fn({ index: i, count: count, first: i === 0, last: i === count - 1 });
    }
    return result;
  },
  ternary: function(condition, ifTrue, ifFalse) {
    return condition ? ifTrue : ifFalse;
  },
  default: function(value, defaultValue) {
    return value != null && value !== '' ? value : defaultValue;
  },
  log: function(value) {
    console.log('[HBS Debug]:', value);
    return '';
  },
  encodeURI: function(str) {
    return encodeURIComponent(str || '');
  },
  raw: function(content) {
    return content;
  },
  // Helper section para contenido opcional
  section: function(name, options) {
    if (!this._sections) this._sections = {};
    this._sections[name] = options.fn(this);
    return null;
  }
};
