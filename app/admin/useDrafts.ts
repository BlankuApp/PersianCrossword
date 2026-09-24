import { useSyncExternalStore } from "react";
import { listenDrafts, type Draft } from "./adminApi";

// The admin's drafts, kept live from Firestore while any admin screen is open.
interface DraftsSnapshot {
  readonly drafts: readonly Draft[];
  readonly loaded: boolean;
  readonly error: string | null;
}

let _snapshot: DraftsSnapshot = { drafts: [], loaded: false, error: null };
const _listeners = new Set<() => void>();
let _unsubscribe: (() => void) | null = null;

function update(next: DraftsSnapshot): void {
  _snapshot = next;
  for (const listener of _listeners) listener();
}

function subscribe(listener: () => void): () => void {
  _listeners.add(listener);
  _unsubscribe ??= listenDrafts(
    (drafts) => update({ drafts: [...drafts].sort((a, b) => b.updatedAt - a.updatedAt), loaded: true, error: null }),
    (error) => update({ ..._snapshot, loaded: true, error: error.message }),
  );
  return () => {
    _listeners.delete(listener);
    if (!_listeners.size) {
      _unsubscribe?.();
      _unsubscribe = null;
      _snapshot = { drafts: [], loaded: false, error: null };
    }
  };
}

export function useDrafts(): DraftsSnapshot {
  return useSyncExternalStore(subscribe, () => _snapshot);
}
