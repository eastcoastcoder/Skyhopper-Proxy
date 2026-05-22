const BASE_URL = import.meta.env.VITE_BASE_URL ?? import.meta.env.BASE_URL ?? '/';

// Load stylesheet dynamically using BASE_URL
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = `${BASE_URL}/style.css`;
document.head.appendChild(link);

async function importFromSource(source) {
  const blob = new Blob([source], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    return await import(/* @vite-ignore */ url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function fetchAndImportPatchedModule(remoteUrl, sceneDir = '/src/scenes') {
  let src = await (await fetch(remoteUrl)).text();
  src = await rewriteImports(src, sceneDir);
  const mod = await importFromSource(src);
  return mod;
}

// Load a single remote scene (returns the scene class/module default export)
async function loadRemoteScene(sceneName) {
  const remoteUrl = `${BASE_URL}/src/scenes/${sceneName}.js`;
  console.log('Fetching scene', sceneName, remoteUrl);
  const mod = await fetchAndImportPatchedModule(remoteUrl, '/src/scenes');
  return mod.default;
}

async function initGame() {
  // Load scenes in the original logical order, then arrange for Phaser
  const sceneLoadOrder = [
    'APICheck',
    'ErrorScene',
    'StartScreen',
    'SelectPlayer',
    'SelectStage',
    'SplashScreen',
    'TutorialScreen',
    'Game',
    'GameOver',
  ];

  const loaded = await Promise.all(sceneLoadOrder.map(name => loadRemoteScene(name)));
  const [ApiCheck, ErrorScene, StartScreen, SelectPlayer, SelectStage, SplashScreen, TutorialScreen, Game, GameOver] =
    loaded;

  // Import game utilities directly from the proxied URL
  const { GAME_HEIGHT, GAME_WIDTH, isDaytime } = await import(/* @vite-ignore */ `${BASE_URL}/src/game/utils.js`);

  // Load and patch resize module using helpers
  const resizeRemoteUrl = `${BASE_URL}/src/game/resize.js`;
  let resizeSrc = await (await fetch(resizeRemoteUrl)).text();
  resizeSrc = resizeSrc.replace(
    /import\s+\{\s*GAME_HEIGHT\s*,\s*GAME_WIDTH\s*\}\s+from\s+['"]utils['"];?/, // tolerant match
    `import { GAME_HEIGHT, GAME_WIDTH } from "${BASE_URL}/src/game/utils.js";`
  );
  const ResizeModule = await importFromSource(resizeSrc);
  const onResize = ResizeModule.onResize;

  // Prevent long-press context menu on mobile non-canvas areas
  document.oncontextmenu = e => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return false;
  };

  if (!isDaytime()) document.body.classList.add('night-gradient');

  // Preload fonts used by dynamic scenes
  WebFont.load({
    custom: { families: ['Whitney', 'WhitneyBold', 'WhitneyLightItal', 'Pixelify Sans'] },
    active: () => console.log('---- webfont active'),
  });

  const game = new Phaser.Game({
    id: 'canvasG',
    type: Phaser.CANVAS,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent: 'parentContainer',
    transparent: true,
    scene: [ApiCheck, SplashScreen, StartScreen, SelectPlayer, SelectStage, TutorialScreen, Game, GameOver, ErrorScene],
    pack: {
      files: [
        {
          type: 'plugin',
          key: 'rexwebfontloaderplugin',
          url: 'https://raw.githubusercontent.com/rexrainbow/phaser3-rex-notes/master/dist/rexwebfontloaderplugin.min.js',
          start: true,
        },
      ],
    },
    physics: {
      default: 'arcade',
      arcade: { gravity: { y: 800 }, debug: false },
    },
  });

  onResize();
  window.addEventListener('resize', onResize);

  return game;
}

export default initGame();

// Helper to rewrite all imports in remote scene source
const importMap = {
  'scenes/': `${BASE_URL}/src/scenes/`,
  'scenes/LoaderT.js': `${BASE_URL}/src/scenes/LoaderT.js`,
  utils: `${BASE_URL}/src/game/utils.js`,
  facts: `${BASE_URL}/src/game/facts.js`,
  resize: `${BASE_URL}/src/game/resize.js`,
  extralife: `${BASE_URL}/src/game/ExtraLife.js`,
  datamanager: `${BASE_URL}/src/game/DataManager.js`,
  apiservice: `${BASE_URL}/src/game/ApiService.js`,
  config: `${BASE_URL}/src/game/Config.js`,
  checkbox: `${BASE_URL}/src/elements/Checkbox.js`,
  checksdialog: `${BASE_URL}/src/elements/ChecksDialog.js`,
  player: `${BASE_URL}/src/lib/Player.js`,
};

function rewriteImports(src, sceneDir = '/src/scenes') {
  // Replace all other aliased/bare imports using the import map
  src = src.replace(/import\s+([\w{}*, ]+)\s+from\s+['"]([^\.\/][^'\"]*)['"]/g, (match, imports, mod) => {
    let mapped = importMap[mod];
    if (!mapped) return match; // leave unchanged if not in import map
    // If mapped is already an absolute URL, use as-is
    if (/^https?:\/\//.test(mapped)) {
      return `import ${imports} from '${mapped}'`;
    }
    // If mapped path is relative, resolve to proxy URL
    if (mapped.startsWith('./src/')) {
      mapped = mapped.replace('./src/', '/src/');
      if (mapped.endsWith('ApiService.js')) {
        // Already handled above
        return match;
      }
      // Local file, use as absolute path
      return `import ${imports} from '${mapped}'`;
    } else {
      // Proxy for remote
      return `import ${imports} from '${BASE_URL}${mapped.replace('./', '/')}'`;
    }
  });
  // Replace all relative imports with proxy URLs, but skip if already absolute
  src = src.replace(/import\s+([\w{}*, ]+)\s+from\s+['"]((\.{1,2}\/)[^'\"]+)['"]/g, (match, imports, relPath) => {
    if (/^https?:\/\//.test(relPath)) return match;
    // Compute absolute URL for the proxy
    const absUrl = `${BASE_URL}${sceneDir}/${relPath}`.replace(/\/\.\//g, '/').replace(/\/[^/]+\/\.\.\//g, '/');
    return `import ${imports} from '${absUrl}'`;
  });
  src = src
    .replace(
      `import ApiService from '${BASE_URL}/src/game/ApiService.js'`,
      `\nconst apiServiceRemoteUrl = '${BASE_URL}/src/game/ApiService.js';\n` +
        'let ApiService;\n' +
        'let apiServiceSrc = await (await fetch(apiServiceRemoteUrl)).text();\n' +
        "apiServiceSrc = apiServiceSrc.replace('console.log(\\'USER DATA:\\', pseudoid, flightId)', 'return {};')\n" +
        "                             .replace('//console.log(url,\">>>>>>>>\")', 'return {};');\n" +
        "const apiBlob = new Blob([apiServiceSrc], { type: 'application/javascript' });\n" +
        'const apiBlobUrl = URL.createObjectURL(apiBlob);\n' +
        'try {\n' +
        '  const ApiServiceModule = await import(/* @vite-ignore */ apiBlobUrl);\n' +
        '  ApiService = ApiServiceModule.default;\n' +
        '} finally {\n' +
        '  URL.revokeObjectURL(apiBlobUrl);\n' +
        '}\n'
    )
    .replace(
      `import Config from '${BASE_URL}/src/game/Config.js';`,
      `\nconst configRemoteUrl = '${BASE_URL}/src/game/Config.js';\n` +
        'let Config;\n' +
        'let configSrc = await (await fetch(configRemoteUrl)).text();\n' +
        'configSrc = configSrc\n' +
        '  .replace(\'import { CONFIG_URL } from "utils";\', \'const CONFIG_URL = "https://api.deltaskyhopper.com";\')\n' +
        "  .replace('const response = await fetch(CONFIG_URL);', 'return {};');\n" +
        "const configBlob = new Blob([configSrc], { type: 'application/javascript' });\n" +
        'const configBlobUrl = URL.createObjectURL(configBlob);\n' +
        'try {\n' +
        '  const ConfigModule = await import(/* @vite-ignore */ configBlobUrl);\n' +
        '  Config = ConfigModule.default;\n' +
        '} finally {\n' +
        '  URL.revokeObjectURL(configBlobUrl);\n' +
        '}\n'
    )
    .replace(
      `import ChecksDialog from '${BASE_URL}/src/elements/ChecksDialog.js'`,
      `\nconst checksDialogRemoteUrl = '${BASE_URL}/src/elements/ChecksDialog.js';\n` +
        'let ChecksDialog;\n' +
        'let checksDialogSrc = await (await fetch(checksDialogRemoteUrl)).text();\n' +
        'checksDialogSrc = checksDialogSrc\n' +
        `  .replace('import { addButtonReactions } from "utils";', 'import { addButtonReactions } from "${BASE_URL}/src/game/utils.js";')\n` +
        `  .replace('import Checkbox from \"checkbox\";', 'import Checkbox from "${BASE_URL}/src/elements/Checkbox.js";');\n` +
        "const checksDialogBlob = new Blob([checksDialogSrc], { type: 'application/javascript' });\n" +
        'const checksDialogBlobUrl = URL.createObjectURL(checksDialogBlob);\n' +
        'try {\n' +
        '  const ChecksDialogModule = await import(/* @vite-ignore */ checksDialogBlobUrl);\n' +
        '  ChecksDialog = ChecksDialogModule.default;\n' +
        '} finally {\n' +
        '  URL.revokeObjectURL(checksDialogBlobUrl);\n' +
        '}\n'
    )
    .replace("this.scene.start('ErrorScene');\n\n            return;", '');
  // Prepend BASE_URL to all asset paths (assets/, sfx/, facts/, ui/), supporting ./, template literals, and variables
  src = src.replace(/(['"`])((\.?\/?(assets|sfx|facts|ui)\/[\w\-./ %${}]+))\1/g, (match, quote, path) => {
    // Only prepend if not already absolute
    if (/^https?:\/\//.test(path)) return match;
    // Remove leading ./ if present
    const cleanPath = path.replace(/^\.\//, '');
    return `${quote}${BASE_URL}/${cleanPath}${quote}`;
  });
  return src;
}
