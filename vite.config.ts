import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

// Le plugin Cloudflare exécute l'API (worker/) et la base D1 locale dans le serveur de dev.
// CS2KB_STATE_DIR : dossier de la base locale (les tests e2e utilisent une base jetable).
const state = process.env.CS2KB_STATE_DIR

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare(state ? { persistState: { path: state } } : {})],
  build: { chunkSizeWarningLimit: 800 },
})
