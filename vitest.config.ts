import { defineConfig } from 'vitest/config'

// Tests unitaires de la logique pure (src/lib) : pas besoin du plugin Cloudflare.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
})
