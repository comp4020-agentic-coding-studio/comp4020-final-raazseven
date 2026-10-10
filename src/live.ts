// A tiny in-memory pub-sub, one channel per group code. This is enough
// because fly.toml runs exactly one machine for this app (min_machines_running
// = 0, no horizontal scaling) --- there's only ever one process to broadcast
// from, so there's nothing to coordinate across.
//
// See decisions/0001-live-update-scope.md for *what* gets broadcast and why.

export interface LiveEvent {
  type: "result" | "group-match" | "member";
  html: string;
}

type Listener = (event: LiveEvent) => void;

const channels = new Map<string, Set<Listener>>();

export function subscribe(code: string, listener: Listener): () => void {
  let listeners = channels.get(code);
  if (!listeners) {
    listeners = new Set();
    channels.set(code, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners!.delete(listener);
    if (listeners!.size === 0) channels.delete(code);
  };
}

export function broadcast(code: string, event: LiveEvent): void {
  const listeners = channels.get(code);
  if (!listeners) return;
  for (const listener of listeners) listener(event);
}

/** How many sessions currently have `code`'s group page open --- used only for tests/diagnostics. */
export function listenerCount(code: string): number {
  return channels.get(code)?.size ?? 0;
}
