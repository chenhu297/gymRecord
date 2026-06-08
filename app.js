// ── Swipe navigation ─────────────────────────────────────────────────────────
const SwipeNav = (() => {
  let current = 0;
  let startX = 0, startY = 0, dragging = false, dx = 0;
  const wrapper = () => document.getElementById('swipe-wrapper');
  const track = () => document.getElementById('swipe-track');
  const dots = () => [document.getElementById('dot-0'), document.getElementById('dot-1')];

  function goTo(idx, animated = true) {
    current = idx;
    const t = track(), w = wrapper();
    t.style.transition = animated
      ? 'transform 0.35s cubic-bezier(0.4,0,0.2,1)'
      : 'none';
    t.style.transform = `translateX(${-idx * w.offsetWidth}px)`;
    dots().forEach((d, i) => d.classList.toggle('active', i === idx));
  }

  function onStart(x, y) {
    startX = x; startY = y; dragging = true; dx = 0;
    track().style.transition = 'none';
  }
  function onMove(x, y) {
    if (!dragging) return;
    dx = x - startX;
    const dy = y - startY;
    if (Math.abs(dy) > Math.abs(dx)) { dragging = false; return; }
    const w = wrapper();
    const base = -current * w.offsetWidth;
    const clamped = Math.max(Math.min(dx, w.offsetWidth * 0.5), -w.offsetWidth * 0.5);
    track().style.transform = `translateX(${base + clamped}px)`;
  }
  function onEnd() {
    if (!dragging) return;
    dragging = false;
    const threshold = wrapper().offsetWidth / 3;
    if (dx < -threshold && current < 1) goTo(1);
    else if (dx > threshold && current > 0) goTo(0);
    else goTo(current);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const w = wrapper();
    w.addEventListener('touchstart', e => onStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    w.addEventListener('touchmove',  e => onMove(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    w.addEventListener('touchend', onEnd);
    w.addEventListener('mousedown', e => { onStart(e.clientX, e.clientY); e.preventDefault(); });
    window.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', onEnd);
  });

  return { goTo, getCurrent: () => current };
})();

// ── Gym checkin ──────────────────────────────────────────────────────────────
const CONFIG = {
  GIST_ID: localStorage.getItem('gym_gist_id') || '',
  TOKEN: localStorage.getItem('gym_token') || '',
  CARD_TOTAL: 60,
  PERSONS: {
    husband: { value: 'husband', name: '帅', icon: '🐯' },
    wife:    { value: 'wife',    name: '雪', icon: '🐰' },
  },
};

const Storage = {
  async load() {
    const res = await fetch(`https://api.github.com/gists/${CONFIG.GIST_ID}`, {
      headers: { Authorization: `token ${CONFIG.TOKEN}` },
    });
    if (!res.ok) throw new Error(`读取失败 (${res.status})`);
    const data = await res.json();
    const file = data.files['records.json'] || Object.values(data.files)[0];
    if (!file || !file.content) return [];
    try { return JSON.parse(file.content); } catch { return []; }
  },
  async save(records) {
    const res = await fetch(`https://api.github.com/gists/${CONFIG.GIST_ID}`, {
      method: 'PATCH',
      headers: { Authorization: `token ${CONFIG.TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { 'records.json': { content: JSON.stringify(records, null, 2) } } }),
    });
    if (!res.ok) throw new Error(`保存失败 (${res.status})`);
  },
};

const State = {
  records: [], filter: 'all',
  year: new Date().getFullYear(), month: new Date().getMonth(),
  selectedDate: null, loading: false, error: null,
};

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function formatDate(s) { const [,m,d] = s.split('-'); return `${m}/${d}`; }
function formatTime(ts) { const d = new Date(ts); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function getPersonInfo(v) { return CONFIG.PERSONS[v]; }
function getFiltered() { return State.filter === 'all' ? State.records : State.records.filter(r => r.person === State.filter); }

function renderAll() {
  const app = document.getElementById('app');
  if (State.loading) { app.innerHTML = '<div class="full-msg">加载中…</div>'; return; }
  if (State.error) { app.innerHTML = `<div class="full-msg">⚠️ ${State.error}<br><button class="retry-btn" onclick="init()">重试</button></div>`; return; }
  app.innerHTML = `
    <div id="s-stats" class="card"></div>
    <div id="s-cal" class="card" style="padding:20px 10px"></div>
    <div id="s-btns" class="btn-row"></div>
    <div id="s-filter" class="card" style="padding:10px 16px"></div>
    <div id="s-list" class="card"></div>
  `;
  renderStats(); renderFilter(); renderCal(); renderBtns(); renderList();
}

function renderStats() {
  const used = State.records.length, total = CONFIG.CARD_TOTAL, remain = Math.max(total - used, 0);
  const pct = Math.min(used / total * 100, 100);
  const hCount = State.records.filter(r => r.person === 'husband').length;
  const wCount = State.records.filter(r => r.person === 'wife').length;
  const C = 2 * Math.PI * 36;
  const offset = C * (1 - pct / 100);
  const w = CONFIG.PERSONS.wife, h = CONFIG.PERSONS.husband;
  document.getElementById('s-stats').innerHTML = `
    <div class="app-label">💪 GymRecord</div>
    <div class="stats-top">
      <div class="stats-left">
        <span class="stats-num">${used}</span>
        <span class="stats-denom">/ ${total} 次</span>
        <span class="stats-remain">剩余 ${remain} 次</span>
      </div>
      <div class="stats-ring">
        <svg viewBox="0 0 84 84">
          <circle class="ring-bg" cx="42" cy="42" r="36"/>
          <circle class="ring-fg" cx="42" cy="42" r="36" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"/>
        </svg>
        <span class="ring-label">${Math.round(pct)}%</span>
      </div>
    </div>
    <div class="stats-persons">
      <div class="person-stat wife"><span class="ps-icon">${w.icon}</span><span class="ps-name">${w.name}</span><span class="ps-count">${wCount}</span></div>
      <div class="person-stat husb"><span class="ps-icon">${h.icon}</span><span class="ps-name">${h.name}</span><span class="ps-count">${hCount}</span></div>
    </div>
  `;
}

function renderFilter() {
  const tabs = [
    { v: 'all', label: '全部' },
    { v: 'husband', label: `${CONFIG.PERSONS.husband.icon} ${CONFIG.PERSONS.husband.name}` },
    { v: 'wife', label: `${CONFIG.PERSONS.wife.icon} ${CONFIG.PERSONS.wife.name}` },
  ];
  document.getElementById('s-filter').innerHTML = `<div class="seg">${tabs.map(t =>
    `<button class="seg-btn ${State.filter === t.v ? 'active' : ''}" onclick="handleFilter('${t.v}')">${t.label}</button>`
  ).join('')}</div>`;
}

function handleFilter(v) { State.filter = v; renderAll(); }

function renderCal() {
  const { year, month } = State, today = getTodayStr();
  const filtered = getFiltered(), dayMap = {};
  filtered.forEach(r => { if (!dayMap[r.date]) dayMap[r.date] = new Set(); dayMap[r.date].add(r.person); });
  const firstDay = new Date(year, month, 1).getDay(), days = new Date(year, month+1, 0).getDate();
  const mNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const wds = ['日','一','二','三','四','五','六'];
  function icon(ds) {
    const p = dayMap[ds]; if (!p) return '';
    const h = p.has('husband'), w = p.has('wife');
    return h && w ? `${CONFIG.PERSONS.husband.icon}${CONFIG.PERSONS.wife.icon}` : h ? CONFIG.PERSONS.husband.icon : CONFIG.PERSONS.wife.icon;
  }
  let cells = '';
  for (let i = 0; i < firstDay; i++) cells += '<div></div>';
  for (let d = 1; d <= days; d++) {
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const future = ds > today, ic = icon(ds);
    const cls = ['cal-day', future ? 'future' : '', ds === today ? 'today' : '', ds === State.selectedDate ? 'selected' : '', ic ? 'has-rec' : ''].filter(Boolean).join(' ');
    const click = future ? '' : `onclick="handleDay('${ds}')"`;
    cells += `<div class="${cls}" ${click}><span class="d-num">${d}</span>${ic ? `<span class="d-icons">${ic}</span>` : ''}</div>`;
  }
  document.getElementById('s-cal').innerHTML = `
    <div class="cal-nav">
      <button class="cal-arrow" onclick="handleMonth(-1)">‹</button>
      <span class="cal-month">${year}年${mNames[month]}</span>
      <button class="cal-arrow" onclick="handleMonth(1)">›</button>
    </div>
    <div class="cal-grid">${wds.map(w => `<div class="cal-wd">${w}</div>`).join('')}${cells}</div>
  `;
}

function handleDay(ds) { State.selectedDate = State.selectedDate === ds ? null : ds; renderAll(); }
function handleMonth(d) {
  let m = State.month + d, y = State.year;
  if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
  State.month = m; State.year = y; renderAll();
}

function showConfirm(msg, onOk) {
  document.getElementById('confirm-msg').textContent = msg;
  document.getElementById('confirm-modal').classList.add('show');
  document.getElementById('confirm-ok').onclick = () => { document.getElementById('confirm-modal').classList.remove('show'); onOk(); };
  document.getElementById('confirm-cancel').onclick = () => { document.getElementById('confirm-modal').classList.remove('show'); };
}

async function handleCheckin(pv) {
  const targetDate = State.selectedDate || getTodayStr(), p = getPersonInfo(pv);
  async function doCheckin() {
    const rec = { id: generateId(), person: pv, date: targetDate, timestamp: Date.now() };
    const next = [...State.records, rec];
    State.records = next; State.selectedDate = null; renderAll();
    try { await Storage.save(next); }
    catch (e) { State.records = State.records.filter(r => r.id !== rec.id); renderAll(); alert(`保存失败：${e.message}`); }
  }
  const isSup = !!State.selectedDate;
  const alreadyToday = !isSup && State.records.some(r => r.person === pv && r.date === targetDate);
  if (isSup) showConfirm(`确认为 ${formatDate(targetDate)} 补 ${p.icon}${p.name} 的打卡？`, doCheckin);
  else if (alreadyToday) showConfirm(`今天 ${p.icon}${p.name} 已打卡，确认再次打卡？`, doCheckin);
  else await doCheckin();
}

function renderBtns() {
  const targetDate = State.selectedDate || getTodayStr(), isSup = !!State.selectedDate;
  const dl = isSup ? formatDate(targetDate) : '';
  function btn(pv) {
    const p = getPersonInfo(pv), isWife = pv === 'wife';
    const done = !isSup && State.records.some(r => r.person === pv && r.date === targetDate);
    return `<button class="ck-btn ${isWife ? 'wife' : 'husb'}" onclick="handleCheckin('${pv}')">
      <span class="ck-icon">${p.icon}</span>
      <span class="ck-label">${isSup ? `补 ${dl}` : `${p.name}<span class="ck-plus">+1</span>`}</span>
      <span class="ck-status">${!isSup && done ? '✓ 今日已打卡' : ''}</span>
    </button>`;
  }
  document.getElementById('s-btns').innerHTML = btn('wife') + btn('husband');
}

function renderList() {
  const { year, month } = State, prefix = `${year}-${String(month+1).padStart(2,'0')}`;
  const mNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const rows = getFiltered().filter(r => r.date.startsWith(prefix)).sort((a,b) => b.date.localeCompare(a.date) || b.timestamp - a.timestamp);
  const body = rows.length === 0
    ? `<div class="rec-empty">${year}年${mNames[month]}暂无记录</div>`
    : rows.map(r => {
        const p = getPersonInfo(r.person), isWife = r.person === 'wife';
        return `<div class="rec-item">
          <div class="rec-left">
            <span class="rec-date">${formatDate(r.date)}</span>
            <span class="rec-badge ${isWife ? 'badge-w' : 'badge-h'}">${p.icon}</span>
            <span class="rec-name">${p.name}</span>
            <span class="rec-time">${formatTime(r.timestamp)}</span>
          </div>
          <button class="rec-del" onclick="handleDel('${r.id}')">🗑</button>
        </div>`;
      }).join('');
  document.getElementById('s-list').innerHTML = `
    <div class="sec-hd">${year}年${mNames[month]}打卡记录</div>
    <div class="rec-list">${body}</div>
  `;
}

async function handleDel(id) {
  const rec = State.records.find(r => r.id === id); if (!rec) return;
  const p = getPersonInfo(rec.person);
  showConfirm(`确认撤销 ${formatDate(rec.date)} ${p.icon}${p.name} 的打卡？`, async () => {
    const next = State.records.filter(r => r.id !== id);
    State.records = next; renderAll();
    try { await Storage.save(next); }
    catch (e) { State.records = [...State.records, rec]; renderAll(); alert(`删除失败：${e.message}`); }
  });
}

function renderSetup() {
  document.getElementById('app').innerHTML = `
    <div class="card" style="margin-top:40px">
      <div class="app-label" style="font-size:18px;color:var(--text);margin-bottom:20px">💪 GymRecord 初始化</div>
      <p style="font-size:14px;color:var(--text2);line-height:1.6;margin-bottom:24px">首次使用需要配置 GitHub Gist 信息，配置后保存在本机，无需再次输入。</p>
      <div style="display:flex;flex-direction:column;gap:16px">
        <div>
          <label class="setup-label">Gist ID</label>
          <input id="si-gist" class="setup-input" type="text" placeholder="粘贴 Gist ID">
        </div>
        <div>
          <label class="setup-label">GitHub Token（仅 gist 权限）</label>
          <input id="si-token" class="setup-input" type="password" placeholder="ghp_xxxxxx">
        </div>
        <button class="setup-btn" onclick="handleSetup()">保存并开始</button>
      </div>
    </div>
  `;
}

function handleSetup() {
  const gistId = document.getElementById('si-gist').value.trim();
  const token = document.getElementById('si-token').value.trim();
  if (!gistId || !token) { alert('请填写完整信息'); return; }
  localStorage.setItem('gym_gist_id', gistId);
  localStorage.setItem('gym_token', token);
  CONFIG.GIST_ID = gistId; CONFIG.TOKEN = token; init();
}

async function init() {
  if (!CONFIG.GIST_ID || !CONFIG.TOKEN) { renderSetup(); return; }
  State.loading = true; State.error = null; renderAll();
  try { State.records = await Storage.load(); }
  catch (e) { State.error = e.message; }
  State.loading = false; renderAll();
}

// ── Measurements data layer ──────────────────────────────────────────────────

const DIMS = [
  { key: 'waist', label: '腰围' },
  { key: 'hip',   label: '臀围' },
  { key: 'thigh', label: '大腿' },
  { key: 'arm',   label: '臂围' },
];

const MeasureStorage = {
  load() {
    try { return JSON.parse(localStorage.getItem('gym_measurements') || '[]'); }
    catch { return []; }
  },
  save(records) {
    localStorage.setItem('gym_measurements', JSON.stringify(records));
  },
};

const MeasureState = {
  records: [],
  dim: 'waist',
  winOffset: 0,
};

function validateMeasure(raw) {
  if (raw === '' || raw === null || raw === undefined) return null;
  const n = parseFloat(raw);
  if (isNaN(n) || n < 20 || n > 200) return false;
  return Math.round(n * 10) / 10;
}

// ── Measurements page rendering ──────────────────────────────────────────────

function renderMeasurePage() {
  const el = document.getElementById('measure-app');
  el.innerHTML = `
    <div id="m-header" class="card"></div>
    <div id="m-summary" class="card"></div>
    <div id="m-chart"  class="card"></div>
    <button class="pri-btn" onclick="openMeasureSheet()">📝 记录今日数据</button>
    <div id="m-history" class="card"></div>
  `;
  renderMeasureHeader();
  renderMeasureSummary();
  renderMeasureChart();
  renderMeasureHistory();
}

function renderMeasureHeader() {
  const last = [...MeasureState.records].sort((a, b) => b.date.localeCompare(a.date))[0];
  const sub = last ? (() => { const [,m,d] = last.date.split('-'); return `最近记录：${+m}月${+d}日`; })() : '暂无记录';
  document.getElementById('m-header').innerHTML = `
    <div class="app-label">📏 个人维度</div>
    <div style="text-align:center;font-size:13px;color:var(--text2);margin-top:-8px">${sub}</div>
  `;
}

function renderMeasureSummary() {
  const last = [...MeasureState.records].sort((a, b) => b.date.localeCompare(a.date))[0];
  const val = key => (last && last[key] != null) ? `${last[key]}` : '—';
  document.getElementById('m-summary').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${DIMS.map(d => `
        <div style="background:var(--fill);border-radius:var(--r);padding:10px 14px">
          <div style="font-size:11px;color:var(--text2);font-weight:600;margin-bottom:4px">${d.label}</div>
          <div style="font-size:20px;font-weight:700;color:${val(d.key) === '—' ? 'var(--text3)' : 'var(--primary)'}">
            ${val(d.key)}<span style="font-size:11px;font-weight:500;color:var(--text2)">${val(d.key) !== '—' ? ' cm' : ''}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ── Measure Sheet ─────────────────────────────────────────────────────────────

function openMeasureSheet() {
  const last = [...MeasureState.records].sort((a, b) => b.date.localeCompare(a.date))[0];
  const def = key => (last && last[key] != null) ? last[key] : '';

  document.getElementById('measure-form').innerHTML = DIMS.map(d => `
    <div class="sheet-row">
      <span class="sheet-lbl">${d.label}</span>
      <input id="mi-${d.key}" class="sheet-input"
        type="number" inputmode="decimal" min="20" max="200"
        placeholder="—" value="${def(d.key)}">
      <span class="sheet-unit">cm</span>
    </div>
  `).join('');

  document.getElementById('measure-modal').classList.add('show');
}

function closeMeasureSheet() {
  document.getElementById('measure-modal').classList.remove('show');
}

function saveMeasurement() {
  const vals = {};
  let hasAny = false;
  for (const d of DIMS) {
    const raw = document.getElementById(`mi-${d.key}`).value.trim();
    const v = validateMeasure(raw);
    if (v === false) {
      alert(`${d.label} 数值无效，请输入 20–200 之间的数字`);
      return;
    }
    vals[d.key] = v;
    if (v !== null) hasAny = true;
  }
  if (!hasAny) { alert('请至少填写一项数据'); return; }

  const today = getTodayStr();
  const rec = {
    id: generateId(),
    date: today,
    timestamp: Date.now(),
    waist: vals.waist,
    hip:   vals.hip,
    thigh: vals.thigh,
    arm:   vals.arm,
  };

  MeasureState.records = MeasureState.records.filter(r => r.date !== today).concat(rec);
  MeasureStorage.save(MeasureState.records);
  closeMeasureSheet();
  renderMeasurePage();
}

// ── Measure Chart ─────────────────────────────────────────────────────────────

const WIN_SIZE = 12;

function buildChartSVG(pts, dim) {
  const W = 240, H = 100;
  const PAD = { top: 20, right: 12, bottom: 22, left: 24 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const vals = pts.map(p => p[dim]);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const rng  = maxV - minV || 2;
  const yMin = minV - rng * 0.15;
  const yMax = maxV + rng * 0.15;

  const toX = i => PAD.left + (pts.length === 1 ? cW / 2 : (i / (pts.length - 1)) * cW);
  const toY = v  => PAD.top  + (1 - (v - yMin) / (yMax - yMin)) * cH;

  const coords = pts.map((p, i) => ({ x: toX(i), y: toY(p[dim]), v: p[dim], date: p.date }));

  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const botY  = (PAD.top + cH).toFixed(1);
  const areaD = pts.length >= 2
    ? `${pathD} L${coords[coords.length-1].x.toFixed(1)},${botY} L${coords[0].x.toFixed(1)},${botY} Z`
    : '';

  const showIdxs = pts.length <= 6
    ? pts.map((_, i) => i)
    : [0, Math.floor((pts.length - 1) / 2), pts.length - 1];
  const xLabels = showIdxs.map(i => {
    const [, m, d] = coords[i].date.split('-');
    return `<text x="${coords[i].x.toFixed(1)}" y="${H - 3}" text-anchor="middle" font-size="8" fill="rgba(60,60,67,0.4)">${m}/${d}</text>`;
  }).join('');

  const yLabels = `
    <text x="${PAD.left - 3}" y="${(PAD.top + cH + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="rgba(60,60,67,0.4)">${Math.round(yMin)}</text>
    <text x="${PAD.left - 3}" y="${(PAD.top + 3).toFixed(1)}"       text-anchor="end" font-size="8" fill="rgba(60,60,67,0.4)">${Math.round(yMax)}</text>
  `;

  const dots = coords.map((c, i) => {
    const isLast = i === coords.length - 1;
    return isLast
      ? `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="5" fill="#fff" stroke="var(--primary)" stroke-width="2.5"/>
         <text x="${c.x.toFixed(1)}" y="${(c.y - 9).toFixed(1)}" text-anchor="middle" font-size="9" fill="var(--primary)" font-weight="700">${c.v}cm</text>`
      : `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" fill="var(--primary)"/>`;
  }).join('');

  const gridY = (PAD.top + cH / 2).toFixed(1);

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">
    <defs>
      <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="var(--primary)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <line x1="${PAD.left}" y1="${gridY}" x2="${W - PAD.right}" y2="${gridY}" stroke="rgba(60,60,67,0.06)" stroke-width="1"/>
    ${areaD ? `<path d="${areaD}" fill="url(#cg)"/>` : ''}
    ${pts.length >= 2 ? `<path d="${pathD}" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
    ${dots}
    ${xLabels}
    ${yLabels}
  </svg>`;
}

function renderMeasureChart() {
  const { dim, winOffset } = MeasureState;

  const allPts = MeasureState.records
    .filter(r => r[dim] != null)
    .sort((a, b) => a.date.localeCompare(b.date));

  const endIdx   = allPts.length - winOffset * WIN_SIZE;
  const startIdx = Math.max(0, endIdx - WIN_SIZE);
  const pts      = allPts.slice(startIdx, endIdx);
  const canOlder = startIdx > 0;
  const canNewer = winOffset > 0;

  const seg = DIMS.map(d =>
    `<button class="seg-btn ${d.key === dim ? 'active' : ''}" onclick="handleMeasureDim('${d.key}')">${d.label}</button>`
  ).join('');

  const chartInner = pts.length === 0
    ? `<div class="chart-empty">暂无记录，添加第一条后查看趋势</div>`
    : buildChartSVG(pts, dim);

  document.getElementById('m-chart').innerHTML = `
    <div class="chart-nav">
      <button class="cal-arrow" onclick="handleMeasureWin(1)"
        ${!canOlder ? 'disabled style="opacity:0.3;cursor:default"' : ''}>‹</button>
      <div class="chart-nav-inner">${chartInner}</div>
      <button class="cal-arrow" onclick="handleMeasureWin(-1)"
        ${!canNewer ? 'disabled style="opacity:0.3;cursor:default"' : ''}>›</button>
    </div>
    <div class="seg" style="margin-top:10px">${seg}</div>
  `;
}

function handleMeasureDim(dim) {
  MeasureState.dim = dim;
  MeasureState.winOffset = 0;
  renderMeasureChart();
}

function handleMeasureWin(delta) {
  const allPts = MeasureState.records
    .filter(r => r[MeasureState.dim] != null);
  const maxOffset = Math.max(0, Math.floor((allPts.length - 1) / WIN_SIZE));
  MeasureState.winOffset = Math.max(0, Math.min(MeasureState.winOffset + delta, maxOffset));
  renderMeasureChart();
}

// ── Measure History ───────────────────────────────────────────────────────────

function renderMeasureHistory() {
  const rows = [...MeasureState.records]
    .sort((a, b) => b.date.localeCompare(a.date));

  const body = rows.length === 0
    ? '<div class="rec-empty">暂无测量记录</div>'
    : rows.map(r => {
        const [, m, d] = r.date.split('-');
        const vals = DIMS
          .filter(dim => r[dim.key] != null)
          .map(dim => `<span class="mh-val">${dim.label} <b>${r[dim.key]}</b></span>`)
          .join('');
        return `<div class="rec-item">
          <div class="rec-left" style="flex-wrap:wrap;gap:6px">
            <span class="rec-date">${m}/${d}</span>
            <span class="mh-vals">${vals}</span>
          </div>
          <button class="rec-del" onclick="handleMeasureDel('${r.id}')">🗑</button>
        </div>`;
      }).join('');

  document.getElementById('m-history').innerHTML = `
    <div class="sec-hd">历史记录</div>
    <div class="rec-list" style="max-height:50vh;overflow-y:scroll">${body}</div>
  `;
}

function handleMeasureDel(id) {
  const rec = MeasureState.records.find(r => r.id === id);
  if (!rec) return;
  const [, m, d] = rec.date.split('-');
  showConfirm(`确认删除 ${m}/${d} 的测量记录？`, () => {
    MeasureState.records = MeasureState.records.filter(r => r.id !== id);
    MeasureStorage.save(MeasureState.records);
    renderMeasurePage();
  });
}

// ── Init ─────────────────────────────────────────────────────────────────────

function initMeasure() {
  MeasureState.records = MeasureStorage.load();
  renderMeasurePage();

  document.getElementById('measure-save').onclick = saveMeasurement;
  document.getElementById('measure-cancel').onclick = closeMeasureSheet;
  document.getElementById('measure-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('measure-modal')) closeMeasureSheet();
  });
}

init();
initMeasure();
