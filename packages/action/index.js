const fs = require('node:fs');
const path = require('node:path');

const githubUserName = process.env.GITHUB_USER_NAME;
const githubToken = process.env.GITHUB_TOKEN;
const outputsRaw = (process.env.OUTPUTS || '')
  .split(/\r?\n/)
  .map(s => s.trim())
  .filter(Boolean);

if (!githubUserName) {
  console.error('GITHUB_USER_NAME is required');
  process.exit(1);
}

console.log(`Generating GRI visualization for: ${githubUserName}`);

const outputs = outputsRaw.map(line => {
  const [filename, query] = line.split('?');
  const params = new URLSearchParams(query || '');
  return {
    filename,
    theme: params.get('theme') || 'dark',
    speed: params.get('speed') || 'normal',
    watermark: params.get('watermark') === '1',
  };
});

// Opt-in GRI letter watermark (?watermark=1). Off by default so real
// contribution data is never overwritten.
const WATERMARK = outputs.some(o => o.watermark);

fs.mkdirSync('dist', { recursive: true });

async function fetchContributions(username, token) {
  const query = `
    query ($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            weeks {
              contributionDays {
                contributionCount
                contributionLevel
                weekday
                date
              }
            }
          }
        }
      }
    }
  `;

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'github-resonance-imaging',
    },
    body: JSON.stringify({ query, variables: { login: username } }),
  });

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }

  const { data, errors } = await res.json();
  if (errors?.[0]) throw new Error(errors[0].message);
  if (!data?.user) throw new Error(`User "${username}" not found`);

  const weeks = data.user.contributionsCollection.contributionCalendar.weeks;

  const grid = [];
  const kmag = [];
  const dates = [];
  const counts = [];

  for (let w = 0; w < weeks.length; w++) {
    grid[w] = [];
    kmag[w] = [];
    dates[w] = [];
    counts[w] = [];
    const days = weeks[w].contributionDays;
    const maxCount = Math.max(...days.map(d => d.contributionCount), 1);

    for (let d = 0; d < 7; d++) {
      const day = days.find(dd => dd.weekday === d);
      if (day) {
        const levelMap = {
          NONE: 0,
          FIRST_QUARTILE: 1,
          SECOND_QUARTILE: 2,
          THIRD_QUARTILE: 3,
          FOURTH_QUARTILE: 4,
        };
        grid[w][d] = levelMap[day.contributionLevel] ?? 0;
        kmag[w][d] = day.contributionCount / maxCount;
        dates[w][d] = day.date;
        counts[w][d] = day.contributionCount;
      } else {
        grid[w][d] = 0;
        kmag[w][d] = 0;
        dates[w][d] = '';
        counts[w][d] = 0;
      }
    }
  }

  while (grid.length < 52) {
    grid.push(new Array(7).fill(0));
    kmag.push(new Array(7).fill(0));
    dates.push(new Array(7).fill(''));
    counts.push(new Array(7).fill(0));
  }

  // Apply GRI letter overlay (opt-in via ?watermark=1)
  if (WATERMARK) {
    const GL = {
      G: ['01110', '10001', '10000', '10011', '10001', '10001', '01110'],
      R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
      I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111']
    };
    const letters = ['G', 'R', 'I'];
    let sx = 17;
    for (let li = 0; li < 3; li++) {
      const g = GL[letters[li]];
      for (let cy = 0; cy < 7; cy++) {
        const row = g[cy];
        for (let cx = 0; cx < 5; cx++) {
          if (row[cx] === '1') {
            const ww = sx + cx;
            if (ww < 52 && cy < 7) {
              grid[ww][cy] = 4;
              counts[ww][cy] = 15 + Math.floor(Math.random() * 5);
              kmag[ww][cy] = counts[ww][cy] / 20;
            }
          }
        }
      }
      sx += 6;
    }
  }

  return { grid, kmag, dates, counts };
}

function generateFakeData() {
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const rnd = mulberry32(20260531);
  const grid = [];
  const kmag = [];
  const dates = [];
  const counts = [];

  const today = new Date();
  for (let w = 0; w < 52; w++) {
    grid[w] = [];
    kmag[w] = [];
    dates[w] = [];
    counts[w] = [];
    for (let d = 0; d < 7; d++) {
      const r = rnd();
      // Sparse: 70% zero, 20% low (1-3), 10% medium (4-8)
      let c;
      if (r < 0.7) c = 0;
      else if (r < 0.9) c = Math.floor((r - 0.7) / 0.2 * 3) + 1;
      else c = Math.floor((r - 0.9) / 0.1 * 5) + 4;
      counts[w][d] = c;
      // grid level based on counts (0-4), matching GitHub's 5 levels
      grid[w][d] = c === 0 ? 0 : c <= 3 ? 1 : c <= 6 ? 2 : c <= 10 ? 3 : 4;
      // kmag based on counts (normalized)
      kmag[w][d] = c / 20;
      
      const dayDate = new Date(today);
      dayDate.setDate(today.getDate() - ((51 - w) * 7 + (6 - d)));
      dates[w][d] = dayDate.toISOString().split('T')[0];
    }
  }

  return { grid, kmag, dates, counts };
}

