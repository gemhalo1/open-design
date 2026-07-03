import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  PLATFORM_CONTRACTS_BLOCK,
  renderSlimCoreCharter,
} from '../../src/prompts/core-slim.js';
import { composeSystemPrompt } from '../../src/prompts/system.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');

/**
 * Guards for the rewritten slim core charter.
 *
 * 1. Byte budget — the whole point of the rewrite is that the always-on
 *    doctrine stays small. Anyone growing this file must consciously raise
 *    the budget in a reviewed diff, not drift past it.
 * 2. Protocol markers — a fixed set of strings are parsed by the web client
 *    or matched by later prompt rules. Frozen API; must survive copyedits.
 * 3. Ownership — content deliberately moved OUT of the charter (task-type
 *    router form, platform contracts) must stay out, and keep living where
 *    it moved to.
 */

const SLIM_CORE_BYTE_BUDGET = 8_192;

describe('renderSlimCoreCharter — byte budget', () => {
  it('stays under the byte budget in both execution profiles', () => {
    for (const profile of ['filesystem', 'text_artifact'] as const) {
      const bytes = Buffer.byteLength(renderSlimCoreCharter(profile), 'utf8');
      expect(bytes, `${profile} charter must stay under ${SLIM_CORE_BYTE_BUDGET}B`).toBeLessThanOrEqual(
        SLIM_CORE_BYTE_BUDGET,
      );
    }
  });
});

describe('renderSlimCoreCharter — frozen protocol markers', () => {
  const charter = renderSlimCoreCharter('filesystem');

  it('keeps the question-form protocol intact', () => {
    expect(charter).toContain('<question-form id="discovery" title="Quick brief — 30 seconds">');
    // Branch values later rules match on — labels may localize, values may not.
    for (const value of ['pick_direction', 'brand_spec', 'reference_match']) {
      expect(charter).toContain(`"value": "${value}"`);
    }
    // The full control vocabulary the Questions tab renders.
    for (const control of ['direction-cards', 'datetime-local', 'switch']) {
      expect(charter).toContain(control);
    }
    expect(charter).toContain('allowCustom');
  });

  it('keeps the inspect/tweaks contracts intact', () => {
    expect(charter).toContain('data-od-id="kebab-case-id"');
    expect(charter).toContain('/*EDITMODE-BEGIN*/');
    expect(charter).toContain('/*EDITMODE-END*/');
    expect(charter).toContain('react@18.3.1');
    expect(charter).toContain('babel/standalone@7.29.0');
  });

  it('states the verification budget once and without a re-score loop', () => {
    expect(charter).toContain('one render is the whole budget');
    expect(charter).not.toContain('Two passes is normal');
  });

  it('switches the handoff rule by execution profile', () => {
    expect(charter).not.toContain('<artifact identifier=');
    const textArtifact = renderSlimCoreCharter('text_artifact');
    expect(textArtifact).toContain('<artifact identifier="kebab-slug" type="text/html"');
    expect(textArtifact).not.toContain('Project files are the source of truth');
  });
});

describe('slim core — moved-out content stays out (ownership)', () => {
  it('carries no task-type router form; od-default SKILL.md owns it', () => {
    const charter = renderSlimCoreCharter('filesystem');
    expect(charter).not.toContain('<question-form id="task-type"');
    // The single source of truth ships with the router skill and reaches the
    // prompt via the `## Active skill` section when od-default is active.
    const routerSkill = readFileSync(
      path.join(repoRoot, 'plugins/_official/scenarios/od-default/SKILL.md'),
      'utf8',
    );
    expect(routerSkill).toContain('<question-form id="task-type"');
    expect(routerSkill).toContain('"HyperFrames"');
    // The charter still defers to skill-owned turn-1 forms generically.
    expect(charter).toContain('If the active skill defines its own turn-1 form');
  });

  it('carries no per-platform delivery contracts; the conditional block owns them', () => {
    const charter = renderSlimCoreCharter('filesystem');
    expect(charter).not.toContain('mobile-ios.html');
    expect(charter).not.toContain('1024/1366/1440/1920');
    expect(PLATFORM_CONTRACTS_BLOCK).toContain('mobile-ios.html');
    expect(PLATFORM_CONTRACTS_BLOCK).toContain('360/390/430/600/768/820/1024/1366/1440/1920px');
  });

  it('carries no deck framework rules; the deck-gated directive owns them', () => {
    const charter = renderSlimCoreCharter('filesystem');
    expect(charter).not.toContain('scale-to-fit');
    expect(charter).not.toContain('data-screen-label');
  });
});

