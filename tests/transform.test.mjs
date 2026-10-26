import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isExcluded, formatSealTime, classify, summarize, buildIndexDay, updateIndex
} from '../scripts/lib.mjs';

const stages = [
  { key: '科技', index: 1 }, { key: '能源', index: 2 }, { key: '交通', index: 3 },
  { key: '制造加工', index: 4 }, { key: '外贸', index: 5 }, { key: '零售', index: 6 },
  { key: '终端消费品', index: 7 }
];

test('剔除 ST / 北交所 / B股', () => {
  assert.equal(isExcluded({ c: '600001', n: 'ST测试' }), true);
  assert.equal(isExcluded({ c: '600002', n: '*ST测试' }), true);
  assert.equal(isExcluded({ c: '830001', n: '北交所' }), true);
  assert.equal(isExcluded({ c: '920001', n: '北交所新' }), true);
  assert.equal(isExcluded({ c: '200001', n: 'B股' }), true);
  assert.equal(isExcluded({ c: '900001', n: 'B股沪' }), true);
  assert.equal(isExcluded({ c: '600000', n: '浦发银行' }), false);
  assert.equal(isExcluded({ c: '300001', n: '特锐德' }), false);
  assert.equal(isExcluded({ c: '688001', n: '华兴源创' }), false);
});

test('封板时间格式化', () => {
  assert.equal(formatSealTime(92500), '09:25:00');
  assert.equal(formatSealTime(100005), '10:00:05');
  assert.equal(formatSealTime(0), '');
});

test('环节分类与未分类', () => {
  const map = { '600000': '能源', '300001': '科技' };
  assert.equal(classify('600000', map), '能源');
  assert.equal(classify('000001', map), '未分类');
});

test('汇总：家数、连板、最强环节、重心', () => {
  const stocks = [
    { stage: '科技', lianban: 1, sealFund: 100 },
    { stage: '科技', lianban: 3, sealFund: 50 },
    { stage: '终端消费品', lianban: 2, sealFund: 80 },
    { stage: '未分类', lianban: 1, sealFund: 10 }
  ];
  const s = summarize(stocks, stages);
  assert.equal(s.total, 4);
  assert.equal(s.unclassified, 1);
  assert.equal(s.stages.find(x => x.key === '科技').count, 2);
  assert.equal(s.boards.first, 2);
  assert.equal(s.boards.second, 1);
  assert.equal(s.boards.thirdPlus, 1);
  assert.equal(s.boards.max, 3);
  assert.equal(s.strongestStage, '科技');
  assert.equal(s.center, 3);
  assert.equal(s.centerLabel, '中游');
});

test('空样本与全未分类样本不虚构最强环节', () => {
  const empty = summarize([], stages);
  assert.equal(empty.total, 0);
  assert.equal(empty.center, null);
  assert.equal(empty.centerLabel, '—');
  assert.equal(empty.strongestStage, '—');

  const unclassified = summarize([{ stage: '未分类', lianban: 1, sealFund: 1 }], stages);
  assert.equal(unclassified.total, 1);
  assert.equal(unclassified.unclassified, 1);
  assert.equal(unclassified.center, null);
  assert.equal(unclassified.strongestStage, '—');
});

test('索引行只保留聚合字段', () => {
  const day = buildIndexDay({
    date: '2026-10-26', total: 2, stages: [{ key: '科技', count: 2, share: 1 }],
    unclassified: 0, boards: { first: 2, second: 0, thirdPlus: 0, max: 1 },
    center: 1, centerLabel: '偏上游', strongestStage: '科技'
  });
  assert.deepEqual(day.stages, { 科技: 2 });
  assert.equal(day.date, '2026-10-26');
});

test('索引去重、排序并保留最新日期', () => {
  const old = { updatedAt: null, days: [{ date: '2026-10-24', total: 10 }] };
  const day = { date: '2026-10-26', total: 2 };
  const next = updateIndex(old, day, '2026-10-26T08:00:00Z');
  assert.equal(next.days.length, 2);
  assert.equal(next.days.at(-1).date, '2026-10-26');
  const again = updateIndex(next, { ...day, total: 3 }, '2026-10-26T09:00:00Z');
  assert.equal(again.days.length, 2);
  assert.equal(again.days.at(-1).total, 3);
});
