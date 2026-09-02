<script setup lang="ts">
  import { computed, reactive, ref, watch } from 'vue';
  import type { TableColumnData } from '@arco-design/web-vue';
  import {
    ACoordinatePicker,
    AFileManager,
    AFilePicker,
    AFileUploader,
    AFilterForm,
    AIconPicker,
    AProTable,
    ATiptapEditor,
    type FileItem,
    type FileUploadBatchResult,
    type FileManagerAdapter,
    type FilePickerAdapter,
    type FileType,
    type CoordinateSelection,
    type CoordinateValue,
  } from '../src';
  import { type AcceptanceState } from './fake-acceptance-utils';
  import createFakeFileManagerService from './fake-file-manager-service';
  import createFakeFilePickerService from './fake-file-picker-service';

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

  interface FilterModel {
    workOrderNo: string;
    title: string;
    type?: string;
    priority?: string;
    createdAt?: string[];
    status?: string;
    assignee?: string;
    customer?: string;
    keyword: string;
  }

  const createFilterModel = (): FilterModel => ({
    workOrderNo: '',
    title: '',
    type: undefined,
    priority: undefined,
    createdAt: undefined,
    status: undefined,
    assignee: undefined,
    customer: undefined,
    keyword: '',
  });

  const stateOptions: { label: string; value: AcceptanceState }[] = [
    { label: '正常', value: 'normal' },
    { label: '加载', value: 'loading' },
    { label: '空数据', value: 'empty' },
    { label: '失败', value: 'error' },
  ];
  const libraryModeOptions = [
    { label: '管理', value: 'manage' },
    { label: '只读', value: 'readOnly' },
  ] as const;

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
  const singleFilter = reactive(createFilterModel());
  const multipleFilter = reactive(createFilterModel());
  const collapsibleFilter = reactive(createFilterModel());
  const tableError = ref(false);
  const selectedRowKeys = ref<(string | number)[]>([]);
  const iconValue = ref('icon-apps');
  const iconMode = ref<'normal' | 'readonly' | 'disabled'>('normal');
  const coordinateValue = ref<CoordinateValue>({ latitude: 27.894504, longitude: 102.264449 });
  const coordinateMode = ref<'normal' | 'readonly' | 'disabled'>('normal');
  const lastCoordinateEvent = ref('等待选择');
  const tencentMapApiKey = import.meta.env.VITE_TENCENT_MAP_KEY || '';
  const editorMode = ref<'normal' | 'readonly' | 'disabled'>('normal');
  const tiptapFocused = new URLSearchParams(window.location.search).get('component') === 'tiptap-editor';
  const tiptapValue = ref(
    [
      '<h1>活动公告示例</h1>',
      '<p>独占一行的图片用于正文视觉内容，跟随文字的图片 <img src="/media-layout.svg" alt="状态图标" data-display="inline" data-size="1.25em"> 可与文字保持基线。</p>',
      '<img src="/media-board.svg" alt="素材面板" data-display="block" data-width="50%" data-align="left">',
      '<p>长正文验收段落一：正文先自动增高，到达上限后只在编辑器内部滚动。</p>',
      '<p>长正文验收段落二：主工具栏和字数统计始终位于正文滚动区之外，媒体操作使用不占布局的悬浮栏。</p>',
      '<p>长正文验收段落三：下面的高图用于检查在顶部、中部和底部选择时，悬浮栏都锚定当前可见区域。</p>',
      '<img src="/media-tall.svg" alt="长内容工作流示意" data-display="block" data-width="100%" data-align="left">',
      '<p>高图之后的正文用于确认内部滚动能继续访问后续混排内容。</p>',
      '<blockquote><p>引用内容的首尾间距应保持紧凑。</p><p>多段引用仍需清晰分隔。</p></blockquote>',
      '<h2>检查清单</h2>',
      '<ul><li><p>单行列表保持紧凑</p></li><li><p>多段列表第一段</p><p>多段列表第二段</p><ul><li><p>嵌套列表</p></li></ul></li></ul>',
      '<h3>代码与分割线</h3>',
      '<pre><code>const editor = "ATiptapEditor";</code></pre>',
      '<hr>',
      '<video src="/media-motion.mp4" title="演示视频" data-width="75%" data-align="left"></video>',
      '<audio src="/media-tone.wav" title="演示音频" data-width="standard" data-align="center"></audio>',
      '<p>媒体之后仍可通过 Gap Cursor 继续输入，连续媒体不会生成空段落。</p>',
    ].join('')
  );
  const fileManagerState = ref<AcceptanceState>('normal');
  const fileManagerMode = ref<(typeof libraryModeOptions)[number]['value']>('manage');
  const lastFileManagerEvent = ref('等待文件操作');
  const filePickerState = ref<AcceptanceState>('normal');
  const filePickerConstraint = ref<'all' | 'subset' | 'empty'>('subset');
  const filePickerMultiple = ref(true);
  const filePickerValue = ref<FileItem | FileItem[] | undefined>([]);
  const lastFilePickerEvent = ref('尚未选择');
  const lastFileUploaderEvent = ref('等待上传');
  const filePickerConstraintOptions = [
    { label: '全部类型', value: 'all' },
    { label: '图片 + 文档', value: 'subset' },
    { label: '不允许类型', value: 'empty' },
  ] as const;

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

  const fileManagerService = computed<FileManagerAdapter>(() => {
    const service = createFakeFileManagerService(fileManagerState.value);
    return fileManagerMode.value === 'readOnly'
      ? { list: (params) => service.list(params), listGroups: (fileType) => service.listGroups(fileType) }
      : service;
  });
  const fileManagerReadOnly = computed(() => fileManagerMode.value === 'readOnly');
  const filePickerService = computed<FilePickerAdapter>(() => createFakeFilePickerService(filePickerState.value));
  const fileUploaderService = createFakeFileManagerService('normal');
  const filePickerTypes = computed<readonly FileType[]>(() => {
    if (filePickerConstraint.value === 'empty') return [];
    if (filePickerConstraint.value === 'subset') return ['image', 'document'];
    return ['image', 'video', 'audio', 'document', 'archive', 'other'];
  });
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
  const recordCoordinateEvent = (selection: CoordinateSelection) => {
    lastCoordinateEvent.value = selection.title
      ? `${selection.title} · ${selection.latitude}, ${selection.longitude}`
      : `${selection.latitude}, ${selection.longitude}`;
  };
  const resetFilter = (model: FilterModel) => Object.assign(model, createFilterModel());
  const recordFileUpload = (item: FileItem) => {
    lastFileManagerEvent.value = `已上传 ${item.name}`;
  };
  const recordFileDelete = (ids: string[]) => {
    lastFileManagerEvent.value = `已删除 ${ids.length} 项`;
  };
  const recordFileMove = (ids: string[], groupId: string | null) => {
    lastFileManagerEvent.value = `已移动 ${ids.length} 项到 ${groupId || '未分组'}`;
  };
  const recordFilePickerEvent = (items: FileItem[]) => {
    lastFilePickerEvent.value = items.length ? items.map((item) => item.name).join('、') : '已清空';
  };
  const recordFileUploaderEvent = (result: FileUploadBatchResult) => {
    lastFileUploaderEvent.value = `成功 ${result.succeeded.length} 项，失败 ${result.failed.length} 项，取消 ${result.cancelled.length} 项`;
  };

  watch([fileManagerMode, fileManagerState], () => {
    lastFileManagerEvent.value = '等待文件操作';
  });
  watch([filePickerState, filePickerConstraint], () => {
    lastFilePickerEvent.value = '等待选择';
  });
  watch(filePickerMultiple, (multiple) => {
    filePickerValue.value = multiple ? [] : undefined;
    lastFilePickerEvent.value = '等待选择';
  });
