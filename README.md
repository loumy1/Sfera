# Sfera

> Cinematic independent music platform for tracks, beats, albums, profiles, moderation, and live lyrics.

## What Sfera includes

- artist profiles with avatars, headers, verification badges, public profile pages, and social stats
- publishing for tracks, beats, and albums
- GIF covers and GIF avatars
- comments, likes, dislikes, reposts, playlists, follows, and direct messages
- fullscreen player with queue, lyrics mode, karaoke-style sync, shuffle history, and responsive controls
- live track lyrics with support for plain text, synced lines, and karaoke progression
- admin tools for moderation, support inbox, profile management, storage cleanup, reports, and account actions
- public release pages and public user pages
- custom UI layer, custom dialogs, custom icon system, animated branding, and intro sequence

## Stack

- Node.js
- Vanilla JavaScript
- HTML + CSS
- `busboy` for multipart uploads
- `nodemailer` for mail flows
- JSON file storage for app data
- optional `ffmpeg` for server-side audio processing
- optional `nginx` + `pm2` for production hosting

## Local Start

Requirements:

- Node.js 18+

Install and run:

```bash
npm install
npm start
```

Open:

- [http://localhost:3000](http://localhost:3000)

## Production

Recommended layout:

- app: `/opt/beatoon`
- persistent storage: `/var/lib/beatoon`

Run app:

```bash
HOST=127.0.0.1 PORT=3000 STORAGE_DIR=/var/lib/beatoon npm start
```

If you use PM2:

```bash
pm2 start ecosystem.config.js
pm2 save
```

`nginx` config example is included in:

- [`deploy/nginx/beatoon.conf`](deploy/nginx/beatoon.conf)

## Storage model

This project stores app data in JSON files and media files on disk.

- `data/` stores users, tracks, albums, playlists, sessions, messages, notifications, and other app data
- `uploads/` stores audio, covers, profile media, and related assets
- `tmp/` stores temporary upload and processing files

These folders are intentionally ignored in git where needed, because they contain runtime state and user content.

## Project structure

- [`server.js`](server.js) — thin production entrypoint
- [`src/server/index.js`](src/server/index.js) — server bootstrap entry
- [`src/server/bootstrap`](src/server/bootstrap) — runtime loading and bootstrap helpers
- [`src/server/runtime/parts`](src/server/runtime/parts) — backend runtime parts
- [`public/index.html`](public/index.html) — main app shell
- [`public/item-page.html`](public/item-page.html) — release page
- [`public/public-profile.html`](public/public-profile.html) — public profile page
- [`public/assets/boot`](public/assets/boot) — frontend boot files
- [`public/assets/modules`](public/assets/modules) — browser modules by domain
- [`public/assets/pages`](public/assets/pages) — page-specific scripts
- [`public/assets/styles`](public/assets/styles) — main stylesheet entry
- [`public/assets/branding`](public/assets/branding) — brand assets

See full structure notes in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Notes

- `ffmpeg` is useful for heavier audio workflows
- persistent disk is important in production, otherwise runtime data will be temporary
- if you deploy behind `nginx`, keep static files and `/uploads` served efficiently from the proxy layer

## Status

Sfera is an actively evolving custom music web app. The codebase already includes:

- publishing flows
- admin center
- reports system
- support inbox
- verification badges
- explicit content `E` marker
- fullscreen player and synced lyrics
- public profiles and public release pages

## License

MIT
