/** Test-only helpers for DOM tests (happy-dom). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';

/** Replaces the page with one of the synthetic site fixtures. */
export function loadFixture(site: 'youtube' | 'x' | 'reddit'): void {
  document.documentElement.innerHTML = readFileSync(join(import.meta.dirname, `fixtures/${site}.html`), 'utf8');
}

export const byId = (id: string) => document.getElementById(id) as HTMLElement;

/** Makes closed shadow roots open so tests can look inside the overlay. */
export function openShadowRoots(): void {
  const original = Element.prototype.attachShadow;
  vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (this: Element, init: ShadowRootInit) {
    return original.call(this, { ...init, mode: 'open' });
  });
}

/** IntersectionObserver stand-in: everything observed counts as near the viewport, unless hidden. */
export class FakeIntersectionObserver {
  readonly #callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.#callback = callback;
  }
  observe(target: Element): void {
    const isIntersecting = !target.hasAttribute('data-test-offscreen');
    this.#callback([{ target, isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  unobserve(): void {}
  disconnect(): void {}
}

const inOverlay = (target: Element, selector: string) =>
  target.querySelector('busted-overlay')?.shadowRoot?.querySelector<HTMLButtonElement>(selector) ?? null;

export const surfaceOf = (target: Element) => inOverlay(target, '.surface');
export const hideButtonOf = (target: Element) => inOverlay(target, '.hide-again');

/** Changes the page address without loading anything (a happy-dom extra). */
export function setPageUrl(url: string): void {
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(url);
}
