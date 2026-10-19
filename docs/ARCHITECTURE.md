# colossalview architecture

Status: normative structural document. Schema version **1**. Engine version **1**. Dated 2026-10-19.

The app lives at the repository root. `server/` and `src/` are siblings. There is no nested application package.

Accounting rules, work packages, and acceptance tests are in `docs/IMPLEMENTATION_PLAN.md`. This file decides how code is layered, stored, and run. It does not add product surface.

## 1. Layer diagram

```
+---------------------------------------------------------------+
| Browser                                                       |
|  React 19 routes and forms                                    |
|  CSS tokens (light / dark, orange accent, tabular nums)       |
|  src/features/*          src/app/* services                   |
+-----------------------------+---------------------------------+
                              |
              +---------------+----------------+
              |                                |
              v                                v
+---------------------------+    +-------------------------------+
| Domain (pure)             |    | Persistence                   |
| src/domain                |    | src/persistence               |
| FIFO, money, symbols,     |<---| idb + Zod                     |
| concentration, preview    |    | IndexedDB "colossalview" v1   |
+---------------------------+    +-------------------------------+
              ^
              | types and money helpers only
              |
+---------------------------+
| Client API                |
| src/providers/client.ts   |
| fetch("/api/...")         |
+-------------+-------------+
              |
              | same origin
              v
+---------------------------------------------------------------+
| server/index.ts  (Node http, tsx)                             |
|  dev:  Vite proxies /api  ->  127.0.0.1:8787                  |
|  prod: this process also serves dist/ and SPA fallback        |
+--------+------------------+------------------+----------------+
         |                  |                  |
         v                  v                  v
   Quote adapters     News adapters      Filings adapter
   finnhub |          yahoo-rss          sec-edgar
   alphavantage       guardian (optional)
```

The browser never opens IndexedDB on the server, and the server never reads the user's book. Quote and news requests send symbols. They do not send quantities, prices, fees, notes, or article flags.

## 2. Dependency rules

| Module | May import | Must not import |
| --- | --- | --- |
| `src/domain/**` | `decimal.js` | React, `idb`, Zod, `fetch`, `server/**`, CSS |
| `src/persistence/**` | `src/domain` types, Zod, `idb` | React, `server/**`, features |
| `src/app/**` | domain, persistence, `src/providers/client.ts` | `server/**`, `src/demo/dataset.ts` except `src/app/loadDemo.ts` |
| `src/features/**` | `src/app` services, domain types and formatters, CSS | `server/**`, `idb`, `src/demo/dataset.ts` |
| `src/providers/client.ts` | domain symbol helper | provider SDKs, secrets |
| `server/**` | Node built-ins, `fast-xml-parser`, `src/domain/symbols.ts`, `src/domain/money.ts` | React, `src/persistence`, `src/features`, `src/demo` |
| `src/main.tsx`, `src/app/router.tsx` | shell, features, styles | demo dataset |

`loadDemo.ts` is the only module allowed to import `src/demo/dataset.ts`, and only a click handler may call it.

Derived lots and P/L are function results. Features must not keep a second copy that can disagree with `replay`. After every successful write, re-read transactions and quotes and call `replay` again (or use the snapshot the service just computed from the list it wrote).

TypeScript projects:

- `tsconfig.app.json` includes `src/**` and DOM libs. It excludes `server/**`.
- `tsconfig.server.json` includes `server/**` and `src/domain/**` and Node libs. It does not include DOM.

`npm run typecheck` runs both.

## 3. Module map

