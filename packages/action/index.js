const fs = require('node:fs');
const path = require('node:path');

const githubUserName = process.env.GITHUB_USER_NAME;
const githubToken = process.env.GITHUB_TOKEN;
const outputsRaw = (process.env.OUTPUTS || '').split('\n').map(s => s.trim()).filter(Boolean);

if (!githubUserName) {
  console.error('GITHUB_USER_NAME is required');
  process.exit(1);
}

console.log(`Generating GRI visualization for: ${githubUserName}`);

// Parse output options
const outputs = outputsRaw.map(line => {
  const [filename, query] = line.split('?');
  const params = new URLSearchParams(query || '');
  return {
    filename,
    theme: params.get('theme') || 'dark',
    speed: params.get('speed') || 'normal',
  };
});

// Ensure dist directory exists
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

  for (let w = 0; w < weeks.length; w++) {
    grid[w] = [];
    kmag[w] = [];
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
      } else {
        grid[w][d] = 0;
        kmag[w][d] = 0;
      }
    }
  }

  while (grid.length < 52) {
    grid.push(new Array(7).fill(0));
    kmag.push(new Array(7).fill(0));
  }

  return { grid, kmag };
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

  for (let w = 0; w < 52; w++) {
    grid[w] = [];
    kmag[w] = [];
    for (let d = 0; d < 7; d++) {
      const r = rnd();
      grid[w][d] = r > 0.82 ? 2 : r > 0.55 ? 1 : 0;
      kmag[w][d] = rnd();
    }
  }

  return { grid, kmag };
}

async function generateHTML(theme, grid, kmag) {
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

  const C = colors[theme];
  const gridJSON = JSON.stringify(grid);
  const kmagJSON = JSON.stringify(kmag);

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
  </style>
</head>
<body>
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
      <span style="background:${C.panelBg};border:1px solid ${C.border};border-radius:6px;padding:3px 8px;color:${C.textSecondary};white-space:nowrap;">FA <span style="color:${C.accent};font-weight:600;">42°</span></span>
      <span style="background:${C.panelBg};border:1px solid ${C.border};border-radius:6px;padding:3px 8px;color:${C.textSecondary};white-space:nowrap;">Matrix <span style="color:${C.accent};font-weight:600;">52×7</span></span>
      <span style="background:${C.panelBg};border:1px solid ${C.border};border-radius:6px;padding:3px 8px;color:${C.textSecondary};white-space:nowrap;">FOV <span style="color:${C.accent};font-weight:600;">365 d</span></span>
      <span style="background:${C.panelBg};border:1px solid ${C.border};border-radius:6px;padding:3px 8px;color:${C.textSecondary};white-space:nowrap;">User <span style="color:${C.accent};font-weight:600;">${githubUserName}</span></span>
    </div>

    <div style="background:#080c11;border:1px solid ${C.border};border-radius:12px;padding:12px 14px;">
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
          <span>Σ signal</span>
          <span id="gri-total" style="color:#86f2b0;font-weight:600;font-family:ui-monospace,monospace;">— au</span>
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
    var C = {accent:'${C.accent}',dim:'${C.dim}',sig:${JSON.stringify(C.sig)},unacq:'${C.unacq}'};
    var WEEKS=52,DAYS=7;
    var total=0;
    for(var a=0;a<WEEKS;a++)for(var b=0;b<DAYS;b++)total+=GRID[a][b];

    function dpr(cv,w,h){var rr=window.devicePixelRatio||1;cv.width=w*rr;cv.height=h*rr;cv.style.width=w+'px';cv.style.height=h+'px';var x=cv.getContext('2d');x.setTransform(rr,0,0,rr,0,0);return x;}
    var MW=596,MH=93,LP=24,TP=16,P=11,CELL=9;
    var mx=dpr(document.getElementById('gri-main'),MW,MH);
    var KW=168,KH=96,kx=dpr(document.getElementById('gri-k'),KW,KH);
    var EW=196,EH=96,ex=dpr(document.getElementById('gri-echo'),EW,EH);
    var months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var mPos=[0,4,9,13,17,22,26,30,35,39,44,48];
    var dayLab={1:'Mon',3:'Wed',5:'Fri'};

    function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}

    function drawMain(frac){
      mx.clearRect(0,0,MW,MH);var acq=frac*WEEKS;
      mx.font='10px ui-monospace,monospace';mx.textBaseline='alphabetic';mx.fillStyle=C.dim;
      for(var i=0;i<12;i++)mx.fillText(months[i],LP+mPos[i]*P,11);
      mx.textBaseline='middle';
      for(var k in dayLab)mx.fillText(dayLab[k],0,TP+(+k)*P+CELL/2);
      for(var w=0;w<WEEKS;w++)for(var d=0;d<DAYS;d++){var X=LP+w*P,Y=TP+d*P;mx.fillStyle=(acq>=w+1)?C.sig[GRID[w][d]]:C.unacq;rr(mx,X,Y,CELL,CELL,2);mx.fill();}
      if(frac>0&&frac<1){var sxp=LP+acq*P;mx.save();mx.strokeStyle=C.accent;mx.lineWidth=1.5;mx.shadowColor='rgba(69,224,216,0.35)';mx.shadowBlur=6;mx.beginPath();mx.moveTo(sxp,TP-3);mx.lineTo(sxp,TP+DAYS*P-2);mx.stroke();mx.restore();}
    }

    function drawK(frac){
      kx.clearRect(0,0,KW,KH);
      var acq=frac*WEEKS,gx=8,gy=20,gw=KW-16,gh=KH-32,cw=gw/WEEKS,ch=gh/DAYS;
      for(var w=0;w<WEEKS;w++){var filled=acq>=w+1;for(var d=0;d<DAYS;d++){var v=filled?KMAG[w][d]:0;if(filled){var gg=Math.round(30+v*215);kx.fillStyle='rgb('+Math.round(v*110)+','+gg+','+Math.round(170+v*70)+')';}else kx.fillStyle=C.unacq;kx.fillRect(gx+w*cw,gy+d*ch,Math.max(cw-0.3,0.8),ch-0.5);}}
      kx.fillStyle=C.dim;kx.font='9px ui-monospace,monospace';kx.fillText('PE → (weeks)',8,KH-5);
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
    function setHUD(mode,pe){statusEl.textContent=mode==='ACQ'?'ACQUIRING':(mode==='REC'?'RECON · iFFT':'SCAN COMPLETE');statusEl.style.color=mode==='DONE'?'#86f2b0':(mode==='REC'?'${C.accent}':'${C.accent}');peEl.textContent=pe+' / '+WEEKS;trEl.textContent=pe+' wk';totalEl.textContent=(mode==='DONE'||mode==='REC')?total+' au':'— au';}

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
    let grid, kmag;

    if (githubToken) {
      console.log('Fetching real contribution data from GitHub API...');
      const data = await fetchContributions(githubUserName, githubToken);
      grid = data.grid;
      kmag = data.kmag;
      console.log(`Loaded ${grid.length} weeks of contribution data`);
    } else {
      console.log('No GITHUB_TOKEN provided, using fake data');
      const fake = generateFakeData();
      grid = fake.grid;
      kmag = fake.kmag;
    }

    for (const out of outputs) {
      const html = await generateHTML(out.theme, grid, kmag);
      fs.mkdirSync(path.dirname(out.filename), { recursive: true });
      fs.writeFileSync(out.filename, html);
      console.log(`Generated: ${out.filename}`);
    }

    console.log('GRI generation complete!');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
