/**
 * The page a hidden WebView loads to draw PDF pages as pictures with
 * pdf.js. The app calls `window.render(id, base64, maxPages, width)`; the
 * page posts back each page as a JPEG, then `done`. Nothing is fetched:
 * pdf.js comes with the app, so this works offline.
 */
export function pdfPagesHtml(lib: string, worker: string): string {
  // As JSON strings, with "</" broken up so neither can end the <script>.
  const str = (s: string) => JSON.stringify(s).replace(/<\//g, '<\\/');
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
(function () {
  function post(m) {
    var s = JSON.stringify(m);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    else if (window.__post) window.__post(s);
  }
  function blobUrl(code) {
    return URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  }
  var ready = new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = blobUrl(${str(lib)});
    s.onload = function () {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = blobUrl(${str(worker)});
      resolve();
    };
    s.onerror = function () { reject(new Error('pdf.js did not load')); };
    document.head.appendChild(s);
  });
  /** The page without the empty paper below its last line; null for a blank page. */
  function trim(canvas) {
    var w = canvas.width, h = canvas.height;
    var px = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    var last = -1;
    for (var y = h - 1; y >= 0 && last < 0; y--) {
      for (var x = 0; x < w; x += 2) {
        var i = (y * w + x) * 4;
        if (px[i] < 235 || px[i + 1] < 235 || px[i + 2] < 235) { last = y; break; }
      }
    }
    if (last < 0) return null;
    var keep = Math.min(h, last + Math.round(w * 0.04));
    if (keep >= h - 4) return canvas;
    var out = document.createElement('canvas');
    out.width = w;
    out.height = keep;
    out.getContext('2d').drawImage(canvas, 0, 0);
    return out;
  }
  window.render = function (id, b64, maxPages, width) {
    ready
      .then(function () {
        var raw = atob(b64);
        var bytes = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        return window.pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }).promise;
      })
      .then(function (doc) {
        var n = Math.min(doc.numPages, maxPages);
        var chain = Promise.resolve();
        for (var p = 1; p <= n; p++) {
          (function (p) {
            chain = chain.then(function () {
              return doc.getPage(p).then(function (page) {
                var scale = width / page.getViewport({ scale: 1 }).width;
                var vp = page.getViewport({ scale: scale });
                var canvas = document.createElement('canvas');
                canvas.width = Math.round(vp.width);
                canvas.height = Math.round(vp.height);
                var ctx = canvas.getContext('2d');
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
                  var out = trim(canvas);
                  if (out) post({ id: id, page: p, data: out.toDataURL('image/jpeg', 0.85).split(',')[1] });
                  page.cleanup();
                });
              });
            });
          })(p);
        }
        return chain.then(function () {
          post({ id: id, done: true, pages: n, of: doc.numPages });
          doc.destroy();
        });
      })
      .catch(function (e) { post({ id: id, error: String(e && e.message || e) }); });
  };
  ready.then(function () { post({ ready: true }); }, function (e) { post({ error: String(e) }); });
})();
</script></body></html>`;
}
