import { fileURLToPath, URL } from 'url';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('.', import.meta.url)),
      }
    },
    build: {
      rollupOptions: {
        onwarn(warning, warn) {
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes(`"use client"`)) {
            return;
          }
          warn(warning);
        },
        output: {
          entryFileNames: 'app.js',             // JS chính
          chunkFileNames: 'chunk-[name].js',    // JS phụ nếu có
          assetFileNames: ({ name }) => {
            if (name && name.endsWith('.css')) {
              return 'style.css';               // CSS
            }
            return '[name][extname]';           // asset khác (ảnh, font)
          }
        }
      }
    }
  };
});
