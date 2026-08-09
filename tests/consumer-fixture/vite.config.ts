import { resolve } from 'path';
import { vitePluginForArco } from '@arco-plugins/vite-vue';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue(), vueJsx(), vitePluginForArco({})],
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, 'src') },
      { find: 'vue-i18n', replacement: 'vue-i18n/dist/vue-i18n.cjs.js' },
      { find: 'vue', replacement: 'vue/dist/vue.esm-bundler.js' },
    ],
  },
  define: {
    'process.env': {},
  },
  css: {
    preprocessorOptions: {
      less: {
        javascriptEnabled: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          arco: ['@arco-design/web-vue'],
          vue: ['vue', 'vue-i18n'],
        },
      },
    },
    chunkSizeWarningLimit: 2000,
  },
});
