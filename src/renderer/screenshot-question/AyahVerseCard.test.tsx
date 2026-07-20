import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AyahVerseCard, getTafsirParagraphs, TranslationWithFootnotes } from './AyahVerseCard';
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
  beforeEach(() => {
    Object.assign(window, {
      ayati: {
        ...(window as unknown as { ayati?: Record<string, unknown> }).ayati,
        qulIsAvailable: vi.fn().mockResolvedValue(false),
        getAyahLensSettings: vi.fn().mockResolvedValue({ qulArabicEnabled: false }),
        getQulRenderedVerse: vi.fn(),
      },
    });
  });

  it('formats long tafsir text into readable paragraphs', () => {
    const paragraphs = getTafsirParagraphs(
      'The first explanation introduces the theme and gives the main context. It continues with supporting detail that should not stay in one dense block. The next explanation gives a second point and should become easier to scan. Final reminder.',
    );

    expect(paragraphs.length).toBeGreaterThan(1);
    expect(paragraphs.join(' ')).toContain('Final reminder.');
  });

  it('renders Arabic, translation, reference, why line, and save action', async () => {
    const user = userEvent.setup();
    const handleSave = vi.fn();
    render(<AyahVerseCard reflection={reflection} onSave={handleSave} />);

    expect(screen.getByText(reflection.arabicText)).toHaveAttribute('dir', 'rtl');
    expect(screen.getByText(reflection.translation)).toBeInTheDocument();
    expect(screen.getByText('Al-Baqarah 2:286')).toBeInTheDocument();

    await user.click(screen.getByText('Why this verse'));
    expect(screen.getByText(/The screen suggested stress and pressure/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: /save bookmark/i }));

    expect(handleSave).toHaveBeenCalledTimes(1);
  });

  it('renders translation footnotes without leaking internal markers', async () => {
    const user = userEvent.setup();
    render(
      <AyahVerseCard
        reflection={{
          ...reflection,
          translation: 'A clear sign\x00FN:1\x00 for those who reflect.',
          footnotes: [{ id: 42, number: 1, text: 'An explanatory footnote.' }],
        }}
        onSave={vi.fn()}
      />,
    );

    expect(screen.queryByText(/FN:1/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Footnote 1/i }));
    expect(screen.getByText('An explanatory footnote.')).toBeVisible();
  });

  it('renders a plain footnote number when details are unavailable', () => {
    render(<TranslationWithFootnotes text={'A clear sign\x00FN:1\x00.'} />);

    expect(screen.getByText('1')).toHaveClass('ayah-footnote-marker');
    expect(screen.queryByText(/FN:1/)).not.toBeInTheDocument();
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

    const playSpy = vi.spyOn(HTMLAudioElement.prototype, 'play').mockResolvedValue(undefined);
    const pauseSpy = vi.spyOn(HTMLAudioElement.prototype, 'pause').mockImplementation(() => {});

    try {
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

      await user.click(screen.getByRole('button', { name: /^Tafsir$/i }));
      expect(handleLoadTafsir).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Allah does not burden any soul/)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^Recite$/i }));
      expect(handleLoadAudio).not.toHaveBeenCalled();
      expect(playSpy).toHaveBeenCalled();
      expect(screen.getByText('Mishari Alafasy')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^Pause$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^Pause$/i }));
      expect(pauseSpy).toHaveBeenCalled();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^Recite$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByText('Note, collection, feedback'));
      await user.type(screen.getByLabelText(/^Note$/i), 'This helped me slow down.');
      await user.click(screen.getByRole('button', { name: /^Save note$/i }));
      expect(handleSaveNote).toHaveBeenCalledWith('This helped me slow down.');

      await user.selectOptions(screen.getByLabelText(/^Collection$/i), 'collection-1');
      expect(handleAddToCollection).toHaveBeenCalledWith('collection-1');

      await user.click(screen.getByRole('button', { name: 'Yes' }));
      expect(handleFeedback).toHaveBeenCalledWith('relevant');

      await user.click(screen.getByRole('button', { name: /^Other ayah$/i }));
      expect(handleAlternate).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole('button', { name: /^Copy card$/i }));
      expect(handleShare).toHaveBeenCalledTimes(1);
    } finally {
      playSpy.mockRestore();
      pauseSpy.mockRestore();
    }
  });
});
