<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useLoading } from '../../hooks';

  /**
   * ADataTable —— picker 内部复用的分页列表基座（不对外全局注册）。
   * 收敛 pagination / loading / keyword / fetchData 样板，不包含 action 列，row-key 可配置。
   *
   * fetcher 由使用方注入（库不调具体后端），返回 { list, total }。
   */
  export interface ADataTableFetcherResult<T = any> {
    list: T[];
    total: number;
  }

  const props = withDefaults(
    defineProps<{
      columns: any[];
      /** 行 key 字段名，默认 'id'（不硬编码，由使用方决定） */
      rowKey?: string;
      /** 数据获取函数，注入式 */
      fetcher: (params: { page: number; pageSize: number; keyword?: string }) => Promise<ADataTableFetcherResult>;
      pageSize?: number;
      searchable?: boolean;
      multiple?: boolean;
      /** 选中行 key 数组（v-model:selectedRowKeys） */
      selectedRowKeys?: (string | number)[];
    }>(),
    {
      rowKey: 'id',
      pageSize: 10,
      searchable: false,
      multiple: false,
      selectedRowKeys: () => [],
    }
  );

  const emit = defineEmits<{
    (e: 'update:selectedRowKeys', keys: (string | number)[]): void;
    (e: 'select', rows: any[]): void;
  }>();

  const { t } = useI18n();
  const { loading, setLoading } = useLoading();
  const keyword = ref('');
  const data = ref<any[]>([]);
  const pagination = ref({
    current: 1,
    pageSize: props.pageSize,
    total: 0,
    showTotal: true,
    showPageSize: true,
  });

  const tableProps = computed(() => ({
    rowKey: props.rowKey,
    data: data.value,
    loading: loading.value,
    pagination: pagination.value,
    bordered: false,
    rowSelection: props.multiple
      ? {
          selectedRowKeys: props.selectedRowKeys,
          onChange: (keys: (string | number)[]) => {
            emit('update:selectedRowKeys', keys);
            const rows = data.value.filter((row) => keys.includes((row as any)[props.rowKey]));
            emit('select', rows);
          },
        }
      : undefined,
  }));

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

  const refresh = () => fetchData();
  const clearSelection = () => emit('update:selectedRowKeys', []);

  watch(() => props.fetcher, fetchData, { immediate: true });

  defineExpose({ refresh, clearSelection });
</script>

<template>
  <div class="a9-data-table">
    <div v-if="searchable" class="a9-data-table__search">
      <a-input-search
        v-model="keyword"
        :placeholder="t('admin9Ui.dataTable.searchPlaceholder')"
        allow-clear
        @search="handleSearch"
      />
      <a-button @click="refresh">
        <template #icon><icon-refresh /></template>
      </a-button>
    </div>
    <a-table v-bind="{ ...tableProps, ...$attrs }" @page-change="onPageChange" @page-size-change="onPageSizeChange" />
  </div>
</template>

<style lang="less" scoped>
  .a9-data-table {
    &__search {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }
  }
</style>
