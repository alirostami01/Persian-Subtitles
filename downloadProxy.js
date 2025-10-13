const axios = require('axios');
const AdmZip = require('adm-zip');
const config = require('./config');

const API_BASE_URL = 'https://api.subsource.net/api/v1';

async function downloadProxy(req, res) {
    try {
        // پارامتر ورودی از روت /download/:token گرفته می‌شود
        const { token } = req.params;
        if (!token) {
            return res.status(400).send('No subtitle ID provided');
        }

        if (!process.env.API_KEY) {
            console.error("API Key is missing. Cannot process download.");
            return res.status(500).send('Server configuration error');
        }

        const downloadUrl = `${API_BASE_URL}/subtitles/${token}/download`;
        console.log(`Proxying download for subtitle ID: ${token}`);

        const response = await axios.get(downloadUrl, {
            responseType: 'arraybuffer',
            timeout: config.LONG_TIMEOUT,
            headers: { 'X-API-Key': process.env.API_KEY }
        });

        const zip = new AdmZip(response.data);
        const srtEntry = zip.getEntries().find(entry => entry.entryName.toLowerCase().endsWith('.srt'));

        if (!srtEntry) {
            return res.status(404).send('No .srt file found in ZIP archive');
        }

        res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
        res.send(srtEntry.getData());
        console.log(`Successfully extracted and sent: ${srtEntry.entryName}`);

    } catch (error) {
        console.error('Proxy Download Error:', error.message);
        res.status(500).send('Failed to proxy subtitle download');
    }
}

module.exports = downloadProxy;