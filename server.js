/**
 * Cluster Server Entry Point
 * 
 * This module enables the application to utilize multiple CPU cores,
 * allowing it to handle thousands of concurrent users efficiently.
 * 
 * Usage:
 *   - Development: node addon.js (single process)
 *   - Production: node server.js (clustered mode)
 * 
 * Environment Variables:
 *   CLUSTER_ENABLED=true  - Enable clustering
 *   WORKER_COUNT=4        - Number of worker processes (default: auto-detect CPU cores)
 */

const cluster = require('cluster');
const os = require('os');
const config = require('./config');

// Determine the number of CPU cores available
const numCPUs = config.WORKER_COUNT > 0 ? config.WORKER_COUNT : os.cpus().length;

if (config.CLUSTER_ENABLED && cluster.isMaster) {
    console.log(`\n===========================================`);
    console.log(`Starting Cluster Mode`);
    console.log(`===========================================`);
    console.log(`Master process ${process.pid} started`);
    console.log(`Detected ${numCPUs} CPU cores`);
    console.log(`Spawning ${numCPUs} worker processes...`);
    console.log(`===========================================\n`);

    // Track worker processes for health monitoring
    const workers = [];

    // Spawn worker processes
    for (let i = 0; i < numCPUs; i++) {
        const worker = cluster.fork();
        workers.push(worker);
        console.log(`Worker ${worker.process.pid} spawned`);
    }

    // Handle worker exits and restart them
    cluster.on('exit', (worker, code, signal) => {
        const index = workers.indexOf(worker);
        if (index > -1) {
            workers.splice(index, 1);
        }
        
        console.error(`\n⚠️  Worker ${worker.process.pid} died (code: ${code}, signal: ${signal})`);
        
        // Restart the worker after a brief delay
        setTimeout(() => {
            const newWorker = cluster.fork();
            workers.push(newWorker);
            console.log(`🔄 New worker ${newWorker.process.pid} started`);
        }, 1000);
    });

    // Handle graceful shutdown
    const gracefulShutdown = (signal) => {
        console.log(`\n${signal} received. Initiating graceful shutdown...`);
        
        let shutdownComplete = true;
        
        workers.forEach((worker, index) => {
            worker.send('shutdown');
            const timeout = setTimeout(() => {
                worker.process.kill('SIGKILL');
                console.log(`Force killed worker ${worker.process.pid}`);
            }, 10000);
            
            worker.once('exit', () => {
                clearTimeout(timeout);
                console.log(`Worker ${worker.process.pid} shut down gracefully`);
            });
        });
        
        // Exit master after all workers are closed
        setTimeout(() => {
            console.log('Master process exiting...');
            process.exit(0);
        }, 15000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Log when all workers are online
    let onlineCount = 0;
    cluster.on('online', (worker) => {
        onlineCount++;
        console.log(`✓ Worker ${worker.process.pid} is online (${onlineCount}/${numCPUs})`);
        
        if (onlineCount === numCPUs) {
            console.log(`\n✅ All workers are ready to handle requests!\n`);
        }
    });

} else {
    // Worker process or single-instance mode
    console.log(`Worker ${process.pid} starting...`);
    
    // Import and start the main application
    require('./addon');
}
