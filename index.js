// include: shell.js
// include: minimum_runtime_check.js
(function() {
  // "30.0.0" -> 300000
  function humanReadableVersionToPacked(str) {
    str = str.split('-')[0]; // Remove any trailing part from e.g. "12.53.3-alpha"
    var vers = str.split('.').slice(0, 3);
    while(vers.length < 3) vers.push('00');
    vers = vers.map((n, i, arr) => n.padStart(2, '0'));
    return vers.join('');
  }
  // 300000 -> "30.0.0"
  var packedVersionToHumanReadable = n => [n / 10000 | 0, (n / 100 | 0) % 100, n % 100].join('.');

  var TARGET_NOT_SUPPORTED = 2147483647;

  // Note: We use a typeof check here instead of optional chaining using
  // globalThis because older browsers might not have globalThis defined.

  // We skip the node version checking when running on Bun/Deno since the node
  // version they report doesn't seem to be useful.
  if (typeof process !== 'undefined' && !process.versions?.bun && typeof Deno == "undefined") {
    var currentNodeVersion = process.versions?.node ? humanReadableVersionToPacked(process.versions.node) : TARGET_NOT_SUPPORTED;
    if (currentNodeVersion < 180300) {
      throw new Error(`This emscripten-generated code requires node v${ packedVersionToHumanReadable(180300) } (detected v${packedVersionToHumanReadable(currentNodeVersion)})`);
    }
  }

  var userAgent = typeof navigator !== 'undefined' && navigator.userAgent;
  if (!userAgent) {
    return;
  }

  var currentSafariVersion = userAgent.includes("Safari/") && !userAgent.includes("Chrome/") && userAgent.match(/Version\/(\d+\.?\d*\.?\d*)/) ? humanReadableVersionToPacked(userAgent.match(/Version\/(\d+\.?\d*\.?\d*)/)[1]) : TARGET_NOT_SUPPORTED;
  if (currentSafariVersion < 150000) {
    throw new Error(`This emscripten-generated code requires Safari v${ packedVersionToHumanReadable(150000) } (detected v${currentSafariVersion})`);
  }

  var currentFirefoxVersion = userAgent.match(/Firefox\/(\d+(?:\.\d+)?)/) ? parseFloat(userAgent.match(/Firefox\/(\d+(?:\.\d+)?)/)[1]) : TARGET_NOT_SUPPORTED;
  if (currentFirefoxVersion < 79) {
    throw new Error(`This emscripten-generated code requires Firefox v79 (detected v${currentFirefoxVersion})`);
  }

  var currentChromeVersion = userAgent.match(/Chrome\/(\d+(?:\.\d+)?)/) ? parseFloat(userAgent.match(/Chrome\/(\d+(?:\.\d+)?)/)[1]) : TARGET_NOT_SUPPORTED;
  if (currentChromeVersion < 85) {
    throw new Error(`This emscripten-generated code requires Chrome v85 (detected v${currentChromeVersion})`);
  }
})();

// end include: minimum_runtime_check.js
// The Module object: Our interface to the outside world. We import
// and export values on it. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(moduleArg) => Promise<Module>
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to check if Module already exists (e.g. case 3 above).
// Substitution will be replaced with actual code on later stage of the build,
// this way Closure Compiler will not mangle it (e.g. case 4. above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module = typeof Module != 'undefined' ? Module : {};

// Determine the runtime environment we are in. You can customize this by
// setting the ENVIRONMENT setting at compile time (see settings.js).

// Attempt to auto-detect the environment
var ENVIRONMENT_IS_WEB = !!globalThis.window;
var ENVIRONMENT_IS_WORKER = !!globalThis.WorkerGlobalScope;
// N.b. Electron.js environment is simultaneously a NODE-environment, but
// also a web environment.
var ENVIRONMENT_IS_NODE = globalThis.process?.versions?.node && globalThis.process?.type != 'renderer';
var ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;

