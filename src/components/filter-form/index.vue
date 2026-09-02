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
  import { Button, Form, Grid, GridItem, type FormInstance, type ResponsiveValue } from '@arco-design/web-vue';
  import { useI18n } from 'vue-i18n';

  const COLLAPSE_THRESHOLD_ROWS = 2;
  const COLLAPSED_VISIBLE_ROWS = 1;
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
            'autoLabelWidth': true,
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
                  Grid,
                  {
                    class: 'a9-filter-form__fields',
                    cols: props.cols,
                    collapsed: overflow && collapsed.value,
                    collapsedRows: COLLAPSED_VISIBLE_ROWS,
                    colGap: 24,
                    rowGap: 16,
                  },
                  {
                    default: () =>
                      fieldNodes.map((node, index) =>
                        h(
                          GridItem,
                          {
                            key: node.key ?? index,
                            class: 'a9-filter-form__field',
                          },
                          { default: () => node }
                        )
                      ),
                  }
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
    width: 100%;

    &__body {
      display: flex;
      gap: 24px;
      align-items: flex-start;
      width: 100%;
    }

    &__fields {
      flex: 1 1 auto;
      min-width: 0;
    }

    &__field {
      min-width: 0;

      :deep(.arco-form-item) {
        width: 100%;
        margin-bottom: 0;
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
