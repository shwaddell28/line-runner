# Line Runner

A pocket app for learning acting lines. Record a scene reading every part aloud,
hold the big button while speaking **your own** lines, then drill with playback
modes that replace your lines with silent gaps.

## How it works

1. **Record** — on the New Scene screen, start recording and read the whole scene.
   Press and hold the yellow button for the duration of each of *your* lines,
   release for everyone else's.
2. **Practice** — pick a playback mode:
   - **Play raw** — the recording, straight through.
   - **Gaps + repeat** — a silent gap where your line goes (say it!), then your
     recorded line plays so you can check yourself.
   - **Fast, gaps + repeat** — everyone else at 1.75× (pitch-preserved), the gap
     stays full length so you can speak at normal pace, then your line plays at 1.75×.
   - **Fast, gaps only** — others at 1.75×, a gap for your line, no repeat.

Scenes can be organized into folders from the landing page. Everything is stored
on-device (IndexedDB) — no accounts, no server, works offline once installed.

## Development

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build to dist/
npm run icons      # regenerate PWA icons into public/
```

## Using it on your iPhone

The microphone requires a secure (HTTPS) context, so a plain LAN dev server won't work.

- **Quick test on the phone:** `npm run dev:https`, then open the printed
  `https://<your-mac-ip>:5173` on the phone and accept the certificate warning
  (self-signed cert via vite-plugin-basic-ssl).
- **For real use:** deploy `dist/` to any static host (Netlify, Vercel, GitHub
  Pages, Cloudflare Pages), open it in Safari, then **Share → Add to Home Screen**.
  It installs as a standalone app with an icon and works offline.

> Storage is per-browser: recordings live in Safari's IndexedDB for that site.
> Deleting the site's data (or the home-screen app) deletes the recordings.

## Architecture notes

- `src/audio/recorder.ts` — MediaRecorder wrapper; hold-button marks are stored as
  `{start, end}` second offsets relative to the recording start.
- `src/audio/player.ts` — compiles the scene's segments into a chunk schedule
  (`audio` / `silence` chunks) per mode and drives a single `HTMLAudioElement`.
  A media element (not Web Audio) is used so `playbackRate` preserves pitch at 1.75×.
- `src/db.ts` — Dexie schema; audio stored as Blobs. `folderId: ''` means root
  (IndexedDB can't index `null`).
