// services/websocket.js - Gestión de conexiones WebSocket

const WebSocket = require('ws');
const axios = require('axios');
const config = require('../config/config');
const { marketData, activeWebsockets } = require('../models/marketData');
const binanceApi = require('./binanceApi');
const analyzer = require('../analysis/analyzer');

/**
 * Configura un websocket para timeframes en tiempo real
 * @param {string} symbol - Símbolo del activo
 * @param {string} timeframe - Timeframe
 * @returns {WebSocket|null} Instancia del websocket o null si hay error
 */
function setupRealTimeWebsocket(symbol, timeframe) {
  try {
    const wsKey = `${symbol.toLowerCase()}@kline_${timeframe}`;
    const wsUrl = `${config.apiUrls.websocketBase}${wsKey}`;
    
    // Si ya existe una conexión activa, la cerramos
    if (activeWebsockets[wsKey]) {
      activeWebsockets[wsKey].close();
      delete activeWebsockets[wsKey];
    }
    
    // Crear nueva conexión WebSocket
    const ws = new WebSocket(wsUrl);
    
    // Configurar evento 'open'
    ws.on('open', () => {
      activeWebsockets[wsKey] = ws;
      
      // Enviar mensaje de subscribe para asegurarnos que la conexión está funcionando
      const subscribeMsg = {
        method: "SUBSCRIBE",
        params: [`${symbol.toLowerCase()}@kline_${timeframe}`],
        id: Date.now()
      };
      
      try {
        ws.send(JSON.stringify(subscribeMsg));
      } catch (sendError) {
        console.error(`Error al enviar mensaje de suscripción para ${wsKey}:`, sendError);
      }
    });
    
    // Configurar evento 'message'
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        // Verificar si es una respuesta a la suscripción
        if (message.result === null && message.id) {
          //console.log(`Suscripción confirmada para ${wsKey}`);
          return;
        }
        
        if (message.e === 'kline') {
          const kline = message.k;
          const symbolFromMessage = message.s;
          const recvTimeframe = kline.i; // Timeframe recibido (1m, 3m, etc.)
          
          // Asegurar que la estructura de datos existe
          if (!marketData.klines[symbolFromMessage]) {
            marketData.klines[symbolFromMessage] = {};
          }
          
          if (!marketData.klines[symbolFromMessage][recvTimeframe]) {
            marketData.klines[symbolFromMessage][recvTimeframe] = [];
          }
          
          // Actualizar el último kline del timeframe correspondiente
          const klines = marketData.klines[symbolFromMessage][recvTimeframe];
          const lastKlineIndex = klines.length - 1;
          
          if (lastKlineIndex >= 0) {
            const lastKline = klines[lastKlineIndex];
            
            // Comprobar si este kline actualiza el existente o es uno nuevo
            if (lastKline.openTime === parseInt(kline.t)) {
              // Actualizamos el último kline
              lastKline.high = Math.max(lastKline.high, parseFloat(kline.h));
              lastKline.low = Math.min(lastKline.low, parseFloat(kline.l));
              lastKline.close = parseFloat(kline.c);
              lastKline.volume = parseFloat(kline.v);
              lastKline.closeTime = parseInt(kline.T);
              lastKline.quoteAssetVolume = parseFloat(kline.q);
              lastKline.numberOfTrades = parseInt(kline.n);
              lastKline.takerBuyBaseAssetVolume = parseFloat(kline.V);
              lastKline.takerBuyQuoteAssetVolume = parseFloat(kline.Q);
            } else {
              // Es un nuevo periodo, agregamos un nuevo kline
              const newKline = {
                openTime: parseInt(kline.t),
                open: parseFloat(kline.o),
                high: parseFloat(kline.h),
                low: parseFloat(kline.l),
                close: parseFloat(kline.c),
                volume: parseFloat(kline.v),
                closeTime: parseInt(kline.T),
                quoteAssetVolume: parseFloat(kline.q),
                numberOfTrades: parseInt(kline.n),
                takerBuyBaseAssetVolume: parseFloat(kline.V),
                takerBuyQuoteAssetVolume: parseFloat(kline.Q)
              };
              
              // Añadimos el nuevo kline al inicio si es más reciente
              if (newKline.openTime > lastKline.openTime) {
                klines.push(newKline);
              } else {
                // Caso extraño: recibimos un kline antiguo, lo insertamos en su posición correcta
                let insertIndex = klines.findIndex(k => k.openTime > newKline.openTime);
                if (insertIndex === -1) insertIndex = klines.length;
                klines.splice(insertIndex, 0, newKline);
              }
              
              // Limitamos a 1000 klines
              while (klines.length > config.limits.historicalKlines) {
                klines.shift();
              }
            }
            
            // Siempre recalculamos los indicadores cuando recibimos nuevos datos
            binanceApi.calculateIndicators(symbolFromMessage, recvTimeframe);
            
            // Si estamos recibiendo datos del timeframe 1m, actualizamos también otros timeframes
            if (recvTimeframe === '1m') {
              binanceApi.updateHigherTimeframesWithOneMinute(symbolFromMessage, kline);
            }
            
            // Trigger de análisis para actualizar la UI
            // Para BTCUSDT actualizamos más frecuentemente
            if (symbolFromMessage === 'BTCUSDT') {
              analyzer.analyzeMarketAgainstBTC();
            } else if (Math.random() < 0.05) { // 5% de probabilidad para otros activos
              analyzer.analyzeMarketAgainstBTC();
            }
          } else {
            // No hay klines previos, creamos el primero
            const newKline = {
              openTime: parseInt(kline.t),
              open: parseFloat(kline.o),
              high: parseFloat(kline.h),
              low: parseFloat(kline.l),
              close: parseFloat(kline.c),
              volume: parseFloat(kline.v),
              closeTime: parseInt(kline.T),
              quoteAssetVolume: parseFloat(kline.q),
              numberOfTrades: parseInt(kline.n),
              takerBuyBaseAssetVolume: parseFloat(kline.V),
              takerBuyQuoteAssetVolume: parseFloat(kline.Q)
            };
            
            klines.push(newKline);
            // Calcular indicadores para este nuevo kline
            binanceApi.calculateIndicators(symbolFromMessage, recvTimeframe);
            
            // También disparamos análisis para este caso
            if (symbolFromMessage === 'BTCUSDT') {
              analyzer.analyzeMarketAgainstBTC();
            }
          }
        }
      } catch (error) {
        console.error(`Error al procesar mensaje WebSocket para ${symbol} en timeframe ${timeframe}:`, error);
        console.error('Mensaje recibido:', data.toString().substring(0, 200) + '...');
      }
    });
    
    // Configurar evento 'error'
    ws.on('error', (error) => {
      console.error(`❌ Error en WebSocket para ${symbol} en timeframe ${timeframe}:`, error.message);
      console.error(`Stack trace: ${error.stack || 'No disponible'}`);
      
      // Intentar reconectar después de un pequeño retraso
      setTimeout(() => {
        console.log(`↻ Intentando reconectar WebSocket para ${symbol} en timeframe ${timeframe}...`);
        setupRealTimeWebsocket(symbol, timeframe);
      }, config.limits.reconnectTimeout);
    });
    
    // Configurar evento 'unexpected-response'
    ws.on('unexpected-response', (request, response) => {
      console.error(`❌ Respuesta inesperada del servidor de WebSocket para ${symbol}:`, 
                  `Código: ${response.statusCode}, Mensaje: ${response.statusMessage}`);
    });
    
    // Configurar evento 'close'
    ws.on('close', (code, reason) => {
      console.log(`WebSocket cerrado para ${symbol} en timeframe ${timeframe}. Código: ${code}, Razón: ${reason || 'No especificada'}`);
      delete activeWebsockets[wsKey];
      
      // Intentar reconectar después de un pequeño retraso
      setTimeout(() => {
        console.log(`↻ Intentando reconectar WebSocket para ${symbol} en timeframe ${timeframe} después de cierre...`);
        setupRealTimeWebsocket(symbol, timeframe);
      }, config.limits.reconnectTimeout);
    });
    
    return ws;
  } catch (connectionError) {
    console.error(`❌ Error al crear WebSocket para ${symbol} en timeframe ${timeframe}:`, connectionError.message);
    console.error(`Stack trace: ${connectionError.stack || 'No disponible'}`);
    
    // Intentar reconectar después de un pequeño retraso
    setTimeout(() => {
      console.log(`↻ Intentando reconectar WebSocket para ${symbol} en timeframe ${timeframe} después de error de conexión...`);
      setupRealTimeWebsocket(symbol, timeframe);
    }, config.limits.reconnectTimeout);
    
    return null; // Devolver null para indicar que hubo un error
  }
}

