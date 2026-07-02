// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveOnboardingProfile } from '../../src/state/onboarding-profile';

vi.mock('../../src/analytics/client', () => ({
  setAnalyticsPersonProperties: vi.fn(),
}));

import { setAnalyticsPersonProperties } from '../../src/analytics/client';
import {
  bindSignedInUserAttributionPersonProperties,
  setOnboardingAttributionPersonProperties,
} from '../../src/analytics/source-attribution';

describe('source attribution person properties', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(setAnalyticsPersonProperties).mockClear();
  });

  it('sets onboarding profile fields as PostHog person properties', () => {
    setOnboardingAttributionPersonProperties(
      {
        role: 'engineer',
        orgSize: 'growth',
        useCase: ['product', 'unknown', ''],
        source: 'github',
      },
      new Date('2026-07-02T08:00:00.000Z'),
    );

    expect(setAnalyticsPersonProperties).toHaveBeenCalledWith({
      od_role: 'engineer',
      od_org_size: 'growth',
      od_use_cases: ['product'],
      od_onboarding_source: 'github',
      od_source_resolved: 'github',
      od_source_resolution: 'onboarding',
      od_onboarding_at: '2026-07-02T08:00:00.000Z',
    });
  });

  it('binds a signed-in AMR user to the stored onboarding source', () => {
    saveOnboardingProfile({
      role: 'growth',
      orgSize: 'startup',
      useCase: ['marketing'],
      source: 'social',
    });

    bindSignedInUserAttributionPersonProperties(
      'usr_amr_42',
      new Date('2026-07-02T08:30:00.000Z'),
    );

    expect(setAnalyticsPersonProperties).toHaveBeenCalledWith(
      expect.objectContaining({
        od_app_user_id: 'usr_amr_42',
        od_source_bound_at: '2026-07-02T08:30:00.000Z',
        od_source_resolved: 'social',
        od_source_resolution: 'onboarding',
        od_role: 'growth',
        od_org_size: 'startup',
        od_use_cases: ['marketing'],
        od_onboarding_source: 'social',
      }),
    );
  });

  it('does not emit an empty bind when the signed-in user id is missing', () => {
    bindSignedInUserAttributionPersonProperties(null);

    expect(setAnalyticsPersonProperties).not.toHaveBeenCalled();
  });
});
