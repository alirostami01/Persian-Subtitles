require('dotenv').config();

const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const express = require('express');
const cors = require('cors');

const manifest = require('./manifest');
const subtitlesHandler = require('./subtitlesHandler');
const downloadProxy = require('./downloadProxy');
const config = require('./config');

const builder = new addonBuilder(manifest);
builder.defineSubtitlesHandler(subtitlesHandler);

const app = express();
app.use(cors());

app.get('/download/:token', downloadProxy);

const router = getRouter(builder.getInterface());
app.use(router);

app.listen(config.PORT, '0.0.0.0', () => {
    console.log(`Add-on server is running on port ${config.PORT}`);
    console.log(`Install in Stremio on any device via: http://${config.SERVER_IP}:${config.PORT}/manifest.json`);
});