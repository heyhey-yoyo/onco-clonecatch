# CloneCatch 中文版

**看看你的活检漏掉了什么。**

CloneCatch 是一个纯前端、零第三方依赖的肿瘤空间取样偏差可视化工具。它生成合成空间肿瘤，允许研究者放置虚拟活检芯针，并通过 Monte Carlo 重复取样估计稀有克隆漏检风险、克隆景观恢复率和样本代表性。

> 仅用于科研与教学。不是医疗器械，不用于患者诊断、治疗选择或个体化临床风险判断。

## 主要功能

- 中文科研 SaaS 风格单页界面
- 3–6 个空间克隆类别，最后一个始终是“稀有耐药克隆”
- 分支演化、斑块生态位、方向性梯度、边缘稀有生态位 4 种合成空间结构
- 手动点击放置芯针与 4 种自动取样策略
- 逐芯针独立检测 / 合并检测两种明确的检测聚合方式
- 固定 17×7 网格近似单芯针组成，避免额外随机抽点噪声
- 1 千 / 3 千 / 1 万 / 2 万次 Monte Carlo，分批执行并显示真实进度
- 稀有克隆漏检率 Wilson 95% Monte Carlo 区间
- 4 种策略基准与 1–8 根芯针风险曲线
- “双实验室：同一个肿瘤，不同的一针”冲突演示
- SHA-256 实验配置指纹（支持时）
- 严格校验的 Base64URL 分享状态，可复现当前配置和可见芯针
- 中文 Methods、JSON、CSV、PNG 导出
- 键盘可访问 Tabs 与 Canvas 基本操作
- Cloudflare Pages `_headers` 安全响应头

## 项目结构

```text
project/
├── index.html
├── 404.html
├── robots.txt
├── _headers
├── assets/
│   ├── app.css
│   └── app.js
└── docs/
    └── MODEL.md
```

## 本地运行

可以直接双击 `index.html`。为了更接近 Cloudflare Pages 的真实同源环境，推荐在项目目录启动静态服务器：

```bash
python3 -m http.server 8000
```

然后访问 `http://localhost:8000/`。

## Cloudflare Pages 部署

### 方式 A：GitHub 集成（推荐长期维护）

1. 将 `project/` 中的文件提交到 GitHub 仓库根目录。
2. 在 Cloudflare Workers & Pages 中创建 Pages 项目并连接 GitHub 仓库。
3. 该项目没有构建步骤：Build command 留空；输出目录使用仓库根目录（具体 Dashboard 字段以当时 Cloudflare 界面为准）。
4. 首次部署后检查首页、404、分享链接、PNG/CSV/JSON 导出与响应头。

### 方式 B：Direct Upload

该项目是预构建静态资产，可以直接上传整个 `project/` 目录。使用 Wrangler 时可在父目录执行：

```bash
npx wrangler pages deploy project --project-name=<你的项目名>
```

也可以使用 Cloudflare Dashboard 的拖拽上传功能。

## GitHub 建议

- 默认分支建议设为 `main`。
- 每次功能修改使用独立分支和 Pull Request。
- 不要提交 `.env`、API Token、Cloudflare Token、GitHub Token。
- 本项目当前无 npm 依赖，因此不需要提交 `node_modules`。
- 若未来加入 CI，GitHub Actions 权限应从最小权限开始配置。

## 回滚

本交付包的 `../original/` 保存了修改前的 `index.html` 和 `README.md`。若要完全回退本次修改：

1. 在 GitHub 中 revert 本次提交，或恢复到修改前 commit；
2. 若尚未使用 Git，将 `original/index.html` 恢复为站点入口，并移除本次新增静态资源；
3. 在 Cloudflare Pages 中重新部署上一个已知正常版本，或使用 Dashboard 的历史 deployment 回滚能力（以账号当前界面为准）。

## 科学模型

详见 [`docs/MODEL.md`](docs/MODEL.md)。
