// @vitest-environment jsdom
//
// Scenario-card rail + "Open as project" remix coverage.
//   - The default create rail renders illustrated scenario cards carrying a
//     title AND a one-line description.
//   - The new finer-grained scenarios (wireframe / mobile / document) exist
//     and route to a working scenario plugin.
//   - "Open as project" on an example (plugin preset OR static prompt) fires
//     the duplicate handler with the same seed the pick path uses — and is
//     absent when the host doesn't supply the handler.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InstalledPluginRecord } from '@open-design/contracts';

import { HomeHero } from '../../src/components/HomeHero';
import { findChip } from '../../src/components/home-hero/chips';

afterEach(() => {
  cleanup();
});

function makePlugin(id: string, mode: string, title = id): InstalledPluginRecord {
  return {
    id,
    title,
    version: '1.0.0',
    sourceKind: 'bundled',
    source: '/tmp',
    trust: 'bundled',
    capabilitiesGranted: ['prompt:inject'],
    manifest: {
      name: id,
      version: '1.0.0',
      title,
      description: 'Plugin preset fixture',
      tags: [mode],
      od: {
        mode,
        useCase: { query: `Create with {{topic}} using ${title}` },
        inputs: [{ name: 'topic', label: 'Topic', type: 'text', default: 'a focused brief' }],
        preview: { type: 'image', poster: '/preview.png' },
      },
    },
    fsPath: '/tmp',
    installedAt: 0,
    updatedAt: 0,
  };
}

function renderHero(overrides: Partial<React.ComponentProps<typeof HomeHero>> = {}) {
  const props = {
    prompt: '',
    onPromptChange: () => undefined,
    onSubmit: () => undefined,
    activePluginTitle: null,
    activeChipId: null,
    onClearActivePlugin: () => undefined,
    pluginOptions: [],
    pluginsLoading: false,
    pendingPluginId: null,
    pendingChipId: null,
    onPickPlugin: () => undefined,
    onPickChip: () => undefined,
    contextItemCount: 0,
    error: null,
    ...overrides,
  } as React.ComponentProps<typeof HomeHero>;
  render(<HomeHero {...props} />);
}

describe('HomeHero scenario cards', () => {
  it('renders each create scenario card with a title and a description', () => {
    renderHero();
    const prototype = screen.getByTestId('home-hero-rail-prototype');
    expect(prototype.textContent).toContain('Prototype');
    expect(prototype.textContent).toContain('Interactive app mockups');

    const deck = screen.getByTestId('home-hero-rail-deck');
    expect(deck.textContent).toContain('Presentations & pitch decks');
  });

  it('adds the finer-grained scenarios as create cards routed to a scenario plugin', () => {
    renderHero();
    for (const id of ['wireframe', 'mobile', 'document']) {
      const card = screen.getByTestId(`home-hero-rail-${id}`);
      const tabs = screen.getByTestId('home-hero-type-tabs');
      expect(tabs.contains(card)).toBe(true);
      expect(findChip(id)?.action.kind).toBe('apply-scenario');
    }
    // Wireframe reuses the web-prototype seed at lo-fi fidelity.
    expect(findChip('wireframe')?.action).toMatchObject({
      pluginId: 'example-web-prototype',
      projectKind: 'prototype',
      projectMetadata: { kind: 'prototype', fidelity: 'wireframe' },
    });
    expect(findChip('document')?.action).toMatchObject({
      pluginId: 'od-new-generation',
      projectKind: 'other',
    });
  });
});

describe('HomeHero "Open as project" remix', () => {
  it('fires the duplicate handler for a plugin preset with the seed prompt', () => {
    const deckPlugin = makePlugin('example-deck-a', 'deck', 'Investor deck');
    const onDuplicateExamplePlugin = vi.fn();
    renderHero({
      activeChipId: 'deck',
      pluginOptions: [deckPlugin],
      onDuplicateExamplePlugin,
    });

    const open = screen.getByTestId('home-hero-plugin-preset-open');
    fireEvent.click(open);
    expect(onDuplicateExamplePlugin).toHaveBeenCalledWith(
      deckPlugin,
      'deck',
      'Create with a focused brief using Investor deck',
    );
  });

  it('fires the duplicate handler for a static prompt example', () => {
    const onDuplicatePromptExample = vi.fn();
    renderHero({ activeChipId: 'deck', onDuplicatePromptExample });

    const opens = screen.getAllByTestId('home-hero-prompt-example-open');
    expect(opens.length).toBeGreaterThan(0);
    fireEvent.click(opens[0]!);
    expect(onDuplicatePromptExample).toHaveBeenCalledWith(
      'Research the market opportunity for a product launch, including competitors, target users, pricing hypotheses, and launch narrative',
      'deck',
    );
  });

  it('omits the "Open as project" action when no duplicate handler is supplied', () => {
    renderHero({ activeChipId: 'deck', pluginOptions: [makePlugin('example-deck-a', 'deck', 'Investor deck')] });
    expect(screen.queryByTestId('home-hero-plugin-preset-open')).toBeNull();
    expect(screen.queryByTestId('home-hero-prompt-example-open')).toBeNull();
  });
});
