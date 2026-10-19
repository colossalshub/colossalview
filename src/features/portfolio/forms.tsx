import { useState } from 'react';
import type { FormEvent } from 'react';
import type { DomainResult } from '../../domain/errors';
import type { PortfolioSnapshot, Transaction } from '../../domain/types';
import { addTrade, updateTrade } from '../../app/portfolioService';
import { isoToLocalInput, localInputToIso, nowIso } from '../../app/time';

export function TradeForm({
  kind,
  presetSymbol = '',
  existing,
  onDone,
}: {
  kind: 'buy' | 'sell';
  presetSymbol?: string;
  existing?: Transaction;
  onDone: () => Promise<void>;
}) {
  const [symbol, setSymbol] = useState(existing?.symbol ?? presetSymbol);
  const [quantity, setQuantity] = useState(existing?.quantity ?? '');
  const [price, setPrice] = useState(existing?.price ?? '');
  const [fee, setFee] = useState(existing?.fee ?? '0.00');
  const [executedAt, setExecutedAt] = useState(existing ? isoToLocalInput(existing.executedAt) : isoToLocalInput(nowIso()));
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const label = kind === 'buy' ? 'Buy' : 'Sell';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    let executed = '';
    if (existing && isoToLocalInput(existing.executedAt) === executedAt) {
      executed = existing.executedAt;
    } else {
      const timestamp = localInputToIso(executedAt);
      if (!timestamp.ok) {
        setError(timestamp.error.message);
        return;
      }
      executed = timestamp.value;
    }
    const draft = { symbol, type: kind, quantity, price, fee, executedAt: executed, note };
    setPending(true);
    try {
      const result: DomainResult<PortfolioSnapshot> = existing ? await updateTrade(existing.id, draft) : await addTrade(draft);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
    } finally {
      setPending(false);
    }
    setError(null);
    if (!existing && kind === 'buy') {
      setSymbol('');
      setQuantity('');
      setPrice('');
      setNote('');
    }
    await onDone();
  }

  return (
    <form className="card" onSubmit={submit} aria-label={`${label} form`}>
      <h2>{existing ? `Edit ${label.toLowerCase()}` : `Record a ${label.toLowerCase()}`}</h2>
      <div className="form-grid">
        <label className="field">{label} symbol
          <input id={kind === 'buy' ? 'buy-symbol' : 'sell-symbol'} className="ticker" value={symbol} onChange={(event) => setSymbol(event.target.value)} required />
        </label>
        <label className="field">{label} quantity
          <input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
        </label>
        <label className="field">{label} price
          <input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} required />
        </label>
        <label className="field">{label} fee
          <input inputMode="decimal" value={fee} onChange={(event) => setFee(event.target.value)} />
        </label>
        <label className="field">{label} time (UTC converted from your clock)
          <input type="datetime-local" value={executedAt} onChange={(event) => setExecutedAt(event.target.value)} required />
        </label>
        <label className="field">{label} note
          <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} />
        </label>
      </div>
      {error ? <p className="notice error" data-testid={kind === 'sell' ? 'sell-error' : 'buy-error'} role="alert">{error}</p> : null}
      <p><button className="primary" type="submit" disabled={pending}>{existing ? 'Save changes' : `Record ${label.toLowerCase()}`}</button></p>
    </form>
  );
}
