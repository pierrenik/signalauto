
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, __dirname, '');

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './'),
        },
        // Forcer la recherche des extensions dans cet ordre pour éviter les erreurs de résolution
        extensions: ['.tsx', '.ts', '.jsx', '.js', '.json', '.mjs']
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.API_KEY),
        'process.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
        'process.env.VITE_SUPABASE_KEY': JSON.stringify(env.VITE_SUPABASE_KEY),
        'process.env.VITE_APP_PASSWORD': JSON.stringify(env.VITE_APP_PASSWORD || 'QUANTUM'),
        'process.env': JSON.stringify(env),
      },
      build: {
        outDir: 'dist',
        sourcemap: false,
        minify: 'esbuild',
        rollupOptions: {
          external: [],
        }
      }
    };
});
