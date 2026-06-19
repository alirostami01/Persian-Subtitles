/**
 * Persian Subtitles Add-on for Stremio
 * 
 * A high-performance, scalable add-on that provides Persian subtitles
 * from the SubSource API. Designed to handle thousands of concurrent users
 * with optimized request handling and efficient resource management.
 */

require('dotenv').config();

const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const express = require('express');
const cors = require('cors');
const os = require('os');

const manifest = require('./manifest');
const subtitlesHandler = require('./subtitlesHandler');
const downloadProxy = require('./downloadProxy');
const config = require('./config');

// Initialize the add-on builder with manifest configuration
const builder = new addonBuilder(manifest);
builder.defineSubtitlesHandler(subtitlesHandler);

// Create Express application with production optimizations
const app = express();

// Enable CORS for cross-origin requests from Stremio clients
app.use(cors());

// Trust proxy for proper client IP detection behind load balancers
app.set('trust proxy', true);

// Disable X-Powered-By header for security
app.disable('x-powered-by');

// Request logging middleware for monitoring
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    });
    next();
});

// Download proxy endpoint for subtitle files
// Handles extraction and streaming of .srt files from ZIP archives
app.get('/download/:token', downloadProxy);

// Mount the Stremio addon router
const router = getRouter(builder.getInterface());
app.use(router);

// Health check endpoint for load balancer and monitoring
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpuLoad: os.loadavg()[0]
    });
});

// Graceful shutdown handling
let server;
const gracefulShutdown = (signal) => {
    console.log(`\n${signal} received. Starting graceful shutdown...`);
    if (server) {
        server.close((err) => {
            if (err) {
                console.error('Error during server close:', err);
                process.exit(1);
            }
            console.log('HTTP server closed gracefully');
            process.exit(0);
        });
        
        // Force shutdown after 10 seconds
        setTimeout(() => {
            console.error('Forced shutdown due to timeout');
            process.exit(1);
        }, 10000);
    } else {
        process.exit(0);
    }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server with optimized settings for high concurrency
server = app.listen(config.PORT, '0.0.0.0', () => {
    const cpuCores = os.cpus().length;
    console.log(`\n===========================================`);
    console.log(`Persian Subtitles Add-on Server Started`);
    console.log(`===========================================`);
    console.log(`Server listening on port: ${config.PORT}`);
    console.log(`Available CPU cores: ${cpuCores}`);
    console.log(`Install URL: http://${config.SERVER_IP}:${config.PORT}/manifest.json`);
    console.log(`Health check: http://${config.SERVER_IP}:${config.PORT}/health`);
    console.log(`===========================================\n`);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = { app, server };
