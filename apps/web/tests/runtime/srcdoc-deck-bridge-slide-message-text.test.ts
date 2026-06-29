// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

function extractDeckBridgeScript(srcdoc: string): string {
  const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
  if (!match || !match[1]) {
    throw new Error('deck bridge script not found in srcdoc');
  }
  return match[1];
}

function installQueuedTimers(win: object) {
  const callbacks: Array<() => void> = [];
  Object.defineProperty(win, 'setTimeout', {
    configurable: true,
    value: vi.fn((callback: () => void) => {
      if (typeof callback === 'function') callbacks.push(callback);
      return callbacks.length;
    }),
  });
  Object.defineProperty(win, 'clearTimeout', {
    configurable: true,
    value: vi.fn(),
  });
  return function flushTimers() {
    for (let i = 0; i < 100 && callbacks.length; i += 1) {
      callbacks.shift()?.();
    }
  };
}

function setupDeckThatMentionsSlideMessages() {
  const bodyHtml = `
    <section class="slide" style="display:block">Slide One</section>
    <section class="slide" style="display:none">Slide Two</section>
    <p>Protocol token: od:slide</p>
  `;
  const srcdoc = buildSrcdoc(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
    deck: true,
  });
  const script = extractDeckBridgeScript(srcdoc);
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const win = dom.window;
  Object.defineProperty(win, 'parent', {
    configurable: true,
    value: { postMessage: vi.fn() },
  });
  const flushTimers = installQueuedTimers(win);

  const evaluate = new win.Function(script);
  evaluate.call(win);
  flushTimers();
  const slides = Array.from(win.document.querySelectorAll<HTMLElement>('.slide'));
  return { flushTimers, win, slides };
}

function setupDeckWithNativeSlideMessageHandler() {
  const bodyHtml = `
    <section class="slide" hidden>Slide One</section>
    <section class="slide" hidden>Slide Two</section>
    <section class="slide" hidden>Slide Three</section>
  `;
  const srcdoc = buildSrcdoc(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
    deck: true,
  });
  const script = extractDeckBridgeScript(srcdoc);
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const win = dom.window;
  Object.defineProperty(win, 'parent', {
    configurable: true,
    value: { postMessage: vi.fn() },
  });
  const flushTimers = installQueuedTimers(win);

  const evaluate = new win.Function(script);
  evaluate.call(win);
  flushTimers();

  let active = 0;
  const slides = Array.from(win.document.querySelectorAll<HTMLElement>('.slide'));
  function render() {
    slides.forEach((slide, index) => {
      slide.hidden = index !== active;
    });
  }
  win.addEventListener('message', (event) => {
    if (!event.data || event.data.type !== 'od:slide') return;
    if (event.data.action === 'next') active = Math.min(slides.length - 1, active + 1);
    if (event.data.action === 'prev') active = Math.max(0, active - 1);
    render();
  });
  render();

  return { flushTimers, win, slides };
}

describe('deck bridge - slide message text', () => {
  it('keeps host navigation active when content mentions the od:slide protocol without handling it', () => {
    const { flushTimers, win, slides } = setupDeckThatMentionsSlideMessages();
    const [first, second] = slides;
    if (!first || !second) throw new Error('expected two slides');

    win.dispatchEvent(
      new win.MessageEvent('message', { data: { type: 'od:slide', action: 'next' } }),
    );
    flushTimers();

    expect(first.style.display).toBe('none');
    expect(second.style.display).toBe('');
    win.close();
  });

  it('keeps bridge-owned fallback synchronous when unrelated message listeners exist', () => {
    const { win, slides } = setupDeckThatMentionsSlideMessages();
    const [first, second] = slides;
    if (!first || !second) throw new Error('expected two slides');

    win.addEventListener('message', (event) => {
      if (!event.data || event.data.type !== 'od:theme') return;
      win.document.documentElement.dataset.theme = String(event.data.theme || '');
    });

    win.dispatchEvent(
      new win.MessageEvent('message', { data: { type: 'od:slide', action: 'next' } }),
    );

    expect(first.style.display).toBe('none');
    expect(second.style.display).toBe('');
    win.close();
  });

  it('does not apply a second step when a native slide message handler runs later in the same event', () => {
    const { flushTimers, win, slides } = setupDeckWithNativeSlideMessageHandler();
    const [first, second, third] = slides;
    if (!first || !second || !third) throw new Error('expected three slides');

    win.dispatchEvent(
      new win.MessageEvent('message', { data: { type: 'od:slide', action: 'next' } }),
    );
    flushTimers();

    expect(first.hidden).toBe(true);
    expect(second.hidden).toBe(false);
    expect(third.hidden).toBe(true);
    win.close();
  });
});