function calculateMonthPositions(dates) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthLabels = [];
  const seenMonths = new Set();
  
  for (let w = 0; w < dates.length; w++) {
    for (let d = 0; d < 7; d++) {
      if (!dates[w][d]) continue;
      const date = new Date(dates[w][d]);
      const month = date.getMonth();
      const day = date.getDate();
      
      // Only mark the first occurrence of each month (first day 1-7 of that month)
      if (day <= 7 && !seenMonths.has(month)) {
        seenMonths.add(month);
        monthLabels.push({ month, week: w, label: months[month] });
      }
    }
  }
  
  return monthLabels;
}

function generateSVGGRI(grid, kmag, dates, counts, theme = 'dark', username = 'user', speed = 'normal') {
  const WEEKS = 52;
  const DAYS = 7;
  // Exact demo-page geometry (gri-demo.html canvas layout)
  const CELL = 8, P = 10;              // 8px cells on a 10px pitch
  const W = 644, H = 414;              // 640px demo card + 2px margin
  const CX = 41, CY = 106;             // main canvas origin (panel border + padding)
  const LP = 24, TP = 16;              // grid origin inside the canvas
  const GW = WEEKS * P;                // 520

  // Colors copied verbatim from the demo's THEMES object
  const colors = {
    dark: {
      bg: '#080c11', cardBg: '#0b0f14', cardBorder: '#1e2b38',
      panelBg: '#0f1620', border: '#1e2b38',
      badgeBg: '#0f1f1c', badgeBorder: '#1a3d36',
      accent: '#45e0d8', dim: '#5d7686', text: '#cfeae4', textSecondary: '#9fc4bd',
      sig: ['#122a1e', '#1f5c3a', '#2f9c5b', '#46d07e', '#86f2b0'],
      unacq: '#0d141b', green: '#86f2b0',
      btnBg: '#0f1620', btnBorder: '#2a3b49', echoAxis: '#27414f',
      accentRGB: '69,224,216',
    },
    light: {
      bg: '#ffffff', cardBg: '#ffffff', cardBorder: '#e8ecf1',
      panelBg: '#f8fafc', border: '#e2e8f0',
      badgeBg: '#f0fdfa', badgeBorder: '#ccfbf1',
      accent: '#0891b2', dim: '#94a3b8', text: '#1e293b', textSecondary: '#64748b',
      sig: ['#e2e8f0', '#99f6e4', '#5eead4', '#2dd4bf', '#14b8a6'],
      unacq: '#f1f5f9', green: '#059669',
      btnBg: '#ffffff', btnBorder: '#d1d5db', echoAxis: '#cbd5e1',
      accentRGB: '8,145,178',
    },
  };

  const C = colors[theme] || colors.dark;
  const FONT = 'ui-monospace,SFMono-Regular,Menlo,monospace';
  const DUR = { slow: '10s', normal: '6s', fast: '3s' }[speed] || '6s';
  const DUR_S = { slow: 10, normal: 6, fast: 3 }[speed] || 6;   // scan seconds
  const REC_S = 0.9, DONE_S = 2.4;                              // recon + hold
  const CYC_S = DUR_S + REC_S + DONE_S;                         // full cycle
  const fSCAN = DUR_S / CYC_S;                                  // scan end fraction
  const fRECE = (DUR_S + REC_S) / CYC_S;                        // scan + recon end

  // k-space colormap — the demo uses the same formula for both themes
  const kColor = v => `rgb(${Math.round(v * 110)},${Math.round(30 + v * 215)},${Math.round(170 + v * 70)})`;

  // Cumulative signal per week (for the HUD counter)
  const cum = [];
  let run = 0;
  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < DAYS; d++) run += counts[w]?.[d] ?? 0;
    cum.push(run);
  }

  // --- Header (title + cycling status pill, pixel-matched to the demo) ---
  const header = `
    <g transform="translate(26,22) scale(0.8333)" stroke="${C.accent}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
      <path d="M2 12h20"/>
    </g>
    <text x="56" y="37" font-size="14" font-weight="500" letter-spacing="0.3" font-family="${FONT}" fill="${C.text}">GitHub Resonance Imaging <tspan fill="${C.accent}" font-weight="600">(GRI)</tspan></text>
    <rect x="492" y="22" width="124" height="22" rx="11" fill="${C.badgeBg}" stroke="${C.badgeBorder}"/>
    <circle cx="505" cy="33" r="3" fill="${C.accent}">
      <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite"/>
    </circle>
    <text x="514" y="37" font-size="11" font-weight="500" font-family="${FONT}" fill="${C.accent}">ACQUIRING
      <animate attributeName="opacity" values="1;0;0" calcMode="discrete" keyTimes="0;${fSCAN.toFixed(4)};1" dur="${CYC_S}s" repeatCount="indefinite"/>
    </text>
    <text x="514" y="37" font-size="11" font-weight="500" font-family="${FONT}" fill="${C.accent}">RECON &#183; iFFT
      <animate attributeName="opacity" values="0;1;0" calcMode="discrete" keyTimes="0;${fSCAN.toFixed(4)};${fRECE.toFixed(4)}" dur="${CYC_S}s" repeatCount="indefinite"/>
    </text>
    <text x="514" y="37" font-size="11" font-weight="500" font-family="${FONT}" fill="${C.green}">SCAN COMPLETE
      <animate attributeName="opacity" values="0;1" calcMode="discrete" keyTimes="0;${fRECE.toFixed(4)}" dur="${CYC_S}s" repeatCount="indefinite"/>
    </text>`;

  // --- Parameter chips (one bordered chip per parameter, like the demo) ---
  const params = [
    ['Seq', 'GitEcho'], ['TR', '7 d'], ['TE', '24 h'], ['FA', '42&#176;'],
    ['Matrix', '52&#215;7'], ['FOV', '365 d'], ['NEX', '1'], ['Slice', 'main'],
  ];
  let chipX = 26;
  let paramsSVG = '';
  for (const [k, v] of params) {
    const cw = Math.round((`${k} ${v}`).length * 6.1) + 16;
    paramsSVG += `    <rect x="${chipX}" y="58" width="${cw}" height="19" rx="6" fill="${C.panelBg}" stroke="${C.border}"/>
    <text x="${chipX + 8}" y="71.5" font-size="10" font-family="${FONT}" fill="${C.textSecondary}">${k} <tspan fill="${C.accent}" font-weight="600">${v}</tspan></text>
`;
    chipX += cw + 4;
  }

  // --- Main grid cells: unacquired base always visible, acquired color
  //     fades in (discrete, per-cycle) when the scan line passes the column ---
  let cells = '';
  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < DAYS; d++) {
      const x = CX + LP + w * P;
      const y = CY + TP + d * P;
      const level = grid[w]?.[d] ?? 0;
      const tw = ((w + 1) / WEEKS * fSCAN).toFixed(4);
      const date = dates[w]?.[d] || '';
      const count = counts[w]?.[d] ?? 0;
      cells += `    <rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${C.unacq}"/>
    <rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${C.sig[level] || C.unacq}" opacity="0">
      <title>${count} echo on ${date}</title>
      <animate attributeName="opacity" values="0;1" calcMode="discrete" keyTimes="0;${tw}" dur="${CYC_S}s" repeatCount="indefinite"/>
    </rect>
`;
    }
  }

  let monthLabelsSVG = '';
  for (const m of calculateMonthPositions(dates)) {
    monthLabelsSVG += `    <text x="${CX + LP + m.week * P}" y="${CY + 11}" fill="${C.dim}" font-size="10" font-family="${FONT}">${m.label}</text>\n`;
  }

  const dayLab = { 1: 'Mon', 3: 'Wed', 5: 'Fri' };
  let dayLabels = '';
  for (const k in dayLab) {
    dayLabels += `    <text x="${CX}" y="${CY + TP + (+k) * P + CELL / 2 + 3.5}" fill="${C.dim}" font-size="10" font-family="${FONT}">${dayLab[k]}</text>\n`;
  }

  // --- Scan line (visible during ACQ only) + RECON sweep with teal overlay ---
  const lineY1 = CY + TP - 3, lineY2 = CY + TP + DAYS * P - 2;
  const scanAndRecon = `
    <g>
      <animate attributeName="opacity" values="1;0" calcMode="discrete" keyTimes="0;${fSCAN.toFixed(4)}" dur="${CYC_S}s" repeatCount="indefinite"/>
      <line x1="${CX + LP}" y1="${lineY1}" x2="${CX + LP}" y2="${lineY2}" stroke="${C.accent}" stroke-width="4" opacity="0.25">
        <animate attributeName="x1" values="${CX + LP};${CX + LP + GW};${CX + LP + GW}" keyTimes="0;${fSCAN.toFixed(4)};1" dur="${CYC_S}s" repeatCount="indefinite"/>
        <animate attributeName="x2" values="${CX + LP};${CX + LP + GW};${CX + LP + GW}" keyTimes="0;${fSCAN.toFixed(4)};1" dur="${CYC_S}s" repeatCount="indefinite"/>
      </line>
      <line x1="${CX + LP}" y1="${lineY1}" x2="${CX + LP}" y2="${lineY2}" stroke="${C.accent}" stroke-width="1.5">
        <animate attributeName="x1" values="${CX + LP};${CX + LP + GW};${CX + LP + GW}" keyTimes="0;${fSCAN.toFixed(4)};1" dur="${CYC_S}s" repeatCount="indefinite"/>
        <animate attributeName="x2" values="${CX + LP};${CX + LP + GW};${CX + LP + GW}" keyTimes="0;${fSCAN.toFixed(4)};1" dur="${CYC_S}s" repeatCount="indefinite"/>
      </line>
    </g>
    <g>
      <animate attributeName="opacity" values="0;1;0" calcMode="discrete" keyTimes="0;${fSCAN.toFixed(4)};${fRECE.toFixed(4)}" dur="${CYC_S}s" repeatCount="indefinite"/>
      <rect x="${CX + LP}" y="${CY + TP - 2}" width="0" height="${DAYS * P}" fill="rgba(${C.accentRGB},0.08)">
        <animate attributeName="width" values="0;${GW};${GW}" keyTimes="0;${fSCAN.toFixed(4)};1" dur="${CYC_S}s" repeatCount="indefinite"/>
      </rect>
      <line x1="${CX + LP}" y1="${lineY1}" x2="${CX + LP}" y2="${lineY2}" stroke="rgba(${C.accentRGB},0.6)" stroke-width="2">
        <animate attributeName="x1" values="${CX + LP};${CX + LP + GW};${CX + LP + GW}" keyTimes="0;${fSCAN.toFixed(4)};1" dur="${CYC_S}s" repeatCount="indefinite"/>
        <animate attributeName="x2" values="${CX + LP};${CX + LP + GW};${CX + LP + GW}" keyTimes="0;${fSCAN.toFixed(4)};1" dur="${CYC_S}s" repeatCount="indefinite"/>
      </line>
    </g>`;

  // --- k-space panel (fills column by column, synced with the scan) ---
  const kCanvas = { x: 26, y: 241, w: 170, h: 98 };
  const kgx = kCanvas.x + 9, kgy = kCanvas.y + 21;   // canvas border 1px + inner offset 8/20
  const kcw = 152 / WEEKS, kch = 64 / DAYS;
  let kCells = '';
  for (let w = 0; w < WEEKS; w++) {
    let col = '';
    for (let d = 0; d < DAYS; d++) {
      col += `<rect x="${(kgx + w * kcw).toFixed(2)}" y="${(kgy + d * kch).toFixed(2)}" width="${Math.max(kcw - 0.3, 0.8).toFixed(2)}" height="${(kch - 0.5).toFixed(2)}" fill="${kColor(kmag[w]?.[d] ?? 0)}"/>`;
    }
    const tw = ((w + 1) / WEEKS * fSCAN).toFixed(4);
    kCells += `    <g opacity="0">
      <animate attributeName="opacity" values="0;1" calcMode="discrete" keyTimes="0;${tw}" dur="${CYC_S}s" repeatCount="indefinite"/>
      ${col}
    </g>\n`;
  }

  // --- Echo panel: Gaussian-enveloped cosine whose amplitude tracks the
  //     week currently under the scan line (animateTransform on y-scale) ---
  const eCanvas = { x: 208, y: 241, w: 198, h: 98 };
  const ecx = eCanvas.x + 99, eBaseY = eCanvas.y + 59;
  const ey0 = eCanvas.y + 23, ey1 = eCanvas.y + 83;
  const SIG = 14, FREQ = 0.55, AMP_MAX = (eBaseY - ey0) * 0.92;
  let echoPath = '';
  for (let x = ecx - 90; x <= ecx + 90; x += 2) {
    const t = x - ecx;
    const y = -AMP_MAX * Math.exp(-(t * t) / (2 * SIG * SIG)) * Math.cos(t * FREQ);
    echoPath += (echoPath ? ' L' : 'M') + x + ' ' + y.toFixed(1);
  }
  const echoVals = [], echoTimes = [];
  for (let w = 0; w < WEEKS; w++) {
    let sum = 0;
    for (let d = 0; d < DAYS; d++) sum += kmag[w]?.[d] ?? 0;
    echoVals.push((0.14 + 0.86 * Math.min(1, sum / 2.2)).toFixed(4));
    echoTimes.push((w / WEEKS * fSCAN).toFixed(4));
  }
  // "1 sy" pairs — scale Y only (a bare value would squash X too)
  const echoAnim = `<animateTransform attributeName="transform" type="scale" calcMode="discrete" values="${echoVals.map(v => `1 ${v}`).join(';')};1 ${echoVals[WEEKS - 1]}" keyTimes="${echoTimes.join(';')};1" dur="${CYC_S}s" repeatCount="indefinite"/>`;

  // --- HUD counters (PE line / TR elapsed / Σ signal) ---
  // One group per week slot (white values), then a RECON group (white) and a
  // DONE group (Σ turns green) — exactly how the demo's setHUD() behaves.
  const HUD = { x: 418, y: 226, w: 198, h: 122 };
  const hudVal = (y, txt, fill) => `<text x="${HUD.x + HUD.w - 12}" y="${y}" font-size="12" font-weight="600" font-family="${FONT}" fill="${fill}" text-anchor="end">${txt}</text>`;
  let hudValues = '';
  for (let w = 1; w <= WEEKS; w++) {
    const t0 = ((w - 1) / WEEKS * fSCAN).toFixed(4);
    const t1 = (w / WEEKS * fSCAN).toFixed(4);
    hudValues += `    <g opacity="0">
      <animate attributeName="opacity" values="0;1;0" calcMode="discrete" keyTimes="0;${t0};${t1}" dur="${CYC_S}s" repeatCount="indefinite"/>
      ${hudVal(253, `${w} / ${WEEKS}`, C.text)}
      ${hudVal(290, `${w} wk`, C.text)}
      ${hudVal(326, `${cum[w - 1]} au`, C.text)}
    </g>\n`;
  }
  hudValues += `    <g opacity="0">
      <animate attributeName="opacity" values="0;1;0" calcMode="discrete" keyTimes="0;${fSCAN.toFixed(4)};${fRECE.toFixed(4)}" dur="${CYC_S}s" repeatCount="indefinite"/>
      ${hudVal(253, `${WEEKS} / ${WEEKS}`, C.text)}
      ${hudVal(290, `${WEEKS} wk`, C.text)}
      ${hudVal(326, `${cum[WEEKS - 1]} au`, C.text)}
    </g>
    <g opacity="0">
      <animate attributeName="opacity" values="0;1" calcMode="discrete" keyTimes="0;${fRECE.toFixed(4)}" dur="${CYC_S}s" repeatCount="indefinite"/>
      ${hudVal(253, `${WEEKS} / ${WEEKS}`, C.text)}
      ${hudVal(290, `${WEEKS} wk`, C.text)}
      ${hudVal(326, `${cum[WEEKS - 1]} au`, C.green)}
    </g>\n`;

  // --- Panels, labels and buttons (exact demo positions) ---
  const panelsSVG = `
    <rect x="26" y="93" width="590" height="119" rx="12" fill="${C.bg}" stroke="${C.border}"/>
    <rect x="${kCanvas.x}" y="${kCanvas.y}" width="${kCanvas.w}" height="${kCanvas.h}" rx="8" fill="${C.bg}" stroke="${C.border}"/>
    <text x="28" y="236" font-size="10" font-family="${FONT}" fill="${C.dim}">k-space</text>
    <text x="${kCanvas.x + 9}" y="${kCanvas.y + 92}" font-size="9" font-family="${FONT}" fill="${C.dim}">PE &#8594; (weeks)</text>
    <rect x="${eCanvas.x}" y="${eCanvas.y}" width="${eCanvas.w}" height="${eCanvas.h}" rx="8" fill="${C.bg}" stroke="${C.border}"/>
    <text x="210" y="236" font-size="10" font-family="${FONT}" fill="${C.dim}">MR signal (echo)</text>
    <line x1="${ecx}" y1="${ey0}" x2="${ecx}" y2="${ey1}" stroke="${C.echoAxis}" stroke-width="1" stroke-dasharray="3 3"/>
    <text x="${ecx + 3}" y="${ey1}" font-size="9" font-family="${FONT}" fill="${C.dim}">TE</text>
    <g transform="translate(0,${eBaseY})"><g>${echoAnim}
      <path d="${echoPath}" fill="none" stroke="${C.accent}" stroke-width="1.4"/>
    </g></g>
    <rect x="${HUD.x}" y="${HUD.y}" width="${HUD.w}" height="${HUD.h}" rx="10" fill="${C.panelBg}" stroke="${C.border}"/>
    <text x="${HUD.x + 14}" y="253" font-size="12" font-family="${FONT}" fill="${C.dim}">PE line</text>
    <line x1="${HUD.x + 14}" y1="268" x2="${HUD.x + HUD.w - 12}" y2="268" stroke="${C.border}" stroke-width="1"/>
    <text x="${HUD.x + 14}" y="290" font-size="12" font-family="${FONT}" fill="${C.dim}">TR elapsed</text>
    <line x1="${HUD.x + 14}" y1="304" x2="${HUD.x + HUD.w - 12}" y2="304" stroke="${C.border}" stroke-width="1"/>
    <text x="${HUD.x + 14}" y="326" font-size="12" font-family="${FONT}" fill="${C.dim}">&#931; signal</text>
    <rect x="26" y="362" width="40" height="30" rx="10" fill="${C.btnBg}" stroke="${C.btnBorder}"/>
    <rect x="42.5" y="372.3" width="2.4" height="9.4" rx="0.5" fill="${C.text}"/>
    <rect x="47.3" y="372.3" width="2.4" height="9.4" rx="0.5" fill="${C.text}"/>
    <rect x="74" y="362" width="76" height="30" rx="10" fill="${C.btnBg}" stroke="${C.btnBorder}"/>
    <text x="112" y="381" font-size="12" font-weight="500" font-family="${FONT}" fill="${C.text}" text-anchor="middle">Re-scan</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="100%" height="100%" fill="${C.cardBg}"/>
  <rect x="2" y="2" width="640" height="410" rx="16" fill="${C.cardBg}" stroke="${C.cardBorder}"/>
${header}
${paramsSVG}
${panelsSVG}
${monthLabelsSVG}${dayLabels}
${cells}
${scanAndRecon}
${kCells}
${hudValues}
</svg>`;
}

