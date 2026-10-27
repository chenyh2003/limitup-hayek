# 涨停 · 哈耶克三角

一个独立静态看板：每天收盘后自动抓取 A 股涨停股，按哈耶克三角的 7 个生产环节做分布统计，并把结果累积成历史趋势。

- 当日：7 层三角、环节排行、连板结构、结构重心、涨停个股表
- 历史：按环节堆叠的每日涨停家数趋势
- 测试版：涨停原因分析（同花顺原因标签 + 东方财富 F10 主营业务）
- 自动化：GitHub Actions 工作日北京时间 15:30 抓取，GitHub Pages 展示
- 无需服务器、数据库、前端构建工具

## 统计口径

7 层从上到下固定为：

1. 科技
2. 能源（含矿产/农业/金融）
3. 交通
4. 制造加工
5. 外贸
6. 零售
7. 终端消费品

排序逻辑来自哈耶克三角：越靠上，离最终消费越远，越接近上游资本品/研发与原材料；越靠下，越接近最终消费。每层宽度 = 当日该环节涨停家数。

股票范围：沪深 A 股，剔除 ST/*ST、北交所、B 股。只统计收盘后已封住的涨停，不含炸板股。

分类来自 `hongli_rebuild/outputs/stage1_hayek.csv`（5573 只全 A 股，7 环节）。不在映射中的新股票会标为“未分类”，在页面提示数量，不混入 7 层三角。

## 涨停原因分析（测试版）

个股表下方新增一个测试区块，展示：

- 同花顺涨停池的当日 **原因标签**（如 `机器人关节模组+无框电机+微特电机`）
- 东方财富 F10 的 **主营业务**
- 规则拼接的一行简析（环节、连板、原因标签），不做主观预测

**随时关闭**

- 区块右上角「隐藏 / 开启」按钮（状态存浏览器 localStorage）
- 访问 `?analysis=off` 可让整个区块不出现
- 改 `assets/features.js` 里的 `analysisBeta: false` 可整体关闭
- 抓取时设置环境变量 `ANALYSIS=0` 可跳过原因/主营数据采集

原因接口失败或某只股票缺主营时，卡片显示“暂无数据”，不影响主看板和每日更新。主营数据缓存在 `data/profiles.json`，只补缺失或超过 90 天的股票。

## 本地运行

需要 Node.js 20+ 和 Python（只用于起静态服务器）。

```bash
# 1. 抓取当天数据（写入 data/）
node scripts/fetch.mjs

# 2. 起本地静态服务器
python -m http.server 8765

# 3. 打开
# http://localhost:8765/
```

也可以指定日期（只建议用于测试，接口历史回溯能力有限）：

```bash
node scripts/fetch.mjs --date=20261026
```

运行测试：

```bash
node --test
```

## 更新哈耶克映射

当有较多新上市股票需要补分类时：

```bash
node scripts/build-map.mjs ..\hongli_rebuild\outputs\stage1_hayek.csv
```

脚本会把 `能源/矿产/农业/金融` 归一为 `能源`，并只保留 7 个合法环节，输出 `data/hayek_map.json`。

## 部署到 GitHub Pages

1. 在 GitHub 新建一个 **公开** 仓库，例如 `limitup-hayek`。
2. 把本目录作为仓库根目录推送上去（不是把 `limitup_hayek` 作为一个子目录）。
3. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
4. 打开 **Actions → Daily limit-up snapshot → Run workflow**，手动跑一次。
5. 完成后访问 `https://<你的用户名>.github.io/limitup-hayek/`。

之后每个工作日北京时间 15:30（UTC 07:30）会自动抓取。GitHub 的定时任务可能有几分钟延迟；如果当天数据还没更新，可以手动触发一次 workflow。

> GitHub Pages 免费版要求仓库公开。页面里只有公开行情统计和哈耶克分类，不包含隐私数据。

## 目录

```
index.html                  页面
assets/style.css            样式
assets/app.js               前端逻辑（原生 JS + SVG）
assets/features.js          测试功能开关
assets/favicon.svg          favicon
data/meta.json              7 环节顺序、颜色、分组
data/hayek_map.json         股票代码 → 哈耶克环节
data/profiles.json          主营业务缓存（原因分析测试版）
data/index.json             历史聚合索引
data/YYYY-MM-DD.json        单日快照（含个股明细、原因、主营）
scripts/fetch.mjs           每日抓取与落盘
scripts/build-map.mjs       由 stage1_hayek.csv 生成映射
scripts/lib.mjs             过滤、分类、汇总、索引等纯函数
tests/transform.test.mjs    单元测试
.github/workflows/daily.yml 每日抓取 + Pages 部署
```

## 数据源与免责声明

- 数据源：东方财富涨停池接口、同花顺涨停池接口、东方财富 F10（均为非官方接口，可能调整字段或限制访问）。
- 统计结果仅用于观察市场结构，不构成任何投资建议；原因分析为测试功能，原因标签与主营业务仅作客观展示。
- 历史从首次运行当天开始累积；接口不支持长期回溯，因此没有补历史。
- 若接口失败，工作流会报错并保留上一版页面；修复后可手动重跑。
