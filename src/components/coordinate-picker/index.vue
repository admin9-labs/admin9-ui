<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, useAttrs, watch, type CSSProperties, type HTMLAttributes } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { CoordinateSelection, CoordinateValue, TencentMapSuggestion } from './types';
  import {
    loadTencentMap,
    readTencentLatLng,
    type TencentMapLike,
    type TencentMapNamespace,
    type TencentMultiMarkerLike,
    type TencentSuggestionLike,
  } from './tencent-map';

  interface ACoordinatePickerProps {
    modelValue?: CoordinateValue;
    apiKey: string;
    center?: CoordinateValue;
    zoom?: number;
    precision?: number;
    height?: number | string;
    placeholder?: string;
    allowClear?: boolean;
    disabled?: boolean;
    readonly?: boolean;
    searchEnabled?: boolean;
  }

  defineOptions({ name: 'ACoordinatePicker', inheritAttrs: false });

  const props = withDefaults(defineProps<ACoordinatePickerProps>(), {
    modelValue: undefined,
    center: () => ({ latitude: 39.98412, longitude: 116.307484 }),
    zoom: 15,
    precision: 6,
    height: 420,
    placeholder: '',
    allowClear: false,
    disabled: false,
    readonly: false,
    searchEnabled: true,
  });

  const emit = defineEmits<{
    (event: 'update:modelValue', value: CoordinateValue | undefined): void;
    (event: 'change', value: CoordinateValue | undefined): void;
    (event: 'confirm', value: CoordinateSelection): void;
    (event: 'clear'): void;
    (event: 'visibleChange', value: boolean): void;
    (event: 'mapError', error: unknown): void;
    (event: 'searchError', error: unknown): void;
  }>();

  defineSlots<{
    trigger?: (slotProps: {
      open: () => void;
      clear: () => void;
      value: CoordinateValue | undefined;
      disabled: boolean;
    }) => unknown;
  }>();

  const { t } = useI18n();
  const attrs = useAttrs();
  const visible = ref(false);
  const mapContainerRef = ref<HTMLElement>();
  const mapLoading = ref(false);
  const mapError = ref('');
  const searchKeyword = ref('');
  const searchLoading = ref(false);
  const searchError = ref('');
  const suggestions = ref<TencentMapSuggestion[]>([]);
  const draft = ref<CoordinateSelection>();
  const latitudeInput = ref<number>();
  const longitudeInput = ref<number>();

  let tencentMap: TencentMapNamespace | undefined;
  let map: TencentMapLike | undefined;
  let marker: TencentMultiMarkerLike | undefined;
  let suggestionService: TencentSuggestionLike | undefined;
  let mapGeneration = 0;
  let searchGeneration = 0;

  const interactionDisabled = computed(() => props.disabled || props.readonly);
  const normalizedPrecision = computed(() => Math.min(10, Math.max(0, Math.trunc(props.precision))));
  const coordinateStep = computed(() => 1 / 10 ** normalizedPrecision.value);
  const mapHeight = computed(() => (typeof props.height === 'number' ? `${props.height}px` : props.height));
  const mapStyle = computed<CSSProperties>(() => ({ height: mapHeight.value }));
  const rootAttrs = computed<HTMLAttributes>(() => ({
    class: attrs.class as HTMLAttributes['class'],
    style: attrs.style as HTMLAttributes['style'],
  }));
  const forwardedInputAttrs = computed(() =>
    Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== 'class' && key !== 'style'))
  );

  const normalizeCoordinate = (value?: CoordinateValue): CoordinateValue | undefined => {
    if (!value) return undefined;
    const latitude = Number(value.latitude);
    const longitude = Number(value.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined;
    return {
      latitude: Number(latitude.toFixed(normalizedPrecision.value)),
      longitude: Number(longitude.toFixed(normalizedPrecision.value)),
    };
  };

  const coordinatesEqual = (left?: CoordinateValue, right?: CoordinateValue) =>
    left?.latitude === right?.latitude && left?.longitude === right?.longitude;

  const displayValue = computed(() => {
    const value = normalizeCoordinate(props.modelValue);
    if (!value) return '';
    return `${value.latitude.toFixed(normalizedPrecision.value)}, ${value.longitude.toFixed(normalizedPrecision.value)}`;
  });

  const setMarker = (value?: CoordinateValue, centerMap = false) => {
    if (!tencentMap || !map || !marker) return;
    if (!value) {
      marker.setGeometries([]);
      return;
    }
    const position = new tencentMap.LatLng(value.latitude, value.longitude);
    marker.setGeometries([{ id: 'selected', styleId: 'selected', position }]);
    if (centerMap) map.setCenter(position);
  };

  const setDraft = (
    value: CoordinateValue,
    source: CoordinateSelection['source'],
    metadata: Partial<CoordinateSelection> = {}
  ) => {
    const normalized = normalizeCoordinate(value);
    if (!normalized) return;
    draft.value = { ...normalized, source, title: metadata.title, address: metadata.address };
    latitudeInput.value = normalized.latitude;
    longitudeInput.value = normalized.longitude;
    setMarker(normalized, source === 'search');
  };

  const handleMapClick = (event: { latLng: Parameters<typeof readTencentLatLng>[0] }) => {
    if (interactionDisabled.value) return;
    setDraft(readTencentLatLng(event.latLng), 'map');
  };

  const destroyMap = () => {
    mapGeneration += 1;
    searchGeneration += 1;
    mapLoading.value = false;
    searchLoading.value = false;
    if (map?.off) map.off('click', handleMapClick);
    marker?.setMap?.(null);
    map?.destroy?.();
    map = undefined;
    marker = undefined;
    suggestionService = undefined;
    tencentMap = undefined;
  };

  const initializeMap = async () => {
    destroyMap();
    mapError.value = '';
    mapLoading.value = false;
    if (!props.apiKey.trim()) {
      mapError.value = t('admin9Ui.coordinatePicker.missingApiKey');
      return;
    }

    const generation = mapGeneration;
    mapLoading.value = true;
    try {
      const sdk = await loadTencentMap(props.apiKey.trim(), { requireSuggestion: props.searchEnabled });
      if (generation !== mapGeneration || !visible.value) return;
      await nextTick();
      if (!mapContainerRef.value) return;

      tencentMap = sdk;
      const initialCenter = normalizeCoordinate(draft.value) ||
        normalizeCoordinate(props.center) || {
          latitude: 39.98412,
          longitude: 116.307484,
        };
      map = new sdk.Map(mapContainerRef.value, {
        center: new sdk.LatLng(initialCenter.latitude, initialCenter.longitude),
        zoom: Math.min(20, Math.max(3, Math.trunc(props.zoom))),
        viewMode: '2D',
      });
      marker = new sdk.MultiMarker({
        map,
        styles: {
          selected: new sdk.MarkerStyle({
            width: 25,
            height: 35,
            anchor: { x: 13, y: 35 },
            src: 'https://mapapi.qq.com/web/lbs/javascriptGL/demo/img/markerDefault.png',
          }),
        },
        geometries: [],
      });
      setMarker(draft.value);
      map.on('click', handleMapClick);
      if (sdk.service?.Suggestion) {
        suggestionService = new sdk.service.Suggestion({ pageSize: 8, regionFix: true });
      }
    } catch (error) {
      if (generation !== mapGeneration) return;
      mapError.value = t('admin9Ui.coordinatePicker.mapLoadFailed');
      emit('mapError', error);
    } finally {
      if (generation === mapGeneration) mapLoading.value = false;
    }
  };

  const open = () => {
    if (interactionDisabled.value) return;
    const current = normalizeCoordinate(props.modelValue);
    draft.value = current ? { ...current, source: 'model' } : undefined;
    latitudeInput.value = current?.latitude;
    longitudeInput.value = current?.longitude;
    searchKeyword.value = '';
    suggestions.value = [];
    searchError.value = '';
    visible.value = true;
    nextTick(() => {
      if (visible.value && mapContainerRef.value && !map && !mapLoading.value) initializeMap();
    });
  };

  const close = () => {
    visible.value = false;
  };

  const clear = () => {
    if (interactionDisabled.value || !normalizeCoordinate(props.modelValue)) return;
    emit('update:modelValue', undefined);
    emit('change', undefined);
    emit('clear');
  };

  const handleManualCoordinate = () => {
    if (interactionDisabled.value) return;
    const value = normalizeCoordinate({ latitude: Number(latitudeInput.value), longitude: Number(longitudeInput.value) });
    if (!value) {
      draft.value = undefined;
      setMarker();
      return;
    }
    setDraft(value, 'manual');
  };

  const handleSearch = async (keyword = searchKeyword.value) => {
    if (interactionDisabled.value) return;
    searchGeneration += 1;
    const generation = searchGeneration;
    const normalizedKeyword = keyword.trim();
    searchKeyword.value = normalizedKeyword;
    searchError.value = '';
    suggestions.value = [];
    if (!normalizedKeyword) return;
    if (!suggestionService) {
      searchError.value = mapError.value || t('admin9Ui.coordinatePicker.searchUnavailable');
      return;
    }

    searchLoading.value = true;
    try {
      const result = await suggestionService.getSuggestions({
        keyword: normalizedKeyword,
        location: map?.getCenter(),
      });
      if (generation !== searchGeneration || interactionDisabled.value) return;
      suggestions.value = (result.data || []).flatMap((item) => {
        if (!item.location || !item.title) return [];
        const location = normalizeCoordinate(readTencentLatLng(item.location));
        if (!location) return [];
        return [
          {
            id: item.id,
            title: item.title,
            address: item.address,
            category: item.category,
            location,
          },
        ];
      });
    } catch (error) {
      if (generation !== searchGeneration) return;
      searchError.value = t('admin9Ui.coordinatePicker.searchFailed');
      emit('searchError', error);
    } finally {
      if (generation === searchGeneration) searchLoading.value = false;
    }
  };

  const selectSuggestion = (suggestion: TencentMapSuggestion) => {
    if (interactionDisabled.value) return;
    setDraft(suggestion.location, 'search', {
      title: suggestion.title,
      address: suggestion.address,
    });
  };

  const handleConfirm = () => {
    if (interactionDisabled.value || !draft.value) return;
    const value = { latitude: draft.value.latitude, longitude: draft.value.longitude };
    if (!coordinatesEqual(normalizeCoordinate(props.modelValue), value)) {
      emit('update:modelValue', value);
      emit('change', value);
    }
    emit('confirm', { ...draft.value });
    close();
  };

  watch(visible, (value) => {
    emit('visibleChange', value);
    if (!value) destroyMap();
  });

  watch(interactionDisabled, (value) => {
    if (value && visible.value) close();
  });

  watch(
    [visible, mapContainerRef],
    ([isVisible, container]) => {
      if (isVisible && container && !map && !mapLoading.value) initializeMap();
    },
    { flush: 'post' }
  );

  onBeforeUnmount(destroyMap);
  defineExpose({ open, close, clear });
</script>

<template>
  <div v-bind="rootAttrs" class="a9-coordinate-picker">
    <slot name="trigger" :open="open" :clear="clear" :value="normalizeCoordinate(modelValue)" :disabled="interactionDisabled">
      <a-input
        v-bind="forwardedInputAttrs"
        :model-value="displayValue"
        :placeholder="placeholder || t('admin9Ui.coordinatePicker.placeholder')"
        :disabled="disabled"
        :readonly="true"
        class="a9-coordinate-picker__trigger"
        @click="open"
      >
        <template v-if="allowClear && displayValue && !interactionDisabled" #suffix>
          <button
            type="button"
            class="a9-coordinate-picker__clear"
            :aria-label="t('admin9Ui.coordinatePicker.clear')"
            @click.stop="clear"
          >
            <icon-close />
          </button>
        </template>
        <template #append>
          <a-button type="primary" :disabled="interactionDisabled" @click.stop="open">
            {{ t('admin9Ui.coordinatePicker.choose') }}
          </a-button>
        </template>
      </a-input>
    </slot>

    <a-modal
      v-model:visible="visible"
      :title="t('admin9Ui.coordinatePicker.title')"
      width="min(920px, calc(100vw - 24px))"
      :mask-closable="false"
      :ok-text="t('admin9Ui.coordinatePicker.confirm')"
      :cancel-text="t('admin9Ui.coordinatePicker.cancel')"
      :ok-button-props="{ disabled: !draft || interactionDisabled }"
      :body-style="{ maxHeight: 'calc(100dvh - 146px)', overflowY: 'auto' }"
      unmount-on-close
      modal-class="a9-coordinate-picker__modal"
      @ok="handleConfirm"
      @cancel="close"
    >
      <div class="a9-coordinate-picker__workspace">
        <aside class="a9-coordinate-picker__sidebar">
          <div v-if="searchEnabled" class="a9-coordinate-picker__search">
            <a-input-search
              v-model="searchKeyword"
              :placeholder="t('admin9Ui.coordinatePicker.searchPlaceholder')"
              :loading="searchLoading"
              :disabled="interactionDisabled"
              search-button
              @search="handleSearch"
            />
            <a-alert v-if="searchError" type="warning">{{ searchError }}</a-alert>
            <div class="a9-coordinate-picker__results" :aria-label="t('admin9Ui.coordinatePicker.searchResults')">
              <button
                v-for="(suggestion, index) in suggestions"
                :key="suggestion.id || `${suggestion.title}-${index}`"
                type="button"
                class="a9-coordinate-picker__result"
                :disabled="interactionDisabled"
                :class="{
                  'is-selected':
                    draft?.source === 'search' &&
                    draft.latitude === suggestion.location.latitude &&
                    draft.longitude === suggestion.location.longitude,
                }"
                @click="selectSuggestion(suggestion)"
              >
                <strong>{{ suggestion.title }}</strong>
                <span v-if="suggestion.address">{{ suggestion.address }}</span>
                <small v-if="suggestion.category">{{ suggestion.category }}</small>
              </button>
              <a-empty
                v-if="searchKeyword && !searchLoading && !searchError && suggestions.length === 0"
                :description="t('admin9Ui.coordinatePicker.noResults')"
              />
            </div>
          </div>

          <div class="a9-coordinate-picker__coordinates">
            <div class="a9-coordinate-picker__coordinate-field">
              <label>{{ t('admin9Ui.coordinatePicker.latitude') }}</label>
              <a-input-number
                v-model="latitudeInput"
                :min="-90"
                :max="90"
                :precision="normalizedPrecision"
                :step="coordinateStep"
                :disabled="interactionDisabled"
                hide-button
                @change="handleManualCoordinate"
              />
            </div>
            <div class="a9-coordinate-picker__coordinate-field">
              <label>{{ t('admin9Ui.coordinatePicker.longitude') }}</label>
              <a-input-number
                v-model="longitudeInput"
                :min="-180"
                :max="180"
                :precision="normalizedPrecision"
                :step="coordinateStep"
                :disabled="interactionDisabled"
                hide-button
                @change="handleManualCoordinate"
              />
            </div>
            <p>{{ t('admin9Ui.coordinatePicker.mapHint') }}</p>
          </div>
        </aside>

        <div class="a9-coordinate-picker__map-shell" :style="mapStyle">
          <div ref="mapContainerRef" class="a9-coordinate-picker__map" />
          <div v-if="mapLoading" class="a9-coordinate-picker__map-state">
            <a-spin :tip="t('admin9Ui.coordinatePicker.mapLoading')" />
          </div>
          <div v-else-if="mapError" class="a9-coordinate-picker__map-state">
            <a-result status="warning" :title="mapError">
              <template v-if="apiKey" #extra>
                <a-button size="small" @click="initializeMap">{{ t('admin9Ui.coordinatePicker.retry') }}</a-button>
              </template>
            </a-result>
          </div>
        </div>
      </div>
    </a-modal>
  </div>
