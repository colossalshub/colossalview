# Data sources

Checked on 2026-10-19 from this environment. The app works with every key empty. Nothing here is a live price unless a quote was saved, and a saved quote older than 24 hours is labeled stale. The entry price is never shown as a market value.

## Quotes

| Provider | Status here | How it is used |
| --- | --- | --- |
| Manual entry | Always available | Stored locally with source `manual`, timestamp, optional previous close, and a lock. Live refresh will not overwrite a lock. |
| Finnhub `/api/v1/quote` | HTTP 401 without a key | Used when `FINNHUB_API_KEY` is non-empty. Wins over Alpha Vantage. Cache 60 seconds. At most 60 calls per rolling minute in this process. A `c` or `t` of 0 is treated as missing, not as a price of 0. Personal-use free tier; US coverage is what Finnhub documents. The key stays on the server. |
| Alpha Vantage `GLOBAL_QUOTE` | The public `demo` key returned an IBM quote. That key is not shipped. | Used only when Finnhub is unset and `ALPHA_VANTAGE_API_KEY` is set. Official free tier is 25 requests per day. This process also spaces calls by at least 13 seconds and caches a success for 6 hours. A JSON `Note` or `Information` field is a limit, not a quote. A restart clears the in-memory daily counter. |

There is no chart series. Unofficial Yahoo chart endpoints responded in a probe and are intentionally not used.

## News and filings

| Source | Status here | How it is used |
| --- | --- | --- |
| Yahoo Finance per-symbol RSS | HTTP 200 for AAPL on the primary feed. Items had titles, https links, and pubDates. | `https://feeds.finance.yahoo.com/rss/2.0/headline?s={symbol}&region=US&lang=en-US`, then one fallback `https://finance.yahoo.com/rss/headline?s={symbol}`. Unofficial. Not affiliated with Yahoo. Titles, short plain-text descriptions, and outbound links only. Default off. Cache 15 minutes, including failures. No HTML scrape and no article archive. |
| SEC EDGAR | `company_tickers.json`, `company_tickers_mf.json`, and Apple submissions all returned HTTP 200 with a descriptive User-Agent. | Official filings. Requires `SEC_USER_AGENT` (app name plus an email you control). Without it the route returns 503 and does not call the SEC. Company tickers are matched first, then the mutual-fund class file (`fields`: cik, seriesId, classId, symbol; `data` rows). At most 8 requests per second. Ticker maps cached 24 hours, submissions 15 minutes. Unknown symbols return `CIK_NOT_FOUND`. |
| The Guardian Open Platform | HTTP 401 without a key | Optional. `GUARDIAN_API_KEY`. Search is filtered to the ticker token or the SEC company name when that name is already cached. Results that match neither are dropped. Default off. 1 request per second and 500 per UTC day in this process, which matches the developer-tier figures recorded in the implementation plan. Confirm the quota on the key you actually use. Attribute “Content via The Guardian Open Platform.” A restart clears the in-memory daily counter. Non-commercial developer terms. |

Requests send a symbol, not quantities, prices, fees, or notes. Server logs are `METHOD /path STATUS` with the query string omitted.

Finnhub `/quote` and Alpha Vantage `GLOBAL_QUOTE` do not include a currency. A positive price with no currency field is stored as USD. If a payload includes a currency other than USD, that quote is dropped instead of converted.

A cached quote is returned without spending the provider's rate limit. Only a cache miss counts.

Background refresh is not implemented. Quotes refresh from a button and include open positions and watched symbols, skipping locked manual prices. Headlines load when News or a symbol page is opened with a source enabled, or when you click Load headlines on the overview. Opening the overview does not call a news provider by itself.
