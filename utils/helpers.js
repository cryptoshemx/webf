// utils/helpers.js - Funciones auxiliares

const moment = require('moment');

/**
 * Formatea una fecha timestamp a un formato legible
 * @param {number} timestamp - Timestamp en milisegundos
 * @param {string} format - Formato de salida (por defecto 'YYYY-MM-DD HH:mm:ss')
 * @returns {string} Fecha formateada
 */
function formatTimestamp(timestamp, format = 'YYYY-MM-DD HH:mm:ss') {
  return moment(timestamp).format(format);
}

/**
 * Calcula la variación porcentual entre dos valores
 * @param {number} currentValue - Valor actual
 * @param {number} previousValue - Valor anterior
 * @returns {number} Variación porcentual
 */
function calculatePercentageChange(currentValue, previousValue) {
  if (previousValue === 0) return 0;
  return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
}

/**
 * Redondea un número a un número específico de decimales
 * @param {number} value - Valor a redondear
 * @param {number} decimals - Número de decimales (por defecto 2)
 * @returns {number} Valor redondeado
 */
function roundToDecimals(value, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Convierte un intervalo de tiempo de Binance a milisegundos
 * @param {string} interval - Intervalo de tiempo (1m, 3m, 5m, 15m, etc.)
 * @returns {number} Intervalo en milisegundos
 */
function intervalToMilliseconds(interval) {
  const unit = interval.slice(-1);
  const value = parseInt(interval.slice(0, -1));
  
  switch (unit) {
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    case 'w': return value * 7 * 24 * 60 * 60 * 1000;
    case 'M': return value * 30 * 24 * 60 * 60 * 1000; // Aproximado
    default: return 0;
  }
}

/**
 * Determina el color para representar un valor de RSI
 * @param {number} rsi - Valor del RSI (0-100)
 * @returns {string} Código de color hexadecimal
 */
function getRsiColor(rsi) {
  if (rsi >= 70) return '#FF4560'; // Sobrecomprado - Rojo
  if (rsi <= 30) return '#00E396'; // Sobrevendido - Verde
  return '#FEB019'; // Neutral - Amarillo
}

/**
 * Formatea un número para mostrar en la UI
 * @param {number} number - Número a formatear
 * @param {boolean} addCommas - Si se deben agregar comas como separadores (por defecto true)
 * @param {number} decimals - Número de decimales (por defecto 2)
 * @returns {string} Número formateado
 */
function formatNumber(number, addCommas = true, decimals = 2) {
  if (number === null || number === undefined) return '-';
  
  // Redondear a los decimales especificados
  const rounded = roundToDecimals(number, decimals);
  
  // Si se requieren comas como separadores
  if (addCommas) {
    return rounded.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }
  
  return rounded.toFixed(decimals);
}

// Exportar funciones
module.exports = {
  formatTimestamp,
  calculatePercentageChange,
  roundToDecimals,
  intervalToMilliseconds,
  getRsiColor,
  formatNumber
};