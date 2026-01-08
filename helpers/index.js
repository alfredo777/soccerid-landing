/**
 * Índice de Handlebars Helpers
 * Carga y registra todos los helpers automáticamente
 */
const fs = require('fs');
const path = require('path');

module.exports = function(hbs) {
  const helpersDir = __dirname;
  
  console.log('\n[Helpers] Registrando helpers de Handlebars...');
  
  // Leer todos los archivos de helpers
  fs.readdirSync(helpersDir).forEach(file => {
    if (file === 'index.js' || !file.endsWith('.js')) return;
    
    try {
      const helperModule = require(path.join(helpersDir, file));
      
      // Registrar cada helper del módulo
      Object.keys(helperModule).forEach(helperName => {
        hbs.registerHelper(helperName, helperModule[helperName]);
      });
      
      console.log(`  ✓ Cargado: ${file} (${Object.keys(helperModule).length} helpers)`);
    } catch (err) {
      console.error(`  ✗ Error cargando ${file}: ${err.message}`);
    }
  });
  
  console.log('[Helpers] Registro completado.\n');
};
