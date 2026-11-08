import { defineContentScript } from '#imports';
import { xAdapter } from '../content/adapters/x';
import { runOnPage } from '../content/run';

export default defineContentScript({
  matches: ['https://x.com/*'],
  runAt: 'document_idle',
  main: (ctx) => runOnPage(xAdapter, ctx),
});
