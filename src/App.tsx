import { useState } from 'react';
import { Home } from './pages/Home';
import { Record } from './pages/Record';
import { Playback } from './pages/Playback';
import { ROOT_FOLDER } from './db';

export type Route =
  | { page: 'home'; folderId: string }
  | { page: 'record'; folderId: string }
  | { page: 'scene'; sceneId: string; folderId: string };

export function App() {
  const [route, setRoute] = useState<Route>({ page: 'home', folderId: ROOT_FOLDER });

  switch (route.page) {
    case 'home':
      return <Home folderId={route.folderId} navigate={setRoute} />;
    case 'record':
      return <Record folderId={route.folderId} navigate={setRoute} />;
    case 'scene':
      return <Playback sceneId={route.sceneId} folderId={route.folderId} navigate={setRoute} />;
  }
}
