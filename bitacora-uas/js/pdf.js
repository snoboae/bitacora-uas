/* Generación de PDF (jsPDF): registro de un vuelo y resumen de la bitácora. */
const PDF = (() => {
  const M = 14, PW = 210, BOTTOM = 280, CW = PW - 2 * M;
  const TEAL = [11, 79, 74], GRAY = [105, 113, 120], LINE = [198, 205, 209], SOFT = [232, 241, 240];
  const LH = 3.9;

  const fmtDate = (d) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10).split('-').reverse().join('/') : d || '-');
  const fmtDT = (s) => (s && s.length >= 16 ? fmtDate(s) + '  ' + s.slice(11, 16) : s || '-');
  const hhmm = (min) => (min == null || isNaN(min) ? '-' : String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(Math.round(min % 60)).padStart(2, '0'));
  const list = (a) => (Array.isArray(a) ? (a.length ? a.join(', ') : '-') : (a || '-'));

  function newDoc(orientation) {
    const { jsPDF } = window.jspdf;
    return new jsPDF({ unit: 'mm', format: 'a4', orientation: orientation || 'portrait' });
  }

  function header(doc, title, sub) {
    doc.setFillColor(...TEAL); doc.rect(0, 0, PW, 24, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text(title, M, 11);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.text(sub, M, 17.5);
    doc.setTextColor(0);
  }

  function ensure(ctx, h) {
    if (ctx.y + h > BOTTOM) { ctx.doc.addPage(); ctx.y = 16; return true; }
    return false;
  }

  function section(ctx, title) {
    ensure(ctx, 14);
    const d = ctx.doc;
    d.setFillColor(...SOFT); d.rect(M, ctx.y, CW, 6.5, 'F');
    d.setFont('helvetica', 'bold'); d.setFontSize(9.5); d.setTextColor(...TEAL);
    d.text(title.toUpperCase(), M + 2, ctx.y + 4.6);
    d.setTextColor(0); ctx.y += 8.5;
  }

  function grid(ctx, cells, cols) {
    const d = ctx.doc, cw = CW / cols;
    let i = 0;
    while (i < cells.length) {
      const row = []; let used = 0;
      while (i < cells.length && used < cols) {
        const c = cells[i]; const span = Math.min(c.span || 1, cols - used);
        row.push({ l: c.l, v: c.v, span }); used += span; i++;
      }
      if (used < cols) row[row.length - 1].span += cols - used;
      d.setFont('helvetica', 'normal'); d.setFontSize(9.5);
      let hMax = 0;
      row.forEach((c) => {
        c.lines = d.splitTextToSize(c.v === '' || c.v == null ? '-' : String(c.v), cw * c.span - 4);
        c.h = 4.6 + c.lines.length * LH + 1.4;
        hMax = Math.max(hMax, c.h);
      });
      ensure(ctx, hMax);
      let x = M;
      row.forEach((c) => {
        const w = cw * c.span;
        d.setDrawColor(...LINE); d.setLineWidth(0.2); d.rect(x, ctx.y, w, hMax);
        d.setFont('helvetica', 'normal'); d.setFontSize(7); d.setTextColor(...GRAY); d.text(c.l, x + 2, ctx.y + 3.5);
        d.setFontSize(9.5); d.setTextColor(0); d.text(c.lines, x + 2, ctx.y + 7.8);
        x += w;
      });
      ctx.y += hMax;
    }
    ctx.y += 3.5;
  }

  function footers(doc, label) {
    const n = doc.getNumberOfPages();
    for (let p = 1; p <= n; p++) {
      doc.setPage(p);
      const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
      doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(M, h - 12, w - M, h - 12);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
      doc.text(label, M, h - 7.5);
      doc.text('Página ' + p + ' de ' + n, w - M, h - 7.5, { align: 'right' });
      doc.setTextColor(0);
    }
  }

  function vertexTable(ctx, ring) {
    const d = ctx.doc;
    const c = Geo.centroid(ring);
    const zone = Geo.toUTM(c[0], c[1]).zone;
    const cols = [{ t: 'N°', w: 12 }, { t: 'Latitud (WGS84)', w: 42 }, { t: 'Longitud (WGS84)', w: 42 }, { t: 'Este UTM', w: 43 }, { t: 'Norte UTM', w: 43 }];
    const head = () => {
      d.setFillColor(...TEAL); d.rect(M, ctx.y, CW, 5.8, 'F');
      d.setTextColor(255); d.setFont('helvetica', 'bold'); d.setFontSize(8);
      let x = M; cols.forEach((k) => { d.text(k.t, x + 2, ctx.y + 4); x += k.w; });
      d.setTextColor(0); ctx.y += 5.8;
    };
    ensure(ctx, 20); head();
    d.setFont('helvetica', 'normal'); d.setFontSize(8.5);
    ring.slice(0, 80).forEach((p, i) => {
      if (ensure(ctx, 5.4)) head();
      const u = Geo.toUTM(p[0], p[1], zone);
      const cells = [String(i + 1), p[0].toFixed(6), p[1].toFixed(6), u.e.toFixed(1), u.n.toFixed(1)];
      if (i % 2) { d.setFillColor(246, 248, 249); d.rect(M, ctx.y, CW, 5.2, 'F'); }
      let x = M; cells.forEach((t, k) => { d.text(t, x + 2, ctx.y + 3.7); x += cols[k].w; });
      ctx.y += 5.2;
    });
    d.setDrawColor(...LINE); d.line(M, ctx.y, M + CW, ctx.y);
    ctx.y += 2;
    d.setFontSize(7.5); d.setTextColor(...GRAY);
    d.text('UTM WGS84 zona ' + zone + (c[0] < 0 ? 'S' : 'N') + (ring.length > 80 ? ' - se muestran los primeros 80 vértices de ' + ring.length : ''), M, ctx.y + 3);
    d.setTextColor(0); ctx.y += 7;
  }

  /* ---------- Registro de un vuelo ---------- */
  function flightDoc(f) {
    const p = f.pilotSnap || {}, a = f.aircraftSnap || {};
    const doc = newDoc();
    const ctx = { doc, y: 30 };
    header(doc, 'BITÁCORA DE VUELO DEL PILOTO UAS', 'Registro de horas de vuelo en UA - Normativa DGAC Ecuador, Parte 101');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('Registro N° ' + (f.numLabel || '-'), PW - M, 11, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.text('Fecha del vuelo: ' + fmtDate(f.inicio), PW - M, 17.5, { align: 'right' });
    doc.setTextColor(0);

    section(ctx, '1. Piloto UAS');
    grid(ctx, [
      { l: 'Nombre completo', v: p.nombre, span: 2 },
      { l: 'Cédula', v: p.cedula },
      { l: 'Autorización No.', v: p.autorizacion },
      { l: 'Fecha de otorgamiento', v: fmtDate(p.otorgamiento) },
      { l: 'Fecha de expiración', v: fmtDate(p.expiracion) }
    ], 3);

    section(ctx, '2. Aeronave (equipo UAS registrado)');
    grid(ctx, [
      { l: 'Nombre', v: a.nombre },
      { l: 'Marca (fabricante)', v: a.marca },
      { l: 'Modelo', v: a.modelo },
      { l: 'Nro de serie', v: a.serie }
    ], 4);

    section(ctx, '3. Operación');
    grid(ctx, [
      { l: 'Inicio - hora de despegue', v: fmtDT(f.inicio), span: 2 },
      { l: 'Fin - hora de aterrizaje', v: fmtDT(f.fin), span: 2 },
      { l: 'Tiempo total de vuelo', v: hhmm(f.minutos) + ' h  (' + (f.minutos != null ? f.minutos : '-') + ' min)', span: 2 },
      { l: 'Lugar / proyecto', v: f.sitio, span: 2 }
    ], 4);

    section(ctx, '4. Objetivo, característica y condiciones de operación');
    grid(ctx, [{ l: 'Objetivo del vuelo', v: f.objetivo }], 1);
    grid(ctx, [{ l: 'Característica del vuelo', v: f.tipo }], 1);
    grid(ctx, [
      { l: 'Condiciones de luz', v: list(f.luz) },
      { l: 'Viento', v: list(f.viento) },
      { l: 'Entorno', v: list(f.entorno) }
    ], 3);

    if (f.obs) { section(ctx, '5. Observaciones'); grid(ctx, [{ l: 'Detalle', v: f.obs }], 1); }

    ensure(ctx, 46);
    section(ctx, 'Firma del piloto');
    const top = ctx.y;
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.rect(M, top, 90, 26);
    if (p.firma) { try { doc.addImage(p.firma, 'PNG', M + 2, top + 1, 86, 24); } catch (e) { /* firma inválida */ } }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(p.nombre || '', M, top + 31);
    doc.setFontSize(7.5); doc.setTextColor(...GRAY);
    doc.text('Piloto a distancia' + (p.autorizacion ? ' - Autorización ' + p.autorizacion : ''), M, top + 35);
    doc.text('Generado: ' + new Date().toLocaleString('es-EC'), PW - M, top + 35, { align: 'right' });
    doc.setTextColor(0);
    ctx.y = top + 40;

    const ring = f.ring || [];
    if (ring.length >= 3) {
      doc.addPage(); ctx.y = 16;
      section(ctx, 'Anexo - Perímetro de vuelo');
      const cen = Geo.centroid(ring);
      grid(ctx, [
        { l: 'Área', v: (f.area / 10000).toFixed(2) + ' ha' },
        { l: 'Perímetro (longitud)', v: Math.round(f.perimetro) + ' m' },
        { l: 'Vértices', v: String(ring.length) },
        { l: 'Centroide (WGS84)', v: cen[0].toFixed(6) + ', ' + cen[1].toFixed(6) }
      ], 4);
      if (f.mapImage) {
        const h = CW * 800 / 1200;
        ensure(ctx, h + 4);
        doc.addImage(f.mapImage, 'JPEG', M, ctx.y, CW, h);
        doc.setDrawColor(...LINE); doc.rect(M, ctx.y, CW, h);
        ctx.y += h + 5;
      }
      vertexTable(ctx, ring);
    }

    footers(doc, 'Bitácora de vuelo UAS - Registro ' + (f.numLabel || '') + ' - ' + (p.nombre || ''));
    return doc;
  }

  /* ---------- Resumen de toda la bitácora ---------- */
  function summaryDoc(flights, periodLabel) {
    const doc = newDoc('portrait');
    const sorted = flights.slice().sort((a, b) => (a.inicio || '').localeCompare(b.inicio || ''));
    const total = sorted.reduce((s, f) => s + (f.minutos || 0), 0);
    const names = Array.from(new Set(sorted.map((f) => (f.pilotSnap || {}).nombre).filter(Boolean)));
    header(doc, 'BITÁCORA DE VUELO DEL PILOTO UAS - RESUMEN', names.join(' / ') || 'Piloto');
    const ctx = { doc, y: 30 };
    grid(ctx, [
      { l: 'Vuelos registrados', v: String(sorted.length) },
      { l: 'Horas totales de vuelo', v: hhmm(total) + ' h' },
      { l: 'Periodo', v: periodLabel ? periodLabel : sorted.length ? fmtDate(sorted[0].inicio) + ' a ' + fmtDate(sorted[sorted.length - 1].inicio) : '-' }
    ], 3);
    const cols = [{ t: 'Registro', w: 19 }, { t: 'Inicio', w: 30 }, { t: 'Lugar / proyecto', w: 44 }, { t: 'Piloto', w: 38 }, { t: 'Aeronave', w: 37 }, { t: 'Total', w: 14 }];
    const head = () => {
      doc.setFillColor(...TEAL); doc.rect(M, ctx.y, CW, 6, 'F');
      doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      let x = M; cols.forEach((k) => { doc.text(k.t, x + 1.5, ctx.y + 4.1); x += k.w; });
      doc.setTextColor(0); ctx.y += 6;
    };
    head();
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.3);
    sorted.forEach((f, i) => {
      if (ensure(ctx, 6)) head();
      const cut = (t, w) => { const l = doc.splitTextToSize(String(t || '-'), w - 3); return l[0] + (l.length > 1 ? '...' : ''); };
      const cells = [f.numLabel || '-', fmtDT(f.inicio), f.sitio || '-', (f.pilotSnap || {}).nombre, (f.aircraftSnap || {}).nombre, hhmm(f.minutos)];
      if (i % 2) { doc.setFillColor(246, 248, 249); doc.rect(M, ctx.y, CW, 5.6, 'F'); }
      let x = M; cells.forEach((t, k) => { doc.text(cut(t, cols[k].w), x + 1.5, ctx.y + 3.9); x += cols[k].w; });
      ctx.y += 5.6;
    });
    ensure(ctx, 10);
    doc.setDrawColor(...TEAL); doc.setLineWidth(0.4); doc.line(M, ctx.y, M + CW, ctx.y);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('TOTAL', M + 1.5, ctx.y + 5);
    doc.text(hhmm(total) + ' h', M + CW - 14 + 1.5, ctx.y + 5);
    footers(doc, 'Resumen de bitácora UAS - Generado ' + new Date().toLocaleDateString('es-EC'));
    return doc;
  }

  return { flightDoc, summaryDoc, hhmm, fmtDate, fmtDT };
})();
