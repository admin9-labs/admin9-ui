# 未提交改动独立复核

2026-09-13，Full Loop。仓库 `admin9-labs/admin9-ui`，比较基线 `0a7b9ee251bcc3a268a4b2a15d72414ad87a99cf`，目标为本轮开始时全部暂存、未暂存及未跟踪文件。直接检查 diff、周边实现、调用方、Arco 2.57.0 发行源码和测试；首轮审查报告只作为待核对的文档，不作为正确性证据。未改变依赖、组件职责或外部配置。

## 发现与关闭

以下均为本次变更引入的问题，已修复。没有确认的 P0/P1；未将有意的破坏性 API 调整或既有行为当作回归。

### [P2] 显式确认／清空必须提交规范模型 — src/components/file-picker/index.vue、src/components/cover-picker/index.vue

外部回显改为只做归一化后，发布函数仍只比较归一化的本地值。`[image, video]` 配合 `limit=1` 显示一项，直接确认却不发出模型更新；不再符合类型限制的值调用 clear 也不会清除父模型。封面中的无效槽位同样在确认一个未改变的有效图片后残留。新增三个失败用例复现。修复记录当前外部模型是否需要规范化，仅在明确用户提交时写回一次；保持初始化静默和重复提交去重，不恢复自动纠正逻辑。

### [P2] 隔离编辑器子控件与正文字段校验 — src/components/tiptap-editor/index.vue

新 FilePicker 会通知 Form change，嵌入编辑器时先校验旧正文，再由 confirm 插入图片并第二次校验。真实 Arco 测试记录到 `Before` 和插入图片后的两次值。将编辑器内部控件置于无样式、无自动校验的 FormItem 中，外层正文只由编辑器实际更新触发校验。隔离层显式继承编辑器有效禁用值，增加 FormItem 动态禁用时关闭已打开选择弹窗的回归。封面文档同步移除重复的手动 validateField 示例。

### [P2] 将负数长度限制归一化后再传入 Textarea — src/components/chat-composer/index.vue

新提交守卫及文档声明负数为无限制，但 Arco Textarea 2.57.0 的 updateValue 对负数仍调用 slice。实际输入 `Complete text` 被截为 `Complete tex`。现在输入和提交共同使用归一化的非负限制。文档明确：Arco 的无限制值是 0，负数是本组件先转换为 0。

### [P2] 在字符串操作前拒绝异常 URL 类型 — src/internal/file-url.ts

新 URL helper 在 try 外调用可选链 trim；adapter 返回数字 URL 时发生 TypeError。上传会错误归类为 upload-failed，文件列表路径会直接抛错，而原有 typeof 检查会拒绝此记录。修复先检查 typeof；新增上传错误分类与列表不抛错／不可选择的测试，保留协议白名单。

### [P2] 在第一次渲染时提供编辑器 ARIA 状态 — src/components/tiptap-editor/index.vue

原改动仅在 watch 回调中设置 aria-readonly/disabled/invalid，初始只读或错误字段没有这些属性。真实 Arco 初始状态测试失败。提取一份计算属性，初次创建和后续更新均从同一份状态生成 DOM 属性；未改变内容更新事件。

### [P2] 保留编辑器命令真实返回类型 — src/components/tiptap-editor/types.ts

新 ATiptapEditorExposed 将 focus/clear 声明为 void，运行时和已有文档却返回 Tiptap 命令布尔结果。修正为实际的 boolean | undefined，并让 defineExpose 受同一类型约束；安装包夹具新增具体组件实例到公开类型的赋值及返回值检查，避免只在声明上自我验证。

### [P2] 移除表格选择事件的陈旧说明 — docs/components/pro-table.md

onlyCurrent 段落仍要求监听 select，但重构后清选和交集更新只发 update:selectedKeys 与 selection-change，按这段文字接入会漏掉自动清选。统一文档中的事件语义，并消除 bordered 可覆盖／不可覆盖的矛盾。未更改表格运行时契约。

## 验证与复查

- 修复前：新增的 7 个运行时用例均失败，覆盖上面前五组问题，不把修改断言后通过当作缺陷证据。
- 修复后：FilePicker、CoverPicker、FileUploader、ChatComposer、真实 Arco 集成、Tiptap 编辑器及真实文件选择集成，共 7 文件 159 项测试通过。补充隔离层禁用回归后，3 个相关文件 99 项通过（含 12 项真实 Arco 测试）；这些是重叠的针对性运行，不相加为独立覆盖数量。
- type:check、acceptance:typecheck、ESLint 和 Stylelint 通过。复用未改动范围的原有验证，未重复运行 release:check。
- 浏览器：Ego Lite TaskSpace 37，`127.0.0.1:4174/?audit=1`，复验编辑器实际文件选择插入、初始 ARIA、只读和语言切换，以及包裹层未引入布局溢出。
- 最终 tarball 通过隔离安装、声明类型检查、消费构建和运行 smoke；未执行 npm 发布。

修复后重新检查新增条件、事件顺序、校验上下文、公共类型和文档，未发现新的未关闭 P0–P2。所有本轮开始时的待提交文件与上述修复合并为一个本地提交；不 push、不打 tag、不发布。逐文件内容标识和验证适用范围保存在本任务检查点中。

## 保留的验证边界

额外核对了地图加载器：SDK 在页面级共享，重新创建地图实例不会替换已加载的 Key。已据代码澄清组件文档；没有扩大为多 Key SDK 管理功能。

腾讯真实地点搜索的来源白名单限制是上轮浏览器证据，本轮没有重新请求或修改 Key。该外部成功路径不算本轮通过；地图 SDK 模拟回归证据保留。Arco useFormItem 的开发模式 toRefs 警告以及集中验收应用的大 chunk 提示不在本次回归修复范围内。未执行生产业务应用或 GitHub Actions 验收。