```
index.html
package.json
vite.config.ts
vitest.config.ts
playwright.config.ts
tsconfig.app.json
tsconfig.server.json
.env.example
public/manifest.webmanifest          # WP10
public/icons/icon-192.png
public/icons/icon-512.png
scripts/dev-all.mjs
server/index.ts                      # http, static, routing
server/limit.ts                      # in-memory buckets
server/cache.ts                      # in-memory TTL
server/quotes/select.ts
server/quotes/finnhub.ts
server/quotes/alphavantage.ts
server/news/yahoo.ts
server/news/guardian.ts
server/filings/edgar.ts
src/main.tsx
src/app/router.tsx
src/app/shell.tsx
src/app/portfolioService.ts
src/app/loadDemo.ts
src/domain/money.ts
src/domain/symbols.ts
src/domain/types.ts
src/domain/errors.ts
src/domain/fifo.ts
src/domain/positions.ts
src/domain/concentration.ts
src/domain/preview.ts
src/persistence/db.ts
src/persistence/schema.ts            # Zod + DBSchema
src/persistence/repositories.ts
src/persistence/migrate.ts
src/import/json.ts
src/import/csv.ts
src/demo/dataset.ts
src/providers/client.ts
src/features/overview/
src/features/portfolio/
src/features/watchlist/
src/features/news/
src/features/calculator/
src/features/symbol/
src/features/settings/
src/features/command-palette/
src/styles/tokens.css
src/styles/global.css
tests/domain/
tests/persistence/
tests/features/
tests/server/
tests/e2e/
```

### Responsibilities

| Path | Responsibility |
| --- | --- |
| `domain/money.ts` | Decimal setup, parse, round, canonical strings, `formatUsd` |
| `domain/symbols.ts` | Canonical ticker regex, shared with the server |
| `domain/fifo.ts` | Sort, lot walk, realized P/L, `replay` |
| `domain/positions.ts` | Join open lots to quotes; portfolio totals; null unrealized |
| `domain/concentration.ts` | Weights and warnings from a snapshot plus threshold |
| `domain/preview.ts` | Buy cost and `previewSell` without persistence |
| `persistence/repositories.ts` | CRUD only. No FIFO |
| `app/portfolioService.ts` | Load, append, edit, delete: replay the candidate list, write only on `ok` |
| `import/json.ts` | Parse, preview, replace, merge. Uses Zod then `replay` |
| `import/csv.ts` | RFC 4180 parse and serialize |
| `providers/client.ts` | `GET /api/health`, `/api/quotes`, `/api/news/*`, `/api/filings` |
| `server/index.ts` | Method and path dispatch, static files, error JSON |

### Presentation

Tokens live in `src/styles/tokens.css`. Components use variables; they do not hard-code a second palette.

```css
:root { /* light tokens */ }
@media (prefers-color-scheme: dark) {
  :root { /* dark tokens */ }
}
:root[data-theme="light"] { /* force light */ }
:root[data-theme="dark"] { /* force dark */ }
```

`system` removes `data-theme` so the media query applies before settings have loaded. `light` and `dark` set the attribute on `documentElement`.

Required variables: `--bg`, `--bg-elevated`, `--fg`, `--fg-muted`, `--border`, `--accent`, `--accent-fg`, `--danger`, `--focus`, `--font-sans`, `--font-mono`, spacing steps, `--radius`.

- `--font-sans`: `system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
- `--font-mono`: `ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`
- `.num`: `font-variant-numeric: tabular-nums lining-nums`
- `.ticker`: `font-family: var(--font-mono)`
- Accent is one orange, used for primary buttons and focus, not for large background fills
- Light and dark share one stylesheet

Shell is a top navigation to every route in the plan, plus a skip link. Below 720px the nav wraps and wide tables scroll horizontally inside their region. Native form controls, styled with tokens. No component library.

### Service flow for a sell

```
form values
  -> portfolioService.preview (domain)
  -> user confirms
  -> portfolioService.commit
       -> repositories read all transactions
       -> append candidate
       -> replay(candidate, quotes)
       -> on ok: one IndexedDB transaction writes the new row
       -> on error: write nothing, return DomainError
  -> UI renders the snapshot from the committed list
