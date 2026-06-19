const config = require('./config');
const axios = require('axios');

const API_BASE_URL = 'https://api.subsource.net/api/v1';
const PERSIAN_LANG_CODE = 'farsi_persian';

/**
 * Fetches Persian subtitles for movies or TV series from SubSource API.
 * Implements a hybrid search strategy for better accuracy with TV series.
 */
async function subtitlesHandler(args) {
    console.log("Request for subtitles received for:", args.id);

    const { type, id } = args;
    let imdbId, season, episode;

    if (!process.env.API_KEY) {
        console.error("API Key is missing from .env file.");
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

        // First attempt: smarter search for series
        if (type === 'series') {
            try {
                const metaRes = await axios.get(
                    `https://v3-cinemeta.strem.io/meta/series/${imdbId}.json`
                );

                const mediaName = metaRes.data.meta.name;

                console.log(`Searching: ${mediaName}, Season ${season}`);

                const searchUrl = `${API_BASE_URL}/movies/search?searchType=text&q=${encodeURIComponent(mediaName)}&season=${season}`;
                const movieSearch = await axios.get(searchUrl, { headers: API_HEADERS });

                if (movieSearch.data.success && movieSearch.data.data.length > 0) {
                    movieId = movieSearch.data.data[0].movieId;
                }
            } catch (e) {
                console.error("Cinemeta failed:", e.message);
            }
        }

        // Fallback: IMDb search
        if (!movieId) {
            const searchUrl = `${API_BASE_URL}/movies/search?searchType=imdb&imdb=${imdbId}`;
            const movieSearch = await axios.get(searchUrl, { headers: API_HEADERS });

            if (movieSearch.data.success && movieSearch.data.data.length > 0) {
                movieId = movieSearch.data.data[0].movieId;
            }
        }

        if (!movieId) {
            return { subtitles: [] };
        }

        const subtitlesUrl = `${API_BASE_URL}/subtitles?movieId=${movieId}&language=${PERSIAN_LANG_CODE}&sort=rating&limit=100`;

        const subtitlesResponse = await axios.get(subtitlesUrl, { headers: API_HEADERS });

        if (!subtitlesResponse.data.success || subtitlesResponse.data.data.length === 0) {
            return { subtitles: [] };
        }

        let availableSubtitles = subtitlesResponse.data.data;

        // Episode filtering for series
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

            availableSubtitles = availableSubtitles.filter(sub => {
                if (!Array.isArray(sub.releaseInfo)) return false;

                const releaseString = sub.releaseInfo
                    .join(' ')
                    .toUpperCase()
                    .replace(/[-._\s]/g, '');

                return (
                    episodePatterns.some(p => releaseString.includes(p)) ||
                    (releaseString.includes('COMPLETE') &&
                        seasonPatterns.some(p => releaseString.includes(p)))
                );
            });
        }

        const finalSubtitles = availableSubtitles.map(sub => ({
            id: sub.subtitleId.toString(),
            url: `http://${config.SERVER_IP}:${config.PORT}/download/${sub.subtitleId}`,
            lang: 'fas',
            title: Array.isArray(sub.releaseInfo)
                ? sub.releaseInfo.join(' ')
                : 'Subtitle'
        }));

        return { subtitles: finalSubtitles };

    } catch (error) {
        console.error("Error:", error.message);
        return { subtitles: [] };
    }
}

module.exports = subtitlesHandler;
