import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  ROOT_FOLDER,
  type Folder,
  createFolder,
  renameFolder,
  deleteFolder,
  renameScene,
  deleteScene
} from '../db';
import { useCallback } from 'react';
import type { Route } from '../App';
import { formatClock } from '../format';
import { useBackHandler } from '../useSwipeBack';

interface Props {
  folderId: string;
  navigate: (route: Route) => void;
}

export function Home({ folderId, navigate }: Props) {
  const atRoot = folderId === ROOT_FOLDER;
  const folder = useLiveQuery(
    async () => (atRoot ? undefined : db.folders.get(folderId)),
    [folderId]
  );
  const folders = useLiveQuery(
    async (): Promise<Folder[]> =>
      atRoot ? db.folders.orderBy('createdAt').toArray() : [],
    [folderId]
  );
  const scenes = useLiveQuery(
    () => db.scenes.where('folderId').equals(folderId).sortBy('createdAt'),
    [folderId]
  );
  const goToRoot = useCallback(
    () => navigate({ page: 'home', folderId: ROOT_FOLDER }),
    [navigate]
  );
  useBackHandler(atRoot ? null : goToRoot);

  const sceneCounts = useLiveQuery(async () => {
    if (!atRoot) return {};
    const counts: Record<string, number> = {};
    await db.scenes.each((s) => {
      counts[s.folderId] = (counts[s.folderId] ?? 0) + 1;
    });
    return counts;
  }, [folderId]);

  const onNewFolder = async () => {
    const name = window.prompt('Folder name');
    if (name?.trim()) await createFolder(name.trim());
  };

  const onRenameFolder = async (id: string, current: string) => {
    const name = window.prompt('Rename folder', current);
    if (name?.trim()) await renameFolder(id, name.trim());
  };

  const onDeleteFolder = async (id: string, name: string, count: number) => {
    const suffix = count > 0 ? ` and the ${count} scene${count === 1 ? '' : 's'} inside it` : '';
    if (window.confirm(`Delete “${name}”${suffix}?`)) await deleteFolder(id);
  };

  const onRenameScene = async (id: string, current: string) => {
    const name = window.prompt('Rename scene', current);
    if (name?.trim()) await renameScene(id, name.trim());
  };

  const onDeleteScene = async (id: string, name: string) => {
    if (window.confirm(`Delete “${name}”? The recording can’t be recovered.`)) {
      await deleteScene(id);
    }
  };

  const loading = scenes === undefined || folders === undefined;
  const empty = !loading && scenes.length === 0 && folders.length === 0;

  return (
    <div className="page">
      <header className="page-header">
        {!atRoot && (
          <button
            className="icon-btn"
            onClick={() => navigate({ page: 'home', folderId: ROOT_FOLDER })}
            aria-label="Back"
          >
            ‹
          </button>
        )}
        <h1>{atRoot ? 'Line Runner' : (folder?.name ?? '')}</h1>
      </header>

      <div className="toolbar">
        <button className="btn primary" onClick={() => navigate({ page: 'record', folderId })}>
          ＋ New Scene
        </button>
        {atRoot && (
          <button className="btn" onClick={onNewFolder}>
            📁 New Folder
          </button>
        )}
      </div>

      {empty && (
        <p className="empty-note">
          No scenes yet. Tap <strong>New Scene</strong> to record your first one — hold the big
          button whenever you’re speaking your own line.
        </p>
      )}

      <ul className="item-list">
        {folders?.map((f) => (
          <li key={f.id} className="item-row">
            <button
              className="item-main"
              onClick={() => navigate({ page: 'home', folderId: f.id })}
            >
              <span className="item-name">📁 {f.name}</span>
              <span className="item-sub">
                {sceneCounts?.[f.id] ?? 0} scene{(sceneCounts?.[f.id] ?? 0) === 1 ? '' : 's'}
              </span>
            </button>
            <button
              className="icon-btn"
              onClick={() => onRenameFolder(f.id, f.name)}
              aria-label={`Rename ${f.name}`}
            >
              ✎
            </button>
            <button
              className="icon-btn danger"
              onClick={() => onDeleteFolder(f.id, f.name, sceneCounts?.[f.id] ?? 0)}
              aria-label={`Delete ${f.name}`}
            >
              🗑
            </button>
          </li>
        ))}
        {scenes?.map((s) => (
          <li key={s.id} className="item-row">
            <button
              className="item-main"
              onClick={() => navigate({ page: 'scene', sceneId: s.id, folderId })}
            >
              <span className="item-name">🎬 {s.name}</span>
              <span className="item-sub">
                {formatClock(s.duration)} · {s.segments.length} line
                {s.segments.length === 1 ? '' : 's'} ·{' '}
                {new Date(s.createdAt).toLocaleDateString()}
              </span>
            </button>
            <button
              className="icon-btn"
              onClick={() => onRenameScene(s.id, s.name)}
              aria-label={`Rename ${s.name}`}
            >
              ✎
            </button>
            <button
              className="icon-btn danger"
              onClick={() => onDeleteScene(s.id, s.name)}
              aria-label={`Delete ${s.name}`}
            >
              🗑
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
