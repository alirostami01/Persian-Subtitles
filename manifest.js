// manifest.js

const manifest = {
    // Ensure the 'id' is a string
    "id": "community.subsource.persian",
    "version": "1.0.0",
    "name": "Persian Subtitles (SubSource)",
    "author": "Ali Rostami",
    "description": "Provides Persian subtitles from the SubSource API.",

    // Use the simplest structure that we know works
    "resources": ["subtitles"],

    "types": ["movie", "series"],
    "idPrefixes": ["tt"],
    "catalogs": []
};

module.exports = manifest;