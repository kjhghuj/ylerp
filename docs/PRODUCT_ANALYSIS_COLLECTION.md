# ERP 内置商品分析采集

商品分析的采集功能由 ERP API 进程内的任务队列执行。启动 ERP 后端即可使用，不再依赖相邻的 shopee-collector 项目、7790 端口或 COLLECTOR_PRIVATE_URL / COLLECTOR_SERVICE_TOKEN。

## 使用

1. 在商品分析中选择 ERP 店铺，打开“采集店铺数据” → “凭据详情”。填写 Shopee 店铺 ID，点击“保存店铺绑定”；不需要先填写 Cookie。店铺 ID 按 ERP 店铺分别记忆。
2. 在浏览器插件中点击“开始同步”，即可更新本 ERP 账号下所有店铺共用的 Cookie 和 SPC_CDS。ERP 会在后台检查所有店铺最近 30 个完整日期，补采并入库缺失日期；已有有效日报直接跳过，不采集今天。页面关闭或后端重启不会丢失已登记的补漏工作。未绑定或不支持的店铺单独提示，其他店铺继续执行。
3. 商品分析工具栏和采集窗口显示“今日已同步”、“今日未同步 · 最近同步：…”或“尚未通过插件同步”。这里指插件凭据上传成功，按北京时间判断，商品数据补齐情况另行展示。相同凭据再次上传也更新插件同步时间。
4. “凭据详情”默认收起“手动输入凭据（备用）”。需要时展开，粘贴 Cookie-Editor JSON、单独填写 SPC_CDS，停止输入约 0.8 秒后自动保存。手动保存不计为插件今日同步，也不自动启动全店铺补漏。
5. 仍可选择日期并手动开始采集。当前支持 Shopee PH、MY、SG 的商品表现日报，最多 366 天，截止站点当地昨天。默认跳过 ERP 已有日报的日期；入库时再次检查已有数据，保护采集期间新增的日报。勾选“重新采集已有日期”时允许追加新版本。
6. 采集直接用提供的凭据请求 Shopee 导出接口，不请求店铺身份接口。每个站点提交导出至少间隔 70 秒。重复插件同步合并未结束的补漏工作；已有采集任务结束后再补查缺口。暂停任务保持暂停，需手动继续；取消后本轮自动补漏停止，失败可重试任务或再次通过插件同步。
7. 下载后校验 XLSX 与 SHA-256，再直接交给 ERP 入库队列。只有确认入库成功才显示“已入库”。在概览、商品列表和数据日历查看对应店铺及日期的数据。
8. 在采集任务的日期行点击“下载原始报表”，由 ERP 登录权限、店铺归属与文件校验保护下载。失败但有原报表的任务可“仅重试入库”。

## 代码与存储

- backend/src/collector/：Shopee HTTP 适配器、加密凭据、SQLite 队列、限速、文件校验、批次和后台执行器。没有独立 HTTP 服务器、管理页面、浏览器扩展或 Playwright 依赖。
- backend/src/services/productAnalysisCollectorClient.ts：调用内置采集模块。保留原业务调用接口，避免影响现有店铺绑定和任务记录。
- backend/src/services/productAnalysisImportService.ts：内部采集与原 HTTP 兼容端点共享的入库验证、幂等受理和解析逻辑。内部入库不经过 HTTP，不需要服务令牌。
- backend/src/services/productAnalysisBackfill.ts：插件同步时间、账号隔离的状态查询和持久化补漏执行器。PostgreSQL 保存账号同步记录及各店铺的补漏区间、进度和关联任务；后台每 4 秒检查待处理工作。
- 原始 Excel、任务数据库和 credential.key 默认保存在 backend/data/product-analysis-collector/。分析数据和 ERP 导入记录仍保存在 ERP PostgreSQL 数据库。
- 入库暂存目录仍为 backend/import-spool/，可用 PRODUCT_ANALYSIS_IMPORT_DIR 指定。

本机请在 backend 目录启动 npm run dev。运行时需 Node.js 22.5 或以上版本。可以用 PRODUCT_ANALYSIS_COLLECTOR_DIR 指定采集数据目录；启动后不要在任务执行中切换该目录。

Docker Compose 为 API 挂载 collectordata 卷到 /app/collector-data，并保留 importspool 卷。只需部署 ERP，不需要采集器容器或额外私网。采集模块按单个 ERP API 实例运行，同一数据目录有进程锁，避免两个后端同时领取任务。

原 /api/imports HTTP 端点保留兼容能力；只有需要外部调用该端点时才配置 ERP_IMPORT_SERVICE_TOKEN。ERP 内部采集与入库不使用它。

凭据上传接口保持现有插件兼容；可选 `source` 字段为 `plugin` 或 `manual`，缺省按插件处理。`GET /api/product-analysis/collector-sync-status` 只返回当前账号的插件同步时间和店铺补漏状态，不返回 Cookie 或 SPC_CDS。更新后端前须应用 `20261003090000_product_analysis_backfill` 迁移并重新生成 Prisma Client。

## 从旧采集器迁移

在切换 ERP 内置采集代码之前，从 backend 目录执行：

```powershell
npm run collector:migrate -- C:/Users/admin/Desktop/shopee-collector/data/erp-local/real
```

第二个参数可指定 ERP 目标目录，默认读取 PRODUCT_ANALYSIS_COLLECTOR_DIR 或使用 backend/data/product-analysis-collector。只迁移 ERP 原来使用的 real 数据目录，避免混入独立采集器的其他任务。

迁移工具会暂停旧队列、拒绝迁移执行中的任务、生成包含 WAL 内容的数据库快照、复制密钥与报表、验证凭据解密和报表 SHA-256、修正 tasks/downloads 的文件路径。连接 ID、批次 ID、任务 ID、导入引用保持不变，因此不需要重新粘贴凭据或重新导入已完成日报。目标目录已存在时拒绝覆盖。失败时恢复原队列的暂停状态，并保留迁移暂存目录便于排查。

迁移成功后旧队列保持暂停，停止旧采集服务，再启动 ERP 内置队列。旧项目的数据保留作为回退副本；不要让两套队列同时运行。备份时应一起备份 ERP PostgreSQL、collectordata（包括 credential.key）与 importspool。

## 验证

自动测试覆盖直接凭据导出、内部入库接口、任务控制、文件下载归属、数据迁移与凭据解密。部署后再用实际单日报表验证商品、日期、币种及入库结果。采集提交结果不明且没有 report_id 时，仍需要人工核实；不会盲目重复导出。

前端交互验收页：开发服务器下打开 `/__tests__/fixtures/collection.html`。该页使用隔离的模拟数据与 API 适配器，可检查凭据延迟读取、弹窗焦点和窄屏布局，不会请求真实店铺接口。
