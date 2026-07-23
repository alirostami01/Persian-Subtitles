const axios = require('axios');
const AdmZip = require('adm-zip');
const iconv = require('iconv-lite');
const config = require('./config');

const API_BASE_URL = 'https://api.subsource.net/api/v1';

/**
 * Parses SRT timestamp string to milliseconds.
 * Format: HH:MM:SS,mmm
 * 
 * @param {string} timestamp - Timestamp string in SRT format
 * @returns {number} - Timestamp in milliseconds
 */
function parseTimestamp(timestamp) {
    const parts = timestamp.trim().split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const secondsParts = parts[2].split(',');
    const seconds = parseInt(secondsParts[0], 10);
    const milliseconds = parseInt(secondsParts[1], 10);
    
    return ((hours * 3600) + (minutes * 60) + seconds) * 1000 + milliseconds;
}

/**
 * Converts milliseconds to SRT timestamp format.
 * 
 * @param {number} ms - Time in milliseconds
 * @returns {string} - Timestamp string in SRT format (HH:MM:SS,mmm)
 */
function toTimestamp(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = ms % 1000;
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

/**
 * Adds promotional text to subtitle content.
 * Inserts a new subtitle entry with the promo text at the specified position.
 * Color is hardcoded to yellow.
 * 
 * @param {string} srtContent - Original SRT subtitle content
 * @param {string} promoText - Text to add
 * @param {number} durationSeconds - Duration in seconds for the promo text
 * @param {string} position - 'start' or 'end'
 * @returns {string} - Modified SRT content with promo text
 */
function addPromoTextToSubtitle(srtContent, promoText, durationSeconds, position) {
    if (!promoText || !srtContent) {
        return srtContent;
    }
    
    const durationMs = durationSeconds * 1000;
    
    // Hardcoded yellow color in ASS format (&H00FFFF00)
    const assColor = '&H00FFFF00';
    const coloredPromoText = `{\\c${assColor}}${promoText}{\\c}`;
    
    // Parse SRT into blocks
    const blocks = srtContent.split(/\n\s*\n/).filter(block => block.trim());
    
    if (blocks.length === 0) {
        return srtContent;
    }
    
    let promoBlock;
    
    if (position === 'start') {
        // Add at the beginning - before first subtitle
        const firstBlock = blocks[0];
        const lines = firstBlock.split('\n');
        
        // Find timing line (usually second line)
        let timingLineIndex = 1;
        while (timingLineIndex < lines.length && !lines[timingLineIndex].includes('-->')) {
            timingLineIndex++;
        }
        
        if (timingLineIndex < lines.length) {
            const timingParts = lines[timingLineIndex].split('-->');
            const endTime = parseTimestamp(timingParts[1].trim());
            
            // Promo text appears from 0 to durationMs
            promoBlock = `1\n00:00:00,000 --> ${toTimestamp(durationMs)}\n${coloredPromoText}`;
            
            // Renumber all existing blocks
            const renumberedBlocks = blocks.map((block, index) => {
                const blockLines = block.split('\n');
                if (blockLines.length > 0) {
                    blockLines[0] = String(index + 2); // Start from 2 since promo is #1
                }
                return blockLines.join('\n');
            });
            
            return promoBlock + '\n\n' + renumberedBlocks.join('\n\n');
        }
    } else {
        // Add at the end - after last subtitle
        const lastBlock = blocks[blocks.length - 1];
        const lines = lastBlock.split('\n');
        
        // Find timing line
        let timingLineIndex = 1;
        while (timingLineIndex < lines.length && !lines[timingLineIndex].includes('-->')) {
            timingLineIndex++;
        }
        
        if (timingLineIndex < lines.length) {
            const timingParts = lines[timingLineIndex].split('-->');
            const startTime = parseTimestamp(timingParts[0].trim());
            const endTime = parseTimestamp(timingParts[1].trim());
            
            // Calculate gap between subtitles to fit promo text
            const gapMs = Math.min(3000, Math.floor((endTime - startTime) * 0.3)); // Use 30% of subtitle duration or max 3s
            
            // Promo starts before last subtitle ends
            const promoStartTime = endTime - gapMs;
            const promoEndTime = promoStartTime + durationMs;
            
            promoBlock = `${blocks.length + 1}\n${toTimestamp(promoStartTime)} --> ${toTimestamp(promoEndTime)}\n${coloredPromoText}`;
            
            return blocks.join('\n\n') + '\n\n' + promoBlock;
        }
    }
    
    // Fallback: just append at end with default timing
    const lastEndTime = blocks.length > 0 ? 
        parseTimestamp(blocks[blocks.length - 1].split('\n').find(l => l.includes('-->')).split('-->')[1].trim()) : 
        0;
    
    promoBlock = `${blocks.length + 1}\n${toTimestamp(lastEndTime)} --> ${toTimestamp(lastEndTime + durationMs)}\n${coloredPromoText}`;
    
    return blocks.join('\n\n') + '\n\n' + promoBlock;
}

/**
 * Proxy handler for downloading subtitle files from SubSource API.
 * Extracts .srt files from ZIP archives, adds promotional text, and streams them to the client.
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

        // Extract subtitle content as string with encoding detection
        // Persian subtitles are often encoded in Windows-1256, not UTF-8
        let rawBuffer = srtEntry.getData();
        let srtContent = iconv.decode(rawBuffer, 'utf-8');
        if (srtContent.includes('\uFFFD')) {
            srtContent = iconv.decode(rawBuffer, 'win1256');
            console.log(`Re-encoded subtitle from Windows-1256 to UTF-8 for: ${srtEntry.entryName}`);
        }
        
        // Add promotional text if configured
        if (config.SUBTITLE_PROMO_TEXT) {
            try {
                srtContent = addPromoTextToSubtitle(
                    srtContent,
                    config.SUBTITLE_PROMO_TEXT,
                    config.SUBTITLE_PROMO_DURATION,
                    config.SUBTITLE_PROMO_POSITION
                );
                console.log(`Added promotional text (${config.SUBTITLE_PROMO_POSITION}) to subtitle ${token}`);
            } catch (promoError) {
                console.error('Failed to add promotional text:', promoError.message);
                // Continue with original subtitle if promo addition fails
            }
        }

        // Set appropriate headers for subtitle content with UTF-8 encoding
        res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
        
        // Stream the modified subtitle content to the client
        res.send(srtContent);
        console.log(`Successfully extracted and sent: ${srtEntry.entryName}`);

    } catch (error) {
        console.error('Proxy Download Error:', error.message);
        res.status(500).send('Failed to proxy subtitle download');
    }
}

module.exports = downloadProxy;
