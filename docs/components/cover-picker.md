# ACoverPicker

`ACoverPicker` 是后端无关的封面选择组件，提供单图、三图和无封面模式。三图使用三个固定位置，每个位置通过同一个 `AFilePicker` 单独选择图片。

内部选图弹窗沿用 [AFilePicker 的稳定高度与响应式分页](./file-picker.md#布局与分页)，默认按可用空间展示完整的一页图片，分组列表独立滚动。弹窗图片卡片隐藏单独的后缀和大小行，保留文件名、预览与异常状态。弹窗图片框采用 4:3 与 `contain`，不改变下方说明的封面字段卡片展示方式。

普通单图／多图字段使用 [AImagePicker](./image-picker.md)。ACoverPicker 保留封面模式、固定位置及允许重复图片的独立契约。

空槽持续显示“封面 1／2／3”，只读或禁用时保持相同的位置标签；读屏标签仍说明添加动作或空位置状态。位置标签不表示必填、数量完整或已满足发布条件。移除只清空对应字段位置，素材库文件保留。

组件负责封面模式、位置、预览和选择交互。外层应用负责表单标签、必填规则、业务字段、保存转换、权限和文件 adapter。

## 基础示例

```vue
<script setup lang="ts">
  import { reactive } from 'vue';
  import { ACoverPicker } from '@admin9-labs/admin9-ui';
  import type { CoverPickerValue, FilePickerAdapter } from '@admin9-labs/admin9-ui';

  defineProps<{ fileService: FilePickerAdapter }>();

  const form = reactive<{ cover: CoverPickerValue }>({
    cover: { mode: 'single', images: [null] },
  });
  const coverRules = [
    {
      validator: (value: CoverPickerValue, callback: (error?: string) => void) => {
        const complete = value.mode === 'none' || value.images.every(Boolean);
        callback(complete ? undefined : value.mode === 'single' ? '请选择封面' : '请选择三张封面');
      },
    },
  ];
</script>

<template>
  <a-form :model="form">
    <a-form-item field="cover" label="展示封面" :rules="coverRules">
      <ACoverPicker v-model="form.cover" :service="fileService" can-upload />
    </a-form-item>
  </a-form>
</template>
```

也可通过 `app.use(Admin9UI, { fileService })` 注入默认 service；使用点的 `service` prop 优先。

## 值类型

```ts
export type CoverMode = 'single' | 'triple' | 'none';
export type CoverPickerSize = 'mini' | 'small' | 'medium' | 'large';

export type CoverPickerValue =
  | { mode: 'none'; images: [] }
  | { mode: 'single'; images: [FileItem | null] }
  | { mode: 'triple'; images: [FileItem | null, FileItem | null, FileItem | null] };
```

`null` 表示对应位置尚未选择。三图的空位置不会压缩，删除第二张不会移动第三张。编辑期允许位置为空，是否要求填满由外层表单规则决定。

## Props

| Prop         | 类型                | 默认值                               | 说明                                                             |
| ------------ | ------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| `modelValue` | `CoverPickerValue`  | `{ mode: 'single', images: [null] }` | 受控封面值                                                       |
| `size`       | `CoverPickerSize`   | `'medium'`                           | 封面格、图标和操作按钮尺寸                                       |
| `service`    | `FilePickerAdapter` | 插件 `fileService`                   | 使用点优先的后端无关 adapter                                     |
| `canUpload`  | `boolean`           | `false`                              | 在文件选择弹窗显示上传入口                                       |
| `canCreateGroup` | `boolean` | `false` | 透传至文件选择器，开启一级／二级分组创建；要求 listGroups 和 createGroup |
| `canDeleteFiles` | `boolean` | `false` | 透传批量管理的删除素材开关；要求 deleteFiles，删除不自动清理封面位置 |
| `canMoveFiles` | `boolean` | `false` | 透传批量管理的移动素材开关；要求 listGroups 和 moveFiles |
| `accept`     | `string`            | `'image/*'`                          | 原生文件选择提示，不代替后端校验                                 |
| `disabled`   | `boolean`           | `false`                              | 禁用模式切换、选择、替换和移除；同时继承外层 Arco 表单的禁用状态 |
| `readonly`   | `boolean`           | `false`                              | 禁止模式切换、选择和移除                                         |

## 尺寸

```vue
<ACoverPicker v-model="cover" size="small" :service="fileService" />
```

| 项目               | small      | medium（默认） | large       |
| ------------------ | ---------- | -------------- | ----------- |
| 单格最大尺寸       | 120 × 90px | 160 × 120px    | 200 × 150px |
| 三图最大宽度       | 384px      | 504px          | 624px       |
| 加号／失败占位图标 | 26px       | 34px           | 42px        |
| 替换图标背景直径   | 24px       | 28px           | 32px        |
| 移除按钮 Arco size | mini       | mini           | small       |

图片间距始终为 `12px`，窄容器内按 `4:3` 等比例缩小。模式选项和文件弹窗保持原有尺寸。动态切换 `size` 不会关闭弹窗、清空选择或触发值变更事件。

## Events

| 事件                | 参数               | 时机                                              |
| ------------------- | ------------------ | ------------------------------------------------- |
| `update:modelValue` | `CoverPickerValue` | 用户提交的封面值真实变化时                        |
| `change`            | `CoverPickerValue` | 与 `update:modelValue` 同次触发，便于表单重新校验 |
| `visible-change`    | `boolean`          | 内部文件选择弹窗打开或关闭                        |
| `upload-success`    | `FileItem`         | 文件上传成功；不会自动填入封面位置                |
| `upload-error`      | `unknown`          | 文件上传失败                                      |

TypeScript 声明使用 `visibleChange`、`uploadSuccess`、`uploadError`；Vue 模板使用表中的 kebab-case。

## 模式与位置

- 单图切换为三图时，原图保留在第一格。
- 三图切换为单图时，从左到右保留第一张非空图片。
- 切换为无封面时清空全部图片；从无封面切出时创建空位置。
- 模式切换会立即清理不再使用的图片，不保存隐藏草稿。
- 每个位置独立，允许多个位置引用同一个 `FileItem`，不提供排序。

点击空位置选择图片，点击已有图片进行替换。取消文件弹窗不会写回，确认相同图片不会重复触发值事件。移除只解除当前位置的引用，不调用后端删除接口。

## 图片与安全边界

组件只接受具有稳定非空 ID、`type: 'image'`、非空 URL，并且状态为 `ready` 或未提供的 `FileItem`。非法外部图片按原位置校正为 `null`，不会移动其他位置。

预览优先使用 `thumbnail`，加载失败后回退 `url`，再次失败则显示占位。预览框固定为 `4:3` 并使用 `object-fit: cover`，不会限制、裁剪或改写原文件。

`canUpload` 只是界面能力开关。adapter 和后端仍需校验文件内容、MIME、扩展名、大小、身份、资源归属和权限。

## 表单与受控值

`readonly?: boolean` 默认 false，与继承的 Form disabled 一起阻止模式切换、选择与移除。用户正式提交封面后触发字段 change 校验，无须额外调用 validateField。外部不合法输入仅归一化展示，不回写父模型或触发 change；下一次用户确认会提交规范后的完整封面值，即使所选图片与展示相同。上传成功只表示文件准备就绪，不自动改变封面。

CoverPickerSize 使用官方 Size，增加 mini（封面最大宽 88px、添加图标 20px、替换图标 20px）；显式 size 优先，其次 Form，组合布局最终默认 medium。单独使用时封面格保持该布局默认值；Arco 模式控件仍可继承 ConfigProvider。该差异用于区分图片画布尺寸与输入控件高度。

内部选图弹窗仅使用网格；批量管理的勾选独立于当前封面位置，即使每次封面选择仅一张，也可同时管理多个素材。管理操作立即作用于素材库，退出或取消不会撤销；退出管理后恢复有效选图草稿。

组件无额外公开方法或插槽；class/style 和原生根属性附在封面根节点，内部文件选择器不作为公共实例 API。
