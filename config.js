/**
 * Configuración del servidor
 * Proyecto: landing-soccerid-v2_0
 */

module.exports = {
  port: process.env.PORT || 3000,
  debug: process.env.NODE_ENV !== 'production',
  staticMaxAge: process.env.NODE_ENV === 'production' ? '0' : '0',
  project: {
    name: 'landing-soccerid-v2_0',
    version: '1.0.0',
    description: 'Proyecto Handlebars generado automáticamente'
  },
  whatsapp: {
    number: '12315158991',
    defaultMessage: 'Hola, me gustaría obtener más información'
  }
};
