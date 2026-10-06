import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ROOT_FOLDER } from '../db';
import {
  FAST_RATE,
  ScenePlayer,
  type LineHandling,
  type PlaybackOptions,
  type PlayerState
} from '../audio/player';
import { Timeline } from '../components/Timeline';
import { Icon } from '../components/Icon';
import { useWakeLock } from '../useWakeLock';
import { useBackHandler } from '../useSwipeBack';
import { formatClock } from '../format';
import type { Route } from '../App';

interface Props {
  sceneId: string;
  folderId: string;
  navigate: (route: Route) => void;
}

const LINE_CHOICES: { value: LineHandling; label: string }[] = [
  { value: 'play', label: 'Hear them' },
  { value: 'gap', label: 'Gap' },
  { value: 'gapReplay', label: 'Gap + replay' }
];

const LINES_KEY = 'line-runner:lines';
const FAST_KEY = 'line-runner:fast';
/** Pre-redesign single-mode preference, read once as a fallback. */
const LEGACY_MODE_KEY = 'line-runner:playbackMode';
const LEGACY_MODES: Record<string, PlaybackOptions> = {
  raw: { lines: 'play', fast: false },
  gapsRepeat: { lines: 'gapReplay', fast: false },
  fastGapsRepeat: { lines: 'gapReplay', fast: true },
  fastGaps: { lines: 'gap', fast: true }
};

function loadOptions(): PlaybackOptions {
  try {
    const lines = localStorage.getItem(LINES_KEY);
    if (lines && LINE_CHOICES.some((c) => c.value === lines)) {
      return { lines: lines as LineHandling, fast: localStorage.getItem(FAST_KEY) === '1' };
    }
    const legacy = LEGACY_MODES[localStorage.getItem(LEGACY_MODE_KEY) ?? ''];
    if (legacy) return legacy;
  } catch {
    // Storage unavailable (e.g. private mode) — fall back to default.
  }
  return { lines: 'play', fast: false };
}

function describeOptions({ lines, fast }: PlaybackOptions): string {
  const speed = fast ? ` at ${FAST_RATE}×` : '';
  switch (lines) {
    case 'play':
      return `The whole scene as recorded${speed}.`;
    case 'gap':
      return `Silence where your lines are — say them yourself.${fast ? ` Others at ${FAST_RATE}×; gaps stay full length.` : ''}`;
    case 'gapReplay':
      return `Say your line in the gap, then hear it to check yourself.${fast ? ` Audio at ${FAST_RATE}×; gaps stay full length.` : ''}`;
  }
}

const AUTO_NEXT_KEY = 'line-runner:autoNext';
/** Pause on the "Up next" card before the next scene starts. */
const AUTO_NEXT_DELAY_MS = 2000;

function loadAutoNext(): boolean {
  try {
    return localStorage.getItem(AUTO_NEXT_KEY) === '1';
  } catch {
    return false;
  }
}

function savePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore — remembering preferences is best-effort.
  }
}

