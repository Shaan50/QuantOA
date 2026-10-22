/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative asset paths so the same build works at a domain root or under a
  // sub-path such as GitHub Pages (/QuantOA/). Routing is hash-based, so no
  // server rewrites are needed.
  base: './',
  // KaTeX + the generator code make one ~240 kB (gzip) bundle; that's fine for an offline-first app.
  build: { chunkSizeWarningLimit: 1000 },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
})
