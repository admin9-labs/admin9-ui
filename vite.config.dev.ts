import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  root: resolve(__dirname, 'dev'),
  base: './',
  plugins: [vue()],
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
  server: {
    host: '127.0.0.1',
    port: 4174,
  },
  build: {
    outDir: resolve(__dirname, 'dev/.dist'),
    emptyOutDir: true,
  },
});