```

Edits and deletes use the same commit path with the candidate list. Import replace and demo load write the full set only after `replay` returns `ok`, in one IndexedDB transaction.

## 4. Persistence

| Constant | Value |
| --- | --- |
| Database name | `colossalview` |
| IndexedDB version | `1` |
| `SCHEMA_VERSION` | `1` (import bundles and `Settings.schemaVersion`) |
| `ENGINE_VERSION` | `1` (stored in `meta`, informational) |

`ENGINE_VERSION` does not select a lot cache. Lots are not stored. A future engine change recomputes by calling `replay`.

### Object stores (version 1)

Created in `src/persistence/migrate.ts` when `oldVersion < 1`. Later versions append `if (oldVersion < N)` blocks. They do not recreate stores that already exist.

| Store | Key | Indexes | Value |
| --- | --- | --- | --- |
| `meta` | out-of-line string | none | `schemaVersion` number, `engineVersion` number |
| `portfolios` | `id` | none | `Portfolio` |
| `transactions` | `id` | `byPortfolio` on `portfolioId`, `bySymbol` on `symbol`, `byExecutedAt` on `executedAt` | `Transaction` |
| `quotes` | `symbol` | none | `Quote` |
| `watchlist` | `id` | `bySymbol` on `symbol`, **unique** | `WatchItem` |
| `articleStates` | `id` | none | `ArticleState` |
| `settings` | out-of-line key `"singleton"` | none | `Settings` |

There is no news-body store and no lot store.

Invariants enforced by repositories, not only by the UI:

- Zero or one row in `portfolios`. `createPortfolio` fails if one exists.
- At most one quote per symbol (the key).
- At most one watch item per symbol (unique index).
- Transaction `portfolioId` equals the single portfolio's id.
- Zod `.strict()` on every read and write of the shapes in the plan's data contracts.

`getSettings()` inserts the defaults from the plan when the singleton is missing. That is the only write allowed during a read path. It must not insert a portfolio or the demo.

Import of `schemaVersion !== 1` throws `UNSUPPORTED_SCHEMA_VERSION` before any store is cleared. Unknown future IndexedDB versions are not opened with a destructive fallback; the upgrade function is the only migration path.

`idb` `openDB` types a `DBSchema` in `schema.ts` that matches the table above.

## 5. Provider adapter interfaces

Adapters are server modules. They return normalized DTOs. Vendor field names do not leak past the adapter file. The client never holds an API key.

```ts
type QuoteProviderId = 'finnhub' | 'alphavantage';

interface NormalizedQuote {
  symbol: string;
  price: string;                 // canonical, > 0, ≤ 8 dp, USD
  previousClose: string | null;
  asOf: string;                  // UTC timestamp form
  source: QuoteProviderId;
}

interface QuoteAdapter {
  id: QuoteProviderId;
  fetchQuote(symbol: string): Promise<NormalizedQuote | null>;
  // null = genuine miss (unknown symbol, zero Finnhub placeholder, non-USD)
  // throws AdapterError on transport failure or rate limit
}

interface ArticleDraft {
  source: 'yahoo-rss' | 'sec-edgar' | 'guardian';
  title: string;
  url: string;
  publishedAt: string;
  summary: string;
  symbols: string[];
  filingType: string | null;
  accessionNumber: string | null;
}

interface NewsAdapter {
  id: 'yahoo-rss' | 'guardian';
  fetch(input: { symbol: string; companyName: string | null }): Promise<ArticleDraft[]>;
}

interface FilingsAdapter {
  id: 'sec-edgar';
  fetch(input: { symbol: string }): Promise<{
    articles: ArticleDraft[];
    notice: 'CIK_NOT_FOUND' | null;
    companyName: string | null;
  }>;
}

