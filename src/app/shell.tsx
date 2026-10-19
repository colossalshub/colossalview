import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { CommandPalette } from '../features/command-palette/CommandPalette';

const links = [
  ['Overview', '/'],
  ['Portfolio', '/portfolio'],
  ['Watchlist', '/watchlist'],
  ['News', '/news'],
  ['Calculator', '/calculator'],
  ['Settings', '/settings'],
] as const;

export function Shell() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="brand">colossalview</div>
        <button type="button" aria-label="Open command palette" onClick={() => setOpen(true)}>
          Search
        </button>
      </header>
      <div className="frame">
        <nav className="nav" aria-label="Primary">
          {links.map(([label, href]) => (
            <NavLink key={href} to={href} end={href === '/'}>
              {label}
            </NavLink>
          ))}
        </nav>
        <Outlet />
      </div>
      <CommandPalette open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
