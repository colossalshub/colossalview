# colossalview implementation plan

Status: normative planning document. Schema version **1**. Engine version **1**. Dated 2026-10-19.

This repository **is** the app. All paths below are relative to the repository root. Do not create a nested `colossalview/` package. Do not add brokerage linking, options, a chatbot, or multi-user accounts.

`docs/ARCHITECTURE.md` is the structural companion. If the two disagree, this file wins on accounting, import/export, and acceptance behavior. `ARCHITECTURE.md` wins on module boundaries, process layout, and persistence stores.

## Fixed decisions

These were set by the coordinating engineer. Implement them. Do not reopen them.

| Topic | Decision |
| --- | --- |
| Language and UI | TypeScript, React 19, Vite, React Router 7 |
| Tests | Vitest + Testing Library; a small Playwright suite |
| Validation | Zod for persisted records and import payloads |
| Money math | `decimal.js`, `ROUND_HALF_UP`. No binary floating point for quantities or money |
| Persistence | `idb` (IndexedDB). No accounts, no server-side portfolio database |
| Styling | Custom CSS tokens. No component library. No Tailwind |
| Look | Monochrome surfaces, one restrained orange accent, light and dark themes, tabular numerals, system sans, monospace tickers |
| Server | `server/index.ts` on Node `http`, started with `tsx`. Proxies news, filings, and optional quotes. Serves `dist/` in production. Vite proxies `/api` to it in development. Secrets stay in server env |
| Accounting | Long-only stocks and ETFs. FIFO is the only lot method. Buys and sells with fees |
| Quotes | Manual quotes always work. Finnhub or Alpha Vantage only when a server env key exists |
| News | Yahoo Finance per-symbol RSS (unofficial; see evaluation below), SEC EDGAR submissions (official), Guardian Open Platform only when `GUARDIAN_API_KEY` is set. Deterministic relevance. No sentiment model and no generative summary |
| Domain | Pure functions in `src/domain`. No DOM, no IndexedDB, no `fetch` |

Install current stable releases on these majors: `react@^19`, `react-dom@^19`, `react-router@^7`, `vite@^6`, `vitest@^3`, `typescript@^5`, `zod@^3`, plus `decimal.js`, `idb`, `tsx`, `@testing-library/react`, `@testing-library/user-event`, `@playwright/test`, `fake-indexeddb`, and `fast-xml-parser`. Node `>= 20`. `"type": "module"`. TypeScript `strict` and `noUncheckedIndexedAccess`.

## 1. MVP scope

A single person tracks one USD portfolio of long stocks and ETFs on one machine.

The shipped app must let that person:

1. Open an empty book. First launch shows no positions, no demo numbers, and no invented cash balance.
2. Record buys and sells with a per-share price, a fee, and an execution timestamp. A sell larger than the open quantity is rejected and nothing is written.
3. See open lots, remaining cost basis, average cost (labeled as cost, never as a market price), FIFO realized P/L, and unrealized P/L.
4. Enter a manual quote and, after an explicit opt-in, refresh quotes from the one configured provider.
5. See an overview with totals and concentration warnings.
6. Keep a watchlist and start a buy from a watched symbol. Starting a buy does not create a position until the buy is saved.
7. Open a symbol page for a held or watched ticker: quote, position summary if held, headlines, filings.
8. Read a news and filings list, save an article, and mark it read.
9. Preview a buy or sell in the calculator, including FIFO realized P/L for a sell against the current book, without saving.
10. Export and import a versioned JSON bundle, with a preview before any write. Export and import CSV for transactions and for holdings.
11. Load a fixed demo book only after a deliberate control, with a confirm step when the book is not empty.
12. Jump via a command palette, switch theme, and set the concentration threshold.
13. Install the shell from a web app manifest once the routes above exist.

### Routes

| Path | Screen |
| --- | --- |
| `/` | Overview: totals, concentration, top positions, empty state |
| `/portfolio` | Positions and transactions; add buy; add sell |
| `/portfolio/:symbol` | One position. The route parameter is the position id, and that id is the canonical ticker, URL-encoded |
| `/watchlist` | Watched tickers and "Add to portfolio" |
| `/news` | Headlines and filings for held and watched symbols; saved and unread filters |
| `/calculator` | Trade preview. Does not persist |
| `/symbol/:symbol` | Quote, position summary if held, news and filings for that symbol |
| `/settings` | Theme, quotes mode, concentration threshold, news source toggles, import, export, demo |

Unknown paths render a short not-found view with a link to `/`. Client routes are history routes. Production static hosting falls back to `index.html` for non-file, non-`/api` paths.

### Portfolio shape

MVP persists **zero or one** portfolio. The record exists so export has a stable id; the UI has no portfolio switcher, no second book, and no delete-portfolio flow. The portfolio row is created on the first saved transaction, on demo load, or on import. It is not created merely by opening the app. Settings defaults may be written on first read. That settings row is not portfolio data.

`baseCurrency` is always `USD`. There is no FX.

### Copy that must be visible

Overview and position detail must state, in plain sentences:

- Accounting is FIFO, long only, buys and sells, fees included.
- Dividends, splits, and other corporate actions are not applied.
- Figures are not tax advice and do not include wash-sale adjustments.
- Unrealized P/L is omitted when that position has no quote.
- Amounts are USD.

### Yahoo evaluation (closed)

Include Yahoo Finance per-symbol RSS as an **optional, default-off** headline source.

