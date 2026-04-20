import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PetContextMenu } from './PetContextMenu';

vi.mock('@iconify/react', () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

function createMockAyati() {
  return {
    petContextMenuAction: vi.fn(),
    hidePetContextMenu: vi.fn(),
    openExternal: vi.fn(),
  } satisfies Partial<Window['ayati']>;
}

describe('PetContextMenu', () => {
  let mockAyati: ReturnType<typeof createMockAyati>;

  beforeEach(() => {
    mockAyati = createMockAyati();
    Object.defineProperty(window, 'ayati', {
      configurable: true,
      writable: true,
      value: mockAyati as Window['ayati'],
    });
  });

  it('dispatches command button actions once even if the click repeats', async () => {
    const user = userEvent.setup();

    render(<PetContextMenu />);

    const settingsButton = screen.getByRole('button', { name: /settings/i });
    await user.dblClick(settingsButton);

    expect(mockAyati.petContextMenuAction).toHaveBeenCalledTimes(1);
    expect(mockAyati.petContextMenuAction).toHaveBeenCalledWith('settings');
  });
});
