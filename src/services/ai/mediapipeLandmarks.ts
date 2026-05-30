import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import { Landmark } from './liveness';

// Cache directory path on the device filesystem
export const MEDIAPIPE_CACHE_DIR = FileSystem.documentDirectory + 'mediapipe/';

// Map of assets to require and bundle via Metro, loaded lazily to prevent eager execution in Node/Jest tests
let assetsMap: { [key: string]: any } | null = null;
function getAssetsMap() {
  if (!assetsMap) {
    assetsMap = {
      'face_mesh.js': require('../../../assets/mediapipe/face_mesh_js.bin'),
      'face_mesh.binarypb': require('../../../assets/mediapipe/face_mesh.binarypb'),
      'face_mesh_solution_packed_assets_loader.js': require('../../../assets/mediapipe/face_mesh_solution_packed_assets_loader_js.bin'),
      'face_mesh_solution_packed_assets.data': require('../../../assets/mediapipe/face_mesh_solution_packed_assets.data'),
      'face_mesh_solution_simd_wasm_bin.js': require('../../../assets/mediapipe/face_mesh_solution_simd_wasm_bin_js.bin'),
      'face_mesh_solution_simd_wasm_bin.wasm': require('../../../assets/mediapipe/face_mesh_solution_simd_wasm_bin.wasm'),
      'face_mesh_solution_wasm_bin.js': require('../../../assets/mediapipe/face_mesh_solution_wasm_bin_js.bin'),
      'face_mesh_solution_wasm_bin.wasm': require('../../../assets/mediapipe/face_mesh_solution_wasm_bin.wasm'),
    };
  }
  return assetsMap;
}

let webViewRef: any = null;
let pendingResolve: ((result: { landmarks: Landmark[] | null; confidence: number } | null) => void) | null = null;
let isWebViewReady = false;
let onReadyCallback: (() => void) | null = null;

/**
 * Register WebView reference for scripting.
 * Passing null (on unmount) also resets the ready flag so the next
 * FaceAuthenticator mount waits for a genuine "ready" message.
 */
export function setWebViewRef(ref: any) {
  webViewRef = ref;
  if (!ref) {
    isWebViewReady = false;
  }
}

/**
 * Returns whether WebView is ready to process frames.
 */
export function getIsWebViewReady(): boolean {
  return isWebViewReady;
}

/**
 * Register a one-shot callback to be invoked when MediaPipe inside WebView
 * sends its "ready" message. Allows FaceAuthenticator to defer startAuth.
 */
export function setOnWebViewReady(cb: () => void) {
  onReadyCallback = cb;
  // If already ready (e.g. navigated back), fire immediately
  if (isWebViewReady) cb();
}

/**
 * Returns the file:// URI of the bundled MediaPipe HTML page.
 * Only valid after ensureMediaPipeAssets() has completed.
 */
export function getMediaPipeHTMLUri(): string {
  return MEDIAPIPE_CACHE_DIR + 'index.html';
}

/**
 * Copies the bundled MediaPipe assets from application package to the local documents
 * directory so they can be read by WebView via file:// protocol without CORS blocks.
 */
export async function ensureMediaPipeAssets(onProgress?: (progress: number) => void): Promise<void> {
  const dirInfo = await FileSystem.getInfoAsync(MEDIAPIPE_CACHE_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(MEDIAPIPE_CACHE_DIR, { intermediates: true });
  }

  const assets = getAssetsMap();
  const fileKeys = Object.keys(assets);
  for (let i = 0; i < fileKeys.length; i++) {
    const filename = fileKeys[i];
    const assetRequire = assets[filename];
    const targetPath = MEDIAPIPE_CACHE_DIR + filename;
    const fileInfo = await FileSystem.getInfoAsync(targetPath);

    if (!fileInfo.exists) {
      console.log(`Extracting bundled asset to cache: ${filename}...`);
      const asset = Asset.fromModule(assetRequire);
      await asset.downloadAsync();
      if (asset.localUri) {
        await FileSystem.copyAsync({
          from: asset.localUri,
          to: targetPath,
        });
      } else {
        throw new Error(`Failed to download bundled asset: ${filename}`);
      }
    }
    if (onProgress) {
      onProgress(Math.round(((i + 1) / fileKeys.length) * 100));
    }
  }
  console.log('All MediaPipe FaceMesh assets cached locally!');
  // Write index.html to the cache dir so WebView can load via file:// URI
  await writeMediaPipeHTML();
}

