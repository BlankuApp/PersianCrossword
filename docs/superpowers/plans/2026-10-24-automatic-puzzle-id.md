# Sequential puzzle IDs

Goal: Suggest the next numeric ID when creating a puzzle from photos.

- [x] Suggest one greater than the highest numeric ID among published puzzles and drafts, including Persian/Arabic digit normalization.
- [x] Refresh the automatic suggestion when catalog data loads; retain a manually chosen ID.
- [x] Reserve draft IDs and image references transactionally before any Storage calls. Retry automatic collisions up to three attempts, recording and advancing past every colliding ID, including the final failed attempt.
- [x] Keep interrupted uploads marked pending and allow identical JSON/image inputs to resume using cached Storage objects. Block editing, renaming and publication while pending, including stale UI saves.
- [x] Show the ID as a native HTML number input in the main metadata form, with min=1 and step=1. Mark duplicate/invalid IDs red and block saving until corrected.
- [x] Keep the saved ID stable; suggest a new one when saved content is changed into another draft. Do not persist IDs as reusable form preferences.
- [x] Preserve existing published IDs and the text ID editor for existing puzzles. Do not add a copy button.

Validation: regression tests cover catalog updates, concurrent collisions, manual errors, numeric bounds and saved-ID stability. No live Firebase write or rendered browser check was performed.

PR #28 repairs: regression tests cover occupied IDs without Storage calls, racing writers, interrupted uploads and resumption in both import flows, pending-draft guards, and retry exhaustion. No live Firebase writes were used for verification.
