import { useEffect, useRef, useState } from 'react';
import { SceneRecorder } from '../audio/recorder';
import { createScene } from '../db';
import { HoldButton } from '../components/HoldButton';
import { useWakeLock } from '../useWakeLock';
import { defaultSceneName, formatClock } from '../format';
import type { Route } from '../App';

interface Props {
  folderId: string;
  navigate: (route: Route) => void;
}

type Phase = 'idle' | 'recording' | 'saving';

export function Record({ folderId, navigate }: Props) {
  const [name, setName] = useState(defaultSceneName);
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [lineCount, setLineCount] = useState(0);
  const [error, setError] = useState('');
  const recorderRef = useRef<SceneRecorder | null>(null);

  useWakeLock(phase === 'recording');

  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setInterval(() => {
      const rec = recorderRef.current;
      if (rec) {
        setElapsed(rec.elapsed);
        setLineCount(rec.segments.length + (rec.holdingLine ? 1 : 0));
      }
    }, 100);
    return () => clearInterval(timer);
  }, [phase]);

  // Release the mic if the user navigates away mid-recording.
  useEffect(() => {
    return () => recorderRef.current?.cancel();
  }, []);

  const startRecording = async () => {
    setError('');
    const recorder = new SceneRecorder();
    try {
      await recorder.start();
    } catch {
      setError('Microphone access was denied. Allow mic access for this site and try again.');
      return;
    }
    recorderRef.current = recorder;
    setElapsed(0);
    setLineCount(0);
    setPhase('recording');
  };

  const stopAndSave = async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    setPhase('saving');
    const result = await recorder.stop();
    recorderRef.current = null;
    const scene = await createScene({
      folderId,
      name: name.trim() || defaultSceneName(),
      mimeType: result.mimeType,
      audioBlob: result.blob,
      duration: result.duration,
      segments: result.segments
    });
    navigate({ page: 'scene', sceneId: scene.id, folderId });
  };

  const discard = () => {
    if (phase === 'recording' && !window.confirm('Discard this recording?')) return;
    recorderRef.current?.cancel();
    recorderRef.current = null;
    navigate({ page: 'home', folderId });
  };

  return (
    <div className="page">
      <header className="page-header">
        <button className="icon-btn" onClick={discard} aria-label="Back">
          ‹
        </button>
        <h1>New Scene</h1>
      </header>

      <input
        className="text-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Scene name"
        disabled={phase === 'saving'}
      />

      {phase === 'idle' && (
        <div className="record-idle">
          <p className="hint">
            Read the whole scene aloud — every part. While you speak <strong>your own</strong>{' '}
            lines, press and hold the big button, and release for everyone else’s.
          </p>
          {error && <p className="error">{error}</p>}
          <button className="btn record" onClick={startRecording}>
            ● Start Recording
          </button>
        </div>
      )}

      {(phase === 'recording' || phase === 'saving') && (
        <div className="record-live">
          <div className="record-status">
            <span className="rec-dot" /> {formatClock(elapsed)} · {lineCount} line
            {lineCount === 1 ? '' : 's'} marked
          </div>
          <HoldButton
            disabled={phase === 'saving'}
            onHoldStart={() => recorderRef.current?.markLineStart()}
            onHoldEnd={() => recorderRef.current?.markLineEnd()}
          />
          <button className="btn primary" onClick={stopAndSave} disabled={phase === 'saving'}>
            {phase === 'saving' ? 'Saving…' : '■ Stop & Save'}
          </button>
          <button className="btn subtle" onClick={discard} disabled={phase === 'saving'}>
            Discard
          </button>
        </div>
      )}
    </div>
  );
}
