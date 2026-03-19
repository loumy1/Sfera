# Sfera Architecture

## Goals

This structure is organized around a few practical rules:

- keep route entry HTML files easy to find
- keep runtime and source code separated
- group client code by domain instead of dumping everything into one folder
- isolate server bootstrap from server runtime parts
- make the project understandable to a new developer in a few minutes

## Folder layout

```text
.
├── docs/
│   └── ARCHITECTURE.md
├── public/
│   ├── index.html
│   ├── item-page.html
│   ├── public-profile.html
│   └── assets/
│       ├── boot/
│       │   ├── app.boot.js
│       │   └── public-profile.boot.js
│       ├── branding/
│       │   └── favicon.svg
│       ├── css/
│       │   └── chunks/
│       ├── js/
│       │   ├── app/chunks/
│       │   └── public-profile/chunks/
│       ├── modules/
│       │   ├── api/
│       │   ├── comments/
│       │   ├── feed/
│       │   ├── i18n/
│       │   ├── player/
│       │   ├── profile/
│       │   ├── publish/
│       │   ├── realtime/
│       │   ├── settings/
│       │   └── ui/
│       ├── pages/
│       │   └── item-page.page.js
│       └── styles/
│           └── main.css
├── src/
│   └── server/
│       ├── bootstrap/
│       │   └── load-runtime.js
│       ├── index.js
│       └── runtime/
│           └── parts/
├── server.js
├── package.json
└── ecosystem.config.js
```

## Frontend conventions

### `public/*.html`

These are route entry documents and should stay shallow and obvious:

- `index.html`
- `item-page.html`
- `public-profile.html`

### `public/assets/boot`

Boot files are responsible for loading runtime chunks and starting the page.

### `public/assets/modules`

Client code is grouped by domain:

- `feed`
- `player`
- `profile`
- `publish`
- `settings`
- `comments`
- `ui`

This makes feature ownership clear and reduces “misc file” sprawl.

### `public/assets/pages`

Page-specific runtime that does not belong to the main app shell goes here.

### `public/assets/styles`

`main.css` is the stylesheet entry point.
Chunked CSS stays isolated under `public/assets/css/chunks` because it already behaves like a runtime split layer.

## Backend conventions

### `server.js`

Only a tiny production entrypoint.
It should stay stable and boring.

### `src/server/index.js`

Main server bootstrap entry.

### `src/server/bootstrap`

Bootstrap helpers live here, including runtime assembly logic.

### `src/server/runtime/parts`

Current backend still runs through runtime parts.
This is a transitional but much cleaner location than `src/server/chunks`.

Future refactor direction:

- split runtime parts into named modules
- extract config, storage, auth, tracks, albums, moderation, messaging, and notifications into explicit files
- replace raw runtime assembly with normal module imports once the code is sufficiently decomposed

## Why this is better

- easier onboarding for new developers
- clearer separation between entrypoints, runtime, modules, and assets
- better mental model for both frontend and backend
- easier future migration to bundling or framework tooling without rewriting the whole tree
