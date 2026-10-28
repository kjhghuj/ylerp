# 阳零 ERP UI 迁移清单

技术基线：React 18.3.1、Tailwind 3.4.19 本地编译、shadcn/ui v3 New York、Radix。
基础源码、上游哈希与本地适配约定见 [组件规范](ui-migration-components.md) 和
[来源清单](ui-migration-components.json)。验证结果与局限见 [QA 报告](ui-migration-qa.md)。

| 页面 / 公共层 | 已迁移范围 | 保护的业务行为 |
|---|---|---|
| 登录与应用外壳 | Card 表单、顶部导航、手机 Sheet、用户 Dropdown、主题入口 | 登录恢复、角色权限、语言和原有主题存储键 |
| 商品明细 | 筛选工具栏、Table、分页、分组与同步 Dialog、删除确认 | 搜索、多选、分组、同步请求、失败不丢失记录 |
| 仪表盘 | 页面头、统计卡、库存表和操作 | 金额、汇率、库存和预警口径 |
| 使用统计 | 筛选、统计卡、Table 和加载状态 | 原始成本精度和统计权限 |
| 个人中心 | Tabs、资料与配置表单、连接设置 | 偏好、遮罩凭据、API 配置意图 |
| 用户管理 | Table、权限 Checkbox、创建/密码 Dialog、删除 AlertDialog | owner/admin/viewer、提交锁、错误保留草稿、删除后焦点 |
| 利润计算 | Input、参数卡、目标定价 Dialog、利润明细 Sheet | 字符串金额草稿、失焦精度、换算、保存意图与迟到响应隔离 |
| 财务管理 | 表单、日期/月选择 Dialog、身份确认、图表容器 | 本地日期字符串、重复提交锁、确认期间禁止关闭、卸载后忽略确认结果 |
| 补货 V3 | 店铺 Popover、参数/历史 Sheet、Table、计划保存 Dialog | 同站点限制、未知库存、过期结果、409/revision、安全保存 |
| 商品分析 | 模块自定义主题映射、筛选、列表/分页、详情 Tabs、采集/凭据嵌套 Dialog、AI 面板 | 主题偏好、上传覆写/删除一致性、跨店铺旧请求隔离、流式输出、补货跳转 |
| 日程 | 新增/编辑/完成 Dialog 和可键盘操作卡片 | 拖动、长按、创建锁、本地日期和失败保留草稿 |
| 图片制作 | 模式 Tabs、上传/帮助、模型 Dropdown、历史 Sheet、预览 Dialog、比较 Slider | 上传移除、鼠标/触屏/键盘比较、异步任务、历史与下载 |
| 共享 UI | 27 个基础组件、NativeSelect、UIThemeScope、PageHeader、Toast 适配 | React 18 refs、受控弹窗焦点、Portal 模块主题、showToast 兼容 |
| 样式清理 | 删除 Tailwind CDN/importmap、全局深色补丁、失效旧焦点锁 | 兼容 CSS 变量映射仍供业务自定义布局使用 |
| 发布保护 | CI、范围分类、SHA Web 镜像、静态资源/API 只读冒烟与 Web 回滚 | 纯 UI 不重启 API、不执行数据库迁移 |

没有引入新路由、全局状态、表单或表格状态框架。业务自定义计算、图表与宽表格滚动逻辑保留；
已有 CSS 变量兼容映射仍被业务布局使用，不作为废弃代码机械删除。

## 发布与回滚操作

生产入口仍为 `.github/workflows/deploy-production.yml`，先经过 UI quality 门禁。
自动分类以提交差异判断范围；手动运行可显式选择 `web` 或 `full`。
UI 批次选 `web`。`scripts/deploy-production.sh` 校验 main 上的已验证 SHA、串行构建、
保留旧镜像并运行只读冒烟。自动错误处理只恢复 Web 镜像。

人工恢复上一 Web 镜像时，在服务器原项目目录确认实际镜像标签后执行：

```sh
docker image inspect ylerp-web:rollback-<失败部署SHA>
YLERP_WEB_IMAGE=ylerp-web:rollback-<失败部署SHA> docker compose -f docker-compose.prod.yml up -d --no-deps --no-build web
```

随后执行部署脚本同等的入口、全部静态资源、API health 和未登录401冒烟。
此流程不能回滚 `full` 发布中的 API 或数据库变化。没有上一镜像的首次部署需要人工处理。
本次交付未执行生产发布；当前机器 Docker daemon 不可用，真实容器回滚演练仍待隔离环境验证。
