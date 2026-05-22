import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: [
      { find: 'scenes/', replacement: '/src/scenes/' },
      { find: 'utils', replacement: '/src/game/utils.js' },
      { find: 'facts', replacement: '/src/game/facts.js' },
      { find: 'resize', replacement: '/src/game/resize.js' },
      { find: 'extralife', replacement: '/src/game/ExtraLife.js' },
      { find: 'datamanager', replacement: '/src/game/DataManager.js' },
      { find: 'apiservice', replacement: '/src/game/ApiService.js' },
      { find: 'config', replacement: '/src/game/Config.js' },
      { find: 'checkbox', replacement: '/src/elements/Checkbox.js' },
      { find: 'checksdialog', replacement: '/src/elements/ChecksDialog.js' },
      { find: 'player', replacement: '/src/lib/Player.js' },
    ],
  },
  // Targets that support top-level await (modern browsers / es2022+)
  esbuild: {
    target: 'es2022',
  },
  build: {
    target: 'es2022',
  },
});
