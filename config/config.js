// config/config.js - Configuración global

// Configuración de timeframes
const timeframes = {
    realtime: ['1m', '3m', '5m'],
    periodic: ['15m', '30m', '1h', '2h', '4h'],
    extended: ['6h', '8h', '12h', '1d', '1w', '1M']
  };
  
  // Todos los timeframes juntos
  const allTimeframes = [...timeframes.realtime, ...timeframes.periodic, ...timeframes.extended];
  
  // URLs de la API
  const apiUrls = {
    futuresExchangeInfo: 'https://fapi.binance.com/fapi/v1/exchangeInfo',
    futuresKlines: 'https://fapi.binance.com/fapi/v1/klines',
    futuresTicker: 'https://fapi.binance.com/fapi/v1/ticker/price',
    websocketBase: 'wss://fstream.binance.com/ws/'
  };
  
  // Límites y parámetros
  const limits = {
    historicalKlines: 1000,  // Cantidad máxima de klines a obtener
    reconnectTimeout: 5000,  // Tiempo de espera para reconexión en ms
    analysisInterval: 1000   // Intervalo para análisis periódico en ms
  };
  
  // Exportar configuración
  module.exports = {
    timeframes,
    allTimeframes,
    apiUrls,
    limits
  };