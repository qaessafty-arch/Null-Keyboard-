import { useSyncExternalStore, type AnchorHTMLAttributes, type ReactNode } from 'react';

/**
 * Minimal hash router. Hash routing works from static hosting, LAN dev
 * servers and an installed PWA without server-side rewrites.
 */

export interface Route {
  path: string;
  query: URLSearchParams;
}

function readHash(): string {
  return window.location.hash.replace(/^#/, '') || '/';
}

let cachedHash = '';
let cachedRoute: Route = { path: '/', query: new URLSearchParams() };

function snapshot(): Route {
  const hash = readHash();
  if (hash !== cachedHash) {
    cachedHash = hash;
    const [path = '/', qs = ''] = hash.split('?');
    cachedRoute = { path: path || '/', query: new URLSearchParams(qs) };
  }
  return cachedRoute;
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function navigate(path: string): void {
  window.location.hash = path;
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
  children: ReactNode;
  activeClassName?: string;
  /** Extra paths that also count as "current" for this link. */
  matches?: string[];
}

export function Link({ to, className, activeClassName = 'is-current', matches, children, ...rest }: LinkProps) {
  const { path } = useRoute();
  const active = path === to || (matches?.includes(path) ?? false);
  return (
    <a
      href={`#${to}`}
      className={[className, active ? activeClassName : ''].filter(Boolean).join(' ') || undefined}
      aria-current={active ? 'page' : undefined}
      {...rest}
    >
      {children}
    </a>
  );
}
