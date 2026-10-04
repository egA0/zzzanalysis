# ZZZ Analysis（抽卡规划台）

本地优先、无需游戏账号的《绝区零》限定角色与音擎抽卡规划工具。支持资源管理、目标排序、概率分析、方案比较与离线 PWA。

> 非官方项目，与 HoYoverse 无隶属关系。概率分析基于可配置模型，预测结果不构成抽卡或消费保证。数据核验日期和不确定项见 [数据来源](docs/SOURCES.md)。

## 功能与边界

- 分别保存角色、音擎及特殊频道状态；普通限定与特殊频道不共享保底状态。
- 基于本地卡池历史生成复刻周期与未来版本候选；运行时不自动联网更新卡池或版本奖励。
- 支持按日期累计资源、可配置收入、月卡状态与抽卡副产物兑换。
- 使用精确状态转移与 Monte Carlo 模拟分析规划；消耗分位数含失败停止，不等于成功保障线。
- 通过 IndexedDB 在当前浏览器保存数据；支持导入导出，生产构建提供离线 PWA。

## 快速开始

环境要求：Node.js 20.19+（20.x）或 22.12+，以及 npm。

```bash
git clone https://github.com/egA0/zzzanalysis.git
cd zzzanalysis
npm ci
npm run dev
```

打开终端输出的本地地址。界面默认使用简体中文；`src/i18n/` 保留语言扩展入口，完整多语言界面尚未提供。

## 仓库结构

```text
zzzanalysis/
├── .github/workflows/   # GitHub Actions 发布流程
├── docs/               # 设计、数据来源与规则变更记录
├── public/             # 静态资源与 PWA 图标
├── scripts/            # 规则核验脚本
├── src/
│   ├── data/           # 卡池历史、版本资源与预测
│   ├── domain/         # 数据模型、资源与日期
│   ├── engine/         # 概率计算与模拟
│   ├── i18n/           # 文案与语言扩展入口
│   ├── rules/          # 规则基线与可撤销来源补丁
│   ├── storage/        # IndexedDB、迁移与本地保存
│   ├── ui/             # 页面、图表与样式
│   └── worker/         # 后台计算入口
├── tests/              # 单元、端到端与离线测试
├── package.json
└── vite.config.ts
```

所有开发命令均在仓库根目录执行。`dist/` 为构建时生成的静态站点，`node_modules/` 为本地依赖；两者都不提交到 Git。`.git/` 只保存版本控制元数据，不放置工程源码。

## 开发与检查

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

浏览器测试需先安装 Playwright Chromium：

```bash
npx playwright install chromium
npm run test:e2e
npm run build
npm run test:pwa
```

`npm run preview` 可预览生产构建。`npm run format` 统一格式。贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

### 官方规则核验

```bash
npm run verify:rules
```

此命令需要联网，读取 HoYoverse 频道概率 JSON 并与本地官方基线比较；发现差异会失败，但不会自动改写规则。它不属于离线单元测试，也不自动更新卡池记录。默认软保底曲线是可撤销的第三方拟合模型，不是官方逐抽概率表。

## 部署

- **GitHub Pages**：仓库根目录的 `.github/workflows/pages.yml` 在推送到 `main` 或手动触发时执行检查、构建与发布。在仓库的 **Settings → Pages → Build and deployment** 中将发布来源设置为 **GitHub Actions**。
- **Cloudflare Pages / 其他静态托管**：项目根目录使用仓库根目录，构建命令为 `npm run build`，发布目录为 `dist`。
- Vite 使用 `base: "./"`，支持仓库子路径部署。PWA 安装需在 HTTPS 或本地开发环境下使用。

## 数据与隐私

内置卡池记录覆盖 1.0 至 3.2 的资料快照，不代表在线最新数据。新增记录需依据官方公告人工维护，并保留来源与日期。未来版本资源采用可配置估算；用户领取资格、已获取资源与月卡状态需自行确认。

项目不要求游戏账号、密码或令牌。用户数据保存在当前浏览器的 IndexedDB 中；清除站点数据会删除本地规划。不要提交个人导出 JSON、访问令牌、`.env` 或本地备份；需要共享导出文件时，应先移除私人记录。

## 技术栈与文档

React、严格 TypeScript、Vite、Zustand、IndexedDB、ECharts、Vitest、Playwright、Web Worker 与 PWA。界面使用项目内 CSS。

- [产品与技术设计](docs/PRODUCT.md)
- [数据来源与建模边界](docs/SOURCES.md)
- [规则变更与回滚](docs/RULE-CHANGELOG.md)
- [开发贡献指南](CONTRIBUTING.md)
