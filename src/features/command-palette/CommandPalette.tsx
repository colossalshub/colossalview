import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { openPositions } from '../../domain/positions';
import { useStore } from '../../app/store';

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { snapshot, watchlist } = useStore();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const commands = useMemo(() => {
    const routes = [
      ['Overview', '/'],
      ['Portfolio', '/portfolio'],
      ['Watchlist', '/watchlist'],
      ['News', '/news'],
      ['Calculator', '/calculator'],
      ['Settings', '/settings'],
      ['Start a buy', '/portfolio?buy=1'],
    ] as const;
    const symbols = [
      ...openPositions(snapshot).map((position) => ({ label: `Open ${position.symbol}`, href: `/symbol/${position.symbol}` })),
      ...watchlist.map((item) => ({ label: `Watch ${item.symbol}`, href: `/symbol/${item.symbol}` })),
    ];
    return [...routes.map(([label, href]) => ({ label, href })), ...symbols];
  }, [snapshot, watchlist]);

  const visible = commands.filter((command) => command.label.toLowerCase().includes(query.trim().toLowerCase()));

  if (!open) return null;

  return (
    <div className="palette" role="presentation" onMouseDown={onClose}>
      <form
        role="dialog"
        aria-label="Command palette"
        data-testid="command-palette"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          const first = visible[0];
          if (!first) return;
          navigate(first.href);
          onClose();
        }}
      >
        <label className="field">
          Command
          <input
            autoFocus
            aria-label="Command"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose();
            }}
            placeholder="Go to a page or symbol"
          />
        </label>
        <ul>
          {visible.map((command) => (
            <li key={command.label + command.href}>
              <button
                type="button"
                onClick={() => {
                  navigate(command.href);
                  onClose();
                }}
              >
                {command.label}
              </button>
            </li>
          ))}
        </ul>
      </form>
    </div>
  );
}
