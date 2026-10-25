# AI creation form cleanup

Goal: Reduce repeated fields and accept simpler grid JSON without changing existing puzzle data.

- [x] Group type, newspaper number, dimensions, title, newspaper, author and internal ID in the first step.
- [x] Use one normal/special selector for extraction and saved difficulty. Rename the newspaper number to distinguish it from the internal ID.
- [x] Suggest the title from the newspaper number and keep it updated until a custom title is entered. Restore both generated and custom titles correctly.
- [x] Hide source filenames, repeated dimensions and publication details in creation mode; preserve these fields in existing puzzle edit dialogs.
- [x] Keep the final step for review and save. Use a native number field for the visible ID; remove the copy action and unused advanced section.
- [x] Accept a bare two-dimensional grid array as well as the existing grid object. Preserve dimension, cell and puzzle validation and the saved puzzle format.

Constraints: reuse the existing metadata editor and data format; no dependencies, live data changes or custom stepper buttons.

Validation: 263 tests pass in 28 files, and TypeScript passes. Production build passed during form cleanup. No rendered browser check or live Firebase write was performed.
