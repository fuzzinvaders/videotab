import { defineConfig } from 'vitest/config'

// Config autonome (sans les plugins React/Tailwind) : les tests ne visent que des modules
// purs — minutage, détection des systèmes, validation serveur — importés en relatif.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.js'],
  },
})
