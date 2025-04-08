// services/indicators.js - Cálculo de indicadores técnicos

const technicalIndicators = require('technicalindicators');
const { marketData } = require('../models/marketData');

/**
 * Calcula indicadores técnicos para un activo y timeframe
 * @param {string} symbol - Símbolo del activo
 * @param {string} timeframe - Timeframe
 */
function calculateIndicators(symbol, timeframe) {
  if (!marketData.klines[symbol] || !marketData.klines[symbol][timeframe]) {
    console.warn(`No hay klines para ${symbol} en timeframe ${timeframe}`);
    return;
  }
  
  const klines = marketData.klines[symbol][timeframe];
  const closes = klines.map(kline => kline.close);
  
  // Inicializamos la estructura si no existe
  if (!marketData.indicators[symbol]) {
    marketData.indicators[symbol] = {};
  }
  
  if (!marketData.indicators[symbol][timeframe]) {
    marketData.indicators[symbol][timeframe] = {};
  }
  
  // Calcular MA20
  const ma20 = technicalIndicators.SMA.calculate({
    period: 20,
    values: closes
  });
  
  // Calcular MA50
  const ma50 = technicalIndicators.SMA.calculate({
    period: 50,
    values: closes
  });
  
  // Calcular MA200
  const ma200 = technicalIndicators.SMA.calculate({
    period: 200,
    values: closes
  });
  
  // Calcular Bandas de Bollinger (20, 2)
  const bb = technicalIndicators.BollingerBands.calculate({
    period: 20,
    values: closes,
    stdDev: 2
  });
  
  // Calcular RSI (14 períodos)
  const rsi = technicalIndicators.RSI.calculate({
    period: 14,
    values: closes
  });
  
  // Guardamos los resultados
  marketData.indicators[symbol][timeframe] = {
    ma20: ma20.length > 0 ? ma20[ma20.length - 1] : null,
    ma50: ma50.length > 0 ? ma50[ma50.length - 1] : null,
    ma200: ma200.length > 0 ? ma200[ma200.length - 1] : null,
    bb: bb.length > 0 ? bb[bb.length - 1] : null,
    rsi: rsi.length > 0 ? rsi[rsi.length - 1] : null,
    updated: Date.now()
  };
}

/**
 * Calcula indicadores adicionales o personalizados
 * @param {string} symbol - Símbolo del activo
 * @param {string} timeframe - Timeframe
 */
function calculateAdditionalIndicators(symbol, timeframe) {
  if (!marketData.klines[symbol] || !marketData.klines[symbol][timeframe]) {
    return;
  }
  
  const klines = marketData.klines[symbol][timeframe];
  const closes = klines.map(kline => kline.close);
  const highs = klines.map(kline => kline.high);
  const lows = klines.map(kline => kline.low);
  
  // Verificar que hay suficientes datos
  if (closes.length < 14) {
    return;
  }
  
  // Calcular MACD
  const macd = technicalIndicators.MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  });
  
  // Calcular ADX
  const adx = technicalIndicators.ADX.calculate({
    high: highs,
    low: lows,
    close: closes,
    period: 14
  });
  
  // Actualizar indicadores existentes
  if (marketData.indicators[symbol] && marketData.indicators[symbol][timeframe]) {
    marketData.indicators[symbol][timeframe] = {
      ...marketData.indicators[symbol][timeframe],
      macd: macd.length > 0 ? macd[macd.length - 1] : null,
      adx: adx.length > 0 ? adx[adx.length - 1] : null
    };
  }
}

// Exportar funciones
module.exports = {
  calculateIndicators,
  calculateAdditionalIndicators
};