interface AdapterError {
  code: 'UPSTREAM_RATE_LIMIT' | 'UPSTREAM_UNAVAILABLE' | 'PROVIDER_NOT_CONFIGURED';
  message: string;
}
```

### Selection

```ts
function selectQuoteProvider(env: {
  FINNHUB_API_KEY?: string;
  ALPHA_VANTAGE_API_KEY?: string;
}): QuoteAdapter | null;
```

Non-empty `FINNHUB_API_KEY` → Finnhub, ignoring Alpha Vantage. Otherwise a non-empty `ALPHA_VANTAGE_API_KEY` → Alpha Vantage. Otherwise `null`, and `GET /api/quotes` returns 503 `PROVIDER_NOT_CONFIGURED`.

Guardian's adapter is constructed only when `GUARDIAN_API_KEY` is non-empty. EDGAR's adapter is constructed only when `SEC_USER_AGENT` is non-empty; otherwise `GET /api/filings` returns 503 `SEC_USER_AGENT_REQUIRED` and does not perform DNS lookups.

### Vendor mapping

**Finnhub** `GET https://finnhub.io/api/v1/quote?symbol=&token=`

- Use `c` as price, `pc` as previous close, `t` (unix seconds) as `asOf`
- If `c` is `0` or `t` is `0`, return `null`
- Round price to 8 dp with the domain money helper

**Alpha Vantage** `GET https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=&apikey=`

- If the JSON has `Note` or `Information`, throw `UPSTREAM_RATE_LIMIT`
- Read `Global Quote` / `05. price`, `08. previous close`, `07. latest trading day`
- `asOf` is that date at `T00:00:00.000Z`
- One symbol per request

**Yahoo** primary URL, then at most one fallback if the primary throws or returns non-200:

1. `https://feeds.finance.yahoo.com/rss/2.0/headline?s={symbol}&region=US&lang=en-US`
2. `https://finance.yahoo.com/rss/headline?s={symbol}`

Parse XML with `fast-xml-parser`. Map `item.title`, `item.link`, `item.pubDate`. Strip tags from titles. Drop empty titles and non-http(s) links. `summary` is plain text, truncated to 280 characters, or `""`. On total failure return `[]` and let the route set notice `YAHOO_FEED_UNAVAILABLE` with HTTP 200 so EDGAR can still render. Cache the failure for 15 minutes.

**EDGAR**

1. `GET https://www.sec.gov/files/company_tickers.json` with the SEC headers below. Shape: an object whose values are `{ cik_str: number, ticker: string, title: string }`. Match `ticker` case-insensitively to the canonical symbol.
2. On miss, `GET https://www.sec.gov/files/company_tickers_mf.json` and map the fund class ticker to a CIK. Pin the nesting with a fixture captured at implementation time; do not guess fields without a fixture test.
3. CIK is zero-padded to 10 digits. `GET https://data.sec.gov/submissions/CIK##########.json`
4. Read `filings.recent` parallel arrays (`form`, `filingDate`, `accessionNumber`, `primaryDocument`, `primaryDocDescription`). Take the newest 20.
5. Document URL: `https://www.sec.gov/Archives/edgar/data/{cikInt}/{accessionNoDashes}/{primaryDocument}` where `cikInt` has no leading zeros.
6. `publishedAt` is `filingDate` at `T00:00:00.000Z`. `filingType` is `form`. `title` is `primaryDocDescription` or the form.

Every SEC request sends:

```
User-Agent: <SEC_USER_AGENT value, unchanged>
Accept-Encoding: gzip, deflate
```

The operator supplies the full User-Agent, including a contact email they control. The sample in SEC docs is the pattern `Sample Company Name admin@example.com`. `.env.example` leaves the value empty.

**Guardian** `GET https://content.guardianapis.com/search`

- Query `order-by=newest`, `page-size=20`, `api-key` from the env
- `q` is the SEC company name in quotes when the filings adapter (or a cached ticker map) has one, otherwise the ticker
- Keep a result only when `webTitle` or `trailText` contains the ticker as a token, or contains the company name as a case-insensitive substring
- Token match for a ticker: not preceded or followed by an ASCII letter or digit. `BRK.B` must not match inside a longer ticker. Escape regex metacharacters
- Map `webTitle`, `webUrl`, `webPublicationDate`. `summary` is `trailText` stripped and truncated to 280, or `""`
- If the filter drops every row, return `[]`. Do not backfill with unfiltered hits

