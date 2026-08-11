import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://opbevaring-af-campingvogne.dk',
  build: {
    inlineStylesheets: 'always',
  },
});
