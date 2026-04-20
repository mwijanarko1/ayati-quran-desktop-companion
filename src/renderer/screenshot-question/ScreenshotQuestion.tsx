import React, { useCallback, useEffect, useState } from 'react';

import { AyahVerseCard } from './AyahVerseCard';

type CaptureState = 'checking' | 'permission' | 'capturing' | 'analyzing' | 'ready' | 'error';

function getErrorMessage(error: unknown): string {
  const ipcErrorPrefix = /^Error invoking remote method '[^']+': Error:\s*/;

  if (error instanceof Error && error.message.trim()) {
    return error.message.replace(ipcErrorPrefix, '');
  }

  if (typeof error === 'string' && error.trim()) {
    return error.replace(ipcErrorPrefix, '');
  }

  return 'Ayati - Quran Desktop Companion could not create a reflection right now.';
}

export function ScreenshotQuestion(): JSX.Element {
  const [captureState, setCaptureState] = useState<CaptureState>('checking');
  const [reflection, setReflection] = useState<AyahReflection | null>(null);
  const [collections, setCollections] = useState<AyahCollection[]>([]);
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const captureReflection = useCallback(async () => {
    setReflection(null);
    setMessage('');
    setCaptureState('checking');

    const permissionStatus = await window.ayati.getScreenCapturePermission();
    if (permissionStatus === 'denied' || permissionStatus === 'restricted') {
      setCaptureState('permission');
      return;
    }

    try {
      setCaptureState('capturing');
      setCaptureState('analyzing');
      const nextReflection = await window.ayati.captureAyahReflection();
      setReflection(nextReflection);
      setCaptureState('ready');
      if (nextReflection.syncState === 'local') {
        setMessage('Screenshot analyzed locally. The image was not stored.');
      }
    } catch (error) {
      setCaptureState('error');
      setMessage(getErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    void captureReflection();
    window.ayati.getAyahCollections?.().then(setCollections).catch(() => setCollections([]));
  }, [captureReflection]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        window.ayati.closeScreenshotQuestion();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const saveReflection = useCallback(async () => {
    if (!reflection) return;
    setIsSaving(true);
    setMessage('');

    try {
      const savedReflection = await window.ayati.saveAyahReflection(reflection.id);
      if (savedReflection) {
        setReflection(savedReflection);
        setMessage(
          savedReflection.syncState === 'synced'
            ? 'Saved to Quran Foundation bookmarks.'
            : 'Saved locally. Sign in to sync with Quran Foundation.',
        );
      }
    } catch {
      setMessage('Could not save this reflection.');
    } finally {
      setIsSaving(false);
    }
  }, [reflection]);

  const updateCurrentReflection = useCallback((nextReflection: AyahReflection | null) => {
    if (nextReflection) {
      setReflection(nextReflection);
    }
  }, []);

  const loadTafsir = useCallback(async () => {
    if (!reflection) return;
    updateCurrentReflection(await window.ayati.getAyahTafsir(reflection.id));
  }, [reflection, updateCurrentReflection]);

  const loadAudio = useCallback(async () => {
    if (!reflection) return;
    updateCurrentReflection(await window.ayati.getAyahAudio(reflection.id));
  }, [reflection, updateCurrentReflection]);

  const saveNote = useCallback(async (body: string) => {
    if (!reflection) return;
    updateCurrentReflection(await window.ayati.saveAyahReflectionNote(reflection.id, body));
  }, [reflection, updateCurrentReflection]);

  const addToCollection = useCallback(async (collectionId: string) => {
    if (!reflection) return;
    updateCurrentReflection(await window.ayati.addReflectionToCollection(reflection.id, collectionId));
  }, [reflection, updateCurrentReflection]);

  const setFeedback = useCallback(async (value: 'relevant' | 'not_relevant') => {
    if (!reflection) return;
    updateCurrentReflection(await window.ayati.setReflectionFeedback(reflection.id, value));
  }, [reflection, updateCurrentReflection]);

  const showAlternate = useCallback(async () => {
    if (!reflection) return;
    const alternate = await window.ayati.showAlternateAyah(reflection.id);
    if (alternate) {
      setReflection(alternate);
      setMessage(`Another ayah: ${alternate.surahName} ${alternate.verseKey}`);
      return;
    }
    setMessage('No stronger alternate ayah is available for this reflection.');
  }, [reflection]);

  const copyShareCard = useCallback(async () => {
    if (!reflection) return;
    const copied = await window.ayati.copyReflectionShareCard(reflection.id);
    setMessage(copied ? 'Share card copied.' : 'Could not copy this reflection.');
  }, [reflection]);

  return (
    <div className="screenshot-container ayah-capture-shell">
      <section className="ayah-capture-panel">
        <header className="ayah-capture-header">
          <div>
            <p className="eyebrow">Ayati - Quran Desktop Companion</p>
            <h1>Reflect on Screen</h1>
          </div>
          <button type="button" className="ayah-close-button" onClick={() => window.ayati.closeScreenshotQuestion()}>
            Close
          </button>
        </header>

        {captureState === 'permission' && (
          <div className="ayah-state">
            <h2>Screen Recording is required</h2>
            <p>Enable Ayati - Quran Desktop Companion in System Settings &gt; Privacy &amp; Security &gt; Screen Recording, then try again.</p>
          </div>
        )}

        {(captureState === 'checking' || captureState === 'capturing' || captureState === 'analyzing') && (
          <div className="ayah-state">
            <div className="capture-spinner" />
            <h2>{captureState === 'analyzing' ? 'Finding a fitting ayah' : 'Preparing capture'}</h2>
            <p>Screenshots are temporary. Ayati - Quran Desktop Companion stores only text reflections.</p>
          </div>
        )}

        {captureState === 'error' && (
          <div className="ayah-state">
            <h2>Reflection unavailable</h2>
            <p>{message}</p>
            <button type="button" className="ayah-secondary-button" onClick={captureReflection}>
              Try Again
            </button>
          </div>
        )}

        {reflection && captureState === 'ready' && (
          <AyahVerseCard
            reflection={reflection}
            collections={collections}
            isSaving={isSaving}
            onSave={saveReflection}
            onLoadTafsir={loadTafsir}
            onLoadAudio={loadAudio}
            onSaveNote={saveNote}
            onAddToCollection={addToCollection}
            onFeedback={setFeedback}
            onShowAlternate={showAlternate}
            onShare={copyShareCard}
          />
        )}

        {message && captureState !== 'error' && <p className="ayah-message">{message}</p>}

        <footer className="ayah-capture-footer">
          <button type="button" className="ayah-secondary-button" onClick={captureReflection} disabled={captureState === 'analyzing'}>
            Reflect Again
          </button>
          <span><kbd>Esc</kbd> closes</span>
        </footer>
      </section>
    </div>
  );
}