/**
 * Configura websockets para timeframes extendidos
 * @param {string} symbol - Símbolo del activo
 * @param {string} timeframe - Timeframe
 */
function setupExtendedTimeframeWebsocket(symbol, timeframe) {
  try {
    // Obtener el último kline para saber cuándo terminará
    const klines = marketData.klines[symbol][timeframe];
    if (!klines || klines.length === 0) {
      console.warn(`No hay klines para ${symbol} en timeframe ${timeframe}`);
      return;
    }
    
    const lastKline = klines[klines.length - 1];
    const endTime = lastKline.closeTime;
    const currentTime = Date.now();
    const timeToEnd = endTime - currentTime;
    
    // Si faltan menos de 5 minutos o ya ha terminado, conectamos inmediatamente
    if (timeToEnd <= 5 * 60 * 1000 || timeToEnd <= 0) {
      setupRealTimeWebsocket(symbol, '1m'); // Usamos 1m para monitorear el cierre
      
      // Programamos la desconexión después de 5 minutos del cierre
      // Limitamos el tiempo máximo a 2147483647 ms (límite de setTimeout)
      const disconnectTimeout = Math.min(timeToEnd + 5 * 60 * 1000, 2147483647);
      
      setTimeout(() => {
        const wsKey = `${symbol.toLowerCase()}@kline_1m`;
        if (activeWebsockets[wsKey]) {
          activeWebsockets[wsKey].close();
        }
        
        // Actualizamos los klines y los indicadores
        binanceApi.getHistoricalKlines(symbol, timeframe, 2).then(() => {
          binanceApi.calculateIndicators(symbol, timeframe);
        });
      }, disconnectTimeout > 0 ? disconnectTimeout : 0);
    } else {
      // Programamos la conexión para 5 minutos antes del cierre
      // Limitamos el tiempo máximo a 2147483647 ms (límite de setTimeout)
      const connectTimeout = Math.min(timeToEnd - 5 * 60 * 1000, 2147483647);
      
      // Si el tiempo necesario excede el límite de setTimeout, programamos un temporizador intermedio
      if (timeToEnd > 2147483647 + 5 * 60 * 1000) {
        console.log(`Tiempo hasta cierre para ${symbol} ${timeframe} es muy largo, programando verificación intermedia`);
        setTimeout(() => {
          setupExtendedTimeframeWebsocket(symbol, timeframe); // Volver a verificar más tarde
        }, 2147483647);
      } else {
        setTimeout(() => {
          setupExtendedTimeframeWebsocket(symbol, timeframe);
        }, connectTimeout > 0 ? connectTimeout : 0);
      }
    }
  } catch (error) {
    console.error(`Error en setupExtendedTimeframeWebsocket para ${symbol} ${timeframe}:`, error);
  }
}

