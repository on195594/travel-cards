# 备份与恢复契约

Travel Cards 与 Meemo 共用 MongoDB 服务，但只拥有其逻辑数据库 `travel_cards` 以及该数据库明确引用的 R2 对象。

## 所有权边界

- Travel Cards 负责自身 Web 服务、应用配置、`travel_cards` 逻辑数据库和获准使用的 Travel Cards R2 对象键。
- Meemo 负责共用 MongoDB 实例的生命周期、认证、网络和持久卷。
- 停止 Travel Cards 不得停止或删除 MongoDB。本仓库不得执行 `docker compose down -v`、全局 prune、实例级 `--drop`、认证变更、卷替换或 MongoDB 重建。
- 应用级备份最多短暂冻结 Travel Cards 写入；实例级或卷级恢复必须取得两个应用责任方的协调授权。
- dump 与 restore 必须指定精确的 Travel Cards 数据库或命名空间，不得覆盖其他数据库。

生产 Compose 项目名、MongoDB 容器身份和卷身份属于部署现场事实，不在源码中推断；执行生产操作时必须现场记录并核验。

## 隔离恢复 smoke

运行：

```bash
npm run test:recovery
```

包装脚本会创建带标签的一次性 MongoDB 容器和唯一数据库。仅当 run ID、容器标签、回环监听端口、容器名和数据库名全部一致时，恢复测试才会继续。测试验证：

- 两篇合成 Guide 的 ID、slug、状态、revision、slug 锁、时间戳、封面对象键和正文完整保留；
- 部分唯一 slug 索引及公开列表排序索引能通过 `mongodump`/`mongorestore` 恢复；
- 重复 slug 仍被拒绝，已撤回攻略不会出现在公开查询中；
- 本次运行专用的 sentinel 数据库及其自定义索引保持不变；
- 合成图片以真实字节完成备份和恢复，并校验大小与 SHA-256；manifest 记录合成 public base 映射，恢复后的 Guide URL 能读取这些字节，损坏副本无法通过校验。

测试结束后会删除临时归档与图片字节。该测试不读取 R2 凭证，也不访问 R2；通过只证明隔离恢复流程，不证明生产环境可恢复。

## 生产备份 manifest

每个生产恢复点必须不可变，且至少包含：

- 应用 commit 与不可变镜像 digest；
- MongoDB 镜像版本和 Database Tools 版本；
- 精确的逻辑数据库名；
- 已核验的 MongoDB 实例、网络和卷标识；
- R2 bucket、获准 prefix 和 public-base 身份；
- 每个对象的 key、字节长度和 SHA-256；
- 数据库归档的字节长度和 SHA-256；
- 恢复点时间及写入冻结区间。

manifest、归档、配置和对象字节必须以仅操作员可读的权限存放在仓库外。日志不得输出凭证、连接串或敏感环境变量。

## 授权门禁

以下均是独立的生产操作，不能由本 runbook 或 `npm run verify` 自动授权：

- 读取真实 R2 对象字节或修改 R2 配置；
- 冻结生产写入；
- dump 或 restore 共用生产 MongoDB；
- 修改共用网络、卷、认证、容器或代理配置；
- 部署恢复后的应用或执行切换。

只有在获准的 manifest 基础上，分别完成受保护 API、公开 UI 和引用图片字节核验后，生产恢复才算完成。在此之前，生产与真实 R2 恢复必须报告为 `BLOCKED_AUTH`，不能报告为 `PASS`。
