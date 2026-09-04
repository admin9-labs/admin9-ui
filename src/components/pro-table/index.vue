<script setup lang="ts" generic="T extends object = Record<string, unknown>">
  import { computed, ref, shallowRef, watch, useSlots } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { TableColumnData } from '@arco-design/web-vue';
  import { useLoading } from '../../hooks';
  import type {
    Action,
    AProTableEmits,
    ProTableFetcher,
    ProTablePermission,
    ProTableRequestOptions,
    ProTableRowKey,
  } from './types';

  /**
   * AProTable —— 页面级业务表格（对外注册）。
   *
   * 定位（见 DESIGN.md §4）：页面级表格，收敛 fetcher + 分页 + loading + 可选 action 列。
   *
   * AProTable 用 fetcher 注入自管请求，rowKey 可配，action 列支持配置式操作与插槽扩展。
   *
   * 精简原则：收敛 fetcher、分页、loading 与轻量工具栏布局，不拥有 query 表单、业务命令或导出能力。
   * 后端能力一律通过 fetcher 注入，库不调任何后端。
   */
  defineOptions({
    name: 'AProTable',
    inheritAttrs: false,
  });

  const props = withDefaults(
    defineProps<{
      columns: TableColumnData[];
      /** 行 key 字段名，默认 'id'（不硬编码，由调用方决定） */
      rowKey?: string;
      /** 数据获取函数，注入式（库不调具体后端） */
      fetcher: ProTableFetcher<T>;
      pageSize?: number;
      /** 是否启用分页 */
      pagination?: boolean;
      /** 是否显示搜索框 */
      searchable?: boolean;
      /** 是否显示内置刷新按钮；未传时跟随 searchable */
      refreshable?: boolean;
      /** 是否提供无标题数据工作台表面 */
      surface?: boolean;
      /** 是否显式追加 action 列 */
      showAction?: boolean;
      /** 配置式行操作，按声明顺序渲染在 actions/action 插槽之前 */
      actions?: Action<T>[];
      /** 单项权限判断；权限数组中任一权限通过即可显示操作 */
      permission?: ProTablePermission;
      /** 多选模式（开启后通过 v-model:selectedRowKeys 受控） */
      multiple?: boolean;
      /** 选中行 key 数组（v-model:selectedRowKeys） */
      selectedRowKeys?: ProTableRowKey[];
    }>(),
    {
      rowKey: 'id',
      pageSize: 10,
      pagination: true,
      searchable: false,
      refreshable: undefined,
      surface: false,
      showAction: false,
      actions: () => [],
      multiple: false,
      selectedRowKeys: () => [],
    }
  );

  const emit = defineEmits<AProTableEmits<T>>();

  const { t } = useI18n();
  const { loading, setLoading } = useLoading();
  const slots = useSlots();

  const keyword = ref('');
  const data = shallowRef<T[]>([]);
  const paginationState = ref({
    current: 1,
    pageSize: props.pageSize,
    total: 0,
    showTotal: true,
    showPageSize: true,
  });
  const tablePagination = computed(() => (props.pagination ? paginationState.value : false));
  const showRefresh = computed(() => props.refreshable ?? props.searchable);
  const hasToolbarLeft = computed(() => Boolean(slots['toolbar-left']));
  const hasToolbarRight = computed(() => props.searchable || showRefresh.value || Boolean(slots['toolbar-right']));
  const hasToolbar = computed(() => hasToolbarLeft.value || hasToolbarRight.value);
  let latestRequest = 0;

  /** action 列内部标识，避免调用方已自带 action 列时重复追加 */
  const ACTION_COLUMN_KEY = 'a9-pro-table-action';

  const canUseAction = (action: Action<T>) => {
    if (!action.permissions || (Array.isArray(action.permissions) && action.permissions.length === 0)) return true;
    const { permission } = props;
    if (!permission) return false;
    const permissions = Array.isArray(action.permissions) ? action.permissions : [action.permissions];
    return permissions.some(permission);
  };

  const visibleActions = computed(() => props.actions.filter(canUseAction));
  const hasActionContent = computed(
    () => props.showAction || visibleActions.value.length > 0 || Boolean(slots.actions) || Boolean(slots.action)
  );

  /** 最终列：有配置式操作或操作插槽时自动追加，并保留 showAction 显式控制。 */
  const mergedColumns = computed<TableColumnData[]>(() => {
    if (!hasActionContent.value) return props.columns;
    const hasAction = props.columns.some((c) => c.slotName === 'action' || c.dataIndex === ACTION_COLUMN_KEY);
    if (hasAction) return props.columns;
    return [
      ...props.columns,
      {
        dataIndex: ACTION_COLUMN_KEY,
        title: t('admin9Ui.proTable.action'),
        slotName: 'action',
        width: 160,
        align: 'center',
        fixed: 'right',
      },
    ];
  });

  const rowSelection = computed(() =>
    props.multiple
      ? {
          selectedRowKeys: props.selectedRowKeys,
          onChange: (keys: (string | number)[]) => {
            emit('update:selectedRowKeys', keys);
            const rows = data.value.filter((row) =>
              keys.includes((row as Record<string, unknown>)[props.rowKey] as string | number)
            );
            emit('select', rows);
          },
        }
      : undefined
  );

  const updateLoading = (value: boolean) => {
    if (loading.value === value) return;
    setLoading(value);
    emit('loadingChange', value);
  };

  const doRequest = async ({ clearCurrentData = false }: ProTableRequestOptions = {}): Promise<void> => {
    const request = latestRequest + 1;
    latestRequest = request;
    if (clearCurrentData) data.value = [];
    updateLoading(true);
    try {
      const page = props.pagination ? paginationState.value.current : 1;
      const { list, total } = await props.fetcher({
        page,
        pageSize: paginationState.value.pageSize,
        keyword: keyword.value || undefined,
      });
      if (request !== latestRequest) return;
      if (props.pagination && page > 1) {
        const lastPage = Math.max(1, Math.ceil(total / paginationState.value.pageSize));
        if (page > lastPage) {
          paginationState.value.current = lastPage;
          await doRequest();
          return;
        }
      }
      data.value = list;
      paginationState.value.total = total;
    } catch (error) {
      if (request === latestRequest) emit('error', error);
      throw error;
    } finally {
      if (request === latestRequest) updateLoading(false);
    }
  };

  /** UI 事件不暴露 Promise；失败已通过 error 事件通知调用方。 */
  const fetchDataFromUi = () => {
    doRequest().catch(() => undefined);
  };

  const onPageChange = (page: number) => {
    if (!props.pagination) return;
    paginationState.value.current = page;
    fetchDataFromUi();
  };

  const onPageSizeChange = (size: number) => {
    if (!props.pagination) return;
    paginationState.value.current = 1;
    paginationState.value.pageSize = size;
    fetchDataFromUi();
  };

  const handleSearch = () => {
    paginationState.value.current = 1;
    fetchDataFromUi();
  };

  /** 重新拉取数据；显式传 true 时先回到第一页。 */
  const refresh = (resetPage = false) => {
    if (resetPage) paginationState.value.current = 1;
    return doRequest();
  };

  /** 清空多选（受控：通知父组件清空 selectedRowKeys） */
  const clearSelection = () => emit('update:selectedRowKeys', []);

  watch(() => props.fetcher, fetchDataFromUi, { immediate: true });

  defineExpose({ doRequest, refresh, clearSelection });
