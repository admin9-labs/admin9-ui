<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { MediaItem, MediaType } from '../services/types';

  const props = defineProps<{
    item: MediaItem;
    mediaType: MediaType;
    available: boolean;
    previewable: boolean;
    playable: boolean;
    statusLabel: string;
  }>();

  const { t } = useI18n();
  const previewVisible = ref(false);

  const thumbnail = computed(() => {
    if (props.item.thumbnail) return props.item.thumbnail;
    return props.mediaType === 'image' && props.item.url ? props.item.url : undefined;
  });

  const formatDuration = (duration?: number) => {
    if (duration === undefined || !Number.isFinite(duration) || duration < 0) return '';
    const seconds = Math.floor(duration);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    const base = `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
    return hours ? `${hours}:${base}` : base;
  };

  const durationLabel = computed(() => formatDuration(props.item.duration));
  const formatLabel = computed(() => props.item.extension || props.item.mime || '');
</script>

<template>
  <div
    class="a9-media-item"
    :class="[`is-${mediaType}`, { 'is-unavailable': !available }]"
    :data-media-type="mediaType"
    :data-available="String(available)"
    :data-previewable="String(previewable)"
    :data-playable="String(playable)"
  >
    <template v-if="mediaType === 'image'">
      <a-image
        v-if="thumbnail"
        class="a9-media-item__visual"
        :src="thumbnail"
        :preview="false"
        width="100%"
        height="112"
        fit="cover"
        show-loader
      />
      <div v-else class="a9-media-item__placeholder" aria-hidden="true" />
      <button
        v-if="thumbnail && previewable"
        type="button"
        class="a9-media-item__preview"
        :aria-label="t('admin9Ui.mediaItem.preview', { name: item.name })"
        @click.stop="previewVisible = true"
      >
        <icon-eye />
      </button>
      <a-image-preview v-if="thumbnail" v-model:visible="previewVisible" :src="thumbnail" />
    </template>

    <template v-else-if="mediaType === 'video'">
      <div class="a9-media-item__visual a9-media-item__video">
        <video v-if="playable && item.url" :src="item.url" :poster="thumbnail" controls preload="metadata" @click.stop />
        <a-image v-else-if="thumbnail" :src="thumbnail" :preview="false" width="100%" height="112" fit="cover" show-loader />
        <div v-else class="a9-media-item__placeholder" aria-hidden="true" />
        <span v-if="playable" class="a9-media-item__play" aria-hidden="true"><icon-play-arrow /></span>
        <span v-if="durationLabel" class="a9-media-item__duration">{{ durationLabel }}</span>
      </div>
    </template>

    <template v-else>
      <div class="a9-media-item__audio">
        <div class="a9-media-item__audio-heading">
          <span class="a9-media-item__name" :title="item.name">{{ item.name }}</span>
          <span class="a9-media-item__meta">{{ [formatLabel, durationLabel].filter(Boolean).join(' · ') }}</span>
        </div>
        <audio v-if="playable && item.url" :src="item.url" controls preload="metadata" @click.stop />
      </div>
    </template>

    <div v-if="mediaType !== 'audio'" class="a9-media-item__caption">
      <span class="a9-media-item__name" :title="item.name">{{ item.name }}</span>
      <span v-if="formatLabel" class="a9-media-item__meta">{{ formatLabel }}</span>
    </div>
    <span v-if="!available" class="a9-media-item__status">{{ statusLabel }}</span>
  </div>
</template>

<style lang="less" scoped>
  .a9-media-item {
    position: relative;
    min-width: 0;

    &.is-unavailable {
      opacity: 0.62;
    }

    &__visual,
    &__placeholder {
      display: block;
      width: 100%;
      height: 112px;
      overflow: hidden;
      background: var(--color-fill-2);
      border: 1px solid var(--color-neutral-3);
      border-radius: 4px;
    }

    &__video {
      position: relative;

      video {
        display: block;
        width: 100%;
        height: 112px;
        object-fit: contain;
        background: #000;
      }
    }

    &__preview,
    &__play,
    &__duration,
    &__status {
      position: absolute;
      z-index: 1;
      color: #fff;
      font-size: 12px;
      line-height: 20px;
      background: rgb(0 0 0 / 68%);
      border-radius: 3px;
      pointer-events: none;
    }

    &__play {
      top: 8px;
      left: 8px;
      width: 24px;
      height: 24px;
      font-size: 16px;
      line-height: 24px;
      text-align: center;
      border-radius: 50%;
    }

    &__preview {
      top: 6px;
      left: 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      color: #fff;
      background: rgb(0 0 0 / 68%);
      border: 0;
      border-radius: 4px;
      cursor: pointer;
      pointer-events: auto;

      &:focus-visible {
        outline: 2px solid rgb(var(--primary-6));
        outline-offset: 1px;
      }
    }

    &__duration {
      right: 6px;
      bottom: 6px;
      padding: 0 5px;
    }

    &__caption,
    &__audio-heading {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
      min-width: 0;
      padding-top: 7px;
    }

    &__name {
      min-width: 0;
      overflow: hidden;
      font-size: 13px;
      line-height: 20px;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    &__meta {
      flex: none;
      color: var(--color-text-3);
      font-size: 12px;
      line-height: 20px;
      text-transform: uppercase;
    }

    &__audio {
      min-width: 0;

      audio {
        display: block;
        width: 100%;
        height: 34px;
        margin-top: 8px;
      }
    }

    &__status {
      top: 6px;
      right: 6px;
      max-width: calc(100% - 12px);
      padding: 0 6px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      background: rgb(var(--danger-6));
    }
  }
</style>
