import { useCallback, useEffect, useRef, useState } from 'react';
import { SceneRecorder } from '../audio/recorder';
import { createScene, db, ROOT_FOLDER } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Icon } from '../components/Icon';
import { HoldButton } from '../components/HoldButton';
import { useWakeLock } from '../useWakeLock';
import { defaultSceneName, formatClock } from '../format';
import { useBackHandler } from '../useSwipeBack';
import type { Route } from '../App';

interface Props {
  folderId: string;
  navigate: (route: Route) => void;
}

type Phase = 'idle' | 'recording' | 'saving';

interface MeterSample {
  level: number;
  /** captured while the hold button was down */
  mine: boolean;
}

/** Bars in the rolling level meter (one per tick). */
const METER_BARS = 48;

export function Record({ folderId, navigate }: Props) {
  const [name, setName] = useState(defaultSceneName);
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [lineCount, setLineCount] = useState(0);
  const [meter, setMeter] = useState<MeterSample[]>([]);
  const [error, setError] = useState('');
  const folderName = useLiveQuery(
    async () => (folderId === ROOT_FOLDER ? '' : ((await db.folders.get(folderId))?.name ?? '')),
    [folderId]
  );
  const recorderRef = useRef<SceneRecorder | null>(null);

  useWakeLock(phase === 'recording');

  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setInterval(() => {
      const rec = recorderRef.current;
      if (rec) {
        setElapsed(rec.elapsed);
        setLineCount(rec.segments.length + (rec.holdingLine ? 1 : 0));
        const sample = { level: rec.level, mine: rec.holdingLine };
        setMeter((m) => [...m.slice(-(METER_BARS - 1)), sample]);
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
    setMeter([]);
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

  const discard = useCallback(() => {
    if (recorderRef.current && !window.confirm('Discard this recording?')) return;
    recorderRef.current?.cancel();
    recorderRef.current = null;
    navigate({ page: 'home', folderId });
  }, [navigate, folderId]);
  useBackHandler(discard);

  const recording = phase === 'recording' || phase === 'saving';
  const bars = [...Array(METER_BARS - meter.length).fill(null), ...meter] as (MeterSample | null)[];

  return (
    <div className="page record">
      <header className="page-header">
        <button className="icon-btn" onClick={discard} aria-label="Back">
          <Icon name="back" />
        </button>
        <div className="title-stack">
          {folderName && <span className="title-eyebrow">{folderName}</span>}
          <h1>New Scene</h1>
        </div>
      </header>

      <label className="field">
        <span className="setting-label">Scene name</span>
        <input
          className="text-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Scene name"
          disabled={phase === 'saving'}
        />
      </label>

      {phase === 'idle' && (
        <div className="record-idle">
          <ol className="steps">
            <li>
              <span className="step-num">1</span>
              <span>Read the whole scene aloud — every part.</span>
            </li>
            <li>
              <span className="step-num">2</span>
              <span>
                <strong>Hold</strong> the big button while you speak your own lines.
              </span>
            </li>
            <li>
              <span className="step-num">3</span>
              <span>Release it for everyone else’s.</span>
            </li>
          </ol>
          {error && <p className="error">{error}</p>}
          <div className="record-start">
            <button className="round-btn rec" onClick={startRecording} aria-label="Start recording">
              <Icon name="mic" />
            </button>
            <span className="record-start-label">Start recording</span>
          </div>
        </div>
      )}

      {recording && (
        <div className="record-live">
          <div className="record-status">
            <span className="rec-badge">
              <span className="rec-dot" /> Rec
            </span>
            <span className="record-clock">{formatClock(elapsed)}</span>
            <span className="record-count">
              {lineCount} line{lineCount === 1 ? '' : 's'}
            </span>
          </div>
          <div className="level-meter" aria-hidden="true">
            {bars.map((b, i) => (
              <span
                key={i}
                className={`level-bar${b?.mine ? ' mine' : ''}`}
                style={{ transform: `scaleY(${b ? Math.max(0.06, b.level) : 0.06})` }}
              />
            ))}
          </div>
          <HoldButton
            disabled={phase === 'saving'}
            onHoldStart={() => recorderRef.current?.markLineStart()}
            onHoldEnd={() => recorderRef.current?.markLineEnd()}
          />
          <div className="record-actions">
            <button className="btn subtle" onClick={discard} disabled={phase === 'saving'}>
              Discard
            </button>
            <button className="btn primary" onClick={stopAndSave} disabled={phase === 'saving'}>
              <Icon name="stop" /> {phase === 'saving' ? 'Saving…' : 'Stop & Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