/**
 * Verifica la conexión de un WebSocket y actualiza manualmente si es necesario
 * @param {string} symbol - Símbolo a verificar
 * @param {string} timeframe - Timeframe a verificar
 */
async function verifyWebSocketConnection(symbol, timeframe) {
  try {
    console.log(`\n=== Verificación periódica de WebSocket para ${symbol} ${timeframe} ===`);
    
    // Verificar si tenemos datos del símbolo
    if (!marketData.klines[symbol] || !marketData.klines[symbol][timeframe] || 
        marketData.klines[symbol][timeframe].length === 0) {
      console.warn(`⚠️ No hay datos de klines para ${symbol} ${timeframe}. Posible problema de inicialización.`);
      
      // Intentar inicializar los datos manualmente
      console.log(`Obteniendo datos históricos para ${symbol}...`);
      await binanceApi.getHistoricalKlines(symbol, timeframe);
      
      console.log(`Calculando indicadores para ${symbol}...`);
      binanceApi.calculateIndicators(symbol, timeframe);
      
      console.log(`Reconectando WebSocket para ${symbol}...`);
      setupRealTimeWebsocket(symbol, timeframe);
      
      return;
    }
    
    // Obtener el último precio guardado
    const lastKline = marketData.klines[symbol][timeframe][marketData.klines[symbol][timeframe].length - 1];
    const storedPrice = lastKline.close;
    console.log(`Precio actual guardado de ${symbol}: ${storedPrice}`);
    
    // Verificar tiempo transcurrido desde la última actualización
    const now = Date.now();
    const lastUpdate = lastKline.closeTime || (now - 3600000); // Si no hay tiempo, asumimos 1 hora atrás
    const timeSinceUpdate = now - lastUpdate;
    console.log(`Tiempo desde última actualización: ${Math.floor(timeSinceUpdate / 1000)}s`);
    
    // Obtener precio actual para comparar
    try {
      const currentPriceResponse = await axios.get(`${config.apiUrls.futuresTicker}?symbol=${symbol}`);
      const apiPrice = parseFloat(currentPriceResponse.data.price);
      console.log(`Precio actual de ${symbol} desde API: ${apiPrice}`);
      
      // Si hay una diferencia significativa o han pasado más de 2 minutos sin actualización
      if (Math.abs(storedPrice - apiPrice) > 1 || timeSinceUpdate > 120000) {
        console.log(`⚠️ Detectada diferencia significativa o tiempo prolongado sin actualización.`);
        console.log(`Diferencia de precio: ${Math.abs(storedPrice - apiPrice)}, Tiempo: ${Math.floor(timeSinceUpdate / 1000)}s`);
        
        // Actualizar el precio manualmente
        lastKline.close = apiPrice;
        
        // Recalcular indicadores
        binanceApi.calculateIndicators(symbol, timeframe);
        
        // Forzar un nuevo análisis
        analyzer.analyzeMarketAgainstBTC();
        
        // Si la diferencia es muy grande, podría indicar un problema con el WebSocket
        if (Math.abs(storedPrice - apiPrice) > 10 || timeSinceUpdate > 300000) {
          console.log(`❌ Diferencia muy grande o tiempo excesivo. Reconectando WebSocket...`);
          
          // Reconectar el WebSocket
          const wsKey = `${symbol.toLowerCase()}@kline_${timeframe}`;
          if (activeWebsockets[wsKey]) {
            activeWebsockets[wsKey].close();
            delete activeWebsockets[wsKey];
          }
          
          // Esperar un breve momento antes de reconectar
          await new Promise(resolve => setTimeout(resolve, 1000));
          setupRealTimeWebsocket(symbol, timeframe);
        }
      } else {
        console.log(`✓ Verificación OK: Diferencia de precio dentro de umbrales aceptables (${Math.abs(storedPrice - apiPrice).toFixed(2)})`);
      }
    } catch (error) {
      console.error(`❌ Error al obtener precio actual de ${symbol}:`, error.message);
    }
    
    console.log(`=== Fin de verificación periódica ===\n`);
  } catch (error) {
    console.error('❌ Error durante la verificación periódica de WebSockets:', error.message);
  }
}

