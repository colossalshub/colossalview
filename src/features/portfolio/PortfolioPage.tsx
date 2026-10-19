import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { decimalOf } from '../../domain/money';
import type { PositionView } from '../../domain/types';
import { deleteTrade } from '../../app/portfolioService';
import { useStore } from '../../app/store';
import { formatTimestamp } from '../../app/time';
import { Money } from '../../app/ui';
import { TradeForm } from './forms';

type SortKey = 'symbol' | 'value' | 'unrealized' | 'weight';

export function PortfolioPage() {
  const store = useStore();
  const [params] = useSearchParams();
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<SortKey>('symbol');
  const [editing, setEditing] = useState<string | null>(null);
  const preset = params.get('buy') ? '' : '';
  const prefill = params.get('buy') && params.get('buy') !== '1' ? params.get('buy') ?? '' : '';

  const rows = useMemo(() => {
    const total = store.snapshot.totalMarketValue ? decimalOf(store.snapshot.totalMarketValue) : null;
    const filtered = store.snapshot.positions.filter((position) => position.symbol.includes(filter.trim().toUpperCase()));
    const decorated = filtered.map((position) => ({
      position,
      weight: position.marketValue && total && total.gt(0) ? decimalOf(position.marketValue).div(total).mul(100) : null,
    }));
    decorated.sort((a, b) => compare(a, b, sort));
    return decorated;
  }, [store.snapshot, filter, sort]);

  if (!store.ready) return <main id="main"><p>Loading your book…</p></main>;

  const editingTx = store.transactions.find((tx) => tx.id === editing);

  return (
    <main id="main">
      <h1>Portfolio</h1>
      <p className="muted">
        <span data-testid="transaction-count">{store.transactions.length}</span> transactions. Long stocks and ETFs only. Lots are rebuilt with FIFO whenever you save.
      </p>
      {store.replayError ? <p className="notice error">{store.replayError}</p> : null}
      <div className="form-grid">
        <label className="field">Filter symbols
          <input value={filter} onChange={(event) => setFilter(event.target.value)} />
        </label>
        <label className="field">Sort
          <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
            <option value="symbol">Symbol</option>
            <option value="value">Market value</option>
            <option value="unrealized">Unrealized P/L</option>
            <option value="weight">Weight</option>
          </select>
        </label>
      </div>
      <table className="cards">
        <thead>
          <tr>
            <th>Symbol</th>
            <th className="num">Quantity</th>
            <th className="num">Average cost</th>
            <th className="num">Cost basis</th>
            <th className="num">Price</th>
            <th className="num">Market value</th>
            <th className="num">Unrealized</th>
            <th className="num">Weight</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ position, weight }) => (
            <tr key={position.symbol}>
              <td data-label="Symbol"><Link className="ticker" to={`/portfolio/${position.symbol}`}>{position.symbol}</Link></td>
              <td className="num" data-label="Quantity">{position.quantityOpen}</td>
              <td className="num" data-label="Average cost">{position.averageCost ? <Money value={position.averageCost} /> : '—'}</td>
              <td className="num" data-label="Cost basis"><Money value={moneyOrNull(position.remainingBasis)} /></td>
              <td className="num" data-label="Price">{position.quote ? position.quote.price : '—'}</td>
              <td className="num" data-label="Market value"><Money value={position.marketValue} /></td>
              <td className="num" data-label="Unrealized"><Money value={position.unrealizedPl} signed /></td>
              <td className="num" data-label="Weight">{weight ? `${weight.toFixed(2)}%` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {store.snapshot.positions.length === 0 ? <p>No holdings yet. Record a buy to open the book.</p> : rows.length === 0 ? <p className="muted">No holdings match this filter.</p> : null}
      <div className="split">
        <TradeForm kind="buy" presetSymbol={prefill || preset} onDone={store.refresh} />
        <TradeForm kind="sell" onDone={store.refresh} />
      </div>
      <h2>Transactions</h2>
      <ul>
        {[...store.transactions].sort((a, b) => (a.executedAt < b.executedAt ? -1 : a.executedAt > b.executedAt ? 1 : a.id < b.id ? -1 : 1)).map((tx) => (
          <li key={tx.id}>
            <span className="ticker">{tx.symbol}</span> {tx.type} {tx.quantity} @ {tx.price}, fee {tx.fee}, {formatTimestamp(tx.executedAt)}
            <span className="cluster">
              <button type="button" onClick={() => setEditing(tx.id)}>Edit</button>
              <button type="button" className="danger" onClick={() => void deleteTrade(tx.id).then(async (result) => {
                if (!result.ok) window.alert(result.error.message);
                await store.refresh();
              })}>Delete</button>
            </span>
          </li>
        ))}
      </ul>
      {editingTx ? <TradeForm key={editingTx.id} kind={editingTx.type} existing={editingTx} onDone={async () => { setEditing(null); await store.refresh(); }} /> : null}
    </main>
  );
}

function moneyOrNull(value: string): string | null {
  if (value === '0') return '0.00';
  const parsed = decimalOf(value).toFixed(2);
  return parsed;
}

function compare(
  a: { position: PositionView; weight: import('decimal.js').default | null },
  b: { position: PositionView; weight: import('decimal.js').default | null },
  sort: SortKey,
): number {
  if (sort === 'symbol') return a.position.symbol < b.position.symbol ? -1 : 1;
  if (sort === 'value') return decimalOf(b.position.marketValue ?? '-1').cmp(decimalOf(a.position.marketValue ?? '-1'));
  if (sort === 'unrealized') return decimalOf(b.position.unrealizedPl ?? '-999999999').cmp(decimalOf(a.position.unrealizedPl ?? '-999999999'));
  return (b.weight ?? decimalOf('-1')).cmp(a.weight ?? decimalOf('-1'));
}
