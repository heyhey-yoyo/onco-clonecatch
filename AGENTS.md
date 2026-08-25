# CloneCatch — 肿瘤空间取样偏差可视化（AI 代理工作指南）

本文件供 AI 编码代理使用。修改代码前请先阅读本文件。

## 项目概览

纯前端、零第三方依赖的肿瘤空间取样偏差可视化工具。生成合成空间肿瘤 → 放置虚拟活检芯针 → Monte Carlo 重复取样 → 估计稀有克隆漏检风险、克隆景观恢复率与样本代表性。

核心概念（详见 `docs/MODEL.md`）：

- 3–6 个空间克隆类别，最后一个永远是"稀有耐药克隆"（`rareIndex = state.cloneCount - 1`）
- 4 种合成结构：`branched`、`patchwork`、`gradient`、`rare-edge`
- 4 种取样策略：`random`、`center`、`center-edge`、`dispersed`
- 2 种检测聚合：`per-core`（逐芯针独立检测）、`pooled`（合并检测）
- 指标：漏检率（Wilson 95% 区间）、恢复率、代表性（1 − TVD）

科学边界：仅用于科研与教学，不是医疗器械，不用于患者诊断、治疗选择或临床风险判断。

## 技术栈与运行架构

- 单文件 IIFE 原生 JavaScript（`assets/app.js`，约 1450 行），ES2019+，无构建、无 npm、无任何第三方依赖
- Canvas 2D（交互肿瘤地图 + hero 动画）+ SVG（策略风险曲线）
- 确定性随机：FNV-1a 风格 `hashString` + `mulberry32` PRNG + `rngFor(tag)` 按标签隔离随机流；**同一 seed 下肿瘤结构完全确定，Monte Carlo 随机性仅来自芯针位置与方向**
- 异步分批：每 120 次重复经 `requestAnimationFrame` 让出主线程

## 仓库结构

| 文件 | 作用 |
| --- | --- |
| `index.html` | 站点入口单页：4 个 Tab、全部表单控件，控件 id 与 JS 一一对应 |
| `assets/app.js` | 全部逻辑（单文件 IIFE）：合成肿瘤、芯针取样、检测聚合、Monte Carlo、渲染、导出、分享 |
| `assets/app.css` | 全部样式（压缩单行风格 + CSS 变量，响应式断点 1180/860/520px） |
| `404.html` | Cloudflare Pages 404 页（noindex） |
| `robots.txt` | 允许全站 |
| `_headers` | 安全响应头（CSP `connect-src 'none'` 等） |
| `docs/MODEL.md` | 科学模型说明（公式、策略、明确未建模内容） |

## 运行与构建

无构建步骤，可直接双击 `index.html` 打开；推荐用同源环境：

```bash
python3 -m http.server 8000
```

## 测试

无自动化测试（无 package.json / CI）。修改后需人工浏览器验证的关键点：

- 确定性复现：同一 seed 重新生成肿瘤逐像素一致；分享 URL 往返状态不变
- 指标正确性：`evaluateCores` 的 per-core/pooled 分支、`wilsonInterval`、TVD 代表性
- Monte Carlo 进度与取消（`setBusy` 防重入）
- 导出（PNG/CSV/JSON/Methods）与无障碍（键盘、aria-live、reduced-motion）

## 部署

- Cloudflare Pages 静态部署，无构建：Build command 留空，输出目录为仓库根
- 方式：GitHub 集成（推荐）或 Direct Upload（`npx wrangler pages deploy project --project-name=<名>`）
- 部署后检查：首页、404、分享链接、导出、响应头

## 安全与数据注意事项

- **纯本地计算，无网络请求**：CSP `connect-src 'none'` 禁止任何 fetch/XHR/WebSocket；无账号、无 localStorage/cookie、无数据上传
- 分享状态写入 URL hash（`#cc=<Base64URL>`），读取时严格消毒（`sanitizeConfig`/`sanitizeCore` 钳制数值、枚举白名单），非法状态回退安全默认值
- 导出文件经 Blob + `URL.createObjectURL` 触发，800ms 后 `revokeObjectURL`

## 代码组织与风格约定

- 单文件但分层清晰：常量白名单（`Object.freeze`）→ 全局状态 → 随机基础 → **模拟核心纯函数**（`buildTumor`/`generateCores`/`evaluateCores`/`wilsonInterval`/`runSimulationAsync`，不碰 DOM）→ 渲染层 → 导出层 → 分享消毒层 → UI 绑定
- **失效模型**：改变取样参数调 `invalidateSampling()` 清空结果缓存；改变肿瘤结构参数调 `buildTumor()` 重建网格与 720×720 `tumorCache`
- 新增控件必须五处同步：`DEFAULTS`、`syncControls`、`sanitizeConfig`、`currentConfig`、分享 payload 版本号
- 全 `const`/`function`，无 class/export；camelCase 命名；DOM id 与 state 字段一一对应
- 中文 UI 文案硬编码于 JS 常量与 HTML；最后一个克隆强制"稀有耐药克隆"
- 页面主体采用 `ydchen-portfolio` 的米白 / 赤陶色视觉系统；保留 Canvas 画布、研究控件、状态提示与导出交互

---

## AI 维护提醒

> **⚠️ 任何修改此项目的 AI 代理（包括未来的你自己）都必须遵守：**
>
> - 修改 `buildTumor`、`generateCores`、`evaluateCores`、`sampleCoreGrid` 等模拟核心函数会改变科学结果，必须保持"固定种子完全确定、MC 仅随机于芯针"的可复现性承诺
> - 新增控件须同步 `DEFAULTS`、`syncControls`、`sanitizeConfig`、`currentConfig` 与分享 payload 版本五处
> - 修改科学指标时同步更新 `docs/MODEL.md` 与 README