// --pre-jses are emitted after the Module integration code, so that they can
// refer to Module (if they choose; they can also define Module)
// include: /tmp/tmpfn1zgwgf.js

  if (!Module['expectedDataFileDownloads']) Module['expectedDataFileDownloads'] = 0;
  Module['expectedDataFileDownloads']++;
  (() => {
    // Do not attempt to redownload the virtual filesystem data when in a pthread or a Wasm Worker context.
    var isPthread = typeof ENVIRONMENT_IS_PTHREAD != 'undefined' && ENVIRONMENT_IS_PTHREAD;
    var isWasmWorker = typeof ENVIRONMENT_IS_WASM_WORKER != 'undefined' && ENVIRONMENT_IS_WASM_WORKER;
    if (isPthread || isWasmWorker) return;
    var isNode = globalThis.process && globalThis.process.versions && globalThis.process.versions.node && globalThis.process.type != 'renderer';
    async function loadPackage(metadata) {

      var PACKAGE_PATH = '';
      if (typeof window === 'object') {
        PACKAGE_PATH = window['encodeURIComponent'](window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/')) + '/');
      } else if (typeof process === 'undefined' && typeof location !== 'undefined') {
        // web worker
        PACKAGE_PATH = encodeURIComponent(location.pathname.substring(0, location.pathname.lastIndexOf('/')) + '/');
      }
      var PACKAGE_NAME = 'index.data';
      var REMOTE_PACKAGE_BASE = 'index.data';
      var REMOTE_PACKAGE_NAME = Module['locateFile'] ? Module['locateFile'](REMOTE_PACKAGE_BASE, '') : REMOTE_PACKAGE_BASE;
      var REMOTE_PACKAGE_SIZE = metadata['remote_package_size'];

      async function fetchRemotePackage(packageName, packageSize) {
        if (isNode) {
          var contents = require('fs').readFileSync(packageName);
          return new Uint8Array(contents).buffer;
        }
        if (!Module['dataFileDownloads']) Module['dataFileDownloads'] = {};
        try {
          var response = await fetch(packageName);
        } catch (e) {
          throw new Error(`Network Error: ${packageName}`, {e});
        }
        if (!response.ok) {
          throw new Error(`${response.status}: ${response.url}`);
        }

        const chunks = [];
        const headers = response.headers;
        const total = Number(headers.get('Content-Length') || packageSize);
        let loaded = 0;

        Module['setStatus'] && Module['setStatus']('Downloading data...');
        const reader = response.body.getReader();

        while (1) {
          var {done, value} = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.length;
          Module['dataFileDownloads'][packageName] = {loaded, total};

          let totalLoaded = 0;
          let totalSize = 0;

          for (const download of Object.values(Module['dataFileDownloads'])) {
            totalLoaded += download.loaded;
            totalSize += download.total;
          }

          Module['setStatus'] && Module['setStatus'](`Downloading data... (${totalLoaded}/${totalSize})`);
        }

        const packageData = new Uint8Array(chunks.map((c) => c.length).reduce((a, b) => a + b, 0));
        let offset = 0;
        for (const chunk of chunks) {
          packageData.set(chunk, offset);
          offset += chunk.length;
        }
        return packageData.buffer;
      }

      var fetchPromise;
      var fetched = Module['getPreloadedPackage'] && Module['getPreloadedPackage'](REMOTE_PACKAGE_NAME, REMOTE_PACKAGE_SIZE);

      if (!fetched) {
        // Note that we don't use await here because we want to execute the
        // the rest of this function immediately.
        fetchPromise = fetchRemotePackage(REMOTE_PACKAGE_NAME, REMOTE_PACKAGE_SIZE);
      }

    async function runWithFS(Module) {

      function assert(check, msg) {
        if (!check) throw new Error(msg);
      }
Module['FS_createPath']("/", "files", true, true);
Module['FS_createPath']("/files", "Ajioka", true, true);
Module['FS_createPath']("/files/Ajioka", "ADemo", true, true);
Module['FS_createPath']("/files/Ajioka/ADemo", "CVS", true, true);
Module['FS_createPath']("/files/Ajioka", "CVS", true, true);
Module['FS_createPath']("/files", "AudioRes", true, true);
Module['FS_createPath']("/files/AudioRes", "Banks", true, true);
Module['FS_createPath']("/files/AudioRes", "Seqs", true, true);
Module['FS_createPath']("/files/AudioRes", "Stream", true, true);
Module['FS_createPath']("/files", "CVS", true, true);
Module['FS_createPath']("/files", "Effect", true, true);
Module['FS_createPath']("/files/Effect", "CVS", true, true);
Module['FS_createPath']("/files", "Ending", true, true);
Module['FS_createPath']("/files/Ending", "CVS", true, true);
Module['FS_createPath']("/files/Ending", "English", true, true);
Module['FS_createPath']("/files/Ending/English", "CVS", true, true);
Module['FS_createPath']("/files", "Event", true, true);
Module['FS_createPath']("/files/Event", "CVS", true, true);
Module['FS_createPath']("/files", "Game", true, true);
Module['FS_createPath']("/files/Game", "CVS", true, true);
Module['FS_createPath']("/files", "Iwamoto", true, true);
Module['FS_createPath']("/files/Iwamoto", "CVS", true, true);
Module['FS_createPath']("/files/Iwamoto", "map0", true, true);
Module['FS_createPath']("/files/Iwamoto/map0", "CVS", true, true);
Module['FS_createPath']("/files/Iwamoto", "map1", true, true);
Module['FS_createPath']("/files/Iwamoto/map1", "CVS", true, true);
Module['FS_createPath']("/files/Iwamoto", "map10", true, true);
Module['FS_createPath']("/files/Iwamoto/map10", "CVS", true, true);
Module['FS_createPath']("/files/Iwamoto", "map11", true, true);
Module['FS_createPath']("/files/Iwamoto/map11", "CVS", true, true);
Module['FS_createPath']("/files/Iwamoto", "map12", true, true);
Module['FS_createPath']("/files/Iwamoto/map12", "CVS", true, true);
Module['FS_createPath']("/files/Iwamoto", "map13", true, true);
Module['FS_createPath']("/files/Iwamoto/map13", "CVS", true, true);
Module['FS_createPath']("/files/Iwamoto", "map2", true, true);
Module['FS_createPath']("/files/Iwamoto/map2", "CVS", true, true);
Module['FS_createPath']("/files/Iwamoto", "map3", true, true);
Module['FS_createPath']("/files/Iwamoto/map3", "CVS", true, true);
Module['FS_createPath']("/files/Iwamoto", "map4", true, true);
Module['FS_createPath']("/files/Iwamoto/map4", "CVS", true, true);
Module['FS_createPath']("/files/Iwamoto", "map5", true, true);
Module['FS_createPath']("/files/Iwamoto/map5", "CVS", true, true);
Module['FS_createPath']("/files/Iwamoto", "map6", true, true);
Module['FS_createPath']("/files/Iwamoto/map6", "CVS", true, true);
Module['FS_createPath']("/files/Iwamoto", "map7", true, true);
Module['FS_createPath']("/files/Iwamoto/map7", "CVS", true, true);
Module['FS_createPath']("/files/Iwamoto", "map8", true, true);
Module['FS_createPath']("/files/Iwamoto/map8", "CVS", true, true);
Module['FS_createPath']("/files/Iwamoto", "map9", true, true);
Module['FS_createPath']("/files/Iwamoto/map9", "CVS", true, true);
Module['FS_createPath']("/files", "Kawano", true, true);
Module['FS_createPath']("/files/Kawano", "CVS", true, true);
Module['FS_createPath']("/files/Kawano", "ENGLISH", true, true);
Module['FS_createPath']("/files/Kawano/ENGLISH", "CVS", true, true);
Module['FS_createPath']("/files", "Map", true, true);
Module['FS_createPath']("/files/Map", "CVS", true, true);
Module['FS_createPath']("/files", "Movie", true, true);
Module['FS_createPath']("/files", "Nakamura", true, true);
Module['FS_createPath']("/files/Nakamura", "CVS", true, true);
Module['FS_createPath']("/files/Nakamura", "up", true, true);
Module['FS_createPath']("/files/Nakamura/up", "CVS", true, true);
Module['FS_createPath']("/files", "model", true, true);
Module['FS_createPath']("/files/model", "CVS", true, true);
Module['FS_createPath']("/files", "system", true, true);
Module['FS_createPath']("/files/system", "CVS", true, true);
Module['FS_createPath']("/", "sys", true, true);

      async function processPackageData(arrayBuffer) {
        assert(arrayBuffer, 'Loading data file failed.');
        assert(arrayBuffer.constructor.name === ArrayBuffer.name, 'bad input to processPackageData ' + arrayBuffer.constructor.name);
        var byteArray = new Uint8Array(arrayBuffer);
        var curr;
        // Reuse the bytearray from the XHR as the source for file reads.
          for (var file of metadata['files']) {
            var name = file['filename'];
            var data = byteArray.subarray(file['start'], file['end']);
            // canOwn this data in the filesystem, it is a slice into the heap that will never change
        Module['FS_createDataFile'](name, null, data, true, true, true);
          }
          Module['removeRunDependency']('datafile_index.data');
      }
      Module['addRunDependency']('datafile_index.data');

      if (!Module['preloadResults']) Module['preloadResults'] = {};

      Module['preloadResults'][PACKAGE_NAME] = {fromCache: false};
      if (!fetched) {
        fetched = await fetchPromise;
      }
      await processPackageData(fetched);

    }
    // Detect whether the module JS file has already been loaded.
    if (Module['FS_createPath']) {
      runWithFS(Module);
    } else {
      if (!Module['preRun']) Module['preRun'] = [];
      Module['preRun'].push(runWithFS); // FS is not initialized yet, wait for it
    }

    }
    loadPackage({"files": [{"filename": "/files/Ajioka/ADemo/CVS/Entries", "start": 0, "end": 3552}, {"filename": "/files/Ajioka/ADemo/CVS/Repository", "start": 3552, "end": 3578}, {"filename": "/files/Ajioka/ADemo/CVS/Root", "start": 3578, "end": 3628}, {"filename": "/files/Ajioka/ADemo/codemo01.szp", "start": 3628, "end": 297932}, {"filename": "/files/Ajioka/ADemo/codemo02.szp", "start": 297932, "end": 592236}, {"filename": "/files/Ajioka/ADemo/codemo03.szp", "start": 592236, "end": 897548}, {"filename": "/files/Ajioka/ADemo/codemo04.szp", "start": 897548, "end": 1152396}, {"filename": "/files/Ajioka/ADemo/codemo05.szp", "start": 1152396, "end": 1400524}, {"filename": "/files/Ajioka/ADemo/codemo06.szp", "start": 1400524, "end": 1636300}, {"filename": "/files/Ajioka/ADemo/codemo07.szp", "start": 1636300, "end": 1858348}, {"filename": "/files/Ajioka/ADemo/codemo08.szp", "start": 1858348, "end": 2077804}, {"filename": "/files/Ajioka/ADemo/codemo09.szp", "start": 2077804, "end": 2359020}, {"filename": "/files/Ajioka/ADemo/codemo10.szp", "start": 2359020, "end": 2612492}, {"filename": "/files/Ajioka/ADemo/codemo11.szp", "start": 2612492, "end": 2917804}, {"filename": "/files/Ajioka/ADemo/codemo12.szp", "start": 2917804, "end": 3212108}, {"filename": "/files/Ajioka/ADemo/codemo13.szp", "start": 3212108, "end": 3493324}, {"filename": "/files/Ajioka/ADemo/codemo14.szp", "start": 3493324, "end": 3746796}, {"filename": "/files/Ajioka/ADemo/dodb.szp", "start": 3746796, "end": 5625036}, {"filename": "/files/Ajioka/ADemo/dotb.szp", "start": 5625036, "end": 6944236}, {"filename": "/files/Ajioka/ADemo/gameboy.szp", "start": 6944236, "end": 7035084}, {"filename": "/files/Ajioka/ADemo/gbdemo01.szp", "start": 7035084, "end": 7121900}, {"filename": "/files/Ajioka/ADemo/gbdemo02.szp", "start": 7121900, "end": 7213964}, {"filename": "/files/Ajioka/ADemo/gbdemo03.szp", "start": 7213964, "end": 7299820}, {"filename": "/files/Ajioka/ADemo/gbdemo04.szp", "start": 7299820, "end": 7384940}, {"filename": "/files/Ajioka/ADemo/gbdemo05.szp", "start": 7384940, "end": 7471180}, {"filename": "/files/Ajioka/ADemo/gbdemo06.szp", "start": 7471180, "end": 7555564}, {"filename": "/files/Ajioka/ADemo/gbdemo07.szp", "start": 7555564, "end": 7642604}, {"filename": "/files/Ajioka/ADemo/hodemo01.szp", "start": 7642604, "end": 7992556}, {"filename": "/files/Ajioka/ADemo/hodemo02.szp", "start": 7992556, "end": 8342508}, {"filename": "/files/Ajioka/ADemo/hodemo03.szp", "start": 8342508, "end": 8703468}, {"filename": "/files/Ajioka/ADemo/hodemo04.szp", "start": 8703468, "end": 9013996}, {"filename": "/files/Ajioka/ADemo/hodemo05.szp", "start": 9013996, "end": 9317804}, {"filename": "/files/Ajioka/ADemo/hodemo06.szp", "start": 9317804, "end": 9628332}, {"filename": "/files/Ajioka/ADemo/hodemo07.szp", "start": 9628332, "end": 9906060}, {"filename": "/files/Ajioka/ADemo/hodemo08.szp", "start": 9906060, "end": 10181164}, {"filename": "/files/Ajioka/ADemo/hodemo09.szp", "start": 10181164, "end": 10518060}, {"filename": "/files/Ajioka/ADemo/hodemo10.szp", "start": 10518060, "end": 10827212}, {"filename": "/files/Ajioka/ADemo/hodemo11.szp", "start": 10827212, "end": 11179308}, {"filename": "/files/Ajioka/ADemo/hodemo12.szp", "start": 11179308, "end": 11519948}, {"filename": "/files/Ajioka/ADemo/hodemo13.szp", "start": 11519948, "end": 11846380}, {"filename": "/files/Ajioka/ADemo/hodemo14.szp", "start": 11846380, "end": 12150252}, {"filename": "/files/Ajioka/ADemo/nodemo01.szp", "start": 12150252, "end": 12444620}, {"filename": "/files/Ajioka/ADemo/nodemo02.szp", "start": 12444620, "end": 12738988}, {"filename": "/files/Ajioka/ADemo/nodemo03.szp", "start": 12738988, "end": 13045516}, {"filename": "/files/Ajioka/ADemo/nodemo04.szp", "start": 13045516, "end": 13300428}, {"filename": "/files/Ajioka/ADemo/nodemo05.szp", "start": 13300428, "end": 13548652}, {"filename": "/files/Ajioka/ADemo/nodemo06.szp", "start": 13548652, "end": 13784524}, {"filename": "/files/Ajioka/ADemo/nodemo07.szp", "start": 13784524, "end": 14006668}, {"filename": "/files/Ajioka/ADemo/nodemo08.szp", "start": 14006668, "end": 14226188}, {"filename": "/files/Ajioka/ADemo/nodemo09.szp", "start": 14226188, "end": 14507468}, {"filename": "/files/Ajioka/ADemo/nodemo10.szp", "start": 14507468, "end": 14761004}, {"filename": "/files/Ajioka/ADemo/nodemo11.szp", "start": 14761004, "end": 15067532}, {"filename": "/files/Ajioka/ADemo/nodemo12.szp", "start": 15067532, "end": 15361900}, {"filename": "/files/Ajioka/ADemo/nodemo13.szp", "start": 15361900, "end": 15643180}, {"filename": "/files/Ajioka/ADemo/nodemo14.szp", "start": 15643180, "end": 15896716}, {"filename": "/files/Ajioka/ADemo/oodemo01.szp", "start": 15896716, "end": 16244268}, {"filename": "/files/Ajioka/ADemo/oodemo02.szp", "start": 16244268, "end": 16591820}, {"filename": "/files/Ajioka/ADemo/oodemo03.szp", "start": 16591820, "end": 16950348}, {"filename": "/files/Ajioka/ADemo/oodemo04.szp", "start": 16950348, "end": 17258444}, {"filename": "/files/Ajioka/ADemo/oodemo05.szp", "start": 17258444, "end": 17559852}, {"filename": "/files/Ajioka/ADemo/oodemo06.szp", "start": 17559852, "end": 17867948}, {"filename": "/files/Ajioka/ADemo/oodemo07.szp", "start": 17867948, "end": 18143276}, {"filename": "/files/Ajioka/ADemo/oodemo08.szp", "start": 18143276, "end": 18415980}, {"filename": "/files/Ajioka/ADemo/oodemo09.szp", "start": 18415980, "end": 18750444}, {"filename": "/files/Ajioka/ADemo/oodemo10.szp", "start": 18750444, "end": 19057164}, {"filename": "/files/Ajioka/ADemo/oodemo11.szp", "start": 19057164, "end": 19406860}, {"filename": "/files/Ajioka/ADemo/oodemo12.szp", "start": 19406860, "end": 19745068}, {"filename": "/files/Ajioka/ADemo/oodemo13.szp", "start": 19745068, "end": 20069068}, {"filename": "/files/Ajioka/ADemo/oodemo14.szp", "start": 20069068, "end": 20370508}, {"filename": "/files/Ajioka/ADemo/opcn.szp", "start": 20370508, "end": 21709068}, {"filename": "/files/Ajioka/ADemo/opdn.szp", "start": 21709068, "end": 22880364}, {"filename": "/files/Ajioka/ADemo/opeg.szp", "start": 22880364, "end": 24389708}, {"filename": "/files/Ajioka/ADemo/opod.szp", "start": 24389708, "end": 25764012}, {"filename": "/files/Ajioka/ADemo/oppm.szp", "start": 25764012, "end": 27223788}, {"filename": "/files/Ajioka/ADemo/opsu.szp", "start": 27223788, "end": 28594348}, {"filename": "/files/Ajioka/ADemo/opwf.szp", "start": 28594348, "end": 29391500}, {"filename": "/files/Ajioka/CVS/Entries", "start": 29391500, "end": 29391513}, {"filename": "/files/Ajioka/CVS/Repository", "start": 29391513, "end": 29391533}, {"filename": "/files/Ajioka/CVS/Root", "start": 29391533, "end": 29391583}, {"filename": "/files/AudioRes/Banks/LuiSe2_0.aw", "start": 29391583, "end": 29648191}, {"filename": "/files/AudioRes/Banks/LuiSec0_0.aw", "start": 29648191, "end": 31951615}, {"filename": "/files/AudioRes/Banks/LuiSec1_0.aw", "start": 31951615, "end": 38468863}, {"filename": "/files/AudioRes/Banks/LuiSec2_0.aw", "start": 38468863, "end": 44636639}, {"filename": "/files/AudioRes/JaiInit.aaf", "start": 44636639, "end": 44880607}, {"filename": "/files/AudioRes/Seqs/JaiArcS.arc", "start": 44880607, "end": 45461887}, {"filename": "/files/AudioRes/Stream/TMOpen.afc", "start": 45461887, "end": 47885695}, {"filename": "/files/AudioRes/Stream/TMansion.afc", "start": 47885695, "end": 48795071}, {"filename": "/files/CVS/Entries", "start": 48795071, "end": 48795269}, {"filename": "/files/CVS/Repository", "start": 48795269, "end": 48795282}, {"filename": "/files/CVS/Root", "start": 48795282, "end": 48795332}, {"filename": "/files/Effect/CVS/Entries", "start": 48795332, "end": 48795655}, {"filename": "/files/Effect/CVS/Repository", "start": 48795655, "end": 48795675}, {"filename": "/files/Effect/CVS/Root", "start": 48795675, "end": 48795725}, {"filename": "/files/Effect/door.bck", "start": 48795725, "end": 48796525}, {"filename": "/files/Effect/door.bmd", "start": 48796525, "end": 48885677}, {"filename": "/files/Effect/door.key", "start": 48885677, "end": 48886319}, {"filename": "/files/Effect/door.mdl", "start": 48886319, "end": 48986787}, {"filename": "/files/Effect/effect.bmd", "start": 48986787, "end": 49009923}, {"filename": "/files/Effect/effect.btk", "start": 49009923, "end": 49010371}, {"filename": "/files/Effect/hakko.bti", "start": 49010371, "end": 49026787}, {"filename": "/files/Ending/CVS/Entries", "start": 49026787, "end": 49028425}, {"filename": "/files/Ending/CVS/Repository", "start": 49028425, "end": 49028445}, {"filename": "/files/Ending/CVS/Root", "start": 49028445, "end": 49028495}, {"filename": "/files/Ending/English/CVS/Entries", "start": 49028495, "end": 49029103}, {"filename": "/files/Ending/English/CVS/Repository", "start": 49029103, "end": 49029131}, {"filename": "/files/Ending/English/CVS/Root", "start": 49029131, "end": 49029181}, {"filename": "/files/Ending/English/end_msE.bti", "start": 49029181, "end": 49094749}, {"filename": "/files/Ending/English/me_kanE.bti", "start": 49094749, "end": 49099261}, {"filename": "/files/Ending/English/mes_VE.bti", "start": 49099261, "end": 49112093}, {"filename": "/files/Ending/English/mes_bE.bti", "start": 49112093, "end": 49126205}, {"filename": "/files/Ending/English/mes_gE.bti", "start": 49126205, "end": 49137501}, {"filename": "/files/Ending/English/ra_AE.bti", "start": 49137501, "end": 49139453}, {"filename": "/files/Ending/English/ra_BE.bti", "start": 49139453, "end": 49141405}, {"filename": "/files/Ending/English/ra_CE.bti", "start": 49141405, "end": 49143357}, {"filename": "/files/Ending/English/ra_DE.bti", "start": 49143357, "end": 49145309}, {"filename": "/files/Ending/English/ra_EE.bti", "start": 49145309, "end": 49147261}, {"filename": "/files/Ending/English/ra_FE.bti", "start": 49147261, "end": 49149213}, {"filename": "/files/Ending/English/ra_GE.bti", "start": 49149213, "end": 49151165}, {"filename": "/files/Ending/English/ra_HE.bti", "start": 49151165, "end": 49153117}, {"filename": "/files/Ending/end_ms.bti", "start": 49153117, "end": 49218685}, {"filename": "/files/Ending/h_P00.bti", "start": 49218685, "end": 49833117}, {"filename": "/files/Ending/h_P00G.bti", "start": 49833117, "end": 50447549}, {"filename": "/files/Ending/h_P01.bti", "start": 50447549, "end": 51061981}, {"filename": "/files/Ending/h_P01G.bti", "start": 51061981, "end": 51676413}, {"filename": "/files/Ending/h_P02.bti", "start": 51676413, "end": 52290845}, {"filename": "/files/Ending/h_P02G.bti", "start": 52290845, "end": 52905277}, {"filename": "/files/Ending/h_P03.bti", "start": 52905277, "end": 53519709}, {"filename": "/files/Ending/h_P03G.bti", "start": 53519709, "end": 54134141}, {"filename": "/files/Ending/h_P04.bti", "start": 54134141, "end": 54748573}, {"filename": "/files/Ending/h_P04G.bti", "start": 54748573, "end": 55363005}, {"filename": "/files/Ending/h_P05.bti", "start": 55363005, "end": 55977437}, {"filename": "/files/Ending/h_P05G.bti", "start": 55977437, "end": 56591869}, {"filename": "/files/Ending/h_P06.bti", "start": 56591869, "end": 57206301}, {"filename": "/files/Ending/h_P06G.bti", "start": 57206301, "end": 57820733}, {"filename": "/files/Ending/h_P07.bti", "start": 57820733, "end": 58435165}, {"filename": "/files/Ending/h_P07G.bti", "start": 58435165, "end": 59049597}, {"filename": "/files/Ending/house_00.bti", "start": 59049597, "end": 59664029}, {"filename": "/files/Ending/luigi_V.bti", "start": 59664029, "end": 59685181}, {"filename": "/files/Ending/luigi_b.bti", "start": 59685181, "end": 59703773}, {"filename": "/files/Ending/luigi_g.bti", "start": 59703773, "end": 59723005}, {"filename": "/files/Ending/me_kan.bti", "start": 59723005, "end": 59726621}, {"filename": "/files/Ending/mes_V.bti", "start": 59726621, "end": 59737917}, {"filename": "/files/Ending/mes_b.bti", "start": 59737917, "end": 59749213}, {"filename": "/files/Ending/mes_b1.bti", "start": 59749213, "end": 59760509}, {"filename": "/files/Ending/mes_g.bti", "start": 59760509, "end": 59771805}, {"filename": "/files/Ending/ra_A.bti", "start": 59771805, "end": 59773757}, {"filename": "/files/Ending/ra_B.bti", "start": 59773757, "end": 59775709}, {"filename": "/files/Ending/ra_C.bti", "start": 59775709, "end": 59777661}, {"filename": "/files/Ending/ra_D.bti", "start": 59777661, "end": 59779613}, {"filename": "/files/Ending/ra_E.bti", "start": 59779613, "end": 59781565}, {"filename": "/files/Ending/ra_F.bti", "start": 59781565, "end": 59783517}, {"filename": "/files/Ending/ra_G.bti", "start": 59783517, "end": 59785469}, {"filename": "/files/Ending/ra_H.bti", "start": 59785469, "end": 59787421}, {"filename": "/files/Ending/sosite.bti", "start": 59787421, "end": 59795133}, {"filename": "/files/Event/CVS/Entries", "start": 59795133, "end": 59800121}, {"filename": "/files/Event/CVS/Repository", "start": 59800121, "end": 59800140}, {"filename": "/files/Event/CVS/Root", "start": 59800140, "end": 59800190}, {"filename": "/files/Event/event00.szp", "start": 59800190, "end": 59800294}, {"filename": "/files/Event/event01.szp", "start": 59800294, "end": 59807234}, {"filename": "/files/Event/event02.szp", "start": 59807234, "end": 59810819}, {"filename": "/files/Event/event03.szp", "start": 59810819, "end": 59813407}, {"filename": "/files/Event/event04.szp", "start": 59813407, "end": 59815848}, {"filename": "/files/Event/event05.szp", "start": 59815848, "end": 59815952}, {"filename": "/files/Event/event06.szp", "start": 59815952, "end": 59816056}, {"filename": "/files/Event/event07.szp", "start": 59816056, "end": 59819419}, {"filename": "/files/Event/event08.szp", "start": 59819419, "end": 59822956}, {"filename": "/files/Event/event09.szp", "start": 59822956, "end": 59828019}, {"filename": "/files/Event/event10.szp", "start": 59828019, "end": 59832034}, {"filename": "/files/Event/event100.szp", "start": 59832034, "end": 59832293}, {"filename": "/files/Event/event101.szp", "start": 59832293, "end": 59832477}, {"filename": "/files/Event/event11.szp", "start": 59832477, "end": 59834540}, {"filename": "/files/Event/event12.szp", "start": 59834540, "end": 59835871}, {"filename": "/files/Event/event13.szp", "start": 59835871, "end": 59836317}, {"filename": "/files/Event/event14.szp", "start": 59836317, "end": 59836683}, {"filename": "/files/Event/event15.szp", "start": 59836683, "end": 59837882}, {"filename": "/files/Event/event16.szp", "start": 59837882, "end": 59838386}, {"filename": "/files/Event/event17.szp", "start": 59838386, "end": 59840367}, {"filename": "/files/Event/event18.szp", "start": 59840367, "end": 59840751}, {"filename": "/files/Event/event19.szp", "start": 59840751, "end": 59841137}, {"filename": "/files/Event/event20.szp", "start": 59841137, "end": 59841526}, {"filename": "/files/Event/event21.szp", "start": 59841526, "end": 59841914}, {"filename": "/files/Event/event22.szp", "start": 59841914, "end": 59842567}, {"filename": "/files/Event/event23.szp", "start": 59842567, "end": 59843054}, {"filename": "/files/Event/event24.szp", "start": 59843054, "end": 59844333}, {"filename": "/files/Event/event25.szp", "start": 59844333, "end": 59844813}, {"filename": "/files/Event/event26.szp", "start": 59844813, "end": 59848064}, {"filename": "/files/Event/event27.szp", "start": 59848064, "end": 59848404}, {"filename": "/files/Event/event28.szp", "start": 59848404, "end": 59850882}, {"filename": "/files/Event/event29.szp", "start": 59850882, "end": 59853916}, {"filename": "/files/Event/event30.szp", "start": 59853916, "end": 59854649}, {"filename": "/files/Event/event31.szp", "start": 59854649, "end": 59855948}, {"filename": "/files/Event/event32.szp", "start": 59855948, "end": 59857162}, {"filename": "/files/Event/event33.szp", "start": 59857162, "end": 59859354}, {"filename": "/files/Event/event34.szp", "start": 59859354, "end": 59859772}, {"filename": "/files/Event/event35.szp", "start": 59859772, "end": 59861311}, {"filename": "/files/Event/event36.szp", "start": 59861311, "end": 59866565}, {"filename": "/files/Event/event37.szp", "start": 59866565, "end": 59867071}, {"filename": "/files/Event/event38.szp", "start": 59867071, "end": 59869783}, {"filename": "/files/Event/event39.szp", "start": 59869783, "end": 59871257}, {"filename": "/files/Event/event40.szp", "start": 59871257, "end": 59871992}, {"filename": "/files/Event/event41.szp", "start": 59871992, "end": 59872382}, {"filename": "/files/Event/event42.szp", "start": 59872382, "end": 59874445}, {"filename": "/files/Event/event43.szp", "start": 59874445, "end": 59874789}, {"filename": "/files/Event/event44.szp", "start": 59874789, "end": 59876372}, {"filename": "/files/Event/event45.szp", "start": 59876372, "end": 59877089}, {"filename": "/files/Event/event46.szp", "start": 59877089, "end": 59878980}, {"filename": "/files/Event/event47.szp", "start": 59878980, "end": 59879552}, {"filename": "/files/Event/event48.szp", "start": 59879552, "end": 59880951}, {"filename": "/files/Event/event49.szp", "start": 59880951, "end": 59881766}, {"filename": "/files/Event/event50.szp", "start": 59881766, "end": 59882838}, {"filename": "/files/Event/event51.szp", "start": 59882838, "end": 59883098}, {"filename": "/files/Event/event52.szp", "start": 59883098, "end": 59919288}, {"filename": "/files/Event/event53.szp", "start": 59919288, "end": 59924029}, {"filename": "/files/Event/event54.szp", "start": 59924029, "end": 59925420}, {"filename": "/files/Event/event55.szp", "start": 59925420, "end": 59926312}, {"filename": "/files/Event/event56.szp", "start": 59926312, "end": 59927527}, {"filename": "/files/Event/event57.szp", "start": 59927527, "end": 59928472}, {"filename": "/files/Event/event58.szp", "start": 59928472, "end": 59929458}, {"filename": "/files/Event/event59.szp", "start": 59929458, "end": 59930653}, {"filename": "/files/Event/event60.szp", "start": 59930653, "end": 59931666}, {"filename": "/files/Event/event61.szp", "start": 59931666, "end": 59934623}, {"filename": "/files/Event/event62.szp", "start": 59934623, "end": 59934872}, {"filename": "/files/Event/event63.szp", "start": 59934872, "end": 59936194}, {"filename": "/files/Event/event64.szp", "start": 59936194, "end": 59938984}, {"filename": "/files/Event/event65.szp", "start": 59938984, "end": 59940783}, {"filename": "/files/Event/event66.szp", "start": 59940783, "end": 59943677}, {"filename": "/files/Event/event67.szp", "start": 59943677, "end": 59944297}, {"filename": "/files/Event/event68.szp", "start": 59944297, "end": 59946644}, {"filename": "/files/Event/event69.szp", "start": 59946644, "end": 59950245}, {"filename": "/files/Event/event70.szp", "start": 59950245, "end": 59951487}, {"filename": "/files/Event/event71.szp", "start": 59951487, "end": 59952918}, {"filename": "/files/Event/event72.szp", "start": 59952918, "end": 59954814}, {"filename": "/files/Event/event73.szp", "start": 59954814, "end": 59958481}, {"filename": "/files/Event/event74.szp", "start": 59958481, "end": 59966533}, {"filename": "/files/Event/event75.szp", "start": 59966533, "end": 59968557}, {"filename": "/files/Event/event76.szp", "start": 59968557, "end": 59969853}, {"filename": "/files/Event/event77.szp", "start": 59969853, "end": 59975787}, {"filename": "/files/Event/event78.szp", "start": 59975787, "end": 59978146}, {"filename": "/files/Event/event79.szp", "start": 59978146, "end": 59978590}, {"filename": "/files/Event/event80.szp", "start": 59978590, "end": 59980651}, {"filename": "/files/Event/event81.szp", "start": 59980651, "end": 59981037}, {"filename": "/files/Event/event82.szp", "start": 59981037, "end": 59981915}, {"filename": "/files/Event/event83.szp", "start": 59981915, "end": 59982409}, {"filename": "/files/Event/event84.szp", "start": 59982409, "end": 59983394}, {"filename": "/files/Event/event85.szp", "start": 59983394, "end": 59985941}, {"filename": "/files/Event/event86.szp", "start": 59985941, "end": 59986368}, {"filename": "/files/Event/event87.szp", "start": 59986368, "end": 59987762}, {"filename": "/files/Event/event88.szp", "start": 59987762, "end": 59990263}, {"filename": "/files/Event/event89.szp", "start": 59990263, "end": 59991109}, {"filename": "/files/Event/event90.szp", "start": 59991109, "end": 59992883}, {"filename": "/files/Event/event91.szp", "start": 59992883, "end": 59993829}, {"filename": "/files/Event/event92.szp", "start": 59993829, "end": 59994089}, {"filename": "/files/Event/event93.szp", "start": 59994089, "end": 59995551}, {"filename": "/files/Event/event94.szp", "start": 59995551, "end": 59997033}, {"filename": "/files/Event/event95.szp", "start": 59997033, "end": 59997293}, {"filename": "/files/Event/event96.szp", "start": 59997293, "end": 59997777}, {"filename": "/files/Event/event97.szp", "start": 59997777, "end": 59998038}, {"filename": "/files/Event/event98.szp", "start": 59998038, "end": 59998299}, {"filename": "/files/Event/event99.szp", "start": 59998299, "end": 59998560}, {"filename": "/files/Game/CVS/Entries", "start": 59998560, "end": 59998659}, {"filename": "/files/Game/CVS/Repository", "start": 59998659, "end": 59998677}, {"filename": "/files/Game/CVS/Root", "start": 59998677, "end": 59998727}, {"filename": "/files/Game/game.szp", "start": 59998727, "end": 62644455}, {"filename": "/files/Game/game_usa.szp", "start": 62644455, "end": 65281895}, {"filename": "/files/Iwamoto/CVS/Entries", "start": 65281895, "end": 65282213}, {"filename": "/files/Iwamoto/CVS/Repository", "start": 65282213, "end": 65282234}, {"filename": "/files/Iwamoto/CVS/Root", "start": 65282234, "end": 65282284}, {"filename": "/files/Iwamoto/map0/CVS/Entries", "start": 65282284, "end": 65282479}, {"filename": "/files/Iwamoto/map0/CVS/Repository", "start": 65282479, "end": 65282505}, {"filename": "/files/Iwamoto/map0/CVS/Root", "start": 65282505, "end": 65282555}, {"filename": "/files/Iwamoto/map0/test_00.bin", "start": 65282555, "end": 65327739}, {"filename": "/files/Iwamoto/map0/test_01.bin", "start": 65327739, "end": 65421179}, {"filename": "/files/Iwamoto/map0/test_02.bin", "start": 65421179, "end": 65518811}, {"filename": "/files/Iwamoto/map0/test_03.bin", "start": 65518811, "end": 65671611}, {"filename": "/files/Iwamoto/map1/CVS/Entries", "start": 65671611, "end": 65671751}, {"filename": "/files/Iwamoto/map1/CVS/Repository", "start": 65671751, "end": 65671777}, {"filename": "/files/Iwamoto/map1/CVS/Root", "start": 65671777, "end": 65671827}, {"filename": "/files/Iwamoto/map1/h_01.bin", "start": 65671827, "end": 65957747}, {"filename": "/files/Iwamoto/map1/h_02.bin", "start": 65957747, "end": 66407955}, {"filename": "/files/Iwamoto/map1/hakase.arc", "start": 66407955, "end": 66695251}, {"filename": "/files/Iwamoto/map10/CVS/Entries", "start": 66695251, "end": 66695302}, {"filename": "/files/Iwamoto/map10/CVS/Repository", "start": 66695302, "end": 66695329}, {"filename": "/files/Iwamoto/map10/CVS/Root", "start": 66695329, "end": 66695379}, {"filename": "/files/Iwamoto/map10/roombed.arc", "start": 66695379, "end": 66894547}, {"filename": "/files/Iwamoto/map11/CVS/Entries", "start": 66894547, "end": 66894598}, {"filename": "/files/Iwamoto/map11/CVS/Repository", "start": 66894598, "end": 66894625}, {"filename": "/files/Iwamoto/map11/CVS/Root", "start": 66894625, "end": 66894675}, {"filename": "/files/Iwamoto/map11/beranda.arc", "start": 66894675, "end": 67240243}, {"filename": "/files/Iwamoto/map12/CVS/Entries", "start": 67240243, "end": 67240291}, {"filename": "/files/Iwamoto/map12/CVS/Repository", "start": 67240291, "end": 67240318}, {"filename": "/files/Iwamoto/map12/CVS/Root", "start": 67240318, "end": 67240368}, {"filename": "/files/Iwamoto/map12/h_02.bin", "start": 67240368, "end": 67671696}, {"filename": "/files/Iwamoto/map13/CVS/Entries", "start": 67671696, "end": 67671748}, {"filename": "/files/Iwamoto/map13/CVS/Repository", "start": 67671748, "end": 67671775}, {"filename": "/files/Iwamoto/map13/CVS/Root", "start": 67671775, "end": 67671825}, {"filename": "/files/Iwamoto/map13/tombboss.arc", "start": 67671825, "end": 68023473}, {"filename": "/files/Iwamoto/map2/CVS/Entries", "start": 68023473, "end": 68027216}, {"filename": "/files/Iwamoto/map2/CVS/Repository", "start": 68027216, "end": 68027242}, {"filename": "/files/Iwamoto/map2/CVS/Root", "start": 68027242, "end": 68027292}, {"filename": "/files/Iwamoto/map2/gidemap.szp", "start": 68027292, "end": 68259772}, {"filename": "/files/Iwamoto/map2/room01A.bin", "start": 68259772, "end": 68353052}, {"filename": "/files/Iwamoto/map2/room_00.arc", "start": 68353052, "end": 68636604}, {"filename": "/files/Iwamoto/map2/room_01.arc", "start": 68636604, "end": 68902972}, {"filename": "/files/Iwamoto/map2/room_02.arc", "start": 68902972, "end": 69285532}, {"filename": "/files/Iwamoto/map2/room_03.arc", "start": 69285532, "end": 69459420}, {"filename": "/files/Iwamoto/map2/room_04.arc", "start": 69459420, "end": 69706364}, {"filename": "/files/Iwamoto/map2/room_05.arc", "start": 69706364, "end": 69908092}, {"filename": "/files/Iwamoto/map2/room_06.arc", "start": 69908092, "end": 70155324}, {"filename": "/files/Iwamoto/map2/room_07.arc", "start": 70155324, "end": 70349148}, {"filename": "/files/Iwamoto/map2/room_08.arc", "start": 70349148, "end": 70793148}, {"filename": "/files/Iwamoto/map2/room_09.arc", "start": 70793148, "end": 71252796}, {"filename": "/files/Iwamoto/map2/room_10.arc", "start": 71252796, "end": 71654012}, {"filename": "/files/Iwamoto/map2/room_11.arc", "start": 71654012, "end": 72114428}, {"filename": "/files/Iwamoto/map2/room_12.arc", "start": 72114428, "end": 72465148}, {"filename": "/files/Iwamoto/map2/room_13.arc", "start": 72465148, "end": 72757148}, {"filename": "/files/Iwamoto/map2/room_14.arc", "start": 72757148, "end": 73035900}, {"filename": "/files/Iwamoto/map2/room_15.arc", "start": 73035900, "end": 73111196}, {"filename": "/files/Iwamoto/map2/room_16.arc", "start": 73111196, "end": 73534940}, {"filename": "/files/Iwamoto/map2/room_17.arc", "start": 73534940, "end": 73870844}, {"filename": "/files/Iwamoto/map2/room_18.arc", "start": 73870844, "end": 74095772}, {"filename": "/files/Iwamoto/map2/room_19.arc", "start": 74095772, "end": 74357020}, {"filename": "/files/Iwamoto/map2/room_20.arc", "start": 74357020, "end": 74584636}, {"filename": "/files/Iwamoto/map2/room_21.arc", "start": 74584636, "end": 74832572}, {"filename": "/files/Iwamoto/map2/room_22.arc", "start": 74832572, "end": 75067996}, {"filename": "/files/Iwamoto/map2/room_23.arc", "start": 75067996, "end": 75469788}, {"filename": "/files/Iwamoto/map2/room_24.arc", "start": 75469788, "end": 75879068}, {"filename": "/files/Iwamoto/map2/room_25.arc", "start": 75879068, "end": 76304668}, {"filename": "/files/Iwamoto/map2/room_26.arc", "start": 76304668, "end": 76355420}, {"filename": "/files/Iwamoto/map2/room_27.arc", "start": 76355420, "end": 76608316}, {"filename": "/files/Iwamoto/map2/room_28.arc", "start": 76608316, "end": 76899548}, {"filename": "/files/Iwamoto/map2/room_28A.arc", "start": 76899548, "end": 77190268}, {"filename": "/files/Iwamoto/map2/room_29.arc", "start": 77190268, "end": 77353532}, {"filename": "/files/Iwamoto/map2/room_30.arc", "start": 77353532, "end": 77624892}, {"filename": "/files/Iwamoto/map2/room_31.arc", "start": 77624892, "end": 77783324}, {"filename": "/files/Iwamoto/map2/room_32.arc", "start": 77783324, "end": 77950524}, {"filename": "/files/Iwamoto/map2/room_33.arc", "start": 77950524, "end": 78323004}, {"filename": "/files/Iwamoto/map2/room_34.arc", "start": 78323004, "end": 78735772}, {"filename": "/files/Iwamoto/map2/room_35.arc", "start": 78735772, "end": 79130044}, {"filename": "/files/Iwamoto/map2/room_36.arc", "start": 79130044, "end": 79584572}, {"filename": "/files/Iwamoto/map2/room_37.arc", "start": 79584572, "end": 80031772}, {"filename": "/files/Iwamoto/map2/room_38.arc", "start": 80031772, "end": 80464380}, {"filename": "/files/Iwamoto/map2/room_39.arc", "start": 80464380, "end": 80808892}, {"filename": "/files/Iwamoto/map2/room_40.arc", "start": 80808892, "end": 81082524}, {"filename": "/files/Iwamoto/map2/room_41.arc", "start": 81082524, "end": 81315132}, {"filename": "/files/Iwamoto/map2/room_42.arc", "start": 81315132, "end": 81680924}, {"filename": "/files/Iwamoto/map2/room_43.arc", "start": 81680924, "end": 81877628}, {"filename": "/files/Iwamoto/map2/room_44.arc", "start": 81877628, "end": 81969564}, {"filename": "/files/Iwamoto/map2/room_45.arc", "start": 81969564, "end": 82175484}, {"filename": "/files/Iwamoto/map2/room_46.arc", "start": 82175484, "end": 82391996}, {"filename": "/files/Iwamoto/map2/room_47.arc", "start": 82391996, "end": 82708156}, {"filename": "/files/Iwamoto/map2/room_48.arc", "start": 82708156, "end": 82981980}, {"filename": "/files/Iwamoto/map2/room_49.arc", "start": 82981980, "end": 83146460}, {"filename": "/files/Iwamoto/map2/room_50.arc", "start": 83146460, "end": 83479612}, {"filename": "/files/Iwamoto/map2/room_51.arc", "start": 83479612, "end": 83641340}, {"filename": "/files/Iwamoto/map2/room_52.arc", "start": 83641340, "end": 83891676}, {"filename": "/files/Iwamoto/map2/room_53.arc", "start": 83891676, "end": 83986876}, {"filename": "/files/Iwamoto/map2/room_54.arc", "start": 83986876, "end": 84064732}, {"filename": "/files/Iwamoto/map2/room_55.arc", "start": 84064732, "end": 84290076}, {"filename": "/files/Iwamoto/map2/room_56.arc", "start": 84290076, "end": 84724764}, {"filename": "/files/Iwamoto/map2/room_57.arc", "start": 84724764, "end": 85181052}, {"filename": "/files/Iwamoto/map2/room_58.arc", "start": 85181052, "end": 85261628}, {"filename": "/files/Iwamoto/map2/room_59.arc", "start": 85261628, "end": 85695420}, {"filename": "/files/Iwamoto/map2/room_60.arc", "start": 85695420, "end": 86146620}, {"filename": "/files/Iwamoto/map2/room_61.arc", "start": 86146620, "end": 86507228}, {"filename": "/files/Iwamoto/map2/room_62.arc", "start": 86507228, "end": 86578588}, {"filename": "/files/Iwamoto/map2/room_63.arc", "start": 86578588, "end": 86810076}, {"filename": "/files/Iwamoto/map2/room_64.arc", "start": 86810076, "end": 86909596}, {"filename": "/files/Iwamoto/map2/room_65.arc", "start": 86909596, "end": 87286460}, {"filename": "/files/Iwamoto/map2/room_66.arc", "start": 87286460, "end": 87547196}, {"filename": "/files/Iwamoto/map2/room_67.arc", "start": 87547196, "end": 87918492}, {"filename": "/files/Iwamoto/map2/room_68.arc", "start": 87918492, "end": 87976252}, {"filename": "/files/Iwamoto/map2/room_69.arc", "start": 87976252, "end": 88096412}, {"filename": "/files/Iwamoto/map2/room_70.arc", "start": 88096412, "end": 88436988}, {"filename": "/files/Iwamoto/map2/room_71.arc", "start": 88436988, "end": 88506428}, {"filename": "/files/Iwamoto/map2/room_72.arc", "start": 88506428, "end": 88837884}, {"filename": "/files/Iwamoto/map2/room_73.arc", "start": 88837884, "end": 89007292}, {"filename": "/files/Iwamoto/map3/CVS/Entries", "start": 89007292, "end": 89007343}, {"filename": "/files/Iwamoto/map3/CVS/Repository", "start": 89007343, "end": 89007369}, {"filename": "/files/Iwamoto/map3/CVS/Root", "start": 89007369, "end": 89007419}, {"filename": "/files/Iwamoto/map3/h_07_00.arc", "start": 89007419, "end": 89350267}, {"filename": "/files/Iwamoto/map4/CVS/Entries", "start": 89350267, "end": 89350315}, {"filename": "/files/Iwamoto/map4/CVS/Repository", "start": 89350315, "end": 89350341}, {"filename": "/files/Iwamoto/map4/CVS/Root", "start": 89350341, "end": 89350391}, {"filename": "/files/Iwamoto/map4/h_02.bin", "start": 89350391, "end": 89781719}, {"filename": "/files/Iwamoto/map5/CVS/Entries", "start": 89781719, "end": 89781914}, {"filename": "/files/Iwamoto/map5/CVS/Repository", "start": 89781914, "end": 89781940}, {"filename": "/files/Iwamoto/map5/CVS/Root", "start": 89781940, "end": 89781990}, {"filename": "/files/Iwamoto/map5/h_03_00.bin", "start": 89781990, "end": 90164326}, {"filename": "/files/Iwamoto/map5/h_03_01.bin", "start": 90164326, "end": 90304550}, {"filename": "/files/Iwamoto/map5/h_03_02.bin", "start": 90304550, "end": 90445574}, {"filename": "/files/Iwamoto/map5/h_03_03.bin", "start": 90445574, "end": 90859846}, {"filename": "/files/Iwamoto/map6/CVS/Entries", "start": 90859846, "end": 90860047}, {"filename": "/files/Iwamoto/map6/CVS/Repository", "start": 90860047, "end": 90860073}, {"filename": "/files/Iwamoto/map6/CVS/Root", "start": 90860073, "end": 90860123}, {"filename": "/files/Iwamoto/map6/gyara_00.arc", "start": 90860123, "end": 91162043}, {"filename": "/files/Iwamoto/map6/gyara_01.arc", "start": 91162043, "end": 91268539}, {"filename": "/files/Iwamoto/map6/gyara_02.arc", "start": 91268539, "end": 91376251}, {"filename": "/files/Iwamoto/map6/gyara_03.arc", "start": 91376251, "end": 91827323}, {"filename": "/files/Iwamoto/map7/CVS/Entries", "start": 91827323, "end": 91827518}, {"filename": "/files/Iwamoto/map7/CVS/Repository", "start": 91827518, "end": 91827544}, {"filename": "/files/Iwamoto/map7/CVS/Root", "start": 91827544, "end": 91827594}, {"filename": "/files/Iwamoto/map7/h_05_00.bin", "start": 91827594, "end": 92209930}, {"filename": "/files/Iwamoto/map7/h_05_01.bin", "start": 92209930, "end": 92379178}, {"filename": "/files/Iwamoto/map7/h_05_02.bin", "start": 92379178, "end": 92549866}, {"filename": "/files/Iwamoto/map7/h_05_03.bin", "start": 92549866, "end": 92964138}, {"filename": "/files/Iwamoto/map8/CVS/Entries", "start": 92964138, "end": 92964333}, {"filename": "/files/Iwamoto/map8/CVS/Repository", "start": 92964333, "end": 92964359}, {"filename": "/files/Iwamoto/map8/CVS/Root", "start": 92964359, "end": 92964409}, {"filename": "/files/Iwamoto/map8/h_06_00.bin", "start": 92964409, "end": 93253497}, {"filename": "/files/Iwamoto/map8/h_06_01.bin", "start": 93253497, "end": 93449401}, {"filename": "/files/Iwamoto/map8/h_06_02.bin", "start": 93449401, "end": 93645721}, {"filename": "/files/Iwamoto/map8/h_06_03.bin", "start": 93645721, "end": 94049817}, {"filename": "/files/Iwamoto/map9/CVS/Entries", "start": 94049817, "end": 94049869}, {"filename": "/files/Iwamoto/map9/CVS/Repository", "start": 94049869, "end": 94049895}, {"filename": "/files/Iwamoto/map9/CVS/Root", "start": 94049895, "end": 94049945}, {"filename": "/files/Iwamoto/map9/lastroof.arc", "start": 94049945, "end": 94462681}, {"filename": "/files/Iwamoto/vrKoopa.szp", "start": 94462681, "end": 94525753}, {"filename": "/files/Iwamoto/vrball_B.szp", "start": 94525753, "end": 94567769}, {"filename": "/files/Iwamoto/vrball_M.szp", "start": 94567769, "end": 94591321}, {"filename": "/files/Kawano/CVS/Entries", "start": 94591321, "end": 94592074}, {"filename": "/files/Kawano/CVS/Repository", "start": 94592074, "end": 94592094}, {"filename": "/files/Kawano/CVS/Root", "start": 94592094, "end": 94592144}, {"filename": "/files/Kawano/ENGLISH/CVS/Entries", "start": 94592144, "end": 94592539}, {"filename": "/files/Kawano/ENGLISH/CVS/Repository", "start": 94592539, "end": 94592567}, {"filename": "/files/Kawano/ENGLISH/CVS/Root", "start": 94592567, "end": 94592617}, {"filename": "/files/Kawano/ENGLISH/res_aaa1.szp", "start": 94592617, "end": 95045193}, {"filename": "/files/Kawano/ENGLISH/res_aaa2.szp", "start": 95045193, "end": 95509513}, {"filename": "/files/Kawano/ENGLISH/res_aaa3.szp", "start": 95509513, "end": 96111369}, {"filename": "/files/Kawano/ENGLISH/res_aaa4.szp", "start": 96111369, "end": 96516841}, {"filename": "/files/Kawano/ENGLISH/res_acnt.szp", "start": 96516841, "end": 96893929}, {"filename": "/files/Kawano/ENGLISH/res_cont.szp", "start": 96893929, "end": 96933257}, {"filename": "/files/Kawano/ENGLISH/res_save.szp", "start": 96933257, "end": 97125033}, {"filename": "/files/Kawano/ENGLISH/res_slct.szp", "start": 97125033, "end": 98004329}, {"filename": "/files/Kawano/res_aaa1.szp", "start": 98004329, "end": 98456297}, {"filename": "/files/Kawano/res_aaa2.szp", "start": 98456297, "end": 98920617}, {"filename": "/files/Kawano/res_aaa3.szp", "start": 98920617, "end": 99522473}, {"filename": "/files/Kawano/res_aaa4.szp", "start": 99522473, "end": 99817705}, {"filename": "/files/Kawano/res_acnt.szp", "start": 99817705, "end": 100196393}, {"filename": "/files/Kawano/res_cont.szp", "start": 100196393, "end": 100233033}, {"filename": "/files/Kawano/res_crcl.szp", "start": 100233033, "end": 100233609}, {"filename": "/files/Kawano/res_hisc.szp", "start": 100233609, "end": 100236777}, {"filename": "/files/Kawano/res_kwnx.szp", "start": 100236777, "end": 100245225}, {"filename": "/files/Kawano/res_save.szp", "start": 100245225, "end": 100444585}, {"filename": "/files/Kawano/res_slct.szp", "start": 100444585, "end": 101305545}, {"filename": "/files/Kawano/res_stf1.szp", "start": 101305545, "end": 101757321}, {"filename": "/files/Kawano/res_stf2.szp", "start": 101757321, "end": 102221449}, {"filename": "/files/Kawano/res_stf3.szp", "start": 102221449, "end": 102823113}, {"filename": "/files/Kawano/res_stf4.szp", "start": 102823113, "end": 103118217}, {"filename": "/files/Map/CVS/Entries", "start": 103118217, "end": 103118864}, {"filename": "/files/Map/CVS/Repository", "start": 103118864, "end": 103118881}, {"filename": "/files/Map/CVS/Root", "start": 103118881, "end": 103118931}, {"filename": "/files/Map/map0.szp", "start": 103118931, "end": 103159283}, {"filename": "/files/Map/map1.szp", "start": 103159283, "end": 103188979}, {"filename": "/files/Map/map10.szp", "start": 103188979, "end": 103203987}, {"filename": "/files/Map/map11.szp", "start": 103203987, "end": 103315315}, {"filename": "/files/Map/map12.szp", "start": 103315315, "end": 103401171}, {"filename": "/files/Map/map13.szp", "start": 103401171, "end": 103457875}, {"filename": "/files/Map/map2.szp", "start": 103457875, "end": 104439955}, {"filename": "/files/Map/map3.szp", "start": 104439955, "end": 104524755}, {"filename": "/files/Map/map4.szp", "start": 104524755, "end": 104610771}, {"filename": "/files/Map/map5.szp", "start": 104610771, "end": 104774931}, {"filename": "/files/Map/map6.szp", "start": 104774931, "end": 104828019}, {"filename": "/files/Map/map7.szp", "start": 104828019, "end": 104853523}, {"filename": "/files/Map/map8.szp", "start": 104853523, "end": 104888531}, {"filename": "/files/Map/map9.szp", "start": 104888531, "end": 105054323}, {"filename": "/files/Movie/pikminS.h4m", "start": 105054323, "end": 170895187}, {"filename": "/files/Nakamura/CVS/Entries", "start": 170895187, "end": 170895246}, {"filename": "/files/Nakamura/CVS/Repository", "start": 170895246, "end": 170895268}, {"filename": "/files/Nakamura/CVS/Root", "start": 170895268, "end": 170895318}, {"filename": "/files/Nakamura/gallery.bin", "start": 170895318, "end": 172014451}, {"filename": "/files/Nakamura/up/CVS/Entries", "start": 172014451, "end": 172019590}, {"filename": "/files/Nakamura/up/CVS/Repository", "start": 172019590, "end": 172019615}, {"filename": "/files/Nakamura/up/CVS/Root", "start": 172019615, "end": 172019665}, {"filename": "/files/Nakamura/up/bg.bti", "start": 172019665, "end": 172052465}, {"filename": "/files/Nakamura/up/bg_kupa.bti", "start": 172052465, "end": 172056593}, {"filename": "/files/Nakamura/up/oba00gp0.mdl", "start": 172056593, "end": 172266801}, {"filename": "/files/Nakamura/up/oba00gp1.mdl", "start": 172266801, "end": 172477009}, {"filename": "/files/Nakamura/up/oba00gp2.mdl", "start": 172477009, "end": 172687217}, {"filename": "/files/Nakamura/up/oba00gp3.mdl", "start": 172687217, "end": 172897425}, {"filename": "/files/Nakamura/up/oba00gp4.mdl", "start": 172897425, "end": 173107633}, {"filename": "/files/Nakamura/up/oba00gp5.mdl", "start": 173107633, "end": 173317841}, {"filename": "/files/Nakamura/up/oba00gp6.mdl", "start": 173317841, "end": 173528049}, {"filename": "/files/Nakamura/up/oba00gp7.mdl", "start": 173528049, "end": 173738257}, {"filename": "/files/Nakamura/up/oba00gp8.mdl", "start": 173738257, "end": 173948465}, {"filename": "/files/Nakamura/up/oba01gp0.mdl", "start": 173948465, "end": 173995441}, {"filename": "/files/Nakamura/up/oba01gp1.mdl", "start": 173995441, "end": 174043025}, {"filename": "/files/Nakamura/up/oba01gp2.mdl", "start": 174043025, "end": 174090609}, {"filename": "/files/Nakamura/up/oba01gp3.mdl", "start": 174090609, "end": 174138193}, {"filename": "/files/Nakamura/up/oba02gp0.mdl", "start": 174138193, "end": 174185169}, {"filename": "/files/Nakamura/up/oba02gp1.mdl", "start": 174185169, "end": 174232753}, {"filename": "/files/Nakamura/up/oba02gp2.mdl", "start": 174232753, "end": 174280337}, {"filename": "/files/Nakamura/up/oba02gp3.mdl", "start": 174280337, "end": 174327921}, {"filename": "/files/Nakamura/up/oba03gp0.mdl", "start": 174327921, "end": 174374897}, {"filename": "/files/Nakamura/up/oba03gp1.mdl", "start": 174374897, "end": 174422481}, {"filename": "/files/Nakamura/up/oba03gp2.mdl", "start": 174422481, "end": 174470065}, {"filename": "/files/Nakamura/up/oba03gp3.mdl", "start": 174470065, "end": 174517649}, {"filename": "/files/Nakamura/up/oba04gp0.mdl", "start": 174517649, "end": 174602513}, {"filename": "/files/Nakamura/up/oba04gp1.mdl", "start": 174602513, "end": 174687377}, {"filename": "/files/Nakamura/up/oba04gp2.mdl", "start": 174687377, "end": 174772241}, {"filename": "/files/Nakamura/up/oba04gp3.mdl", "start": 174772241, "end": 174857105}, {"filename": "/files/Nakamura/up/oba05gp0.mdl", "start": 174857105, "end": 174904081}, {"filename": "/files/Nakamura/up/oba05gp1.mdl", "start": 174904081, "end": 174951665}, {"filename": "/files/Nakamura/up/oba05gp2.mdl", "start": 174951665, "end": 174999249}, {"filename": "/files/Nakamura/up/oba05gp3.mdl", "start": 174999249, "end": 175046833}, {"filename": "/files/Nakamura/up/oba06gp0.mdl", "start": 175046833, "end": 175093809}, {"filename": "/files/Nakamura/up/oba06gp1.mdl", "start": 175093809, "end": 175141393}, {"filename": "/files/Nakamura/up/oba06gp2.mdl", "start": 175141393, "end": 175188977}, {"filename": "/files/Nakamura/up/oba06gp3.mdl", "start": 175188977, "end": 175236561}, {"filename": "/files/Nakamura/up/oba07gp0.mdl", "start": 175236561, "end": 175283537}, {"filename": "/files/Nakamura/up/oba07gp1.mdl", "start": 175283537, "end": 175331121}, {"filename": "/files/Nakamura/up/oba07gp2.mdl", "start": 175331121, "end": 175378705}, {"filename": "/files/Nakamura/up/oba07gp3.mdl", "start": 175378705, "end": 175426289}, {"filename": "/files/Nakamura/up/oba08gp0.mdl", "start": 175426289, "end": 175473265}, {"filename": "/files/Nakamura/up/oba08gp1.mdl", "start": 175473265, "end": 175520849}, {"filename": "/files/Nakamura/up/oba08gp2.mdl", "start": 175520849, "end": 175568433}, {"filename": "/files/Nakamura/up/oba08gp3.mdl", "start": 175568433, "end": 175616017}, {"filename": "/files/Nakamura/up/oba09gp0.mdl", "start": 175616017, "end": 175662993}, {"filename": "/files/Nakamura/up/oba09gp1.mdl", "start": 175662993, "end": 175710577}, {"filename": "/files/Nakamura/up/oba09gp2.mdl", "start": 175710577, "end": 175758161}, {"filename": "/files/Nakamura/up/oba09gp3.mdl", "start": 175758161, "end": 175805745}, {"filename": "/files/Nakamura/up/oba10gp0.mdl", "start": 175805745, "end": 175852721}, {"filename": "/files/Nakamura/up/oba10gp1.mdl", "start": 175852721, "end": 175900305}, {"filename": "/files/Nakamura/up/oba10gp2.mdl", "start": 175900305, "end": 175947889}, {"filename": "/files/Nakamura/up/oba10gp3.mdl", "start": 175947889, "end": 175995473}, {"filename": "/files/Nakamura/up/oba11gp0.mdl", "start": 175995473, "end": 176042449}, {"filename": "/files/Nakamura/up/oba11gp1.mdl", "start": 176042449, "end": 176090033}, {"filename": "/files/Nakamura/up/oba11gp2.mdl", "start": 176090033, "end": 176137617}, {"filename": "/files/Nakamura/up/oba11gp3.mdl", "start": 176137617, "end": 176185201}, {"filename": "/files/Nakamura/up/oba12gp0.mdl", "start": 176185201, "end": 176232177}, {"filename": "/files/Nakamura/up/oba12gp1.mdl", "start": 176232177, "end": 176279761}, {"filename": "/files/Nakamura/up/oba12gp2.mdl", "start": 176279761, "end": 176327345}, {"filename": "/files/Nakamura/up/oba12gp3.mdl", "start": 176327345, "end": 176374929}, {"filename": "/files/Nakamura/up/oba13gp0.mdl", "start": 176374929, "end": 176421905}, {"filename": "/files/Nakamura/up/oba13gp1.mdl", "start": 176421905, "end": 176469489}, {"filename": "/files/Nakamura/up/oba13gp2.mdl", "start": 176469489, "end": 176517073}, {"filename": "/files/Nakamura/up/oba13gp3.mdl", "start": 176517073, "end": 176564657}, {"filename": "/files/Nakamura/up/oba14gp0.mdl", "start": 176564657, "end": 176611633}, {"filename": "/files/Nakamura/up/oba14gp1.mdl", "start": 176611633, "end": 176659217}, {"filename": "/files/Nakamura/up/oba14gp2.mdl", "start": 176659217, "end": 176706801}, {"filename": "/files/Nakamura/up/oba14gp3.mdl", "start": 176706801, "end": 176754385}, {"filename": "/files/Nakamura/up/oba15gp0.mdl", "start": 176754385, "end": 176801361}, {"filename": "/files/Nakamura/up/oba15gp1.mdl", "start": 176801361, "end": 176848945}, {"filename": "/files/Nakamura/up/oba15gp2.mdl", "start": 176848945, "end": 176896529}, {"filename": "/files/Nakamura/up/oba15gp3.mdl", "start": 176896529, "end": 176944113}, {"filename": "/files/Nakamura/up/oba16gp0.mdl", "start": 176944113, "end": 176991089}, {"filename": "/files/Nakamura/up/oba16gp1.mdl", "start": 176991089, "end": 177038673}, {"filename": "/files/Nakamura/up/oba16gp2.mdl", "start": 177038673, "end": 177086257}, {"filename": "/files/Nakamura/up/oba16gp3.mdl", "start": 177086257, "end": 177133841}, {"filename": "/files/Nakamura/up/oba17gp0.mdl", "start": 177133841, "end": 177180817}, {"filename": "/files/Nakamura/up/oba17gp1.mdl", "start": 177180817, "end": 177228401}, {"filename": "/files/Nakamura/up/oba17gp2.mdl", "start": 177228401, "end": 177275985}, {"filename": "/files/Nakamura/up/oba17gp3.mdl", "start": 177275985, "end": 177323569}, {"filename": "/files/Nakamura/up/oba18gp0.mdl", "start": 177323569, "end": 177370545}, {"filename": "/files/Nakamura/up/oba18gp1.mdl", "start": 177370545, "end": 177418129}, {"filename": "/files/Nakamura/up/oba18gp2.mdl", "start": 177418129, "end": 177465713}, {"filename": "/files/Nakamura/up/oba18gp3.mdl", "start": 177465713, "end": 177513297}, {"filename": "/files/Nakamura/up/oba19gp0.mdl", "start": 177513297, "end": 177598161}, {"filename": "/files/Nakamura/up/oba19gp1.mdl", "start": 177598161, "end": 177683025}, {"filename": "/files/Nakamura/up/oba19gp2.mdl", "start": 177683025, "end": 177767889}, {"filename": "/files/Nakamura/up/oba19gp3.mdl", "start": 177767889, "end": 177852753}, {"filename": "/files/Nakamura/up/oba20gp0.mdl", "start": 177852753, "end": 177899729}, {"filename": "/files/Nakamura/up/oba20gp1.mdl", "start": 177899729, "end": 177947313}, {"filename": "/files/Nakamura/up/oba20gp2.mdl", "start": 177947313, "end": 177994897}, {"filename": "/files/Nakamura/up/oba20gp3.mdl", "start": 177994897, "end": 178042481}, {"filename": "/files/Nakamura/up/oba21gp0.mdl", "start": 178042481, "end": 178089457}, {"filename": "/files/Nakamura/up/oba21gp1.mdl", "start": 178089457, "end": 178137041}, {"filename": "/files/Nakamura/up/oba21gp2.mdl", "start": 178137041, "end": 178184625}, {"filename": "/files/Nakamura/up/oba21gp3.mdl", "start": 178184625, "end": 178232209}, {"filename": "/files/Nakamura/up/oba22gp0.mdl", "start": 178232209, "end": 178317073}, {"filename": "/files/Nakamura/up/oba22gp1.mdl", "start": 178317073, "end": 178401937}, {"filename": "/files/Nakamura/up/oba22gp2.mdl", "start": 178401937, "end": 178486801}, {"filename": "/files/Nakamura/up/oba22gp3.mdl", "start": 178486801, "end": 178571665}, {"filename": "/files/Nakamura/up/oba23gp0.mdl", "start": 178571665, "end": 178731025}, {"filename": "/files/Nakamura/up/oba23gp1.mdl", "start": 178731025, "end": 178916529}, {"filename": "/files/Nakamura/up/oba23gp2.mdl", "start": 178916529, "end": 179102033}, {"filename": "/files/Nakamura/up/oba23gp3.mdl", "start": 179102033, "end": 179305873}, {"filename": "/files/Nakamura/up/up_kabe.mdl", "start": 179305873, "end": 179462893}, {"filename": "/files/Nakamura/up/up_kupa.mdl", "start": 179462893, "end": 179522349}, {"filename": "/files/model/CVS/Entries", "start": 179522349, "end": 179534687}, {"filename": "/files/model/CVS/Repository", "start": 179534687, "end": 179534706}, {"filename": "/files/model/CVS/Root", "start": 179534706, "end": 179534756}, {"filename": "/files/model/baby.szp", "start": 179534756, "end": 179815812}, {"filename": "/files/model/babyball.szp", "start": 179815812, "end": 179828772}, {"filename": "/files/model/ball.szp", "start": 179828772, "end": 179838660}, {"filename": "/files/model/banaoba.szp", "start": 179838660, "end": 179897668}, {"filename": "/files/model/barbell.szp", "start": 179897668, "end": 179902468}, {"filename": "/files/model/bat.szp", "start": 179902468, "end": 179918308}, {"filename": "/files/model/bball.szp", "start": 179918308, "end": 179931236}, {"filename": "/files/model/beam.szp", "start": 179931236, "end": 179932548}, {"filename": "/files/model/bfire.szp", "start": 179932548, "end": 180006884}, {"filename": "/files/model/blossom.szp", "start": 180006884, "end": 180037732}, {"filename": "/files/model/bmario.szp", "start": 180037732, "end": 181057412}, {"filename": "/files/model/bomb.szp", "start": 181057412, "end": 181070980}, {"filename": "/files/model/bone.szp", "start": 181070980, "end": 181074340}, {"filename": "/files/model/bottle01.szp", "start": 181074340, "end": 181079332}, {"filename": "/files/model/boy.szp", "start": 181079332, "end": 181169540}, {"filename": "/files/model/bshadow.szp", "start": 181169540, "end": 181211780}, {"filename": "/files/model/bshadow2.szp", "start": 181211780, "end": 181254436}, {"filename": "/files/model/builder.szp", "start": 181254436, "end": 181447684}, {"filename": "/files/model/candle.szp", "start": 181447684, "end": 181458532}, {"filename": "/files/model/car.szp", "start": 181458532, "end": 181464068}, {"filename": "/files/model/dancer.szp", "start": 181464068, "end": 181541316}, {"filename": "/files/model/dancer2.szp", "start": 181541316, "end": 181627492}, {"filename": "/files/model/demobak1.szp", "start": 181627492, "end": 181832004}, {"filename": "/files/model/denwa.szp", "start": 181832004, "end": 181897476}, {"filename": "/files/model/dhakase.szp", "start": 181897476, "end": 182114852}, {"filename": "/files/model/dhakase2.szp", "start": 182114852, "end": 182348388}, {"filename": "/files/model/dkikai.szp", "start": 182348388, "end": 182446980}, {"filename": "/files/model/dkoppa.szp", "start": 182446980, "end": 182579108}, {"filename": "/files/model/dluige01.szp", "start": 182579108, "end": 183013316}, {"filename": "/files/model/dluige02.szp", "start": 183013316, "end": 183466212}, {"filename": "/files/model/dluige03.szp", "start": 183466212, "end": 183752644}, {"filename": "/files/model/dmario.szp", "start": 183752644, "end": 183977348}, {"filename": "/files/model/dog.szp", "start": 183977348, "end": 184079140}, {"filename": "/files/model/doll.szp", "start": 184079140, "end": 184149956}, {"filename": "/files/model/door.szp", "start": 184149956, "end": 184159844}, {"filename": "/files/model/door2.szp", "start": 184159844, "end": 184186212}, {"filename": "/files/model/door3.szp", "start": 184186212, "end": 184199076}, {"filename": "/files/model/dummy.szp", "start": 184199076, "end": 184199460}, {"filename": "/files/model/dust.szp", "start": 184199460, "end": 184203748}, {"filename": "/files/model/dwaku.szp", "start": 184203748, "end": 184209156}, {"filename": "/files/model/eater.szp", "start": 184209156, "end": 184333924}, {"filename": "/files/model/ed07key.szp", "start": 184333924, "end": 184361220}, {"filename": "/files/model/ed07rug.szp", "start": 184361220, "end": 184370660}, {"filename": "/files/model/edarm.szp", "start": 184370660, "end": 184403428}, {"filename": "/files/model/edashuk.szp", "start": 184403428, "end": 184519812}, {"filename": "/files/model/edbet.szp", "start": 184519812, "end": 184549668}, {"filename": "/files/model/edfuta.szp", "start": 184549668, "end": 184559812}, {"filename": "/files/model/edsentak.szp", "start": 184559812, "end": 184686532}, {"filename": "/files/model/edtv.szp", "start": 184686532, "end": 184745828}, {"filename": "/files/model/edusiro.szp", "start": 184745828, "end": 184839300}, {"filename": "/files/model/elh.szp", "start": 184839300, "end": 184877988}, {"filename": "/files/model/fat.szp", "start": 184877988, "end": 184949892}, {"filename": "/files/model/father.szp", "start": 184949892, "end": 185047716}, {"filename": "/files/model/flag.szp", "start": 185047716, "end": 185051172}, {"filename": "/files/model/gaka.szp", "start": 185051172, "end": 185191140}, {"filename": "/files/model/gameboy.szp", "start": 185191140, "end": 185196484}, {"filename": "/files/model/girl.szp", "start": 185196484, "end": 185327300}, {"filename": "/files/model/gun.szp", "start": 185327300, "end": 185332644}, {"filename": "/files/model/hcue.szp", "start": 185332644, "end": 185337700}, {"filename": "/files/model/heart.szp", "start": 185337700, "end": 185345412}, {"filename": "/files/model/heylance.szp", "start": 185345412, "end": 185348324}, {"filename": "/files/model/heymask.szp", "start": 185348324, "end": 185352260}, {"filename": "/files/model/heypo.szp", "start": 185352260, "end": 185398468}, {"filename": "/files/model/htama.szp", "start": 185398468, "end": 185400804}, {"filename": "/files/model/hustler.szp", "start": 185400804, "end": 185516164}, {"filename": "/files/model/ibook.szp", "start": 185516164, "end": 185518052}, {"filename": "/files/model/ibox.szp", "start": 185518052, "end": 185528932}, {"filename": "/files/model/ifly.szp", "start": 185528932, "end": 185531876}, {"filename": "/files/model/ikuma.szp", "start": 185531876, "end": 185550596}, {"filename": "/files/model/inabe.szp", "start": 185550596, "end": 185553572}, {"filename": "/files/model/iphone.szp", "start": 185553572, "end": 185588228}, {"filename": "/files/model/isu.szp", "start": 185588228, "end": 185606948}, {"filename": "/files/model/isu2.szp", "start": 185606948, "end": 185625348}, {"filename": "/files/model/kareki.szp", "start": 185625348, "end": 185639972}, {"filename": "/files/model/kere.szp", "start": 185639972, "end": 185642788}, {"filename": "/files/model/key01.szp", "start": 185642788, "end": 185649444}, {"filename": "/files/model/key02.szp", "start": 185649444, "end": 185658372}, {"filename": "/files/model/key03.szp", "start": 185658372, "end": 185666756}, {"filename": "/files/model/key04.szp", "start": 185666756, "end": 185673956}, {"filename": "/files/model/key05.szp", "start": 185673956, "end": 185684964}, {"filename": "/files/model/kiarm.szp", "start": 185684964, "end": 185721284}, {"filename": "/files/model/kiashuk.szp", "start": 185721284, "end": 185837860}, {"filename": "/files/model/kibako01.szp", "start": 185837860, "end": 185843012}, {"filename": "/files/model/kibet.szp", "start": 185843012, "end": 185872836}, {"filename": "/files/model/kifuta.szp", "start": 185872836, "end": 185883396}, {"filename": "/files/model/kinopio.szp", "start": 185883396, "end": 185925636}, {"filename": "/files/model/kisentak.szp", "start": 185925636, "end": 186075332}, {"filename": "/files/model/kitv.szp", "start": 186075332, "end": 186134852}, {"filename": "/files/model/kiusiro.szp", "start": 186134852, "end": 186229060}, {"filename": "/files/model/kopabody.szp", "start": 186229060, "end": 186562692}, {"filename": "/files/model/kopabom.szp", "start": 186562692, "end": 186585092}, {"filename": "/files/model/kopahead.szp", "start": 186585092, "end": 186738500}, {"filename": "/files/model/kopakage.szp", "start": 186738500, "end": 186749444}, {"filename": "/files/model/kopatele.szp", "start": 186749444, "end": 186863268}, {"filename": "/files/model/kun01.szp", "start": 186863268, "end": 186893060}, {"filename": "/files/model/kun02.szp", "start": 186893060, "end": 186922212}, {"filename": "/files/model/lohakase.szp", "start": 186922212, "end": 187033508}, {"filename": "/files/model/ltelesa.szp", "start": 187033508, "end": 187096708}, {"filename": "/files/model/luige.szp", "start": 187096708, "end": 188769988}, {"filename": "/files/model/marioe.szp", "start": 188769988, "end": 188836324}, {"filename": "/files/model/mcap.szp", "start": 188836324, "end": 188849796}, {"filename": "/files/model/mglove.szp", "start": 188849796, "end": 188864772}, {"filename": "/files/model/mkinoko.szp", "start": 188864772, "end": 188873828}, {"filename": "/files/model/mletter.szp", "start": 188873828, "end": 188875396}, {"filename": "/files/model/moku.szp", "start": 188875396, "end": 188925060}, {"filename": "/files/model/mother.szp", "start": 188925060, "end": 189022884}, {"filename": "/files/model/mphand.szp", "start": 189022884, "end": 189081412}, {"filename": "/files/model/mshoes.szp", "start": 189081412, "end": 189090020}, {"filename": "/files/model/mstar.szp", "start": 189090020, "end": 189102340}, {"filename": "/files/model/namida.szp", "start": 189102340, "end": 189124260}, {"filename": "/files/model/net01.szp", "start": 189124260, "end": 189126244}, {"filename": "/files/model/nut.szp", "start": 189126244, "end": 189151492}, {"filename": "/files/model/oba00g1.szp", "start": 189151492, "end": 189163268}, {"filename": "/files/model/oba00n.szp", "start": 189163268, "end": 189177732}, {"filename": "/files/model/oba01g1.szp", "start": 189177732, "end": 189184452}, {"filename": "/files/model/oba01g2.szp", "start": 189184452, "end": 189191268}, {"filename": "/files/model/oba01g3.szp", "start": 189191268, "end": 189198020}, {"filename": "/files/model/oba01n.szp", "start": 189198020, "end": 189216004}, {"filename": "/files/model/oba02g1.szp", "start": 189216004, "end": 189222788}, {"filename": "/files/model/oba02g2.szp", "start": 189222788, "end": 189228932}, {"filename": "/files/model/oba02g3.szp", "start": 189228932, "end": 189235844}, {"filename": "/files/model/oba02n.szp", "start": 189235844, "end": 189253956}, {"filename": "/files/model/oba03g1.szp", "start": 189253956, "end": 189261380}, {"filename": "/files/model/oba03g2.szp", "start": 189261380, "end": 189268516}, {"filename": "/files/model/oba03g3.szp", "start": 189268516, "end": 189276004}, {"filename": "/files/model/oba03n.szp", "start": 189276004, "end": 189294276}, {"filename": "/files/model/oba04g1.szp", "start": 189294276, "end": 189300580}, {"filename": "/files/model/oba04g2.szp", "start": 189300580, "end": 189307428}, {"filename": "/files/model/oba04g3.szp", "start": 189307428, "end": 189314084}, {"filename": "/files/model/oba04n.szp", "start": 189314084, "end": 189332932}, {"filename": "/files/model/oba05g1.szp", "start": 189332932, "end": 189339652}, {"filename": "/files/model/oba05g2.szp", "start": 189339652, "end": 189346148}, {"filename": "/files/model/oba05g3.szp", "start": 189346148, "end": 189352932}, {"filename": "/files/model/oba05n.szp", "start": 189352932, "end": 189370788}, {"filename": "/files/model/oba06g1.szp", "start": 189370788, "end": 189376388}, {"filename": "/files/model/oba06g2.szp", "start": 189376388, "end": 189382628}, {"filename": "/files/model/oba06g3.szp", "start": 189382628, "end": 189388900}, {"filename": "/files/model/oba06n.szp", "start": 189388900, "end": 189407460}, {"filename": "/files/model/oba07g1.szp", "start": 189407460, "end": 189414148}, {"filename": "/files/model/oba07g2.szp", "start": 189414148, "end": 189420996}, {"filename": "/files/model/oba07g3.szp", "start": 189420996, "end": 189427812}, {"filename": "/files/model/oba07n.szp", "start": 189427812, "end": 189445636}, {"filename": "/files/model/oba08g1.szp", "start": 189445636, "end": 189452388}, {"filename": "/files/model/oba08g2.szp", "start": 189452388, "end": 189459012}, {"filename": "/files/model/oba08g3.szp", "start": 189459012, "end": 189465700}, {"filename": "/files/model/oba08n.szp", "start": 189465700, "end": 189484740}, {"filename": "/files/model/oba09g1.szp", "start": 189484740, "end": 189491364}, {"filename": "/files/model/oba09g2.szp", "start": 189491364, "end": 189497988}, {"filename": "/files/model/oba09g3.szp", "start": 189497988, "end": 189504292}, {"filename": "/files/model/oba09n.szp", "start": 189504292, "end": 189523108}, {"filename": "/files/model/oba10g1.szp", "start": 189523108, "end": 189529988}, {"filename": "/files/model/oba10g2.szp", "start": 189529988, "end": 189536900}, {"filename": "/files/model/oba10g3.szp", "start": 189536900, "end": 189543204}, {"filename": "/files/model/oba10n.szp", "start": 189543204, "end": 189560964}, {"filename": "/files/model/oba11g1.szp", "start": 189560964, "end": 189567684}, {"filename": "/files/model/oba11g2.szp", "start": 189567684, "end": 189574468}, {"filename": "/files/model/oba11g3.szp", "start": 189574468, "end": 189581188}, {"filename": "/files/model/oba11n.szp", "start": 189581188, "end": 189599492}, {"filename": "/files/model/oba12g1.szp", "start": 189599492, "end": 189605028}, {"filename": "/files/model/oba12g2.szp", "start": 189605028, "end": 189611460}, {"filename": "/files/model/oba12g3.szp", "start": 189611460, "end": 189618116}, {"filename": "/files/model/oba12n.szp", "start": 189618116, "end": 189635428}, {"filename": "/files/model/oba13g1.szp", "start": 189635428, "end": 189642308}, {"filename": "/files/model/oba13g2.szp", "start": 189642308, "end": 189649124}, {"filename": "/files/model/oba13g3.szp", "start": 189649124, "end": 189655972}, {"filename": "/files/model/oba13n.szp", "start": 189655972, "end": 189674820}, {"filename": "/files/model/oba14g1.szp", "start": 189674820, "end": 189680996}, {"filename": "/files/model/oba14g2.szp", "start": 189680996, "end": 189687300}, {"filename": "/files/model/oba14g3.szp", "start": 189687300, "end": 189693476}, {"filename": "/files/model/oba14n.szp", "start": 189693476, "end": 189711780}, {"filename": "/files/model/oba15g1.szp", "start": 189711780, "end": 189718468}, {"filename": "/files/model/oba15g2.szp", "start": 189718468, "end": 189725348}, {"filename": "/files/model/oba15g3.szp", "start": 189725348, "end": 189732196}, {"filename": "/files/model/oba15n.szp", "start": 189732196, "end": 189750564}, {"filename": "/files/model/oba16g1.szp", "start": 189750564, "end": 189757668}, {"filename": "/files/model/oba16g2.szp", "start": 189757668, "end": 189764452}, {"filename": "/files/model/oba16g3.szp", "start": 189764452, "end": 189771396}, {"filename": "/files/model/oba16n.szp", "start": 189771396, "end": 189789540}, {"filename": "/files/model/oba17g1.szp", "start": 189789540, "end": 189796068}, {"filename": "/files/model/oba17g2.szp", "start": 189796068, "end": 189802980}, {"filename": "/files/model/oba17g3.szp", "start": 189802980, "end": 189808772}, {"filename": "/files/model/oba17n.szp", "start": 189808772, "end": 189826532}, {"filename": "/files/model/oba18g1.szp", "start": 189826532, "end": 189832420}, {"filename": "/files/model/oba18g2.szp", "start": 189832420, "end": 189838788}, {"filename": "/files/model/oba18g3.szp", "start": 189838788, "end": 189845700}, {"filename": "/files/model/oba18n.szp", "start": 189845700, "end": 189863844}, {"filename": "/files/model/oba19g1.szp", "start": 189863844, "end": 189870564}, {"filename": "/files/model/oba19g2.szp", "start": 189870564, "end": 189876548}, {"filename": "/files/model/oba19g3.szp", "start": 189876548, "end": 189883332}, {"filename": "/files/model/oba19n.szp", "start": 189883332, "end": 189900836}, {"filename": "/files/model/oba20g1.szp", "start": 189900836, "end": 189907236}, {"filename": "/files/model/oba20g2.szp", "start": 189907236, "end": 189913124}, {"filename": "/files/model/oba20g3.szp", "start": 189913124, "end": 189919812}, {"filename": "/files/model/oba20n.szp", "start": 189919812, "end": 189937796}, {"filename": "/files/model/oba21g1.szp", "start": 189937796, "end": 189944164}, {"filename": "/files/model/oba21g2.szp", "start": 189944164, "end": 189950660}, {"filename": "/files/model/oba21g3.szp", "start": 189950660, "end": 189957572}, {"filename": "/files/model/oba21n.szp", "start": 189957572, "end": 189976484}, {"filename": "/files/model/oba22g1.szp", "start": 189976484, "end": 189983300}, {"filename": "/files/model/oba22g2.szp", "start": 189983300, "end": 189989796}, {"filename": "/files/model/oba22g3.szp", "start": 189989796, "end": 189996100}, {"filename": "/files/model/oba22n.szp", "start": 189996100, "end": 190014052}, {"filename": "/files/model/oba23g1.szp", "start": 190014052, "end": 190024612}, {"filename": "/files/model/oba23g2.szp", "start": 190024612, "end": 190034948}, {"filename": "/files/model/oba23g3.szp", "start": 190034948, "end": 190042756}, {"filename": "/files/model/oba23n.szp", "start": 190042756, "end": 190061348}, {"filename": "/files/model/obaasan.szp", "start": 190061348, "end": 190145380}, {"filename": "/files/model/obake01.szp", "start": 190145380, "end": 190239844}, {"filename": "/files/model/obake02.szp", "start": 190239844, "end": 190335588}, {"filename": "/files/model/obake03.szp", "start": 190335588, "end": 190441508}, {"filename": "/files/model/obake04.szp", "start": 190441508, "end": 190520612}, {"filename": "/files/model/obasoul.szp", "start": 190520612, "end": 190528676}, {"filename": "/files/model/odoor1.szp", "start": 190528676, "end": 190533348}, {"filename": "/files/model/odoor2.szp", "start": 190533348, "end": 190538052}, {"filename": "/files/model/odoor3.szp", "start": 190538052, "end": 190542724}, {"filename": "/files/model/odoor4.szp", "start": 190542724, "end": 190547364}, {"filename": "/files/model/odoor5.szp", "start": 190547364, "end": 190552036}, {"filename": "/files/model/odoor6.szp", "start": 190552036, "end": 190556644}, {"filename": "/files/model/oere.szp", "start": 190556644, "end": 190560036}, {"filename": "/files/model/okami1.szp", "start": 190560036, "end": 190562948}, {"filename": "/files/model/okeito1.szp", "start": 190562948, "end": 190570436}, {"filename": "/files/model/otobira.szp", "start": 190570436, "end": 190577476}, {"filename": "/files/model/otub1.szp", "start": 190577476, "end": 190581828}, {"filename": "/files/model/otub2.szp", "start": 190581828, "end": 190587172}, {"filename": "/files/model/otub3.szp", "start": 190587172, "end": 190591364}, {"filename": "/files/model/otub4.szp", "start": 190591364, "end": 190595524}, {"filename": "/files/model/otub5.szp", "start": 190595524, "end": 190598404}, {"filename": "/files/model/oufo1.szp", "start": 190598404, "end": 190600292}, {"filename": "/files/model/oufo2.szp", "start": 190600292, "end": 190602148}, {"filename": "/files/model/pianist.szp", "start": 190602148, "end": 190698852}, {"filename": "/files/model/piero1.szp", "start": 190698852, "end": 190716196}, {"filename": "/files/model/piero2.szp", "start": 190716196, "end": 190733540}, {"filename": "/files/model/pillar.szp", "start": 190733540, "end": 190743332}, {"filename": "/files/model/plane.szp", "start": 190743332, "end": 190748068}, {"filename": "/files/model/poo.szp", "start": 190748068, "end": 190757668}, {"filename": "/files/model/rat.szp", "start": 190757668, "end": 190770724}, {"filename": "/files/model/seed.szp", "start": 190770724, "end": 190787140}, {"filename": "/files/model/shadow.szp", "start": 190787140, "end": 190872420}, {"filename": "/files/model/shower.szp", "start": 190872420, "end": 190885796}, {"filename": "/files/model/situji.szp", "start": 190885796, "end": 190997956}, {"filename": "/files/model/skul.szp", "start": 190997956, "end": 191109924}, {"filename": "/files/model/star.szp", "start": 191109924, "end": 191118564}, {"filename": "/files/model/tabemono.szp", "start": 191118564, "end": 191123748}, {"filename": "/files/model/takara1.szp", "start": 191123748, "end": 191158852}, {"filename": "/files/model/telball.szp", "start": 191158852, "end": 191163812}, {"filename": "/files/model/telesa.szp", "start": 191163812, "end": 191192420}, {"filename": "/files/model/telesa2.szp", "start": 191192420, "end": 191245412}, {"filename": "/files/model/tenjyo.szp", "start": 191245412, "end": 191312132}, {"filename": "/files/model/tomato.szp", "start": 191312132, "end": 191314884}, {"filename": "/files/model/topoo.szp", "start": 191314884, "end": 191383908}, {"filename": "/files/model/tubone.szp", "start": 191383908, "end": 191407236}, {"filename": "/files/model/turara.szp", "start": 191407236, "end": 191408324}, {"filename": "/files/model/uranai.szp", "start": 191408324, "end": 191489540}, {"filename": "/files/model/vbody.szp", "start": 191489540, "end": 191502468}, {"filename": "/files/model/vhead.szp", "start": 191502468, "end": 191529508}, {"filename": "/files/model/waiter.szp", "start": 191529508, "end": 191568740}, {"filename": "/files/model/wpair.szp", "start": 191568740, "end": 191597956}, {"filename": "/files/model/wplight.szp", "start": 191597956, "end": 191623524}, {"filename": "/files/model/wpwater.szp", "start": 191623524, "end": 191664292}, {"filename": "/files/model/yukiyama.szp", "start": 191664292, "end": 191761476}, {"filename": "/files/model/zenmai.szp", "start": 191761476, "end": 191764452}, {"filename": "/files/opening.bnr", "start": 191764452, "end": 191770948}, {"filename": "/files/system/CVS/Entries", "start": 191770948, "end": 191770998}, {"filename": "/files/system/CVS/Repository", "start": 191770998, "end": 191771018}, {"filename": "/files/system/CVS/Root", "start": 191771018, "end": 191771068}, {"filename": "/files/system/system.arc", "start": 191771068, "end": 191787996}, {"filename": "/sys/apploader.img", "start": 191787996, "end": 191866088}, {"filename": "/sys/bi2.bin", "start": 191866088, "end": 191874280}, {"filename": "/sys/boot.bin", "start": 191874280, "end": 191875368}, {"filename": "/sys/fst.bin", "start": 191875368, "end": 191896225}, {"filename": "/sys/main.dol", "start": 191896225, "end": 195695809}], "remote_package_size": 195695809});

  })();

// end include: /tmp/tmpfn1zgwgf.js
// include: /tmp/tmpyt5c86uh.js

    // All the pre-js content up to here must remain later on, we need to run
    // it.
    if ((typeof ENVIRONMENT_IS_WASM_WORKER != 'undefined' && ENVIRONMENT_IS_WASM_WORKER) || (typeof ENVIRONMENT_IS_PTHREAD != 'undefined' && ENVIRONMENT_IS_PTHREAD) || (typeof ENVIRONMENT_IS_AUDIO_WORKLET != 'undefined' && ENVIRONMENT_IS_AUDIO_WORKLET)) Module['preRun'] = [];
    var necessaryPreJSTasks = Module['preRun'].slice();
  // end include: /tmp/tmpyt5c86uh.js
// include: /tmp/tmpf13c9yym.js

    if (!Module['preRun']) throw 'Module.preRun should exist because file support used it; did a pre-js delete it?';
    necessaryPreJSTasks.forEach((task) => {
      if (Module['preRun'].indexOf(task) < 0) throw 'All preRun tasks that exist before user pre-js code should remain after; did you replace Module or modify Module.preRun?';
    });
  // end include: /tmp/tmpf13c9yym.js


var programArgs = [];
var thisProgram = './this.program';
var quit_ = (status, toThrow) => {
  throw toThrow;
};

// In MODULARIZE mode _scriptName needs to be captured already at the very top of the page immediately when the page is parsed, so it is generated there
// before the page load. In non-MODULARIZE modes generate it here.
var _scriptName = globalThis.document?.currentScript?.src;

if (typeof __filename != 'undefined') { // Node
  _scriptName = __filename;
} else
if (ENVIRONMENT_IS_WORKER) {
  _scriptName = self.location.href;
}

// `/` should be present at the end if `scriptDirectory` is not empty
var scriptDirectory = '';
function locateFile(path) {
  if (Module['locateFile']) {
    return Module['locateFile'](path, scriptDirectory);
  }
  return scriptDirectory + path;
}

// Hooks that are implemented differently in different runtime environments.
var readAsync, readBinary;

if (ENVIRONMENT_IS_NODE) {
  const isNode = globalThis.process?.versions?.node && globalThis.process?.type != 'renderer';
  if (!isNode) throw new Error('not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)');

  // These modules will usually be used on Node.js. Load them eagerly to avoid
  // the complexity of lazy-loading.
  var fs = require('node:fs');

  scriptDirectory = __dirname + '/';

// include: node_shell_read.js
readBinary = (filename) => {
  // We need to re-wrap `file://` strings to URLs.
  filename = isFileURI(filename) ? new URL(filename) : filename;
  var ret = fs.readFileSync(filename);
  assert(Buffer.isBuffer(ret));
  return ret;
};

readAsync = async (filename, binary = true) => {
  // See the comment in the `readBinary` function.
  filename = isFileURI(filename) ? new URL(filename) : filename;
  var ret = fs.readFileSync(filename, binary ? undefined : 'utf8');
  assert(binary ? Buffer.isBuffer(ret) : typeof ret == 'string');
  return ret;
};
// end include: node_shell_read.js
  if (process.argv.length > 1) {
    thisProgram = process.argv[1].replace(/\\/g, '/');
  }

  programArgs = process.argv.slice(2);

  // MODULARIZE will export the module in the proper place outside, we don't need to export here
  if (typeof module != 'undefined') {
    module['exports'] = Module;
  }

  quit_ = (status, toThrow) => {
    process.exitCode = status;
    throw toThrow;
  };

} else
if (ENVIRONMENT_IS_SHELL) {

} else

// Note that this includes Node.js workers when relevant (pthreads is enabled).
// Node.js workers are detected as a combination of ENVIRONMENT_IS_WORKER and
// ENVIRONMENT_IS_NODE.
if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  try {
    scriptDirectory = new URL('.', _scriptName).href; // includes trailing slash
  } catch {
    // Must be a `blob:` or `data:` URL (e.g. `blob:http://site.com/etc/etc`), we cannot
    // infer anything from them.
  }

  if (!(globalThis.window || globalThis.WorkerGlobalScope)) throw new Error('not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)');

  {
// include: web_or_worker_shell_read.js
if (ENVIRONMENT_IS_WORKER) {
    readBinary = (url) => {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.responseType = 'arraybuffer';
      xhr.send(null);
      return new Uint8Array(/** @type{!ArrayBuffer} */(xhr.response));
    };
  }

  readAsync = async (url) => {
    // Fetch has some additional restrictions over XHR, like it can't be used on a file:// url.
    // See https://github.com/github/fetch/pull/92#issuecomment-140665932
    // Cordova or Electron apps are typically loaded from a file:// url.
    // So use XHR on webview if URL is a file URL.
    if (isFileURI(url)) {
      return new Promise((resolve, reject) => {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';
        xhr.onload = () => {
          if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
            resolve(xhr.response);
            return;
          }
          reject(xhr.status);
        };
        xhr.onerror = reject;
        xhr.send(null);
      });
    }
    var response = await fetch(url, { credentials: 'same-origin' });
    if (response.ok) {
      return response.arrayBuffer();
    }
    throw new Error(response.status + ' : ' + response.url);
  };
// end include: web_or_worker_shell_read.js
  }
} else
{
  throw new Error('environment detection error');
}

