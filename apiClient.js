/**
 * Reliable HTTP Client with Retry Support
 *
 * Wraps axios to protect against transient network failures (ECONNRESET,
 * timeouts, etc.) that commonly affect connections to external APIs.
 *
 * The core problem this solves: axios reuses keep-alive sockets. When the
 * remote server closes an idle keep-alive connection (common under load,
 * proxies or firewalls), the next request hitting that stale socket fails
 * with `read ECONNRESET`. We avoid it by:
 *   1. Using agents that do NOT keep sockets alive between requests,
 *      so every request gets a fresh connection.
 *   2. Retrying transient errors with exponential backoff as a safety net.
 */

const axios = require('axios');
const http = require('http');
const https = require('https');
const config = require('./config');

// Fresh-connection agents: keepAlive disabled to eliminate stale-socket resets
const httpAgent = new http.Agent({
    keepAlive: false,
    maxSockets: config.MAX_SOCKETS
});

const httpsAgent = new https.Agent({
    keepAlive: false,
    maxSockets: config.MAX_SOCKETS
});

// Network-level error codes that are safe to retry
const RETRYABLE_CODES = new Set([
    'ECONNRESET',
    'ECONNABORTED',
    'ETIMEDOUT',
    'EPIPE',
    'EAI_AGAIN',
    'ENOTFOUND'
]);

function isRetryable(error) {
    if (!error) return false;
    if (error.code && RETRYABLE_CODES.has(error.code)) return true;
    if (error.response) {
        const status = error.response.status;
        return status === 429 || status >= 500;
    }
    return false;
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Performs an HTTP request with automatic retry on transient failures.
 *
 * @param {Object} options
 * @param {string} options.method - HTTP method (default: 'get')
 * @param {string} options.url - Request URL
 * @param {Object} [options.headers] - Request headers
 * @param {Object} [options.params] - Query string parameters
 * @param {string} [options.responseType] - Response type ('arraybuffer', 'json', etc.)
 * @param {number} [options.timeout] - Timeout in ms (default: config.LONG_TIMEOUT)
 * @param {number} [options.retries] - Max retry attempts (default: 3)
 * @returns {Promise<Object>} Resolves to the axios response
 */
async function apiRequest({
    method = 'get',
    url,
    headers = {},
    params = {},
    responseType = 'json',
    timeout = config.LONG_TIMEOUT,
    retries = 3
}) {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await axios({
                method,
                url,
                headers,
                params,
                responseType,
                timeout,
                httpAgent,
                httpsAgent,
                maxRedirects: 5
            });
        } catch (error) {
            lastError = error;

            if (!isRetryable(error) || attempt === retries) {
                throw error;
            }

            const backoff = 300 * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
            console.warn(
                `Request failed (${error.code || `HTTP ${error.response && error.response.status}`}) for ${method.toUpperCase()} ${url}. ` +
                `Retrying in ${backoff}ms (attempt ${attempt + 1}/${retries})`
            );
            await delay(backoff);
        }
    }

    throw lastError;
}

module.exports = { apiRequest };