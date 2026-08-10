<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { arcoIconCategories, isIconInCategory, type ArcoIconCategoryKey } from './icon-categories';
  import { arcoIconNames } from './icon-names';

  /**
   * AIconPicker —— 图标选择器，替换菜单管理的手敲 `<a-input>`。
   *
   * 形态：a-popover + 网格（非弹窗），表单内轻量交互。
   * - 触发器：只读 a-input，左侧前缀渲染当前选中图标（<component :is="modelValue">），右侧 clear。
   * - popover 内容：顶部搜索框 + 官方分类导航 + 图标网格。
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
  const activeCategory = ref<'all' | ArcoIconCategoryKey>('all');

  /** 去 icon- 前缀后小写匹配（'settings' / 'icon-settings' 均命中 'IconSettings'）。 */
  const stripIcon = (s: string): string =>
    s
      .trim()
      .toLowerCase()
      .replace(/^icon-/, '');

  const filtered = computed(() => {
    const kw = stripIcon(keyword.value);
    if (kw) return arcoIconNames.filter((item) => stripIcon(item.kebab).includes(kw));
    const category = activeCategory.value;
    if (category === 'all') return arcoIconNames;
    return arcoIconNames.filter((item) => isIconInCategory(item.kebab, category));
  });

  const hasKeyword = computed(() => Boolean(stripIcon(keyword.value)));

  const categories = computed(() => [
    {
      key: 'all' as const,
      label: t('admin9Ui.iconPicker.categories.all'),
      count: arcoIconNames.length,
    },
    ...arcoIconCategories.map((category) => ({
      key: category.key,
      label: t(`admin9Ui.iconPicker.categories.${category.key}`),
      count: category.names.length,
    })),
  ]);

  const resultTitle = computed(() => {
    if (hasKeyword.value) return t('admin9Ui.iconPicker.searchResults');
    return categories.value.find((category) => category.key === activeCategory.value)?.label;
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

  const handleCategoryChange = (category: 'all' | ArcoIconCategoryKey) => {
    activeCategory.value = category;
    keyword.value = '';
  };

  // 关闭时清空搜索，重开时恢复当前分类
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
        <div class="a9-icon-picker__body">
          <div class="a9-icon-picker__categories" role="group" :aria-label="t('admin9Ui.iconPicker.categoryLabel')">
            <button
              v-for="category in categories"
              :key="category.key"
              type="button"
              class="a9-icon-picker__category"
              :class="{ 'is-active': !hasKeyword && activeCategory === category.key }"
              :aria-pressed="!hasKeyword && activeCategory === category.key"
              :data-category="category.key"
              @click="handleCategoryChange(category.key)"
            >
              <span>{{ category.label }}</span>
              <span class="a9-icon-picker__category-count">{{ category.count }}</span>
            </button>
          </div>
          <div class="a9-icon-picker__results">
            <div class="a9-icon-picker__result-heading">
              <span>{{ resultTitle }}</span>
              <span>{{ filtered.length }}</span>
            </div>
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
    width: min(456px, calc(100vw - 32px));
  }

  .a9-icon-picker__body {
    display: grid;
    grid-template-columns: 112px minmax(0, 1fr);
    gap: 12px;
    min-height: 280px;
  }

  .a9-icon-picker__categories {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-right: 8px;
    border-right: 1px solid var(--color-neutral-3);
  }

  .a9-icon-picker__category {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 32px;
    padding: 0 8px;
    color: var(--color-text-2);
    font-size: 13px;
    line-height: 20px;
    background: transparent;
    border: 0;
    border-radius: var(--border-radius-small, 4px);
    cursor: pointer;

    &:hover {
      color: var(--color-text-1);
      background: var(--color-fill-2);
    }

    &:focus-visible {
      outline: 2px solid rgb(var(--primary-6));
      outline-offset: -2px;
    }

    &.is-active {
      color: rgb(var(--primary-6));
      font-weight: 500;
      background: var(--color-primary-light-1);
    }
  }

  .a9-icon-picker__category-count {
    color: var(--color-text-3);
    font-size: 12px;
  }

  .a9-icon-picker__results {
    min-width: 0;
  }

  .a9-icon-picker__result-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 32px;
    padding: 0 4px;
    color: var(--color-text-2);
    font-size: 12px;
    line-height: 20px;
  }

  .a9-icon-picker__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, 36px);
    gap: 4px;
    max-height: 248px;
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

  @media (width <= 520px) {
    .a9-icon-picker__body {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .a9-icon-picker__categories {
      flex-direction: row;
      padding: 0 0 8px;
      overflow-x: auto;
      border-right: 0;
      border-bottom: 1px solid var(--color-neutral-3);
    }

    .a9-icon-picker__category {
      flex: 0 0 auto;
      width: auto;
    }
  }
</style>