export function Playback({ sceneId, folderId, navigate }: Props) {
  // undefined = still loading, null = scene missing/deleted
  const scene = useLiveQuery(async () => (await db.scenes.get(sceneId)) ?? null, [sceneId]);
  const folderScenes = useLiveQuery(
    () => db.scenes.where('folderId').equals(folderId).sortBy('createdAt'),
    [folderId]
  );
  const folderName = useLiveQuery(
    async () => (folderId === ROOT_FOLDER ? '' : ((await db.folders.get(folderId))?.name ?? '')),
    [folderId]
  );
  const [options, setOptions] = useState<PlaybackOptions>(loadOptions);
  const [autoNext, setAutoNext] = useState(loadAutoNext);
  const [state, setState] = useState<PlayerState>({
    status: 'idle',
    position: 0,
    playingMyLine: false
  });
  const playerRef = useRef<ScenePlayer | null>(null);
  // Set when navigating to another scene that should start playing on load.
  const autoStartRef = useRef(false);

  const currentIndex = folderScenes?.findIndex((s) => s.id === sceneId) ?? -1;
  const nextScene = currentIndex >= 0 ? folderScenes?.[currentIndex + 1] : undefined;

  const active = state.status === 'playing' || state.status === 'gap';
  const advancing = autoNext && state.status === 'ended' && nextScene !== undefined;
  useWakeLock(active || advancing);

  const goBack = useCallback(
    () => navigate({ page: 'home', folderId }),
    [navigate, folderId]
  );
  useBackHandler(goBack);

  useEffect(() => {
    if (!scene) return;
    const player = new ScenePlayer(scene.audioBlob, scene.duration, scene.segments, setState);
    player.setOptions(options);
    playerRef.current = player;
    if (autoStartRef.current) {
      autoStartRef.current = false;
      player.play();
    }
    return () => {
      playerRef.current = null;
      player.destroy();
    };
    // Recreate only when the underlying recording changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene?.id, scene?.audioBlob]);

  const goToScene = useCallback(
    (id: string, autoStart: boolean) => {
      autoStartRef.current = autoStart;
      // Leave 'ended' now so auto-advance doesn't re-fire while the next scene loads.
      playerRef.current?.stop();
      navigate({ page: 'scene', sceneId: id, folderId });
    },
    [navigate, folderId]
  );

  useEffect(() => {
    if (!advancing || !nextScene) return;
    const timer = setTimeout(() => goToScene(nextScene.id, true), AUTO_NEXT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [advancing, nextScene, goToScene]);

  const updateOptions = (next: PlaybackOptions) => {
    setOptions(next);
    savePref(LINES_KEY, next.lines);
    savePref(FAST_KEY, next.fast ? '1' : '0');
    playerRef.current?.setOptions(next);
  };

  const toggleAutoNext = () => {
    setAutoNext(!autoNext);
    savePref(AUTO_NEXT_KEY, autoNext ? '0' : '1');
  };

  const togglePlay = () => {
    const player = playerRef.current;
    if (!player) return;
    if (active) {
      player.pause();
    } else if (state.status === 'ended') {
      player.stop();
      player.play();
    } else {
      player.play();
    }
  };

  if (scene === undefined) {
    return <div className="page" />;
  }
  if (scene === null) {
    return (
      <div className="page">
        <p className="empty-note">Scene not found.</p>
      </div>
    );
  }

  const lineCount = scene.segments.length;
  const { position } = state;
  const currentSegment = scene.segments.find((s) => position >= s.start && position < s.end);
  const linesReached = scene.segments.filter((s) => position >= s.start).length;
  const yourTurn = state.status === 'gap';
  const segmentProgress = currentSegment
    ? (position - currentSegment.start) / (currentSegment.end - currentSegment.start)
    : 0;

  let eyebrow = '';
  let headline: string;
  let detail = '';
  let tone: 'quiet' | 'listening' | 'mine' = 'quiet';
  if (yourTurn) {
    eyebrow = `Line ${linesReached} of ${lineCount}`;
    headline = 'Your line';
    detail = 'Say it now';
    tone = 'mine';
  } else if (state.playingMyLine) {
    eyebrow = `Line ${linesReached} of ${lineCount}`;
    headline = 'Your line';
    detail = 'Replay — how did you do?';
    tone = 'mine';
  } else if (active) {
    eyebrow = lineCount > 0 ? `Line ${linesReached} of ${lineCount}` : '';
    headline = currentSegment ? 'Your line' : 'Listening';
    tone = currentSegment ? 'mine' : 'listening';
  } else if (advancing) {
    eyebrow = 'Up next';
    headline = nextScene.name;
  } else if (state.status === 'ended') {
    eyebrow = 'Curtain';
    headline =
      autoNext && folderScenes && folderScenes.length > 1 ? 'End of folder' : 'End of scene';
    detail = 'Press play to run it again';
  } else if (state.status === 'paused') {
    eyebrow = lineCount > 0 ? `Line ${linesReached} of ${lineCount}` : '';
    headline = 'Paused';
  } else {
    eyebrow = 'Places';
    headline = 'Ready';
    detail = `${lineCount} line${lineCount === 1 ? '' : 's'} · ${formatClock(scene.duration)}`;
  }

  return (
    <div className={`page practice${yourTurn ? ' your-turn' : ''}`}>
      <header className="page-header">
        <button className="icon-btn" onClick={goBack} aria-label="Back">
          <Icon name="back" />
        </button>
        <div className="title-stack">
          {folderName && <span className="title-eyebrow">{folderName}</span>}
          <h1>{scene.name}</h1>
        </div>
      </header>

      <section className={`stage tone-${tone}`} aria-live="polite">
        {eyebrow && <span className="stage-eyebrow">{eyebrow}</span>}
        <span className="stage-headline">{headline}</span>
        {detail && <span className="stage-detail">{detail}</span>}
        {yourTurn && (
          <div className="gap-meter" aria-hidden="true">
            <div className="gap-meter-fill" style={{ transform: `scaleX(${1 - segmentProgress})` }} />
          </div>
        )}
      </section>

      <div className="scrubber">
        <Timeline
          duration={scene.duration}
          segments={scene.segments}
          position={position}
          onSeek={(t) => playerRef.current?.seek(t)}
        />
        <div className="time-row">
          <span>{formatClock(position)}</span>
          <span>{formatClock(scene.duration)}</span>
        </div>
      </div>

      <div className="transport">
        <button
          className="round-btn"
          onClick={() => playerRef.current?.stop()}
          aria-label="Restart"
        >
          <Icon name="restart" />
        </button>
        <button className="round-btn play" onClick={togglePlay} aria-label={active ? 'Pause' : 'Play'}>
          <Icon name={active ? 'pause' : 'play'} />
        </button>
        <button
          className="round-btn"
          onClick={() => nextScene && goToScene(nextScene.id, active || advancing)}
          disabled={!nextScene}
          aria-label="Next scene"
        >
          <Icon name="next" />
        </button>
      </div>

      <section className="settings">
        <div className="setting">
          <span className="setting-label">Your lines</span>
          <div className="segmented" role="radiogroup" aria-label="Your lines">
            {LINE_CHOICES.map((c) => (
              <button
                key={c.value}
                role="radio"
                aria-checked={options.lines === c.value}
                className={options.lines === c.value ? 'selected' : ''}
                onClick={() => updateOptions({ ...options, lines: c.value })}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="setting">
          <span className="setting-label">Speed</span>
          <div className="segmented" role="radiogroup" aria-label="Speed">
            {[false, true].map((fast) => (
              <button
                key={String(fast)}
                role="radio"
                aria-checked={options.fast === fast}
                className={options.fast === fast ? 'selected' : ''}
                onClick={() => updateOptions({ ...options, fast })}
              >
                {fast ? `${FAST_RATE}×` : '1×'}
              </button>
            ))}
          </div>
        </div>
        <p className="setting-caption">{describeOptions(options)}</p>
        <button
          role="switch"
          aria-checked={autoNext}
          className={`switch-row${autoNext ? ' on' : ''}`}
          onClick={toggleAutoNext}
        >
          <span>Auto-play next scene</span>
          <span className="switch-track" aria-hidden="true">
            <span className="switch-thumb" />
          </span>
        </button>
      </section>
    </div>
  );
}