- It is not an official API. The UI must label every Yahoo item: "Unofficial Yahoo Finance headline feed. Not affiliated with Yahoo."
- Fetch on the server only. Store a short plain-text title and link. Do not archive article HTML or bodies.
- Do not scrape Yahoo HTML if the feed is down. Try the primary URL, then one fallback URL (both listed in `ARCHITECTURE.md`). If both fail, return an empty list with notice `YAHOO_FEED_UNAVAILABLE` and keep EDGAR working.
- A settings toggle can turn the source off without a release.

EDGAR is the official source and must function without Yahoo and without Guardian.

## 2. Non-goals

- Brokerage connections, order entry, custody, or account aggregation
- Options, futures, crypto, FX, indices, shorts, margin, or cash balances
- Any lot method other than FIFO; specific-lot picking; average-cost accounting
- Wash sales, tax lots for filing, or tax reports
- Dividends, splits, mergers, spin-offs, or return-of-capital automation
- Multi-portfolio management, sharing, auth, sync, or a hosted portfolio database
- Sentiment, scoring models, embeddings, or generated prose
- Price charts, technical indicators, alerts, email, or push
- A service worker or offline news cache (manifest only)
- Internationalization, non-USD currency, and locale-dependent number parsing
- Tailwind, a component library, Express, and a bundler for the server
- CI workflows, containers, and deploy automation (local commands in §4 are the gate)

## 3. Work packages

Critical path: WP1 → WP2 → WP3 → WP4 → WP5 → WP6 → WP7 → WP9 → WP10. WP8 can start once WP3 is done and can land before WP6. Do not start a later package by forking files owned by an earlier unfinished package.

```
WP1 Scaffold
  └─► WP2 Domain (+ demo fixture numbers)
        └─► WP3 Persistence
              ├─► WP4 Portfolio UI
              │     └─► WP5 Quotes + overview + concentration
              │           └─► WP6 Watchlist + symbol
              │                 └─► WP7 News and filings
              ├─► WP8 Calculator
              └─► WP9 Import / export / demo opt-in
                    └─► WP10 Palette, settings controls, manifest, e2e
```

### WP1 — Scaffold, tokens, routes, server process

Depends on: nothing.

Deliver:

- `package.json` scripts: `dev`, `dev:server`, `dev:all`, `build`, `start`, `typecheck`, `test`, `test:e2e`
- `tsconfig.app.json` (DOM, `src/**`) and `tsconfig.server.json` (`server/**` and `src/domain/**`)
- Vite dev server proxies `/api` to `http://127.0.0.1:8787`
- `scripts/dev-all.mjs` spawns the API and Vite with `node:child_process` (no extra process manager)
- `server/index.ts` answers `GET /api/health`, returns JSON 404 for unknown `/api/*`, and in `NODE_ENV=production` serves `dist/` with SPA fallback
- React Router routes for every path in §1, each rendering its name and an empty-state sentence
- `src/styles/tokens.css` and `global.css` implementing the visual rules in `ARCHITECTURE.md`
- `.gitignore` for `node_modules/`, `dist/`, `.env`, Playwright output
- `.env.example` with the variable names from `ARCHITECTURE.md` and empty values
- README: keep the H1, add the install and run commands from `ARCHITECTURE.md`

Acceptance:

- `npm run typecheck` exits 0
- `npm test` exits 0 (one smoke test is enough in this package)
- `npm run dev:server` then `GET /api/health` returns `{ "ok": true, "providers": { "quotes": "none", "yahoo": true, "edgar": false, "guardian": false } }` when no env keys are set. `yahoo: true` means the adapter exists, not that the user has enabled it
- With the dev proxy up, `/`, `/portfolio`, `/watchlist`, `/news`, `/calculator`, `/settings` render without a console error
- Tokens expose light and dark values, an orange accent, tabular numerals on `.num`, and a monospace stack on `.ticker`

### WP2 — Domain engine

Depends on: WP1.

Deliver `src/domain/` (`money.ts`, `symbols.ts`, `types.ts`, `fifo.ts`, `positions.ts`, `concentration.ts`, `preview.ts`, `errors.ts`) and `src/demo/dataset.ts`. Tests live in `tests/domain/`. No React imports. `replay` and `previewSell` do not mutate their inputs.

Acceptance: `npm test` covers every case in §5 and §7, including the demo fixture numbers in §8. A sell that exceeds open quantity returns `SELL_EXCEEDS_OPEN_QUANTITY` and leaves the input transaction array unchanged.

### WP3 — Persistence

Depends on: WP2.

Deliver `src/persistence/` (`db.ts`, `schema.ts`, `repositories.ts`) and `tests/persistence/` using `fake-indexeddb/auto`. Zod schemas are `.strict()` and match §6. Database name `colossalview`, IndexedDB version **1**, `SCHEMA_VERSION = 1`.

Acceptance:

- Round-trip a buy and a sell through IndexedDB, reopen the database, `replay` the loaded rows, and match the in-memory snapshot
- Stored quantity, price, and fee are canonical strings. A test that writes a JavaScript `number` into those fields fails Zod on read
- Default settings are written on first `getSettings()` and match §6
- `createPortfolio` rejects a second portfolio
- Opening the database does not insert transactions, quotes, watch items, or the demo book

### WP4 — Portfolio UI

Depends on: WP1, WP2, WP3.

Deliver `src/app/portfolioService.ts` and `src/features/portfolio/`. The service builds the next transaction list, calls `replay`, and only then writes, inside one IndexedDB transaction. The screen never stores lots on its own.

Acceptance:

- Add the demo buys through the form (or a test harness around the service) and see remaining quantity and basis
- Selling more than open shows the domain error and does not add a row (Testing Library)
- After reload, the transaction is still there
- `/portfolio/AAPL` shows open lots and the realized figure for that symbol
- Position market value and unrealized P/L render as an em dash when no quote is stored, including when average cost is non-empty
- Edit and delete go through the same replay-then-write path. An edit that would make a later sell oversell is rejected and the previous rows remain

