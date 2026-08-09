<script setup lang="ts">
  import { computed, ref, watch, useSlots } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { type TableColumnData, type TableData } from '@arco-design/web-vue';
  import { useLoading } from '../../hooks';

  /**
   * AProTable —— 页面级业务表格（对外注册）。
   *
   * 定位（见 DESIGN.md §5）：页面级表格，收敛 fetcher + 分页 + loading + 可选 action 列。
   *
   * AProTable 用 fetcher 注入自管请求，rowKey 可配，action 列可配且内容完全由
   * #action 插槽自定义（无内置编辑/删除）。
   *
   * 精简原则：只收敛 fetcher+分页+loading，不做 query 表单/工具栏/批量操作/导出那套重的。
   * 后端能力一律通过 fetcher 注入，库不调任何后端。
   */
  defineOptions({
    name: 'AProTable',
    inheritAttrs: false,
  });

  /** fetcher 入参 */
  export interface ProTableFetcherParams {
    /** 1-based 页码 */
    page: number;
    pageSize: number;
    /** 搜索关键词，无则 undefined */
    keyword?: string;
  }

  /** fetcher 返回 */
  export interface ProTableFetcherResult<T = TableData> {
    list: T[];
    total: number;
  }

  const props = withDefaults(
    defineProps<{
      columns: TableColumnData[];
      /** 行 key 字段名，默认 'id'（不硬编码，由调用方决定） */
      rowKey?: string;
      /** 数据获取函数，注入式（库不调具体后端） */
      fetcher: (params: ProTableFetcherParams) => Promise<ProTableFetcherResult>;
      pageSize?: number;
      /** 是否显示搜索框 */
      searchable?: boolean;
      /** 是否追加 action 列（内容由 #action 插槽自定义，无内置编辑/删除） */
      showAction?: boolean;
      /** 多选模式（开启后通过 v-model:selectedRowKeys 受控） */
      multiple?: boolean;
      /** 选中行 key 数组（v-model:selectedRowKeys） */
      selectedRowKeys?: (string | number)[];
    }>(),
    {
      rowKey: 'id',
      pageSize: 10,
      searchable: false,
      showAction: false,
      multiple: false,
      selectedRowKeys: () => [],
    }
  );

  const emit = defineEmits<{
    (e: 'update:selectedRowKeys', keys: (string | number)[]): void;
    (e: 'select', rows: TableData[]): void;
  }>();

  const { t } = useI18n();
  const { loading, setLoading } = useLoading();
  const slots = useSlots();

  const keyword = ref('');
  const data = ref<TableData[]>([]);
  const pagination = ref({
    current: 1,
    pageSize: props.pageSize,
    total: 0,
    showTotal: true,
    showPageSize: true,
  });

  /** action 列内部标识，避免调用方已自带 action 列时重复追加 */
  const ACTION_COLUMN_KEY = 'a9-pro-table-action';

  /** 最终列：showAction=true 时追加一列，内容由 #action 插槽决定 */
  const mergedColumns = computed<TableColumnData[]>(() => {
    if (!props.showAction) return props.columns;
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
            const rows = data.value.filter((row: TableData) => keys.includes(row[props.rowKey] as string | number));
            emit('select', rows);
          },
        }
      : undefined
  );

  const fetchData = async () => {
    setLoading(true);
    try {
      const { list, total } = await props.fetcher({
        page: pagination.value.current,
        pageSize: pagination.value.pageSize,
        keyword: keyword.value || undefined,
      });
      data.value = list;
      pagination.value.total = total;
    } finally {
      setLoading(false);
    }
  };

  const onPageChange = (page: number) => {
    pagination.value.current = page;
    fetchData();
  };

  const onPageSizeChange = (size: number) => {
    pagination.value.current = 1;
    pagination.value.pageSize = size;
    fetchData();
  };

  const handleSearch = () => {
    pagination.value.current = 1;
    fetchData();
  };

  /** 重新拉取当前页数据 */
  const refresh = () => fetchData();

  /** 清空多选（受控：通知父组件清空 selectedRowKeys） */
  const clearSelection = () => emit('update:selectedRowKeys', []);

  watch(() => props.fetcher, fetchData, { immediate: true });

  defineExpose({ refresh, clearSelection });
</script>

<template>
  <div class="a9-pro-table">
    <div v-if="searchable" class="a9-pro-table__search">
      <a-input-search
        v-model="keyword"
        :placeholder="t('admin9Ui.proTable.searchPlaceholder')"
        allow-clear
        @search="handleSearch"
      />
      <a-button @click="refresh">
        <template #icon><icon-refresh /></template>
        {{ t('admin9Ui.proTable.refresh') }}
      </a-button>
    </div>
    <a-table
      v-bind="$attrs"
      :columns="mergedColumns"
      :data="data"
      :loading="loading"
      :pagination="pagination"
      :row-key="rowKey"
      :row-selection="rowSelection"
      :bordered="false"
      @page-change="onPageChange"
      @page-size-change="onPageSizeChange"
    >
      <template v-for="key in Object.keys(slots)" :key="key" #[key]="scoped">
        <slot :name="key" v-bind="scoped" />
      </template>
    </a-table>
  </div>
</template>

<style lang="less" scoped>
  .a9-pro-table {
    &__search {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }
  }
</style>
