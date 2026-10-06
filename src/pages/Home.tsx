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
import { useCallback, useState } from 'react';
import type { Route } from '../App';
import { formatClock } from '../format';
import { useBackHandler } from '../useSwipeBack';
import { Icon } from '../components/Icon';
import { SwipeRow } from '../components/SwipeRow';

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
  // Only one row's Edit/Delete is revealed at a time.
  const [openRow, setOpenRow] = useState<string | null>(null);
  const rowOpenProps = (id: string) => ({
    open: openRow === id,
    onOpenChange: (open: boolean) => setOpenRow((cur) => (open ? id : cur === id ? null : cur))
  });

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
  const showSectionLabels = atRoot && !!folders?.length && !!scenes?.length;

  return (
    <div className="page">
      <header className="page-header">
        {!atRoot && (
          <button className="icon-btn" onClick={goToRoot} aria-label="Back">
            <Icon name="back" />
          </button>
        )}
        <div className="title-stack">
          {!atRoot && <span className="title-eyebrow">Folder</span>}
          <h1>{atRoot ? 'Line Runner' : (folder?.name ?? '')}</h1>
        </div>
      </header>

      <div className="toolbar">
        <button className="btn primary" onClick={() => navigate({ page: 'record', folderId })}>
          <Icon name="plus" /> New Scene
        </button>
        {atRoot && (
          <button className="btn" onClick={onNewFolder}>
            <Icon name="folderPlus" /> New Folder
          </button>
        )}
      </div>

      {empty && (
        <p className="empty-note">
          No scenes yet. Tap <strong>New Scene</strong> to record your first one — hold the big
          button whenever you’re speaking your own line.
        </p>
      )}

      {!!folders?.length && (
        <section className="list-section">
          {showSectionLabels && <h2 className="section-label">Folders</h2>}
          <ul className="item-list">
            {folders.map((f) => {
              const count = sceneCounts?.[f.id] ?? 0;
              return (
                <SwipeRow
                  key={f.id}
                  name={f.name}
                  {...rowOpenProps(f.id)}
                  onSelect={() => navigate({ page: 'home', folderId: f.id })}
                  onEdit={() => {
                    setOpenRow(null);
                    void onRenameFolder(f.id, f.name);
                  }}
                  onDelete={() => {
                    setOpenRow(null);
                    void onDeleteFolder(f.id, f.name, count);
                  }}
                >
                  <span className="item-icon">
                    <Icon name="folder" />
                  </span>
                  <span className="item-text">
                    <span className="item-name">{f.name}</span>
                    <span className="item-sub">
                      {count} scene{count === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span className="item-chevron">
                    <Icon name="forward" />
                  </span>
                </SwipeRow>
              );
            })}
          </ul>
        </section>
      )}

      {!!scenes?.length && (
        <section className="list-section">
          {showSectionLabels && <h2 className="section-label">Scenes</h2>}
          <ul className="item-list">
            {scenes.map((s) => (
              <SwipeRow
                key={s.id}
                name={s.name}
                {...rowOpenProps(s.id)}
                onSelect={() => navigate({ page: 'scene', sceneId: s.id, folderId })}
                onEdit={() => {
                  setOpenRow(null);
                  void onRenameScene(s.id, s.name);
                }}
                onDelete={() => {
                  setOpenRow(null);
                  void onDeleteScene(s.id, s.name);
                }}
              >
                <span className="item-icon scene">
                  <Icon name="play" />
                </span>
                <span className="item-text">
                  <span className="item-name">{s.name}</span>
                  <span className="item-sub">
                    {formatClock(s.duration)} · {s.segments.length} line
                    {s.segments.length === 1 ? '' : 's'} ·{' '}
                    {new Date(s.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric'
                    })}
                  </span>
                </span>
                <span className="item-chevron">
                  <Icon name="forward" />
                </span>
              </SwipeRow>
            ))}
          </ul>
        </section>
      )}

      {!loading && !empty && (
        <p className="list-hint">Swipe a row left to rename or delete</p>
      )}
    </div>
  );
}
