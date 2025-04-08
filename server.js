// index.js - Punto de entrada principal

// Importaciones de módulos externos
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

// Importaciones de módulos internos
const config = require('./config/config');
const { marketData } = require('./models/marketData');  // Aseguramos que se extraiga la propiedad marketData
const binanceApi = require('./services/binanceApi');
const webSocketService = require('./services/websocket');
const analyzer = require('./analysis/analyzer');

// Configuración del servidor
const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const PORT = process.env.PORT || 3000;

// Servir archivos estáticos
app.use(express.static('public'));

// Configuración de Socket.IO
io.on('connection', (socket) => {
  console.log('Cliente conectado');
  
  // Enviar datos actuales al cliente que se conecta
  if (marketData.analysisResults && Object.keys(marketData.analysisResults).length > 0) {
    socket.emit('analysisUpdate', marketData.analysisResults);
  } else {
    // Si no hay resultados disponibles, enviamos los datos básicos
    socket.emit('initialData', {
      assets: marketData.assets || {}
    });
  }
  
  // Escuchar solicitudes de análisis
  socket.on('requestAnalysis', () => {
    console.log('Cliente solicitó análisis inmediato');
    analyzer.analyzeMarketAgainstBTC();
  });
  
  socket.on('disconnect', () => {
    console.log('Cliente desconectado');
  });
});

// Compartir la instancia io con el módulo de análisis
analyzer.setIoInstance(io);

/**
 * Función principal de inicialización del sistema
 */
async function initialize() {
  console.log('Iniciando sistema de análisis de mercado de futuros Binance...');
  
  // 1. Obtener todos los activos USDT en estado TRADING
  const assets = await binanceApi.getUSDTFuturesAssets();
  console.log(`Se procesarán ${assets.length} activos`);
  
  // Bandera para controlar si ya se inició el análisis
  let analysisStarted = false;
  
  // 2. Para cada activo, obtener klines y configurar websockets
  for (const symbol of assets) {
    console.log(`Obteniendo datos históricos para ${symbol}...`);
    
    // Primero procesamos los timeframes en tiempo real
    for (const timeframe of config.timeframes.realtime) {
      await binanceApi.getHistoricalKlines(symbol, timeframe);
      //console.log(`  - Obtenidos klines de ${timeframe} para ${symbol}`);
      
      // Calcular indicadores inmediatamente
      binanceApi.calculateIndicators(symbol, timeframe);
      //console.log(`  - Indicadores de ${timeframe} calculados para ${symbol}`);
      webSocketService.setupRealTimeWebsocket(symbol, timeframe);
    }
    
    // Luego procesamos los demás timeframes
    for (const timeframe of [...config.timeframes.periodic, ...config.timeframes.extended]) {
      await binanceApi.getHistoricalKlines(symbol, timeframe);
      //console.log(`  - Obtenidos klines de ${timeframe} para ${symbol}`);
      
      // Calcular indicadores inmediatamente
      binanceApi.calculateIndicators(symbol, timeframe);
    }
    
    // 3. Calcular umbrales
    binanceApi.calculateThresholds(symbol);
    console.log(`  - Umbrales calculados para ${symbol}`);
    
    // Si ya tenemos BTCUSDT y al menos otro activo con indicadores, iniciamos el análisis si aún no ha comenzado
    if (!analysisStarted && 
        marketData.indicators && 
        marketData.indicators['BTCUSDT'] && 
        Object.keys(marketData.indicators || {}).length > 1) {
      console.log('Iniciando análisis de mercado mientras continúa la carga...');
      
      // Realizamos el primer análisis inmediatamente
      analyzer.analyzeMarketAgainstBTC();
      
      // Iniciamos el intervalo para análisis periódico
      setInterval(analyzer.analyzeMarketAgainstBTC, 1000);
      
      // Marcamos que ya se inició el análisis
      analysisStarted = true;
    }
  }
  
  // Configurar WebSockets para los timeframes en tiempo real
  webSocketService.setupRealTimeWebsockets();
}

// Iniciar servidor
server.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
  
  // Iniciar sistema con manejo de errores
  try {
    initialize();
  } catch (error) {
    console.error('Error al inicializar el sistema:', error);
    console.log('Intentando inicializar con datos de prueba...');
    
    // Si hay un error en la inicialización, podemos cargar datos de prueba
    if (binanceApi.loadTestData) {
      binanceApi.loadTestData();
      // Ejecutar análisis inicial
      analyzer.analyzeMarketAgainstBTC();
      // Configurar intervalo para análisis periódico
      setInterval(analyzer.analyzeMarketAgainstBTC, 1000);
    }
  }
});

// Exportar para poder ser utilizado desde otros módulos
module.exports = { server, io };