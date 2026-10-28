/* K-Edit core: platform bridge, image engine (WebP), video to GIF pipeline, crop + trim widgets. */
(function () {
  'use strict';
  var KE = window.KE = {};
  KE.version = '1.0.0';
  var FA = '۰۱۲۳۴۵۶۷۸۹';
  KE.fa = function (v) { return String(v).replace(/[0-9]/g, function (d) { return FA[d]; }).replace(/\./g, '٫'); };
  KE.size = function (b) {
    if (b < 1024) return KE.fa(b) + ' بایت';
    if (b < 1024 * 1024) return KE.fa(Math.round(b / 1024)) + ' کیلوبایت';
    return KE.fa((b / 1048576).toFixed(b < 10485760 ? 2 : 1)) + ' مگابایت';
  };
  KE.time = function (t) {
    t = Math.max(0, t || 0); var m = Math.floor(t / 60), s = t - m * 60;
    return '\u2066' + KE.fa(m + ':' + (s < 10 ? '0' : '') + s.toFixed(1)) + '\u2069';
  };
  KE.dims = function (w, h) { return '\u2066' + KE.fa(w) + '×' + KE.fa(h) + '\u2069'; };
  KE.$ = function (root, sel) { return root.querySelector(sel); };
  KE.$$ = function (root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); };
  KE.baseName = function (n) { return (n || 'k-edit').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '').slice(0, 60) || 'k-edit'; };

  /* ---------- platform ---------- */
  KE.platform = window.KEditNative ? 'android' : (window.__TAURI__ ? 'desktop' : 'web');
  var pending = {};
  window.__keSaved = function (id, json) {
    var cb = pending[id]; delete pending[id];
    if (cb) { try { cb(JSON.parse(json)); } catch (e) { cb({ ok: false, error: String(e) }); } }
  };
  function b64(u8) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  }
  KE.save = function (blob, name, action) {
    action = action || 'save';
    if (KE.platform === 'android') {
      return blob.arrayBuffer().then(function (buf) {
        var u8 = new Uint8Array(buf), id = window.KEditNative.begin(), STEP = 393216;
        for (var i = 0; i < u8.length; i += STEP) window.KEditNative.append(id, b64(u8.subarray(i, i + STEP)));
        return new Promise(function (res) { pending[id] = res; window.KEditNative.finish(id, name, blob.type, action); });
      });
    }
    if (KE.platform === 'desktop') {
      return blob.arrayBuffer().then(function (buf) {
        return window.__TAURI__.core.invoke('save_file', new Uint8Array(buf), { headers: { 'x-name': encodeURIComponent(name) } });
      }).then(function (p) { return p ? { ok: true, where: p } : { ok: false, cancelled: true }; },
        function (e) { return { ok: false, error: String(e) }; });
    }
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    return Promise.resolve({ ok: true, where: 'Downloads' });
  };
  KE.reveal = function (p) { if (KE.platform === 'desktop' && p) window.__TAURI__.core.invoke('reveal', { path: p }).catch(function () {}); };
  KE.canShare = function () { return KE.platform === 'android'; };

  /* ---------- image engine ---------- */
  KE.loadImage = function (file) {
    return createImageBitmap(file).then(function (bmp) {
      return { bmp: bmp, w: bmp.width, h: bmp.height, name: file.name || 'image', size: file.size || 0, type: file.type || '' };
    }, function () { throw new Error('unsupported'); });
  };
  KE.oriented = function (st) { return (st.rot % 180) ? { w: st.h, h: st.w } : { w: st.w, h: st.h }; };
  KE.filterOf = function (st) {
    var f = [];
    if (st.bright !== 100) f.push('brightness(' + st.bright + '%)');
    if (st.contrast !== 100) f.push('contrast(' + st.contrast + '%)');
    if (st.sat !== 100) f.push('saturate(' + st.sat + '%)');
    return f.length ? f.join(' ') : 'none';
  };
  // draw (part of) the oriented image: crop rect in oriented px -> canvas ow x oh
  KE.drawImg = function (ctx, st, crop, ow, oh, noFilter) {
    var o = KE.oriented(st), s = ow / crop.w;
    ctx.save();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.filter = noFilter ? 'none' : KE.filterOf(st);
    ctx.scale(s, oh / crop.h); ctx.translate(-crop.x, -crop.y);
    if (st.fh) { ctx.translate(o.w, 0); ctx.scale(-1, 1); }
    if (st.fv) { ctx.translate(0, o.h); ctx.scale(1, -1); }
    if (st.rot === 90) { ctx.translate(st.h, 0); ctx.rotate(Math.PI / 2); }
    else if (st.rot === 180) { ctx.translate(st.w, st.h); ctx.rotate(Math.PI); }
    else if (st.rot === 270) { ctx.translate(0, st.w); ctx.rotate(-Math.PI / 2); }
    ctx.drawImage(st.bmp, 0, 0);
    ctx.restore();
  };
  KE.outSize = function (crop, maxEdge) {
    var w = crop.w, h = crop.h, L = Math.max(w, h);
    if (maxEdge && L > maxEdge) { var k = maxEdge / L; w *= k; h *= k; }
    return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
  };
  KE.renderOut = function (st, crop, maxEdge) {
    var sz = KE.outSize(crop, maxEdge), c = document.createElement('canvas');
    c.width = sz.w; c.height = sz.h;
    var ctx = c.getContext('2d');
    // big downscales: two steps keeps detail crisp
    if (crop.w / sz.w > 2.5) {
      var mid = document.createElement('canvas'); mid.width = sz.w * 2; mid.height = sz.h * 2;
      KE.drawImg(mid.getContext('2d'), st, crop, mid.width, mid.height);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(mid, 0, 0, sz.w, sz.h);
    } else KE.drawImg(ctx, st, crop, sz.w, sz.h);
    return c;
  };
  KE.webp = function (canvas, q) {
    return new Promise(function (res, rej) { canvas.toBlob(function (b) { b ? res(b) : rej(new Error('encode')); }, 'image/webp', q); });
  };
  function small(canvas, max) {
    var k = Math.min(1, max / Math.max(canvas.width, canvas.height));
    if (k >= 1) return canvas;
    var c = document.createElement('canvas'); c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k);
    var x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(canvas, 0, 0, c.width, c.height); return c;
  }
  function psnr(refData, blob, w, h) {
    return createImageBitmap(blob).then(function (bm) {
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      var x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(bm, 0, 0);
      var d = x.getImageData(0, 0, w, h).data, a = refData, se = 0, n = 0;
      for (var i = 0; i < d.length; i += 4) {
        var al = a[i + 3] / 255, dr = (a[i] - d[i]) * al, dg = (a[i + 1] - d[i + 1]) * al, db = (a[i + 2] - d[i + 2]) * al;
        se += dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11; n++;
      }
      var mse = se / n; return mse <= 1e-9 ? 99 : 10 * Math.log10(65025 / mse);
    });
  }
  KE.hasAlpha = function (canvas) {
    var s = small(canvas, 512), d = s.getContext('2d').getImageData(0, 0, s.width, s.height).data;
    for (var i = 3; i < d.length; i += 4) if (d[i] < 250) return true; return false;
  };
  // smart: lowest quality whose result is visually identical (PSNR target), searched on a preview copy
  KE.smartWebP = function (canvas, target, onStep) {
    target = target || 42;
    var s = small(canvas, 1400), ref = s.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, s.width, s.height).data;
    var lo = 0.5, hi = 0.97, best = hi, step = 0;
    function iter() {
      if (step >= 6) return Promise.resolve(best);
      var q = (lo + hi) / 2; step++; if (onStep) onStep(step / 7);
      return KE.webp(s, q).then(function (b) { return psnr(ref, b, s.width, s.height); }).then(function (p) {
        if (p >= target) { best = q; hi = q; } else lo = q; return iter();
      });
    }
    return iter().then(function (q) {
      q = Math.min(0.97, q + 0.02);
      return KE.webp(canvas, q).then(function (b) { if (onStep) onStep(1); return { blob: b, q: q }; });
    });
  };

  /* ---------- video -> GIF ---------- */
  KE.GIFQ = {
    best: { colors: 255, spread: 12, thr: 0 },
    balanced: { colors: 255, spread: 9, thr: 4 },
    small: { colors: 180, spread: 0, thr: 8 }
  };
  KE.seek = function (v, t) {
    return new Promise(function (res) {
      var done = false, to;
      function fin() { if (done) return; done = true; clearTimeout(to); v.removeEventListener('seeked', fin); requestAnimationFrame(function () { res(); }); }
      v.addEventListener('seeked', fin); to = setTimeout(fin, 4000);
      try { v.currentTime = t; } catch (e) { fin(); }
    });
  };
  KE.gifPlan = function (o) {
    var cw = o.crop.w, ch = o.crop.h, ow = Math.min(o.outW || cw, cw);
    ow = Math.max(16, Math.round(ow)); var oh = Math.max(16, Math.round(ch * ow / cw));
    var span = Math.max(0.05, o.end - o.start), speed = o.speed || 1;
    var n = Math.max(1, Math.round(span / speed * o.fps));
    return { w: ow, h: oh, n: n, dur: span / speed };
  };
  KE.makeGif = function (o) {
    var v = o.video, P = KE.gifPlan(o), Q = KE.GIFQ[o.quality] || KE.GIFQ.balanced;
    var c = document.createElement('canvas'); c.width = P.w; c.height = P.h;
    var ctx = c.getContext('2d', { willReadFrequently: true }); ctx.imageSmoothingQuality = 'high';
    var wk = new Worker('js/gifworker.js'), waiters = [], cancelled = false;
    wk.onmessage = function (e) { var w = waiters.shift(); if (e.data.cmd === 'error') { wk.terminate(); if (w) w.rej(new Error(e.data.message)); } else if (w) w.res(e.data); };
    function call(msg, tr) { return new Promise(function (res, rej) { waiters.push({ res: res, rej: rej }); wk.postMessage(msg, tr || []); }); }
    function grab() { ctx.drawImage(v, o.crop.x, o.crop.y, o.crop.w, o.crop.h, 0, 0, P.w, P.h); return ctx.getImageData(0, 0, P.w, P.h).data.buffer; }
    var step = (o.end - o.start) / P.n, samples = [], ns = Math.min(8, P.n);
    var api = { cancel: function () { cancelled = true; } };
    v.pause();
    var chain = Promise.resolve(), sampleAt = [];
    for (var s = 0; s < ns; s++) sampleAt.push(o.start + (s + 0.5) * (o.end - o.start) / ns);
    sampleAt.forEach(function (t, i) {
      chain = chain.then(function () { if (cancelled) throw new Error('cancel'); return KE.seek(v, t); }).then(function () {
        samples.push(grab()); o.onProgress && o.onProgress(0.08 * (i + 1) / ns);
      });
    });
    api.promise = chain.then(function () {
      return call({ cmd: 'start', w: P.w, h: P.h, colors: Q.colors, spread: Q.spread, thr: Q.thr, samples: samples }, samples);
    }).then(function () {
      var i = 0, acc = 0;
      function one() {
        if (cancelled) return Promise.reject(new Error('cancel'));
        if (i >= P.n) return Promise.resolve();
        var t = Math.min(o.end - 0.001, o.start + i * step);
        return KE.seek(v, t).then(function () {
          var next = Math.round((i + 1) * 100 / o.fps), d = next - acc; acc = next;
          var buf = grab(); var p = call({ cmd: 'frame', buf: buf, delay: d, i: i }, [buf]);
          i++; o.onProgress && o.onProgress(0.08 + 0.9 * i / P.n);
          return p.then(one);
        });
      }
      return one();
    }).then(function () { return call({ cmd: 'finish', loop: o.loop !== false }); })
      .then(function (r) { wk.terminate(); o.onProgress && o.onProgress(1); return new Blob([r.gif], { type: 'image/gif' }); },
        function (e) { wk.terminate(); throw e; });
    return api;
  };

  /* ---------- crop widget ---------- */
  function Crop(layer, onChange) {
    this.layer = layer; this.onChange = onChange || function () {};
    this.nw = 1; this.nh = 1; this.r = { x: 0, y: 0, w: 1, h: 1 }; this.aspect = null;
    layer.innerHTML = '<div class="cb"><i class="g1"></i><i class="g2"></i><i class="g3"></i><i class="g4"></i><span class="cb-size"></span>' +
      ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(function (k) { return '<b class="hd hd-' + k + '" data-h="' + k + '"></b>'; }).join('') + '</div>';
    this.box = layer.firstChild; this.sz = layer.querySelector('.cb-size');
    var me = this, drag = null;
    layer.addEventListener('pointerdown', function (e) {
      var h = e.target.getAttribute && e.target.getAttribute('data-h');
      if (!h && !me.box.contains(e.target)) return;
      e.preventDefault(); layer.setPointerCapture(e.pointerId);
      drag = { h: h || 'move', x: e.clientX, y: e.clientY, r: Object.assign({}, me.r), k: me.nw / layer.clientWidth };
      me.box.classList.add('on');
    });
    layer.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = (e.clientX - drag.x) * drag.k, dy = (e.clientY - drag.y) * drag.k;
      me.r = me.calc(drag.h, drag.r, dx, dy); me.draw(); me.onChange(me.r);
    });
    function up() { if (drag) { drag = null; me.box.classList.remove('on'); me.onChange(me.r, true); } }
    layer.addEventListener('pointerup', up); layer.addEventListener('pointercancel', up);
  }
  Crop.prototype.calc = function (h, r0, dx, dy) {
    var W = this.nw, H = this.nh, MIN = Math.max(8, Math.min(W, H) * 0.04), r = Object.assign({}, r0), A = this.aspect;
    if (h === 'move') {
      r.x = Math.min(Math.max(0, r0.x + dx), W - r0.w); r.y = Math.min(Math.max(0, r0.y + dy), H - r0.h); return r;
    }
    var L = r0.x, T = r0.y, R = r0.x + r0.w, B = r0.y + r0.h;
    if (h.indexOf('w') >= 0) L = Math.min(Math.max(0, L + dx), R - MIN);
    if (h.indexOf('e') >= 0) R = Math.max(Math.min(W, R + dx), L + MIN);
    if (h.indexOf('n') >= 0) T = Math.min(Math.max(0, T + dy), B - MIN);
    if (h.indexOf('s') >= 0) B = Math.max(Math.min(H, B + dy), T + MIN);
    if (A) {
      var w = R - L, hh = B - T;
      if (w / hh > A) w = hh * A; else hh = w / A;
      var ax = h.indexOf('w') >= 0 ? R : r0.x, ay = h.indexOf('n') >= 0 ? B : r0.y; // anchor = opposite corner
      var maxW = h.indexOf('w') >= 0 ? ax : W - ax, maxH = h.indexOf('n') >= 0 ? ay : H - ay;
      if (w > maxW) { w = maxW; hh = w / A; } if (hh > maxH) { hh = maxH; w = hh * A; }
      L = h.indexOf('w') >= 0 ? ax - w : ax; T = h.indexOf('n') >= 0 ? ay - hh : ay; R = L + w; B = T + hh;
    }
    return { x: L, y: T, w: R - L, h: B - T };
  };
  Crop.prototype.setNatural = function (w, h, keep) { this.nw = w; this.nh = h; if (!keep) this.r = { x: 0, y: 0, w: w, h: h }; this.setAspect(this.aspect, true); };
  Crop.prototype.setAspect = function (a, silent) {
    this.aspect = a || null; this.layer.classList.toggle('locked', !!a);
    if (a) {
      var W = this.nw, H = this.nh, w = W, h = w / a; if (h > H) { h = H; w = h * a; }
      this.r = { x: (W - w) / 2, y: (H - h) / 2, w: w, h: h };
    }
    this.draw(); if (!silent) this.onChange(this.r, true);
  };
  Crop.prototype.reset = function () { this.aspect = null; this.layer.classList.remove('locked'); this.r = { x: 0, y: 0, w: this.nw, h: this.nh }; this.draw(); this.onChange(this.r, true); };
  Crop.prototype.isFull = function () { return this.r.x < 0.5 && this.r.y < 0.5 && Math.abs(this.r.w - this.nw) < 1 && Math.abs(this.r.h - this.nh) < 1; };
  Crop.prototype.rect = function () { var r = this.r; return { x: Math.round(r.x), y: Math.round(r.y), w: Math.max(1, Math.round(r.w)), h: Math.max(1, Math.round(r.h)) }; };
  Crop.prototype.draw = function () {
    var r = this.r, s = this.box.style;
    s.left = (r.x / this.nw * 100) + '%'; s.top = (r.y / this.nh * 100) + '%';
    s.width = (r.w / this.nw * 100) + '%'; s.height = (r.h / this.nh * 100) + '%';
    var q = this.rect(); this.sz.textContent = KE.dims(q.w, q.h);
  };
  KE.Crop = Crop;
  // place an overlay exactly over contain-fitted media inside its box
  KE.fitLayer = function (layer, boxEl, mw, mh) {
    var bw = boxEl.clientWidth, bh = boxEl.clientHeight, k = Math.min(bw / mw, bh / mh);
    var w = mw * k, h = mh * k, s = layer.style;
    s.width = w + 'px'; s.height = h + 'px'; s.left = (boxEl.offsetLeft + (bw - w) / 2) + 'px'; s.top = (boxEl.offsetTop + (bh - h) / 2) + 'px';
    return { w: w, h: h };
  };

  /* ---------- trim widget (timeline flows left to right) ---------- */
  function Trim(el, o) {
    this.el = el; this.o = o; this.dur = 1; this.a = 0; this.b = 1; this.t = 0;
    el.innerHTML = '<canvas class="tr-strip"></canvas><div class="tr-dim tr-dl"></div><div class="tr-dim tr-dr"></div>' +
      '<div class="tr-sel"><b class="tr-h tr-ha" data-t="a"><i></i></b><b class="tr-h tr-hb" data-t="b"><i></i></b></div><div class="tr-ph"><i></i></div>';
    this.strip = el.querySelector('.tr-strip'); this.sel = el.querySelector('.tr-sel'); this.ph = el.querySelector('.tr-ph');
    this.dl = el.querySelector('.tr-dl'); this.dr = el.querySelector('.tr-dr');
    var me = this, drag = null;
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault(); el.setPointerCapture(e.pointerId);
      var w = e.target.closest('[data-t]'), t = me.tAt(e.clientX);
      if (w) drag = { k: w.getAttribute('data-t') };
      else if (e.target.closest('.tr-sel') && me.b - me.a < me.dur * 0.999) drag = { k: 'move', t0: t, a: me.a, b: me.b };
      else { drag = { k: 'seek' }; me.o.onSeek(t); me.setT(t); }
      el.classList.add('drag');
    });
    el.addEventListener('pointermove', function (e) {
      if (!drag) return; var t = me.tAt(e.clientX), MIN = Math.min(0.2, me.dur);
      if (drag.k === 'a') { me.a = Math.min(Math.max(0, t), me.b - MIN); me.o.onSeek(me.a); me.setT(me.a); }
      else if (drag.k === 'b') { me.b = Math.max(Math.min(me.dur, t), me.a + MIN); me.o.onSeek(me.b); me.setT(me.b); }
      else if (drag.k === 'move') { var d = t - drag.t0, L = drag.b - drag.a; var na = Math.min(Math.max(0, drag.a + d), me.dur - L); me.a = na; me.b = na + L; me.o.onSeek(me.a); me.setT(me.a); }
      else { me.o.onSeek(t); me.setT(t); }
      me.draw(); if (drag.k !== 'seek') me.o.onChange(me.a, me.b);
    });
    function up() { if (drag) { drag = null; el.classList.remove('drag'); me.o.onChange(me.a, me.b, true); } }
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  Trim.prototype.tAt = function (x) { var r = this.el.getBoundingClientRect(); return Math.min(1, Math.max(0, (x - r.left) / r.width)) * this.dur; };
  Trim.prototype.set = function (dur, a, b) { this.dur = Math.max(0.05, dur); this.a = a || 0; this.b = (b == null ? this.dur : b); this.draw(); };
  Trim.prototype.setRange = function (a, b) { var MIN = Math.min(0.2, this.dur); this.a = Math.max(0, Math.min(a, this.dur - MIN)); this.b = Math.min(this.dur, Math.max(b, this.a + MIN)); this.draw(); this.o.onChange(this.a, this.b, true); };
  Trim.prototype.setT = function (t) { this.t = t; this.ph.style.left = (t / this.dur * 100) + '%'; };
  Trim.prototype.draw = function () {
    var A = this.a / this.dur * 100, B = this.b / this.dur * 100;
    this.sel.style.left = A + '%'; this.sel.style.width = (B - A) + '%';
    this.dl.style.width = A + '%'; this.dr.style.left = B + '%'; this.dr.style.width = (100 - B) + '%';
  };
  Trim.prototype.thumbs = function (src, vw, vh) {
    var me = this, c = this.strip, W = Math.max(200, this.el.clientWidth), H = Math.max(30, this.el.clientHeight);
    var dpr = Math.min(2, window.devicePixelRatio || 1); c.width = W * dpr; c.height = H * dpr;
    var x = c.getContext('2d'), tw = H * dpr * vw / vh, n = Math.max(1, Math.ceil(c.width / tw));
    var v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = src;
    var gen = (this.gen = (this.gen || 0) + 1);
    v.addEventListener('loadeddata', function () {
      var i = 0;
      (function nx() {
        if (gen !== me.gen || i >= n) { v.removeAttribute('src'); v.load(); return; }
        KE.seek(v, Math.min(me.dur - 0.05, (i + 0.5) * me.dur / n)).then(function () { x.drawImage(v, i * tw, 0, tw, c.height); i++; nx(); });
      })();
    }, { once: true });
  };
  KE.Trim = Trim;

  /* ---------- icons (stroke, currentColor) ---------- */
  var IC = {
    back: '<path d="M9 5l7 7-7 7"/>',
    img: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
    vid: '<rect x="3" y="5" width="13" height="14" rx="3"/><path d="M16 10l5-3v10l-5-3"/>',
    crop: '<path d="M7 3v13a1 1 0 001 1h13"/><path d="M3 7h13a1 1 0 011 1v13"/>',
    tune: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    out: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/>',
    rotl: '<path d="M4 9a8 8 0 111 9"/><path d="M4 4v5h5"/>',
    rotr: '<path d="M20 9a8 8 0 10-1 9"/><path d="M20 4v5h-5"/>',
    fliph: '<path d="M12 3v18"/><path d="M8 7L3 12l5 5V7zM16 7l5 5-5 5V7z"/>',
    flipv: '<path d="M3 12h18"/><path d="M7 8l5-5 5 5H7zM7 16l5 5 5-5H7z"/>',
    reset: '<path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8"/><path d="M3 3v5h5"/>',
    play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
    pause: '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
    start: '<path d="M6 4v16"/><path d="M18 6l-8 6 8 6z"/>',
    end: '<path d="M18 4v16"/><path d="M6 6l8 6-8 6z"/>',
    prev: '<path d="M15 6l-6 6 6 6"/>', next: '<path d="M9 6l6 6-6 6"/>',
    save: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
    folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
    open: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    loop: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 014-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 01-4 4H4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
  };
  KE.icon = function (n, cls) { return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || '') + '</svg>'; };
  KE.paintIcons = function (root) { KE.$$(root || document, '[data-ic]').forEach(function (e) { e.insertAdjacentHTML('afterbegin', KE.icon(e.getAttribute('data-ic'))); }); };
})();