### WP5 — Quotes, overview, concentration

Depends on: WP4 and the server process from WP1.

Deliver `server/quotes/` (`select.ts`, `finnhub.ts`, `alphavantage.ts`, `cache.ts`), `src/providers/client.ts`, and `src/features/overview/`. Manual quotes are edited in the UI and stored locally. Live refresh is a button, not a timer.

Acceptance:

- `selectQuoteProvider` is unit-tested: Finnhub key wins when both keys are set; Alpha Vantage is used only when Finnhub is unset; blank strings are unset; neither key yields `none`
- Finnhub fixture `{ "c": 0, "t": 0 }` becomes a missing quote, not a stored price of 0
- Alpha Vantage fixture with a top-level `Note` or `Information` becomes `UPSTREAM_RATE_LIMIT` and does not store a price
- A non-USD quote is treated as missing (`NON_USD_QUOTE`)
- Locked manual quotes are omitted from the refresh request and are not overwritten
- Overview shows the §8 totals for the demo book: realized `$314.00`, AAPL unrealized `$240.00`, VTI unrealized as an em dash, portfolio unrealized as an em dash, market value `$1,200.00` with an incomplete flag
- Concentration warns on AAPL at the default 25% threshold and says that 1 open position was omitted for a missing quote
- Client quote URLs contain symbols only. They do not contain quantities, prices, fees, or notes

### WP6 — Watchlist and symbol

Depends on: WP5.

Deliver `src/features/watchlist/` and `src/features/symbol/`.

Acceptance:

- Add `MSFT`, reload, still present. A second add of `MSFT` does not create a duplicate
- "Add to portfolio" opens the buy form with `MSFT` filled in and does not insert a transaction until save
- `/symbol/MSFT` works with no position. `/symbol/AAPL` shows the position summary and links to `/portfolio/AAPL`
- `/portfolio/NOPE` for an unknown symbol says there is no position and does not fabricate lots

### WP7 — News and filings

Depends on: WP6.

Deliver `server/news/yahoo.ts`, `server/news/guardian.ts`, `server/filings/edgar.ts`, `server/limit.ts`, `server/cache.ts`, and `src/features/news/`. Fixture tests only; the suite must not call Yahoo, SEC, Finnhub, Alpha Vantage, or The Guardian.

Acceptance:

- EDGAR requests send `User-Agent` from `SEC_USER_AGENT` and `Accept-Encoding: gzip, deflate`. With the variable unset, `GET /api/filings` returns 503 `SEC_USER_AGENT_REQUIRED` and does not call the network (inject a fetch double)
- Ticker → CIK uses `company_tickers.json`, then `company_tickers_mf.json`. Unknown ticker returns an empty list with `CIK_NOT_FOUND`
- Yahoo items render the unofficial label. HTML in titles is stripped. Non-http(s) links are dropped
- Guardian runs only when `GUARDIAN_API_KEY` is set. Results that contain neither the ticker token nor the SEC company name are dropped
- `/news` sort is deterministic (Relevance in `ARCHITECTURE.md`). Saved and read flags survive reload and a symbol leaving the watchlist
- Marking read happens on the outbound click and from an explicit toggle. Save is an explicit toggle
- With every news toggle off, opening `/news` does not request `/api/news` or `/api/filings`

### WP8 — Calculator

Depends on: WP2 and WP3.

Deliver `src/features/calculator/`. It calls `previewSell` / the buy cost helper. It has no write path.

Acceptance:

- Buy preview of 12 shares at `130` with fee `1.00` shows total cost `$1,561.00`
- Sell preview against the demo book for the demo sell shows realized `$314.00` and does not change stored transactions
- A preview sell of 9 AAPL against the demo open quantity of 8 shows `SELL_EXCEEDS_OPEN_QUANTITY` and still does not write
- Standalone preview with no symbol and no book still shows gross, fee, and total cost or net proceeds

### WP9 — Import, export, demo opt-in

Depends on: WP3 and WP4 (portfolio page button). Settings shell from WP1.

Deliver `src/import/json.ts`, `src/import/csv.ts`, `src/app/loadDemo.ts`.

Acceptance:

- A test exports the demo book to JSON, replace-imports that bundle after an extra local transaction, and gets back the transactions, manual quotes, watchlist, article state, and the §8 snapshot. Replace is the only wipe path
- Preview shows schema version, counts, symbols, first and last `executedAt`, and replay realized P/L. Errors block the commit button
- `schemaVersion` other than `1` is rejected with `UNSUPPORTED_SCHEMA_VERSION` and writes nothing
- A bundle that fails `replay` writes nothing
- Merge into an empty database inserts the bundle portfolio. Merge when a different portfolio id already exists returns `PORTFOLIO_ID_MISMATCH` and writes nothing. Merge with the same id upserts by transaction id, then replays; invalid replay writes nothing
- Holdings CSV import preview states that each row becomes a **new buy** and does not recreate sells. Importing the holdings export of an existing book on top of itself is not a lossless restore; the preview says so
- Transactions CSV round-trips `id`, type, fees, and notes that contain commas and quotes
- The demo control is absent from startup. `src/main.tsx` and route modules do not import `src/demo/dataset.ts` (only `loadDemo.ts` does). Loading demo over existing transactions requires confirm and then replaces the book with the fixture

### WP10 — Command palette, settings controls, manifest, e2e

Depends on: WP5 through WP9.

