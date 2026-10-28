/* K-Edit editors: one logic for both layouts. Desktop and phone pages only differ in markup and CSS. */
(function () {
  'use strict';
  var $ = KE.$, $$ = KE.$$;
  function chips(root, attr, fn) {
    $$(root, '[' + attr + ']').forEach(function (b) {
      b.addEventListener('click', function () {
        $$(root, '[' + attr + ']').forEach(function (x) { x.classList.toggle('sel', x === b); x.setAttribute('aria-pressed', x === b); });
        fn(b.getAttribute(attr), b);
      });
    });
  }
  function selChip(root, attr, val) { $$(root, '[' + attr + ']').forEach(function (x) { var on = x.getAttribute(attr) === String(val); x.classList.toggle('sel', on); x.setAttribute('aria-pressed', on); }); }
  function act(root, name, fn) { $$(root, '[data-act="' + name + '"]').forEach(function (b) { b.addEventListener('click', fn); }); }
  function aspectOf(v, o) { if (v === 'free') return null; if (v === 'orig') return o.w / o.h; var p = v.split(':'); return (+p[0]) / (+p[1]); }


  /* effects gallery: live thumbnails of the current picture with every look */
  var TW = 168, TH = 112;
  function FxStrip(root, onPick) {
    this.el = $(root, '[data-el=fxstrip]'); this.root = root; this.sel = 0; this.onPick = onPick;
    if (!this.el) return;
    var h = '', names = ['بدون افکت'].concat(KE.FX.names);
    names.forEach(function (n, i) { h += '<button class="fxi' + (i ? '' : ' sel') + '" data-fx="' + i + '" aria-pressed="' + (i ? 'false' : 'true') + '" title="' + n + '"><canvas width="' + TW + '" height="' + TH + '"></canvas><span>' + n + '</span></button>'; });
    this.el.innerHTML = h;
    var me = this;
    $$(this.el, '[data-fx]').forEach(function (b) { b.addEventListener('click', function () { me.pick(+b.getAttribute('data-fx')); }); });
    this.el.addEventListener('wheel', function (e) { if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && me.el.scrollWidth > me.el.clientWidth) { e.preventDefault(); me.el.scrollLeft -= e.deltaY; } }, { passive: false });
  }
  FxStrip.prototype.pick = function (i, silent) {
    this.sel = i;
    $$(this.el, '[data-fx]').forEach(function (b) { var on = +b.getAttribute('data-fx') === i; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on); });
    $$(this.root, '[data-el=fxName]').forEach(function (e) { e.textContent = i ? KE.FX.names[i - 1] : 'بدون افکت'; });
    this.root.classList.toggle('has-fx', i > 0);
    if (!silent) this.onPick(i);
  };
  // draw(ctx, w, h) paints the plain picture (cover) into a thumbnail
  FxStrip.prototype.render = function (draw) {
    if (!this.el) return;
    var me = this, base = document.createElement('canvas'); base.width = TW; base.height = TH;
    var bx = base.getContext('2d', { willReadFrequently: true });
    try { draw(bx, TW, TH); } catch (e) { return; }
    var src = bx.getImageData(0, 0, TW, TH), g = (this.g = (this.g || 0) + 1);
    var list = $$(this.el, '[data-fx]'), i = 0;
    (function nx() { // a few per frame keeps the screen smooth
      if (g !== me.g) return;
      for (var n = 0; n < 4 && i < list.length; n++, i++) {
        var im = new ImageData(new Uint8ClampedArray(src.data), TW, TH);
        if (i) KE.FX.apply(im.data, TW, TH, i, 1);
        list[i].querySelector('canvas').getContext('2d').putImageData(im, 0, 0);
      }
      if (i < list.length) requestAnimationFrame(nx);
    })();
  };
  function coverRect(w, h, aspect) { var cw = w, ch = cw / aspect; if (ch > h) { ch = h; cw = ch * aspect; } return { x: (w - cw) / 2, y: (h - ch) / 2, w: cw, h: ch }; }

  /* ================= image ================= */
  function ImageEditor(root, ui) {
    this.root = root; this.ui = ui; this.st = null; this.res = 0; this.qm = 'smart'; this.q = 0.85; this.aspectKey = 'free'; this.fx = 0; this.fxk = 0.5;
    var me = this;
    this.strip = new FxStrip(root, function (i) { me.fx = i; if (me.st) { me.st.fx = i; me.paint(); me.est(); } });
    this.stage = $(root, '[data-el=stage]'); this.frame = $(root, '[data-el=frame]'); this.cv = $(root, '[data-el=canvas]');
    this.crop = new KE.Crop($(root, '[data-el=crop]'), function () { me.est(); });
    chips(root, 'data-aspect', function (v) { me.aspectKey = v; if (me.st) me.crop.setAspect(aspectOf(v, KE.oriented(me.st))); });
    chips(root, 'data-res', function (v) { me.res = +v; me.est(); });
    chips(root, 'data-qm', function (v) { me.qm = v; root.classList.toggle('qm-manual', v === 'manual'); me.est(); });
    act(root, 'rotl', function () { me.turn(270); }); act(root, 'rotr', function () { me.turn(90); });
    act(root, 'fliph', function () { if (!me.st) return; me.st.fh = !me.st.fh; me.paint(); me.thumbs(); });
    act(root, 'flipv', function () { if (!me.st) return; me.st.fv = !me.st.fv; me.paint(); me.thumbs(); });
    act(root, 'resetCrop', function () { if (!me.st) return; me.aspectKey = 'free'; selChip(root, 'data-aspect', 'free'); me.crop.reset(); });
    act(root, 'resetAdj', function () { if (!me.st) return; ['bright', 'contrast', 'sat'].forEach(function (k) { me.st[k] = 100; var r = $(root, '[data-k=' + k + ']'); if (r) r.value = 100; me.lbl(k); }); me.paint(); me.thumbs(); });
    act(root, 'export', function () { me.exportNow(); });
    $$(root, 'input[data-k]').forEach(function (r) {
      r.addEventListener('input', function () {
        var k = r.getAttribute('data-k');
        if (k === 'q') { me.q = r.value / 100; me.lbl('q'); me.est(); return; }
        if (k === 'fxk') { me.fxk = r.value / 100; me.lbl('fxk'); if (me.st) { me.st.fxk = me.fxk; if (me.fx) { me.paint(); me.est(); } } return; }
        if (!me.st) return; me.st[k] = +r.value; me.lbl(k); me.paint(); me.est(); me.thumbs();
      });
    });
    var cmp = $(root, '[data-act=compare]');
    if (cmp) {
      var on = function (e) { e.preventDefault(); if (me.st) { me.raw = true; me.paint(); cmp.classList.add('sel'); } };
      var off = function () { if (me.raw) { me.raw = false; me.paint(); cmp.classList.remove('sel'); } };
      cmp.addEventListener('pointerdown', on); cmp.addEventListener('pointerup', off); cmp.addEventListener('pointerleave', off); cmp.addEventListener('pointercancel', off);
    }
    window.addEventListener('resize', function () { me.layout(); });
    this.lbl('q'); this.lbl('fxk');
  }
  ImageEditor.prototype.thumbs = function () {
    var me = this; clearTimeout(this.tt);
    this.tt = setTimeout(function () {
      if (!me.st) return; var o = KE.oriented(me.st);
      me.strip.render(function (x, w, h) { KE.drawImg(x, me.st, coverRect(o.w, o.h, w / h), w, h); });
    }, 120);
  };
  ImageEditor.prototype.lbl = function (k) {
    var r = $(this.root, '[data-k=' + k + ']'), o = $(this.root, '[data-v=' + k + ']');
    if (r && o) o.textContent = (k === 'q' || k === 'fxk') ? KE.fa(r.value) : (r.value > 100 ? '+' : '') + KE.fa(r.value - 100);
  };
  ImageEditor.prototype.open = function (file) {
    var me = this;
    me.ui.busy('در حال باز کردن عکس', -1);
    return KE.loadImage(file).then(function (im) {
      if (me.st && me.st.bmp.close) me.st.bmp.close();
      me.st = { bmp: im.bmp, w: im.w, h: im.h, rot: 0, fh: false, fv: false, bright: 100, contrast: 100, sat: 100, name: im.name, size: im.size, type: im.type, fx: me.fx, fxk: me.fxk };
      ['bright', 'contrast', 'sat'].forEach(function (k) { var r = $(me.root, '[data-k=' + k + ']'); if (r) r.value = 100; me.lbl(k); });
      me.root.classList.add('has-file'); me.ui.idle();
      var nm = $(me.root, '[data-el=name]'); if (nm) nm.textContent = im.name;
      var inf = $(me.root, '[data-el=info]'); if (inf) inf.textContent = KE.dims(im.w, im.h) + ' · ' + KE.size(im.size);
      requestAnimationFrame(function () { me.layout(true); me.thumbs(); });
      return true;
    }, function () { me.ui.idle(); me.ui.toast('این فرمت عکس باز نمی‌شود؛ JPG، PNG یا WebP بدهید', 'err'); return false; });
  };
  ImageEditor.prototype.close = function () { if (this.st && this.st.bmp.close) this.st.bmp.close(); this.st = null; this.root.classList.remove('has-file'); };
  ImageEditor.prototype.turn = function (deg) {
    if (!this.st) return; this.st.rot = (this.st.rot + deg) % 360; this.layout(true); this.thumbs();
  };
  ImageEditor.prototype.layout = function (resetCrop) {
    if (!this.st || !this.stage.clientWidth) return;
    var o = KE.oriented(this.st), pad = 8, bw = this.stage.clientWidth - pad * 2, bh = this.stage.clientHeight - pad * 2;
    var k = Math.min(bw / o.w, bh / o.h, 4), w = Math.max(1, Math.floor(o.w * k)), h = Math.max(1, Math.floor(o.h * k));
    this.frame.style.width = w + 'px'; this.frame.style.height = h + 'px';
    var dpr = Math.min(2, window.devicePixelRatio || 1), cw = Math.min(o.w, Math.round(w * dpr)), ch = Math.min(o.h, Math.round(h * dpr));
    if (this.cv.width !== cw || this.cv.height !== ch) { this.cv.width = cw; this.cv.height = ch; }
    if (resetCrop) { this.crop.setNatural(o.w, o.h); if (this.aspectKey !== 'free') this.crop.setAspect(aspectOf(this.aspectKey, o), true); }
    else this.crop.setNatural(o.w, o.h, true);
    this.paint(); this.est();
  };
  ImageEditor.prototype.paint = function () {
    var me = this; if (!me.st || me.pending) return; me.pending = true;
    requestAnimationFrame(function () {
      me.pending = false; if (!me.st) return;
      var o = KE.oriented(me.st), x = me.cv.getContext('2d'); x.clearRect(0, 0, me.cv.width, me.cv.height);
      KE.drawImg(x, me.st, { x: 0, y: 0, w: o.w, h: o.h }, me.cv.width, me.cv.height, me.raw);
      if (!me.raw && me.st.fx) KE.FX.canvas(me.cv, me.st.fx, me.st.fxk);
    });
  };
  ImageEditor.prototype.est = function () {
    if (!this.st) return;
    var me = this, crop = this.crop.rect(), out = KE.outSize(crop, this.res), o = KE.oriented(this.st);
    var info = { inW: o.w, inH: o.h, inSize: this.st.size, outW: out.w, outH: out.h, outSize: null };
    KE.UI.showEst(this.root, info);
    clearTimeout(this.et); var g = (this.eg = (this.eg || 0) + 1);
    this.et = setTimeout(function () {
      if (me.ui.isBusy() || !me.st) return;
      KE.estimateWebP(me.st, crop, me.res, me.qm, me.q).then(function (n) {
        if (g === me.eg && me.st) { info.outSize = n; KE.UI.showEst(me.root, info); }
      }).catch(function () {});
    }, 450);
  };
  ImageEditor.prototype.exportNow = function () {
    var me = this; if (!me.st || me.ui.isBusy()) return;
    var crop = me.crop.rect();
    me.ui.busy(me.qm === 'smart' ? 'یافتن کمترین حجم بی‌افت' : 'ساخت WebP', me.qm === 'smart' ? 0 : -1);
    setTimeout(function () {
      var c = KE.renderOut(me.st, crop, me.res), p, o = KE.oriented(me.st);
      if (me.qm === 'lossless') p = KE.webp(c, 1).then(function (b) { return { blob: b, q: 1 }; });
      else if (me.qm === 'manual') p = KE.webp(c, me.q).then(function (b) { return { blob: b, q: me.q }; });
      else p = KE.smartWebP(c, 42, function (f) { me.ui.progress(f); });
      p.then(function (r) {
        me.ui.idle();
        me.ui.result({ kind: 'image', blob: r.blob, url: URL.createObjectURL(r.blob), w: c.width, h: c.height, inW: o.w, inH: o.h, orig: me.st.size, origType: me.st.type,
          name: KE.baseName(me.st.name) + '-kedit.webp', mode: me.qm, q: r.q });
      }, function () { me.ui.idle(); me.ui.toast('ساخت WebP انجام نشد؛ دوباره امتحان کنید', 'err'); });
    }, 30);
  };

  /* ================= video ================= */
  function VideoEditor(root, ui) {
    this.root = root; this.ui = ui; this.v = $(root, '[data-el=video]'); this.stage = $(root, '[data-el=stage]'); this.frame = $(root, '[data-el=frame]');
    this.fps = 15; this.res = 480; this.gq = 'balanced'; this.speed = 1; this.loop = true; this.aspectKey = 'free'; this.a = 0; this.b = 0; this.ready = false;
    this.fmt = 'gif'; this.fx = 0; this.fxk = 0.5; this.fxcv = $(root, '[data-el=fxcv]');
    var me = this, v = this.v;
    this.strip = new FxStrip(root, function (i) { me.fx = i; me.drawFx(); me.est(); });
    chips(root, 'data-fmt', function (val) { me.fmt = val; me.fmtUi(); me.est(); });
    $$(root, 'input[data-k=fxk]').forEach(function (r) { r.addEventListener('input', function () { me.fxk = r.value / 100; me.lbl(); me.drawFx(); me.est(); }); });
    v.addEventListener('seeked', function () { me.drawFx(); if (v.paused) me.thumbs(); });
    v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto';
    this.crop = new KE.Crop($(root, '[data-el=crop]'), function () { me.est(); });
    this.trim = new KE.Trim($(root, '[data-el=trim]'), {
      onSeek: function (t) { if (!v.paused) v.pause(); me.seekTo(t); },
      onChange: function (a, b) { me.a = a; me.b = b; me.times(); me.est(); }
    });
    chips(root, 'data-aspect', function (val) { me.aspectKey = val; if (me.ready) me.crop.setAspect(aspectOf(val, { w: v.videoWidth, h: v.videoHeight })); });
    chips(root, 'data-fps', function (val) { me.fps = +val; me.est(); });
    chips(root, 'data-res', function (val) { me.res = +val; me.est(); });
    chips(root, 'data-gq', function (val) { me.gq = val; me.est(); });
    chips(root, 'data-speed', function (val) { me.speed = +val; me.est(); });
    act(root, 'loop', function (e) { me.loop = !me.loop; me.est(); e.currentTarget.classList.toggle('sel', me.loop); e.currentTarget.setAttribute('aria-pressed', me.loop); });
    act(root, 'resetCrop', function () { if (!me.ready) return; me.aspectKey = 'free'; selChip(root, 'data-aspect', 'free'); me.crop.reset(); });
    act(root, 'play', function () { me.toggle(); });
    act(root, 'setA', function () { if (me.ready) me.trim.setRange(v.currentTime, me.b); });
    act(root, 'setB', function () { if (me.ready) me.trim.setRange(me.a, v.currentTime); });
    act(root, 'stepB', function () { me.step(-1); }); act(root, 'stepF', function () { me.step(1); });
    act(root, 'goA', function () { if (me.ready) { v.pause(); me.seekTo(me.a); } });
    act(root, 'goB', function () { if (me.ready) { v.pause(); me.seekTo(me.b); } });
    act(root, 'resetTrim', function () { if (me.ready) me.trim.setRange(0, me.dur); });
    act(root, 'export', function () { me.exportNow(); });
    v.addEventListener('play', function () { root.classList.add('playing'); me.loopTick(); });
    v.addEventListener('pause', function () { root.classList.remove('playing'); });
    v.addEventListener('timeupdate', function () { me.cur(); });
    window.addEventListener('resize', function () { me.layout(); });
    this.lbl(); this.fmtUi();
  }
  VideoEditor.prototype.lbl = function () { var r = $(this.root, '[data-k=fxk]'), o = $(this.root, '[data-v=fxk]'); if (r && o) o.textContent = KE.fa(r.value); };
  VideoEditor.prototype.fmtUi = function () {
    var w = this.fmt === 'webp';
    $$(this.root, '[data-el=expLbl]').forEach(function (e) { e.textContent = w ? 'ساخت WebP' : 'ساخت GIF'; });
    $$(this.root, '.bar-t').forEach(function (e) { e.textContent = w ? 'ویدیو به WebP متحرک' : 'ویدیو به GIF'; });
    $$(this.root, '[data-el=fmtHint]').forEach(function (e) { e.textContent = w ? 'حدود ۴ برابر سبک‌تر؛ مخصوص سایت' : 'همه‌جا باز می‌شود؛ حجم بیشتر'; });
  };
  // live look on the video: a canvas copy of the current frame sits over the player
  VideoEditor.prototype.drawFx = function () {
    var c = this.fxcv, v = this.v; if (!c || !this.ready) return;
    if (!this.fx || !(this.fxk > 0)) { c.hidden = true; return; }
    var fw = this.frame.clientWidth, fh = this.frame.clientHeight; if (!fw || !fh) return;
    var dpr = Math.min(1.5, window.devicePixelRatio || 1), w = Math.min(v.videoWidth, Math.round(fw * dpr)), h = Math.min(v.videoHeight, Math.round(fh * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    var x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(v, 0, 0, w, h);
    KE.FX.canvas(c, this.fx, this.fxk); c.hidden = false;
  };
  VideoEditor.prototype.thumbs = function () {
    var me = this; clearTimeout(this.tt);
    this.tt = setTimeout(function () {
      var v = me.v; if (!me.ready || !v.videoWidth) return;
      me.strip.render(function (x, w, h) { var r = coverRect(v.videoWidth, v.videoHeight, w / h); x.drawImage(v, r.x, r.y, r.w, r.h, 0, 0, w, h); });
    }, 350);
  };
  VideoEditor.prototype.open = function (file) {
    var me = this, v = me.v;
    me.ui.busy('در حال باز کردن ویدیو', -1);
    if (me.url) URL.revokeObjectURL(me.url);
    me.url = URL.createObjectURL(file); me.ready = false; me.file = file;
    if (!me.ev) { me.ev = document.createElement('video'); me.ev.muted = true; me.ev.playsInline = true; me.ev.preload = 'auto'; }
    me.ev.src = me.url;
    return new Promise(function (res) {
      var t = setTimeout(fail, 15000);
      function fail() { clearTimeout(t); me.ui.idle(); me.ui.toast('این ویدیو باز نمی‌شود؛ MP4 یا WebM بدهید', 'err'); res(false); }
      v.onerror = fail;
      v.onloadeddata = function () {
        v.onloadeddata = null; v.onerror = null; clearTimeout(t);
        var go = function () {
          me.dur = v.duration; me.ready = true;
          me.a = 0; me.b = me.dur <= 12 ? me.dur : 6;
          me.root.classList.add('has-file'); me.ui.idle();
          var nm = $(me.root, '[data-el=name]'); if (nm) nm.textContent = file.name || 'video';
          var inf = $(me.root, '[data-el=info]'); if (inf) inf.textContent = KE.dims(v.videoWidth, v.videoHeight) + ' · ' + KE.time(me.dur) + ' · ' + KE.size(file.size || 0);
          requestAnimationFrame(function () {
            me.layout(true); me.trim.set(me.dur, me.a, me.b); me.trim.setT(0); me.times(); me.cur();
            me.trim.thumbs(me.url, v.videoWidth, v.videoHeight);
            me.drawFx(); me.thumbs();
          });
          res(true);
        };
        if (!isFinite(v.duration)) { // some recorded webm files report no duration until the end is read
          v.addEventListener('durationchange', function h() { if (isFinite(v.duration)) { v.removeEventListener('durationchange', h); KE.seek(v, 0).then(go); } });
          v.currentTime = 1e7;
        } else go();
      };
      v.src = me.url; v.load();
    });
  };
  VideoEditor.prototype.close = function () { this.eg = (this.eg || 0) + 1; if (this.ev) { this.ev.removeAttribute('src'); this.ev.load(); } this.v.pause(); this.v.removeAttribute('src'); this.v.load(); this.ready = false; if (this.fxcv) this.fxcv.hidden = true; this.root.classList.remove('has-file'); if (this.url) URL.revokeObjectURL(this.url); this.url = null; };
  VideoEditor.prototype.layout = function (resetCrop) {
    if (!this.ready || !this.stage.clientWidth) return;
    var v = this.v, vw = v.videoWidth, vh = v.videoHeight, pad = 8;
    var bw = this.stage.clientWidth - pad * 2, bh = this.stage.clientHeight - pad * 2, k = Math.min(bw / vw, bh / vh, 3);
    this.frame.style.width = Math.floor(vw * k) + 'px'; this.frame.style.height = Math.floor(vh * k) + 'px';
    if (resetCrop) { this.crop.setNatural(vw, vh); if (this.aspectKey !== 'free') this.crop.setAspect(aspectOf(this.aspectKey, { w: vw, h: vh }), true); }
    else this.crop.setNatural(vw, vh, true);
    this.drawFx();
    if (this.trim.el.clientWidth && Math.abs((this.thW || 0) - this.trim.el.clientWidth) > 40) { this.thW = this.trim.el.clientWidth; if (!resetCrop) this.trim.thumbs(this.url, vw, vh); }
    this.est();
  };
  VideoEditor.prototype.seekTo = function (t) { var v = this.v; t = Math.max(0, Math.min(this.dur, t)); if (v.fastSeek && Math.abs(v.currentTime - t) > 3) v.fastSeek(t); v.currentTime = t; this.trim.setT(t); this.cur(); };
  VideoEditor.prototype.step = function (d) { if (!this.ready) return; this.v.pause(); this.seekTo(this.v.currentTime + d / 30); };
  VideoEditor.prototype.toggle = function () {
    if (!this.ready) return; var v = this.v;
    if (v.paused) {
      if (v.currentTime < this.a - 0.02 || v.currentTime >= this.b - 0.03) v.currentTime = this.a;
      this.from = v.currentTime; // replay loops back to where you started, e.g. only the last 2 seconds
      v.play().catch(function () {});
    }
    else v.pause();
  };
  VideoEditor.prototype.loopTick = function () {
    var me = this, v = me.v;
    (function tk() {
      if (v.paused) return;
      if (v.currentTime >= me.b) { if (me.loop) v.currentTime = Math.max(me.a, Math.min(me.from == null ? me.a : me.from, me.b - 0.1)); else { v.pause(); v.currentTime = me.b; } }
      me.trim.setT(v.currentTime); me.cur(); if (me.fx) me.drawFx(); requestAnimationFrame(tk);
    })();
  };
  VideoEditor.prototype.times = function () {
    var s = function (k, t) { $$(this.root, '[data-el=' + k + ']').forEach(function (e) { e.innerHTML = t; }); }.bind(this);
    s('tA', KE.time(this.a)); s('tB', KE.time(this.b)); s('tLen', KE.time(this.b - this.a));
  };
  VideoEditor.prototype.cur = function () { var e = $(this.root, '[data-el=tCur]'); if (e) e.innerHTML = KE.time(this.v.currentTime); };
  VideoEditor.prototype.plan = function () { return KE.gifPlan({ crop: this.crop.rect(), res: this.res, start: this.a, end: this.b, fps: this.fps, speed: this.speed }); };
  VideoEditor.prototype.est = function () {
    if (!this.ready) return;
    var me = this, v = this.v, p = this.plan();
    var info = { inW: v.videoWidth, inH: v.videoHeight, inSize: (this.file && this.file.size) || 0, outW: p.w, outH: p.h, outSize: null };
    KE.UI.showEst(this.root, info);
    $$(this.root, '[data-el=frames]').forEach(function (e) { e.innerHTML = KE.fa(p.n) + ' فریم · ' + KE.time(p.dur); });
    clearTimeout(this.et); var g = (this.eg = (this.eg || 0) + 1);
    this.et = setTimeout(function () {
      if (me.ui.isBusy() || !me.ready) return;
      (me.fmt === 'webp' ? KE.estimateAnimWebP : KE.estimateGif)({ video: me.ev, crop: me.crop.rect(), res: me.res, start: me.a, end: me.b, fps: me.fps, speed: me.speed, quality: me.gq, fx: me.fx, fxk: me.fxk, stale: function () { return g !== me.eg; } })
        .then(function (n) { if (g === me.eg) { info.outSize = n; KE.UI.showEst(me.root, info); } }).catch(function () {});
    }, 650);
  };
  VideoEditor.prototype.exportNow = function () {
    var me = this; if (!me.ready || me.ui.isBusy()) return;
    var p = me.plan();
    if (p.n > 900) { me.ui.toast('بازه خیلی بلند است؛ کوتاه‌ترش کنید یا فریم کمتر بگذارید', 'err'); return; }
    me.eg = (me.eg || 0) + 1;
    var w = me.fmt === 'webp', fxOn = me.fx && me.fxk > 0;
    if (me.fxcv) me.fxcv.hidden = true;
    var job = (w ? KE.makeAnimWebP : KE.makeGif)({ video: me.v, crop: me.crop.rect(), res: me.res, start: me.a, end: me.b, fps: me.fps, speed: me.speed, quality: me.gq, loop: me.loop,
      fx: fxOn ? me.fx : 0, fxk: me.fxk, onProgress: function (f) { me.ui.progress(f); } });
    me.ui.busy(w ? 'ساخت WebP متحرک' : 'ساخت GIF', 0, function () { job.cancel(); });
    job.promise.then(function (blob) {
      me.ui.idle(); me.seekTo(me.a); me.drawFx();
      me.ui.result({ kind: w ? 'awebp' : 'gif', anim: true, blob: blob, url: URL.createObjectURL(blob), w: p.w, h: p.h, inW: me.v.videoWidth, inH: me.v.videoHeight, orig: me.file.size || 0, frames: p.n, dur: p.dur,
        name: KE.baseName(me.file.name) + (w ? '-kedit.webp' : '-kedit.gif') });
    }, function (e) {
      me.ui.idle(); me.seekTo(me.a);
      me.drawFx();
      if (String(e && e.message) !== 'cancel') me.ui.toast((w ? 'ساخت WebP' : 'ساخت GIF') + ' انجام نشد؛ بازه یا اندازه را کمتر کنید', 'err');
    });
  };

  KE.ImageEditor = ImageEditor; KE.VideoEditor = VideoEditor; KE.selChip = selChip;
})();
