import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const isNative = mode === 'native';
  if (!isNative) {
    return {
      plugins: [react()],
      base: '/'
    };
  }

  // Native (Framework7) build: treat src/native as the app root so the
  // generated index.html lands at dist-native/index.html (required by the
  // Firebase Hosting SPA rewrite) and the dev server serves it at /.
  return {
    plugins: [react()],
    base: '/',
    root: fileURLToPath(new URL('./src/native', import.meta.url)),
    publicDir: fileURLToPath(new URL('./public', import.meta.url)),
    // .env lives at the project root, not under the native app root.
    envDir: fileURLToPath(new URL('.', import.meta.url)),
    resolve: {
      alias: [
        // framework7-react's internals create the app instance from the plain
        // 'framework7/lite' core, which has no UI component modules (Panel,
        // Dialog, ...). Redirect that specifier to the lite bundle so the
        // plugin, f7.js, and src/native/f7-plugin.js all share one
        // fully-featured Framework7 class. Exact match only, so
        // 'framework7/lite/bundle' imports are untouched.
        {
          find: /^framework7\/lite$/,
          replacement: fileURLToPath(new URL('./node_modules/framework7/framework7-lite-bundle.esm.js', import.meta.url))
        }
      ]
    },
    build: {
      outDir: fileURLToPath(new URL('./dist-native', import.meta.url)),
      emptyOutDir: true,
      rollupOptions: {
        input: fileURLToPath(new URL('./src/native/index.html', import.meta.url))
      }
    }
  };
});