</template>

<style scoped lang="less">
  .a9-coordinate-picker {
    width: 100%;
  }

  .a9-coordinate-picker__trigger {
    cursor: pointer;

    :deep(input) {
      cursor: pointer;
    }

    :deep(.arco-input-append) {
      padding: 0;
    }

    :deep(.arco-input-append .arco-btn) {
      height: 30px;
      border-radius: 0;
    }
  }

  .a9-coordinate-picker__clear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    color: var(--color-text-3);
    background: transparent;
    border: 0;
    border-radius: 2px;
    cursor: pointer;

    &:hover {
      color: var(--color-text-1);
      background: var(--color-fill-2);
    }

    &:focus-visible {
      outline: 2px solid rgb(var(--primary-6));
      outline-offset: 1px;
    }
  }

  .a9-coordinate-picker__workspace {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
    gap: 16px;
    min-width: 0;
  }

  .a9-coordinate-picker__sidebar {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }

  .a9-coordinate-picker__search {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
  }

  .a9-coordinate-picker__results {
    height: 254px;
    overflow-y: auto;
    border: 1px solid var(--color-border-2);
    border-radius: 4px;
  }

  .a9-coordinate-picker__result {
    display: grid;
    gap: 3px;
    width: 100%;
    padding: 10px 12px;
    color: var(--color-text-2);
    text-align: left;
    background: var(--color-bg-2);
    border: 0;
    border-bottom: 1px solid var(--color-border-1);
    cursor: pointer;

    &:last-child {
      border-bottom: 0;
    }

    &:hover,
    &:focus-visible,
    &.is-selected {
      background: var(--color-fill-2);
      outline: none;
    }

    &.is-selected {
      box-shadow: inset 3px 0 0 rgb(var(--primary-6));
    }

    strong,
    span,
    small {
      overflow: hidden;
      line-height: 20px;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    strong {
      color: var(--color-text-1);
      font-weight: 500;
      font-size: 14px;
    }

    span,
    small {
      color: var(--color-text-3);
      font-size: 12px;
    }
  }

  .a9-coordinate-picker__coordinates {
    display: grid;
    gap: 10px;
    padding-top: 14px;
    border-top: 1px solid var(--color-border-2);

    p {
      margin: 0;
      color: var(--color-text-3);
      font-size: 12px;
      line-height: 20px;
    }
  }

  .a9-coordinate-picker__coordinate-field {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr);
    gap: 8px;
    align-items: center;

    label {
      color: var(--color-text-2);
      font-size: 13px;
    }
  }

  .a9-coordinate-picker__map-shell {
    position: relative;
    min-width: 0;
    min-height: 320px;
    overflow: hidden;
    background: var(--color-fill-2);
    border: 1px solid var(--color-border-2);
    border-radius: 4px;
  }

  .a9-coordinate-picker__map {
    width: 100%;
    height: 100%;
  }

  .a9-coordinate-picker__map-state {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--color-bg-2);
  }

  @media (width <= 720px) {
    .a9-coordinate-picker__workspace {
      grid-template-columns: minmax(0, 1fr);
    }

    .a9-coordinate-picker__sidebar {
      order: 2;
    }

    .a9-coordinate-picker__map-shell {
      height: min(44vh, 340px) !important;
      min-height: 260px;
    }

    .a9-coordinate-picker__results {
      height: 180px;
    }
  }
</style>