Deliver the palette, the remaining settings controls (theme, concentration threshold, quote mode, news toggles), `public/manifest.webmanifest`, original 192 and 512 PNG icons (a letter mark is enough; no third-party logo), and `tests/e2e/`.

Acceptance:

- Ctrl+K / Meta+K opens the palette. It can go to each route, focus a held or watched symbol, and start a buy. It does not call the network
- Theme `light`, `dark`, and `system` apply `data-theme` as `ARCHITECTURE.md` describes and survive reload
- Manifest is linked from `index.html`. `GET /manifest.webmanifest` returns `name` `colossalview`, `start_url` `/`, and `display` `standalone`
- No service worker is registered
- `npm run test:e2e` passes the cases in §4
- `npm run build && NODE_ENV=production npm run start` serves `/` and `/api/health` on `127.0.0.1:8787`

## 4. Test strategy

Commands, from the repository root:

```bash
npm run typecheck   # tsc -p tsconfig.app.json --noEmit && tsc -p tsconfig.server.json --noEmit
npm test            # vitest run
npm run test:e2e    # playwright test
npm run build       # vite build
```

`npm test` is the domain and integration gate. It must not open a port and must not perform network I/O. Provider tests inject fixture strings and a fetch double.

`fake-indexeddb/auto` is loaded from Vitest setup. Playwright uses a fresh browser context per test (no shared `storageState`). The Playwright web server starts `dev:server` and `dev`. e2e stubs `/api/**` with `page.route` so a missing API key cannot fail the suite.

### Unit and integration (Vitest)

| Area | Required cases |
| --- | --- |
| `money` | Half-up fixtures in §5; canonical strings; reject exponents and binary-float shortcuts |
| `symbols` | `aapl` → `AAPL`; `BRK.B` and `BF-B` accepted; slash, space, and empty rejected |
| `fifo` | Every case in §7, plus demo snapshot §8 |
| `concentration` | 100% weight when only one position is quoted; no warning when unrounded weight is below threshold; no divide-by-zero when nothing is quoted |
| `preview` | Calculator cases from WP8 |
| `quotes select` | Provider precedence |
| `yahoo` / `edgar` / `guardian` | Fixture parse, filters, User-Agent, rate-limit responses |
| persistence | Round-trip, Zod rejection, single portfolio, no silent demo |
| portfolio form | Oversell does not write (Testing Library) |

### End-to-end (Playwright)

1. First load of `/` has no `AAPL` row and no `$314.00`.
2. Load demo, dismiss nothing else, and see AAPL realized `$314.00`, VTI unrealized as an em dash (not `$1,000.00` and not `$200.00`).
3. Reload and the same figures remain.
4. Sell 9 AAPL. The error is visible and the transaction count is unchanged.
5. Set a manual quote on VTI. VTI unrealized becomes a dollar figure. Clear the quote. The unrealized cell is an em dash again.
6. Load the demo, export JSON, add another buy through the form, then replace-import the export from the preview. The extra buy is gone and AAPL realized is `$314.00` again.
7. Command palette navigates to `/calculator`.

Case 6 uses replace-import, which is a production control. Do not add a hidden database-reset hook. Demo load is the other replace path, and it asks for confirmation when the book is not empty.

### Definition of done

`npm run typecheck`, `npm test`, `npm run test:e2e`, and `npm run build` all exit 0. Manual smoke with real keys is optional and is not part of CI-less local gate. There is no CI workflow in this MVP.

## 5. Rounding rules

All quantity and money operations go through `src/domain/money.ts`.

```ts
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
```

`precision` is significant digits, not scale. Every scale rounding also passes the mode explicitly:

```ts
d.toDecimalPlaces(scale, Decimal.ROUND_HALF_UP)
```

`ROUND_HALF_UP` means: round to nearest, and if equidistant, round away from zero. Lock these fixtures:

| Input | Scale | Output |
| --- | --- | --- |
| `1.005` | 2 | `1.01` |
| `1.004` | 2 | `1.00` |
| `-1.005` | 2 | `-1.01` |
| `-1.225` | 2 | `-1.23` |
| `0.5` | 0 | `1` |
| `-0.5` | 0 | `-1` |

Scales:

| Use | Scale | Stored form |
| --- | --- | --- |
| Quantity | at most 8 dp | Canonical string, trailing fractional zeros stripped |
| Price | at most 8 dp | Canonical string, same rules, must be `> 0` |
| Fee and other money totals | 2 dp | Always 2 digits: `0.00`, `5.00`, `314.00` |
| Lot basis (memory only) | 8 dp | Not persisted. Canonical decimal string |
| Reported P/L, market value, displayed money | 2 dp | Produced at the reporting boundary |

Canonical strings are plain decimals: no leading `+`, no exponent, no leading zeros (`0.5` is valid, `00.5` is not). `parseQuantity` / `parsePrice` / `parseFee` accept a non-canonical user input and return the canonical string inside `DomainResult`. Zod on stored data accepts canonical strings only.

Bounds: quantity and price must be `> 0` and `<= 1e12`. Fee must be `>= 0` and `<= 1e12`. More than 8 fractional digits on quantity or price is `INVALID_QUANTITY` or `INVALID_PRICE`. Notes are at most 500 characters.

Timestamps used for FIFO must match `YYYY-MM-DDTHH:MM:SS.sssZ` (UTC, millisecond precision). The UI converts local input to that form before it reaches the domain. String sort is then time sort. Other ISO variants are `INVALID_TIMESTAMP`.

Display helpers in `money.ts` are the only formatters the UI may use:

- `formatMoney` → `314.00` or `-1.01`
- `formatUsd` → `$314.00` or `-$1.01`, with thousands separators inserted on the integer part of that already-rounded string
- `formatQuantity` → canonical quantity string

