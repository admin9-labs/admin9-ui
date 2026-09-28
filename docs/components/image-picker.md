# AImagePicker

`AImagePicker` 为图片字段提供卡片、预览、更换、移除和单图／多图选择。选图弹窗复用 `AFilePicker`；开启弹窗上传入口后，上传仍由已有 `AFileUploader` 完成。外层卡片不提供本地上传，移除图片只解除字段引用，不删除素材库原图。

具体 API、认证、权限、上传限制和业务字段转换由应用负责。

## 基础示例

```vue
<script setup lang="ts">
  import { ref } from 'vue';
  import { AImagePicker, type FileItem, type FilePickerAdapter } from '@admin9-labs/admin9-ui';

  defineProps<{ fileService: FilePickerAdapter; canUploadFiles: boolean }>();
  const image = ref<FileItem>();
  const images = ref<FileItem[]>([]);
</script>

<template>
  <AImagePicker v-model="image" :service="fileService" :can-upload="canUploadFiles" display-mode="landscape" fit="cover" />
  <AImagePicker v-model="images" :service="fileService" multiple :limit="5" display-mode="banner" />
</template>
```

也可通过 `app.use(Admin9UI, { fileService })` 注入默认 service；使用点的 service 优先。沿用 `FilePickerAdapter`，必须提供 list，canUpload 为 true 时必须提供 upload；不另设图片专属 adapter。

## Props

| Prop         | 类型                                                | 默认值           | 说明                                                          |
| ------------ | --------------------------------------------------- | ---------------- | ------------------------------------------------------------- |
| modelValue   | `FileItem \| FileItem[] \| undefined`               | undefined        | 单图为对象，多图为数组                                        |
| multiple     | boolean                                             | false            | 明确控制值形状，不从输入或 limit 推断                         |
| limit        | number                                              | 0                | 多图数量上限；0 不限，非法运行时值按 0 处理；单图始终最多一张 |
| showFileList | boolean                                             | true             | 是否显示外层图片列表，不影响弹窗                              |
| displayMode  | `'square' \| 'landscape' \| 'portrait' \| 'banner'` | `square`         | 后台图片卡片的语义视觉类别                                    |
| fit          | `'contain' \| 'cover'`                              | `contain`        | 缩略图在卡片内的填充方式                                      |
| service      | FilePickerAdapter                                   | 插件 fileService | 后端无关的浏览和可选上传能力                                  |
| canUpload    | boolean                                             | false            | 开启内部选图弹窗的上传入口                                    |
| canCreateGroup | boolean | false | 开启内部弹窗的一级／二级分组创建；要求 service 提供 listGroups 和 createGroup，独立于上传权限 |
| canDeleteFiles | boolean | false | 开启内部弹窗的删除选中；要求 deleteFiles，不自动清理字段引用 |
| canMoveFiles | boolean | false | 开启内部弹窗的移至分组；要求 listGroups 和 moveFiles，不自动修改字段 |
| accept       | string                                              | `image/*`        | 传给内部上传入口的原生文件选择提示                            |
| disabled     | boolean                                             | false            | 禁止修改和预览，同时继承 Form disabled                        |
| readonly     | boolean                                             | false            | 禁止修改，保留图片预览                                        |
| size         | Arco Size                                           | 继承             | 默认按钮尺寸，不改变图片卡片规格                              |
| buttonText   | string                                              | locale“选择图片” | 默认选择入口文案                                              |
| pageSize     | number                                              | 24               | 弹窗后端分页容量                                              |
| defaultView  | `grid \| list`                                      | grid             | 弹窗初始视图                                                  |

class/style、ARIA 及原生属性落在组件根节点，不透传到 Upload 或弹窗。缩略图加载失败回退原图，再失败显示占位；大图预览始终完整展示原图，不继承 fit，也不会裁剪或改写文件。安全 URL 规则与 AFilePicker 相同，只允许 HTTP(S)、相对地址和 blob。

## 展示模式

`displayMode` 是后台界面的语义视觉类别，不是上传规格、比例校验或裁剪规则：

| 模式      | 参考尺寸   | 适用外观                              |
| --------- | ---------- | ------------------------------------- |
| square    | 80 × 80px  | 方形图标、头像和普通图片              |
| landscape | 144 × 81px | 横向封面和视频配图                    |
| portrait  | 80 × 112px | 竖向海报和人物图                      |
| banner    | 200 × 64px | 横幅；3:1 与 6:1 等业务比例共用此类别 |

空态选择入口和选中图片使用同一模式与尺寸，多图中的每张卡片也保持一致。卡片宽度最大为容器宽度，窄容器只做自然收缩和换行，不计算图片比例或切换紧凑布局。`fit` 只控制缩略图：contain 展示完整缩略图，cover 填满并可能在视觉上裁去边缘。

动态修改 displayMode 或 fit 只更新外观，不修改字段、不触发表单 change、不关闭已打开的选图弹窗，也不重置跨页选择草稿。

## 值与数量规则

- 单图清空为 undefined，多图清空为 []；多图允许初始 undefined，不会在挂载时回写。
- multiple=true、limit=1 仍然输出数组。单图收到数组或多图收到单对象时按空展示，不自动切换模式。
- 图片必须具有稳定非空 ID、type=image、可用安全 URL，且 status 为 ready 或未提供。
- ID 是文件身份；不同 ID 即使 URL 相同也不会合并。外部重复 ID 对应的所有项均不作为有效值。
- 非法、超限或形状不匹配的模型只归一化展示，不在 watch 中改写父值。下一次明确确认、移除或清空会提交规范值。
- 普通选图编辑完整集合：已有图片预选，取消勾选可以移除，新选图片追加。草稿跨页保留；取消勾选后再选择会排在末尾。不提供拖拽排序。
- 满额隐藏默认新增卡片，更换与移除仍可用；公开 open 和自定义 trigger 仍可打开完整集合。

