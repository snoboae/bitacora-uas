/* Bitácora de vuelo UAS v2 - pilotos, aeronaves y registro de vuelo (con perímetro). */
(() => {
  'use strict';

  /* ---------- utilidades ---------- */
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const nowDT = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const todayStr = () => nowDT().slice(0, 10);
  const fmtDate = (d) => PDF.fmtDate(d);
  const fmtDT = (d) => PDF.fmtDT(d);
  const hhmm = (m) => PDF.hhmm(m);
  const safeName = (s) => String(s || 'perimetro').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '') || 'perimetro';

  let toastT = null;
  function toast(msg, ms = 3200) {
    const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), ms);
  }
  function busy(on, msg) { $('busy').classList.toggle('hidden', !on); if (msg) $('busy').firstElementChild.textContent = msg; }

  function download(content, filename, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  /* Cédula ecuatoriana: 10 dígitos, provincia 01-24 o 30, tercer dígito < 6, dígito verificador módulo 10. */
  function cedulaOk(c) {
    if (!/^\d{10}$/.test(c)) return false;
    const prov = +c.slice(0, 2);
    if ((prov < 1 || prov > 24) && prov !== 30) return false;
    if (+c[2] > 5) return false;
    let s = 0;
    for (let i = 0; i < 9; i++) { let v = +c[i] * (i % 2 === 0 ? 2 : 1); if (v > 9) v -= 9; s += v; }
    return (10 - (s % 10)) % 10 === +c[9];
  }

  /* ---------- estado ---------- */
  const S = { pilots: [], aircraft: [], flights: [], tab: 'vuelos', flight: null, pilot: null, ac: null, ring: [], baseLayer: 'esri', map: null, drawn: null, sigPilot: null, locMark: null, detailId: null, period: '', lastBackup: '', backupSnooze: 0 };

  /* ---------- navegación ---------- */
  const TITLES = { vuelos: 'Bitácora de vuelo', vuelo: 'Registro de vuelo', detalle: 'Detalle del vuelo', pilotos: 'Pilotos', piloto: 'Piloto', aeronaves: 'Aeronaves', aeronave: 'Aeronave', respaldo: 'Respaldo y estado' };
  const TAB_OF = { vuelos: 'vuelos', vuelo: 'vuelos', detalle: 'vuelos', pilotos: 'pilotos', piloto: 'pilotos', aeronaves: 'aeronaves', aeronave: 'aeronaves', respaldo: 'respaldo' };
  function show(view) {
    document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
    $('v-' + view).classList.remove('hidden');
    $('title').textContent = TITLES[view];
    S.tab = TAB_OF[view];
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
    window.scrollTo(0, 0);
  }
  function goTab(tab) {
    if (tab === 'vuelos') renderFlights();
    if (tab === 'pilotos') renderPilots();
    if (tab === 'aeronaves') renderAircraft();
    if (tab === 'respaldo') renderStatus();
    show(tab);
  }

  async function loadAll() {
    S.pilots = (await DB.all('pilots')).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    S.aircraft = (await DB.all('aircraft')).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    S.flights = (await DB.all('flights')).map(normFlight).sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''));
  }

  /* Registros de la v2 guardaban luz/viento/entorno como listas; ahora son una sola opción. */
  function normFlight(f) {
    const one = (v) => (Array.isArray(v) ? (v.length === 1 ? v[0] : '') : (v || ''));
    if (Array.isArray(f.luz)) f.luz = f.luz.includes('Soleado') && f.luz.includes('Nublado') ? 'Parcialmente nublado' : one(f.luz);
    f.viento = one(f.viento);
    f.entorno = one(f.entorno);
    f.objetivo = f.objetivo || '';
    return f;
  }

  /* =====================================================
     PILOTOS
     ===================================================== */
  const expired = (p, on) => !!(p.expiracion && (on || todayStr()) > p.expiracion);

  function renderPilots() {
    const box = $('pilotList');
    if (!S.pilots.length) { box.innerHTML = '<div class="empty">Aún no hay pilotos.<br>Crea uno para poder registrar vuelos.</div>'; return; }
    box.innerHTML = S.pilots.map((p) => `<div class="card">
      <div><h3>${esc(p.nombre)}${expired(p) ? '<span class="badge">VENCIDA</span>' : ''}</h3>
      <div class="meta">Cédula ${esc(p.cedula)} · Autorización ${esc(p.autorizacion)}<br>Vigencia: ${fmtDate(p.otorgamiento)} a ${fmtDate(p.expiracion)}${p.firma ? ' · con firma' : ' · sin firma'}</div></div>
      <div class="acts">
        <button class="btn small" data-act="pilot-edit" data-id="${p.id}">Editar</button>
        <button class="btn small danger" data-act="pilot-del" data-id="${p.id}">Eliminar</button>
      </div></div>`).join('');
  }

  function openPilot(id) {
    const p = id ? S.pilots.find((x) => x.id === id) : null;
    S.pilot = p ? clone(p) : { id: null, nombre: '', cedula: '', autorizacion: '', otorgamiento: '', expiracion: '', firma: '' };
    $('pi-nombre').value = S.pilot.nombre; $('pi-cedula').value = S.pilot.cedula; $('pi-autorizacion').value = S.pilot.autorizacion;
    $('pi-otorgamiento').value = S.pilot.otorgamiento; $('pi-expiracion').value = S.pilot.expiracion;
    if (!S.sigPilot) S.sigPilot = new SigPad($('sigPilot'));
    S.sigPilot.setImage(S.pilot.firma);
    show('piloto');
  }

  async function savePilot() {
    const p = Object.assign({}, S.pilot, {
      nombre: $('pi-nombre').value.trim(), cedula: $('pi-cedula').value.trim(), autorizacion: $('pi-autorizacion').value.trim(),
      otorgamiento: $('pi-otorgamiento').value, expiracion: $('pi-expiracion').value
    });
    const falta = [['nombre', 'nombre completo'], ['cedula', 'cédula'], ['autorizacion', 'autorización No.'], ['otorgamiento', 'fecha de otorgamiento'], ['expiracion', 'fecha de expiración']].filter(([k]) => !p[k]).map(([, l]) => l);
    if (falta.length) { toast('Falta: ' + falta.join(', ') + '.', 4500); return; }
    if (p.expiracion < p.otorgamiento) { toast('La fecha de expiración es anterior a la de otorgamiento.', 4500); return; }
    if (/^\d+$/.test(p.cedula) && !cedulaOk(p.cedula) && !confirm('La cédula no parece válida (revisa los 10 dígitos). ¿Guardar de todos modos?')) return;
    p.firma = S.sigPilot.empty ? '' : S.sigPilot.toDataURL();
    p.id = p.id || uid();
    p.updatedAt = Date.now();
    await DB.put('pilots', p);
    await loadAll();
    toast('Piloto guardado.');
    goTab('pilotos');
  }

  /* =====================================================
     AERONAVES
     ===================================================== */
  function renderAircraft() {
    const box = $('aircraftList');
    if (!S.aircraft.length) { box.innerHTML = '<div class="empty">Aún no hay aeronaves.<br>Agrega tu dron para elegirlo en cada vuelo.</div>'; return; }
    box.innerHTML = S.aircraft.map((a) => `<div class="card">
      <div><h3>${esc(a.nombre)}</h3><div class="meta">${esc(a.marca)} ${esc(a.modelo)} · Serie ${esc(a.serie)}</div></div>
      <div class="acts">
        <button class="btn small" data-act="ac-edit" data-id="${a.id}">Editar</button>
        <button class="btn small danger" data-act="ac-del" data-id="${a.id}">Eliminar</button>
      </div></div>`).join('');
  }
  function openAircraft(id) {
    const a = id ? S.aircraft.find((x) => x.id === id) : null;
    S.ac = a ? clone(a) : { id: null, nombre: '', marca: '', modelo: '', serie: '' };
    $('ac-nombre').value = S.ac.nombre; $('ac-marca').value = S.ac.marca; $('ac-modelo').value = S.ac.modelo; $('ac-serie').value = S.ac.serie;
    show('aeronave');
  }
  async function saveAircraft() {
    const a = Object.assign({}, S.ac, { nombre: $('ac-nombre').value.trim(), marca: $('ac-marca').value.trim(), modelo: $('ac-modelo').value.trim(), serie: $('ac-serie').value.trim() });
    const falta = [['nombre', 'nombre'], ['marca', 'marca'], ['modelo', 'modelo'], ['serie', 'nro de serie']].filter(([k]) => !a[k]).map(([, l]) => l);
    if (falta.length) { toast('Falta: ' + falta.join(', ') + '.', 4500); return; }
    a.id = a.id || uid(); a.updatedAt = Date.now();
    await DB.put('aircraft', a);
    await loadAll();
    toast('Aeronave guardada.');
    goTab('aeronaves');
  }

  /* =====================================================
     MAPA / PERÍMETRO
     ===================================================== */
  function setDrawLocale() {
    const d = L.drawLocal;
    d.draw.toolbar.actions = { title: 'Cancelar dibujo', text: 'Cancelar' };
    d.draw.toolbar.finish = { title: 'Terminar dibujo', text: 'Terminar' };
    d.draw.toolbar.undo = { title: 'Borrar el último punto', text: 'Borrar último punto' };
    d.draw.toolbar.buttons.polygon = 'Dibujar perímetro (polígono)';
    d.draw.toolbar.buttons.rectangle = 'Dibujar rectángulo';
    d.draw.handlers.polygon.tooltip = { start: 'Toca para iniciar el perímetro', cont: 'Toca para continuar', end: 'Toca el primer punto para cerrar' };
    d.draw.handlers.rectangle.tooltip = { start: 'Arrastra para dibujar un rectángulo' };
    d.draw.handlers.simpleshape = { tooltip: { end: 'Suelta para terminar' } };
    d.edit.toolbar.actions.save = { title: 'Guardar cambios', text: 'Guardar' };
    d.edit.toolbar.actions.cancel = { title: 'Cancelar edición', text: 'Cancelar' };
    d.edit.toolbar.actions.clearAll = { title: 'Borrar el perímetro', text: 'Borrar todo' };
    d.edit.toolbar.buttons.edit = 'Editar vértices';
    d.edit.toolbar.buttons.editDisabled = 'No hay perímetro que editar';
    d.edit.toolbar.buttons.remove = 'Borrar perímetro';
    d.edit.toolbar.buttons.removeDisabled = 'No hay perímetro que borrar';
    d.edit.handlers.edit.tooltip = { text: 'Arrastra los puntos para ajustar', subtext: 'Pulsa Cancelar para deshacer' };
    d.edit.handlers.remove.tooltip = { text: 'Toca el perímetro para borrarlo' };
  }

  const cleanRing = (r) => { const o = r.slice(); if (o.length > 1 && o[0][0] === o[o.length - 1][0] && o[0][1] === o[o.length - 1][1]) o.pop(); return o; };
  const ringFromLatLngs = (ll) => cleanRing(ll.map((p) => [+p.lat.toFixed(7), +p.lng.toFixed(7)]));

  function ensureMap() {
    if (S.map) return;
    setDrawLocale();
    const map = L.map('map', { maxZoom: 19 }).setView([-0.18, -78.47], 12);
    const base = {}, keyByName = {};
    Object.entries(MapImg.LAYERS).forEach(([k, l]) => {
      base[l.name] = L.tileLayer(l.url, { attribution: l.attr, maxZoom: l.maxZoom, maxNativeZoom: l.maxNative, crossOrigin: true });
      keyByName[l.name] = k;
    });
    base[MapImg.LAYERS.esri.name].addTo(map);
    L.control.layers(base, null, { collapsed: true }).addTo(map);
    map.on('baselayerchange', (e) => { S.baseLayer = keyByName[e.name] || 'esri'; });
    const drawn = L.featureGroup().addTo(map);
    const shape = { color: '#ffd400', weight: 3 };
    map.addControl(new L.Control.Draw({
      position: 'topleft',
      draw: { polygon: { allowIntersection: false, showArea: false, shapeOptions: shape }, rectangle: { showArea: false, shapeOptions: shape }, polyline: false, circle: false, marker: false, circlemarker: false },
      edit: { featureGroup: drawn, remove: false }
    }));
    const DelCtl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd() {
        const box = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const b = L.DomUtil.create('a', 'bv-del', box);
        b.href = '#'; b.title = 'Borrar perímetro'; b.setAttribute('role', 'button'); b.setAttribute('aria-label', 'Borrar perímetro');
        b.innerHTML = '&#128465;';
        L.DomEvent.disableClickPropagation(box);
        L.DomEvent.on(b, 'click', (ev) => {
          L.DomEvent.preventDefault(ev);
          if (S.ring.length < 3) { toast('No hay perímetro que borrar.'); return; }
          if (confirm('¿Borrar el perímetro dibujado?')) { setRing([], false); }
        });
        return box;
      }
    });
    map.addControl(new DelCtl());
    map.on(L.Draw.Event.CREATED, (e) => setRing(ringFromLatLngs(e.layer.getLatLngs()[0]), false));
    map.on(L.Draw.Event.EDITED, () => { let r = null; drawn.eachLayer((l) => { r = ringFromLatLngs(l.getLatLngs()[0]); }); if (r) setRing(r, false); });
    map.on(L.Draw.Event.DELETED, () => setRing([], false));
    map.on('locationfound', (e) => {
      if (S.locMark) S.locMark.remove();
      S.locMark = L.layerGroup([L.circle(e.latlng, { radius: e.accuracy, color: '#1e88e5', weight: 1, fillOpacity: 0.1 }), L.circleMarker(e.latlng, { radius: 7, color: '#fff', weight: 2, fillColor: '#1e88e5', fillOpacity: 1 })]).addTo(map);
    });
    map.on('locationerror', () => toast('No se pudo obtener la ubicación (revisa permisos del GPS).'));
    S.map = map; S.drawn = drawn;
  }

  function setRing(ring, fit) {
    S.ring = ring;
    S.drawn.clearLayers();
    if (ring.length >= 3) {
      const poly = L.polygon(ring, { color: '#ffd400', weight: 3, fillOpacity: 0.2 });
      S.drawn.addLayer(poly);
      if (fit) S.map.fitBounds(poly.getBounds().pad(0.25));
    }
    updateStats();
  }

  function updateStats() {
    const r = S.ring;
    if (r.length < 3) { $('mapStats').innerHTML = '<span class="hint">Sin perímetro (opcional).</span>'; return; }
    const c = Geo.centroid(r), u = Geo.toUTM(c[0], c[1]);
    const st = (v, l) => `<div class="stat"><b>${v}</b><small>${l}</small></div>`;
    $('mapStats').innerHTML = st((Geo.area(r) / 10000).toFixed(2) + ' ha', 'Área') + st(Math.round(Geo.perimeter(r)) + ' m', 'Perímetro') + st(r.length, 'Vértices') +
      st(c[0].toFixed(5) + ', ' + c[1].toFixed(5), 'Centroide WGS84') + st('UTM ' + u.zone + u.hemi, 'Zona');
  }

  function exportPerimeter(kind) {
    if (S.ring.length < 3) { toast('Aún no hay perímetro.'); return; }
    const name = $('f-sitio').value.trim() || 'Perimetro de vuelo';
    if (kind === 'geojson') download(Geo.toGeoJSON(name, S.ring, { area_ha: +(Geo.area(S.ring) / 10000).toFixed(3) }), safeName(name) + '.geojson', 'application/geo+json');
    else download(Geo.toKML(name, S.ring), safeName(name) + '.kml', 'application/vnd.google-earth.kml+xml');
  }

  async function importPerimeter(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const ring = /\.kml$/i.test(file.name) || text.trim().startsWith('<') ? Geo.fromKML(text) : Geo.fromGeoJSON(text);
      if (ring.length < 3) throw new Error('El polígono necesita al menos 3 vértices.');
      setRing(ring, true);
      toast('Perímetro importado (' + ring.length + ' vértices).');
    } catch (e) { toast('No se pudo importar: ' + e.message, 5000); }
    $('fileImport').value = '';
  }

  async function prefetchArea() {
    if (S.ring.length < 3) { toast('Primero dibuja o importa el perímetro.'); return; }
    if (!navigator.onLine) { toast('Necesitas conexión para precargar el mapa.'); return; }
    $('btnPrefetch').disabled = true;
    try {
      const r = await MapImg.prefetch(S.ring, S.baseLayer, (d, t) => { $('prefetchMsg').textContent = 'Descargando ' + d + ' / ' + t + '…'; });
      $('prefetchMsg').textContent = 'Listo: ' + r.ok + ' de ' + r.total + ' teselas guardadas (zoom hasta ' + r.top + ').';
    } catch (e) { $('prefetchMsg').textContent = e.message; }
    $('btnPrefetch').disabled = false;
  }

  /* =====================================================
     VUELOS
     ===================================================== */
  const minutesBetween = (a, b) => (a && b ? Math.round((new Date(b) - new Date(a)) / 60000) : null);
  const checked = (name) => Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map((i) => i.value);
  const setChecked = (name, vals) => document.querySelectorAll(`input[name="${name}"]`).forEach((i) => { i.checked = (vals || []).includes(i.value); });

  /* ---------- lista, periodo y detalle ---------- */
  const monthLabel = (ym) => { const [y, m] = ym.split('-').map(Number); const t = new Date(y, m - 1, 1).toLocaleDateString('es-EC', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
  const filteredFlights = () => S.flights.filter((f) => !S.period || (f.inicio || '').slice(0, 7) === S.period);
  const periodTag = () => (S.period ? '_' + S.period : '');
  const condText = (f) => [f.luz, f.viento, f.entorno].filter(Boolean).join(' · ') || '-';

  function renderFlights() {
    const meses = Array.from(new Set(S.flights.map((f) => (f.inicio || '').slice(0, 7)).filter(Boolean))).sort().reverse();
    if (S.period && !meses.includes(S.period)) S.period = '';
    $('periodFilter').innerHTML = '<option value="">Todo el historial</option>' + meses.map((m) => `<option value="${m}">${esc(monthLabel(m))}</option>`).join('');
    $('periodFilter').value = S.period;
    const list = filteredFlights();
    const sum = (arr) => arr.reduce((s, f) => s + (f.minutos || 0), 0);
    let html = `<div class="stat"><b>${list.length}</b><small>Vuelos${S.period ? ' del periodo' : ''}</small></div><div class="stat"><b>${hhmm(sum(list))} h</b><small>Horas de vuelo${S.period ? ' del periodo' : ''}</small></div>`;
    if (S.period) html += `<div class="stat"><b>${hhmm(sum(S.flights))} h</b><small>Total histórico (${S.flights.length} vuelos)</small></div>`;
    $('totals').innerHTML = html;
    $('flightList').innerHTML = list.length ? list.map((f) => `<div class="card tap" data-act="fl-open" data-id="${f.id}">
        <div><h3>${esc(f.numLabel || '')} · ${fmtDate(f.inicio)}</h3>
        <div class="meta">${esc((f.inicio || '').slice(11, 16))} – ${esc((f.fin || '').slice(11, 16))} · <b>${hhmm(f.minutos)} h</b> · ${esc(f.tipo || '')}<br>
        ${esc(f.sitio || f.objetivo || 'Sin lugar')} · ${esc((f.pilotSnap || {}).nombre || '')}</div></div>
        <div class="chev">Ver detalle y acciones ›</div></div>`).join('') : '<div class="empty">Sin vuelos registrados' + (S.period ? ' en este periodo' : '') + '.</div>';
    $('exportHint').textContent = S.period ? 'Los resúmenes y exportaciones incluyen solo: ' + monthLabel(S.period) + '.' : '';
    renderBackupBanner();
  }

  function renderBackupBanner() {
    const box = $('backupBanner');
    let msg = '';
    if (S.flights.length && Date.now() > S.backupSnooze) {
      if (!S.lastBackup) msg = 'Aún no has hecho un respaldo de tu bitácora.';
      else {
        const dias = Math.floor((Date.now() - new Date(S.lastBackup).getTime()) / 86400000);
        if (dias >= 30) msg = 'Hace ' + dias + ' días que no haces un respaldo de tu bitácora.';
      }
    }
    if (!msg) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.innerHTML = `<span>${esc(msg)} Los datos viven solo en este teléfono.</span><span class="row"><button class="btn small" data-act="backup-now">Hacer respaldo</button><button class="btn small" data-act="backup-later">Más tarde</button></span>`;
    box.classList.remove('hidden');
  }

  function openDetail(id) {
    const f = S.flights.find((x) => x.id === id);
    if (!f) { goTab('vuelos'); return; }
    S.detailId = id;
    const p = f.pilotSnap || {}, a = f.aircraftSnap || {};
    const row = (l, v) => `<div><small>${esc(l)}</small><b>${esc(v == null || v === '' ? '-' : v)}</b></div>`;
    $('d-title').textContent = (f.numLabel || '') + ' · ' + fmtDate(f.inicio);
    $('d-info').innerHTML =
      row('Piloto', p.nombre) +
      row('Aeronave', a.nombre ? a.nombre + ' (' + (a.marca || '') + ' ' + (a.modelo || '') + ', serie ' + (a.serie || '-') + ')' : '') +
      row('Operación', fmtDT(f.inicio) + '  →  ' + fmtDT(f.fin)) +
      row('Tiempo total de vuelo', hhmm(f.minutos) + ' h (' + (f.minutos != null ? f.minutos : '-') + ' min)') +
      row('Objetivo del vuelo', f.objetivo) +
      row('Característica del vuelo', f.tipo) +
      row('Condiciones', condText(f)) +
      row('Lugar / proyecto', f.sitio) +
      (f.ring && f.ring.length > 2 ? row('Perímetro', (f.area / 10000).toFixed(2) + ' ha · ' + Math.round(f.perimetro) + ' m · ' + f.ring.length + ' vértices') : '') +
      (f.obs ? row('Observaciones', f.obs) : '');
    $('d-mapPanel').classList.toggle('hidden', !f.mapImage);
    $('d-map').innerHTML = f.mapImage ? `<img src="${f.mapImage}" alt="Mapa del perímetro">` : '';
    $('d-share').classList.toggle('hidden', !(navigator.canShare && navigator.share));
    $('d-geo').classList.toggle('hidden', !(f.ring && f.ring.length > 2));
    show('detalle');
  }

  function fillSelects(f) {
    const last = { pilot: S.lastPilot, aircraft: S.lastAircraft };
    const opt = (arr, label) => arr.map((x) => `<option value="${x.id}">${esc(label(x))}</option>`).join('');
    $('f-pilot').innerHTML = '<option value="">' + (S.pilots.length ? 'Selecciona un piloto…' : 'No hay pilotos: créalo en la pestaña Pilotos') + '</option>' + opt(S.pilots, (p) => p.nombre);
    $('f-aircraft').innerHTML = '<option value="">' + (S.aircraft.length ? 'Selecciona una aeronave…' : 'No hay aeronaves: créala en la pestaña Aeronaves') + '</option>' + opt(S.aircraft, (a) => a.nombre + ' (' + a.marca + ' ' + a.modelo + ')');
    // Si el piloto/aeronave del registro ya no existe en el catálogo, se conserva su copia.
    if (f.pilotId && !S.pilots.some((p) => p.id === f.pilotId) && f.pilotSnap) $('f-pilot').insertAdjacentHTML('beforeend', `<option value="${f.pilotId}">${esc(f.pilotSnap.nombre)} (eliminado)</option>`);
    if (f.aircraftId && !S.aircraft.some((a) => a.id === f.aircraftId) && f.aircraftSnap) $('f-aircraft').insertAdjacentHTML('beforeend', `<option value="${f.aircraftId}">${esc(f.aircraftSnap.nombre)} (eliminada)</option>`);
    let pid = f.pilotId || last.pilot || (S.pilots.length === 1 ? S.pilots[0].id : '');
    let aid = f.aircraftId || last.aircraft || (S.aircraft.length === 1 ? S.aircraft[0].id : '');
    if (!S.pilots.some((p) => p.id === pid) && !(f.pilotId === pid && f.pilotSnap)) pid = '';
    if (!S.aircraft.some((a) => a.id === aid) && !(f.aircraftId === aid && f.aircraftSnap)) aid = '';
    $('f-pilot').value = pid; $('f-aircraft').value = aid;
  }

  const pilotOf = (id) => S.pilots.find((p) => p.id === id) || (S.flight && S.flight.pilotId === id ? S.flight.pilotSnap : null);
  const aircraftOf = (id) => S.aircraft.find((a) => a.id === id) || (S.flight && S.flight.aircraftId === id ? S.flight.aircraftSnap : null);

  function refreshInfo() {
    const p = pilotOf($('f-pilot').value), a = aircraftOf($('f-aircraft').value);
    $('f-pilotInfo').textContent = p ? `Cédula ${p.cedula} · Autorización ${p.autorizacion} · Vigencia ${fmtDate(p.otorgamiento)} a ${fmtDate(p.expiracion)}${p.firma ? '' : ' · sin firma guardada'}` : '';
    $('f-aircraftInfo').textContent = a ? `${a.marca} ${a.modelo} · Serie ${a.serie}` : '';
    const on = ($('f-inicio').value || '').slice(0, 10) || todayStr();
    let w = '';
    if (p && p.expiracion && on > p.expiracion) w = 'La autorización del piloto venció el ' + fmtDate(p.expiracion) + ' y el vuelo es del ' + fmtDate(on) + '.';
    else if (p && p.otorgamiento && on < p.otorgamiento) w = 'La autorización del piloto se otorgó el ' + fmtDate(p.otorgamiento) + ', posterior a la fecha del vuelo (' + fmtDate(on) + ').';
    $('f-warn').textContent = w; $('f-warn').classList.toggle('hidden', !w);
  }

  function updateTotal() {
    const m = minutesBetween($('f-inicio').value, $('f-fin').value);
    const el = $('f-total');
    el.classList.toggle('bad', m != null && m < 0);
    el.value = m == null ? '--:--' : m < 0 ? 'El fin es anterior al inicio' : hhmm(m) + ' h (' + m + ' min)';
    refreshInfo();
  }

  function openFlight(id, opts) {
    opts = opts || {};
    let f;
    if (id) f = clone(S.flights.find((x) => x.id === id));
    else if (opts.template) {
      const t = opts.template;
      f = { pilotId: t.pilotId, aircraftId: t.aircraftId, sitio: t.sitio, objetivo: t.objetivo, tipo: t.tipo, ring: t.ring || [], layer: t.layer, pilotSnap: t.pilotSnap, aircraftSnap: t.aircraftSnap };
    } else f = { tipo: '', ring: [] };
    S.flight = f;
    fillSelects(f);
    $('f-inicio').value = f.inicio || ''; $('f-fin').value = f.fin || '';
    $('f-sitio').value = f.sitio || ''; $('f-obs').value = f.obs || ''; $('f-objetivo').value = f.objetivo || '';
    setChecked('tipo', [f.tipo]);
    setChecked('luz', [f.luz]); setChecked('viento', [f.viento]); setChecked('entorno', [f.entorno]);
    $('prefetchMsg').textContent = '';
    updateTotal();
    show('vuelo');
    ensureMap();
    S.baseLayer = f.layer || S.baseLayer || 'esri';
    setTimeout(() => {
      S.map.invalidateSize();
      setRing(f.ring && f.ring.length ? f.ring.slice() : [], true);
      if (!f.ring || !f.ring.length) {
        const prev = S.flights.find((x) => x.ring && x.ring.length > 2);
        if (prev) S.map.setView(Geo.centroid(prev.ring), 13);
      }
    }, 60);
  }

  async function saveFlight() {
    const pid = $('f-pilot').value, aid = $('f-aircraft').value;
    const inicio = $('f-inicio').value, fin = $('f-fin').value;
    if (!pid) { toast('Selecciona un piloto.'); return null; }
    if (!aid) { toast('Selecciona una aeronave.'); return null; }
    if (!inicio || !fin) { toast('Indica el inicio y el fin de la operación.'); return null; }
    const minutos = minutesBetween(inicio, fin);
    if (minutos < 0) { toast('El fin de la operación es anterior al inicio.', 4500); return null; }
    const objetivo = $('f-objetivo').value.trim();
    const tipo = checked('tipo')[0] || '', luz = checked('luz')[0] || '', viento = checked('viento')[0] || '', entorno = checked('entorno')[0] || '';
    const falta = [[objetivo, 'objetivo del vuelo'], [tipo, 'característica del vuelo'], [luz, 'condiciones de luz'], [viento, 'viento'], [entorno, 'entorno']].filter(([v]) => !v).map(([, l]) => l);
    if (falta.length) { toast('Falta: ' + falta.join(', ') + '.', 5500); return null; }

    const pilot = pilotOf(pid), aircraft = aircraftOf(aid);
    const on = inicio.slice(0, 10);
    if (pilot && ((pilot.expiracion && on > pilot.expiracion) || (pilot.otorgamiento && on < pilot.otorgamiento))) {
      if (!confirm('La autorización del piloto no está vigente en la fecha del vuelo. ¿Guardar de todos modos?')) return null;
    }

    const f = Object.assign({}, S.flight, {
      pilotId: pid, aircraftId: aid, inicio, fin, minutos, tipo, objetivo,
      sitio: $('f-sitio').value.trim(), obs: $('f-obs').value.trim(), luz, viento, entorno
    });
    // Aviso de traslape: el mismo piloto o la misma aeronave en dos vuelos que se cruzan en el tiempo.
    const choque = S.flights.find((g) => g.id !== f.id && (g.pilotId === pid || g.aircraftId === aid) && g.inicio < fin && inicio < g.fin);
    if (choque) {
      const quien = choque.pilotId === pid && choque.aircraftId === aid ? 'el mismo piloto y la misma aeronave' : choque.pilotId === pid ? 'el mismo piloto' : 'la misma aeronave';
      if (!confirm('Este vuelo se traslapa en el tiempo con ' + (choque.numLabel || 'otro registro') + ' (' + fmtDT(choque.inicio) + ' a ' + fmtDT(choque.fin) + '), con ' + quien + '. ¿Guardar de todos modos?')) return null;
    }
    // Copia de los datos dentro del registro: el PDF conserva lo que se firmó aunque luego se edite el catálogo.
    const livePilot = S.pilots.find((p) => p.id === pid), liveAc = S.aircraft.find((a) => a.id === aid);
    if (livePilot) f.pilotSnap = { id: livePilot.id, nombre: livePilot.nombre, cedula: livePilot.cedula, autorizacion: livePilot.autorizacion, otorgamiento: livePilot.otorgamiento, expiracion: livePilot.expiracion, firma: livePilot.firma };
    if (liveAc) f.aircraftSnap = { id: liveAc.id, nombre: liveAc.nombre, marca: liveAc.marca, modelo: liveAc.modelo, serie: liveAc.serie };

    busy(true, 'Guardando…');
    try {
      f.ring = S.ring.slice();
      f.layer = S.baseLayer;
      f.area = f.ring.length > 2 ? Geo.area(f.ring) : 0;
      f.perimetro = f.ring.length > 2 ? Geo.perimeter(f.ring) : 0;
      if (f.ring.length > 2) {
        $('busy').firstElementChild.textContent = 'Generando imagen del mapa…';
        const key = JSON.stringify(f.ring) + f.layer;
        const img = await MapImg.render(f.ring, f.layer);
        if (img.tilesOk === 0 && f.mapImage && f.imgTiles > 0 && f.imgKey === key) {
          /* se conserva la imagen anterior que sí tenía fondo */
        } else {
          f.mapImage = img.dataUrl; f.imgTiles = img.tilesOk; f.imgKey = key;
          if (img.tilesOk === 0) toast('Sin mapa de fondo en la imagen (sin conexión y sin teselas guardadas). Se dibujó solo el perímetro.', 6500);
        }
      } else { f.mapImage = ''; f.imgTiles = 0; f.imgKey = ''; }
      if (!f.id) { f.id = uid(); f.num = await DB.nextSeq(); f.numLabel = 'BV-' + pad(f.num, 4); f.createdAt = Date.now(); }
      f.updatedAt = Date.now();
      await DB.put('flights', f);
      S.lastPilot = pid; S.lastAircraft = aid;
      await DB.kvSet('lastPilot', pid); await DB.kvSet('lastAircraft', aid);
      await loadAll();
      return f;
    } catch (e) {
      console.error(e); toast('No se pudo guardar: ' + e.message, 6000); return null;
    } finally { busy(false); }
  }

  function flightPdf(f) {
    return { doc: PDF.flightDoc(f), name: 'Bitacora_' + (f.numLabel || 'vuelo') + '_' + (f.inicio || '').slice(0, 10) + '.pdf' };
  }
  function pdfNow(f) {
    try { const { doc, name } = flightPdf(f); doc.save(name); toast('PDF generado: ' + name); }
    catch (e) { console.error(e); toast('No se pudo generar el PDF: ' + e.message, 6000); }
  }
  async function sharePdf(f) {
    try {
      const { doc, name } = flightPdf(f);
      const file = new File([doc.output('blob')], name, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: name });
      else doc.save(name);
    } catch (e) { if (e.name !== 'AbortError') toast('No se pudo compartir: ' + e.message, 5000); }
  }

  function exportCsv() {
    const list = filteredFlights().slice().reverse();
    if (!list.length) { toast('No hay vuelos para exportar.'); return; }
    const cols = ['registro', 'inicio', 'fin', 'minutos', 'total_hhmm', 'piloto', 'cedula', 'autorizacion', 'aeronave', 'marca', 'modelo', 'serie', 'objetivo', 'caracteristica', 'luz', 'viento', 'entorno', 'lugar_proyecto', 'area_ha', 'lat_centroide', 'lon_centroide', 'observaciones'];
    const q = (v) => { const s = v == null ? '' : String(v); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = list.map((f) => {
      const p = f.pilotSnap || {}, a = f.aircraftSnap || {};
      const c = f.ring && f.ring.length > 2 ? Geo.centroid(f.ring) : ['', ''];
      return [f.numLabel, f.inicio, f.fin, f.minutos, hhmm(f.minutos), p.nombre, p.cedula, p.autorizacion, a.nombre, a.marca, a.modelo, a.serie, f.objetivo, f.tipo,
        f.luz, f.viento, f.entorno, f.sitio,
        f.area ? (f.area / 10000).toFixed(2) : '', c[0] === '' ? '' : c[0].toFixed(6), c[1] === '' ? '' : c[1].toFixed(6), f.obs].map(q).join(';');
    });
    download('﻿' + [cols.join(';')].concat(rows).join('\r\n'), 'bitacora_uas' + periodTag() + '_' + todayStr() + '.csv', 'text/csv;charset=utf-8');
  }

  /* GeoJSON solo de polígonos (perímetros de vuelo) con los datos del vuelo. Nombres de campo de hasta 10 caracteres
     para que no se trunquen si luego se convierte a shapefile. */
  function flightsGeoJSON(list) {
    const feats = list.filter((f) => f.ring && f.ring.length > 2).map((f) => {
      const p = f.pilotSnap || {}, a = f.aircraftSnap || {};
      const c = Geo.centroid(f.ring);
      const coords = f.ring.map(([lat, lng]) => [lng, lat]); coords.push(coords[0]);
      return {
        type: 'Feature',
        properties: {
          registro: f.numLabel || '', inicio: f.inicio || '', fin: f.fin || '', minutos: f.minutos, piloto: p.nombre || '',
          aeronave: a.nombre || '', marca: a.marca || '', modelo: a.modelo || '', serie: a.serie || '',
          objetivo: f.objetivo || '', tipo: f.tipo || '', luz: f.luz || '', viento: f.viento || '', entorno: f.entorno || '', lugar: f.sitio || '',
          area_ha: +(f.area / 10000).toFixed(3), perim_m: Math.round(f.perimetro), lat_cen: +c[0].toFixed(6), lon_cen: +c[1].toFixed(6)
        },
        geometry: { type: 'Polygon', coordinates: [coords] }
      };
    });
    return { n: feats.length, text: JSON.stringify({ type: 'FeatureCollection', features: feats }, null, 2) };
  }
  function exportGeoAll() {
    const r = flightsGeoJSON(filteredFlights());
    if (!r.n) { toast('Ningún vuelo tiene perímetro dibujado.'); return; }
    download(r.text, 'perimetros_vuelos' + periodTag() + '_' + todayStr() + '.geojson', 'application/geo+json');
    toast('GeoJSON con ' + r.n + ' perímetro' + (r.n === 1 ? '' : 's') + ' (WGS84).');
  }
  function exportGeoOne(f) {
    const r = flightsGeoJSON([f]);
    if (!r.n) { toast('Este vuelo no tiene perímetro.'); return; }
    download(r.text, 'perimetro_' + (f.numLabel || 'vuelo') + '.geojson', 'application/geo+json');
  }

  function summaryPdf() {
    const list = filteredFlights();
    if (!list.length) { toast('No hay vuelos para el resumen.'); return; }
    try { PDF.summaryDoc(list, S.period ? monthLabel(S.period) : '').save('Resumen_bitacora_UAS' + periodTag() + '_' + todayStr() + '.pdf'); }
    catch (e) { console.error(e); toast('Error al generar el resumen: ' + e.message, 6000); }
  }

  /* =====================================================
     RESPALDO Y ESTADO
     ===================================================== */
  async function renderStatus() {
    const ctl = 'serviceWorker' in navigator && navigator.serviceWorker.controller;
    $('offlineState').textContent = ctl
      ? 'La app está guardada en este teléfono y abre sin conexión.'
      : 'Aún no está guardada para uso sin conexión. Ábrela una vez con internet (y espera unos segundos) para que quede lista.';
    let t = S.pilots.length + ' pilotos · ' + S.aircraft.length + ' aeronaves · ' + S.flights.length + ' vuelos guardados.';
    try {
      if (navigator.storage && navigator.storage.persisted) {
        const per = await navigator.storage.persisted();
        const est = navigator.storage.estimate ? await navigator.storage.estimate() : null;
        t += ' Almacenamiento ' + (per ? 'protegido' : 'no protegido contra limpieza automática') + (est ? ' · uso: ' + (est.usage / 1048576).toFixed(1) + ' MB' : '') + '.';
      }
    } catch (e) { /* ignorar */ }
    $('storageInfo').textContent = t;
    $('backupInfo').textContent = S.lastBackup ? 'Último respaldo: ' + fmtDate(S.lastBackup.slice(0, 10)) + '.' : 'Aún no se ha hecho ningún respaldo en este teléfono.';
    let ver = '';
    try { const ks = await caches.keys(); const k = ks.find((x) => x.startsWith('bv-app-')); if (k) ver = k.replace('bv-app-', ''); } catch (e) { /* sin caché */ }
    $('versionInfo').textContent = ver ? 'Versión de la app: ' + ver : '';
  }

  async function backup() {
    const data = { app: 'bitacora-uas', version: 2, exportedAt: new Date().toISOString(), pilots: S.pilots, aircraft: S.aircraft, flights: S.flights, seq: await DB.kvGet('seq', 0) };
    download(JSON.stringify(data), 'respaldo_bitacora_uas_' + todayStr() + '.json', 'application/json');
    S.lastBackup = new Date().toISOString();
    await DB.kvSet('lastBackup', S.lastBackup);
    renderBackupBanner(); renderStatus();
    toast('Respaldo exportado.');
  }
  async function restore(file) {
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (d.app !== 'bitacora-uas') throw new Error('No es un respaldo de esta app.');
      if (!confirm('Se combinarán ' + (d.pilots || []).length + ' pilotos, ' + (d.aircraft || []).length + ' aeronaves y ' + (d.flights || []).length + ' vuelos con los datos actuales. ¿Continuar?')) return;
      const merge = async (store, items, cur) => {
        for (const it of items || []) {
          const mine = cur.find((x) => x.id === it.id);
          if (!mine || (it.updatedAt || 0) > (mine.updatedAt || 0)) await DB.put(store, it);
        }
      };
      await merge('pilots', d.pilots, S.pilots);
      await merge('aircraft', d.aircraft, S.aircraft);
      await merge('flights', d.flights, S.flights);
      await DB.kvSet('seq', Math.max(await DB.kvGet('seq', 0), d.seq || 0));
      await loadAll();
      renderStatus();
      toast('Respaldo importado.');
    } catch (e) { toast('No se pudo importar: ' + e.message, 5000); }
    $('fileRestore').value = '';
  }

  /* ---------- firma ---------- */
  class SigPad {
    constructor(cv) {
      this.cv = cv; this.g = cv.getContext('2d'); this.empty = true; this.down = false;
      const g = this.g; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#111';
      const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
      cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); this.down = true; const [x, y] = pos(e); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 0.1, y + 0.1); g.stroke(); this.empty = false; e.preventDefault(); });
      cv.addEventListener('pointermove', (e) => { if (!this.down) return; const [x, y] = pos(e); g.lineTo(x, y); g.stroke(); e.preventDefault(); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => cv.addEventListener(n, () => { this.down = false; }));
    }
    clear() { this.g.clearRect(0, 0, this.cv.width, this.cv.height); this.empty = true; }
    setImage(url) {
      this.clear(); if (!url) return;
      const im = new Image(); im.onload = () => { this.g.drawImage(im, 0, 0, this.cv.width, this.cv.height); this.empty = false; }; im.src = url;
    }
    toDataURL() { return this.cv.toDataURL('image/png'); }
  }

  /* =====================================================
     EVENTOS
     ===================================================== */
  document.addEventListener('click', async (e) => {
    const now = e.target.closest('[data-now]');
    if (now) { $(now.dataset.now).value = nowDT(); updateTotal(); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.dataset.id || S.detailId;
    const cur = () => S.flights.find((f) => f.id === id);
    switch (b.dataset.act) {
      case 'flight-back': if (S.flight && S.flight.id) openDetail(S.flight.id); else goTab('vuelos'); break;
      case 'detail-back': goTab('vuelos'); break;
      case 'fl-open': openDetail(id); break;
      case 'fl-edit': openFlight(id); break;
      case 'fl-dup': openFlight(null, { template: cur() }); break;
      case 'fl-pdf': pdfNow(cur()); break;
      case 'fl-share': sharePdf(cur()); break;
      case 'fl-geo': exportGeoOne(cur()); break;
      case 'fl-del':
        if (confirm('¿Eliminar este registro de la bitácora? Esta acción no se puede deshacer.')) { await DB.del('flights', id); await loadAll(); S.detailId = null; goTab('vuelos'); toast('Registro eliminado.'); }
        break;
      case 'backup-now': await backup(); break;
      case 'backup-later': S.backupSnooze = Date.now() + 7 * 86400000; await DB.kvSet('backupSnooze', S.backupSnooze); renderBackupBanner(); break;
      case 'pilot-back': goTab('pilotos'); break;
      case 'pilot-edit': openPilot(id); break;
      case 'pilot-del':
        if (confirm('¿Eliminar este piloto? Los vuelos ya registrados conservan sus datos.')) { await DB.del('pilots', id); await loadAll(); renderPilots(); toast('Piloto eliminado.'); }
        break;
      case 'aircraft-back': goTab('aeronaves'); break;
      case 'ac-edit': openAircraft(id); break;
      case 'ac-del':
        if (confirm('¿Eliminar esta aeronave? Los vuelos ya registrados conservan sus datos.')) { await DB.del('aircraft', id); await loadAll(); renderAircraft(); toast('Aeronave eliminada.'); }
        break;
    }
  });

  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => goTab(b.dataset.tab)));
  $('btnNewFlight').onclick = () => openFlight(null);
  $('btnNewPilot').onclick = () => openPilot(null);
  $('btnNewAircraft').onclick = () => openAircraft(null);
  $('btnSavePilot').onclick = savePilot;
  $('btnSaveAircraft').onclick = saveAircraft;
  $('sigPilotClear').onclick = () => S.sigPilot.clear();
  $('btnSaveFlight').onclick = async () => { const f = await saveFlight(); if (f) { toast('Vuelo guardado (' + f.numLabel + ').'); openDetail(f.id); } };
  $('periodFilter').onchange = (e) => { S.period = e.target.value; renderFlights(); };
  $('btnGeoAll').onclick = exportGeoAll;
  document.querySelectorAll('[data-sug]').forEach((b) => b.addEventListener('click', () => {
    const el = $('f-objetivo'), t = b.dataset.sug;
    if (el.value.toLowerCase().includes(t.toLowerCase())) { el.focus(); return; }
    el.value = el.value.trim() ? el.value.trim().replace(/[.,;]$/, '') + ', ' + t : t;
    el.focus();
  }));
  ['f-inicio', 'f-fin'].forEach((id) => $(id).addEventListener('input', updateTotal));
  $('f-pilot').addEventListener('change', refreshInfo);
  $('f-aircraft').addEventListener('change', refreshInfo);
  $('btnLocate').onclick = () => S.map && S.map.locate({ setView: true, maxZoom: 17, enableHighAccuracy: true });
  $('fileImport').onchange = (e) => importPerimeter(e.target.files[0]);
  $('btnExpGeo').onclick = () => exportPerimeter('geojson');
  $('btnExpKml').onclick = () => exportPerimeter('kml');
  $('btnPrefetch').onclick = prefetchArea;
  $('btnCsv').onclick = exportCsv;
  $('btnSummaryPdf').onclick = summaryPdf;
  $('btnBackup').onclick = backup;
  $('fileRestore').onchange = (e) => restore(e.target.files[0]);

  function netState() { const n = $('net'); n.textContent = navigator.onLine ? 'en línea' : 'sin conexión'; n.classList.toggle('off', !navigator.onLine); }
  window.addEventListener('online', netState); window.addEventListener('offline', netState);

  /* ---------- arranque ---------- */
  (async function init() {
    netState();
    try {
      await loadAll();
      S.lastPilot = await DB.kvGet('lastPilot', ''); S.lastAircraft = await DB.kvGet('lastAircraft', '');
      S.lastBackup = await DB.kvGet('lastBackup', ''); S.backupSnooze = await DB.kvGet('backupSnooze', 0);
    } catch (e) { console.error(e); toast('No se pudo abrir el almacenamiento local: ' + e.message, 8000); }
    goTab('vuelos');
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      // Aviso de versión nueva: el service worker nuevo toma el control; la página sigue con el código viejo hasta recargar.
      const hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) $('updateBar').classList.remove('hidden'); });
      $('btnReload').onclick = () => location.reload();
      navigator.serviceWorker.register('sw.js').then((reg) => {
        // Al volver a abrir la app desde segundo plano, se busca una versión nueva.
        document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
      }).catch((e) => console.warn('SW', e));
    }
    window.__BV = { S, DB, cedulaOk }; // depuración
  })();
})();
