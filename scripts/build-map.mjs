import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = process.argv[2] ||
  path.resolve(root, '..', 'hongli_rebuild', 'outputs', 'stage1_hayek.csv');
const outFile = path.join(root, 'data', 'hayek_map.json');

const meta = JSON.parse(fs.readFileSync(path.join(root, 'data', 'meta.json'), 'utf8'));
const validStages = new Set(meta.stages.map(s => s.key));
const aliases = { '能源/矿产/农业/金融': '能源' };

const text = fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '');
const lines = text.split(/\r?\n/).filter(Boolean);
const header = lines.shift().split(',');
const codeIdx = header.indexOf('code');
const stageIdx = header.indexOf('哈耶克环节');
if (codeIdx < 0 || stageIdx < 0) throw new Error('CSV 缺少 code 或 哈耶克环节 列');

const map = {};
for (const line of lines) {
  const cols = line.split(',');
  const code = (cols[codeIdx] || '').trim().padStart(6, '0');
  const raw = (cols[stageIdx] || '').trim();
  const stage = aliases[raw] || raw;
  if (/^\d{6}$/.test(code) && validStages.has(stage)) map[code] = stage;
}

fs.writeFileSync(outFile, JSON.stringify(map, null, 0), 'utf8');
console.log(`wrote ${Object.keys(map).length} codes -> ${outFile}`);
