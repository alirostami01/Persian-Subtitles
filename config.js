require('dotenv').config();

module.exports = {
    SERVER_IP: process.env.SERVER_IP || '127.0.0.1',
    PORT: process.env.PORT || 7000,
    LONG_TIMEOUT: parseInt(process.env.LONG_TIMEOUT, 10) || 30000,
    SHORT_TIMEOUT: parseInt(process.env.SHORT_TIMEOUT, 10) || 10000,
    SUBSOURCE_API_KEY: 'sk_eeaaa0598e7e58e2957f68a0b209c2dead1dcea710a14d60ff8aa544f1366ff9',
};