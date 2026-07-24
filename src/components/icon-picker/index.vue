<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { arcoIconNames } from './icon-names';

  /**
   * AIconPicker —— 图标选择器，替换菜单管理的手敲 `<a-input>`。
   *
   * 形态：a-popover + 网格（非弹窗），表单内轻量交互。
   * - 触发器：只读 a-input，左侧前缀渲染当前选中图标（<component :is="modelValue">），右侧 clear。
   * - popover 内容：顶部 a-input-search 搜索框 + 下方网格渲染 arcoIconNames。
   * - cell：<component :is="item.pascal"> 预览 + a-tooltip 显示名字，点击 emit kebab + 关闭。
   * - 渲染依赖宿主 app.use(ArcoVueIcon) 已全局注册的 icon-* 组件，库不打包 SVG。
   *
   * 产出值用 kebab（'icon-dashboard'），兼容现有数据与菜单 meta.icon 渲染机制（h(compile(`<${name}/>`))）。
   */
  interface AIconPickerProps {
    /** 图标名（kebab: 'icon-dashboard' 或 Pascal: 'IconDashboard'） */
    modelValue?: string;
    allowClear?: boolean;
    placeholder?: string;
    size?: 'small' | 'medium' | 'large';
  }

  const props = withDefaults(defineProps<AIconPickerProps>(), {
    modelValue: '',
    allowClear: false,
    placeholder: '',
    size: 'medium',
  });

  const emit = defineEmits<{
    (e: 'update:modelValue', value: string | undefined): void;
  }>();

  const { t } = useI18n();

  const visible = ref(false);
  const keyword = ref('');

  /** 去 icon- 前缀后小写匹配（'settings' / 'icon-settings' 均命中 'IconSettings'）。 */
  const stripIcon = (s: string): string =>
    s
      .trim()
      .toLowerCase()
      .replace(/^icon-/, '');

  const filtered = computed(() => {
    const kw = stripIcon(keyword.value);
    if (!kw) return arcoIconNames;
    return arcoIconNames.filter((item) => stripIcon(item.kebab).includes(kw));
  });

  const triggerPlaceholder = computed(() => props.placeholder || t('admin9Ui.iconPicker.placeholder'));

  /** 选中态：兼容 kebab 与 Pascal 两种存储形式。 */
  const isActive = (item: { pascal: string; kebab: string }): boolean =>
    props.modelValue === item.kebab || props.modelValue === item.pascal;

  const handleSelect = (kebab: string) => {
    emit('update:modelValue', kebab);
    visible.value = false;
  };

  const handleClear = () => {
    emit('update:modelValue', undefined);
  };

  // 关闭时清空搜索，重开时回到全量
  watch(visible, (v) => {
    if (!v) keyword.value = '';
  });
</script>

<template>
  <a-popover v-model:popup-visible="visible" trigger="click" position="bl" :popup-offset="4">
    <div class="a9-icon-picker">
      <a-input :model-value="modelValue" :placeholder="triggerPlaceholder" :size="size" readonly>
        <template #prefix>
          <component :is="modelValue" v-if="modelValue" class="a9-icon-picker__preview" />
        </template>
        <template v-if="allowClear && modelValue" #suffix>
          <icon-close class="a9-icon-picker__clear" @click.stop="handleClear" />
        </template>
      </a-input>
    </div>
    <template #content>
      <div class="a9-icon-picker__panel">
        <a-input-search v-model="keyword" :placeholder="t('admin9Ui.iconPicker.searchPlaceholder')" allow-clear />
        <div class="a9-icon-picker__grid">
          <a-tooltip v-for="item in filtered" :key="item.kebab" :content="item.kebab" position="top">
            <div class="a9-icon-picker__cell" :class="{ 'is-active': isActive(item) }" @click="handleSelect(item.kebab)">
              <component :is="item.pascal" />
            </div>
          </a-tooltip>
          <div v-if="!filtered.length" class="a9-icon-picker__empty">
            {{ t('admin9Ui.iconPicker.empty') }}
          </div>
        </div>
      </div>
    </template>
  </a-popover>
</template>

<style lang="less" scoped>
  .a9-icon-picker {
    display: inline-block;
    width: 100%;

    &__preview {
      color: var(--color-text-1);
      font-size: 16px;
    }

    &__clear {
      color: var(--color-text-3);
      font-size: 12px;
      cursor: pointer;
      transition: color 0.2s ease;

      &:hover {
        color: var(--color-text-1);
      }
    }
  }

  .a9-icon-picker__panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 320px;
  }

  .a9-icon-picker__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, 36px);
    gap: 4px;
    max-height: 240px;
    padding: 4px;
    overflow-y: auto;
  }

  .a9-icon-picker__cell {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    color: var(--color-text-1);
    font-size: 18px;
    background-color: transparent;
    border-radius: var(--border-radius-small, 4px);
    cursor: pointer;
    transition: background-color 0.2s ease;

    &:hover {
      background-color: var(--color-fill-2);
    }

    &.is-active {
      color: rgb(var(--primary-6));
      background-color: var(--color-fill-2);
    }
  }

  .a9-icon-picker__empty {
    grid-column: 1 / -1;
    padding: 24px 0;
    color: var(--color-text-3);
    font-size: 14px;
    text-align: center;
  }
</style>
