const BASE_URL = 'http://localhost:3001/proxy/https://deltaskyhopper.com';

// Helper to load, patch, and import a remote scene by name
async function loadRemoteScene(sceneName) {
  const remoteUrl = `${BASE_URL}/src/scenes/${sceneName}.js`;
  console.log('Fetching and patching', sceneName, 'from', remoteUrl);
  let src = await (await fetch(remoteUrl)).text();
  src = rewriteImports(src, '/src/scenes');
  const blob = new Blob([src], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);
  try {
    return (await import(/* @vite-ignore */ blobUrl)).default;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

async function initGame() {
  const ApiCheck = await loadRemoteScene('APICheck');
  const ErrorScene = await loadRemoteScene('ErrorScene');
  const StartScreen = await loadRemoteScene('StartScreen');
  const SelectPlayer = await loadRemoteScene('SelectPlayer');
  const SelectStage = await loadRemoteScene('SelectStage');
  const SplashScreen = await loadRemoteScene('SplashScreen');
  const TutorialScreen = await loadRemoteScene('TutorialScreen');
  const Game = await loadRemoteScene('Game');
  const GameOver = await loadRemoteScene('GameOver');

  const { GAME_HEIGHT, GAME_WIDTH, isDaytime } = await import(/* @vite-ignore */ `${BASE_URL}/src/game/utils.js`);

  const resizeRemoteUrl = 'http://localhost:3001/proxy/https://deltaskyhopper.com/src/game/resize.js';
  let onResize;
  let resizeSrc = await (await fetch(resizeRemoteUrl)).text();
  resizeSrc = resizeSrc.replace(
    'import { GAME_HEIGHT, GAME_WIDTH } from "utils";',
    'import { GAME_HEIGHT, GAME_WIDTH } from "http://localhost:3001/proxy/https://deltaskyhopper.com/src/game/utils.js";'
  );
  const resizeBlob = new Blob([resizeSrc], { type: 'application/javascript' });
  const resizeBlobUrl = URL.createObjectURL(resizeBlob);
  try {
    const ResizeModule = await import(/* @vite-ignore */ resizeBlobUrl);
    onResize = ResizeModule.onResize;
  } finally {
    URL.revokeObjectURL(resizeBlobUrl);
  }

  /**
   * added to remove context menu on iOS and Android when the user
   * longpresses a non canvas area
   */
  document.oncontextmenu = e => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return false;
  };

  const isNightTime = !isDaytime();
  if (isNightTime) {
    document.body.classList.add('night-gradient');
  }

  /**
   * requesting fonts here before the dynamic text on GameOver starts
   */
  WebFont.load({
    custom: {
      families: ['Whitney', 'WhitneyBold', 'WhitneyLightItal', 'Pixelify Sans'],
    },
    active: _ => {
      console.log('---- webfont active');
    },
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
      arcade: {
        gravity: {
          y: 800,
        },
        debug: false,
      },
    },
  });

  onResize();
  window.addEventListener('resize', onResize);

  return game;
}

export default initGame();

// Helper to rewrite all imports in remote scene source
const importMap = {
  'scenes/': 'http://localhost:3001/proxy/https://deltaskyhopper.com/src/scenes/',
  'scenes/LoaderT.js': 'http://localhost:3001/proxy/https://deltaskyhopper.com/src/scenes/LoaderT.js',
  utils: 'http://localhost:3001/proxy/https://deltaskyhopper.com/src/game/utils.js',
  facts: 'http://localhost:3001/proxy/https://deltaskyhopper.com/src/game/facts.js',
  resize: 'http://localhost:3001/proxy/https://deltaskyhopper.com/src/game/resize.js',
  extralife: 'http://localhost:3001/proxy/https://deltaskyhopper.com/src/game/ExtraLife.js',
  datamanager: 'http://localhost:3001/proxy/https://deltaskyhopper.com/src/game/DataManager.js',
  apiservice: 'http://localhost:3001/proxy/https://deltaskyhopper.com/src/game/ApiService.js',
  config: 'http://localhost:3001/proxy/https://deltaskyhopper.com/src/game/Config.js',
  checkbox: 'http://localhost:3001/proxy/https://deltaskyhopper.com/src/elements/Checkbox.js',
  checksdialog: 'http://localhost:3001/proxy/https://deltaskyhopper.com/src/elements/ChecksDialog.js',
  player: 'http://localhost:3001/proxy/https://deltaskyhopper.com/src/lib/Player.js',
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
      return `import ${imports} from 'http://localhost:3001/proxy/https://deltaskyhopper.com${mapped.replace('./', '/')}'`;
    }
  });
  // Replace all relative imports with proxy URLs, but skip if already absolute
  src = src.replace(/import\s+([\w{}*, ]+)\s+from\s+['"]((\.{1,2}\/)[^'\"]+)['"]/g, (match, imports, relPath) => {
    if (/^https?:\/\//.test(relPath)) return match;
    // Compute absolute URL for the proxy
    const absUrl = `http://localhost:3001/proxy/https://deltaskyhopper.com${sceneDir}/${relPath}`
      .replace(/\/\.\//g, '/')
      .replace(/\/[^/]+\/\.\.\//g, '/');
    return `import ${imports} from '${absUrl}'`;
  });
  src = src
    .replace(
      "import ApiService from 'http://localhost:3001/proxy/https://deltaskyhopper.com/src/game/ApiService.js'",
      "\nconst apiServiceRemoteUrl = 'http://localhost:3001/proxy/https://deltaskyhopper.com/src/game/ApiService.js';\n" +
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
      "import Config from 'http://localhost:3001/proxy/https://deltaskyhopper.com/src/game/Config.js';\n",
      "\nconst configRemoteUrl = 'http://localhost:3001/proxy/https://deltaskyhopper.com/src/game/Config.js';\n" +
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
      "import ChecksDialog from 'http://localhost:3001/proxy/https://deltaskyhopper.com/src/elements/ChecksDialog.js'\n",
      "\nconst checksDialogRemoteUrl = 'http://localhost:3001/proxy/https://deltaskyhopper.com/src/elements/ChecksDialog.js';\n" +
        'let ChecksDialog;\n' +
        'let checksDialogSrc = await (await fetch(checksDialogRemoteUrl)).text();\n' +
        'checksDialogSrc = checksDialogSrc\n' +
        '  .replace(\'import { addButtonReactions } from "utils";\', \'import { addButtonReactions } from "http://localhost:3001/proxy/https://deltaskyhopper.com/src/game/utils.js";\')\n' +
        '  .replace(\'import Checkbox from \"checkbox\";\', \'import Checkbox from "http://localhost:3001/proxy/https://deltaskyhopper.com/src/elements/Checkbox.js";\');\n' +
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