</script>

<template>
  <div class="a9-pro-table" :class="{ 'a9-pro-table--surface': surface }">
    <div v-if="hasToolbar" class="a9-pro-table__toolbar">
      <div v-if="hasToolbarLeft" class="a9-pro-table__toolbar-left">
        <slot name="toolbar-left" />
      </div>
      <div v-if="hasToolbarRight" class="a9-pro-table__toolbar-right">
        <a-input-search
          v-if="searchable"
          v-model="keyword"
          class="a9-pro-table__search"
          :placeholder="t('admin9Ui.proTable.searchPlaceholder')"
          allow-clear
          @search="handleSearch"
        />
        <a-tooltip v-if="showRefresh" :content="t('admin9Ui.proTable.refresh')">
          <a-button
            class="a9-pro-table__refresh"
            shape="circle"
            :loading="loading"
            :aria-label="t('admin9Ui.proTable.refresh')"
            @click="fetchDataFromUi"
          >
            <template #icon><icon-refresh /></template>
          </a-button>
        </a-tooltip>
        <slot name="toolbar-right" />
      </div>
    </div>
    <a-table
      v-bind="$attrs"
      :columns="mergedColumns"
      :data="data"
      :loading="loading"
      :pagination="tablePagination"
      :row-key="rowKey"
      :row-selection="rowSelection"
      :bordered="false"
      @page-change="onPageChange"
      @page-size-change="onPageSizeChange"
    >
      <template #action="scoped">
        <a-space>
          <a-button
            v-for="(action, index) in visibleActions"
            :key="index"
            class="a9-pro-table__action"
            type="text"
            size="small"
            @click="action.onClick(scoped.record)"
          >
            {{ action.label }}
          </a-button>
          <slot name="actions" v-bind="scoped" />
          <slot name="action" v-bind="scoped" />
        </a-space>
      </template>
      <template
        v-for="key in Object.keys(slots).filter(
          (name) => !['action', 'actions', 'footer', 'popover', 'toolbar-left', 'toolbar-right'].includes(name)
        )"
        :key="key"
        #[key]="scoped"
      >
        <slot :name="key" v-bind="scoped" />
      </template>
    </a-table>
    <slot name="footer" :data="data" :total="paginationState.total" />
    <slot name="popover" />
  </div>
</template>

<style lang="less" scoped>
  .a9-pro-table {
    box-sizing: border-box;
    min-width: 0;
    max-width: 100%;

    &--surface {
      padding: 20px;
      background: var(--color-bg-2);
      border-radius: 4px;
    }

    &__toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      min-width: 0;
      margin-bottom: 12px;
    }

    &__toolbar-left,
    &__toolbar-right {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      min-width: 0;
    }

    &__toolbar-left {
      flex: 1 1 auto;
    }

    &__toolbar-right {
      flex: 0 1 auto;
      justify-content: flex-end;
      margin-left: auto;
    }

    &__search {
      flex: 0 1 240px;
      width: 240px;
      max-width: 100%;
    }

    &__refresh {
      flex: 0 0 32px;
      width: 32px;
      height: 32px;
      padding: 0;
    }

    @media (width <= 575px) {
      &__toolbar {
        align-items: stretch;
      }

      &__toolbar-left,
      &__toolbar-right {
        flex: 1 1 100%;
        width: 100%;
      }

      &__toolbar-right {
        margin-left: 0;
      }

      &__search {
        flex: 1 1 100%;
        width: 100%;
      }
    }
  }
</style>
