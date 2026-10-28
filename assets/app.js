import { FEATURES } from './features.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const analysisParam = new URLSearchParams(location.search).get('analysis');

function initialAnalysisVisible() {
  if (!FEATURES.analysisBeta) return false;
  if (analysisParam === 'off' || analysisParam === '0') return false;
  if (analysisParam === 'on' || analysisParam === '1') return true;
  try {
    const stored = localStorage.getItem('limitup.analysisVisible');
    if (stored === '0') return false;
    if (stored === '1') return true;
  } catch {
    // localStorage is unavailable in some privacy modes.
  }
  return true;
}

const state = {
  meta: null,
  index: null,
  day: null,
  promotion: null,
  selectedStage: null,
  query: '',
  sort: 'lianban',
  analysisVisible: initialAnalysisVisible(),
  analysisForcedOff: analysisParam === 'off' || analysisParam === '0'
};

const els = {
  dateSelect: $('#date-select'),
  updated: $('#updated'),
  refresh: $('#refresh'),
  total: $('#stat-total'),
  delta: $('#stat-delta'),
  promotion: $('#stat-promotion'),
  promotionFoot: $('#stat-promotion-foot'),
  promotionUnit: $('#stat-promotion-unit'),
  strongest: $('#stat-strongest'),
  strongestFoot: $('#stat-strongest-foot'),
  center: $('#stat-center'),
  centerLabel: $('#stat-center-label'),
  centerMarker: $('#center-marker'),
  triangle: $('#triangle'),
  triangleMobile: $('#triangle-mobile'),
  triangleWrap: $('#triangle-wrap'),
  tooltip: $('#tooltip'),
  unclassifiedNote: $('#unclassified-note'),
  boards: $('#boards'),
  maxBoard: $('#max-board'),
  ranking: $('#stage-ranking'),
  trend: $('#trend'),
  trendWrap: $('#trend-wrap'),
  trendTooltip: $('#trend-tooltip'),
  trendLegend: $('#trend-legend'),
  trendSub: $('#trend-sub'),
  stageFilter: $('#stage-filter'),
  stockBody: $('#stock-body'),
  tableSub: $('#table-sub'),
  tableEmpty: $('#table-empty'),
  search: $('#search'),
  sort: $('#sort'),
  analysisPanel: $('#analysis-panel'),
  analysisBody: $('#analysis-body'),
  analysisEmpty: $('#analysis-empty'),
  analysisSub: $('#analysis-sub'),
  analysisToggle: $('#analysis-toggle'),
  universe: $('#universe'),
  errorBanner: $('#error-banner'),
  errorMessage: $('#error-message'),
  errorRetry: $('#error-retry')
};

let searchTimer;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fmtInt(value) {
  return Number(value || 0).toLocaleString('zh-CN');
}

function fmtPct(value, digits = 1) {
  return `${(Number(value || 0) * 100).toFixed(digits)}%`;
}

function fmtSigned(value) {
  return value > 0 ? `+${value}` : String(value);
}

