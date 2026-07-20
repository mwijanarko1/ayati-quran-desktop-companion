import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { AyahCollection, AyahReflection, Footnote } from '../../main/ayah-types';
import { QulArabicText } from '../components/QulArabicText';
import './translation-footnotes.css';

/** Regex matching footnote tokens embedded in translation text: \x00FN:NUMBER\x00 */
const FN_TOKEN_RE = /\x00FN:(\d+)\x00/g;

interface AyahVerseCardProps {
  reflection: AyahReflection;
  collections?: AyahCollection[];
  isSaving?: boolean;
  onSave: () => void;
  onLoadTafsir?: () => Promise<void> | void;
  onLoadAudio?: () => Promise<AyahReflection | null | void>;
  onSaveNote?: (body: string) => Promise<void> | void;
  onAddToCollection?: (collectionId: string) => Promise<void> | void;
  onFeedback?: (value: 'relevant' | 'not_relevant') => Promise<void> | void;
  onShowAlternate?: () => Promise<void> | void;
  onShare?: () => Promise<void> | void;
}

function getSaveLabel(reflection: AyahReflection, isSaving: boolean): string {
  if (isSaving) return 'Saving...';
  if (reflection.syncState === 'synced') return 'Saved to Quran Foundation';
  if (reflection.syncState === 'pending') return 'Pending sync';
  if (reflection.savedAt) return 'Saved locally';
  return 'Save Bookmark';
}

type ActionKey = 'tafsir' | 'note' | 'collection' | 'feedback' | 'alternate' | 'share';

function pauseAyahReflectionAudio(audio: HTMLAudioElement | null): void {
  if (!audio) return;
  try {
    audio.pause();
  } catch {
    // JSDOM may not implement media pause.
  }
}

const TAFSIR_PARAGRAPH_TARGET_LENGTH = 170;

export function getTafsirParagraphs(text: string): string[] {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s+/g, ' '))
    .map((block) => block.trim())
    .filter(Boolean);

  const paragraphs: string[] = [];
  for (const block of blocks.length > 0 ? blocks : [text.trim()]) {
    const sentences = block.match(/[^.!?؟۔]+[.!?؟۔]+["')\]]*|[^.!?؟۔]+$/g) ?? [block];
    let currentParagraph = '';

    for (const sentence of sentences) {
      const cleanSentence = sentence.replace(/\s+/g, ' ').trim();
      if (!cleanSentence) continue;

      const nextParagraph = currentParagraph
        ? `${currentParagraph} ${cleanSentence}`
        : cleanSentence;
      if (currentParagraph && nextParagraph.length > TAFSIR_PARAGRAPH_TARGET_LENGTH) {
        paragraphs.push(currentParagraph);
        currentParagraph = cleanSentence;
      } else {
        currentParagraph = nextParagraph;
      }
    }

    if (currentParagraph) {
      paragraphs.push(currentParagraph);
    }
  }

  return paragraphs.length > 0 ? paragraphs : [text.trim()].filter(Boolean);
}

interface TranslationSegment {
  type: 'text' | 'footnote';
  value: string; // text content for 'text', footnote number for 'footnote'
}

/**
 * Splits tokenized translation text into an array of segments.
 * Tokens are in the form \x00FN:NUMBER\x00.
 */
function tokenizeTranslation(text: string): TranslationSegment[] {
  const segments: TranslationSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(FN_TOKEN_RE);

  while ((match = re.exec(text)) !== null) {
    // Push text before this token
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'footnote', value: match[1] });
    lastIndex = re.lastIndex;
  }

  // Push remaining text after last token
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}

/**
 * Returns footnote display info for a given footnote number.
 */
function getFootnoteInfo(footnotes: Footnote[] | undefined, number: number): Footnote | undefined {
  return footnotes?.find((fn) => fn.number === number);
}

