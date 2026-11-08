/**
 * The "BUSTED!" spoiler overlay (variant B of the overlay prototype, see docs/DESIGN.md).
 *
 * Mounted as a `<busted-overlay>` element with a closed shadow root, so site CSS can't
 * restyle it and site scripts can't read it. Blur comes from `backdrop-filter`, so the
 * site's own elements are never touched (except getting `position: relative` when
 * they're unpositioned).
 */

const CSS = `
  :host { all: initial; position: absolute; inset: 0; z-index: 1000; pointer-events: none; border-radius: inherit; display: block; }
  .surface {
    all: unset; box-sizing: border-box; position: absolute; inset: 0; pointer-events: auto; cursor: pointer;
    border-radius: inherit; overflow: hidden; container-type: size;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-backdrop-filter: blur(36px) saturate(1.3); backdrop-filter: blur(36px) saturate(1.3);
    display: grid; place-items: center; align-content: center; gap: 10px; padding: 12px;
    background: radial-gradient(ellipse at center, rgba(0,0,0,.25), rgba(0,0,0,.7)); color: #fff;
    transition: opacity 150ms ease;
  }
  :host([data-theme="light"]) .surface { background: radial-gradient(ellipse at center, rgba(255,255,255,.15), rgba(0,0,0,.45)); }
  .surface:focus-visible { outline: 3px solid #4c9ffe; outline-offset: -3px; }
  .surface.leaving, .surface.entering { opacity: 0; }
  .stamp {
    font: italic 900 clamp(22px, 14cqmin, 56px)/1 Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif;
    letter-spacing: .03em; color: #ff2d2d; padding: .12em .35em; border: .08em solid currentColor; border-radius: .12em;
    transform: rotate(-8deg); text-shadow: 0 2px 0 rgba(0,0,0,.5); background: rgba(0,0,0,.35);
    /* the -8deg tilt drops the stamp's corner ~0.4em below its box; reserve that plus breathing room */
    margin-bottom: .55em;
    animation: stamp 220ms cubic-bezier(.2,1.6,.4,1) both;
  }
  .tag {
    font-weight: 700; font-size: 13px; line-height: 1.4; text-align: center; text-wrap: balance; max-width: 100%;
    padding: 3px 10px; border-radius: 999px; background: rgba(0,0,0,.5);
  }
  .tag span { opacity: .75; font-weight: 500; }
  @keyframes stamp { from { transform: rotate(-8deg) scale(1.6); opacity: 0; } to { transform: rotate(-8deg) scale(1); opacity: 1; } }
  @container (max-height: 72px) { .tag { display: none; } }
  @container (max-height: 48px) { .stamp { font-size: 15px; margin: 0; border-width: 2px; transform: rotate(-3deg); animation: none; } }
  /* one line of post text */
  @container (max-height: 32px) { .surface { padding: 0 12px; } .stamp { font-size: 12px; padding: 0 .3em; border-width: 1.5px; transform: rotate(-2deg); } }
  .hide-again {
    /* top-right, or vertically centered when the overlay is a strip too short for 6px + 28px */
    all: unset; position: absolute; top: min(6px, calc(50% - 14px)); right: 6px; pointer-events: auto; cursor: pointer;
    display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%;
    background: rgba(0,0,0,.65); color: #fff; opacity: .55; transition: opacity 120ms;
  }
  .hide-again:hover, .hide-again:focus-visible { opacity: 1; outline: 2px solid #4c9ffe; }
  @media (prefers-reduced-motion: reduce) { .surface, .stamp { transition: none !important; animation: none !important; } }
`;

const SVG_NS = 'http://www.w3.org/2000/svg';
const EYE_OFF_PATHS = [
  'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94',
  'M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19',
  'M1 1l22 22',
];

/** "Eye with a slash" icon, built with DOM calls (stores flag innerHTML in review). */
function eyeOffIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const attrs: Record<string, string> = {
    viewBox: '0 0 24 24', width: '16', height: '16', fill: 'none', stroke: 'currentColor',
    'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
  };
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
  for (const d of EYE_OFF_PATHS) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