function fmtMoney(value) {
  const n = Number(value || 0);
  if (!n) return '—';
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(0)}万`;
  return `${Math.round(n)}`;
}

function fmtDate(date) {
  const [, m, d] = String(date).split('-');
  return `${m}月${d}日`;
}

function fmtStamp(iso) {
  if (!iso) return '—';
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date(iso));
  const get = type => parts.find(p => p.type === type)?.value || '';
  return `${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

function stageMeta(key) {
  return state.meta?.stages.find(s => s.key === key) || null;
}

function stageColor(key) {
  return stageMeta(key)?.color || '#9A9082';
}

function shortGroup(group) {
  return String(group || '').replace('资本品', '').replace('生产与流通', '');
}

function analysisTags(reason) {
  return [...new Set(
    String(reason || '')
      .split(/[+＋、,，;；]/)
      .map(part => part.trim())
      .filter(Boolean)
  )].slice(0, 4);
}

function filteredStocks() {
  const q = state.query.trim().toLowerCase();
  return state.day.stocks.filter(s => {
    if (state.selectedStage === '未分类') {
      if (s.stage !== '未分类') return false;
    } else if (state.selectedStage && s.stage !== state.selectedStage) {
      return false;
    }
    if (!q) return true;
    return s.code.includes(q) || String(s.name).toLowerCase().includes(q);
  });
}

function previousDay(date) {
  const days = state.index?.days || [];
  const idx = days.findIndex(d => d.date === date);
  return idx > 0 ? days[idx - 1] : null;
}

async function loadJson(path) {
  const res = await fetch(`${path}?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`无法加载 ${path}（${res.status}）`);
  return res.json();
}

function showError(message) {
  els.errorMessage.textContent = message;
  els.errorBanner.hidden = false;
}

function hideError() {
  els.errorBanner.hidden = true;
}

function hideTooltip(el) {
  el.hidden = true;
}

function positionTooltip(el, html, clientX, clientY, container) {
  const rect = container.getBoundingClientRect();
  const x = Math.min(Math.max(clientX - rect.left, 92), Math.max(92, rect.width - 92));
  const y = Math.max(clientY - rect.top, 74);
  el.innerHTML = html;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.hidden = false;
}

function populateDates() {
  const days = [...(state.index?.days || [])].reverse();
  if (!days.length) {
    els.dateSelect.innerHTML = '<option>暂无数据</option>';
    els.dateSelect.disabled = true;
    return;
  }
  els.dateSelect.disabled = false;
  els.dateSelect.innerHTML = days
    .map(d => `<option value="${d.date}">${d.date} · ${fmtInt(d.total)}只</option>`)
    .join('');
  if (state.day) els.dateSelect.value = state.day.date;
}

async function selectDate(date, { updateHash = true } = {}) {
  hideTooltip(els.tooltip);
  hideTooltip(els.trendTooltip);
  try {
    const day = await loadJson(`data/${date}.json`);
    state.day = day;
    state.selectedStage = null;
    if (els.dateSelect.value !== date) els.dateSelect.value = date;
    if (updateHash) {
      const nextUrl = new URL(location.href);
      nextUrl.hash = date;
      history.replaceState(null, '', nextUrl);
    }
    renderAll();
    hideError();
  } catch (err) {
    if (state.day) els.dateSelect.value = state.day.date;
    showError(`加载 ${date} 失败：${err.message}`);
  }
}

function renderAll() {
  if (!state.day || !state.meta) return;
  renderStats();
  renderTriangle();
  renderTriangleMobile();
  renderBoards();
  renderStageRanking();
  renderStageFilter();
  renderStocks();
  renderAnalysis();
  renderTrend();

  els.updated.textContent = `采集于 ${fmtStamp(state.day.capturedAt)} · 共 ${state.index.days.length} 个交易日`;
  els.universe.textContent = state.day.universe || state.meta.universe;
  els.unclassifiedNote.textContent = state.day.unclassified
    ? `另有 ${state.day.unclassified} 只未分类，未计入三角`
    : '7 个环节全部有分类';
}

function renderStats() {
  const d = state.day;
  const prev = previousDay(d.date);

  els.total.textContent = fmtInt(d.total);
  if (!prev) {
    els.delta.textContent = '从今天开始记录';
  } else {
    const diff = d.total - prev.total;
    els.delta.innerHTML = diff === 0
      ? `较 ${fmtDate(prev.date)} 持平`
      : `较 ${fmtDate(prev.date)} <span class="${diff > 0 ? 'up' : 'down'}">${fmtSigned(diff)}</span> 只`;
  }

  const promotion = state.promotion?.days?.[d.date];
  const promotionRate = promotion?.rate;
  els.promotion.textContent = promotionRate == null ? '—' : (promotionRate * 100).toFixed(1);
  els.promotionUnit.hidden = promotionRate == null;
  els.promotionFoot.textContent = promotionRate == null
    ? (promotion ? '样本观察中（需≥2日）' : '暂无 7 日样本')
    : `样本 ${fmtInt(promotion.sample)} 只 · 命中 ${fmtInt(promotion.hits)}/${fmtInt(promotion.observed)} 天`;

  const strongest = stageMeta(d.strongestStage);
  const strongestStat = d.stages.find(s => s.key === d.strongestStage);
  els.strongest.textContent = strongest ? d.strongestStage : '—';
  els.strongest.style.color = strongest ? strongest.color : '';
  els.strongestFoot.textContent = strongestStat && d.total
    ? `${fmtInt(strongestStat.count)} 只 · ${fmtPct(strongestStat.share)}`
    : d.total ? '暂无可分类涨停' : '今日无涨停';

  els.center.textContent = d.center == null ? '—' : d.center.toFixed(2);
  els.centerLabel.textContent = d.center == null
    ? '暂无可计算样本'
    : `${d.centerLabel} · 1 上游 / 7 下游`;
  const pos = d.center == null ? 50 : Math.min(98, Math.max(2, ((d.center - 1) / 6) * 100));
  els.centerMarker.style.left = `${pos}%`;
}

function renderTriangle() {
  const d = state.day;
  const stages = state.meta.stages;
  const counts = stages.map(s => d.stages.find(x => x.key === s.key)?.count || 0);
  const shares = stages.map(s => d.stages.find(x => x.key === s.key)?.share || 0);
  const maxCount = Math.max(1, ...counts);

  const W = 760;
  const H = 560;
  const rowH = 52;
  const gap = 12;
  const top = 42;
  const plotLeft = 170;
  const plotRight = 590;
  const centerX = (plotLeft + plotRight) / 2;
  const maxBar = 356;
  const baseY = top + stages.length * (rowH + gap) - gap;

  const groups = [];
  stages.forEach((s, i) => {
    const last = groups.at(-1);
    if (last && last.group === s.group) last.end = i;
    else groups.push({ group: s.group, start: i, end: i });
  });

  const guide = `<path class="tri-guide" d="M ${centerX} ${top - 24} L ${centerX - 378} ${baseY + 6} L ${centerX + 378} ${baseY + 6} Z"></path>`;

  const groupLines = groups.map(g => {
    const y1 = top + g.start * (rowH + gap) + 6;
    const y2 = top + g.end * (rowH + gap) + rowH - 6;
    const mid = (y1 + y2) / 2;
    return `<line class="tri-group-line" x1="18" y1="${y1}" x2="18" y2="${y2}"></line>
      <text class="tri-group-label" x="10" y="${mid}" text-anchor="middle" transform="rotate(-90 10 ${mid})">${shortGroup(g.group)}</text>`;
  }).join('');

  const rows = stages.map((s, i) => {
    const y = top + i * (rowH + gap);
    const count = counts[i];
    const share = shares[i];
    const width = count ? Math.max(10, (count / maxCount) * maxBar) : 3;
    const x = centerX - width / 2;
    const opacity = count ? 0.55 + 0.45 * (count / maxCount) : 0.2;
    const prev = previousDay(d.date);
    const prevCount = prev?.stages?.[s.key];
    const delta = prev && prevCount != null ? count - prevCount : null;
    const deltaText = delta == null ? '' : `较上一交易日 ${fmtSigned(delta)} 只`;
    const label = `${s.key}：${count} 只，占比 ${fmtPct(share)}`;
    return `<g class="tri-row" data-stage="${s.key}" tabindex="0" role="button" aria-pressed="false" aria-label="${label}">
      <rect class="tri-hit" x="0" y="${y - 4}" width="${W}" height="${rowH + 8}" fill="transparent"></rect>
      <text class="tri-stage-label" x="152" y="${y + rowH / 2 - 2}" text-anchor="end">${s.key}</text>
      <text class="tri-stage-sub" x="152" y="${y + rowH / 2 + 13}" text-anchor="end">${s.note || s.group}</text>
      <rect class="tri-bar" x="${x.toFixed(1)}" y="${y}" width="${width.toFixed(1)}" height="${rowH}" rx="10" fill="${s.color}" opacity="${opacity.toFixed(2)}"></rect>
      <text class="tri-count" x="612" y="${y + rowH / 2 + 2}" text-anchor="start">${count}<tspan class="tri-unit" dx="2">只</tspan></text>
      <text class="tri-share" x="612" y="${y + rowH / 2 + 17}" text-anchor="start">${fmtPct(share)}</text>
      <title>${label}${deltaText ? `，${deltaText}` : ''}</title>
    </g>`;
  }).join('');

  els.triangle.innerHTML = `${guide}${groupLines}${rows}`;

  $$('.tri-row', els.triangle).forEach(row => {
    const selected = row.dataset.stage === state.selectedStage;
    row.classList.toggle('selected', selected);
    row.classList.toggle('dimmed', Boolean(state.selectedStage) && !selected);
    row.setAttribute('aria-pressed', String(selected));
  });
}

function renderTriangleMobile() {
  const d = state.day;
  const stages = state.meta.stages;
  const counts = stages.map(s => d.stages.find(x => x.key === s.key)?.count || 0);
  const shares = stages.map(s => d.stages.find(x => x.key === s.key)?.share || 0);
  const maxCount = Math.max(1, ...counts);

  els.triangleMobile.innerHTML = stages.map((s, i) => {
    const selected = state.selectedStage === s.key;
    return `<button class="m-row ${selected ? 'selected' : ''}" type="button" data-stage="${s.key}" aria-pressed="${selected}">
      <span class="m-stage">
        <span class="m-dot" style="background:${s.color}"></span>
        <span>${s.key}<small>${s.note || s.group}</small></span>
      </span>
      <span class="m-track"><i style="width:${((counts[i] / maxCount) * 100).toFixed(1)}%;background:${s.color}"></i></span>
      <span class="m-count">${fmtInt(counts[i])}<small>${fmtPct(shares[i])}</small></span>
    </button>`;
  }).join('');
}

function renderBoards() {
  const b = state.day.boards;
  const total = b.first + b.second + b.thirdPlus;
  const items = [
    { key: 'first', label: '首板', count: b.first, color: '#CFC2AE' },
    { key: 'second', label: '2板', count: b.second, color: '#D98A5F' },
    { key: 'thirdPlus', label: '3板+', count: b.thirdPlus, color: '#B23A2B' }
  ];
  els.maxBoard.textContent = `最高 ${b.max} 板`;
  els.boards.innerHTML = `
    <div class="board-bar">
      ${items.map(item => `<span style="width:${total ? (item.count / total) * 100 : 0}%;background:${item.color}"></span>`).join('')}
    </div>
    <div class="board-legend">
      ${items.map(item => `<div class="board-item">
        <div class="bl"><i style="background:${item.color}"></i>${item.label}</div>
        <strong>${fmtInt(item.count)}</strong>
        <small>${total ? fmtPct(item.count / total) : '0%'}</small>
      </div>`).join('')}
    </div>`;
}

function renderStageRanking() {
  const d = state.day;
  const prev = previousDay(d.date);
  const stages = state.meta.stages;
  const maxCount = Math.max(1, ...stages.map(s => d.stages.find(x => x.key === s.key)?.count || 0));

  els.ranking.innerHTML = stages.map(s => {
    const stat = d.stages.find(x => x.key === s.key) || { count: 0, share: 0 };
    const prevCount = prev?.stages?.[s.key];
    const delta = prev && prevCount != null ? stat.count - prevCount : null;
    const deltaClass = delta > 0 ? 'up' : delta < 0 ? 'down' : '';
    const deltaText = delta == null ? '' : delta === 0 ? '持平' : fmtSigned(delta);
    const selected = state.selectedStage === s.key;
    return `<button class="rank-row ${selected ? 'selected' : ''}" type="button" data-stage="${s.key}" aria-pressed="${selected}" title="${s.note ? `${s.key}：${s.note}` : s.key}">
      <span class="rank-dot" style="background:${s.color}"></span>
      <span class="rank-main">
        <span class="rank-name">${s.key}${deltaText ? `<span class="delta ${deltaClass}">${deltaText}</span>` : ''}</span>
        <span class="rank-bar"><i style="width:${(stat.count / maxCount) * 100}%;background:${s.color}"></i></span>
      </span>
      <span class="rank-num">${fmtInt(stat.count)}<small>${fmtPct(stat.share)}</small></span>
    </button>`;
  }).join('');
}

function renderStageFilter() {
  const d = state.day;
  const selected = state.selectedStage;
  const all = `<button class="chip ${!selected ? 'active' : ''}" type="button" data-stage="" aria-pressed="${!selected}">全部 <span class="chip-count">${fmtInt(d.total)}</span></button>`;
  const stages = state.meta.stages.map(s => {
    const count = d.stages.find(x => x.key === s.key)?.count || 0;
    return `<button class="chip ${selected === s.key ? 'active' : ''}" type="button" data-stage="${s.key}" aria-pressed="${selected === s.key}" title="${s.note ? `${s.key}：${s.note}` : s.key}">
      <i style="background:${s.color}"></i>${s.key} <span class="chip-count">${fmtInt(count)}</span>
    </button>`;
  }).join('');
  const unclassified = d.unclassified
    ? `<button class="chip ${selected === '未分类' ? 'active' : ''}" type="button" data-stage="未分类" aria-pressed="${selected === '未分类'}">
        <i style="background:#9A9082"></i>未分类 <span class="chip-count">${fmtInt(d.unclassified)}</span>
      </button>`
    : '';
  els.stageFilter.innerHTML = all + stages + unclassified;
}

function renderStocks() {
  const d = state.day;
  let rows = filteredStocks();

  const sorters = {
    lianban: (a, b) => b.lianban - a.lianban || b.sealFund - a.sealFund,
    sealFund: (a, b) => b.sealFund - a.sealFund || b.lianban - a.lianban,
    changePct: (a, b) => b.changePct - a.changePct || b.lianban - a.lianban
  };
  rows = rows.slice().sort(sorters[state.sort] || sorters.lianban);

  const scope = state.selectedStage === '未分类'
    ? '未分类'
    : state.selectedStage || '全市场';
  const searchText = state.query.trim() ? ` · 搜索“${state.query.trim()}”` : '';
  els.tableSub.textContent = `${scope} · 显示 ${fmtInt(rows.length)} / ${fmtInt(d.total)} 只${searchText}`;

  els.stockBody.innerHTML = rows.map(s => {
    const color = stageColor(s.stage);
    const badgeClass = s.lianban >= 3 ? 'b3' : s.lianban === 2 ? 'b2' : 'b1';
    const change = Number(s.changePct || 0);
    return `<tr>
      <td class="code">${escapeHtml(s.code)}</td>
      <td class="stock-name">${escapeHtml(s.name)}</td>
      <td><span class="stage-chip"><i style="background:${color}"></i>${escapeHtml(s.stage)}</span></td>
      <td><span class="board-badge ${badgeClass}">${escapeHtml(s.boardLabel)}</span></td>
      <td class="change-up">${change > 0 ? '+' : ''}${change.toFixed(2)}%</td>
      <td class="num">${fmtMoney(s.sealFund)}</td>
      <td class="muted-cell">${escapeHtml(s.firstSeal || '—')}</td>
      <td class="muted-cell">${escapeHtml(s.industry || '—')}</td>
    </tr>`;
  }).join('');

  els.tableEmpty.hidden = rows.length !== 0;
}

function renderAnalysis() {
  if (!FEATURES.analysisBeta || state.analysisForcedOff) {
    els.analysisPanel.hidden = true;
    return;
  }

  els.analysisPanel.hidden = false;
  els.analysisToggle.textContent = state.analysisVisible ? '隐藏' : '开启';
  els.analysisToggle.setAttribute('aria-pressed', String(state.analysisVisible));
  els.analysisBody.hidden = !state.analysisVisible;
  els.analysisEmpty.hidden = true;

  if (!state.analysisVisible) {
    els.analysisSub.textContent = '测试功能已隐藏 · 点击右侧按钮开启';
    els.analysisBody.innerHTML = '';
    return;
  }

  const d = state.day;
  const rows = filteredStocks()
    .slice()
    .sort((a, b) => b.lianban - a.lianban || b.sealFund - a.sealFund);
  const scope = state.selectedStage === '未分类'
    ? '未分类'
    : state.selectedStage || '全部';
  const searchText = state.query.trim() ? ` · 搜索“${state.query.trim()}”` : '';
  els.analysisSub.textContent = `${scope} · ${rows.length} 只 · 按连板排序${searchText}`;

  if (!rows.length) {
    els.analysisBody.innerHTML = '';
    els.analysisEmpty.hidden = false;
    els.analysisEmpty.textContent = '当前筛选下没有涨停股';
    return;
  }

  if (!rows.some(s => s.reason || s.mainBusiness)) {
    els.analysisBody.innerHTML = '';
    els.analysisEmpty.hidden = false;
    els.analysisEmpty.textContent = '当日原因/主营数据暂缺，主看板不受影响';
    return;
  }

  els.analysisBody.innerHTML = rows.map(s => {
    const tags = analysisTags(s.reason);
    const badgeClass = s.lianban >= 3 ? 'b3' : s.lianban === 2 ? 'b2' : 'b1';
    const color = stageColor(s.stage);
    const reasonHtml = tags.length
      ? tags.map(tag => `<span class="reason-chip">${escapeHtml(tag)}</span>`).join('')
      : '<span class="reason-chip empty">暂无原因标签</span>';
    const business = s.mainBusiness || '';
    const promotional = state.promotion?.days?.[d.date]?.stocks?.[s.code];
    const promoHtml = promotional
      ? promotional.observed >= 2
        ? `<span class="promo-chip" title="7日窗口：命中 ${promotional.hits} / 观察 ${promotional.observed} 天">7日晋级 ${(promotional.rate * 100).toFixed(0)}%</span>`
        : '<span class="promo-chip muted">首次涨停 · 观察中</span>'
      : '';
    const summary = [
      `属${s.stage}环节`,
      s.lianban >= 2 ? `${s.lianban}连板` : '首板',
      tags.length ? `原因标签集中在${tags.slice(0, 3).join('、')}` : '暂无明确原因标签'
    ];
    return `<article class="analysis-card" data-stage="${escapeHtml(s.stage)}">
      <div class="analysis-card-head">
        <div class="analysis-card-title">
          <span class="code">${escapeHtml(s.code)}</span>
          <span class="stock-name">${escapeHtml(s.name)}</span>
        </div>
        <span class="board-badge ${badgeClass}">${escapeHtml(s.boardLabel)}</span>
      </div>
      <div class="analysis-meta">
        <span class="stage-chip"><i style="background:${color}"></i>${escapeHtml(s.stage)}</span>
        <span>首封 ${escapeHtml(s.firstSeal || '—')}</span>
        <span>封单 ${fmtMoney(s.sealFund)}</span>
        ${s.daysBoard ? `<span>${escapeHtml(s.daysBoard)}</span>` : ''}
        ${promoHtml}
      </div>
      <div class="analysis-reason">
        <span class="analysis-label">原因</span>${reasonHtml}
      </div>
      <div class="analysis-business">
        <span class="analysis-label">主营</span>
        <p title="${escapeHtml(business)}">${escapeHtml(business || '暂无主营数据')}</p>
      </div>
      <p class="analysis-summary">简析：${summary.join('；')}。</p>
    </article>`;
  }).join('');
}

function renderTrend() {
  const days = state.index?.days || [];
  const stages = state.meta.stages;
  els.trendLegend.innerHTML = stages
    .map(s => `<span><i style="background:${s.color}"></i>${s.key}</span>`)
    .join('');

  if (!days.length) {
    els.trend.innerHTML = '<text class="trend-empty" x="500" y="150">暂无历史数据</text>';
    els.trendSub.textContent = '历史从今天开始积累';
    return;
  }

  const shown = days.slice(-30);
  els.trendSub.textContent = days.length <= 1
    ? '历史从今天开始积累，明天起这里会出现变化'
    : `最近 ${shown.length} 个有数据交易日`;

  const narrow = window.matchMedia('(max-width: 720px)').matches;
  const W = narrow ? 440 : 1000;
  const H = narrow ? 250 : 300;
  els.trend.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const left = narrow ? 30 : 44;
  const right = narrow ? 10 : 18;
  const top = narrow ? 16 : 20;
  const bottom = narrow ? 28 : 34;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const n = shown.length;
  const band = plotW / n;
  const barW = Math.min(narrow ? 22 : 40, Math.max(5, band * 0.55));
  const maxTotal = Math.max(1, ...shown.map(d => d.total || 0));
  const step = Math.max(5, Math.ceil(maxTotal / 4 / 5) * 5);
  const yMax = step * 4;

  const grid = Array.from({ length: 5 }, (_, i) => {
    const value = step * i;
    const y = top + plotH - (value / yMax) * plotH;
    return `<line class="trend-grid" x1="${left}" y1="${y}" x2="${W - right}" y2="${y}"></line>
      <text class="trend-axis-label" x="${left - 8}" y="${y + 3}" text-anchor="end">${value}</text>`;
  }).join('');

  const labelEvery = Math.max(1, Math.ceil(n / (narrow ? 4 : 8)));
  const labels = shown.map((d, i) => {
    if (i % labelEvery !== 0 && i !== n - 1) return '';
    const x = left + band * i + band / 2;
    return `<text class="trend-day-label" x="${x}" y="${H - 12}" text-anchor="middle">${d.date.slice(5)}</text>`;
  }).join('');

  const bars = shown.map((d, i) => {
    const x = left + band * i + (band - barW) / 2;
    const selected = d.date === state.day.date;
    let cursor = top + plotH;
    const segments = stages.map(s => {
      const count = d.stages?.[s.key] || 0;
      if (!count) return '';
      const h = (count / yMax) * plotH;
      cursor -= h;
      return `<rect class="trend-bar" x="${x.toFixed(1)}" y="${cursor.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${s.color}" opacity="0.9"></rect>`;
    }).join('');
    const hlW = Math.min(band, barW + 16);
    const hlX = left + band * i + (band - hlW) / 2;
    const highlight = selected
      ? `<rect x="${hlX.toFixed(1)}" y="${top}" width="${hlW.toFixed(1)}" height="${plotH}" rx="8" fill="rgba(178,58,43,.055)"></rect>`
      : '';
    return `${highlight}${segments}<rect class="trend-hit" x="${(left + band * i).toFixed(1)}" y="${top}" width="${band.toFixed(1)}" height="${plotH}" data-date="${d.date}"></rect>`;
  }).join('');

  els.trend.innerHTML = `${grid}${labels}${bars}`;
}

function bindEvents() {
  els.dateSelect.addEventListener('change', () => selectDate(els.dateSelect.value));

  els.refresh.addEventListener('click', refresh);

  els.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = els.search.value;
      renderStocks();
      renderAnalysis();
    }, 120);
  });

  els.sort.addEventListener('change', () => {
    state.sort = els.sort.value;
    renderStocks();
  });

  els.analysisToggle.addEventListener('click', () => {
    state.analysisVisible = !state.analysisVisible;
    try {
      localStorage.setItem('limitup.analysisVisible', state.analysisVisible ? '1' : '0');
    } catch {
      // Ignore storage failures; the toggle still works for this page view.
    }
    renderAnalysis();
  });

  els.stageFilter.addEventListener('click', event => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    const stage = chip.dataset.stage || null;
    state.selectedStage = state.selectedStage === stage ? null : stage;
    renderAll();
  });

  els.ranking.addEventListener('click', event => {
    const row = event.target.closest('.rank-row');
    if (!row) return;
    toggleStage(row.dataset.stage);
  });

  els.triangle.addEventListener('click', event => {
    const row = event.target.closest('.tri-row');
    if (!row) return;
    toggleStage(row.dataset.stage);
  });

  els.triangle.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('.tri-row');
    if (!row) return;
    event.preventDefault();
    toggleStage(row.dataset.stage);
  });

  els.triangleMobile.addEventListener('click', event => {
    const row = event.target.closest('.m-row');
    if (row) toggleStage(row.dataset.stage);
  });

  els.triangle.addEventListener('pointermove', event => {
    const row = event.target.closest('.tri-row');
    if (!row) {
      hideTooltip(els.tooltip);
      return;
    }
    const stage = row.dataset.stage;
    const stat = state.day.stages.find(s => s.key === stage) || { count: 0, share: 0 };
    const prev = previousDay(state.day.date);
    const prevCount = prev?.stages?.[stage];
    const delta = prev && prevCount != null ? stat.count - prevCount : null;
    const deltaHtml = delta == null
      ? ''
      : `<div class="tip-muted">较上一交易日 ${delta === 0 ? '持平' : `${fmtSigned(delta)} 只`}</div>`;
    positionTooltip(
      els.tooltip,
      `<strong>${stage}</strong> · ${fmtInt(stat.count)} 只 · ${fmtPct(stat.share)}${deltaHtml}`,
      event.clientX,
      event.clientY,
      els.triangleWrap
    );
  });

  els.triangle.addEventListener('pointerleave', () => hideTooltip(els.tooltip));

  els.trend.addEventListener('pointermove', event => {
    const hit = event.target.closest('.trend-hit');
    if (!hit) {
      hideTooltip(els.trendTooltip);
      return;
    }
    const day = state.index.days.find(d => d.date === hit.dataset.date);
    if (!day) return;
    const lines = state.meta.stages
      .map(s => ({ s, count: day.stages?.[s.key] || 0 }))
      .filter(x => x.count)
      .map(x => `<span style="color:${x.s.color}">●</span> ${x.s.key} ${x.count}`)
      .join('<br>');
    positionTooltip(
      els.trendTooltip,
      `<strong>${day.date}</strong> · 共 ${fmtInt(day.total)} 只${lines ? `<br>${lines}` : ''}`,
      event.clientX,
      event.clientY,
      els.trendWrap
    );
  });

  els.trend.addEventListener('pointerleave', () => hideTooltip(els.trendTooltip));

  els.trend.addEventListener('click', event => {
    const hit = event.target.closest('.trend-hit');
    if (hit?.dataset.date) selectDate(hit.dataset.date);
  });

  els.errorRetry.addEventListener('click', boot);

  window.addEventListener('hashchange', () => {
    const date = location.hash.replace(/^#/, '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && state.index?.days.some(d => d.date === date)) {
      if (state.day?.date !== date) selectDate(date, { updateHash: false });
    }
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.day) renderTrend();
    }, 150);
  });
}

function toggleStage(stage) {
  state.selectedStage = state.selectedStage === stage ? null : stage;
  renderAll();
}

async function refresh() {
  els.refresh.classList.add('spinning');
  try {
    const [index, promotion] = await Promise.all([
      loadJson('data/index.json'),
      loadJson('data/promotion.json').catch(() => state.promotion)
    ]);
    state.index = index;
    if (promotion) state.promotion = promotion;
    populateDates();
    const desired = state.day?.date && index.days.some(d => d.date === state.day.date)
      ? state.day.date
      : index.days.at(-1)?.date;
    if (desired) await selectDate(desired, { updateHash: false });
    else renderEmpty();
    hideError();
  } catch (err) {
    showError(`刷新失败：${err.message}`);
  } finally {
    els.refresh.classList.remove('spinning');
  }
}

function renderEmpty() {
  els.total.textContent = '0';
  els.delta.textContent = '暂无数据';
  els.promotion.textContent = '—';
  els.promotionUnit.hidden = true;
  els.promotionFoot.textContent = '请先运行抓取脚本';
  els.strongest.textContent = '—';
  els.strongestFoot.textContent = '暂无数据';
  els.center.textContent = '—';
  els.centerLabel.textContent = '暂无数据';
  els.triangle.innerHTML = '<text class="tri-zero" x="380" y="280" text-anchor="middle">暂无数据</text>';
  els.triangleMobile.innerHTML = '';
  els.boards.innerHTML = '<div class="empty">暂无数据</div>';
  els.ranking.innerHTML = '<div class="empty">暂无数据</div>';
  els.stageFilter.innerHTML = '';
  els.stockBody.innerHTML = '';
  els.tableEmpty.hidden = false;
  els.trend.innerHTML = '<text class="trend-empty" x="500" y="150">暂无历史数据</text>';
  els.trendLegend.innerHTML = '';
  els.analysisPanel.hidden = true;
  els.analysisBody.innerHTML = '';
}

async function boot() {
  hideError();
  try {
    const [meta, index, promotion] = await Promise.all([
      loadJson('data/meta.json'),
      loadJson('data/index.json'),
      loadJson('data/promotion.json').catch(() => null)
    ]);
    state.meta = meta;
    state.index = index;
    state.promotion = promotion;
    if (!index.days?.length) {
      renderEmpty();
      return;
    }
    populateDates();
    const hashDate = location.hash.replace(/^#/, '');
    const date = index.days.some(d => d.date === hashDate)
      ? hashDate
      : index.days.at(-1).date;
    await selectDate(date, { updateHash: false });
  } catch (err) {
    renderEmpty();
    showError(`页面初始化失败：${err.message}`);
  }
}

bindEvents();
boot();
