# 全站下拉选择组件统一：源码审核与实施计划

日期：2026-11-03（Asia/Singapore）。项目根目录：`C:\Users\admin\Desktop\yangling-erp`。

**交接用途：供另一位 AI 执行；本轮仅审查与编写计划，没有修改业务代码。**

## 1. 目标、依据与可信边界

将全站业务下拉选择统一为利润页同族的 shadcn/Radix 视觉及可访问交互。覆盖剩余原生单选、手写 SKU 单选、图片模块的两组模型单选，以及模型名称的自由输入建议框。保留多选、自由输入、复合编辑和动作菜单各自的语义，不能为统一外观删掉能力。

本计划由三个独立只读审核方向提供事实：调用库存、组件/API 契约、测试覆盖；阶段安排和技术方案由主审核者综合。所有位置以当前读取源码为依据，行号仅为定位起点，执行时需复查函数/标记与文件哈希。

- 已读取项目及祖先目录的适用指令文件探测结果；未发现适用 `AGENTS.md`。执行者仍需在开始时重新探测。
- 已核实 HEAD：`9e37839a0455eaee98e3134272a804b748170315`，但本次 Git 工作树状态查询报工作树/权限错误。**未证实工作树干净，禁止 reset/clean/覆盖用户改动或擅自修 Git 配置。**源码文件内容及附录哈希是更直接的审查依据。
- 已执行当前类型检查：`node node_modules/typescript/bin/tsc --noEmit --incremental false`，通过。
- 已执行 Playwright `test --list --reporter=list`：枚举 **62 tests in 5 files**。这是枚举成功，不是测试执行通过。
- 已读取 Vitest CLI 帮助及配置，确认 `--reporter`、`--outputFile` 等参数存在。本轮没有运行全量测试、浏览器交互或构建；历史的 1246 单测与 29 浏览器用例通过记录不能冒充当前结果或新方案的验证结果。
- 下面的自动化验收是实施后的强制要求；计划审核通过不等于迁移已经通过。对“没有错误/漏洞”的可验证表述是：审查中发现的问题均有明确处置和验收条件，不承诺软件绝对无缺陷。

## 2. Phase 0：先读实际文档和示例，再动代码

### 2.1 必须读取的本地来源

| 来源 | 需要复制/保留的实际契约 |
|---|---|
| `docs/ui-migration-components.md` | React 18、Tailwind 3、本地主题变量、控件/Portal 层级、受控弹层和焦点恢复；文中 NativeSelect 兼容说明在迁移完成后需要更新 |
| `frontend/components/ui/select.tsx:14-17,20-24,26-44,96-139,158-181` | 本地 `Select/SelectValue/SelectTrigger/SelectContent/SelectItem`；Trigger forwardRef；Content 通过主题 Portal；不要重新运行 latest CLI 覆盖文件 |
| `frontend/components/ui/theme-scope.tsx` | 模块主题的 body-level Portal host；不要绕过共享包装器改用裸 `document.body` Portal |
| `frontend/modules/profit/GlobalInputsPanel.tsx:144-151` | value setter 代替伪造 DOM ChangeEvent |
| `frontend/modules/ProfitCalculator.tsx:195` | 业务校验清理仍由调用方负责，例如开票选择清除对应错误 |
| `frontend/modules/profit/TargetPricingPanel.tsx:125-133` | 真正未选的占位、disabled，以及 Trigger/Content/Viewport/Item 长文本宽度限制 |
| `frontend/modules/PlatformCard.tsx:40-59` | 数值枚举仅对已知且可选项转换；manual/unknown 不转成 NaN |
| `frontend/__tests__/GlobalInputsPanel.selects.test.tsx:33-82` | 回调次数、焦点、无意外表单提交、不改金额/草稿的交互测试 |
| `frontend/__tests__/TargetPricingPanel.test.tsx:170`、`AddNodeMenu.us.test.tsx:63` | 嵌套选择框第一次 Escape 只关内层、第二次关外层 |
| `frontend/e2e/profit-selects.spec.ts:54-102`、`frontend/e2e/fixtures.ts:97` | 键盘/焦点、视口边界、导航 Sheet 退出生命周期、严格 API fixture |

本机 `package.json`、`package-lock.json` 与已安装包均为 `@radix-ui/react-select 2.4.1`。需要核对的安装源码是 `frontend/node_modules/@radix-ui/react-select/dist/index.js` 与 `index.d.ts`，不是其他版本的印象：

- `.d.ts:39-42`：`value?: string`、`onValueChange(value: string)`；Item 的 `value: string`。
- `.js:278`：Trigger 是 `type="button"`；`:569-571`：关闭后恢复 Trigger 焦点。
- `.js:913-938`：当前版本空 Item 不抛旧版本那种异常；`:1276-1277` 仍将 `''` 视为占位，`:1056` 不把已选空项文字放进 Trigger。
- 审核者做过不写文件的 jsdom 实证：`Root value='' + Item value=''` 能选中、不抛错，但 Trigger 显示 placeholder 而非“全部”标签。因此必须解决的是**已选空业务值与未选状态混同**，不能把旧版“空 Item 必崩溃”写成事实。
- `.js:175,233-240,1199-1265`：表单桥可能生成不可访问的原生 select，不能把运行时 DOM 中所有 select 都视为迁移遗漏。
- 另一项不写文件的 jsdom 实证：Root 不传 name 时，选择 `v:user` 仍会使匿名隐藏 select 向父 form 冒泡该编码值，但 `FormData=[]`。因此“省略 name”只隔离表单序列化，不能保证所有原生事件都没有内部编码。当前 AST 审核确认 17 个活动 NativeSelect 都没有 name/form/required，components/modules 中没有 form 级 onChange/onInput/onReset 消费者；新增消费者必须先复查契约。

### 2.2 外部一手参考与 Allowed APIs

