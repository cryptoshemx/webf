// services/binanceApi.js - Funciones para obtener datos de Binance

const axios = require('axios');
const { marketData } = require('../models/marketData');
const config = require('../config/config');
const indicators = require('./indicators');

/**
 * Obtiene todos los activos USDT en estado TRADING
 * @returns {Promise<Array>} Lista de símbolos de activos
 */
async function getUSDTFuturesAssets() {
  try {
    const response = await axios.get(config.apiUrls.futuresExchangeInfo);
    const symbols = response.data.symbols;
    
    // Filtrar solo los pares USDT que estén en estado TRADING
    const usdtAssets = symbols.filter(symbol => 
      symbol.quoteAsset === 'USDT' && 
      symbol.status === 'TRADING'
    );
    
    console.log(`Encontrados ${usdtAssets.length} pares USDT en estado TRADING`);
    
    // Guardar la información de los activos
    usdtAssets.forEach(asset => {
      marketData.assets[asset.symbol] = {
        symbol: asset.symbol,
        baseAsset: asset.baseAsset,
        quoteAsset: asset.quoteAsset,
        pricePrecision: asset.pricePrecision,
        quantityPrecision: asset.quantityPrecision
      };
    });
    
    return usdtAssets.map(asset => asset.symbol);
  } catch (error) {
    console.error('Error al obtener activos USDT:', error);
    return [];
  }
}

/**
 * Obtiene los klines históricos de un activo
 * @param {string} symbol - Símbolo del activo
 * @param {string} timeframe - Timeframe
 * @param {number} limit - Cantidad de klines a obtener
 * @returns {Promise<Array>} Lista de klines procesados
 */
async function getHistoricalKlines(symbol, timeframe, limit = config.limits.historicalKlines) {
  try {
    const response = await axios.get(config.apiUrls.futuresKlines, {
      params: {
        symbol: symbol,
        interval: timeframe,
        limit: limit
      }
    });
    
    // Procesamos los klines
    const klines = response.data.map(kline => ({
      openTime: kline[0],
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[5]),
      closeTime: kline[6],
      quoteAssetVolume: parseFloat(kline[7]),
      numberOfTrades: kline[8],
      takerBuyBaseAssetVolume: parseFloat(kline[9]),
      takerBuyQuoteAssetVolume: parseFloat(kline[10])
    }));
    
    // Inicializamos la estructura si no existe
    if (!marketData.klines[symbol]) {
      marketData.klines[symbol] = {};
    }
    
    // Guardamos los klines
    marketData.klines[symbol][timeframe] = klines;
    
    return klines;
  } catch (error) {
    console.error(`Error al obtener klines para ${symbol} en timeframe ${timeframe}:`, error);
    return [];
  }
}

/**
 * Calcula los umbrales máximos de movimiento de un activo
 * @param {string} symbol - Símbolo del activo
 */
function calculateThresholds(symbol) {
  const klines = marketData.klines[symbol]['1d'] || [];
  
  if (klines.length === 0) {
    marketData.thresholds[symbol] = { positive: 0, negative: 0 };
    return;
  }
  
  // Calculamos el cambio porcentual máximo positivo y negativo
  let maxPositive = 0;
  let maxNegative = 0;
  
  klines.forEach(kline => {
    const changePercent = ((kline.high - kline.low) / kline.low) * 100;
    
    if (changePercent > maxPositive) {
      maxPositive = changePercent;
    }
    
    const negativeChange = ((kline.low - kline.high) / kline.high) * 100;
    if (negativeChange < maxNegative) {
      maxNegative = negativeChange;
    }
  });
  
  marketData.thresholds[symbol] = {
    positive: maxPositive,
    negative: maxNegative
  };
}

/**
 * Calcula indicadores técnicos para un activo y timeframe
 * @param {string} symbol - Símbolo del activo
 * @param {string} timeframe - Timeframe
 */
function calculateIndicators(symbol, timeframe) {
  indicators.calculateIndicators(symbol, timeframe);
}

/**
 * Actualiza los timeframes superiores basándose en datos de 1m
 * @param {string} symbol - Símbolo del activo
 * @param {Object} oneMinKline - Datos del kline de 1 minuto
 */
