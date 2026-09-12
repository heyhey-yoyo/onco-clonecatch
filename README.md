# CloneCatch 中文版

看看你的活检漏掉了什么。

CloneCatch 是一个纯前端、零第三方依赖的肿瘤空间取样偏差可视化工具。它生成合成空间肿瘤，允许研究者放置虚拟活检芯针，并通过 Monte Carlo 重复取样估计稀有克隆漏检风险、克隆景观恢复率和样本代表性。

> 仅用于科研与教学。不是医疗器械，不用于患者诊断、治疗选择或个体化临床风险判断。

## 主要功能

- 中文科研风格单页界面
- 3–6 个空间克隆类别，最后一个始终是「稀有耐药克隆」
- 分支演化、斑块生态位、方向性梯度、边缘稀有生态位 4 种合成空间结构
- 手动点击放置芯针与 4 种自动取样策略
- 逐芯针独立检测 / 合并检测两种明确的检测聚合方式
- 固定 17×7 网格近似单芯针组成，避免额外随机抽点噪声
- 1 千 / 3 千 / 1 万 / 2 万次 Monte Carlo，分批执行并显示真实进度
- 稀有克隆漏检率 Wilson 95% Monte Carlo 区间
- 4 种策略基准与 1–8 根芯针风险曲线
- 「双实验室：同一个肿瘤，不同的一针」冲突演示
- SHA-256 实验配置指纹（支持时）
- 严格校验的 Base64URL 分享状态，可复现当前配置和可见芯针
- 中文 Methods、JSON、CSV、PNG 导出
- 键盘可访问 Tabs 与 Canvas 基本操作
- Cloudflare Pages 安全响应头

## 界面风格

页面采用 `ydchen-portfolio` 的米白、浅灰与赤陶色视觉系统，使用衬线标题和扁平化研究面板；肿瘤画布、采样控件、Monte Carlo 进度与导出交互保持不变。

研究工作台正文采用 15px 基线，操作与状态标签不小于 12px；画布注释需保持高对比度，桌面与手机端不得出现页面整体横向溢出。

## 数据与隐私

纯本地计算，无网络请求、无账号、无 Cookie、无数据上传。分享状态写入网址 hash，读取时严格校验，非法状态回退安全默认值。

## 本地运行

可以直接双击 `index.html`。为了更接近 Cloudflare Pages 的真实同源环境，推荐在项目目录启动静态服务器：

```bash
python -m http.server 8000
```

然后访问 `http://localhost:8000/`。

## 部署

该项目没有构建步骤，是预构建静态资产，部署到 Cloudflare Pages。

**方式 A：GitHub 集成（推荐长期维护）**

1. 将项目文件提交到 GitHub 仓库根目录。
2. 在 Cloudflare Workers & Pages 中创建 Pages 项目并连接 GitHub 仓库。
3. 该项目没有构建步骤：Build command 留空；输出目录使用仓库根目录（具体 Dashboard 字段以当时 Cloudflare 界面为准）。
4. 首次部署后检查首页、404、分享链接、PNG/CSV/JSON 导出与响应头。

**方式 B：Direct Upload**

可以直接上传整个仓库根目录（站点文件就在仓库根）。使用 Wrangler 时在项目根目录执行：

```bash
npx wrangler pages deploy . --project-name=<你的项目名>
```

也可以使用 Cloudflare Dashboard 的拖拽上传功能。

## 责任边界

仅用于科研与教学，不是医疗器械，不用于患者诊断、治疗选择或临床风险判断。

科学模型详见 `docs/MODEL.md`。

## License

MIT

---

> AI 编程代理请阅读 [AGENTS.md](./AGENTS.md) 了解代码架构、测试策略与开发约定。

---

## 2026-09-13 维护补充

合并浅色主题变量，保留克隆与风险图例的颜色变量映射。

## AI 维护提醒

> **⚠️ 任何修改此项目的 AI 代理（Claude Code、Cursor、Copilot 等）都必须同步更新本文件与 [AGENTS.md](./AGENTS.md)。**
>
> - 修改 `buildTumor`、`generateCores`、`evaluateCores` 等模拟核心函数会影响科学结果，必须保持固定种子完全确定的可复现性
