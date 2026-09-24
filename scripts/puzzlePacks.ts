// Groups published puzzles into packs of up to PACK_SIZE, so a new device downloads the
// whole library in a handful of Firestore reads. A puzzle keeps its pack for life (new ones
// fill the newest pack), so an edit re-sends one pack and a new puzzle only the newest.
import { sha256 } from "./puzzleFiles.ts";

// ~7.5 KB per puzzle at most today: 50 stays well under Firestore's 1 MiB document limit.
export const PACK_SIZE = 50;

export interface CatalogPack {
  // Changes whenever any puzzle in the pack does; the app compares only this.
  readonly hash: string;
  // Puzzle id → puzzle hash.
  readonly puzzles: Readonly<Record<string, string>>;
}

export interface PackPlan {
  readonly packs: Record<string, CatalogPack>;
  // Packs whose document must be (re)written.
  readonly dirty: string[];
  // Packs left empty by --prune; their documents are deleted.
  readonly deleted: string[];
}

export function packHash(puzzles: Readonly<Record<string, string>>): string {
  return sha256(Object.entries(puzzles).map(([id, hash]) => `${id}:${hash}`).sort().join("\n")).slice(0, 16);
}

const packNumber = (packId: string): number => Number.parseInt(packId.replace(/^p/, ""), 10) || 0;
const packId = (n: number): string => `p${String(n).padStart(3, "0")}`;

export function planPacks(
  current: Readonly<Record<string, CatalogPack>>,
  local: readonly { readonly id: string; readonly hash: string }[],
  prune: boolean,
): PackPlan {
  const members: Record<string, Record<string, string>> = {};
  const packOf = new Map<string, string>();
  for (const [pack, { puzzles }] of Object.entries(current)) {
    members[pack] = { ...puzzles };
    for (const id of Object.keys(puzzles)) packOf.set(id, pack);
  }
  let newest = Math.max(0, ...Object.keys(members).map(packNumber));

  for (const { id, hash } of local) {
    let pack = packOf.get(id);
    if (!pack) {
      const last = members[packId(newest)];
      pack = last && Object.keys(last).length < PACK_SIZE ? packId(newest) : packId(++newest);
      members[pack] ??= {};
      packOf.set(id, pack);
    }
    members[pack]![id] = hash;
  }

  if (prune) {
    const localIds = new Set(local.map((p) => p.id));
    for (const puzzles of Object.values(members)) {
      for (const id of Object.keys(puzzles)) if (!localIds.has(id)) delete puzzles[id];
    }
  }

  const packs: Record<string, CatalogPack> = {};
  const dirty: string[] = [];
  const deleted: string[] = [];
  for (const [pack, puzzles] of Object.entries(members).sort(([a], [b]) => a.localeCompare(b))) {
    if (!Object.keys(puzzles).length) {
      if (current[pack]) deleted.push(pack);
      continue;
    }
    const hash = packHash(puzzles);
    packs[pack] = { hash, puzzles };
    if (current[pack]?.hash !== hash) dirty.push(pack);
  }
  return { packs, dirty, deleted };
}