/**
 * Configura WebSockets para los timeframes en tiempo real
 * Para los timeframes 1m, configuramos WebSockets para todos los símbolos
 */
async function setupRealTimeWebsockets() {
  try {
    console.log('Iniciando configuración de WebSockets para timeframes en tiempo real...');
    
    // Verificar conectividad con la API de Binance
    console.log('Verificando conectividad con API de Binance...');
    try {
      const btcPriceResponse = await axios.get(`${config.apiUrls.futuresTicker}?symbol=BTCUSDT`);
      const currentBtcPrice = parseFloat(btcPriceResponse.data.price);
      console.log(`✓ Conectividad OK. Precio actual de BTC desde API: ${currentBtcPrice}`);
    } catch (apiError) {
      console.error('❌ Error al conectar con la API de Binance:', apiError.message);
      console.error('Reintentando en 5 segundos...');
      // Reintentamos después de 5 segundos
      setTimeout(() => setupRealTimeWebsockets(), 5000);
      return;
    }
    
    // Verificar la conectividad con WebSockets
    console.log('Verificando conectividad con servidor WebSocket...');
    try {
      // Crear un WebSocket de prueba para verificar conectividad
      const testWs = new WebSocket('wss://fstream.binance.com/ws/btcusdt@ping');
      
      // Esperar a que se abra o falle
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          testWs.terminate();
          reject(new Error('Timeout esperando conexión WebSocket'));
        }, 5000);
        
        testWs.on('open', () => {
          clearTimeout(timeout);
          testWs.close();
          console.log('✓ Prueba de conectividad WebSocket exitosa');
          resolve();
        });
        
        testWs.on('error', (err) => {
          clearTimeout(timeout);
          console.error('❌ Error en prueba de WebSocket:', err.message);
          reject(err);
        });
      });
    } catch (wsTestError) {
      console.error('❌ Error de conectividad WebSocket:', wsTestError.message);
      console.error('Reintentando en 5 segundos...');
      // Reintentamos después de 5 segundos
      setTimeout(() => setupRealTimeWebsockets(), 5000);
      return;
    }
    
    // Una vez verificada la conectividad, procedemos a obtener el precio actual
    const btcPriceResponse = await axios.get(`${config.apiUrls.futuresTicker}?symbol=BTCUSDT`);
    const currentBtcPrice = parseFloat(btcPriceResponse.data.price);
    
    // Actualizar el precio inicial de BTC en los klines si ya existe
    if (marketData.klines['BTCUSDT'] && marketData.klines['BTCUSDT']['1m'] && 
        marketData.klines['BTCUSDT']['1m'].length > 0) {
      const lastKline = marketData.klines['BTCUSDT']['1m'][marketData.klines['BTCUSDT']['1m'].length - 1];
      const previousPrice = lastKline.close;
      
      // Solo actualizar si hay una diferencia significativa
      if (Math.abs(previousPrice - currentBtcPrice) > 0.01) {
        lastKline.close = currentBtcPrice;
        
        // Recalcular indicadores con el nuevo precio
        binanceApi.calculateIndicators('BTCUSDT', '1m');
        analyzer.analyzeMarketAgainstBTC();
      }
    }
    
    // Obtener lista de activos
    const assets = Object.keys(marketData.assets);
    if (assets.length === 0) {
      console.error('❌ No hay activos disponibles para configurar WebSockets');
      return;
    }
    console.log(`Configurando WebSockets para ${assets.length} activos...`);
    
    // Primero configurar WebSocket para BTC (es el más importante)
    console.log('Configurando WebSocket prioritario para BTCUSDT...');
    if (assets.includes('BTCUSDT')) {
      const btcWs = setupRealTimeWebsocket('BTCUSDT', '1m');
      
      // Esperamos a que se establezca la conexión o falle
      if (btcWs) {
        await new Promise((resolve) => {
          const timeout = setTimeout(resolve, 3000); // Máximo 3 segundos de espera
          
          btcWs.once('open', () => {
            clearTimeout(timeout);
            console.log('✓ WebSocket de BTCUSDT establecido exitosamente');
            resolve();
          });
          
          btcWs.once('error', () => {
            clearTimeout(timeout);
            console.log('⚠️ Error al establecer WebSocket de BTCUSDT, continuando con otros activos');
            resolve();
          });
        });
      }
    } else {
      console.warn('⚠️ BTCUSDT no está en la lista de activos, esto puede causar problemas');
    }
    
    // Configurar WebSocket para 1m para el resto de activos
    console.log('Configurando WebSockets para los demás activos...');
    let successCount = 0;
    let failCount = 0;
    
    for (const symbol of assets) {
      if (symbol !== 'BTCUSDT') { // BTC ya está configurado
        const ws = setupRealTimeWebsocket(symbol, '1m');
        if (ws) {
          successCount++;
        } else {
          failCount++;
        }
        
        // Pequeña pausa para no saturar la conexión (5 conexiones por segundo aprox)
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    console.log(`WebSockets de 1m configurados: ${successCount} exitosos, ${failCount} fallidos`);
    
    // También configuramos websockets para 3m y 5m para una actualización más precisa
    console.log('Configurando WebSockets para timeframes adicionales (3m, 5m)...');
    for (const timeframe of ['3m', '5m']) {
      // Primero BTC
      if (assets.includes('BTCUSDT')) {
        console.log(`Configurando WebSocket de ${timeframe} para BTCUSDT...`);
        setupRealTimeWebsocket('BTCUSDT', timeframe);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Luego los 10 activos con mayor volumen (para optimizar recursos)
      // Por ahora solo configuramos los primeros 10 activos en la lista
      const topAssets = assets.filter(s => s !== 'BTCUSDT').slice(0, 10);
      console.log(`Configurando WebSockets de ${timeframe} para ${topAssets.length} activos principales...`);
      
      for (const symbol of topAssets) {
        setupRealTimeWebsocket(symbol, timeframe);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    console.log('✓ Configuración inicial de WebSockets completada');
    
    // Sistema de verificación para asegurarnos que los WebSockets estén funcionando
    console.log('Configurando sistema de verificación periódica...');
    
    // Primera verificación después de 10 segundos
    console.log('Programando verificación inicial en 10 segundos...');
    setTimeout(async () => {
      await verifyWebSocketConnection('BTCUSDT', '1m');
    }, 10000);
    
    // Verificación periódica cada 30 segundos
    console.log('Programando verificación periódica cada 30 segundos...');
    const checkWebSocketsInterval = setInterval(async () => {
      await verifyWebSocketConnection('BTCUSDT', '1m');
    }, 30000);
    
    // Devolver el interval para poder limpiarlo si es necesario
    return checkWebSocketsInterval;
  } catch (error) {
    console.error('❌ Error general al configurar WebSockets:', error.message);
    console.error(`Stack trace: ${error.stack || 'No disponible'}`);
    console.log('Reintentando en 10 segundos...');
    setTimeout(() => setupRealTimeWebsockets(), 10000);
  }
}

// Exportar funciones
module.exports = {
  setupRealTimeWebsocket,
  setupExtendedTimeframeWebsocket,
  setupRealTimeWebsockets,
  verifyWebSocketConnection
};