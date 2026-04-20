import React, { useState } from 'react';

import type { AyahCollection, AyahReflection } from '../../main/ayah-types';

interface AyahVerseCardProps {
  reflection: AyahReflection;
  collections?: AyahCollection[];
  isSaving?: boolean;
  onSave: () => void;
  onLoadTafsir?: () => Promise<void> | void;
  onLoadAudio?: () => Promise<void> | void;
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

type ActionKey = 'tafsir' | 'audio' | 'note' | 'collection' | 'feedback' | 'alternate' | 'share';

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
  const [isAudioOpen, setIsAudioOpen] = useState(false);
  const [noteBody, setNoteBody] = useState(reflection.note?.body ?? '');
  const [busyAction, setBusyAction] = useState<ActionKey | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

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

  const handleAudioClick = () => {
    setIsAudioOpen((current) => !current);
    void runAction('audio', onLoadAudio);
  };

  return (
    <article className="ayah-card" translate="no">
      <div className="ayah-card-header">
        <span className="ayah-reference">{reflection.surahName} {reflection.verseKey}</span>
        <span className={`ayah-sync-state ayah-sync-${reflection.syncState}`}>{reflection.syncState}</span>
      </div>

      <p className="ayah-arabic" dir="rtl" lang="ar">
        {reflection.arabicText}
      </p>

      <p className="ayah-translation">{reflection.translation}</p>

      <div className="ayah-reflection-copy">
        <p>{reflection.reflection}</p>
        <p><strong>Why this verse:</strong> {reflection.whyThisVerse}</p>
      </div>

      <div className="ayah-action-grid">
        <button
          type="button"
          className="ayah-save-button"
          onClick={onSave}
          disabled={isSaving || reflection.syncState === 'synced'}
        >
          {getSaveLabel(reflection, isSaving)}
        </button>
        <button
          type="button"
          className="ayah-secondary-button"
          onClick={handleTafsirClick}
          disabled={busyAction === 'tafsir'}
        >
          {isTafsirOpen ? 'Hide Tafsir' : 'Show Tafsir'}
        </button>
        <button
          type="button"
          className="ayah-secondary-button"
          onClick={handleAudioClick}
          disabled={busyAction === 'audio'}
        >
          {isAudioOpen ? 'Hide Recitation' : 'Play Recitation'}
        </button>
        <button
          type="button"
          className="ayah-secondary-button"
          onClick={() => runAction('alternate', onShowAlternate)}
          disabled={!onShowAlternate || busyAction === 'alternate'}
        >
          Show Another Ayah
        </button>
        <button
          type="button"
          className="ayah-secondary-button"
          onClick={() => runAction('share', onShare, 'Share card copied.')}
          disabled={!onShare || busyAction === 'share'}
        >
          Copy Share Card
        </button>
      </div>

      {isTafsirOpen && (
        <section className="ayah-expandable-panel" aria-label="Tafsir">
          <div className="ayah-panel-heading">
            <strong>Tafsir</strong>
            {reflection.tafsir?.resourceName && <span>{reflection.tafsir.resourceName}</span>}
          </div>
          <p>{reflection.tafsir?.text ?? (busyAction === 'tafsir' ? 'Loading tafsir...' : 'Tafsir is not available yet.')}</p>
        </section>
      )}

      {isAudioOpen && (
        <section className="ayah-expandable-panel" aria-label="Recitation">
          <div className="ayah-panel-heading">
            <strong>Recitation</strong>
            {reflection.audio?.reciterName && <span>{reflection.audio.reciterName}</span>}
          </div>
          {reflection.audio?.url ? (
            <audio aria-label="Recitation audio" controls src={reflection.audio.url} />
          ) : (
            <p>{busyAction === 'audio' ? 'Loading recitation...' : 'Recitation is not available yet.'}</p>
          )}
        </section>
      )}

      <section className="ayah-note-panel">
        <label htmlFor={`ayah-note-${reflection.id}`}>Reflection Note</label>
        <textarea
          id={`ayah-note-${reflection.id}`}
          value={noteBody}
          onChange={(event) => setNoteBody(event.target.value)}
          placeholder="Add a short note..."
          rows={3}
        />
        <button
          type="button"
          className="ayah-secondary-button"
          onClick={() => runAction('note', () => onSaveNote?.(noteBody), 'Note saved.')}
          disabled={!onSaveNote || busyAction === 'note' || noteBody.trim().length < 6}
        >
          Save Note
        </button>
        {reflection.note?.syncState && (
          <span className="ayah-inline-state">Note {reflection.note.syncState}</span>
        )}
      </section>

      <div className="ayah-form-row">
        <label htmlFor={`ayah-collection-${reflection.id}`}>Save To Collection</label>
        <select
          id={`ayah-collection-${reflection.id}`}
          defaultValue=""
          onChange={(event) => {
            if (!event.target.value) return;
            void runAction('collection', () => onAddToCollection?.(event.target.value), 'Collection updated.');
          }}
          disabled={!onAddToCollection || busyAction === 'collection' || collections.length === 0}
        >
          <option value="">Choose collection</option>
          {collections.map((collection) => (
            <option key={collection.id} value={collection.id}>{collection.name}</option>
          ))}
        </select>
      </div>

      <div className="ayah-feedback-row" aria-label="Relevance feedback">
        <button
          type="button"
          className={reflection.feedback?.value === 'relevant' ? 'ayah-feedback-active' : 'ayah-secondary-button'}
          onClick={() => runAction('feedback', () => onFeedback?.('relevant'), 'Feedback saved.')}
          disabled={!onFeedback || busyAction === 'feedback'}
        >
          Relevant
        </button>
        <button
          type="button"
          className={reflection.feedback?.value === 'not_relevant' ? 'ayah-feedback-active' : 'ayah-secondary-button'}
          onClick={() => runAction('feedback', () => onFeedback?.('not_relevant'), 'Feedback saved.')}
          disabled={!onFeedback || busyAction === 'feedback'}
        >
          Not Relevant
        </button>
      </div>

      {isSaved && reflection.syncState !== 'synced' && (
        <p className="ayah-save-note">Sign in to sync this bookmark with Quran Foundation.</p>
      )}
      {statusMessage && <p className="ayah-message">{statusMessage}</p>}
    </article>
  );
}
