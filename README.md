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

## Usage

### GitHub Action

Add to your profile README workflow:

```yaml
- uses: MaiwulanjiangMaiming/GRI-contribution-graph@v1
  with:
    github_user_name: ${{ github.repository_owner }}
    outputs: |
      dist/gri-dark.svg?theme=dark
      dist/gri-light.svg?theme=light
```

Then embed in your README:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="gri-dark.svg" />
  <source media="(prefers-color-scheme: light)" srcset="gri-light.svg" />
  <img alt="GitHub Resonance Imaging" src="gri-dark.svg" />
</picture>
```

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

### Project Structure

```
github-resonance-imaging/
├── packages/
│   ├── action/          # GitHub Action entry point
│   └── core/            # Core library (gri-core.js)
├── .github/
│   └── workflows/       # CI/CD workflows
├── github_resonance_imaging_scanner.html        # Dark theme
├── github_resonance_imaging_scanner_light.html  # Light theme
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
