<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import type { TableColumnData } from '@arco-design/web-vue';
  import { AIconPicker, AMediaLibrary, AMediaPicker, AProTable, type MediaItem, type MediaType } from '../src';
  import { createFakeMediaService, type AcceptanceState } from './fake-media-service';
  import createFakeMediaLibraryService from './fake-media-library-service';

  interface TableRow {
    id: number;
    name: string;
    owner: string;
    status: 'ready' | 'draft' | 'blocked';
    updatedAt: string;
  }

  interface TableQuery {
    page: number;
    pageSize: number;
    keyword?: string;
  }

  const stateOptions: { label: string; value: AcceptanceState }[] = [
    { label: '正常', value: 'normal' },
    { label: '加载', value: 'loading' },
    { label: '空数据', value: 'empty' },
    { label: '失败', value: 'error' },
  ];
  const mediaTypeOptions: { label: string; value: MediaType }[] = [
    { label: '图片', value: 'image' },
    { label: '视频', value: 'video' },
    { label: '音频', value: 'audio' },
  ];

  const rows: TableRow[] = [
    { id: 101, name: '组件契约', owner: 'UI Core', status: 'ready', updatedAt: '2026-08-09 09:40' },
    { id: 102, name: '类型声明', owner: 'Package', status: 'ready', updatedAt: '2026-08-09 09:32' },
    { id: 103, name: '样式入口', owner: 'Theme', status: 'draft', updatedAt: '2026-08-09 09:18' },
    { id: 104, name: 'Locale 入口', owner: 'I18n', status: 'ready', updatedAt: '2026-08-09 09:02' },
    { id: 105, name: '消费构建', owner: 'Release', status: 'blocked', updatedAt: '2026-08-09 08:56' },
    { id: 106, name: '浏览器验收', owner: 'QA', status: 'draft', updatedAt: '2026-08-09 08:45' },
  ];

  const columns: TableColumnData[] = [
    { title: '编号', dataIndex: 'id', width: 88 },
    { title: '检查项', dataIndex: 'name' },
    { title: '责任域', dataIndex: 'owner', width: 120 },
    { title: '状态', dataIndex: 'status', slotName: 'status', width: 100 },
    { title: '更新时间', dataIndex: 'updatedAt', width: 168 },
  ];

  const tableState = ref<AcceptanceState>('normal');
  const tableError = ref(false);
  const selectedRowKeys = ref<(string | number)[]>([]);
  const iconValue = ref('icon-apps');
  const mediaState = ref<AcceptanceState>('normal');
  const mediaType = ref<MediaType>('image');
  const mediaValue = ref<MediaItem[]>([]);
  const lastMediaEvent = ref('尚未选择');
  const libraryState = ref<AcceptanceState>('normal');
  const libraryType = ref<MediaType>('image');
  const lastLibraryEvent = ref('等待管理操作');

  const tableFetcher = computed(() => {
    const scenario = tableState.value;
    return async ({ page, pageSize, keyword }: TableQuery) => {
      tableError.value = false;
      if (scenario === 'loading') {
        return new Promise<{ list: TableRow[]; total: number }>(() => {
          // Keep the request pending so the loading contract remains visible during acceptance.
        });
      }
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 360);
      });
      if (scenario === 'error') {
        tableError.value = true;
        throw new Error('Acceptance host: simulated table fetch failure');
      }
      if (scenario === 'empty') return { list: [], total: 0 };

      const normalizedKeyword = keyword?.trim().toLowerCase();
      const filtered = normalizedKeyword
        ? rows.filter((row) =>
            [row.name, row.owner, row.status].some((value) => value.toLowerCase().includes(normalizedKeyword))
          )
        : rows;
      const offset = (page - 1) * pageSize;
      return { list: filtered.slice(offset, offset + pageSize), total: filtered.length };
    };
  });

  const mediaService = computed(() => createFakeMediaService(mediaState.value));
  const mediaLibraryService = computed(() => createFakeMediaLibraryService(libraryState.value));
  const statusColor = (status: TableRow['status']) => {
    if (status === 'ready') return 'green';
    if (status === 'blocked') return 'red';
    return 'orange';
  };
  const statusText = (status: TableRow['status']) => {
    if (status === 'ready') return '就绪';
    if (status === 'blocked') return '阻塞';
    return '草稿';
  };
  const recordMediaEvent = (items: MediaItem[]) => {
    lastMediaEvent.value = items.length ? items.map((item) => item.name).join('、') : '已清空';
  };
  const recordLibraryUpload = (item: MediaItem) => {
    lastLibraryEvent.value = `已上传 ${item.name}`;
  };
  const recordLibraryDelete = (ids: string[]) => {
    lastLibraryEvent.value = `已删除 ${ids.length} 项`;
  };
  const recordLibraryMove = (ids: string[], groupId: string | null) => {
    lastLibraryEvent.value = `已移动 ${ids.length} 项到 ${groupId || '未分组'}`;
  };

  watch(mediaType, () => {
    mediaValue.value = [];
    lastMediaEvent.value = '尚未选择';
  });
  watch(libraryType, () => {
    lastLibraryEvent.value = '等待管理操作';
  });
</script>