function updateHigherTimeframesWithOneMinute(symbol, oneMinKline) {
  // Verificar que tenemos datos del símbolo
  if (!marketData.klines[symbol]) return;
  
  const minTimestamp = parseInt(oneMinKline.t);
  const minCloseTimestamp = parseInt(oneMinKline.T);
  const currentPrice = parseFloat(oneMinKline.c);
  
  // Procesar cada timeframe periódico y extendido
  [...config.timeframes.periodic, ...config.timeframes.extended].forEach(tf => {
    if (!marketData.klines[symbol][tf] || marketData.klines[symbol][tf].length === 0) return;
    
    // Obtener el último kline del timeframe superior
    const lastKline = marketData.klines[symbol][tf][marketData.klines[symbol][tf].length - 1];
    
    // Verificar si el kline de 1m actual pertenece al kline del timeframe superior
    // (está dentro del rango de tiempo del kline de mayor timeframe)
    if (minTimestamp >= lastKline.openTime && minCloseTimestamp <= lastKline.closeTime) {
      // Guardar precio anterior para logging
      const previousClose = lastKline.close;
      
      // Actualizar high y low si es necesario
      lastKline.high = Math.max(lastKline.high, parseFloat(oneMinKline.h));
      lastKline.low = Math.min(lastKline.low, parseFloat(oneMinKline.l));
      
      // Siempre actualizar el close con el último precio
      lastKline.close = currentPrice;
      
      // Actualizar también el volumen sumando el incremento
      lastKline.volume += parseFloat(oneMinKline.v);
      lastKline.quoteAssetVolume += parseFloat(oneMinKline.q);
      
      // Actualizamos los indicadores para este timeframe
      calculateIndicators(symbol, tf);
    }
  });
}

/**
 * Carga datos de prueba para desarrollo
 */
function loadTestData() {
  console.log('Cargando datos de prueba...');
  
  // Simular algunos timeframes e indicadores
  const testTimeframes = ['1m', '5m', '15m', '1h', '4h', '1d'];
  
  // Agregar algunos activos de prueba
  ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'DOGEUSDT'].forEach(symbol => {
    marketData.assets[symbol] = {
      symbol: symbol,
      baseAsset: symbol.replace('USDT', ''),
      quoteAsset: 'USDT',
      pricePrecision: 2,
      quantityPrecision: 3
    };
  });
  
  testTimeframes.forEach(timeframe => {
    // Inicializar estructuras para cada activo
    Object.keys(marketData.assets).forEach(symbol => {
      // Inicializar estructuras
      if (!marketData.klines[symbol]) {
        marketData.klines[symbol] = {};
      }
      
      if (!marketData.indicators[symbol]) {
        marketData.indicators[symbol] = {};
      }
      
      // Precios diferentes según el activo
      const basePrice = symbol === 'BTCUSDT' ? 60000 :
                       symbol === 'ETHUSDT' ? 3000 : 
                       symbol === 'BNBUSDT' ? 350 : 
                       symbol === 'ADAUSDT' ? 0.5 : 
                       symbol === 'DOGEUSDT' ? 0.1 : 1;
      
      // Crear un kline ficticio
      marketData.klines[symbol][timeframe] = [{
        openTime: Date.now(),
        open: basePrice,
        high: basePrice * 1.02,
        low: basePrice * 0.98,
        close: basePrice * 1.01,
        volume: 1000,
        closeTime: Date.now() + 3600000,
        quoteAssetVolume: basePrice * 1000
      }];
      
      // Crear indicadores ficticios (para que algunos estén por encima y otros por debajo)
      const shouldBeAbove = (symbol === 'ETHUSDT' || symbol === 'DOGEUSDT');
      
      marketData.indicators[symbol][timeframe] = {
        ma20: shouldBeAbove ? basePrice * 0.95 : basePrice * 1.05,
        ma50: shouldBeAbove ? basePrice * 0.90 : basePrice * 1.10,
        ma200: shouldBeAbove ? basePrice * 0.85 : basePrice * 1.15,
        rsi: shouldBeAbove ? 65 : 35,
        bb: {
          upper: basePrice * 1.10,
          middle: basePrice,
          lower: basePrice * 0.90
        },
        updated: Date.now()
      };
    });
  });
  
  console.log('Datos de prueba cargados.');
}

/**
 * Obtiene la cotización actual de un activo 
 * @param {string} symbol - Símbolo del activo
 * @returns {Promise<number>} Precio actual
 */
async function getCurrentPrice(symbol) {
  try {
    const response = await axios.get(`${config.apiUrls.futuresTicker}?symbol=${symbol}`);
    return parseFloat(response.data.price);
  } catch (error) {
    console.error(`Error al obtener precio actual de ${symbol}:`, error);
    return null;
  }
}

// Exportar para uso en otros módulos
module.exports = {
  getUSDTFuturesAssets,
  getHistoricalKlines,
  calculateThresholds,
  calculateIndicators,
  updateHigherTimeframesWithOneMinute,
  loadTestData,
  getCurrentPrice
};