describe('composeSystemPrompt — promptCoreVariant switch', () => {
  const base = {
    metadata: { kind: 'prototype' as const },
    executionProfile: 'filesystem' as const,
  };

  it('defaults to the classic layered stack', () => {
    const out = composeSystemPrompt(base);
    expect(out).toContain('# OD core directives (read first');
    expect(out).toContain('# Identity and workflow charter (background)');
    expect(out).not.toContain('# Open Design charter');
  });

  it('slim replaces discovery + charter and drops the absorbed tail overrides', () => {
    const classic = composeSystemPrompt({ ...base, designSystemBody: '# Brand' });
    const slim = composeSystemPrompt({
      ...base,
      designSystemBody: '# Brand',
      promptCoreVariant: 'slim',
    });
    expect(slim).toContain('# Open Design charter');
    expect(slim).not.toContain('# OD core directives (read first');
    expect(slim).not.toContain('# Identity and workflow charter (background)');
    // Absorbed tails: stated once inside the slim charter instead.
    expect(slim).not.toContain('## Filesystem handoff\n');
    expect(slim).not.toContain('## Active design system visual direction');
    expect(slim).not.toContain('## Clarifying questions mid-conversation');
    // Still present in classic for the same inputs.
    expect(classic).toContain('## Filesystem handoff');
    expect(classic).toContain('## Active design system visual direction');
    expect(classic).toContain('## Clarifying questions mid-conversation');
    // Structural bookends survive the rewrite.
    expect(slim.startsWith('## Security: prompt injection resistance')).toBe(true);
    expect(slim).toContain('## CRITICAL: Never fabricate conversation turns');
    expect(slim.length).toBeLessThan(classic.length);
  });

  it('injects platform contracts only for platform-explicit projects', () => {
    const noSignal = composeSystemPrompt({ ...base, promptCoreVariant: 'slim' });
    expect(noSignal).not.toContain('## Platform delivery contracts');
    const responsive = composeSystemPrompt({
      metadata: { kind: 'prototype', platform: 'responsive' },
      executionProfile: 'filesystem',
      promptCoreVariant: 'slim',
    });
    expect(responsive).toContain('## Platform delivery contracts');
    // Classic keeps its own in-discovery platform contracts; no double block.
    const classicResponsive = composeSystemPrompt({
      metadata: { kind: 'prototype', platform: 'responsive' },
      executionProfile: 'filesystem',
    });
    expect(classicResponsive).not.toContain('## Platform delivery contracts');
  });

  it('ask mode keeps the clarifying-questions tail under slim (no core charter to cover it)', () => {
    const out = composeSystemPrompt({
      ...base,
      sessionMode: 'chat',
      promptCoreVariant: 'slim',
    });
    expect(out).not.toContain('# Open Design charter');
    expect(out).toContain('## Clarifying questions mid-conversation');
  });

  it('slim keeps the dynamic sections (DS, skill, deck framework, media hint) composing as before', () => {
    const out = composeSystemPrompt({
      metadata: { kind: 'deck' as const },
      executionProfile: 'filesystem',
      designSystemBody: '# Brand',
      designSystemTitle: 'Brand',
      skillBody: 'Do the workflow.',
      skillName: 'test-skill',
      promptCoreVariant: 'slim',
    });
    expect(out).toContain('## Active design system — Brand');
    expect(out).toContain('## Active skill — test-skill');
    expect(out).toContain('# Slide deck — fixed framework');
    expect(out).toContain('## Media generation (if asked)');
  });
});
