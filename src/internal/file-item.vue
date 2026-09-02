<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { FileItem } from '../services/types';

  const props = defineProps<{
    item: FileItem;
    available: boolean;
    statusLabel: string;
  }>();

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
    if (size < 1024) return `${size} B`;
    if (size < 1024 ** 2) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
    if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(size < 10 * 1024 ** 2 ? 1 : 0)} MB`;
    return `${(size / 1024 ** 3).toFixed(1)} GB`;
  });
  const meta = computed(() => [extension.value, sizeLabel.value, durationLabel.value].filter(Boolean).join(' · '));
</script>

<template>
  <div
    class="a9-file-item"
    :class="[`is-${item.type}`, { 'is-unavailable': !available }]"
    :data-file-type="item.type"
    :data-available="String(available)"
  >
    <div class="a9-file-item__visual">
      <a-image
        v-if="item.type === 'image' && (item.thumbnail || item.url)"
        :src="item.thumbnail || item.url || undefined"
        :preview="available && Boolean(item.url)"
        width="100%"
        height="100%"
        fit="cover"
        show-loader
      />
      <a-image
        v-else-if="item.type === 'video' && item.thumbnail"
        :src="item.thumbnail"
        :preview="false"
        width="100%"
        height="100%"
        fit="cover"
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
      <span v-if="!available" class="a9-file-item__status">{{ statusLabel }}</span>
    </div>
    <div class="a9-file-item__details">
      <span class="a9-file-item__name" :title="item.name">{{ item.name }}</span>
      <span v-if="meta" class="a9-file-item__meta">{{ meta }}</span>
    </div>
    <a
      v-if="available && item.url"
      class="a9-file-item__open"
      :href="item.url"
      target="_blank"
      rel="noopener noreferrer"
      :aria-label="t('admin9Ui.filePicker.openItem', { name: item.name })"
      @click.stop
    >
      <icon-launch />
    </a>
  </div>
</template>

<style lang="less" scoped>
  .a9-file-item {
    position: relative;
    min-width: 0;

    &.is-unavailable {
      opacity: 0.68;
    }

    &__visual {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 124px;
      overflow: hidden;
      color: var(--color-text-3);
      background: var(--color-fill-2);
      border: 1px solid var(--color-neutral-3);
      border-radius: 4px;
    }

    &__type-icon {
      display: inline-flex;
      font-size: 42px;
    }

    &__duration,
    &__status {
      position: absolute;
      z-index: 1;
      max-width: calc(100% - 12px);
      padding: 0 6px;
      overflow: hidden;
      color: #fff;
      font-size: 12px;
      line-height: 20px;
      white-space: nowrap;
      text-overflow: ellipsis;
      background: rgb(0 0 0 / 68%);
      border-radius: 3px;
    }

    &__duration {
      right: 6px;
      bottom: 6px;
    }

    &__status {
      top: 6px;
      right: 6px;
      background: rgb(var(--danger-6));
    }

    &__details {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
      min-width: 0;
      padding-top: 8px;
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
      max-width: 55%;
      overflow: hidden;
      color: var(--color-text-3);
      font-size: 12px;
      line-height: 20px;
      white-space: nowrap;
      text-transform: uppercase;
      text-overflow: ellipsis;
    }

    &__open {
      position: absolute;
      top: 6px;
      left: 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      color: #fff;
      background: rgb(0 0 0 / 68%);
      border-radius: 4px;

      &:focus-visible {
        outline: 2px solid rgb(var(--primary-6));
        outline-offset: 1px;
      }
    }
  }
</style>
