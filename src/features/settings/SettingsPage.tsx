import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { parseThreshold } from '../../domain/concentration';
import type { ImportPreview, Settings } from '../../domain/types';
import { readCalculatorPrefs, writeCalculatorPrefs } from '../../app/calculatorPrefs';
import { loadDemoBook } from '../../app/loadDemo';
import { holdingsToCsv, transactionsToCsv } from '../../import/holdings';
import { buildExportBundle } from '../../import/json';
import {
  applyTransactionList,
  importPrepared,
  previewHoldingsImport,
  previewJson,
  previewTransactionsCsv,
  updateSettings,
} from '../../app/portfolioService';
import { fetchQuotes, quotesPath, fetchHealth, type HealthResponse } from '../../providers/client';
import { symbolsForRefresh, storeLiveQuote } from '../../app/portfolioService';
import { useStore } from '../../app/store';
import { nowIso } from '../../app/time';
import { openPositions } from '../../domain/positions';

export function SettingsPage() {
  const store = useStore();
  const navigate = useNavigate();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(store.settings.concentrationThresholdPct);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exported, setExported] = useState('');
  const [importText, setImportText] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [prepared, setPrepared] = useState<Awaited<ReturnType<typeof previewJson>> | null>(null);
  const [csvText, setCsvText] = useState('');
  const [csvKind, setCsvKind] = useState<'transactions' | 'holdings'>('transactions');
  const [csvPreview, setCsvPreview] = useState<ImportPreview | null>(null);
  const [csvNext, setCsvNext] = useState<{ portfolioIdReady: boolean; transactions: import('../../domain/types').Transaction[]; portfolio: import('../../domain/types').Portfolio } | null>(null);
  const [confirmDemo, setConfirmDemo] = useState(false);
  const prefs = readCalculatorPrefs();
  const [riskPercent, setRiskPercent] = useState(prefs.riskPercent);
  const [shareMode, setShareMode] = useState(prefs.mode);

  useEffect(() => {
    setThreshold(store.settings.concentrationThresholdPct);
  }, [store.settings.concentrationThresholdPct]);

  useEffect(() => {
    let cancelled = false;
    void fetchHealth()
      .then((result) => {
        if (!cancelled) setHealth(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setHealthError(caught instanceof Error ? caught.message : 'Status unavailable.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!store.ready) return <main id="main"><p>Loading your book…</p></main>;

  async function saveSettings(next: Settings) {
    await updateSettings(next);
    await store.refresh();
  }

  async function onThreshold(event: FormEvent) {
    event.preventDefault();
    const parsed = parseThreshold(threshold);
    if (!parsed) {
      setError('Use a threshold from 1 to 100, with at most 2 decimal places.');
      return;
    }
    setError(null);
    await saveSettings({ ...store.settings, concentrationThresholdPct: parsed });
    setMessage(`Concentration warning threshold saved at ${parsed}%.`);
  }

  function exportJson() {
    if (!store.portfolio) {
      setError('There is no portfolio to export yet.');
      return;
    }
    const bundle = buildExportBundle(
      {
        portfolio: store.portfolio,
        transactions: store.transactions,
        quotes: store.quotes,
        watchlist: store.watchlist,
        articleStates: store.articleStates,
        settings: store.settings,
      },
      nowIso(),
    );
    setExported(JSON.stringify(bundle, null, 2));
    setError(null);
  }

  async function runPreview(mode: 'replace' | 'merge') {
    let raw: unknown;
    try {
      raw = JSON.parse(importText);
    } catch {
      setError('Import text is not valid JSON.');
      setPreview(null);
      return;
    }
    const result = await previewJson(raw, mode);
    setPrepared(result);
    setPreview(result.preview);
    setError(result.ok ? null : result.message);
  }

  async function confirmImport() {
    if (!prepared || !prepared.ok) return;
    try {
      const result = await importPrepared(prepared.next);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import failed and the current book was left in place.');
      return;
    }
    setMessage('Import saved.');
    await store.refresh();
  }

  async function previewCsv() {
    const result = csvKind === 'transactions' ? await previewTransactionsCsv(csvText) : await previewHoldingsImport(csvText);
    setCsvPreview(result.preview);
    if (!result.ok) {
      setCsvNext(null);
      setError(result.message);
      return;
    }
    setError(null);
    if (csvKind === 'transactions' && result.ok) {
      setCsvNext({ portfolioIdReady: true, transactions: result.transactions, portfolio: result.portfolio });
    }
    if (csvKind === 'holdings' && result.ok) {
      setCsvNext({ portfolioIdReady: true, transactions: result.transactions, portfolio: result.portfolio });
    }
  }

  async function confirmCsv() {
    if (!csvNext || csvPreview?.errors.length) return;
    const result = await applyTransactionList(csvNext.portfolio, csvNext.transactions);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setMessage('CSV import saved.');
    await store.refresh();
  }

  async function refreshQuotes() {
    const symbols = symbolsForRefresh(
      [...new Set([...openPositions(store.snapshot).map((position) => position.symbol), ...store.watchlist.map((item) => item.symbol)])],
      store.quotes,
    );
    if (symbols.length === 0) {
      setMessage('Every open symbol is locked to a manual price, or there is nothing to refresh.');
      return;
    }
    try {
      const response = await fetchQuotes(symbols);
      for (const quote of response.quotes) await storeLiveQuote(quote);
      setMessage(`Updated ${response.quotes.length}. Missing: ${response.missing.join(', ') || 'none'}. Limited: ${response.limited.join(', ') || 'none'}. Requested ${quotesPath(symbols)}.`);
      await store.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Quote refresh failed.');
    }
  }

  return (
    <main id="main">
      <h1>Settings</h1>
      <h2>Theme</h2>
      <div className="cluster" role="radiogroup" aria-label="Theme">
        {(['system', 'light', 'dark'] as const).map((theme) => (
          <label key={theme} className="field">
            <span>{theme}</span>
            <input
              type="radio"
              name="theme"
              aria-label={theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System theme'}
              checked={store.settings.theme === theme}
              onChange={() => {
                const root = document.documentElement;
                if (theme === 'system') root.removeAttribute('data-theme');
                else root.setAttribute('data-theme', theme);
                void saveSettings({ ...store.settings, theme });
              }}
            />
          </label>
        ))}
      </div>
      <h2>Currency</h2>
      <p>Display currency is USD. Other currencies are not converted in this version.</p>
      <h2>Concentration</h2>
      <form className="form-grid" onSubmit={onThreshold}>
        <label className="field">Warn when one quoted position reaches this percent
          <input inputMode="decimal" value={threshold} onChange={(event) => setThreshold(event.target.value)} />
        </label>
        <button type="submit">Save threshold</button>
      </form>
      <h2>Calculator defaults</h2>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          writeCalculatorPrefs({ ...readCalculatorPrefs(), riskPercent, mode: shareMode, precision: shareMode === 'whole' ? 0 : 4 });
          setMessage('Calculator defaults saved in this browser.');
        }}
      >
        <label className="field">Default risk percent
          <input value={riskPercent} onChange={(event) => setRiskPercent(event.target.value)} />
        </label>
        <label className="field">Share sizing
          <select value={shareMode} onChange={(event) => setShareMode(event.target.value as 'whole' | 'fractional')}>
            <option value="whole">Whole shares</option>
            <option value="fractional">Fractional shares</option>
          </select>
        </label>
        <button type="submit">Save calculator defaults</button>
      </form>
      <h2>Quotes</h2>
      <p className="muted">Manual prices always work. Live refresh is a button, not a timer, so a free quota is not polled in the background.</p>
      <div className="cluster">
        <label><input type="radio" name="quote-mode" checked={store.settings.quoteMode === 'manual'} onChange={() => void saveSettings({ ...store.settings, quoteMode: 'manual' })} /> Manual</label>
        <label>
          <input
            type="radio"
            name="quote-mode"
            checked={store.settings.quoteMode === 'live'}
            disabled={!health || health.providers.quotes === 'none'}
            onChange={() => void saveSettings({ ...store.settings, quoteMode: 'live' })}
          /> Live
        </label>
      </div>
      {health?.providers.quotes === 'none' ? <p className="muted">Live quotes are disabled until the server has FINNHUB_API_KEY or ALPHA_VANTAGE_API_KEY. Finnhub is used when both are set.</p> : null}
      {health?.providers.quotes === 'alphavantage' ? <p className="muted">Alpha Vantage&apos;s free tier is 25 requests per day, and this app waits at least 13 seconds between calls. A 30-symbol book cannot refresh in one day. Successful quotes are cached for 6 hours. Restarting the server resets the in-memory counter. Cached symbols do not spend that quota.</p> : null}
      {health?.providers.quotes === 'finnhub' ? <p className="muted">Finnhub&apos;s free tier is about 60 calls per minute. Refresh is manual. Locked prices and cached symbols are not requested again.</p> : null}
      <button type="button" disabled={store.settings.quoteMode !== 'live'} onClick={() => void refreshQuotes()}>Refresh unlocked quotes</button>
      <h2>News sources</h2>
      <p className="muted">Headlines load when you open News or ask to refresh. There is no background push. Restarting the server resets in-memory provider counters.</p>
      <label><input type="checkbox" checked={store.settings.newsYahoo} onChange={(event) => void saveSettings({ ...store.settings, newsYahoo: event.target.checked })} /> Yahoo Finance RSS (unofficial, no key)</label>
      <label><input type="checkbox" checked={store.settings.newsEdgar} disabled={!health?.providers.edgar} onChange={(event) => void saveSettings({ ...store.settings, newsEdgar: event.target.checked })} /> SEC EDGAR filings (requires SEC_USER_AGENT)</label>
      <label><input type="checkbox" checked={store.settings.newsGuardian} disabled={!health?.providers.guardian} onChange={(event) => void saveSettings({ ...store.settings, newsGuardian: event.target.checked })} /> The Guardian (requires GUARDIAN_API_KEY, non-commercial)</label>
      <h2>Export</h2>
      <p className="muted">Exports are plaintext JSON or CSV on this device. They contain your transactions and do not contain API keys.</p>
      <div className="cluster">
        <button type="button" data-testid="export-json" onClick={exportJson}>Export JSON</button>
        <button type="button" onClick={() => setExported(transactionsToCsv(store.transactions))}>Export transactions CSV</button>
        <button type="button" onClick={() => setExported(holdingsToCsv(store.snapshot))}>Export holdings CSV</button>
      </div>
      <label className="field">Export text
        <textarea data-testid="export-json-text" readOnly value={exported} />
      </label>
      <h2>Import JSON</h2>
      <label className="field">Paste a colossalview JSON bundle
        <textarea data-testid="import-json-text" value={importText} onChange={(event) => { setImportText(event.target.value); setPrepared(null); setPreview(null); }} />
      </label>
      <div className="cluster">
        <button type="button" data-testid="preview-import" onClick={() => void runPreview('replace')}>Preview replace</button>
        <button type="button" onClick={() => void runPreview('merge')}>Preview merge</button>
        <button type="button" data-testid="confirm-replace" disabled={!prepared?.ok || prepared.preview.mode !== 'replace'} onClick={() => void confirmImport()}>Replace portfolio</button>
        <button type="button" disabled={!prepared?.ok || prepared.preview.mode !== 'merge'} onClick={() => void confirmImport()}>Merge into portfolio</button>
      </div>
      {preview ? <PreviewView preview={preview} /> : null}
      <h2>Import CSV</h2>
      <p className="muted">Transaction files use id,symbol,type,quantity,price,fee,executedAt,note. Holdings files use symbol,quantity,price,fee,executedAt,note and each row becomes a new buy. A holdings export is not a lossless backup.</p>
      <label className="field">CSV kind
        <select value={csvKind} onChange={(event) => setCsvKind(event.target.value as 'transactions' | 'holdings')}>
          <option value="transactions">Transactions</option>
          <option value="holdings">Holdings as new buys</option>
        </select>
      </label>
      <label className="field">CSV text
        <textarea value={csvText} onChange={(event) => setCsvText(event.target.value)} />
      </label>
      <div className="cluster">
        <button type="button" onClick={() => void previewCsv()}>Preview CSV</button>
        <button type="button" disabled={!csvNext || (csvPreview?.errors.length ?? 0) > 0} onClick={() => void confirmCsv()}>Apply CSV</button>
      </div>
      {csvPreview ? <PreviewView preview={csvPreview} /> : null}
      <h2>Sample book</h2>
      <p>The sample book is labeled demo data with fixed AAPL and VTI transactions. It is not loaded on startup.</p>
      {confirmDemo ? (
        <div className="notice">
          <p>Replace the current book with the labeled demo portfolio?</p>
          <button type="button" data-testid="confirm-demo" onClick={() => void loadDemoBook().then(async () => { await store.refresh(); navigate('/'); })}>Replace with demo</button>
        </div>
      ) : (
        <button
          type="button"
          data-testid="load-demo"
          onClick={() => {
            if (store.transactions.length > 0) setConfirmDemo(true);
            else void loadDemoBook().then(async () => { await store.refresh(); navigate('/'); });
          }}
        >
          Load demo book
        </button>
      )}
      <h2>Data sources</h2>
      {healthError ? <p className="notice error">{healthError}</p> : null}
      {health ? (
        <ul>
          <li>Quotes: {health.providers.quotes}</li>
          <li>Yahoo RSS adapter: {health.providers.yahoo ? 'installed' : 'missing'}</li>
          <li>SEC EDGAR: {health.providers.edgar ? 'SEC_USER_AGENT is set' : 'set SEC_USER_AGENT to enable filings'}</li>
          <li>Guardian: {health.providers.guardian ? 'key detected' : 'set GUARDIAN_API_KEY to enable'}</li>
        </ul>
      ) : <p className="muted">Checking the local server…</p>}
      <p className="muted">Copy .env.example to .env and restart the server. Keys stay on the server and are never prefixed with VITE_.</p>
      <h2>Privacy</h2>
      <p>The portfolio stays in IndexedDB in this browser. No account is required, and holdings are not uploaded. Quote and news requests send symbols only after you enable those sources. Clearing browser storage deletes the book, so export a copy when it matters. Browser-local data can also be lost with the device.</p>
      {message ? <p role="status">{message}</p> : null}
      {error ? <p className="notice error" role="alert">{error}</p> : null}
    </main>
  );
}

function PreviewView({ preview }: { preview: ImportPreview }) {
  return (
    <div className="card">
      <p>Schema {preview.schemaVersion} · {preview.format} · {preview.mode} · {preview.portfolioName || 'untitled'}</p>
      <p className="num">{preview.transactionCount} transactions ({preview.buyCount} buys, {preview.sellCount} sells)</p>
      <p>Symbols: {preview.symbols.join(', ') || 'none'}</p>
      <p>From {preview.executedFrom ?? '—'} to {preview.executedTo ?? '—'}</p>
      <p>Replay realized P/L: {preview.replayRealizedPl ?? '—'}</p>
      {preview.warnings.map((warning) => <p key={warning} className="muted">{warning}</p>)}
      {preview.errors.map((item) => <p key={item.path + item.message} className="notice error">{item.path}: {item.message}</p>)}
    </div>
  );
}
