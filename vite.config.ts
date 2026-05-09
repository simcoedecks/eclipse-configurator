import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // Single entry point (index.html). The retail bundle handles every
    // route, including /pro and /pro/quote (the contractor portal lives
    // inside the retail bundle now — the old separate src/pro/ entry
    // was removed because Netlify's SPA fallback never served pro.html).
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      headers: {
        'Content-Security-Policy': "frame-ancestors *",
        'Access-Control-Allow-Origin': '*',
      }
    },
  };
});
