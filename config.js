/**
 * Application Configuration Module
 * 
 * Manages environment-based configuration for the Persian Subtitles add-on.
 * Supports clustering and high-concurrency deployment scenarios.
 */

require('dotenv').config();

module.exports = {
    // Server network configuration
    SERVER_IP: process.env.SERVER_IP || '127.0.0.1',
    PORT: parseInt(process.env.PORT, 10) || 7000,
    
    // Timeout settings for API requests (in milliseconds)
    // Increased timeouts for handling high load scenarios
    LONG_TIMEOUT: parseInt(process.env.LONG_TIMEOUT, 10) || 60000,
    SHORT_TIMEOUT: parseInt(process.env.SHORT_TIMEOUT, 10) || 15000,
    
    // API authentication
    API_KEY: process.env.API_KEY,
    
    // Clustering configuration (number of CPU cores to use)
    CLUSTER_ENABLED: process.env.CLUSTER_ENABLED === 'true',
    WORKER_COUNT: parseInt(process.env.WORKER_COUNT, 10) || 0, // 0 = auto-detect
    
    // Rate limiting configuration (requests per minute per IP)
    RATE_LIMIT_ENABLED: process.env.RATE_LIMIT_ENABLED === 'true',
    RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
    
    // Logging configuration
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    
    // Connection pool settings for high concurrency
    MAX_SOCKETS: parseInt(process.env.MAX_SOCKETS, 10) || 50,
    MAX_FREE_SOCKETS: parseInt(process.env.MAX_FREE_SOCKETS, 10) || 256,
    
    // Cache settings (optional Redis integration)
    CACHE_ENABLED: process.env.CACHE_ENABLED === 'true',
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
    CACHE_TTL: parseInt(process.env.CACHE_TTL, 10) || 3600, // Cache TTL in seconds
    
    // Subtitle promotional text configuration
    SUBTITLE_PROMO_TEXT: process.env.SUBTITLE_PROMO_TEXT || '❤️ 🎬با حمایت شما، توسعه افزونه ادامه پیدا می‌کند 🙏👉 alirostami.com/support',
    SUBTITLE_PROMO_DURATION: parseInt(process.env.SUBTITLE_PROMO_DURATION, 10) || 20, // Duration in seconds
    SUBTITLE_PROMO_POSITION: process.env.SUBTITLE_PROMO_POSITION || 'end' // 'start' or 'end'
};
