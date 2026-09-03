import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          // Split the heavy vendors out of the entry chunk so the shell paints
          // without waiting on charting, animation and the Firebase SDK.
          manualChunks: {
            react: ['react', 'react-dom'],
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            charts: ['recharts'],
          },
        },
      },
    },
    // Never inject API keys into the client bundle — server routes only.
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      host: '0.0.0.0',
      // Cursor Cloud / agent preview URLs use dynamic *.cursorvm.com hosts.
      allowedHosts: [
        '.cursorvm.com',
        '.agent.cvm.dev',
        '.trycloudflare.com',
        '.loca.lt',
        'localhost',
      ],
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
