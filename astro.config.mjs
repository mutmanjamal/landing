// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  cacheDir: process.env.ADMIN_ASTRO_CACHE,
  vite: { cacheDir: process.env.ADMIN_VITE_CACHE },
  site: 'https://mutman.tech',
});
