# Shopee 本地授权与推送接入

## 回调地址

- 店铺授权：`GET /api/shopee/callback`，校验授权状态、换取令牌，再由发起授权的 ERP 账号确认绑定。
- 推送接收：`POST /api/shopee/webhook`，用于控制台测试推送与通知接收。
- 推送地址只接受 POST。直接用浏览器 GET 打开返回 404，不代表 POST 不可用。

ngrok 转发到本地后端实际端口。当前开发配置使用 4022，公网策略只允许上述两个路径。
使用期间需保持本地后端和 ngrok 运行；公网域名变更时同步更新平台配置与下方环境变量。

## 后端配置

在被 Git 忽略的 `backend/.env` 中填写：

```dotenv
SHOPEE_WEBHOOK_URL=https://YOUR-NGROK-DOMAIN/api/shopee/webhook
SHOPEE_PUSH_PARTNER_KEY=
```

`SHOPEE_PUSH_PARTNER_KEY` 必须从当前控制台“测试推送合作伙伴密钥”字段直接复制。
它不是 ngrok Authtoken，也不自动沿用应用的 Partner Key。切换正式推送时配置正式环境对应的密钥和 URL。
保存环境变量后重启后端；`tsx watch` 不一定会因 `.env` 变化自动重启。

## 接收行为

接口在通用 JSON 解析器之前读取最多 256 KiB 的原始 JSON，不接受压缩请求。
用配置中的完整公网 URL、`|` 与原始请求体生成 HMAC-SHA256，按十六进制校验 Authorization。
请求中的 Host 或转发头不会参与构建签名 URL。

通过验签的 JSON 对象先原样保存至 `backend/.shopee-push-inbox/`，再返回空正文的 HTTP 200。
文件名根据回调 URL 与原始正文的 SHA-256 生成；同一通知的原样重试仅保留一个完整文件。
可通过 `SHOPEE_PUSH_INBOX_DIR` 指定私有保存目录。默认目录被 Git 忽略，不通过 HTTP 提供访问。
接收层不修改订单、商品或库存；后续业务同步需要另行实现消费者及业务级去重。

| 响应码 | 含义 |
| --- | --- |
| 200 | 签名有效，通知已保存或相同通知已存在 |
| 400 | 正文不是合法 JSON 对象或请求体损坏 |
| 401 | 签名缺失或不匹配；检查密钥和公网 URL 是否完全一致 |
| 413 | 请求体超过 256 KiB |
| 415 | 非 JSON 内容类型或使用了压缩编码 |
| 503 | 密钥／URL 未配置，或保存通知失败，发送方应重试 |

## 验证

排查控制台的非 2xx 提示时，可临时设置 `SHOPEE_PUSH_DIAGNOSTICS=1` 并重启。
`backend/.shopee-push-diagnostics.json` 只保留最近 20 次请求的时间、方法、状态码、失败原因、签名格式类别和正文长度。
不记录密钥、签名值、查询参数或正文内容；该文件被 Git 忽略，也不提供 HTTP 访问。排查结束后设为 `0`。

配置完成并重启后端后，在控制台对推送 URL 点击“验证并保存”。
本地自动测试使用虚构密钥，不会向真实店铺推送数据：

```powershell
cd backend
npm test -- --runInBand src/routes/__tests__/shopeeWebhook.test.ts src/routes/__tests__/shopeeRoutes.test.ts src/middleware/__tests__/productAtomicJsonMiddleware.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

## 店铺授权与令牌保存

用 owner 账号打开 ERP 的“个人中心 → Shopee 店铺授权”。当前本机入口是 `http://localhost:5174/#shopee`。
点击“授权一家店铺”，在弹出的虾皮页面完成登录与授权；返回后由 ERP 自动换取、确认并保存令牌。
如果弹窗没有自动关闭，点击回调页面的“返回 ERP 完成绑定”。使用发起授权的同一个 ERP 账号完成确认。

必要环境变量（值保存在被 Git 忽略的 `backend/.env`）：

- `SHOPEE_PARTNER_ID`、`SHOPEE_PARTNER_KEY`：应用 API 凭证，与推送密钥分别配置。
- `SHOPEE_API_BASE_URL`：测试为 `https://openplatform.sandbox.test-stable.shopee.sg`。
- `SHOPEE_REDIRECT_URL`：完整公网地址，以 `/api/shopee/callback` 结尾；平台 Redirect URL Domain 配置对应的 HTTPS 域名。
- `SHOPEE_FRONTEND_URL`：实际打开的 ERP 前端来源，例如 `http://localhost:5174`。端口或主机名变化后同步修改并重启后端。
- `SHOPEE_TOKEN_ENCRYPTION_KEY`：独立随机密钥，至少 32 字符。需妥善备份；替换后已有密文无法解密。

数据库迁移增加 `ShopeeAuthSession` 和 `ShopeeConnection`。令牌使用 AES-256-GCM 加密，API 只返回店铺及有效期等元数据。
一次授权有效期为 10 分钟。回调后还须使用 ERP 登录身份和回调页面的一次性证明确认归属，避免授权链接转发造成错绑。
后端每分钟检查待刷新令牌，通常在到期前 5 分钟刷新，并保存更新后的 access_token 和 refresh_token。
电脑休眠或服务停止期间无法刷新；过期或平台撤销授权时可能需要重新授权。

当前入口支持逐店授权；收到 `main_account_id` 的主账号批量授权会给出提示，尚未实现 merchant 级令牌与店铺展开。
当前配置使用 Test Partner 凭证，先用沙箱测试店铺验证。正式店铺接入须使用正式环境、正式凭证及平台要求的授权资格。
推送验证成功只表示推送通路正常，不代表店铺已授权，也不会自动同步订单或商品。

验证命令：

```powershell
cd backend
npm test -- --runInBand src/services/__tests__/shopeeAuthorization.test.ts src/routes/__tests__/shopeeRoutes.test.ts src/routes/__tests__/shopeeWebhook.test.ts
node node_modules/typescript/bin/tsc --noEmit
cd ../frontend
npm test -- __tests__/ShopeeConnections.test.tsx __tests__/PersonalCenter.test.tsx
npm run build
```

### 2026-09-04 恢复检查

崩溃后已确认数据库 28 项迁移全部应用，并恢复本地后端及受路径策略限制的 ngrok。
原测试域名 `partner.test-stable.shopeemobile.com` 对当前凭证返回 `error_sign`；换成新版 Sandbox v2 域名后，同一签名被接受并返回 HTTP 302，跳转至 `open.sandbox.test-stable.shopee.com`。
参考 SDK 维护者的域名迁移记录：https://github.com/laraditz/shopee/blob/master/CHANGELOG.md 。
本地已更新 API base URL，保持 Partner Key 不变。正式店铺授权及真实令牌换取仍需用户完成虾皮登录后验证。
