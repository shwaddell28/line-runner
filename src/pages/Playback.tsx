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

export function Playback({ sceneId, folderId, navigate }: Props) {
  // undefined = still loading, null = scene missing/deleted
  const scene = useLiveQuery(async () => (await db.scenes.get(sceneId)) ?? null, [sceneId]);
  const [mode, setMode] = useState<PlaybackMode>('raw');
  const [state, setState] = useState<PlayerState>({
    status: 'idle',
    position: 0,
    playingMyLine: false
  });
  const playerRef = useRef<ScenePlayer | null>(null);

  const active = state.status === 'playing' || state.status === 'gap';
  useWakeLock(active);

  const goBack = useCallback(
    () => navigate({ page: 'home', folderId }),
    [navigate, folderId]
  );
  useBackHandler(goBack);

  useEffect(() => {
    if (!scene) return;
    const player = new ScenePlayer(scene.audioBlob, scene.duration, scene.segments, setState);
    playerRef.current = player;
    return () => {
      playerRef.current = null;
      player.destroy();
    };
    // Recreate only when the underlying recording changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene?.id, scene?.audioBlob]);

  const selectMode = (m: PlaybackMode) => {
    setMode(m);
    playerRef.current?.setMode(m);
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
      </div>

      <div className={`now-banner${state.status === 'gap' ? ' your-turn' : ''}`}>
        {state.status === 'gap'
          ? '🎤 YOUR LINE — say it now'
          : state.playingMyLine
            ? '🔁 Your line, played back'
            : active
              ? 'Playing…'
              : state.status === 'ended'
                ? 'Finished'
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
