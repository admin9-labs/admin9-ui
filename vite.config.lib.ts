import { resolve } from 'path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import dts from 'vite-plugin-dts';

// 库构建配置：产出 ESM + CJS + d.ts + 单一 style.css
// peer dependencies 全部 external，由宿主 App 提供（vue / @arco-design/web-vue / vue-i18n / @vueuse/core）
export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    dts({
      entryRoot: 'src',
      tsconfigPath: './tsconfig.json',
      insertTypesEntry: true,
    }),
  ],
  resolve: {
    extensions: ['.ts', '.js', '.vue'],
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
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'Admin9UI',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    cssCodeSplit: false,
    rollupOptions: {
      external: ['vue', '@arco-design/web-vue', 'vue-i18n', '@vueuse/core'],
      output: {
        exports: 'named',
        assetFileNames: 'style.css',
        globals: {
          vue: 'Vue',
        },
      },
    },
  },
});
