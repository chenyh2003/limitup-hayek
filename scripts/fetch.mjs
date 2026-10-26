import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isExcluded, formatSealTime, classify, boardLabel, summarize, buildIndexDay, updateIndex
} from './lib.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = path.join(root, 'data');
const meta = JSON.parse(fs.readFileSync(path.join(dataDir, 'meta.json'), 'utf8'));
const hayekMap = JSON.parse(fs.readFileSync(path.join(dataDir, 'hayek_map.json'), 'utf8'));

function cstDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date()).replaceAll('-', '');
}

function parseDateArg(argv) {
  const eq = argv.find(x => x.startsWith('--date='));
  if (eq) return eq.split('=')[1];
  const idx = argv.indexOf('--date');
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  return cstDate();
}

const dateCompact = String(parseDateArg(process.argv.slice(2))).replaceAll('-', '');
if (!/^\d{8}$/.test(dateCompact)) throw new Error(`非法日期: ${dateCompact}`);

const url = new URL('https://push2ex.eastmoney.com/getTopicZTPool');
Object.entries({
  ut: '7eea3edcaed734bea9cbfc24409ed989',
  dpt: 'wz.ztzt',
  Pageindex: '0',
  pagesize: '1000',
  sort: 'fbt:asc',
  date: dateCompact
}).forEach(([k, v]) => url.searchParams.set(k, v));

async function fetchJson() {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
          Referer: 'https://quote.eastmoney.com/'
        },
        signal: AbortSignal.timeout(20000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  throw lastError;
}

const payload = await fetchJson();
const data = payload?.data;
if (!data) {
  console.log(`${dateCompact}: 无数据（非交易日或接口未返回），跳过`);
  process.exit(0);
}

const rawPool = Array.isArray(data.pool) ? data.pool : [];
const isToday = String(data.qdate) === dateCompact;
if (!rawPool.length && !isToday) {
  console.log(`${dateCompact}: 非当日且无数据，跳过`);
  process.exit(0);
}

const seen = new Set();
const stocks = rawPool
  .filter(item => !isExcluded(item))
  .filter(item => {
    const code = String(item.c);
    if (seen.has(code)) return false;
    seen.add(code);
    return true;
  })
  .map(item => {
    const stage = classify(item.c, hayekMap);
    const lianban = Number(item.lbc) || 1;
    const p = Number(item.p);
    return {
      code: String(item.c),
      name: String(item.n || ''),
      stage,
      lianban,
      boardLabel: boardLabel(lianban),
      changePct: Number(Number(item.zdp).toFixed(2)) || 0,
      price: Number.isFinite(p) ? Number((p / 1000).toFixed(2)) : null,
      amount: Number(item.amount) || 0,
      sealFund: Number(item.fund) || 0,
      turnover: Number(Number(item.hs).toFixed(2)) || 0,
      floatMv: Number(item.ltsz) || 0,
      firstSeal: formatSealTime(item.fbt),
      lastSeal: formatSealTime(item.lbt),
      broken: Number(item.zbc) || 0,
      industry: String(item.hybk || ''),
      daysBoard: item.zttj ? `${item.zttj.days}天${item.zttj.ct}板` : ''
    };
  })
  .sort((a, b) =>
    b.lianban - a.lianban ||
    b.sealFund - a.sealFund ||
    a.firstSeal.localeCompare(b.firstSeal)
  );

const summary = summarize(stocks, meta.stages);
const date = `${dateCompact.slice(0, 4)}-${dateCompact.slice(4, 6)}-${dateCompact.slice(6, 8)}`;
const snapshot = {
  date,
  capturedAt: new Date().toISOString(),
  source: 'eastmoney:getTopicZTPool',
  universe: meta.universe,
  ...summary,
  stocks
};

fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, `${date}.json`), JSON.stringify(snapshot, null, 2), 'utf8');

const indexPath = path.join(dataDir, 'index.json');
const index = fs.existsSync(indexPath)
  ? JSON.parse(fs.readFileSync(indexPath, 'utf8'))
  : { updatedAt: null, days: [] };
const nextIndex = updateIndex(index, buildIndexDay(snapshot), snapshot.capturedAt);
fs.writeFileSync(indexPath, JSON.stringify(nextIndex, null, 2), 'utf8');

console.log(`${date}: 涨停 ${summary.total} 只，未分类 ${summary.unclassified} 只`);
console.log(summary.stages.map(s => `${s.key} ${s.count}`).join(' | '));
if (summary.unclassified) {
  const codes = stocks.filter(s => s.stage === '未分类').map(s => `${s.code} ${s.name}`);
  console.log(`未分类: ${codes.join(', ')}`);
}
