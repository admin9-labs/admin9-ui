# AImageCropper

后端无关的图片裁剪弹窗。调用 `open(File)`，完成后取得裁剪编码后的 `File`；取消返回 `null`。不读取素材库、不上传、不管理业务字段。封面选择可直接使用 [ACoverPicker.crop](./cover-picker.md#原生裁剪)。

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { AImageCropper, type AImageCropperExposed, type ImageCropOptions } from '@admin9-labs/admin9-ui';
const cropper = ref<AImageCropperExposed>();
const crop: ImageCropOptions = {
  source: { maxBytes: 10 * 1024 ** 2, maxPixels: 20_000_000 },
  output: {
    resize: { mode: 'max', longEdge: 1280 },
    format: 'image/jpeg', quality: 0.85, background: '#ffffff',
    maxBytes: 2 * 1024 ** 2,
  },
};
async function process(file: File) {
  const result = await cropper.value?.open(file);
  if (result) { /* 应用使用或上传成品 */ }
}
</script>
<template><AImageCropper ref="cropper" :aspect-ratio="4 / 3" :crop="crop" /></template>
```

## Props

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `aspectRatio` | `number` | 必填，有限正数；裁剪框锁定此比例 |
| `crop.source` | `ImageCropSourceOptions` | 必填，原文件 `maxBytes` 与解码像素数 `maxPixels`，均为有限正数 |
| `crop.output.resize` | `{ mode: 'exact' \| 'max'; longEdge: number }` | 必填，目标长边正整数；exact允许放大，max只缩小 |
| `crop.output.maxBytes` | `number` | 必填，成品最大字节数 |
| `crop.output.format` | `'image/jpeg' \| 'image/png'` | 必填，成品格式 |
| `crop.output.quality` | `number` | JPEG必填，0至1；PNG不提供 |
| `crop.output.background` | `string` | JPEG必填，CSS颜色，透明区域合成此背景；PNG保留透明 |

长边按配置精确取值，短边按比例四舍五入到整数像素。`exact` 长边640配合4:3、16:9、1:1、3:4，分别输出640×480、640×360、640×640、480×640；这些只是业务配置示例，组件没有内置640规则。

原图支持静态JPEG和PNG，按文件字节校验格式、动画和像素上限，拒绝APNG。浏览器解码处理EXIF旋转和镜像后，预览、裁剪坐标和导出使用同一方向的像素。原图限制在解码前执行；成品限制在编码后执行。

编码一次采用固定格式、质量和尺寸。超限时保留构图并提示，允许调整或取消；不偷偷降低质量或缩小尺寸。读取失败允许重试或取消。配置无效时 `open` 抛出配置错误，应在接入时修正配置。

## 交互与生命周期

- 拖动裁剪框移动，拖动四角缩放；比例始终锁定。框和手柄支持方向键操作。
- 长图仅在图片区域内滚动，确认/取消按钮保持在弹窗底部。首次定位到裁剪框并留出手柄空间，用户滚动、拖动后不自动跳回。
- `open(file): Promise<File | null>`：打开另一个文件会取消上一个请求。
- `cancel(): void`：取消当前请求、释放解码资源，并忽略迟到的解码或编码结果。
- `visible-change(visible: boolean)`：弹窗显示状态变化。
- 修改比例/加工配置或卸载会取消当前请求。应用负责在业务上下文改变时调用 `cancel()`。

需要现代浏览器的Canvas、`createImageBitmap`、Pointer Events与File API。SSR可以导入组件，裁剪只在客户端调用。全局安装、语言包和样式接入与其他Admin9 UI组件一致。
