import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['three', '@react-three/fiber', '@react-three/drei', 'pannellum', 'pdfjs-dist', 'pdfjs-dist/build/pdf.mjs'],
  },
  server: {
    port: 5174,
    fs: {
      allow: ['.', 'node_modules'],
    },
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
})

