import { defineConfig } from 'astro/config'
import react from '@astrojs/react'

// Astro owns the document/build pipeline; React remains available as an
// island so auth, cart, admin, GSAP and other interactive code stay intact.
export default defineConfig({
  srcDir: './src/astro',
  integrations: [react()],
  vite: {
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
  },
})
