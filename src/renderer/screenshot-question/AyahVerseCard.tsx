import React from 'react';

import type { AyahReflection } from '../../main/ayah-types';

interface AyahVerseCardProps {
  reflection: AyahReflection;
  isSaving?: boolean;
  onSave: () => void;
}

function getSaveLabel(reflection: AyahReflection, isSaving: boolean): string {
  if (isSaving) return 'Saving...';
  if (reflection.syncState === 'synced') return 'Saved to Quran Foundation';
  if (reflection.syncState === 'pending') return 'Pending sync';
  if (reflection.savedAt) return 'Saved locally';
  return 'Save Bookmark';
}

export function AyahVerseCard({ reflection, isSaving = false, onSave }: AyahVerseCardProps): JSX.Element {
  const isSaved = Boolean(reflection.savedAt) || reflection.syncState === 'synced' || reflection.syncState === 'pending';

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

      <button
        type="button"
        className="ayah-save-button"
        onClick={onSave}
        disabled={isSaving || reflection.syncState === 'synced'}
      >
        {getSaveLabel(reflection, isSaving)}
      </button>

      {isSaved && reflection.syncState !== 'synced' && (
        <p className="ayah-save-note">Sign in to sync this bookmark with Quran Foundation.</p>
      )}
    </article>
  );
}
