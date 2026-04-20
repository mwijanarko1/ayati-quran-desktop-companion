import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AyahVerseCard } from './AyahVerseCard';
import type { AyahReflection } from '../../main/ayah-types';

const reflection: AyahReflection = {
  id: 'reflection-1',
  verseKey: '2:286',
  surahName: 'Al-Baqarah',
  ayahNumber: 286,
  arabicText: 'لَا يُكَلِّفُ ٱللَّهُ نَفْسًا إِلَّا وُسْعَهَا',
  translation: 'Allah does not require of any soul more than what it can afford.',
  translatorId: 20,
  reflection: 'Move with what is in your capacity.',
  whyThisVerse: 'The screen suggested stress and pressure.',
  screenSummary: 'A crowded work screen.',
  themes: [{ id: 'stress', confidence: 0.9 }],
  createdAt: 1710000000000,
  syncState: 'local',
};

describe('AyahVerseCard', () => {
  it('renders Arabic, translation, reference, why line, and save action', async () => {
    const handleSave = vi.fn();
    render(<AyahVerseCard reflection={reflection} onSave={handleSave} />);

    expect(screen.getByText(reflection.arabicText)).toHaveAttribute('dir', 'rtl');
    expect(screen.getByText(reflection.translation)).toBeInTheDocument();
    expect(screen.getByText('Al-Baqarah 2:286')).toBeInTheDocument();
    expect(screen.getByText(/The screen suggested stress and pressure/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /save bookmark/i }));

    expect(handleSave).toHaveBeenCalledTimes(1);
  });
});
