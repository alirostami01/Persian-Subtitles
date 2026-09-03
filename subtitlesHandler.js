const config = require('./config');
const { apiRequest } = require('./apiClient');

const API_BASE_URL = 'https://api.subsource.net/api/v1';
const PERSIAN_LANG_CODE = 'farsi_persian';
const PAGE_SIZE = 100;
const MAX_PAGES = 20;

function normalizeReleaseInfo(releaseInfo) {
    if (!Array.isArray(releaseInfo)) return '';
    return releaseInfo.join(' ').toUpperCase().trim();
}

function compactReleaseInfo(releaseInfo) {
    return normalizeReleaseInfo(releaseInfo).replace(/[-._\s]+/g, '');
}

function hasToken(text, token) {
    return new RegExp(`(^|[^A-Z0-9])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Z0-9]|$)`, 'i').test(text);
}

function matchesEpisode(releaseInfo, season, episode) {
    const seasonNum = Number.parseInt(season, 10);
    const episodeNum = Number.parseInt(episode, 10);
    if (!Number.isInteger(seasonNum) || !Number.isInteger(episodeNum)) return false;

    const raw = normalizeReleaseInfo(releaseInfo);
    const compact = compactReleaseInfo(releaseInfo);
    const s = String(seasonNum);
    const ss = String(seasonNum).padStart(2, '0');
    const e = String(episodeNum);
    const ee = String(episodeNum).padStart(2, '0');

    const explicitEpisodePatterns = [
        `S${ss}E${ee}`, `S${s}E${e}`, `S${ss}E${e}`, `S${s}E${ee}`,
        `${s}X${ee}`, `${s}X${e}`, `${ss}X${ee}`, `${ss}X${e}`
    ];
    if (explicitEpisodePatterns.some(pattern => compact.includes(pattern))) return true;

    const spacedPatterns = [
        new RegExp(`\\bS\\s*0*${seasonNum}\\s*[-_. ]?\\s*E\\s*0*${episodeNum}\\b`, 'i'),
        new RegExp(`\\b0*${seasonNum}\\s*[xX]\\s*0*${episodeNum}\\b`, 'i'),
        new RegExp(`\\bSEASON\\s*0*${seasonNum}\\s*(?:EP(?:ISODE)?|E)\\s*0*${episodeNum}\\b`, 'i'),
        new RegExp(`\\b0*${seasonNum}\\s*[-_. ]\\s*0*${episodeNum}\\b`, 'i')
    ];
    if (spacedPatterns.some(pattern => pattern.test(raw))) return true;

    // SubSource often stores episode-only releases as "01", "02", etc.
    // Because subtitles were fetched for the season-specific movieId, a standalone
    // episode number is safe to match here and fixes releases without an "E" prefix.
    const standaloneEpisode = new RegExp(`(?:^|[^0-9])0*${episodeNum}(?:[^0-9]|$)`);
    if (standaloneEpisode.test(raw)) {
        const hasOtherEpisodeMarker = /\b(?:E|EP|EPISODE)\s*0*\d+\b/i.test(raw);
        if (!hasOtherEpisodeMarker) return true;
    }

    return false;
}

