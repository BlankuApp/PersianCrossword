# Sequential puzzle IDs

Goal: Suggest the next numeric ID when creating a puzzle from photos.

- [x] Suggest one greater than the highest numeric ID among published puzzles and drafts, including Persian/Arabic digit normalization.
- [x] Refresh the automatic suggestion when catalog data loads; retain a manually chosen ID.
- [x] Reuse transactional duplicate checks. Retry automatic collisions up to three attempts and keep metadata and image filenames aligned.
- [x] Show the ID as a native HTML number input in the main metadata form, with min=1 and step=1. Mark duplicate/invalid IDs red and block saving until corrected.
- [x] Keep the saved ID stable; suggest a new one when saved content is changed into another draft. Do not persist IDs as reusable form preferences.
- [x] Preserve existing published IDs and the text ID editor for existing puzzles. Do not add a copy button.

Validation: regression tests cover catalog updates, concurrent collisions, manual errors, numeric bounds and saved-ID stability. No live Firebase write or rendered browser check was performed.
