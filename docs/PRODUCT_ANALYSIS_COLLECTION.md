# ERP 内置商品分析采集

商品分析的采集功能由 ERP API 进程内的任务队列执行。启动 ERP 后端即可使用，不再依赖相邻的 shopee-collector 项目、7790 端口或 COLLECTOR_PRIVATE_URL / COLLECTOR_SERVICE_TOKEN。

## 使用

1. 在商品分析中选择 ERP 店铺，打开“采集店铺数据”。粘贴 Cookie-Editor JSON、单独填写 SPC_CDS 和 Shopee 店铺 ID，停止输入约 0.8 秒后自动保存。店铺 ID 按 ERP 店铺分别记忆。
2. 选择日期并开始采集。当前支持 PH、MY、SG 的商品表现日报，最多 366 天，截止站点当地昨天。默认跳过 ERP 已有日报的日期。
3. 采集直接用提供的凭据请求 Shopee 导出接口，不请求店铺身份接口。每个站点提交导出至少间隔 70 秒。
4. 下载后校验 XLSX 与 SHA-256，再直接交给 ERP 入库队列。只有确认入库成功才显示“已入库”。在概览、商品列表和数据日历查看对应店铺及日期的数据。
5. 在采集任务的日期行点击“下载原始报表”，由 ERP 登录权限、店铺归属与文件校验保护下载。失败但有原报表的任务可“仅重试入库”。

## 代码与存储

- backend/src/collector/：Shopee HTTP 适配器、加密凭据、SQLite 队列、限速、文件校验、批次和后台执行器。没有独立 HTTP 服务器、管理页面、浏览器扩展或 Playwright 依赖。
- backend/src/services/productAnalysisCollectorClient.ts：调用内置采集模块。保留原业务调用接口，避免影响现有店铺绑定和任务记录。
- backend/src/services/productAnalysisImportService.ts：内部采集与原 HTTP 兼容端点共享的入库验证、幂等受理和解析逻辑。内部入库不经过 HTTP，不需要服务令牌。
- 原始 Excel、任务数据库和 credential.key 默认保存在 backend/data/product-analysis-collector/。分析数据和 ERP 导入记录仍保存在 ERP PostgreSQL 数据库。
- 入库暂存目录仍为 backend/import-spool/，可用 PRODUCT_ANALYSIS_IMPORT_DIR 指定。

本机请在 backend 目录启动 npm run dev。运行时需 Node.js 22.5 或以上版本。可以用 PRODUCT_ANALYSIS_COLLECTOR_DIR 指定采集数据目录；启动后不要在任务执行中切换该目录。

Docker Compose 为 API 挂载 collectordata 卷到 /app/collector-data，并保留 importspool 卷。只需部署 ERP，不需要采集器容器或额外私网。采集模块按单个 ERP API 实例运行，同一数据目录有进程锁，避免两个后端同时领取任务。

原 /api/imports HTTP 端点保留兼容能力；只有需要外部调用该端点时才配置 ERP_IMPORT_SERVICE_TOKEN。ERP 内部采集与入库不使用它。

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
