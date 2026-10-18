import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nativeRuntime } from './scripts/native-runtime.mjs';
const runtime = nativeRuntime();

export default defineConfig({
  define: { __LW_NATIVE_RUNTIME__: JSON.stringify(runtime) },
  plugins: [react(), { name: 'livingworth-mobile-runtime', generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'mobile-runtime.json', source: JSON.stringify(runtime) });
  } }],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://localhost:5000',
      '/socket.io': { target: 'http://localhost:5000', ws: true },
    },
  },
});
