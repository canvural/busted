import type { ClefErrorKind } from './clef';
import type { Settings } from './settings';

/** Plain-English explanation for the toolbar badge tooltip and the popup. */
export function describeError(kind: ClefErrorKind, mode: Settings['authMode'] = 'cloudflare'): string {
  const jev = mode === 'jev';
  const model = jev ? 'Jev' : 'Clef';
  const service = jev ? 'TypeSafe' : 'Cloudflare';
  switch (kind) {
    case 'auth':
      return jev
        ? 'TypeSafe API key missing or rejected. Open settings to fix it.'
        : 'Cloudflare account ID or API token missing or rejected. Open settings to fix it.';
    case 'quota':
      return "Today's free Clef quota is used up. It resets at 00:00 UTC.";
    case 'rate-limited':
      return `Too many requests to ${model}. Retrying shortly.`;
    case 'network':
      return `Can't reach ${service}. Check your connection.`;
    case 'server':
      return `${service} had an error. Retrying shortly.`;
    case 'bad-request':
    case 'bad-response':
      return `${model} returned something unexpected. If this keeps happening, please file an issue.`;
  }
}
