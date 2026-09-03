const manifest = require('./manifest');

const API_BASE_URL = 'https://api.subsource.net/api/v1';
const CINEMETA_BASE_URL = 'https://v3-cinemeta.strem.io/meta';
const PERSIAN_LANG_CODE = 'farsi_persian';
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_PROMO_TEXT = '❤️ 🎬با حمایت شما، توسعه افزونه ادامه پیدا می‌کند 🙏👉 alirostami.com/support';
const DEFAULT_PROMO_DURATION = 20;
const DEFAULT_PROMO_POSITION = 'end';
const PUBLIC_PREFIX = '/subtitles';
const PAGE_SIZE = 100;
const MAX_PAGES = 20;

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'cache-control': 'no-store'
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET,OPTIONS');
  headers.set('access-control-allow-headers', 'Content-Type, X-API-Key');
  return new Response(response.body, { status: response.status, headers });
}

async function fetchWithRetry(url, options = {}, retries = 3) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok || ![429, 500, 502, 503, 504].includes(response.status) || attempt === retries) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt === retries) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 300 * (2 ** attempt) + Math.floor(Math.random() * 200)));
  }
  throw lastError;
}

async function fetchJson(url, options = {}) {
  const response = await fetchWithRetry(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

function apiHeaders(env) {
  return { Accept: 'application/json', 'X-API-Key': env.API_KEY || '' };
}

function parseStremioId(type, id) {
  if (type === 'series') {
    const [imdbId, season, episode] = id.split(':');
    return { imdbId, season, episode };
  }
  return { imdbId: id, season: null, episode: null };
}

function selectBestMovieId(results, season) {
  if (!Array.isArray(results) || !results.length) return null;
  const seasonNum = Number.parseInt(season, 10);
  const scored = results.map(item => {
    const text = JSON.stringify(item).toLowerCase();
    let score = item?.movieId != null ? 1 : 0;
    if (Number.isInteger(seasonNum)) {
      if (new RegExp(`season\\s*0*${seasonNum}\\b`).test(text)) score += 10;
      if (new RegExp(`\\bs0*${seasonNum}\\b`).test(text)) score += 8;
    }
    return { item, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.item?.movieId ?? null;
}

async function getMovieId(type, imdbId, season, env) {
  const headers = apiHeaders(env);
  if (!env.API_KEY) throw new Error('API_KEY is not configured');

  if (type === 'series') {
    try {
      const meta = await fetchJson(`${CINEMETA_BASE_URL}/series/${encodeURIComponent(imdbId)}.json`);
      const mediaName = meta?.meta?.name;
      if (mediaName) {
        const url = `${API_BASE_URL}/movies/search?searchType=text&q=${encodeURIComponent(mediaName)}&season=${encodeURIComponent(season)}`;
        const result = await fetchJson(url, { headers });
        if (result?.success && Array.isArray(result.data) && result.data.length) return selectBestMovieId(result.data, season);
      }
    } catch (error) {
      console.warn('Series name search failed:', error.message);
    }
  }

  const url = `${API_BASE_URL}/movies/search?searchType=imdb&imdb=${encodeURIComponent(imdbId)}`;
  const result = await fetchJson(url, { headers });
  return selectBestMovieId(result?.data, season);
}

function normalizeReleaseInfo(releaseInfo) {
  return Array.isArray(releaseInfo) ? releaseInfo.join(' ').toUpperCase().trim() : '';
}

function compactReleaseInfo(releaseInfo) {
  return normalizeReleaseInfo(releaseInfo).replace(/[-._\s]+/g, '');
}

function matchesEpisode(releaseInfo, season, episode) {
  const seasonNum = Number.parseInt(season, 10);
  const episodeNum = Number.parseInt(episode, 10);
  if (!Number.isInteger(seasonNum) || !Number.isInteger(episodeNum)) return false;

  const raw = normalizeReleaseInfo(releaseInfo);
  const compact = compactReleaseInfo(releaseInfo);
  const s = String(seasonNum);
  const ss = s.padStart(2, '0');
  const e = String(episodeNum);
  const ee = e.padStart(2, '0');

  const explicit = [
    `S${ss}E${ee}`, `S${s}E${e}`, `S${ss}E${e}`, `S${s}E${ee}`,
    `${s}X${ee}`, `${s}X${e}`, `${ss}X${ee}`, `${ss}X${e}`
  ];
  if (explicit.some(pattern => compact.includes(pattern))) return true;

  const spaced = [
    new RegExp(`\\bS\\s*0*${seasonNum}\\s*[-_. ]?\\s*E\\s*0*${episodeNum}\\b`, 'i'),
    new RegExp(`\\b0*${seasonNum}\\s*[xX]\\s*0*${episodeNum}\\b`, 'i'),
    new RegExp(`\\bSEASON\\s*0*${seasonNum}\\s*(?:EP(?:ISODE)?|E)\\s*0*${episodeNum}\\b`, 'i'),
    new RegExp(`\\b0*${seasonNum}\\s*[-_. ]\\s*0*${episodeNum}\\b`, 'i')
  ];
  if (spaced.some(pattern => pattern.test(raw))) return true;

  // Episode-only releases such as "01" are valid because this query already
  // targets the season-specific SubSource movieId.
  const standaloneEpisode = new RegExp(`(?:^|[^0-9])0*${episodeNum}(?:[^0-9]|$)`);
  const hasExplicitOtherEpisode = /\b(?:E|EP|EPISODE)\s*0*\d+\b/i.test(raw);
  return standaloneEpisode.test(raw) && !hasExplicitOtherEpisode;
}

function isSeasonPack(releaseInfo, season) {
  const seasonNum = Number.parseInt(season, 10);
  if (!Number.isInteger(seasonNum)) return false;
  const raw = normalizeReleaseInfo(releaseInfo);
  const compact = compactReleaseInfo(releaseInfo);
  const seasonMarker = new RegExp(`(?:^|[^A-Z0-9])S(?:EASON)?0*${seasonNum}(?:[^A-Z0-9]|$)`, 'i');
  return /\b(?:COMPLETE|FULL|PACK|SEASON\s*PACK)\b/i.test(raw) &&
    (seasonMarker.test(raw) || compact.includes(`SEASON${seasonNum}`) || compact.includes(`S${String(seasonNum).padStart(2, '0')}`));
}

function dedupeSubtitles(subtitles) {
  const seen = new Set();
  return subtitles.filter(sub => {
    const id = String(sub?.subtitleId ?? '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

async function fetchAllSubtitles(movieId, headers) {
  const all = [];
  const seenIds = new Set();
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `${API_BASE_URL}/subtitles?movieId=${encodeURIComponent(movieId)}&language=${PERSIAN_LANG_CODE}&sort=rating&limit=${PAGE_SIZE}&page=${page}`;
    const result = await fetchJson(url, { headers });
    const data = result?.data;
    if (!result?.success || !Array.isArray(data) || !data.length) break;

    let newCount = 0;
    for (const subtitle of data) {
      const id = String(subtitle?.subtitleId ?? '');
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        all.push(subtitle);
        newCount += 1;
      }
    }

    console.log(`SubSource subtitles page ${page}: ${data.length} received, ${newCount} new.`);
    if (data.length < PAGE_SIZE || newCount === 0) break;
  }
  return all;
}

async function subtitlesHandler(type, id, env, origin) {
  const { imdbId, season, episode } = parseStremioId(type, id);
  if (!imdbId || !imdbId.startsWith('tt')) return { subtitles: [] };

  try {
    const movieId = await getMovieId(type, imdbId, season, env);
    if (!movieId) return { subtitles: [] };

    const allSubtitles = await fetchAllSubtitles(movieId, apiHeaders(env));
    if (!allSubtitles.length) return { subtitles: [] };

    let subtitles = allSubtitles;
    if (type === 'series') {
      subtitles = allSubtitles.filter(sub => matchesEpisode(sub.releaseInfo, season, episode) || isSeasonPack(sub.releaseInfo, season));
      console.log(`Episode filter ${season}x${episode}: ${subtitles.length}/${allSubtitles.length} matched.`);
    }

    subtitles = dedupeSubtitles(subtitles);
    return {
      subtitles: subtitles.map(sub => ({
        id: String(sub.subtitleId),
        url: `${origin}${PUBLIC_PREFIX}/download/${encodeURIComponent(sub.subtitleId)}`,
        lang: 'fas',
        title: Array.isArray(sub.releaseInfo) ? sub.releaseInfo.join(' ') : 'Persian Subtitle'
      }))
    };
  } catch (error) {
    console.error('Subtitle handler error:', error.message);
    return { subtitles: [] };
  }
}

function readU16(view, offset) { return view.getUint16(offset, true); }
function readU32(view, offset) { return view.getUint32(offset, true); }

function findEndOfCentralDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
    if (readU32(view, i) === 0x06054b50) return i;
  }
  return -1;
}

async function extractSubtitleFile(zipBytes) {
  const bytes = new Uint8Array(zipBytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(bytes);
  if (eocd < 0) throw new Error('Invalid ZIP: end of central directory not found');

  const entryCount = readU16(view, eocd + 10);
  const centralSize = readU32(view, eocd + 12);
  const centralOffset = readU32(view, eocd + 16);
  if (centralOffset + centralSize > bytes.length) throw new Error('Invalid ZIP central directory');

  let offset = centralOffset;
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const supported = ['.srt', '.ass', '.ssa'];
  const candidates = [];

  for (let i = 0; i < entryCount; i += 1) {
    if (offset + 46 > bytes.length || readU32(view, offset) !== 0x02014b50) break;
    const method = readU16(view, offset + 10);
    const compressedSize = readU32(view, offset + 20);
    const fileNameLength = readU16(view, offset + 28);
    const extraLength = readU16(view, offset + 30);
    const commentLength = readU16(view, offset + 32);
    const localHeaderOffset = readU32(view, offset + 42);
    const nameEnd = offset + 46 + fileNameLength;
    if (nameEnd > bytes.length) throw new Error('Invalid ZIP file name bounds');
    const fileName = decoder.decode(bytes.slice(offset + 46, nameEnd));
    offset += 46 + fileNameLength + extraLength + commentLength;

    const lower = fileName.toLowerCase();
    const extension = supported.find(ext => lower.endsWith(ext));
    if (!extension) continue;
    candidates.push({ method, compressedSize, localHeaderOffset, fileName, extension });
  }

  candidates.sort((a, b) => (a.extension === '.srt' ? 0 : 1) - (b.extension === '.srt' ? 0 : 1));
  const candidate = candidates[0];
  if (!candidate) throw new Error('No supported subtitle file found in ZIP archive');

  const { method, compressedSize, localHeaderOffset } = candidate;
  if (localHeaderOffset + 30 > bytes.length || readU32(view, localHeaderOffset) !== 0x04034b50) throw new Error('Invalid ZIP local file header');
  const localNameLength = readU16(view, localHeaderOffset + 26);
  const localExtraLength = readU16(view, localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
  if (dataStart + compressedSize > bytes.length) throw new Error('Invalid ZIP compressed data bounds');
  const compressed = bytes.slice(dataStart, dataStart + compressedSize);

  if (method === 0) return { bytes: compressed, extension: candidate.extension, fileName: candidate.fileName };
  if (method === 8) {
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), extension: candidate.extension, fileName: candidate.fileName };
  }
  throw new Error(`Unsupported ZIP compression method: ${method}`);
}

function decodeSubtitle(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('windows-1256').decode(bytes).replace(/^\uFEFF/, '');
  }
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
  const lines = String(content).split(/\r?\n/);
  const eventsStart = lines.findIndex(line => /^\s*\[Events\]\s*$/i.test(line));
  if (eventsStart < 0) throw new Error('ASS/SSA [Events] section not found');

  let format = ['Layer', 'Start', 'End', 'Style', 'Name', 'MarginL', 'MarginR', 'MarginV', 'Effect', 'Text'];
  const entries = [];
  for (let i = eventsStart + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*\[[^\]]+\]\s*$/.test(line)) break;
    if (/^\s*Format\s*:/i.test(line)) {
      format = line.replace(/^\s*Format\s*:/i, '').split(',').map(v => v.trim());
      continue;
    }
    if (!/^\s*Dialogue\s*:/i.test(line)) continue;

    const payload = line.replace(/^\s*Dialogue\s*:/i, '').trim();
    const fields = payload.split(',');
    const startIndex = format.findIndex(field => field.toLowerCase() === 'start');
    const endIndex = format.findIndex(field => field.toLowerCase() === 'end');
    const textIndex = format.findIndex(field => field.toLowerCase() === 'text');
    if (startIndex < 0 || endIndex < 0) continue;

    const textStart = textIndex >= 0 ? textIndex : format.length - 1;
    const text = fields.slice(textStart).join(',');
    try {
      const startMs = assTimeToMs(fields[startIndex]);
      const endMs = assTimeToMs(fields[endIndex]);
      const cleanText = stripAssTags(text);
      if (cleanText) entries.push({ startMs, endMs, text: cleanText });
    } catch {
      // Ignore malformed dialogue entries.
    }
  }

  if (!entries.length) throw new Error('No valid ASS/SSA dialogue events found');
  entries.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const toTimestamp = ms => {
    ms = Math.max(0, Math.round(ms));
    const totalSeconds = Math.floor(ms / 1000);
    return `${String(Math.floor(totalSeconds / 3600)).padStart(2, '0')}:${String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
  };
  return entries.map((entry, index) => `${index + 1}\n${toTimestamp(entry.startMs)} --> ${toTimestamp(entry.endMs)}\n${entry.text}`).join('\n\n');
}

function parseTimestamp(timestamp) {
  const match = String(timestamp).trim().match(/^(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/);
  if (!match) throw new Error(`Invalid subtitle timestamp: ${timestamp}`);
  return ((Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000) + Number(match[4].padEnd(3, '0'));
}

function toTimestamp(ms) {
  ms = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(ms / 1000);
  return `${String(Math.floor(totalSeconds / 3600)).padStart(2, '0')}:${String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
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
    try { return { block, start: parseTimestamp(start), end: parseTimestamp(end) }; } catch { return null; }
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
  const promoBlock = `${blocks.length + 1}\n${toTimestamp(last.end)} --> ${toTimestamp(last.end + durationMs)}\n${coloredPromoText}`;
  return `${blocks.join('\n\n')}\n\n${promoBlock}`;
}

async function downloadProxy(token, env) {
  if (!token) return new Response('No subtitle ID provided', { status: 400 });
  if (!env.API_KEY) return new Response('Server configuration error', { status: 500 });

  try {
    const response = await fetchWithRetry(`${API_BASE_URL}/subtitles/${encodeURIComponent(token)}/download`, {
      headers: apiHeaders(env),
      timeout: env.LONG_TIMEOUT ? Number(env.LONG_TIMEOUT) : DEFAULT_TIMEOUT_MS
    });
    if (!response.ok) return new Response('Failed to download subtitle archive', { status: response.status });

    const archive = await response.arrayBuffer();
    const subtitleFile = await extractSubtitleFile(archive);
    let content = decodeSubtitle(subtitleFile.bytes);
    if (subtitleFile.extension === '.ass' || subtitleFile.extension === '.ssa') {
      content = assToSrt(content);
      console.log(`Converted ${subtitleFile.extension.toUpperCase()} to SRT: ${subtitleFile.fileName}`);
    }

    const promoText = env.SUBTITLE_PROMO_TEXT ?? DEFAULT_PROMO_TEXT;
    const promoDuration = Number(env.SUBTITLE_PROMO_DURATION ?? DEFAULT_PROMO_DURATION);
    const promoPosition = env.SUBTITLE_PROMO_POSITION ?? DEFAULT_PROMO_POSITION;
    if (promoText) content = addPromoTextToSubtitle(content, promoText, promoDuration, promoPosition);

    return withCors(new Response(content, {
      status: 200,
      headers: {
        'content-type': 'application/x-subrip; charset=utf-8',
        'content-disposition': `inline; filename="subtitle-${token}.srt"`,
        'cache-control': 'private, max-age=300'
      }
    }));
  } catch (error) {
    console.error(`Download proxy error [${token}]:`, error.message);
    return new Response(`Failed to proxy subtitle download: ${error.message}`, { status: 502 });
  }
}

function getManifest(origin) {
  return {
    ...manifest,
    behaviorHints: { ...(manifest.behaviorHints || {}), configurable: false },
    logo: `${origin}${PUBLIC_PREFIX}/logo.png`
  };
}

async function getAsset(pathname, request, env) {
  if (!env.ASSETS) return new Response('Not Found', { status: 404 });
  const assetUrl = new URL(request.url);
  assetUrl.pathname = pathname;
  return env.ASSETS.fetch(new Request(assetUrl, request));
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));
  if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });

  const path = url.pathname === PUBLIC_PREFIX ? '/' : url.pathname.startsWith(`${PUBLIC_PREFIX}/`) ? url.pathname.slice(PUBLIC_PREFIX.length) : null;
  if (path === null) return new Response('Not Found', { status: 404 });

  if (path === '/' || path === '/health') return json({ status: 'ok', service: 'subsource-stremio-addon', runtime: 'cloudflare-workers' });
  if (path === '/manifest.json') return json(getManifest(url.origin), 200, { 'cache-control': 'public, max-age=300' });
  if (path === '/logo.png') return getAsset('/logo.png', request, env);

  const downloadMatch = path.match(/^\/download\/([^/]+)$/);
  if (downloadMatch) return downloadProxy(decodeURIComponent(downloadMatch[1]), env);

  const directSubtitleMatch = path.match(/^\/(movie|series)\/([^/]+?)(?:\.json)?$/);
  if (directSubtitleMatch) return json(await subtitlesHandler(directSubtitleMatch[1], decodeURIComponent(directSubtitleMatch[2]), env, url.origin));

  const stremioSubtitleMatch = path.match(/^\/subtitles\/(movie|series)\/([^/]+)(?:\/.*)?$/);
  if (stremioSubtitleMatch) return json(await subtitlesHandler(stremioSubtitleMatch[1], decodeURIComponent(stremioSubtitleMatch[2]), env, url.origin));

  return new Response('Not Found', { status: 404 });
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error('Unhandled Worker error:', error);
      return json({ error: 'Internal Server Error' }, 500);
    }
  }
};