外层卡片始终由父模型派生，父级未接收更新时不做乐观替换。

## 确认、更换和上传

打开时建立会话快照，弹窗草稿不影响外层卡片。取消、关闭或 Escape 不写回。确认后先发 update:modelValue，再发 change；同值确认只发 confirm。若父模型尚需归一化，即使显示相同也会提交规范值。比较包含顺序及 FileItem 元数据，不只比较 URL。

更换只替换目标 ID 的位置。选择其他位置已存在的 ID，或没有可用图片时，保留原值并显示提示；弹窗按现有确认流程关闭，不发外层 confirm/change。下次打开重新同步快照。移除即时更新字段，不发 confirm、不调用删除接口。

**上传成功与选中提交分离：** canUpload 仅开启 AFilePicker 弹窗内现有上传能力。上传队列、进度、取消、重试和结果校验归 AFileUploader；上传完成只刷新弹窗列表，不自动勾选或写入字段。用户仍须选择并确认。上传后取消弹窗，字段不变，已成功上传的素材留在素材库。

canUpload 不是后端授权；应用及后端仍需验证格式、大小、内容、身份和权限。

## Events

| 事件              | 参数             | 时机                                           |
| ----------------- | ---------------- | ---------------------------------------------- |
| update:modelValue | ImagePickerValue | 用户提交改变字段或明确写回规范值               |
| change            | ImagePickerValue | 与 update:modelValue 同次、同载荷触发          |
| confirm           | FileItem[]       | 合法确认，包括同值确认；更换时也是最终完整集合 |
| clear             | 无               | clear() 成功清空字段；单项移除使用 change      |
| visible-change    | boolean          | 选图弹窗打开／关闭，不含大图预览               |
| upload-success    | FileItem         | 内部通过校验的上传结果，不等于选中             |
| upload-error      | unknown          | 内部上传失败                                   |

TypeScript 事件名使用 visibleChange、uploadSuccess、uploadError，Vue 模板使用 kebab-case。不透出内部 selection-change 草稿事件。

## 自定义入口与公开方法

trigger 参数为 `{ open, selectedItems, selectedCount, disabled, readonly, limitReached }`。disabled 已合并 Form disabled 和 readonly；limitReached 独立表示容量状态，不禁止打开完整集合。自定义入口不随满额隐藏，即使插槽没有禁用按钮，open 也会阻止禁用／只读状态的操作。

```vue
<AImagePicker v-model="image" :service="fileService" :show-file-list="false">
  <template #trigger="{ open, disabled }">
    <a-button :disabled="disabled" @click="open">选择品牌图片</a-button>
  </template>
</AImagePicker>
```

| 方法                     | 行为                                       |
| ------------------------ | ------------------------------------------ |
| open(): void             | 打开完整选择集合，满额仍可调整已有图片     |
| close(): void            | 取消会话，不写值                           |
| clear(): void            | 取消当前会话，再清空字段；禁用与只读时无效 |
| refresh(): Promise<void> | 只刷新已打开的弹窗列表／分组，关闭时不请求 |

不公开上传方法、内部 picker 或 Arco Upload 原始配置。

## 表单与外部更新

组件继承 Form disabled、尺寸和错误状态。disabled 禁止修改和预览；readonly 隐藏默认修改入口，允许预览，空值显示“暂无图片”。动态禁用时关闭选图与大图预览。关闭选图后恢复到实际触发控件，控件失效时回退到可用入口。

内部草稿、搜索、上传和取消不触发外层校验；只有正式字段变化触发一次 change 校验。校验在父模型更新后执行；父级拒绝提交、在 change 回调中重置表单，或通过 key 重建字段时，不会对旧提交继续校验。包装业务 URL 字段时也应隔离内部表单事件，由包装层按最终业务值是否变化触发校验。

图片 ID、顺序或原图地址变化时关闭并重置大图预览，清空后回填不会自动重开。等值回显或仅文件名等元数据变化时保持当前预览。

模型内容、multiple、有效 limit 或 service 改变时取消当前会话，迟到结果不能写回新值。等值对象回显以及尺寸、语言、主题、showFileList、displayMode、fit 变化不重置草稿。组件无法判断图片值未变的业务记录切换，应用应使用 `:key="recordId"` 重建组件，或在切换记录前调用 close()。

## URL 字段和其他组件

URL-only 字段由应用转换为 FileItem，再把确认结果转回原字段。只有 URL 时可使用应用自有命名空间的稳定合成 ID；素材库真实记录必须保留真实 ID。不要统一用 URL 重写 service.list/upload 的 ID，也不要承诺 URL 回显自动关联或勾中真实素材。组件不接收字符串模型、不遍历素材库查找 URL。

已有 FileItem 字段直接传入，不必经过 URL 往返转换。文章单图／三图／无封面及固定空位置使用 [ACoverPicker](./cover-picker.md)；业务图集的说明、排序和封面关联仍由应用实现。视频、音频及通用附件继续使用 [AFilePicker](./file-picker.md)。

根入口导出 AImagePicker、AImagePickerProps、AImagePickerEmits、AImagePickerSlots、AImagePickerExposed、ImagePickerValue、ImagePickerDisplayMode 和 ImagePickerFit。
