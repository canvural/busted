/** Test-only helpers for DOM tests (happy-dom). */
import { vi } from 'vitest';

/** Makes closed shadow roots open so tests can look inside the overlay. */
export function openShadowRoots(): void {
  const original = Element.prototype.attachShadow;
  vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (this: Element, init: ShadowRootInit) {
    return original.call(this, { ...init, mode: 'open' });
  });
}

/** IntersectionObserver stand-in: everything observed counts as near the viewport, unless hidden. */
export class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly targets = new Set<Element>();
  readonly #callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.#callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }
  observe(target: Element): void {
    this.targets.add(target);
    this.fire(target, !target.hasAttribute('data-test-offscreen'));
  }
  unobserve(target: Element): void {
    this.targets.delete(target);
  }
  disconnect(): void {
    this.targets.clear();
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  /** Simulate scrolling an element into or out of the zone. */
  fire(target: Element, isIntersecting: boolean): void {
    this.#callback([{ target, isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

export function surfaceOf(target: Element): HTMLButtonElement | null {
  const host = target.querySelector('busted-overlay');
  return (host?.shadowRoot?.querySelector('.surface') as HTMLButtonElement | null) ?? null;
}

export function hideButtonOf(target: Element): HTMLButtonElement | null {
  const host = target.querySelector('busted-overlay');
  return (host?.shadowRoot?.querySelector('.hide-again') as HTMLButtonElement | null) ?? null;
}

/** Changes the page address without loading anything (a happy-dom extra). */
export function setPageUrl(url: string): void {
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(url);
}
