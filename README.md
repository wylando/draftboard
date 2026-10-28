<div align="center">

<img src="public/favicon.svg" alt="Draftboard logo" width="72" height="72" />

# Draftboard

**A fast, offline-first design canvas for the browser.**

Draw, arrange and fine-tune shapes on an infinite canvas: no account, no cloud, no network.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)
![Panda CSS](https://img.shields.io/badge/Panda_CSS-2-F6E458)
![Ark UI](https://img.shields.io/badge/Ark_UI-5-EB5E41)
![Cypress](https://img.shields.io/badge/tested_with-Cypress-69D3A7?logo=cypress&logoColor=white)

[Features](#-features) ·
[Quick start](#-quick-start) ·
[Usage](#-usage) ·
[Development](#-development) ·
[Contributing](#-contributing)

</div>

---

## ✨ Features

- 🎨 **Drawing tools**: frames, rectangles, ellipses, lines and text. Drag to draw, or click to drop a default-size shape.
- 🖱️ **Direct manipulation**: click, Shift-click or marquee-select. Move, resize with eight handles (rotated shapes too), rotate by dragging just outside a corner (Shift snaps to 15°), and constrain with Shift.
- 📐 **Smart guides**: moving, resizing or drawing snaps to the edges and centers of other layers on screen, with a guide line for each match. Hold ⌘/Ctrl once a drag has started to skip it (held before the click, it deep-selects as usual), or turn it off under Settings → Canvas. A moved layer also snaps to a gap already used between layers in its row or column, or to the middle between two neighbours, with every equal gap marked. Resizing a rotated layer doesn't snap yet.
- 📏 **Measure**: with a layer selected, hold Alt/Option and point at another layer to see the distances between them, including the space on each side when one encloses the other.
- 🗃️ **Database tables**: sketch a schema with table layers: a header with the table name, one row per column with its type, and PK / UQ badges, `?` for nullable and an `idx` marker for indexed columns. Add, rename, retype, flag and delete columns, define indexes (their column order is shown), and pick a header color from 8 swatches or any hex, in the Design panel; each change is one undo step. A table with more than 3 columns lists each as a one-line row (name, type, PK/UQ) that opens to edit; past 5, the rest wait behind "Show N more columns". Add column turns into the new column's editor, its name selected to type over, while columns hidden behind "Show N more" stay hidden; press Enter or click elsewhere and the column joins the list (behind Show more if past the first 5) and the button returns. A column picked on the canvas opens in its place, showing the whole list if it was hidden (Show fewer columns folds it back), and the Design panel scrolls to it. Each index shows on one line (name, its columns in order, UQ) and opens to edit when clicked, folding back when you click elsewhere; pick its columns in a search box (fuzzy: `crat` finds `created_at`; empty, it lists every column), shown as chips you drag to reorder or × to remove (from the keyboard: Alt+← / Alt+→ moves a focused chip, Backspace removes it). Column and index names are unique per table, ignoring case, and a primary key is never nullable. Long names are cut short with an ellipsis; tables are at least 120 px wide. A damaged table in a saved or imported file is repaired rather than refused. On the canvas, double-click a table's header or a cell to edit it in place (Tab moves on, Enter on the last row adds a column), click a row of the selected table and press Delete to remove that column, or drag the grip left of a row to reorder. Settings → Canvas → SQL dialect (PostgreSQL, MySQL, SQLite) picks the type suggestions and the new `id` type; types stay free text.
- 🔗 **Connectors**: link a column to a column (a foreign key), a whole table, or any shape. While you drag, the row or layer it will attach to lights up with its anchor points. Lines route with right angles, leave each side straight, go around visible tables (fewest bends, tight spots allowed; straight lines may cross them), and follow their layers as they move, rerouting live when a table moves onto them; an end with a table pushed up against its side leaves by another side of its table. Drag any middle segment of a selected right-angled connector sideways to reshape it (one undo step), even past the segments beside it; dropped on the line of one beside it (within 6 screen px), the two merge, and a connector with no jogs left is automatic again. Moving one of its tables drops the shape and routes it afresh (undo brings it back); moving the connector together with both its tables carries the shape along. A shaped connector detours around any other table placed on it (the original shape returns when the table moves away), and re-attaching an end or "Reset route" in the Design panel returns it to automatic routing. Deleting what an end was attached to leaves a dashed loose end, counted in a "broken connectors" toolbar button that selects them; undo reattaches it. Select a connector to drag either end to another row or layer (or off into space), switch it between right-angled and straight in the Design panel, and see what each end is attached to. Copying layers together with their connectors keeps the links; a connector copied without its layers comes loose.
- 🧩 **Relationships**: connector ends show crow's-foot markers (one, zero-or-one, many, one-or-many, or none); click a marker to cycle it. Links between plain shapes have no markers. Column to column starts as a many-to-one foreign key: the source column shows an FK badge (PFK or UFK when it is also the primary key or unique), and a warning sign appears on the line while the two columns' types differ. Turn "Foreign key" off in the Design panel for a purely visual link. Table to table starts one-to-many, and only whole tables may be many-to-many. Select a table (on the canvas or in the Layers panel, and while editing its cells) and its connectors and the tables they link it to light up; with three or more tables selected, all of their links do. Select exactly two tables and only the cheapest join path from the first to the second lights up: a join into an indexed column (primary key, unique, or an index's first column) counts as cheap and any other join as a scan, so an indexed two-hop route can beat a direct link (nothing lights up when they aren't linked). A dark popup beside the highlighted route ("Estimated fastest route") lists that route's tables in order and whether each join is an index lookup or a scan; it places itself where it covers none of the route's tables or links (below, above, right, then left of the route, else a clear corner), steps aside while you drag, pan or zoom, and its × closes it until the selection changes. Below the list, "Guaranteed route" shows the cheapest route whose every join enters its table at a mandatory end (one, or one or many), so a matching row always exists; it appears only when such a route exists and the fastest one has a join that may find no row. The guarantee follows the markers, not column nullability (imported foreign keys get a one marker even when nullable). Pick the highlight color under Settings → Canvas → Relationship highlight. Settings → Symbols explains the connector markers, line styles, column badges and route terms, drawn as the canvas draws them.
- 🎛️ **Properties panel**: position, size, rotation, corner radius, fill, stroke, opacity, and text content and size. Type a value, or drag a number field's label sideways to scrub it (Shift ×10, Alt ×0.1); a whole scrub undoes in one step.
- 🗂️ **Layers tree**: a code-editor-style tree with collapsible frames and groups and indent guides. Select, rename, show or hide any layer, and drag to reorder or nest. Connectors don't get a row (they are links between layers, always visible); select one on the canvas. Layer names are unique, ignoring case: a rename to a name another layer has is refused with a short message.
- 🪆 **Frames and groups**: shapes drawn or dropped on a frame go inside it and move with it. Group the selection (`⌘G`) to move and scale it as one; double-click to select inside a group.
- ↔️ **Resizable panels**: drag the inner edge of the Layers or Design panel to resize it (Layers 160–480 px, Design 240–480 px), or past its narrowest to collapse it. Each panel has a title bar that stays put while it scrolls, with a button on its canvas side that folds the panel into a small button in its corner of the canvas (top left for Layers, top right for Design); click that to unfold it again. The canvas content stays where it is on screen whichever panel changes, and the floating tool dock stays put when a panel resizes, hides or shows. Long layer names end in an ellipsis; the panels never scroll sideways. Widths and collapsed panels are remembered in this browser.
- 🪗 **Foldable Design sections**: the Design panel groups a layer's name, position and size under Layer, and its fill, stroke and opacity under Appearance. Click a section title (Layer, Appearance, Columns, Arrange, …) to fold it down to its title, and again to unfold it. The two buttons at the right of the Design title bar expand or collapse every section at once; collapse all also folds sections that appear later, such as Text when you next select a text layer. A section stays folded as you select other layers and switch boards, and the folds are remembered in this browser.
- 🔲 **Canvas grid**: dots, lines or none, chosen under Settings → Canvas.
- 📋 **Copy, cut and paste** layers with their children (`⌘C` / `⌘X` / `⌘V`). Each paste lands 10px from the last. Pasted and duplicated layers get the next free name ("Rectangle 1" → "Rectangle 2"). The clipboard lives in memory, so it's cleared on reload.
- 📥 **Import schema**: paste PostgreSQL, MySQL or SQLite SQL, paste DBML, or choose a `.sql`, `.dbml` or SQLite database (`.db`, `.sqlite`, `.sqlite3`) file; files are read in your browser, nothing is uploaded, from the top bar's Import menu → Schema (SQL, DBML, SQLite)… dialog (also "Import SQL or DBML…" on an empty board). The dialect is detected from the text (falling back to your SQL dialect setting) and can be switched in the preview (SQL re-parses; for DBML it re-maps the column types without re-parsing). SQLite databases are read with a bundled SQLite engine (loaded only when needed, never from the network), and pasted SQLite DDL runs in a throwaway in-memory database where only schema statements execute (no `INSERT`, `PRAGMA` or `ATTACH`); views, triggers and virtual (full-text) tables are listed as skipped. DBML is detected too and parsed only when needed; any DBML error imports nothing and lists each error with its line and column. For DBML the preview's toggle becomes "Column types" and maps DBML types to PostgreSQL, MySQL or SQLite (default: your SQL dialect setting; unknown types such as enum names stay as written). `-` refs import as one-to-one and `<>` as one table-to-table many-to-many connector with no FK badge; enums aren't imported (a note says so). Preview the tables, relationships and warnings first. Add to canvas lays the tables and foreign-key connectors out left to right, referenced tables first, to the right of your existing content, as one undo step; Replace document swaps the whole design for the import after a confirmation, since it clears undo history. A statement that can't be read becomes a warning with its line number; dump noise is ignored and views, functions, triggers and `INSERT`s are listed as skipped. mysqldump output is understood (versioned `/*!…*/` code, `DELIMITER` blocks); a `DROP TABLE` of a table defined earlier in the file removes it and its relationships; repeated `INSERT`/`COPY` data shows as one "Skipped N … statements" line; an unterminated quote or comment is reported at the line it starts. Columns named like keys (`user_id`, `userId`) that no declared key covers are offered as unticked "Guessed relationships" (tick the ones to add): the match is by table name (plural forms included), only to a table with a single-column primary key of the same type, and ambiguous matches are skipped; guessed connectors carry no FK badge, and long lists collapse after 8. A Select all box above the list ticks every guess (including collapsed ones) or, when all are ticked, clears them. Name clashes get the next free name.
- 📤 **Export schema**: the top bar's Export menu → Schema as SQL or DBML… dialog writes the selected tables (or, with no table selected, every visible table on the board) as PostgreSQL, MySQL or SQLite DDL, or as DBML, with Copy and Download. It writes columns (types as typed; a blank type becomes the dialect's default), primary keys (composite ones as a table constraint), `NOT NULL`, `UNIQUE`, defaults, indexes and notes (`--` comments in SQL). Foreign-key connectors become foreign keys (added with `ALTER TABLE` after the tables in PostgreSQL and MySQL, inline in SQLite); a one-to-one also makes its column unique. A many-to-many between two tables becomes a junction table in SQL (both primary keys, plus two foreign keys) and a `<>` ref in DBML. Every SQL identifier is quoted, and index names are made unique across the schema where PostgreSQL and SQLite need it. Anything it can't write (a column link that isn't a foreign key, a link to a table outside the export, a many-to-many without primary keys) is listed under the preview.
- ↩️ **Full undo / redo** for every edit and gesture.
- 🔍 **Smooth viewport**: wheel to pan, ⌘/Ctrl + wheel to zoom around the pointer, Space-drag to pan, plus zoom to 100% and zoom to fit. The zoom level on the right of the top bar opens a menu with all four zoom commands and their shortcuts.
- 🚀 **Large boards**: only the layers in and near the view are drawn; the rest are unmounted until you pan or zoom to them. Selected layers and the one you're editing always stay drawn, and the Layers panel still lists everything.
- ⌨️ **Fully remappable shortcuts**: rebind any command, give one command several keys, and resolve conflicts from a built-in Settings page.
- 🗂️ **Boards**: browser-style tabs in the top bar, each one its own design with its own undo history, selection and view. `+` adds a board ("Board 2", the next free number); the `×` on a tab closes it, after asking when it has layers (it can't be undone); the last board can't be closed. Double-click a tab to rename it (Enter or clicking away saves, Esc cancels; an empty name or one another board has, ignoring case, keeps the old name). Drag a tab sideways to reorder; the open board stays open. Right-click a tab for a menu to rename, duplicate or close it; a duplicate sits right after the original with its layers, the next free name ("Board 1" → "Board 2"), a fresh undo history and the same view. `Alt+N`, `Alt+W` and `Alt+]` / `Alt+[` add, close and cycle boards (the last wraps around). Copy on one board and paste on another. Arrow keys move focus between tabs, Enter or Space opens one.
- 🧭 **First run**: an empty board shows a card over the canvas with Add a table (at the view centre), Import SQL or DBML…, Open a board file…, Try an example (a four-table shop schema, one undo step) and a Getting started link; it goes away with the first layer and returns when the board is emptied. Getting started (logo menu, or `?`) is a task-based "First schema" walkthrough with pictures drawn by the canvas renderer; `#/settings/getting-started` links straight to it.
- 💾 **Autosave**: your boards save to the browser as you work. Export or import it as JSON at any time from the top bar's Export and Import menus (Board file). Importing over a non-empty design asks first, because it replaces the canvas and clears undo history. If a loaded document repeats a layer name, later layers get the next free name.
- 💬 **Accessible dialogs**: confirmations and errors open in a modal dialog (focus trapped, Escape to cancel) instead of browser pop-ups. Editor shortcuts pause while one is open.
- 📴 **100% offline**: no CDNs, web fonts, analytics or remote assets. Once dependencies are installed, nothing leaves your machine.

## 🚀 Quick start

> **Prerequisites:** Node.js **26** (see [`.nvmrc`](.nvmrc)) and npm 11+.

```bash
git clone <your-fork-url> draftboard
cd draftboard
npm install
npm run dev
```

Then open **http://localhost:5173**. That's it.

## 📖 Usage

### Tools

| Tool      | Key | What it does |
| --------- | :-: | ------------ |
| Move      | `V` | Select, move, resize and rotate layers. Drag just outside a corner to rotate. Drag on empty canvas to box-select. |
| Frame     | `F` | Draw a white artboard. Layers drawn or dropped on it go inside it. |
| Rectangle | `R` | Draw a rectangle. Hold Shift for a square. |
| Ellipse   | `O` | Draw an ellipse. Hold Shift for a circle. |
| Line      | `L` | Draw a straight line. Hold Shift to snap to 45°. |
| Text      | `T` | Click to place text and start typing. Enter finishes; Shift+Enter adds a line. |
| Table     | `D` | Place a database table with an `id` primary key; drag to set its width. |
| Connector | `C` | Drag from a table row, a table or any shape to another to link them. An end dropped on empty canvas stays loose. |
| Hand      | `H` | Drag to pan without selecting anything. |

### Default shortcuts

| Action                     | macOS            | Windows / Linux      |
| -------------------------- | ---------------- | -------------------- |
| Undo / Redo                | `⌘Z` / `⇧⌘Z`     | `Ctrl+Z` / `Ctrl+Y`  |
| Copy / Cut / Paste         | `⌘C` / `⌘X` / `⌘V` | `Ctrl+C` / `Ctrl+X` / `Ctrl+V` |
| Duplicate                  | `⌘D`             | `Ctrl+D`             |
| Delete                     | `⌫` / `Delete`   | `Backspace` / `Delete` |
| Select all                 | `⌘A`             | `Ctrl+A`             |
| Bring forward / Send backward | `⌘]` / `⌘[`   | `Ctrl+]` / `Ctrl+[`  |
| Bring to front / Send to back | `⌥⌘]` / `⌥⌘[` | `Ctrl+Alt+]` / `Ctrl+Alt+[` |
| Group / Ungroup            | `⌘G` / `⇧⌘G`     | `Ctrl+G` / `Ctrl+Shift+G` |
| Nudge (1px / 10px)         | `←↑→↓` / `⇧` + arrows | same             |
| Zoom in / out              | `⌘=` / `⌘-`      | `Ctrl+=` / `Ctrl+-`  |
| Zoom to 100% / to fit      | `⇧0` / `⇧1`      | `Shift+0` / `Shift+1` |
| Deselect / exit tool       | `Esc`            | `Esc`                |
| New / Close board          | `⌥N` / `⌥W`      | `Alt+N` / `Alt+W`    |
| Next / Previous board      | `⌥]` / `⌥[`      | `Alt+]` / `Alt+[`    |

> [!TIP]
> Every shortcut above is just a default. Open **Settings** (in the logo menu, top left) to rebind, add or remove keys. Your changes are saved in the browser.

### Saving your work

Boards autosave to `localStorage` (their names, order, the open board and their layers; undo history and the view are not saved). Panel widths, which panels are collapsed and which Design sections are folded are saved too, separately. A design saved before boards existed opens as "Board 1". Use the top bar's Export menu to **export** the open board as JSON (saved as `<board name>.draftboard.json`) or the Import menu to **import** one back into it. If the canvas isn't empty, Draftboard asks before an import replaces it. Storage is scoped to the browser and the address, which is why the dev server always runs on port `5173`.

## 🛠 Development

### Scripts

| Command                 | Description |
| ----------------------- | ----------- |
| `npm run dev`           | Start the dev server at http://localhost:5173 |
| `npm run build`         | Typecheck and build for production into `dist/` |
| `npm run preview`       | Serve the production build locally |
| `npm run lint`          | Lint with ESLint (typescript-eslint + react-hooks) |
| `npm run typecheck`     | Typecheck the app and the test suite |
| `npm run test:unit`     | Run the Vitest unit tests for pure logic (`src/**/*.test.ts`) |
| `npm run test:e2e`      | Run the Cypress suite headless against the dev server |
| `npm run test:e2e:dist` | Run the Cypress suite against the production build |
| `npm run cy:open`       | Open the Cypress runner interactively (start `npm run dev -- --port 5199` first) |
| `npm run verify`        | Run everything CI runs: lint, typecheck, unit tests, build and e2e |

### Tech stack

- **[React 19](https://react.dev)** + **[TypeScript](https://www.typescriptlang.org)** (strict mode)
- **[Vite](https://vite.dev)** for dev and build
- **[Panda CSS](https://panda-css.com)** for type-safe design tokens and recipes
- **[Ark UI](https://ark-ui.com)** headless components (dialog, tabs, menu, radio group, checkbox, toggle group, field), styled with Panda recipes
- **SVG** rendering for every shape on the canvas
- **[Vitest](https://vitest.dev)** unit tests for pure, React-free modules
- **[Cypress](https://www.cypress.io)** end-to-end tests that drive the canvas with real pointer events

### Project structure

```
src/
├── app/              # Hash-based routing (editor ↔ settings), no router dependency
├── design-system/    # Panda theme (tokens, semantic tokens, recipes), UI primitives (some on Ark UI), dialogs, icons
├── editor/
│   ├── model/        # Document types, node factories, reducer with undo history, boards (workspace)
│   ├── schemaImport/ # SQL schema import: parsers, layout, conversion to table nodes
│   ├── schemaExport/ # SQL and DBML export of the designed tables
│   ├── hooks/        # Pointer gestures, keyboard shortcuts, viewport
│   ├── components/   # Canvas, selection overlay, layers and properties panels, top bar, floating tool dock
│   ├── geometry.ts   # Pure math: transforms, resize, bounds
│   └── persistence.ts# localStorage (boards) + JSON import/export
├── settings/         # Command registry, keybinding storage, Settings page
└── shared/           # Small shared hooks
cypress/
└── e2e/              # One spec per feature area
```

### Design system

The theme lives in [`src/design-system/theme/`](src/design-system/theme/):

- `tokens.ts`: primitive values
- `semanticTokens.ts`: the tokens components actually use. **Remap these to re-theme the app.**
- `textStyles.ts`: type styles
- `recipes/`: component styles. Components built on [Ark UI](https://ark-ui.com) get a slot recipe whose slots match Ark's parts (for example `dialog`: backdrop, positioner, content, title, description, actions), and each part gets its slot class.

`strictTokens` is on, so components can only use defined tokens and a stray hex value fails the typecheck.

For messages and yes/no questions, call `useDialogs()` (`alert` / `confirm`, both return promises) rather than `window.alert` or `window.confirm`. For a custom modal, render `<Dialog>`.

### Continuous integration

- **Pre-push hook:** runs lint, typecheck and unit tests locally in a few seconds. `npm install` sets it up automatically.
- **GitHub Actions:** every pull request into `main` runs **Lint & typecheck** first, then **Build & E2E** against the production build.

## 🤝 Contributing

Contributions are welcome! Before you open a pull request:

1. Follow the conventions in the surrounding code (architecture, Panda styling, test style).
2. Add or update a Cypress spec for any user-facing change, and a Vitest unit test (`*.test.ts` next to the module) for pure logic.
3. Make sure `npm run verify` passes locally.

Found a bug or have an idea? [Open an issue](../../issues).

<div align="center">

<sub>Built with ❤️ using React, TypeScript and Panda CSS.</sub>

</div>
