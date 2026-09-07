# 使用统计 v2

使用统计 v2 将可信的新记录与未核验历史分开。页面主指标只读取 `UsageEvent` 和
`AiUsageCall` 中 `provenance=native` 的记录；旧 `UserActivity`、
`ChromaGenerationRecord` 只出现在“历史参考”和历史明细中。

## 上线步骤

1. 备份 PostgreSQL 数据库。
2. 配置长度至少 32 位且未公开的 `JWT_SECRET`。服务不再接受默认密钥；更换密钥后旧令牌
   会失效，所有账号需要重新登录。
3. 执行 Prisma 迁移 `20260905090000_usage_statistics`，确认新增两张账本表和约束。
4. 发布后端，再发布前端。旧 `/api/usage/stats` 和 `/timeline` 保留兼容响应。
5. 先运行 `npm run usage:history`。这是只读核对，会按账号和北京时间日期输出原始活动、
   原始生成记录、当前图库数量和异常金额，且不会猜测重复或缺失。
6. 审阅核对结果后，如需保留可追溯副本，运行
   `npx tsx scripts/usageHistory.ts --apply --batch <唯一批次名>`。导入可重复执行，
   通过原始表名和原始 ID 去重，不修改或删除旧表。

主报表统一使用 `Asia/Shanghai`，近 N 天包含今天，费用为人民币预估值。未计价、处理中、
失败和结果未知分别展示；未知费用不按零元解释。图库数量是当前存量，删除图片不会改变
账本中的历史生成数量和费用。

## 权限和运维

所有者可查看和导出。管理员必须具有 `usage-stats.view` 才能查看，并同时具有
`usage-stats.export` 才能导出。接口每次请求都会从数据库重新检查角色、启用状态和权限。

`GET /api/usage/report` 的 `quality` 字段提供未计价调用、超过 15 分钟仍处于 pending 的调用、
结果未知调用和旧记录数量，可由现有监控按非零值告警，不依赖 Redis。直接清空活动记录的
接口已返回 410，审计账本只能通过受控的数据保留流程处理。

若服务位于反向代理后，仅把代理自身的明确 IP/CIDR 写入 `TRUSTED_PROXY_CIDRS`；留空时
Express 会忽略客户端伪造的转发 IP 头。

AI 接口按账号即时复核启用状态和模块权限，并由 `AI_CALLS_PER_MINUTE`、
`AI_MAX_CONCURRENT_CALLS`、`AI_DAILY_CALL_LIMIT` 控制速率、并发和每日调用量。商品分析
GLM 的人民币单次预估价通过 `GLM_ESTIMATED_COST_CNY` 配置；未配置时明确记为“未计价”，
不按零元处理。

## 回退

前端可回退到旧版本，兼容接口继续工作。不要删除两张新账本表：回退期间已经产生的记录
仍需保留，以便再次发布后继续对账。
