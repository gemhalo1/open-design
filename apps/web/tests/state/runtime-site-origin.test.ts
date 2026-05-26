// @vitest-environment jsdom
// Runtime site-origin wire: the daemon's /api/app-config response carries a
// read-only `siteOrigin` (it reads OD_SITE_ORIGIN, defaulting to the public
// site). This pins that the web client falls back to the canonical origin
// before the daemon answers, and adopts a self-host override once it does —
// the escape hatch that lets a self-hosted operator repoint shared links.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPEN_DESIGN_SITE_ORIGIN } from '@open-design/contracts';
import { fetchDaemonConfig, getRuntimeSiteOrigin } from '../../src/state/config';

describe('runtime site origin', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to the canonical public site before the daemon answers', () => {
    expect(getRuntimeSiteOrigin()).toBe(OPEN_DESIGN_SITE_ORIGIN);
  });

  it('adopts the daemon-provided OD_SITE_ORIGIN override', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ config: {}, siteOrigin: 'https://design.acme.internal' }),
      })),
    );
    await fetchDaemonConfig();
    expect(getRuntimeSiteOrigin()).toBe('https://design.acme.internal');
  });

  it('ignores a blank siteOrigin and keeps the previous value', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ config: {}, siteOrigin: '   ' }),
      })),
    );
    const before = getRuntimeSiteOrigin();
    await fetchDaemonConfig();
    expect(getRuntimeSiteOrigin()).toBe(before);
  });
});
