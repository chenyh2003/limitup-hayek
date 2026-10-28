export const STAGE_KEYS = ['科技', '能源', '交通', '制造加工', '外贸', '零售', '终端消费品'];

export function isExcluded(item) {
  const code = String(item.c || '');
  const name = String(item.n || '');
  if (!/^\d{6}$/.test(code)) return true;
  if (/ST/i.test(name)) return true;
  if (/^(4|8|92)/.test(code)) return true;
  if (/^(2|9)/.test(code)) return true;
  return false;
}

export function formatSealTime(value) {
  const n = Number(value);
  if (!n) return '';
  const s = String(n).padStart(6, '0');
  return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`;
}

export function classify(code, map) {
  return map[String(code)] || '未分类';
}

export function boardLabel(lianban) {
  if (lianban <= 1) return '首板';
  if (lianban === 2) return '2板';
  return `${lianban}板`;
}

export function summarize(stocks, stageMeta) {
  const total = stocks.length;
  const counts = new Map(stageMeta.map(s => [s.key, 0]));
  const indexByKey = new Map(stageMeta.map(s => [s.key, s.index]));
  let unclassified = 0;
  const boards = { first: 0, second: 0, thirdPlus: 0, max: 0 };
  let weighted = 0;
  let classified = 0;

  for (const s of stocks) {
    if (counts.has(s.stage)) {
      counts.set(s.stage, counts.get(s.stage) + 1);
      weighted += indexByKey.get(s.stage);
      classified += 1;
    } else {
      unclassified += 1;
    }
    if (s.lianban <= 1) boards.first += 1;
    else if (s.lianban === 2) boards.second += 1;
    else boards.thirdPlus += 1;
    boards.max = Math.max(boards.max, s.lianban || 0);
  }

  const stages = stageMeta.map(s => ({
    key: s.key,
    count: counts.get(s.key),
    share: total ? counts.get(s.key) / total : 0
  }));
  const strongest = stages.reduce((a, b) => (b.count > a.count ? b : a), stages[0]);
  const center = classified ? weighted / classified : null;
  const centerLabel = center == null ? '—' : center <= 2.5 ? '偏上游' : center <= 4.5 ? '中游' : '偏下游';

  return {
    total,
    stages,
    unclassified,
    boards,
    center: center == null ? null : Number(center.toFixed(2)),
    centerLabel,
    strongestStage: strongest?.count ? strongest.key : '—'
  };
}

export function buildIndexDay(snapshot) {
  const stages = {};
  for (const s of snapshot.stages) stages[s.key] = s.count;
  return {
    date: snapshot.date,
    total: snapshot.total,
    stages,
    unclassified: snapshot.unclassified,
    boards: snapshot.boards,
    center: snapshot.center,
    centerLabel: snapshot.centerLabel,
    strongestStage: snapshot.strongestStage
  };
}

export function updateIndex(index, day, updatedAt) {
  const days = (index?.days || []).filter(d => d.date && d.date !== day.date);
  days.push(day);
  days.sort((a, b) => a.date.localeCompare(b.date));
  return { updatedAt, days };
}

export function cleanBusiness(value) {
  return String(value || '')
    .replace(/\s*[,，、;；]\s*/g, '、')
    .replace(/\s+/g, ' ')
    .replace(/^[、\s]+|[、\s。.;；]+$/g, '')
    .trim();
}

export function reasonTags(value) {
  return [...new Set(
    String(value || '')
      .split(/[+＋、,，;；]/)
      .map(part => part.trim())
      .filter(Boolean)
  )].slice(0, 6);
}

export function mergeReasonMap(info) {
  const map = new Map();
  for (const item of info || []) {
    const code = String(item.code || '').padStart(6, '0');
    if (!/^\d{6}$/.test(code)) continue;
    const reason = String(item.reason_type || '').trim();
    if (reason) map.set(code, reason);
  }
  return map;
}

export function isProfileFresh(entry, now = Date.now(), maxAgeDays = 90) {
  if (!entry?.mainBusiness || !entry?.updatedAt) return false;
  const updated = Date.parse(entry.updatedAt);
  if (!Number.isFinite(updated)) return false;
  return now - updated < maxAgeDays * 86400000;
}

export function computePromotion(history, targetDate, windowSize = 7) {
  const targetIndex = history.findIndex(day => day.date === targetDate);
  if (targetIndex < 0) return null;
  const window = history.slice(Math.max(0, targetIndex - windowSize + 1), targetIndex + 1);
  const map = new Map();

  window.forEach((day, index) => {
    for (const code of day.codes || []) {
      if (!map.has(code)) {
        map.set(code, { first: day.date, firstIndex: index, hits: 0 });
      }
      map.get(code).hits += 1;
    }
  });

  const stocks = {};
  let sumRate = 0;
  let sample = 0;
  let hitsTotal = 0;
  let observedTotal = 0;

  for (const [code, item] of map) {
    const observed = window.length - item.firstIndex;
    const rate = item.hits / observed;
    stocks[code] = {
      first: item.first,
      hits: item.hits,
      observed,
      rate: Number(rate.toFixed(4))
    };
    if (observed >= 2) {
      sumRate += rate;
      sample += 1;
      hitsTotal += item.hits;
      observedTotal += observed;
    }
  }

  return {
    window: window.length,
    sample,
    rate: observedTotal ? Number((hitsTotal / observedTotal).toFixed(4)) : null,
    averageRate: sample ? Number((sumRate / sample).toFixed(4)) : null,
    hits: hitsTotal,
    observed: observedTotal,
    stocks
  };
}
