import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Les tests portent pour l'instant sur la logique pure : prix d'une offre, décisions du webhook
 * DocuSign, règles de visibilité. Pas d'environnement DOM, donc pas de jsdom à installer — on
 * l'ajoutera le jour où l'on testera un composant.
 *
 * Le quatrième flot critique de l'audit, la propagation des quatre statuts, vit dans des
 * déclencheurs PostgreSQL : il se teste contre une base, pas ici. Il reste à couvrir.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
  },
})
