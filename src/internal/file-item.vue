<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import safeFileUrl from './file-url';
  import formatFileSize from './file-size';
  import type { FileItem } from '../services/types';

  const props = defineProps<{
    item: FileItem;
    available: boolean;
    statusLabel: string;
    previewEnabled: boolean;
    view?: 'grid' | 'list';
  }>();

  const emit = defineEmits<{
    (e: 'previewOpen', trigger?: HTMLElement): void;
  }>();
  const openPreview = (event: MouseEvent) => {
    if (!props.previewEnabled) return;
    emit('previewOpen', event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined);
  };
  const url = computed(() => safeFileUrl(props.item.url));
  const thumbnail = computed(() => safeFileUrl(props.item.thumbnail));
  const { t } = useI18n();

  const extension = computed(() => {
    const value = props.item.extension || props.item.name.split('.').pop() || '';
    return value.replace(/^\./, '').toUpperCase();
  });
  const isPdf = computed(() => extension.value === 'PDF' || props.item.mime === 'application/pdf');
  const durationLabel = computed(() => {
    const { duration } = props.item;
    if (duration === undefined || !Number.isFinite(duration) || duration < 0) return '';
    const seconds = Math.floor(duration);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    const base = `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
    return hours ? `${hours}:${base}` : base;
  });
  const sizeLabel = computed(() => {
    const { size } = props.item;
    if (size === undefined || !Number.isFinite(size) || size < 0) return '';
    return formatFileSize(size);
  });
  const meta = computed(() => [extension.value, sizeLabel.value, durationLabel.value].filter(Boolean).join(' · '));
</script>

<template>
  <div
    class="a9-file-item"
    :class="[`is-${item.type}`, { 'is-unavailable': !available, 'is-list': view === 'list' }]"
    :data-file-type="item.type"
    :data-available="String(available)"
  >
    <div v-if="view === 'list' && $slots.selection" class="a9-file-item__selection"><slot name="selection" /></div>
    <div class="a9-file-item__visual">
      <a-image
        v-if="item.type === 'image' && (thumbnail || url)"
        :src="thumbnail || url"
        :alt="item.name"
        :preview="false"
        width="100%"
        height="100%"
        fit="contain"
        show-loader
      />
      <a-image
        v-else-if="item.type === 'video' && thumbnail"
        :src="thumbnail"
        :alt="item.name"
        :preview="false"
        width="100%"
        height="100%"
        fit="contain"
        show-loader
      />
      <span v-else class="a9-file-item__type-icon" aria-hidden="true">
        <icon-file-video v-if="item.type === 'video'" />
        <icon-file-audio v-else-if="item.type === 'audio'" />
        <icon-file-pdf v-else-if="item.type === 'document' && isPdf" />
        <icon-file v-else-if="item.type === 'document' || item.type === 'other'" />
        <icon-archive v-else-if="item.type === 'archive'" />
        <icon-file-image v-else />
      </span>
      <span v-if="durationLabel && (item.type === 'video' || item.type === 'audio')" class="a9-file-item__duration">
        {{ durationLabel }}
      </span>
    </div>
    <div class="a9-file-item__details">
      <div class="a9-file-item__heading">
        <slot v-if="view !== 'list'" name="selection" />
        <span class="a9-file-item__name" :title="item.name">{{ item.name }}</span>
      </div>
      <span
        v-if="!available"
        class="a9-file-item__status"
        :class="{ 'is-pending': item.status === 'pending' }"
        :title="statusLabel"
        >{{ statusLabel }}</span
      >
      <span v-else class="a9-file-item__meta" :title="meta">{{ meta }}</span>
    </div>
    <div v-if="available && url" class="a9-file-item__actions">
      <button
        v-if="item.type === 'image'"
        type="button"
        class="a9-file-item__open"
        :aria-label="t('admin9Ui.filePicker.previewItem', { name: item.name })"
        @click.stop="openPreview"
        >{{ t('admin9Ui.filePicker.preview') }}</button
      >
      <a
        v-else
        class="a9-file-item__open"
        :href="url"
        target="_blank"
        rel="noopener noreferrer"
        :aria-label="t('admin9Ui.filePicker.openItem', { name: item.name })"
        @click.stop
        >{{ t('admin9Ui.filePicker.open') }}</a
      >
    </div>
  </div>
</template>

<style lang="less" scoped>
  .a9-file-item {
    position: relative;
    display: grid;
    grid-template-rows: auto 28px 24px;
    grid-template-columns: minmax(0, 1fr) auto;
    min-width: 0;

    &.is-list {
      grid-template-rows: auto;
    }

    &__visual {
      position: relative;
      display: flex;
      grid-column: 1 / -1;
      align-items: center;
      justify-content: center;
      width: 100%;
      aspect-ratio: 4 / 3;
      overflow: hidden;
      color: var(--color-text-3);
      background: var(--color-fill-2);
      border: 0;
      border-radius: 4px;
    }

    &__type-icon {
      display: inline-flex;
      font-size: 42px;
    }

    &__duration {
      position: absolute;
      right: 6px;
      bottom: 6px;
      padding: 0 6px;
      color: #fff;
      font-size: 12px;
      line-height: 20px;
      background: rgb(0 0 0 / 75%);
      border-radius: 3px;
    }

    &__status {
      grid-column: 1 / -1;
      min-width: 0;
      overflow: hidden;
      color: rgb(var(--danger-7));
      font-size: 12px;
      line-height: 20px;
      white-space: nowrap;
      text-overflow: ellipsis;

      &.is-pending {
        color: var(--color-text-2);
      }
    }

    &__details {
      display: contents;
    }

    &__heading {
      display: flex;
      grid-column: 1 / -1;
      gap: 8px;
      align-items: center;
      min-width: 0;
      margin-top: 8px;
    }

    &__name {
      min-width: 0;
      overflow: hidden;
      color: var(--color-text-1);
      font-size: 13px;
      line-height: 20px;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    &__meta {
      flex: 0 1 auto;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      color: var(--color-text-2);
      font-size: 12px;
      line-height: 20px;
      white-space: nowrap;
      text-transform: uppercase;
      text-overflow: ellipsis;
    }

    &__actions {
      display: flex;
      flex: none;
      align-items: center;
      justify-content: flex-end;
      min-width: 36px;
      padding-left: 8px;
    }

    &__open {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 0;
      color: rgb(var(--primary-7));
      font: inherit;
      font-size: 12px;
      line-height: 20px;
      white-space: nowrap;
      text-decoration: none;
      background: transparent;
      border: 0;
      border-radius: 2px;
      cursor: pointer;

      &:visited {
        color: rgb(var(--primary-7));
      }

      &:hover {
        color: rgb(var(--primary-8));
        text-decoration: underline;
      }

      &:focus-visible {
        outline: 2px solid rgb(var(--primary-6));
        outline-offset: 2px;
      }
    }
  }
</style>