var out = console.log.bind(console);
var err = console.error.bind(console);

var IDBFS = 'IDBFS is no longer included by default; build with -lidbfs.js';
var PROXYFS = 'PROXYFS is no longer included by default; build with -lproxyfs.js';
var WORKERFS = 'WORKERFS is no longer included by default; build with -lworkerfs.js';
var FETCHFS = 'FETCHFS is no longer included by default; build with -lfetchfs.js';
var ICASEFS = 'ICASEFS is no longer included by default; build with -licasefs.js';
var JSFILEFS = 'JSFILEFS is no longer included by default; build with -ljsfilefs.js';
var OPFS = 'OPFS is no longer included by default; build with -lopfs.js';

var NODEFS = 'NODEFS is no longer included by default; build with -lnodefs.js';

// perform assertions in shell.js after we set up out() and err(), as otherwise
// if an assertion fails it cannot print the message

assert(!ENVIRONMENT_IS_SHELL, 'shell environment detected but not enabled at build time (add `shell` to `-sENVIRONMENT` to enable)');

// end include: shell.js

// include: preamble.js
// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

var wasmBinary;

if (!globalThis.WebAssembly) {
  err('no native wasm support detected');
}

// Wasm globals

//========================================
// Runtime essentials
//========================================

// whether we are quitting the application. no code should run after this.
// set in exit() and abort()
var ABORT = false;

