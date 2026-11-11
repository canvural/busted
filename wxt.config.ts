import { defineConfig } from 'wxt';

// See docs/DESIGN.md for why each permission exists.
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  // Firefox defaults to MV2 in WXT; we ship MV3 everywhere.
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'Busted! — Spoiler Blocker for GTA VI',
    short_name: 'Busted!',
    // Chrome Web Store shows this as the listing's summary (132 characters max).
    description:
      'Hides GTA VI spoilers on YouTube, X and Reddit behind a click-to-reveal "BUSTED!" stamp. Uses your Cloudflare or TypeSafe account.',
    homepage_url: 'https://github.com/canvural/busted',
    permissions: ['storage'],
    host_permissions: [
      // The sites Busted! works on. Content scripts would get these anyway; listing them
      // here also makes permissions.contains() report access correctly in Chrome.
      'https://www.youtube.com/*',
      'https://x.com/*',
      'https://www.reddit.com/*',
      // Clef REST API (your own Cloudflare account).
      'https://api.cloudflare.com/*',
      // Jev API (your own TypeSafe account).
      'https://api.typesafe.ai/*',
      // Thumbnails and tweet images are downloaded and sent to Clef as bytes.
      'https://i.ytimg.com/*',
      'https://pbs.twimg.com/*',
    ],
    // Custom proxy endpoints are user-entered; access is requested when saved.
    optional_host_permissions: ['https://*/*'],
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'busted-gta6-spoilers@extension',
          // 142 is the first version (desktop and Android) that understands data_collection_permissions.
          strict_min_version: '142.0',
          // Firefox requires declaring what leaves the browser. Page text and images
          // go to the Cloudflare endpoint or TypeSafe account the user configures.
          data_collection_permissions: { required: ['websiteContent'] },
        },
      },
    }),
  }),
});
