// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimpleDialogShell } from '../../src/components/SimpleDialogShell';

afterEach(() => {
  cleanup();
});

describe('SimpleDialogShell', () => {
  it('wires labelled dialogs consistently', () => {
    render(
      <SimpleDialogShell ariaLabelledBy="dialog-title">
        <h2 id="dialog-title">Rename design</h2>
      </SimpleDialogShell>,
    );

    expect(screen.getByRole('dialog', { name: 'Rename design' })).toBeTruthy();
  });

  it('closes on backdrop click when enabled', () => {
    const onClose = vi.fn();
    const { container } = render(
      <SimpleDialogShell onClose={onClose}>
        <h2>Backdrop close</h2>
      </SimpleDialogShell>,
    );

    fireEvent.click(container.querySelector('.modal-backdrop') as HTMLElement);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape when enabled', () => {
    const onClose = vi.fn();
    render(
      <SimpleDialogShell onClose={onClose} closeOnEscape>
        <h2>Escape close</h2>
      </SimpleDialogShell>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
