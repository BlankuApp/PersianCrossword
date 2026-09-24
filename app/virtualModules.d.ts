declare module "virtual:puzzle-hashes" {
  // Repo-relative puzzle path ("puzzles/1-50/14.json") → content hash (scripts/puzzleFiles.ts).
  const hashes: Readonly<Record<string, string>>;
  export default hashes;
}
