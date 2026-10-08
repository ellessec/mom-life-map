(async function () {
  'use strict';
  const G = window.GIFT;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isPhone = () => innerWidth <= 760;

  const STAMPS = [
    { k: 'warm', zh: '暖', en: 'warm', c: '#C98B84' },
    { k: 'miss', zh: '念', en: 'missing', c: '#7F93AE' },
    { k: 'grow', zh: '长', en: 'growing', c: '#8FA37E' },
    { k: 'proud', zh: '傲', en: 'proud', c: '#B9A06A' },
    { k: 'calm', zh: '静', en: 'calm', c: '#9A9AA6' }
  ];
  const stampOf = k => STAMPS.find(s => s.k === k) || STAMPS[0];

  /* ---------- state ---------- */
  await Store.open();
  const S = Object.assign({ custom: [], years: {}, cards: [], photos: [] }, (await Store.get('state')) || {});
  const save = () => Store.set('state', S).catch(() => {});
  const urls = new Map();
  for (const p of S.photos) {
    try {
      const t = await Store.getBlob('t:' + p.id), f = await Store.getBlob('f:' + p.id);
      if (t) urls.set(p.id, { thumb: URL.createObjectURL(t), full: URL.createObjectURL(f || t) });
    } catch (e) {}
  }

  const places = () => [
    ...G.places.map(p => ({ ...p, year: S.years[p.id] ?? p.year, gift: true })),
    ...S.custom.map(p => ({ ...p, gift: false }))
  ];
  const placeById = id => places().find(p => p.id === id);
  const giftPhotos = G.photos.map((p, i) => {
    const src = p.src || sampleArt(p.art || 'zz');
    const home = G.places.find(x => x.id === p.place);
    return { id: 'g' + i, place: p.place, coord: p.coord || jitter(home ? home.coord : [0, 0]), thumb: src, full: src, caption: p.caption || '', date: p.date || '', sample: !!p.sample, o: (p.sample ? 5000 : 0) + i };
  });
  const photos = () => [
    ...giftPhotos,
    ...S.photos.filter(p => urls.has(p.id) && placeById(p.place)).map((p, i) => ({ ...p, ...urls.get(p.id), mine: true, o: 1000 + i }))
  ].filter(p => placeById(p.place));
  const cardsOf = id => S.cards.filter(c => c.place === id);
  const photosOf = id => photos().filter(p => p.place === id).sort((a, b) => a.o - b.o);

  function jitter([lon, lat], km = 1.5) {
    const r = km / 111 * Math.sqrt(Math.random()), t = Math.random() * Math.PI * 2;
    return [lon + r * Math.cos(t) / Math.cos(lat * Math.PI / 180), lat + r * Math.sin(t)];
  }
  function km(a, b) {
    const R = 6371, d2r = Math.PI / 180;
    const dLat = (b[1] - a[1]) * d2r, dLon = (b[0] - a[0]) * d2r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * d2r) * Math.cos(b[1] * d2r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function unwrap(coords) {
    const out = [];
    coords.forEach((c, i) => {
      let lon = c[0];
      if (i) { const prev = out[i - 1][0]; while (lon - prev > 180) lon -= 360; while (lon - prev < -180) lon += 360; }
      out.push([lon, c[1]]);
    });
    return out;
  }
  function greatCircle(a, b, n = 64) {
    const d2r = Math.PI / 180, r2d = 180 / Math.PI;
    const [l1, p1] = [a[0] * d2r, a[1] * d2r], [l2, p2] = [b[0] * d2r, b[1] * d2r];
    const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
    if (d < 1e-6) return [a, b];
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
      const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
      const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
      const z = A * Math.sin(p1) + B * Math.sin(p2);
      pts.push([Math.atan2(y, x) * r2d, Math.atan2(z, Math.sqrt(x * x + y * y)) * r2d]);
    }
    return pts;
  }
  /* life order: by year; places without a year stay next to their neighbours */
  function lifeOrder() {
    let last = -Infinity;
    return places().map((p, i) => {
      const yrs = [p.year, ...cardsOf(p.id).map(c => c.year)].map(Number).filter(y => y > 1000);
      const y = yrs.length ? Math.min(...yrs) : null;
      const key = y ?? (last + 0.001); if (y != null) last = y; else last = key;
      return { p, key, y, i };
    }).sort((a, b) => a.key - b.key || a.i - b.i).map(x => ({ ...x.p, firstYear: x.y }));
  }
  function updateStats() {
    const n = places().length, ph = photos().filter(p => !p.sample).length, c = S.cards.length;
    $('#statLine').textContent = `${n} 个地方 · ${ph} 张照片 · ${c} 张明信片`;
  }

  /* ---------- map ---------- */
  const map = new maplibregl.Map({
    container: 'map',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [-160, 38], zoom: 1.4, minZoom: 0.6, maxZoom: 17.5,
    dragRotate: false, pitchWithRotate: false, touchPitch: false,
    attributionControl: { compact: true },
    localIdeographFontFamily: "'PingFang SC','Hiragino Sans GB','Noto Sans SC','Microsoft YaHei',sans-serif"
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation && map.keyboard.disableRotation();

  function sheetPadding() {
    if (!document.body.classList.contains('sheet-open')) return { top: 90, bottom: 140, left: 40, right: 40 };
    return isPhone() ? { top: 70, bottom: Math.round(innerHeight * 0.6), left: 30, right: 30 } : { top: 70, bottom: 70, left: 60, right: 480 };
  }
  function homeView(animate = true) {
    const pts = unwrap(places().map(p => p.coord));
    const lons = pts.map(p => p[0]), lats = pts.map(p => p[1]);
    const b = [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
    map.fitBounds(b, { padding: sheetPadding(), duration: animate && !reduce ? 1400 : 0, maxZoom: 9 });
  }

  map.on('style.load', () => {
    try {
      for (const l of map.getStyle().layers) {
        if (l.type === 'symbol' && l.layout && l.layout['text-field'] && JSON.stringify(l.layout['text-field']).includes('name')) {
          map.setLayoutProperty(l.id, 'text-field', ['coalesce', ['get', 'name:zh'], ['get', 'name:zh-Hans'], ['get', 'name:en'], ['get', 'name']]);
        }
      }
    } catch (e) {}
  });

  /* ---------- clusters (photo bubbles) ---------- */
  let index = null, PH = new Map();
  const markers = new Map();
  function buildIndex() {
    const list = photos();
    PH = new Map(list.map(p => [p.id, p]));
    index = new Supercluster({
      radius: 70, maxZoom: 16,
      map: p => ({ rid: p.id, ro: p.o }),
      reduce: (a, b) => { if (b.ro < a.ro) { a.rid = b.rid; a.ro = b.ro; } }
    });
    index.load(list.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: p.coord }, properties: { id: p.id, o: p.o } })));
    markers.forEach(m => m.remove()); markers.clear();
    render();
    updateStats();
  }
  function bboxNow() {
    const b = map.getBounds(), w = b.getWest(), e = b.getEast();
    if (e - w >= 360) return [-180, -85, 180, 85];
    const wrap = x => (((x + 180) % 360) + 360) % 360 - 180;
    return [wrap(w), Math.max(-85, b.getSouth()), wrap(e), Math.min(85, b.getNorth())];
  }
  function render() {
    if (!index) return;
    const z = Math.max(0, Math.floor(map.getZoom()));
    const feats = index.getClusters(bboxNow(), z);
    const seen = new Set();
    for (const f of feats) {
      const p = f.properties, key = p.cluster ? 'c' + p.cluster_id : 'p' + p.id;
      seen.add(key);
      if (markers.has(key)) continue;
      const rep = PH.get(p.cluster ? p.rid : p.id); if (!rep) continue;
      const n = p.cluster ? p.point_count : 1;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'bubble' + (n >= 10 ? ' big' : '');
      el.setAttribute('aria-label', `${placeById(rep.place)?.city || ''} ${n} 张照片`);
      el.innerHTML = `<img src="${rep.thumb}" alt="">` + (n > 1 ? `<span class="n">${n.toLocaleString()}</span>` : '');
      el.addEventListener('click', ev => { ev.stopPropagation(); onBubble(f); });
      const m = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -8] }).setLngLat(f.geometry.coordinates).addTo(map);
      el.style.zIndex = 2;
      markers.set(key, m);
    }
    for (const [k, m] of markers) if (!seen.has(k)) { m.remove(); markers.delete(k); }
    layoutPins();
  }
  function onBubble(f) {
    hideHint();
    if (picking) return;
    const p = f.properties;
    if (!p.cluster) {
      const ph = PH.get(p.id);
      openPlace(ph.place, { fly: false });
      const list = photosOf(ph.place);
      openLightbox(list, list.findIndex(x => x.id === ph.id));
      return;
    }
    const leaves = index.getLeaves(p.cluster_id, Infinity).map(l => PH.get(l.properties.id)).filter(Boolean);
    let spread = 0;
    for (let i = 1; i < leaves.length; i++) spread = Math.max(spread, km(leaves[0].coord, leaves[i].coord));
    const ez = index.getClusterExpansionZoom(p.cluster_id);
    if (spread > 0.25 && ez <= 16) {
      map.easeTo({ center: f.geometry.coordinates, zoom: Math.min(ez + 0.4, 16), duration: reduce ? 0 : 900 });
    } else {
      const placeId = leaves[0].place;
      openPlace(placeId, { fly: true });
    }
  }
  map.on('move', () => { if (!renderQueued) { renderQueued = true; requestAnimationFrame(() => { renderQueued = false; render(); }); } });
  let renderQueued = false;

  /* ---------- place pins ---------- */
  const pins = new Map();
  let selectedPlace = null;
  function buildPins() {
    pins.forEach(m => m.remove()); pins.clear();
    for (const p of places()) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'pin' + (p.gift ? '' : ' custom') + (p.id === selectedPlace ? ' sel' : '');
      const n = cardsOf(p.id).length;
      el.innerHTML = `<i></i>${esc(p.city)}${n ? `<small>✉ ${n}</small>` : ''}`;
      el.addEventListener('click', ev => { ev.stopPropagation(); if (!picking) openPlace(p.id, { fly: true }); });
      el.style.zIndex = 3;
      const m = new maplibregl.Marker({ element: el, anchor: 'top', offset: [0, 4] }).setLngLat(p.coord).addTo(map);
      pins.set(p.id, m);
    }
    layoutPins();
  }
  function layoutPins() {
    const placed = [];
    const order = places().slice().sort((a, b) => (b.id === selectedPlace) - (a.id === selectedPlace));
    for (const p of order) {
      const m = pins.get(p.id); if (!m) continue;
      const pt = map.project(m.getLngLat());
      const hit = placed.some(q => Math.abs(q.x - pt.x) < 90 && Math.abs(q.y - pt.y) < 30);
      m.getElement().style.visibility = hit ? 'hidden' : 'visible';
      if (!hit) placed.push(pt);
    }
  }

  /* ---------- sheet: one place ---------- */
  const sheet = $('#sheet'), body = $('#sheetBody');
  function openPlace(id, { fly = true } = {}) {
    const p = placeById(id); if (!p) return;
    selectedPlace = id;
    pins.forEach((m, k) => m.getElement().classList.toggle('sel', k === id));
    renderSheet();
    sheet.hidden = false;
    document.body.classList.add('sheet-open');
    requestAnimationFrame(() => sheet.classList.add('open'));
    hideHint();
    if (fly) map.flyTo({ center: p.coord, zoom: Math.max(map.getZoom(), 9), padding: sheetPadding(), duration: reduce ? 0 : 1600, essential: true });
  }
  function closeSheet() {
    selectedPlace = null;
    pins.forEach(m => m.getElement().classList.remove('sel'));
    sheet.classList.remove('open');
    document.body.classList.remove('sheet-open');
    setTimeout(() => { if (!sheet.classList.contains('open')) sheet.hidden = true; }, 500);
  }
  function renderSheet() {
    const p = placeById(selectedPlace); if (!p) return closeSheet();
    const ph = photosOf(p.id), cards = cardsOf(p.id).slice().reverse();
    const others = places().filter(x => x.id !== p.id);
    body.innerHTML = `
      <div class="sh-head">
        <div><div class="region">${esc(p.region || '')}</div><h2>${esc(p.city)}</h2>${p.en ? `<p class="en">${esc(p.en)}</p>` : ''}</div>
        <button class="x" type="button" id="shClose" aria-label="关闭">×</button>
      </div>
      <label class="year-row">在这里的年份 <input id="shYear" inputmode="numeric" maxlength="4" placeholder="比如 1998" value="${esc(p.year || '')}"></label>
      <div class="sh-actions">
        <button type="button" id="shWrite">✎ 写明信片</button>
        <label>＋ 加照片<input type="file" id="shAdd" accept="image/*" multiple hidden></label>
      </div>
      <p class="uploading" id="upMsg"></p>
      <p class="sec-t"><span>照片</span><span>${ph.length} 张</span></p>
      ${ph.length ? `<div class="grid">${ph.map((x, i) => `<button type="button" data-i="${i}"><img src="${x.thumb}" alt="${esc(x.caption)}" loading="lazy">${x.sample ? '<span class="tag">示例</span>' : ''}</button>`).join('')}</div>`
        : `<div class="empty">这里还没有照片。<br>点“加照片”，从手机相册里选几张。</div>`}
      ${p.note ? `<div class="note"><span class="lbl">我记得</span><p>${esc(p.note)}</p></div>` : ''}
      <p class="sec-t"><span>明信片</span><span>${cards.length} 张</span></p>
      ${cards.length ? cards.map(c => postcardHTML(c, p, true)).join('') : `<div class="empty">还没有明信片。<br>想到什么，就写一张寄给这里。</div>`}
      ${others.length ? `<div class="others">${others.map(o => `<button type="button" data-go="${o.id}">${esc(o.city)} →</button>`).join('')}</div>` : ''}
      ${p.gift ? '' : `<button type="button" class="danger" id="shDelete">删除这个地方</button>`}
    `;
    $('#shClose').onclick = closeSheet;
    $('#shWrite').onclick = () => openComposer(p.id);
    $('#shAdd').onchange = e => addPhotos(p.id, [...e.target.files]);
    $('#shYear').onchange = e => setYear(p, e.target.value.trim());
    body.querySelectorAll('.grid button').forEach(b => b.onclick = () => openLightbox(ph, +b.dataset.i));
    body.querySelectorAll('[data-go]').forEach(b => b.onclick = () => openPlace(b.dataset.go, { fly: true }));
    body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openComposer(p.id, b.dataset.edit));
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      if (!b.classList.contains('confirm')) { b.classList.add('confirm'); b.textContent = '确定删除？'; setTimeout(() => { b.classList.remove('confirm'); b.textContent = '删除'; }, 3000); return; }
      S.cards = S.cards.filter(c => c.id !== b.dataset.del); save(); renderSheet(); buildPins(); updateStats();
    });
    body.querySelectorAll('.pc-photo img').forEach(img => img.onclick = () => { const i = ph.findIndex(x => x.id === img.dataset.pid); if (i >= 0) openLightbox(ph, i); });
    const del = $('#shDelete');
    if (del) del.onclick = () => {
      if (!del.dataset.sure) { del.dataset.sure = 1; del.textContent = '再点一次，删除这个地方和里面的明信片、照片'; return; }
      deletePlace(p.id);
    };
  }
  function setYear(p, v) {
    if (v && !/^\d{4}$/.test(v)) return;
    if (p.gift) S.years[p.id] = v; else { const c = S.custom.find(x => x.id === p.id); if (c) c.year = v; }
    save();
  }
  async function deletePlace(id) {
    const gone = S.photos.filter(x => x.place === id);
    for (const g of gone) { await Store.delBlob('t:' + g.id).catch(() => {}); await Store.delBlob('f:' + g.id).catch(() => {}); urls.delete(g.id); }
    S.photos = S.photos.filter(x => x.place !== id);
    S.cards = S.cards.filter(x => x.place !== id);
    S.custom = S.custom.filter(x => x.id !== id);
    save(); closeSheet(); buildPins(); buildIndex(); homeView();
  }

  function postcardHTML(c, p, tools) {
    const st = stampOf(c.stamp), photo = c.photo && (urls.get(c.photo) || null);
    return `<article class="postcard">
      ${photo ? `<div class="pc-photo"><img src="${photo.full}" data-pid="${c.photo}" alt=""></div>` : ''}
      <div class="pc-main">
        <div class="pc-msg"><p>${esc(c.text) || '　'}</p></div>
        <div class="pc-side">
          <div class="stamp"><div style="background:${st.c}">${st.zh}<small>${st.en}</small></div></div>
          <div class="postmark"><b>${esc(p.city)}</b>${esc(c.year || '')}</div>
          <p class="to">寄给：<span class="hand">未来的我</span></p>
        </div>
      </div>
      ${tools ? `<div class="pc-tools"><button type="button" data-edit="${c.id}">修改</button><button type="button" data-del="${c.id}">删除</button></div>` : ''}
    </article>`;
  }

  /* ---------- adding photos ---------- */
  async function storePhoto(placeId, info) {
    const p = placeById(placeId);
    const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await Store.putBlob('t:' + id, info.thumb);
    await Store.putBlob('f:' + id, info.full);
    const coord = info.gps && km(info.gps, p.coord) < 400 ? info.gps : jitter(p.coord, 3);
    S.photos.push({ id, place: placeId, coord, date: info.date || '', caption: info.date ? info.date.slice(0, 7).replace('-', ' 年 ') + ' 月' : '' });
    urls.set(id, { thumb: URL.createObjectURL(info.thumb), full: URL.createObjectURL(info.full) });
    return id;
  }
  async function addPhotos(placeId, files) {
    const msg = $('#upMsg'); let done = 0, bad = 0;
    for (const f of files) {
      if (msg) msg.textContent = `正在把照片放进地图… ${done + 1} / ${files.length}`;
      try { const info = await Photo.read(f); await storePhoto(placeId, info); done++; }
      catch (e) { bad++; }
    }
    await save();
    buildIndex(); renderSheet();
    const m2 = $('#upMsg');
    if (m2) m2.textContent = (done ? `放好了 ${done} 张。` : '') + (bad ? `有 ${bad} 张打不开，换一张试试。` : '');
  }

  /* ---------- composer ---------- */
  const composer = $('#composer');
  let cState = null;
  $('#cStamps').innerHTML = STAMPS.map((s, i) => `<label><input type="radio" name="stamp" value="${s.k}" ${i ? '' : 'checked'}><span class="stamp"><div style="background:${s.c}">${s.zh}<small>${s.en}</small></div></span></label>`).join('');
  function openComposer(placeId, cardId) {
    const p = placeById(placeId);
    const card = cardId ? S.cards.find(c => c.id === cardId) : null;
    cState = { placeId, cardId, pending: null, photo: card?.photo || null };
    $('#cPlace').textContent = p.city;
    $('#cText').value = card?.text || '';
    $('#cYear').value = card?.year || p.year || '';
    composer.querySelectorAll('input[name=stamp]').forEach(r => r.checked = r.value === (card?.stamp || 'warm'));
    $('#cMsg').textContent = '';
    showComposerPhoto();
    composer.hidden = false;
    setTimeout(() => $('#cText').focus(), 50);
  }
  function showComposerPhoto() {
    const src = cState.pending ? cState.pending.preview : cState.photo ? urls.get(cState.photo)?.full : null;
    $('#cPhotoWrap').hidden = !src;
    if (src) $('#cPhoto').src = src;
  }
  $('#cFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    $('#cMsg').textContent = '正在处理照片…';
    try {
      const info = await Photo.read(f);
      cState.pending = { ...info, preview: URL.createObjectURL(info.full) };
      $('#cMsg').textContent = '';
      if (info.date && !$('#cYear').value) $('#cYear').value = info.date.slice(0, 4);
    } catch (err) { $('#cMsg').textContent = '这张照片打不开，换一张试试。'; }
    e.target.value = '';
    showComposerPhoto();
  };
  $('#cPhotoRemove').onclick = () => { cState.pending = null; cState.photo = null; showComposerPhoto(); };
  $('#cCancel').onclick = () => { composer.hidden = true; };
  $('#composerForm').addEventListener('submit', async e => {
    e.preventDefault();
    const text = $('#cText').value.trim(), year = $('#cYear').value.trim();
    if (!text && !cState.pending && !cState.photo) { $('#cMsg').textContent = '写几句话，或者贴一张照片。'; return; }
    if (year && !/^\d{4}$/.test(year)) { $('#cMsg').textContent = '年份写四位数字，比如 1998。'; return; }
    $('#cSend').disabled = true;
    try {
      let photoId = cState.photo;
      if (cState.pending) photoId = await storePhoto(cState.placeId, cState.pending);
      const stamp = composer.querySelector('input[name=stamp]:checked')?.value || 'warm';
      if (cState.cardId) Object.assign(S.cards.find(c => c.id === cState.cardId), { text, year, stamp, photo: photoId });
      else S.cards.push({ id: 'c' + Date.now().toString(36), place: cState.placeId, text, year, stamp, photo: photoId, created: Date.now() });
      await save();
      composer.hidden = true;
      buildIndex(); buildPins(); renderSheet();
    } catch (err) { $('#cMsg').textContent = '没有存上，再试一次。'; }
    $('#cSend').disabled = false;
  });

  /* ---------- new place ---------- */
  const pm = $('#placeModal');
  let picking = null;
  $('#addPlace').onclick = () => { pm.hidden = false; $('#pName').value = ''; $('#pYear').value = ''; $('#pResults').innerHTML = ''; $('#pMsg').textContent = ''; setTimeout(() => $('#pName').focus(), 50); };
  $('#pCancel').onclick = () => { pm.hidden = true; };
  $('#placeForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#pName').value.trim(), year = $('#pYear').value.trim();
    if (!name) { $('#pMsg').textContent = '先写下这个地方的名字。'; return; }
    if (year && !/^\d{4}$/.test(year)) { $('#pMsg').textContent = '年份写四位数字，比如 1998。'; return; }
    $('#pMsg').textContent = ''; $('#pResults').innerHTML = '<p style="color:var(--ink-2);font-size:14px;margin:0">正在找……</p>';
    let res = [];
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=zh-CN&q=' + encodeURIComponent(name));
      res = await r.json();
    } catch (err) {}
    const box = $('#pResults');
    box.innerHTML = (res.length ? '<p style="color:var(--ink-2);font-size:14px;margin:0 0 4px">是哪一个？</p>' : '<p style="color:var(--ink-2);font-size:14px;margin:0 0 4px">没找到，可以直接在地图上点出来。</p>') +
      res.map((r, i) => `<button type="button" data-i="${i}">${esc(r.name || name)}<small>${esc(r.display_name)}</small></button>`).join('') +
      `<button type="button" data-pick="1">都不是，我在地图上点一下 →</button>`;
    box.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
      const r = res[+b.dataset.i];
      const parts = (r.display_name || '').split(',').map(s => s.trim());
      createPlace(name, [+r.lon, +r.lat], year, parts.slice(-2).reverse().join(' · '));
    });
    box.querySelector('[data-pick]').onclick = () => startPick(name, year);
  });
  function startPick(name, year) {
    pm.hidden = true; closeSheet();
    picking = { name, year };
    document.body.classList.add('picking');
    $('#pickText').textContent = `在地图上点一下，放下「${name}」`;
    $('#pickBanner').hidden = false;
  }
  function stopPick() { picking = null; document.body.classList.remove('picking'); $('#pickBanner').hidden = true; }
  $('#pickCancel').onclick = stopPick;
  map.on('click', e => {
    if (!picking) return;
    const { name, year } = picking; stopPick();
    const ll = e.lngLat.wrap();
    createPlace(name, [ll.lng, ll.lat], year, '');
  });
  function createPlace(city, coord, year, region) {
    const id = 'p' + Date.now().toString(36);
    S.custom.push({ id, city, en: '', region, coord: [+coord[0].toFixed(5), +coord[1].toFixed(5)], year, note: '', created: Date.now() });
    save(); pm.hidden = true;
    buildPins(); updateStats();
    openPlace(id, { fly: true });
  }

  /* ---------- lightbox ---------- */
  const lb = $('#lightbox'); let lbList = [], lbI = 0;
  function openLightbox(list, i) { lbList = list; lbI = Math.max(0, i); showLb(); lb.hidden = false; }
  function showLb() {
    const p = lbList[lbI]; if (!p) return;
    $('#lbImg').src = p.full;
    $('#lbCap').textContent = [p.caption, p.sample ? '（示例图）' : '', `${lbI + 1} / ${lbList.length}`].filter(Boolean).join('　');
  }
  const lbStep = d => { if (lbI + d >= 0 && lbI + d < lbList.length) { lbI += d; showLb(); } };
  $('#lbClose').onclick = () => { lb.hidden = true; };
  $('#lbPrev').onclick = () => lbStep(-1);
  $('#lbNext').onclick = () => lbStep(1);
  let sx = null;
  lb.addEventListener('pointerdown', e => { sx = e.clientX; });
  lb.addEventListener('pointerup', e => { if (sx == null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 50) lbStep(dx < 0 ? 1 : -1); });
  addEventListener('keydown', e => {
    if (!lb.hidden) { if (e.key === 'Escape') lb.hidden = true; if (e.key === 'ArrowRight') lbStep(1); if (e.key === 'ArrowLeft') lbStep(-1); return; }
    if (e.key === 'Escape') { if (!composer.hidden) composer.hidden = true; else if (!pm.hidden) pm.hidden = true; else if (picking) stopPick(); else if (selectedPlace) closeSheet(); }
  });

  /* ---------- review ---------- */
  const review = $('#review');
  let rvMap = null;
  $('#finish').onclick = openReview;
  function openReview() {
    closeSheet();
    const order = lifeOrder();
    const route = order.map(p => p.coord);
    let dist = 0; for (let i = 1; i < route.length; i++) dist += km(route[i - 1], route[i]);
    const nPh = photos().filter(p => !p.sample).length;
    $('#rvInner').innerHTML = `
      <button class="glass round rv-back" type="button" id="rvBack" aria-label="回到地图">‹</button>
      <header class="rv-hero">
        <div class="eyebrow">A LIFE, SO FAR</div>
        <h1>${esc(G.title)}</h1>
        <p>${esc(G.subtitle)}</p>
        <div class="rv-stats">
          <span><b>${order.length}</b>个地方</span>
          <span><b>${Math.round(dist).toLocaleString()}</b>公里</span>
          <span><b>${nPh}</b>张照片</span>
          <span><b>${S.cards.length}</b>张明信片</span>
        </div>
      </header>
      <div class="rv-map" id="rvMap"></div>
      ${order.map((p, i) => {
        const ph = photosOf(p.id), cards = cardsOf(p.id).slice().sort((a, b) => (a.year || 9999) - (b.year || 9999));
        return `<article class="chapter">
          <div class="ch-head"><span class="ch-num">${i + 1}</span><h2>${esc(p.city)}</h2><span class="yr">${esc(p.firstYear || p.year || '')}</span></div>
          ${p.en ? `<p class="ch-en">${esc(p.en)}</p>` : ''}
          ${ph.length ? `<div class="strip">${ph.slice(0, 16).map((x, j) => `<button type="button" data-place="${p.id}" data-j="${j}"><img src="${x.thumb}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
          ${cards.map(c => postcardHTML(c, p, false)).join('')}
          ${!cards.length && p.note ? `<div class="note"><span class="lbl">我记得</span><p>${esc(p.note)}</p></div>` : ''}
          ${!cards.length && !p.note ? `<p class="ch-none">这里的故事，还可以再写。</p>` : ''}
        </article>`;
      }).join('')}
      <div class="rv-letter">
        <p class="mom">Mom,</p>
        ${G.letter.map(l => `<p>${l}</p>`).join('')}
        <p class="hb">Happy Birthday, Mom.<small>The map isn't finished yet.</small></p>
        <div class="rv-end">
          <button class="pill ghost" type="button" id="rvMore">回到地图，继续写</button>
          <button class="pill primary" type="button" id="rvNext">加上下一站</button>
        </div>
      </div>`;
    review.hidden = false; review.scrollTop = 0;
    $('#rvBack').onclick = $('#rvMore').onclick = closeReview;
    $('#rvNext').onclick = () => { closeReview(); $('#addPlace').click(); };
    review.querySelectorAll('.strip button').forEach(b => b.onclick = () => openLightbox(photosOf(b.dataset.place), +b.dataset.j));
    review.querySelectorAll('.pc-photo img').forEach(img => img.onclick = () => { const ph = photos().find(x => x.id === img.dataset.pid); if (ph) { const l = photosOf(ph.place); openLightbox(l, l.findIndex(x => x.id === ph.id)); } });
    drawReviewMap(order);
  }
  function closeReview() { review.hidden = true; if (rvMap) { rvMap.remove(); rvMap = null; } }
  function drawReviewMap(order) {
    const pts = order.map(p => p.coord);
    let line = [];
    for (let i = 1; i < pts.length; i++) line = line.concat(greatCircle(pts[i - 1], pts[i]).slice(i > 1 ? 1 : 0));
    line = unwrap(line.length ? line : pts);
    const stops = unwrap(pts);
    // align stops with the unwrapped line
    if (line.length && stops.length) { const shift = Math.round((line[0][0] - stops[0][0]) / 360) * 360; stops.forEach(s => s[0] += shift); }
    rvMap = new maplibregl.Map({ container: 'rvMap', style: 'https://tiles.openfreemap.org/styles/liberty', interactive: false, attributionControl: { compact: true },
      localIdeographFontFamily: "'PingFang SC','Hiragino Sans GB','Noto Sans SC',sans-serif" });
    rvMap.on('load', () => {
      rvMap.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: line } } });
      rvMap.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#9E7373', 'line-width': 2.5, 'line-dasharray': [1, 2] }, layout: { 'line-cap': 'round' } });
      const all = line.concat(stops);
      const lons = all.map(p => p[0]), lats = all.map(p => p[1]);
      rvMap.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 50, duration: 0, maxZoom: 8 });
      stops.forEach((s, i) => {
        const el = document.createElement('div');
        el.className = 'pin';
        el.innerHTML = `<i></i>${i + 1} · ${esc(order[i].city)}`;
        new maplibregl.Marker({ element: el, anchor: 'top', offset: [0, -6] }).setLngLat(s).addTo(rvMap);
      });
    });
  }

  /* ---------- hint ---------- */
  function hideHint() { $('#hint').classList.add('hide'); }
  if (!Store.persistent) $('#hint').textContent = '这个浏览器不能保存内容，建议用手机自带的浏览器打开';

  /* ---------- gift ---------- */
  const scene = $('#scene'), app = $('#app');
  const seen = (() => { try { return localStorage.getItem('mom-map:opened') === '1'; } catch (e) { return false; } })();
  function showApp() { app.classList.add('on'); app.setAttribute('aria-hidden', 'false'); map.resize(); }
  function showGift() {
    scene.className = 'scene'; scene.hidden = false;
    const g = $('#gift'); g.style.animation = 'none'; void g.offsetWidth; g.style.animation = '';
  }
  function unwrapGift() {
    if (scene.classList.contains('opening')) return;
    const steps = reduce ? [['opening', 0], ['gone', 10]]
      : [['opening', 0], ['lifted', 700], ['risen', 1500], ['unfold-x', 2700], ['unfold-y', 3700], ['spread', 4900], ['gone', 5300]];
    steps.forEach(([c, t]) => setTimeout(() => {
      scene.classList.add(c);
      if (c === 'spread' || (reduce && c === 'gone')) { showApp(); homeView(false); }
      if (c === 'gone') { setTimeout(() => { scene.hidden = true; }, 1200); try { localStorage.setItem('mom-map:opened', '1'); } catch (e) {} }
    }, t));
  }
  $('#gift').onclick = unwrapGift;
  $('#giftAgain').onclick = () => { closeSheet(); showGift(); };
  if (seen && location.hash !== '#gift') showApp(); else showGift();

  /* ---------- controls ---------- */
  $('#zoomIn').onclick = () => map.zoomIn();
  $('#zoomOut').onclick = () => map.zoomOut();
  $('#home').onclick = () => { closeSheet(); setTimeout(() => homeView(), 50); };

  /* swipe the bottom sheet down to close (phone) */
  let gy = null;
  $('#grabber').addEventListener('pointerdown', e => { gy = e.clientY; });
  addEventListener('pointerup', e => { if (gy != null && e.clientY - gy > 60) closeSheet(); gy = null; });

  map.on('load', () => { buildIndex(); buildPins(); homeView(false); });
  addEventListener('resize', () => layoutPins());
})();
