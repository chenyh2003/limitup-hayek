import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isExcluded, formatSealTime, classify, boardLabel, summarize, buildIndexDay, updateIndex,
  cleanBusiness, mergeReasonMap, isProfileFresh
} from './lib.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = path.join(root, 'data');
const profileCachePath = path.join(dataDir, 'profiles.json');
const meta = JSON.parse(fs.readFileSync(path.join(dataDir, 'meta.json'), 'utf8'));
const hayekMap = JSON.parse(fs.readFileSync(path.join(dataDir, 'hayek_map.json'), 'utf8'));
const analysisEnabled = process.env.ANALYSIS !== '0' && !process.argv.includes('--no-analysis');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';

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

const poolUrl = new URL('https://push2ex.eastmoney.com/getTopicZTPool');
Object.entries({
  ut: '7eea3edcaed734bea9cbfc24409ed989',
  dpt: 'wz.ztzt',
  Pageindex: '0',
  pagesize: '1000',
  sort: 'fbt:asc',
  date: dateCompact
}).forEach(([k, v]) => poolUrl.searchParams.set(k, v));

async function fetchJson(target, headers = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(target, {
        headers: { 'User-Agent': UA, ...headers },
        signal: AbortSignal.timeout(20000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt < attempts) await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  throw lastError;
}

async function fetchReasonPool() {
  const reasonUrl = new URL('https://data.10jqka.com.cn/dataapi/limit_up/limit_up_pool');
  Object.entries({
    page: '1',
    limit: '200',
    field: '199112,10,9001,330323,330324,330325,9002,330329,133971,133970,1968584,3475914,9003,9004',
    filter: 'HS,GEM2STAR',
    order_field: '330324',
    order_type: '0',
    date: dateCompact
  }).forEach(([k, v]) => reasonUrl.searchParams.set(k, v));
  try {
    const payload = await fetchJson(reasonUrl, { Referer: 'https://data.10jqka.com.cn/' }, 2);
    return mergeReasonMap(Array.isArray(payload?.data?.info) ? payload.data.info : []);
  } catch (err) {
    console.warn(`同花顺原因接口失败：${err.message}`);
    return new Map();
  }
}

async function fetchMainBusiness(code) {
  const secucode = `${code}.${code.startsWith('6') ? 'SH' : 'SZ'}`;
  const profileUrl = new URL('https://datacenter.eastmoney.com/securities/api/data/v1/get');
  Object.entries({
    reportName: 'RPT_F10_BASIC_ORGINFO',
    columns: 'SECUCODE,SECURITY_CODE,MAIN_BUSINESS',
    filter: `(SECUCODE="${secucode}")`,
    pageNumber: '1',
    pageSize: '10',
    source: 'HSF10',
    client: 'PC'
  }).forEach(([k, v]) => profileUrl.searchParams.set(k, v));
  const payload = await fetchJson(profileUrl, { Referer: 'https://emweb.securities.eastmoney.com/' }, 2);
  return cleanBusiness(payload?.result?.data?.[0]?.MAIN_BUSINESS || '');
}

function loadProfileCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(profileCachePath, 'utf8'));
    return raw?.profiles && typeof raw.profiles === 'object' ? raw.profiles : {};
  } catch {
    return {};
  }
}

async function enrichStocks(stocks) {
  const reasons = analysisEnabled ? await fetchReasonPool() : new Map();
  const cache = loadProfileCache();
  const pending = analysisEnabled
    ? stocks.filter(stock => !isProfileFresh(cache[stock.code]))
    : [];
  let changed = false;
  let cursor = 0;

  async function worker() {
    while (cursor < pending.length) {
      const stock = pending[cursor];
      cursor += 1;
      try {
        const mainBusiness = await fetchMainBusiness(stock.code);
        if (mainBusiness) {
          cache[stock.code] = {
            mainBusiness,
            updatedAt: new Date().toISOString()
          };
          changed = true;
        }
      } catch (err) {
        console.warn(`主营获取失败 ${stock.code}：${err.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 120));
    }
  }

  if (pending.length) {
    await Promise.all(
      Array.from({ length: Math.min(4, pending.length) }, () => worker())
    );
  }

  if (changed) {
    fs.writeFileSync(profileCachePath, JSON.stringify({
      updatedAt: new Date().toISOString(),
      profiles: cache
    }, null, 0), 'utf8');
  }

  for (const stock of stocks) {
    stock.reason = reasons.get(stock.code) || '';
    stock.mainBusiness = cache[stock.code]?.mainBusiness || '';
  }

  return {
    reasonCount: reasons.size,
    profileFetched: pending.length,
    profileCache: Object.keys(cache).length
  };
}

const payload = await fetchJson(poolUrl, { Referer: 'https://quote.eastmoney.com/' });
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

const analysisStats = await enrichStocks(stocks);
const summary = summarize(stocks, meta.stages);
const date = `${dateCompact.slice(0, 4)}-${dateCompact.slice(4, 6)}-${dateCompact.slice(6, 8)}`;
const snapshot = {
  date,
  capturedAt: new Date().toISOString(),
  source: 'eastmoney:getTopicZTPool',
  universe: meta.universe,
  analysis: {
    enabled: analysisEnabled,
    withReason: stocks.filter(stock => stock.reason).length,
    withMainBusiness: stocks.filter(stock => stock.mainBusiness).length
  },
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
if (analysisEnabled) {
  console.log(`原因标签 ${analysisStats.reasonCount} 条，主营缓存 ${analysisStats.profileCache} 只（本次补 ${analysisStats.profileFetched} 只）`);
}
if (summary.unclassified) {
  const codes = stocks.filter(s => s.stage === '未分类').map(s => `${s.code} ${s.name}`);
  console.log(`未分类: ${codes.join(', ')}`);
}
