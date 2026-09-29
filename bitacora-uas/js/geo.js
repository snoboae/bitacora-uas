/* Utilidades geoespaciales. Los polígonos son anillos abiertos [[lat, lng], ...] en WGS84. */
const Geo = (() => {
  const R = 6378137;
  const rad = (d) => (d * Math.PI) / 180;

  function area(ring) {
    const n = ring.length;
    if (n < 3) return 0;
    let total = 0;
    for (let i = 0; i < n; i++) {
      const lo = ring[i], mid = ring[(i + 1) % n], up = ring[(i + 2) % n];
      total += (rad(up[1]) - rad(lo[1])) * Math.sin(rad(mid[0]));
    }
    return Math.abs((total * R * R) / 2); // m²
  }

  function dist(a, b) {
    const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function perimeter(ring) {
    if (ring.length < 2) return 0;
    let p = 0;
    for (let i = 0; i < ring.length; i++) p += dist(ring[i], ring[(i + 1) % ring.length]);
    return p;
  }

  function centroid(ring) {
    if (!ring.length) return null;
    let a = 0, cx = 0, cy = 0;
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const [y0, x0] = ring[i], [y1, x1] = ring[(i + 1) % n];
      const f = x0 * y1 - x1 * y0;
      a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
    }
    if (Math.abs(a) < 1e-12) {
      return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
    }
    a *= 0.5;
    return [cy / (6 * a), cx / (6 * a)];
  }

  function bounds(ring) {
    let s = 90, n = -90, w = 180, e = -180;
    ring.forEach(([lat, lng]) => { s = Math.min(s, lat); n = Math.max(n, lat); w = Math.min(w, lng); e = Math.max(e, lng); });
    return { s, n, w, e };
  }

  /* UTM (WGS84) por series de Krüger. Devuelve {zone, hemi, e, n}. */
  function toUTM(lat, lon, zoneOverride) {
    const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996;
    const zone = zoneOverride || Math.floor((lon + 180) / 6) + 1;
    const lon0 = rad((zone - 1) * 6 - 180 + 3);
    const phi = rad(lat), lam = rad(lon) - lon0;
    const n = f / (2 - f);
    const A = (a / (1 + n)) * (1 + (n * n) / 4 + n ** 4 / 64);
    const alpha = [n / 2 - (2 * n * n) / 3 + (5 * n ** 3) / 16, (13 * n * n) / 48 - (3 * n ** 3) / 5, (61 * n ** 3) / 240];
    const e = Math.sqrt(f * (2 - f));
    const t = Math.sinh(Math.atanh(Math.sin(phi)) - e * Math.atanh(e * Math.sin(phi)));
    const xi = Math.atan2(t, Math.cos(lam));
    const eta = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
    let x = eta, y = xi;
    for (let j = 1; j <= 3; j++) {
      y += alpha[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
      x += alpha[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
    }
    let N = k0 * A * y;
    if (lat < 0) N += 10000000;
    return { zone, hemi: lat < 0 ? 'S' : 'N', e: 500000 + k0 * A * x, n: N };
  }

  const cleanRing = (pts) => {
    const r = pts.filter((p) => isFinite(p[0]) && isFinite(p[1]));
    if (r.length > 1) {
      const a = r[0], b = r[r.length - 1];
      if (Math.abs(a[0] - b[0]) < 1e-10 && Math.abs(a[1] - b[1]) < 1e-10) r.pop();
    }
    return r;
  };

  function fromGeoJSON(text) {
    const g = JSON.parse(text);
    const find = (o) => {
      if (!o) return null;
      if (o.type === 'FeatureCollection') { for (const f of o.features) { const r = find(f); if (r) return r; } return null; }
      if (o.type === 'Feature') return find(o.geometry);
      if (o.type === 'GeometryCollection') { for (const f of o.geometries) { const r = find(f); if (r) return r; } return null; }
      if (o.type === 'Polygon') return o.coordinates[0];
      if (o.type === 'MultiPolygon') return o.coordinates[0][0];
      return null;
    };
    const c = find(g);
    if (!c) throw new Error('El GeoJSON no contiene un polígono.');
    return cleanRing(c.map(([lng, lat]) => [lat, lng]));
  }

  function fromKML(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('KML inválido.');
    const poly = doc.getElementsByTagName('Polygon')[0];
    const node = poly ? poly.getElementsByTagName('coordinates')[0] : doc.getElementsByTagName('coordinates')[0];
    if (!node) throw new Error('El KML no contiene coordenadas.');
    const pts = node.textContent.trim().split(/\s+/).map((s) => s.split(',').map(Number)).filter((a) => a.length >= 2);
    return cleanRing(pts.map(([lng, lat]) => [lat, lng]));
  }

  function toGeoJSON(name, ring, props) {
    const c = ring.map(([lat, lng]) => [lng, lat]);
    c.push(c[0]);
    return JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: Object.assign({ nombre: name }, props || {}), geometry: { type: 'Polygon', coordinates: [c] } }] }, null, 2);
  }

  function toKML(name, ring) {
    const esc = (s) => String(s).replace(/[<>&]/g, (m) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m]));
    const c = ring.map(([lat, lng]) => `${lng},${lat},0`);
    c.push(c[0]);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>${esc(name)}</name><Style><LineStyle><color>ff00d4ff</color><width>3</width></LineStyle><PolyStyle><color>4000d4ff</color></PolyStyle></Style><Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>${c.join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`;
  }

  return { area, perimeter, centroid, bounds, dist, toUTM, fromGeoJSON, fromKML, toGeoJSON, toKML, rad };
})();