async function generateHTML(theme, grid, kmag, dates, counts) {
  const colors = {
    dark: {
      accent: '#45e0d8',
      dim: '#5d7686',
      sig: ['#122a1e', '#1f5c3a', '#2f9c5b', '#46d07e', '#86f2b0'],
      unacq: '#0d141b',
      bg: '#0b0f14',
      panelBg: '#0f1620',
      border: '#1e2b38',
      text: '#cfeae4',
      textSecondary: '#9fc4bd',
      tooltipBg: '#161b22',
      tooltipBorder: '#30363d',
    },
    light: {
      accent: '#0891b2',
      dim: '#94a3b8',
      sig: ['#e2e8f0', '#99f6e4', '#5eead4', '#2dd4bf', '#14b8a6'],
      unacq: '#f1f5f9',
      bg: '#ffffff',
      panelBg: '#f8fafc',
      border: '#e2e8f0',
      text: '#1e293b',
      textSecondary: '#64748b',
      tooltipBg: '#f6f8fa',
      tooltipBorder: '#d0d7de',
    },
  };

  const C = colors[theme];
  const gridJSON = JSON.stringify(grid);
  const kmagJSON = JSON.stringify(kmag);
  const datesJSON = JSON.stringify(dates);
  const countsJSON = JSON.stringify(counts);

  const monthLabels = calculateMonthPositions(dates);
  const monthLabelsJSON = JSON.stringify(monthLabels);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GitHub Resonance Imaging - ${githubUserName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      background: ${C.bg};
      color: ${C.text};
      padding: 1rem 0;
    }
    .container {
      max-width: 640px;
      margin: 0 auto;
      background: ${C.bg};
      border: 1px solid ${C.border};
      border-radius: 16px;
      padding: 20px 24px;
      overflow-x: auto;
    }
    .tooltip {
      position: absolute;
      background: ${C.tooltipBg};
      border: 1px solid ${C.tooltipBorder};
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 11px;
      color: ${C.text};
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s ease;
      z-index: 1000;
      white-space: nowrap;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .tooltip.visible { opacity: 1; }
  </style>
</head>
<body>
  <div class="tooltip" id="tooltip"></div>
  <div class="container">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${C.accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
          <path d="M2 12h20"/>
        </svg>
        <span style="font-size:14px;color:${C.text};letter-spacing:0.3px;font-weight:500;">
          GitHub Resonance Imaging <span style="color:${C.accent};font-weight:600;">(GRI)</span>
        </span>
      </div>
      <span style="display:flex;align-items:center;gap:6px;font-size:11px;background:${C.panelBg};border:1px solid ${C.border};border-radius:20px;padding:3px 10px;">
        <span style="width:6px;height:6px;border-radius:50%;background:${C.accent};animation:pulse 2s ease-in-out infinite;"></span>
        <span id="gri-status" style="color:${C.accent};font-weight:500;">ACQUIRING</span>
      </span>
    </div>
    <style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}</style>

    <div style="display:flex;flex-wrap:nowrap;gap:4px;margin-bottom:16px;font-size:10px;overflow-x:auto;">
      <span style="background:${C.panelBg};border:1px solid ${C.border};border-radius:6px;padding:3px 8px;color:${C.textSecondary};white-space:nowrap;">Seq <span style="color:${C.accent};font-weight:600;">GitEcho</span></span>
      <span style="background:${C.panelBg};border:1px solid ${C.border};border-radius:6px;padding:3px 8px;color:${C.textSecondary};white-space:nowrap;">TR <span style="color:${C.accent};font-weight:600;">7 d</span></span>
      <span style="background:${C.panelBg};border:1px solid ${C.border};border-radius:6px;padding:3px 8px;color:${C.textSecondary};white-space:nowrap;">TE <span style="color:${C.accent};font-weight:600;">24 h</span></span>
      <span style="background:${C.panelBg};border:1px solid ${C.border};border-radius:6px;padding:3px 8px;color:${C.textSecondary};white-space:nowrap;">FA <span style="color:${C.accent};font-weight:600;">42&#176;</span></span>
      <span style="background:${C.panelBg};border:1px solid ${C.border};border-radius:6px;padding:3px 8px;color:${C.textSecondary};white-space:nowrap;">Matrix <span style="color:${C.accent};font-weight:600;">52&#215;7</span></span>
      <span style="background:${C.panelBg};border:1px solid ${C.border};border-radius:6px;padding:3px 8px;color:${C.textSecondary};white-space:nowrap;">FOV <span style="color:${C.accent};font-weight:600;">365 d</span></span>
      <span style="background:${C.panelBg};border:1px solid ${C.border};border-radius:6px;padding:3px 8px;color:${C.textSecondary};white-space:nowrap;">User <span style="color:${C.accent};font-weight:600;">${githubUserName}</span></span>
    </div>

    <div style="background:#080c11;border:1px solid ${C.border};border-radius:12px;padding:12px 14px;position:relative;">
      <canvas id="gri-main" style="display:block;"></canvas>
    </div>

    <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:14px;align-items:flex-start;">
      <div style="flex:0 0 auto;">
        <div style="font-size:10px;color:${C.dim};margin-bottom:4px;padding-left:2px;">k-space</div>
        <canvas id="gri-k" style="border:1px solid ${C.border};border-radius:8px;background:#080c11;display:block;"></canvas>
      </div>
      <div style="flex:0 0 auto;">
        <div style="font-size:10px;color:${C.dim};margin-bottom:4px;padding-left:2px;">MR signal (echo)</div>
        <canvas id="gri-echo" style="border:1px solid ${C.border};border-radius:8px;background:#080c11;display:block;"></canvas>
      </div>
      <div style="flex:1;min-width:140px;background:${C.panelBg};border:1px solid ${C.border};border-radius:10px;padding:12px 14px;font-size:12px;color:${C.dim};line-height:2;">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ${C.border};padding-bottom:6px;margin-bottom:6px;">
          <span>PE line</span>
          <span id="gri-pe" style="color:${C.text};font-weight:600;font-family:ui-monospace,monospace;">0 / 52</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ${C.border};padding-bottom:6px;margin-bottom:6px;">
          <span>TR elapsed</span>
          <span id="gri-tr" style="color:${C.text};font-weight:600;font-family:ui-monospace,monospace;">0 wk</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span>&#931; signal</span>
          <span id="gri-total" style="color:#86f2b0;font-weight:600;font-family:ui-monospace,monospace;">&#8212; au</span>
        </div>
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-top:14px;">
      <button id="gri-play" style="background:${C.panelBg};border:1px solid ${C.border};color:${C.text};border-radius:10px;padding:7px 12px;font:inherit;font-size:12px;cursor:pointer;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
      </button>
      <button id="gri-rescan" style="background:${C.panelBg};border:1px solid ${C.border};color:${C.text};border-radius:10px;padding:7px 14px;font:inherit;font-size:12px;cursor:pointer;font-weight:500;">Re-scan</button>
    </div>
  </div>

  <script>
  (function(){
    var GRID = ${gridJSON};
    var KMAG = ${kmagJSON};
    var DATES = ${datesJSON};
    var COUNTS = ${countsJSON};
    var MONTH_LABELS = ${monthLabelsJSON};
    var C = {accent:'${C.accent}',dim:'${C.dim}',sig:${JSON.stringify(C.sig)},unacq:'${C.unacq}'};
    var WEEKS=52,DAYS=7;
    var total=0;
    for(var a=0;a<WEEKS;a++)for(var b=0;b<DAYS;b++)total+=COUNTS[a][b];

    function dpr(cv,w,h){var rr=window.devicePixelRatio||1;cv.width=w*rr;cv.height=h*rr;cv.style.width=w+'px';cv.style.height=h+'px';var x=cv.getContext('2d');x.setTransform(rr,0,0,rr,0,0);return x;}
    var MW=596,MH=93,LP=24,TP=16,P=11,CELL=9;
    var mx=dpr(document.getElementById('gri-main'),MW,MH);
    var KW=168,KH=96,kx=dpr(document.getElementById('gri-k'),KW,KH);
    var EW=196,EH=96,ex=dpr(document.getElementById('gri-echo'),EW,EH);
    var dayLab={1:'Mon',3:'Wed',5:'Fri'};
    
    var tooltip = document.getElementById('tooltip');
    var canvasEl = document.getElementById('gri-main');
    
    function showTooltip(e, w, d) {
      var count = COUNTS[w][d];
      var date = DATES[w][d];
      if (!date) return;
      tooltip.innerHTML = '<strong>' + count + '</strong> contributions on <strong>' + date + '</strong>';
      tooltip.classList.add('visible');
      updateTooltipPos(e);
    }
    
    function hideTooltip() {
      tooltip.classList.remove('visible');
    }
    
    function updateTooltipPos(e) {
      var rect = canvasEl.getBoundingClientRect();
      var x = e.clientX - rect.left + 10;
      var y = e.clientY - rect.top - 30;
      tooltip.style.left = (rect.left + x) + 'px';
      tooltip.style.top = (rect.top + y) + 'px';
    }
    
    canvasEl.addEventListener('mousemove', function(e) {
      var rect = canvasEl.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var y = e.clientY - rect.top;
      var w = Math.floor((x - LP) / P);
      var d = Math.floor((y - TP) / P);
      if (w >= 0 && w < WEEKS && d >= 0 && d < DAYS && DATES[w][d]) {
        showTooltip(e, w, d);
        canvasEl.style.cursor = 'pointer';
      } else {
        hideTooltip();
        canvasEl.style.cursor = 'default';
      }
    });
    
    canvasEl.addEventListener('mouseleave', hideTooltip);

    function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}

    function drawMain(frac){
      mx.clearRect(0,0,MW,MH);var acq=frac*WEEKS;
      mx.font='10px ui-monospace,monospace';mx.textBaseline='alphabetic';mx.fillStyle=C.dim;
      
      for(var i=0;i<MONTH_LABELS.length;i++){
        var m = MONTH_LABELS[i];
        mx.fillText(m.label, LP + m.week * P, 11);
      }
      
      mx.textBaseline='middle';
      for(var k in dayLab)mx.fillText(dayLab[k],0,TP+(+k)*P+CELL/2);
      for(var w=0;w<WEEKS;w++)for(var d=0;d<DAYS;d++){var X=LP+w*P,Y=TP+d*P;mx.fillStyle=(acq>=w+1)?C.sig[GRID[w][d]]:C.unacq;rr(mx,X,Y,CELL,CELL,2);mx.fill();}
      if(frac>0&&frac<1){var sxp=LP+acq*P;mx.save();mx.strokeStyle=C.accent;mx.lineWidth=1.5;mx.shadowColor='rgba(69,224,216,0.35)';mx.shadowBlur=6;mx.beginPath();mx.moveTo(sxp,TP-3);mx.lineTo(sxp,TP+DAYS*P-2);mx.stroke();mx.restore();}
    }

    function drawK(frac){
      kx.clearRect(0,0,KW,KH);
      var acq=frac*WEEKS,gx=8,gy=20,gw=KW-16,gh=KH-32,cw=gw/WEEKS,ch=gh/DAYS;
      for(var w=0;w<WEEKS;w++){var filled=acq>=w+1;for(var d=0;d<DAYS;d++){var v=filled?KMAG[w][d]:0;if(filled){var gg=Math.round(30+v*215);kx.fillStyle='rgb('+Math.round(v*110)+','+gg+','+Math.round(170+v*70)+')';}else kx.fillStyle=C.unacq;kx.fillRect(gx+w*cw,gy+d*ch,Math.max(cw-0.3,0.8),ch-0.5);}}
      kx.fillStyle=C.dim;kx.font='9px ui-monospace,monospace';kx.fillText('PE \u2192 (weeks)',8,KH-5);
    }

    function drawEcho(frac){
      ex.clearRect(0,0,EW,EH);
      var acq=frac*WEEKS,w=Math.min(WEEKS-1,Math.floor(acq)),A=0;for(var d=0;d<DAYS;d++)A+=KMAG[w][d];A=Math.min(1,A/2.2);
      var x0=8,x1=EW-8,y0=22,y1=EH-14,cx=(x0+x1)/2,baseY=(y0+y1)/2+6;
      ex.strokeStyle='${theme === 'dark' ? '#27414f' : '#cbd5e1'}';ex.setLineDash([3,3]);ex.lineWidth=1;ex.beginPath();ex.moveTo(cx,y0);ex.lineTo(cx,y1);ex.stroke();ex.setLineDash([]);
      ex.fillStyle=C.dim;ex.font='9px ui-monospace,monospace';ex.fillText('TE',cx+3,y1);
      var sig=14,freq=0.55,amp=(baseY-y0)*0.92*(0.14+0.86*A);
      ex.strokeStyle=C.accent;ex.lineWidth=1.4;ex.beginPath();
      for(var x=x0;x<=x1;x++){var t=x-cx,env=Math.exp(-(t*t)/(2*sig*sig)),y=baseY-amp*env*Math.cos(t*freq);if(x===x0)ex.moveTo(x,y);else ex.lineTo(x,y);}
      ex.stroke();
    }

    var statusEl=document.getElementById('gri-status'),peEl=document.getElementById('gri-pe'),trEl=document.getElementById('gri-tr'),totalEl=document.getElementById('gri-total');
    function calcSignal(pe){
      var sig=0;
      for(var w=0;w<pe&&w<WEEKS;w++)for(var d=0;d<DAYS;d++)sig+=COUNTS[w][d];
      return sig;
    }
    function setHUD(mode,pe){
      statusEl.textContent=mode==='ACQ'?'ACQUIRING':(mode==='REC'?'RECON \u00B7 iFFT':'SCAN COMPLETE');
      statusEl.style.color=mode==='DONE'?'#86f2b0':(mode==='REC'?'${C.accent}':'${C.accent}');
      peEl.textContent=pe+' / '+WEEKS;
      trEl.textContent=pe+' wk';
      var sig=calcSignal(pe);
      totalEl.textContent=sig+' au';
    }

    var SCAN=6000,RECON=900,DONE=2400,CYC=SCAN+RECON+DONE,acc=0,last=null,running=true;
    function tick(ts){
      if(last==null)last=ts;if(running)acc+=ts-last;last=ts;var e=acc%CYC,frac,mode;
      if(e<SCAN){frac=e/SCAN;mode='ACQ';}else if(e<SCAN+RECON){frac=1;mode='REC';}else{frac=1;mode='DONE';}
      drawMain(frac);
      if(mode==='REC'){var p=(e-SCAN)/RECON,xp=LP+p*WEEKS*P;mx.save();mx.fillStyle='rgba(69,224,216,0.08)';mx.fillRect(LP,TP-2,Math.max(0,xp-LP),DAYS*P);mx.strokeStyle='rgba(69,224,216,0.6)';mx.lineWidth=2;mx.shadowColor='rgba(69,224,216,0.2)';mx.shadowBlur=8;mx.beginPath();mx.moveTo(xp,TP-3);mx.lineTo(xp,TP+DAYS*P-2);mx.stroke();mx.restore();}
      drawK(frac);drawEcho(frac);
      var pe=mode==='ACQ'?Math.min(WEEKS,Math.ceil(frac*WEEKS)):WEEKS;setHUD(mode,pe);
      requestAnimationFrame(tick);
    }

    var playBtn=document.getElementById('gri-play');
    function updPlay(){var isPause=running;var svg=isPause?'<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>':'<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>';playBtn.innerHTML=svg;}
    playBtn.onclick=function(){running=!running;updPlay();};
    document.getElementById('gri-rescan').onclick=function(){acc=0;running=true;updPlay();};
    requestAnimationFrame(tick);
  })();
  </script>
</body>
</html>`;
}

(async () => {
  try {
    let grid, kmag, dates, counts;

    if (githubToken) {
      console.log('Fetching real contribution data from GitHub API...');
      const data = await fetchContributions(githubUserName, githubToken);
      grid = data.grid;
      kmag = data.kmag;
      dates = data.dates;
      counts = data.counts;
      console.log(`Loaded ${grid.length} weeks of contribution data`);
    } else {
      console.log('No GITHUB_TOKEN provided, using fake data');
      const fake = generateFakeData();
      grid = fake.grid;
      kmag = fake.kmag;
      dates = fake.dates;
      counts = fake.counts;
    }

    for (const out of outputs) {
      const ext = path.extname(out.filename).toLowerCase();
      
      if (ext === '.svg') {
        // Generate SVG
        const svg = generateSVGGRI(grid, kmag, dates, counts, out.theme, githubUserName, out.speed);
        fs.mkdirSync(path.dirname(out.filename), { recursive: true });
        fs.writeFileSync(out.filename, svg);
        console.log(`Generated SVG: ${out.filename}`);
      } else {
        // Generate HTML (default)
        const html = await generateHTML(out.theme, grid, kmag, dates, counts);
        fs.mkdirSync(path.dirname(out.filename), { recursive: true });
        fs.writeFileSync(out.filename, html);
        console.log(`Generated HTML: ${out.filename}`);
      }
    }

    console.log('GRI generation complete!');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
