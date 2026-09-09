<script lang="ts">
  import {
    Comment,
    Fragment,
    Text,
    computed,
    defineComponent,
    h,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    resolveComponent,
    type Component,
    type PropType,
    type VNode,
  } from 'vue';
  import { Button, Form, type FormInstance, type ResponsiveValue } from '@arco-design/web-vue';
  import { useI18n } from 'vue-i18n';

  const COLLAPSE_THRESHOLD_ROWS = 2;
  const COLLAPSED_VISIBLE_ROWS = 1;
  const FIELD_COLUMN_GAP = 24;
  const DEFAULT_COLS: ResponsiveValue = { xs: 1, sm: 1, md: 2, lg: 3, xl: 3, xxl: 3 };
  const BREAKPOINTS: [keyof ResponsiveValue, number][] = [
    ['xxl', 1600],
    ['xl', 1200],
    ['lg', 992],
    ['md', 768],
    ['sm', 576],
    ['xs', 0],
  ];

  const flattenSlotNodes = (nodes: VNode[]): VNode[] =>
    nodes.flatMap((node) => {
      if (node.type === Fragment && Array.isArray(node.children)) {
        return flattenSlotNodes(node.children as VNode[]);
      }
      if (node.type === Comment) return [];
      if (node.type === Text && String(node.children ?? '').trim() === '') return [];
      return [node];
    });

  const resolveCols = (cols: number | ResponsiveValue, width: number) => {
    if (typeof cols === 'number') return Math.max(1, Math.floor(cols));
    const matched = BREAKPOINTS.find(([key, minWidth]) => width >= minWidth && cols[key] !== undefined);
    return Math.max(1, Math.floor(matched ? cols[matched[0]] ?? 24 : 24));
  };

  export default defineComponent({
    name: 'AFilterForm',
    inheritAttrs: false,
    props: {
      model: {
        type: Object as PropType<object>,
        required: true,
      },
      cols: {
        type: [Number, Object] as PropType<number | ResponsiveValue>,
        default: () => ({ ...DEFAULT_COLS }),
      },
      fieldFlex: {
        type: Object as PropType<Record<string, number>>,
        default: () => ({}),
      },
      loading: {
        type: Boolean,
        default: false,
      },
    },
    emits: {
      search: (values: Record<string, unknown>) => Boolean(values),
      reset: () => true,
    },
    setup(props, { attrs, emit, slots }) {
      const { t } = useI18n();
      const formRef = ref<FormInstance>();
      const collapsed = ref(true);
      const viewportWidth = ref(1600);
      const activeCols = computed(() => resolveCols(props.cols, viewportWidth.value));
      let resetCollapseScheduled = false;
      let currentOverflow = false;

      const updateViewportWidth = () => {
        viewportWidth.value = window.innerWidth;
      };

      onMounted(() => {
        updateViewportWidth();
        window.addEventListener('resize', updateViewportWidth);
      });
      onBeforeUnmount(() => window.removeEventListener('resize', updateViewportWidth));

      const scheduleCollapseReset = () => {
        if (!resetCollapseScheduled) {
          resetCollapseScheduled = true;
          nextTick(() => {
            collapsed.value = true;
            resetCollapseScheduled = false;
          });
        }
      };

      const handleSearch = (values: Record<string, unknown>) => emit('search', values);
      const handleSubmitFailed = () => {
        if (currentOverflow) collapsed.value = false;
      };
      const handleReset = () => {
        formRef.value?.clearValidate();
        emit('reset');
      };

      const SearchIcon = resolveComponent('IconSearch') as Component;
      const RefreshIcon = resolveComponent('IconRefresh') as Component;
      const DownIcon = resolveComponent('IconDown') as Component;
      const UpIcon = resolveComponent('IconUp') as Component;

      return () => {
        const fieldNodes = flattenSlotNodes(slots.default?.() ?? []);
        const rowCount = Math.ceil(fieldNodes.length / activeCols.value);
        const fieldWeights = fieldNodes.map((node) => {
          const field = node.props?.field;
          const weight = typeof field === 'string' ? props.fieldFlex[field] : undefined;
          return typeof weight === 'number' && Number.isFinite(weight) && weight > 0 ? weight : 1;
        });
        const rowWeights = Array.from({ length: rowCount }, (_, row) => {
          const weights = fieldWeights.slice(row * activeCols.value, (row + 1) * activeCols.value);
          return weights.reduce((total, weight) => total + weight, activeCols.value - weights.length);
        });
        const overflow = rowCount > COLLAPSE_THRESHOLD_ROWS;
        currentOverflow = overflow;
        if (!overflow && !collapsed.value) scheduleCollapseReset();

        const visibleRows = overflow && collapsed.value ? COLLAPSED_VISIBLE_ROWS : rowCount;
        const singleRow = visibleRows <= 1;
        let layout = singleRow ? 'single' : 'multiple';
        if (overflow) layout = collapsed.value ? 'collapsible-collapsed' : 'collapsible-expanded';

        const actions = [
          h(
            Button,
            {
              class: 'a9-filter-form__search',
              type: 'primary',
              htmlType: 'submit',
              loading: props.loading,
            },
            {
              icon: () => h(SearchIcon),
              default: () => t('admin9Ui.filterForm.search'),
            }
          ),
          h(
            Button,
            {
              class: 'a9-filter-form__reset',
              htmlType: 'button',
              onClick: handleReset,
            },
            {
              icon: () => h(RefreshIcon),
              default: () => t('admin9Ui.filterForm.reset'),
            }
          ),
        ];

        if (overflow) {
          actions.push(
            h(
              Button,
              {
                'class': 'a9-filter-form__toggle',
                'type': 'text',
                'htmlType': 'button',
                'aria-expanded': String(!collapsed.value),
                'onClick': () => {
                  collapsed.value = !collapsed.value;
                },
              },
              {
                icon: () => h(collapsed.value ? DownIcon : UpIcon),
                default: () => t(collapsed.value ? 'admin9Ui.filterForm.expand' : 'admin9Ui.filterForm.collapse'),
              }
            )
          );
        }

        return h(
          Form,
          {
            ...attrs,
            'ref': formRef,
            'model': props.model,
            'layout': 'horizontal',
            'labelAlign': 'left',
            'autoLabelWidth': viewportWidth.value <= 767,
            'labelColProps': { flex: 'none' },
            'wrapperColProps': { flex: '1' },
            'class': ['a9-filter-form', attrs.class],
            'data-layout': layout,
            'data-field-count': String(fieldNodes.length),
            'data-active-cols': String(activeCols.value),
            'onSubmitSuccess': handleSearch,
            'onSubmitFailed': handleSubmitFailed,
          },
          {
            default: () =>
              h('div', { class: 'a9-filter-form__body' }, [
                h(
                  'div',
                  {
                    class: 'a9-filter-form__fields',
                    style: { columnGap: `${FIELD_COLUMN_GAP}px` },
                  },
                  fieldNodes.map((node, index) => {
                    const ratio = fieldWeights[index] / rowWeights[Math.floor(index / activeCols.value)];
                    return h(
                      'div',
                      {
                        key: node.key ?? index,
                        class: 'a9-filter-form__field',
                        style: {
                          flexBasis: `calc(${ratio * 100}% - ${(activeCols.value - 1) * FIELD_COLUMN_GAP * ratio}px)`,
                          display: overflow && collapsed.value && index >= activeCols.value ? 'none' : undefined,
                        },
                      },
                      [node]
                    );
                  })
                ),
                h(
                  'div',
                  {
                    class: [
                      'a9-filter-form__actions',
                      singleRow ? 'a9-filter-form__actions--single' : 'a9-filter-form__actions--multiple',
                    ],
                  },
                  actions
                ),
              ]),
          }
        );
      };
    },
  });
