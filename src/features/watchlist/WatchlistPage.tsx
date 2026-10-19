import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { quoteChange } from '../../domain/positions';
import { setWatchPriority, unwatch, watchSymbol } from '../../app/portfolioService';
import { useStore } from '../../app/store';
import { canonicalizeSymbol } from '../../domain/symbols';

export function WatchlistPage() {
  const store = useStore();
  const [symbol, setSymbol] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = canonicalizeSymbol(symbol);
    if (!parsed.ok) {
      setError(parsed.error.message);
      setMessage(null);
      return;
    }
    const result = await watchSymbol(parsed.value, note);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setMessage(`${parsed.value} is saved. Symbol format is valid. A quote provider is not required, and none was asked to confirm it unless you refresh prices in live mode.`);
    setSymbol('');
    setNote('');
    await store.refresh();
  }

  if (!store.ready) return <main id="main"><p>Loading your book…</p></main>;
  const items = [...store.watchlist].sort((a, b) => Number(b.priority) - Number(a.priority) || (a.symbol < b.symbol ? -1 : 1));

  return (
    <main id="main">
      <h1>Watchlist</h1>
      <p className="muted">Manual ticker entry always works. Slashes are rejected rather than rewritten, so BRK.B stays BRK.B.</p>
      <form className="form-grid" onSubmit={submit}>
        <label className="field">Symbol
          <input className="ticker" value={symbol} onChange={(event) => setSymbol(event.target.value)} required />
        </label>
        <label className="field">Note
          <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} />
        </label>
        <button className="primary" type="submit">Add to watchlist</button>
      </form>
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      {message ? <p className="muted">{message}</p> : null}
      {items.length === 0 ? <p>No symbols yet.</p> : (
        <table className="cards">
          <thead>
            <tr><th>Symbol</th><th>Price</th><th>Day</th><th>Note</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const quote = store.quotes.find((row) => row.symbol === item.symbol) ?? null;
              const change = quote ? quoteChange(quote.price, quote.previousClose) : null;
              return (
                <tr key={item.id}>
                  <td data-label="Symbol"><Link className="ticker" to={`/symbol/${item.symbol}`}>{item.symbol}</Link>{item.priority ? ' · priority' : ''}</td>
                  <td data-label="Price">{quote ? `${quote.price} ${quote.currency}` : 'No saved price'}</td>
                  <td data-label="Day">{change ? `${change.amount} (${change.percent}%)` : '—'}</td>
                  <td data-label="Note">{item.note || '—'}</td>
                  <td data-label="Actions">
                    <div className="cluster">
                      <button type="button" onClick={() => void setWatchPriority(item.id, !item.priority).then(store.refresh)}>
                        {item.priority ? 'Unmark priority' : 'Mark priority'}
                      </button>
                      <Link className="btn" to={`/portfolio?buy=${item.symbol}`}>Add to portfolio</Link>
                      <button type="button" className="danger" onClick={() => void unwatch(item.id).then(store.refresh)}>Remove</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
