import { defineContentScript } from '#imports';
import { redditAdapter } from '../content/adapters/reddit';
import { runOnPage } from '../content/run';

export default defineContentScript({
  matches: ['https://www.reddit.com/*'],
  runAt: 'document_idle',
  main: (ctx) => runOnPage(redditAdapter, ctx),
});
