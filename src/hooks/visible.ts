import { ref } from 'vue';

/**
 * 弹窗/抽屉显隐控制。零依赖，库内自用。
 * 对齐 App 端 src/hooks/visible.ts 的签名，便于心智一致。
 */
export default function useVisible(initValue = false) {
  const visible = ref(initValue);
  const setVisible = (value: boolean) => {
    visible.value = value;
  };
  const toggle = () => {
    visible.value = !visible.value;
  };
  return {
    visible,
    setVisible,
    toggle,
  };
}
