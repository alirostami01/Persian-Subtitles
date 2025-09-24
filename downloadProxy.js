const axios = require('axios');
const AdmZip = require('adm-zip');
const config = require('./config');

async function downloadProxy(req, res) {
    try {
        const { token } = req.params;
        if (!token) return res.status(400).send('No token provided');

        const downloadUrl = `https://api.subsource.net/v1/subtitle/download/${token}`;
        console.log(`Proxying and unzipping from: ${downloadUrl}`);

        const response = await axios({ method: 'get', url: downloadUrl, responseType: 'arraybuffer', timeout: config.LONG_TIMEOUT });
        const zip = new AdmZip(response.data);
        const subtitleEntry = zip.getEntries().find(entry => entry.entryName.toLowerCase().endsWith('.srt'));

        if (!subtitleEntry) { return res.status(404).send('No .srt file found in ZIP archive'); }

        const subtitleContent = subtitleEntry.getData();
        res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
        res.send(subtitleContent);
        console.log(`Successfully extracted and sent: ${subtitleEntry.entryName}`);
    } catch (error) {
        console.error('Proxy Unzip Error:', error.message);
        res.status(500).send('Failed to proxy and unzip subtitle download');
    }
}

module.exports = downloadProxy;