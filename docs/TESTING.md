# Testing

Automated tests mock every external provider. `npm test` does not open a port and does not call Yahoo, the SEC, Finnhub, Alpha Vantage, or The Guardian.

## Commands

```bash
npm run typecheck   # app, server, and test projects
npm test            # vitest, TZ=UTC
npm run test:e2e    # playwright; stubs /api
npm run build
NODE_ENV=production npm run start
```

`npm run lint` is the same TypeScript check as `npm run typecheck`. There is no separate formatter.

## What the suites cover

- Decimal half-up rounding, canonical quantities, and USD formatting
- FIFO buys, partial sells, fee slices, dust lots, same-timestamp ordering, oversells, missing and stale quotes, fractional shares
- Position sizing, stop validation, cash and concentration caps, reward-to-risk
- Demo snapshot: AAPL realized `$314.00`, VTI unrealized omitted, portfolio unrealized omitted
- IndexedDB round-trip, Zod rejection of numeric quantities, single portfolio, default settings
- JSON replace/merge, schema rejection, CSV notes, holdings-import warnings
- Provider selection, Finnhub zeros, Alpha Vantage limit notes, Yahoo markup, Guardian filtering, SEC User-Agent and CIK miss
- Portfolio screen oversell, and news page making no feed request while sources are off
- Playwright: empty start, demo persistence, oversell, manual quote, replace-import, command palette, theme, narrow viewport

## Latest local run

Recorded after the implementation fixes on 2026-10-19:

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed (app, server, and tests) |
| `npm test` | 9 files, 36 tests passed |
| `npm run test:e2e` | 6 tests passed |
| `npm run build` | Passed. Vite warned that the JS chunk is about 500 kB. |
| `NODE_ENV=production npm run start` | `/api/health` returned quotes `none`, yahoo `true`, edgar `false`, guardian `false`. `/` and `/calculator` returned 200. |
