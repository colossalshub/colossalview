import { formatUsd } from '../domain/money';

export function Money({ value, signed = false }: { value: string | null; signed?: boolean }) {
  if (value === null) return <span className="num">—</span>;
  const negative = value.startsWith('-');
  const positive = signed && !negative && value !== '0.00';
  const klass = negative ? 'num delta-neg' : positive ? 'num delta-pos' : 'num';
  return (
    <span className={klass}>
      {negative ? <span className="sr-only">Loss </span> : positive ? <span className="sr-only">Gain </span> : null}
      {negative ? '▼ ' : positive ? '▲ ' : ''}
      {formatUsd(value)}
    </span>
  );
}

export function Disclosure() {
  return (
    <p className="muted">
      Accounting is FIFO and long only, for buys and sells, with fees included. Dividends, splits, and other corporate
      actions are not applied. Figures are USD, are not tax advice, and do not include wash-sale adjustments. Unrealized
      profit or loss is omitted when a position has no quote. This is a research tool, not a brokerage.
    </p>
  );
}