### Relevance

There is no score and no sentiment.

An item is relevant to symbol `S` when it was fetched for `S` and survived that source's filter above. `/news` builds "For you" as the union of those results:

- Symbol set: open positions plus watchlist, sorted alphabetically, capped at 30
- Guardian, if enabled: first 10 **held** symbols alphabetically, not the watchlist
- Dedupe key is the article id (`source|url`); merge `symbols` arrays
- Sort: `publishedAt` descending, then symbol ascending, then source order `sec-edgar`, `yahoo-rss`, `guardian`, then `url` ascending

Saved articles stay in the Saved filter even when their symbols are no longer held or watched.

### Cache and buckets

`server/cache.ts` is a process-local `Map` of `{ expiresAt, value }`. TTLs:

| Entry | TTL |
| --- | --- |
| Finnhub quote | 60 seconds |
| Alpha Vantage quote success | 6 hours |
| Yahoo result, including failure | 15 minutes |
| Guardian result | 15 minutes |
| EDGAR submissions per CIK | 15 minutes |
| EDGAR ticker maps | 24 hours |

`server/limit.ts` buckets, enforced before the outbound call:

| Upstream | Bucket |
| --- | --- |
| Finnhub | 60 per rolling minute |
| Alpha Vantage | 1 per 13 seconds, and 25 per UTC day |
| SEC hosts (`www.sec.gov` and `data.sec.gov` share one bucket) | 8 per second |
| Guardian | 1 per second, and 500 per UTC day |
| Yahoo | 2 in flight |

Day buckets reset at UTC midnight and also reset if the process restarts. Settings copy for Alpha Vantage and Guardian says that.

## 6. HTTP surface

Bind `HOST` default `127.0.0.1`, `PORT` default `8787`. JSON errors:

```ts
interface ApiErrorBody {
  error: { code: string; message: string };
}
```

| Method and path | Success | Failure |
| --- | --- | --- |
| `GET /api/health` | `{ ok: true, providers: { quotes: "finnhub" \| "alphavantage" \| "none", yahoo: true, edgar: boolean, guardian: boolean } }` | — |
| `GET /api/quotes?symbols=AAPL,MSFT` | `{ provider, quotes: NormalizedQuote[], missing: string[], limited: string[] }` | 400 `INVALID_SYMBOL` or `TOO_MANY_SYMBOLS` (max 30); 503 if no provider; 429 if the bucket is empty before any fetch |
| `GET /api/news/yahoo?symbol=AAPL` | `{ source: "yahoo-rss", symbol, articles, notice: string \| null }` | 400 `INVALID_SYMBOL` |
| `GET /api/filings?symbol=AAPL` | `{ source: "sec-edgar", symbol, articles, notice: "CIK_NOT_FOUND" \| null, companyName: string \| null }` | 503 `SEC_USER_AGENT_REQUIRED`; 400 `INVALID_SYMBOL` |
| `GET /api/news/guardian?symbol=AAPL` | `{ source: "guardian", symbol, articles, notice: null }` | 503 `PROVIDER_NOT_CONFIGURED` when the key is unset |
| Any other `/api/*` | — | 404 JSON |
| Non-GET `/api/*` | — | 405 JSON |

`yahoo: true` on health means the code path exists. It does not mean the user enabled the source. `edgar` and `guardian` reflect whether the env vars are non-empty. The body never contains keys, the User-Agent, or symbols.

A quotes batch that hits the bucket mid-loop returns 200 with the symbols already fetched in `quotes` and the rest in `limited`. It does not fail the whole response after a partial success.

Production static:

- `NODE_ENV=production` only
- Files from `dist/` relative to the process working directory
- `/api` is resolved before static lookup
- A path with no file falls back to `dist/index.html`
- `Cache-Control: no-cache` on `index.html`. Hashed Vite assets use Vite's default fingerprinted names
- `X-Content-Type-Options: nosniff` on every response

