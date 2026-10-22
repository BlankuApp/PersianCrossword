# DESIGN.md — جدول انار

Visual style of the app. Theme: **Ripe Pomegranate (انار رسیده)**.

The app icon is a white pomegranate on red, and its seeds form a crossword grid
(`assets/icon-only.png`). The whole app uses the same idea: one red, warm off-white
paper, and soft pink highlights. Red is the "fruit"; everything else stays quiet.

## Principles

1. **One brand color.** Pomegranate red `#B3243A` is the only strong color. Use it for
   the main action, the selected square, active states and links. Do not add a second
   accent color.
2. **Warm neutrals.** Grays have a small red tint (never pure gray). The page is
   off-white, cards are white.
3. **Letters come first.** The grid must be easy to read. Highlights are soft; only the
   selected square is solid red.
4. **Red is not "wrong".** Because red is the brand color, errors and wrong letters use
   burnt orange. Correct answers use green.
5. **RTL first.** Layouts are right-to-left. Vertical columns are numbered from the right.

## Color tokens

Light theme only (no dark theme yet; a dark "Yalda Night" theme is a possible later addition).

### Brand

| Token | Hex | Use |
| --- | --- | --- |
| `--brand` | `#B3243A` | Main buttons, selected square, active tab, links, switches "on" |
| `--brand-strong` | `#931D30` | Hover / pressed state of brand elements, brand text on tinted backgrounds |
| `--brand-soft` | `#FBEDEF` | Tinted background: back button, hover on light buttons, active chip |
| `--brand-border` | `#E3A5AF` | Border of tinted elements |
| `--focus-ring` | `#D2576A` | Keyboard focus outline (2px), board focus glow at 50% alpha |
| `--on-brand` | `#FFFFFF` | Text and icons on `--brand` |

### Neutrals

| Token | Hex | Use |
| --- | --- | --- |
| `--page` | `#FBF7F6` | Page background (`:root`, `body`) |
| `--surface` | `#FFFFFF` | Cards, dialogs, menus, toolbar buttons |
| `--surface-alt` | `#F8F2F3` | Toolbars inside panels, selected list rows, table stripes |
| `--ink` | `#2A1619` | Main text |
| `--ink-2` | `#4A3236` | Secondary headings, strong labels |
| `--muted` | `#7A6467` | Subtitles, help text, meta info |
| `--faint` | `#9A8689` | Placeholders, chart ticks (not for important text) |
| `--line` | `#EBDCDE` | Soft dividers, card borders |
| `--line-strong` | `#D9C3C7` | Clue boxes, tiles, table borders |
| `--control-border` | `#A8868C` | Buttons, inputs, menus |

### Puzzle grid

| Token | Hex | Use |
| --- | --- | --- |
| `--grid-frame` | `#3A1E23` | Board border and the lines between squares |
| `--cell` | `#FFFFFF` | Open square |
| `--cell-block` | `#3A1E23` | Black square |
| `--cell-word` | `#F7DDE1` | Squares of the active word |
| `--cell-down-word` | `#F1E9EA` | Squares of the crossing word (other direction) |
| `--cell-selected` | `#B3243A` | Selected square (letter in `--on-brand`) |
| `--cell-correct` | `#256B42` | Letter color after a correct check |
| `--cell-incorrect` | `#C2410C` | Letter color after a wrong check |

The selected square always keeps its white `--on-brand` letter, also after a check.
Green or orange letters on the red square are not readable (about 1.3:1). The check
color shows on that square again when the selection moves away. In CSS, the
`.cell-selected` letter color must win over `.cell-correct` / `.cell-incorrect`.

### Status

| Token | Hex | Use |
| --- | --- | --- |
| `--success` | `#256B42` | "Solved" badge text, success messages |
| `--success-soft` | `#E6F2EA` | Success badge / message background |
| `--warning` | `#9A5208` | In-progress badge, warnings |
| `--warning-soft` | `#FDF1E3` | Warning background |
| `--danger` | `#A3360B` | Error text, destructive menu items ("delete", "unpublish") |
| `--danger-soft` | `#FDEDE6` | Error panel background |

