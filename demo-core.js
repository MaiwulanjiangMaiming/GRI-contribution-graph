/**
 * GRI demo renderer — shared by preview/scanner demo pages.
 *
 * Usage:
 *   GRIDemo.init({
 *     colors: {
 *       accent, dim, sig[5], gri[5], unacq,   // palette
 *       accentRGB: [r, g, b],                 // for scan-line glow
 *       status: { ACQ, REC, DONE },           // HUD status colors
 *       echoAxis,                             // echo canvas axis color
 *       kspaceColor(v)                        // k-space cell color by intensity 0..1
 *     },
 *     data:
 *       { counts, start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }  // real data (dates/levels/kmag derived)
 *       | 'fake'                              // deterministic demo data with GRI letters
 *   });
 */
(function (global) {
  'use strict';

  var WEEKS = 52, DAYS = 7;
  var SCAN = 6000, RECON = 900, HOLD = 2400;
  var CYCLE = SCAN + RECON + HOLD;

  // Layout (main canvas)
  var MW = 596, MH = 93, LP = 24, TP = 16, P = 11, CELL = 9;
  var KW = 168, KH = 96;   // k-space canvas
  var EW = 196, EH = 96;   // echo canvas
  var DAY_LABELS = { 1: 'Mon', 3: 'Wed', 5: 'Fri' };

  // GRI letter bitmap (visual highlight only, never changes counts)
  var GLYPHS = {
    G: ['01110', '10001', '10000', '10011', '10001', '10001', '01110'],
    R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111']
  };

  function griMask() {
    var mask = [], letters = ['G', 'R', 'I'], startX = 17;
    for (var w = 0; w < WEEKS; w++) mask[w] = new Array(DAYS).fill(false);
    for (var i = 0; i < 3; i++) {
      var rows = GLYPHS[letters[i]];
      for (var y = 0; y < DAYS; y++) {
        for (var x = 0; x < 5; x++) {
          if (rows[y][x] === '1' && startX + x < WEEKS) mask[startX + x][y] = true;
        }
      }
      startX += 6;
    }
    return mask;
  }

  // Real data: derive dates / levels / kmag from START + counts
  function realData(counts, startISO, endISO) {
    var start = new Date(startISO + 'T00:00:00Z').getTime();
    var max = 0;
    counts.forEach(function (row) { row.forEach(function (c) { if (c > max) max = c; }); });

    var dates = [], grid = [], kmag = [];
    for (var w = 0; w < counts.length; w++) {
      dates[w] = []; grid[w] = []; kmag[w] = [];
      for (var d = 0; d < DAYS; d++) {
        var iso = new Date(start + (w * 7 + d) * 864e5).toISOString().slice(0, 10);
        var c = counts[w][d];
        dates[w][d] = iso <= endISO ? iso : null;
        grid[w][d] = c < 1 ? 0 : c < 6 ? 1 : c < 11 ? 2 : c < 18 ? 3 : 4;
        kmag[w][d] = max ? c / max : 0;
      }
    }
    return { counts: counts, dates: dates, grid: grid, kmag: kmag };
  }

  // Deterministic demo data: sparse background + bright GRI letters
  function fakeData() {
    var seed = 20260531;
    var rnd = function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };

    var counts = [], dates = [], kmag = [];
    var today = new Date('2026-06-01');
    for (var w = 0; w < WEEKS; w++) {
      counts[w] = []; dates[w] = []; kmag[w] = [];
      for (var d = 0; d < DAYS; d++) {
        var r = rnd(); // 70% zero, 20% low (1-3), 10% medium (4-8)
        var c = r < 0.7 ? 0 : r < 0.9 ? Math.floor((r - 0.7) / 0.2 * 3) + 1 : Math.floor((r - 0.9) / 0.1 * 5) + 4;
        counts[w][d] = c;
        kmag[w][d] = c / 20;
        var day = new Date(today);
        day.setDate(today.getDate() - ((51 - w) * 7 + (6 - d)));
        dates[w][d] = day.toISOString().split('T')[0];
      }
    }

    var grid = [];
    for (w = 0; w < WEEKS; w++) {
      grid[w] = [];
      for (d = 0; d < DAYS; d++) {
        var v = counts[w][d];
        grid[w][d] = v === 0 ? 0 : v <= 3 ? 1 : v <= 6 ? 2 : v <= 10 ? 3 : 4;
      }
    }

    var mask = griMask();
    for (w = 0; w < WEEKS; w++) {
      for (d = 0; d < DAYS; d++) {
        if (mask[w][d]) {
          grid[w][d] = 4;                       // max brightness for letters
          counts[w][d] = 15 + Math.floor(rnd() * 5);
          kmag[w][d] = counts[w][d] / 20;
        }
      }
    }
    return { counts: counts, dates: dates, grid: grid, kmag: kmag };
  }

  function monthLabels(dates) {
    var names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var labels = [], seen = {};
    for (var w = 0; w < dates.length; w++) {
      for (var d = 0; d < DAYS; d++) {
        if (!dates[w][d]) continue;
        var date = new Date(dates[w][d]);
        var m = date.getMonth();
        if (date.getDate() <= 7 && !seen[m]) {
          seen[m] = true;
          labels.push({ week: w, label: names[m] });
        }
      }
    }
    return labels;
  }

  function roundedRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function setupCanvas(cv, w, h) {
    var dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr; cv.height = h * dpr;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  global.GRIDemo = {
    init: function (cfg) {
      var C = cfg.colors;
      var rgba = function (a) { return 'rgba(' + C.accentRGB.join(',') + ',' + a + ')'; };
      var data = cfg.data === 'fake' ? fakeData() : realData(cfg.data.counts, cfg.data.start, cfg.data.end);
      var counts = data.counts, dates = data.dates, grid = data.grid, kmag = data.kmag;
      var isGRI = griMask();
      var labels = monthLabels(dates);

      // Canvas setup
      var mx = setupCanvas(document.getElementById('gri-main'), MW, MH);
      var kx = setupCanvas(document.getElementById('gri-k'), KW, KH);
      var ex = setupCanvas(document.getElementById('gri-echo'), EW, EH);

      // Tooltip
      var tooltip = document.getElementById('gri-tooltip');
      var canvasEl = document.getElementById('gri-main');

      function updateTooltipPos(e) {
        tooltip.style.left = (e.clientX + 10) + 'px';
        tooltip.style.top = (e.clientY - 30) + 'px';
      }
      function showTooltip(e, w, d) {
        if (!dates[w][d]) return;
        tooltip.innerHTML = '<strong>' + counts[w][d] + '</strong> echo on <strong>' + dates[w][d] + '</strong>';
        tooltip.style.opacity = '1';
        updateTooltipPos(e);
      }
      function hideTooltip() { tooltip.style.opacity = '0'; }

      canvasEl.addEventListener('mousemove', function (e) {
        var rect = canvasEl.getBoundingClientRect();
        var w = Math.floor((e.clientX - rect.left - LP) / P);
        var d = Math.floor((e.clientY - rect.top - TP) / P);
        if (w >= 0 && w < WEEKS && d >= 0 && d < DAYS && dates[w][d]) {
          showTooltip(e, w, d);
          canvasEl.style.cursor = 'pointer';
        } else {
          hideTooltip();
          canvasEl.style.cursor = 'default';
        }
      });
      canvasEl.addEventListener('mouseleave', hideTooltip);

      // Drawing
      function drawMain(frac) {
        mx.clearRect(0, 0, MW, MH);
        var acq = frac * WEEKS;

        mx.font = '10px ui-monospace,monospace';
        mx.textBaseline = 'alphabetic';
        mx.fillStyle = C.dim;
        labels.forEach(function (m) { mx.fillText(m.label, LP + m.week * P, 11); });

        mx.textBaseline = 'middle';
        for (var k in DAY_LABELS) mx.fillText(DAY_LABELS[k], 0, TP + (+k) * P + CELL / 2);

        for (var w = 0; w < WEEKS; w++) {
          for (var d = 0; d < DAYS; d++) {
            mx.fillStyle = acq >= w + 1
              ? (isGRI[w][d] ? C.gri[grid[w][d]] : C.sig[grid[w][d]])
              : C.unacq;
            roundedRect(mx, LP + w * P, TP + d * P, CELL, CELL, 2);
            mx.fill();
          }
        }

        if (frac > 0 && frac < 1) {
          var sx = LP + acq * P;
          mx.save();
          mx.strokeStyle = C.accent;
          mx.lineWidth = 1.5;
          mx.shadowColor = rgba(0.35);
          mx.shadowBlur = 6;
          mx.beginPath();
          mx.moveTo(sx, TP - 3);
          mx.lineTo(sx, TP + DAYS * P - 2);
          mx.stroke();
          mx.restore();
        }
      }

      function drawK(frac) {
        kx.clearRect(0, 0, KW, KH);
        var acq = frac * WEEKS;
        var gx = 8, gy = 20, cw = (KW - 16) / WEEKS, ch = (KH - 32) / DAYS;

        for (var w = 0; w < WEEKS; w++) {
          var filled = acq >= w + 1;
          for (var d = 0; d < DAYS; d++) {
            kx.fillStyle = filled ? C.kspaceColor(kmag[w][d]) : C.unacq;
            kx.fillRect(gx + w * cw, gy + d * ch, Math.max(cw - 0.3, 0.8), ch - 0.5);
          }
        }
        kx.fillStyle = C.dim;
        kx.font = '9px ui-monospace,monospace';
        kx.fillText('PE \u2192 (weeks)', 8, KH - 5);
      }

      function drawEcho(frac) {
        ex.clearRect(0, 0, EW, EH);
        var w = Math.min(WEEKS - 1, Math.floor(frac * WEEKS));
        var A = 0;
        for (var d = 0; d < DAYS; d++) A += kmag[w][d];
        A = Math.min(1, A / 2.2);

        var x0 = 8, x1 = EW - 8, y0 = 22, y1 = EH - 14;
        var cx = (x0 + x1) / 2, baseY = (y0 + y1) / 2 + 6;

        ex.strokeStyle = C.echoAxis;
        ex.setLineDash([3, 3]);
        ex.lineWidth = 1;
        ex.beginPath();
        ex.moveTo(cx, y0);
        ex.lineTo(cx, y1);
        ex.stroke();
        ex.setLineDash([]);

        ex.fillStyle = C.dim;
        ex.font = '9px ui-monospace,monospace';
        ex.fillText('TE', cx + 3, y1);

        var sigma = 14, freq = 0.55;
        var amp = (baseY - y0) * 0.92 * (0.14 + 0.86 * A);
        ex.strokeStyle = C.accent;
        ex.lineWidth = 1.4;
        ex.beginPath();
        for (var x = x0; x <= x1; x++) {
          var t = x - cx;
          var env = Math.exp(-(t * t) / (2 * sigma * sigma));
          var y = baseY - amp * env * Math.cos(t * freq);
          if (x === x0) ex.moveTo(x, y); else ex.lineTo(x, y);
        }
        ex.stroke();
      }

      // HUD
      var statusEl = document.getElementById('gri-status');
      var peEl = document.getElementById('gri-pe');
      var trEl = document.getElementById('gri-tr');
      var totalEl = document.getElementById('gri-total');

      function signalUpTo(pe) {
        var sig = 0;
        for (var w = 0; w < pe && w < WEEKS; w++)
          for (var d = 0; d < DAYS; d++) sig += counts[w][d];
        return sig;
      }

      function setHUD(mode, pe) {
        statusEl.textContent = mode === 'ACQ' ? 'ACQUIRING' : (mode === 'REC' ? 'RECON \u00B7 iFFT' : 'SCAN COMPLETE');
        statusEl.style.color = C.status[mode];
        peEl.textContent = pe + ' / ' + WEEKS;
        trEl.textContent = pe + ' wk';
        totalEl.textContent = signalUpTo(pe) + ' au';
      }

      // Animation loop
      var acc = 0, last = null, running = true;

      function drawReconSweep(p) {
        var xp = LP + p * WEEKS * P;
        mx.save();
        mx.fillStyle = rgba(0.08);
        mx.fillRect(LP, TP - 2, Math.max(0, xp - LP), DAYS * P);
        mx.strokeStyle = rgba(0.6);
        mx.lineWidth = 2;
        mx.shadowColor = rgba(0.2);
        mx.shadowBlur = 8;
        mx.beginPath();
        mx.moveTo(xp, TP - 3);
        mx.lineTo(xp, TP + DAYS * P - 2);
        mx.stroke();
        mx.restore();
      }

      function tick(ts) {
        if (last === null) last = ts;
        if (running) acc += ts - last;
        last = ts;

        var e = acc % CYCLE, frac, mode;
        if (e < SCAN) { frac = e / SCAN; mode = 'ACQ'; }
        else if (e < SCAN + RECON) { frac = 1; mode = 'REC'; }
        else { frac = 1; mode = 'DONE'; }

        drawMain(frac);
        if (mode === 'REC') drawReconSweep((e - SCAN) / RECON);
        drawK(frac);
        drawEcho(frac);
        setHUD(mode, mode === 'ACQ' ? Math.min(WEEKS, Math.ceil(frac * WEEKS)) : WEEKS);

        requestAnimationFrame(tick);
      }

      // Controls
      var ICON_PAUSE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
      var ICON_PLAY = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>';
      var playBtn = document.getElementById('gri-play');

      function updPlay() { playBtn.innerHTML = running ? ICON_PAUSE : ICON_PLAY; }
      playBtn.onclick = function () { running = !running; updPlay(); };
      document.getElementById('gri-rescan').onclick = function () { acc = 0; running = true; updPlay(); };

      requestAnimationFrame(tick);
    }
  };
})(window);
