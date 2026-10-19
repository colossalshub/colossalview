# colossalview

A personal investing command center for one portfolio of long stocks and ETFs. It tracks buys and sells with FIFO accounting, sizes a hypothetical long position, keeps a watchlist, and can show headlines and SEC filings. It is a research tool, not a brokerage: there is no order entry and no account.

Portfolio data stays in this browser (IndexedDB). Optional quote and news calls go through a small local server so API keys are not shipped to the browser.

## Requirements

- Node.js 20 or newer
- npm

## Run

```bash
npm install
cp .env.example .env   # optional; leave keys empty for a fully local book
npm run dev:all
```

Open http://127.0.0.1:5173.

Split processes, if you prefer:

```bash
npm run dev:server   # http://127.0.0.1:8787
npm run dev          # Vite, proxies /api to 8787
```

Production, from this folder after a build:

```bash
npm run build
NODE_ENV=production npm run start
```

Open http://127.0.0.1:8787. The same process serves the built app and `/api`.

## What works without keys

- Manual holdings, FIFO profit and loss, import and export
- Manual prices with a timestamp and a stale label after 24 hours
- Position calculator
- Watchlist with manual tickers
- Light, dark, and system themes

Live prices, SEC filings, and Guardian headlines stay off until you add the matching variable in `.env` and turn the source on in Settings. Yahoo headlines are unofficial and also stay off until you enable them. See `docs/DATA_SOURCES.md`.

## Checks

```bash
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Details and the latest results are in `docs/TESTING.md`.

## Privacy

The book is not uploaded. Clearing site data or losing the browser profile deletes it, so export a JSON copy from Settings when it matters. Exports are plaintext and do not include API keys.
