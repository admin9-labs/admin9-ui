<script setup lang="ts">
  import { computed, getCurrentInstance, nextTick, watch } from 'vue';
  import { Modal } from '@arco-design/web-vue';
  import { useI18n } from 'vue-i18n';

  defineOptions({ inheritAttrs: false });
  const props = defineProps<{ visible?: boolean; modalClass?: string }>();
  const { t } = useI18n();
  const instanceClass = `a9-modal-${getCurrentInstance()?.uid}`;
  const modalClass = computed(() => [props.modalClass, instanceClass].filter(Boolean).join(' '));
  const labelClose = () => {
    if (typeof document === 'undefined') return;
    document.querySelector(`.${instanceClass} .arco-modal-close-btn`)?.setAttribute('aria-label', t('admin9Ui.modal.close'));
  };
  watch([() => props.visible, () => t('admin9Ui.modal.close')], () => nextTick(labelClose), { immediate: true, flush: 'post' });
</script>

<template>
  <Modal v-bind="$attrs" :visible="visible" :modal-class="modalClass" @open="labelClose">
    <template v-for="(_, name) in $slots" #[name]="scope">
      <slot :name="name" v-bind="scope || {}" />
    </template>
  </Modal>
</template>
