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

Drop files anywhere on the page — each file is read as plain text and added to
the sidebar (`readTextFile` → `openFile`). Re-dropping a file with the same
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

- `src/functions/` — file session store (`localContextStore`) + file reader
- `src/components/` — `FileSidebar` (right column) and its provider-wired variant
- `src/dashboards/` — `FormatterDashboard` (header / content / footer shell,
  global drag & drop handling)

## Deployment

Deployed to GitHub Pages automatically on every push to `main` via
`.github/workflows/deploy-pages.yml` (builds with vite → `dist/`).
