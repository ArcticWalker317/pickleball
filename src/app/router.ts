// Minimal hash router (shared app shell). Routes look like "#/live?source=mock".
import { useSyncExternalStore } from 'react';

export type Route = { path: string; params: URLSearchParams };

function parse(): Route {
  const [path = '/', query = ''] = window.location.hash.replace(/^#/, '').split('?');
  return { path: path || '/', params: new URLSearchParams(query) };
}

let current = parse();
window.addEventListener('hashchange', () => (current = parse()));

export function useRoute(): Route {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb);
      return () => window.removeEventListener('hashchange', cb);
    },
    () => current,
  );
}

export function navigate(to: string) {
  window.location.hash = to;
}
