# 利润计算布局与 Select 收尾验收

验收日期：2026-10-30（Asia/Singapore，UTC+8）。本记录复核并归档工作区已有的最终测试结果，未重复运行已通过的测试。最新利润页浏览器日志完成于 15:22，全模块导航完成于 15:23。

## 本轮修改

- 利润摘要按内容撑开，长名称、大金额、负利润和利润率/ROI 换行不再挤压相邻区域；节点标题和删除按钮适配窄屏。
- 供应商开票、添加节点的平台、目标定价参考节点、TikTok 费率与物流选择使用 shadcn/Radix Select，保留数值、手动值和未知值语义、禁用态、校验描述及关闭后焦点恢复。
- 深色节点标题采用主题背景；超长参考节点名称在菜单内换行，菜单限制在视口内。
- 导航测试等待主界面就绪和移动导航 Sheet 退出后的焦点恢复，避免 WebKit 输入与导航关闭竞态；增加商品名称持久化断言。

## 验证结果

| 检查 | 结果 | 归档证据 |
|---|---|---|
| 前端全量单测 | 1246 通过、1 条原有跳过、0 失败 | [Vitest 原始 JSON](validation/vitest.json) |
| 类型检查 | 通过 | [日志](validation/typecheck.txt) |
| 生产构建 | 通过；保留大于 500 kB 的 chunk 提示 | [日志](validation/build.txt) |
| 迁移涉及源文件 lint | 0 错误、85 条警告 | [日志](validation/source-lint.txt) |
| 最终浏览器测试相关文件 lint | 通过，无输出 | [日志](validation/e2e-lint.txt) |
| UI class guard | 通过 | [日志](validation/class-guard.txt) |
| 利润页浏览器验收 | 29/29 通过，44.5 秒 | [完整日志](validation/profit-browser.txt) |
| 两组全模块导航 | 2/2 通过，8.9 秒 | [完整日志](validation/navigation-browser.txt) |

利润页用例包含 Chromium 的 1920、1440、1366、768、390px 明暗主题布局，390px 触摸交互，五个 TikTok 站点数值选择，以及 Chromium/Firefox/WebKit 的标记跨浏览器用例。29 条通过不代表所有用例均在三个浏览器运行。

| 全模块导航（Chromium，浅色） | 页面 | 页面级横向溢出 | 未匹配 API / 记录的运行时错误 | 原始记录 |
|---|---|---|---|---|
| 桌面 1440×1024 | 11/11 | 无 | 无 | [timings.json](navigation/1440/timings.json) |
| 手机 390×844 | 11/11 | 无 | 无 | [timings.json](navigation/390/timings.json) |

11 个页面为总览仪表盘、利润计算、商品明细表、财务管理、店铺补货、图片制作、日程管理、商品分析、使用统计、用户管理及个人中心。每个页面截图位于 [1440px](navigation/1440/) 和 [390px](navigation/390/) 目录。导航是隔离 API fixture 下的兼容验收，不是生产 API 联调；记录的错误范围以 `frontend/e2e/fixtures.ts` 为准。固定 fixture 时钟使 ResourceTiming 数组为空，不能据此推断网络开销。

## 关键截图

截图为当时滚动位置的页面视口；`fullPage` 不会展开应用内部滚动容器。手机首屏图用于核对顶部布局，卡片几何边界与区域不重叠由浏览器断言验证，另附滚动至利润区的触摸场景截图。

| 场景 | 浅色 | 深色 |
|---|---|---|
| 1440px 利润页 | [截图](screenshots/profit-1440-light.png) | [截图](screenshots/profit-1440-dark.png) |
| 390px 利润页首屏 | [截图](screenshots/profit-390-light.png) | [截图](screenshots/profit-390-dark.png) |
| 390px 超长参考名称菜单 | [截图](screenshots/reference-mobile-light.png) | [截图](screenshots/reference-mobile-dark.png) |
| 390px 大金额触摸场景（含焦点提示） | [截图](screenshots/profit-mobile-stress-light.png) | [截图](screenshots/profit-mobile-stress-dark.png) |

- [桌面长名称、大金额和负利润](screenshots/profit-desktop-stress.png)
- [TikTok USD 物流与费率选择结果](screenshots/tiktok-usd.png)

本次人工复核查看了桌面深色、手机浅色首屏、手机深色长参考菜单、桌面压力场景及手机深色利润区；未重新逐张人工审查所有模块截图。

## 复现

在 `frontend` 目录执行：

```powershell
npm test -- --reporter=json --outputFile=../.tmp/profit-layout-recheck-vitest.json
npm run typecheck
npm run build
node scripts/lint-ui-changes.mjs
node node_modules/eslint/bin/eslint.js e2e/fixtures.ts e2e/profit-selects.spec.ts e2e/profit-layout.spec.ts e2e/profit-node-fixtures.ts
node scripts/check-ui-classes.mjs
$env:UI_ARTIFACT_DIR = '../.tmp/profit-layout-recheck'
npm run test:e2e -- e2e/profit-layout.spec.ts e2e/profit-selects.spec.ts
$env:UI_CAPTURE = '1'
$env:UI_ARTIFACT_DIR = '../.tmp/profit-layout-nav-recheck'
npm run test:e2e -- e2e/ui-migration.spec.ts --project=chromium --grep 'all modules (1440|390) light'
Remove-Item Env:UI_CAPTURE,Env:UI_ARTIFACT_DIR
```

Playwright 默认通过 loopback preview 服务读取本地构建，业务 API 使用 fixture。无需生产账号或生产写入。

## 归档与提交范围

[manifest.json](manifest.json) 保存归档文件的原始位置、大小及 SHA-256，截图与日志以复制方式归档，未重新生成。全量单测和构建记录早于最后的浏览器测试辅助代码调整；业务源文件在对应检查前已完成修改，最终辅助代码随后通过类型检查、lint 和上述浏览器验收。

提交包含利润页业务修改、对应组件测试、浏览器用例和本验收资料。工作区临时构建、历史补丁脚本、临时表格等不在本轮提交范围。本轮只进行本地提交，未部署生产。