Do not pass a quantity, price, fee, basis, or P/L through `Number`, `parseFloat`, or `Intl.NumberFormat`. Grouping is string processing of the canonical decimal so tests stay locale-independent.

Reporting boundary (also used for unrealized):

```
marketValue = round2(openQuantity * quotePrice)          // null if no quote
basisForReport = round2(remainingBasis)                  // sum of 8 dp lot bases, then one round
unrealized = marketValue - basisForReport                // null if no quote
```

Subtraction happens after both sides are 2 dp, so the result is exact at 2 dp. Do not round `(qty * price - basis)` in one step; that can differ by one cent from the rule above.

Average cost for display is `round2(remainingBasis / openQuantity)` and is labeled average cost. It is never written into a quote and never used as `marketValue`.

Independent 2 dp rounding of each sell can leave a one-cent residual against the original 2 dp basis. That residual is accepted. Tests assert lot basis at 8 dp and the reported sell total at 2 dp. They must not require rounded per-slice pennies to sum to the reported total.

## 6. Data contracts

These are the persisted and imported shapes. Zod schemas must accept this and reject unknown keys. Decimal fields are strings, never numbers. Optional information uses `""` or `null` as shown, not missing keys, so `exactOptionalPropertyTypes` stays quiet.

### Portfolio

```ts
interface Portfolio {
  id: string;                 // uuid, except the demo id "demo-portfolio"
  name: string;               // 1..80 chars. MVP default "Portfolio"
  baseCurrency: 'USD';
  createdAt: string;          // UTC timestamp form
  updatedAt: string;
}
```

### Transaction

```ts
type TransactionType = 'buy' | 'sell';

interface Transaction {
  id: string;
  portfolioId: string;
  symbol: string;             // canonical ticker
  type: TransactionType;
  quantity: string;           // > 0, ≤ 8 dp
  price: string;              // > 0, ≤ 8 dp, per share
  fee: string;                // ≥ 0, exactly 2 dp, USD
  executedAt: string;
  note: string;               // "" if none, ≤ 500 chars
  createdAt: string;
  updatedAt: string;
}
```

Ids are `crypto.randomUUID()` except demo ids. The domain rejects duplicate ids.

### Quote

```ts
type QuoteSource = 'manual' | 'finnhub' | 'alphavantage';

interface Quote {
  symbol: string;
  price: string;              // > 0, ≤ 8 dp. Never 0
  currency: 'USD';
  asOf: string;               // UTC timestamp. For a daily bar, midnight UTC of that date
  source: QuoteSource;
  previousClose: string | null;
  locked: boolean;            // true when the user saved a manual quote
}
```

One quote per symbol. `locked: true` means live refresh must not overwrite it. Unlocking is an explicit settings/quote action. A missing record means "no quote": market value and unrealized P/L are null. A quote older than a day is still a quote; the UI shows `asOf` and does not expire it back into cost.

There is no persisted lot, position, or P/L row. Those are derived.

### Article

Client display model. `saved` and `read` come from local state, not from the server.

```ts
type ArticleSource = 'yahoo-rss' | 'sec-edgar' | 'guardian';

interface Article {
  id: string;                 // `${source}|${url}`
  source: ArticleSource;
  title: string;
  url: string;                // http or https only
  publishedAt: string;
  summary: string;            // plain text, ≤ 280 chars, "" if none
  symbols: string[];          // canonical tickers this item was kept for
  filingType: string | null;  // EDGAR form, e.g. "10-K"; null otherwise
  accessionNumber: string | null;
  saved: boolean;
  read: boolean;
}
```

Persisted user state (`articleStates` store and the import bundle) is:

```ts
interface ArticleState {
  id: string;
  source: ArticleSource;
  url: string;
  title: string;
  publishedAt: string;
  summary: string;
  symbols: string[];
  filingType: string | null;
  accessionNumber: string | null;
  saved: boolean;
  read: boolean;
  updatedAt: string;
}
```

A row is written when the user saves or marks read, and is kept if the symbol is later removed. Fetched items the user has not touched are not written to IndexedDB. The server cache is memory-only and holds no user flags.

### Settings

```ts
type ThemeSetting = 'system' | 'light' | 'dark';
type QuoteMode = 'manual' | 'live';

interface Settings {
  schemaVersion: 1;
  theme: ThemeSetting;
  concentrationThresholdPct: string; // canonical decimal, 1..100 inclusive, ≤ 2 dp
  quoteMode: QuoteMode;
  newsYahoo: boolean;
  newsEdgar: boolean;
  newsGuardian: boolean;
}
```

Defaults on first read: `schemaVersion` 1, `theme` `system`, `concentrationThresholdPct` `"25"`, `quoteMode` `manual`, all news flags `false`. Live quotes and every news source stay off until the user turns them on. The UI disables `live` when `/api/health` reports `providers.quotes === "none"`, disables EDGAR when `edgar` is false, and disables Guardian when `guardian` is false, and it names the env var that would enable each one.

### Watch item

```ts
interface WatchItem {
  id: string;
  symbol: string;             // unique
  note: string;
  createdAt: string;
}
```

### ImportBundle

```ts
interface ImportBundle {
  schemaVersion: 1;
  app: 'colossalview';
  exportedAt: string;
  portfolio: Portfolio;
  transactions: Transaction[];
  quotes: Quote[];
  watchlist: WatchItem[];
  settings: Settings | null;          // null = leave current settings on replace
  articleStates: ArticleState[];
}
```

