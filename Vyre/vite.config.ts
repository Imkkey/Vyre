import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte()],
  
  // Базовая конфигурация для Tauri
  clearScreen: false,
  
  // Настройки сервера разработки
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
    },
    watch: {
      // Decrease the delay for file watching
      usePolling: false,
      interval: 100,
    }
  },
  
  // Оптимизированные настройки сборки
  build: {
    target: 'esnext',
    sourcemap: !!process.env.TAURI_DEBUG,
    // Минимизируем размер сборки
    minify: 'esbuild',
    // Ускоряем процесс сборки
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1000,
  },
  
  // Оптимизация для Tauri
  optimizeDeps: {
    exclude: ['@tauri-apps/api'],
  }
});
