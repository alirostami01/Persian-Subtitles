const axios = require('axios');
const config = require('./config');

function createSlug(name, year, withYear = true) {
    if (!name) return '';
    const cleanName = name.toLowerCase().replace(/\s*\(\d{4}\).*/, '').replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
    if (!withYear) return cleanName;
    const cleanYear = year ? year.substring(0, 4) : '';
    return cleanYear ? `${cleanName}-${cleanYear}` : cleanName;
}

async function subtitlesHandler(args) {
    console.log("Request for subtitles received for:", args.id);
    const { type, id } = args;
    let imdbId, season, episode;
    if (type === 'series') { [imdbId, season, episode] = id.split(':'); } else { imdbId = id; }

    let mediaName, mediaYear;
    try {
        const metaRes = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`, { timeout: config.SHORT_TIMEOUT });
        mediaName = metaRes.data.meta.name;
        mediaYear = metaRes.data.meta.year || (metaRes.data.meta.releaseInfo ? metaRes.data.meta.releaseInfo.substring(0, 4) : '');
    } catch (e) {
        console.error("Cinemeta Error:", e.message);
        return { subtitles: [] };
    }

    if (!mediaName) return { subtitles: [] };

    let searchResponse;
    try {
        const slugWithYear = createSlug(mediaName, mediaYear, true);
        let searchApiUrl = type === 'series'
            ? `https://api.subsource.net/v1/subtitles/${slugWithYear}/season-${season}?language=farsi_persian&sort_by=rating&sort_order=desc`
            : `https://api.subsource.net/v1/subtitles/${slugWithYear}?language=farsi_persian&sort_by=rating&sort_order=desc`;

        console.log(`Attempt 1: Searching with URL: ${searchApiUrl}`);
        searchResponse = await axios.get(searchApiUrl, { timeout: config.LONG_TIMEOUT });
    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.log('Slug with year not found. Trying without year...');
            const slugWithoutYear = createSlug(mediaName, mediaYear, false);
            let searchApiUrl = type === 'series'
                ? `https://api.subsource.net/v1/subtitles/${slugWithoutYear}/season-${season}?language=farsi_persian&sort_by=rating&sort_order=desc`
                : `https://api.subsource.net/v1/subtitles/${slugWithoutYear}?language=farsi_persian&sort_by=rating&sort_order=desc`;

            try {
                console.log(`Attempt 2 (Fallback): Searching with URL: ${searchApiUrl}`);
                searchResponse = await axios.get(searchApiUrl, { timeout: config.LONG_TIMEOUT });
            } catch (fallbackError) {
                console.error("Fallback search also failed:", fallbackError.message);
                return { subtitles: [] };
            }
        } else {
            console.error("An unexpected error occurred on first attempt:", error.message);
            return { subtitles: [] };
        }
    }

    console.log("Successfully received search response. Now processing...");
    try {
        let initialSubtitles = searchResponse.data.subtitles;
        if (!initialSubtitles || initialSubtitles.length === 0) return { subtitles: [] };

        if (type === 'series') {
            const filterPattern = `S${season.padStart(2, '0')}E${episode.padStart(2, '0')}`;
            initialSubtitles = initialSubtitles.filter(sub => {
                if (!sub.release_info) return false;
                if (Array.isArray(sub.release_info)) { return sub.release_info.some(info => info.toUpperCase().includes(filterPattern)); }
                else if (typeof sub.release_info === 'string') { return sub.release_info.toUpperCase().includes(filterPattern); }
                return false;
            });
            if (initialSubtitles.length === 0) return { subtitles: [] };
        }

        const tokenPromises = initialSubtitles.map(sub => {
            const metadataUrl = `https://api.subsource.net/v1/subtitle/${sub.link}`;
            return axios.get(metadataUrl, { timeout: config.SHORT_TIMEOUT })
                .then(res => ({ ...sub, token: res.data.subtitle.download_token, full_release_info: res.data.subtitle.release_info }))
                .catch(err => null);
        });

        const subtitlesWithTokens = (await Promise.all(tokenPromises)).filter(Boolean);
        const finalSubtitles = subtitlesWithTokens.map(sub => {
            const downloadUrl = `http://${config.SERVER_IP}:${config.PORT}/download/${sub.token}`;
            const releaseInfo = Array.isArray(sub.full_release_info) ? sub.full_release_info[0] : sub.full_release_info;
            const title = releaseInfo || sub.commentary;
            return { id: sub.id.toString(), url: downloadUrl, lang: 'fas', title: title };
        });

        console.log(`Successfully prepared ${finalSubtitles.length} subtitles for ${type} ${id}.`);
        return { subtitles: finalSubtitles };
    } catch (processingError) {
        console.error("Error processing subtitles:", processingError.message);
        return { subtitles: [] };
    }
}

module.exports = subtitlesHandler;