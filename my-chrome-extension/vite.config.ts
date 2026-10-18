import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json' with {type: 'json'}

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
  },
  plugins: [
    react(), crx({ manifest }),
  ],
})