<template>
  <div class="acceptance-shell">
    <header class="topbar">
      <div>
        <div class="product-name">@admin9-labs/admin9-ui</div>
        <h1>独立验收宿主</h1>
      </div>
      <div class="backend-badge"><span aria-hidden="true" />Fake service</div>
    </header>

    <nav class="section-nav" aria-label="组件验收导航">
      <a href="#pro-table">AProTable</a>
      <a href="#icon-picker">AIconPicker</a>
      <a href="#media-picker">AMediaPicker</a>
      <a href="#media-library">AMediaLibrary</a>
    </nav>

    <main>
      <section id="pro-table" class="acceptance-section" data-testid="pro-table-section">
        <div class="section-heading">
          <div>
            <span class="section-index">01</span>
            <h2>AProTable</h2>
          </div>
          <a-radio-group v-model="tableState" type="button" size="small" data-testid="table-state-control">
            <a-radio v-for="option in stateOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </a-radio>
          </a-radio-group>
        </div>

        <a-alert v-if="tableError" type="error" data-testid="table-error-state">模拟 fetcher 已拒绝请求</a-alert>
        <div class="component-frame">
          <AProTable
            :key="tableState"
            v-model:selected-row-keys="selectedRowKeys"
            :columns="columns"
            :fetcher="tableFetcher"
            :page-size="4"
            :scroll="{ x: 760 }"
            searchable
            show-action
            multiple
          >
            <template #status="{ record }">
              <a-tag :color="statusColor(record.status)">{{ statusText(record.status) }}</a-tag>
            </template>
            <template #action="{ record }">
              <a-button type="text" size="small" @click="selectedRowKeys = [record.id]">定位</a-button>
            </template>
          </AProTable>
        </div>
      </section>

      <section id="icon-picker" class="acceptance-section" data-testid="icon-picker-section">
        <div class="section-heading">
          <div>
            <span class="section-index">02</span>
            <h2>AIconPicker</h2>
          </div>
          <a-tag color="arcoblue">{{ iconValue || '未选择' }}</a-tag>
        </div>

        <div class="icon-workspace component-frame">
          <label for="icon-picker-field">图标字段</label>
          <AIconPicker
            id="icon-picker-field"
            v-model="iconValue"
            allow-clear
            placeholder="选择一个 Arco 图标"
            data-testid="icon-picker"
          />
          <span class="scenario-note">官方分类 · 跨分类搜索 · 搜索清空恢复分类 · 空结果</span>
        </div>
      </section>

      <section id="media-picker" class="acceptance-section" data-testid="media-picker-section">
        <div class="section-heading">
          <div>
            <span class="section-index">03</span>
            <h2>AMediaPicker</h2>
          </div>
          <div class="section-controls">
            <a-radio-group v-model="mediaType" type="button" size="small" data-testid="media-type-control">
              <a-radio v-for="option in mediaTypeOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </a-radio>
            </a-radio-group>
            <a-radio-group v-model="mediaState" type="button" size="small" data-testid="media-state-control">
              <a-radio v-for="option in stateOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </a-radio>
            </a-radio-group>
          </div>
        </div>

        <div class="media-workspace component-frame">
          <div>
            <div class="field-label">素材字段</div>
            <AMediaPicker
              :key="`${mediaType}-${mediaState}`"
              v-model="mediaValue"
              :service="mediaService"
              :media-type="mediaType"
              :limit="3"
              :page-size="8"
              multiple
              can-delete
              data-testid="media-picker"
              @change="recordMediaEvent"
              @select="recordMediaEvent"
            />
          </div>
          <dl class="event-readout" aria-live="polite">
            <dt>当前场景</dt>
            <dd>{{ stateOptions.find((option) => option.value === mediaState)?.label }}</dd>
            <dt>素材类型</dt>
            <dd>{{ mediaTypeOptions.find((option) => option.value === mediaType)?.label }}</dd>
            <dt>最近事件</dt>
            <dd>{{ lastMediaEvent }}</dd>
          </dl>
        </div>
      </section>

      <section id="media-library" class="acceptance-section" data-testid="media-library-section">
        <div class="section-heading">
          <div>
            <span class="section-index">04</span>
            <h2>AMediaLibrary</h2>
          </div>
          <div class="section-controls">
            <a-radio-group v-model="libraryType" type="button" size="small" data-testid="library-type-control">
              <a-radio v-for="option in mediaTypeOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </a-radio>
            </a-radio-group>
            <a-radio-group v-model="libraryState" type="button" size="small" data-testid="library-state-control">
              <a-radio v-for="option in stateOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </a-radio>
            </a-radio-group>
          </div>
        </div>

        <div class="library-workspace">
          <AMediaLibrary
            :key="`${libraryType}-${libraryState}`"
            :service="mediaLibraryService"
            :media-type="libraryType"
            :page-size="2"
            data-testid="media-library"
            @upload-success="recordLibraryUpload"
            @delete-success="recordLibraryDelete"
            @move-success="recordLibraryMove"
          />
          <dl class="library-event-readout" aria-live="polite">
            <dt>素材类型</dt>
            <dd>{{ mediaTypeOptions.find((option) => option.value === libraryType)?.label }}</dd>
            <dt>当前场景</dt>
            <dd>{{ stateOptions.find((option) => option.value === libraryState)?.label }}</dd>
            <dt>最近事件</dt>
            <dd>{{ lastLibraryEvent }}</dd>
          </dl>
        </div>
      </section>
    </main>
  </div>
</template>
