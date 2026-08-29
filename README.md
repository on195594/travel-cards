# Travel Cards

面向公开浏览的旅行攻略与分享卡片应用。管理员维护内容，Gemini AI Agent 可生成攻略草稿、基于现有攻略问答和调整行程，并通过 Google Search 生成带来源的建议。

## 当前阶段

- 阶段：Spec 已确定，尚未开始应用脚手架与依赖安装
- 项目载体：独立项目；现有 Hermes 项目没有相同产品边界
- 权威需求：[SPEC.md](./SPEC.md)
- Agent 工作约束：[AGENTS.md](./AGENTS.md)

## 首版技术边界

- Next.js App Router + TypeScript + Tailwind CSS
- MongoDB + Mongoose
- Auth.js 单管理员登录
- Gemini API（含 Google Search grounding）
- Cloudflare R2 图片存储
- 本地 Docker 作为首个运行目标

## 入口文件

应用尚未生成；实现后以 `src/app/`、`docker-compose.yml` 和 `package.json` 为主要入口。

## 预期验证命令

应用脚手架落地后至少提供：

```bash
npm test
npm run lint
npm run build
docker compose config
```

在实现前，不应声称这些命令已可运行。
