const axios = require('axios');
const config = require('./config');

const API_BASE_URL = 'https://api.subsource.net/api/v1';
const PERSIAN_LANG_CODE = 'farsi_persian';

async function subtitlesHandler(args) {
    console.log("Request for subtitles received for:", args.id);
    const { type, id } = args;
    let imdbId, season, episode;

    if (!process.env.API_KEY) {
        console.error("API Key is missing from .env file.");
        return Promise.resolve({ subtitles: [] });
    }

    const API_HEADERS = { 'X-API-Key': process.env.API_KEY };

    if (type === 'series') {
        [imdbId, season, episode] = id.split(':');
    } else {
        imdbId = id;
    }

    try {
        let movieId = null;

        // ✅ استراتژی ترکیبی: ابتدا روش دقیق‌تر برای سریال‌ها، سپس روش عمومی
        if (type === 'series') {
            let mediaName;
            try {
                const metaRes = await axios.get(`https://v3-cinemeta.strem.io/meta/series/${imdbId}.json`);
                mediaName = metaRes.data.meta.name;

                console.log(`Attempt 1 (Primary): Searching with Series Name "${mediaName}" and Season "${season}"`);
                const searchUrl = `${API_BASE_URL}/movies/search?searchType=text&q=${encodeURIComponent(mediaName)}&season=${season}`;
                const movieSearch = await axios.get(searchUrl, { headers: API_HEADERS });

                if (movieSearch.data.success && movieSearch.data.data.length > 0) {
                    movieId = movieSearch.data.data[0].movieId;
                    console.log(`Success from Attempt 1. Found correct movieId: ${movieId}`);
                } else {
                    console.log("Attempt 1 failed. Falling back to Attempt 2.");
                }
            } catch (e) {
                console.error("Cinemeta fetch failed, falling back to Attempt 2. Error:", e.message);
            }
        }

        // اگر روش اول movieId را پیدا نکرد یا برای فیلم بود، از روش دوم (جستجو با IMDb ID) استفاده کن
        if (!movieId) {
            console.log("Attempt 2 (Fallback): Searching with IMDb ID directly.");
            const searchUrl = `${API_BASE_URL}/movies/search?searchType=imdb&imdb=${imdbId}`;
            const movieSearch = await axios.get(searchUrl, { headers: API_HEADERS });

            if (movieSearch.data.success && movieSearch.data.data.length > 0) {
                movieId = movieSearch.data.data[0].movieId;
                console.log(`Success from Attempt 2. Found movieId: ${movieId}`);
            }
        }

        if (!movieId) {
            console.log("Both attempts failed to find a movieId.");
            return Promise.resolve({ subtitles: [] });
        }

        // حالا که movieId را داریم، زیرنویس‌ها را می‌گیریم
        const subtitlesUrl = `${API_BASE_URL}/subtitles?movieId=${movieId}&language=${PERSIAN_LANG_CODE}&sort=rating&limit=100`;
        const subtitlesResponse = await axios.get(subtitlesUrl, { headers: API_HEADERS });

        if (!subtitlesResponse.data.success || subtitlesResponse.data.data.length === 0) {
            console.log(`No Persian subtitles found for movieId: ${movieId}`);
            return Promise.resolve({ subtitles: [] });
        }

        let availableSubtitles = subtitlesResponse.data.data;

        // ✅ استفاده از فیلتر هوشمند و قدرتمند شما برای سریال‌ها
        if (type === 'series') {
            const seasonNum = parseInt(season, 10);
            const episodeNum = parseInt(episode, 10);
            const episodePatterns = [
                `S${String(seasonNum).padStart(2, '0')}E${String(episodeNum).padStart(2, '0')}`,
                `S${seasonNum}E${episodeNum}`,
                `${seasonNum}x${String(episodeNum).padStart(2, '0')}`
            ];
            const seasonPatterns = [
                `SEASON${String(seasonNum).padStart(2, '0')}`,
                `SEASON${seasonNum}`,
                `S${String(seasonNum).padStart(2, '0')}`
            ];
            console.log(`Applying detailed filter for patterns: [${episodePatterns.join(', ')}] or season packs.`);
            availableSubtitles = availableSubtitles.filter(sub => {
                if (!Array.isArray(sub.releaseInfo)) return false;
                const releaseString = sub.releaseInfo.join(' ').toUpperCase().replace(/[-._\s]/g, '');
                if (episodePatterns.some(p => releaseString.includes(p))) {
                    return true;
                }
                if (releaseString.includes('COMPLETE') && seasonPatterns.some(p => releaseString.includes(p))) {
                    return true;
                }
                return false;
            });
        }

        const finalSubtitles = availableSubtitles.map(sub => ({
            id: sub.subtitleId.toString(),
            url: `http://${config.SERVER_IP}:${config.PORT}/download/${sub.subtitleId}`,
            lang: 'fas',
            title: Array.isArray(sub.releaseInfo) ? sub.releaseInfo.join(' ') : 'Subtitle'
        }));

        console.log(`Successfully prepared ${finalSubtitles.length} subtitles.`);
        return Promise.resolve({ subtitles: finalSubtitles });

    } catch (error) {
        console.error("Error in subtitlesHandler:", error.message);
        return Promise.resolve({ subtitles: [] });
    }
}

module.exports = subtitlesHandler;