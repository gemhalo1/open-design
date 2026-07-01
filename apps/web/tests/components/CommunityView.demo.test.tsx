// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommunityView } from '../../src/components/CommunityView';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CommunityView review demo', () => {
  it('presents templates as remixable project starters, not plugins', () => {
    render(<CommunityView />);

    expect(screen.getByRole('heading', { name: 'Community' })).toBeTruthy();
    // The view opens on the Slides type filter, which surfaces the two
    // remixable slide starters; each exposes a "Remix" action, never "Install".
    expect(screen.getAllByRole('button', { name: 'Remix' })).toHaveLength(2);
    expect(screen.queryByText('Install')).toBeNull();
  });

  it('fires the remix callback directly from a template card', () => {
    const onRemixTemplate = vi.fn();

    render(<CommunityView onRemixTemplate={onRemixTemplate} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Remix' })[0]!);

    expect(onRemixTemplate).toHaveBeenCalledTimes(1);
    expect(onRemixTemplate).toHaveBeenCalledWith('portfolio-case-study');
  });

  it('keeps each template wired to its own remix id', () => {
    const onRemixTemplate = vi.fn();

    render(<CommunityView onRemixTemplate={onRemixTemplate} />);

    for (const button of screen.getAllByRole('button', { name: 'Remix' })) {
      fireEvent.click(button);
    }

    expect(onRemixTemplate.mock.calls.map(([templateId]) => templateId)).toEqual([
      'portfolio-case-study',
      'design-system-docs',
    ]);
  });
});
