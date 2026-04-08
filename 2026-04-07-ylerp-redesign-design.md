# YLerp (跨境电商 ERP) 界面重构设计方案

## 1. 核心视觉语言

*   **风格**: 柔和卡片 (Soft Card) - 使用微圆角 (Slightly Rounded)，带来现代且友好的界面，降低企业级软件的刻板印象。
*   **色彩体系**: 
    *   **主色调 (Primary)**: 活力蓝 (Vibrant 蓝) - 契合电商关注转化与活力的属性。
    *   **背景色**: 灰底白卡 (Gray bg, White cards) - 确保内容模块间的清晰隔离，增加呼吸感。
    *   **反馈色**: 柔和透明 (Soft Tint) - 成功、警告、失败状态标签使用带轻微底色的透明样式，不喧宾夺主。
*   **深浅模式**: 支持深浅色 (Light/Dark Switch) 手动切换，兼顾不同工作环境和用户偏好。
*   **排版 (Typography)**: 平衡阅读型 (Balanced Reading) - 使用系统默认字体，字号 14-16px，保证通用性和阅读舒适度。
*   **图标设计**: 双色 (Duotone) 图标，增加细节层次感。
*   **动效 (Motion)**: 轻微过渡 (Subtle Transitions) - 在页面切换、弹窗、下拉菜单中加入 0.2s 左右的平滑过渡 (Smooth Fade)，提升品质感。

## 2. 布局与导航

*   **全局布局**: 顶部导航 (Top Nav) - 释放横向空间，便于长表格和复杂图表的展示。
*   **深层导航**: 悬浮抽屉菜单 (Floating Drawer Menu) - 应对多级菜单结构（如商品>变体>价格），节省空间且现代。
*   **用户中心与状态**: 顶部右侧展示 状态+头像 (Status + Avatar)，集成在线状态、未读消息等高密度信息。
*   **响应式适配**: 全响应式 (Full Responsive) - 虽然主要面向 Web 访问 (Web Only)，但保证在平板和移动端均能完美展示和操作。

## 3. 核心交互模式

*   **仪表盘 (Dashboard)**: 自由组合 (Masonry) - 用户可以自由拖拽组合卡片位置，甚至完全自定义仪表盘与表格。
*   **列表与表格**: 
    *   **展示**: 强网格 (Grid & Zebra) + 中等密度 (Medium Density)。
    *   **操作栏**: 折叠高级 (Folded Advanced) - 常规搜索/新建外露，复杂筛选折叠，保持页面整洁。
    *   **筛选与搜索**: 全局模糊搜索 (Global Fuzzy Search) 与 自定义视图 (Custom Views) - 允许保存常用筛选条件。
    *   **数据加载**: 标准分页条 (Standard Pagination) 结合 骨架屏 (Skeleton Screen) 与 骨架图表 (Skeleton Chart)。
    *   **编辑模式**: 全表批量编辑 (Full Batch Edit) - 提升熟练用户的录单效率。
    *   **删除确认**: 内联确认 (Inline Confirm) - 避免弹窗打扰。
*   **表单设计**: 
    *   **布局**: 顶部标签 (Top Labels)。
    *   **复杂表单**: 步骤条 (Stepper) 引导。
    *   **商品变体**: 独立子页/模态框 (Separate Subpage/Modal)。
    *   **图片/附件**: 拖拽与多图管理 (Drag & Drop, Multi-image) 和 缩略图预览 (Thumbnail Preview)。
    *   **提交反馈**: 全屏遮罩 (Full Screen Overlay) 防止重复提交，提交后 保留并可选 (Keep & Options)。

## 4. 业务模块特色设计

*   **财务报表**: 
    *   **图表风格**: 渐变/阴影 (Gradient & Shadow)。
    *   **对比分析**: 高级对比视图 (Advanced Comparison) - 支持跨周期多维度对比。
    *   **预测功能**: 多场景高级预测 (Advanced Scenario Prediction) - 用户可选开启。
*   **库存与供应链**: 
    *   **预警机制**: 预警中心 (Alert Center) - 统一管理缺货、延迟等风险。
    *   **采购管理**: 内部采购管理 (Internal PO Only)。
*   **订单与售后**:
    *   **物流跟踪**: 自动物流跟踪 (Auto Tracking API)。
    *   **退货处理**: 基础退货标记 (Basic Return Status)。
    *   **价格管理**: 直接覆盖 (Direct Override)。
*   **数据导出**: 格式化 Excel (Formatted Excel) 与 自定义报表与 PDF (Custom Reports & PDF)。
*   **数据导入**: 智能字段映射导入 (Smart Field Mapping Import)。

## 5. 系统支持与安全

*   **帮助体系**: 详细引导 (Detailed Walkthrough) 与 外部链接 (External Link)，结合 知识库与工单系统 (KB & Ticketing System)。
*   **容错与防呆**: 回收站/归档 (Recycle Bin/Archive) 机制。
*   **通知中心**: 圆角与动画吐司 (Rounded Toast w/ Animation)。
*   **权限管理**: 精细化与数据隔离 (Granular & Data Isolation)。
*   **审计日志**: 全方位操作审计 (Comprehensive Audit Log)。
*   **数据备份**: 自动定时快照 (Automated Snapshots)。
*   **国际化**: 基础多语言 (Basic Multilingual)。
*   **快捷键**: 无快捷键 (No Shortcuts)。
*   **主题控制**: 基础设置 (Basic Settings)。
