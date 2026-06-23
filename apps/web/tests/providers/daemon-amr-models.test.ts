import { afterEach, describe, expect, it, vi } from 'vitest';

import { canUpgradeVelaPlan, fetchAmrModels } from '../../src/providers/daemon';

describe('canUpgradeVelaPlan', () => {
  it('is upgradeable for a known tier below the top', () => {
    expect(canUpgradeVelaPlan('free')).toBe(true);
    expect(canUpgradeVelaPlan('plus')).toBe(true);
    expect(canUpgradeVelaPlan('pro')).toBe(true);
  });

  it('is not upgradeable at the top tier', () => {
    expect(canUpgradeVelaPlan('max')).toBe(false);
    expect(canUpgradeVelaPlan('MAX')).toBe(false);
  });

  it('is NOT upgradeable for an unknown plan (signed in, billing not yet resolved)', () => {
    // Regression: a missing plan must hide the Upgrade CTA, otherwise top-tier
    // users flash it on a cold cache before the live summary arrives.
    expect(canUpgradeVelaPlan(undefined)).toBe(false);
    expect(canUpgradeVelaPlan(null)).toBe(false);
    expect(canUpgradeVelaPlan('')).toBe(false);
    expect(canUpgradeVelaPlan('   ')).toBe(false);
  });
});

describe('fetchAmrModels', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns AMR model cache payloads from the daemon', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        source: 'preset',
        models: [{ id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' }],
        refreshing: true,
      }), { status: 200 })),
    );

    await expect(fetchAmrModels()).resolves.toEqual({
      source: 'preset',
      models: [{ id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' }],
      refreshing: true,
    });
    expect(fetch).toHaveBeenCalledWith('/api/amr/models', { cache: 'no-store' });
  });

  it('returns null when the daemon does not return AMR models', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );

    await expect(fetchAmrModels()).resolves.toBeNull();
  });
});
