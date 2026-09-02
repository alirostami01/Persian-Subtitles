const config = require('./config');
const { apiRequest } = require('./apiClient');

const API_BASE_URL = 'https://api.subsource.net/api/v1';
const PERSIAN_LANG_CODE = 'farsi_persian';

/**
 * Fetches Persian subtitles for movies or TV series from SubSource API.
 * Implements a hybrid search strategy for better accuracy with TV series.
 * 
 * @param {Object} args - The request arguments containing type and id
 * @param {string} args.type - Type of content ('movie' or 'series')
 * @param {string} args.id - IMDB ID (for movies) or IMDB:season:episode (for series)
 * @returns {Promise<Object>} - Promise resolving to an object with subtitles array
 */
async function subtitlesHandler(args) {
    console.log("Request for subtitles received for:", args.id);
    const { type, id } = args;
    let imdbId, season, episode;

    // Validate API key configuration
    if (!process.env.API_KEY) {
        console.error("API Key is missing from .env file.");
        return Promise.resolve({ subtitles: [] });
    }

    const API_HEADERS = { 'X-API-Key': process.env.API_KEY };

    // Parse ID based on content type
    if (type === 'series') {
        [imdbId, season, episode] = id.split(':');
    } else {
        imdbId = id;
    }

    try {
        let movieId = null;

        // Hybrid Strategy: First try precise method for series, then fallback to general method
        if (type === 'series') {
            let mediaName;
            try {
                // Fetch series metadata from Stremio's Cinemeta service
                const metaRes = await apiRequest({
                    url: `https://v3-cinemeta.strem.io/meta/series/${imdbId}.json`
                });
                mediaName = metaRes.data.meta.name;

                console.log(`Attempt 1 (Primary): Searching with Series Name "${mediaName}" and Season "${season}"`);
                
                // Search using series name and season number for better accuracy
                const searchUrl = `${API_BASE_URL}/movies/search?searchType=text&q=${encodeURIComponent(mediaName)}&season=${season}`;
                const movieSearch = await apiRequest({
                    url: searchUrl,
                    headers: API_HEADERS
                });

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

        // Fallback: If first method didn't find movieId or for movies, search directly by IMDb ID
        if (!movieId) {
            console.log("Attempt 2 (Fallback): Searching with IMDb ID directly.");
            const searchUrl = `${API_BASE_URL}/movies/search?searchType=imdb&imdb=${imdbId}`;
            const movieSearch = await apiRequest({
                url: searchUrl,
                headers: API_HEADERS
            });

            if (movieSearch.data.success && movieSearch.data.data.length > 0) {
                movieId = movieSearch.data.data[0].movieId;
                console.log(`Success from Attempt 2. Found movieId: ${movieId}`);
            }
        }

        if (!movieId) {
            console.log("Both attempts failed to find a movieId.");
            return Promise.resolve({ subtitles: [] });
        }

        // Fetch Persian subtitles for the identified movie/series
        const subtitlesUrl = `${API_BASE_URL}/subtitles?movieId=${movieId}&language=${PERSIAN_LANG_CODE}&sort=rating&limit=100`;
        const subtitlesResponse = await apiRequest({
            url: subtitlesUrl,
            headers: API_HEADERS
        });

        if (!subtitlesResponse.data.success || subtitlesResponse.data.data.length === 0) {
            console.log(`No Persian subtitles found for movieId: ${movieId}`);
            return Promise.resolve({ subtitles: [] });
        }

        let availableSubtitles = subtitlesResponse.data.data;

        // Apply smart filtering for TV series to match specific episodes or season packs
        if (type === 'series') {
            const seasonNum = parseInt(season, 10);
            const episodeNum = parseInt(episode, 10);
            
            // Episode matching patterns (e.g., S01E05, S1E5, 1x05)
            const episodePatterns = [
                `S${String(seasonNum).padStart(2, '0')}E${String(episodeNum).padStart(2, '0')}`,
                `S${seasonNum}E${episodeNum}`,
                `${seasonNum}x${String(episodeNum).padStart(2, '0')}`
            ];
            
            // Season pack matching patterns (e.g., SEASON01, SEASON1, S01)
            const seasonPatterns = [
                `SEASON${String(seasonNum).padStart(2, '0')}`,
                `SEASON${seasonNum}`,
                `S${String(seasonNum).padStart(2, '0')}`
            ];
            
            console.log(`Applying detailed filter for patterns: [${episodePatterns.join(', ')}] or season packs.`);
            
            // Filter subtitles based on release info patterns
            availableSubtitles = availableSubtitles.filter(sub => {
                if (!Array.isArray(sub.releaseInfo)) return false;
                const releaseString = sub.releaseInfo.join(' ').toUpperCase().replace(/[-._\s]/g, '');
                
                // Match specific episode patterns
                if (episodePatterns.some(p => releaseString.includes(p))) {
                    return true;
                }
                
                // Match complete season packs
                if (releaseString.includes('COMPLETE') && seasonPatterns.some(p => releaseString.includes(p))) {
                    return true;
                }
                
                return false;
            });
        }

        // Format subtitles for Stremio response
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
