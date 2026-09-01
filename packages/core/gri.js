/**
 * GitHub Resonance Imaging (GRI) Core Engine
 * An MRI scan visualization of contribution graphs
 */

const GRI = (function () {
  const WEEKS = 52;
  const DAYS = 7;

  // Letter bitmaps for "GRI"
  const GLYPHS = {
    G: ['01110', '10001', '10000', '10011', '10001', '10001', '01110'],
    R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  };

  // Seeded PRNG (Mulberry32)
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Color palettes
  const PALETTES = {
    dark: {
      accent: '#45e0d8',
      dim: '#5d7686',
      sig: ['#122a1e', '#1f5c3a', '#2f9c5b', '#46d07e', '#86f2b0'],
      unacq: '#0d141b',
      bg: '#080c11',
      panelBg: '#0f1620',
      border: '#1e2b38',
      text: '#cfeae4',
      textSecondary: '#9fc4bd',
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
    },
  };

  class GRIScanner {
    constructor(options = {}) {
      this.theme = options.theme || 'dark';
      this.seed = options.seed || 20260531;
      this.speed = options.speed || 1;
      this.onFrame = options.onFrame || null;
      this.onComplete = options.onComplete || null;

      this.colors = PALETTES[this.theme];
      this.rnd = mulberry32(this.seed);
      this.data = [];
      this.kmag = [];
      this.total = 0;
      this.running = true;
      this.acc = 0;
      this.lastTs = null;

      this.SCAN = 6000 / this.speed;
      this.RECON = 900 / this.speed;
      this.DONE = 2400 / this.speed;
      this.CYCLE = this.SCAN + this.RECON + this.DONE;

      // Support external data injection
      if (options.gridData && options.kmagData) {
        this._initWithRealData(options.gridData, options.kmagData);
      } else {
        this._initData();
      }
    }

    _initWithRealData(grid, kmag) {
      this.data = grid;
      this.kmag = kmag;
      this.total = 0;
      for (let a = 0; a < this.data.length; a++) {
        for (let b = 0; b < this.data[a].length; b++) {
          this.total += this.data[a][b];
        }
      }
    }

    _initData() {
      this.data = [];
      this.kmag = [];
      this.rnd = mulberry32(this.seed);

      for (let w = 0; w < WEEKS; w++) {
        this.data[w] = [];
        this.kmag[w] = [];
        for (let d = 0; d < DAYS; d++) {
          const r = this.rnd();
          const lv = r > 0.82 ? 2 : r > 0.55 ? 1 : 0;
          this.data[w][d] = lv;

          const sw = 6.0;
          const sd = 2.0;
          this.kmag[w][d] =
            Math.exp(-Math.pow(w - 25.5, 2) / (2 * sw * sw)) *
            Math.exp(-Math.pow(d - 3, 2) / (2 * sd * sd)) *
            (0.85 + 0.3 * this.rnd());
        }
      }

      // Embed "GRI" letters
      const letters = ['G', 'R', 'I'];
      let sx = 17;
      for (let li = 0; li < 3; li++) {
        const g = GLYPHS[letters[li]];
        for (let cy = 0; cy < 7; cy++) {
          const row = g[cy];
          for (let cx = 0; cx < 5; cx++) {
            if (row[cx] === '1') {
              const ww = sx + cx;
              if (ww < WEEKS) this.data[ww][cy] = this.rnd() > 0.35 ? 4 : 3;
            }
          }
        }
        sx += 6;
      }

      this.total = 0;
      for (let a = 0; a < WEEKS; a++) {
        for (let b = 0; b < DAYS; b++) {
          this.total += this.data[a][b];
        }
      }
    }

    getState() {
      const e = this.acc % this.CYCLE;
      let frac, mode;
      if (e < this.SCAN) {
        frac = e / this.SCAN;
        mode = 'ACQ';
      } else if (e < this.SCAN + this.RECON) {
        frac = 1;
        mode = 'REC';
      } else {
        frac = 1;
        mode = 'DONE';
      }
      const pe = mode === 'ACQ' ? Math.min(WEEKS, Math.ceil(frac * WEEKS)) : WEEKS;
      return { frac, mode, pe, progress: e / this.CYCLE };
    }

    tick(timestamp) {
      if (this.lastTs === null) this.lastTs = timestamp;
      if (this.running) {
        this.acc += timestamp - this.lastTs;
      }
      this.lastTs = timestamp;

      const state = this.getState();
      if (this.onFrame) this.onFrame(state);

      if (state.mode === 'DONE' && this.onComplete) {
        this.onComplete();
      }

      return state;
    }

    play() {
      this.running = true;
    }

    pause() {
      this.running = false;
    }

    toggle() {
      this.running = !this.running;
      return this.running;
    }

    reset() {
      this.acc = 0;
      this.running = true;
      this.lastTs = null;
    }

    getGridData() {
      return this.data;
    }

    getKSpaceData() {
      return this.kmag;
    }

    getTotalSignal() {
      return this.total;
    }
  }

  // Canvas renderer
  class GRIRenderer {
    constructor(scanner, canvases) {
      this.scanner = scanner;
      this.colors = scanner.colors;

      this.MW = 596;
      this.MH = 93;
      this.LP = 24;
      this.TP = 16;
      this.P = 11;
      this.CELL = 9;

      this.KW = 168;
      this.KH = 96;

      this.EW = 196;
      this.EH = 96;

      this.months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      this.mPos = [0, 4, 9, 13, 17, 22, 26, 30, 35, 39, 44, 48];
      this.dayLab = { 1: 'Mon', 3: 'Wed', 5: 'Fri' };

      this.mx = this._setupCanvas(canvases.main, this.MW, this.MH);
      this.kx = this._setupCanvas(canvases.kspace, this.KW, this.KH);
      this.ex = this._setupCanvas(canvases.echo, this.EW, this.EH);
    }

    _setupCanvas(cv, w, h) {
      const rr = window.devicePixelRatio || 1;
      cv.width = w * rr;
      cv.height = h * rr;
      cv.style.width = w + 'px';
      cv.style.height = h + 'px';
      const ctx = cv.getContext('2d');
      ctx.setTransform(rr, 0, 0, rr, 0, 0);
      return ctx;
    }

    _roundRect(c, x, y, w, h, r) {
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }

    drawMain(frac) {
      const c = this.mx;
      const C = this.colors;
      const acq = frac * WEEKS;

      c.clearRect(0, 0, this.MW, this.MH);

      c.font = '10px ui-monospace,monospace';
      c.textBaseline = 'alphabetic';
      c.fillStyle = C.dim;
      for (let i = 0; i < 12; i++) {
        c.fillText(this.months[i], this.LP + this.mPos[i] * this.P, 11);
      }

      c.textBaseline = 'middle';
      for (const k in this.dayLab) {
        c.fillText(this.dayLab[k], 0, this.TP + (+k) * this.P + this.CELL / 2);
      }

      const data = this.scanner.getGridData();
      for (let w = 0; w < WEEKS; w++) {
        for (let d = 0; d < DAYS; d++) {
          const X = this.LP + w * this.P;
          const Y = this.TP + d * this.P;
          c.fillStyle = acq >= w + 1 ? C.sig[data[w][d]] : C.unacq;
          this._roundRect(c, X, Y, this.CELL, this.CELL, 2);
          c.fill();
        }
      }

      if (frac > 0 && frac < 1) {
        const sxp = this.LP + acq * this.P;
        c.save();
        c.strokeStyle = C.accent;
        c.lineWidth = 1.5;
        c.shadowColor = C.accent + '59';
        c.shadowBlur = 6;
        c.beginPath();
        c.moveTo(sxp, this.TP - 3);
        c.lineTo(sxp, this.TP + DAYS * this.P - 2);
        c.stroke();
        c.restore();
      }
    }

    drawKSpace(frac) {
      const c = this.kx;
      const C = this.colors;
      const acq = frac * WEEKS;
      const gx = 8;
      const gy = 20;
      const gw = this.KW - 16;
      const gh = this.KH - 32;
      const cw = gw / WEEKS;
      const ch = gh / DAYS;

      c.clearRect(0, 0, this.KW, this.KH);

      const kmag = this.scanner.getKSpaceData();
      for (let w = 0; w < WEEKS; w++) {
        const filled = acq >= w + 1;
        for (let d = 0; d < DAYS; d++) {
          const v = filled ? kmag[w][d] : 0;
          if (filled) {
            const gg = Math.round(30 + v * 215);
            const r = Math.round(v * 110);
            const b = Math.round(170 + v * 70);
            c.fillStyle = `rgb(${r},${gg},${b})`;
          } else {
            c.fillStyle = C.unacq;
          }
          c.fillRect(gx + w * cw, gy + d * ch, Math.max(cw - 0.3, 0.8), ch - 0.5);
        }
      }

      c.fillStyle = C.dim;
      c.font = '9px ui-monospace,monospace';
      c.fillText('PE \u2192 (weeks)', 8, this.KH - 5);
    }

    drawEcho(frac) {
      const c = this.ex;
      const C = this.colors;
      const acq = frac * WEEKS;
      const w = Math.min(WEEKS - 1, Math.floor(acq));
      let A = 0;
      const kmag = this.scanner.getKSpaceData();
      for (let d = 0; d < DAYS; d++) A += kmag[w][d];
      A = Math.min(1, A / 2.2);

      c.clearRect(0, 0, this.EW, this.EH);

      const x0 = 8;
      const x1 = this.EW - 8;
      const y0 = 22;
      const y1 = this.EH - 14;
      const cx = (x0 + x1) / 2;
      const baseY = (y0 + y1) / 2 + 6;

      c.strokeStyle = this.theme === 'dark' ? '#27414f' : '#cbd5e1';
      c.setLineDash([3, 3]);
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(cx, y0);
      c.lineTo(cx, y1);
      c.stroke();
      c.setLineDash([]);

      c.fillStyle = C.dim;
      c.font = '9px ui-monospace,monospace';
      c.fillText('TE', cx + 3, y1);

      const sig = 14;
      const freq = 0.55;
      const amp = (baseY - y0) * 0.92 * (0.14 + 0.86 * A);

      c.strokeStyle = C.accent;
      c.lineWidth = 1.4;
      c.beginPath();
      for (let x = x0; x <= x1; x++) {
        const t = x - cx;
        const env = Math.exp(-(t * t) / (2 * sig * sig));
        const y = baseY - amp * env * Math.cos(t * freq);
        if (x === x0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }

    drawRecon(progress) {
      const c = this.mx;
      const C = this.colors;
      const xp = this.LP + progress * WEEKS * this.P;

      c.save();
      c.fillStyle = C.accent + '14';
      c.fillRect(this.LP, this.TP - 2, Math.max(0, xp - this.LP), DAYS * this.P);
      c.strokeStyle = C.accent + '99';
      c.lineWidth = 2;
      c.shadowColor = C.accent + '33';
      c.shadowBlur = 8;
      c.beginPath();
      c.moveTo(xp, this.TP - 3);
      c.lineTo(xp, this.TP + DAYS * this.P - 2);
      c.stroke();
      c.restore();
    }

    render(state) {
      this.drawMain(state.frac);
      if (state.mode === 'REC') {
        const p = (this.scanner.acc - this.scanner.SCAN) / this.scanner.RECON;
        this.drawRecon(p);
      }
      this.drawKSpace(state.frac);
      this.drawEcho(state.frac);
    }
  }

  return { GRIScanner, GRIRenderer, PALETTES, WEEKS, DAYS };
})();

// Export for module environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GRI;
}