JSON is UTF-8. `schemaVersion` is the number `1`, not a string. Replace mode deletes portfolios, transactions, quotes, watchlist, and article states, then writes the bundle. Settings are replaced only when `settings` is non-null. Merge rules are in WP9.

### Supporting types (derived, not stored)

```ts
interface OpenLot {
  lotId: string;              // buy transaction id
  symbol: string;
  acquiredAt: string;
  quantityOpen: string;
  remainingBasis: string;     // 8 dp canonical
}

interface SellSlice {
  lotId: string;
  quantity: string;
  basisRemoved: string;       // 8 dp
  feeAllocated: string;       // 2 dp; informational
}

interface SellResult {
  transactionId: string;
  grossProceeds: string;      // 2 dp
  fee: string;
  netProceeds: string;
  basisRemoved: string;       // 2 dp reported
  realizedPl: string;         // 2 dp
  slices: SellSlice[];
}

interface PositionView {
  symbol: string;
  quantityOpen: string;
  remainingBasis: string;     // 8 dp sum
  averageCost: string | null;
  lots: OpenLot[];
  realizedPl: string;         // 2 dp, "0.00" when none
  quote: Quote | null;
  marketValue: string | null;
  unrealizedPl: string | null;
}

interface PortfolioSnapshot {
  positions: PositionView[];  // symbols that have any transaction, open or flat
  totalRemainingBasis: string;
  totalRealizedPl: string;
  totalMarketValue: string | null;     // sum of positions that have a quote; null if none
  marketValueComplete: boolean;        // false if any open position has no quote
  omittedOpenSymbols: string[];
  totalUnrealizedPl: string | null;    // null unless every open position has a quote
}

interface DomainError {
  code:
    | 'INVALID_SYMBOL'
    | 'INVALID_QUANTITY'
    | 'INVALID_PRICE'
    | 'INVALID_FEE'
    | 'INVALID_TIMESTAMP'
    | 'INVALID_NOTE'
    | 'SELL_EXCEEDS_OPEN_QUANTITY'
    | 'UNKNOWN_TRANSACTION_TYPE'
    | 'DUPLICATE_TRANSACTION_ID'
    | 'BASIS_INVARIANT'
    | 'PORTFOLIO_MISMATCH';
  message: string;
}

type DomainResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: DomainError };

interface ImportPreview {
  schemaVersion: number;
  format: 'json' | 'holdings-csv' | 'transactions-csv';
  mode: 'replace' | 'merge' | 'append';
  portfolioName: string;
  transactionCount: number;
  buyCount: number;
  sellCount: number;
  symbols: string[];
  executedFrom: string | null;
  executedTo: string | null;
  warnings: string[];
  errors: { path: string; message: string }[];
  replayRealizedPl: string | null;
}
```

`SELL_EXCEEDS_OPEN_QUANTITY` messages include the open quantity and the requested quantity in canonical strings.

Import error codes: `UNSUPPORTED_SCHEMA_VERSION`, `INVALID_BUNDLE`, `PORTFOLIO_ID_MISMATCH`, `REPLAY_REJECTED`, `CSV_PARSE_ERROR`.

### CSV

Headers are required. Parsing is RFC 4180 (quoted commas and quotes). Implement a small tested parser in `src/import/csv.ts`; do not add a CSV dependency.

Transactions file:

```
id,symbol,type,quantity,price,fee,executedAt,note
```

`id` may be empty on import; the importer generates a uuid. Export always writes ids. `type` is `buy` or `sell`. Append mode replays existing transactions plus the file. Any error writes nothing.

Holdings import file (opening buys only):

```
symbol,quantity,price,fee,executedAt,note
```

Each row becomes one buy. It does not reconstruct historical sells.

Holdings export file (derived snapshot, not a lossless backup):

```
symbol,quantityOpen,averageCost,remainingBasis,marketValue,unrealizedPl
```

`marketValue` and `unrealizedPl` are empty when no quote exists. Re-importing this file is **not** supported column-for-column. The user re-imports through the holdings import columns. The preview must say that each imported row is a new buy.

## 7. FIFO realized P/L

FIFO is a pure replay of transactions. Lots are not an input.

### Sort

Copy the transactions. Sort by:

1. `executedAt` ascending
2. Same timestamp: all buys before all sells
3. Same timestamp and type: `id` ascending (lexicographic)

Per-symbol lots are independent. The global sort still matters because a same-timestamp buy and sell of one symbol must apply the buy first.

### Buy

A buy opens one lot:

```
basis = round8(quantity * price + fee)
lot = { lotId: transaction.id, quantityOpen: quantity, remainingBasis: basis, acquiredAt: executedAt }
```

The buy fee is inside the basis. It is not a separate expense line.

### Sell

Let `Q` be the sell quantity and `open` the sum of `quantityOpen` for that symbol after earlier transactions only.

If `Q > open`, return `SELL_EXCEEDS_OPEN_QUANTITY`. Do not consume a partial sell. `Q == open` is a full close and is valid.

Walk lots from oldest to newest (`acquiredAt`, then `lotId`). For each lot, take `q = min(lot.quantityOpen, stillNeeded)`.

- If `q == lot.quantityOpen`, `basisRemoved = lot.remainingBasis` (exact, no ratio).
- Otherwise `basisRemoved = round8(lot.remainingBasis * q / lot.quantityOpen)`.

Then `lot.quantityOpen -= q` and `lot.remainingBasis -= basisRemoved`. A full close leaves quantity `0` and basis `0` and drops the lot. A negative basis or a zero quantity with non-zero basis is `BASIS_INVARIANT` (a defect, not a user error).

### Official realized figure for that sell

