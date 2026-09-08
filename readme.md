# @scripting-space/formatter

Scripting Space Formatter — plug-and-play dashboard that accepts dropped files
into a sidebar. The left content pane is reserved for future formatter output.

## Layout

```
┌──────────────────────────────────────────────┐
│ Header — drop hint                           │
├─────────────────────────────┬────────────────┤
│                             │ File sidebar   │
│ Content pane (LEFT)         │ (RIGHT)        │
│ reserved for formatter      │ one entry per  │
│ output — placeholder only   │ accepted file  │
├─────────────────────────────┴────────────────┤
│ Footer — loaded file count                   │
└──────────────────────────────────────────────┘
```

## Usage

Drop files anywhere on the page — the file-reader plugin reads each file
(kind detection + text/data-URL strategy) and opens it in the sidebar.
Re-dropping a file with the same
name replaces its sidebar entry instead of duplicating it. Clicking a sidebar
entry selects it; its × removes it (falling back to the most recent remaining
entry).

## Development

```bash
yarn install
yarn dev        # vite dev server
yarn test       # vitest run
yarn typecheck  # tsc --noEmit
yarn build      # vite build → dist/
```

## npm Publishing

The package is publishable to npm as `@scripting-space/formatter`:

```bash
yarn build:lib      # compile src/index.ts (the public barrel) → lib/ (JS + .d.ts)
yarn publish        # prepublishOnly runs: vitest → tsc --noEmit → build:lib
```

- **Public API = `src/index.ts`.** Everything consumers can import comes from
  that barrel (`lib/index.js` + `lib/index.d.ts` are built from it via
  `tsconfig.build.json`, with app-only `src/main.tsx` and tests excluded).
- `package.json` points `main` / `types` / `exports` at `lib/`, and `files`
  ships only `lib/` — app scaffolding (index.html, main.tsx, configs) never
  reaches npm.
- `sideEffects: false` + `exports` make the barrel tree-shakeable.
- `react` / `react-dom` are `peerDependencies` — the library compiles against
  the consumer's React copy.

### Consuming the library

```bash
yarn add @scripting-space/formatter
```

```tsx
import { FormatterDashboard, FileSidebar } from '@scripting-space/formatter';
```

Requires `react` / `react-dom` ≥ 18 in the consuming app (Vite / webpack /
any bundler that resolves the ESM output).

## Structure

Everything the dashboard shows is a plugin. `FormatterDashboard` executes a
plugin sequence (`defaultPlugins`) and exposes three target areas to every
plugin — **header slot**, **sidebar slot** and the **content area** — plus two
callback hooks: files dropped on the page (`onFilesDropped`) and a sidebar
file selected (`renderFile`).

- `src/plugins/core/` — `DashboardPlugin` contract (slots + hooks)
- `src/plugins/fileReader/` — file type reader plugin (drop hook: classifies
  and reads each dropped file → `readTextFile`)
- `src/plugins/header/` — title + subtitle block in the header slot
- `src/plugins/exportPdf/` — Export PDF button in the header slot (+ pdf-lib
  export in `exportFilesToPdf.ts`)
- `src/plugins/sidebar/` — file sidebar in the sidebar slot
- `src/plugins/content/` — text / image / video / binary renderer plugins
  (each hooks `renderFile` for its own file kind)
- `src/plugins/index.ts` — `defaultPlugins` execution sequence
- `src/functions/` — shared file session store (`localContextStore`), the
  context every plugin reads and mutates through
- `src/dashboards/` — `FormatterDashboard` (plugin executor: header /
  sidebar / content areas, global drag & drop, content tabs)

When a sidebar file is selected, the dashboard runs every plugin hooked into
`renderFile`. A plugin rendering its own file kind (image plugin → image,
text plugin → text) renders directly; if **two or more plugins** contribute
for the same file, the content area switches to **tabs** — one tab per
contributing plugin, in sequence order.

## Deployment

Deployed to GitHub Pages automatically on every push to `main` via
`.github/workflows/deploy-pages.yml` (builds with vite → `dist/`).
