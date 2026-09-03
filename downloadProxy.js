const AdmZip = require('adm-zip');
const iconv = require('iconv-lite');
const config = require('./config');
const { apiRequest } = require('./apiClient');

const API_BASE_URL = 'https://api.subsource.net/api/v1';

function parseTimestamp(timestamp) {
    const match = String(timestamp).trim().match(/^(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/);
    if (!match) throw new Error(`Invalid subtitle timestamp: ${timestamp}`);
    return ((Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000) + Number(match[4].padEnd(3, '0'));
}

function toTimestamp(ms) {
    ms = Math.max(0, Math.round(ms));
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}

function stripAssTags(text) {
    return String(text)
        .replace(/\\N/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\h/g, ' ')
        .replace(/\{[^}]*\}/g, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .trim();
}

function assTimeToMs(value) {
    const match = String(value).trim().match(/^(\d+):(\d{1,2}):(\d{1,2})[.](\d{1,2})$/);
    if (!match) throw new Error(`Invalid ASS timestamp: ${value}`);
    return ((Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000) + Number(match[4]) * 10;
}

function assToSrt(content) {
    const lines = String(content).replace(/^\uFEFF/, '').split(/\r?\n/);
    const eventsStart = lines.findIndex(line => /^\s*\[Events\]\s*$/i.test(line));
    if (eventsStart < 0) throw new Error('ASS/SSA [Events] section not found');

    let format = ['Layer', 'Start', 'End', 'Style', 'Name', 'MarginL', 'MarginR', 'MarginV', 'Effect', 'Text'];
    let inEvents = true;
    const entries = [];

    for (let i = eventsStart + 1; i < lines.length; i += 1) {
        const line = lines[i];
        if (/^\s*\[[^\]]+\]\s*$/.test(line)) {
            inEvents = false;
            break;
        }
        if (/^\s*Format\s*:/i.test(line)) {
            format = line.replace(/^\s*Format\s*:/i, '').split(',').map(v => v.trim());
            continue;
        }
        if (!inEvents || !/^\s*Dialogue\s*:/i.test(line)) continue;

        const payload = line.replace(/^\s*Dialogue\s*:/i, '').trim();
        const fields = payload.split(',');
        const textIndex = format.findIndex(field => field.toLowerCase() === 'text');
        const startIndex = format.findIndex(field => field.toLowerCase() === 'start');
        const endIndex = format.findIndex(field => field.toLowerCase() === 'end');
        if (startIndex < 0 || endIndex < 0) continue;

        const fieldCount = format.length;
        const text = fields.slice(Math.max(textIndex, 0), Math.max(textIndex, 0) + 1).length
            ? fields.slice(Math.max(textIndex, 0)).join(',')
            : fields.slice(fieldCount - 1).join(',');
        const start = fields.slice(startIndex, startIndex + 1)[0];
        const end = fields.slice(endIndex, endIndex + 1)[0];

        try {
            const startMs = assTimeToMs(start);
            const endMs = assTimeToMs(end);
            const cleanText = stripAssTags(text);
            if (cleanText) entries.push({ startMs, endMs, text: cleanText });
        } catch {
            // Ignore malformed dialogue lines and keep valid events.
        }
    }

    if (!entries.length) throw new Error('No valid ASS/SSA dialogue events found');
    entries.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
    return entries.map((entry, index) => `${index + 1}\n${toTimestamp(entry.startMs)} --> ${toTimestamp(entry.endMs)}\n${entry.text}`).join('\n\n');
}

function addPromoTextToSubtitle(srtContent, promoText, durationSeconds, position) {
    if (!promoText || !srtContent) return srtContent;
    const durationMs = Math.max(1, Number(durationSeconds) || 1) * 1000;
    const coloredPromoText = `{\\c&H00FFFF00&}${promoText}{\\c}`;
    const blocks = srtContent.replace(/\r\n/g, '\n').split(/\n\s*\n/).filter(block => block.trim());
    if (!blocks.length) return srtContent;

    const parsed = blocks.map(block => {
        const lines = block.split('\n');
        const timingIndex = lines.findIndex(line => line.includes('-->'));
        if (timingIndex < 0) return null;
        const [start, end] = lines[timingIndex].split('-->');
        try {
            return { block, start: parseTimestamp(start), end: parseTimestamp(end) };
        } catch {
            return null;
        }
    }).filter(Boolean);

    if (!parsed.length) return srtContent;

    if (position === 'start') {
        const promoEnd = Math.min(durationMs, Math.max(1, parsed[0].start));
        const promoBlock = `1\n00:00:00,000 --> ${toTimestamp(promoEnd)}\n${coloredPromoText}`;
        const renumbered = blocks.map((block, index) => {
            const lines = block.split('\n');
            if (/^\d+$/.test(lines[0].trim())) lines[0] = String(index + 2);
            return lines.join('\n');
        });
        return `${promoBlock}\n\n${renumbered.join('\n\n')}`;
    }

    const last = parsed[parsed.length - 1];
    const promoStart = last.end;
    const promoEnd = promoStart + durationMs;
    const promoBlock = `${blocks.length + 1}\n${toTimestamp(promoStart)} --> ${toTimestamp(promoEnd)}\n${coloredPromoText}`;
    return `${blocks.join('\n\n')}\n\n${promoBlock}`;
}

function decodeSubtitle(rawBuffer) {
    let content = iconv.decode(rawBuffer, 'utf-8');
    if (content.includes('\uFFFD')) content = iconv.decode(rawBuffer, 'win1256');
    return content.replace(/^\uFEFF/, '');
}

function findSubtitleEntry(entries) {
    const supported = ['.srt', '.ass', '.ssa'];
    return entries
        .filter(entry => !entry.isDirectory && supported.some(ext => entry.entryName.toLowerCase().endsWith(ext)))
        .sort((a, b) => {
            const extA = a.entryName.toLowerCase().endsWith('.srt') ? 0 : 1;
            const extB = b.entryName.toLowerCase().endsWith('.srt') ? 0 : 1;
            return extA - extB;
        })[0] || null;
}

async function downloadProxy(req, res) {
    const { token } = req.params;
    if (!token) return res.status(400).send('No subtitle ID provided');
    if (!process.env.API_KEY) return res.status(500).send('Server configuration error');

    try {
        const downloadUrl = `${API_BASE_URL}/subtitles/${encodeURIComponent(token)}/download`;
        console.log(`Proxying subtitle download: ${token}`);

        const response = await apiRequest({
            url: downloadUrl,
            responseType: 'arraybuffer',
            timeout: config.LONG_TIMEOUT,
            headers: { 'X-API-Key': process.env.API_KEY }
        });

        const zip = new AdmZip(response.data);
        const entries = zip.getEntries();
        const subtitleEntry = findSubtitleEntry(entries);
        if (!subtitleEntry) {
            console.error(`Subtitle ${token}: archive contains no SRT/ASS/SSA. Entries:`, entries.map(e => e.entryName));
            return res.status(415).send('No supported subtitle file found in ZIP archive');
        }

        const rawBuffer = subtitleEntry.getData();
        const sourceExtension = subtitleEntry.entryName.toLowerCase().split('.').pop();
        let subtitleContent = decodeSubtitle(rawBuffer);

        if (sourceExtension === 'ass' || sourceExtension === 'ssa') {
            subtitleContent = assToSrt(subtitleContent);
            console.log(`Converted ${sourceExtension.toUpperCase()} to SRT for subtitle ${token}`);
        }

        if (config.SUBTITLE_PROMO_TEXT) {
            try {
                subtitleContent = addPromoTextToSubtitle(
                    subtitleContent,
                    config.SUBTITLE_PROMO_TEXT,
                    config.SUBTITLE_PROMO_DURATION,
                    config.SUBTITLE_PROMO_POSITION
                );
            } catch (promoError) {
                console.error(`Promo processing failed for ${token}:`, promoError.message);
            }
        }

        res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="subtitle-${token}.srt"`);
        res.send(subtitleContent);
        console.log(`Successfully sent subtitle ${token}: ${subtitleEntry.entryName}`);
    } catch (error) {
        console.error(`Proxy Download Error [${token}]:`, error.message, error.response?.status || '');
        res.status(502).send(`Failed to proxy subtitle download: ${error.message}`);
    }
}

module.exports = downloadProxy;