// set by exit() and abort().  Passed to 'onExit' handler.
// NOTE: This is also used as the process return code in shell environments
// but only when noExitRuntime is false.
var EXITSTATUS;

// In STRICT mode, we only define assert() when ASSERTIONS is set.  i.e. we
// don't define it at all in release modes.  This matches the behaviour of
// MINIMAL_RUNTIME.
// TODO(sbc): Make this the default even without STRICT enabled.
/** @type {function(*, string=)} */
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed' + (text ? ': ' + text : ''));
  }
}

// We used to include malloc/free by default in the past. Show a helpful error in
// builds with assertions.
function _malloc() {
  abort('malloc() called but not included in the build - add `_malloc` to EXPORTED_FUNCTIONS');
}
function _free() {
  // Show a helpful error since we used to include free by default in the past.
  abort('free() called but not included in the build - add `_free` to EXPORTED_FUNCTIONS');
}

/**
 * Indicates whether filename is delivered via file protocol (as opposed to http/https)
 * @noinline
 */
var isFileURI = (filename) => filename.startsWith('file://');

// include: runtime_common.js
// include: runtime_exceptions.js
// Base Emscripten EH error class
class EmscriptenEH {}

class EmscriptenSjLj extends EmscriptenEH {}

// end include: runtime_exceptions.js
// include: runtime_debug.js
var runtimeDebug = true; // Switch to false at runtime to disable logging at the right times

// Used by XXXXX_DEBUG settings to output debug messages.
function dbg(...args) {
  if (!runtimeDebug && typeof runtimeDebug != 'undefined') return;
  // TODO(sbc): Make this configurable somehow.  Its not always convenient for
  // logging to show up as warnings.
  console.warn(...args);
}

// Endianness check
(() => {
  var h16 = new Int16Array(1);
  var h8 = new Int8Array(h16.buffer);
  h16[0] = 0x6373;
  if (h8[0] !== 0x73 || h8[1] !== 0x63) abort('Runtime error: expected the system to be little-endian! (Run with -sSUPPORT_BIG_ENDIAN to bypass)');
})();

function consumedModuleProp(prop) {
  var value = Module[prop];
  var msg = `Attempt to modify \`Module.${prop}\` after it has already been processed.  This can happen, for example, when code is injected via '--post-js' rather than '--pre-js'`;
  if (Array.isArray(value)) {
    value = new Proxy(value, {
      set(target, key, val) {
        abort(msg);
        return false;
      },
      defineProperty(target, key, descriptor) {
        abort(msg);
        return false;
      },
      deleteProperty(target, key) {
        abort(msg);
        return false;
      }
    });
  }
  Object.defineProperty(Module, prop, {
    configurable: true,
    get() { return value; },
    set() {
      abort(msg);
    }
  });
}

function makeInvalidEarlyAccess(name) {
  return () => assert(false, `call to '${name}' via reference taken before Wasm module initialization`);

}

function ignoredModuleProp(prop) {
  if (Object.getOwnPropertyDescriptor(Module, prop)) {
    abort(`\`Module.${prop}\` was supplied but \`${prop}\` not included in INCOMING_MODULE_JS_API`);
  }
}

// forcing the filesystem exports a few things by default
function isExportedByForceFilesystem(name) {
  return name === 'FS_createPath' ||
         name === 'FS_createDataFile' ||
         name === 'FS_createPreloadedFile' ||
         name === 'FS_preloadFile' ||
         name === 'FS_unlink' ||
         name === 'addRunDependency' ||
         // The old FS has some functionality that WasmFS lacks.
         name === 'FS_createLazyFile' ||
         name === 'FS_createDevice' ||
         name === 'removeRunDependency';
}

/**
 * Intercept access to a symbols in the global symbol.  This enables us to give
 * informative warnings/errors when folks attempt to use symbols they did not
 * include in their build, or no symbols that no longer exist.
 *
 * We don't define this in MODULARIZE mode since in that mode emscripten symbols
 * are never placed in the global scope.
 */
function hookGlobalSymbolAccess(sym, func) {
  if (!Object.getOwnPropertyDescriptor(globalThis, sym)) {
    Object.defineProperty(globalThis, sym, {
      configurable: true,
      get() {
        func();
        return undefined;
      }
    });
  }
}

function missingGlobal(sym, msg) {
  hookGlobalSymbolAccess(sym, () => {
    warnOnce(`\`${sym}\` is no longer defined by emscripten. ${msg}`);
  });
}

missingGlobal('buffer', 'Please use HEAP8.buffer or wasmMemory.buffer');
missingGlobal('asm', 'Please use wasmExports instead');

function missingLibrarySymbol(sym) {
  hookGlobalSymbolAccess(sym, () => {
    // Can't `abort()` here because it would break code that does runtime
    // checks.  e.g. `if (typeof SDL === 'undefined')`.
    var msg = `\`${sym}\` is a library symbol and not included by default; add it to your library.js __deps or to DEFAULT_LIBRARY_FUNCS_TO_INCLUDE on the command line`;
    // DEFAULT_LIBRARY_FUNCS_TO_INCLUDE requires the name as it appears in
    // library.js, which means $name for a JS name with no prefix, or name
    // for a JS name like _name.
    var librarySymbol = sym;
    if (!librarySymbol.startsWith('_')) {
      librarySymbol = '$' + sym;
    }
    msg += ` (e.g. -sDEFAULT_LIBRARY_FUNCS_TO_INCLUDE='${librarySymbol}')`;
    if (isExportedByForceFilesystem(sym)) {
      msg += '. Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you';
    }
    warnOnce(msg);
  });

  // Any symbol that is not included from the JS library is also (by definition)
  // not exported on the Module object.
  unexportedRuntimeSymbol(sym);
}

function unexportedRuntimeSymbol(sym) {
  if (!Object.getOwnPropertyDescriptor(Module, sym)) {
    Object.defineProperty(Module, sym, {
      configurable: true,
      get() {
        var msg = `'${sym}' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the Emscripten FAQ)`;
        if (isExportedByForceFilesystem(sym)) {
          msg += '. Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you';
        }
        abort(msg);
      },
    });
  }
}

// end include: runtime_debug.js
// include: runtime_stack_check.js
const stackCookie1 = 0x02135467;
const stackCookie2 = 0x89BACDFE;

// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  var max = _emscripten_stack_get_end();
  assert((max & 3) == 0);
  // If the stack ends at address zero we write our cookies 4 bytes into the
  // stack.  This prevents interference with SAFE_HEAP and ASAN which also
  // monitor writes to address zero.
  if (max == 0) {
    max += 4;
  }
  // The stack grow downwards towards _emscripten_stack_get_end.
  // We write cookies to the final two words in the stack and detect if they are
  // ever overwritten.
  HEAPU32[((max)>>2)] = stackCookie1;
  HEAPU32[(((max)+(4))>>2)] = stackCookie2;
  // Also test the global address 0 for integrity.
  HEAPU32[((0)>>2)] = 1668509029;
}

function u32ToHexString(num) {
  return '0x' + (num >>> 0).toString(16).padStart(8, '0');
}

function checkStackCookie() {
  if (ABORT) return;
  var max = _emscripten_stack_get_end();
  // See writeStackCookie().
  if (max == 0) {
    max += 4;
  }
  var val1 = HEAPU32[((max)>>2)];
  var val2 = HEAPU32[(((max)+(4))>>2)];
  if (val1 != stackCookie1 || val2 != stackCookie2) {
    abort(`Stack overflow! Stack cookie has been overwritten at ${ptrToString(max)}, expected hex dwords ${u32ToHexString(stackCookie2)} and ${u32ToHexString(stackCookie1)}, but received ${u32ToHexString(val2)} ${u32ToHexString(val1)}`);
  }
  // Also test the global address 0 for integrity.
  if (HEAPU32[((0)>>2)] != 0x63736d65 /* 'emsc' */) {
    abort('Runtime error: The application has corrupted its heap memory area (address zero)!');
  }
}
// end include: runtime_stack_check.js
// Memory management

var runtimeInitialized = false;



// When ALLOW_MEMORY_GROWTH is enabled, the conversion from Wasm
// memory to ArrayBuffer requires some additional logic.
function getMemoryBuffer() {
  return wasmMemory.buffer;
}

function updateMemoryViews() {
  // If we already have a heap that is resizeable/growable buffer we don't
  // need to do anything in updateMemoryViews.
  if (HEAP8?.buffer?.resizable) return;
  var b = getMemoryBuffer();
  HEAP8 = new Int8Array(b);
  
  HEAPU8 = new Uint8Array(b);
  
  HEAP32 = new Int32Array(b);
  HEAPU32 = new Uint32Array(b);
  
  
  
  
}

// include: memoryprofiler.js
// end include: memoryprofiler.js
// end include: runtime_common.js
assert(globalThis.Int32Array && globalThis.Float64Array && Int32Array.prototype.subarray && Int32Array.prototype.set,
       'JS engine does not provide full typed array support');

function preRun() {
  var preRun = Module['preRun'];
  if (preRun) {
    if (typeof preRun == 'function') preRun = [preRun];
    onPreRuns.push(...preRun);
  }
  consumedModuleProp('preRun');
  // Begin ATPRERUNS hooks
  callRuntimeCallbacks(onPreRuns);
  // End ATPRERUNS hooks
}

function initRuntime() {
  assert(!runtimeInitialized);
  runtimeInitialized = true;

  checkStackCookie();

  // Begin ATINITS hooks
  if (!Module['noFSInit'] && !FS.initialized) FS.init();
TTY.init();
  // End ATINITS hooks

  wasmExports['__wasm_call_ctors']();

  // Begin ATPOSTCTORS hooks
  FS.ignorePermissions = false;
  // End ATPOSTCTORS hooks

  checkStackCookie();
}

function postRun() {
  checkStackCookie();

  var postRun = Module['postRun'];
  if (postRun) {
    if (typeof postRun == 'function') postRun = [postRun];
    onPostRuns.push(...postRun);
  }
  consumedModuleProp('postRun');

  // Begin ATPOSTRUNS hooks
  callRuntimeCallbacks(onPostRuns);
  // End ATPOSTRUNS hooks
}

/**
 * @param {string|number=} what
 */
function abort(what) {
  Module['onAbort']?.(what);

  what = `Aborted(${what})`;
  // TODO(sbc): Should we remove printing and leave it up to whoever
  // catches the exception?
  err(what);

  ABORT = true;

  // Use a wasm runtime error, because a JS error might be seen as a foreign
  // exception, which means we'd run destructors on it. We need the error to
  // simply make the program stop.
  // FIXME This approach does not work in Wasm EH because it currently does not assume
  // all RuntimeErrors are from traps; it decides whether a RuntimeError is from
  // a trap or not based on a hidden field within the object. So at the moment
  // we don't have a way of throwing a wasm trap from JS. TODO Make a JS API that
  // allows this in the wasm spec.

  // Suppress closure compiler warning here. Closure compiler's builtin extern
  // definition for WebAssembly.RuntimeError claims it takes no arguments even
  // though it can.
  // TODO(https://github.com/google/closure-compiler/pull/3913): Remove if/when upstream closure gets fixed.
  /** @suppress {checkTypes} */
  var e = new WebAssembly.RuntimeError(what);

  // Throw the error whether or not MODULARIZE is set because abort is used
  // in code paths apart from instantiation where an exception is expected
  // to be thrown when abort is called.
  throw e;
}

function createExportWrapper(name, func, nargs) {
  assert(func);
  return (...args) => {
    assert(runtimeInitialized, `native function \`${name}\` called before runtime initialization`);
    // Only assert for too many arguments. Too few can be valid since the missing arguments will be zero filled.
    assert(args.length <= nargs, `native function \`${name}\` called with ${args.length} args but expects ${nargs}`);
    return func(...args);
  };
}

var wasmBinaryFile;

function findWasmBinary() {
  return locateFile('index.wasm');
}

function getBinarySync(file) {
  if (readBinary) {
    return readBinary(file);
  }
  // Throwing a plain string here, even though it not normally advisable since
  // this gets turning into an `abort` in instantiateArrayBuffer.
  throw 'both async and sync fetching of the wasm failed';
}

async function getWasmBinary(binaryFile) {
  // If we don't have the binary yet, load it asynchronously using readAsync.
  if (!wasmBinary) {
    // Fetch the binary using readAsync
    try {
      var response = await readAsync(binaryFile);
      return new Uint8Array(response);
    } catch {
      // Fall back to getBinarySync below;
    }
  }

  // Otherwise, getBinarySync should be able to get it synchronously
  return getBinarySync(binaryFile);
}

async function instantiateArrayBuffer(binaryFile, imports) {
  try {
    var binary = await getWasmBinary(binaryFile);
    var instance = await WebAssembly.instantiate(binary, imports);
    return instance;
  } catch (reason) {
    err(`failed to asynchronously prepare wasm: ${reason}`);

    // Warn on some common problems.
    if (isFileURI(binaryFile)) {
      err(`warning: Loading from a file URI (${binaryFile}) is not supported in most browsers. See https://emscripten.org/docs/getting_started/FAQ.html#how-do-i-run-a-local-webserver-for-testing-why-does-my-program-stall-in-downloading-or-preparing`);
    }
    abort(reason);
  }
}

async function instantiateAsync(binary, binaryFile, imports) {
  if (!binary
      // Don't use streaming for file:// delivered objects in a webview, fetch them synchronously.
      && !isFileURI(binaryFile)
      // Avoid using instantiateStreaming() on Node.js since the `fetch()` API
      // does not support `file://` URLs.
      // See: https://github.com/emscripten-core/emscripten/pull/16917
      && !ENVIRONMENT_IS_NODE
     ) {
    try {
      var response = fetch(binaryFile, { credentials: 'same-origin' });
      var instantiationResult = await WebAssembly.instantiateStreaming(response, imports);
      return instantiationResult;
    } catch (reason) {
      // We expect the most common failure cause to be a bad MIME type for the binary,
      // in which case falling back to ArrayBuffer instantiation should work.
      err(`wasm streaming compile failed: ${reason}`);
      err('falling back to ArrayBuffer instantiation');
      // fall back of instantiateArrayBuffer below
    };
  }
  return instantiateArrayBuffer(binaryFile, imports);
}

function getWasmImports() {
  // prepare imports
  var imports = {
    'env': wasmImports,
    'wasi_snapshot_preview1': wasmImports,
  };
  return imports;
}

// Create the wasm instance.
// Receives the wasm imports, returns the exports.
async function createWasm() {
  // Load the wasm module and create an instance of using native support in the JS engine.
  // handle a generated wasm instance, receiving its exports and
  // performing other necessary setup
  function receiveInstance(instance) {
    wasmExports = instance.exports;

    assignWasmExports(wasmExports);

    updateMemoryViews();

    return wasmExports;
  }

  // Prefer streaming instantiation if available.
  // Async compilation can be confusing when an error on the page overwrites Module
  // (for example, if the order of elements is wrong, and the one defining Module is
  // later), so we save Module and check it later.
  var trueModule = Module;
  function receiveInstantiationResult(result) {
    // 'result' is a ResultObject object which has both the module and instance.
    // receiveInstance() will swap in the exports (to Module.asm) so they can be called
    assert(Module === trueModule, 'the Module object should not be replaced during async compilation - perhaps the order of HTML elements is wrong?');
    trueModule = null;
    // TODO: Due to Closure regression https://github.com/google/closure-compiler/issues/3193, the above line no longer optimizes out down to the following line.
    // When the regression is fixed, can restore the above PTHREADS-enabled path.
    return receiveInstance(result['instance']);
  }

  var info = getWasmImports();

  // User shell pages can write their own Module.instantiateWasm = function(imports, successCallback) callback
  // to manually instantiate the Wasm module themselves. This allows pages to
  // run the instantiation parallel to any other async startup actions they are
  // performing.
  // Also pthreads and wasm workers initialize the wasm instance through this
  // path.
  var instantiateWasm = Module['instantiateWasm'];
  if (instantiateWasm) {
    return new Promise((resolve) => {
      try {
        instantiateWasm(info, (inst) => resolve(receiveInstance(inst)));
      } catch(e) {
        err(`Module.instantiateWasm callback failed with error: ${e}`);
        throw e;
      }
    });
  }

  wasmBinaryFile ??= findWasmBinary();
  var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info);
  var exports = receiveInstantiationResult(result);
  return exports;
}

// end include: preamble.js

