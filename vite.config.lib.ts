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
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        locale: resolve(__dirname, 'src/locale/index.ts'),
      },
      name: 'Admin9UI',
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => {
        const extension = format === 'es' ? 'js' : 'cjs';
        return entryName === 'locale' ? `locale/index.${extension}` : `index.${extension}`;
      },
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
