// models/marketData.js - Estructura de datos global

/**
 * Estructura de datos global para almacenar información del mercado
 */
const marketData = {
    assets: {},          // Información de los activos
    klines: {},          // Klines por activo y timeframe
    indicators: {},      // Indicadores por activo y timeframe
    thresholds: {},      // Umbrales máximos de movimiento por activo
    analysisResults: {}  // Resultados del análisis por timeframe
  };
  
  // Conexiones websocket activas
  const activeWebsockets = {};
  
  // Exportar para uso en otros módulos
  module.exports = {
    marketData,
    activeWebsockets
  };