// Begin JS library code


  class ExitStatus {
      name = 'ExitStatus';
      constructor(status) {
        this.message = `Program terminated with exit(${status})`;
        this.status = status;
      }
    }

  /** @type {!Int32Array} */
  var HEAP32;

  /** @type {!Int8Array} */
  var HEAP8;

  /** @type {!Uint32Array} */
  var HEAPU32;

  var callRuntimeCallbacks = (callbacks) => {
      while (callbacks.length > 0) {
        // Pass the module as the first argument.
        callbacks.shift()(Module);
      }
    };
  var onPostRuns = [];
  var addOnPostRun = (cb) => onPostRuns.push(cb);

  var onPreRuns = [];
  var addOnPreRun = (cb) => onPreRuns.push(cb);


  var noExitRuntime = true;

  function ptrToString(ptr) {
      assert(typeof ptr === 'number', `ptrToString expects a number, got ${typeof ptr}`);
      // Convert to 32-bit unsigned value
      ptr >>>= 0;
      return '0x' + ptr.toString(16).padStart(8, '0');
    }

  var stackRestore = (val) => __emscripten_stack_restore(val);

  var stackSave = () => _emscripten_stack_get_current();

  var warnOnce = (text) => {
      warnOnce.shown ||= {};
      if (!warnOnce.shown[text]) {
        warnOnce.shown[text] = 1;
        if (ENVIRONMENT_IS_NODE) text = 'warning: ' + text;
        err(text);
      }
    };

  

  var initRandomFill = () => {
      // This block is not needed on v19+ since crypto.getRandomValues is builtin
      if (ENVIRONMENT_IS_NODE) {
        var nodeCrypto = require('node:crypto');
        return (view) => (nodeCrypto.randomFillSync(view), 0);
      }
  
      return (view) => (crypto.getRandomValues(view), 0);
    };
  var randomFill = (view) => (randomFill = initRandomFill())(view);
  
  var PATH = {
  isAbs:(path) => path.charAt(0) === '/',
  splitPath:(filename) => {
        var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
        return splitPathRe.exec(filename).slice(1);
      },
  normalizeArray:(parts, allowAboveRoot) => {
        // if the path tries to go above the root, `up` ends up > 0
        var up = 0;
        for (var i = parts.length - 1; i >= 0; i--) {
          var last = parts[i];
          if (last === '.') {
            parts.splice(i, 1);
          } else if (last === '..') {
            parts.splice(i, 1);
            up++;
          } else if (up) {
            parts.splice(i, 1);
            up--;
          }
        }
        // if the path is allowed to go above the root, restore leading ..s
        if (allowAboveRoot) {
          for (; up; up--) {
            parts.unshift('..');
          }
        }
        return parts;
      },
  normalize:(path) => {
        var isAbsolute = PATH.isAbs(path),
            trailingSlash = path.slice(-1) === '/';
        // Normalize the path
        path = PATH.normalizeArray(path.split('/').filter((p) => !!p), !isAbsolute).join('/');
        if (!path && !isAbsolute) {
          path = '.';
        }
        if (path && trailingSlash) {
          path += '/';
        }
        return (isAbsolute ? '/' : '') + path;
      },
  dirname:(path) => {
        var result = PATH.splitPath(path),
            root = result[0],
            dir = result[1];
        if (!root && !dir) {
          // No dirname whatsoever
          return '.';
        }
        if (dir) {
          // It has a dirname, strip trailing slash
          dir = dir.slice(0, -1);
        }
        return root + dir;
      },
  basename:(path) => path && path.match(/([^\/]+|\/)\/*$/)[1],
join:(...paths) => PATH.normalize(paths.join('/')),
join2:(l, r) => PATH.normalize(l + '/' + r),
};


var PATH_FS = {
resolve:(...args) => {
      var resolvedPath = '',
        resolvedAbsolute = false;
      for (var i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {
        var path = (i >= 0) ? args[i] : FS.cwd();
        // Skip empty and invalid entries
        if (typeof path != 'string') {
          throw new TypeError('Arguments to path.resolve must be strings');
        } else if (!path) {
          return ''; // an invalid portion invalidates the whole thing
        }
        resolvedPath = path + '/' + resolvedPath;
        resolvedAbsolute = PATH.isAbs(path);
      }
      // At this point the path should be resolved to a full absolute path, but
      // handle relative paths to be safe (might happen when process.cwd() fails)
      resolvedPath = PATH.normalizeArray(resolvedPath.split('/').filter((p) => !!p), !resolvedAbsolute).join('/');
      return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
    },
relative:(from, to) => {
      from = PATH_FS.resolve(from).slice(1);
      to = PATH_FS.resolve(to).slice(1);
      function trim(arr) {
        var start = 0;
        for (; start < arr.length; start++) {
          if (arr[start] !== '') break;
        }
        var end = arr.length - 1;
        for (; end >= 0; end--) {
          if (arr[end] !== '') break;
        }
        if (start > end) return [];
        return arr.slice(start, end - start + 1);
      }
      var fromParts = trim(from.split('/'));
      var toParts = trim(to.split('/'));
      var length = Math.min(fromParts.length, toParts.length);
      var samePartsLength = length;
      for (var i = 0; i < length; i++) {
        if (fromParts[i] !== toParts[i]) {
          samePartsLength = i;
          break;
        }
      }
      var outputParts = [];
      for (var i = samePartsLength; i < fromParts.length; i++) {
        outputParts.push('..');
      }
      outputParts = outputParts.concat(toParts.slice(samePartsLength));
      return outputParts.join('/');
    },
};


var UTF8Decoder = globalThis.TextDecoder && new TextDecoder();


  /**
   * heapOrArray is either a regular array, or a JavaScript typed array view.
   * @param {number} idx
   * @param {number=} maxBytesToRead
   * @param {boolean=} ignoreNul
   * @return {number}
   */
  var findStringEnd = (heapOrArray, idx, maxBytesToRead, ignoreNul) => {
      var maxIdx = idx + maxBytesToRead;
      if (ignoreNul) return maxIdx;
      // TextDecoder needs to know the byte length in advance, it doesn't stop on
      // null terminator by itself.
      // As a tiny code save trick, compare idx against maxIdx using a negation,
      // so that maxBytesToRead=undefined/NaN means Infinity.
      while (heapOrArray[idx] && !(idx >= maxIdx)) ++idx;
      return idx;
    };
  
  
    /**
   * Given a pointer 'idx' to a null-terminated UTF8-encoded string in the given
   * array that contains uint8 values, returns a copy of that string as a
   * Javascript String object.
   * heapOrArray is either a regular array, or a JavaScript typed array view.
   * @param {number=} idx
   * @param {number=} maxBytesToRead
   * @param {boolean=} ignoreNul - If true, the function will not stop on a NUL character.
   * @return {string}
   */
  var UTF8ArrayToString = (heapOrArray, idx = 0, maxBytesToRead, ignoreNul) => {
  
      var endPtr = findStringEnd(heapOrArray, idx, maxBytesToRead, ignoreNul);
  
      // When using conditional TextDecoder, skip it for short strings as the overhead of the native call is not worth it.
      if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
        return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
      }
      var str = '';
      while (idx < endPtr) {
        // For UTF8 byte structure, see:
        // http://en.wikipedia.org/wiki/UTF-8#Description
        // https://www.ietf.org/rfc/rfc2279.txt
        // https://tools.ietf.org/html/rfc3629
        var u0 = heapOrArray[idx++];
        if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
        var u1 = heapOrArray[idx++] & 63;
        if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
        var u2 = heapOrArray[idx++] & 63;
        if ((u0 & 0xF0) == 0xE0) {
          u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
        } else {
          if ((u0 & 0xF8) != 0xF0) warnOnce(`Invalid UTF-8 leading byte ${ptrToString(u0)} encountered when deserializing a UTF-8 string in wasm memory to a JS string!`);
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (heapOrArray[idx++] & 63);
        }
  
        if (u0 < 0x10000) {
          str += String.fromCharCode(u0);
        } else {
          var ch = u0 - 0x10000;
          str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
        }
      }
      return str;
    };
  
  var FS_stdin_getChar_buffer = [];
  
  var lengthBytesUTF8 = (str) => {
      var len = 0;
      for (var i = 0; i < str.length; ++i) {
        // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code
        // unit, not a Unicode code point of the character! So decode
        // UTF16->UTF32->UTF8.
        // See http://unicode.org/faq/utf_bom.html#utf16-3
        var c = str.charCodeAt(i); // possibly a lead surrogate
        if (c <= 0x7F) {
          len++;
        } else if (c <= 0x7FF) {
          len += 2;
        } else if (c >= 0xD800 && c <= 0xDFFF) {
          len += 4; ++i;
        } else {
          len += 3;
        }
      }
      return len;
    };
  
  var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
      assert(typeof str === 'string', `stringToUTF8Array expects a string (got ${typeof str})`);
      // Parameter maxBytesToWrite is not optional. Negative values, 0, null,
      // undefined and false each don't write out any bytes.
      if (!(maxBytesToWrite > 0))
        return 0;
  
      var startIdx = outIdx;
      var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
      for (var i = 0; i < str.length; ++i) {
        // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description
        // and https://www.ietf.org/rfc/rfc2279.txt
        // and https://tools.ietf.org/html/rfc3629
        var u = str.codePointAt(i);
        if (u <= 0x7F) {
          if (outIdx >= endIdx) break;
          heap[outIdx++] = u;
        } else if (u <= 0x7FF) {
          if (outIdx + 1 >= endIdx) break;
          heap[outIdx++] = 0xC0 | (u >> 6);
          heap[outIdx++] = 0x80 | (u & 63);
        } else if (u <= 0xFFFF) {
          if (outIdx + 2 >= endIdx) break;
          heap[outIdx++] = 0xE0 | (u >> 12);
          heap[outIdx++] = 0x80 | ((u >> 6) & 63);
          heap[outIdx++] = 0x80 | (u & 63);
        } else {
          if (outIdx + 3 >= endIdx) break;
          if (u > 0x10FFFF) warnOnce(`Invalid Unicode code point ${ptrToString(u)} encountered when serializing a JS string to a UTF-8 string in wasm memory! (Valid unicode code points should be in range 0-0x10FFFF).`);
          heap[outIdx++] = 0xF0 | (u >> 18);
          heap[outIdx++] = 0x80 | ((u >> 12) & 63);
          heap[outIdx++] = 0x80 | ((u >> 6) & 63);
          heap[outIdx++] = 0x80 | (u & 63);
          // Gotcha: if codePoint is over 0xFFFF, it is represented as a surrogate pair in UTF-16.
          // We need to manually skip over the second code unit for correct iteration.
          i++;
        }
      }
      // Null-terminate the pointer to the buffer.
      heap[outIdx] = 0;
      return outIdx - startIdx;
    };
  /** @type {function(string, boolean=, number=)} */
  var intArrayFromString = (stringy, dontAddNull, length) => {
      var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
      var u8array = new Array(len);
      var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
      if (dontAddNull) u8array.length = numBytesWritten;
      return u8array;
    };
  var FS_stdin_getChar = () => {
      if (!FS_stdin_getChar_buffer.length) {
        var result = null;
        if (ENVIRONMENT_IS_NODE) {
          // we will read data by chunks of BUFSIZE
          var BUFSIZE = 256;
          var buf = Buffer.alloc(BUFSIZE);
          var bytesRead = 0;
  
          // For some reason we must suppress a closure warning here, even though
          // fd definitely exists on process.stdin, and is even the proper way to
          // get the fd of stdin,
          // https://github.com/nodejs/help/issues/2136#issuecomment-523649904
          // This started to happen after moving this logic out of library_tty.js,
          // so it is related to the surrounding code in some unclear manner.
          /** @suppress {missingProperties} */
          var fd = process.stdin.fd;
  
          try {
            bytesRead = fs.readSync(fd, buf, 0, BUFSIZE);
          } catch(e) {
            // Cross-platform differences: on Windows, reading EOF throws an
            // exception, but on other OSes, reading EOF returns 0. Uniformize
            // behavior by treating the EOF exception to return 0.
            if (e.toString().includes('EOF')) bytesRead = 0;
            else throw e;
          }
  
          if (bytesRead > 0) {
            result = buf.slice(0, bytesRead).toString('utf-8');
          }
        } else
        if (globalThis.window?.prompt) {
          // Browser.
          result = window.prompt('Input: ');  // returns null on cancel
          if (result !== null) {
            result += '\n';
          }
        } else
        {}
        if (!result) {
          return null;
        }
        FS_stdin_getChar_buffer = intArrayFromString(result, true);
      }
      return FS_stdin_getChar_buffer.shift();
    };
  var TTY = {
  ttys:[],
  init() {
        // https://github.com/emscripten-core/emscripten/pull/1555
        // if (ENVIRONMENT_IS_NODE) {
        //   // currently, FS.init does not distinguish if process.stdin is a file or TTY
        //   // device, it always assumes it's a TTY device. because of this, we're forcing
        //   // process.stdin to UTF8 encoding to at least make stdin reading compatible
        //   // with text files until FS.init can be refactored.
        //   process.stdin.setEncoding('utf8');
        // }
      },
  shutdown() {
        // https://github.com/emscripten-core/emscripten/pull/1555
        // if (ENVIRONMENT_IS_NODE) {
        //   // inolen: any idea as to why node -e 'process.stdin.read()' wouldn't exit immediately (with process.stdin being a tty)?
        //   // isaacs: because now it's reading from the stream, you've expressed interest in it, so that read() kicks off a _read() which creates a ReadReq operation
        //   // inolen: I thought read() in that case was a synchronous operation that just grabbed some amount of buffered data if it exists?
        //   // isaacs: it is. but it also triggers a _read() call, which calls readStart() on the handle
        //   // isaacs: do process.stdin.pause() and i'd think it'd probably close the pending call
        //   process.stdin.pause();
        // }
      },
  register(dev, ops) {
        TTY.ttys[dev] = { input: [], output: [], ops: ops };
        FS.registerDevice(dev, TTY.stream_ops);
      },
  stream_ops:{
  open(stream) {
          var tty = TTY.ttys[stream.node.rdev];
          if (!tty) {
            throw new FS.ErrnoError(43);
          }
          stream.tty = tty;
          stream.seekable = false;
        },
  close(stream) {
          // flush any pending line data
          stream.tty.ops.fsync(stream.tty);
        },
  fsync(stream) {
          stream.tty.ops.fsync(stream.tty);
        },
  read(stream, buffer, offset, length, pos /* ignored */) {
          if (!stream.tty || !stream.tty.ops.get_char) {
            throw new FS.ErrnoError(60);
          }
          var bytesRead = 0;
          for (var i = 0; i < length; i++) {
            var result;
            try {
              result = stream.tty.ops.get_char(stream.tty);
            } catch (e) {
              throw new FS.ErrnoError(29);
            }
            if (result === undefined && !bytesRead) {
              throw new FS.ErrnoError(6);
            }
            if (result === null || result === undefined) break;
            bytesRead++;
            buffer[offset+i] = result;
            // We currently only support canonical mode (ICANON), where
            // read(2) returns as soon as a line delimiter is read.
            if (result === 10) break;
          }
          if (bytesRead) {
            stream.node.atime = Date.now();
          }
          return bytesRead;
        },
  write(stream, buffer, offset, length, pos) {
          if (!stream.tty || !stream.tty.ops.put_char) {
            throw new FS.ErrnoError(60);
          }
          try {
            for (var i = 0; i < length; i++) {
              stream.tty.ops.put_char(stream.tty, buffer[offset+i]);
            }
          } catch (e) {
            throw new FS.ErrnoError(29);
          }
          if (length) {
            stream.node.mtime = stream.node.ctime = Date.now();
          }
          return i;
        },
  },
  default_tty_ops:{
  get_char(tty) {
          return FS_stdin_getChar();
        },
  put_char(tty, val) {
          if (val === null || val === 10) {
            out(UTF8ArrayToString(tty.output));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val); // val == 0 would cut text output off in the middle.
          }
        },
  fsync(tty) {
          if (tty.output?.length > 0) {
            out(UTF8ArrayToString(tty.output));
            tty.output = [];
          }
        },
  ioctl_tcgets(tty) {
          // typical setting
          return {
            c_iflag: 25856,
            c_oflag: 5,
            c_cflag: 191,
            c_lflag: 35387,
            c_cc: [
              0x03, 0x1c, 0x7f, 0x15, 0x04, 0x00, 0x01, 0x00, 0x11, 0x13, 0x1a, 0x00,
              0x12, 0x0f, 0x17, 0x16, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
              0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            ]
          };
        },
  ioctl_tcsets(tty, optional_actions, data) {
          // currently just ignore
          return 0;
        },
  ioctl_tiocgwinsz(tty) {
          return [24, 80];
        },
  },
  default_tty1_ops:{
  put_char(tty, val) {
          if (val === null || val === 10) {
            err(UTF8ArrayToString(tty.output));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val);
          }
        },
  fsync(tty) {
          if (tty.output?.length > 0) {
            err(UTF8ArrayToString(tty.output));
            tty.output = [];
          }
        },
  },
  };
  
  
  var mmapAlloc = (size) => {
      abort('internal error: mmapAlloc called but `emscripten_builtin_memalign` native symbol not exported');
    };
  
  var MEMFS = {
  ops_table:null,
  mount(mount) {
        return MEMFS.createNode(null, '/', 16895, 0);
      },
  createNode(parent, name, mode, dev) {
        if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
          // not supported
          throw new FS.ErrnoError(63);
        }
        MEMFS.ops_table ||= {
          dir: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr,
              lookup: MEMFS.node_ops.lookup,
              mknod: MEMFS.node_ops.mknod,
              rename: MEMFS.node_ops.rename,
              unlink: MEMFS.node_ops.unlink,
              rmdir: MEMFS.node_ops.rmdir,
              readdir: MEMFS.node_ops.readdir,
              symlink: MEMFS.node_ops.symlink
            },
            stream: {
              llseek: MEMFS.stream_ops.llseek
            }
          },
          file: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr
            },
            stream: {
              llseek: MEMFS.stream_ops.llseek,
              read: MEMFS.stream_ops.read,
              write: MEMFS.stream_ops.write,
              mmap: MEMFS.stream_ops.mmap,
              msync: MEMFS.stream_ops.msync
            }
          },
          link: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr,
              readlink: MEMFS.node_ops.readlink
            },
            stream: {}
          },
          chrdev: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr
            },
            stream: FS.chrdev_stream_ops
          }
        };
        var node = FS.createNode(parent, name, mode, dev);
        if (FS.isDir(node.mode)) {
          node.node_ops = MEMFS.ops_table.dir.node;
          node.stream_ops = MEMFS.ops_table.dir.stream;
          node.contents = {};
        } else if (FS.isFile(node.mode)) {
          node.node_ops = MEMFS.ops_table.file.node;
          node.stream_ops = MEMFS.ops_table.file.stream;
          // The actual number of bytes used in the typed array, as opposed to
          // contents.length which gives the whole capacity.
          node.usedBytes = 0;
          // The byte data of the file is stored in a typed array.
          // Note: typed arrays are not resizable like normal JS arrays are, so
          // there is a small penalty involved for appending file writes that
          // continuously grow a file similar to std::vector capacity vs used.
          node.contents = MEMFS.emptyFileContents ??= new Uint8Array(0);
        } else if (FS.isLink(node.mode)) {
          node.node_ops = MEMFS.ops_table.link.node;
          node.stream_ops = MEMFS.ops_table.link.stream;
        } else if (FS.isChrdev(node.mode)) {
          node.node_ops = MEMFS.ops_table.chrdev.node;
          node.stream_ops = MEMFS.ops_table.chrdev.stream;
        }
        node.atime = node.mtime = node.ctime = Date.now();
        // add the new node to the parent
        if (parent) {
          parent.contents[name] = node;
          parent.atime = parent.mtime = parent.ctime = node.atime;
        }
        return node;
      },
  getFileDataAsTypedArray(node) {
        assert(FS.isFile(node.mode), 'getFileDataAsTypedArray called on non-file');
        return node.contents.subarray(0, node.usedBytes); // Make sure to not return excess unused bytes.
      },
  expandFileStorage(node, newCapacity) {
        var prevCapacity = node.contents.length;
        if (prevCapacity >= newCapacity) return; // No need to expand, the storage was already large enough.
        // Don't expand strictly to the given requested limit if it's only a very
        // small increase, but instead geometrically grow capacity.
        // For small filesizes (<1MB), perform size*2 geometric increase, but for
        // large sizes, do a much more conservative size*1.125 increase to avoid
        // overshooting the allocation cap by a very large margin.
        var CAPACITY_DOUBLING_MAX = 1024 * 1024;
        newCapacity = Math.max(newCapacity, (prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2.0 : 1.125)) >>> 0);
        if (prevCapacity) newCapacity = Math.max(newCapacity, 256); // At minimum allocate 256b for each file when expanding.
        var oldContents = MEMFS.getFileDataAsTypedArray(node);
        node.contents = new Uint8Array(newCapacity); // Allocate new storage.
        node.contents.set(oldContents);
      },
  resizeFileStorage(node, newSize) {
        if (node.usedBytes == newSize) return;
        var oldContents = node.contents;
        node.contents = new Uint8Array(newSize); // Allocate new storage.
        node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes))); // Copy old data over to the new storage.
        node.usedBytes = newSize;
      },
  node_ops:{
  getattr(node) {
          var attr = {};
          // device numbers reuse inode numbers.
          attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
          attr.ino = node.id;
          attr.mode = node.mode;
          attr.nlink = 1;
          attr.uid = 0;
          attr.gid = 0;
          attr.rdev = node.rdev;
          if (FS.isDir(node.mode)) {
            attr.size = 4096;
          } else if (FS.isFile(node.mode)) {
            attr.size = node.usedBytes;
          } else if (FS.isLink(node.mode)) {
            attr.size = node.link.length;
          } else {
            attr.size = 0;
          }
          attr.atime = new Date(node.atime);
          attr.mtime = new Date(node.mtime);
          attr.ctime = new Date(node.ctime);
          // NOTE: In our implementation, st_blocks = Math.ceil(st_size/st_blksize),
          //       but this is not required by the standard.
          attr.blksize = 4096;
          attr.blocks = Math.ceil(attr.size / attr.blksize);
          return attr;
        },
  setattr(node, attr) {
          for (const key of ['mode', 'atime', 'mtime', 'ctime']) {
            if (attr[key] != null) {
              node[key] = attr[key];
            }
          }
          if (attr.size !== undefined) {
            MEMFS.resizeFileStorage(node, attr.size);
          }
        },
  lookup(parent, name) {
          throw new FS.ErrnoError(44);
        },
  mknod(parent, name, mode, dev) {
          return MEMFS.createNode(parent, name, mode, dev);
        },
  rename(old_node, new_dir, new_name) {
          var new_node;
          try {
            new_node = FS.lookupNode(new_dir, new_name);
          } catch (e) {}
          if (new_node) {
            if (FS.isDir(old_node.mode)) {
              // if we're overwriting a directory at new_name, make sure it's empty.
              for (var i in new_node.contents) {
                throw new FS.ErrnoError(55);
              }
            }
            FS.hashRemoveNode(new_node);
          }
          // do the internal rewiring
          delete old_node.parent.contents[old_node.name];
          new_dir.contents[new_name] = old_node;
          old_node.name = new_name;
          new_dir.ctime = new_dir.mtime = old_node.parent.ctime = old_node.parent.mtime = Date.now();
        },
  unlink(parent, name) {
          delete parent.contents[name];
          parent.ctime = parent.mtime = Date.now();
        },
  rmdir(parent, name) {
          var node = FS.lookupNode(parent, name);
          for (var i in node.contents) {
            throw new FS.ErrnoError(55);
          }
          delete parent.contents[name];
          parent.ctime = parent.mtime = Date.now();
        },
  readdir(node) {
          return ['.', '..', ...Object.keys(node.contents)];
        },
  symlink(parent, newname, oldpath) {
          var node = MEMFS.createNode(parent, newname, 0o777 | 40960, 0);
          node.link = oldpath;
          return node;
        },
  readlink(node) {
          if (!FS.isLink(node.mode)) {
            throw new FS.ErrnoError(28);
          }
          return node.link;
        },
  },
  stream_ops:{
  read(stream, buffer, offset, length, position) {
          var contents = stream.node.contents;
          if (position >= stream.node.usedBytes) return 0;
          var size = Math.min(stream.node.usedBytes - position, length);
          assert(size >= 0);
          buffer.set(contents.subarray(position, position + size), offset);
          return size;
        },
  write(stream, buffer, offset, length, position, canOwn) {
          assert(buffer.subarray, 'FS.write expects a TypedArray');
          // If the buffer is located in main memory (HEAP), and if
          // memory can grow, we can't hold on to references of the
          // memory buffer, as they may get invalidated. That means we
          // need to copy its contents.
          if (buffer.buffer === HEAP8.buffer) {
            canOwn = false;
          }
  
          if (!length) return 0;
          var node = stream.node;
          node.mtime = node.ctime = Date.now();
  
          if (canOwn) {
            assert(!position, 'canOwn must imply no weird position inside the file');
            node.contents = buffer.subarray(offset, offset + length);
            node.usedBytes = length;
          } else if (!node.usedBytes && !position) { // If this is a simple first write to an empty file, do a fast set since we don't need to care about old data.
            node.contents = buffer.slice(offset, offset + length);
            node.usedBytes = length;
          } else {
            MEMFS.expandFileStorage(node, position+length);
            // Use typed array write which is available.
            node.contents.set(buffer.subarray(offset, offset + length), position);
            node.usedBytes = Math.max(node.usedBytes, position + length);
          }
          return length;
        },
  llseek(stream, offset, whence) {
          var position = offset;
          if (whence === 1) {
            position += stream.position;
          } else if (whence === 2) {
            if (FS.isFile(stream.node.mode)) {
              position += stream.node.usedBytes;
            }
          }
          if (position < 0) {
            throw new FS.ErrnoError(28);
          }
          return position;
        },
  mmap(stream, length, position, prot, flags) {
          if (!FS.isFile(stream.node.mode)) {
            throw new FS.ErrnoError(43);
          }
          var ptr;
          var allocated;
          var contents = stream.node.contents;
          // Only make a new copy when MAP_PRIVATE is specified.
          if (!(flags & 2) && contents.buffer === HEAP8.buffer) {
            // We can't emulate MAP_SHARED when the file is not backed by the
            // buffer we're mapping to (e.g. the HEAP buffer).
            allocated = false;
            ptr = contents.byteOffset;
          } else {
            allocated = true;
            ptr = mmapAlloc(length);
            if (!ptr) {
              throw new FS.ErrnoError(48);
            }
            if (contents) {
              // Try to avoid unnecessary slices.
              if (position > 0 || position + length < contents.length) {
                if (contents.subarray) {
                  contents = contents.subarray(position, position + length);
                } else {
                  contents = Array.prototype.slice.call(contents, position, position + length);
                }
              }
              HEAP8.set(contents, ptr);
            }
          }
          return { ptr, allocated };
        },
  msync(stream, buffer, offset, length, mmapFlags) {
          MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
          // should we check if bytesWritten and length are the same?
          return 0;
        },
  },
  };
  
  var FS_modeStringToFlags = (str) => {
      if (typeof str != 'string') return str;
      var flagModes = {
        'r': 0,
        'r+': 2,
        'w': 512 | 64 | 1,
        'w+': 512 | 64 | 2,
        'a': 1024 | 64 | 1,
        'a+': 1024 | 64 | 2,
      };
      var flags = flagModes[str];
      if (typeof flags == 'undefined') {
        throw new Error(`Unknown file open mode: ${str}`);
      }
      return flags;
    };
  
  var FS_fileDataToTypedArray = (data) => {
      if (typeof data == 'string') {
        data = intArrayFromString(data, true);
      }
      if (!data.subarray) {
        data = new Uint8Array(data);
      }
      return data;
    };
  
  var FS_getMode = (canRead, canWrite) => {
      var mode = 0;
      if (canRead) mode |= 292 | 73;
      if (canWrite) mode |= 146;
      return mode;
    };
  
  
  
  
  /** @type {!Uint8Array} */
  var HEAPU8;
  
    /**
   * Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the
   * emscripten HEAP, returns a copy of that string as a Javascript String object.
   *
   * @param {number} ptr
   * @param {number=} maxBytesToRead - An optional length that specifies the
   *   maximum number of bytes to read. You can omit this parameter to scan the
   *   string until the first 0 byte. If maxBytesToRead is passed, and the string
   *   at [ptr, ptr+maxBytesToReadr[ contains a null byte in the middle, then the
   *   string will cut short at that byte index.
   * @param {boolean=} ignoreNul - If true, the function will not stop on a NUL character.
   * @return {string}
   */
  var UTF8ToString = (ptr, maxBytesToRead, ignoreNul) => {
      assert(typeof ptr == 'number', `UTF8ToString expects a number (got ${typeof ptr})`);
      return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead, ignoreNul) : '';
    };
  
  var strError = (errno) => UTF8ToString(_strerror(errno));
  
  var ERRNO_CODES = {
      'EPERM': 63,
      'ENOENT': 44,
      'ESRCH': 71,
      'EINTR': 27,
      'EIO': 29,
      'ENXIO': 60,
      'E2BIG': 1,
      'ENOEXEC': 45,
      'EBADF': 8,
      'ECHILD': 12,
      'EAGAIN': 6,
      'EWOULDBLOCK': 6,
      'ENOMEM': 48,
      'EACCES': 2,
      'EFAULT': 21,
      'ENOTBLK': 105,
      'EBUSY': 10,
      'EEXIST': 20,
      'EXDEV': 75,
      'ENODEV': 43,
      'ENOTDIR': 54,
      'EISDIR': 31,
      'EINVAL': 28,
      'ENFILE': 41,
      'EMFILE': 33,
      'ENOTTY': 59,
      'ETXTBSY': 74,
      'EFBIG': 22,
      'ENOSPC': 51,
      'ESPIPE': 70,
      'EROFS': 69,
      'EMLINK': 34,
      'EPIPE': 64,
      'EDOM': 18,
      'ERANGE': 68,
      'ENOMSG': 49,
      'EIDRM': 24,
      'ECHRNG': 106,
      'EL2NSYNC': 156,
      'EL3HLT': 107,
      'EL3RST': 108,
      'ELNRNG': 109,
      'EUNATCH': 110,
      'ENOCSI': 111,
      'EL2HLT': 112,
      'EDEADLK': 16,
      'ENOLCK': 46,
      'EBADE': 113,
      'EBADR': 114,
      'EXFULL': 115,
      'ENOANO': 104,
      'EBADRQC': 103,
      'EBADSLT': 102,
      'EDEADLOCK': 16,
      'EBFONT': 101,
      'ENOSTR': 100,
      'ENODATA': 116,
      'ETIME': 117,
      'ENOSR': 118,
      'ENONET': 119,
      'ENOPKG': 120,
      'EREMOTE': 121,
      'ENOLINK': 47,
      'EADV': 122,
      'ESRMNT': 123,
      'ECOMM': 124,
      'EPROTO': 65,
      'EMULTIHOP': 36,
      'EDOTDOT': 125,
      'EBADMSG': 9,
      'ENOTUNIQ': 126,
      'EBADFD': 127,
      'EREMCHG': 128,
      'ELIBACC': 129,
      'ELIBBAD': 130,
      'ELIBSCN': 131,
      'ELIBMAX': 132,
      'ELIBEXEC': 133,
      'ENOSYS': 52,
      'ENOTEMPTY': 55,
      'ENAMETOOLONG': 37,
      'ELOOP': 32,
      'EOPNOTSUPP': 138,
      'EPFNOSUPPORT': 139,
      'ECONNRESET': 15,
      'ENOBUFS': 42,
      'EAFNOSUPPORT': 5,
      'EPROTOTYPE': 67,
      'ENOTSOCK': 57,
      'ENOPROTOOPT': 50,
      'ESHUTDOWN': 140,
      'ECONNREFUSED': 14,
      'EADDRINUSE': 3,
      'ECONNABORTED': 13,
      'ENETUNREACH': 40,
      'ENETDOWN': 38,
      'ETIMEDOUT': 73,
      'EHOSTDOWN': 142,
      'EHOSTUNREACH': 23,
      'EINPROGRESS': 26,
      'EALREADY': 7,
      'EDESTADDRREQ': 17,
      'EMSGSIZE': 35,
      'EPROTONOSUPPORT': 66,
      'ESOCKTNOSUPPORT': 137,
      'EADDRNOTAVAIL': 4,
      'ENETRESET': 39,
      'EISCONN': 30,
      'ENOTCONN': 53,
      'ETOOMANYREFS': 141,
      'EUSERS': 136,
      'EDQUOT': 19,
      'ESTALE': 72,
      'ENOTSUP': 138,
      'ENOMEDIUM': 148,
      'EILSEQ': 25,
      'EOVERFLOW': 61,
      'ECANCELED': 11,
      'ENOTRECOVERABLE': 56,
      'EOWNERDEAD': 62,
      'ESTRPIPE': 135,
    };
  
  var asyncLoad = async (url) => {
      var arrayBuffer = await readAsync(url);
      assert(arrayBuffer, `Loading data file "${url}" failed (no arrayBuffer).`);
      return new Uint8Array(arrayBuffer);
    };
  
  
  var FS_createDataFile = (...args) => FS.createDataFile(...args);
  
  var getUniqueRunDependency = (id) => {
      var orig = id;
      while (1) {
        if (!runDependencyTracking[id]) return id;
        id = orig + Math.random();
      }
    };
  
  var dependenciesPromise = null;
  var resolveRunDependencies = async () => dependenciesPromise;
  var runDependencies = 0;
  
  
  var dependenciesPromiseResolve = null;
  
  var runDependencyTracking = {
  };
  
  var runDependencyWatcher = null;
  var removeRunDependency = (id) => {
      runDependencies--;
  
      Module['monitorRunDependencies']?.(runDependencies);
  
      assert(id, 'removeRunDependency requires an ID');
      assert(runDependencyTracking[id]);
      delete runDependencyTracking[id];
      if (!runDependencies) {
        if (runDependencyWatcher !== null) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
        }
        dependenciesPromiseResolve();
      }
    };
  
  
  
  
  var addRunDependency = (id) => {
      if (!runDependencies) {
        dependenciesPromise = new Promise((resolve) => dependenciesPromiseResolve = resolve);
      }
      runDependencies++;
  
      Module['monitorRunDependencies']?.(runDependencies);
  
      assert(id, 'addRunDependency requires an ID')
      assert(!runDependencyTracking[id]);
      runDependencyTracking[id] = 1;
      if (!runDependencyWatcher && globalThis.setInterval) {
        // Check for missing dependencies every few seconds
        runDependencyWatcher = setInterval(() => {
          if (ABORT) {
            clearInterval(runDependencyWatcher);
            runDependencyWatcher = null;
            return;
          }
          var shown = false;
          for (var dep in runDependencyTracking) {
            if (!shown) {
              shown = true;
              err('still waiting on run dependencies:');
            }
            err(`dependency: ${dep}`);
          }
          if (shown) {
            err('(end of list)');
          }
        }, 10000);
        // Prevent this timer from keeping the runtime alive if nothing
        // else is.
        runDependencyWatcher.unref?.()
      }
    };
  
  
  var preloadPlugins = [];
  var FS_handledByPreloadPlugin = async (byteArray, fullname) => {
      // Ensure plugins are ready.
      if (typeof Browser != 'undefined') Browser.init();
  
      for (var plugin of preloadPlugins) {
        if (plugin['canHandle'](fullname)) {
          assert(plugin['handle'].constructor.name === 'AsyncFunction', 'Filesystem plugin handlers must be async functions (See #24914)')
          return plugin['handle'](byteArray, fullname);
        }
      }
      // If no plugin handled this file then return the original/unmodified
      // byteArray.
      return byteArray;
    };
  var FS_preloadFile = async (parent, name, url, canRead, canWrite, dontCreateFile, canOwn, preFinish) => {
      // TODO we should allow people to just pass in a complete filename instead
      // of parent and name being that we just join them anyways
      var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
      var dep = getUniqueRunDependency(`cp ${fullname}`); // might have several active requests for the same fullname
      addRunDependency(dep);
  
      try {
        var byteArray = url;
        if (typeof url == 'string') {
          byteArray = await asyncLoad(url);
        }
  
        byteArray = await FS_handledByPreloadPlugin(byteArray, fullname);
        preFinish?.();
        if (!dontCreateFile) {
          FS_createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
        }
      } finally {
        removeRunDependency(dep);
      }
    };
  var FS_createPreloadedFile = (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) => {
      FS_preloadFile(parent, name, url, canRead, canWrite, dontCreateFile, canOwn, preFinish).then(onload).catch(onerror);
    };
  
  var FS = {
  root:null,
  mounts:[],
  devices:{
  },
  streams:[],
  nextInode:1,
  nameTable:null,
  currentPath:"/",
  initialized:false,
  ignorePermissions:true,
  filesystems:null,
  syncFSRequests:0,
  ErrnoError:class extends Error {
        name = 'ErrnoError';
        // We set the `name` property to be able to identify `FS.ErrnoError`
        // - the `name` is a standard ECMA-262 property of error objects. Kind of good to have it anyway.
        // - when using PROXYFS, an error can come from an underlying FS
        // as different FS objects have their own FS.ErrnoError each,
        // the test `err instanceof FS.ErrnoError` won't detect an error coming from another filesystem, causing bugs.
        // we'll use the reliable test `err.name == "ErrnoError"` instead
        constructor(errno) {
          super(runtimeInitialized ? strError(errno) : '');
          this.errno = errno;
          for (var key in ERRNO_CODES) {
            if (ERRNO_CODES[key] === errno) {
              this.code = key;
              break;
            }
          }
        }
      },
  FSStream:class {
        shared = {};
        get object() {
          return this.node;
        }
        set object(val) {
          this.node = val;
        }
        get isRead() {
          return (this.flags & 2097155) !== 1;
        }
        get isWrite() {
          return (this.flags & 2097155) !== 0;
        }
        get isAppend() {
          return (this.flags & 1024);
        }
        get flags() {
          return this.shared.flags;
        }
        set flags(val) {
          this.shared.flags = val;
        }
        get position() {
          return this.shared.position;
        }
        set position(val) {
          this.shared.position = val;
        }
      },
  FSNode:class {
        node_ops = {};
        stream_ops = {};
        readMode = 292 | 73;
        writeMode = 146;
        mounted = null;
        constructor(parent, name, mode, rdev) {
          if (!parent) {
            parent = this;  // root node sets parent to itself
          }
          this.parent = parent;
          this.mount = parent.mount;
          this.id = FS.nextInode++;
          this.name = name;
          this.mode = mode;
          this.rdev = rdev;
          this.atime = this.mtime = this.ctime = Date.now();
        }
        get read() {
          return (this.mode & this.readMode) === this.readMode;
        }
        set read(val) {
          val ? this.mode |= this.readMode : this.mode &= ~this.readMode;
        }
        get write() {
          return (this.mode & this.writeMode) === this.writeMode;
        }
        set write(val) {
          val ? this.mode |= this.writeMode : this.mode &= ~this.writeMode;
        }
        get isFolder() {
          return FS.isDir(this.mode);
        }
        get isDevice() {
          return FS.isChrdev(this.mode);
        }
        // The per-inode readiness wait-queue. The node carries a Set of listener
        // entries {cb}; producers (SOCKFS, PIPEFS) call notifyListeners on a
        // readiness transition, and poll()/epoll consume it. It lives on the node
        // (not the fd) so dup'd fds share one queue. Only nodes that derive real
        // readiness (sockets, pipes, and an epoll's own node) ever use this -
        // always-ready types (regular files, ttys) never register or notify.
        addListener(cb, exclusive = false) {
          var entry = {cb, exclusive};
          var listeners = (this.listeners ??= new Set());
          listeners.add(entry);
          return {listeners, entry};
        }
        notifyListeners(flags) {
          // Iterates the set without copying, which is safe ONLY under a
          // load-bearing contract that every internal listener must honour:
          //   1. A listener must not run user code synchronously (a poll waiter only
          //      resolves a Promise; an epoll registration only re-lists +
          //      re-notifies; the epoll callback only schedules a tick). User code
          //      runs on a later tick, never inside this loop.
          //   2. A listener may delete entries only from ITS OWN waiter, never from
          //      a sibling node's set that may be mid-iteration. (Deleting an entry
          //      of the set being iterated here is fine - a Set tolerates removal of
          //      a not-yet-visited entry mid-iteration; mutating a *different* node's
          //      set is fine because that set is not being iterated.)
          // Violating either gives silently skipped wakeups that are near-impossible
          // to reproduce. Any new producer/listener must preserve it.
          if (!this.listeners) return;
          // Fire every non-exclusive listener. Among EPOLLEXCLUSIVE registrations
          // (one fd watched by several epolls) wake only one, rotating round-robin
          // per node, to avoid a thundering herd. (Only epoll registrations are ever
          // exclusive; poll waiters and a node's own consumers are not.)
          var excl;
          for (var entry of this.listeners) {
            if (entry.exclusive) (excl ||= []).push(entry);
            else entry.cb(flags);
          }
          if (excl) {
            var i = (this.exclTurn || 0) % excl.length;
            this.exclTurn = i + 1;
            excl[i].cb(flags);
          }
        }
      },
  lookupPath(path, opts = {}) {
        if (!path) {
          throw new FS.ErrnoError(44);
        }
        opts.follow_mount ??= true
  
        if (!PATH.isAbs(path)) {
          path = FS.cwd() + '/' + path;
        }
  
        // limit max consecutive symlinks to SYMLOOP_MAX.
        linkloop: for (var nlinks = 0; nlinks < 40; nlinks++) {
          // split the absolute path
          var parts = path.split('/').filter((p) => !!p);
  
          // start at the root
          var current = FS.root;
          var current_path = '/';
  
          for (var i = 0; i < parts.length; i++) {
            var islast = (i === parts.length-1);
            if (islast && opts.parent) {
              // stop resolving
              break;
            }
  
            if (parts[i] === '.') {
              continue;
            }
  
            if (parts[i] === '..') {
              current_path = PATH.dirname(current_path);
              if (FS.isRoot(current)) {
                path = current_path + '/' + parts.slice(i + 1).join('/');
                // We're making progress here, don't let many consecutive ..'s
                // lead to ELOOP
                nlinks--;
                continue linkloop;
              } else {
                current = current.parent;
              }
              continue;
            }
  
            current_path = PATH.join2(current_path, parts[i]);
            try {
              current = FS.lookupNode(current, parts[i]);
            } catch (e) {
              // if noent_okay is true, suppress a ENOENT in the last component
              // and return an object with an undefined node. This is needed for
              // resolving symlinks in the path when creating a file.
              if ((e?.errno === 44) && islast && opts.noent_okay) {
                return { path: current_path };
              }
              throw e;
            }
  
            // jump to the mount's root node if this is a mountpoint
            if (FS.isMountpoint(current) && (!islast || opts.follow_mount)) {
              current = current.mounted.root;
            }
  
            // by default, lookupPath will not follow a symlink if it is the final path component.
            // setting opts.follow = true will override this behavior.
            if (FS.isLink(current.mode) && (!islast || opts.follow)) {
              if (!current.node_ops.readlink) {
                throw new FS.ErrnoError(52);
              }
              var link = current.node_ops.readlink(current);
              if (!PATH.isAbs(link)) {
                link = PATH.dirname(current_path) + '/' + link;
              }
              path = link + '/' + parts.slice(i + 1).join('/');
              continue linkloop;
            }
          }
          return { path: current_path, node: current };
        }
        throw new FS.ErrnoError(32);
      },
  getPath(node) {
        var path;
        while (true) {
          if (FS.isRoot(node)) {
            var mount = node.mount.mountpoint;
            if (!path) return mount;
            return mount[mount.length-1] !== '/' ? `${mount}/${path}` : mount + path;
          }
          path = path ? `${node.name}/${path}` : node.name;
          node = node.parent;
        }
      },
  hashName(parentid, name) {
        var hash = 0;
  
        for (var i = 0; i < name.length; i++) {
          hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
        }
        return ((parentid + hash) >>> 0) % FS.nameTable.length;
      },
  hashAddNode(node) {
        var hash = FS.hashName(node.parent.id, node.name);
        node.name_next = FS.nameTable[hash];
        FS.nameTable[hash] = node;
      },
  hashRemoveNode(node) {
        var hash = FS.hashName(node.parent.id, node.name);
        if (FS.nameTable[hash] === node) {
          FS.nameTable[hash] = node.name_next;
        } else {
          var current = FS.nameTable[hash];
          while (current) {
            if (current.name_next === node) {
              current.name_next = node.name_next;
              break;
            }
            current = current.name_next;
          }
        }
      },
  lookupNode(parent, name) {
        var errCode = FS.mayLookup(parent);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        var hash = FS.hashName(parent.id, name);
        for (var node = FS.nameTable[hash]; node; node = node.name_next) {
          var nodeName = node.name;
          if (node.parent.id === parent.id && nodeName === name) {
            return node;
          }
        }
        // if we failed to find it in the cache, call into the VFS
        return FS.lookup(parent, name);
      },
  createNode(parent, name, mode, rdev) {
        assert(typeof parent == 'object')
        var node = new FS.FSNode(parent, name, mode, rdev);
  
        FS.hashAddNode(node);
  
        return node;
      },
  destroyNode(node) {
        FS.hashRemoveNode(node);
      },
  isRoot(node) {
        return node === node.parent;
      },
  isMountpoint(node) {
        return !!node.mounted;
      },
  isFile(mode) {
        return (mode & 61440) === 32768;
      },
  isDir(mode) {
        return (mode & 61440) === 16384;
      },
  isLink(mode) {
        return (mode & 61440) === 40960;
      },
  isChrdev(mode) {
        return (mode & 61440) === 8192;
      },
  isBlkdev(mode) {
        return (mode & 61440) === 24576;
      },
  isFIFO(mode) {
        return (mode & 61440) === 4096;
      },
  isSocket(mode) {
        return (mode & 49152) === 49152;
      },
  flagsToPermissionString(flag) {
        var perms = ['r', 'w', 'rw'][flag & 3];
        if ((flag & 512)) {
          perms += 'w';
        }
        return perms;
      },
  nodePermissions(node, perms) {
        if (FS.ignorePermissions) {
          return 0;
        }
        // return 0 if any user, group or owner bits are set.
        if (perms.includes('r') && !(node.mode & 292)) {
          return 2;
        }
        if (perms.includes('w') && !(node.mode & 146)) {
          return 2;
        }
        if (perms.includes('x') && !(node.mode & 73)) {
          return 2;
        }
        return 0;
      },
  mayLookup(dir) {
        if (!FS.isDir(dir.mode)) return 54;
        var errCode = FS.nodePermissions(dir, 'x');
        if (errCode) return errCode;
        if (!dir.node_ops.lookup) return 2;
        return 0;
      },
  mayCreate(dir, name) {
        if (!FS.isDir(dir.mode)) {
          return 54;
        }
        try {
          var node = FS.lookupNode(dir, name);
          return 20;
        } catch (e) {
        }
        return FS.nodePermissions(dir, 'wx');
      },
  mayDelete(dir, name, isdir) {
        var node;
        try {
          node = FS.lookupNode(dir, name);
        } catch (e) {
          return e.errno;
        }
        var errCode = FS.nodePermissions(dir, 'wx');
        if (errCode) {
          return errCode;
        }
        if (isdir) {
          if (!FS.isDir(node.mode)) {
            return 54;
          }
          if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
            return 10;
          }
        } else if (FS.isDir(node.mode)) {
          return 31;
        }
        return 0;
      },
  mayOpen(node, flags) {
        if (!node) {
          return 44;
        }
        if (FS.isLink(node.mode)) {
          return 32;
        }
        var mode = FS.flagsToPermissionString(flags);
        if (FS.isDir(node.mode)) {
          // opening for write
          // TODO: check for O_SEARCH? (== search for dir only)
          if (mode !== 'r' || (flags & (512 | 64))) {
            return 31;
          }
        }
        return FS.nodePermissions(node, mode);
      },
  checkOpExists(op, err) {
        if (!op) {
          throw new FS.ErrnoError(err);
        }
        return op;
      },
  MAX_OPEN_FDS:4096,
  nextfd() {
        for (var fd = 0; fd <= FS.MAX_OPEN_FDS; fd++) {
          if (!FS.streams[fd]) {
            return fd;
          }
        }
        throw new FS.ErrnoError(33);
      },
  getStreamChecked(fd) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(8);
        }
        return stream;
      },
  getStream:(fd) => FS.streams[fd],
  createStream(stream, fd = -1) {
        assert(fd >= -1);
  
        // clone it, so we can return an instance of FSStream
        stream = Object.assign(new FS.FSStream(), stream);
        if (fd == -1) {
          fd = FS.nextfd();
        }
        stream.fd = fd;
        FS.streams[fd] = stream;
        return stream;
      },
  closeStream(fd) {
        FS.streams[fd] = null;
      },
  dupStream(origStream, fd = -1) {
        var stream = FS.createStream(origStream, fd);
        stream.stream_ops?.dup?.(stream);
        return stream;
      },
  doSetAttr(stream, node, attr) {
        var setattr = stream?.stream_ops.setattr;
        var arg = setattr ? stream : node;
        setattr ??= node.node_ops.setattr;
        FS.checkOpExists(setattr, 63)
        try {
          setattr(arg, attr);
        } catch (e) {
          if (e instanceof RangeError) {
            throw new FS.ErrnoError(22);
          }
          throw e;
        }
      },
  chrdev_stream_ops:{
  open(stream) {
          var device = FS.getDevice(stream.node.rdev);
          // override node's stream ops with the device's
          stream.stream_ops = device.stream_ops;
          // forward the open call
          stream.stream_ops.open?.(stream);
        },
  llseek() {
          throw new FS.ErrnoError(70);
        },
  },
  major:(dev) => ((dev) >> 8),
  minor:(dev) => ((dev) & 0xff),
  makedev:(ma, mi) => ((ma) << 8 | (mi)),
  registerDevice(dev, ops) {
        FS.devices[dev] = { stream_ops: ops };
      },
  getDevice:(dev) => FS.devices[dev],
  getMounts(mount) {
        var mounts = [];
        var check = [mount];
  
        while (check.length) {
          var m = check.pop();
  
          mounts.push(m);
  
          check.push(...m.mounts);
        }
  
        return mounts;
      },
  syncfs(populate, callback) {
        if (typeof populate == 'function') {
          callback = populate;
          populate = false;
        }
  
        FS.syncFSRequests++;
  
        if (FS.syncFSRequests > 1) {
          err(`warning: ${FS.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`);
        }
  
        var mounts = FS.getMounts(FS.root.mount);
        var completed = 0;
  
        function doCallback(errCode) {
          assert(FS.syncFSRequests > 0);
          FS.syncFSRequests--;
          return callback(errCode);
        }
  
        function done(errCode) {
          if (errCode) {
            if (!done.errored) {
              done.errored = true;
              return doCallback(errCode);
            }
            return;
          }
          if (++completed >= mounts.length) {
            doCallback(null);
          }
        };
  
        // sync all mounts
        for (var mount of mounts) {
          if (mount.type.syncfs) {
            mount.type.syncfs(mount, populate, done);
          } else {
            done(null);
          }
        }
      },
  mount(type, opts, mountpoint) {
        if (typeof type == 'string') {
          // The filesystem was not included, and instead we have an error
          // message stored in the variable.
          throw type;
        }
        var root = mountpoint === '/';
        var pseudo = !mountpoint;
        var node;
  
        if (root && FS.root) {
          throw new FS.ErrnoError(10);
        } else if (!root && !pseudo) {
          var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
  
          mountpoint = lookup.path;  // use the absolute path
          node = lookup.node;
  
          if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(10);
          }
  
          if (!FS.isDir(node.mode)) {
            throw new FS.ErrnoError(54);
          }
        }
  
        var mount = {
          type,
          opts,
          mountpoint,
          mounts: []
        };
  
        // create a root node for the fs
        var mountRoot = type.mount(mount);
        mountRoot.mount = mount;
        mount.root = mountRoot;
  
        if (root) {
          FS.root = mountRoot;
        } else if (node) {
          // set as a mountpoint
          node.mounted = mount;
  
          // add the new mount to the current mount's children
          if (node.mount) {
            node.mount.mounts.push(mount);
          }
        }
  
        return mountRoot;
      },
  unmount(mountpoint) {
        var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
  
        if (!FS.isMountpoint(lookup.node)) {
          throw new FS.ErrnoError(28);
        }
  
        // destroy the nodes for this mount, and all its child mounts
        var node = lookup.node;
        var mount = node.mounted;
        var mounts = FS.getMounts(mount);
  
        for (var [hash, current] of Object.entries(FS.nameTable)) {
          while (current) {
            var next = current.name_next;
  
            if (mounts.includes(current.mount)) {
              FS.destroyNode(current);
            }
  
            current = next;
          }
        }
  
        // no longer a mountpoint
        node.mounted = null;
  
        // remove this mount from the child mounts
        var idx = node.mount.mounts.indexOf(mount);
        assert(idx !== -1);
        node.mount.mounts.splice(idx, 1);
      },
  lookup(parent, name) {
        return parent.node_ops.lookup(parent, name);
      },
  mknod(path, mode, dev) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        if (!name) {
          throw new FS.ErrnoError(28);
        }
        if (name === '.' || name === '..') {
          throw new FS.ErrnoError(20);
        }
        var errCode = FS.mayCreate(parent, name);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.mknod) {
          throw new FS.ErrnoError(63);
        }
        return parent.node_ops.mknod(parent, name, mode, dev);
      },
  statfs(path) {
        return FS.statfsNode(FS.lookupPath(path, {follow: true}).node);
      },
  statfsStream(stream) {
        // We keep a separate statfsStream function because noderawfs overrides
        // it. In noderawfs, stream.node is sometimes null. Instead, we need to
        // look at stream.path.
        return FS.statfsNode(stream.node);
      },
  statfsNode(node) {
        // NOTE: None of the defaults here are true. We're just returning safe and
        //       sane values. Currently nodefs and rawfs replace these defaults,
        //       other file systems leave them alone.
        var rtn = {
          bsize: 4096,
          frsize: 4096,
          blocks: 1e6,
          bfree: 5e5,
          bavail: 5e5,
          files: FS.nextInode,
          ffree: FS.nextInode - 1,
          fsid: 42,
          flags: 2,
          namelen: 255,
        };
  
        if (node.node_ops.statfs) {
          Object.assign(rtn, node.node_ops.statfs(node.mount.opts.root));
        }
        return rtn;
      },
  create(path, mode = 0o666) {
        mode &= 4095;
        mode |= 32768;
        return FS.mknod(path, mode, 0);
      },
  mkdir(path, mode = 0o777) {
        mode &= 511 | 512;
        mode |= 16384;
        return FS.mknod(path, mode, 0);
      },
  mkdirTree(path, mode) {
        var dirs = path.split('/');
        var d = '';
        for (var dir of dirs) {
          if (!dir) continue;
          if (d || PATH.isAbs(path)) d += '/';
          d += dir;
          try {
            FS.mkdir(d, mode);
          } catch(e) {
            if (e.errno != 20) throw e;
          }
        }
      },
  mkdev(path, mode, dev) {
        if (typeof dev == 'undefined') {
          dev = mode;
          mode = 0o666;
        }
        mode |= 8192;
        return FS.mknod(path, mode, dev);
      },
  symlink(oldpath, newpath) {
        if (!PATH_FS.resolve(oldpath)) {
          throw new FS.ErrnoError(44);
        }
        var lookup = FS.lookupPath(newpath, { parent: true });
        var parent = lookup.node;
        if (!parent) {
          throw new FS.ErrnoError(44);
        }
        var newname = PATH.basename(newpath);
        var errCode = FS.mayCreate(parent, newname);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.symlink) {
          throw new FS.ErrnoError(63);
        }
        return parent.node_ops.symlink(parent, newname, oldpath);
      },
  link(oldpath, newpath, flags) {
        var lookup = FS.lookupPath(newpath, { parent: true });
        var parent = lookup.node;
        if (!parent) {
          throw new FS.ErrnoError(44);
        }
        var newname = PATH.basename(newpath);
        var errCode = FS.mayCreate(parent, newname);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        // Hardlinks are only supported by filesystem backends that provide a
        // `link` node op (e.g. NODERAWFS backed by the host). NODEFS omits it:
        // a host hardlink cannot be confined to the mount root.
        if (!parent.node_ops.link) {
          throw new FS.ErrnoError(34);
        }
        return parent.node_ops.link(parent, newname, oldpath, flags);
      },
  rename(old_path, new_path) {
        var old_dirname = PATH.dirname(old_path);
        var new_dirname = PATH.dirname(new_path);
        var old_name = PATH.basename(old_path);
        var new_name = PATH.basename(new_path);
        // parents must exist
        var lookup, old_dir, new_dir;
  
        // let the errors from non existent directories percolate up
        lookup = FS.lookupPath(old_path, { parent: true });
        old_dir = lookup.node;
        lookup = FS.lookupPath(new_path, { parent: true });
        new_dir = lookup.node;
  
        if (!old_dir || !new_dir) throw new FS.ErrnoError(44);
        // need to be part of the same mount
        if (old_dir.mount !== new_dir.mount) {
          throw new FS.ErrnoError(75);
        }
        // source must exist
        var old_node = FS.lookupNode(old_dir, old_name);
        // old path should not be an ancestor of the new path
        var relative = PATH_FS.relative(old_path, new_dirname);
        if (relative.charAt(0) !== '.') {
          throw new FS.ErrnoError(28);
        }
        // new path should not be an ancestor of the old path
        relative = PATH_FS.relative(new_path, old_dirname);
        if (relative.charAt(0) !== '.') {
          throw new FS.ErrnoError(55);
        }
        // see if the new path already exists
        var new_node;
        try {
          new_node = FS.lookupNode(new_dir, new_name);
        } catch (e) {
          // not fatal
        }
        // early out if nothing needs to change
        if (old_node === new_node) {
          return;
        }
        // we'll need to delete the old entry
        var isdir = FS.isDir(old_node.mode);
        var errCode = FS.mayDelete(old_dir, old_name, isdir);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        // need delete permissions if we'll be overwriting.
        // need create permissions if new doesn't already exist.
        errCode = new_node ?
          FS.mayDelete(new_dir, new_name, isdir) :
          FS.mayCreate(new_dir, new_name);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!old_dir.node_ops.rename) {
          throw new FS.ErrnoError(63);
        }
        if (FS.isMountpoint(old_node) || (new_node && FS.isMountpoint(new_node))) {
          throw new FS.ErrnoError(10);
        }
        // if we are going to change the parent, check write permissions
        if (new_dir !== old_dir) {
          errCode = FS.nodePermissions(old_dir, 'w');
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
        }
        // remove the node from the lookup hash
        FS.hashRemoveNode(old_node);
        // do the underlying fs rename
        try {
          old_dir.node_ops.rename(old_node, new_dir, new_name);
          // update old node (we do this here to avoid each backend
          // needing to)
          old_node.parent = new_dir;
        } catch (e) {
          throw e;
        } finally {
          // add the node back to the hash (in case node_ops.rename
          // changed its name)
          FS.hashAddNode(old_node);
        }
      },
  rmdir(path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var errCode = FS.mayDelete(parent, name, true);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.rmdir) {
          throw new FS.ErrnoError(63);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(10);
        }
        parent.node_ops.rmdir(parent, name);
        FS.destroyNode(node);
      },
  readdir(path) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        var readdir = FS.checkOpExists(node.node_ops.readdir, 54);
        return readdir(node);
      },
  unlink(path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        if (!parent) {
          throw new FS.ErrnoError(44);
        }
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var errCode = FS.mayDelete(parent, name, false);
        if (errCode) {
          // According to POSIX, we should map EISDIR to EPERM, but
          // we instead do what Linux does (and we must, as we use
          // the musl linux libc).
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.unlink) {
          throw new FS.ErrnoError(63);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(10);
        }
        parent.node_ops.unlink(parent, name);
        FS.destroyNode(node);
      },
  readlink(path) {
        var lookup = FS.lookupPath(path);
        var link = lookup.node;
        if (!link) {
          throw new FS.ErrnoError(44);
        }
        if (!link.node_ops.readlink) {
          throw new FS.ErrnoError(28);
        }
        return link.node_ops.readlink(link);
      },
  stat(path, dontFollow) {
        var lookup = FS.lookupPath(path, { follow: !dontFollow });
        var node = lookup.node;
        var getattr = FS.checkOpExists(node.node_ops.getattr, 63);
        return getattr(node);
      },
  fstat(fd) {
        var stream = FS.getStreamChecked(fd);
        var node = stream.node;
        var getattr = stream.stream_ops.getattr;
        var arg = getattr ? stream : node;
        getattr ??= node.node_ops.getattr;
        FS.checkOpExists(getattr, 63)
        return getattr(arg);
      },
  lstat(path) {
        return FS.stat(path, true);
      },
  doChmod(stream, node, mode, dontFollow) {
        FS.doSetAttr(stream, node, {
          mode: (mode & 4095) | (node.mode & ~4095),
          ctime: Date.now(),
          dontFollow
        });
      },
  chmod(path, mode, dontFollow) {
        var node;
        if (typeof path == 'string') {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        FS.doChmod(null, node, mode, dontFollow);
      },
  lchmod(path, mode) {
        FS.chmod(path, mode, true);
      },
  fchmod(fd, mode) {
        var stream = FS.getStreamChecked(fd);
        FS.doChmod(stream, stream.node, mode, false);
      },
  doChown(stream, node, dontFollow) {
        FS.doSetAttr(stream, node, {
          timestamp: Date.now(),
          dontFollow
          // we ignore the uid / gid for now
        });
      },
  chown(path, uid, gid, dontFollow) {
        var node;
        if (typeof path == 'string') {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        FS.doChown(null, node, dontFollow);
      },
  lchown(path, uid, gid) {
        FS.chown(path, uid, gid, true);
      },
  fchown(fd, uid, gid) {
        var stream = FS.getStreamChecked(fd);
        FS.doChown(stream, stream.node, false);
      },
  doTruncate(stream, node, len) {
        if (FS.isDir(node.mode)) {
          throw new FS.ErrnoError(31);
        }
        if (!FS.isFile(node.mode)) {
          throw new FS.ErrnoError(28);
        }
        var errCode = FS.nodePermissions(node, 'w');
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        FS.doSetAttr(stream, node, {
          size: len,
          timestamp: Date.now()
        });
      },
  truncate(path, len) {
        if (len < 0) {
          throw new FS.ErrnoError(28);
        }
        var node;
        if (typeof path == 'string') {
          var lookup = FS.lookupPath(path, { follow: true });
          node = lookup.node;
        } else {
          node = path;
        }
        FS.doTruncate(null, node, len);
      },
  ftruncate(fd, len) {
        var stream = FS.getStreamChecked(fd);
        if (len < 0 || (stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(28);
        }
        FS.doTruncate(stream, stream.node, len);
      },
  utime(path, atime, mtime, dontFollow) {
        var lookup = FS.lookupPath(path, { follow: !dontFollow });
        FS.doSetAttr(null, lookup.node, {
          atime: atime,
          mtime: mtime,
          dontFollow
        });
      },
  open(path, flags, mode = 0o666) {
        if (path === '') {
          throw new FS.ErrnoError(44);
        }
        flags = FS_modeStringToFlags(flags);
        if ((flags & 64)) {
          mode = (mode & 4095) | 32768;
        } else {
          mode = 0;
        }
        var node;
        var isDirPath;
        if (typeof path == 'object') {
          node = path;
        } else {
          isDirPath = path.endsWith('/');
          // noent_okay makes it so that if the final component of the path
          // doesn't exist, lookupPath returns `node: undefined`. `path` will be
          // updated to point to the target of all symlinks.
          var lookup = FS.lookupPath(path, {
            follow: !(flags & 131072),
            noent_okay: true
          });
          node = lookup.node;
          path = lookup.path;
        }
        // perhaps we need to create the node
        var created = false;
        if ((flags & 64)) {
          if (node) {
            // if O_CREAT and O_EXCL are set, error out if the node already exists
            if ((flags & 128)) {
              throw new FS.ErrnoError(20);
            }
          } else if (isDirPath) {
            throw new FS.ErrnoError(31);
          } else {
            // node doesn't exist, try to create it
            // Ignore the permission bits here to ensure we can `open` this new
            // file below. We use chmod below to apply the permissions once the
            // file is open.
            node = FS.mknod(path, mode | 0o777, 0);
            created = true;
          }
        }
        if (!node) {
          throw new FS.ErrnoError(44);
        }
        // can't truncate a device
        if (FS.isChrdev(node.mode)) {
          flags &= ~512;
        }
        // if asked only for a directory, then this must be one
        if ((flags & 65536) && !FS.isDir(node.mode)) {
          throw new FS.ErrnoError(54);
        }
        // check permissions, if this is not a file we just created now (it is ok to
        // create and write to a file with read-only permissions; it is read-only
        // for later use)
        if (!created) {
          var errCode = FS.mayOpen(node, flags);
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
        }
        // do truncation if necessary
        if ((flags & 512) && !created) {
          FS.truncate(node, 0);
        }
        // we've already handled these, don't pass down to the underlying vfs
        flags &= ~(128 | 512 | 131072);
  
        // register the stream with the filesystem
        var stream = FS.createStream({
          node,
          path: FS.getPath(node),  // we want the absolute path to the node
          flags,
          seekable: true,
          position: 0,
          stream_ops: node.stream_ops,
          // used by the file family libc calls (fopen, fwrite, ferror, etc.)
          ungotten: [],
          error: false
        });
        // call the new stream's open function
        if (stream.stream_ops.open) {
          stream.stream_ops.open(stream);
        }
        if (created) {
          FS.chmod(node, mode & 0o777);
        }
        return stream;
      },
  close(stream) {
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if (stream.getdents) stream.getdents = null; // free readdir state
        // The fd is going away: wake anything waiting on it (poll/epoll) with
        // POLLNVAL so a blocking wait unblocks and an epoll registration is evicted
        // on its next derive. Only sockets/pipes/epoll ever carry a wait-queue, so
        // for every other stream (incl. nodeless noderawfs stdio) this is a no-op.
        stream.node?.notifyListeners(32);
        try {
          if (stream.stream_ops.close) {
            stream.stream_ops.close(stream);
          }
        } catch (e) {
          throw e;
        } finally {
          FS.closeStream(stream.fd);
        }
        stream.fd = null;
      },
  isClosed(stream) {
        return stream.fd === null;
      },
  llseek(stream, offset, whence) {
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if (!stream.seekable || !stream.stream_ops.llseek) {
          throw new FS.ErrnoError(70);
        }
        if (whence != 0 && whence != 1 && whence != 2) {
          throw new FS.ErrnoError(28);
        }
        stream.position = stream.stream_ops.llseek(stream, offset, whence);
        stream.ungotten = [];
        return stream.position;
      },
  read(stream, buffer, offset, length, position) {
        assert(offset >= 0);
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(28);
        }
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(8);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(31);
        }
        if (!stream.stream_ops.read) {
          throw new FS.ErrnoError(28);
        }
        var seeking = typeof position != 'undefined';
        if (!seeking) {
          position = stream.position;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(70);
        }
        var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
        if (!seeking) stream.position += bytesRead;
        return bytesRead;
      },
  write(stream, buffer, offset, length, position, canOwn) {
        assert(offset >= 0);
        assert(buffer.subarray, 'FS.write expects a TypedArray');
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(28);
        }
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(8);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(31);
        }
        if (!stream.stream_ops.write) {
          throw new FS.ErrnoError(28);
        }
        if (stream.seekable && stream.flags & 1024) {
          // seek to the end before writing in append mode
          FS.llseek(stream, 0, 2);
        }
        var seeking = typeof position != 'undefined';
        if (!seeking) {
          position = stream.position;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(70);
        }
        var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
        if (!seeking) stream.position += bytesWritten;
        return bytesWritten;
      },
  mmap(stream, length, position, prot, flags) {
        // User requests writing to file (prot & PROT_WRITE != 0).
        // Checking if we have permissions to write to the file unless
        // MAP_PRIVATE flag is set. According to POSIX spec it is possible
        // to write to file opened in read-only mode with MAP_PRIVATE flag,
        // as all modifications will be visible only in the memory of
        // the current process.
        if ((prot & 2)
            && !(flags & 2)
            && (stream.flags & 2097155) !== 2) {
          throw new FS.ErrnoError(2);
        }
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(2);
        }
        if (!stream.stream_ops.mmap) {
          throw new FS.ErrnoError(43);
        }
        if (!length) {
          throw new FS.ErrnoError(28);
        }
        return stream.stream_ops.mmap(stream, length, position, prot, flags);
      },
  msync(stream, buffer, offset, length, mmapFlags) {
        assert(offset >= 0);
        if (!stream.stream_ops.msync) {
          return 0;
        }
        return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);
      },
  ioctl(stream, cmd, arg) {
        if (!stream.stream_ops.ioctl) {
          throw new FS.ErrnoError(59);
        }
        return stream.stream_ops.ioctl(stream, cmd, arg);
      },
  readFile(path, opts = {}) {
        opts.flags = opts.flags ?? 0;
        opts.encoding = opts.encoding ?? 'binary';
        if (opts.encoding !== 'utf8' && opts.encoding !== 'binary') {
          abort(`Invalid encoding type "${opts.encoding}"`);
        }
        var stream = FS.open(path, opts.flags);
        var stat = FS.stat(path);
        var length = stat.size;
        var buf = new Uint8Array(length);
        FS.read(stream, buf, 0, length, 0);
        if (opts.encoding === 'utf8') {
          buf = UTF8ArrayToString(buf);
        }
        FS.close(stream);
        return buf;
      },
  writeFile(path, data, opts = {}) {
        opts.flags = opts.flags ?? 577;
        var stream = FS.open(path, opts.flags, opts.mode);
        data = FS_fileDataToTypedArray(data);
        FS.write(stream, data, 0, data.byteLength, undefined, opts.canOwn);
        FS.close(stream);
      },
  cwd:() => FS.currentPath,
  chdir(path) {
        var lookup = FS.lookupPath(path, { follow: true });
        if (lookup.node === null) {
          throw new FS.ErrnoError(44);
        }
        if (!FS.isDir(lookup.node.mode)) {
          throw new FS.ErrnoError(54);
        }
        var errCode = FS.nodePermissions(lookup.node, 'x');
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        FS.currentPath = lookup.path;
      },
  createDefaultDirectories() {
        FS.mkdir('/tmp');
        FS.mkdir('/home');
        FS.mkdir('/home/web_user');
      },
  createDefaultDevices() {
        // create /dev
        FS.mkdir('/dev');
        // setup /dev/null
        FS.registerDevice(FS.makedev(1, 3), {
          read: () => 0,
          write: (stream, buffer, offset, length, pos) => length,
          llseek: () => 0,
        });
        FS.mkdev('/dev/null', FS.makedev(1, 3));
        // setup /dev/tty and /dev/tty1
        // stderr needs to print output using err() rather than out()
        // so we register a second tty just for it.
        TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
        TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
        FS.mkdev('/dev/tty', FS.makedev(5, 0));
        FS.mkdev('/dev/tty1', FS.makedev(6, 0));
        // setup /dev/[u]random
        // use a buffer to avoid overhead of individual crypto calls per byte
        var randomBuffer = new Uint8Array(1024), randomLeft = 0;
        var randomByte = () => {
          if (!randomLeft) {
            randomFill(randomBuffer);
            randomLeft = randomBuffer.byteLength;
          }
          return randomBuffer[--randomLeft];
        };
        FS.createDevice('/dev', 'random', randomByte);
        FS.createDevice('/dev', 'urandom', randomByte);
        // we're not going to emulate the actual shm device,
        // just create the tmp dirs that reside in it commonly
        FS.mkdir('/dev/shm');
        FS.mkdir('/dev/shm/tmp');
      },
  createSpecialDirectories() {
        // create /proc/self/fd which allows /proc/self/fd/6 => readlink gives the
        // name of the stream for fd 6 (see test_unistd_ttyname)
        FS.mkdir('/proc');
        var proc_self = FS.mkdir('/proc/self');
        FS.mkdir('/proc/self/fd');
        FS.mount({
          mount() {
            var node = FS.createNode(proc_self, 'fd', 16895, 73);
            node.stream_ops = {
              llseek: MEMFS.stream_ops.llseek,
            };
            node.node_ops = {
              lookup(parent, name) {
                var fd = +name;
                var stream = FS.getStreamChecked(fd);
                var ret = {
                  parent: null,
                  mount: { mountpoint: 'fake' },
                  node_ops: { readlink: () => stream.path },
                  id: fd + 1,
                };
                ret.parent = ret; // make it look like a simple root node
                return ret;
              },
              readdir() {
                return Array.from(FS.streams.entries())
                  .filter(([k, v]) => v)
                  .map(([k, v]) => k.toString());
              }
            };
            return node;
          }
        }, {}, '/proc/self/fd');
      },
  createStandardStreams(input, output, error) {
        // TODO deprecate the old functionality of a single
        // input / output callback and that utilizes FS.createDevice
        // and instead require a unique set of stream ops
  
        // by default, we symlink the standard streams to the
        // default tty devices. however, if the standard streams
        // have been overwritten we create a unique device for
        // them instead.
        if (input) {
          FS.createDevice('/dev', 'stdin', input);
        } else {
          FS.symlink('/dev/tty', '/dev/stdin');
        }
        if (output) {
          FS.createDevice('/dev', 'stdout', null, output);
        } else {
          FS.symlink('/dev/tty', '/dev/stdout');
        }
        if (error) {
          FS.createDevice('/dev', 'stderr', null, error);
        } else {
          FS.symlink('/dev/tty1', '/dev/stderr');
        }
  
        // open default streams for the stdin, stdout and stderr devices
        var stdin = FS.open('/dev/stdin', 0);
        var stdout = FS.open('/dev/stdout', 1);
        var stderr = FS.open('/dev/stderr', 1);
        assert(stdin.fd === 0, `invalid handle for stdin (${stdin.fd})`);
        assert(stdout.fd === 1, `invalid handle for stdout (${stdout.fd})`);
        assert(stderr.fd === 2, `invalid handle for stderr (${stderr.fd})`);
      },
  staticInit() {
        FS.nameTable = new Array(4096);
  
        FS.mount(MEMFS, {}, '/');
  
        FS.createDefaultDirectories();
        FS.createDefaultDevices();
        FS.createSpecialDirectories();
  
        FS.filesystems = {
          'MEMFS': MEMFS,
        };
      },
  init(input, output, error) {
        assert(!FS.initialized, 'FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)');
        FS.initialized = true;
  
        // Allow Module.stdin etc. to provide defaults, if none explicitly passed to us here
        input ??= Module['stdin'];
        output ??= Module['stdout'];
        error ??= Module['stderr'];
  
        FS.createStandardStreams(input, output, error);
      },
  quit() {
        FS.initialized = false;
        // force-flush all streams, so we get musl std streams printed out
        _fflush(0);
        // close all of our streams
        for (var stream of FS.streams) {
          if (stream) {
            FS.close(stream);
          }
        }
      },
  findObject(path, dontResolveLastLink) {
        var ret = FS.analyzePath(path, dontResolveLastLink);
        if (!ret.exists) {
          return null;
        }
        return ret.object;
      },
  analyzePath(path, dontResolveLastLink) {
        // operate from within the context of the symlink's target
        try {
          var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          path = lookup.path;
        } catch (e) {
        }
        var ret = {
          isRoot: false, exists: false, error: 0, name: null, path: null, object: null,
          parentExists: false, parentPath: null, parentObject: null
        };
        try {
          var lookup = FS.lookupPath(path, { parent: true });
          ret.parentExists = true;
          ret.parentPath = lookup.path;
          ret.parentObject = lookup.node;
          ret.name = PATH.basename(path);
          lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          ret.exists = true;
          ret.path = lookup.path;
          ret.object = lookup.node;
          ret.name = lookup.node.name;
          ret.isRoot = lookup.path === '/';
        } catch (e) {
          ret.error = e.errno;
        };
        return ret;
      },
  createPath(parent, path, canRead, canWrite) {
        parent = typeof parent == 'string' ? parent : FS.getPath(parent);
        var parts = path.split('/').reverse();
        while (parts.length) {
          var part = parts.pop();
          if (!part) continue;
          var current = PATH.join2(parent, part);
          try {
            FS.mkdir(current);
          } catch (e) {
            if (e.errno != 20) throw e;
          }
          parent = current;
        }
        return current;
      },
  createFile(parent, name, properties, canRead, canWrite) {
        var path = PATH.join2(typeof parent == 'string' ? parent : FS.getPath(parent), name);
        var mode = FS_getMode(canRead, canWrite);
        return FS.create(path, mode);
      },
  createDataFile(parent, name, data, canRead, canWrite, canOwn) {
        var path = name;
        if (parent) {
          parent = typeof parent == 'string' ? parent : FS.getPath(parent);
          path = name ? PATH.join2(parent, name) : parent;
        }
        var mode = FS_getMode(canRead, canWrite);
        var node = FS.create(path, mode);
        if (data) {
          data = FS_fileDataToTypedArray(data);
          // make sure we can write to the file
          FS.chmod(node, mode | 146);
          var stream = FS.open(node, 577);
          FS.write(stream, data, 0, data.length, 0, canOwn);
          FS.close(stream);
          FS.chmod(node, mode);
        }
      },
  createDevice(parent, name, input, output) {
        var path = PATH.join2(typeof parent == 'string' ? parent : FS.getPath(parent), name);
        var mode = FS_getMode(!!input, !!output);
        FS.createDevice.major ??= 64;
        var dev = FS.makedev(FS.createDevice.major++, 0);
        // Create a fake device that a set of stream ops to emulate
        // the old behavior.
        FS.registerDevice(dev, {
          open(stream) {
            stream.seekable = false;
          },
          close(stream) {
            // flush any pending line data
            if (output?.buffer?.length) {
              output(10);
            }
          },
          read(stream, buffer, offset, length, pos /* ignored */) {
            var bytesRead = 0;
            for (var i = 0; i < length; i++) {
              var result;
              try {
                result = input();
              } catch (e) {
                throw new FS.ErrnoError(29);
              }
              if (result === undefined && !bytesRead) {
                throw new FS.ErrnoError(6);
              }
              if (result === null || result === undefined) break;
              bytesRead++;
              buffer[offset+i] = result;
            }
            if (bytesRead) {
              stream.node.atime = Date.now();
            }
            return bytesRead;
          },
          write(stream, buffer, offset, length, pos) {
            for (var i = 0; i < length; i++) {
              try {
                output(buffer[offset+i]);
              } catch (e) {
                throw new FS.ErrnoError(29);
              }
            }
            if (length) {
              stream.node.mtime = stream.node.ctime = Date.now();
            }
            return i;
          }
        });
        return FS.mkdev(path, mode, dev);
      },
  forceLoadFile(obj) {
        if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
        if (globalThis.XMLHttpRequest) {
          abort('Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.');
        } else { // Command-line.
          try {
            obj.contents = readBinary(obj.url);
          } catch (e) {
            throw new FS.ErrnoError(29);
          }
        }
      },
  createLazyFile(parent, name, url, canRead, canWrite) {
        // Lazy chunked Uint8Array (implements get and length from Uint8Array).
        // Actual getting is abstracted away for eventual reuse.
        class LazyUint8Array {
          lengthKnown = false;
          chunks = []; // Loaded chunks. Index is the chunk number
          get(idx) {
            if (idx > this.length-1 || idx < 0) {
              return undefined;
            }
            var chunkOffset = idx % this.chunkSize;
            var chunkNum = (idx / this.chunkSize)|0;
            return this.getter(chunkNum)[chunkOffset];
          }
          setDataGetter(getter) {
            this.getter = getter;
          }
          cacheLength() {
            // Find length
            var xhr = new XMLHttpRequest();
            xhr.open('HEAD', url, false);
            xhr.send(null);
            if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) abort(`Couldn't load ${url}. Status: ${xhr.status}`);
            var datalength = Number(xhr.getResponseHeader('Content-length'));
            var header;
            var hasByteServing = (header = xhr.getResponseHeader('Accept-Ranges')) && header === 'bytes';
            var usesGzip = (header = xhr.getResponseHeader('Content-Encoding')) && header === 'gzip';
  
            var chunkSize = 1024*1024; // Chunk size in bytes
  
            if (!hasByteServing) chunkSize = datalength;
  
            // Function to get a range from the remote URL.
            var doXHR = (from, to) => {
              if (from > to) abort(`invalid range (${from}, ${to}) or no bytes requested!`);
              if (to > datalength-1) abort(`only ${datalength} bytes available! programmer error!`);
  
              // TODO: Use mozResponseArrayBuffer, responseStream, etc. if available.
              var xhr = new XMLHttpRequest();
              xhr.open('GET', url, false);
              if (datalength !== chunkSize) xhr.setRequestHeader('Range', `bytes=${from}-${to}`);
  
              // Some hints to the browser that we want binary data.
              xhr.responseType = 'arraybuffer';
              if (xhr.overrideMimeType) {
                xhr.overrideMimeType('text/plain; charset=x-user-defined');
              }
  
              xhr.send(null);
              if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) abort(`Couldn't load ${url}. Status: ${xhr.status}`);
              if (xhr.response !== undefined) {
                return new Uint8Array(/** @type{Array<number>} */(xhr.response || []));
              }
              return intArrayFromString(xhr.responseText ?? '', true);
            };
            var lazyArray = this;
            lazyArray.setDataGetter((chunkNum) => {
              var start = chunkNum * chunkSize;
              var end = (chunkNum+1) * chunkSize - 1; // including this byte
              end = Math.min(end, datalength-1); // if datalength-1 is selected, this is the last block
              if (typeof lazyArray.chunks[chunkNum] == 'undefined') {
                lazyArray.chunks[chunkNum] = doXHR(start, end);
              }
              if (typeof lazyArray.chunks[chunkNum] == 'undefined') abort('doXHR failed!');
              return lazyArray.chunks[chunkNum];
            });
  
            if (usesGzip || !datalength) {
              // if the server uses gzip or doesn't supply the length, we have to download the whole file to get the (uncompressed) length
              chunkSize = datalength = 1; // this will force getter(0)/doXHR do download the whole file
              datalength = this.getter(0).length;
              chunkSize = datalength;
              out('LazyFiles on gzip forces download of the whole file when length is accessed');
            }
  
            this._length = datalength;
            this._chunkSize = chunkSize;
            this.lengthKnown = true;
          }
          get length() {
            if (!this.lengthKnown) {
              this.cacheLength();
            }
            return this._length;
          }
          get chunkSize() {
            if (!this.lengthKnown) {
              this.cacheLength();
            }
            return this._chunkSize;
          }
        }
  
        if (globalThis.XMLHttpRequest) {
          if (!ENVIRONMENT_IS_WORKER) abort('Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc');
          var lazyArray = new LazyUint8Array();
          var properties = { isDevice: false, contents: lazyArray };
        } else {
          var properties = { isDevice: false, url: url };
        }
  
        var node = FS.createFile(parent, name, properties, canRead, canWrite);
        // This is a total hack, but I want to get this lazy file code out of the
        // core of MEMFS. If we want to keep this lazy file concept I feel it should
        // be its own thin LAZYFS proxying calls to MEMFS.
        if (properties.contents) {
          node.contents = properties.contents;
        } else if (properties.url) {
          node.contents = null;
          node.url = properties.url;
        }
        // Add a function that defers querying the file size until it is asked the first time.
        Object.defineProperties(node, {
          usedBytes: {
            get: function() { return this.contents.length; }
          }
        });
        // override each stream op with one that tries to force load the lazy file first
        var stream_ops = {};
        for (const [key, fn] of Object.entries(node.stream_ops)) {
          stream_ops[key] = (...args) => {
            FS.forceLoadFile(node);
            return fn(...args);
          };
        }
        function writeChunks(stream, buffer, offset, length, position) {
          var contents = stream.node.contents;
          if (position >= contents.length)
            return 0;
          var size = Math.min(contents.length - position, length);
          assert(size >= 0);
          if (contents.slice) { // normal array
            for (var i = 0; i < size; i++) {
              buffer[offset + i] = contents[position + i];
            }
          } else {
            for (var i = 0; i < size; i++) { // LazyUint8Array from sync binary XHR
              buffer[offset + i] = contents.get(position + i);
            }
          }
          return size;
        }
        // use a custom read function
        stream_ops.read = (stream, buffer, offset, length, position) => {
          FS.forceLoadFile(node);
          return writeChunks(stream, buffer, offset, length, position)
        };
        // use a custom mmap function
        stream_ops.mmap = (stream, length, position, prot, flags) => {
          FS.forceLoadFile(node);
          var ptr = mmapAlloc(length);
          if (!ptr) {
            throw new FS.ErrnoError(48);
          }
          writeChunks(stream, HEAP8, ptr, length, position);
          return { ptr, allocated: true };
        };
        node.stream_ops = stream_ops;
        return node;
      },
  };

  var FS_createPath = (...args) => FS.createPath(...args);



  var FS_unlink = (...args) => FS.unlink(...args);

  var FS_createLazyFile = (...args) => FS.createLazyFile(...args);

  var FS_createDevice = (...args) => FS.createDevice(...args);



  var handleException = (e) => {
      // Certain exception types we do not treat as errors since they are used for
      // internal control flow.
      // 1. ExitStatus, which is thrown by exit()
      // 2. "unwind", which is thrown by emscripten_unwind_to_js_event_loop() and others
      //    that wish to return to JS event loop.
      if (e instanceof ExitStatus || e == 'unwind') {
        return EXITSTATUS;
      }
      checkStackCookie();
      if (e instanceof WebAssembly.RuntimeError) {
        if (_emscripten_stack_get_current() <= 0) {
          err('Stack overflow detected.  You can try increasing -sSTACK_SIZE (currently set to 65536)');
        }
      }
      quit_(1, e);
    };
  
  
  var runtimeKeepaliveCounter = 0;
  var keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0;
  var _proc_exit = (code) => {
      EXITSTATUS = code;
      if (!keepRuntimeAlive()) {
        Module['onExit']?.(code);
        ABORT = true;
      }
      quit_(code, new ExitStatus(code));
    };
  
  
  /** @param {boolean|number=} implicit */
  var exitJS = (status, implicit) => {
      EXITSTATUS = status;
  
      checkUnflushedContent();
  
      // if exit() was called explicitly, warn the user if the runtime isn't actually being shut down
      if (keepRuntimeAlive() && !implicit) {
        var msg = `program exited (with status: ${status}), but keepRuntimeAlive() is set (counter=${runtimeKeepaliveCounter}) due to an async operation, so halting execution but not exiting the runtime or preventing further async execution (you can use emscripten_force_exit, if you want to force a true shutdown)`;
        err(msg);
      }
  
      _proc_exit(status);
    };
  var _exit = exitJS;
  
  
  var maybeExit = () => {
      if (!keepRuntimeAlive()) {
        try {
          _exit(EXITSTATUS);
        } catch (e) {
          handleException(e);
        }
      }
    };
  var callUserCallback = (func) => {
      if (ABORT) {
        err('user callback triggered after runtime exited or application aborted.  Ignoring.');
        return;
      }
      try {
        return func();
      } catch (e) {
        handleException(e);
      } finally {
        maybeExit();
      }
    };
  
  function getFullscreenElement() {
      return document.fullscreenElement
             ?? document.webkitFullscreenElement
             ;
    }
  
  /** @param {number=} timeout */
  var safeSetTimeout = (func, timeout) => {
      
      return setTimeout(() => {
        
        callUserCallback(func);
      }, timeout);
    };
  
  
  
  
  
  var Browser = {
  useWebGL:false,
  isFullscreen:false,
  pointerLock:false,
  moduleContextCreatedCallbacks:[],
  preloadedImages:{
  },
  preloadedAudios:{
  },
  getCanvas:() => Module['canvas'],
  init() {
        if (Browser.initted) return;
        Browser.initted = true;
  
        // Support for plugins that can process preloaded files. You can add more of these to
        // your app by creating and appending to preloadPlugins.
        //
        // Each plugin is asked if it can handle a file based on the file's name. If it can,
        // it is given the file's raw data. When it is done, it calls a callback with the file's
        // (possibly modified) data. For example, a plugin might decompress a file, or it
        // might create some side data structure for use later (like an Image element, etc.).
  
        var imagePlugin = {};
        imagePlugin['canHandle'] = (name) => {
          return !Module['noImageDecoding'] && /\.(jpg|jpeg|png|bmp|webp)$/i.test(name);
        };
        imagePlugin['handle'] = async (byteArray, name) => {
          var b = new Blob([byteArray], { type: Browser.getMimetype(name) });
          if (b.size !== byteArray.length) { // Safari bug #118630
            // Safari's Blob can only take an ArrayBuffer
            b = new Blob([(new Uint8Array(byteArray)).buffer], { type: Browser.getMimetype(name) });
          }
          var url = URL.createObjectURL(b);
          return new Promise((resolve, reject) => {
            var img = new Image();
            img.onload = () => {
              assert(img.complete, `Image ${name} could not be decoded`);
              var canvas = /** @type {!HTMLCanvasElement} */ (document.createElement('canvas'));
              canvas.width = img.width;
              canvas.height = img.height;
              var ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              Browser.preloadedImages[name] = canvas;
              URL.revokeObjectURL(url);
              resolve(byteArray);
            };
            img.onerror = (event) => {
              err(`Image ${url} could not be decoded`);
              reject();
            };
            img.src = url;
          });
        };
        preloadPlugins.push(imagePlugin);
  
        var audioPlugin = {};
        audioPlugin['canHandle'] = (name) => {
          return !Module['noAudioDecoding'] && name.slice(-4) in { '.ogg': 1, '.wav': 1, '.mp3': 1 };
        };
        audioPlugin['handle'] = async (byteArray, name) => {
          return new Promise((resolve, reject) => {
            var done = false;
            function finish(audio) {
              if (done) return;
              done = true;
              Browser.preloadedAudios[name] = audio;
              resolve(byteArray);
            }
            var b = new Blob([byteArray], { type: Browser.getMimetype(name) });
            var url = URL.createObjectURL(b); // XXX we never revoke this!
            var audio = new Audio();
            audio.addEventListener('canplaythrough', () => finish(audio)); // use addEventListener due to chromium bug 124926
            audio.onerror = (event) => {
              if (done) return;
              err(`warning: browser could not fully decode audio ${name}, trying slower base64 approach`);
              function encode64(data) {
                var BASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
                var PAD = '=';
                var ret = '';
                var leftchar = 0;
                var leftbits = 0;
                for (var byte of data) {
                  leftchar = (leftchar << 8) | byte;
                  leftbits += 8;
                  while (leftbits >= 6) {
                    var curr = (leftchar >> (leftbits-6)) & 0x3f;
                    leftbits -= 6;
                    ret += BASE[curr];
                  }
                }
                if (leftbits == 2) {
                  ret += BASE[(leftchar&3) << 4];
                  ret += PAD + PAD;
                } else if (leftbits == 4) {
                  ret += BASE[(leftchar&0xf) << 2];
                  ret += PAD;
                }
                return ret;
              }
              audio.src = 'data:audio/x-' + name.slice(-3) + ';base64,' + encode64(byteArray);
              finish(audio); // we don't wait for confirmation this worked - but it's worth trying
            };
            audio.src = url;
            // workaround for chrome bug 124926 - we do not always get oncanplaythrough or onerror
            safeSetTimeout(() => {
              finish(audio); // try to use it even though it is not necessarily ready to play
            }, 10000);
          });
        };
        preloadPlugins.push(audioPlugin);
  
        // Canvas event setup
  
        function pointerLockChange() {
          var canvas = Browser.getCanvas();
          Browser.pointerLock = document.pointerLockElement === canvas;
        }
        var canvas = Browser.getCanvas();
        if (canvas) {
          // forced aspect ratio can be enabled by defining 'forcedAspectRatio' on Module
          // Module['forcedAspectRatio'] = 4 / 3;
  
          document.addEventListener('pointerlockchange', pointerLockChange);
  
          if (Module['elementPointerLock']) {
            canvas.addEventListener('click', (ev) => {
              if (!Browser.pointerLock && Browser.getCanvas().requestPointerLock) {
                Browser.getCanvas().requestPointerLock();
                ev.preventDefault();
              }
            });
          }
        }
      },
  createContext(/** @type {HTMLCanvasElement} */ canvas, useWebGL, setInModule, webGLContextAttributes) {
        if (useWebGL && Module['ctx'] && canvas == Browser.getCanvas()) return Module['ctx']; // no need to recreate GL context if it's already been created for this canvas.
  
        var ctx;
        var contextHandle;
        if (useWebGL) {
          // For GLES2/desktop GL compatibility, adjust a few defaults to be different to WebGL defaults, so that they align better with the desktop defaults.
          var contextAttributes = {
            antialias: false,
            alpha: false,
            majorVersion: (typeof WebGL2RenderingContext != 'undefined') ? 2 : 1,
          };
  
          if (webGLContextAttributes) {
            for (var attribute in webGLContextAttributes) {
              contextAttributes[attribute] = webGLContextAttributes[attribute];
            }
          }
  
          // This check of existence of GL is here to satisfy Closure compiler, which yells if variable GL is referenced below but GL object is not
          // actually compiled in because application is not doing any GL operations. TODO: Ideally if GL is not being used, this function
          // Browser.createContext() should not even be emitted.
          if (typeof GL != 'undefined') {
            contextHandle = GL.createContext(canvas, contextAttributes);
            if (contextHandle) {
              ctx = GL.getContext(contextHandle).GLctx;
            }
          }
        } else {
          ctx = canvas.getContext('2d');
        }
  
        if (!ctx) return null;
  
        if (setInModule) {
          if (!useWebGL) assert(typeof GLctx == 'undefined', 'cannot set in module if GLctx is used, but we are a non-GL context that would replace it');
          Module['ctx'] = ctx;
          if (useWebGL) GL.makeContextCurrent(contextHandle);
          Browser.useWebGL = useWebGL;
          Browser.moduleContextCreatedCallbacks.forEach((callback) => callback());
          Browser.init();
        }
        return ctx;
      },
  fullscreenHandlersInstalled:false,
  lockPointer:undefined,
  resizeCanvas:undefined,
  requestFullscreen(lockPointer, resizeCanvas) {
        Browser.lockPointer = lockPointer;
        Browser.resizeCanvas = resizeCanvas;
        if (typeof Browser.lockPointer == 'undefined') Browser.lockPointer = true;
        if (typeof Browser.resizeCanvas == 'undefined') Browser.resizeCanvas = false;
  
        var canvas = Browser.getCanvas();
        function fullscreenChange() {
          Browser.isFullscreen = false;
          var canvasContainer = canvas.parentNode;
          if (getFullscreenElement() === canvasContainer) {
            canvas.exitFullscreen = Browser.exitFullscreen;
            if (Browser.lockPointer) canvas.requestPointerLock();
            Browser.isFullscreen = true;
            if (Browser.resizeCanvas) {
              Browser.setFullscreenCanvasSize();
            } else {
              Browser.updateCanvasDimensions(canvas);
            }
          } else {
            // remove the full screen specific parent of the canvas again to restore the HTML structure from before going full screen
            canvasContainer.parentNode.insertBefore(canvas, canvasContainer);
            canvasContainer.parentNode.removeChild(canvasContainer);
  
            if (Browser.resizeCanvas) {
              Browser.setWindowedCanvasSize();
            } else {
              Browser.updateCanvasDimensions(canvas);
            }
          }
        }
  
        if (!Browser.fullscreenHandlersInstalled) {
          Browser.fullscreenHandlersInstalled = true;
          document.addEventListener('fullscreenchange', fullscreenChange);
          document.addEventListener('webkitfullscreenchange', fullscreenChange);
        }
  
        // create a new parent to ensure the canvas has no siblings. this allows browsers to optimize full screen performance when its parent is the full screen root
        var canvasContainer = document.createElement('div');
        canvas.parentNode.insertBefore(canvasContainer, canvas);
        canvasContainer.appendChild(canvas);
  
        // use parent of canvas as full screen root to allow aspect ratio correction (Firefox stretches the root to screen size)
        // Safari didn't support Element.requestFullscreen until 16.4
        // See: https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen
        /** @suppress {checkTypes} */
        canvasContainer.requestFullscreen ??= (canvasContainer['webkitRequestFullscreen'] ? () => canvasContainer['webkitRequestFullscreen'](Element.ALLOW_KEYBOARD_INPUT) : null) ??
                                              (canvasContainer['webkitRequestFullScreen'] ? () => canvasContainer['webkitRequestFullScreen'](Element.ALLOW_KEYBOARD_INPUT) : null);
  
        canvasContainer.requestFullscreen();
      },
  exitFullscreen() {
        // This is workaround for chrome. Trying to exit from fullscreen
        // not in fullscreen state will cause 'TypeError: Document not active'
        // in chrome. See https://github.com/emscripten-core/emscripten/pull/8236
        if (!Browser.isFullscreen) {
          return false;
        }
  
        var CFS = document.exitFullscreen ?? document['webkitCancelFullScreen'];
        CFS.apply(document, []);
        return true;
      },
  safeSetTimeout(func, timeout) {
        // Legacy function, this is used by the SDL2 port so we need to keep it
        // around at least until that is updated.
        // See https://github.com/libsdl-org/SDL/pull/6304
        return safeSetTimeout(func, timeout);
      },
  getMimetype(name) {
        return {
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'png': 'image/png',
          'bmp': 'image/bmp',
          'ogg': 'audio/ogg',
          'wav': 'audio/wav',
          'mp3': 'audio/mpeg'
        }[name.slice(name.lastIndexOf('.')+1)];
      },
  getUserMedia(func) {
        return navigator.mediaDevices.getUserMedia(func);
      },
  getMouseWheelDelta(event) {
        var delta = 0;
        switch (event.type) {
          case 'DOMMouseScroll':
            // 3 lines make up a step
            delta = event.detail / 3;
            break;
          case 'mousewheel':
            // 120 units make up a step
            delta = event.wheelDelta / 120;
            break;
          case 'wheel':
            delta = event.deltaY
            switch (event.deltaMode) {
              case 0:
                // DOM_DELTA_PIXEL: 100 pixels make up a step
                delta /= 100;
                break;
              case 1:
                // DOM_DELTA_LINE: 3 lines make up a step
                delta /= 3;
                break;
              case 2:
                // DOM_DELTA_PAGE: A page makes up 80 steps
                delta *= 80;
                break;
              default:
                abort('unrecognized mouse wheel delta mode: ' + event.deltaMode);
            }
            break;
          default:
            abort('unrecognized mouse wheel event: ' + event.type);
        }
        return delta;
      },
  mouseX:0,
  mouseY:0,
  mouseMovementX:0,
  mouseMovementY:0,
  touches:{
  },
  lastTouches:{
  },
  calculateMouseCoords(pageX, pageY) {
        // Calculate the movement based on the changes
        // in the coordinates.
        var canvas = Browser.getCanvas();
        var rect = canvas.getBoundingClientRect();
  
        var adjustedX = pageX - (window.scrollX + rect.left);
        var adjustedY = pageY - (window.scrollY + rect.top);
  
        // the canvas might be CSS-scaled compared to its backbuffer;
        // SDL-using content will want mouse coordinates in terms
        // of backbuffer units.
        adjustedX = adjustedX * (canvas.width / rect.width);
        adjustedY = adjustedY * (canvas.height / rect.height);
  
        return { x: adjustedX, y: adjustedY };
      },
  setMouseCoords(pageX, pageY) {
        const {x, y} = Browser.calculateMouseCoords(pageX, pageY);
        Browser.mouseMovementX = x - Browser.mouseX;
        Browser.mouseMovementY = y - Browser.mouseY;
        Browser.mouseX = x;
        Browser.mouseY = y;
      },
  calculateMouseEvent(event) { // event should be mousemove, mousedown or mouseup
        if (Browser.pointerLock) {
          // When the pointer is locked, calculate the coordinates
          // based on the movement of the mouse.
          Browser.mouseMovementX = event.movementX;
          Browser.mouseMovementY = event.movementY;
  
          // add the mouse delta to the current absolute mouse position
          Browser.mouseX += Browser.mouseMovementX;
          Browser.mouseY += Browser.mouseMovementY;
        } else {
          if (event.type === 'touchstart' || event.type === 'touchend' || event.type === 'touchmove') {
            var touch = event.touch;
            if (touch === undefined) {
              return; // the 'touch' property is only defined in SDL
  
            }
            var coords = Browser.calculateMouseCoords(touch.pageX, touch.pageY);
  
            if (event.type === 'touchstart') {
              Browser.lastTouches[touch.identifier] = coords;
              Browser.touches[touch.identifier] = coords;
            } else if (event.type === 'touchend' || event.type === 'touchmove') {
              var last = Browser.touches[touch.identifier];
              last ||= coords;
              Browser.lastTouches[touch.identifier] = last;
              Browser.touches[touch.identifier] = coords;
            }
            return;
          }
  
          Browser.setMouseCoords(event.pageX, event.pageY);
        }
      },
  resizeListeners:[],
  updateResizeListeners() {
        var canvas = Browser.getCanvas();
        Browser.resizeListeners.forEach((listener) => listener(canvas.width, canvas.height));
      },
  setCanvasSize(width, height, noUpdates) {
        var canvas = Browser.getCanvas();
        Browser.updateCanvasDimensions(canvas, width, height);
        if (!noUpdates) Browser.updateResizeListeners();
      },
  windowedWidth:0,
  windowedHeight:0,
  setFullscreenCanvasSize() {
        // check if SDL is available
        if (typeof SDL != 'undefined') {
          var flags = HEAPU32[((SDL.screen)>>2)];
          flags = flags | 0x00800000; // set SDL_FULLSCREEN flag
          HEAP32[((SDL.screen)>>2)] = flags;
        }
        Browser.updateCanvasDimensions(Browser.getCanvas());
        Browser.updateResizeListeners();
      },
  setWindowedCanvasSize() {
        // check if SDL is available
        if (typeof SDL != 'undefined') {
          var flags = HEAPU32[((SDL.screen)>>2)];
          flags = flags & ~0x00800000; // clear SDL_FULLSCREEN flag
          HEAP32[((SDL.screen)>>2)] = flags;
        }
        Browser.updateCanvasDimensions(Browser.getCanvas());
        Browser.updateResizeListeners();
      },
  updateCanvasDimensions(canvas, wNative, hNative) {
        if (wNative && hNative) {
          canvas.widthNative = wNative;
          canvas.heightNative = hNative;
        } else {
          wNative = canvas.widthNative;
          hNative = canvas.heightNative;
        }
        var w = wNative;
        var h = hNative;
        if ((getFullscreenElement() === canvas.parentNode) && (typeof screen != 'undefined')) {
           var factor = Math.min(screen.width / w, screen.height / h);
           w = Math.round(w * factor);
           h = Math.round(h * factor);
        }
        if (Browser.resizeCanvas) {
          if (canvas.width  != w) canvas.width  = w;
          if (canvas.height != h) canvas.height = h;
          if (typeof canvas.style != 'undefined') {
            canvas.style.removeProperty( 'width');
            canvas.style.removeProperty('height');
          }
        } else {
          if (canvas.width  != wNative) canvas.width  = wNative;
          if (canvas.height != hNative) canvas.height = hNative;
          if (typeof canvas.style != 'undefined') {
            if (w != wNative || h != hNative) {
              canvas.style.setProperty( 'width', w + 'px', 'important');
              canvas.style.setProperty('height', h + 'px', 'important');
            } else {
              canvas.style.removeProperty( 'width');
              canvas.style.removeProperty('height');
            }
          }
        }
      },
  };
  var createContext = Browser.createContext;

  FS.createPreloadedFile = FS_createPreloadedFile;
  FS.preloadFile = FS_preloadFile;
  FS.staticInit();;
