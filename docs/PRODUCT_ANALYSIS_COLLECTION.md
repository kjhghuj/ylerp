# 商品分析店铺日期采集部署与联调

ERP 商品分析工具栏的“采集店铺数据”使用独立的 `shopee-collector` 服务。ERP 保存店铺归属、任务和导入记录；采集器保存 Cookie、SQLite、原报表与加密密钥。

## 服务配置

1. 在 ERP `backend/.env` 配置 `COLLECTOR_PRIVATE_URL=http://collector:7790`、`COLLECTOR_SERVICE_TOKEN` 和 `ERP_IMPORT_SERVICE_TOKEN`。后两个值分别与采集器的 `ERP_COLLECTOR_SERVICE_TOKEN`、`ERP_IMPORT_SERVICE_TOKEN` 一致，使用两枚独立随机值。
2. 用 `docker-compose.prod.yml` 启动 ERP，运行 `prisma migrate deploy`。`importspool` 卷保存已经接收、仍待导入的原文件。部署脚本会在更新 API 容器前执行迁移。
3. 在采集器 `.env` 配置 `COLLECTOR_MODE=real`、上述两枚服务令牌、`ERP_IMPORT_BASE_URL=http://api:3002`。用 `docker compose -f docker-compose.yml -f docker-compose.erp.yml up -d --build` 启动。同主机部署时，ERP Compose 创建 `yangling-collector-private` 网络，采集器加入该网络。采集器的 `data/real/` 须随 SQLite、报表与 `credential.key` 一起备份。
4. HTTPS 网关仅对外转发采集器的 `/api/extension/pair`、`/api/extension/sync`（含 OPTIONS）。不要把采集器管理页面、`/api/erp/*` 或其他 `/api/*` 开到公网。前端构建参数 `COLLECTOR_GATEWAY_URL` 填网关根地址，弹窗会展示给扩展使用者。

ERP 接收 `/api/imports` 文件时会用私网接口再次确认采集器批次、任务、店铺、日期及原文件 SHA-256；因此两服务之间的私网和 `COLLECTOR_SERVICE_TOKEN` 在整个导入期间都必须可用。采集器暂时不可达时，原报表保留在采集器持久卷中，可用“仅重试入库”恢复。

## 真实会话身份校验

采集器要求 `SHOPEE_IDENTITY_PATH` 指向经过真实浏览器会话验证的 Shopee **只读店铺列表**接口，响应须包含 `data.shops` 或 `data.shop_list`，每项有 `shop_id` 与 `region`。采集器用 Cookie 请求该接口，并核对绑定的 ID 与站点。当前仓库没有可证明稳定的官方内部接口路径；在 PH、MY、SG 实际会话中确认并填写此路径以前，真实批次会拒绝启动。不要以页面 URL、目标 ID 回显或店名推断代替此检查。

## 验收顺序

1. 在每个站点建立 ERP 店铺，创建凭据来源，在扩展弹窗输入 ERP 页面地址、采集网关地址及一次性配对码，确认状态“已同步，待真实请求验证”。
2. 分别用 PH、MY、SG 各一份真实单日报表，对比自动解析与手工上传的商品、币种、日期和原始工作表快照。随后验证多日采集、已有日期跳过、重采内容不变、失败文件单独补传、入库后概览刷新。
3. 停启采集器与 ERP API，确认批次和 `PENDING` 导入任务恢复；检查原文件与 `importspool` 卷未丢失。

自动测试覆盖代码路径，不代替上述真实 Shopee 请求和生产网络联调。
