import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  root: resolve(__dirname, 'dev'),
  envDir: __dirname,
  base: './',
  plugins: [
    vue(),
    {
      name: 'acceptance-image-uploads',
      configureServer(server) {
        const uploads = new Map<string, { body: Buffer; mime: string }>();
        let sequence = 0;
        server.middlewares.use('/__acceptance/uploads', async (request, response, next) => {
          if (request.method === 'POST') {
            const chunks: Buffer[] = [];
            await new Promise<void>((done, reject) => {
              request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
              request.on('end', done);
              request.on('error', reject);
            });
            const path = `/${(sequence += 1)}`;
            uploads.set(path, {
              body: Buffer.concat(chunks),
              mime: request.headers['content-type'] ?? 'application/octet-stream',
            });
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ url: `/__acceptance/uploads${path}` }));
            return;
          }
          const item = uploads.get(request.url ?? '');
          if (item) {
            response.setHeader('Content-Type', item.mime);
            response.end(item.body);
          } else next();
        });
      },
    },
  ],
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
