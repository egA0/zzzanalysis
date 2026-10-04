# 开发贡献指南

## 本地开发

在仓库根目录运行 `npm ci` 安装锁定依赖，然后运行 `npm run dev`。源码使用 TypeScript 与 React，目录职责见 [README.md](README.md)。

提交变更前执行：

```bash
npm run format
npm run typecheck
npm run lint
npm test
npm run build
```

修改页面或离线缓存时，还应安装 Playwright Chromium，并运行 `npm run test:e2e` 与 `npm run test:pwa`。离线测试依赖已完成的生产构建。

## 代码与注释

- 源码、配置和文档直接放在仓库根目录的标准子目录中；不得将工程文件放入 `.git/`。
- 使用 UTF-8、LF 换行和 Prettier 格式；代码注释说明约束、状态含义或算法原因，不记录本机目录、临时工作过程或开发工具对话。
- 保持简体中文界面文案与已有模型边界；整理注释或目录时不要顺带改动概率规则。
- 新增算法或迁移逻辑时补充单元测试；页面行为变更应补充相应浏览器测试。

## 数据与规则更新

- 卡池快照在 `src/data/banner-history.json` 中维护；保留稳定键、版本、期数、日期与可追溯来源。
- 官方已公布角色和版本资源配置分别位于 `src/data/announced-characters.ts` 与 `src/data/version-resources.ts`。
- 官方事实与第三方拟合必须区分；软保底、预测和未经确认的继承机制不得标注为官方结论。
- 规则补丁与基线位于 `src/rules/`；更新时同步维护 [数据来源](docs/SOURCES.md) 和 [规则变更记录](docs/RULE-CHANGELOG.md)。
- 需要重新核对官方概率时运行 `npm run verify:rules`；该命令联网但不自动改写本地文件。
- 发布前使用 Git 提交或标签保存可回溯版本；公开仓库不依赖本地回滚压缩包。

## 提交与隐私

提交应聚焦单一目的，并说明改动、测试与尚未确认的内容。只提交源码、静态资源、锁文件、配置和文档；依赖、构建产物、测试报告、日志、个人导出数据和凭据不应进入仓库。

仓库尚未提供许可证文件；在再分发或复用前，请先确认作者的授权范围。
