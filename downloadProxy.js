const axios = require('axios');
const AdmZip = require('adm-zip');
const config = require('./config');

const API_BASE_URL = 'https://api.subsource.net/api/v1';

/**
 * Proxy handler for downloading subtitle files from SubSource API.
 * Extracts .srt files from ZIP archives and streams them to the client.
 * Designed to handle concurrent requests efficiently.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function downloadProxy(req, res) {
    try {
        const { token } = req.params;
        
        // Validate subtitle ID parameter
        if (!token) {
            return res.status(400).send('No subtitle ID provided');
        }

        // Verify API key is configured
        if (!process.env.API_KEY) {
            console.error("API Key is missing. Cannot process download.");
            return res.status(500).send('Server configuration error');
        }

        // Construct download URL from SubSource API
        const downloadUrl = `${API_BASE_URL}/subtitles/${token}/download`;
        console.log(`Proxying download for subtitle ID: ${token}`);

        // Fetch ZIP archive from external API with timeout configuration
        const response = await axios.get(downloadUrl, {
            responseType: 'arraybuffer',
            timeout: config.LONG_TIMEOUT,
            headers: { 'X-API-Key': process.env.API_KEY }
        });

        // Initialize ZIP parser with the downloaded data
        const zip = new AdmZip(response.data);
        
        // Find the first .srt (SubRip subtitle) file in the archive
        const srtEntry = zip.getEntries().find(entry => entry.entryName.toLowerCase().endsWith('.srt'));

        // Return 404 if no subtitle file is found
        if (!srtEntry) {
            return res.status(404).send('No .srt file found in ZIP archive');
        }

        // Set appropriate headers for subtitle content with UTF-8 encoding
        res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
        
        // Stream the extracted subtitle content to the client
        res.send(srtEntry.getData());
        console.log(`Successfully extracted and sent: ${srtEntry.entryName}`);

    } catch (error) {
        console.error('Proxy Download Error:', error.message);
        res.status(500).send('Failed to proxy subtitle download');
    }
}

module.exports = downloadProxy;
