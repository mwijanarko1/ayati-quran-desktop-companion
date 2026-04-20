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

  it('exposes tafsir, audio, note, collection, feedback, alternate, and share actions', async () => {
    const user = userEvent.setup();
    const handleLoadTafsir = vi.fn().mockResolvedValue(undefined);
    const handleLoadAudio = vi.fn().mockResolvedValue(undefined);
    const handleSaveNote = vi.fn().mockResolvedValue(undefined);
    const handleAddToCollection = vi.fn().mockResolvedValue(undefined);
    const handleFeedback = vi.fn().mockResolvedValue(undefined);
    const handleAlternate = vi.fn().mockResolvedValue(undefined);
    const handleShare = vi.fn().mockResolvedValue(undefined);

    render(
      <AyahVerseCard
        reflection={{
          ...reflection,
          tafsir: {
            resourceId: 169,
            resourceName: 'Tafsir Ibn Kathir',
            languageName: 'english',
            text: 'Allah does not burden any soul beyond capacity.',
            fetchedAt: 1710000000100,
          },
          audio: {
            recitationId: 1,
            reciterName: 'Mishari Alafasy',
            url: 'https://verses.quran.foundation/audio.mp3',
            fetchedAt: 1710000000200,
          },
        }}
        collections={[{ id: 'collection-1', name: 'Work Stress', syncState: 'synced' }]}
        onSave={vi.fn()}
        onLoadTafsir={handleLoadTafsir}
        onLoadAudio={handleLoadAudio}
        onSaveNote={handleSaveNote}
        onAddToCollection={handleAddToCollection}
        onFeedback={handleFeedback}
        onShowAlternate={handleAlternate}
        onShare={handleShare}
      />,
    );

    await user.click(screen.getByRole('button', { name: /show tafsir/i }));
    expect(handleLoadTafsir).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Allah does not burden any soul/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /play recitation/i }));
    expect(handleLoadAudio).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/recitation audio/i)).toHaveAttribute('src', 'https://verses.quran.foundation/audio.mp3');

    await user.type(screen.getByLabelText(/reflection note/i), 'This helped me slow down.');
    await user.click(screen.getByRole('button', { name: /save note/i }));
    expect(handleSaveNote).toHaveBeenCalledWith('This helped me slow down.');

    await user.selectOptions(screen.getByLabelText(/save to collection/i), 'collection-1');
    expect(handleAddToCollection).toHaveBeenCalledWith('collection-1');

    await user.click(screen.getByRole('button', { name: 'Relevant' }));
    expect(handleFeedback).toHaveBeenCalledWith('relevant');

    await user.click(screen.getByRole('button', { name: /show another ayah/i }));
    expect(handleAlternate).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /copy share card/i }));
    expect(handleShare).toHaveBeenCalledTimes(1);
  });
});
