import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import {
  MODE_INFO,
  ScenePlayer,
  type PlaybackMode,
  type PlayerState
} from '../audio/player';
import { Timeline } from '../components/Timeline';
import { useWakeLock } from '../useWakeLock';
import { useBackHandler } from '../useSwipeBack';
import { formatClock } from '../format';
import type { Route } from '../App';

interface Props {
  sceneId: string;
  folderId: string;
  navigate: (route: Route) => void;
}

const MODES: PlaybackMode[] = ['raw', 'gapsRepeat', 'fastGapsRepeat', 'fastGaps'];
const MODE_KEY = 'line-runner:playbackMode';

function loadMode(): PlaybackMode {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved && (MODES as string[]).includes(saved)) return saved as PlaybackMode;
  } catch {
    // Storage unavailable (e.g. private mode) — fall back to default.
  }
  return 'raw';
}

const AUTO_NEXT_KEY = 'line-runner:autoNext';
/** Pause on the "Up next" banner before the next scene starts. */
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
  const [mode, setMode] = useState<PlaybackMode>(loadMode);
  const [autoNext, setAutoNext] = useState(loadAutoNext);
  const [state, setState] = useState<PlayerState>({
    status: 'idle',
    position: 0,
    playingMyLine: false
  });
  const playerRef = useRef<ScenePlayer | null>(null);
  // Set when auto-play navigates here, so the next scene starts on load.
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
    player.setMode(mode);
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

  useEffect(() => {
    if (!advancing || !nextScene) return;
    const timer = setTimeout(() => {
      autoStartRef.current = true;
      // Leave 'ended' now so this doesn't re-fire while the next scene loads.
      playerRef.current?.stop();
      navigate({ page: 'scene', sceneId: nextScene.id, folderId });
    }, AUTO_NEXT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [advancing, nextScene, navigate, folderId]);

  const selectMode = (m: PlaybackMode) => {
    setMode(m);
    savePref(MODE_KEY, m);
    playerRef.current?.setMode(m);
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

  return (
    <div className="page">
      <header className="page-header">
        <button
          className="icon-btn"
          onClick={() => navigate({ page: 'home', folderId })}
          aria-label="Back"
        >
          ‹
        </button>
        <h1>{scene.name}</h1>
      </header>

      <div>
        <div className="mode-chips" role="radiogroup" aria-label="Playback mode">
          {MODES.map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={mode === m}
              className={`mode-chip${mode === m ? ' selected' : ''}`}
              onClick={() => selectMode(m)}
            >
              {MODE_INFO[m].label}
            </button>
          ))}
        </div>
        <p className="mode-caption">{MODE_INFO[mode].description}</p>
        <button
          role="switch"
          aria-checked={autoNext}
          className={`auto-next${autoNext ? ' on' : ''}`}
          onClick={toggleAutoNext}
        >
          <span className="auto-next-label">Auto-play next scene</span>
          <span className="auto-next-track" aria-hidden="true">
            <span className="auto-next-thumb" />
          </span>
        </button>
      </div>

      <div className={`now-banner${state.status === 'gap' ? ' your-turn' : ''}`}>
        {state.status === 'gap'
          ? '🎤 YOUR LINE — say it now'
          : state.playingMyLine
            ? '🔁 Your line, played back'
            : active
              ? 'Playing…'
              : advancing
                ? `Up next: ${nextScene.name}`
                : state.status === 'ended'
                  ? autoNext && folderScenes && folderScenes.length > 1
                    ? 'Finished — end of folder'
                    : 'Finished'
                : 'Ready — press Play'}
      </div>

      <Timeline
        duration={scene.duration}
        segments={scene.segments}
        position={state.position}
        onSeek={(t) => playerRef.current?.seek(t)}
      />
      <div className="time-row">
        <span>{formatClock(state.position)}</span>
        <span>{formatClock(scene.duration)}</span>
      </div>

      <div className="transport">
        <button className="btn play" onClick={togglePlay}>
          {active ? '❚❚ Pause' : '▶ Play'}
        </button>
        <button className="btn subtle" onClick={() => playerRef.current?.stop()}>
          ↺ Restart
        </button>
      </div>

      <p className="hint">
        {scene.segments.length} line{scene.segments.length === 1 ? '' : 's'} marked ·{' '}
        {formatClock(scene.duration)} total
      </p>
    </div>
  );
}
