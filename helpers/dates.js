/**
 * Helpers de fechas para Handlebars
 */
module.exports = {
  formatDate: function(date, locale) {
    if (!date) return '';
    locale = typeof locale === 'string' ? locale : 'es-MX';
    try {
      const d = new Date(date);
      return d.toLocaleDateString(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (e) {
      return date;
    }
  },
  formatDateTime: function(date, locale) {
    if (!date) return '';
    locale = typeof locale === 'string' ? locale : 'es-MX';
    try {
      const d = new Date(date);
      return d.toLocaleString(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return date;
    }
  },
  now: function() {
    return new Date().toISOString();
  },
  year: function() {
    return new Date().getFullYear();
  },
  timeAgo: function(date) {
    if (!date) return '';
    try {
      const d = new Date(date);
      const now = new Date();
      const diff = now - d;
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      
      if (days > 0) return `hace ${days} día${days > 1 ? 's' : ''}`;
      if (hours > 0) return `hace ${hours} hora${hours > 1 ? 's' : ''}`;
      if (minutes > 0) return `hace ${minutes} minuto${minutes > 1 ? 's' : ''}`;
      return 'hace un momento';
    } catch (e) {
      return date;
    }
  }
};