</script>

<template>
  <div class="acceptance-shell" :class="{ 'is-component-focused': tiptapFocused }">
    <header v-if="!tiptapFocused" class="topbar">
      <div>
        <div class="product-name">@admin9-labs/admin9-ui</div>
        <h1>独立验收宿主</h1>
      </div>
      <div class="backend-badge"><span aria-hidden="true" />Fake service</div>
    </header>

    <nav v-if="!tiptapFocused" class="section-nav" aria-label="组件验收导航">
      <a href="#filter-form">AFilterForm</a>
      <a href="#pro-table">AProTable</a>
      <a href="#icon-picker">AIconPicker</a>
      <a href="#coordinate-picker">ACoordinatePicker</a>
      <a href="#tiptap-editor">ATiptapEditor</a>
      <a href="#file-manager">AFileManager</a>
      <a href="#file-picker">AFilePicker</a>
      <a href="#file-uploader">AFileUploader</a>
    </nav>

    <main>
      <section v-if="!tiptapFocused" id="filter-form" class="acceptance-section" data-testid="filter-form-section">
        <div class="section-heading">
          <div>
            <span class="section-index">01</span>
            <h2>AFilterForm</h2>
          </div>
        </div>

        <div class="filter-form-gallery">
          <article class="component-frame" data-testid="single-filter-form">
            <h3>单行筛选</h3>
            <AFilterForm :model="singleFilter" @reset="resetFilter(singleFilter)">
              <a-form-item field="workOrderNo" label="工单编号">
                <a-input v-model="singleFilter.workOrderNo" placeholder="请输入工单编号" allow-clear />
              </a-form-item>
              <a-form-item field="title" label="工单标题">
                <a-input v-model="singleFilter.title" placeholder="请输入工单标题" allow-clear />
              </a-form-item>
              <a-form-item field="type" label="工单类型">
                <a-select v-model="singleFilter.type" placeholder="全部" allow-clear>
                  <a-option value="consultation">咨询</a-option>
                  <a-option value="fault">故障</a-option>
                </a-select>
              </a-form-item>
            </AFilterForm>
          </article>

          <article class="component-frame" data-testid="multiple-filter-form">
            <h3>多行筛选</h3>
            <AFilterForm :model="multipleFilter" @reset="resetFilter(multipleFilter)">
              <a-form-item field="workOrderNo" label="工单编号">
                <a-input v-model="multipleFilter.workOrderNo" placeholder="请输入工单编号" allow-clear />
              </a-form-item>
              <a-form-item field="title" label="工单标题">
                <a-input v-model="multipleFilter.title" placeholder="请输入工单标题" allow-clear />
              </a-form-item>
              <a-form-item field="type" label="工单类型">
                <a-select v-model="multipleFilter.type" placeholder="全部" allow-clear />
              </a-form-item>
              <a-form-item field="priority" label="优先级">
                <a-select v-model="multipleFilter.priority" placeholder="全部" allow-clear />
              </a-form-item>
              <a-form-item field="createdAt" label="创建时间">
                <a-range-picker v-model="multipleFilter.createdAt" value-format="YYYY-MM-DD" />
              </a-form-item>
              <a-form-item field="status" label="状态">
                <a-select v-model="multipleFilter.status" placeholder="全部" allow-clear />
              </a-form-item>
            </AFilterForm>
          </article>

          <article class="component-frame" data-testid="collapsible-filter-form">
            <h3>可折叠筛选</h3>
            <AFilterForm :model="collapsibleFilter" @reset="resetFilter(collapsibleFilter)">
              <a-form-item field="workOrderNo" label="工单编号">
                <a-input v-model="collapsibleFilter.workOrderNo" placeholder="请输入工单编号" allow-clear />
              </a-form-item>
              <a-form-item field="title" label="工单标题">
                <a-input v-model="collapsibleFilter.title" placeholder="请输入工单标题" allow-clear />
              </a-form-item>
              <a-form-item field="type" label="工单类型">
                <a-select v-model="collapsibleFilter.type" placeholder="全部" allow-clear />
              </a-form-item>
              <a-form-item field="priority" label="优先级">
                <a-select v-model="collapsibleFilter.priority" placeholder="全部" allow-clear />
              </a-form-item>
              <a-form-item field="createdAt" label="创建时间">
                <a-range-picker v-model="collapsibleFilter.createdAt" value-format="YYYY-MM-DD" />
              </a-form-item>
              <a-form-item field="status" label="状态">
                <a-select v-model="collapsibleFilter.status" placeholder="全部" allow-clear />
              </a-form-item>
              <a-form-item field="assignee" label="处理人">
                <a-select v-model="collapsibleFilter.assignee" placeholder="全部" allow-clear />
              </a-form-item>
              <a-form-item field="customer" label="客户">
                <a-select v-model="collapsibleFilter.customer" placeholder="全部" allow-clear />
              </a-form-item>
              <a-form-item field="keyword" label="关键词">
                <a-input v-model="collapsibleFilter.keyword" placeholder="请输入问题描述关键词" allow-clear />
              </a-form-item>
            </AFilterForm>
          </article>
        </div>
      </section>

      <section v-if="!tiptapFocused" id="pro-table" class="acceptance-section" data-testid="pro-table-section">
        <div class="section-heading">
          <div>
            <span class="section-index">02</span>
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

      <section v-if="!tiptapFocused" id="icon-picker" class="acceptance-section" data-testid="icon-picker-section">
        <div class="section-heading">
          <div>
            <span class="section-index">03</span>
            <h2>AIconPicker</h2>
          </div>
          <div class="section-controls">
            <a-radio-group v-model="iconMode" type="button" size="small" data-testid="icon-mode-control">
              <a-radio value="normal">正常</a-radio>
              <a-radio value="readonly">只读</a-radio>
              <a-radio value="disabled">禁用</a-radio>
            </a-radio-group>
            <a-tag color="arcoblue">{{ iconValue || '未选择' }}</a-tag>
          </div>
        </div>

        <div class="icon-workspace component-frame">
          <label for="icon-picker-field">图标字段</label>
          <AIconPicker
            id="icon-picker-field"
            v-model="iconValue"
            allow-clear
            :readonly="iconMode === 'readonly'"
            :disabled="iconMode === 'disabled'"
            placeholder="选择一个 Arco 图标"
            data-testid="icon-picker"
          />
          <span class="scenario-note">官方分类 · 跨分类搜索 · 搜索清空恢复分类 · 空结果</span>
        </div>
      </section>

      <section v-if="!tiptapFocused" id="coordinate-picker" class="acceptance-section" data-testid="coordinate-picker-section">
        <div class="section-heading">
          <div>
            <span class="section-index">04</span>
            <h2>ACoordinatePicker</h2>
          </div>
          <div class="section-controls">
            <a-radio-group v-model="coordinateMode" type="button" size="small" data-testid="coordinate-mode-control">
              <a-radio value="normal">正常</a-radio>
              <a-radio value="readonly">只读</a-radio>
              <a-radio value="disabled">禁用</a-radio>
            </a-radio-group>
          </div>
        </div>

        <div class="coordinate-workspace component-frame">
          <div>
            <div class="field-label">门店坐标</div>
            <ACoordinatePicker
              v-model="coordinateValue"
              :api-key="tencentMapApiKey"
              :center="coordinateValue"
              :readonly="coordinateMode === 'readonly'"
              :disabled="coordinateMode === 'disabled'"
              allow-clear
              data-testid="coordinate-picker"
              @confirm="recordCoordinateEvent"
            />
          </div>
          <dl class="event-readout" aria-live="polite">
            <dt>当前坐标</dt>
            <dd>{{ coordinateValue ? `${coordinateValue.latitude}, ${coordinateValue.longitude}` : '未选择' }}</dd>
            <dt>最近确认</dt>
            <dd>{{ lastCoordinateEvent }}</dd>
          </dl>
        </div>
      </section>

      <section
        id="tiptap-editor"
        class="acceptance-section"
        :class="{ 'is-focused-acceptance': tiptapFocused }"
        data-testid="tiptap-editor-section"
      >
        <div class="section-heading">
          <div>
            <span class="section-index">05</span>
            <h2>ATiptapEditor</h2>
          </div>
          <a-radio-group v-model="editorMode" type="button" size="small" data-testid="editor-mode-control">
            <a-radio value="normal">正常</a-radio>
            <a-radio value="readonly">只读</a-radio>
            <a-radio value="disabled">禁用</a-radio>
          </a-radio-group>
        </div>

        <div class="tiptap-workspace component-frame">
          <ATiptapEditor
            v-model="tiptapValue"
            :service="filePickerService"
            :readonly="editorMode === 'readonly'"
            :disabled="editorMode === 'disabled'"
            max-height="min(640px, 60dvh)"
            :max-length="2000"
            :can-upload-image="true"
            :can-upload-video="true"
            :can-upload-audio="true"
            placeholder="请输入公告正文"
            data-testid="tiptap-editor"
          />
          <a-button data-testid="tiptap-after-editor-focus-target">编辑器后的操作</a-button>
          <div class="tiptap-readout" aria-live="polite">
            <span>HTML 输出</span>
            <code>{{ tiptapValue || '（空）' }}</code>
          </div>
        </div>
      </section>

      <section v-if="!tiptapFocused" id="file-uploader" class="acceptance-section" data-testid="file-uploader-section">
        <div class="section-heading">
          <div>
            <span class="section-index">06</span>
            <h2>AFileUploader</h2>
          </div>
        </div>

        <div class="component-frame">
          <div class="field-label">设计稿图片上传</div>
          <AFileUploader
            :service="fileUploaderService"
            file-type="image"
            group-id="image-design"
            :max-files="5"
            :max-file-size="5242880"
            data-testid="standalone-file-uploader"
            @complete="recordFileUploaderEvent"
          />
          <div class="scenario-note" aria-live="polite">{{ lastFileUploaderEvent }}</div>
        </div>
      </section>

      <section v-if="!tiptapFocused" id="file-picker" class="acceptance-section" data-testid="file-picker-section">
        <div class="section-heading">
          <div>
            <span class="section-index">07</span>
            <h2>AFilePicker</h2>
          </div>
          <div class="section-controls">
            <a-radio-group v-model="filePickerMultiple" type="button" size="small" data-testid="file-picker-mode-control">
              <a-radio :value="true">多选</a-radio>
              <a-radio :value="false">单选</a-radio>
            </a-radio-group>
            <a-radio-group
              v-model="filePickerConstraint"
              type="button"
              size="small"
              data-testid="file-picker-constraint-control"
            >
              <a-radio v-for="option in filePickerConstraintOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </a-radio>
            </a-radio-group>
            <a-radio-group v-model="filePickerState" type="button" size="small" data-testid="file-picker-state-control">
              <a-radio v-for="option in stateOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </a-radio>
            </a-radio-group>
          </div>
        </div>

        <div class="file-picker-workspace component-frame">
          <div>
            <div class="field-label">附件字段</div>
            <AFilePicker
              v-model="filePickerValue"
              :service="filePickerService"
              :file-types="filePickerTypes"
              :page-size="6"
              :limit="4"
              :multiple="filePickerMultiple"
              can-upload
              data-testid="file-picker"
              @change="recordFilePickerEvent"
              @selection-change="recordFilePickerEvent"
            />
          </div>
          <dl class="event-readout" aria-live="polite">
            <dt>选择模式</dt>
            <dd>{{ filePickerMultiple ? '多选' : '单选' }}</dd>
            <dt>类型约束</dt>
            <dd>{{ filePickerConstraintOptions.find((option) => option.value === filePickerConstraint)?.label }}</dd>
            <dt>当前场景</dt>
            <dd>{{ stateOptions.find((option) => option.value === filePickerState)?.label }}</dd>
            <dt>最近事件</dt>
            <dd>{{ lastFilePickerEvent }}</dd>
          </dl>
        </div>
      </section>

      <section v-if="!tiptapFocused" id="file-manager" class="acceptance-section" data-testid="file-manager-section">
        <div class="section-heading">
          <div>
            <span class="section-index">08</span>
            <h2>AFileManager</h2>
          </div>
          <div class="section-controls">
            <a-radio-group v-model="fileManagerMode" type="button" size="small" data-testid="file-manager-mode-control">
              <a-radio v-for="option in libraryModeOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </a-radio>
            </a-radio-group>
            <a-radio-group v-model="fileManagerState" type="button" size="small" data-testid="file-manager-state-control">
              <a-radio v-for="option in stateOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </a-radio>
            </a-radio-group>
          </div>
        </div>

        <div class="file-manager-workspace">
          <AFileManager
            :key="`${fileManagerMode}-${fileManagerState}`"
            :service="fileManagerService"
            :page-size="6"
            :can-upload="!fileManagerReadOnly"
            :can-delete="!fileManagerReadOnly"
            :can-move="!fileManagerReadOnly"
            :can-manage-groups="!fileManagerReadOnly"
            data-testid="file-manager"
            @upload-success="recordFileUpload"
            @delete-success="recordFileDelete"
            @move-success="recordFileMove"
          />
          <dl class="library-event-readout" aria-live="polite">
            <dt>模式</dt>
            <dd>{{ libraryModeOptions.find((option) => option.value === fileManagerMode)?.label }}</dd>
            <dt>当前场景</dt>
            <dd>{{ stateOptions.find((option) => option.value === fileManagerState)?.label }}</dd>
            <dt>最近事件</dt>
            <dd>{{ lastFileManagerEvent }}</dd>
          </dl>
        </div>
      </section>
    </main>
  </div>
</template>