</script>

<style lang="less" scoped>
  .a9-filter-form {
    box-sizing: border-box;
    width: 100%;
    padding: 20px;
    background: var(--color-bg-2);
    border-radius: 4px;

    &__body {
      display: flex;
      gap: 24px;
      align-items: flex-start;
      width: 100%;
    }

    &__fields {
      display: flex;
      flex: 1;
      flex-wrap: wrap;
      row-gap: 16px;
      min-width: 0;
    }

    &__field {
      flex: 0 0 auto;
      min-width: 0;

      :deep(.arco-form-item) {
        flex-wrap: nowrap;
        width: 100%;
        margin-bottom: 0;
      }

      :deep(.arco-form-item-label-col) {
        padding-right: 12px;
      }

      :deep(.arco-form-item-wrapper-col) {
        min-width: 0;
      }
    }

    &__actions {
      display: flex;
      flex: 0 0 96px;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
      padding-left: 24px;
      border-left: 1px solid var(--color-neutral-3);

      :deep(.arco-btn) {
        width: 100%;
        white-space: nowrap;
      }
    }

    &__actions--single {
      flex-basis: auto;
      flex-direction: row;
      gap: 8px;

      :deep(.arco-btn) {
        width: auto;
      }
    }

    &__toggle {
      color: rgb(var(--primary-6));
    }
  }

  @media (width <= 767px) {
    .a9-filter-form {
      padding: 16px;

      &__body {
        display: block;
      }

      &__actions,
      &__actions--single {
        flex-flow: row wrap;
        gap: 8px;
        width: 100%;
        margin-top: 16px;
        padding-top: 16px;
        padding-left: 0;
        border-top: 1px solid var(--color-neutral-3);
        border-left: 0;

        :deep(.arco-btn) {
          width: auto;
        }
      }
    }
  }
</style>
