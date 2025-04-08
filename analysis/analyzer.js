// analysis/analyzer.js - Lógica de análisis de mercado

const { marketData } = require('../models/marketData');
const config = require('../config/config');

// Variable para mantener la instancia de Socket.IO
let io;

/**
 * Establece la instancia de Socket.IO para emitir datos
 * @param {SocketIO.Server} ioInstance - Instancia de Socket.IO
 */
function setIoInstance(ioInstance) {
  io = ioInstance;
}

/**
 * Realiza análisis de mercado comparando con BTC
 * Esta función se llama periódicamente para actualizar el dashboard
 */
function analyzeMarketAgainstBTC() {
  // Verificar si tenemos datos de BTCUSDT
  if (!marketData.indicators['BTCUSDT']) {
    console.warn("No hay datos de BTCUSDT para realizar análisis");
    return;
  }
  
  // Objeto para resultados del análisis
  const analysisResults = {};
  
  // Para cada timeframe
  config.allTimeframes.forEach(timeframe => {
    // Verificar si tenemos datos de BTCUSDT para este timeframe
    if (!marketData.indicators['BTCUSDT'][timeframe]) {
      // No mostramos advertencia para no saturar la consola
      return;
    }
    
    const btcIndicators = marketData.indicators['BTCUSDT'][timeframe];
    if (!btcIndicators || !btcIndicators.ma20 || !btcIndicators.ma50 || !btcIndicators.ma200) {
      return;
    }
    
    const btcKlines = marketData.klines['BTCUSDT'][timeframe];
    if (!btcKlines || btcKlines.length === 0) {
      return;
    }
    
    // Obtener el último precio de cierre de BTCUSDT
    const btcPrice = btcKlines[btcKlines.length - 1].close;
    //console.log(`BTC price for ${timeframe}: ${btcPrice}`); // Log para debugging
    
    const btcAboveMA20 = btcPrice > btcIndicators.ma20;
    const btcAboveMA50 = btcPrice > btcIndicators.ma50;
    const btcAboveMA200 = btcPrice > btcIndicators.ma200;
    
    // Estatus general de BTC respecto a sus MAs (true = above, false = below)
    const btcStatus = {
      ma20: btcAboveMA20,
      ma50: btcAboveMA50,
      ma200: btcAboveMA200
    };
    
    // Lista de activos que cumplen las condiciones
    const matchingAssets = [];
    
    // Verificar cada activo (saltamos BTCUSDT porque es nuestra referencia)
    Object.keys(marketData.assets).forEach(symbol => {
      if (symbol === 'BTCUSDT') return; // Saltamos BTCUSDT
      
      if (!marketData.indicators[symbol] || !marketData.indicators[symbol][timeframe]) {
        return; // Saltamos símbolos sin datos
      }
      
      const assetIndicators = marketData.indicators[symbol][timeframe];
      if (!assetIndicators || !assetIndicators.ma20 || !assetIndicators.ma50 || !assetIndicators.ma200) {
        return; // Saltamos símbolos sin indicadores completos
      }
      
      const assetKlines = marketData.klines[symbol][timeframe];
      if (!assetKlines || assetKlines.length === 0) {
        return; // Saltamos símbolos sin klines
      }
      
      const assetPrice = assetKlines[assetKlines.length - 1].close;
      const assetAboveMA20 = assetPrice > assetIndicators.ma20;
      const assetAboveMA50 = assetPrice > assetIndicators.ma50;
      const assetAboveMA200 = assetPrice > assetIndicators.ma200;
      
      // Condición: Si BTC está por encima, buscamos activos por debajo
      // Si BTC está por debajo, buscamos activos por encima
      // Verificamos relación específica con cada MA
      const btcMA20Status = btcPrice > btcIndicators.ma20;
      const btcMA50Status = btcPrice > btcIndicators.ma50;
      const btcMA200Status = btcPrice > btcIndicators.ma200;
      
      const assetMA20Status = assetPrice > assetIndicators.ma20;
      const assetMA50Status = assetPrice > assetIndicators.ma50;
      const assetMA200Status = assetPrice > assetIndicators.ma200;
      
      // El activo debe tener comportamiento opuesto a BTC en las tres medias
      if ((btcMA20Status !== assetMA20Status) && 
          (btcMA50Status !== assetMA50Status) && 
          (btcMA200Status !== assetMA200Status)) {
        
        // Calculamos el volumen en USDT
        const volumeUSDT = assetKlines[assetKlines.length - 1].quoteAssetVolume;
        
        // Determinamos si está por encima o por debajo de las MAs (criterio mayoría)
        const maCount = (assetAboveMA20 ? 1 : 0) + (assetAboveMA50 ? 1 : 0) + (assetAboveMA200 ? 1 : 0);
        const maStatus = maCount >= 2 ? 'above' : 'below';
        
        matchingAssets.push({
          symbol,
          price: assetPrice,
          volumeUSDT,
          rsi: assetIndicators.rsi,
          ma20: assetIndicators.ma20,
          ma50: assetIndicators.ma50,
          ma200: assetIndicators.ma200,
          status: maStatus
        });
      }
    });
    
    // Ordenar por volumen descendente
    matchingAssets.sort((a, b) => b.volumeUSDT - a.volumeUSDT);
    
    // Guardar resultados
    analysisResults[timeframe] = {
      btcPrice,
      btcStatus: {
        ma20: btcAboveMA20 ? 'above' : 'below',
        ma50: btcAboveMA50 ? 'above' : 'below',
        ma200: btcAboveMA200 ? 'above' : 'below'
      },
      btcStatusBool: btcStatus, // Añadimos el estado booleano para referencia
      matchingAssets,
      updated: Date.now()
    };
  });
  
  // Actualizar el objeto de resultados global
  marketData.analysisResults = analysisResults;
  
  // Verificar si hay resultados para emitir
  if (Object.keys(analysisResults).length > 0 && io) {
    // Emitir los resultados a todos los clientes conectados
    io.emit('analysisUpdate', marketData.analysisResults);
  } else if (!io) {
    console.warn('No se pudo emitir el análisis: instancia de Socket.IO no inicializada');
  } else {
    console.warn('No se generaron resultados de análisis para emitir');
  }
}

/**
 * Realiza análisis personalizados del mercado
 * @param {Object} options - Opciones para el análisis
 */
function performCustomAnalysis(options = {}) {
  // Implementación de análisis personalizados 
  // (por ejemplo, con diferentes criterios o condiciones)
  console.log('Realizando análisis personalizado con opciones:', options);
  
  // Como ejemplo, podríamos implementar un análisis similar al principal
  // pero con criterios más flexibles o diferentes
}

// Exportar funciones
module.exports = {
  setIoInstance,
  analyzeMarketAgainstBTC,
  performCustomAnalysis
};