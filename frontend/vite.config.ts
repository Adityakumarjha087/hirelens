/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 20203,
    proxy: { '/api': { target: process.env.VITE_API_PROXY ?? 'http://localhost:20201', changeOrigin: true } },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: { manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], charts: ['recharts'], dnd: ['@dnd-kit/core', '@dnd-kit/sortable'] } },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    coverage: { provider: 'v8', include: ['src/**/*.{ts,tsx}'], exclude: ['src/main.tsx', 'src/test/**', 'src/**/*.test.*'] },
  },
});
