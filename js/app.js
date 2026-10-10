(async function () {
  'use strict';
  const G = window.GIFT;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isPhone = () => innerWidth <= 760;

  /* motion that feels physical (Apple's "Designing Fluid Interfaces"):
     springs start from where things are and how fast they're moving; flicks are projected forward */
  function spring(from, to, velocity, { response = 0.35, damping = 1 } = {}, update, done) {
    const k = (2 * Math.PI / response) ** 2, c = 4 * Math.PI * damping / response;
    let x = from, v = velocity, last = performance.now(), raf = 0;
    const step = now => {
      const dt = Math.min(0.032, (now - last) / 1000); last = now;
      v += (-k * (x - to) - c * v) * dt; x += v * dt;
      if (Math.abs(x - to) < 0.5 && Math.abs(v) < 8) { update(to); if (done) done(); return; }
      update(x); raf = requestAnimationFrame(step);
    };
    if (reduce) { update(to); if (done) done(); return () => {}; }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }
  const project = (v, rate = 0.998) => (v / 1000) * rate / (1 - rate);              // where a flick would come to rest
  const rubberband = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));   // soft edges
  // follows the pointer 1:1 and reports velocity on release
  function dragTracker(el, { start, move, end, axis = 'y', threshold = 8 }) {
    let id = null, x0 = 0, y0 = 0, hist = [], live = false;
    el.addEventListener('pointerdown', e => {
      if (e.button > 0 || id !== null || (start && start(e) === false)) return;
      id = e.pointerId; x0 = e.clientX; y0 = e.clientY; hist = [{ t: e.timeStamp, x: 0, y: 0 }]; live = false;
    });
    el.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (!live) {   // a little hysteresis before committing to a drag
        if (Math.hypot(dx, dy) < threshold) return;
        if (axis === 'y' && Math.abs(dx) > Math.abs(dy)) { id = null; return; }
        live = true; try { el.setPointerCapture(id); } catch (err) {}
      }
      hist.push({ t: e.timeStamp, x: dx, y: dy }); if (hist.length > 6) hist.shift();
      move(dx, dy, e);
    });
    const finish = e => {
      if (e.pointerId !== id) return;
      id = null; if (!live) return;
      const a = hist[0], b = hist[hist.length - 1], dt = Math.max(1, b.t - a.t);
      end(b.x, b.y, (b.x - a.x) / dt * 1000, (b.y - a.y) / dt * 1000);
    };
    el.addEventListener('pointerup', finish); el.addEventListener('pointercancel', finish);
  }

  const STAMPS = [
    { k: 'warm', zh: '暖', en: 'warm', c: '#E4477E' },
    { k: 'miss', zh: '念', en: 'missing', c: '#4F63D8' },
    { k: 'grow', zh: '长', en: 'growing', c: '#3E9150' },
    { k: 'proud', zh: '傲', en: 'proud', c: '#F2B33D' },
    { k: 'calm', zh: '静', en: 'calm', c: '#6A5BD6' }
  ];
  const stampOf = k => STAMPS.find(s => s.k === k) || STAMPS[0];
  // a mandevilla, like the ones climbing her garden wall
  const flowerInner = (c = '#F27BAA', throat = '#FFC56B') => [0, 72, 144, 216, 288].map(r =>
    `<g transform="rotate(${r})"><path d="M0 0C7-3 17-13 11-25C7-32-3-31-6-25C-9-18-5-8 0 0Z" fill="${c}" stroke="rgba(120,20,60,.18)" stroke-width=".8"/><path d="M1-3C5-8 8-15 7-21" stroke="rgba(255,255,255,.45)" fill="none" stroke-width="1.2" stroke-linecap="round"/></g>`).join('') +
    `<circle r="7.5" fill="${throat}"/><circle r="3.4" fill="#FFF3C4"/>`;
  const PETALS = ['#F27BAA', '#D9304A', '#FFF0F4', '#E85D9E', '#F59BBE'];

  /* ---------- state ---------- */
  await Store.open();
  const S = Object.assign({ custom: [], years: {}, cards: [], photos: [] }, (await Store.get('state')) || {});
  /* every save notes which items changed (and which were deleted), so two devices can be merged item by item */
  const COLLS = ['custom', 'cards', 'photos', 'wishes', 'diary'], META = ['deleted', 'fieldUpdated', 'updated'];
  let tracked = null, onSaved = () => {};
  function stampChanges() {
    const now = Date.now(), seen = new Set();
    S.deleted = S.deleted || {}; S.fieldUpdated = S.fieldUpdated || {};
    let changed = !tracked;
    tracked = tracked || new Map();
    for (const c of COLLS) for (const it of S[c] || []) {
      const k = c + ':' + it.id, { updated, ...rest } = it, j = JSON.stringify(rest);
      seen.add(k);
      if (tracked.get(k) !== j) { if (tracked.has(k) || !updated) it.updated = now; tracked.set(k, j); changed = true; }
    }
    for (const k of [...tracked.keys()]) if (k.includes(':') && !k.startsWith('#') && !seen.has(k)) { S.deleted[k] = now; tracked.delete(k); changed = true; }
    for (const f of Object.keys(S)) if (!COLLS.includes(f) && !META.includes(f)) {
      const j = JSON.stringify(S[f]);
      if (tracked.get('#' + f) !== j) { if (tracked.has('#' + f)) S.fieldUpdated[f] = now; tracked.set('#' + f, j); changed = true; }
    }
    if (changed) S.updated = now;
  }
  function trackNow() { tracked = null; const keep = S.updated; stampChanges(); S.updated = keep; }   // remember the current state without calling it a change
  trackNow();
  const save = () => { stampChanges(); const p = Store.set('state', S).catch(() => {}); onSaved(); return p; };

  /* sound effects: her own files from data.js (sounds), or the built-in chime */
  // sound: every file is downloaded and decoded up front, then played through one audio engine.
  // the first tap only wakes the engine; nothing is pre-played, so on a slow connection
  // a sound starts late instead of being cut off or doubled
  const Sound = (() => {
    const raw = G.sounds || {}, cfg = {}, level = {}, at = {};
    for (const [k, v] of Object.entries(raw)) { const [src, l = 1, t = 0] = Array.isArray(v) ? v : [v]; if (src) { cfg[k] = src; level[k] = l; at[k] = t; } }
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = AC ? new AC() : null, buffers = {}, playing = {};
    const on = () => !(S.prefs && S.prefs.sound === false);
    const load = name => buffers[name] || (buffers[name] = fetch(cfg[name]).then(r => r.arrayBuffer())
      .then(b => new Promise((res, rej) => ctx.decodeAudioData(b, res, rej))).catch(() => null));
    if (ctx) for (const n of Object.keys(cfg)) load(n);   // start downloading everything now
    function unlock() { try { ctx && ctx.state !== 'running' && ctx.resume(); } catch (e) {} }
    function stop(name) { for (const p of playing[name] || []) { try { p.src.stop(); } catch (e) {} } playing[name] = []; }
    async function play(name, { volume = 1, fallback, when = 0, loop = false, fadeIn = 0, atTime = null } = {}) {
      if (!on()) return;
      if (!cfg[name] || !ctx) { if (fallback) fallback(); return; }
      unlock();
      const want = atTime ?? ctx.currentTime + when;   // the moment it should start
      const buf = await load(name);
      if (!buf) { if (fallback) fallback(); return; }
      stop(name);   // never two copies of the same sound
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buf; src.loop = loop; src.connect(g).connect(ctx.destination);
      const t = Math.max(ctx.currentTime + 0.02, want), v = volume * (level[name] || 1);
      if (fadeIn) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + fadeIn); } else g.gain.setValueAtTime(v, t);
      src.start(t);
      const item = { src, g }; (playing[name] = playing[name] || []).push(item);
      if (/^(voice|greet|diary)/.test(name) && typeof duck === 'function') setTimeout(() => duck(buf.duration + .4), Math.max(0, (t - ctx.currentTime) * 1000));
      src.onended = () => { playing[name] = (playing[name] || []).filter(x => x !== item); };
      return t + buf.duration / (src.playbackRate.value || 1);   // when it will end
    }
    function fadeOut(name, ms = 1200) {
      for (const { src, g } of playing[name] || []) {
        const t = ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + ms / 1000);
        try { src.stop(t + ms / 1000 + 0.05); } catch (e) {}
      }
    }
    function music(onOff) { if (onOff) play('music', { volume: .7, loop: true, fadeIn: 2.5 }); else fadeOut('music', 3500); }
    // the birthday wishes, one after another (voice, voice2, voice3…), each at its own moment
    const voices = () => Object.keys(cfg).filter(k => /^voice\d*$/.test(k)).sort();
    // one after another, never on top of each other: each waits for its time AND for the previous voice to finish
    async function wishes() {
      if (!ctx || !on()) return;
      const t0 = ctx.currentTime; let prevEnd = 0;
      for (const k of voices()) {
        const buf = await load(k); if (!buf) continue;
        prevEnd = await play(k, { atTime: Math.max(t0 + (at[k] || 0), prevEnd + 0.35) }) || prevEnd;
      }
    }
    /* calm background music, made live: slow soft chords and the odd music-box note.
       it steps aside (gets quiet) whenever someone is talking or a song is playing */
    let amb = null, ducks = 0, songOn = false;
    const ambOn = () => G.ambient !== false && !(S.prefs && S.prefs.ambient === false) && on();
    const AMB = 0.075;
    function ambTarget() { return !amb || !ambOn() || document.hidden ? 0 : songOn ? 0 : ducks > 0 ? AMB * 0.22 : AMB; }
    function ambLevel(sec = 1.2) { if (!amb) return; const t = ctx.currentTime, g = amb.out.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(ambTarget(), t + sec); }
    function startAmbient() {
      if (!ctx || amb || !ambOn()) return;
      const out = ctx.createGain(); out.gain.value = 0; out.connect(ctx.destination);
      // a soft room: a short, decaying noise impulse as reverb
      const rev = ctx.createConvolver(), len = ctx.sampleRate * 3.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
      rev.buffer = ir; const wet = ctx.createGain(); wet.gain.value = .55; rev.connect(wet).connect(out);
      const dry = ctx.createGain(); dry.gain.value = .5; dry.connect(out);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.connect(dry); lp.connect(rev);
      amb = { out, lp, rev, timer: 0, next: 0, step: 0, bell: 0 };
      const hz = m => 440 * 2 ** ((m - 69) / 12);
      // Cmaj9 – Am9 – Fmaj9 – G6/9 : warm, unresolved, peaceful
      const CHORDS = [[48, 55, 64, 71, 74], [45, 52, 60, 67, 71], [41, 48, 57, 64, 67], [43, 50, 59, 64, 69]];
      const PENT = [72, 74, 76, 79, 81, 84, 86, 88];
      function note(m, t, dur, vol, type = 'triangle', dest = lp) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.value = hz(m); o.detune.value = (Math.random() - .5) * 8;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(2.5, dur * .35)); g.gain.setValueAtTime(vol, t + dur * .6); g.gain.linearRampToValueAtTime(0, t + dur);
        o.connect(g).connect(dest); o.start(t); o.stop(t + dur + .1);
      }
      function bell(m, t) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = hz(m);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.09, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + 3.2);
        o.connect(g); g.connect(dry); g.connect(rev); o.start(t); o.stop(t + 3.3);
      }
      amb.next = ctx.currentTime + .1; amb.bell = ctx.currentTime + 2;
      const tick = () => {   // schedule a little ahead, so it never stutters
        while (amb.next < ctx.currentTime + 1.5) {
          const ch = CHORDS[amb.step % CHORDS.length];
          ch.forEach((m, i) => note(m, amb.next + i * .12, 9.5, i === 0 ? .05 : .035));
          amb.next += 8; amb.step++;
        }
        while (amb.bell < ctx.currentTime + 1.5) { bell(PENT[Math.floor(Math.random() * PENT.length)], amb.bell); amb.bell += 2.5 + Math.random() * 4; }
      };
      tick(); amb.timer = setInterval(tick, 500);
      ambLevel(4);
    }
    function ambient(onOff) { if (onOff) { unlock(); startAmbient(); ambLevel(2); } else ambLevel(1.5); }
    function duck(sec) { ducks++; ambLevel(.4); setTimeout(() => { ducks = Math.max(0, ducks - 1); ambLevel(1.8); }, sec * 1000); }
    function song(playing) { songOn = playing; ambLevel(playing ? .6 : 2); }
    document.addEventListener('visibilitychange', () => ambLevel(.5));
    return { unlock, play, fadeOut, music, wishes, voices, has: n => !!cfg[n], ambient, duck, song };
  })();
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
  // a journey stop's exact spot: `at` is pasted from Google Maps as 'lat, lng'
  const spotCoord = m => {
    if (typeof m.at === 'string') { const [la, lo] = m.at.split(/[,，\s]+/).filter(Boolean).map(Number); if (isFinite(la) && isFinite(lo)) return [lo, la]; }
    if (Array.isArray(m.coord)) return m.coord;
    return (G.places.find(p => p.id === m.place) || { coord: [0, 0] }).coord;
  };
  // { p: 'name' } → photos/web/name.jpg (+ photos/thumb/name.jpg); at: 'lat, lng' pins it to its own spot
  const photoFiles = x => x.p ? { src: `photos/web/${x.p}.jpg`, thumb: `photos/thumb/${x.p}.jpg` } : x.src ? { src: x.src, thumb: x.thumb || x.src } : null;
  const hasPhoto = x => !!(x && (x.p || x.src));
  const journeyPhotos = (G.journey || []).flatMap(m => (m.photos || []).filter(hasPhoto).map(x => ({ place: m.place, ...photoFiles(x), coord: x.at ? spotCoord(x) : x.coord || jitter(spotCoord(m), .05), caption: x.caption || m.spot || '', date: x.date || String(m.year || '') })));
  const giftPhotos = [...G.photos, ...journeyPhotos].map((p, i) => {
    const src = p.src || sampleArt(p.art || 'zz'), thumb = p.thumb || src;
    const home = G.places.find(x => x.id === p.place);
    return { id: 'g' + i, place: p.place, coord: p.coord || jitter(home ? home.coord : [0, 0]), thumb, full: src, caption: p.caption || '', date: p.date || '', sample: !!p.sample, o: (p.sample ? 5000 : 0) + i };
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
    if (typeof updateBookCounts === 'function') try { updateBookCounts(); } catch (e) {}
    $('#statLine').textContent = `${n} 个地方 · ${ph} 张照片 · ${c} 张明信片` + ((S.wishes || []).length ? ` · ${S.wishes.length} 个心愿` : '');
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

  /* warm paper colours instead of the stock blue map */
  function paperStyle(m) {
    const set = (id, k, v) => { try { m.setPaintProperty(id, k, v); } catch (e) {} };
    for (const l of m.getStyle().layers) {
      const id = l.id, t = l.type;
      if (t === 'background') set(id, 'background-color', '#FFF6EC');
      else if (t === 'raster') { set(id, 'raster-saturation', -0.85); set(id, 'raster-opacity', 0.35); set(id, 'raster-brightness-min', 0.25); }
      else if (t === 'fill-extrusion' || /^poi|aeroway|housenumber/.test(id)) m.setLayoutProperty(id, 'visibility', 'none');
      else if (t === 'fill') {
        if (/water/.test(id)) set(id, 'fill-color', '#B9E2E6');
        else if (/building/.test(id)) { set(id, 'fill-color', '#F3EADF'); set(id, 'fill-outline-color', '#DDD3C3'); }
        else if (/ice|glacier/.test(id)) set(id, 'fill-color', '#F8F5EF');
        else if (/park|wood|forest|grass|wetland|scrub|farm|landcover|landuse|cemetery|pitch|golf/.test(id)) { set(id, 'fill-color', '#D2EBC4'); set(id, 'fill-opacity', 0.55); }
        else set(id, 'fill-color', '#F8F0E5');
      } else if (t === 'line') {
        if (/water|river|stream|canal/.test(id)) set(id, 'line-color', '#A6D5DC');
        else if (/boundary|admin/.test(id)) { set(id, 'line-color', '#C8B5E0'); set(id, 'line-opacity', 0.7); }
        else if (/casing/.test(id)) set(id, 'line-color', '#EEE2D2');
        else if (/rail|transit/.test(id)) set(id, 'line-color', '#E7DCCD');
        else if (/road|highway|street|path|bridge|tunnel|motorway|trunk|primary|secondary|minor|service|track/.test(id)) set(id, 'line-color', '#FFFDF8');
      } else if (t === 'symbol') {
        set(id, 'text-color', /water|ocean|sea|lake/.test(id) ? '#4E9DA8' : '#5C5670');
        set(id, 'text-halo-color', 'rgba(247,243,234,.92)'); set(id, 'text-halo-width', 1.4);
        set(id, 'icon-opacity', 0.0);
      }
    }
  }

  map.on('style.load', () => {
    try { paperStyle(map); } catch (e) {}
    try {
      for (const l of map.getStyle().layers) {
        if (l.type === 'symbol' && l.layout && l.layout['text-field'] && JSON.stringify(l.layout['text-field']).includes('name')) {
          map.setLayoutProperty(l.id, 'text-field', ['coalesce', ['get', 'name:zh'], ['get', 'name:zh-Hans'], ['get', 'name'], ['get', 'name:en']]);
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
      el.innerHTML = `<span class="bub-in"><img src="${rep.thumb}" alt="">` + (n > 1 ? `<span class="n">${n.toLocaleString()}</span>` : '') + '</span>';
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
      const mood = p.moods && moodOf(p.moods[0]);
      if (mood) el.querySelector('i').style.backgroundImage = flowerURI(mood.c);
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
      ${(p.moods && p.moods.length) || p.text ? `<div class="reflect">${p.moods && p.moods.length ? `<div class="moods-row">${moodChips(p.moods)}</div>` : ''}${p.text ? `<p>${esc(p.text)}</p>` : ''}${p.gift ? '' : '<button type="button" class="e-edit" id="shEdit">✎ 改一改 / 删掉</button>'}</div>` : ''}
      ${!p.gift && !((p.moods && p.moods.length) || p.text) ? '<button type="button" class="e-edit" id="shEdit">✎ 改一改 / 删掉</button>' : ''}
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
    if ($('#shEdit')) $('#shEdit').onclick = () => openEntry(p.id);
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
    const c = S.custom.find(x => x.id === id);
    if (c && c.fromWish) { const w = (S.wishes || []).find(x => x.id === c.fromWish); if (w) { w.done = null; w.doneId = null; } }   // the wish goes back to the wish list
    S.custom = S.custom.filter(x => x.id !== id);
    save(); closeSheet(); buildPins(); buildIndex(); if (typeof buildWishPins === 'function') buildWishPins(); homeView();
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
    const coord = info.gps && km(info.gps, p.coord) < 400 ? info.gps : jitter(p.coord, p.entry ? .05 : 3);
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

  /* ---------- 记一个地方: search / tap / here, then feelings, words and photos ---------- */
  const MOODS = [
    { k: 'thankful', e: '🙏', zh: '感恩', c: '#E0A126' },
    { k: 'happy', e: '😊', zh: '开心', c: '#F2B33D' }, { k: 'warm', e: '🥰', zh: '幸福', c: '#F27BAA' },
    { k: 'moved', e: '🥹', zh: '感动', c: '#E85D9E' }, { k: 'calm', e: '😌', zh: '平静', c: '#3E9150' },
    { k: 'miss', e: '🤍', zh: '想念', c: '#6A5BD6' }, { k: 'proud', e: '💪', zh: '骄傲', c: '#D9304A' },
    { k: 'free', e: '🌿', zh: '自在', c: '#4F63D8' }, { k: 'sad', e: '🌧', zh: '有点难过', c: '#8A8FA8' }
  ];
  const moodOf = k => MOODS.find(m => m.k === k);
  const flowerURIs = new Map();
  const flowerURI = c => flowerURIs.get(c) || (flowerURIs.set(c, `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-32 -32 64 64">${flowerInner(c)}</svg>`)}")`), flowerURIs.get(c));
  const moodChips = ks => (ks || []).map(moodOf).filter(Boolean).map(m => `<span class="mood" style="--mc:${m.c}">${m.e} ${m.zh}</span>`).join('');

  const entry = $('#entry');
  let picking = null, eState = null;
  $('#eMoods').innerHTML = MOODS.map(m => `<label class="mood-pick" style="--mc:${m.c}"><input type="checkbox" value="${m.k}"><span>${m.e} ${m.zh}</span></label>`).join('');

  const regionOf = (a = {}) => [a.city || a.town || a.village || a.suburb || a.county || a.state, a.country].filter(Boolean).map(x => String(x).split(/[;；]/)[0]).filter((x, i, arr) => arr.indexOf(x) === i).join(' · ');
  async function reverseName(lng, lat) {
    try {
      const r = await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&accept-language=zh-CN&lat=${lat}&lon=${lng}`)).json();
      const a = r.address || {};
      return { name: r.name || [a.house_number, a.road].filter(Boolean).join(' ') || a.neighbourhood || a.suburb || a.city || a.town || '', sub: regionOf(a) };
    } catch (e) { return { name: '', sub: '' }; }
  }
  function setLoc(coord, name, sub) {
    eState.coord = [+coord[0].toFixed(5), +coord[1].toFixed(5)]; eState.region = sub || '';
    $('#eChosenName').textContent = name || '地图上的这个点';
    $('#eChosenSub').textContent = sub || `${eState.coord[1].toFixed(3)}, ${eState.coord[0].toFixed(3)}`;
    $('#eChosen').hidden = false; $('#eFindBox').hidden = true;
    if (name && !$('#eName').value) $('#eName').value = name;
    showPreview(eState.coord);
  }
  // the spot she picked: the map flies there and a flower marks it, before she even saves
  let ePreview = null;
  function showPreview(c, kind = '', zoom = 15) {
    if (!ePreview) { const el = document.createElement('div'); el.className = 'e-preview'; el.innerHTML = '<i></i>'; ePreview = new maplibregl.Marker({ element: el, anchor: 'center' }); }
    ePreview.setLngLat(c).addTo(map);
    const el = ePreview.getElement(); el.classList.remove('pop'); el.classList.toggle('bud', kind === 'bud'); void el.offsetWidth; el.classList.add('pop');
    const wide = innerWidth > 900;
    map.flyTo({ center: c, zoom: kind === 'bud' ? zoom : Math.max(map.getZoom(), zoom), padding: wide ? { top: 60, bottom: 60, left: 60, right: Math.min(620, innerWidth * .5) } : { top: 60, bottom: Math.round(innerHeight * .55), left: 30, right: 30 },
      duration: reduce ? 0 : 2200, essential: true });
  }
  function hidePreview() { if (ePreview) ePreview.remove(); }
  function renderEPhotos() {
    const box = $('#ePhotos'), add = box.querySelector('.e-add');
    box.querySelectorAll('.e-ph').forEach(n => n.remove());
    eState.pending.forEach((p, i) => {
      const d = document.createElement('div'); d.className = 'e-ph';
      d.innerHTML = `<img src="${p.preview}" alt=""><button type="button" aria-label="移除">×</button>${p.gps ? '<i title="照片里有位置">📍</i>' : ''}`;
      d.querySelector('button').onclick = () => { eState.pending.splice(i, 1); renderEPhotos(); };
      box.insertBefore(d, add);
    });
  }
  function openEntry(editId) {
    const p = editId ? S.custom.find(c => c.id === editId) : null;
    eState = { editId, coord: p?.coord || null, region: p?.region || '', pending: [] };
    $('#eTitle').textContent = p ? '改一改这个地方' : '记下一个地方';
    $('#eQuery').value = ''; $('#eResults').innerHTML = ''; $('#eMsg').textContent = '';
    $('#eName').value = p?.city || '';
    const del = $('#eDelete'); del.hidden = !p; delete del.dataset.sure; del.textContent = '删掉这个地方'; $('#eYear').value = p?.year || ''; $('#eText').value = p?.text || '';
    entry.querySelectorAll('#eMoods input').forEach(c => c.checked = !!p?.moods?.includes(c.value));
    if (p) setLoc(p.coord, p.city, p.region); else { $('#eChosen').hidden = true; $('#eFindBox').hidden = false; hidePreview(); }
    renderEPhotos();
    entry.hidden = false; document.body.classList.add('entry-open');
  }
  $('#eDelete').onclick = async () => {
    const b = $('#eDelete');
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = '确定删掉？照片和明信片也会一起删'; setTimeout(() => { if (b.dataset.sure) { delete b.dataset.sure; b.textContent = '删掉这个地方'; } }, 4000); return; }
    const id = eState.editId; closeEntry(); await deletePlace(id); toast('删掉了');
  };
  const closeEntry = () => { entry.hidden = true; hidePreview(); document.body.classList.remove('entry-open'); };
  $('#addPlace').onclick = () => { closeSheet(); openEntry(); };
  $('#eClose').onclick = $('#eCancel').onclick = closeEntry;
  $('#eChange').onclick = () => { $('#eChosen').hidden = true; $('#eFindBox').hidden = false; $('#eQuery').focus(); };

  async function search() {
    const q = $('#eQuery').value.trim(); if (!q) return $('#eQuery').focus();
    const box = $('#eResults');
    box.innerHTML = '<p class="e-note">正在找……</p>';
    let res = [];
    try { res = await (await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&accept-language=zh-CN&q=' + encodeURIComponent(q))).json(); } catch (err) {}
    box.innerHTML = (res.length ? '' : '<p class="e-note">没找到。换个说法，或者直接在地图上点一下。</p>') +
      res.map((r, i) => `<button type="button" data-i="${i}">${esc(r.name || q)}<small>${esc(r.display_name)}</small></button>`).join('');
    box.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
      const r = res[+b.dataset.i];
      setLoc([+r.lon, +r.lat], r.name || q, regionOf(r.address));
      box.innerHTML = '';
    });
  }
  $('#eFind').onclick = search;
  $('#eQuery').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); search(); } });

  $('#ePick').onclick = () => {
    entry.hidden = true;
    startPick('在地图上点一下那个地方', async ll => {
      entry.hidden = false;
      $('#eChosenName').textContent = '正在看看这是哪里……'; $('#eChosen').hidden = false; $('#eFindBox').hidden = true;
      const r = await reverseName(ll[0], ll[1]); setLoc(ll, r.name, r.sub);
    }, () => { entry.hidden = false; });
  };
  $('#eHere').onclick = () => {
    if (!navigator.geolocation) { $('#eMsg').textContent = '这个浏览器找不到位置，搜一下或者在地图上点吧。'; return; }
    $('#eMsg').textContent = '正在找你的位置……';
    navigator.geolocation.getCurrentPosition(async pos => {
      const ll = [pos.coords.longitude, pos.coords.latitude], r = await reverseName(ll[0], ll[1]);
      $('#eMsg').textContent = ''; setLoc(ll, r.name, r.sub);
    }, () => { $('#eMsg').textContent = '没拿到位置。可以在设置里允许，或者搜一下。'; }, { enableHighAccuracy: true, timeout: 12000 });
  };
  $('#eFiles').onchange = async e => {
    const files = [...e.target.files]; e.target.value = '';
    $('#eMsg').textContent = '正在处理照片……';
    for (const f of files) {
      try {
        const info = await Photo.read(f);
        eState.pending.push({ ...info, preview: URL.createObjectURL(info.thumb) });
        if (info.date && !$('#eYear').value) $('#eYear').value = info.date.slice(0, 4);
        if (info.gps && !eState.coord) {   // the photo knows where it was taken
          const r = await reverseName(info.gps[0], info.gps[1]); setLoc(info.gps, r.name, r.sub);
        }
      } catch (err) {}
      renderEPhotos();
    }
    $('#eMsg').textContent = '';
  };

  $('#entryForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#eName').value.trim(), year = $('#eYear').value.trim(), text = $('#eText').value.trim();
    const moods = [...entry.querySelectorAll('#eMoods input:checked')].map(c => c.value);
    if (!eState.coord) { $('#eMsg').textContent = '先选一下在哪里：搜一搜、在地图上点，或者用现在的位置。'; return; }
    if (year && !/^\d{4}$/.test(year)) { $('#eMsg').textContent = '年份写四位数字，比如 1998。'; return; }
    $('#eSave').disabled = true;
    try {
      let id = eState.editId;
      const data = { city: name || $('#eChosenName').textContent || '一个地方', region: eState.region, coord: eState.coord, year, moods, text };
      if (id) Object.assign(S.custom.find(c => c.id === id), data);
      else { id = 'p' + Date.now().toString(36); S.custom.push({ id, en: '', note: '', entry: true, created: Date.now(), ...data }); }
      for (const ph of eState.pending) await storePhoto(id, ph);
      await save();
      closeEntry();
      buildPins(); buildIndex();
      openPlace(id, { fly: true });
      toast(eState.editId ? '改好了 ✓' : '放进回忆录了 📖', openJournal);
    } catch (err) { $('#eMsg').textContent = '没有存上，再试一次。'; }
    $('#eSave').disabled = false;
  });

  /* ---------- 想去哪里: places she dreams of — buds that haven't opened yet ---------- */
  const TODO = [
    { k: 'flowers', e: '🌸', zh: '看花', c: '#F27BAA' }, { k: 'sea', e: '🌊', zh: '看海', c: '#4F63D8' },
    { k: 'church', e: '⛪', zh: '去教堂做礼拜', c: '#E0A126' }, { k: 'hike', e: '⛰️', zh: '爬山', c: '#3E9150' },
    { k: 'food', e: '🍜', zh: '吃好吃的', c: '#D9304A' }, { k: 'photo', e: '📷', zh: '拍好多照片', c: '#6A5BD6' },
    { k: 'walk', e: '🚶‍♀️', zh: '慢慢散步', c: '#3E9150' }, { k: 'shop', e: '🛍', zh: '逛街', c: '#E85D9E' },
    { k: 'rest', e: '☕', zh: '坐着发呆', c: '#B0855A' }, { k: 'bday', e: '🎂', zh: '在那里过生日', c: '#F27BAA' }
  ];
  const WITH = [
    { k: 'dad', e: '💑', zh: '和爸爸', c: '#E4477E' }, { k: 'kids', e: '👨‍👩‍👧', zh: '和孩子们', c: '#E0A126' },
    { k: 'family', e: '🏡', zh: '全家一起', c: '#3E9150' }, { k: 'friends', e: '👭', zh: '和朋友们', c: '#6A5BD6' },
    { k: 'church', e: '🙏', zh: '和教会的朋友', c: '#4F63D8' }, { k: 'solo', e: '🌿', zh: '一个人', c: '#8A8FA8' }
  ];
  const SUGG = ['耶路撒冷', '京都', '冰岛', '瑞士', '圣托里尼', '新西兰', '巴黎', '普罗旺斯', '巴厘岛', '挪威'];
  const chipsHTML = (list, name) => list.map(m => `<label class="mood-pick" style="--mc:${m.c}"><input type="checkbox" name="${name}" value="${m.k}"><span>${m.e} ${m.zh}</span></label>`).join('');
  const wish = $('#wish');
  let wState = null, wSeq = 0;
  S.wishes = S.wishes || [];
  $('#wTodo').innerHTML = chipsHTML(TODO, 'todo');
  $('#wWith').innerHTML = chipsHTML(WITH, 'with');
  $('#wSugg').innerHTML = SUGG.map(q => `<button type="button">${q}</button>`).join('');
  $('#wSugg').querySelectorAll('button').forEach(b => b.onclick = () => { $('#wQuery').value = b.textContent; findWish(); });

  const getJSON = async url => (await fetch(url)).json();
  const stripHTML = h => { const d = document.createElement('div'); d.innerHTML = h || ''; return d.textContent.trim(); };
  const BAD_IMG = /map|flag|logo|seal|coat[_ ]of|locator|icon|diagram|chart|plan\b|montage|collage|graph|signature|emblem|symbol|banner|location|stamp|coin|scheme|svg|station|bus\b|airport|airbus|boeing|airlines|aircraft|locker|mcdonald|embassy|ticket|taxi|metro|subway|tram|railway|train|platform|parking|hostel|hotel|menu|vending|toilet|atm\b|president|minister|portrait|politic|meeting|summit|election|protest|parliament|football|stadium/i;
  // real photos of a place, from Wikipedia's article about it (falls back to a Commons search)
  async function placePhotos(c) {
    const en = c.en || c.name, zh = c.zh;
    const pick = pages => Object.values(pages || {}).map(p => ({ t: p.title, ii: p.imageinfo && p.imageinfo[0] }))
      .filter(x => x.ii && x.ii.mime === 'image/jpeg' && x.ii.width >= 800 && x.ii.width >= x.ii.height * 1.1 && !BAD_IMG.test(x.t))
      .map(x => ({ src: x.ii.thumburl, full: x.ii.thumburl, page: x.ii.descriptionurl,
        credit: stripHTML(x.ii.extmetadata && x.ii.extmetadata.Artist && x.ii.extmetadata.Artist.value).slice(0, 60),
        caption: stripHTML(x.ii.extmetadata && x.ii.extmetadata.ImageDescription && x.ii.extmetadata.ImageDescription.value).slice(0, 80) }));
    const ii = '&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiextmetadatafilter=Artist|ImageDescription&iiurlwidth=900&format=json&origin=*';
    let photos = [], lead = null;
    try {   // the article's own main picture goes first
      const d = await getJSON(`https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=original&titles=${encodeURIComponent(en)}&format=json&origin=*`);
      lead = (Object.values(d.query.pages)[0] || {}).original?.source || null;
    } catch (e) {}
    // Wikivoyage (the travel guide) has sightseeing photos; Wikipedia fills in
    try { photos = pick((await getJSON(`https://en.wikivoyage.org/w/api.php?action=query&generator=images&gimlimit=50&titles=${encodeURIComponent(c.voy || en)}${ii}`)).query?.pages); } catch (e) {}
    if (photos.length < 9) try { photos = photos.concat(pick((await getJSON(`https://en.wikipedia.org/w/api.php?action=query&generator=images&gimlimit=50&titles=${encodeURIComponent(en)}${ii}`)).query?.pages)); } catch (e) {}
    if (photos.length < 6) {
      try { photos = photos.concat(pick((await getJSON(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=30&gsrsearch=${encodeURIComponent(en + ' filetype:bitmap')}${ii}`)).query?.pages)); } catch (e) {}
    }
    let about = '';
    if (zh) {
      try {
        const d = await getJSON(`https://zh.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exsentences=2&variant=zh-cn&titles=${encodeURIComponent(zh)}&format=json&origin=*`);
        about = (Object.values(d.query.pages)[0] || {}).extract || '';
      } catch (e) {}
    }
    about = about.replace(/[（(][^（）()]*[）)]/g, '').replace(/\s+/g, ' ').replace(/，\s*，/g, '，').trim();
    if (about.length > 120) about = about.slice(0, about.lastIndexOf('。', 120) + 1 || 120) || about.slice(0, 120) + '…';
    if (lead) { const name = decodeURIComponent(lead.split('/').pop()); const i = photos.findIndex(p => decodeURIComponent(p.src).includes(name.replace(/ /g, '_'))); if (i > 0) photos.unshift(photos.splice(i, 1)[0]); }
    const seen = new Set();
    return { en, about, photos: photos.filter(p => !seen.has(p.src) && seen.add(p.src)).slice(0, 15) };
  }

  function renderWishGrid() {
    const g = $('#wGrid');
    g.innerHTML = wState.photos.map((p, i) => `<figure class="w-ph${wState.liked.has(p.src) ? ' on' : ''}" style="--d:${i * 40}ms"><button type="button" class="w-view" data-i="${i}"><img src="${esc(p.src)}" alt="${esc(p.caption)}" loading="lazy"></button><button type="button" class="w-heart" data-i="${i}" aria-label="喜欢">♡</button></figure>`).join('')
      || '<p class="e-note">没找到这里的照片，但心愿还是可以记下来。</p>';
    g.querySelectorAll('.w-view').forEach(b => b.onclick = () => openLightbox(wState.photos.map(p => ({ full: p.full, caption: [p.caption, p.credit && '📷 ' + p.credit].filter(Boolean).join(' · ') })), +b.dataset.i));
    g.querySelectorAll('.w-heart').forEach(b => b.onclick = () => {
      const p = wState.photos[+b.dataset.i];
      wState.liked.has(p.src) ? wState.liked.delete(p.src) : wState.liked.add(p.src);
      b.closest('.w-ph').classList.toggle('on', wState.liked.has(p.src));
    });
  }
  async function choosePlace(c, others) {
    const my = ++wSeq;
    wState = { ...wState, name: c.name, region: c.desc || '', coord: c.coord, photos: [], liked: new Set() };
    $('#wPlace').hidden = false; $('#wSugg').hidden = true;
    $('#wName').textContent = c.name; $('#wSub').textContent = [c.en && c.en !== c.name ? c.en : '', c.desc].filter(Boolean).join(' · ');
    $('#wAbout').textContent = ''; $('#wGrid').innerHTML = '<div class="w-loading">' + '<i></i>'.repeat(6) + '</div>';
    $('#wAlt').innerHTML = others && others.length ? '不是这里？' + others.map((o, i) => `<button type="button" data-i="${i}">${esc(o.name)}<small>${esc(o.desc || '')}</small></button>`).join('') : '';
    $('#wAlt').querySelectorAll('button').forEach(b => b.onclick = () => choosePlace(others[+b.dataset.i], others.filter(o => o !== others[+b.dataset.i]).concat(c)));
    showPreview(c.coord, 'bud', c.zoom || 6);
    const info = await placePhotos(c);
    if (my !== wSeq) return;
    wState.en = info.en; wState.photos = info.photos;
    info.photos.slice(0, 4).forEach(p => wState.liked.add(p.src));
    $('#wAbout').textContent = info.about;
    renderWishGrid();
  }
  // Wikidata knows 京都 is a city and 巴黎 is the capital of France; the map's geocoder is the fallback
  async function wikidataPlaces(q) {
    const ws = 'https://www.wikidata.org/w/api.php?format=json&origin=*';
    const hits = ((await getJSON(`${ws}&action=wbsearchentities&search=${encodeURIComponent(q)}&language=zh&uselang=zh-cn&limit=7`)).search || []);
    if (!hits.length) return [];
    const ids = hits.map(h => h.id);
    const [ents, coords] = await Promise.all([
      getJSON(`${ws}&action=wbgetentities&ids=${ids.join('|')}&props=sitelinks|labels|descriptions&languages=zh-cn|zh|en&sitefilter=enwiki|zhwiki|enwikivoyage`),
      Promise.all(ids.map(id => getJSON(`${ws}&action=wbgetclaims&entity=${id}&property=P625`).catch(() => ({}))))
    ]);
    return ids.map((id, i) => {
      const e = (ents.entities || {})[id] || {}, v = (((coords[i].claims || {}).P625 || [])[0] || {}).mainsnak?.datavalue?.value;
      if (!v) return null;
      const lab = e.labels || {}, des = e.descriptions || {}, sl = e.sitelinks || {};
      return { name: (lab['zh-cn'] || lab.zh || lab.en || {}).value || hits[i].label, desc: (des['zh-cn'] || des.zh || des.en || {}).value || hits[i].description || '',
        coord: [+v.longitude.toFixed(4), +v.latitude.toFixed(4)], en: sl.enwiki && sl.enwiki.title, zh: sl.zhwiki && sl.zhwiki.title, voy: sl.enwikivoyage && sl.enwikivoyage.title };
    }).filter(Boolean);
  }
  async function findWish() {
    const q = $('#wQuery').value.trim(); if (!q) return $('#wQuery').focus();
    $('#wStatus').textContent = '正在找……';
    let res = [];
    try { res = await wikidataPlaces(q); } catch (e) {}
    if (!res.length) {
      try {
        const r = await getJSON('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=zh-CN&namedetails=1&addressdetails=1&q=' + encodeURIComponent(q));
        res = r.map(x => ({ name: x.name || q, desc: regionOf(x.address), coord: [+(+x.lon).toFixed(4), +(+x.lat).toFixed(4)], en: x.namedetails && x.namedetails['name:en'], zoom: 11 }));
      } catch (e) {}
    }
    $('#wStatus').textContent = res.length ? '' : '没找到这个地方，换个说法试试？';
    if (res.length) choosePlace(res[0], res.slice(1, 5));
  }
  $('#wFind').onclick = findWish;
  $('#wQuery').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); findWish(); } });

  function openWish(id) {
    const w = id ? S.wishes.find(x => x.id === id) : null;
    wState = { id, photos: [], liked: new Set() };
    closeSheet();
    $('#wQuery').value = ''; $('#wStatus').textContent = ''; $('#wMsg').textContent = ''; $('#wText').value = w ? w.text || '' : '';
    wish.querySelectorAll('#wTodo input').forEach(c => c.checked = !!(w && w.todo && w.todo.includes(c.value)));
    wish.querySelectorAll('#wWith input').forEach(c => c.checked = !!(w && w.with && w.with.includes(c.value)));
    $('#wDelete').hidden = !w;
    $('#wTitle').textContent = w ? '想去' + w.name : '接下来，想去哪里？';
    if (w) {
      Object.assign(wState, { name: w.name, en: w.en, region: w.region, coord: w.coord, photos: w.photos.slice(), liked: new Set(w.photos.map(p => p.src)) });
      $('#wPlace').hidden = false; $('#wSugg').hidden = true; $('#wAlt').innerHTML = '';
      $('#wName').textContent = w.name; $('#wSub').textContent = [w.en !== w.name ? w.en : '', w.region].filter(Boolean).join(' · ');
      $('#wAbout').textContent = w.about || '';
      renderWishGrid(); showPreview(w.coord, 'bud', 6);
    } else { $('#wPlace').hidden = true; $('#wSugg').hidden = false; hidePreview(); setTimeout(() => $('#wQuery').focus(), 80); }
    wish.hidden = false; document.body.classList.add('entry-open');
  }
  const closeWish = () => { wish.hidden = true; hidePreview(); document.body.classList.remove('entry-open'); };
  $('#addWish').onclick = () => openWish();
  $('#wClose').onclick = $('#wCancel').onclick = closeWish;
  $('#wDelete').onclick = () => {
    const b = $('#wDelete');
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = '确定删掉？'; setTimeout(() => { delete b.dataset.sure; b.textContent = '删掉'; }, 3000); return; }
    S.wishes = S.wishes.filter(x => x.id !== wState.id); save(); closeWish(); buildWishPins(); updateStats();
  };
  $('#wishForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!wState || !wState.coord) { $('#wMsg').textContent = '先搜一个想去的地方。'; return; }
    const data = { name: wState.name, en: wState.en || '', region: wState.region, coord: wState.coord, about: $('#wAbout').textContent,
      photos: wState.photos.filter(p => wState.liked.has(p.src)).slice(0, 12),
      todo: [...wish.querySelectorAll('#wTodo input:checked')].map(c => c.value),
      with: [...wish.querySelectorAll('#wWith input:checked')].map(c => c.value),
      text: $('#wText').value.trim() };
    if (wState.id) Object.assign(S.wishes.find(x => x.id === wState.id), data);
    else S.wishes.push({ id: 'w' + Date.now().toString(36), created: Date.now(), ...data });
    save(); closeWish(); buildWishPins(); updateStats();
    toast(wState.id ? '心愿改好了 ✓' : '放进心愿单了 🌷', openWishlist);
    map.flyTo({ center: data.coord, zoom: Math.min(map.getZoom(), 5), duration: reduce ? 0 : 1600, essential: true });
  });

  /* buds on the map */
  const wishPins = new Map();
  function buildWishPins() {
    wishPins.forEach(m => m.remove()); wishPins.clear();
    for (const w of S.wishes.filter(x => !x.done)) {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'pin wish';
      el.innerHTML = `<i></i>${esc(w.name)}<small>想去</small>`;
      el.addEventListener('click', ev => { ev.stopPropagation(); if (!picking) openWish(w.id); });
      wishPins.set(w.id, new maplibregl.Marker({ element: el, anchor: 'top', offset: [0, 4] }).setLngLat(w.coord).addTo(map));
    }
  }
  map.on('load', buildWishPins);
  const wishHTML = w => `<article class="w-card">${w.photos[0] ? `<img src="${esc(w.photos[0].src)}" alt="" loading="lazy">` : ''}<div><b>${esc(w.name)}</b>${w.en && w.en !== w.name ? `<small>${esc(w.en)}</small>` : ''}
    <div class="moods-row">${(w.todo || []).map(k => TODO.find(t => t.k === k)).filter(Boolean).map(t => `<span class="mood" style="--mc:${t.c}">${t.e} ${t.zh}</span>`).join('')}${(w.with || []).map(k => WITH.find(t => t.k === k)).filter(Boolean).map(t => `<span class="mood" style="--mc:${t.c}">${t.e} ${t.zh}</span>`).join('')}</div>
    ${w.text ? `<p>${esc(w.text)}</p>` : ''}</div></article>`;

  /* ---------- 回忆录 (the past) and 心愿单 (the future) ---------- */
  const journalBk = $('#journal'), wishBk = $('#wishlist');
  let toastTimer = 0;
  function toast(text, go) {
    const t = $('#toast');
    $('#toastText').textContent = text; $('#toastGo').hidden = !go;
    $('#toastGo').onclick = () => { t.hidden = true; go(); };
    t.hidden = false; t.classList.remove('in'); void t.offsetWidth; t.classList.add('in');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 5000);
  }
  function updateBookCounts() {
    $('#nJournal').textContent = journalItems().length;
    $('#nWish').textContent = (S.wishes || []).filter(w => !w.done).length;
    $('#nDiary').textContent = (S.diary || []).length;
    ['#nJournal', '#nWish', '#nDiary'].forEach(id => { const el = $(id); el.textContent = +el.textContent ? el.textContent : ''; });
  }
  const TAPES = ['pink', 'green', 'gold', 'blue'];
  const tape = i => `<i class="tape ${TAPES[i % TAPES.length]}"></i>`;
  const bkHead = (eyebrow, title, sub) => `<button class="glass round bk-back" type="button" data-close aria-label="回到地图">‹</button>
    <header class="bk-hero"><p class="bk-eyebrow">${eyebrow}</p><h1>${title}</h1><p class="bk-sub">${sub}</p></header>`;
  function openBook(el, html) {
    closeSheet();
    el.querySelector('.bk-inner').innerHTML = html;
    el.hidden = false; el.scrollTop = 0;
    el.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { el.hidden = true; });
  }

  // everything that already happened: the story you wrote her, places she marked, postcards she sent
  function journalItems() {
    const items = [];
    let last = 0;
    (G.journey || []).forEach((m, i) => {
      const p = placeById(m.place); if (!p) return;
      const y = +m.year || null; last = y || last + 0.01;   // undated stops stay where they are in the story
      items.push({ kind: 'story', year: y, at: last, label: m.label, sort: i, place: p, spot: m.spot, title: m.title, text: m.text, photos: (m.photos || []).filter(hasPhoto).map(x => ({ thumb: photoFiles(x).thumb, full: photoFiles(x).src, caption: x.caption || '' })) });
    });
    S.custom.forEach(c => items.push({ kind: 'mine', year: +c.year || null, at: +c.year || 9999, sort: 1e4 + (c.created || 0) / 1e9, place: placeById(c.id), title: c.city, text: c.text, moods: c.moods, fromWish: c.fromWish, photos: photosOf(c.id) }));
    (G.moments || []).forEach((m, i) => { const p = placeById(m.place); if (p) items.push({ kind: 'moment', year: +m.date.slice(0, 4), at: +m.date.slice(0, 4) + 0.5 + i / 100, sort: 3e4 + i, place: p, moment: m,
      photos: (m.photos || []).map(n => ({ thumb: `photos/thumb/${n}.jpg`, full: `photos/web/${n}.jpg`, caption: '' })) }); });
    S.cards.forEach(c => { const p = placeById(c.place); if (p) items.push({ kind: 'card', year: +c.year || null, at: +c.year || 9999, sort: 2e4 + (c.created || 0) / 1e9, place: p, card: c }); });
    return items;
  }
  function openJournal() {
    const items = journalItems();
    const years = new Map();
    items.slice().sort((a, b) => a.at - b.at || a.sort - b.sort).forEach(it => {
      const k = it.year || it.label || '某一年'; if (!years.has(k)) years.set(k, []); years.get(k).push(it);
    });
    let n = 0;
    const card = it => {
      const i = n++, p = it.place;
      if (it.kind === 'card') return `<article class="jn-item jn-card" data-place="${p.id}" style="--r:${(i % 2 ? 1 : -1) * .6}deg">${postcardHTML(it.card, p, false)}</article>`;
      if (it.kind === 'moment') { const m = it.moment, d = pDate(m.date);
        return `<article class="jn-item jn-moment" data-place="${p.id}" style="--r:${(i % 2 ? 1 : -1) * .5}deg">${tape(i)}
          <div class="mo-head"><i class="jn-fl"></i><b>小妈</b><span class="jn-who">你写过的话</span></div>
          <p class="mo-text">${esc(m.text)}</p>
          <div class="mo-grid n${it.photos.length}">${it.photos.map((x, j) => `<button type="button" class="mo-ph" data-j="${j}"><img src="${x.thumb}" alt="" loading="lazy"></button>`).join('')}</div>
          <div class="mo-meta">${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · ${esc(p.city)}</div>
          ${(m.comments || []).length ? `<div class="mo-comments">${m.comments.map(c => `<p class="${c.reply ? 'reply' : ''}"><b>${esc(c.who)}</b>${c.reply ? '<i>回复</i>' : ''}：${esc(c.text)}</p>`).join('')}</div>` : ''}
          <span class="jn-go"><button type="button" class="mk-poster" data-poster>🎨 做成海报</button>在地图上看 →</span>
        </article>`; }
      const ph = it.photos.slice(0, 3);
      return `<article class="jn-item ${it.kind}" data-place="${p.id}" style="--r:${(i % 2 ? 1 : -1) * .8}deg">
        ${tape(i)}
        <div class="jn-meta"><span class="jn-where"><i class="jn-fl"></i>${esc(p.city)}${it.spot ? ' · ' + esc(it.spot) : ''}</span>
          <span class="jn-who">${it.kind === 'story' ? '润润写给你的' : it.fromWish ? '🌸 心愿实现了' : '你记下的'}</span></div>
        <h3>${esc(it.title || p.city)}</h3>
        ${it.moods && it.moods.length ? `<div class="moods-row">${moodChips(it.moods)}</div>` : ''}
        ${it.text ? `<p>${esc(it.text)}</p>` : ''}
        ${ph.length ? `<div class="jn-photos n${ph.length}">${ph.map((x, j) => `<button type="button" class="jn-ph" data-j="${j}" style="--pr:${[-4, 3, -2][j]}deg"><img src="${x.thumb}" alt="" loading="lazy"></button>`).join('')}${it.photos.length > 3 ? `<span class="jn-more">+${it.photos.length - 3}</span>` : ''}</div>` : ''}
        <span class="jn-go">${it.kind === 'mine' ? '<button type="button" class="mk-poster" data-poster>🎨 做成海报</button>' : ''}在地图上看 →</span>
      </article>`;
    };
    openBook(journalBk, bkHead('My Memories', '回忆录', `走过的路、遇见的人、那时候的心情，都在这里。<br><b>${items.length}</b> 段回忆`) +
      (items.length ? [...years].map(([y, list]) => `<section class="jn-year"><h2><span>${esc(String(y))}</span></h2><div class="jn-list">${list.map(card).join('')}</div></section>`).join('')
        : `<div class="bk-empty"><i class="jn-fl big"></i><p>还没有回忆。<br>去地图上记下第一个地方吧。</p></div>`) +
      `<div class="bk-foot"><button class="pill ghost" type="button" id="jnReview">📜 看看一生的回顾，和那封信</button><button class="pill primary" type="button" id="jnAdd">＋ 记一个地方</button></div>`);
    $('#jnAdd').onclick = () => { journalBk.hidden = true; openEntry(); };
    $('#jnReview').onclick = () => { journalBk.hidden = true; openReview(); };
    const all = [...years.values()].flat();
    journalBk.querySelectorAll('.jn-item').forEach((el, i) => {
      const it = all[i];
      el.querySelectorAll('.jn-ph,.mo-ph').forEach(b => b.onclick = e => { e.stopPropagation(); openLightbox(it.photos, +b.dataset.j); });
      const mp = el.querySelector('[data-poster]'); if (mp) mp.onclick = e => { e.stopPropagation(); if (it.kind === 'moment') return Poster.moment(it.moment); const c = S.custom.find(x => x.id === it.place.id); if (c) Poster.place(c); };
      el.onclick = () => { journalBk.hidden = true; openPlace(el.dataset.place, { fly: true }); };
    });
  }

  // the places she dreams of
  function openWishlist() {
    const ws = S.wishes || [], todo = ws.filter(w => !w.done), done = ws.filter(w => w.done);
    const chip = (list, k) => { const t = list.find(x => x.k === k); return t ? `<span class="sticker" style="--mc:${t.c}">${t.e} ${t.zh}</span>` : ''; };
    const card = (w, i) => `<article class="wl-card${w.done ? ' done' : ''}" data-id="${w.id}" style="--r:${[-2.2, 1.6, -1, 2.4][i % 4]}deg">
        ${tape(i + 1)}
        <div class="wl-pic">${w.photos[0] ? `<img src="${esc(w.photos[0].src)}" alt="" loading="lazy">` : `<div class="wl-nopic"><i class="w-bud"></i></div>`}
          ${w.done ? `<span class="wl-stamp">已实现<small>${new Date(w.done).getFullYear()}</small></span>` : ''}</div>
        ${w.photos.length > 1 ? `<div class="wl-thumbs">${w.photos.slice(1, 4).map(p => `<img src="${esc(p.src)}" alt="" loading="lazy">`).join('')}</div>` : ''}
        <h3><i class="${w.done ? 'jn-fl' : 'w-bud'}"></i>${esc(w.name)}</h3>
        ${w.en && w.en !== w.name ? `<p class="wl-en">${esc(w.en)}</p>` : ''}
        <div class="wl-stickers">${(w.todo || []).map(k => chip(TODO, k)).join('')}${(w.with || []).map(k => chip(WITH, k)).join('')}</div>
        ${w.text ? `<p class="wl-note">${esc(w.text)}</p>` : ''}
        <div class="wl-actions">${w.done ? `<button type="button" data-memory>看看这段回忆 →</button>`
          : `<button type="button" data-edit>看看</button><button type="button" class="wl-yes" data-yes>实现啦 🌸</button>`}<button type="button" class="wl-poster" data-poster aria-label="做成海报">🎨</button><button type="button" class="wl-poster wl-trash" data-del aria-label="删掉">🗑</button></div>
      </article>`;
    openBook(wishBk, bkHead('Someday, soon', '心愿单', `想去的地方，一个一个去。<br>${todo.length ? `还有 <b>${todo.length}</b> 个心愿等着开花` : '写下第一个心愿吧'}`) +
      `<div class="wl-grid">${todo.map(card).join('')}<button type="button" class="wl-new" id="wlNew"><i class="w-bud"></i><b>＋ 新的心愿</b><small>想去哪里？</small></button></div>` +
      (todo.length ? '' : `<div class="wl-ideas">也许是……${SUGG.slice(0, 6).map(q => `<button type="button" data-q="${q}">${q}</button>`).join('')}</div>`) +
      (done.length ? `<section class="wl-done"><h2><span>已经实现的心愿</span></h2><div class="wl-grid">${done.map(card).join('')}</div></section>` : ''));
    $('#wlNew').onclick = () => { wishBk.hidden = true; openWish(); };
    wishBk.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { wishBk.hidden = true; openWish(); $('#wQuery').value = b.dataset.q; findWish(); });
    wishBk.querySelectorAll('.wl-card').forEach(el => {
      const w = ws.find(x => x.id === el.dataset.id);
      const ed = el.querySelector('[data-edit]'); if (ed) ed.onclick = () => { wishBk.hidden = true; openWish(w.id); };
      const mem = el.querySelector('[data-memory]'); if (mem) mem.onclick = () => { wishBk.hidden = true; if (placeById(w.doneId)) openPlace(w.doneId, { fly: true }); };
      const yes = el.querySelector('[data-yes]'); if (yes) yes.onclick = () => fulfillWish(w, el);
      el.querySelector('[data-poster]').onclick = () => Poster.wish(w);
      const del = el.querySelector('[data-del]');
      del.onclick = async () => {
        if (!del.dataset.sure) { del.dataset.sure = 1; del.classList.add('sure'); del.textContent = w.done ? '确定？回忆也会删' : '确定删掉？'; setTimeout(() => { if (del.dataset.sure) { delete del.dataset.sure; del.classList.remove('sure'); del.textContent = '🗑'; } }, 4000); return; }
        const memId = w.done && w.doneId;
        S.wishes = S.wishes.filter(x => x.id !== w.id);
        if (memId && S.custom.some(c => c.id === memId)) await deletePlace(memId); else save();
        buildWishPins(); updateStats(); openWishlist(); toast('删掉了');
      };
      el.querySelector('.wl-pic img') && (el.querySelector('.wl-pic img').onclick = () => openLightbox(w.photos.map(p => ({ full: p.full || p.src, caption: p.caption || '' })), 0));
    });
  }
  // a wish comes true: the bud opens, and it becomes a memory she can fill in
  function fulfillWish(w, el) {
    const id = 'p' + Date.now().toString(36);
    S.custom.push({ id, city: w.name, en: w.en || '', region: w.region || '', coord: w.coord, year: String(new Date().getFullYear()), note: '', moods: ['thankful', 'happy'], text: w.text || '', entry: true, fromWish: w.id, created: Date.now() });
    w.done = Date.now(); w.doneId = id;
    save(); buildPins(); buildWishPins(); updateStats();
    el.classList.add('blooming');
    try { navigator.vibrate && navigator.vibrate([12, 60, 18]); } catch (err) {}
    setTimeout(() => {
      wishBk.hidden = true;
      openEntry(id);
      toast('心愿实现了 🌸 已经放进回忆录，加几张照片、写写那时候的心情吧', openJournal);
    }, reduce ? 0 : 1400);
  }
  $('#openJournal').onclick = openJournal;
  $('#openWishlist').onclick = openWishlist;

  /* ---------- 日记本: everyday journals and prayer journals, typed or handwritten ---------- */
  S.diary = S.diary || []; S.flashSums = S.flashSums || {}; S.seenFlash = S.seenFlash || {};
  const SERVER = (G.server && G.server.url || '').replace(/\/+$/, '');
  const AI = SERVER && G.server.ai ? { endpoint: SERVER + '/ai' } : null;
  const diaryBk = $('#diary'), flashBk = $('#flash'), dModal = $('#diaryModal');
  const WK = '日一二三四五六';
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const pDate = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  const today = () => ymd(new Date());
  const fmtDay = s => { const d = pDate(s), y = d.getFullYear() !== new Date().getFullYear() ? `${d.getFullYear()}年` : ''; return `${y}${d.getMonth() + 1}月${d.getDate()}日 · 星期${WK[d.getDay()]}`; };
  const DTYPE = { journal: { zh: '日记', e: '✍️' }, prayer: { zh: '祷告日记', e: '🙏' } };
  const pageUrls = new Map();
  (async () => {   // load the photographed pages
    for (const e of S.diary) for (const id of e.pages || []) {
      try { const t = await Store.getBlob('t:' + id), f = await Store.getBlob('f:' + id); if (t) pageUrls.set(id, { thumb: URL.createObjectURL(t), full: URL.createObjectURL(f || t) }); } catch (err) {}
    }
    if (!diaryBk.hidden) openDiaryBook();
  })();
  const pagesOf = e => (e.pages || []).map(id => pageUrls.get(id)).filter(Boolean).map((u, i) => ({ ...u, caption: `${fmtDay(e.date)} · 第 ${i + 1} 页` }));

  /* --- writing --- */
  let dState = null;
  $('#dMoods').innerHTML = MOODS.map(m => `<label class="mood-pick" style="--mc:${m.c}"><input type="checkbox" value="${m.k}"><span>${m.e} ${m.zh}</span></label>`).join('');
  function setDType(t) {
    dState.type = t;
    dModal.querySelectorAll('.d-type button').forEach(b => b.classList.toggle('on', b.dataset.type === t));
    dModal.querySelector('.d-journal').hidden = t !== 'journal';
    dModal.querySelector('.d-prayer').hidden = t !== 'prayer';
    dModal.querySelector('.diary-form').dataset.type = t;
  }
  dModal.querySelectorAll('.d-type button').forEach(b => b.onclick = () => setDType(b.dataset.type));
  const showDate = () => { $('#dDateText').textContent = fmtDay($('#dDate').value || today()); };
  $('#dDate').onchange = showDate;
  function renderDPages() {
    const box = $('#dPages'), add = box.querySelector('.d-add');
    box.querySelectorAll('.e-ph').forEach(n => n.remove());
    const all = [...dState.pages.map(id => ({ id, src: pageUrls.get(id)?.thumb })), ...dState.pending.map((p, i) => ({ pi: i, src: p.preview }))];
    all.forEach(x => {
      const d = document.createElement('div'); d.className = 'e-ph';
      d.innerHTML = `<img src="${x.src || ''}" alt=""><button type="button" aria-label="移除">×</button>`;
      d.querySelector('button').onclick = () => { if (x.id) dState.removed.push(x.id), dState.pages = dState.pages.filter(i => i !== x.id); else dState.pending.splice(x.pi, 1); renderDPages(); };
      box.insertBefore(d, add);
    });
  }
  function openDiaryEntry({ id, type = 'journal', date, pick } = {}) {
    const e = id ? S.diary.find(x => x.id === id) : null;
    dState = { id, pages: e ? (e.pages || []).slice() : [], pending: [], removed: [] };
    setDType(e ? e.type : type);
    $('#dDate').value = e ? e.date : (date || today()); showDate();
    $('#dTitle').value = e?.title || ''; $('#dText').value = e?.text || '';
    $('#dVerse').value = e?.verse || ''; $('#dThanks').value = e?.thanks || '';
    $('#dRequests').value = (e?.requests || []).map(r => r.t).join('\n'); $('#dPrayer').value = e?.prayer || '';
    dModal.querySelectorAll('#dMoods input').forEach(c => c.checked = !!e?.moods?.includes(c.value));
    $('#dMsg').textContent = ''; $('#dDelete').hidden = !e;
    renderDPages();
    dModal.hidden = false;
    if (pick) setTimeout(() => $('#dFiles').click(), 50);
  }
  const closeDiaryEntry = () => { dModal.hidden = true; };
  $('#dClose').onclick = $('#dCancel').onclick = closeDiaryEntry;
  $('#dFiles').onchange = async ev => {
    const files = [...ev.target.files]; ev.target.value = '';
    $('#dMsg').textContent = '正在放进来……';
    for (const f of files) { try { const info = await Photo.read(f, 2600); dState.pending.push({ ...info, preview: URL.createObjectURL(info.thumb) }); renderDPages(); } catch (err) {} }
    $('#dMsg').textContent = '';
  };
  $('#dDelete').onclick = async () => {
    const b = $('#dDelete');
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = '确定删掉？'; setTimeout(() => { delete b.dataset.sure; b.textContent = '删掉'; }, 3000); return; }
    const e = S.diary.find(x => x.id === dState.id);
    for (const pid of e.pages || []) { await Store.delBlob('t:' + pid).catch(() => {}); await Store.delBlob('f:' + pid).catch(() => {}); }
    S.diary = S.diary.filter(x => x !== e); await save(); closeDiaryEntry(); updateBookCounts(); openDiaryBook();
  };
  $('#diaryForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const t = dState.type, old = dState.id ? S.diary.find(x => x.id === dState.id) : null;
    const reqLines = $('#dRequests').value.split('\n').map(x => x.trim()).filter(Boolean);
    const data = {
      type: t, date: $('#dDate').value || today(),
      title: t === 'journal' ? $('#dTitle').value.trim() : '', text: t === 'journal' ? $('#dText').value.trim() : '',
      moods: t === 'journal' ? [...dModal.querySelectorAll('#dMoods input:checked')].map(c => c.value) : [],
      verse: t === 'prayer' ? $('#dVerse').value.trim() : '', thanks: t === 'prayer' ? $('#dThanks').value.trim() : '',
      prayer: t === 'prayer' ? $('#dPrayer').value.trim() : '',
      // keep "answered" marks on requests that are still there
      requests: t === 'prayer' ? reqLines.map(line => (old?.requests || []).find(r => r.t === line) || { t: line, answered: null }) : []
    };
    const hasWords = data.text || data.title || data.verse || data.thanks || data.prayer || data.requests.length;
    if (!hasWords && !dState.pages.length && !dState.pending.length) { $('#dMsg').textContent = '写几句，或者拍一页手写的日记。'; return; }
    $('#dSave').disabled = true;
    try {
      for (const pid of dState.removed) { await Store.delBlob('t:' + pid).catch(() => {}); await Store.delBlob('f:' + pid).catch(() => {}); }
      for (const p of dState.pending) {
        const pid = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        await Store.putBlob('t:' + pid, p.thumb); await Store.putBlob('f:' + pid, p.full);
        pageUrls.set(pid, { thumb: URL.createObjectURL(p.thumb), full: URL.createObjectURL(p.full) });
        dState.pages.push(pid);
      }
      data.pages = dState.pages;
      if (old) Object.assign(old, data, { updated: Date.now(), transcript: dState.pending.length || dState.removed.length ? '' : old.transcript });
      else S.diary.push({ id: 'j' + Date.now().toString(36), created: Date.now(), ...data });
      await save(); closeDiaryEntry(); updateBookCounts();
      openDiaryBook();
      toast(old ? '改好了 ✓' : t === 'prayer' ? '收进日记本了 🙏' : '收进日记本了 ✍️');
    } catch (err) { $('#dMsg').textContent = '没有存上，再试一次。'; }
    $('#dSave').disabled = false;
  });

  /* --- the diary book --- */
  let calMonth = new Date(); calMonth.setDate(1);
  function entryHTML(e) {
    const d = pDate(e.date), pg = pagesOf(e), ty = DTYPE[e.type] || DTYPE.journal;
    return `<article class="dy-item ${e.type}" data-id="${e.id}" id="dy-${e.id}">
      <div class="dy-date"><b>${d.getDate()}</b><span>${d.getMonth() + 1}月</span><small>周${WK[d.getDay()]}</small></div>
      <div class="dy-body">
        <span class="dy-badge">${ty.e} ${ty.zh}</span>
        ${e.title ? `<h3>${esc(e.title)}</h3>` : ''}
        ${e.verse ? `<p class="dy-verse">📖 ${esc(e.verse)}</p>` : ''}
        ${e.text ? `<p class="dy-text">${esc(e.text)}</p>` : ''}
        ${e.thanks ? `<p class="dy-thanks"><b>🌼 感恩</b>${esc(e.thanks)}</p>` : ''}
        ${e.requests && e.requests.length ? `<ul class="dy-req">${e.requests.map((r, i) => `<li><button type="button" class="${r.answered ? 'yes' : ''}" data-req="${i}">${r.answered ? '✨' : '🙏'}</button><span>${esc(r.t)}</span>${r.answered ? `<small>${fmtDay(r.answered).split(' · ')[0]} 蒙应允</small>` : ''}</li>`).join('')}</ul>` : ''}
        ${e.prayer ? `<p class="dy-text dy-prayer">${esc(e.prayer)}</p>` : ''}
        ${e.transcript ? `<details class="dy-tr"><summary>✨ 手写的字</summary><p>${esc(e.transcript)}</p></details>` : ''}
        ${pg.length ? `<div class="dy-pages">${pg.map((x, j) => `<button type="button" data-pg="${j}" style="--pr:${[-2.5, 2, -1.2, 2.6][j % 4]}deg"><img src="${x.thumb}" alt="手写的第 ${j + 1} 页" loading="lazy"></button>`).join('')}</div>` : ''}
        ${e.moods && e.moods.length ? `<div class="moods-row">${moodChips(e.moods)}</div>` : ''}
        ${AI && pg.length && !e.transcript ? `<button type="button" class="dy-ai" data-tr>✨ 帮我把手写的字认出来</button>` : ''}
        <button type="button" class="mk-poster" data-poster>🎨 做成海报</button>
      </div></article>`;
  }
  function calendarHTML() {
    const y = calMonth.getFullYear(), m = calMonth.getMonth(), first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
    const byDay = new Map(); S.diary.forEach(e => { const d = pDate(e.date); if (d.getFullYear() === y && d.getMonth() === m) { const k = d.getDate(); byDay.set(k, (byDay.get(k) || []).concat(e)); } });
    let cells = '';
    for (let i = 0; i < first; i++) cells += '<span></span>';
    for (let d = 1; d <= days; d++) {
      const es = byDay.get(d) || [], isToday = ymd(new Date(y, m, d)) === today();
      cells += `<button type="button" data-day="${ymd(new Date(y, m, d))}" class="${es.length ? 'has' : ''}${isToday ? ' today' : ''}">${d}<i>${es.map(e => `<em class="${e.type}${(e.pages || []).length ? ' pg' : ''}"></em>`).slice(0, 3).join('')}</i></button>`;
    }
    return `<section class="dy-cal"><header><button type="button" data-cal="-1" aria-label="上个月">‹</button><b>${y}年${m + 1}月</b><button type="button" data-cal="1" aria-label="下个月">›</button></header>
      <div class="dy-wk">${[...WK].map(w => `<span>${w}</span>`).join('')}</div><div class="dy-days">${cells}</div>
      <p class="dy-legend"><em class="journal"></em>日记 <em class="prayer"></em>祷告 <em class="journal pg"></em>有手写的页</p></section>`;
  }
  function recapCardHTML(otd) {
    const r = rangeOf('week', new Date()), g = gather(r);
    const tally = new Map(); g.moods.forEach(k => tally.set(k, (tally.get(k) || 0) + 1));
    const moods = [...tally].sort((x, y) => y[1] - x[1]).slice(0, 4).map(([k]) => moodOf(k)?.e || '').join(' ');
    const bits = [g.journals.length && `${g.journals.length} 篇日记`, g.prayers.length && `${g.prayers.length} 次祷告`, g.answered.length && `${g.answered.length} 个蒙应允 ✨`, g.places.length && `${g.places.length} 个新地方`].filter(Boolean);
    return `<section class="recap">
      <button type="button" class="recap-main" data-fl="week">
        <span class="recap-eyebrow">📅 回顾 · 这一周</span>
        <b>${r.label}</b>
        <span class="recap-sum">${bits.length ? bits.join(' · ') : '这一周还没写，写一篇就会出现在这里'}</span>
        ${moods ? `<span class="recap-moods">${moods}</span>` : ''}
        <span class="recap-go">打开回顾 →</span>
      </button>
      <div class="recap-more">
        <button type="button" data-fl="month">🗓️ 这个月</button>
        ${otd.length ? `<button type="button" data-fl="otd">⏳ 往年的今天 · ${otd.length}</button>` : ''}
      </div>
    </section>`;
  }
  // the little message: every time she opens 日记本 (and whenever she taps 再听一次)
  function diaryVoice() {
    if (!Sound.has('diary')) return;
    Sound.unlock('diary'); Sound.play('diary');
  }
  function openDiaryBook() {
    const list = S.diary.slice().sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0));
    const months = new Map(); list.forEach(e => { const d = pDate(e.date), k = `${d.getFullYear()}年${d.getMonth() + 1}月`; if (!months.has(k)) months.set(k, []); months.get(k).push(e); });
    const answered = S.diary.reduce((n, e) => n + (e.requests || []).filter(r => r.answered).length, 0);
    const otd = onThisDay(new Date());
    openBook(diaryBk, bkHead('My Journal', '日记本', `${fmtDay(today())}<br>每一天，都值得被记下来。${answered ? `<br>已经有 <b>${answered}</b> 个祷告蒙应允 ✨` : ''}`) +
      (Sound.has('diary') ? `<div class="dy-listen-row"><button type="button" class="dy-listen" id="dyListen">🔈 再听一次</button></div>` : '') +
      `<div class="dy-new">
        <button type="button" data-new="journal"><span>✍️</span><b>写今天的日记</b><small>打字写</small></button>
        <button type="button" data-new="prayer"><span>🙏</span><b>写祷告日记</b><small>经文 · 感恩 · 代祷</small></button>
        <button type="button" data-new="photo"><span>📷</span><b>拍下手写的日记</b><small>本子上写好的，拍一张就行</small></button>
      </div>
      ${recapCardHTML(otd)}
      ${calendarHTML()}
      ${list.length ? [...months].map(([k, es]) => `<section class="dy-month"><h2><span>${k}</span></h2>${es.map(entryHTML).join('')}</section>`).join('')
        : `<div class="bk-empty"><i class="jn-fl big"></i><p>日记本还是空的。<br>今天想写点什么吗？</p></div>`}`);
    wireDiaryBook();
  }
  function wireDiaryBook(root = diaryBk) {
    const li = root.querySelector('#dyListen'); if (li) li.onclick = () => { Sound.unlock('diary'); Sound.play('diary'); li.classList.remove('playing'); void li.offsetWidth; li.classList.add('playing'); };
    root.querySelectorAll('[data-new]').forEach(b => b.onclick = () => { const k = b.dataset.new; openDiaryEntry(k === 'photo' ? { pick: true } : { type: k }); });
    root.querySelectorAll('[data-fl]').forEach(b => b.onclick = () => openFlash(b.dataset.fl));
    root.querySelectorAll('[data-cal]').forEach(b => b.onclick = () => { calMonth.setMonth(calMonth.getMonth() + +b.dataset.cal); root.querySelector('.dy-cal').outerHTML = calendarHTML(); wireDiaryBook(root); });
    root.querySelectorAll('[data-day]').forEach(b => b.onclick = () => {
      const e = S.diary.find(x => x.date === b.dataset.day), el = e && root.querySelector('#dy-' + e.id);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
      else openDiaryEntry({ date: b.dataset.day });
    });
    root.querySelectorAll('.dy-item').forEach(el => {
      const e = S.diary.find(x => x.id === el.dataset.id); if (!e) return;
      el.onclick = () => openDiaryEntry({ id: e.id });
      el.querySelectorAll('[data-pg]').forEach(b => b.onclick = ev => { ev.stopPropagation(); openLightbox(pagesOf(e), +b.dataset.pg); });
      el.querySelectorAll('[data-req]').forEach(b => b.onclick = ev => {
        ev.stopPropagation();
        const r = e.requests[+b.dataset.req]; r.answered = r.answered ? null : today(); save();
        const li = b.closest('li'); b.classList.toggle('yes', !!r.answered); b.textContent = r.answered ? '✨' : '🙏';
        li.querySelector('small')?.remove(); if (r.answered) { li.insertAdjacentHTML('beforeend', '<small>今天 蒙应允</small>'); toast('感谢主 ✨ 这个祷告蒙应允了'); try { navigator.vibrate && navigator.vibrate([12, 60, 18]); } catch (err) {} }
      });
      const tr = el.querySelector('[data-tr]'); if (tr) tr.onclick = ev => { ev.stopPropagation(); transcribe(e, tr); };
      const mp = el.querySelector('[data-poster]'); if (mp) mp.onclick = ev => { ev.stopPropagation(); Poster.diary(e); };
      el.querySelectorAll('details').forEach(d => d.onclick = ev => ev.stopPropagation());
    });
  }

  /* --- flashbacks --- */
  const weekStart = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  function rangeOf(kind, anchor) {
    if (kind === 'week') { const a = weekStart(anchor), b = new Date(a); b.setDate(a.getDate() + 6); return { a, b, key: 'w' + ymd(a), label: `${a.getMonth() + 1}月${a.getDate()}日 — ${b.getMonth() + 1}月${b.getDate()}日`, title: '这一周' }; }
    const a = new Date(anchor.getFullYear(), anchor.getMonth(), 1), b = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { a, b, key: 'm' + ymd(a).slice(0, 7), label: `${a.getFullYear()}年${a.getMonth() + 1}月`, title: '这个月' };
  }
  const inRange = (s, r) => s >= ymd(r.a) && s <= ymd(r.b);
  function onThisDay(d) {
    const md = x => { const t = pDate(x); return (t.getMonth() + 1) * 100 + t.getDate(); }, target = (d.getMonth() + 1) * 100 + d.getDate();
    return S.diary.filter(e => pDate(e.date).getFullYear() < d.getFullYear() && Math.abs(md(e.date) - target) <= 3);
  }
  function gather(r) {
    const es = S.diary.filter(e => inRange(e.date, r)).sort((x, y) => x.date.localeCompare(y.date));
    const created = t => t && inRange(ymd(new Date(t)), r);
    return {
      es, journals: es.filter(e => e.type === 'journal'), prayers: es.filter(e => e.type === 'prayer'),
      verses: es.filter(e => e.verse).map(e => ({ d: e.date, v: e.verse })),
      answered: S.diary.flatMap(e => (e.requests || []).filter(x => x.answered && inRange(x.answered, r)).map(x => x.t)),
      open: es.flatMap(e => (e.requests || []).filter(x => !x.answered).map(x => x.t)),
      moods: es.flatMap(e => e.moods || []).concat(S.custom.filter(c => created(c.created)).flatMap(c => c.moods || [])),
      pages: es.flatMap(e => pagesOf(e)),
      places: S.custom.filter(c => created(c.created)),
      wishesNew: (S.wishes || []).filter(w => created(w.created)), wishesDone: (S.wishes || []).filter(w => created(w.done))
    };
  }
  let flKind = 'week', flAnchor = new Date();
  function openFlash(kind, anchor) {
    if (kind) flKind = kind; flAnchor = anchor || (kind ? new Date() : flAnchor);
    if (flKind === 'otd') return openOnThisDay();
    const r = rangeOf(flKind, flAnchor), g = gather(r);
    S.seenFlash[flKind] = r.key; save();
    const tally = new Map(); g.moods.forEach(k => tally.set(k, (tally.get(k) || 0) + 1));
    const topMoods = [...tally].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => { const m = moodOf(k); return m ? `<span class="mood big" style="--mc:${m.c}">${m.e} ${m.zh}<b>×${n}</b></span>` : ''; }).join('');
    const empty = !g.es.length && !g.places.length && !g.wishesNew.length && !g.wishesDone.length;
    const sum = S.flashSums[r.key];
    const past = flKind === 'week' ? [...new Set(S.diary.filter(e => pDate(e.date).getFullYear() < r.a.getFullYear() && Math.abs(weekStart(pDate(e.date).setFullYear(r.a.getFullYear())) - r.a) < 864e5).map(e => e))] : S.diary.filter(e => pDate(e.date).getFullYear() < r.a.getFullYear() && pDate(e.date).getMonth() === r.a.getMonth());
    openBook(flashBk, `<button class="glass round bk-back" type="button" data-close aria-label="回到日记本">‹</button>
      <header class="bk-hero fl-hero">
        <div class="fl-tabs"><button type="button" data-k="week" class="${flKind === 'week' ? 'on' : ''}">每周</button><button type="button" data-k="month" class="${flKind === 'month' ? 'on' : ''}">每月</button></div>
        <p class="bk-eyebrow">Flashback</p>
        <div class="fl-nav"><button type="button" data-step="-1" aria-label="往前">‹</button><h1>${r.label}</h1><button type="button" data-step="1" aria-label="往后" ${r.b >= new Date() ? 'disabled' : ''}>›</button></div>
      </header>
      ${empty ? `<div class="bk-empty"><i class="jn-fl big"></i><p>这段时间还没有写下什么。<br>没关系，慢慢来。</p></div>` : `
      ${AI ? `<section class="fl-ai">${sum ? `<p class="fl-ai-t">✨ 这${flKind === 'week' ? '一周' : '个月'}</p><div class="fl-ai-text">${esc(sum).replace(/\n/g, '<br>')}</div><button type="button" class="fl-redo" data-ai>重新总结</button>`
        : `<button type="button" class="fl-ai-go" data-ai>✨ 帮我把这${flKind === 'week' ? '一周' : '个月'}总结一下</button><small>会把这段时间的日记发给 AI 读一读</small>`}</section>` : ''}
      <div class="fl-stats">
        <span><b>${g.journals.length}</b>篇日记</span><span><b>${g.prayers.length}</b>次祷告</span>
        <span><b>${g.answered.length}</b>个蒙应允</span><span><b>${g.places.length}</b>个新地方</span>
      </div>
      ${topMoods ? `<section class="fl-sec"><h3>这段时间的心情</h3><div class="moods-row">${topMoods}</div></section>` : ''}
      ${g.answered.length ? `<section class="fl-sec fl-answered"><h3>✨ 蒙应允的祷告</h3><ul>${g.answered.map(t => `<li>${esc(t)}</li>`).join('')}</ul><p class="fl-amen">感谢主，祂都听见了。</p></section>` : ''}
      ${g.verses.length ? `<section class="fl-sec fl-verses"><h3>📖 这段时间的经文</h3>${g.verses.map(v => `<blockquote>${esc(v.v)}<small>${fmtDay(v.d)}</small></blockquote>`).join('')}</section>` : ''}
      ${g.open.length ? `<section class="fl-sec"><h3>🙏 还在为这些祷告</h3><ul class="fl-open">${g.open.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}
      ${g.pages.length ? `<section class="fl-sec"><h3>手写的那些页</h3><div class="fl-pages">${g.pages.map((p, j) => `<button type="button" data-pg="${j}" style="--pr:${[-3, 2, -1.5, 2.8, -2][j % 5]}deg"><img src="${p.thumb}" alt="" loading="lazy"></button>`).join('')}</div></section>` : ''}
      ${g.es.length ? `<section class="fl-sec"><h3>每一天</h3><div class="fl-days">${g.es.map(e => `<button type="button" class="fl-day ${e.type}" data-id="${e.id}"><b>${fmtDay(e.date)}</b><span>${esc((e.title || e.text || e.verse || e.thanks || e.prayer || (e.pages || []).length && '📷 手写的日记' || '').slice(0, 70))}</span></button>`).join('')}</div></section>` : ''}
      ${g.places.length || g.wishesNew.length || g.wishesDone.length ? `<section class="fl-sec"><h3>地图上</h3><div class="moods-row">${g.places.map(c => `<span class="mood" style="--mc:#E4477E">🌸 去了${esc(c.city)}</span>`).join('')}${g.wishesNew.map(w => `<span class="mood" style="--mc:#6A5BD6">🌷 想去${esc(w.name)}</span>`).join('')}${g.wishesDone.map(w => `<span class="mood" style="--mc:#E0A126">✨ 实现了：${esc(w.name)}</span>`).join('')}</div></section>` : ''}
      `}
      ${past.length ? `<section class="fl-sec fl-past"><h3>⏳ 往年这个时候</h3>${past.slice(0, 6).map(e => `<button type="button" class="fl-day ${e.type}" data-id="${e.id}"><b>${fmtDay(e.date)}</b><span>${esc((e.title || e.text || e.verse || e.thanks || '📷 手写的日记').slice(0, 70))}</span></button>`).join('')}</section>` : ''}
      ${empty ? '' : '<div class="fl-poster"><button type="button" class="pill primary" data-flposter>🎨 把这段回顾做成海报</button></div>'}
      <p class="fl-bless">愿主继续保守你的每一天 🤍</p>`);
    const fp = flashBk.querySelector('[data-flposter]'); if (fp) fp.onclick = () => Poster.flash(r, g);
    flashBk.querySelectorAll('[data-k]').forEach(b => b.onclick = () => openFlash(b.dataset.k));
    flashBk.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { const n = new Date(flAnchor); flKind === 'week' ? n.setDate(n.getDate() + 7 * b.dataset.step) : n.setMonth(n.getMonth() + +b.dataset.step); openFlash(null, n); });
    flashBk.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => openLightbox(g.pages, +b.dataset.pg));
    flashBk.querySelectorAll('[data-id]').forEach(b => b.onclick = () => openDiaryEntry({ id: b.dataset.id }));
    const ai = flashBk.querySelector('[data-ai]'); if (ai) ai.onclick = () => summarize(r, g, ai);
  }
  function openOnThisDay() {
    const es = onThisDay(new Date()).sort((a, b) => b.date.localeCompare(a.date));
    openBook(flashBk, `<button class="glass round bk-back" type="button" data-close aria-label="回到日记本">‹</button>
      <header class="bk-hero fl-hero"><p class="bk-eyebrow">On this day</p><h1>往年的今天</h1><p class="bk-sub">${fmtDay(today()).split(' · ')[0]}，那些年你写下的</p></header>
      <div class="dy-list">${es.map(entryHTML).join('')}</div><p class="fl-bless">愿主继续保守你的每一天 🤍</p>`);
    wireDiaryBook(flashBk);
  }

  /* --- AI (only when an endpoint is set up in data.js) --- */
  const blobB64 = b => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(b); });
  async function aiCall(body) {
    const r = await fetch(AI.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('ai ' + r.status);
    return r.json();
  }
  async function transcribe(e, btn) {
    btn.disabled = true; btn.textContent = '✨ 正在认字……';
    try {
      const images = [];
      for (const id of e.pages || []) { const b = await Store.getBlob('f:' + id); if (b) images.push(await blobB64(b)); }
      const { text } = await aiCall({ task: 'transcribe', type: e.type, date: e.date, images });
      e.transcript = text || ''; await save(); openDiaryBook();
    } catch (err) { btn.disabled = false; btn.textContent = '没认出来，再试一次'; }
  }
  async function summarize(r, g, btn) {
    btn.disabled = true; btn.textContent = '✨ 正在读你的日记……';
    try {
      const entries = g.es.map(e => ({ date: e.date, type: DTYPE[e.type].zh, title: e.title, text: e.text || e.transcript || '', verse: e.verse, thanks: e.thanks, prayer: e.prayer,
        requests: (e.requests || []).map(x => x.t + (x.answered ? '（已蒙应允）' : '')), moods: (e.moods || []).map(k => moodOf(k)?.zh).filter(Boolean),
        handwritten_pages: (e.pages || []).length, handwritten_text: e.transcript || '' }));
      const { summary } = await aiCall({ task: 'flashback', period: `${r.title}（${r.label}）`, entries,
        answered: g.answered, places: g.places.map(c => c.city), wishes: g.wishesNew.map(w => w.name), wishes_done: g.wishesDone.map(w => w.name) });
      S.flashSums[r.key] = summary; await save(); openFlash(null, flAnchor);
    } catch (err) { btn.disabled = false; btn.textContent = '没总结出来，再试一次'; }
  }

  // a new week / month: the flashback greets her
  function greetFlashback() {
    if (!S.diary.length) return;
    const last = new Date(); last.setDate(last.getDate() - 7);
    const wk = rangeOf('week', last), mo = rangeOf('month', new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1));
    if (new Date().getDate() <= 7 && S.seenFlash.month !== mo.key && S.diary.some(e => inRange(e.date, mo))) return toast(`${mo.label}的回顾准备好了 ✨`, () => openFlash('month', mo.a));
    if (S.seenFlash.week !== wk.key && S.diary.some(e => inRange(e.date, wk))) toast('上一周的回顾准备好了 ✨', () => openFlash('week', wk.a));
  }
  setTimeout(() => { if (scene.hidden && $('#welcome').hidden && !document.body.classList.contains('journeying')) greetFlashback(); }, 2500);

  $('#openDiary').onclick = openDiaryBook;

  /* ---------- 云端备份: encrypted on this device, kept in Cloudflare R2, merged item by item ---------- */
  const Cloud = (() => {
    const chip = $('#cloudChip'), panel = $('#cloudPanel');
    const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const unb64u = str => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)), c => c.charCodeAt(0));
    const hex = buf => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
    let keyStr = null, aes = null, vault = null, busy = null, again = false, timer = 0;
    let status = { state: 'off', at: 0 };

    async function useKey(k) {
      const raw = unb64u(k); if (raw.length !== 32) throw new Error('bad key');
      aes = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
      vault = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('vault:' + k))).slice(0, 32);
      keyStr = k;
    }
    async function enc(buf) {
      const iv = crypto.getRandomValues(new Uint8Array(12)), ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, buf);
      const out = new Uint8Array(12 + ct.byteLength); out.set(iv); out.set(new Uint8Array(ct), 12); return out;
    }
    const dec = async buf => crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(buf, 0, 12) }, aes, new Uint8Array(buf, 12));
    const url = path => `${SERVER}/v/${vault}/${path}`;
    async function req(path, opts = {}) {
      const r = await fetch(url(path), { cache: 'no-store', ...opts });
      if (r.status === 404 && !opts.method) return null;   // nothing stored yet (only meaningful for reads)
      if (!r.ok) throw new Error('cloud ' + r.status);
      return r;
    }

    // union of two devices' data: newest version of each item wins; deletions win over older edits
    function merge(a, b) {
      const out = { ...a }, del = { ...(b.deleted || {}), ...(a.deleted || {}) };
      for (const [k, t] of Object.entries(b.deleted || {})) del[k] = Math.max(t, (a.deleted || {})[k] || 0);
      const time = it => it.updated || it.created || 0;
      for (const c of COLLS) {
        const m = new Map();
        for (const it of [...(b[c] || []), ...(a[c] || [])]) { const cur = m.get(it.id); if (!cur || time(it) >= time(cur)) m.set(it.id, it); }
        out[c] = [...m.values()].filter(it => !(del[c + ':' + it.id] >= time(it)));
        // keep the local order where possible
        const order = new Map((a[c] || []).map((it, i) => [it.id, i]));
        out[c].sort((x, y) => (order.get(x.id) ?? 1e9) - (order.get(y.id) ?? 1e9) || (x.created || 0) - (y.created || 0));
      }
      const fu = { ...(b.fieldUpdated || {}) };
      for (const [f, t] of Object.entries(a.fieldUpdated || {})) fu[f] = Math.max(t, fu[f] || 0);
      for (const f of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (COLLS.includes(f) || META.includes(f)) continue;
        out[f] = (b.fieldUpdated || {})[f] > (a.fieldUpdated || {})[f] || !(f in a) ? b[f] : a[f];
      }
      out.deleted = del; out.fieldUpdated = fu; out.updated = Math.max(a.updated || 0, b.updated || 0);
      return out;
    }
    const blobKeys = () => [...(S.photos || []).map(p => p.id), ...(S.diary || []).flatMap(e => e.pages || [])].flatMap(id => ['t:' + id, 'f:' + id]);
    const kvGet = async (k, d) => (await Store.get(k).catch(() => null)) ?? d;

    function setStatus(state, extra = {}) {
      status = { ...status, state, ...extra };
      if (!SERVER) return;
      chip.hidden = false;
      chip.className = 'cloud-chip ' + state;
      const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? '刚刚' : m < 60 ? `${m} 分钟前` : m < 1440 ? `${Math.round(m / 60)} 小时前` : `${Math.round(m / 1440)} 天前`; };
      $('#cloudText').textContent = { off: '还没连上云端备份', syncing: '正在备份……', ok: `已备份 · ${ago(status.at)}`, error: '暂时没连上，等一下会再试' }[state] || '';
      if (!panel.hidden) renderPanel();
    }

    async function sync() {
      if (!aes || !SERVER) return;
      if (busy) { again = true; return busy; }
      busy = (async () => {
        setStatus('syncing');
        try {
          // 1. pull and merge
          const r = await req('state');
          let changedHere = false;
          if (r) {
            const remote = JSON.parse(new TextDecoder().decode(await dec(await r.arrayBuffer())));
            const before = JSON.stringify(COLLS.map(c => S[c] || []));
            const merged = merge(S, remote);
            for (const k of Object.keys(S)) if (!(k in merged)) delete S[k];
            Object.assign(S, merged);
            changedHere = JSON.stringify(COLLS.map(c => S[c] || [])) !== before;
            if (changedHere) { trackNow(); await Store.set('state', S); }
          }
          // 2. photos and handwritten pages: upload what the cloud lacks, download what this device lacks
          const up = new Set(await kvGet('cloud:uploaded', []));
          let downloaded = 0;
          for (const k of blobKeys()) {
            const local = await Store.getBlob(k).catch(() => null);
            if (local && !up.has(k)) {
              await req('b/' + encodeURIComponent(k), { method: 'PUT', body: await enc(await local.arrayBuffer()) });
              up.add(k); await Store.set('cloud:uploaded', [...up]);
            } else if (!local) {
              const g = await req('b/' + encodeURIComponent(k));
              if (g) { await Store.putBlob(k, new Blob([await dec(await g.arrayBuffer())], { type: 'image/jpeg' })); up.add(k); downloaded++; }
            }
          }
          await Store.set('cloud:uploaded', [...up]);
          // 3. push this device's state if the cloud is behind
          const pushed = await kvGet('cloud:pushed', 0);
          if ((S.updated || 0) > pushed || !r) {
            const body = await enc(new TextEncoder().encode(JSON.stringify(S)));
            await req('state', { method: 'PUT', body, headers: { 'x-updated': String(S.updated || Date.now()) } });
            await Store.set('cloud:pushed', S.updated || Date.now());
          }
          await Store.set('cloud:last', Date.now());
          setStatus('ok', { at: Date.now() });
          if (changedHere || downloaded) await refreshFromCloud();
        } catch (err) {
          console.warn('backup failed: ' + (err && err.stack || err));
          setStatus('error');
        }
        busy = null;
        if (again) { again = false; schedule(1500); }
      })();
      return busy;
    }
    function schedule(ms = 4000) { if (!aes) return; clearTimeout(timer); timer = setTimeout(sync, ms); }

    // after pulling another device's changes: load new pictures and redraw
    async function refreshFromCloud() {
      for (const p of S.photos || []) if (!urls.has(p.id)) {
        const t = await Store.getBlob('t:' + p.id).catch(() => null), f = await Store.getBlob('f:' + p.id).catch(() => null);
        if (t) urls.set(p.id, { thumb: URL.createObjectURL(t), full: URL.createObjectURL(f || t) });
      }
      for (const e of S.diary || []) for (const id of e.pages || []) if (!pageUrls.has(id)) {
        const t = await Store.getBlob('t:' + id).catch(() => null), f = await Store.getBlob('f:' + id).catch(() => null);
        if (t) pageUrls.set(id, { thumb: URL.createObjectURL(t), full: URL.createObjectURL(f || t) });
      }
      if (map.loaded()) { buildIndex(); buildPins(); buildWishPins(); }
      updateStats();
      if (!diaryBk.hidden) openDiaryBook();
      if (!journalBk.hidden) openJournal();
      if (!wishBk.hidden) openWishlist();
    }

    /* the panel */
    async function renderPanel() {
      const body = $('#cpBody');
      if (!aes) {
        body.innerHTML = `<p class="cp-lead">这台设备还没有连上云端备份。</p><p class="cp-note">请让润润把“家庭链接”发给你，用这台手机打开一次就好。连上以后，写的日记、加的照片都会自动存到云端；换了手机也能找回来。</p>`;
        return;
      }
      const ago = status.at ? new Date(status.at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '还没有';
      const nPics = blobKeys().length / 2;
      body.innerHTML = `<div class="cp-state ${status.state}"><i></i><div><b>${{ ok: '都备份好了', syncing: '正在备份……', error: '暂时没连上', off: '还没备份' }[status.state]}</b><small>上一次备份：${ago}</small></div></div>
        <p class="cp-note">日记、祷告、回忆、心愿和 ${nPics} 张照片/手写的页，都加密存在云端，只有用家庭链接打开的设备才看得懂。每天还会留一份当天的样子。</p>
        <button type="button" class="pill primary cp-now" id="cpNow">现在备份一次</button>
        <details class="cp-more"><summary>给润润看的</summary>
          <p class="cp-note">家庭链接（用新手机打开它，就会把所有东西恢复回来。请好好保存，丢了就打不开备份了）：</p>
          <div class="cp-link"><input readonly id="cpLink" value="${esc(familyLink(keyStr))}"><button type="button" id="cpCopy">复制</button></div>
          <p class="cp-note">保险箱编号：<code>${vault}</code></p>
          <button type="button" class="pill ghost" id="cpSnaps">恢复到之前的某一天……</button>
          <div id="cpSnapList"></div>
        </details>`;
      $('#cpNow').onclick = () => sync();
      $('#cpCopy').onclick = async () => { try { await navigator.clipboard.writeText($('#cpLink').value); $('#cpCopy').textContent = '已复制'; } catch (e) { $('#cpLink').select(); } };
      $('#cpSnaps').onclick = async () => {
        const box = $('#cpSnapList'); box.innerHTML = '<p class="cp-note">正在找……</p>';
        try {
          const days = await (await req('snaps')).json();
          box.innerHTML = days.length ? `<div class="cp-snaps">${days.slice().reverse().map(d => `<button type="button" data-d="${d}">${d}</button>`).join('')}</div><p class="cp-note">点一天，会把日记本恢复成那一天的样子（现在的会先存一份）。</p>` : '<p class="cp-note">还没有快照。</p>';
          box.querySelectorAll('[data-d]').forEach(b => b.onclick = () => restoreDay(b.dataset.d, b));
        } catch (e) { box.innerHTML = '<p class="cp-note">没连上，等一下再试。</p>'; }
      };
    }
    async function restoreDay(day, btn) {
      if (!btn.dataset.sure) { btn.dataset.sure = 1; btn.textContent = `确定恢复到 ${day}？`; return; }
      try {
        await Store.set('state-before-restore', JSON.parse(JSON.stringify(S)));
        const r = await req('snap/' + day), old = JSON.parse(new TextDecoder().decode(await dec(await r.arrayBuffer())));
        for (const k of Object.keys(S)) delete S[k];
        Object.assign(S, old, { deleted: {}, updated: Date.now() });
        trackNow(); await Store.set('state', S); await Store.set('cloud:pushed', 0);
        await sync(); await refreshFromCloud();
        toast(`已经恢复到 ${day} 的样子`);
      } catch (e) { btn.textContent = '没恢复成功，再试一次'; }
    }
    const familyLink = k => `${(G.server && G.server.site) || location.origin + location.pathname}#k=${k}`;

    /* one-time setup: make a family key (only the daughter does this) */
    // making a key is deliberate: a page left open with #setup-backup must not quietly make new ones
    function setupPage() {
      panel.classList.add('on-top'); panel.hidden = false;
      $('#cpBody').innerHTML = `<p class="cp-lead">新的家庭备份？</p>
        <p class="cp-note">家庭备份已经设置好了的话，<b>不需要</b>再做一个——新的钥匙和小妈手里的家庭链接对不上。只有想从头换一把新钥匙的时候才点下面。</p>
        <div class="modal-actions"><button type="button" class="pill ghost" id="cpNo">不用了</button><button type="button" class="pill primary" id="cpMake">生成新的钥匙</button></div>`;
      $('#cpNo').onclick = () => { panel.hidden = true; panel.classList.remove('on-top'); };
      $('#cpMake').onclick = makeNewKey;
    }
    function makeNewKey() {
      const raw = crypto.getRandomValues(new Uint8Array(32)), k = b64u(raw);
      useKey(k).then(() => {
        panel.classList.add('on-top'); panel.hidden = false;   // above the gift / welcome screens
        $('#cpBody').innerHTML = `<p class="cp-lead">新的家庭备份</p>
          <ol class="cp-steps">
            <li>把这个保险箱编号加到 <code>worker/wrangler.toml</code> 的 <code>VAULTS</code>，然后重新部署：<div class="cp-link"><input readonly value="${vault}"><button type="button" data-copy="${vault}">复制</button></div></li>
            <li>把这个家庭链接发给小妈，让她用自己的手机打开一次：<div class="cp-link"><input readonly value="${esc(familyLink(k))}"><button type="button" data-copy="${esc(familyLink(k))}">复制</button></div></li>
            <li>这个链接就是钥匙：<b>请存一份在安全的地方</b>（比如自己的备忘录）。丢了的话，备份就打不开了。</li>
          </ol>`;
        $('#cpBody').querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = '已复制'; } catch (e) {} });
        aes = null; vault = null; keyStr = null;   // this device isn't linked unless it opens the link itself
      });
    }

    async function init() {
      if (!SERVER) return;
      const m = location.hash.match(/^#k=([\w-]{43})$/);
      if (location.hash === '#setup-backup') { history.replaceState(null, '', location.pathname); return setupPage(); }
      if (m) {   // opened the family link: remember the key on this device
        await Store.set('cloud:key', m[1]); try { localStorage.setItem('mom-map:cloud', m[1]); } catch (e) {}
        history.replaceState(null, '', location.pathname);
        toast('这台设备连上云端备份了 ☁️');
      }
      let k = await kvGet('cloud:key', null);
      if (!k) { try { k = localStorage.getItem('mom-map:cloud'); if (k) await Store.set('cloud:key', k); } catch (e) {} }
      if (!k) return setStatus('off');
      try { await useKey(k); } catch (e) { return setStatus('off'); }
      status.at = await kvGet('cloud:last', 0);
      setStatus(status.at ? 'ok' : 'syncing');
      onSaved = () => schedule();
      document.addEventListener('visibilitychange', () => sync());
      addEventListener('online', () => sync());
      setInterval(() => { if (document.visibilityState === 'visible') sync(); }, 5 * 60 * 1000);
      sync();
    }
    chip.onclick = () => { panel.hidden = false; renderPanel(); };
    $('#cpClose').onclick = () => { panel.hidden = true; };
    return { init, sync, merge };
  })();
  Cloud.init();

  /* ---------- the tab bar, the ＋ menu, settings ---------- */
  const BOOKS = { journal: journalBk, wish: wishBk, diary: diaryBk };
  const addMenu = $('#addMenu'), dockAdd = $('#dockAdd');
  function setTab(t) { document.querySelectorAll('#dock [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); }
  function closeBooks() { Object.values(BOOKS).forEach(b => { b.hidden = true; }); flashBk.hidden = true; if (!review.hidden) closeReview(); }
  const OPEN = { journal: openJournal, wish: openWishlist, diary: () => { openDiaryBook(); diaryVoice(); } };
  document.querySelectorAll('#dock [data-tab]').forEach(b => b.onclick = () => {
    toggleAdd(false); closeBooks(); setTab(b.dataset.tab);
    if (OPEN[b.dataset.tab]) OPEN[b.dataset.tab]();
  });
  // keep the highlighted tab honest when a book closes by its own back button
  new MutationObserver(() => {
    const open = Object.entries(BOOKS).find(([, el]) => !el.hidden);
    setTab(open ? open[0] : !flashBk.hidden ? 'diary' : 'map');
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  function toggleAdd(on = addMenu.hidden) {
    addMenu.hidden = !on; dockAdd.classList.toggle('on', on); dockAdd.setAttribute('aria-expanded', String(on));
  }
  dockAdd.onclick = () => toggleAdd();
  addMenu.addEventListener('click', e => { if (e.target.closest('button')) toggleAdd(false); });
  document.addEventListener('click', e => { if (!addMenu.hidden && !e.target.closest('#addMenu,#dockAdd')) toggleAdd(false); });
  $('#amDiary').onclick = () => openDiaryEntry({ type: 'journal' });
  $('#amPrayer').onclick = () => openDiaryEntry({ type: 'prayer' });
  $('#amPhoto').onclick = () => openDiaryEntry({ pick: true });

  S.prefs = S.prefs || {};
  const introMode = () => S.prefs.intro || 'gift';
  function setIntro(mode) {
    S.prefs = { ...S.prefs, intro: mode }; save();
    document.querySelectorAll('[data-intro]').forEach(b => b.classList.toggle('on', b.dataset.intro === mode));
    toast(mode === 'gift' ? '好，以后每次打开都拆一次礼物 🎁' : '好，以后打开时我会先跟你打个招呼 🌸');
  }
  const settings = $('#settings');
  $('#openSettings').onclick = () => {
    settings.querySelectorAll('[data-intro]').forEach(b => b.classList.toggle('on', b.dataset.intro === introMode()));
    $('#setCloudText').textContent = '☁️ ' + ($('#cloudText').textContent || '云端备份');
    settings.hidden = false;
  };
  $('#setClose').onclick = () => { settings.hidden = true; };
  settings.querySelectorAll('[data-intro]').forEach(b => b.onclick = () => setIntro(b.dataset.intro));
  const soundBtn = $('#setSound');
  const showSound = () => { const off = S.prefs.sound === false; soundBtn.classList.toggle('off', off); soundBtn.querySelector('span').textContent = off ? '🔇 音效关着' : '🔊 音效开着'; };
  soundBtn.onclick = () => { S.prefs = { ...S.prefs, sound: S.prefs.sound === false }; save(); showSound(); if (S.prefs.sound !== false) chime(); };
  showSound();
  settings.addEventListener('click', e => { if (e.target.closest('#giftAgain,#replay')) settings.hidden = true; });
  $('#setCloud').onclick = () => { settings.hidden = true; $('#cloudChip').click(); };

  /* ---------- 做成海报: pretty posters of her words, for 小红书 ---------- */
  document.addEventListener('pointerdown', () => Sound.ambient(true), { once: true, capture: true });

  /* ---------- 听一首歌: songs from YouTube ---------- */
  const songs = $('#songs');
  let ytPlayer = null, ytReady = null, curSong = null;
  function loadYT() {
    if (ytReady) return ytReady;
    return ytReady = new Promise(res => {
      window.onYouTubeIframeAPIReady = res;
      const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s);
    });
  }
  async function playSong(i) {
    const sg = (G.songs || [])[i]; if (!sg) return;
    curSong = i; renderSongs();
    await loadYT();
    if (!ytPlayer) {
      ytPlayer = new YT.Player('sgFrame', { videoId: sg.yt, host: 'https://www.youtube-nocookie.com', playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 },
        events: { onStateChange: e => Sound.song(e.data === 1 || e.data === 3) } });
    } else ytPlayer.loadVideoById(sg.yt);
  }
  function renderSongs() {
    $('#sgList').innerHTML = (G.songs || []).map((sg, i) => `<button type="button" class="sg-item${i === curSong ? ' on' : ''}" data-i="${i}">
      <b>${esc(sg.title)}</b><small>${esc(sg.artist || '')}</small>${sg.note ? `<p>${esc(sg.note)}</p>` : ''}</button>`).join('');
    $('#sgList').querySelectorAll('[data-i]').forEach(b => b.onclick = () => playSong(+b.dataset.i));
  }
  function openSongs() { renderSongs(); songs.hidden = false; if (curSong == null && (G.songs || []).length) playSong(0); }
  function closeSongs() { songs.hidden = true; try { ytPlayer && ytPlayer.pauseVideo(); } catch (e) {} Sound.song(false); }
  $('#sgClose').onclick = closeSongs;
  $('#setSong').onclick = () => { $('#settings').hidden = true; openSongs(); };
  $('#wlSong').onclick = () => enterApp(openSongs);
  const ambBtn = $('#setAmbient');
  const showAmb = () => { const off = S.prefs.ambient === false; ambBtn.classList.toggle('off', off); ambBtn.querySelector('span').textContent = off ? '🎶 背景音乐关着' : '🎶 背景音乐开着'; };
  ambBtn.onclick = () => { S.prefs = { ...S.prefs, ambient: S.prefs.ambient === false }; save(); showAmb(); Sound.ambient(S.prefs.ambient !== false); };
  showAmb();

  const Poster = (() => {
    const modal = $('#poster'), cv = $('#pCanvas'), ctx = cv.getContext('2d');
    const SIZES = { '3:4': [1080, 1440], '1:1': [1080, 1080], '9:16': [1080, 1920] };
    const STYLES = [['garden', '🌸 花园'], ['paper', '📝 信纸'], ['verse', '✨ 经文'], ['photo', '📷 照片'], ['night', '🌙 夜晚']];
    const SHOW = [['date', '日期'], ['place', '地点'], ['moods', '心情'], ['photo', '照片'], ['verse', '经文']];
    const F = { serif: '"Noto Serif SC","Songti SC","STSong",serif', hand: '"Ma Shan Zheng","Kaiti SC","STKaiti",cursive', sans: '-apple-system,"PingFang SC","Hiragino Sans GB","Noto Sans SC",sans-serif', en: '"Cormorant Garamond",Georgia,serif' };
    const NO_START = '，。、；：！？）」』》〉”’…—,.;:!?)]}%·';
    const NO_END = '（「『《〈“‘([{';
    let P = null, img = null, sprig = null, raf = 0;

    const loadImg = src => new Promise(res => {
      if (!src) return res(null);
      const im = new Image();
      if (/^https?:/.test(src) && !src.startsWith(location.origin)) im.crossOrigin = 'anonymous';
      im.onload = () => res(im); im.onerror = () => res(null); im.src = src;
    });
    (async () => {   // the vine from the stylesheet
      const m = getComputedStyle(document.documentElement).getPropertyValue('--fl-sprig').match(/url\("?(.*?)"?\)$/s);
      if (m) sprig = await loadImg(m[1].replace(/\\"/g, '"'));
    })();

    // Chinese-aware wrapping: words stay whole, no line starts with ， or 。
    function wrap(text, maxW) {
      const out = [];
      for (const para of String(text || '').split('\n')) {
        if (!para.trim()) { out.push(''); continue; }
        const toks = para.match(/[A-Za-z0-9'’@#._-]+|\s+|./gsu) || [];
        let line = '';
        for (const t of toks) {
          const test = line + t;
          if (ctx.measureText(test).width <= maxW || !line || (NO_START.includes(t[0]) && t.length === 1)) { line = test; continue; }
          let carry = '';
          if (NO_END.includes(line.slice(-1))) { carry = line.slice(-1); line = line.slice(0, -1); }
          out.push(line.trimEnd()); line = (carry + t).trimStart();
        }
        if (line) out.push(line);
      }
      while (out.length && out[out.length - 1] === '') out.pop();
      return out;
    }
    // biggest font size that fits the box; trims with …… if nothing fits
    function fit(text, family, weight, maxW, maxH, big, small, lh) {
      for (let s = big; s >= small; s -= 2) {
        ctx.font = `${weight} ${s}px ${family}`;
        const lines = wrap(text, maxW);
        if (lines.length * s * lh <= maxH) return { size: s, lines, lh: s * lh, cut: false, font: ctx.font };
      }
      ctx.font = `${weight} ${small}px ${family}`;
      let lines = wrap(text, maxW); const n = Math.max(1, Math.floor(maxH / (small * lh)));
      const cut = lines.length > n;
      if (cut) { lines = lines.slice(0, n); lines[n - 1] = lines[n - 1].replace(/.{0,2}$/u, '') + '……'; }
      return { size: small, lines, lh: small * lh, cut, font: ctx.font };
    }
    function drawLines(f, x, y, color, align = 'left') {
      ctx.font = f.font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
      f.lines.forEach((l, i) => ctx.fillText(l, x, y + f.size + i * f.lh - (f.lh - f.size) / 2 + f.size * .1));
      return y + f.lines.length * f.lh;
    }
    function flower(x, y, r, color, rot = 0, alpha = 1) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(r / 32, r / 32); ctx.globalAlpha = alpha;
      const petal = new Path2D('M0 0C7-3 17-13 11-25C7-32-3-31-6-25C-9-18-5-8 0 0Z');
      for (let i = 0; i < 5; i++) { ctx.fillStyle = color; ctx.fill(petal); ctx.strokeStyle = 'rgba(120,20,60,.18)'; ctx.lineWidth = .8; ctx.stroke(petal); ctx.rotate(Math.PI * 2 / 5); }
      ctx.fillStyle = '#FFC56B'; ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, 7); ctx.fill();
      ctx.fillStyle = '#FFF3C4'; ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, 7); ctx.fill();
      ctx.restore();
    }
    function vine(x, y, w, rot = 0, flipY = false) {
      if (!sprig) return;
      const h = w * 64 / 130;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); if (flipY) ctx.scale(1, -1);
      ctx.drawImage(sprig, -w / 2, -h / 2, w, h); ctx.restore();
    }
    function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
    function cover(im, x, y, w, h) {
      const k = Math.max(w / im.width, h / im.height), sw = w / k, sh = h / k;
      ctx.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, x, y, w, h);
    }
    function polaroid(im, cx, y, w, h, rot) {
      ctx.save(); ctx.translate(cx, y + h / 2); ctx.rotate(rot);
      ctx.shadowColor = 'rgba(70,40,30,.28)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 14;
      ctx.fillStyle = '#fff'; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.shadowColor = 'transparent';
      const pad = w * .045; cover(im, -w / 2 + pad, -h / 2 + pad, w - pad * 2, h - pad * 3.2);
      ctx.restore();
    }
    function tape(cx, cy, w, rot, c1, c2) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.globalAlpha = .85;
      for (let x = -w / 2; x < w / 2; x += 16) { ctx.fillStyle = Math.round((x + w / 2) / 16) % 2 ? c1 : c2; ctx.fillRect(x, -22, Math.min(16, w / 2 - x), 44); }
      ctx.restore();
    }
    function moodPills(moods, x, y, maxW, dark) {
      ctx.font = `500 30px ${F.sans}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      let cx = x;
      for (const m of moods) {
        const label = `${m.e} ${m.zh}`, w = ctx.measureText(label).width + 44;
        if (cx + w > x + maxW) break;
        ctx.fillStyle = dark ? 'rgba(255,255,255,.12)' : m.c + '24'; rrect(cx, y, w, 58, 29); ctx.fill();
        ctx.fillStyle = dark ? '#FFF6EC' : '#4A4360'; ctx.fillText(label, cx + 22, y + 30); cx += w + 14;
      }
    }
    const meta = d => [P.show.date && d.date, P.show.place && d.place].filter(Boolean).join('  ·  ');
    const verseOn = d => P.show.verse && d.verse;

    /* the five looks */
    const DRAW = {
      garden(W, H, d) {
        const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#FFF1EE'); g.addColorStop(.45, '#FFF9F3'); g.addColorStop(1, '#FCE4EC'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        const glow = ctx.createRadialGradient(W * .5, H * .1, 0, W * .5, H * .1, W * .7); glow.addColorStop(0, 'rgba(255,214,150,.45)'); glow.addColorStop(1, 'rgba(255,214,150,0)'); ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
        vine(W - 250, 120, 560, Math.PI, true); vine(200, H - 34, 420, 0, true);
        const M = 100; let y = 250;
        const mt = meta(d);
        if (mt) { flower(M + 18, y + 18, 20, '#F27BAA'); ctx.font = `500 32px ${F.sans}`; ctx.fillStyle = '#E4477E'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(mt, M + 52, y + 19); y += 76; }
        if (d.title) { y = drawLines(fit(d.title, F.hand, 400, W - M * 2, 260, 96, 60, 1.25), M, y, '#2A2342') + 26; }
        const foot = (P.show.moods && d.moods.length ? 90 : 0) + (d.sign ? 110 : 40) + 60;
        if (img && P.show.photo) { const ph = Math.min(H * .32, (H - y - foot) * .55), pw = ph * 1.18; polaroid(img, W / 2, y + 10, pw, ph, -.035); y += ph + 50; }
        if (verseOn(d)) { const f = fit(d.verse, F.serif, 500, W - M * 2 - 40, 220, 38, 30, 1.75); ctx.fillStyle = 'rgba(242,192,79,.9)'; ctx.fillRect(M, y + 4, 6, f.lines.length * f.lh + (d.ref ? 44 : 0)); y = drawLines(f, M + 34, y, '#6B5320'); if (d.ref) { ctx.font = `400 28px ${F.sans}`; ctx.fillStyle = '#B97E14'; ctx.textBaseline = 'alphabetic'; ctx.fillText('— ' + d.ref, M + 34, y + 34); y += 50; } y += 30; }
        const t = fit(d.text, F.serif, 400, W - M * 2, H - y - foot, 46, 30, 1.9); drawLines(t, M, y, '#3E3651');
        if (P.show.moods && d.moods.length) moodPills(d.moods, M, H - foot + 20, W - M * 2);
        if (d.sign) { ctx.font = `400 58px ${F.hand}`; ctx.fillStyle = '#E4477E'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.fillText('— ' + d.sign, W - M, H - 90); }
        return t.cut;
      },
      paper(W, H, d) {
        ctx.fillStyle = '#FFFDF7'; ctx.fillRect(0, 0, W, H);
        const M = 150, top = 300, foot = (d.sign ? 150 : 90);
        let t = fit(d.text, F.hand, 400, W - M - 90, H - top - foot - (img && P.show.photo ? H * .3 : 0) - (d.title ? 110 : 0) - (verseOn(d) ? 160 : 0), 54, 34, 1.75);
        const LH = t.lh;
        ctx.strokeStyle = 'rgba(79,99,216,.16)'; ctx.lineWidth = 2;
        for (let ly = top + LH; ly < H - 60; ly += LH) { ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(W, ly); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(228,71,126,.35)'; ctx.beginPath(); ctx.moveTo(M - 34, 0); ctx.lineTo(M - 34, H); ctx.stroke();
        tape(W / 2, 110, 300, -.04, '#F9B8D0', '#FFE3EE');
        let y = 170;
        const mt = meta(d); if (mt) { ctx.font = `400 34px ${F.hand}`; ctx.fillStyle = '#E4477E'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(mt, M, y + 40); }
        y = top;
        if (img && P.show.photo) { const ph = H * .27, pw = ph * 1.15; polaroid(img, W - 90 - pw / 2 + 20, y - 30, pw, ph, .045); y += ph + 10; }
        if (d.title) { ctx.font = `400 70px ${F.hand}`; ctx.fillStyle = '#2A2342'; ctx.textAlign = 'left'; ctx.fillText(d.title.slice(0, 16), M, y + LH * .8); y += Math.ceil(110 / LH) * LH; }
        if (verseOn(d)) { const f = fit(d.verse + (d.ref ? '  — ' + d.ref : ''), F.hand, 400, W - M - 90, LH * 3, 40, 30, LH / 40); f.lh = LH; y = drawLines(f, M, y, '#B97E14') ; y = top + Math.ceil((y - top) / LH) * LH; }
        y = drawLines(t, M, y, '#2B3A55');
        if (d.sign) { ctx.font = `400 60px ${F.hand}`; ctx.fillStyle = '#E4477E'; ctx.textAlign = 'right'; ctx.fillText('— ' + d.sign, W - 90, H - 80); }
        flower(W - 120, H - 190, 34, '#F27BAA', .3, .9);
        return t.cut;
      },
      verse(W, H, d) {
        const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#FFE6C7'); g.addColorStop(.5, '#FFF4E6'); g.addColorStop(1, '#FFFAF3'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        const sun = ctx.createRadialGradient(W / 2, H * .16, 0, W / 2, H * .16, W * .55); sun.addColorStop(0, 'rgba(255,205,120,.7)'); sun.addColorStop(1, 'rgba(255,205,120,0)'); ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(217,154,30,.35)'; ctx.lineWidth = 2;
        for (let i = 0; i < 14; i++) { const a = Math.PI + (i + .5) * Math.PI / 14; ctx.beginPath(); ctx.moveTo(W / 2 + Math.cos(a) * 90, H * .16 + Math.sin(a) * 90); ctx.lineTo(W / 2 + Math.cos(a) * 170, H * .16 + Math.sin(a) * 170); ctx.stroke(); }
        flower(W / 2, H * .16, 46, '#F27BAA');
        const M = 120; let y = H * .16 + 120;
        const mt = meta(d); if (mt) { ctx.font = `500 30px ${F.sans}`; ctx.fillStyle = '#B97E14'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(mt, W / 2, y); y += 60; }
        if (d.title) { y = drawLines(fit(d.title, F.hand, 400, W - M * 2, 200, 80, 54, 1.25), W / 2, y, '#2A2342', 'center') + 30; }
        const foot = d.sign ? 190 : 110;
        if (verseOn(d)) {
          const vf = fit('“' + d.verse + '”', F.serif, 600, W - M * 2, (H - y - foot) * (d.text ? .4 : .85), 54, 34, 1.65);
          y = drawLines(vf, W / 2, y, '#5A4110', 'center');
          if (d.ref) { ctx.font = `400 32px ${F.sans}`; ctx.fillStyle = '#B97E14'; ctx.textAlign = 'center'; ctx.fillText('— ' + d.ref + ' —', W / 2, y + 44); y += 70; }
          ctx.strokeStyle = 'rgba(217,154,30,.45)'; ctx.beginPath(); ctx.moveTo(W / 2 - 60, y + 20); ctx.lineTo(W / 2 + 60, y + 20); ctx.stroke(); y += 60;
        }
        const t = fit(d.text, F.serif, 400, W - M * 2, H - y - foot, verseOn(d) ? 40 : 54, 26, 1.8);
        drawLines(t, W / 2, y, '#3E3651', 'center');
        if (d.sign) { ctx.font = `400 56px ${F.hand}`; ctx.fillStyle = '#C98A17'; ctx.textAlign = 'center'; ctx.fillText('— ' + d.sign, W / 2, H - 100); }
        return t.cut;
      },
      photo(W, H, d) {
        ctx.fillStyle = '#FFF9F3'; ctx.fillRect(0, 0, W, H);
        const ph = H * .56;
        if (img && P.show.photo) cover(img, 0, 0, W, ph + 60);
        else { const g = ctx.createLinearGradient(0, 0, W, ph); g.addColorStop(0, '#FFD3E3'); g.addColorStop(1, '#FFE9D2'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, ph + 60); for (let i = 0; i < 9; i++) flower(120 + (i * 137) % (W - 200), 120 + (i * 211) % (ph - 200), 40 + (i % 3) * 18, ['#F27BAA', '#D9304A', '#FFF0F4'][i % 3], i, .9); }
        ctx.shadowColor = 'rgba(70,40,30,.18)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = -10;
        ctx.fillStyle = '#FFF9F3'; rrect(0, ph, W, H - ph + 60, 56); ctx.fill(); ctx.shadowColor = 'transparent';
        flower(W - 150, ph + 6, 52, '#F27BAA', .4); flower(W - 92, ph + 50, 30, '#D9304A', 1.1);
        const M = 90; let y = ph + 70;
        const mt = meta(d); if (mt) { ctx.font = `500 30px ${F.sans}`; ctx.fillStyle = '#E4477E'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(mt, M, y + 20); y += 54; }
        if (d.title) y = drawLines(fit(d.title, F.hand, 400, W - M * 2 - 120, 180, 78, 52, 1.2), M, y, '#2A2342') + 18;
        const foot = (P.show.moods && d.moods.length ? 90 : 0) + (d.sign ? 100 : 40) + 40;
        const t = fit((verseOn(d) ? d.verse + (d.ref ? '（' + d.ref + '）' : '') + '\n' : '') + d.text, F.serif, 400, W - M * 2, H - y - foot, 42, 28, 1.85);
        drawLines(t, M, y, '#3E3651');
        if (P.show.moods && d.moods.length) moodPills(d.moods, M, H - foot + 10, W - M * 2);
        if (d.sign) { ctx.font = `400 54px ${F.hand}`; ctx.fillStyle = '#E4477E'; ctx.textAlign = 'right'; ctx.fillText('— ' + d.sign, W - M, H - 70); }
        return t.cut;
      },
      night(W, H, d) {
        const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1C1835'); g.addColorStop(.55, '#2E2654'); g.addColorStop(1, '#55427F'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
        for (let i = 0; i < 90; i++) { ctx.fillStyle = `rgba(255,255,255,${.3 + rnd() * .7})`; ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H * .7, rnd() * 2.6 + .6, 0, 7); ctx.fill(); }
        ctx.fillStyle = '#FFF2D6'; ctx.beginPath(); ctx.arc(W - 200, 200, 70, 0, 7); ctx.fill(); ctx.fillStyle = '#1F1A3A'; ctx.beginPath(); ctx.arc(W - 170, 180, 66, 0, 7); ctx.fill();
        const M = 110; let y = 380;
        const mt = meta(d); if (mt) { ctx.font = `500 30px ${F.sans}`; ctx.fillStyle = '#CFC6E6'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(mt, M, y); y += 50; }
        if (d.title) y = drawLines(fit(d.title, F.hand, 400, W - M * 2, 220, 92, 60, 1.25), M, y, '#F7A8C6') + 26;
        const foot = (P.show.moods && d.moods.length ? 90 : 0) + (d.sign ? 120 : 50) + 40;
        if (img && P.show.photo) { const ph = Math.min(H * .28, (H - y - foot) * .5), pw = ph * 1.18; polaroid(img, W / 2, y + 10, pw, ph, .03); y += ph + 50; }
        if (verseOn(d)) { const f = fit(d.verse + (d.ref ? '  — ' + d.ref : ''), F.serif, 500, W - M * 2, 200, 36, 28, 1.75); y = drawLines(f, M, y, '#FFE7A8') + 30; }
        const t = fit(d.text, F.serif, 400, W - M * 2, H - y - foot, 46, 30, 1.9); drawLines(t, M, y, '#FFF6EC');
        if (P.show.moods && d.moods.length) moodPills(d.moods, M, H - foot + 16, W - M * 2, true);
        if (d.sign) { ctx.font = `400 58px ${F.hand}`; ctx.fillStyle = '#F7A8C6'; ctx.textAlign = 'right'; ctx.fillText('— ' + d.sign, W - M, H - 90); }
        flower(W - 330, 250, 34, '#F27BAA', .2, .9); flower(W - 280, 300, 20, '#FFF0F4', 1, .85);
        return t.cut;
      }
    };

    function data() {
      return { title: $('#pTitle').value.trim(), text: $('#pText').value.trim(), sign: $('#pSign').value.trim(),
        date: !P.src.date ? '' : /^\d{4}$/.test(P.src.date) ? P.src.date + '年' : fmtDay(P.src.date),
        place: P.src.place || '', moods: (P.src.moods || []).map(moodOf).filter(Boolean), verse: P.src.verse || '', ref: P.src.ref || '' };
    }
    function draw() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const [W, H] = SIZES[P.size]; cv.width = W; cv.height = H;
        ctx.clearRect(0, 0, W, H);
        let cut = false;
        try { cut = DRAW[P.style](W, H, data()); } catch (e) { console.warn(e); }
        $('#pTip').textContent = cut ? '字有点多，放不下的用“……”省略了。删短一点，或者换成 9:16 会更好看。' : '';
        $('#pCount').textContent = `${[...$('#pText').value].length} 字`;
      });
    }
    function chips(box, list, isOn, onTap) {
      box.innerHTML = list.map(([k, zh]) => `<button type="button" data-k="${k}" class="${isOn(k) ? 'on' : ''}">${zh}</button>`).join('');
      box.querySelectorAll('button').forEach(b => b.onclick = () => { onTap(b.dataset.k); box.querySelectorAll('button').forEach(x => x.classList.toggle('on', isOn(x.dataset.k))); draw(); });
    }
    async function open(src) {
      P = { src, style: src.style || 'garden', size: '3:4', show: { date: true, place: true, moods: true, photo: true, verse: true } };
      $('#pTitle').value = src.title || ''; $('#pText').value = src.text || ''; $('#pSign').value = (S.prefs && S.prefs.posterSign) || '';
      chips($('#pStyles'), STYLES, k => P.style === k, k => { P.style = k; });
      chips($('#pSizes'), [['3:4', '3:4 小红书'], ['1:1', '1:1 方形'], ['9:16', '9:16 竖屏']], k => P.size === k, k => { P.size = k; });
      chips($('#pShow'), SHOW.filter(([k]) => k !== 'photo' || src.photo).filter(([k]) => k !== 'verse' || src.verse).filter(([k]) => k !== 'moods' || (src.moods || []).length).filter(([k]) => k !== 'place' || src.place).filter(([k]) => k !== 'date' || src.date), k => P.show[k], k => { P.show[k] = !P.show[k]; });
      modal.hidden = false;
      img = await loadImg(src.photo);
      draw();
      const sample = [src.title, src.text, $('#pSign').value, '日记祷告感恩小妈—'].join('');
      try { await Promise.all([`400 60px ${F.hand}`, `400 40px ${F.serif}`, `600 40px ${F.serif}`, `500 30px ${F.sans}`].map(f => document.fonts.load(f, sample))); } catch (e) {}
      draw();
    }
    ['#pTitle', '#pText', '#pSign'].forEach(id => $(id).addEventListener('input', draw));
    $('#pSign').addEventListener('change', () => { S.prefs = { ...S.prefs, posterSign: $('#pSign').value.trim() }; save(); });
    $('#pClose').onclick = () => { modal.hidden = true; };

    const TAGS = { prayer: '#祷告日记 #感恩 #每日灵修 #经文', journal: '#日记 #生活记录 #感恩每一天', place: '#旅行日记 #回忆 #生活记录', wish: '#心愿清单 #想去的地方 #旅行', flash: '#每周回顾 #生活记录 #感恩', free: '#日记 #生活记录' };
    $('#pCopy').onclick = async () => {
      const d = data(), txt = [d.title, d.verse && `“${d.verse}”${d.ref ? '（' + d.ref + '）' : ''}`, d.text, TAGS[P.src.kind] || TAGS.free].filter(Boolean).join('\n\n');
      try { await navigator.clipboard.writeText(txt); toast('文字复制好了，可以贴到小红书 ✓'); } catch (e) { toast('没复制成功，可以长按文字自己复制'); }
    };
    $('#pSave').onclick = async () => {
      let blob;
      try { blob = await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('blob')), 'image/png')); }
      catch (e) { img = null; draw(); toast('网上的那张照片放不进海报，已经去掉了，再点一次保存'); return; }
      const name = `小妈的${P.src.kind === 'prayer' ? '祷告' : '日记'}-${(P.src.date || today()).replace(/[^\d]/g, '')}.png`;
      const file = new File([blob], name, { type: 'image/png' });
      // phones: the share sheet (存储图像 / 小红书); computers: just download it
      if (matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
      }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('海报存好了 ✓');
    };

    /* from the things she wrote */
    const splitVerse = v => { const m = String(v || '').match(/^\s*([一-龥]{1,8}\s*\d+[:：]\d+(?:\s*[-–~]\s*\d+)?)\s*(.*)$/s); return m && m[2] ? { verse: m[2].trim(), ref: m[1].replace(/\s+/g, ' ') } : { verse: String(v || '').trim(), ref: '' }; };
    return {
      open,
      diary(e) {
        const pg = (e.pages || []).map(id => pageUrls.get(id)).filter(Boolean)[0];
        const prayer = e.type === 'prayer';
        // prayer requests stay private unless she types them in herself
        const text = prayer ? [e.thanks, e.prayer].filter(Boolean).join('\n\n') : (e.text || e.transcript || '');
        open({ kind: prayer ? 'prayer' : 'journal', title: e.title || (prayer ? '祷告日记' : ''), text, date: e.date, moods: e.moods, ...splitVerse(e.verse), photo: pg && pg.full, style: prayer ? 'verse' : pg ? 'photo' : 'garden' });
      },
      place(c) {
        const ph = photosOf(c.id)[0];
        open({ kind: 'place', title: c.city, text: c.text || '', date: c.year ? String(c.year) : '', place: c.region || '', moods: c.moods, photo: ph && ph.full, style: ph ? 'photo' : 'garden' });
      },
      wish(w) {
        const todo = (w.todo || []).map(k => TODO.find(t => t.k === k)).filter(Boolean).map(t => t.zh), who = (w.with || []).map(k => WITH.find(t => t.k === k)).filter(Boolean).map(t => t.zh);
        open({ kind: 'wish', title: '想去' + w.name, text: [todo.length && '想在那里' + todo.join('、') + '。', who.length && '想' + who.join('、') + '一起去。', w.text].filter(Boolean).join('\n'), place: w.en && w.en !== w.name ? w.en : '', photo: w.photos[0] && (w.photos[0].full || w.photos[0].src), style: 'photo' });
      },
      flash(r, g) {
        const sum = S.flashSums[r.key];
        const text = sum || [`这${r.title === '这一周' ? '一周' : '个月'}，写了 ${g.journals.length} 篇日记、${g.prayers.length} 次祷告。`, g.answered.length && '感谢主，这些祷告蒙应允了：\n' + g.answered.map(t => '✨ ' + t).join('\n'), g.places.length && '去了' + g.places.map(c => c.city).join('、') + '。'].filter(Boolean).join('\n\n');
        const v = g.verses[0] ? splitVerse(g.verses[0].v) : {};
        const tally = new Map(); g.moods.forEach(k => tally.set(k, (tally.get(k) || 0) + 1));
        open({ kind: 'flash', title: r.title + ' · ' + r.label, text, moods: [...tally].sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0]), ...v, photo: g.pages[0] && g.pages[0].full, style: v.verse ? 'verse' : 'garden' });
      },
      moment(m) { open({ kind: 'journal', title: '', text: m.text, date: m.date, place: placeById(m.place)?.city || '', photo: m.photos && m.photos[0] ? `photos/web/${m.photos[0]}.jpg` : '', style: 'garden' }); },
      blank() { open({ kind: 'free', title: '', text: '', date: today(), style: 'garden' }); }
    };
  })();
  $('#amPoster').onclick = () => Poster.blank();

  function startPick(text, onPick, onCancel) {
    closeSheet();
    picking = { onPick, onCancel };
    document.body.classList.add('picking');
    $('#pickText').textContent = text;
    $('#pickBanner').hidden = false;
  }
  function stopPick(cancelled) {
    const p = picking; picking = null; document.body.classList.remove('picking'); $('#pickBanner').hidden = true;
    if (cancelled && p && p.onCancel) p.onCancel();
  }
  $('#pickCancel').onclick = () => stopPick(true);
  map.on('click', e => {
    if (!picking) return;
    const { onPick } = picking; stopPick();
    const ll = e.lngLat.wrap(); onPick([ll.lng, ll.lat]);
  });

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
  const lbFig = lb.querySelector('figure');
  let lbX = 0, lbY = 0, stopLb = () => {};
  const placeLb = (x, y) => { lbX = x; lbY = y; lbFig.style.transform = `translate(${x}px,${y}px) scale(${1 - Math.min(.25, Math.max(0, y) / 1600)})`; lb.style.backgroundColor = `rgba(12,12,12,${0.94 * (1 - Math.min(.7, Math.max(0, y) / 500))})`; };
  const settleLb = () => { lbFig.style.transform = ''; lb.style.backgroundColor = ''; lbX = lbY = 0; };
  dragTracker(lb, {
    axis: 'any',
    start: e => !e.target.closest('button'),
    move: (dx, dy) => {
      stopLb();
      const sideways = Math.abs(dx) > Math.abs(dy);
      const edge = (dx > 0 && lbI === 0) || (dx < 0 && lbI === lbList.length - 1);
      placeLb(sideways ? (edge ? rubberband(dx, innerWidth) : dx) : 0, sideways ? 0 : (dy < 0 ? rubberband(dy, innerHeight) : dy));
    },
    end: (dx, dy, vx, vy) => {
      const w = innerWidth;
      if (lbY > 0 && lbY + project(vy) > 220) { lb.hidden = true; settleLb(); return; }
      const goX = lbX + project(vx);
      const dir = goX < -w * 0.3 && lbI < lbList.length - 1 ? 1 : goX > w * 0.3 && lbI > 0 ? -1 : 0;
      if (dir) {   // slide out the way she flicked, the next one slides in from the other side
        stopLb = spring(lbX, -dir * w, vx, { response: 0.28 }, x => placeLb(x, 0), () => {
          lbStep(dir); placeLb(dir * w * 0.6, 0);
          stopLb = spring(dir * w * 0.6, 0, 0, { response: 0.3 }, x => placeLb(x, 0), settleLb);
        });
      } else {
        const fx = lbX, fy = lbY;
        stopLb = spring(1, 0, 0, { response: 0.3, damping: 0.85 }, t => placeLb(fx * t, fy * t), settleLb);
      }
    }
  });
  addEventListener('keydown', e => {
    if (!lb.hidden) { if (e.key === 'Escape') lb.hidden = true; if (e.key === 'ArrowRight') lbStep(1); if (e.key === 'ArrowLeft') lbStep(-1); return; }
    if (e.key === 'Escape') { if (!composer.hidden) composer.hidden = true; else if (!dModal.hidden) closeDiaryEntry(); else if (!entry.hidden) closeEntry(); else if (!wish.hidden) closeWish(); else if (!flashBk.hidden) flashBk.hidden = true; else if (!diaryBk.hidden) diaryBk.hidden = true; else if (picking) stopPick(true); else if (selectedPlace) closeSheet(); }
  });

  /* ---------- review ---------- */
  const review = $('#review');
  let rvMap = null;
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
          ${p.text || (p.moods && p.moods.length) ? `<div class="reflect">${p.moods && p.moods.length ? `<div class="moods-row">${moodChips(p.moods)}</div>` : ''}${p.text ? `<p>${esc(p.text)}</p>` : ''}</div>` : ''}
          ${cards.map(c => postcardHTML(c, p, false)).join('')}
          ${!cards.length && p.note ? `<div class="note"><span class="lbl">我记得</span><p>${esc(p.note)}</p></div>` : ''}
          ${!cards.length && !p.note && !p.text ? `<p class="ch-none">这里的故事，还可以再写。</p>` : ''}
        </article>`;
      }).join('')}
      ${(S.wishes || []).some(w => !w.done) ? `<section class="rv-wishes"><p class="eyebrow">WHERE TO NEXT</p><h2>接下来，想去的地方</h2>${S.wishes.filter(w => !w.done).map(wishHTML).join('')}</section>` : ''}
      <div class="rv-letter">
        <p class="mom">Mom,</p>
        ${G.letter.map(l => `<p>${l}</p>`).join('')}
        <p class="hb">Happy Birthday, Mom.<small>The map isn't finished yet.</small></p>
        <p class="rv-sign">— 润润</p>
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
      try { paperStyle(rvMap); } catch (e) {}
      rvMap.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: line } } });
      rvMap.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#E4477E', 'line-width': 2.5, 'line-dasharray': [1, 2] }, layout: { 'line-cap': 'round' } });
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

  /* ---------- journey: the map opens at the beginning and walks through her life ---------- */
  const J = (G.journey || []).filter(m => placeById(m.place));
  const jy = $('#journey'), jyBody = $('#jyBody');
  const easeIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  let jI = -1, jActive = false, jYear = null, jYearRaf = 0, jTrailRaf = 0, jHead = null, jBusy = false;
  const jSpots = new Map();
  let jPath = [], jSeg = []; // jPath: whole route, unwrapped; jSeg[i] = [start, end] indexes of the leg into moment i
  const legMode = i => { const d = legKm(i); return J[i].by || (d < 80 ? 'local' : d > 1500 ? 'plane' : 'train'); };

  function buildJourneyPath() {
    jPath = []; jSeg = [];
    J.forEach((m, i) => {
      const c = spotCoord(m);
      if (!i) { jPath.push(c.slice()); jSeg[0] = [0, 0]; return; }
      const last = jPath[jPath.length - 1];
      const prev = spotCoord(J[i - 1]);
      if (km(prev, c) < 0.02) { jSeg[i] = [jPath.length - 1, jPath.length - 1]; return; }
      let leg = greatCircle(prev, c, km(prev, c) > 300 ? 140 : 40).slice(1);
      leg = unwrap([last, ...leg]).slice(1);
      jSeg[i] = [jPath.length - 1, jPath.length - 1 + leg.length];
      jPath.push(...leg);
    });
  }
  const momentCoord = i => jPath[jSeg[i][1]];
  const legKm = i => i ? km(spotCoord(J[i - 1]), spotCoord(J[i])) : 0;
  /* three kinds of road: a dotted line around town, a railway inside China, a contrail across the ocean */
  const TRAIL = {
    local: [['glow', { 'line-color': '#FFC9DD', 'line-width': 12, 'line-blur': 8, 'line-opacity': .55 }],
            ['line', { 'line-color': '#E4477E', 'line-width': 3.5, 'line-dasharray': [0.1, 2.2] }]],
    train: [['glow', { 'line-color': '#FFC9DD', 'line-width': 16, 'line-blur': 10, 'line-opacity': .5 }],
            ['ties', { 'line-color': '#2A2342', 'line-width': 10, 'line-opacity': .5, 'line-dasharray': [0.16, 0.42] }],
            ['rail', { 'line-color': '#E4477E', 'line-width': 3.5 }]],
    plane: [['glow', { 'line-color': '#C9D0FF', 'line-width': 12, 'line-blur': 9, 'line-opacity': .6 }],
            ['line', { 'line-color': '#4F63D8', 'line-width': 2.6, 'line-dasharray': [2.2, 2.2] }]]
  };
  function trailLayers() {
    for (const mode in TRAIL) {
      if (map.getSource('jt-' + mode)) continue;
      map.addSource('jt-' + mode, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: [] } } });
      for (const [k, paint] of TRAIL[mode]) map.addLayer({ id: `jt-${mode}-${k}`, type: 'line', source: 'jt-' + mode, layout: { 'line-cap': k === 'ties' ? 'butt' : 'round', 'line-join': 'round' }, paint });
    }
  }
  const lerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  const pathAt = f => { const i = Math.min(jPath.length - 1, Math.max(0, Math.floor(f))); return i + 1 < jPath.length ? lerp(jPath[i], jPath[i + 1], f - i) : jPath[i]; };
  // draw the road up to position f (a fractional index into jPath); returns the tip
  function setTrail(f) {
    trailLayers();
    const lines = { local: [], train: [], plane: [] };
    J.forEach((m, i) => {
      const [s, e] = jSeg[i]; if (e <= s || f <= s) return;
      const end = Math.min(f, e), pts = jPath.slice(s, Math.floor(end) + 1);
      if (end > Math.floor(end)) pts.push(pathAt(end));
      if (pts.length > 1) lines[legMode(i)].push(pts);
    });
    for (const mode in lines) map.getSource('jt-' + mode).setData({ type: 'Feature', geometry: { type: 'MultiLineString', coordinates: lines[mode] } });
    return pathAt(f);
  }
  const VEHICLE = {
    train: `<svg viewBox="0 0 20 50" width="20" height="50"><path d="M3 12Q3 1 10 1Q17 1 17 12V46Q17 49 14 49H6Q3 49 3 46Z" fill="#fff" stroke="#E4477E" stroke-width="1.4"/><path d="M5.5 10Q6 4 10 4Q14 4 14.5 10Z" fill="#2A2342"/><rect x="3.6" y="15" width="2.2" height="31" rx="1" fill="#E4477E"/><rect x="14.2" y="15" width="2.2" height="31" rx="1" fill="#E4477E"/><rect x="9" y="15" width="2" height="31" rx="1" fill="#EDE4DA"/></svg>`,
    plane: `<svg viewBox="0 0 40 40" width="38" height="38"><path d="M20 2C22 2 23 5 23 8V15L37 23V26.5L23 22V31L27.5 34.5V37.5L20 35.5L12.5 37.5V34.5L17 31V22L3 26.5V23L17 15V8C17 5 18 2 20 2Z" fill="#fff" stroke="#4F63D8" stroke-width="1.5" stroke-linejoin="round"/></svg>`
  };
  let jHeadMode = null;
  function setHead(c, mode = 'local', f = 0, k = 0) {
    if (!c) { if (jHead) { jHead.remove(); jHead = null; } jHeadMode = null; return; }
    if (jHead && jHeadMode !== mode) { jHead.remove(); jHead = null; }
    if (!jHead) {
      const el = document.createElement('div');
      el.className = mode === 'local' ? 'trail-head' : 'vehicle ' + mode;
      if (mode !== 'local') el.innerHTML = VEHICLE[mode];
      jHead = new maplibregl.Marker({ element: el }).setLngLat(c).addTo(map); jHeadMode = mode;
    }
    jHead.setLngLat(c);
    if (mode !== 'local') {   // point the nose along the road
      const a = map.project(pathAt(Math.max(0, f - .6))), b = map.project(pathAt(f + .6));
      if (Math.hypot(b.x - a.x, b.y - a.y) > .5) jHead.setRotation(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 90);
      if (mode === 'plane') jHead.getElement().style.setProperty('--alt', Math.sin(Math.PI * k).toFixed(3));   // climbs, cruises, lands
    }
  }

  /* a spot on the map: a dot, its name, and the photos taken there pinned above it */
  const camIcon = '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8.5 7l1.5-2.5h4L15.5 7"/><circle cx="12" cy="13.5" r="3.6"/></svg>';
  function spotEl(k) {
    const m = J[k], p = placeById(m.place), el = document.createElement('div');
    el.className = 'jy-spot fl' + (k % 3);
    el.innerHTML = `<i class="dot"></i><span class="lbl">${esc(m.spot || p.city)}</span>`;
    return el;
  }
  /* a chapter's photos, each at the place it was taken; she explores the area to find them.
     photos close together on screen share a little stack, and come apart as she zooms in */
  let jPhotos = [], jPhotoMarks = [], jPhotoFresh = false;
  const nearSpot = (c, ref) => [c[0] + Math.round((ref[0] - c[0]) / 360) * 360, c[1]];   // same world copy as the route
  function chapterPhotos(k) {
    const m = J[k], home = momentCoord(k);
    return (m.photos || []).filter(hasPhoto).map((x, idx) => ({ x, idx, coord: nearSpot(x.at ? spotCoord(x) : home, home) }));
  }
  function clearStopPhotos() { jPhotoMarks.forEach(mk => mk.remove()); jPhotoMarks = []; jPhotos = []; }
  function showStopPhotos(k) { clearStopPhotos(); jPhotos = chapterPhotos(k); jPhotoFresh = true; renderStopPhotos(k); }
  function renderStopPhotos(k = jI) {
    jPhotoMarks.forEach(mk => mk.remove()); jPhotoMarks = [];
    if (!jPhotos.length) return;
    const groups = [];
    for (const ph of jPhotos) {
      const pt = map.project(ph.coord);
      const g = groups.find(g => Math.hypot(g.pt.x - pt.x, g.pt.y - pt.y) < 78);
      if (g) g.items.push(ph); else groups.push({ pt, coord: ph.coord, items: [ph] });
    }
    const all = jPhotos.map(ph => ({ full: photoFiles(ph.x).src, caption: ph.x.caption || '' }));
    groups.forEach((g, gi) => {
      const first = g.items[0], n = g.items.length, el = document.createElement('button');
      const caps = [...new Set(g.items.map(ph => ph.x.caption).filter(Boolean))];
      el.type = 'button'; el.className = 'jy-ph' + (n > 1 ? ' many' : '') + (jPhotoFresh ? ' pop' : '');
      el.style.setProperty('--d', `${gi * 110}ms`); el.style.setProperty('--r', `${[-4, 3, -2, 5, -3][gi % 5]}deg`);
      // the map positions the marker with its own transform; tilt and pop-in live on the inner layer
      el.innerHTML = `<span class="ph-in"><span class="pic"><img src="${esc(photoFiles(first.x).thumb)}" alt=""></span><span class="cap">${esc(caps.length === 1 ? caps[0] : caps[0] + ' …')}</span>${n > 1 ? `<b class="cnt">${n}</b>` : ''}</span>`;
      el.setAttribute('aria-label', `${caps.join('、')}，${n} 张照片`);
      el.onclick = e => { e.stopPropagation(); openLightbox(all, first.idx === undefined ? 0 : jPhotos.indexOf(first)); };
      jPhotoMarks.push(new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -6] }).setLngLat(g.coord).addTo(map));
    });
    jPhotoFresh = false;
  }
  map.on('moveend', () => { if (jActive && jPhotos.length) renderStopPhotos(); });
  // the camera frames the whole area the chapter's photos cover, inside the part of the screen above the card.
  // computed directly in Web Mercator, so no padding rules can push a photo under the card
  function flyToStop(i, duration) {
    const pts = [momentCoord(i), ...chapterPhotos(i).map(ph => ph.coord)];
    const W = map.getContainer().clientWidth, H = map.getContainer().clientHeight, pad = jPad();
    // the box photos may sit in: below the year, above the card, and room for the polaroid that stands on each spot
    const box = { l: pad.left + 50, r: W - pad.right - 50, t: pad.top + 110, b: H - pad.bottom - 12 };
    const merc = pts.map(c => maplibregl.MercatorCoordinate.fromLngLat(c));
    const xs = merc.map(m => m.x), ys = merc.map(m => m.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const bw = Math.max(40, box.r - box.l), bh = Math.max(40, box.b - box.t);
    let world = Math.min(bw / Math.max(maxX - minX, 1e-9), bh / Math.max(maxY - minY, 1e-9));
    const maxZ = Math.max(...pts.map(c => km(c, pts[0]))) < 0.3 ? (J[i].zoom || 15) : 15.5;
    let zoom = Math.min(maxZ, Math.log2(world / 512)); world = 512 * 2 ** zoom;
    // put the middle of the photos at the middle of the box
    const cx = (minX + maxX) / 2 - ((box.l + box.r) / 2 - W / 2) / world;
    const cy = (minY + maxY) / 2 - ((box.t + box.b) / 2 - H / 2) / world;
    const center = new maplibregl.MercatorCoordinate(cx, cy).toLngLat();
    map.flyTo({ center: [center.lng, center.lat], zoom, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration, curve: 1.2, essential: true });
  }
  function stopPhotos(k, start = 0) {
    const list = (J[k].photos || []).filter(hasPhoto).map(x => ({ full: photoFiles(x).src, caption: x.caption || J[k].spot || '' }));
    if (list.length) openLightbox(list, Math.min(start, list.length - 1));
  }
  function syncSpots(upto, cur) {
    for (const [k, mk] of jSpots) if (k > upto) { mk.remove(); jSpots.delete(k); }
    for (let k = 0; k <= upto; k++) {
      if (!jSpots.has(k)) jSpots.set(k, new maplibregl.Marker({ element: spotEl(k), anchor: 'bottom' }).setLngLat(momentCoord(k)).addTo(map));
      const el = jSpots.get(k).getElement();
      // two moments in the same spot: only the newest one shows its label
      const hidden = J.some((m, j) => j > k && j <= upto && km(spotCoord(m), spotCoord(J[k])) < 0.02);
      el.classList.toggle('cur', k === cur);
      el.classList.toggle('gone', hidden && k !== cur);
      el.style.zIndex = k === cur ? 3 : 1;
    }
  }

  function showYear(m, dur) {
    const el = $('#jyYear'), age = $('#jyAge');
    cancelAnimationFrame(jYearRaf);
    const to = +m.year || null;
    if (!to) { el.className = 'word'; el.textContent = m.label || '后来'; jYear = null; age.textContent = ''; return; }
    el.className = '';
    const from = jYear ?? to, t0 = performance.now(), born = +G.born || null;
    const tick = now => {
      const k = dur ? Math.min(1, (now - t0) / dur) : 1, y = Math.round(from + (to - from) * easeIO(k));
      el.textContent = y;
      if (born) age.textContent = y === born ? '你出生了' : `${y - born} 岁`;
      if (k < 1) jYearRaf = requestAnimationFrame(tick);
    };
    jYearRaf = requestAnimationFrame(tick); jYear = to;
  }
  function momentHTML(i) {
    const m = J[i], p = placeById(m.place);
    const n = (m.photos || []).filter(hasPhoto).length;
    return `<div class="jy-place">${esc(p.city)}${m.spot ? ` · ${esc(m.spot)}` : ''}<i>${esc(p.en || '')}</i></div>
      <h2>${esc(m.title || p.city)}</h2>${m.text ? `<p>${esc(m.text)}</p>` : ''}
      ${n ? `<p class="jy-explore">👆 在这一带走走看看，点一点地图上的照片 <button type="button" class="jy-allph" data-allph>📷 ${n} 张</button></p>` : ''}`;
  }
  function endHTML() {
    let dist = 0; for (let i = 1; i < jPath.length; i++) dist += km(jPath[i - 1], jPath[i]);
    const n = new Set(J.map(m => m.place)).size, yrs = G.born ? new Date().getFullYear() - G.born : null;
    return `<div class="jy-end"><div class="jy-place">${esc(placeById(J[0].place).city)} → ${esc(placeById(J[J.length - 1].place).city)}</div>
      <h2>这就是你走过的路</h2>
      <div class="jy-stats"><span><b>${n}</b>座城市</span><span><b>${Math.round(dist).toLocaleString()}</b>公里</span>${yrs ? `<span><b>${yrs}</b>年</span>` : ''}</div>
      <p>从${esc(placeById(J[0].place).city)}出发，一站一站，走到了今天。你走过的地方，都开出了花。接下来的路，我们慢慢走，一起走。</p>
      ${G.closingQuote ? `<blockquote class="jy-quote">“${esc(G.closingQuote.text)}”<small>— ${esc(G.closingQuote.from)}</small></blockquote>` : ''}
      <div class="jy-intro"><span>以后打开的时候：</span><button type="button" data-intro="gift" class="${introMode() === 'gift' ? 'on' : ''}">🎁 每次都拆礼物</button><button type="button" data-intro="welcome" class="${introMode() === 'welcome' ? 'on' : ''}">🌸 直接跟我打招呼</button></div></div>`;
  }
  function renderCard(i) {
    jyBody.classList.add('out');
    setTimeout(() => {
      jyBody.innerHTML = i < J.length ? momentHTML(i) : endHTML(); jyBody.scrollTop = 0; jyBody.classList.remove('out');
      jyBody.querySelectorAll('[data-intro]').forEach(b => b.onclick = () => setIntro(b.dataset.intro));
      const all = jyBody.querySelector('[data-allph]'); if (all) all.onclick = () => stopPhotos(i, 0);
    }, reduce ? 0 : 380);
    $('#jyDots').innerHTML = J.map((_, k) => `<i class="${k === i ? 'on' : k < i ? 'done' : ''}"></i>`).join('') + `<i class="${i === J.length ? 'on' : ''}"></i>`;
    $('#jyPrev').disabled = i <= 0;
    $('#jyNext').textContent = i === J.length ? '去看整张地图' : i === J.length - 1 ? '看看你走了多远' : J[i + 1].place !== J[i].place ? `去${placeById(J[i + 1].place).city}` : '下一站';
  }
  function jPad() {
    if (isPhone()) return { top: 110, bottom: Math.round(Math.max($('#jyCard').offsetHeight, 230) + 24), left: 30, right: 30 };
    return { top: 130, bottom: 110, left: 70, right: 300 };
  }
  function goMoment(i) {
    if (jBusy) { cancelAnimationFrame(jTrailRaf); jBusy = false; setHead(null); }   // tapped mid-flight: skip ahead
    const prev = jI; jI = i;
    renderCard(i);
    if (i === J.length) {           // the whole road
      clearStopPhotos();
      setTrail(jPath.length); setHead(null); syncSpots(J.length - 1, -1);
      setTimeout(() => {
        const lons = jPath.map(p => p[0]), lats = jPath.map(p => p[1]);
        const cam = map.cameraForBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: jPad(), maxZoom: 6 });
        if (cam) map.flyTo({ ...cam, zoom: Math.max(cam.zoom, map.getMinZoom()), duration: reduce ? 0 : 3200, essential: true });
      }, 60);
      showYear({ year: new Date().getFullYear() }, reduce ? 0 : 2400);
      return;
    }
    const m = J[i], [s, e] = jSeg[i], travel = i === prev + 1 && e > s;
    const mode = travel ? legMode(i) : null;
    clearStopPhotos();
    if (!travel || reduce) {
      showYear(m, 1200);
      syncSpots(i, i); setTrail(e); setHead(null);
      Sound.play('bloom', { volume: .8 });
      // wait for the card to show its new words, so the camera knows how much of the screen it covers
      setTimeout(() => { if (jI !== i) return; flyToStop(i, reduce ? 0 : 2400); map.once('moveend', () => { if (jI === i) showStopPhotos(i); }); }, reduce ? 0 : 420);
      return;
    }
    // a trip, filmed in three shots: pull back to see the whole leg, travel across it, then land
    const ride = mode === 'plane' ? 2600 : mode === 'train' ? 2000 : 1300;
    const tok = jI;
    jBusy = true;
    syncSpots(i - 1, -1); setTrail(s);
    setTimeout(() => {
      if (tok !== jI) return;
      const leg = jPath.slice(s, e + 1), lons = leg.map(p => p[0]), lats = leg.map(p => p[1]);
      const cam = map.cameraForBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: jPad(), maxZoom: 13 });
      const pull = cam ? 1100 : 0;
      if (cam) map.flyTo({ ...cam, zoom: Math.max(cam.zoom, map.getMinZoom()), duration: pull, curve: 1.2, essential: true });
      setTimeout(() => {
        if (tok !== jI) return;
        showYear(m, ride);
        if (mode !== 'local') Sound.play(mode, { volume: .9 });
        const t0 = performance.now();
        const step = now => {
          if (tok !== jI) return;
          const k = Math.min(1, (now - t0) / ride), f = s + (e - s) * easeIO(k);
          setHead(setTrail(f), mode, f, k);
          if (k < 1) { jTrailRaf = requestAnimationFrame(step); return; }
          jBusy = false; setHead(null); setTrail(e);
          if (mode !== 'local') Sound.fadeOut(mode, 1500);
          flyToStop(i, 1700);
          setTimeout(() => { if (tok === jI) { syncSpots(i, i); Sound.play('bloom', { volume: .8 }); } }, 900);
          map.once('moveend', () => { if (tok === jI) showStopPhotos(i); });
        };
        jTrailRaf = requestAnimationFrame(step);
      }, pull + 150);
    }, 60);
  }
  function startJourney() {
    if (!J.length) return homeView();
    if (!map.isStyleLoaded()) { map.once('load', startJourney); return; }
    closeSheet();
    buildJourneyPath();
    jActive = true; jI = -1; jYear = null; jBusy = false;
    jSpots.forEach(m => m.remove()); jSpots.clear();
    document.body.classList.add('journeying');
    jy.hidden = false;
    trailLayers(); setTrail(0); setHead(null);
    map.jumpTo({ center: momentCoord(0), zoom: 4 });
    requestAnimationFrame(() => jy.classList.add('on'));
    goMoment(0);
  }
  function endJourney() {
    if (!jActive) return;
    jActive = false; jBusy = false;
    cancelAnimationFrame(jTrailRaf); cancelAnimationFrame(jYearRaf);
    setHead(null); jSpots.forEach(m => m.remove()); jSpots.clear();
    Sound.music(false); Sound.fadeOut('train'); Sound.fadeOut('plane'); clearStopPhotos();
    if (map.getSource('jt-local')) setTrail(jPath.length);   // the road stays on the map, quietly
    jy.classList.remove('on');
    document.body.classList.remove('journeying');
    setTimeout(() => { if (!jActive) jy.hidden = true; }, 900);
    homeView();
  }
  $('#jyNext').onclick = () => { if (jI >= J.length) endJourney(); else goMoment(jI + 1); };
  $('#jyPrev').onclick = () => { if (jI > 0) goMoment(jI - 1); };
  $('#jySkip').onclick = endJourney;
  $('#replay').onclick = startJourney;
  addEventListener('keydown', e => {
    if (!jActive || !lb.hidden) return;
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); $('#jyNext').click(); }
    else if (e.key === 'ArrowLeft') $('#jyPrev').click();
    else if (e.key === 'Escape') endJourney();
  });

  /* ---------- hint ---------- */
  function hideHint() { $('#hint').classList.add('hide'); }
  if (!Store.persistent) $('#hint').textContent = '这个浏览器不能保存内容，建议用手机自带的浏览器打开';

  /* ---------- gift ---------- */
  const scene = $('#scene'), app = $('#app');
  const themeMeta = document.querySelector('meta[name=theme-color]');
  const setTheme = c => themeMeta && themeMeta.setAttribute('content', c);
  const seen = (() => { try { return localStorage.getItem('mom-map:opened') === '1'; } catch (e) { return false; } })();
  function showApp() { app.classList.add('on'); app.setAttribute('aria-hidden', 'false'); map.resize(); }

  // title appears one character at a time, like ink
  const titleEl = $('#giftTitle');
  titleEl.innerHTML = [...titleEl.textContent].map((ch, i) => `<span style="animation-delay:${0.6 + i * 0.12}s">${esc(ch)}</span>`).join('');

  /* floating motes of light, and the sparkle burst when the lid comes off */
  const Motes = (() => {
    const cv = $('#motes'), ctx = cv.getContext('2d');
    const sprite = (r, g, b) => {
      const s = document.createElement('canvas'); s.width = s.height = 64;
      const c = s.getContext('2d'), gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, `rgba(255,250,235,1)`); gr.addColorStop(.18, `rgba(${r},${g},${b},.9)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
      c.fillStyle = gr; c.fillRect(0, 0, 64, 64); return s;
    };
    const warm = sprite(255, 200, 130), gold = sprite(255, 220, 140), rose = sprite(255, 150, 140), teal = sprite(120, 225, 210), lilac = sprite(190, 170, 255);
    const CONF = ['#F57AA6', '#F2B33D', '#3E9150', '#6A5BD6', '#D9304A', '#4F63D8'];
    let W = 0, H = 0, dpr = 1, parts = [], raf = 0, last = 0;
    function size() { dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; }
    function ambient(fresh) {
      return { x: Math.random() * W, y: fresh ? Math.random() * H : H + 20, r: 1 + Math.random() * 3.2, vx: 0, vy: -(6 + Math.random() * 18),
        a: .25 + Math.random() * .5, ph: Math.random() * 6.28, sp: .4 + Math.random() * .8, img: [warm, warm, gold, rose, teal, lilac][Math.floor(Math.random() * 6)], amb: true };
    }
    function seed() {
      parts = []; const n = Math.round(Math.min(70, W * H / 14000)); for (let i = 0; i < n; i++) parts.push(ambient(true));
      for (let i = 0; i < 9; i++) parts.push(petal(true));
    }
    function petal(fresh) {   // a few petals drifting down through the room, forever
      return { x: Math.random() * W, y: fresh ? Math.random() * H : -20, drift: true, c: PETALS[Math.floor(Math.random() * PETALS.length)], w: 6 + Math.random() * 4, h: 10 + Math.random() * 5,
        rot: Math.random() * 6.28, vr: (Math.random() - .5) * 1.6, vy: 16 + Math.random() * 18, ph: Math.random() * 6.28, sp: .8 + Math.random() };
    }
    function burst(x, y) {
      for (let i = 0; i < 140; i++) {
        const ang = -Math.PI / 2 + (Math.random() - .5) * 1.9, v = 120 + Math.random() * 460;
        parts.push({ x: x + (Math.random() - .5) * 40, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, r: .8 + Math.random() * 2.6, a: 1, life: 1.4 + Math.random() * 1.6, t: 0,
          ph: Math.random() * 6.28, sp: 6 + Math.random() * 10, img: Math.random() < .3 ? rose : gold });
      }
      for (let i = 0; i < 70; i++) {   // flower petals
        const ang = -Math.PI / 2 + (Math.random() - .5) * 2.4, v = 220 + Math.random() * 480;
        parts.push({ x: x + (Math.random() - .5) * 50, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, life: 3 + Math.random() * 1.8, t: 0, conf: true, petal: true,
          c: PETALS[i % PETALS.length], w: 7 + Math.random() * 5, h: 11 + Math.random() * 6, rot: Math.random() * 6.28, vr: (Math.random() - .5) * 8, ph: Math.random() * 6.28, sp: 3 + Math.random() * 4 });
      }
      for (let i = 0; i < 80; i++) {   // confetti
        const ang = -Math.PI / 2 + (Math.random() - .5) * 2.2, v = 260 + Math.random() * 520;
        parts.push({ x: x + (Math.random() - .5) * 50, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, life: 2.4 + Math.random() * 1.6, t: 0, conf: true,
          c: CONF[i % CONF.length], w: 5 + Math.random() * 5, h: 8 + Math.random() * 7, rot: Math.random() * 6.28, vr: (Math.random() - .5) * 12, ph: Math.random() * 6.28, sp: 4 + Math.random() * 6 });
      }
    }
    function frame(now) {
      const dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.ph += p.sp * dt;
        let alpha;
        if (p.drift) {
          p.y += p.vy * dt; p.x += Math.sin(p.ph) * 22 * dt; p.rot += p.vr * dt;
          if (p.y > H + 20) Object.assign(p, petal(false));
          ctx.globalAlpha = .8;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(Math.cos(p.ph * .7), 1); ctx.fillStyle = p.c;
          ctx.beginPath(); ctx.moveTo(0, -p.h / 2); ctx.bezierCurveTo(p.w * .7, -p.h * .3, p.w * .5, p.h * .45, 0, p.h / 2); ctx.bezierCurveTo(-p.w * .5, p.h * .45, -p.w * .7, -p.h * .3, 0, -p.h / 2); ctx.fill();
          ctx.restore();
          continue;
        }
        if (p.amb) {
          p.x += Math.sin(p.ph) * 8 * dt; p.y += p.vy * dt;
          if (p.y < -20) Object.assign(p, ambient(false));
          alpha = p.a * .55 * (.55 + .45 * Math.sin(p.ph * 1.7));
        } else {
          p.t += dt; p.vx *= 1 - 1.6 * dt; p.vy = p.vy * (1 - 1.6 * dt) + 40 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.t > p.life) { parts.splice(i, 1); continue; }
          alpha = (1 - p.t / p.life) * (.6 + .4 * Math.sin(p.ph));
        }
        if (p.conf) {   // paper confetti: drawn normally (not glowing), flipping as it falls
          p.vy += 260 * dt; p.vx *= 1 - .8 * dt; p.vy *= 1 - .9 * dt; p.rot += p.vr * dt;
          ctx.globalAlpha = Math.min(1, (1 - p.t / p.life) * 1.6);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.ph * 1.3));
          ctx.fillStyle = p.c;
          if (p.petal) { ctx.beginPath(); ctx.moveTo(0, -p.h / 2); ctx.bezierCurveTo(p.w * .7, -p.h * .3, p.w * .5, p.h * .45, 0, p.h / 2); ctx.bezierCurveTo(-p.w * .5, p.h * .45, -p.w * .7, -p.h * .3, 0, -p.h / 2); ctx.fill(); }
          else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
          continue;
        }
        const s = p.r * 7; ctx.globalAlpha = Math.max(0, alpha);
        ctx.drawImage(p.img, p.x - s / 2, p.y - s / 2, s, s);
      }
      raf = requestAnimationFrame(frame);
    }
    return {
      start() { if (reduce) return; size(); seed(); cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(frame); },
      stop() { cancelAnimationFrame(raf); raf = 0; },
      burst, size
    };
  })();
  addEventListener('resize', () => { if (!scene.hidden) Motes.size(); });

  /* the box leans toward the finger / cursor */
  const cube = $('#cube');
  scene.addEventListener('pointermove', e => {
    if (scene.classList.contains('opening')) return;
    cube.style.setProperty('--tx', ((e.clientX / innerWidth - .5) * 26).toFixed(2) + 'deg');
    cube.style.setProperty('--ty', ((e.clientY / innerHeight - .5) * -10).toFixed(2) + 'deg');
  });

  /* a soft music-box chime when the lid opens */
  function chime() {
    if (S.prefs && S.prefs.sound === false) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const ac = chime.ac || (chime.ac = new AC()); ac.resume && ac.resume();
      const out = ac.createGain(); out.gain.value = .5;
      const delay = ac.createDelay(), fb = ac.createGain(), wet = ac.createGain();
      delay.delayTime.value = .23; fb.gain.value = .35; wet.gain.value = .35;
      out.connect(ac.destination); out.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(ac.destination);
      const t0 = ac.currentTime + .05;
      [1318.5, 1108.7, 1318.5, 1760, 2217.5].forEach((f, i) => {
        const t = t0 + i * .13;
        [[f, .06], [f * 2.01, .012]].forEach(([fr, vol]) => {
          const o = ac.createOscillator(), g = ac.createGain();
          o.type = 'sine'; o.frequency.value = fr;
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + 2.4);
          o.connect(g); g.connect(out); o.start(t); o.stop(t + 2.5);
        });
      });
    } catch (e) {}
  }

  /* the paper map that rises out of the box: her places and the road between them */
  function foldedMapArt() {
    const order = lifeOrder(), W = 1600, H = 992;
    let line = [];
    for (let i = 1; i < order.length; i++) line = line.concat(greatCircle(order[i - 1].coord, order[i].coord, 48).slice(i > 1 ? 1 : 0));
    line = unwrap(line.length ? line : order.map(p => p.coord));
    const stops = unwrap(order.map(p => p.coord));
    if (line.length && stops.length) { const sh = Math.round((line[0][0] - stops[0][0]) / 360) * 360; stops.forEach(s => s[0] += sh); }
    const all = line.concat(stops), lons = all.map(p => p[0]), lats = all.map(p => p[1]);
    const x0 = Math.min(...lons), x1 = Math.max(...lons), y0 = Math.min(...lats), y1 = Math.max(...lats);
    const k = Math.min(W * .72 / Math.max(x1 - x0, 20), H * .56 / Math.max(y1 - y0, 12));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const P = ([lon, lat]) => [W / 2 + (lon - cx) * k, H * .54 - (lat - cy) * k];
    let grat = '';
    for (let lo = Math.floor((cx - W / 2 / k) / 15) * 15; lo <= cx + W / 2 / k; lo += 15) { const x = P([lo, 0])[0]; grat += `M${x.toFixed(1)} 0V${H}`; }
    for (let la = Math.floor((cy - H / 2 / k) / 15) * 15; la <= cy + H / 2 / k; la += 15) { const y = P([0, la])[1]; grat += `M0 ${y.toFixed(1)}H${W}`; }
    const route = line.map((p, i) => (i ? 'L' : 'M') + P(p).map(v => v.toFixed(1)).join(' ')).join('');
    // labels find a free spot around their flower (cities close together, like 郑州/开封, mustn't overlap)
    const flowers = stops.map(c => P(c)), boxes = [];
    const blocked = [{ x0: W - 760, y0: 70, x1: W - 60, y1: 230 }, { x0: W - 260, y0: H - 280, x1: W - 50, y1: H - 50 }];   // title, compass
    const hit = (b, list) => list.some(o => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
    const pins = stops.map((s, i) => {
      const [x, y] = flowers[i], p = order[i];
      const w = Math.max([...p.city].length * 70, (p.en || '').length * 19) + 24, h = 118;
      const near = [[0, 100], [0, -100], [w / 2 + 50, 0], [-(w / 2 + 50), 0], [w / 2 + 30, 85], [-(w / 2 + 30), 85], [w / 2 + 30, -85], [-(w / 2 + 30), -85]];
      const far = near.map(([dx, dy]) => [dx * 1.9, dy * 1.9 || (dy === 0 ? 0 : dy)]);
      const flowerBoxes = flowers.map(([fx, fy]) => ({ x0: fx - 38, y0: fy - 38, x1: fx + 38, y1: fy + 38 }));
      let pick = null, leader = false;
      for (const [k, [dx, dy]] of [...near, ...far].entries()) {
        const bx = x + dx, by = y + dy, bb = { x0: bx - w / 2, y0: by - h / 2, x1: bx + w / 2, y1: by + h / 2 };
        if (bb.x0 < 50 || bb.x1 > W - 50 || bb.y0 < 50 || bb.y1 > H - 50) continue;
        if (hit(bb, boxes) || hit(bb, flowerBoxes) || hit(bb, blocked)) continue;
        pick = { bx, by, bb }; leader = k >= near.length; break;
      }
      if (!pick) { const by = y + 100; pick = { bx: x, by, bb: { x0: x - w / 2, y0: by - h / 2, x1: x + w / 2, y1: by + h / 2 } }; }
      boxes.push(pick.bb);
      const { bx, by } = pick, enTop = by < y;   // the English sits on the far side from the flower
      return `<g transform="translate(${x} ${y}) scale(.95) rotate(${i * 23})">${flowerInner(PETALS[i % 2])}</g>` +
        (leader ? `<path d="M${x} ${y}L${bx} ${by}" stroke="#C9A9B4" stroke-width="2" stroke-dasharray="3 6" fill="none"/>` : '') +
        `<text x="${bx}" y="${enTop ? by + 40 : by + 6}" text-anchor="middle" font-family="Songti SC,STSong,Noto Serif SC,serif" font-size="64" fill="#2A2342" letter-spacing="4">${esc(p.city)}</text>` +
        (p.en ? `<text x="${bx}" y="${enTop ? by - 34 : by + 52}" text-anchor="middle" font-family="Cormorant Garamond,Georgia,serif" font-style="italic" font-size="38" fill="#6C6680">${esc(p.en)}</text>` : '');
    }).join('');
    const rose = `<g transform="translate(${W - 160} ${H - 160})" fill="none" stroke="#D99A1E" stroke-width="2"><circle r="62" opacity=".5"/><circle r="48" opacity=".3"/>
      <path d="M0-82L10-10L0 0L-10-10Z M0 82L10 10L0 0L-10 10Z" fill="#F2B33D" opacity=".7"/><path d="M-82 0L-10-10L0 0L-10 10Z M82 0L10-10L0 0L10 10Z" fill="#F6C95A" opacity=".5"/>
      <text y="-92" text-anchor="middle" font-family="Georgia,serif" font-size="22" fill="#D99A1E" stroke="none">N</text></g>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
      <defs><radialGradient id="v" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#FFFBF3"/><stop offset="1" stop-color="#FBE6D2"/></radialGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#v)"/>
      <path d="${grat}" stroke="#F0C9AE" stroke-width="1.5" opacity=".35"/>
      <rect x="40" y="40" width="${W - 80}" height="${H - 80}" fill="none" stroke="#F4A08C" stroke-width="2" opacity=".5"/>
      <rect x="52" y="52" width="${W - 104}" height="${H - 104}" fill="none" stroke="#F4A08C" stroke-width="1" opacity=".35"/>
      <path d="${route}" fill="none" stroke="#E4477E" stroke-width="6" stroke-dasharray="2 18" stroke-linecap="round"/>
      ${pins}${rose}
      <text x="${W - 110}" y="150" text-anchor="end" font-family="Songti SC,STSong,Noto Serif SC,serif" font-size="60" fill="#2A2342" letter-spacing="8">${esc('小妈的人生地图')}</text>
      <text x="${W - 110}" y="204" text-anchor="end" font-family="Cormorant Garamond,Georgia,serif" font-style="italic" font-size="36" fill="#6C6680">${esc(G.subtitle)}</text>
    </svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function buildFoldedMap() {
    const art = foldedMapArt(), roseSvg = `<svg class="c-rose" viewBox="-32 -32 64 64">${flowerInner()}</svg>`;
    let html = '';
    for (let i = 3; i >= 0; i--) {
      const back = i === 3 ? `<div class="b cover">${roseSvg}<span class="c-en">Mom</span><span class="c-zh">一张人生地图</span></div>` : '<div class="b"></div>';
      html = `<div class="pn p${i}"><div class="f" style="background-image:url('${art}');background-position:${i * 100 / 3}% 0"></div>${back}${html}</div>`;
    }
    $('#fmap').innerHTML = `<div class="fm-in">${html}</div>`;
  }

  function showGift() {
    scene.className = 'scene'; scene.hidden = false;
    cube.style.removeProperty('--tx'); cube.style.removeProperty('--ty');
    setTheme('#FFF8F1');
    buildFoldedMap();
    Motes.start();
  }
  function unwrapGift() {
    if (scene.classList.contains('opening')) return;
    Sound.unlock();   // this tap wakes the audio engine for everything that follows
    Sound.play('open', { fallback: chime });
    Sound.wishes();
    Sound.music(true);
    try { navigator.vibrate && navigator.vibrate(12); } catch (e) {}
    buildFoldedMap();
    const steps = reduce ? [['opening', 0], ['gone', 10]]
      : [['opening', 0], ['lifted', 600], ['glowing', 1300], ['risen', 2100], ['unfold', 3100], ['spread', 5600], ['gone', 6200]];
    steps.forEach(([c, t]) => setTimeout(() => {
      scene.classList.add(c);
      if (c === 'lifted') Sound.play('burst');
      if (c === 'unfold') Sound.play('unfold');
      if (c === 'lifted') {
        const r = $('#gift').getBoundingClientRect(), w = Math.min(innerWidth * .44, 200);
        Motes.burst(r.left + r.width / 2, r.top + r.height / 2 - w * .74 * .45);
      }
      if (c === 'glowing') setTheme('#FFF8F1');
      if (c === 'spread' || (reduce && c === 'gone')) { showApp(); if (J.length) startJourney(); else { homeView(false); setTimeout(() => Sound.music(false), 4000); } }
      if (c === 'gone') {
        setTimeout(() => { scene.hidden = true; Motes.stop(); }, 1200);
        try { localStorage.setItem('mom-map:opened', '1'); } catch (e) {}
      }
    }, t));
  }
  $('#gift').onclick = unwrapGift;
  $('#giftAgain').onclick = () => { closeSheet(); showGift(); };

  /* ---------- 打招呼: after the first time, a gentle hello instead of the gift (if she chooses) ---------- */
  const welcome = $('#welcome'), W = G.welcome || {};
  function showWelcome() {
    const now = new Date(), h = now.getHours();
    const tod = h >= 5 && h < 11 ? 'morning' : h < 14 ? 'noon' : h < 18 ? 'day' : h < 22 ? 'evening' : 'night';
    welcome.className = 'welcome ' + tod;
    $('#wlHello').textContent = { morning: '早上好，小妈', noon: '中午好，小妈', day: '下午好，小妈', evening: '晚上好，小妈', night: '夜深了，小妈' }[tod];
    $('#wlDate').textContent = fmtDay(today());
    const lines = W.lines && W.lines.length ? W.lines : ['我好期待听你分享你的想法。'];
    $('#wlLine').textContent = tod === 'night' ? '今天辛苦了。写几句再睡吧，或者明天再写也很好。' : lines[Math.floor(Math.random() * lines.length)];
    const vs = W.verses || [], day = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5);
    const v = vs.length ? vs[day % vs.length] : null;
    $('#wlVerse').textContent = v ? v[0] : ''; $('#wlRef').textContent = v ? '— ' + v[1] : '';
    welcome.querySelector('.wl-verse').hidden = !v;
    const past = onThisDay(now).sort((x, y) => y.date.localeCompare(x.date))[0], mem = $('#wlMemory');
    mem.hidden = !past;
    if (past) {
      mem.innerHTML = `<small>📖 ${pDate(past.date).getFullYear()}年的这几天，你写过</small><span>「${esc((past.title || past.text || past.verse || past.thanks || '一页手写的日记').slice(0, 40))}」</span>`;
      mem.onclick = () => enterApp(() => openDiaryEntry({ id: past.id }));
    }
    const wk = gather(rangeOf('week', now));
    $('#wlRecap').hidden = !wk.es.length && !wk.places.length;
    $('#wlFrom').textContent = W.from || '';
    $('#wlPetals').innerHTML = Array.from({ length: 14 }, (_, i) => `<i style="--x:${Math.random() * 100}%;--d:${(Math.random() * 12).toFixed(1)}s;--t:${(11 + Math.random() * 9).toFixed(1)}s;--c:${PETALS[i % PETALS.length]};--s:${(.7 + Math.random() * .7).toFixed(2)}"></i>`).join('');
    setTheme(tod === 'night' ? '#231C3F' : '#FFF4EC');
    welcome.classList.add('closed');
    welcome.dataset.greet = { morning: 'greetMorning', noon: 'greetNoon', day: 'greetDay', evening: 'greetEvening', night: 'greetEvening' }[tod];
    welcome.hidden = false;
  }
  // a tap (the browser only lets sound play after one) opens the bud, and she hears your voice
  function openWelcome() {
    if (!welcome.classList.contains('closed')) return;
    welcome.classList.remove('closed');
    Sound.unlock(welcome.dataset.greet);
    Sound.play(welcome.dataset.greet);
    // then your message, after the greeting has finished
    if (!welcome.hidden) Sound.play('diary', { when: Sound.has(welcome.dataset.greet) ? 2.3 : 0.3 });
    try { navigator.vibrate && navigator.vibrate(10); } catch (e) {}
  }
  $('#wlBud').onclick = openWelcome;
  welcome.addEventListener('click', e => { if (welcome.classList.contains('closed') && !e.target.closest('#wlBud')) openWelcome(); });
  function enterApp(then) {
    welcome.classList.add('leaving');
    showApp(); homeView(false); setTheme('#FFF8F1');
    setTimeout(() => { welcome.hidden = true; welcome.classList.remove('leaving'); if (then) then(); else if (scene.hidden) greetFlashback(); }, reduce ? 0 : 900);
  }
  $('#wlWrite').onclick = () => enterApp(() => openDiaryEntry({ type: 'journal' }));
  $('#wlPray').onclick = () => enterApp(() => openDiaryEntry({ type: 'prayer' }));
  $('#wlEnter').onclick = () => enterApp();
  $('#wlGift').onclick = () => { welcome.hidden = true; showGift(); };
  $('#wlRecap').onclick = () => enterApp(() => openFlash('week'));

  const forceGift = location.hash === '#gift';
  if (forceGift) history.replaceState(null, '', location.pathname + location.search);
  if (forceGift || !seen || introMode() === 'gift') showGift();
  else showWelcome();

  /* ---------- controls ---------- */
  $('#zoomIn').onclick = () => map.zoomIn();
  $('#zoomOut').onclick = () => map.zoomOut();
  $('#home').onclick = () => { closeSheet(); setTimeout(() => homeView(), 50); };

  /* the place sheet follows her finger (phone): pull it down to close, it springs back if she lets go early */
  let sheetY = 0, stopSheet = () => {};
  const setSheetY = y => { sheetY = y; sheet.style.transform = `translateY(${y}px)`; };
  dragTracker(sheet, {
    start: e => isPhone() && sheet.classList.contains('open') && !!e.target.closest('#grabber,.sh-head') && !e.target.closest('button,input,label,textarea,a'),
    move: (dx, dy) => {
      stopSheet(); sheet.style.transition = 'none';
      setSheetY(dy >= 0 ? dy : rubberband(dy, sheet.offsetHeight));
    },
    end: (dx, dy, vx, vy) => {
      const h = sheet.offsetHeight, landing = sheetY + project(vy);
      if (landing > h * 0.4) {   // closing: keep the finger's speed all the way out
        stopSheet = spring(sheetY, h * 1.05, vy, { response: 0.3, damping: 1 }, setSheetY, () => {
          closeSheet(); requestAnimationFrame(() => { sheet.style.transform = ''; sheet.style.transition = ''; sheetY = 0; });
        });
      } else {
        stopSheet = spring(sheetY, 0, vy, { response: 0.3, damping: Math.abs(vy) > 300 ? 0.8 : 1 }, setSheetY, () => { sheet.style.transform = ''; sheet.style.transition = ''; });
      }
    }
  });

  map.on('load', () => { buildIndex(); buildPins(); if (!jActive) homeView(false); });
  addEventListener('resize', () => layoutPins());
})();
