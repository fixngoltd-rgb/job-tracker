/* Fix & Go work report PDF maker - V2 layout (A4).
   Separate from V1 (workreport.js), which is not touched.
   - page 1: logo, client/property/date row, report title, then the sections of the typed text
     (Work Carried Out as a tick list, Outcome in a padded box). Text size is chosen so page 1 fills down to the terms bar.
   - photo pages: 3 across, optional section headings, BEFORE / AFTER tags and captions when labels exist.
   Photos come in as [{ url, section?, tag?, caption? }]. With no labels they are simply placed in the given order.
   Only the text typed into the report box is used. No numbers or prices are ever added. */
(function(){
  const BASE = window.WR_BASE || ((document.currentScript && document.currentScript.src)
    ? document.currentScript.src.replace(/[^\/]*$/, '') : 'wr/');
  const W = 595.28, H = 841.89, M = 36;
  const C = { navy: [38, 50, 74], purple: [91, 39, 121], cyan: [10, 159, 198], grey: [95, 102, 115], text: [51, 58, 71], light: [242, 243, 246], line: [220, 223, 230], tint: [244, 239, 250], white: [255, 255, 255] };
  const LOGO_AR = 401 / 900, TERMS_AR = 228 / 1600;
  const CLIENT = ['Accommodation.co.uk', '111 Piccadilly, Manchester,', 'England, M1 2HY'];

  let assetsP = null;
  function loadAssets(){
    if(assetsP) return assetsP;
    const b64 = buf => { let s = '', a = new Uint8Array(buf); for(let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
    const url = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
    assetsP = Promise.all([
      fetch(BASE + 'Montserrat-400.ttf').then(r => r.arrayBuffer()).then(b64),
      fetch(BASE + 'Montserrat-700.ttf').then(r => r.arrayBuffer()).then(b64),
      fetch(BASE + 'v2-logo.jpg').then(r => r.blob()).then(url),
      fetch(BASE + 'v2-terms.jpg').then(r => r.blob()).then(url)
    ]).then(([reg, bold, logo, terms]) => ({ reg, bold, logo, terms }));
    assetsP.catch(() => { assetsP = null; });
    return assetsP;
  }

  /* ---------- text ---------- */
  const SMALL = new Set(['and', 'or', 'of', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'with', 'by']);
  function titleCase(s){
    return String(s).toLowerCase().replace(/[a-z0-9£&'’]+/g, (w, i) => (i > 0 && SMALL.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1));
  }
  function parse(text){
    const blocks = (window.WorkReport && window.WorkReport.parseText) ? window.WorkReport.parseText(text) : [];
    let title = '', sections = [], cur = null;
    blocks.forEach(b => {
      if(b.k === 'h'){ title = titleCase(b.t.replace(/^work report\s*[-:]?\s*/i, '')); return; }
      if(b.k === 's'){ cur = { name: b.t, items: [] }; sections.push(cur); return; }
      if(!cur){ cur = { name: '', items: [] }; sections.push(cur); }
      cur.items.push(b.t);
    });
    return { title, sections };
  }

  /* ---------- photos ---------- */
  async function loadImg(src){
    const r = await fetch(src); if(!r.ok) throw new Error('photo download failed (' + r.status + ')');
    const u = URL.createObjectURL(await r.blob());
    try { const img = new Image(); img.src = u; await img.decode(); return img; }
    finally { setTimeout(() => URL.revokeObjectURL(u), 0); }
  }
  // portrait photos are centre-cropped to the tile (a little biased to the top); landscape photos are kept whole
  async function prepPhoto(src, tileAR){
    const img = await loadImg(src);
    const w0 = img.naturalWidth, h0 = img.naturalHeight, land = w0 > h0;
    let sx = 0, sy = 0, sw = w0, sh = h0;
    if(!land){
      const ir = w0 / h0;
      if(ir > tileAR){ sw = Math.round(h0 * tileAR); sx = Math.round((w0 - sw) / 2); }
      else { sh = Math.round(w0 / tileAR); sy = Math.round((h0 - sh) * 0.4); }
    }
    const k = Math.min(1, 1000 / Math.max(sw, sh));
    const cw = Math.max(1, Math.round(sw * k)), ch = Math.max(1, Math.round(sh * k));
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch); g.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
    return { data: cv.toDataURL('image/jpeg', 0.82), w: cw, h: ch, land };
  }

  /* ---------- main ---------- */
  async function makePdf(opts){
    // opts: { address, text, date, photos: [{url, section, tag, caption}] }
    const A = await loadAssets();
    const J = (window.jspdf && window.jspdf.jsPDF); if(!J) throw new Error('PDF library not loaded');
    const doc = new J({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true });
    doc.addFileToVFS('M400.ttf', A.reg); doc.addFont('M400.ttf', 'Montserrat', 'normal');
    doc.addFileToVFS('M700.ttf', A.bold); doc.addFont('M700.ttf', 'Montserrat', 'bold');
    const fill = c => doc.setFillColor(c[0], c[1], c[2]);
    const ink = c => doc.setTextColor(c[0], c[1], c[2]);
    const stroke = c => doc.setDrawColor(c[0], c[1], c[2]);
    const font = (b, sz) => { doc.setFont('Montserrat', b ? 'bold' : 'normal'); doc.setFontSize(sz); };

    const rep = parse(opts.text);
    if(!rep.sections.length && !rep.title) throw new Error('Write the report text first.');
    const address = String(opts.address || '').trim();
    const dateStr = opts.date || '';

    const termsH = W * TERMS_AR;
    const LIM1 = H - termsH - 22;       // lowest y for text on page 1
    const LIMN = H - 50;                // lowest y on any later text page

    function topBand(){ fill(C.purple); doc.rect(0, 0, W, 10, 'F'); }
    function smallHeader(){
      topBand();
      const lw = 70; doc.addImage(A.logo, 'JPEG', M, 16, lw, lw * LOGO_AR, undefined, 'FAST');
      font(true, 9); ink(C.navy); doc.text('Work Completion Report', W - M, 34, { align: 'right' });
      font(false, 8); ink(C.grey); doc.text(address + (dateStr ? '  |  ' + dateStr : ''), W - M, 46, { align: 'right' });
      stroke(C.line); doc.setLineWidth(0.6); doc.line(M, 60, W - M, 60);
    }

    /* ----- page 1 header + info row ----- */
    topBand();
    const lw = 150, lh = lw * LOGO_AR;
    doc.addImage(A.logo, 'JPEG', M, 26, lw, lh, undefined, 'FAST');
    font(true, 22); ink(C.navy); doc.text('Work Completion Report', W - M, 62, { align: 'right' });
    font(false, 9); ink(C.grey); doc.text('Fix&Go Ltd', W - M, 80, { align: 'right' });
    doc.text('fixngoltd@gmail.com   |   01217203344', W - M, 92, { align: 'right' });
    let y = 26 + lh + 16;
    stroke(C.line); doc.setLineWidth(0.8); doc.line(M, y, W - M, y);
    y += 17;
    font(false, 9.5);
    const addrLines = (function(){
      const toks = address.split(',').map(s => s.trim()).filter(Boolean);
      let out = toks.map((t, i) => i < toks.length - 1 ? t + ',' : t);
      while(out.length > 3){ const n = out.length; out.splice(n - 2, 2, out[n - 2] + ' ' + out[n - 1]); }
      return out.map(l => doc.splitTextToSize(l, 180)).reduce((a, b) => a.concat(b), []);
    })();
    const cols = [['PROPERTY', addrLines, M], ['CLIENT', CLIENT, M + 205], ['DATE COMPLETED', dateStr ? [dateStr] : [''], M + 400]];
    let rowH = 0;
    cols.forEach(([lab, lines, x]) => {
      font(true, 7.5); ink(C.purple); doc.text(lab, x, y);
      font(false, 9.5); ink(C.navy);
      lines.forEach((l, i) => doc.text(l, x, y + 14 + i * 12.5));
      rowH = Math.max(rowH, 14 + lines.length * 12.5);
    });
    y += rowH + 4;
    stroke(C.line); doc.line(M, y, W - M, y);
    y += 30;
    const bodyTop = y;

    /* ----- body text flow (dry run to pick a size, then draw) ----- */
    const bodyW = W - 2 * M;
    function flow(sz, extra, draw, startPage){
      let page = 1, yy = bodyTop;
      const lead = sz * 1.34, gapItem = sz * 0.28;
      const lim = () => page === 1 ? LIM1 : LIMN;
      function brk(need){
        if(yy + need <= lim()) return;
        page++;
        if(draw){ doc.addPage(); smallHeader(); }
        yy = 78;
      }
      if(rep.title){
        font(true, sz + 6); const tl = doc.splitTextToSize(rep.title, bodyW);
        brk(tl.length * (sz + 9));
        if(draw){ ink(C.navy); tl.forEach((l, i) => doc.text(l, M, yy + i * (sz + 9))); }
        yy += tl.length * (sz + 9) + 4 + extra * 0.5;
      }
      rep.sections.forEach(sec => {
        const kind = /outcome/i.test(sec.name) ? 'box' : (/work carried out|works? (done|completed)|completed/i.test(sec.name) ? 'tick' : 'dot');
        const hH = sz + 9;
        // keep a heading with at least its first item
        font(false, sz); const firstH = sec.items.length ? doc.splitTextToSize(sec.items[0], bodyW - 24).length * lead + 8 : 0;
        brk(hH + firstH + (kind === 'box' ? 30 : 0));
        if(sec.name && kind !== 'box'){
          if(draw){ fill(C.purple); doc.rect(M, yy - sz * 0.75, 3, sz + 3, 'F'); font(true, sz + 2); ink(C.navy); doc.text(sec.name, M + 10, yy); }
          yy += hH;
        }
        if(kind === 'box'){
          font(false, sz); const lines = []; sec.items.forEach(t => doc.splitTextToSize(t, bodyW - 40).forEach(l => lines.push(l)));
          const P = 15 + extra * 0.25, tSz = sz + 2, bl = sz * 1.6;
          const boxH = P + tSz * 0.72 + 9 + (lines.length - 1) * bl + sz * 0.72 + sz * 0.22 + P;
          brk(boxH);
          if(draw){
            fill(C.tint); stroke(C.purple); doc.setLineWidth(0.6); doc.roundedRect(M, yy, bodyW, boxH, 5, 5, 'FD');
            font(true, tSz); ink(C.purple); doc.text('Outcome', M + 16, yy + P + tSz * 0.72);
            font(false, sz); ink(C.navy);
            lines.forEach((l, i) => doc.text(l, M + 16, yy + P + tSz * 0.72 + 9 + sz * 0.72 + i * bl));
          }
          yy += boxH + 8;
          return;
        }
        sec.items.forEach(t => {
          font(false, sz);
          const lines = doc.splitTextToSize(t, bodyW - 24);
          brk(lines.length * lead);
          if(draw){
            if(kind === 'tick'){
              stroke(C.cyan); doc.setLineWidth(1.5);
              doc.line(M + 1.5, yy - sz * 0.32, M + 4.5, yy + 0.4); doc.line(M + 4.5, yy + 0.4, M + 10.5, yy - sz * 0.78);
            } else { fill(C.grey); doc.circle(M + 5, yy - sz * 0.3, 1.5, 'F'); }
            font(false, sz); ink(C.text);
            lines.forEach((l, i) => doc.text(l, M + 18, yy + i * lead));
          }
          yy += lines.length * lead + gapItem;
        });
        yy += sz * 0.9 + extra;
      });
      return { page, end: yy };
    }
    // largest size that keeps everything on page 1; otherwise the smallest size and flow onto more pages
    let chosen = 8, ok = false;
    for(let sz = 12; sz >= 8; sz -= 0.25){ const r = flow(sz, 0, false); if(r.page === 1 && r.end <= LIM1){ chosen = sz; ok = true; break; } }
    let extra = 0;
    if(ok){ const r = flow(chosen, 0, false); extra = Math.max(0, Math.min(16, (LIM1 - r.end) / Math.max(1, rep.sections.length + 1))); }
    // terms bar goes on page 1 first so it sits behind nothing else
    doc.addImage(A.terms, 'JPEG', 0, H - termsH, W, termsH, undefined, 'FAST');
    flow(chosen, extra, true);

    /* ----- photo pages ----- */
    const photos = opts.photos || [];
    if(photos.length){
      const COLS = 3, GAP = 10, CW = (W - 2 * M - (COLS - 1) * GAP) / COLS, PH = CW * 1.12, CAP = 16, ROW = PH + CAP + 10;
      const TOP = 84, BOT = 46, HEAD = 28;
      const prepared = [];
      for(const p of photos) prepared.push(Object.assign({}, p, { img: await prepPhoto(p.url, CW / PH) }));
      doc.addPage(); smallHeader();
      let py = TOP, first = true, lastSection = null;
      const newPage = () => { doc.addPage(); smallHeader(); py = TOP; };
      // group runs of the same section
      const groups = []; prepared.forEach(p => { const s = p.section || ''; let g = groups.find(x => x.s === s); if(!g){ g = { s, items: [] }; groups.push(g); } g.items.push(p); });   // one block per section, in first-seen order
      groups.forEach(g => {
        if(g.s){
          if(!first) py += 12;
          if(py + HEAD + ROW > H - BOT) newPage();
          fill(C.purple); doc.rect(M, py - 9, 3, 13, 'F'); font(true, 11); ink(C.navy); doc.text(g.s, M + 10, py); py += HEAD - 10;
        }
        for(let i = 0; i < g.items.length; i += COLS){
          if(py + ROW > H - BOT){
            newPage();
            if(g.s){ fill(C.purple); doc.rect(M, py - 9, 3, 13, 'F'); font(true, 11); ink(C.navy); doc.text(g.s + ' (continued)', M + 10, py); py += HEAD - 10; }
          }
          g.items.slice(i, i + COLS).forEach((p, j) => {
            const x = M + j * (CW + GAP);
            fill(C.light); doc.roundedRect(x, py, CW, PH, 3, 3, 'F');
            const im = p.img;
            if(im.land){ const s = Math.min(CW / im.w, PH / im.h), dw = im.w * s, dh = im.h * s; doc.addImage(im.data, 'JPEG', x + (CW - dw) / 2, py + (PH - dh) / 2, dw, dh, undefined, 'FAST'); }
            else doc.addImage(im.data, 'JPEG', x, py, CW, PH, undefined, 'FAST');
            if(p.tag){
              const lab = String(p.tag).toUpperCase(); font(true, 6.5);
              const tw = doc.getTextWidth(lab) + 12;
              fill(/before/i.test(lab) ? C.grey : C.cyan); doc.roundedRect(x + 6, py + 6, tw, 13, 6.5, 6.5, 'F');
              ink(C.white); doc.text(lab, x + 12, py + 15);
            }
            if(p.caption){ font(false, 7.8); ink(C.navy); doc.text(doc.splitTextToSize(p.caption, CW)[0], x, py + PH + 12); }
          });
          py += ROW; first = false;
        }
      });
    }

    /* ----- page numbers + footer line ----- */
    const total = doc.getNumberOfPages();
    for(let i = 1; i <= total; i++){
      doc.setPage(i);
      if(i === 1) continue;
      font(false, 7.5); ink(C.grey);
      doc.text('Fix&Go Ltd  |  fixngoltd@gmail.com  |  01217203344', M, H - 22);
      doc.text('Page ' + i + ' of ' + total, W - M, H - 22, { align: 'right' });
    }
    const blob = doc.output('blob');
    blob.layout = 'V2';
    return blob;
  }

  window.WorkReport2 = { makePdf, parse };
})();