function isSeasonPack(releaseInfo, season) {
    const seasonNum = Number.parseInt(season, 10);
    if (!Number.isInteger(seasonNum)) return false;
    const raw = normalizeReleaseInfo(releaseInfo);
    const compact = compactReleaseInfo(releaseInfo);
    const seasonPattern = new RegExp(`(?:^|[^A-Z0-9])S(?:EASON)?0*${seasonNum}(?:[^A-Z0-9]|$)`, 'i');
    return /\b(?:COMPLETE|FULL|PACK|SEASON\s*PACK)\b/i.test(raw) &&
        (seasonPattern.test(raw) || compact.includes(`SEASON${seasonNum}`) || compact.includes(`S${String(seasonNum).padStart(2, '0')}`));
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
        const response = await apiRequest({ url, headers });
        const data = response?.data?.data;
        if (!response?.data?.success || !Array.isArray(data) || data.length === 0) break;

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

function selectBestMovieId(results, season) {
    if (!Array.isArray(results) || !results.length) return null;
    const seasonNum = Number.parseInt(season, 10);
    const seasonText = Number.isInteger(seasonNum) ? String(seasonNum) : '';

    const scored = results.map(item => {
        let score = 0;
        const text = JSON.stringify(item).toLowerCase();
        if (seasonText && new RegExp(`season\\s*0*${seasonNum}\\b`).test(text)) score += 10;
        if (seasonText && new RegExp(`\\bs${String(seasonNum).padStart(2, '0')}\\b`).test(text)) score += 8;
        if (item?.movieId != null) score += 1;
        return { item, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.item?.movieId ?? null;
}

async function subtitlesHandler(args) {
    console.log('Request for subtitles received for:', args.id);
    const { type, id } = args;
    let imdbId, season, episode;

    if (!process.env.API_KEY) {
        console.error('API Key is missing from .env file.');
        return { subtitles: [] };
    }

    const API_HEADERS = { 'X-API-Key': process.env.API_KEY };

    if (type === 'series') {
        [imdbId, season, episode] = id.split(':');
    } else {
        imdbId = id;
    }

    try {
        let movieId = null;

        if (type === 'series') {
            try {
                const metaRes = await apiRequest({
                    url: `https://v3-cinemeta.strem.io/meta/series/${encodeURIComponent(imdbId)}.json`
                });
                const mediaName = metaRes?.data?.meta?.name;

                if (mediaName) {
                    const searchUrl = `${API_BASE_URL}/movies/search?searchType=text&q=${encodeURIComponent(mediaName)}&season=${encodeURIComponent(season)}`;
                    const movieSearch = await apiRequest({ url: searchUrl, headers: API_HEADERS });
                    if (movieSearch?.data?.success && Array.isArray(movieSearch.data.data)) {
                        movieId = selectBestMovieId(movieSearch.data.data, season);
                        console.log(`Primary search selected movieId: ${movieId}`);
                    }
                }
            } catch (error) {
                console.warn('Series name search failed, using IMDb fallback:', error.message);
            }
        }

        if (!movieId) {
            const searchUrl = `${API_BASE_URL}/movies/search?searchType=imdb&imdb=${encodeURIComponent(imdbId)}`;
            const movieSearch = await apiRequest({ url: searchUrl, headers: API_HEADERS });
            if (movieSearch?.data?.success && Array.isArray(movieSearch.data.data)) {
                movieId = selectBestMovieId(movieSearch.data.data, season);
            }
        }

        if (!movieId) {
            console.log('Unable to find a SubSource movieId.');
            return { subtitles: [] };
        }

        const allSubtitles = await fetchAllSubtitles(movieId, API_HEADERS);
        if (!allSubtitles.length) {
            console.log(`No Persian subtitles found for movieId: ${movieId}`);
            return { subtitles: [] };
        }

        let availableSubtitles = allSubtitles;
        if (type === 'series') {
            availableSubtitles = allSubtitles.filter(sub =>
                matchesEpisode(sub.releaseInfo, season, episode) || isSeasonPack(sub.releaseInfo, season)
            );
            console.log(`Episode filter ${season}x${episode}: ${availableSubtitles.length}/${allSubtitles.length} matched.`);
        }

        availableSubtitles = dedupeSubtitles(availableSubtitles);

        const finalSubtitles = availableSubtitles.map(sub => ({
            id: String(sub.subtitleId),
            url: `http://${config.SERVER_IP}:${config.PORT}/download/${encodeURIComponent(sub.subtitleId)}`,
            lang: 'fas',
            title: Array.isArray(sub.releaseInfo) ? sub.releaseInfo.join(' ') : 'Persian Subtitle'
        }));

        console.log(`Successfully prepared ${finalSubtitles.length} subtitles.`);
        return { subtitles: finalSubtitles };
    } catch (error) {
        console.error('Error in subtitlesHandler:', error.message);
        return { subtitles: [] };
    }
}

module.exports = subtitlesHandler;
