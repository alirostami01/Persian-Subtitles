const manifest = require('./manifest');

const API_BASE_URL = 'https://api.subsource.net/api/v1';
const CINEMETA_BASE_URL = 'https://v3-cinemeta.strem.io/meta';
const PERSIAN_LANG_CODE = 'farsi_persian';
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_PROMO_TEXT = '❤️ 🎬با حمایت شما، توسعه افزونه ادامه پیدا می‌کند 🙏👉 alirostami.com/support';
const DEFAULT_PROMO_DURATION = 20;
const DEFAULT_PROMO_POSITION = 'end';
const PUBLIC_PREFIX = '/subtitles';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'cache-control': 'no-store'
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders }
  });
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
        if (result?.success && Array.isArray(result.data) && result.data.length) return result.data[0].movieId;
      }
    } catch (error) {
      console.warn('Series name search failed:', error.message);
    }
  }

  const url = `${API_BASE_URL}/movies/search?searchType=imdb&imdb=${encodeURIComponent(imdbId)}`;
  const result = await fetchJson(url, { headers });
  return result?.success && Array.isArray(result.data) && result.data.length ? result.data[0].movieId : null;
}

function filterSeriesSubtitles(subtitles, season, episode) {
  const seasonNum = Number.parseInt(season, 10);
  const episodeNum = Number.parseInt(episode, 10);
  if (!Number.isInteger(seasonNum) || !Number.isInteger(episodeNum)) return [];

  const episodePatterns = [
    `S${String(seasonNum).padStart(2, '0')}E${String(episodeNum).padStart(2, '0')}`,
    `S${seasonNum}E${episodeNum}`,
    `${seasonNum}X${String(episodeNum).padStart(2, '0')}`
  ];
  const seasonPatterns = [
    `SEASON${String(seasonNum).padStart(2, '0')}`,
    `SEASON${seasonNum}`,
    `S${String(seasonNum).padStart(2, '0')}`
  ];

  return subtitles.filter(sub => {
    if (!Array.isArray(sub.releaseInfo)) return false;
    const release = sub.releaseInfo.join(' ').toUpperCase().replace(/[-._\s]/g, '');
    if (episodePatterns.some(pattern => release.includes(pattern))) return true;
    return release.includes('COMPLETE') && seasonPatterns.some(pattern => release.includes(pattern));
  });
}

async function subtitlesHandler(type, id, env, origin) {
  const { imdbId, season, episode } = parseStremioId(type, id);
  if (!imdbId || !imdbId.startsWith('tt')) return { subtitles: [] };

  try {
    const movieId = await getMovieId(type, imdbId, season, env);
    if (!movieId) return { subtitles: [] };

    const url = `${API_BASE_URL}/subtitles?movieId=${encodeURIComponent(movieId)}&language=${PERSIAN_LANG_CODE}&sort=rating&limit=100`;
    const result = await fetchJson(url, { headers: apiHeaders(env) });
    if (!result?.success || !Array.isArray(result.data) || !result.data.length) return { subtitles: [] };

    let subtitles = result.data;
    if (type === 'series') subtitles = filterSeriesSubtitles(subtitles, season, episode);

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
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
    if (readU32(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), i) === 0x06054b50) return i;
  }
  return -1;
}

async function extractFirstSrt(zipBytes) {
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

  for (let i = 0; i < entryCount; i += 1) {
    if (readU32(view, offset) !== 0x02014b50) break;
    const method = readU16(view, offset + 10);
    const compressedSize = readU32(view, offset + 20);
    const fileNameLength = readU16(view, offset + 28);
    const extraLength = readU16(view, offset + 30);
    const commentLength = readU16(view, offset + 32);
    const localHeaderOffset = readU32(view, offset + 42);
    const nameBytes = bytes.slice(offset + 46, offset + 46 + fileNameLength);
    const fileName = decoder.decode(nameBytes);
    offset += 46 + fileNameLength + extraLength + commentLength;

    if (!fileName.toLowerCase().endsWith('.srt')) continue;
    if (localHeaderOffset + 30 > bytes.length || readU32(view, localHeaderOffset) !== 0x04034b50) throw new Error('Invalid ZIP local file header');

    const localNameLength = readU16(view, localHeaderOffset + 26);
    const localExtraLength = readU16(view, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);

    if (method === 0) return compressed;
    if (method === 8) {
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    throw new Error(`Unsupported ZIP compression method: ${method}`);
  }

  throw new Error('No .srt file found in ZIP archive');
}

function parseTimestamp(timestamp) {
  const [h, m, rest] = timestamp.trim().split(':');
  const [s, ms] = rest.split(',');
  return ((Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000) + Number(ms);
}

function toTimestamp(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}

function addPromoTextToSubtitle(srtContent, promoText, durationSeconds, position) {
  if (!promoText || !srtContent) return srtContent;
  const durationMs = durationSeconds * 1000;
  const coloredPromoText = `{\\c&H00FFFF00&}${promoText}{\\c}`;
  const blocks = srtContent.split(/\n\s*\n/).filter(block => block.trim());
  if (!blocks.length) return srtContent;

  if (position === 'start') {
    const promoBlock = `1\n00:00:00,000 --> ${toTimestamp(durationMs)}\n${coloredPromoText}`;
    const renumbered = blocks.map((block, index) => {
      const lines = block.split('\n');
      lines[0] = String(index + 2);
      return lines.join('\n');
    });
    return `${promoBlock}\n\n${renumbered.join('\n\n')}`;
  }

  const last = blocks[blocks.length - 1].split('\n');
  const timingIndex = last.findIndex(line => line.includes('-->'));
  if (timingIndex >= 0) {
    const [start, end] = last[timingIndex].split('-->').map(parseTimestamp);
    const gapMs = Math.min(3000, Math.max(0, Math.floor((end - start) * 0.3)));
    const promoStart = Math.max(0, end - gapMs);
    const promoBlock = `${blocks.length + 1}\n${toTimestamp(promoStart)} --> ${toTimestamp(promoStart + durationMs)}\n${coloredPromoText}`;
    return `${blocks.join('\n\n')}\n\n${promoBlock}`;
  }
  return srtContent;
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

    const srtBytes = await extractFirstSrt(await response.arrayBuffer());
    let content;
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(srtBytes);
    } catch {
      content = new TextDecoder('windows-1256').decode(srtBytes);
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
    console.error('Download proxy error:', error.message);
    return new Response('Failed to proxy subtitle download', { status: 502 });
  }
}

function getManifest(origin) {
  return {
    ...manifest,
    behaviorHints: {
      ...(manifest.behaviorHints || {}),
      configurable: false
    },
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

  if (path === '/' || path === '/health') {
    return json({ status: 'ok', service: 'subsource-stremio-addon', runtime: 'cloudflare-workers' });
  }
  if (path === '/manifest.json') return json(getManifest(url.origin), 200, { 'cache-control': 'public, max-age=300' });
  if (path === '/logo.png') return getAsset('/logo.png', request, env);

  const downloadMatch = path.match(/^\/download\/([^/]+)$/);
  if (downloadMatch) return downloadProxy(decodeURIComponent(downloadMatch[1]), env);

  const subtitleMatch = path.match(/^\/(movie|series)\/([^/]+?)(?:\.json)?$/);
  if (subtitleMatch) {
    const type = subtitleMatch[1];
    const id = decodeURIComponent(subtitleMatch[2]);
    return json(await subtitlesHandler(type, id, env, url.origin));
  }

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
