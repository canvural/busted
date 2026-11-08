import { defineContentScript } from '#imports';
import { youtubeAdapter } from '../content/adapters/youtube';
import { runOnPage } from '../content/run';

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  runAt: 'document_idle',
  main: (ctx) => runOnPage(youtubeAdapter, ctx),
});
