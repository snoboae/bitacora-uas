/* Capas base, imagen del plan (canvas) y precarga de teselas para uso sin conexión. */
const MapImg = (() => {
  const LAYERS = {
    esri: {
      name: 'Satélite (Esri)',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attr: 'Imágenes © Esri, Maxar, Earthstar Geographics y la comunidad GIS',
      maxNative: 18, maxZoom: 19
    },
    osm: {
      name: 'Calles (OSM)',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attr: '© Colaboradores de OpenStreetMap',
      maxNative: 19, maxZoom: 19
    }
  };
  const TILE_CACHE = 'bv-tiles-v1';

  const tileUrl = (key, z, x, y) => LAYERS[key].url.replace('{z}', z).replace('{x}', x).replace('{y}', y);

  const worldPx = (lat, lng, z) => {
    const s = 256 * Math.pow(2, z);
    const sin = Math.sin((lat * Math.PI) / 180);
    return [((lng + 180) / 360) * s, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s];
  };

  function loadImg(src, timeout = 9000) {
    return new Promise((res) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      const t = setTimeout(() => { im.src = ''; res(null); }, timeout);
      im.onload = () => { clearTimeout(t); res(im); };
      im.onerror = () => { clearTimeout(t); res(null); };
      im.src = src;
    });
  }

  function niceLen(m) {
    const p = Math.pow(10, Math.floor(Math.log10(m)));
    const f = m / p;
    return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p;
  }

  function draw(ring, layerKey, W, H, imgs, z, ox, oy, tilesOk) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#e9edef'; g.fillRect(0, 0, W, H);
    if (!tilesOk) {
      g.strokeStyle = '#cfd6da'; g.lineWidth = 1;
      for (let x = 0; x < W; x += 80) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for (let y = 0; y < H; y += 80) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    }
    imgs.forEach(({ im, x, y }) => { if (im) g.drawImage(im, x * 256 - ox, y * 256 - oy); });

    const pts = ring.map(([lat, lng]) => { const p = worldPx(lat, lng, z); return [p[0] - ox, p[1] - oy]; });
    if (pts.length >= 2) {
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      if (pts.length >= 3) g.closePath();
      g.fillStyle = 'rgba(0, 220, 200, 0.22)'; g.fill();
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 6; g.stroke();
      g.strokeStyle = '#ffd400'; g.lineWidth = 3; g.stroke();
    }
    g.font = 'bold 15px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    pts.forEach(([x, y], i) => {
      g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2);
      g.fillStyle = '#0b4f4a'; g.fill();
      g.lineWidth = 2; g.strokeStyle = '#ffd400'; g.stroke();
      g.fillStyle = '#fff'; g.fillText(String(i + 1), x, y + 0.5);
    });

    // Barra de escala
    const lat0 = ring.length ? ring[0][0] : 0;
    const mpp = (156543.03392 * Math.cos((lat0 * Math.PI) / 180)) / Math.pow(2, z);
    const len = niceLen(mpp * W * 0.22);
    const px = len / mpp;
    const bx = 24, by = H - 44;
    g.fillStyle = 'rgba(255,255,255,0.88)'; g.fillRect(bx - 10, by - 24, px + 20, 44);
    g.fillStyle = '#000'; g.fillRect(bx, by, px, 5);
    g.font = 'bold 14px Arial'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText(len >= 1000 ? len / 1000 + ' km' : len + ' m', bx, by - 6);
    // Norte
    const nx = W - 40, ny = 54;
    g.fillStyle = 'rgba(255,255,255,0.88)'; g.beginPath(); g.arc(nx, ny, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0b4f4a'; g.beginPath(); g.moveTo(nx, ny - 22); g.lineTo(nx + 10, ny + 12); g.lineTo(nx, ny + 6); g.lineTo(nx - 10, ny + 12); g.closePath(); g.fill();
    g.fillStyle = '#000'; g.font = 'bold 13px Arial'; g.textAlign = 'center'; g.fillText('N', nx, ny + 26);
    // Atribución
    const attr = tilesOk ? LAYERS[layerKey].attr : 'Sin imagen base (sin conexión al generar) - solo perímetro';
    g.font = '12px Arial'; g.textAlign = 'right';
    const tw = g.measureText(attr).width;
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(W - tw - 14, H - 22, tw + 14, 22);
    g.fillStyle = '#222'; g.fillText(attr, W - 7, H - 7);
    return cv;
  }

  /* Devuelve {dataUrl, tilesOk, tilesTotal, z}. Nunca lanza: si falla el fondo, dibuja solo el perímetro. */
  async function render(ring, layerKey = 'esri', W = 1200, H = 800) {
    if (!ring || ring.length < 2) return null;
    const b = Geo.bounds(ring);
    let z = 18;
    const padF = 0.18;
    for (; z > 1; z--) {
      const a = worldPx(b.n, b.w, z), c = worldPx(b.s, b.e, z);
      if ((c[0] - a[0]) * (1 + 2 * padF) <= W && (c[1] - a[1]) * (1 + 2 * padF) <= H) break;
    }
    const a = worldPx(b.n, b.w, z), c = worldPx(b.s, b.e, z);
    const cx = (a[0] + c[0]) / 2, cy = (a[1] + c[1]) / 2;
    const ox = cx - W / 2, oy = cy - H / 2;
    const x0 = Math.floor(ox / 256), x1 = Math.floor((ox + W) / 256);
    const y0 = Math.floor(oy / 256), y1 = Math.floor((oy + H) / 256);
    const max = Math.pow(2, z);
    const jobs = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      if (y < 0 || y >= max) continue;
      const xw = ((x % max) + max) % max;
      jobs.push(loadImg(tileUrl(layerKey, z, xw, y)).then((im) => ({ im, x, y })));
    }
    const imgs = await Promise.all(jobs);
    const tilesOk = imgs.filter((t) => t.im).length;
    let cv = draw(ring, layerKey, W, H, imgs, z, ox, oy, tilesOk);
    let dataUrl;
    try { dataUrl = cv.toDataURL('image/jpeg', 0.88); } catch (e) {
      cv = draw(ring, layerKey, W, H, [], z, ox, oy, 0);
      dataUrl = cv.toDataURL('image/jpeg', 0.88);
      return { dataUrl, tilesOk: 0, tilesTotal: jobs.length, z, layer: layerKey };
    }
    return { dataUrl, tilesOk, tilesTotal: jobs.length, z, layer: layerKey };
  }

  /* Lista de teselas cubriendo el perímetro desde un zoom cercano hasta el máximo, con tope. */
  function tilesFor(ring, layerKey, cap = 300) {
    const b = Geo.bounds(ring);
    const maxZ = Math.min(18, LAYERS[layerKey].maxNative);
    for (let top = maxZ; top >= 12; top--) {
      const list = [];
      for (let z = Math.max(12, top - 3); z <= top; z++) {
        const a = worldPx(b.n, b.w, z), c = worldPx(b.s, b.e, z);
        const padPx = 128;
        const xa = Math.floor((a[0] - padPx) / 256), xb = Math.floor((c[0] + padPx) / 256);
        const ya = Math.floor((a[1] - padPx) / 256), yb = Math.floor((c[1] + padPx) / 256);
        const max = Math.pow(2, z);
        for (let x = xa; x <= xb; x++) for (let y = ya; y <= yb; y++) {
          if (y < 0 || y >= max) continue;
          list.push([z, ((x % max) + max) % max, y]);
        }
      }
      if (list.length <= cap) return { list, top };
    }
    return { list: [], top: 0 };
  }

  async function prefetch(ring, layerKey, onProgress, cap = 300) {
    const { list, top } = tilesFor(ring, layerKey, cap);
    if (!list.length) throw new Error('El área es demasiado grande para precargar.');
    const cache = await caches.open(TILE_CACHE);
    let done = 0, ok = 0;
    const queue = list.slice();
    async function worker() {
      while (queue.length) {
        const [z, x, y] = queue.shift();
        const url = tileUrl(layerKey, z, x, y);
        try {
          if (!(await cache.match(url))) {
            const res = await fetch(url, { mode: 'cors' });
            if (res.ok) { await cache.put(url, res); ok++; }
          } else ok++;
        } catch (e) { /* sin conexión: se ignora */ }
        done++;
        onProgress && onProgress(done, list.length);
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    return { ok, total: list.length, top };
  }

  return { LAYERS, tileUrl, render, prefetch, tilesFor };
})();