Contrast (WCAG): `--on-brand` on `--brand` 6.5:1, `--ink` on `--page` 16:1,
`--muted` on `--page` 5.1:1, `--brand` on `--surface` 6.5:1, `--success` on
`--success-soft` 5.6:1, `--control-border` on `--surface` 3.25:1 (non-text minimum is 3:1).
Keep `--faint` for non-essential text only (about 3.2:1).

## Migration from the old green theme

The old app was green (`#1E5C38`). Replace colors like this:

| Old | New |
| --- | --- |
| `#1E5C38` (brand green) | `--brand` `#B3243A` |
| `#4C9F70` (focus green) | `--focus-ring` `#D2576A` |
| `#EDF6F0`, `#EEF3EF`, `#E4EEE7` (green tints) | `--brand-soft` `#FBEDEF` |
| `#8CBCA0` (green border) | `--brand-border` `#E3A5AF` |
| `#F6F4EF` (page) | `--page` `#FBF7F6` |
| `#17201B`, `#1E2A23` (ink, board) | `--ink` `#2A1619`, `--grid-frame` `#3A1E23` |
| `#5A645D`, `#5B6B61` (muted) | `--muted` `#7A6467` |
| `#DDE3DE`, `#D3D8D2`, `#BAC3BC` (borders) | `--line`, `--line-strong`, `--control-border` |
| `#D7EADF` (active word) | `--cell-word` `#F7DDE1` |
| `#E9EDF1` (down word) | `--cell-down-word` `#F1E9EA` |
| `#F0C96A` (selected, yellow) | `--cell-selected` `#B3243A` + white letter |
| `#145C35` (correct) | `--cell-correct` `#256B42` |
| `#8B1A1A` (wrong / danger) | `--cell-incorrect` `#C2410C`, `--danger` `#A3360B` |

Category colors for icons (blue, purple, amber) can stay, but keep them soft so they
do not compete with the brand red.

## Typography

- Font: **Vazirmatn** (bundled in `app/fonts/`), fallback `"Segoe UI", Tahoma, Arial, sans-serif`.
- Weights: 400 body, 500 labels, 700 headings, buttons and grid letters.
- Headings: `--font-h1` (`clamp(1.4rem, 3vw, 2rem)`); home page `--font-h1-home`.
- Numbers shown to players use Persian digits (`app/persianNumbers.ts`).
- Code / ids (admin only): `ui-monospace, SFMono-Regular, Menlo, monospace`.

## Shapes and spacing

- Radius: 8px buttons and inputs, 12–14px cards and dialogs, 999px pills and chips.
  The grid squares have no radius; the board frame has a small radius.
- Shadows: only on floating things (menus, dialogs, toasts). Cards use a 1px `--line` border.
- Sizing tokens (`--shell-padding`, `--toolbar-btn-min-h`, `--stack-gap`, …) are set in
  `:root` and changed per breakpoint tier (see the top of `app/styles.css`).

## Components

- **Header:** `--page` background, title in `--ink`. The back button is a tinted pill
  (`--brand-soft` background, `--brand-border` border, `--brand` icon).
- **Primary button:** `--brand` background, `--on-brand` text; hover `--brand-strong`.
- **Secondary button:** `--surface` background, `--control-border` border, `--ink` text;
  hover `--brand-soft`.
- **Switch (on):** track `--brand`, label `--brand`.
- **Active clue box:** `--surface`, `--line-strong` border; the clue number in `--brand`.
- **Badges:** solved = `--success` on `--success-soft`; in progress = `--warning` on
  `--warning-soft`; new = `--brand` on `--brand-soft`.
- **Focus:** always visible: 2px `--focus-ring` outline with 2px offset.

## Icon and brand assets

- App icon: `assets/icon-only.png` (red `#B3243A` background, white fruit, red seeds).
- Android launcher icons, favicon and `.github/social-preview.png` use the same art.
- Do not recolor the icon. Do not put the icon on a red background inside the app; on
  `--page` or `--surface` use the icon as is (with its rounded red square).
