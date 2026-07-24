<script setup lang="ts">
  import { computed, h, inject, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { Button } from '@arco-design/web-vue';
  import { useVisible } from '../../hooks';
  import { admin9UIOptionsKey } from '../../locale';
  import ADataTable from '../data-table/index.vue';
  import type { UserItem, UserService } from '../../services/types';

  /**
   * AUserPicker —— 弹窗分页选人。
   *
   * 复用 AMediaPicker 的"弹窗 + service 注入"模式 + 库内 ADataTable 承载分页列表。
   * - 单选（multiple=false）：行内"选择"按钮即选即关（QQMapSelect footer=false 模式）。
   * - 多选（multiple=true）：row-selection + 底部"确定（带已选数量）/取消"（@before-ok + done(closed) 异步模式）。
   *
   * 库不调任何后端：列表数据通过注入的 `service.list` 获取，fetcher 在此做
   * `{ list, pagination }` → `{ list, total }` 适配。
   */
  const props = withDefaults(
    defineProps<{
      /** 当前选中（单选为 UserItem，多选为 UserItem[]） */
      modelValue?: UserItem[] | UserItem | undefined;
      /** 是否多选 */
      multiple?: boolean;
      /** 用户服务；未传时回退到插件全局注入 */
      service?: UserService;
      /** 每页条数 */
      pageSize?: number;
      /** 触发按钮文案，缺省取 i18n */
      buttonText?: string;
      /** 列配置，缺省用内置默认列（id/name/description/avatar） */
      columns?: any[];
      /** 行 key 字段名 */
      rowKey?: string;
      /** 是否显示搜索框 */
      searchable?: boolean;
    }>(),
    {
      multiple: false,
      pageSize: 10,
      rowKey: 'id',
      searchable: true,
    }
  );

  const emit = defineEmits<{
    (e: 'update:modelValue', value: UserItem[] | UserItem | undefined): void;
    (e: 'change', value: UserItem[] | UserItem | undefined): void;
  }>();

  const { t } = useI18n();
  const { visible, setVisible } = useVisible(false);
  const globalOptions = inject(admin9UIOptionsKey, undefined);
  const service = props.service ?? globalOptions?.userService;
  if (!service) {
    throw new Error(
      '[admin9-ui] AUserPicker requires a UserService. Pass the service prop or install Admin9UI with { userService }.'
    );
  }

  /** 多选已选行 key（v-model 给 ADataTable） */
  const selectedRowKeys = ref<(string | number)[]>([]);
  /** key → UserItem 映射，跨页累积，确认时据此还原完整选中项 */
  const selectedRowsMap = ref<Record<string, UserItem>>({});

  const triggerText = computed(() => props.buttonText ?? t('admin9Ui.userPicker.buttonText'));

  /**
   * fetcher 适配：UserService.list 返回 { list, pagination }，
   * ADataTable 的 fetcher 期望 { list, total }。
   */
  const fetcher = async ({ page, pageSize, keyword }: { page: number; pageSize: number; keyword?: string }) => {
    const { list, pagination } = await service.list({
      page,
      pageSize,
      keyword,
    });
    return { list, total: pagination.total };
  };

  /** 头像列渲染：有则圆角缩略图，无则占位。 */
  const renderAvatar = ({ record }: { record: UserItem }) => {
    if (!record.avatar) {
      return h('span', { class: 'a9-user-picker__avatar-empty' }, '—');
    }
    return h('img', {
      src: record.avatar,
      alt: record.name,
      class: 'a9-user-picker__avatar',
    });
  };

  /** 内置默认列：id/name/description/avatar。 */
  const defaultColumns = computed(() => [
    {
      key: 'id',
      dataIndex: 'id',
      title: t('admin9Ui.userPicker.colId'),
      width: 80,
      ellipsis: true,
      tooltip: true,
    },
    {
      key: 'name',
      dataIndex: 'name',
      title: t('admin9Ui.userPicker.colName'),
      ellipsis: true,
      tooltip: true,
    },
    {
      key: 'description',
      dataIndex: 'description',
      title: t('admin9Ui.userPicker.colDescription'),
      ellipsis: true,
      tooltip: true,
    },
    {
      key: 'avatar',
      dataIndex: 'avatar',
      title: t('admin9Ui.userPicker.colAvatar'),
      width: 80,
      align: 'center',
      render: renderAvatar,
    },
  ]);

  /** 单选：行内"选择"按钮，即选即关。 */
  const onSelectSingle = (record: UserItem) => {
    emit('update:modelValue', record);
    emit('change', record);
    setVisible(false);
  };

  /** 单选专用操作列。 */
  const actionColumn = computed(() => ({
    key: 'operation',
    title: t('admin9Ui.userPicker.select'),
    width: 90,
    align: 'center',
    render: ({ record }: { record: UserItem }) =>
      h(
        Button,
        {
          type: 'text',
          size: 'small',
          onClick: () => onSelectSingle(record),
        },
        { default: () => t('admin9Ui.userPicker.select') }
      ),
  }));

  /** 最终列：调用方传入优先，否则内置默认；单选追加操作列。 */
  const finalColumns = computed(() => {
    const base = props.columns ?? defaultColumns.value;
    return props.multiple ? base : [...base, actionColumn.value];
  });

  /** 多选 okText：已选时带数量。 */
  const okText = computed(() => {
    const count = selectedRowKeys.value.length;
    return count > 0 ? t('admin9Ui.userPicker.okWithCount', { count }) : t('admin9Ui.userPicker.confirm');
  });

  /** 由 modelValue 回填 selectedRowKeys 与 selectedRowsMap。 */
  const seedSelection = () => {
    const mv = props.modelValue;
    let arr: UserItem[] = [];
    if (Array.isArray(mv)) {
      arr = mv;
    } else if (mv) {
      arr = [mv];
    }
    const map: Record<string, UserItem> = {};
    const keys: (string | number)[] = [];
    arr.forEach((u) => {
      const key = String((u as Record<string, unknown>)[props.rowKey] ?? u.id);
      map[key] = u;
      keys.push(key);
    });
    selectedRowsMap.value = map;
    selectedRowKeys.value = keys;
  };

  /** 打开弹窗：多选时先按 modelValue 回填已选。 */
  const openModal = () => {
    if (props.multiple) {
      seedSelection();
    }
    setVisible(true);
  };

  /** ADataTable 勾选变化回调：累积当前页选中行，跨页保留。 */
  const onSelectRows = (rows: UserItem[]) => {
    rows.forEach((r) => {
      const key = String((r as Record<string, unknown>)[props.rowKey] ?? r.id);
      selectedRowsMap.value[key] = r;
    });
  };

  /** 多选确认：@before-ok + done(closed)。空选不关，保留用户继续选。 */
  const onConfirmMultiple = (done: (closed: boolean) => void) => {
    const items = selectedRowKeys.value.map((k) => selectedRowsMap.value[String(k)]).filter((r): r is UserItem => !!r);
    if (items.length === 0) {
      done(false);
      return;
    }
    emit('update:modelValue', items);
    emit('change', items);
    done(true);
  };

  defineExpose({ open: openModal, close: () => setVisible(false) });
</script>

<template>
  <div class="a9-user-picker">
    <a-button @click="openModal">{{ triggerText }}</a-button>
    <a-modal
      v-model:visible="visible"
      :title="t('admin9Ui.userPicker.title')"
      title-align="start"
      :width="720"
      :mask-closable="false"
      :footer="multiple ? undefined : false"
      :ok-text="multiple ? okText : undefined"
      :cancel-text="multiple ? t('admin9Ui.userPicker.cancel') : undefined"
      @before-ok="onConfirmMultiple"
    >
      <a-data-table
        v-model:selected-row-keys="selectedRowKeys"
        :columns="finalColumns"
        :row-key="rowKey"
        :fetcher="fetcher"
        :page-size="pageSize"
        :searchable="searchable"
        :multiple="multiple"
        :scroll="{ y: 360 }"
        @select="onSelectRows"
      />
    </a-modal>
  </div>
</template>

<style lang="less" scoped>
  .a9-user-picker {
    &__avatar {
      width: 32px;
      height: 32px;
      object-fit: cover;
      vertical-align: middle;
      border-radius: 50%;
    }

    &__avatar-empty {
      color: var(--color-text-3);
    }
  }
</style>