/**
 * Writes the MediaPipe HTML runner as index.html inside MEDIAPIPE_CACHE_DIR.
 * Reads face_mesh.binarypb (939 bytes) as base64 and inlines it directly into the HTML
 * as a blob URL — this avoids any XHR/fetch for the graph definition file.
 */
async function writeMediaPipeHTML(): Promise<void> {
  const htmlPath = MEDIAPIPE_CACHE_DIR + 'index.html';
  let binarypbBase64 = '';
  try {
    binarypbBase64 = await FileSystem.readAsStringAsync(
      MEDIAPIPE_CACHE_DIR + 'face_mesh.binarypb',
      { encoding: FileSystem.EncodingType.Base64 }
    );
    console.log('face_mesh.binarypb read for inline injection, length:', binarypbBase64.length);
  } catch (e) {
    console.warn('Could not read binarypb for inline injection:', e);
  }
  const html = MEDIAPIPE_HTML.replace('__BINARYPB_BASE64__', binarypbBase64);
  await FileSystem.writeAsStringAsync(htmlPath, html, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

/**
 * Sends image data to WebView for face mesh landmarks extraction.
 */
export function processImageForLandmarks(
  base64Jpeg: string
): Promise<{ landmarks: Landmark[] | null; confidence: number } | null> {
  return new Promise((resolve) => {
    if (!webViewRef) {
      console.warn('WebView ref not configured.');
      resolve(null);
      return;
    }

    pendingResolve = resolve;

    // Call window.processImage inside the WebView
    const escapedBase64 = base64Jpeg.replace(/[\r\n]+/g, '');
    const jsCode = `window.processImage("${escapedBase64}"); true;`;
    webViewRef.injectJavaScript(jsCode);
  });
}

/**
 * WebView message receiver. Matches the callback Promise.
 */
export function handleWebViewMessage(event: any) {
  try {
    const data = JSON.parse(event.nativeEvent.data);
    if (data.type === 'ready') {
      console.log('WebView MediaPipe FaceMesh runtime loaded successfully.');
      isWebViewReady = true;
      if (onReadyCallback) {
        onReadyCallback();
        onReadyCallback = null;
      }
    } else if (data.type === 'landmarks') {
      if (pendingResolve) {
        pendingResolve({
          landmarks: data.landmarks,
          confidence: data.confidence ?? (data.landmarks ? 0.95 : 0.0),
        });
        pendingResolve = null;
      }
    } else if (data.type === 'error') {
      console.error('WebView MediaPipe error:', data.message);
      if (pendingResolve) {
        pendingResolve(null);
        pendingResolve = null;
      }
    }
  } catch (err) {
    console.error('Failed to parse WebView message:', err);
  }
}

// HTML template written to MEDIAPIPE_CACHE_DIR/index.html and loaded via file:// URI.
// KEY FIX: XHR-based fetch polyfill intercepts MediaPipe's internal WASM/data fetch()
// calls. Android WebView blocks native fetch() from file:// origins (Chromium security),
// but allows XHR to file:// when allowFileAccess={true} is set on the WebView.
export const MEDIAPIPE_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>MediaPipe FaceMesh</title>
  <style>
    body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
  </style>
  <script>
  // Inline face_mesh.binarypb as a blob URL — avoids XHR for this small (939 byte) file.
  // The base64 string is injected at HTML-write time by writeMediaPipeHTML() in React Native.
  (function() {
    var b64 = '__BINARYPB_BASE64__';
    if (b64 && b64.length > 10) {
      try {
        var raw = atob(b64);
        var arr = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
        window.__BINARYPB_URL__ = URL.createObjectURL(
          new Blob([arr], { type: 'application/octet-stream' })
        );
      } catch(e) { console.warn('binarypb blob creation failed:', e); }
    }
  })();
  </script>
  <script>
  // XHR polyfill for fetch() — replaces native fetch for file:// and relative URLs.
  // Android System WebView allows XHR to file:// with allowFileAccess=true, but blocks
  // the Fetch API on file:// origins (Chromium security policy).
  (function() {
    var _nativeFetch = window.fetch;
    window.fetch = function(resource, options) {
      var url = (typeof resource === 'string') ? resource : (resource && resource.url) || '';
      var isLocal = url.indexOf('://') === -1 || url.startsWith('file://') || url.startsWith('./') || url.startsWith('../');
      if (isLocal) {
        return new Promise(function(resolve, reject) {
          var xhr = new XMLHttpRequest();
          xhr.open((options && options.method) || 'GET', url, true);
          xhr.responseType = 'arraybuffer';
          xhr.onload = function() {
            var mime = url.endsWith('.wasm') ? 'application/wasm'
                     : url.endsWith('.js')   ? 'application/javascript'
                     : 'application/octet-stream';
            var blob = new Blob([xhr.response], { type: mime });
            resolve(new Response(blob, {
              status: xhr.status || 200,
              statusText: xhr.statusText || 'OK',
              headers: { 'Content-Type': mime }
            }));
          };
          xhr.onerror = function() { reject(new TypeError('XHR failed for: ' + url)); };
          xhr.send(null);
        });
      }
      return _nativeFetch.apply(this, arguments);
    };
  })();
  </script>
  <script src="./face_mesh.js"></script>
</head>
<body>
  <script>
    var faceMesh;
    try {
      faceMesh = new FaceMesh({
        locateFile: function(file) {
          // Return pre-loaded blob URL for binarypb (inlined, no XHR needed)
          if (file === 'face_mesh.binarypb' && window.__BINARYPB_URL__) {
            return window.__BINARYPB_URL__;
          }
          return './' + file;
        }
      });

      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      faceMesh.onResults(function(results) {
        var landmarks = (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) ? results.multiFaceLandmarks[0] : null;
        var score = 0.95; // Default fallback confidence
        if (results.multiFaceDetections && results.multiFaceDetections.length > 0) {
          score = (results.multiFaceDetections[0].score && results.multiFaceDetections[0].score.length > 0) ? results.multiFaceDetections[0].score[0] : (results.multiFaceDetections[0].score || 0.95);
        } else if (results.multiFaceDetection) {
          score = results.multiFaceDetection.score || 0.95;
        }
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'landmarks',
          landmarks: landmarks,
          confidence: score
        }));
      });

      window.processImage = function(base64Str) {
        try {
          var img = new Image();
          img.onload = function() {
            faceMesh.send({ image: img }).catch(function(err) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'error',
                message: 'Model error: ' + (err && err.message ? err.message : String(err))
              }));
            });
          };
          img.onerror = function() {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'error',
              message: 'Image decode error'
            }));
          };
          img.src = 'data:image/jpeg;base64,' + base64Str;
        } catch (err) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'error',
            message: 'Process failed: ' + (err && err.message ? err.message : String(err))
          }));
        }
      };

      // Warm up: send a 1x1 blank image so MediaPipe loads WASM/model NOW,
      // before the first real frame. Only after warm-up succeeds do we send "ready".
      var warmupImg = new Image(1, 1);
      warmupImg.onload = function() {
        faceMesh.send({ image: warmupImg }).then(function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
        }).catch(function(err) {
          // Still notify ready so app doesn't hang, but log the warm-up failure
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'error',
            message: 'Warmup failed: ' + (err && err.message ? err.message : String(err))
          }));
          // Try to recover — re-send ready so user can attempt auth
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
        });
      };
      warmupImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    } catch (e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'error',
        message: 'Initialization failed: ' + (e && e.message ? e.message : String(e))
      }));
    }
  </script>
</body>
</html>
`;