// End JS library code

// include: postlibrary.js
// This file is included after the automatically-generated JS library code
// but before the wasm module is created.

{

  // Begin ATMODULES hooks
  if (Module['noExitRuntime']) noExitRuntime = Module['noExitRuntime'];

if (Module['print']) out = Module['print'];
if (Module['printErr']) err = Module['printErr'];
  // End ATMODULES hooks

  checkIncomingModuleAPI();

  if (Module['arguments']) programArgs = Module['arguments'];
  if (Module['thisProgram']) thisProgram = Module['thisProgram'];

  // Assertions on removed incoming Module JS APIs.
  assert(typeof Module['memoryInitializerPrefixURL'] == 'undefined', 'Module.memoryInitializerPrefixURL option was removed, use Module.locateFile instead');
  assert(typeof Module['pthreadMainPrefixURL'] == 'undefined', 'Module.pthreadMainPrefixURL option was removed, use Module.locateFile instead');
  assert(typeof Module['cdInitializerPrefixURL'] == 'undefined', 'Module.cdInitializerPrefixURL option was removed, use Module.locateFile instead');
  assert(typeof Module['filePackagePrefixURL'] == 'undefined', 'Module.filePackagePrefixURL option was removed, use Module.locateFile instead');
  assert(typeof Module['read'] == 'undefined', 'Module.read option was removed');
  assert(typeof Module['readAsync'] == 'undefined', 'Module.readAsync option was removed (modify readAsync in JS)');
  assert(typeof Module['readBinary'] == 'undefined', 'Module.readBinary option was removed (modify readBinary in JS)');
  assert(typeof Module['setWindowTitle'] == 'undefined', 'Module.setWindowTitle option was removed (modify emscripten_set_window_title in JS)');
  assert(typeof Module['TOTAL_MEMORY'] == 'undefined', 'Module.TOTAL_MEMORY has been renamed Module.INITIAL_MEMORY');
  assert(typeof Module['ENVIRONMENT'] == 'undefined', 'Module.ENVIRONMENT has been deprecated. To force the environment, use the ENVIRONMENT compile-time option (for example, -sENVIRONMENT=web or -sENVIRONMENT=node)');
  assert(typeof Module['STACK_SIZE'] == 'undefined', 'STACK_SIZE can no longer be set at runtime.  Use -sSTACK_SIZE at link time')
  // If memory is defined in wasm, the user can't provide it, or set INITIAL_MEMORY
  assert(typeof Module['wasmMemory'] == 'undefined', 'Use of `wasmMemory` detected.  Use -sIMPORTED_MEMORY to define wasmMemory externally');
  assert(typeof Module['INITIAL_MEMORY'] == 'undefined', 'Detected runtime INITIAL_MEMORY setting.  Use -sIMPORTED_MEMORY to define wasmMemory dynamically');

  var preInit = Module['preInit'];
  if (preInit) {
    if (typeof preInit == 'function') Module['preInit'] = preInit = [preInit];
    // Written as a loop so that preInit functions that themselves add more
    // preInit functions.  Is this actually needed?
    while (preInit.length > 0) {
      preInit.shift()();
    }
  }
  consumedModuleProp('preInit');
}

