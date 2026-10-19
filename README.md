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
- 🖱️ **Direct manipulation**: click, Shift-click or marquee-select. Move, resize with eight handles (rotated shapes too), and constrain with Shift.
- 🎛️ **Properties panel**: position, size, rotation, corner radius, fill, stroke, opacity, and text content and size. Type a value, or drag a number field's label sideways to scrub it (Shift ×10, Alt ×0.1); a whole scrub undoes in one step.
- 🗂️ **Layers tree**: a code-editor-style tree with collapsible frames and groups and indent guides. Select, rename, show or hide any layer, and drag to reorder or nest. Layer names are unique, ignoring case: a rename to a name another layer has is refused with a short message.
- 🪆 **Frames and groups**: shapes drawn or dropped on a frame go inside it and move with it. Group the selection (`⌘G`) to move and scale it as one; double-click to select inside a group.
- 🔲 **Canvas grid**: dots, lines or none, chosen under Settings → Canvas.
- 📋 **Copy, cut and paste** layers with their children (`⌘C` / `⌘X` / `⌘V`). Each paste lands 10px from the last. Pasted and duplicated layers get the next free name ("Rectangle 1" → "Rectangle 2"). The clipboard lives in memory, so it's cleared on reload.
- ↩️ **Full undo / redo** for every edit and gesture.
- 🔍 **Smooth viewport**: wheel to pan, ⌘/Ctrl + wheel to zoom around the pointer, Space-drag to pan, plus zoom to 100% and zoom to fit.
- ⌨️ **Fully remappable shortcuts**: rebind any command, give one command several keys, and resolve conflicts from a built-in Settings page.
- 💾 **Autosave**: your document saves to the browser as you work. Export or import it as JSON at any time. Importing over a non-empty design asks first, because it replaces the canvas and clears undo history. If a loaded document repeats a layer name, later layers get the next free name.
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
| Move      | `V` | Select, move and resize layers. Drag on empty canvas to box-select. |
| Frame     | `F` | Draw a white artboard. Layers drawn or dropped on it go inside it. |
| Rectangle | `R` | Draw a rectangle. Hold Shift for a square. |
| Ellipse   | `O` | Draw an ellipse. Hold Shift for a circle. |
| Line      | `L` | Draw a straight line. Hold Shift to snap to 45°. |
| Text      | `T` | Click to place text and start typing. Enter finishes; Shift+Enter adds a line. |
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

> [!TIP]
> Every shortcut above is just a default. Open **Settings** (the gear icon, top right) to rebind, add or remove keys. Your changes are saved in the browser.

### Saving your work

Documents autosave to `localStorage`. Use the toolbar to **export** a document as JSON or **import** one back. If the canvas isn't empty, Draftboard asks before an import replaces it. Storage is scoped to the browser and the address, which is why the dev server always runs on port `5173`.

## 🛠 Development

### Scripts

| Command                 | Description |
| ----------------------- | ----------- |
| `npm run dev`           | Start the dev server at http://localhost:5173 |
| `npm run build`         | Typecheck and build for production into `dist/` |
| `npm run preview`       | Serve the production build locally |
| `npm run lint`          | Lint with ESLint (typescript-eslint + react-hooks) |
| `npm run typecheck`     | Typecheck the app and the test suite |
| `npm run test:e2e`      | Run the Cypress suite headless against the dev server |
| `npm run test:e2e:dist` | Run the Cypress suite against the production build |
| `npm run cy:open`       | Open the Cypress runner interactively (start `npm run dev -- --port 5199` first) |
| `npm run verify`        | Run everything CI runs: lint, typecheck, build and e2e |

### Tech stack

- **[React 19](https://react.dev)** + **[TypeScript](https://www.typescriptlang.org)** (strict mode)
- **[Vite](https://vite.dev)** for dev and build
- **[Panda CSS](https://panda-css.com)** for type-safe design tokens and recipes
- **[Ark UI](https://ark-ui.com)** headless components (dialog, tabs, radio group, toggle group, field), styled with Panda recipes
- **SVG** rendering for every shape on the canvas
- **[Cypress](https://www.cypress.io)** end-to-end tests that drive the canvas with real pointer events

### Project structure

```
src/
├── app/              # Hash-based routing (editor ↔ settings), no router dependency
├── design-system/    # Panda theme (tokens, semantic tokens, recipes), UI primitives (some on Ark UI), dialogs, icons
├── editor/
│   ├── model/        # Document types, node factories, reducer with undo history
│   ├── hooks/        # Pointer gestures, keyboard shortcuts, viewport
│   ├── components/   # Canvas, selection overlay, layers and properties panels, toolbar
│   ├── geometry.ts   # Pure math: transforms, resize, bounds
│   └── persistence.ts# localStorage + JSON import/export
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

- **Pre-push hook:** runs lint and typecheck locally in a few seconds. `npm install` sets it up automatically.
- **GitHub Actions:** every pull request into `main` runs **Lint & typecheck** first, then **Build & E2E** against the production build.

## 🤝 Contributing

Contributions are welcome! Before you open a pull request:

1. Follow the conventions in the surrounding code (architecture, Panda styling, test style).
2. Add or update a Cypress spec for any user-facing change.
3. Make sure `npm run verify` passes locally.

Found a bug or have an idea? [Open an issue](../../issues).

<div align="center">

<sub>Built with ❤️ using React, TypeScript and Panda CSS.</sub>

</div>
