const { publishToCentral } = require('stremio-addon-sdk');

const MANIFEST_URL = 'https://stremio.alirostami.com/subtitles/manifest.json';

async function verifyManifest() {
  const response = await fetch(MANIFEST_URL, {
    headers: { accept: 'application/json' },
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error(`Manifest check failed: HTTP ${response.status}`);
  }

  const manifest = await response.json();
  if (manifest.id !== 'org.alirostami.subtitles.persian') {
    throw new Error(`Unexpected manifest id: ${manifest.id}`);
  }

  console.log(`Manifest verified: ${MANIFEST_URL}`);
  console.log(`Addon: ${manifest.name} ${manifest.version}`);
}

async function main() {
  await verifyManifest();

  const result = await publishToCentral(MANIFEST_URL);
  console.log('Stremio Central Catalog publication result:', result);
}

main().catch(error => {
  console.error('Failed to publish addon to Stremio Central Catalog.');
  console.error(error?.message || error);
  process.exitCode = 1;
});