// Begin runtime exports
  Module['addRunDependency'] = addRunDependency;
  Module['removeRunDependency'] = removeRunDependency;
  Module['createContext'] = createContext;
  Module['FS_preloadFile'] = FS_preloadFile;
  Module['FS_unlink'] = FS_unlink;
  Module['FS_createPath'] = FS_createPath;
  Module['FS_createDevice'] = FS_createDevice;
  Module['FS_createDataFile'] = FS_createDataFile;
  Module['FS_createLazyFile'] = FS_createLazyFile;
  var missingLibrarySymbols = [
  'writeI53ToI64',
  'writeI53ToI64Clamped',
  'writeI53ToI64Signaling',
  'writeI53ToU64Clamped',
  'writeI53ToU64Signaling',
  'readI53FromI64',
  'readI53FromU64',
  'convertI32PairToI53',
  'convertI32PairToI53Checked',
  'convertU32PairToI53',
  'bigintToI53Checked',
  'stackAlloc',
  'getTempRet0',
  'setTempRet0',
  'createNamedFunction',
  'zeroMemory',
  'getHeapMax',
  'growMemory',
  'withStackSave',
  'inetPton4',
  'inetNtop4',
  'inetPton6',
  'inetNtop6',
  'readSockaddr',
  'writeSockaddr',
  'readEmAsmArgs',
  'jstoi_q',
  'getExecutableName',
  'autoResumeAudioContext',
  'getDynCaller',
  'dynCall',
  'runtimeKeepalivePush',
  'runtimeKeepalivePop',
  'asmjsMangle',
  'alignMemory',
  'HandleAllocator',
  'addOnInit',
  'addOnPostCtor',
  'addOnPreMain',
  'addOnExit',
  'STACK_SIZE',
  'STACK_ALIGN',
  'POINTER_SIZE',
  'ASSERTIONS',
  'ccall',
  'cwrap',
  'convertJsFunctionToWasm',
  'getEmptyTableSlot',
  'updateTableMap',
  'getFunctionAddress',
  'addFunction',
  'removeFunction',
  'setValue',
  'getValue',
  'stringToUTF8',
  'intArrayToString',
  'AsciiToString',
  'stringToAscii',
  'UTF16ToString',
  'stringToUTF16',
  'lengthBytesUTF16',
  'UTF32ToString',
  'stringToUTF32',
  'lengthBytesUTF32',
  'stringToNewUTF8',
  'stringToUTF8OnStack',
  'writeArrayToMemory',
  'registerKeyEventCallback',
  'maybeCStringToJsString',
  'findEventTarget',
  'getBoundingClientRect',
  'fillMouseEventData',
  'registerMouseEventCallback',
  'registerWheelEventCallback',
  'registerUiEventCallback',
  'registerFocusEventCallback',
  'fillDeviceOrientationEventData',
  'registerDeviceOrientationEventCallback',
  'fillDeviceMotionEventData',
  'registerDeviceMotionEventCallback',
  'screenOrientation',
  'fillOrientationChangeEventData',
  'registerOrientationChangeEventCallback',
  'fillFullscreenChangeEventData',
  'registerFullscreenChangeEventCallback',
  'callCanvasResizedCallback',
  'JSEvents_requestFullscreen',
  'JSEvents_resizeCanvasForFullscreen',
  'registerRestoreOldStyle',
  'hideEverythingExceptGivenElement',
  'restoreHiddenElements',
  'setLetterbox',
  'currentFullscreenStrategy',
  'softFullscreenResizeWebGLRenderTarget',
  'doRequestFullscreen',
  'fillPointerlockChangeEventData',
  'registerPointerlockChangeEventCallback',
  'registerPointerlockErrorEventCallback',
  'requestPointerLock',
  'fillVisibilityChangeEventData',
  'registerVisibilityChangeEventCallback',
  'registerTouchEventCallback',
  'fillGamepadEventData',
  'registerGamepadEventCallback',
  'registerBeforeUnloadEventCallback',
  'fillBatteryEventData',
  'registerBatteryEventCallback',
  'setCanvasElementSize',
  'getCanvasElementSize',
  'jsStackTrace',
  'getCallstack',
  'convertPCtoSourceLocation',
  'getEnvStrings',
  'checkWasiClock',
  'doReadv',
  'doWritev',
  'wasiRightsToMuslOFlags',
  'wasiOFlagsToMuslOFlags',
  'setImmediateWrapped',
  'safeRequestAnimationFrame',
  'clearImmediateWrapped',
  'registerPostMainLoop',
  'registerPreMainLoop',
  'getPromise',
  'makePromise',
  'addPromise',
  'idsToPromises',
  'makePromiseCallback',
  'Browser_asyncPrepareDataCounter',
  'isLeapYear',
  'ydayFromDate',
  'arraySum',
  'addDays',
  'getSocketFromFD',
  'getSocketAddress',
  'FS_mkdirTree',
  '_setNetworkCallback',
  'heapObjectForWebGLType',
  'toTypedArrayIndex',
  'webgl_enable_ANGLE_instanced_arrays',
  'webgl_enable_OES_vertex_array_object',
  'webgl_enable_WEBGL_draw_buffers',
  'webgl_enable_WEBGL_multi_draw',
  'webgl_enable_EXT_polygon_offset_clamp',
  'webgl_enable_EXT_clip_control',
  'webgl_enable_WEBGL_polygon_mode',
  'emscriptenWebGLGet',
  'computeUnpackAlignedImageSize',
  'colorChannelsInGlTextureFormat',
  'emscriptenWebGLGetTexPixelData',
  'emscriptenWebGLGetUniform',
  'webglGetProgramUniformLocation',
  'webglGetUniformLocation',
  'webglPrepareUniformLocationsBeforeFirstUse',
  'webglGetLeftBracePos',
  'emscriptenWebGLGetVertexAttrib',
  '__glGetActiveAttribOrUniform',
  'writeGLArray',
  'registerWebGlEventCallback',
  'runAndAbortIfError',
  'emscriptenWebGLGetIndexed',
  'webgl_enable_WEBGL_draw_instanced_base_vertex_base_instance',
  'webgl_enable_WEBGL_multi_draw_instanced_base_vertex_base_instance',
  'writeStringToMemory',
  'writeAsciiToMemory',
  'allocateUTF8',
  'allocateUTF8OnStack',
  'stackTrace',
  'getNativeTypeSize',
];
missingLibrarySymbols.forEach(missingLibrarySymbol)

  var unexportedSymbols = [
  'run',
  'out',
  'err',
  'callMain',
  'abort',
  'wasmExports',
  'writeStackCookie',
  'checkStackCookie',
  'INT53_MAX',
  'INT53_MIN',
  'HEAP8',
  'HEAPU8',
  'HEAP16',
  'HEAPU16',
  'HEAP32',
  'HEAPU32',
  'HEAPF32',
  'HEAPF64',
  'HEAP64',
  'HEAPU64',
  'stackSave',
  'stackRestore',
  'ptrToString',
  'exitJS',
  'ENV',
  'ERRNO_CODES',
  'strError',
  'DNS',
  'Protocols',
  'Sockets',
  'timers',
  'warnOnce',
  'readEmAsmArgsArray',
  'handleException',
  'keepRuntimeAlive',
  'callUserCallback',
  'maybeExit',
  'asyncLoad',
  'mmapAlloc',
  'wasmTable',
  'wasmMemory',
  'getUniqueRunDependency',
  'noExitRuntime',
  'addOnPreRun',
  'addOnPostRun',
  'freeTableIndexes',
  'functionsInTableMap',
  'PATH',
  'PATH_FS',
  'UTF8Decoder',
  'UTF8ArrayToString',
  'UTF8ToString',
  'stringToUTF8Array',
  'lengthBytesUTF8',
  'intArrayFromString',
  'UTF16Decoder',
  'JSEvents',
  'specialHTMLTargets',
  'findCanvasEventTarget',
  'restoreOldWindowedStyle',
  'UNWIND_CACHE',
  'ExitStatus',
  'initRandomFill',
  'randomFill',
  'safeSetTimeout',
  'emSetImmediate',
  'emClearImmediate_deps',
  'emClearImmediate',
  'promiseMap',
  'Browser',
  'requestFullscreen',
  'setCanvasSize',
  'getUserMedia',
  'getPreloadedImageData__data',
  'wget',
  'MONTH_DAYS_REGULAR',
  'MONTH_DAYS_LEAP',
  'MONTH_DAYS_REGULAR_CUMULATIVE',
  'MONTH_DAYS_LEAP_CUMULATIVE',
  'SYSCALLS',
  'preloadPlugins',
  'FS_createPreloadedFile',
  'FS_modeStringToFlags',
  'FS_getMode',
  'FS_fileDataToTypedArray',
  'FS_stdin_getChar_buffer',
  'FS_stdin_getChar',
  'FS_readFile',
  'FS',
  'FS_root',
  'FS_mounts',
  'FS_devices',
  'FS_streams',
  'FS_nextInode',
  'FS_nameTable',
  'FS_currentPath',
  'FS_initialized',
  'FS_ignorePermissions',
  'FS_filesystems',
  'FS_syncFSRequests',
  'FS_lookupPath',
  'FS_getPath',
  'FS_hashName',
  'FS_hashAddNode',
  'FS_hashRemoveNode',
  'FS_lookupNode',
  'FS_createNode',
  'FS_destroyNode',
  'FS_isRoot',
  'FS_isMountpoint',
  'FS_isFile',
  'FS_isDir',
  'FS_isLink',
  'FS_isChrdev',
  'FS_isBlkdev',
  'FS_isFIFO',
  'FS_isSocket',
  'FS_flagsToPermissionString',
  'FS_nodePermissions',
  'FS_mayLookup',
  'FS_mayCreate',
  'FS_mayDelete',
  'FS_mayOpen',
  'FS_checkOpExists',
  'FS_nextfd',
  'FS_getStreamChecked',
  'FS_getStream',
  'FS_createStream',
  'FS_closeStream',
  'FS_dupStream',
  'FS_doSetAttr',
  'FS_chrdev_stream_ops',
  'FS_major',
  'FS_minor',
  'FS_makedev',
  'FS_registerDevice',
  'FS_getDevice',
  'FS_getMounts',
  'FS_syncfs',
  'FS_mount',
  'FS_unmount',
  'FS_lookup',
  'FS_mknod',
  'FS_statfs',
  'FS_statfsStream',
  'FS_statfsNode',
  'FS_create',
  'FS_mkdir',
  'FS_mkdev',
  'FS_symlink',
  'FS_link',
  'FS_rename',
  'FS_rmdir',
  'FS_readdir',
  'FS_readlink',
  'FS_stat',
  'FS_fstat',
  'FS_lstat',
  'FS_doChmod',
  'FS_chmod',
  'FS_lchmod',
  'FS_fchmod',
  'FS_doChown',
  'FS_chown',
  'FS_lchown',
  'FS_fchown',
  'FS_doTruncate',
  'FS_truncate',
  'FS_ftruncate',
  'FS_utime',
  'FS_open',
  'FS_close',
  'FS_isClosed',
  'FS_llseek',
  'FS_read',
  'FS_write',
  'FS_mmap',
  'FS_msync',
  'FS_ioctl',
  'FS_writeFile',
  'FS_cwd',
  'FS_chdir',
  'FS_createDefaultDirectories',
  'FS_createDefaultDevices',
  'FS_createSpecialDirectories',
  'FS_createStandardStreams',
  'FS_staticInit',
  'FS_init',
  'FS_quit',
  'FS_findObject',
  'FS_analyzePath',
  'FS_createFile',
  'FS_forceLoadFile',
  'MEMFS',
  'TTY',
  'PIPEFS',
  'SOCKFS',
  'tempFixedLengthArray',
  'miniTempWebGLFloatBuffers',
  'miniTempWebGLIntBuffers',
  'GL',
  'AL',
  'GLUT',
  'EGL',
  'GLEW',
  'IDBStore',
  'print',
  'printErr',
  'jstoi_s',
];
unexportedSymbols.forEach(unexportedRuntimeSymbol);

  // End runtime exports
  // Begin JS library exports
  // End JS library exports