```
grossProceeds = round2(Q * sellPrice)
netProceeds   = grossProceeds - fee
basisForReport = round2(sum of slice basisRemoved)   // sum at 8 dp, round once
realizedPl    = netProceeds - basisForReport
```

The sell fee reduces proceeds. It is not added to basis.

Fee slices are informational. With slices `q1..qn` summing to `Q` and fee `F`:

- For every slice except the last, `allocated = round2(F * qi / Q)`, clamped so it does not exceed the fee still unallocated
- The last slice gets the remaining fee exactly

Allocated fees sum to `F`. They do not enter the realized formula a second time; `netProceeds` already subtracts `F` once.

### Unrealized

Unrealized P/L uses **remaining** basis of open lots, not the original buy basis of shares already sold.

- No quote record, or a quote rejected as non-USD or zero: `marketValue` and `unrealizedPl` are null
- Otherwise use the formula in §5

Never substitute average cost, last buy price, or remaining basis per share for a missing quote.

Portfolio `totalUnrealizedPl` is null if any **open** position lacks a quote. Flat positions (quantity `0`) do not make the total null. `totalRealizedPl` and `totalRemainingBasis` are always present. `totalMarketValue` sums quoted positions only and `marketValueComplete` is false when any open position was omitted.

### Worked fixture (also the demo sell)

Buys: 10 @ `100` fee `5.00` (basis `1005`), then 10 @ `120` fee `0.00` (basis `1200`). Sell 12 @ `130` fee `1.00`.

- Lot 1 closes in full: quantity `10`, basis removed `1005`
- Lot 2 gives `2`: `round8(1200 * 2 / 10) = 240`, lot remains quantity `8`, basis `960`
- `gross = round2(12 * 130) = 1560.00`
- `net = 1559.00`
- `basisForReport = 1245.00`
- `realizedPl = 314.00`
- Fee slices: `round2(1.00 * 10 / 12) = 0.83`, remainder `0.17`

### Dust fixture (unit test, not demo)

Buy 3 @ `1` fee `0.01`. Basis `round8(3.01) = 3.01`. Sell 1 @ `1` fee `0.00`.

- `basisRemoved = round8(3.01 * 1 / 3) = 1.00333333` (the following digit is `3`, so it does not round up)
- Remaining basis `2.00666667`, quantity `2`
- Reported basis `round2(1.00333333) = 1.00`, gross `1.00`, realized `0.00`
- A later sell of the remaining 2 uses the exact-close branch and removes `2.00666667`
- The two basis removals sum to `3.01`

## 8. Demo fixture

`src/demo/dataset.ts` exports these constants. Ids and timestamps are fixed so tests can assert them. The app must not import this module except from `src/app/loadDemo.ts`, and `loadDemo` runs only from a click handler.

Portfolio id `demo-portfolio`, name `Portfolio`, `baseCurrency` `USD`.

| id | type | symbol | quantity | price | fee | executedAt |
| --- | --- | --- | --- | --- | --- | --- |
| `demo-tx-aapl-buy-1` | buy | AAPL | 10 | 100 | 5.00 | `2024-01-15T15:00:00.000Z` |
| `demo-tx-vti-buy-1` | buy | VTI | 5 | 200 | 0.00 | `2024-03-01T15:00:00.000Z` |
| `demo-tx-aapl-buy-2` | buy | AAPL | 10 | 120 | 0.00 | `2024-06-03T15:00:00.000Z` |
| `demo-tx-aapl-sell-1` | sell | AAPL | 12 | 130 | 1.00 | `2024-11-01T15:00:00.000Z` |

Manual locked quote: AAPL `150`, `asOf` `2024-12-01T21:00:00.000Z`, `previousClose` null. No VTI quote. Watch item id `demo-watch-msft`, symbol `MSFT`.

Expected snapshot:

| Field | Value |
| --- | --- |
| AAPL quantity | `8` |
| AAPL remaining basis | `960` |
| AAPL average cost | `120.00` |
| AAPL market value | `1200.00` |
| AAPL unrealized | `240.00` |
| AAPL realized | `314.00` |
| VTI quantity | `5` |
| VTI remaining basis | `1000` |
| VTI market / unrealized | null |
| VTI realized | `0.00` |
| Total remaining basis | `1960.00` |
| Total realized | `314.00` |
| Total market value | `1200.00`, `marketValueComplete` false, omitted `["VTI"]` |
| Total unrealized | null |

`replay(demoTransactions, demoQuotes)` must return that snapshot. Loading the demo replaces any existing single portfolio and its transactions, quotes, and watchlist with this fixture.

## 9. Technical risks

