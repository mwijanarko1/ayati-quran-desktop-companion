import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HotkeyInput } from './HotkeyInput';

describe('HotkeyInput', () => {
  it('uses Electron-safe ASCII keys when modifier layers emit symbols', async () => {
    const onChange = vi.fn();

    render(
      <HotkeyInput
        label="Reflect on Screen"
        description="Capture your screen and receive a fitting ayah"
        value="CommandOrControl+Shift+/"
        onChange={onChange}
      />,
    );

    const button = screen.getByRole('button', { name: /⌘/i });
    await act(async () => {
      fireEvent.click(button);
    });

    act(() => {
      fireEvent.keyDown(button, {
        key: '≥',
        code: 'Period',
        altKey: true,
        metaKey: true,
      });
    });

    expect(onChange).toHaveBeenCalledWith('CommandOrControl+Alt+.');
  });
});
