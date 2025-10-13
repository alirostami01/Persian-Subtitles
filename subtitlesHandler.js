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
        console.log(`Searching for movie with IMDb ID: ${imdbId}`);
        const searchUrl = `${API_BASE_URL}/movies/search?searchType=imdb&imdb=${imdbId}`;
        const movieSearch = await axios.get(searchUrl, { headers: API_HEADERS, timeout: config.LONG_TIMEOUT });

        if (!movieSearch.data.success || movieSearch.data.data.length === 0) {
            console.log(`Movie not found for IMDb ID: ${imdbId}`);
            return Promise.resolve({ subtitles: [] });
        }
        const movieId = movieSearch.data.data[0].movieId;
        console.log(`Found movieId: ${movieId}`);

        console.log(`Searching for subtitles with language code: "${PERSIAN_LANG_CODE}"`);
        const subtitlesUrl = `${API_BASE_URL}/subtitles?movieId=${movieId}&language=${PERSIAN_LANG_CODE}&sort=rating`;
        const subtitlesResponse = await axios.get(subtitlesUrl, { headers: API_HEADERS, timeout: config.LONG_TIMEOUT });

        if (!subtitlesResponse.data.success || subtitlesResponse.data.data.length === 0) {
            console.log(`No Persian subtitles found for movieId: ${movieId}`);
            return Promise.resolve({ subtitles: [] });
        }

        let availableSubtitles = subtitlesResponse.data.data;

        if (type === 'series') {
            const filterPattern = `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
            availableSubtitles = availableSubtitles.filter(sub =>
                Array.isArray(sub.releaseInfo) && sub.releaseInfo.some(info => info.toUpperCase().includes(filterPattern))
            );
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