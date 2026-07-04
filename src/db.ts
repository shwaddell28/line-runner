import Dexie, { type EntityTable } from 'dexie';

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

export interface LineSegment {
  /** seconds from the start of the recording */
  start: number;
  end: number;
}

export interface Scene {
  id: string;
  /** '' means the scene lives at the root (no folder) */
  folderId: string;
  name: string;
  createdAt: number;
  mimeType: string;
  audioBlob: Blob;
  /** seconds */
  duration: number;
  /** "my line" intervals, sorted by start */
  segments: LineSegment[];
}

export const db = new Dexie('line-runner') as Dexie & {
  folders: EntityTable<Folder, 'id'>;
  scenes: EntityTable<Scene, 'id'>;
};

db.version(1).stores({
  folders: 'id, createdAt',
  scenes: 'id, folderId, createdAt'
});

export const ROOT_FOLDER = '';

export function newId(): string {
  return crypto.randomUUID();
}

export async function createFolder(name: string): Promise<Folder> {
  const folder: Folder = { id: newId(), name, createdAt: Date.now() };
  await db.folders.add(folder);
  return folder;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  await db.folders.update(id, { name });
}

/** Deletes the folder and every scene inside it. */
export async function deleteFolder(id: string): Promise<void> {
  await db.transaction('rw', db.folders, db.scenes, async () => {
    await db.scenes.where('folderId').equals(id).delete();
    await db.folders.delete(id);
  });
}

export async function createScene(scene: Omit<Scene, 'id' | 'createdAt'>): Promise<Scene> {
  const full: Scene = { ...scene, id: newId(), createdAt: Date.now() };
  await db.scenes.add(full);
  return full;
}

export async function renameScene(id: string, name: string): Promise<void> {
  await db.scenes.update(id, { name });
}

export async function deleteScene(id: string): Promise<void> {
  await db.scenes.delete(id);
}