| Risk | Why it matters | What to do |
| --- | --- | --- |
| FIFO rounding and fee remainder | Slice pennies and 8 dp basis can drift from 2 dp reports | Follow §5 and §7 exactly. Test the demo sell, the dust buy, and half-up negatives. Do not "fix" a one-cent residual by switching to `number` |
| History edits | Inserting an earlier buy changes which lot a later sell consumes | Always replay the full list. Commit only if the whole replay succeeds |
| Same-timestamp ordering | A sell id that sorts before its buy would falsely oversell | Buys before sells at the same timestamp, then id. Test it |
| Missing quotes | Showing cost as price overstates or hides P/L | Null unrealized. Em dash in the UI. Portfolio unrealized total stays null while any open quote is missing |
| Yahoo RSS | Unofficial, may 404, Yahoo terms restrict automated collection and substitute databases | Default off, labeled, titles and links only, 15 minute cache, no HTML scrape, no body archive |
| Alpha Vantage quota | Official free tier is 25 requests **per day**. Over-limit bodies are often HTTP 200 with a `Note` | Use it only when Finnhub is unset. Serialize requests, at least 13 seconds apart, hard-stop at 25 per UTC day, cache successes for 6 hours. Tell the user the daily cap in settings |
| Finnhub free tier | 60 calls/minute, US coverage, personal-use terms. Unknown symbols come back as zeros | Finnhub wins when its key exists. Cache 60 seconds. User-driven refresh only. Treat `c == 0` or `t == 0` as missing. Do not redistribute the data |
| SEC fair access | Missing or generic User-Agent is refused (often 403). Cap is 10 requests/second. Ticker files are not guaranteed complete, especially for some funds | Require `SEC_USER_AGENT`. Stay at or under 8 requests/second. Cache the ticker maps 24 hours and submissions 15 minutes. Surface `CIK_NOT_FOUND` instead of guessing |
| Guardian terms and quota | Non-commercial developer key, 1 call/second and 500 calls/day on the official access page. Attribution required | Default off. Cap, cache, attribute, snippets only, drop irrelevant hits |
| Symbol leakage | Quote and news queries reveal holdings to the upstream and can land in logs | Do not log symbol query strings. Never send quantities, prices, fees, or notes. Default the live features off |
| IndexedDB evolution | A later store change must not destroy the book | Versioned upgrade in `migrate.ts`. Import rejects unknown schema versions. Do not persist derived lots, so an engine change cannot serve stale P/L |
| PWA cache | A service worker that caches `/api` would mix symbols and hide failures | Do not register a service worker in this MVP |
| Corporate actions | A split makes share counts and P/L economically wrong until the user types adjusting buys and sells | Say so on the overview. Do not invent a split assistant in this MVP |

Personal scale (thousands of transactions) is a full in-memory replay. Do not add a stored lot cache to speed it up.

## 10. Licensing and API limits

Re-read provider terms at implementation time. Quotas below were checked against public docs on 2026-10-19.

### Libraries

| Piece | License |
| --- | --- |
| React, React DOM, React Router, Vite, Vitest, Testing Library, Zod, decimal.js, tsx, fast-xml-parser | MIT |
| TypeScript, Playwright | Apache-2.0 |
| idb | ISC |
| fake-indexeddb | MIT (dev only) |

No component library, no Tailwind, no chart library, no sentiment package.

### Upstream

| Source | Role | Limit to enforce | Terms note |
| --- | --- | --- | --- |
| Finnhub `/api/v1/quote` | Optional live quotes | 60 calls/minute on the free tier. Cache 60s per symbol. No polling | Free tier is personal use. US coverage. Key stays on the server |
| Alpha Vantage `GLOBAL_QUOTE` | Optional live quotes, fallback only | 25 requests/day (official free tier). Also space calls by ≥ 13s. Cache 6 hours. Stop until the next UTC day after 25 | Key stays on the server. A `Note` or `Information` field is a limit, not a quote |
| SEC `company_tickers.json`, `company_tickers_mf.json`, `data.sec.gov/submissions/CIK##########.json` | Official filings | ≤ 8 requests/second from this process (policy ceiling is 10/second). Cache maps 24h, submissions 15 min | Declare User-Agent with an app name and a contact email the operator chooses. No fake address. Public-domain data; the SEC does not support script debugging |
| Yahoo `feeds.finance.yahoo.com` RSS, fallback `finance.yahoo.com/rss/headline` | Unofficial headlines | Cache 15 min including failures. At most 2 concurrent fetches | Unofficial. Titles and outbound links only. User can disable. Do not build a headline archive |
| The Guardian `content.guardianapis.com/search` | Optional press | 1 request/second and 500/day, matching the Open Platform developer access page. Cache 15 min | Non-commercial developer key. Attribute "Content via The Guardian Open Platform." Link to the article. Do not store the article body |

Server rate limiting is an in-memory bucket in `server/limit.ts`. When the bucket is empty, return 429 `UPSTREAM_RATE_LIMIT` **without** calling upstream. Guardian and Alpha Vantage day counts reset at UTC midnight and live only in process memory; a restart resets them, which is acceptable for a personal process. Document that in the settings help for those providers so a restart is not mistaken for a fresh paid quota.

Finnhub quote calls are one symbol per HTTP request. A refresh of 30 symbols is 30 calls and fits under 60/minute only if the user does not hammer refresh. The cache and the manual button are the mitigation. Alpha Vantage cannot refresh a 30-symbol book in one day; the settings screen must say that when it is the selected provider.

## 11. Implementation notes that are easy to get wrong

- Create the portfolio row on first real write, not on first paint.
- `totalUnrealizedPl === null` is a valid demo result. Do not coerce it to `0.00`.
- The em dash for missing unrealized is `—` (U+2014), not `0` and not the average cost.
- Server logs include method, path template, and status. They omit the query string.
- `/api` is not a general proxy. Unknown paths return JSON 404. The browser never posts the book to the server.
- Symbol regex is shared with the server via `src/domain/symbols.ts`: after trim and uppercase, `^[A-Z][A-Z0-9.\-]{0,9}$`. Reject `BRK/B` rather than rewriting it.
- Concentration compares the unrounded ratio to the threshold. Display the weight at 2 dp. A position that displays as `25.00%` only because of rounding but is actually below 25 does not warn. Denominator is the sum of **quoted** market values, not cost and not net worth (cash is not modeled).
- "For you" fetches at most 30 symbols, chosen alphabetically from the union of open holdings and the watchlist. Guardian, when enabled, is limited to 10 held symbols, alphabetically. The symbol page still fetches that one symbol.
- News relevance is the filter in `ARCHITECTURE.md`. Do not add a score.
- PWA: manifest and icons only. Do not add `navigator.serviceWorker.register`.