Development does not serve `dist/`. Vite serves the client and proxies `/api`.

Log line shape: `METHOD /path-template STATUS`. Do not log the query string, request headers, or upstream URLs that contain keys.

## 7. Privacy

- No user accounts and no analytics SDK.
- The book (transactions, notes, fees, quantities, manual quotes, watch notes, saved articles, settings) stays in IndexedDB on the device.
- The server process stores none of that. Its memory holds public-market responses keyed by symbol, plus rate-limit counters.
- Symbols leave the machine only after the user sets `quoteMode` to `live` or enables a news source, and then only for the symbols they hold, watch, or open.
- Those first-run switches default to off. Demo data is a separate, explicit action and is never loaded from `main.tsx`.
- Export files are plaintext JSON or CSV. The export screen says that.
- `.env` is gitignored. `.env.example` lists names only.
- The SEC User-Agent email is sent to the SEC. It is chosen by the operator and is not collected from a second user, because this build has one operator.
- Do not register a service worker. A manifest does not cache `/api`.

## 8. How to run

Requirements: Node `>= 20`, npm. From the repository root.

### Development

Two processes. Secrets are read by the server only.

```bash
npm install
cp .env.example .env   # optional; leave keys empty for a fully local book

# both processes
npm run dev:all

# or split
npm run dev:server     # tsx server/index.ts, 127.0.0.1:8787
npm run dev            # vite, proxies /api to 8787
```

Open `http://127.0.0.1:5173`. Edit React against Vite. Edit `server/` against `tsx`. The API is same-origin through the proxy, so the browser does not need CORS. Do not add a permissive CORS middleware.

`dev:server` is `tsx watch server/index.ts` (or `tsx` without watch if watch is noisy; `dev:all` must restart the server when `server/` changes).

### Tests and production

```bash
npm run typecheck
npm test
npm run test:e2e
npm run build          # vite build -> dist/
NODE_ENV=production npm run start
```

`start` is `NODE_ENV=production tsx server/index.ts`. Open `http://127.0.0.1:8787`. The same process serves the built client and `/api`. Set `HOST` only when you intend to bind beyond loopback.

Playwright starts `dev:server` and `dev` itself and stubs `/api`, so `npm run test:e2e` does not need keys and does not call Yahoo, SEC, Finnhub, Alpha Vantage, or The Guardian.

### Environment

| Variable | Required | Effect when empty |
| --- | --- | --- |
| `FINNHUB_API_KEY` | no | Quote provider falls through to Alpha Vantage or `none` |
| `ALPHA_VANTAGE_API_KEY` | no | Ignored when Finnhub is set |
| `GUARDIAN_API_KEY` | no | Guardian route returns 503 |
| `SEC_USER_AGENT` | no | Filings route returns 503 and does not call SEC |
| `PORT` | no | `8787` |
| `HOST` | no | `127.0.0.1` |
| `NODE_ENV` | for prod | Anything other than `production` skips static serving |

Empty string and unset are the same. The server reads the environment itself. Vite must not inject these into the client bundle. Do not prefix them with `VITE_`.

## 9. Invariants the structure is there to protect

These are implemented only in `src/domain` and covered by `tests/domain`. The UI displays their results. A restatement, not a second definition (the definition is in the plan):

- Long only. A sell with quantity greater than the open quantity does not write.
- FIFO walk, buys before sells at one timestamp, then `id`.
- Buy fee enters lot basis. Sell fee reduces that sell's proceeds once.
- Full lot close removes the exact remaining basis. Partial close uses 8 dp half-up.
- Reported money is 2 dp half-up at the boundary in the plan.
- Missing quote → null market value and null unrealized P/L for that position. Cost is not a substitute price.
- Portfolio unrealized total is null while any open position has no quote.
- `replay` does not mutate the transaction array it was given.

Screen copy on the overview and on position detail states the product limits: FIFO only, no corporate actions, not tax advice, USD only, unrealized omitted without a quote.
