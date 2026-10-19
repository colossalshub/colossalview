import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { positionBySymbol } from '../../domain/positions';
import { clearManualQuote, removeSymbol, saveManualQuote, unlockQuote } from '../../app/portfolioService';
import { useStore } from '../../app/store';
import { decimalOf, moneyString } from '../../domain/money';
import { formatTimestamp, isStale, nowIso } from '../../app/time';
import { Disclosure, Money } from '../../app/ui';

export function PositionPage() {
  const { symbol = '' } = useParams();
  const store = useStore();
  const canonical = symbol.toUpperCase();
  const position = positionBySymbol(store.snapshot, canonical);
  const [price, setPrice] = useState(position?.quote?.price ?? '');
  const [previous, setPrevious] = useState(position?.quote?.previousClose ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    setPrice(position?.quote?.price ?? '');
    setPrevious(position?.quote?.previousClose ?? '');
  }, [position?.quote?.price, position?.quote?.previousClose, canonical]);

  if (!store.ready) return <main id="main"><p>Loading your book…</p></main>;
  if (!position) {
    return (
      <main id="main">
        <h1 className="ticker">{canonical}</h1>
        <p>There is no position for this symbol, and no lots were created.</p>
        <p><Link to="/portfolio">Back to portfolio</Link></p>
      </main>
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const result = await saveManualQuote({ symbol: canonical, price, asOf: nowIso(), previousClose: previous });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    await store.refresh();
  }

  return (
    <main id="main">
      <h1 className="ticker">{position.symbol}</h1>
      <p><Link to={`/symbol/${position.symbol}`}>Symbol page</Link></p>
      <section className="metrics">
        <div className="metric"><span>Quantity</span><strong className="num">{position.quantityOpen}</strong></div>
        <div className="metric"><span>Average cost</span><strong>{position.averageCost ? <Money value={position.averageCost} /> : '—'}</strong></div>
        <div className="metric"><span>Remaining basis</span><strong><Money value={moneyString(decimalOf(position.remainingBasis))} /></strong><span>Exact lot basis {position.remainingBasis}</span></div>
        <div className="metric"><span>Market value</span><strong><Money value={position.marketValue} /></strong></div>
        <div className="metric"><span>Unrealized P/L</span><strong data-testid={`unrealized-${position.symbol}`}><Money value={position.unrealizedPl} signed /></strong></div>
        <div className="metric"><span>Realized P/L</span><strong data-testid={`realized-${position.symbol}`}><Money value={position.realizedPl} signed /></strong></div>
      </section>
      <h2>Open lots</h2>
      {position.lots.length === 0 ? <p className="muted">No shares remain open.</p> : (
        <table className="cards">
          <thead><tr><th>Lot</th><th>Acquired</th><th className="num">Quantity</th><th className="num">Remaining basis</th></tr></thead>
          <tbody>
            {position.lots.map((lot) => (
              <tr key={lot.lotId}>
                <td data-label="Lot" className="ticker">{lot.lotId}</td>
                <td data-label="Acquired">{formatTimestamp(lot.acquiredAt)}</td>
                <td className="num" data-label="Quantity">{lot.quantityOpen}</td>
                <td className="num" data-label="Remaining basis">{lot.remainingBasis}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h2>Manual price</h2>
      <form className="form-grid" onSubmit={save}>
        <label className="field">Manual price
          <input data-testid="quote-price" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} required />
        </label>
        <label className="field">Previous close (optional)
          <input inputMode="decimal" value={previous} onChange={(event) => setPrevious(event.target.value)} />
        </label>
        <button className="primary" data-testid="save-quote" type="submit">Save manual price</button>
      </form>
      {position.quote ? (
        <p className="muted">
          {position.quote.price} from {position.quote.source}, as of {formatTimestamp(position.quote.asOf)}
          {isStale(position.quote.asOf) ? ' · stale' : ''}
          {position.quote.locked ? ' · locked against live refresh' : ''}
        </p>
      ) : <p className="muted">No quote is stored. Average cost is not used as a market price.</p>}
      {error ? <p className="notice error">{error}</p> : null}
      <div className="cluster">
        <button type="button" data-testid="clear-quote" onClick={() => void clearManualQuote(canonical).then(store.refresh)}>Clear price</button>
        <button type="button" onClick={() => void unlockQuote(canonical).then(store.refresh)}>Unlock for live refresh</button>
      </div>
      <h2>Remove position</h2>
      {confirmRemove ? (
        <div className="notice">
          <p>This deletes every transaction for {position.symbol}. Other symbols stay. Realized history for this symbol goes with it.</p>
          <button type="button" className="danger" onClick={() => void removeSymbol(canonical).then(async (result) => {
            if (!result.ok) setError(result.error.message);
            await store.refresh();
          })}>Delete {position.symbol} transactions</button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmRemove(true)}>Remove position</button>
      )}
      <Disclosure />
    </main>
  );
}
