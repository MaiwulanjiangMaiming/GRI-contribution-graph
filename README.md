# GitHub Resonance Imaging (GRI)

[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/MaiwulanjiangMaiming/GRI-contribution-graph/main.yml?label=demo&style=flat-square)](https://github.com/MaiwulanjiangMaiming/GRI-contribution-graph/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

> An animated MRI scan visualization of GitHub contribution graphs.

Pull a GitHub user's contribution graph, simulate an MRI acquisition sequence — complete with k-space filling, echo formation, and image reconstruction — then render it as an animated SVG or interactive HTML.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/MaiwulanjiangMaiming/GRI-contribution-graph/output/gri-dark.svg" />
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/MaiwulanjiangMaiming/GRI-contribution-graph/output/gri-light.svg" />
  <img alt="GitHub Resonance Imaging scan animation" src="https://raw.githubusercontent.com/MaiwulanjiangMaiming/GRI-contribution-graph/output/gri-dark.svg" />
</picture>

## Features

- **MRI Simulation** — Watch the scan line sweep across weeks, fill k-space, form an echo, and reconstruct the contribution image
- **Dark & Light Themes** — Automatic theme switching via `prefers-color-scheme`
- **Interactive Controls** — Pause/play and re-scan
- **GitHub Action** — Auto-generate daily for your profile README
- **Interactive Demo** — Try it live at [maiwulanjiangmaiming.github.io/pages/gri-demo.html](https://maiwulanjiangmaiming.github.io/pages/gri-demo.html)
- **Real Contribution Data** — Fetches actual GitHub contribution data via GraphQL API
- **Tooltip on Hover** — Hover any cell to see exact contribution count and date
- **Real-time Σ Signal** — Signal accumulates as the scan progresses

## Live Demo

**[View Live Demo →](https://maiwulanjiangmaiming.github.io/pages/gri-demo.html)**

The demo features:
- Dark & Light theme toggle
- Real contribution data visualization
- MRI scan animation with k-space and echo
- Hover tooltips showing contribution details

## Use in your own README

Three steps to get the same animated scanner in your own profile / project README.

### 1. Add a workflow to your repo

Create `.github/workflows/gri.yml` (replace `YOUR_USERNAME` with your GitHub username):

```yaml
name: GRI

on:
  schedule:
    - cron: '0 0 * * *'   # refresh daily
  workflow_dispatch:       # allow manual trigger
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  gri:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Generate GRI SVGs
        uses: MaiwulanjiangMaiming/GRI-contribution-graph@main
        with:
          github_user_name: YOUR_USERNAME

      - name: Push to output branch
        uses: crazy-max/ghaction-github-pages@v4
        with:
          target_branch: output
          build_dir: dist
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

The Action fetches your real contribution data via the GitHub GraphQL API (using the built-in `GITHUB_TOKEN`, no PAT needed) and renders animated SVGs — no npm install, zero dependencies.

### 2. Run it once

Push the workflow, then trigger it manually from the **Actions** tab (**Run workflow**). This creates the `output` branch with `gri-dark.svg` and `gri-light.svg`. After that it refreshes automatically every day.

### 3. Embed in your README

```html
<picture>
  <source media="(prefers-color-scheme: dark)"
          srcset="https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/output/gri-dark.svg" />
  <source media="(prefers-color-scheme: light)"
          srcset="https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/output/gri-light.svg" />
  <img alt="GitHub Resonance Imaging"
       src="https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/output/gri-dark.svg" />
</picture>
```

For a profile README, `YOUR_REPO` is your username (e.g. `torvalds/torvalds`).

> **Note** — GitHub READMEs render SVG animations but don't run JavaScript, so hover tooltips are only available on websites (see CDN Usage below). Everything else — the scan line, k-space filling, echo waveform and HUD counters — animates right inside the README. The GRI letter overlay is opt-in via `?watermark=1`.

#### Output parameters

| Param        | Default | Description                                                                                                   |
| ------------ | ------- | ------------------------------------------------------------------------------------------------------------- |
| `theme`      | `dark`  | Color theme (`dark` / `light`)                                                                                 |
| `speed`      | `normal`| Scan animation speed                                                                                           |
| `watermark`  | `off`   | Set `watermark=1` to stamp a giant "GRI" letter overlay onto the grid. Off by default — your real contribution data is never overwritten. |

### Interactive Demo

Visit the live demo: **[maiwulanjiangmaiming.github.io/pages/gri-demo.html](https://maiwulanjiangmaiming.github.io/pages/gri-demo.html)**

Or run locally:

```bash
npm install
npm run dev
```

### Parameters

The scanner displays realistic MRI parameters:

| Parameter | Value | Description |
|-----------|-------|-------------|
| Seq | GitEcho | Pulse sequence name |
| TR | 7 d | Repetition Time (per week) |
| TE | 24 h | Echo Time (per day) |
| FA | 42° | Flip Angle |
| Matrix | 52×7 | 52 weeks × 7 days |
| FOV | 365 d | Field of View (one year) |
| NEX | 1 | Number of Excitations |
| PE line | 0-52 | Phase Encode line (current week) |
| Σ signal | 0-N au | Accumulated contribution count |

## Implementation

The visualization is built with pure HTML5 Canvas and vanilla JavaScript:

- **Main Canvas** — Contribution grid with scanning line animation
- **k-space Canvas** — Real-time k-space filling visualization
- **Echo Canvas** — MR signal echo waveform
- **HUD Panel** — Live acquisition parameters

All four demo pages (dark/light × preview/scanner) share a single renderer, `demo-core.js`. Each HTML file only declares its own DOM and theme palette, then calls:

```js
GRIDemo.init({
  colors: { accent: '#45e0d8', sig: [...], ... },
  data: { start: '2025-09-07', end: '2026-09-01', counts: [...] } // or 'fake' for demo data
});
```

Dates, color levels and k-space intensity are derived from `counts` at runtime — no hardcoded per-cell data.

### Project Structure

```
GRI-contribution-graph/
├── packages/
│   ├── action/          # GitHub Action entry point
│   └── core/            # Core library (gri-core.js)
├── .github/
│   └── workflows/       # CI/CD workflows
├── demo-core.js                                 # Shared demo renderer (all 4 demo pages)
├── preview-dark.html                            # Local preview, dark, real data
├── preview-light.html                           # Local preview, light, real data
├── github_resonance_imaging_scanner.html        # Embeddable scanner, dark, demo data
├── github_resonance_imaging_scanner_light.html  # Embeddable scanner, light, demo data
├── index.html           # Interactive demo page
├── package.json
├── action.yml           # GitHub Action metadata
└── README.md
```

### CDN Usage

You can also use the GRI core library via CDN in your own projects:

```html
<script src="https://cdn.jsdelivr.net/gh/MaiwulanjiangMaiming/GRI-contribution-graph@output/gri-core.js"></script>
<script>
  GRI.init({
    container: '#gri-container',
    username: 'your-github-username',
    theme: 'dark'
  });
</script>
```

## Development

```bash
# Install dependencies
npm install

# Run local dev server
npm run dev

# Format code
npm run format

# Lint code
npm run lint
```

## License

MIT © [MaiwulanjiangMaiming](https://github.com/MaiwulanjiangMaiming)
