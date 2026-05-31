/**
 * SVG Animation Generator for GRI
 * Generates animated SVG contribution graphs (like snk's snake game)
 */

function generateSVGGRI(grid, theme = 'dark', username = 'user') {
  const WEEKS = 52;
  const DAYS = 7;
  const CELL = 11;
  const GAP = 2;
  const PAD = 20;
  const LP = 40;
  const TP = 30;

  const colors = {
    dark: {
      bg: '#0d1117',
      grid: '#161b22',
      accent: '#45e0d8',
      sig: ['#122a1e', '#1f5c3a', '#2f9c5b', '#46d07e', '#86f2b0'],
      unacq: '#0d141b',
      text: '#8b949e',
    },
    light: {
      bg: '#ffffff',
      grid: '#f6f8fa',
      accent: '#0891b2',
      sig: ['#e2e8f0', '#99f6e4', '#5eead4', '#2dd4bf', '#14b8a6'],
      unacq: '#f1f5f9',
      text: '#656d76',
    },
  };

  const C = colors[theme];
  const width = LP + WEEKS * (CELL + GAP) + PAD;
  const height = TP + DAYS * (CELL + GAP) + PAD + 40;

  // Build contribution cells
  let cells = '';
  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < DAYS; d++) {
      const x = LP + w * (CELL + GAP);
      const y = TP + d * (CELL + GAP);
      const level = grid[w]?.[d] ?? 0;
      const fill = C.sig[level] || C.unacq;
      cells += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${fill}" class="cell" data-w="${w}" data-d="${d}"/>\n`;
    }
  }

  // Month labels
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mPos = [0, 4, 9, 13, 17, 22, 26, 30, 35, 39, 44, 48];
  let monthLabels = '';
  for (let i = 0; i < 12; i++) {
    const x = LP + mPos[i] * (CELL + GAP);
    monthLabels += `<text x="${x}" y="${TP - 8}" fill="${C.text}" font-size="10" font-family="ui-monospace,monospace">${months[i]}</text>\n`;
  }

  // Day labels
  const dayLab = { 1: 'Mon', 3: 'Wed', 5: 'Fri' };
  let dayLabels = '';
  for (const k in dayLab) {
    const y = TP + (+k) * (CELL + GAP) + CELL / 2 + 3;
    dayLabels += `<text x="${LP - 8}" y="${y}" fill="${C.text}" font-size="9" font-family="ui-monospace,monospace" text-anchor="end">${dayLab[k]}</text>\n`;
  }

  // Scan line animation
  const scanLine = `
    <line x1="${LP}" y1="${TP - 5}" x2="${LP}" y2="${TP + DAYS * (CELL + GAP)}" 
          stroke="${C.accent}" stroke-width="2" opacity="0.8">
      <animate attributeName="x1" from="${LP}" to="${LP + WEEKS * (CELL + GAP)}" dur="6s" repeatCount="indefinite"/>
      <animate attributeName="x2" from="${LP}" to="${LP + WEEKS * (CELL + GAP)}" dur="6s" repeatCount="indefinite"/>
    </line>
  `;

  // Glow effect for scan line
  const scanGlow = `
    <line x1="${LP}" y1="${TP - 5}" x2="${LP}" y2="${TP + DAYS * (CELL + GAP)}" 
          stroke="${C.accent}" stroke-width="6" opacity="0.2">
      <animate attributeName="x1" from="${LP}" to="${LP + WEEKS * (CELL + GAP)}" dur="6s" repeatCount="indefinite"/>
      <animate attributeName="x2" from="${LP}" to="${LP + WEEKS * (CELL + GAP)}" dur="6s" repeatCount="indefinite"/>
    </line>
  `;

  // Title
  const title = `<text x="${width / 2}" y="${height - 10}" fill="${C.text}" font-size="11" font-family="ui-monospace,monospace" text-anchor="middle">${username}'s GitHub Resonance Imaging</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <style>
    .cell { transition: fill 0.3s ease; }
  </style>
  <rect width="100%" height="100%" fill="${C.bg}" rx="8"/>
  ${monthLabels}
  ${dayLabels}
  ${cells}
  ${scanGlow}
  ${scanLine}
  ${title}
</svg>`;
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateSVGGRI };
}
