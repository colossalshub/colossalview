import { useMemo, useState, type ReactNode } from 'react';
import type { FormEvent } from 'react';
import { previewProceeds, previewSell } from '../../domain/preview';
import { sizePosition } from '../../domain/sizing';
import { readCalculatorPrefs, writeCalculatorPrefs } from '../../app/calculatorPrefs';
import { useStore } from '../../app/store';
import { localInputToIso, nowIso, isoToLocalInput } from '../../app/time';
import { Money } from '../../app/ui';

export function CalculatorPage() {
  const store = useStore();
  const initial = readCalculatorPrefs();
  const [equity, setEquity] = useState('10000');
  const [entry, setEntry] = useState('100');
  const [stop, setStop] = useState('95');
  const [riskMode, setRiskMode] = useState<'percent' | 'fixed'>('percent');
  const [riskPercent, setRiskPercent] = useState(initial.riskPercent);
  const [riskAmount, setRiskAmount] = useState('100');
  const [fee, setFee] = useState('0');
  const [target, setTarget] = useState('110');
  const [current, setCurrent] = useState('');
  const [mode, setMode] = useState(initial.mode);
  const [precision, setPrecision] = useState(String(initial.mode === 'whole' ? 0 : initial.precision || 2));
  const [cap, setCap] = useState(initial.maxPositionPct);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('12');
  const [price, setPrice] = useState('130');
  const [tradeFee, setTradeFee] = useState('1.00');
  const [when, setWhen] = useState(isoToLocalInput(nowIso()));

  const sized = useMemo(
    () =>
      sizePosition({
        accountEquity: equity,
        entryPrice: entry,
        stopPrice: stop,
        riskMode,
        riskPercent,
        riskAmount,
        fee,
        targetPrice: target,
        currentPrice: current,
        precision: mode === 'whole' ? 0 : Number(precision),
        maxPositionPct: cap,
      }),
    [equity, entry, stop, riskMode, riskPercent, riskAmount, fee, target, current, mode, precision, cap],
  );

  const proceeds = useMemo(
    () => previewProceeds({ side, quantity, price, fee: tradeFee }),
    [side, quantity, price, tradeFee],
  );

  const fifo = useMemo(() => {
    if (side !== 'sell' || !symbol.trim() || !store.portfolio) return null;
    const timestamp = localInputToIso(when);
    if (!timestamp.ok) return timestamp;
    return previewSell({
      transactions: store.transactions,
      portfolioId: store.portfolio.id,
      symbol,
      quantity,
      price,
      fee: tradeFee,
      executedAt: timestamp.value,
    });
  }, [side, symbol, store.portfolio, store.transactions, when, quantity, price, tradeFee]);

  function savePrefs(event: FormEvent) {
    event.preventDefault();
    writeCalculatorPrefs({
      riskPercent,
      mode,
      precision: mode === 'whole' ? 0 : Number(precision) || 0,
      maxPositionPct: cap,
    });
  }

  return (
    <main id="main">
      <h1>Position calculator</h1>
      <p className="muted">Long positions only. This estimate does not place an order and does not need a market-data key.</p>
      <section className="card">
        <h2>Example</h2>
        <p>
          $10,000 equity, entry $100, stop $95, and 1% risk gives a $100 risk budget. Risk per share is $5, so the
          risk-based size is 20 shares, worth $2,000 (20% of equity). Loss at the stop is $100 before fees. A $110 target
          is a 2:1 reward to risk, and $8,000 would remain in cash. Whole shares are floored so the size never rounds past the risk budget.
        </p>
        <button
          type="button"
          onClick={() => {
            setEquity('10000');
            setEntry('100');
            setStop('95');
            setRiskMode('percent');
            setRiskPercent('1');
            setTarget('110');
            setFee('0');
            setMode('whole');
          }}
        >
          Fill example
        </button>
      </section>
      <form className="form-grid" onSubmit={savePrefs}>
        <label className="field">Account equity
          <input inputMode="decimal" value={equity} onChange={(event) => setEquity(event.target.value)} />
        </label>
        <label className="field">Entry price
          <input inputMode="decimal" value={entry} onChange={(event) => setEntry(event.target.value)} />
        </label>
        <label className="field">Stop-loss price
          <input inputMode="decimal" value={stop} onChange={(event) => setStop(event.target.value)} />
        </label>
        <label className="field">Risk mode
          <select value={riskMode} onChange={(event) => setRiskMode(event.target.value as 'percent' | 'fixed')}>
            <option value="percent">Percent of equity</option>
            <option value="fixed">Fixed amount</option>
          </select>
        </label>
        {riskMode === 'percent' ? (
          <label className="field">Risk percent
            <input inputMode="decimal" value={riskPercent} onChange={(event) => setRiskPercent(event.target.value)} />
          </label>
        ) : (
          <label className="field">Fixed risk
            <input inputMode="decimal" value={riskAmount} onChange={(event) => setRiskAmount(event.target.value)} />
          </label>
        )}
        <label className="field">Fee
          <input inputMode="decimal" value={fee} onChange={(event) => setFee(event.target.value)} />
        </label>
        <label className="field">Target price
          <input inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value)} />
        </label>
        <label className="field">Current price (optional)
          <input inputMode="decimal" value={current} onChange={(event) => setCurrent(event.target.value)} />
        </label>
        <label className="field">Share sizing
          <select value={mode} onChange={(event) => setMode(event.target.value as 'whole' | 'fractional')}>
            <option value="whole">Whole shares</option>
            <option value="fractional">Fractional shares</option>
          </select>
        </label>
        {mode === 'fractional' ? (
          <label className="field">Decimal places
            <input inputMode="numeric" value={precision} onChange={(event) => setPrecision(event.target.value)} />
          </label>
        ) : null}
        <label className="field">Concentration cap % (optional)
          <input inputMode="decimal" value={cap} onChange={(event) => setCap(event.target.value)} />
        </label>
        <button type="submit">Save calculator defaults</button>
      </form>
      {!sized.ok ? <p className="notice error" role="alert">{sized.error.message}</p> : (
        <section className="metrics" aria-label="Position size results">
          <Result label="Risk budget" text={<Money value={sized.value.riskBudget} />} hint="Equity times the risk percent, or the fixed amount you entered." />
          <Result label="Risk per share" text={<span className="num">{sized.value.riskPerShare}</span>} hint="Entry minus stop. A stop at or above the entry is rejected." />
          <Result label="Risk-based quantity" text={<span className="num">{sized.value.riskBasedQuantity}</span>} hint="Risk budget divided by risk per share, floored to the share precision." />
          <Result label="Final quantity" text={<span className="num">{sized.value.quantity}</span>} hint={`After cash and concentration checks. Binding limit: ${sized.value.bindingConstraint}.`} />
          <Result label="Position value" text={<Money value={sized.value.positionValue} />} hint="Final quantity times the entry price." />
          <Result label="Percent of equity" text={<span className="num">{sized.value.positionPct}%</span>} hint="Position value divided by account equity." />
          <Result label="Estimated loss at stop" text={<Money value={sized.value.estimatedLoss} signed />} hint="Quantity times risk per share, plus the fee when a position is opened." />
          <Result label="Potential profit at target" text={sized.value.potentialProfit ? <Money value={sized.value.potentialProfit} signed /> : '—'} hint="Requires a target price. The fee is subtracted once." />
          <Result label="Reward to risk" text={sized.value.rewardToRisk ?? '—'} hint="(Target − entry) / (entry − stop). Not a promise of return." />
          <Result label="Cash remaining" text={<Money value={sized.value.cashRemaining} />} hint="Equity minus the position value and fee. Nothing is deducted when the size is zero." />
        </section>
      )}
      {sized.ok ? sized.value.notes.map((note) => <p key={note} className="muted">{note}</p>) : null}
      {current && sized.ok ? <p className="muted">Current price is context only. The size still uses your entry and stop.</p> : null}

      <h2>Trade preview</h2>
      <p className="muted">Preview a buy cost or a FIFO sell against the saved book. Nothing is written.</p>
      <div className="form-grid">
        <label className="field">Side
          <select value={side} onChange={(event) => setSide(event.target.value as 'buy' | 'sell')}>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
        </label>
        <label className="field">Symbol for a book sell
          <input className="ticker" value={symbol} onChange={(event) => setSymbol(event.target.value)} />
        </label>
        <label className="field">Quantity
          <input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        </label>
        <label className="field">Price
          <input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} />
        </label>
        <label className="field">Fee
          <input inputMode="decimal" value={tradeFee} onChange={(event) => setTradeFee(event.target.value)} />
        </label>
        <label className="field">Sell time
          <input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} />
        </label>
      </div>
      {proceeds.ok ? (
        <p>Gross <Money value={proceeds.value.gross} /> · fee <Money value={proceeds.value.fee} /> · {side === 'buy' ? 'total cost' : 'net proceeds'} <Money value={proceeds.value.net} /></p>
      ) : <p className="notice error">{proceeds.error.message}</p>}
      {fifo && !fifo.ok ? <p className="notice error">{fifo.error.message}</p> : null}
      {fifo && fifo.ok ? <p>FIFO realized P/L for this sell would be <Money value={fifo.value.realizedPl} signed />. Basis removed <Money value={fifo.value.basisRemoved} />.</p> : null}
    </main>
  );
}

function Result({ label, text, hint }: { label: string; text: ReactNode; hint: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{text}</strong>
      <span>{hint}</span>
    </div>
  );
}
