// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountOverlay, OVERLAY_TAG } from './overlay';
import { hideButtonOf, openShadowRoots, surfaceOf } from './test-helpers';

beforeEach(() => {
  openShadowRoots();
  vi.useFakeTimers();
  document.body.innerHTML = '<a id="tile" href="#watch"><span>spoilery title</span></a>';
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const tile = () => document.getElementById('tile') as HTMLElement;

function mount(overrides: Partial<Parameters<typeof mountOverlay>[1]> = {}) {
  const onReveal = vi.fn();
  const onHide = vi.fn();
  const controller = mountOverlay(tile(), {
    topicName: 'GTA VI',
    kind: 'video',
    dark: true,
    revealed: false,
    onReveal,
    onHide,
    ...overrides,
  });
  return { controller, onReveal, onHide };
}

describe('mountOverlay', () => {
  it('covers the target with an accessible "BUSTED!" button', () => {
    mount();
    const surface = surfaceOf(tile())!;
    expect(surface.tagName).toBe('BUTTON');
    expect(surface.getAttribute('aria-label')).toBe('Possible GTA VI spoiler hidden (video). Press to reveal.');
    expect(surface.textContent).toContain('BUSTED!');
    expect(tile().querySelector(OVERLAY_TAG)?.getAttribute('data-theme')).toBe('dark');
  });

  it('makes an unpositioned target relative and restores it on remove', () => {
    const { controller } = mount();
    expect(tile().style.position).toBe('relative');
    controller.remove();
    expect(tile().style.position).toBe('');
    expect(tile().querySelector(OVERLAY_TAG)).toBeNull();
  });

  it('reveals after the fade and stops the click from reaching the page', () => {
    const { onReveal } = mount();
    const pageClick = vi.fn();
    document.body.addEventListener('click', pageClick);

    const click = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true });
    surfaceOf(tile())!.dispatchEvent(click);

    expect(pageClick).not.toHaveBeenCalled();
    expect(click.defaultPrevented).toBe(true);
    expect(onReveal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(onReveal).toHaveBeenCalledOnce();
  });

  it('switches to a "hide again" button when revealed, and back', () => {
    const { controller, onHide } = mount();
    controller.setRevealed(true);
    expect(surfaceOf(tile())).toBeNull();
    hideButtonOf(tile())!.click();
    expect(onHide).toHaveBeenCalledOnce();
    controller.setRevealed(false);
    expect(surfaceOf(tile())).not.toBeNull();
  });

  it('covers only the given rows, and follows them when the target resizes', () => {
    document.body.innerHTML = '<div id="tile"><div id="head"></div><div id="text"></div><div id="media"></div><div id="bar"></div></div>';
    const top = (el: string, t: number, b: number) =>
      vi.spyOn(document.getElementById(el)!, 'getBoundingClientRect').mockReturnValue({ top: t, bottom: b } as DOMRect);
    top('tile', 100, 400);
    top('text', 120, 160);
    const media = top('media', 160, 360);
    let resized: (() => void) | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const rows = () => [document.getElementById('text')!, document.getElementById('media')!];

    const { controller } = mount({ rows });
    const host = tile().querySelector(OVERLAY_TAG) as HTMLElement;
    expect(host.style.top).toBe('20px');
    expect(host.style.height).toBe('240px');

    media.mockReturnValue({ top: 160, bottom: 500 } as DOMRect); // an image loaded
    resized!();
    expect(host.style.height).toBe('380px');

    controller.remove();
    expect(disconnect).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('covers the whole target when there are no rows', () => {
    mount({ rows: () => [] });
    const host = tile().querySelector(OVERLAY_TAG) as HTMLElement;
    expect(host.style.cssText).toContain('inset: 0');
    expect(host.style.height).toBe('');
  });

  it('starts revealed when the item was already revealed', () => {
    mount({ revealed: true });
    expect(hideButtonOf(tile())).not.toBeNull();
  });
});