- [shadcn v3 Select 用法](https://v3.shadcn.com/docs/components/select)：核对组件组合，沿用仓库的 React 18/Tailwind 3 实现。
- [Radix Select API](https://www.radix-ui.com/primitives/docs/components/select)：核对受控值、Item、disabled、Trigger 与键盘交互；安装源码决定版本特有行为。
- [WAI-ARIA APG Combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)：模型建议框采用 editable、手动接受建议的模式，保留任意输入与标准文本编辑。

可使用：本地 `Select` 原语、`Input`、`Label`、`Popover`、`PopoverAnchor`、`Checkbox`、`React.forwardRef<HTMLButtonElement>`、`onValueChange(string)`、已经存在的业务 setter。本地 `components/ui/popover.tsx:20,41` 已定义并导出 PopoverAnchor。模型建议框可用当前本地 Input/Popover 包装器配合 APG 模式实现，不需要新增依赖。不得假设项目已安装 `cmdk` 或存在 `Command/Combobox` 组件，不得凭空引用它们。

Phase 0 产物：确认版本、记录当前完整调用清单和基线检查、证明没有遗漏的其他生产选择器。若源码与清单有变化，先更新清单，不按过期行号直接批量替换。

## 3. 全量调用清单：逐项核销，不按匹配行数宣称完成

初始清单为 **14 个文件、18 处 NativeSelect JSX 调用**；其中 `CalcInputs.SelectInput` 无消费者，因此为 **17 个活动字段 + 1 处死导出内部字段**。另有 native-select.tsx 内部的原生 select 实现，不计入 18。

下表路径均相对 `frontend/`。每一行对应一个迁移验收对象，不得合并后丢失其副作用。

| ID | 文件与定位 | 必须保留的值域、事件和限制 |
|---|---|---|
| N01 | `components/CalcInputs.tsx:296-307` | `SelectInput` 全源码检索只有定义；删除死导出及其仅由该导出使用的 NativeSelect/ChevronRight import，先核实 import 是否另有使用；不要制造 ChangeEvent 兼容层 |
| N02 | `modules/PersonalCenter.tsx:616-627,299-309` | 服务商；`''` 是未选/手动配置，**不是 custom**；调用原 `handleAiProviderChange`；已知预设填 baseURL/model，custom/空值保留手填值；aiLoading/aiSaving 禁用；不改密钥、不自动保存 |
| N03 | `modules/ProductList.tsx:1158-1165,170,406,413-419,1121` | 归组 Dialog 动态 ID；打开默认组逻辑保留；`groupSelectRef` 从 HTMLSelectElement 改为 HTMLButtonElement 并挂 Trigger，保留 onOpenAutoFocus；空组不自动提交，只有保存按钮发 POST |
| N04 | `modules/UsageStats.tsx:98` | period：7/30/90/365/custom，字符串；变更重置明细页 1 |
| N05 | `modules/UsageStats.tsx:100` | userId：`''`=全部账号，动态 accounts；查询仍省略空参数；变更重置页 1 |
| N06 | `modules/UsageStats.tsx:101` | module：`''`=全部模块；保留服务端未知模块合并，不限制为静态标签；变更重置页 1 |
| N07 | `modules/UsageStats.tsx:102` | status：`''`=全部结果；枚举 USAGE_STATUSES；变更重置页 1 |
| N08 | `modules/UsageStats.tsx:122` | kind：all/event/ai/legacy/rebuilt；变更重置页 1；与前四项共用的 change(:76) 还用于日期 Input，需拆值回调与 Input 事件适配，不能破坏日期输入 |
| N09 | `modules/UserManagement.tsx:244-255` | 行内角色 admin/viewer；保留只有 owner 对非自己目标显示的条件；仅真实用户选择才进入 handleUpdateRole，打开、取消、挂载、回显不得发权限修改请求 |
| N10 | `modules/user-management/CreateUserModal.tsx:14,17-21,27` | 新用户角色默认 viewer，仅更新 form.role；保留其余字段、提交锁和显式表单提交；Label htmlFor=create-role 关联 Trigger |
| N11 | `modules/restock-v3/components/Toolbar.tsx:49-50,93-97` | 库存池 `null ↔ ''`，空项显示“整站仓库（默认）”；UI value 用 poolId??''，回业务用 value||null；按站点过滤；planSaving 禁用，不因选项刷新自动切首池 |
| N12 | `modules/restock-v3/components/PoolManagerDrawer.tsx:143-151` | effectiveSite，动态 sites；用户切站点才 setSite 并清空 selectedCodes；不能挂载/重渲染即清仓库勾选 |
| N13 | `modules/restock-v3/components/PlanHistoryDrawer.tsx:205-216` | `''/draft/confirmed/void`，空项=全部状态；选择重置页 1；Drawer 主题及分页保留 |
| N14 | `modules/restock-v3/components/ReviewPanel.tsx:261-274` | scope shop/site；只有已有 selection 时更新并保留 targetSku；改 scope 本身不创建/保存映射；显式保存才写；site 的共享映射语义不得改变 |
| N15 | `modules/product-analysis/ProductAnalysis.tsx:224,240-267,885-896` | 动态店铺 ID，shops 非空才显示；保留初始化首店及旧响应取消/activeShopIdRef 防串店逻辑；不由新控件自动归一化选值 |
| N16 | `modules/product-analysis/components/CollectionModal.tsx:34,47,55-80,111,114-115` | 动态 runId；用户切任务 setDetail(null)+setRunId+setPage(1)；创建后 runId 可能先于列表出现，不能擅自回退首任务；保留 polling 和 busy/action 状态 |
| N17 | `modules/product-analysis/components/ShopManager.tsx:123-137` | SITE_OPTIONS 字符串 union；Label 关联、模块主题保留；选站点不等于创建店铺 |
| N18 | `modules/product-analysis/components/ProductList.tsx:132-151` | pageSize 数值：Number 转换、PAGE_SIZE_OPTIONS 检查、同值不动；新总页数 clamp 当前页，**不是一律归页 1**；保留模块主题样式 |

### 3.1 同时纳入的其他选择器

| ID | 位置 | 处理决定及边界 |
|---|---|---|
| X01 | `modules/restock/components/CandidatePicker.tsx:13-23,36-43,198,235-313`；唯一生产调用 `restock-v3/components/ReviewPanel.tsx:251-260` | 手写富内容单选，迁为同族 Select；它现在**没有搜索输入**。保留 sameSku 忽略首尾空格/大小写、候选排序与百分比 badge、空列表和原始 SKU 回调；修复只传 selectedSku 时 Trigger 仍读 selectedCandidate 导致不回显的缺口 |
| X02 | `modules/chroma-adapt/ChromaAdapt.tsx:74-83,101-104` | 一个旧 DropdownMenu 内有 analysisModel 和 generationModel 两个独立 RadioGroup；改成两个可命名单选，分别调用现有 setter，保留中英标签与窄屏布局，不合并值、不调用生成/分析接口 |
| X03 | `modules/PersonalCenter.tsx:686-706` | Input+datalist 可接受任意模型名；替换为 editable combobox，采用相同主题与浮层风格，保留自由输入、建议去重、provider 变化、loading/saving 禁用及显式保存；不能改为受限 Select |
| X04 | `modules/restock-v3/components/Toolbar.tsx:49-80` | 真正的需求店铺多选，已用 shadcn Popover+Checkbox；保留组合并统一尺寸/主题，纳入多选验收；同站点限制、已选项可撤销、planSaving/shopsLoading 禁用不得丢失 |

明确保留的不同语义：`components/Sidebar.tsx:59-69` 是账户动作 DropdownMenu；`modules/product-analysis/components/ThemeMenu.tsx:44-117` 是含预设、任意 HEX 输入和 color Input 的主题编辑 Popover。日期输入、Tabs、折叠箭头不是要变成 Select 的业务选择字段。保留理由纳入最终清单，不把它们作为遗漏隐藏。

## 4. Phase 1：建立小型值适配组件，先锁定关键契约

### 实施内容与复制参考

新增建议文件 `frontend/components/FormSelect.tsx`（名称可保持此名，避免与底层 Select 混淆），由已有本地 Select 原语组合而成。复用 GlobalInputsPanel 的值回调、TargetPricingPanel 的长项宽度处理及 forwardRef 模式；**不替换底层 Select 的实现，也不重造 NativeSelect 的原生事件**。

最小契约：

- `value: string | null`；`null` 只代表真正未选择；`''` 可以是有可读标签的真实业务项。`onValueChange(value: string)` 仅输出业务原值。数值、nullable ID 与枚举缩窄留在业务调用方。
- 显式 `options` 数据（value、label、可选 textValue、disabled），不解析任意 JSX children。不同 value 可以有重复标签，但同一控件 value 必须唯一；检测到重复 value 时显示禁用的数据异常态、保留当前外部值且零回调，不把歧义值交给 Radix。富内容展示可由明确的 option label/textValue 支持；不得把 ReactNode 强转字符串作为可访问文本。
- 内部对所有真实值做一一前缀编码，例如业务值 x 一律编码为 `v:`+x（所以空业务值编码为 `v:`）；`null` 才映射 Root 的 `''`。这里不需要另设会与真实 ID 碰撞的 `__all__`。例如真实业务值 `v:` 编码为 `v:v:`，与空项不冲突。
- 解码必须检查前缀、当前 options 中的 membership 及 disabled；无效、已移除或禁用项不得触发业务回调。不得用无条件 slice/Number 处理任意字符串。
- `id`、`aria-label/labelledby/describedby/invalid`、焦点 ref 及业务 testid 放在 **Trigger button**；提供独立 `data-form-select-trigger` 标记。支持必要的 Trigger/Content/Item class 覆写，别广泛转发全部 HTMLSelectElement 属性。
- 当前活动原生字段不依赖 name/required 的原生序列化；适配器不暴露 Root 的 `name/form/required`。否则隐藏原生表单桥会把 UI 编码当真实 FormData，或错误满足 required。编码可以存在于匿名隐藏 DOM 及它的冒泡事件，不能谎称它们不存在；业务只能使用解码后的显式 callback。执行时必须重新搜 named/select form 及 form-level onChange，若有新增消费者，先设计并测试业务值序列化/事件适配，不能直接透传编码。
- fallback 判定精确为 `value !== null && !options.some(option => option.value === value)`，也覆盖选项里不存在的 `''`；保留外部 state、**不发 callback、不自动选首项**，显示 disabled fallback（例如“当前值暂不可用：原值”，用正常文本渲染，不用 HTML 注入）。真实项到达时恢复标签，零回调。没有真实空 option 的归组/动态 ID 控件，将业务未选空串映射为 `null`；有“全部/手动”空选项的 N02/N05-N07/N11/N13 仍传 `''`。CollectionModal 的非空新 ID 先于列表到达时走 fallback，绝不能当未选而切首项。
- FormSelect 真未选且无 options：显示业务 placeholder，禁用 Trigger。CandidatePicker 使用同族底层 Select 原语的专门组合（见 Phase 3），空列表仍允许打开不可选择的说明区域；不向通用适配器加入相矛盾的特殊开关，也不把“没有符合的 SKU”当作业务 option。其它控件仍与业务 loading/saving 条件合并禁用。
- 交互沿用 Radix 默认键盘、关闭、焦点恢复；不要全局吞 Escape/Tab、伪造事件或添加第二套焦点陷阱。

### 先写的契约测试（建议 `__tests__/FormSelect.test.tsx`）

1. `null`、`''`、普通 ID、真实字符串 `v:`、长文本/重复标签、重复 value 数据异常态、动态未知值；空项回显标签正确，回调还原原始值且次数正确；归组无组/动态 ID 未选时显示明确占位。
2. disabled、disabled option、未知 option 编码都不触发回调；options 删除/重排/后来补全不触发首项回退。
3. Label 点击聚焦 Trigger、HTMLButtonElement ref 生效、aria 错误描述可读；不会意外提交 CreateUser form；业务 callback 为原值，匿名桥不进入 FormData。测试中承认匿名隐藏 select 的 change 可能携带编码，不把它当业务接口。
4. 键盘开关、方向键、Enter/Space、Escape、焦点恢复；嵌套 Dialog/Popover 分层关闭，不靠 fake event 得到绿灯。
5. jsdom 缺失 API 按现有测试补最小 shim，保存/还原 property descriptor；不要 mock 掉真实 Select 来验证 Select。

阶段门禁：契约测试、类型检查、明确文件 ESLint 通过后才继续批量迁移。反模式：万能 NativeSelect children 转换器、`as any` 伪事件、将 UI 编码存进 store/query/API、修改主题 Portal 或给所有下拉一律 `z-index:9999`。

## 5. Phase 2：迁移账户、归组和使用统计（N02-N10）

按清单逐项复制原回调语义，仅把 DOM event 输入换成真实业务值；N04-N08 抽取值 setter+resetPage 逻辑，日期 Input 保留 event 入口；N03 同步修改 ref 类型和 autofocus 目标。

复制参考：清单中的原函数位置、GlobalInputsPanel 值 setter、TargetPricingPanel 弹层与长文本、现有账户安全测试。

验收：

- 服务商空值/custom/已知预设、加载/保存禁用；手填 URL/模型/密钥草稿不被不相关选择覆盖。只在显式保存时发请求，原密钥掩码保护测试保留。
- 归组有/无分组、长组名、打开后的初始焦点、选择不发 POST、显式保存的 group ID 正确、取消不写入。
- 五项统计筛选逐一测实际 query：空参数省略、sentinel 不外泄、页码归 1；自定义日期输入和旧请求取消仍工作；未知模块可显示/选择。
- 用户角色保留 owner/非本人限制，只有真实变更才发送原值 admin/viewer，打开/取消/重渲染零写入；创建用户默认 viewer，Enter/Space 选择不意外创建。

必须调整而不能删除原断言的测试：`PersonalCenter.test.tsx:221,225,241,242,266`、`UsageStats.test.tsx:15`，以及归组相关 ProductList 测试。补充 `UserManagement.ui.test.tsx` / `UserManagement.dialogs.test.tsx` 缺少的角色交互与请求断言。

反模式：把 owner 加入普通角色可选项、mount 时调用权限修改、用“回调被调用”代替检查实际请求 payload、因为换组件删掉草稿或密钥保护测试。

## 6. Phase 3：补货选择与 SKU 单选（N11-N14、X01、X04）

复制清单中 Toolbar 的默认池/多选站点限制、ReviewPanel 的 selection 更新与显式保存，以及 CandidatePicker 的 sameSku、候选排序和百分比呈现。不要重算业务匹配分数或改变 SKU 大小写后提交。

- N11 默认池调用 `value={poolId ?? ''}`，回调业务 `value || null`，不要把业务 null 当真未选占位。
- N12 用户切站点后清仓库选中集；挂载或重渲染保持当前集。
- N13 切状态归页 1；N14 改 scope 保留 targetSku，无 selection 不创建假映射，保存按钮仍是唯一写入入口。
- X01 保留 `CandidatePicker` 外部 props/导出及现有 testid，内部直接组合本地 Select/Trigger/Content/Item，以支持空列表说明和富内容；完成后删除这一个组件中被 Radix 接管的旧 Portal、位置计算、动画 timer、手写 Trigger keydown、document mousedown/touchstart 和 resize/scroll 监听，不能两套交互并存。
- X01 当前值展示：传入的 selectedCandidate 只有在其 id+原始 sku 仍存在于候选且 sameSku(selectedSku) 时才可优先使用；否则先按原始 selectedSku 精确查找，再用 sameSku 找当前排名第一个匹配项。仍找不到就显示已有 selectedSku（不可用提示），不能抹空。选择回调仍是候选原始 sku；sameSku 仅用于匹配，不用于篡改返回值。外部 value 为权威，不在组件另存第二份已选业务状态。
- X01 已核实 `restock/utils/restockTargetSku.ts:1-9` 为 `{id:string;sku:string;name?:string;matchPercentage?:number}`，排名函数不保证 id 唯一。`ReviewPanel.tsx:75-87` 组合 local/yc/ycs 前缀候选，保存接口只接收 SKU，不接收候选源或候选 id。因此确定采用如下视图算法，不留给执行者猜测：按现有排名遍历，以 `JSON.stringify([candidate.id,candidate.sku])` 为 pair key；同 pair 重复只在 UI 视图保留第一次，外部 candidates/排名/分数算法不变；不同 id 同 SKU、同 id 不同 SKU 都保留。选项内部值为 `c:`+pair key，Map 精确查回当前候选，选择时验证当前 Map membership 后只回传原始 sku。已选未知值使用独立 `u:`+JSON.stringify(selectedSku) 的 disabled fallback；真未选 Root 为 `''`。c/u 命名空间和 JSON 元组避免分隔符/真实 SKU 碰撞，不使用数组 index 或规范化 SKU 当唯一键。
- X01 测试同 id 异 SKU、同 pair 重复、同 SKU 异 id、含引号/冒号的标识、候选插入/重排、selectedCandidate 与 selectedSku 不一致、未知已选值后来补全；同 pair 折叠只影响不可区分的重复展示，不丢失可提交 SKU 语义。不修改上游候选与排名；对空或纯空白 SKU 的畸形控件输入仅在 UI 禁选且零回调，正常 SKU 原样返回，并补对应测试。未假设上游已经过滤空 SKU。
- X01 空列表保留“没有符合的 SKU”，不产生可提交伪 SKU。长 SKU 可读且菜单不出屏。
- X04 保留 Popover+Checkbox 真多选：至少两家同站点可并选，跨站未选项禁用，已选项可撤销；planSaving 禁止修改，shopsLoading 禁用入口。统一外观不是删掉多选能力。

先新增独立 `CandidatePicker.test.tsx`，覆盖只传 selectedSku 的回显缺口，再迁实现；保留 `RestockV3.test.tsx:231-259` 选 SKU 后显式保存及 shop scope / externalSkuType:modelCode 等原断言。保留 `RestockV3.ui.test.tsx:69` 库存池 accessible label 与 disabled 检查。

浏览器验收必须使用有候选、有多池、有异站店铺的数据，不得空数据走过导航就说补货选择通过。反模式：scope 变更即保存、默认池编码写后端、同站点限制只保留视觉灰色却仍触发 callback、修回显时修改共享库存/补货算法。

## 7. Phase 4：商品分析选择（N15-N18）

复制原选值函数与请求取消逻辑、采集任务初始化/polling、分页合法性检查；使用模块 UIThemeScope 和原 class 的主题布局。

验收：

- 两家店铺切换，旧响应晚到不能覆盖当前店铺数据、绑定或草稿；空店铺时保留原引导。
- 至少两个采集任务，切换会清旧详情/归页 1；新建 ID 先于 runs 到达时不回退、不显示为另一个任务；busy、轮询与关闭清理不因 Select 变更破坏。
- 新店铺站点选择只改表单，不立即创建；显式创建传正确 union 原值。
- 每页数量：合法数字、同值无动作、51 条数据和不同页数下保留页码收敛规则；不能只用第一页/空列表测试。

必须迁移原生交互但保留语义断言：`productAnalysisProductList.test.tsx:81,144` 的 selectOptions、`productAnalysisMain.test.tsx:231`、`productAnalysisShopBinding.test.tsx:197,223,242,275,277,303,345,347` 的店铺 change。新控件真实打开再选 option，不能 fireEvent.change(button)。

反模式：在适配器 useEffect 中替所有动态选择自动选第一项、将 Number 转换放在公共 primitive、移除旧响应防护以消除测试失败。

## 8. Phase 5：图片模型与自由输入建议（X02、X03）

### X02 两个模型单选

采用两个有独立 accessible name 的共享单选，分别对应分析和生图模型。复制 `ChromaAdapt.tsx:74-83,103` 的两份选项与两个 setter；不要改模型枚举、费用分组或分析/生成调用。窄屏工具栏可换行。`modelDropdownOpen` 与旧 RadioGroup import 在没有消费者后移除。

新增真实 UI 选值测试，检查只改一类模型时另一类不变、不触发生成/分析、英文/中文均能选择、相应原值到现有状态路径。`chromaUsage.test.ts` 的费用分组测试不是 UI 选择行为的替代。

### X03 模型名 editable combobox

复制 `PersonalCenter.tsx:686-706` 的受控字符串和建议去重规则，使用本地 Input/Popover 配合 APG 的“手动接受建议”模式：

- Input 是真实编辑点，支持任意字符串、清空、粘贴、中文 IME；provider 的建议只是建议，不是白名单。禁止 trim/大小写转换自动覆盖输入。
- 用 `PopoverAnchor asChild` 包裹 Input；Popover 受控 open 跟随 focus/type/ArrowDown，不把可编辑 Input 当 PopoverTrigger（否则点击输入会切换开关）。Input 具备独立于当前值的 accessible label，以及 combobox、aria-expanded、aria-controls、aria-autocomplete=list；建议使用 listbox/option 与稳定 id，通过 aria-activedescendant 保持 DOM 焦点在 Input。
- Up/Down 移动建议、Enter 仅在有活动建议且未 composing 时接受，Escape 只关建议且保留输入，不把自由输入回滚成预设；标准 Left/Right/Home/End/选中复制等文本编辑交给浏览器。
- provider 切换按原业务函数填充/保留模型；建议集合去重并刷新活动索引，不能让过期索引选择另一个值。loading/saving 期间不能键盘或点击绕过禁用。
- 建议点击不能被 blur 提前关闭而丢失；不自动提交整个配置表单。`onOpenAutoFocus` preventDefault 避免弹层抢 Input 焦点；`onCloseAutoFocus` preventDefault 避免统一恢复焦点。Escape/接受建议保留或恢复 Input，**Tab/外部点击必须允许焦点到用户目标**，不能无条件 focus Input；菜单不参与 Tab 序列，Space 在 Input 中仍是普通文本输入。测试 Tab/Shift+Tab、鼠标/触摸外部点击与关闭后不立即重开的情况。关闭/卸载清理自己添加的监听。
- 当前没有本地 Command/cmdk，不能虚构导入；仅在实施者另行证明必要并获依赖变更范围授权后才考虑额外包，本计划不需要该依赖。

建议新增 `EditableModelCombobox.test.tsx` 和浏览器用例。改写 `PersonalCenter.test.tsx:247-255` 原 `#ai-chat-model-options option` 断言为真实建议交互，同时保留去重、任意自定义值、provider 推断/保留和密钥保护测试。

阶段门禁：两项均通过对应组件测试、真实键盘/触摸与中英标签用例；不能用“为了统一”把建议框降级成固定枚举。

## 9. Phase 6：CSS、旧兼容层和文档收尾

需要同步审查的样式位置：

- `frontend/modules/product-analysis/product-analysis.css:55` 已有 button focus-visible，因此新 Trigger 已覆盖焦点；`:58` 旧 select 分支可清理，不能宣称原本必丢焦点样式。`:1301` 的 collection-section select 规则、`:1333` 的 native-select 字体需要有针对性迁移；`.pa-shop-select` 在 `:204,:1281` 的宽度/高度规则继续核对，coarse 下 min-height 44px 要胜过旧 height 38px。
- `frontend/index.css:67,83` 附近的原生选择背景/粗指针规则。
- 重新搜索全部源码/CSS 的 `select`、`native-select`、`HTMLSelectElement`、`selectOptions`、`SelectInput`、list/datalist 依赖，并逐项解释剩余项。

优先给新 Trigger 使用独立 `data-form-select-trigger`；需要兼顾现有 raw Select 时使用 `button[data-ui="select"]`。**不能用泛 `[data-ui="select"]` 改高度/字体/宽度**：本地组件把该标记也放在 Content/Viewport/Item/Icon 等节点，会污染整个浮层。原 CSS 修改须覆盖局部主题、focus-visible、长文本和 coarse pointer，而非只是删旧 selector。

Trigger 默认 36px，粗指针下有足够点击目标（沿用至少 44px 的项目规则）；触发文字可单行截断，但展开后完整选项要可读/可滚动。宽度限制同时检查 Content 与 Viewport；长英文无空格使用 overflow-wrap:anywhere；不要只给 Content max-width 却让 Viewport min-width 撑出屏。沿用主题 token 和既有层级，不改模块存储键或新建第二套主题状态。

N01 无引用复核后删旧 SelectInput；所有生产调用、测试和文档完成迁移后才删 `components/ui/native-select.tsx`。`__tests__/uiContracts.test.tsx:6,46-51` 的原生事件契约改为新组件的值契约/空值/form 行为；不保留这条旧契约倒逼产品伪造事件。更新 `docs/ui-migration-components.md` 的 compatibility 段落、用法与验证命令；文档历史验收事实可保留，注明已被后续迁移取代，不能伪改历史。

## 10. Phase 7：静态防遗漏与自动化验收

### 10.1 静态门禁（建议新增脚本及对应测试）

使用已安装 TypeScript compiler API 遍历**生产源码** JSX 与 import：范围包括 App、components、modules 及实际运行时引用的其它 frontend 源码；排除 node_modules、dist/验收构建、test-fixtures、e2e、__tests__、临时脚本。显式允许的是测试控制器内原生 select，不能把业务文件移入排除目录来过关。

断言：

1. 生产中 NativeSelect 导入、JSX 标签、原生 select/datalist/input[list] 都为 0；SelectInput 死导出与实际依赖清理完成。
2. 自定义 combobox/listbox、DropdownMenuRadioGroup、Popover 逐项复核，有 X01-X04 或动作/编辑语义保留依据；单纯 grep 0 不能证明全局范围完成。
3. AST 检测支持 aliased import、namespace/member access、re-export 等引用链；脚本配至少“合法测试夹具”“漏掉别名/JSX”“误把 datalist option 当 select”“其它业务路径”等小型测试，防校验器本身假绿。
4. CSS 的旧 native-select/原生 select 控件样式均逐项处置；剩余 HTMLSelectElement 可来自仍合法的 Input 事件联合或测试夹具，不能机械删除所有字符串。

文本搜索仅作交叉复核，rg 无匹配的 exit=1 不是运行错误。不能以 `option` 匹配数或匹配行数当组件数量。

### 10.2 组件与业务测试

- 覆盖 Phase 1-6 所有验收，保留原业务 assertions；使用 `userEvent` 打开和选择真实 option。新 JSX 选择控件不能继续 selectOptions/fireEvent.change。
- 有值/空值/未知动态值/长名/重复标签/选项重排/加载失败/disabled/提交中/取消/组件卸载均覆盖；特别关注身份权限修改和显式保存写入边界。
- 针对业务 mock 只记录准确 endpoint 与 method、原始值 payload，未知 API 必须失败；不把所有请求返回 success，也不通过 mock 新 Select 逃避真实交互。

### 10.3 浏览器 fixture 与矩阵（仅自动化，不操控用户电脑逐个点）

新增建议 `frontend/e2e/global-selects.spec.ts` 及域 fixture。在现有 installFixtures 严格路由基础上添加准确拦截；保留 GET fallback 和 unexpected/failures 收集。

当前 `e2e/fixtures.ts:33,36,39,43,47` 多处返回空池/空计划/空店铺/空明细，默认导航无法触达这些选择器。`acceptance.spec.ts:8-16` 有店铺和 51 商品，但采集任务仍为空。新增 fixture 必须至少包含：

- 2 家同站点需求店铺 + 1 家异站店铺，至少 2 个按站点过滤的库存池、仓库与不同计划状态。
- 足够分页的商品、至少 2 个采集 run、详情及必要 polling/下载响应、创建 ID 先到而列表后到的受控响应。
- 多个 SKU 候选、长 SKU、匹配百分比、重复标签/标识边界、只有 selectedSku 无 selectedCandidate 的场景。
- 不同角色目标用户、有效归组数据、两个分析/生图模型选择以及自定义模型名建议。

矩阵要求：

| 套件 | 最低覆盖 |
|---|---|
| 全模块导航 | Chromium：1440×1024 与 390×844，各明暗主题，11 个现有页面，页面不横向溢出 |
| 全部 N02-N18、X01-X04 的真实选值与业务副作用 | Chromium 桌面；手机触摸下所有不同交互类型及关键业务字段；两种主题下验证样式 |
| 空值、嵌套 Dialog/Sheet、动态任务、SKU、editable combobox、双模型、角色表单等关键跨浏览器契约 | Chromium/Firefox/WebKit；标记 `@cross-browser`，因为现有 Firefox/WebKit 项目只选择该标记 |
| 手机粗指针 | 仅 Chromium 的专项用例（不标会被 Firefox 选中的 @cross-browser）：新 context 显式 isMobile/hasTouch，390×844，真实 tap 且断言 pointer:coarse；Firefox 不支持 isMobile，仍完成桌面关键跨浏览器用例；只 setViewportSize 不能证明触摸支持 |
| 现有利润页 | 原 profit-selects/profit-layout 套件保持通过，公共组件或 CSS 变动不得回归 |

每种关键控件先断言预期数量大于 0、选项数量/具体标签，再做 evaluateAll/视口断言。用已挂载但看不见的根或空集合检查不能算通过。需要明确记录每用例的浏览器/尺寸/主题，不能把总数宣传成全三浏览器矩阵。

运行时检查只禁止**可访问/可见的业务选择器**仍为 HTML SELECT，允许 Radix 的匿名隐藏表单桥保留内部编码；对 editable combobox 预期 Input，对普通 Select 预期 Button，不能一律要求所有 combobox 都是 Button。验证无编码值进入业务 callback/API/query/storage/native FormData，不把隐藏 DOM 或匿名 change 事件错误地当成业务数据泄漏门禁。菜单不被滚动表格/弹层裁切；第一次 Escape 只关内层，第二次按原外层规则关闭；焦点返回正确。角色与保存动作只在明确用户提交时产生正确次数写入。

自动截图应覆盖完整控件、展开选项和实际滚动后的卡片区域。应用内滚动容器不会被 fullPage 自动展开，不能拿手机顶部截图证明底部候选无重叠。检查产出的截图可用离线图像查看，不需要操控用户桌面。

### 10.4 可执行命令与防旧构建假阳性

以下均在 `frontend` 执行；新文件/脚本按前述阶段创建后才运行相应命令：

```powershell
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Typecheck failed' }
npm test -- --reporter=dot
if ($LASTEXITCODE -ne 0) { throw 'Unit tests failed' }
node scripts/check-ui-classes.mjs
if ($LASTEXITCODE -ne 0) { throw 'UI class guard failed' }
node scripts/check-select-migration.mjs
if ($LASTEXITCODE -ne 0) { throw 'Select AST gate failed' }
```

最终构建放在下方浏览器验收进程中执行并归档，不必在没有新改动时重复构建。类型检查的无写入等价入口是本轮已验证的 `node node_modules/typescript/bin/tsc --noEmit --incremental false`，与 npm 入口选一个即可，不需要重复运行。

项目没有 `npm run lint`，禁止写不存在的验收命令。使用安装的 ESLint 对最终 diff 涉及的全部 TS/TSX 文件运行：

```powershell
# 以下是调用形状；用执行者确认后的完整改动文件列表替换占位符，不要原样执行。
node node_modules/eslint/bin/eslint.js --no-ignore <全部改动的TS和TSX文件>
if ($LASTEXITCODE -ne 0) { throw 'ESLint failed' }
```

已有 `node scripts/lint-ui-changes.mjs` 默认基线为 `dd5bcde`，依赖有效 Git；不能将它默认输出冒充“本轮 diff 的 lint”。若使用它，先验证当前基线并设置准确 `UI_LINT_BASE`，同时确保新增文件包括在内；现有警告与新增警告分别记录，不能写成“0 警告”。

浏览器运行前在**专用测试 PowerShell 进程**里设置下列环境，不污染用户已有 shell；测试完成退出该专用进程。清掉 UI_BASE_URL 及 UI_BASELINE：前者令配置使用自己启动的 loopback preview，后者会在导航用例中跳过溢出断言。开启 CI 使 reuseExistingServer=false，如端口占用则停止并核实占用者，不复用未知/旧服务。每次独立运行使用新目录，不能清掉上一轮失败证据：

```powershell
$env:CI = '1'
Remove-Item Env:UI_BASE_URL,Env:UI_BASELINE -ErrorAction SilentlyContinue
$runId = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$runDir = Join-Path '../.tmp/global-selects' $runId
New-Item -ItemType Directory -Path $runDir -ErrorAction Stop | Out-Null
$env:UI_ARTIFACT_DIR = Join-Path $runDir 'artifacts'
$env:PLAYWRIGHT_HTML_OUTPUT_DIR = Join-Path $runDir 'html-report'
$env:UI_CAPTURE = '1'
npm run build 2>&1 | Tee-Object -FilePath (Join-Path $runDir 'build.txt')
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
npm run test:e2e -- e2e/ui-migration.spec.ts e2e/acceptance.spec.ts e2e/profit-layout.spec.ts e2e/profit-selects.spec.ts e2e/global-selects.spec.ts 2>&1 | Tee-Object -FilePath (Join-Path $runDir 'browser.txt')
if ($LASTEXITCODE -ne 0) { throw 'Browser acceptance failed' }
```

当前 Playwright 已安装实现 `node_modules/playwright/lib/runner/index.js:3622,3683-3685` 优先读取 PLAYWRIGHT_HTML_OUTPUT_DIR，再读配置的 outputFolder，所以上述路径确实隔离本轮报告。若本轮在 reporter 创建前失败，记录“本轮 HTML 未生成”，不能复制默认目录的旧报告冒充当前结果。

这是全站导航、现有交互验收、利润页回归和新增选择器验收，不含独立 performance 套件的速度结论。若要宣称性能无回归，另按现有性能基线文档执行原 harness，不能用导航 timings 代替。保留配置中的 0 retries；如修复失败，保留失败证据后记录修复及新结果，不挑样本只留最好一轮。

## 11. 交付、复核与完成判据

执行者输出：

1. 每个 N01-N18、X01-X04 的完成位置、测试对应关系；保留的 Sidebar/ThemeMenu/多选语义依据。
2. 新组件契约与空值编码说明、CSS 和文档变更清单；无依赖升级、无后端/API/权限模型或利润/补货算法变更，除非另有明确授权。
3. 当前原始测试/类型/lint/build/class guard/AST gate 日志，浏览器按实际项目与矩阵的结果，截图索引及可复现命令；不能沿用 2026-10-30 的绿灯代替当前验收。
4. 一位独立审阅者对最终 diff 和验收覆盖复查，问题逐条修复后再复查，直到无已知未解决的阻断项；不要只让作者重读自己写的测试。

下列全部成立才完成：17 个活动原生字段迁移、死导出清除、手写 SKU 单选迁移并解决已选回显、两组模型单选迁移、自由输入模型建议框迁移、多选/动作/主题编辑语义保留并验证、CSS/兼容层/文档无遗留、静态门禁及全部指定测试真实通过。挂起、跳过、新增已知失败、未覆盖的数据路径都要报告，不能“零报错”代替完整性。

默认不部署生产、不 push、不删除本地临时文件。执行者先确认 Git 状态和用户改动，再按其所在会话的授权处理分支/提交。失败时保留可审阅 diff 和证据，按具体阶段修复；不得用 git reset --hard/clean 或回退用户其它修改来“恢复基线”。

## 附录 A：当前源码 SHA-256（交接前重算；不是工作树干净证明）

```text
frontend/components/ui/select.tsx 40ec4e725b51d21c58092a9e58ca77b86dbb0f6fe651e536e442724af13b2cbb
frontend/components/ui/native-select.tsx 5acc0d1d2fbee0d98bd3989c64304503c233d5232f7d3de71a61e5311c84d507
frontend/components/CalcInputs.tsx 2b1a7bb68a606521730a5e44b7868a462d905a063be6ded5cdf88fdee875ca6a
frontend/modules/PersonalCenter.tsx 7d3321eb8861644372d611bbdc2b31575b674875f2386e3065b34b3b0ccd6db9
frontend/modules/ProductList.tsx 444676e371aed672567c5bdd8ad9af03bb8117e3bbb9a768ccaf187ba99aa18c
frontend/modules/UsageStats.tsx 954e9af4b71cbaeaee61fd6ee61ed0ac05b0e081c34f755a9a7ef6a9856f795e
frontend/modules/UserManagement.tsx 5d2b0b449266864567f21eb7384f8686fef9a0a14cc606ddeca931ca41dc6366
frontend/modules/user-management/CreateUserModal.tsx 3d9ddadc83dfd370f54d7a4561400f5204572d1de5e8f841f59f17784b884bfc
frontend/modules/restock-v3/components/Toolbar.tsx 215c8d0d24759b6e94af184efd5e2b45914d30425f3f1aeff7f8b6e6b205f0d5
frontend/modules/restock-v3/components/PoolManagerDrawer.tsx 27d7071009ede58e8f943355bf311b32dde92814803ef9d3be152203536f6a8f
frontend/modules/restock-v3/components/PlanHistoryDrawer.tsx d77933d2af9dd2b08455abacfebc47968eb249c172b71195ba82dbbb0206da3d
frontend/modules/restock-v3/components/ReviewPanel.tsx 092d5f82f554f8ad93c313df22f0ae2747e66e1068531bdbb49e6299ae10e943
frontend/modules/product-analysis/ProductAnalysis.tsx d67310dcb0b233a95e2948c115b41ddcf6b79e8837c13895f28ce22313186baa
frontend/modules/product-analysis/components/CollectionModal.tsx 1bf2b6451799e901326155c76abe703fdc55c39ea3338a3b6a16666e12709a62
frontend/modules/product-analysis/components/ShopManager.tsx 1b2d26c782635050f93df287e6e6ace1791d46591465a10b2cb861edf0915e01
frontend/modules/product-analysis/components/ProductList.tsx 617b2a0abc62aca6dfbb35288072c65e666a5ef52ceafe5afaaaf81d54018c2f
frontend/modules/restock/components/CandidatePicker.tsx 6fdce2158f57b49fc06a4aaeffa882ed0e654a49590fba5076be1675a44584f6
frontend/modules/chroma-adapt/ChromaAdapt.tsx 50952245fb0685d0d375e242a1647c430f5f58af9b764ee373e0386de8269689
frontend/package.json 1abd7635df64e7686ecf20d6b5d12d85ce91504afc4bf683a0cb77e154516359
frontend/package-lock.json 55da0ce0ef7ecdd83ef484ce912e6805d3280e14191d826e138455df16467ee7
frontend/components/ui/popover.tsx 4bfec58fb04d43d634897d3dafb8189729764601dc7f808ebae48b74216c2795
frontend/modules/restock/utils/restockTargetSku.ts 55460975371f56b9ef726792e122cc0ea4076ad84e77b96a8f244790adf520b6
frontend/modules/product-analysis/product-analysis.css 958a90e71109c226ae51c822e0dc110b183ca66961592ddd639aefd81d61be70
frontend/index.css 97cb0fc629276d533253c0547f78510d3408b84c442c9a296119e11772b02876
```

## 附录 B：计划自身的复核记录

三路只读事实审核之后，对草稿进行了两轮独立交叉复核，再作最终定向检查。下列是审查发现并已落实到正文的修订，不是仅供参考的待办：

| 发现 | 已落实的处理 | 复查依据 |
|---|---|---|
| 将空 Item 视为旧版必抛错，可能错误制定限制 | 改为当前 2.4.1 允许空 Item 但 Trigger 仍显示占位；用一一编码区分业务空项与 null | 三份版本记录、安装源码、不写文件的 jsdom probe |
| 未显式处理缺失空项/动态 ID 未选 | fallback 条件包含 `''`；无空 option 的业务未选传 null，有实际空项继续传 `''` | 契约审核第二轮与调用表逐项核对 |
| 省略 name 被误当作匿名 DOM 事件零编码保证 | 明确隐藏桥可编码及冒泡，业务 callback/FormData 边界与不存在的父 form 消费者分开 | TS AST + 匿名 form change/FormData probe |
| SKU 标识唯一性未经证明、回显缺陷可能原样保留 | 固定 JSON pair/c-u 命名空间/首次 UI 去重/当前查表/raw SKU 回调，明确 selectedSku 回显优先级；空白 SKU 仅 UI 禁选 | 实读类型、排名、三路候选构造与保存契约；库存第二轮 |
| 自由输入框关闭会抢回焦点、空列表处理自相矛盾 | 实际存在的 PopoverAnchor；区分 Escape/接受与 Tab/外部点击；CandidatePicker 直接组合同族原语 | 本地导出/API 与契约第二轮 |
| CSS 将焦点已有覆盖误报为缺失，泛 data-ui 污染浮层 | 保留 button focus，明确独立 Trigger marker 与主题/字体/coarse 规则 | 全部生产 CSS 命中复核 |
| Firefox mobile、UI_BASELINE、旧服务与失败退出处理可能假绿 | 粗指针限定 Chromium；清环境基线、CI 禁复用、逐项 exit guard | 真实配置/用例与测试审查第二轮 |
| 默认报告覆盖或拷贝到旧报告，导致证据混轮 | 每轮独立 runId/artifacts/html，使用已核实优先级的 HTML 环境变量；无新报告即报告缺失 | 当前 Playwright 安装源码 |
| 旧测试名/断言范围与证据强弱不准 | 完整测试文件名与断言位置修正；62 枚举与类型通过、未来运行验收严格分开 | 测试文件检索、命令结果、Markdown 引用/脚本静态检查 |

审核结论只针对这份可执行计划及其覆盖边界：已知计划问题有明确处置，不把尚未实施的运行验收标为通过。最终交接者仍须完成第 10-11 节的全部证据，才能宣称迁移完成。