export function TranslationWithFootnotes({
  text,
  footnotes,
}: {
  text: string;
  footnotes?: Footnote[];
}): JSX.Element {
  const [openFootnotes, setOpenFootnotes] = useState<Set<number>>(new Set());

  const toggleFootnote = useCallback((number: number) => {
    setOpenFootnotes((prev) => {
      const next = new Set(prev);
      if (next.has(number)) {
        next.delete(number);
      } else {
        next.add(number);
      }
      return next;
    });
  }, []);

  const segments = tokenizeTranslation(text);

  return (
    <span className="ayah-translation-text">
      {segments.map((seg, index) => {
        if (seg.type === 'text') {
          return <React.Fragment key={`t-${index}`}>{seg.value}</React.Fragment>;
        }
        const num = Number.parseInt(seg.value, 10);
        const info = footnotes ? getFootnoteInfo(footnotes, num) : undefined;
        if (!info) {
          return <sup key={`fn-${num}`} className="ayah-footnote-marker">{num}</sup>;
        }
        const isOpen = openFootnotes.has(num);
        return (
          <React.Fragment key={`fn-${num}`}>
            <sup>
              <button
                type="button"
                className={`ayah-footnote-badge${isOpen ? ' ayah-footnote-badge--open' : ''}`}
                onClick={() => toggleFootnote(num)}
                aria-label={`Footnote ${num}: ${info.text.slice(0, 60)}`}
                aria-expanded={isOpen}
              >
                {num}
              </button>
            </sup>
            {isOpen && (
              <span className="ayah-footnote-popover">
                <span className="ayah-footnote-number">{num}.</span>
                {info.text}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </span>
  );
}

export function AyahVerseCard({
  reflection,
  collections = [],
  isSaving = false,
  onSave,
  onLoadTafsir,
  onLoadAudio,
  onSaveNote,
  onAddToCollection,
  onFeedback,
  onShowAlternate,
  onShare,
}: AyahVerseCardProps): JSX.Element {
  const isSaved = Boolean(reflection.savedAt) || reflection.syncState === 'synced' || reflection.syncState === 'pending';
  const [isTafsirOpen, setIsTafsirOpen] = useState(false);
  const [noteBody, setNoteBody] = useState(reflection.note?.body ?? '');
  const [busyAction, setBusyAction] = useState<ActionKey | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tafsirParagraphs = reflection.tafsir?.text ? getTafsirParagraphs(reflection.tafsir.text) : [];

  useEffect(() => {
    setNoteBody(reflection.note?.body ?? '');
  }, [reflection.id, reflection.note?.body]);

  useEffect(() => {
    pauseAyahReflectionAudio(audioRef.current);
    audioRef.current = null;
    setIsAudioPlaying(false);
    setIsAudioLoading(false);
  }, [reflection.id]);

  useEffect(() => {
    return () => {
      pauseAyahReflectionAudio(audioRef.current);
      audioRef.current = null;
    };
  }, []);

  const startPlayback = useCallback(async (url: string) => {
    pauseAyahReflectionAudio(audioRef.current);
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.addEventListener('ended', () => setIsAudioPlaying(false));
    audio.addEventListener('pause', () => setIsAudioPlaying(false));
    try {
      await audio.play();
      setIsAudioPlaying(true);
    } catch {
      setStatusMessage('Could not start playback.');
      setIsAudioPlaying(false);
    }
  }, []);

  const handleReciteClick = useCallback(async () => {
    if (isAudioLoading) return;

    if (isAudioPlaying) {
      pauseAyahReflectionAudio(audioRef.current);
      setIsAudioPlaying(false);
      return;
    }

    if (audioRef.current && audioRef.current.paused && !audioRef.current.ended) {
      try {
        await audioRef.current.play();
        setIsAudioPlaying(true);
      } catch {
        setStatusMessage('Could not start playback.');
      }
      return;
    }

    if (audioRef.current?.ended) {
      audioRef.current.currentTime = 0;
      try {
        await audioRef.current.play();
        setIsAudioPlaying(true);
      } catch {
        setStatusMessage('Could not start playback.');
      }
      return;
    }

    const existingUrl = reflection.audio?.url;
    if (existingUrl) {
      setStatusMessage('');
      await startPlayback(existingUrl);
      return;
    }

    if (!onLoadAudio) {
      setStatusMessage('Recitation is not available yet.');
      return;
    }

    setIsAudioLoading(true);
    setStatusMessage('');
    try {
      const updated = await onLoadAudio();
      const fetchedUrl = updated?.audio?.url;
      if (!fetchedUrl) {
        setStatusMessage('Recitation is not available yet.');
        return;
      }
      await startPlayback(fetchedUrl);
    } catch {
      setStatusMessage('Could not load recitation.');
    } finally {
      setIsAudioLoading(false);
    }
  }, [isAudioLoading, isAudioPlaying, onLoadAudio, reflection.audio?.url, startPlayback]);

  const runAction = async (key: ActionKey, action?: () => Promise<void> | void, successMessage?: string) => {
    if (!action) return;
    setBusyAction(key);
    setStatusMessage('');
    try {
      await action();
      if (successMessage) setStatusMessage(successMessage);
    } catch {
      setStatusMessage('Could not complete this action.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleTafsirClick = () => {
    setIsTafsirOpen((current) => !current);
    void runAction('tafsir', onLoadTafsir);
  };

  const reciteButtonLabel = isAudioLoading ? 'Loading…' : isAudioPlaying ? 'Pause' : 'Recite';

  const syncBadge =
    reflection.syncState === 'local' || reflection.syncState === 'pending' ? (
      <span className={`ayah-sync-state ayah-sync-${reflection.syncState}`}>
        {reflection.syncState === 'local' ? 'Local only' : 'Sync pending'}
      </span>
    ) : null;

  return (
    <article className="ayah-card" translate="no">
      <div className="ayah-card-header">
        <span className="ayah-reference">{reflection.surahName} {reflection.verseKey}</span>
        {syncBadge}
      </div>

      <QulArabicText
        verseKey={reflection.verseKey}
        fallbackText={reflection.arabicText}
        className="ayah-arabic"
        variant="card"
      />

      <div className="ayah-translation">
        <TranslationWithFootnotes
          text={reflection.translation}
          footnotes={reflection.footnotes}
        />
      </div>

      <div className="ayah-reflection-copy">
        <p className="ayah-reflection-lead">{reflection.reflection}</p>
        <details className="ayah-details ayah-why-details">
          <summary className="ayah-details-summary">
            <span className="ayah-details-chevron inline-block text-neutral-600 transition-transform duration-150 text-[10px] leading-none -ml-0.5 mr-1">▶</span>
            Why this verse
          </summary>
          <p className="ayah-why-body">{reflection.whyThisVerse}</p>
        </details>
      </div>

      <div className="ayah-actions-primary">
        <button
          type="button"
          className="ayah-save-button"
          onClick={onSave}
          disabled={isSaving || reflection.syncState === 'synced'}
        >
          {getSaveLabel(reflection, isSaving)}
        </button>
      </div>

      <div className="ayah-toolbar" role="toolbar" aria-label="Reflection tools">
        <button
          type="button"
          className="ayah-toolbar-button"
          onClick={handleTafsirClick}
          disabled={busyAction === 'tafsir'}
          aria-expanded={isTafsirOpen}
        >
          {isTafsirOpen ? 'Hide tafsir' : 'Tafsir'}
        </button>
        <button
          type="button"
          className="ayah-toolbar-button"
          onClick={() => void handleReciteClick()}
          disabled={isAudioLoading}
          aria-busy={isAudioLoading}
          aria-pressed={isAudioPlaying}
        >
          {reciteButtonLabel}
        </button>
        <button
          type="button"
          className="ayah-toolbar-button"
          onClick={() => runAction('alternate', onShowAlternate)}
          disabled={!onShowAlternate || busyAction === 'alternate'}
        >
          Other ayah
        </button>
        <button
          type="button"
          className="ayah-toolbar-button"
          onClick={() => runAction('share', onShare, 'Share card copied.')}
          disabled={!onShare || busyAction === 'share'}
        >
          Copy card
        </button>
      </div>

      {reflection.audio?.reciterName ? (
        <p className="ayah-recite-meta" translate="no">
          {reflection.audio.reciterName}
        </p>
      ) : null}

      {isTafsirOpen && (
        <section className="ayah-expandable-panel" aria-label="Tafsir">
          <div className="ayah-panel-heading">
            <strong>Tafsir</strong>
            {reflection.tafsir?.resourceName && <span>{reflection.tafsir.resourceName}</span>}
          </div>
          {reflection.tafsir?.text ? (
            <div className="ayah-tafsir-body">
              {tafsirParagraphs.map((paragraph, index) => (
                <p className="ayah-tafsir-paragraph" key={`${index}-${paragraph}`}>{paragraph}</p>
              ))}
            </div>
          ) : (
            <p>{busyAction === 'tafsir' ? 'Loading tafsir...' : 'Tafsir is not available yet.'}</p>
          )}
        </section>
      )}

      <details className="ayah-details ayah-extras-details">
        <summary className="ayah-details-summary">
          <span className="ayah-details-chevron inline-block text-neutral-600 transition-transform duration-150 text-[10px] leading-none -ml-0.5 mr-1">▶</span>
          Note, collection, feedback
        </summary>
        <div className="ayah-extras-body">
          <section className="ayah-note-panel">
            <label htmlFor={`ayah-note-${reflection.id}`}>Note</label>
            <textarea
              id={`ayah-note-${reflection.id}`}
              value={noteBody}
              onChange={(event) => setNoteBody(event.target.value)}
              placeholder="Optional..."
              rows={2}
            />
            <button
              type="button"
              className="ayah-secondary-button ayah-extras-button"
              onClick={() => runAction('note', () => onSaveNote?.(noteBody), 'Note saved.')}
              disabled={!onSaveNote || busyAction === 'note' || noteBody.trim().length < 6}
            >
              Save note
            </button>
            {reflection.note?.syncState && (
              <span className="ayah-inline-state">Note {reflection.note.syncState}</span>
            )}
          </section>

          <div className="ayah-form-row">
            <label htmlFor={`ayah-collection-${reflection.id}`}>Collection</label>
            <select
              id={`ayah-collection-${reflection.id}`}
              defaultValue=""
              onChange={(event) => {
                if (!event.target.value) return;
                void runAction('collection', () => onAddToCollection?.(event.target.value), 'Collection updated.');
              }}
              disabled={!onAddToCollection || busyAction === 'collection' || collections.length === 0}
            >
              <option value="">Choose…</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>{collection.name}</option>
              ))}
            </select>
          </div>

          <div className="ayah-feedback-row" aria-label="Relevance feedback">
            <span className="ayah-feedback-label">Fit?</span>
            <button
              type="button"
              className={reflection.feedback?.value === 'relevant' ? 'ayah-feedback-active ayah-feedback-compact' : 'ayah-secondary-button ayah-feedback-compact'}
              onClick={() => runAction('feedback', () => onFeedback?.('relevant'), 'Feedback saved.')}
              disabled={!onFeedback || busyAction === 'feedback'}
            >
              Yes
            </button>
            <button
              type="button"
              className={reflection.feedback?.value === 'not_relevant' ? 'ayah-feedback-active ayah-feedback-compact' : 'ayah-secondary-button ayah-feedback-compact'}
              onClick={() => runAction('feedback', () => onFeedback?.('not_relevant'), 'Feedback saved.')}
              disabled={!onFeedback || busyAction === 'feedback'}
            >
              No
            </button>
          </div>
        </div>
      </details>

      {isSaved && reflection.syncState !== 'synced' && (
        <p className="ayah-save-note">Sign in to sync this bookmark with Quran Foundation.</p>
      )}
      {statusMessage && <p className="ayah-message">{statusMessage}</p>}
    </article>
  );
}
