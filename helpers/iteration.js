/**
 * Helpers de iteración avanzada para Handlebars
 */
module.exports = {
  eachWithIndex: function(array, options) {
    if (!Array.isArray(array)) return options.inverse(this);
    
    let result = '';
    array.forEach((item, index) => {
      result += options.fn({
        ...item,
        '@index': index,
        '@number': index + 1,
        '@first': index === 0,
        '@last': index === array.length - 1,
        '@odd': index % 2 === 1,
        '@even': index % 2 === 0,
        '@length': array.length
      });
    });
    return result;
  },
  eachProperty: function(obj, options) {
    if (!obj || typeof obj !== 'object') return options.inverse(this);
    
    let result = '';
    const keys = Object.keys(obj);
    keys.forEach((key, index) => {
      result += options.fn({
        '@key': key,
        '@value': obj[key],
        '@index': index,
        '@first': index === 0,
        '@last': index === keys.length - 1
      });
    });
    return result;
  },
  range: function(start, end, options) {
    let result = '';
    for (let i = start; i <= end; i++) {
      result += options.fn({
        value: i,
        '@index': i - start,
        '@first': i === start,
        '@last': i === end
      });
    }
    return result;
  },
  groupBy: function(array, property, options) {
    if (!Array.isArray(array)) return options.inverse(this);
    
    const groups = {};
    array.forEach(item => {
      const key = item[property] || 'undefined';
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    
    let result = '';
    Object.keys(groups).forEach((key, index) => {
      result += options.fn({
        '@key': key,
        '@items': groups[key],
        '@count': groups[key].length,
        '@index': index
      });
    });
    return result;
  }
};
