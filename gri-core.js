/**
 * GRI Core - GitHub Resonance Imaging
 * UMD module for Canvas-based contribution graph rendering
 * @version 1.0.0
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GRI = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ============================================================================
  // Configuration
  // ============================================================================
  const CONFIG = {
    WEEKS: 52,
    DAYS: 7,
    CELL: 11,
    GAP: 2,
    PAD: 20,
    LP: 40,
    TP: 30,
    MW: 596,
    MH: 93,
    KW: 168,
    KH: 96,
    EW: 196,
    EH: 96,
    P: 11,
    HTML_CELL: 9,
    SCAN_DURATION: 6000,
    RECON_DURATION: 900,
    DONE_DURATION: 2400,
  };

  const THEMES = {
    dark: {
      accent: '#45e0d8',
      dim: '#5d7686',
      sig: ['#122a1e', '#1f5c3a', '#2f9c5b', '#46d07e', '#86f2b0'],
      gri: ['#1a3d38', '#2a7a6e', '#3db8a8', '#5ce8d8', '#a0f5ec'],
      unacq: '#0d141b',
      bg: '#0b0f14',
      panelBg: '#0f1620',
      border: '#1e2b38',
      text: '#cfeae4',
      textSecondary: '#9fc4bd',
      tooltipBg: '#161b22',
      tooltipBorder: '#30363d',
      canvasBg: '#080c11',
    },
    light: {
      accent: '#0891b2',
      dim: '#94a3b8',
      sig: ['#e2e8f0', '#99f6e4', '#5eead4', '#2dd4bf', '#14b8a6'],
      gri: ['#d1fae5', '#6ee7b7', '#34d399', '#10b981', '#059669'],
      unacq: '#f1f5f9',
      bg: '#ffffff',
      panelBg: '#f8fafc',
      border: '#e2e8f0',
      text: '#1e293b',
      textSecondary: '#64748b',
      tooltipBg: '#f6f8fa',
      tooltipBorder: '#d0d7de',
      canvasBg: '#f8fafc',
    },
  };

  // ============================================================================
  // GitHub API
  // ============================================================================
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

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'github-resonance-imaging',
    };
    if (token) {
      headers.Authorization = `bearer ${token}`;
    }

    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers,
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
            NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2,
            THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4,
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

    return { grid, kmag, dates, counts };
  }

  // ============================================================================
  // Date Utilities
  // ============================================================================
  function calculateMonthPositions(dates) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthLabels = [];
    const seenMonths = new Set();

    for (let w = 0; w < dates.length; w++) {
      for (let d = 0; d < 7; d++) {
        if (!dates[w][d]) continue;
        const date = new Date(dates[w][d]);
        const month = date.getMonth();
        const day = date.getDate();
        if (day <= 7 && !seenMonths.has(month)) {
          seenMonths.add(month);
          monthLabels.push({ month, week: w, label: months[month] });
        }
      }
    }
    return monthLabels;
  }

  // ============================================================================
  // Canvas Helpers
  // ============================================================================
  function setupCanvas(canvas, width, height) {
    const rr = window.devicePixelRatio || 1;
    canvas.width = width * rr;
    canvas.height = height * rr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(rr, 0, 0, rr, 0, 0);
    return ctx;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ============================================================================
  // SVG Generator
  // ============================================================================
  function generateSVG(grid, dates, counts, theme, username) {
    const { WEEKS, DAYS, CELL, GAP, PAD, LP, TP } = CONFIG;
    const C = THEMES[theme] || THEMES.dark;
  const width = LP + WEEKS * (CELL + GAP) + PAD;
  const height = TP + DAYS * (CELL + GAP) + PAD + 40;

  // GRI letter overlay
  const GL = {
    G: ['01110', '10001', '10000', '10011', '10001', '10001', '01110'],
    R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111']
  };
  const isGRI = Array(WEEKS).fill(null).map(() => Array(DAYS).fill(false));
  const letters = ['G', 'R', 'I'];
  let sx = 17;
  for (let li = 0; li < 3; li++) {
    const g = GL[letters[li]];
    for (let cy = 0; cy < 7; cy++) {
      const row = g[cy];
      for (let cx = 0; cx < 5; cx++) {
        if (row[cx] === '1') {
          const ww = sx + cx;
          if (ww < WEEKS && cy < DAYS) {
            isGRI[ww][cy] = true;
          }
        }
      }
    }
    sx += 6;
  }

  const monthLabels = calculateMonthPositions(dates);

  let cells = '';
  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < DAYS; d++) {
      const x = LP + w * (CELL + GAP);
      const y = TP + d * (CELL + GAP);
      const level = grid[w]?.[d] ?? 0;
      const isLetter = isGRI[w][d];
      const fill = isLetter ? C.gri[level] : (C.sig[level] || C.unacq);
      const date = dates[w]?.[d] || '';
      const count = counts[w]?.[d] ?? 0;
      const delay = w * 0.05;
      
      cells += `    <g class="cell-group">
      <rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${fill}">
        <animate attributeName="opacity" values="0;1" dur="0.3s" begin="${delay}s" fill="freeze"/>
      </rect>
      <title>${count} echo on ${date}</title>
    </g>\n`;
    }
  }

    let monthLabelsSVG = '';
    for (const m of monthLabels) {
      const x = LP + m.week * (CELL + GAP);
      monthLabelsSVG += `    <text x="${x}" y="${TP - 8}" fill="${C.dim}" font-size="10" font-family="ui-monospace,monospace">${m.label}</text>\n`;
    }

    const dayLab = { 1: 'Mon', 3: 'Wed', 5: 'Fri' };
    let dayLabels = '';
    for (const k in dayLab) {
      const y = TP + (+k) * (CELL + GAP) + CELL / 2 + 3;
      dayLabels += `    <text x="${LP - 8}" y="${y}" fill="${C.dim}" font-size="9" font-family="ui-monospace,monospace" text-anchor="end">${dayLab[k]}</text>\n`;
    }

    const scanLine = `
    <line x1="${LP}" y1="${TP - 5}" x2="${LP}" y2="${TP + DAYS * (CELL + GAP)}" 
          stroke="${C.accent}" stroke-width="2" opacity="0.8">
      <animate attributeName="x1" from="${LP}" to="${LP + WEEKS * (CELL + GAP)}" dur="6s" repeatCount="indefinite"/>
      <animate attributeName="x2" from="${LP}" to="${LP + WEEKS * (CELL + GAP)}" dur="6s" repeatCount="indefinite"/>
    </line>`;

    const scanGlow = `
    <line x1="${LP}" y1="${TP - 5}" x2="${LP}" y2="${TP + DAYS * (CELL + GAP)}" 
          stroke="${C.accent}" stroke-width="6" opacity="0.2">
      <animate attributeName="x1" from="${LP}" to="${LP + WEEKS * (CELL + GAP)}" dur="6s" repeatCount="indefinite"/>
      <animate attributeName="x2" from="${LP}" to="${LP + WEEKS * (CELL + GAP)}" dur="6s" repeatCount="indefinite"/>
    </line>`;

    const title = `    <text x="${width / 2}" y="${height - 10}" fill="${C.dim}" font-size="11" font-family="ui-monospace,monospace" text-anchor="middle">${username}'s GitHub Resonance Imaging</text>`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <style>
    .cell-group { cursor: pointer; }
    .cell-group:hover rect { stroke: ${C.accent}; stroke-width: 1.5; }
  </style>
  <rect width="100%" height="100%" fill="${C.bg}" rx="8"/>
${monthLabelsSVG}
${dayLabels}
${cells}
${scanGlow}
${scanLine}
${title}
</svg>`;
  }

  // ============================================================================
  // Canvas Renderer
  // ============================================================================
  class GRIRenderer {
    constructor(container, options) {
      this.container = typeof container === 'string' 
        ? document.querySelector(container) 
        : container;
      this.options = Object.assign({
        theme: 'dark',
        username: 'user',
        showKSpace: true,
        showEcho: true,
        showHUD: true,
        autoPlay: true,
      }, options);
      
      this.C = THEMES[this.options.theme] || THEMES.dark;
      this.data = null;
      this.animationId = null;
      this.acc = 0;
      this.last = null;
      this.running = true;
      
      this.init();
    }

    init() {
      this.createDOM();
      this.setupCanvases();
      this.setupEvents();
      if (this.options.autoPlay) {
        this.start();
      }
    }

    createDOM() {
      const C = this.C;
      this.container.innerHTML = `
        <div class="gri-wrapper" style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:${C.bg};color:${C.text};padding:1rem 0;">
          <div style="max-width:640px;margin:0 auto;background:${C.bg};border:1px solid ${C.border};border-radius:16px;padding:20px 24px;overflow-x:auto;">
            ${this.renderHeader()}
            ${this.renderParams()}
            <div style="background:${C.canvasBg};border:1px solid ${C.border};border-radius:12px;padding:12px 14px;position:relative;">
              <canvas id="gri-main-${this.id}" style="display:block;"></canvas>
            </div>
            ${this.options.showKSpace || this.options.showEcho || this.options.showHUD ? this.renderBottomPanel() : ''}
            ${this.renderControls()}
          </div>
        </div>
      `;
    }

    renderHeader() {
      const C = this.C;
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${C.accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>
            </svg>
            <span style="font-size:14px;color:${C.text};letter-spacing:0.3px;font-weight:500;">
              GitHub Resonance Imaging <span style="color:${C.accent};font-weight:600;">(GRI)</span>
            </span>
          </div>
          <span style="display:flex;align-items:center;gap:6px;font-size:11px;background:${C.panelBg};border:1px solid ${C.border};border-radius:20px;padding:3px 10px;">
            <span style="width:6px;height:6px;border-radius:50%;background:${C.accent};animation:gri-pulse 2s ease-in-out infinite;"></span>
            <span id="gri-status-${this.id}" style="color:${C.accent};font-weight:500;">ACQUIRING</span>
          </span>
        </div>
        <style>@keyframes gri-pulse{0%,100%{opacity:1}50%{opacity:.4}}</style>
      `;
    }

    renderParams() {
      const C = this.C;
      const u = this.options.username;
      return `
        <div style="display:flex;flex-wrap:nowrap;gap:4px;margin-bottom:16px;font-size:10px;overflow-x:auto;">
          <span style="background:${C.panelBg};border:1px solid ${C.border};border-radius:6px;padding:3px 8px;color:${C.textSecondary};white-space:nowrap;">Seq <span style="color:${C.accent};font-weight:600;">GitEcho</span></span>
          <span style="background:${C.panelBg};border:1px solid ${C.border};border-radius:6px;padding:3px 8px;color:${C.textSecondary};white-space:nowrap;">TR <span style="color:${C.accent};font-weight:600;">7 d</span></span>
          <span style="background:${C.panelBg};border:1px solid ${C.border};border-radius:6px;padding:3px 8px;color:${C.textSecondary};white-space:nowrap;">TE <span style="color:${C.accent};font-weight:600;">24 h</span></span>
          <span style="background:${C.panelBg};border:1px solid ${C.border};border-radius:6px;padding:3px 8px;color:${C.textSecondary};white-space:nowrap;">FA <span style="color:${C.accent};font-weight:600;">42&#176;</span></span>
          <span style="background:${C.panelBg};border:1px solid ${C.border};border-radius:6px;padding:3px 8px;color:${C.textSecondary};white-space:nowrap;">Matrix <span style="color:${C.accent};font-weight:600;">52&#215;7</span></span>
          <span style="background:${C.panelBg};border:1px solid ${C.border};border-radius:6px;padding:3px 8px;color:${C.textSecondary};white-space:nowrap;">FOV <span style="color:${C.accent};font-weight:600;">365 d</span></span>
          <span style="background:${C.panelBg};border:1px solid ${C.border};border-radius:6px;padding:3px 8px;color:${C.textSecondary};white-space:nowrap;">User <span style="color:${C.accent};font-weight:600;">${u}</span></span>
        </div>
      `;
    }

    renderBottomPanel() {
      const C = this.C;
      let html = '<div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:14px;align-items:flex-start;">';
      
      if (this.options.showKSpace) {
        html += `
          <div style="flex:0 0 auto;">
            <div style="font-size:10px;color:${C.dim};margin-bottom:4px;padding-left:2px;">k-space</div>
            <canvas id="gri-k-${this.id}" style="border:1px solid ${C.border};border-radius:8px;background:${C.canvasBg};display:block;"></canvas>
          </div>`;
      }
      
      if (this.options.showEcho) {
        html += `
          <div style="flex:0 0 auto;">
            <div style="font-size:10px;color:${C.dim};margin-bottom:4px;padding-left:2px;">MR signal (echo)</div>
            <canvas id="gri-echo-${this.id}" style="border:1px solid ${C.border};border-radius:8px;background:${C.canvasBg};display:block;"></canvas>
          </div>`;
      }
      
      if (this.options.showHUD) {
        html += `
          <div style="flex:1;min-width:140px;background:${C.panelBg};border:1px solid ${C.border};border-radius:10px;padding:12px 14px;font-size:12px;color:${C.dim};line-height:2;">
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ${C.border};padding-bottom:6px;margin-bottom:6px;">
              <span>PE line</span><span id="gri-pe-${this.id}" style="color:${C.text};font-weight:600;">0 / 52</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ${C.border};padding-bottom:6px;margin-bottom:6px;">
              <span>TR elapsed</span><span id="gri-tr-${this.id}" style="color:${C.text};font-weight:600;">0 wk</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span>&#931; signal</span><span id="gri-total-${this.id}" style="color:#86f2b0;font-weight:600;">&#8212; au</span>
            </div>
          </div>`;
      }
      
      html += '</div>';
      return html;
    }

    renderControls() {
      const C = this.C;
      return `
        <div style="display:flex;gap:8px;margin-top:14px;">
          <button id="gri-play-${this.id}" style="background:${C.panelBg};border:1px solid ${C.border};color:${C.text};border-radius:10px;padding:7px 12px;font:inherit;font-size:12px;cursor:pointer;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
          </button>
          <button id="gri-rescan-${this.id}" style="background:${C.panelBg};border:1px solid ${C.border};color:${C.text};border-radius:10px;padding:7px 14px;font:inherit;font-size:12px;cursor:pointer;font-weight:500;">Re-scan</button>
        </div>
      `;
    }

    setupCanvases() {
      const { MW, MH, KW, KH, EW, EH } = CONFIG;
      this.mx = setupCanvas(document.getElementById(`gri-main-${this.id}`), MW, MH);
      if (this.options.showKSpace) {
        this.kx = setupCanvas(document.getElementById(`gri-k-${this.id}`), KW, KH);
      }
      if (this.options.showEcho) {
        this.ex = setupCanvas(document.getElementById(`gri-echo-${this.id}`), EW, EH);
      }
    }

    setupEvents() {
      const playBtn = document.getElementById(`gri-play-${this.id}`);
      const rescanBtn = document.getElementById(`gri-rescan-${this.id}`);
      
      playBtn.addEventListener('click', () => {
        this.running = !this.running;
        this.updatePlayButton();
      });
      
      rescanBtn.addEventListener('click', () => {
        this.acc = 0;
        this.running = true;
        this.updatePlayButton();
      });
    }

    updatePlayButton() {
      const btn = document.getElementById(`gri-play-${this.id}`);
      const isPause = this.running;
      btn.innerHTML = isPause 
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>';
    }

    setData(data) {
      this.data = data;
      this.monthLabels = calculateMonthPositions(data.dates);
      this.total = 0;
      for (let w = 0; w < 52; w++) {
        for (let d = 0; d < 7; d++) {
          this.total += data.counts[w][d];
        }
      }
      // Build GRI letter overlay
      this.isGRI = Array(52).fill(null).map(() => Array(7).fill(false));
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
                this.isGRI[ww][cy] = true;
                data.grid[ww][cy] = 4;
                data.counts[ww][cy] = 15 + Math.floor(Math.random() * 5);
                data.kmag[ww][cy] = data.counts[ww][cy] / 20;
              }
            }
          }
        }
        sx += 6;
      }
    }

    start() {
      this.tick(0);
    }

    tick(ts) {
      if (this.last == null) this.last = ts;
      if (this.running) this.acc += ts - this.last;
      this.last = ts;
      
      const { SCAN_DURATION, RECON_DURATION, DONE_DURATION } = CONFIG;
      const CYC = SCAN_DURATION + RECON_DURATION + DONE_DURATION;
      const e = this.acc % CYC;
      let frac, mode;
      
      if (e < SCAN_DURATION) {
        frac = e / SCAN_DURATION;
        mode = 'ACQ';
      } else if (e < SCAN_DURATION + RECON_DURATION) {
        frac = 1;
        mode = 'REC';
      } else {
        frac = 1;
        mode = 'DONE';
      }
      
      this.drawMain(frac);
      if (mode === 'REC') this.drawRecon(e - SCAN_DURATION, RECON_DURATION);
      if (this.options.showKSpace) this.drawK(frac);
      if (this.options.showEcho) this.drawEcho(frac);
      this.setHUD(mode, frac);
      
      this.animationId = requestAnimationFrame((t) => this.tick(t));
    }

    drawMain(frac) {
      const { MW, MH, LP, TP, P, HTML_CELL } = CONFIG;
      const { grid } = this.data;
      const C = this.C;
      const acq = frac * 52;
      
      this.mx.clearRect(0, 0, MW, MH);
      
      // Month labels
      this.mx.font = '10px ui-monospace,monospace';
      this.mx.textBaseline = 'alphabetic';
      this.mx.fillStyle = C.dim;
      for (const m of this.monthLabels) {
        this.mx.fillText(m.label, LP + m.week * P, 11);
      }
      
      // Day labels
      this.mx.textBaseline = 'middle';
      const dayLab = { 1: 'Mon', 3: 'Wed', 5: 'Fri' };
      for (const k in dayLab) {
        this.mx.fillText(dayLab[k], 0, TP + (+k) * P + HTML_CELL / 2);
      }
      
      // Cells
      for (let w = 0; w < 52; w++) {
        for (let d = 0; d < 7; d++) {
          const X = LP + w * P;
          const Y = TP + d * P;
          const isLetter = this.isGRI[w][d];
          const level = grid[w][d];
          if (acq >= w + 1) {
            this.mx.fillStyle = isLetter ? C.gri[level] : C.sig[level];
          } else {
            this.mx.fillStyle = C.unacq;
          }
          roundRect(this.mx, X, Y, HTML_CELL, HTML_CELL, 2);
          this.mx.fill();
        }
      }
      
      // Scan line
      if (frac > 0 && frac < 1) {
        const sxp = LP + acq * P;
        this.mx.save();
        this.mx.strokeStyle = C.accent;
        this.mx.lineWidth = 1.5;
        this.mx.shadowColor = 'rgba(69,224,216,0.35)';
        this.mx.shadowBlur = 6;
        this.mx.beginPath();
        this.mx.moveTo(sxp, TP - 3);
        this.mx.lineTo(sxp, TP + 7 * P - 2);
        this.mx.stroke();
        this.mx.restore();
      }
    }

    drawRecon(elapsed, duration) {
      const { LP, TP, P } = CONFIG;
      const p = elapsed / duration;
      const xp = LP + p * 52 * P;
      this.mx.save();
      this.mx.fillStyle = 'rgba(69,224,216,0.08)';
      this.mx.fillRect(LP, TP - 2, Math.max(0, xp - LP), 7 * P);
      this.mx.strokeStyle = 'rgba(69,224,216,0.6)';
      this.mx.lineWidth = 2;
      this.mx.shadowColor = 'rgba(69,224,216,0.2)';
      this.mx.shadowBlur = 8;
      this.mx.beginPath();
      this.mx.moveTo(xp, TP - 3);
      this.mx.lineTo(xp, TP + 7 * P - 2);
      this.mx.stroke();
      this.mx.restore();
    }

    drawK(frac) {
      const { KW, KH } = CONFIG;
      const { kmag } = this.data;
      const C = this.C;
      const acq = frac * 52;
      const gx = 8, gy = 20, gw = KW - 16, gh = KH - 32;
      const cw = gw / 52, ch = gh / 7;
      
      this.kx.clearRect(0, 0, KW, KH);
      
      for (let w = 0; w < 52; w++) {
        const filled = acq >= w + 1;
        for (let d = 0; d < 7; d++) {
          const v = filled ? kmag[w][d] : 0;
          if (filled) {
            const gg = Math.round(30 + v * 215);
            this.kx.fillStyle = `rgb(${Math.round(v * 110)},${gg},${Math.round(170 + v * 70)})`;
          } else {
            this.kx.fillStyle = C.unacq;
          }
          this.kx.fillRect(gx + w * cw, gy + d * ch, Math.max(cw - 0.3, 0.8), ch - 0.5);
        }
      }
      
      this.kx.fillStyle = C.dim;
      this.kx.font = '9px ui-monospace,monospace';
      this.kx.fillText('PE \u2192 (weeks)', 8, KH - 5);
    }

    drawEcho(frac) {
      const { EW, EH } = CONFIG;
      const { kmag } = this.data;
      const C = this.C;
      const acq = frac * 52;
      const w = Math.min(51, Math.floor(acq));
      let A = 0;
      for (let d = 0; d < 7; d++) A += kmag[w][d];
      A = Math.min(1, A / 2.2);
      
      const x0 = 8, x1 = EW - 8, y0 = 22, y1 = EH - 14;
      const cx = (x0 + x1) / 2;
      const baseY = (y0 + y1) / 2 + 6;
      
      this.ex.clearRect(0, 0, EW, EH);
      
      // TE line
      this.ex.strokeStyle = this.options.theme === 'dark' ? '#27414f' : '#cbd5e1';
      this.ex.setLineDash([3, 3]);
      this.ex.lineWidth = 1;
      this.ex.beginPath();
      this.ex.moveTo(cx, y0);
      this.ex.lineTo(cx, y1);
      this.ex.stroke();
      this.ex.setLineDash([]);
      
      this.ex.fillStyle = C.dim;
      this.ex.font = '9px ui-monospace,monospace';
      this.ex.fillText('TE', cx + 3, y1);
      
      // Signal
      const sig = 14, freq = 0.55;
      const amp = (baseY - y0) * 0.92 * (0.14 + 0.86 * A);
      this.ex.strokeStyle = C.accent;
      this.ex.lineWidth = 1.4;
      this.ex.beginPath();
      for (let x = x0; x <= x1; x++) {
        const t = x - cx;
        const env = Math.exp(-(t * t) / (2 * sig * sig));
        const y = baseY - amp * env * Math.cos(t * freq);
        if (x === x0) this.ex.moveTo(x, y);
        else this.ex.lineTo(x, y);
      }
      this.ex.stroke();
    }

    calcSignal(pe) {
      let sig = 0;
      const { counts } = this.data;
      for (let w = 0; w < pe && w < 52; w++) {
        for (let d = 0; d < 7; d++) {
          sig += counts[w][d];
        }
      }
      return sig;
    }

    setHUD(mode, frac) {
      const pe = mode === 'ACQ' ? Math.min(52, Math.ceil(frac * 52)) : 52;
      const statusEl = document.getElementById(`gri-status-${this.id}`);
      const peEl = document.getElementById(`gri-pe-${this.id}`);
      const trEl = document.getElementById(`gri-tr-${this.id}`);
      const totalEl = document.getElementById(`gri-total-${this.id}`);
      
      if (statusEl) {
        statusEl.textContent = mode === 'ACQ' ? 'ACQUIRING' : (mode === 'REC' ? 'RECON \u00B7 iFFT' : 'SCAN COMPLETE');
        statusEl.style.color = mode === 'DONE' ? '#86f2b0' : this.C.accent;
      }
      if (peEl) peEl.textContent = `${pe} / 52`;
      if (trEl) trEl.textContent = `${pe} wk`;
      if (totalEl) {
        const sig = this.calcSignal(pe);
        totalEl.textContent = `${sig} au`;
      }
    }

    destroy() {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
      }
    }

    get id() {
      return this._id || (this._id = Math.random().toString(36).substr(2, 9));
    }
  }

  // ============================================================================
  // Public API
  // ============================================================================
  return {
    version: '1.0.0',
    
    /**
     * Initialize and render GRI visualization
     * @param {Object} options
     * @param {string} options.container - CSS selector or DOM element
     * @param {string} options.username - GitHub username
     * @param {string} [options.theme='dark'] - 'dark' or 'light'
     * @param {string} [options.token] - GitHub personal access token
     * @param {boolean} [options.showKSpace=true]
     * @param {boolean} [options.showEcho=true]
     * @param {boolean} [options.showHUD=true]
     * @param {boolean} [options.autoPlay=true]
     * @returns {Promise<GRIRenderer>}
     */
    async init(options) {
      const renderer = new GRIRenderer(options.container, options);
      
      try {
        const data = await fetchContributions(options.username, options.token);
        renderer.setData(data);
      } catch (err) {
        console.error('Failed to load contributions:', err);
        renderer.container.innerHTML = `<div style="color:#ff6b6b;padding:20px;">Error: ${err.message}</div>`;
        throw err;
      }
      
      return renderer;
    },

    /**
     * Generate static SVG (for server-side use)
     * @param {Object} data - { grid, dates, counts }
     * @param {string} [theme='dark']
     * @param {string} [username='user']
     * @returns {string} SVG string
     */
    generateSVG(data, theme, username) {
      return generateSVG(data.grid, data.dates, data.counts, theme || 'dark', username || 'user');
    },

    /**
     * Fetch contribution data only
     * @param {string} username
     * @param {string} [token]
     * @returns {Promise<Object>}
     */
    fetchData(username, token) {
      return fetchContributions(username, token);
    },

    THEMES,
    CONFIG,
  };
}));
