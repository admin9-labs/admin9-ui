import { ref } from 'vue';

/**
 * 加载状态控制。零依赖，库内自用。
 * 对齐 App 端 src/hooks/loading.ts 的签名。
 */
export default function useLoading(initValue = false) {
  const loading = ref(initValue);
  const setLoading = (value: boolean) => {
    loading.value = value;
  };
  const toggle = () => {
    loading.value = !loading.value;
  };
  return {
    loading,
    setLoading,
    toggle,
  };
}