// end include: postlibrary.js

function checkIncomingModuleAPI() {
  ignoredModuleProp('fetchSettings');
  ignoredModuleProp('logReadFiles');
  ignoredModuleProp('loadSplitModule');
  ignoredModuleProp('onMalloc');
  ignoredModuleProp('onRealloc');
  ignoredModuleProp('onFree');
  ignoredModuleProp('onSbrkGrow');
  ignoredModuleProp('onCOSCacheHit');
  ignoredModuleProp('onCOSCacheMiss');
  ignoredModuleProp('onCOSStore');
  ignoredModuleProp('GL_MAX_TEXTURE_IMAGE_UNITS');
  ignoredModuleProp('SDL_canPlayWithWebAudio');
  ignoredModuleProp('SDL_numSimultaneouslyQueuedBuffers');
  ignoredModuleProp('freePreloadedMediaOnUse');
  ignoredModuleProp('preinitializedWebGLContext');
  ignoredModuleProp('keyboardListeningElement');
  ignoredModuleProp('doNotCaptureKeyboard');
  ignoredModuleProp('extraStackTrace');
  ignoredModuleProp('preloadPlugins');
  ignoredModuleProp('preMainLoop');
  ignoredModuleProp('postMainLoop');
  ignoredModuleProp('forcedAspectRatio');
  ignoredModuleProp('mainScriptUrlOrBlob');
  ignoredModuleProp('onFullScreen');
  ignoredModuleProp('INITIAL_MEMORY');
  ignoredModuleProp('wasmMemory');
  ignoredModuleProp('wasmBinary');
}

// Imports from the Wasm binary.
var _fflush = makeInvalidEarlyAccess('_fflush');
var _strerror = makeInvalidEarlyAccess('_strerror');
var _emscripten_stack_init = makeInvalidEarlyAccess('_emscripten_stack_init');
var _emscripten_stack_get_free = makeInvalidEarlyAccess('_emscripten_stack_get_free');
var _emscripten_stack_get_base = makeInvalidEarlyAccess('_emscripten_stack_get_base');
var _emscripten_stack_get_end = makeInvalidEarlyAccess('_emscripten_stack_get_end');
var __emscripten_stack_restore = makeInvalidEarlyAccess('__emscripten_stack_restore');
var __emscripten_stack_alloc = makeInvalidEarlyAccess('__emscripten_stack_alloc');
var _emscripten_stack_get_current = makeInvalidEarlyAccess('_emscripten_stack_get_current');
var memory = makeInvalidEarlyAccess('memory');
var __indirect_function_table = makeInvalidEarlyAccess('__indirect_function_table');
var wasmMemory = makeInvalidEarlyAccess('wasmMemory');

function assignWasmExports(wasmExports) {
  assert(typeof wasmExports['fflush'] != 'undefined', 'missing Wasm export: fflush');
  assert(typeof wasmExports['strerror'] != 'undefined', 'missing Wasm export: strerror');
  assert(typeof wasmExports['emscripten_stack_init'] != 'undefined', 'missing Wasm export: emscripten_stack_init');
  assert(typeof wasmExports['emscripten_stack_get_free'] != 'undefined', 'missing Wasm export: emscripten_stack_get_free');
  assert(typeof wasmExports['emscripten_stack_get_base'] != 'undefined', 'missing Wasm export: emscripten_stack_get_base');
  assert(typeof wasmExports['emscripten_stack_get_end'] != 'undefined', 'missing Wasm export: emscripten_stack_get_end');
  assert(typeof wasmExports['_emscripten_stack_restore'] != 'undefined', 'missing Wasm export: _emscripten_stack_restore');
  assert(typeof wasmExports['_emscripten_stack_alloc'] != 'undefined', 'missing Wasm export: _emscripten_stack_alloc');
  assert(typeof wasmExports['emscripten_stack_get_current'] != 'undefined', 'missing Wasm export: emscripten_stack_get_current');
  assert(typeof wasmExports['memory'] != 'undefined', 'missing Wasm export: memory');
  assert(typeof wasmExports['__indirect_function_table'] != 'undefined', 'missing Wasm export: __indirect_function_table');
  _fflush = createExportWrapper('fflush', wasmExports['fflush'], 1);
  _strerror = createExportWrapper('strerror', wasmExports['strerror'], 1);
  _emscripten_stack_init = wasmExports['emscripten_stack_init'];
  _emscripten_stack_get_free = wasmExports['emscripten_stack_get_free'];
  _emscripten_stack_get_base = wasmExports['emscripten_stack_get_base'];
  _emscripten_stack_get_end = wasmExports['emscripten_stack_get_end'];
  __emscripten_stack_restore = wasmExports['_emscripten_stack_restore'];
  __emscripten_stack_alloc = wasmExports['_emscripten_stack_alloc'];
  _emscripten_stack_get_current = wasmExports['emscripten_stack_get_current'];
  memory = wasmMemory = wasmExports['memory'];
  __indirect_function_table = wasmExports['__indirect_function_table'];
}

var wasmImports = {
  
};


// include: postamble.js
// === Auto-generated postamble setup entry stuff ===

var calledRun;

function stackCheckInit() {
  // This is normally called automatically during __wasm_call_ctors but need to
  // get these values before even running any of the ctors so we call it redundantly
  // here.
  _emscripten_stack_init();
  // TODO(sbc): Move writeStackCookie to native to to avoid this.
  writeStackCookie();
}

async function run() {
  assert(!calledRun);
  calledRun = true;

  stackCheckInit();

  preRun();

  if (runDependencies) {
    await resolveRunDependencies();
  }

  var setStatus = Module['setStatus'];
  if (setStatus) {
    setStatus('Running...');
    // Yield to the event loop to allow the browser to paint "Running..."
    await new Promise((resolve) => setTimeout(resolve, 1));
    // Then we want to clear the status text, but only after the rest of this function runs.
    setTimeout(setStatus, 1, '');
  }

  if (ABORT) return;

  initRuntime();

  Module['onRuntimeInitialized']?.();
  consumedModuleProp('onRuntimeInitialized');

  assert(!Module['_main'], 'compiled without a main, but one is present. if you added it from JS, use Module["onRuntimeInitialized"]');

  postRun();
}

function checkUnflushedContent() {
  // Compiler settings do not allow exiting the runtime, so flushing
  // the streams is not possible. but in ASSERTIONS mode we check
  // if there was something to flush, and if so tell the user they
  // should request that the runtime be exitable.
  // Normally we would not even include flush() at all, but in ASSERTIONS
  // builds we do so just for this check, and here we see if there is any
  // content to flush, that is, we check if there would have been
  // something a non-ASSERTIONS build would have not seen.
  // How we flush the streams depends on whether we are in SYSCALLS_REQUIRE_FILESYSTEM=0
  // mode (which has its own special function for this; otherwise, all
  // the code is inside libc)
  var oldOut = out;
  var oldErr = err;
  var has = false;
  out = err = (x) => {
    has = true;
  }
  try { // it doesn't matter if it fails
    _fflush(0);
    // also flush in the JS FS layer
    for (var name of ['stdout', 'stderr']) {
      var info = FS.analyzePath('/dev/' + name);
      if (!info) return;
      var stream = info.object;
      var rdev = stream.rdev;
      var tty = TTY.ttys[rdev];
      if (tty?.output?.length) {
        has = true;
      }
    }
  } catch(e) {}
  out = oldOut;
  err = oldErr;
  if (has) {
    warnOnce('stdio streams had content in them that was not flushed. you should set EXIT_RUNTIME to 1 (see the Emscripten FAQ), or make sure to emit a newline when you printf etc.');
  }
}

var wasmExports;

// With async instantation wasmExports is assigned asynchronously when the
// instance is received.
createWasm().then(() => run());

// end include: postamble.js