/** Events stopped at the overlay so the site doesn't open the video/post or start a hover preview. */
const SWALLOWED_EVENTS = ['click', 'auxclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'mouseover', 'pointerover'];

export const OVERLAY_TAG = 'busted-overlay';

export interface OverlayOptions {
  topicName: string;
  /** "video", "short", "post · 2 images", … */
  kind: string;
  dark: boolean;
  revealed: boolean;
  /** See `ExtractedItem.overlayRows`. */
  rows?: () => readonly Element[];
  onReveal: () => void;
  onHide: () => void;
}

export interface OverlayController {
  setRevealed(revealed: boolean): void;
  remove(): void;
}

function swallow(el: HTMLElement): void {
  for (const type of SWALLOWED_EVENTS) {
    el.addEventListener(type, (event) => {
      event.stopPropagation();
      if (type === 'click' || type === 'auxclick') event.preventDefault();
    });
  }
}

/** Some site elements are `display: contents` and have no box; cover their first child instead. */
export function layoutBox(target: HTMLElement): HTMLElement {
  if (getComputedStyle(target).display !== 'contents') return target;
  const child = [...target.children].find((c) => getComputedStyle(c).display !== 'contents');
  return (child as HTMLElement | undefined) ?? target;
}

/** Where `rows` sit inside `box`, in px from the top of its padding box. Null when there are none. */
export function rowsArea(box: HTMLElement, rows: readonly Element[]): { top: number; height: number } | null {
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last) return null;
  const origin = box.getBoundingClientRect().top + box.clientTop;
  const top = first.getBoundingClientRect().top - origin;
  return { top, height: Math.max(0, last.getBoundingClientRect().bottom - origin - top) };
}

// Inline !important beats site rules that might target the host.
const HOST_CSS =
  'all: initial !important; position: absolute !important; z-index: 1000 !important; display: block !important; pointer-events: none !important;';

export function mountOverlay(target: HTMLElement, options: OverlayOptions): OverlayController {
  const box = layoutBox(target);
  const position = getComputedStyle(box).position;
  const restorePosition = position === 'static' || position === '' ? box.style.position : null;
  if (restorePosition !== null) box.style.position = 'relative';

  const host = document.createElement(OVERLAY_TAG);
  host.dataset.theme = options.dark ? 'dark' : 'light';
  const place = () => {
    const area = options.rows ? rowsArea(box, options.rows()) : null;
    host.style.cssText =
      HOST_CSS +
      (area
        ? `left: 0 !important; right: 0 !important; top: ${area.top}px !important; height: ${area.height}px !important; border-radius: ${Math.min(12, area.height / 4)}px !important;`
        : 'inset: 0 !important;');
  };
  place();
  // The covered rows move when the site re-renders or images load; the box resizes with them.
  const resize = options.rows && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
  resize?.observe(box);
  const root = host.attachShadow({ mode: 'closed' });
  box.appendChild(host);

  let revealed = options.revealed;

  const paint = (animate: boolean) => {
    root.replaceChildren();
    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);

    if (!revealed) {
      const surface = document.createElement('button');
      surface.type = 'button';
      surface.className = 'surface' + (animate ? ' entering' : '');
      surface.setAttribute('aria-label', `Possible ${options.topicName} spoiler hidden (${options.kind}). Press to reveal.`);
      const stamp = document.createElement('span');
      stamp.className = 'stamp';
      stamp.textContent = 'BUSTED!';
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.append(`${options.topicName} spoiler `);
      const detail = document.createElement('span');
      detail.textContent = `· ${options.kind} · press to reveal`;
      tag.append(detail);
      surface.append(stamp, tag);
      swallow(surface);
      surface.addEventListener('click', () => {
        surface.classList.add('leaving');
        setTimeout(options.onReveal, 150);
      });
      root.appendChild(surface);
      if (animate) requestAnimationFrame(() => requestAnimationFrame(() => surface.classList.remove('entering')));
    } else {
      const hide = document.createElement('button');
      hide.type = 'button';
      hide.className = 'hide-again';
      hide.title = 'Hide again';
      hide.setAttribute('aria-label', 'Hide spoiler again');
      hide.appendChild(eyeOffIcon());
      swallow(hide);
      hide.addEventListener('click', options.onHide);
      root.appendChild(hide);
    }
  };
  paint(false);

  return {
    setRevealed(next) {
      if (next === revealed) return;
      revealed = next;
      paint(!next);
    },
    remove() {
      resize?.disconnect();
      host.remove();
      if (restorePosition !== null) box.style.position = restorePosition;
    },
  };
}
