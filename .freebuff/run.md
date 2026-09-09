# Blink Chat — run guide

This project has two Vite apps: the web app (`src/`) and the Framework7 "native"
app (`src/native/`, built with `--mode native`).

## Reproduce the uncommitted artifacts

The env files are gitignored and never committed. Before running anything, create
them locally:

1. **`.env`** — copy from the main checkout (`D:\Development\Blink Chat\.env`), or
   create it blank (the user fills in the real `VITE_FIREBASE_*` values). The agent
   must NOT read or edit `.env`; see AGENTS.md.
2. **`.env-agent`** — mirror of `.env` with the same `VITE_FIREBASE_*` keys but dummy
   placeholder values, for local dev/preview. Swap workflow: to use dummy values,
   rename `.env` → `.env-backup` and `.env-agent` → `.env`; restore by renaming back
   when done.
3. Install dependencies: `npm install`.

## Run the servers

Web app (default port 5173):

```
npm run dev
```

Native Framework7 app (this is where the Blink Native UI lives):

```
npm run dev:native        # dev server, default port 5173
npm run build:native      # production build -> dist-native/
npm run preview:native    # serve the production build (dist-native)
```

To pin a port, append `-- --port <port> --strictPort`, e.g.
`npm run dev:native -- --port 5199 --strictPort`.

Detach on Windows (PowerShell) so the server outlives the shell, writing stdout and
stderr to DIFFERENT files:

```
powershell -NoProfile -Command "(Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev:native','--','--port','5199','--strictPort' -RedirectStandardOutput '<out.log>' -RedirectStandardError '<out.log.err>' -WindowStyle Hidden -PassThru).Id"
```

Confirm it survived with `Get-Process -Id <pid>` and wait until the URL answers
before registering a preview.