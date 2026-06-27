import { describe, expect, it } from 'vitest';
import { resolveCommunityTemplatePreset } from '../../src/components/community-template-presets';

describe('community template presets', () => {
  it('keeps each community template remixable as a distinct project preset', () => {
    const ids = [
      'electric-studio',
      'launch-landing',
      'founder-memo',
      'growth-dashboard',
    ];

    const presets = ids.map((id) => resolveCommunityTemplatePreset(id));

    expect(new Set(presets.map((preset) => preset.projectName)).size).toBe(ids.length);
    expect(new Set(presets.map((preset) => preset.metadata.demoPresetId)).size).toBe(ids.length);

    for (const preset of presets) {
      expect(preset.metadata.entryFile).toBe('index.html');
      expect(preset.prompt).toContain('Template remix');
      expect(preset.html).toContain(`<title>${preset.projectName}</title>`);
    }
  });

  it('falls back to Electric Studio for unknown template ids', () => {
    expect(resolveCommunityTemplatePreset('missing-template').id).toBe('electric-studio');
  });
});
