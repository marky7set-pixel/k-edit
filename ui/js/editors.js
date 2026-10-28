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
    this.fmt = 'webp'; this.up = 0;
    var me = this;
    chips(root, 'data-ifmt', function (v) { me.fmt = v; me.fmtUi(); me.est(); });
    chips(root, 'data-up', function (v) { me.up = +v; me.upUi(); me.est(); });
    KE.avifSupport(1024, 1024).then(function (c) { me.avifOk = !!c; me.fmtUi(); });
    this.strip = new FxStrip(root, function (i) { me.fx = i; if (me.st) { me.st.fx = i; me.paint(); me.est(); } });
    this.stage = $(root, '[data-el=stage]'); this.frame = $(root, '[data-el=frame]'); this.cv = $(root, '[data-el=canvas]');
    this.crop = new KE.Crop($(root, '[data-el=crop]'), function (r, end) { me.est(); if (end) me.upUi(); });
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
      var inf = $(me.root, '[data-el=info]'); if (inf) inf.textContent = KE.dims(im.w, im.h) + ' | ' + KE.size(im.size);
      requestAnimationFrame(function () { me.layout(true); me.thumbs(); me.alpha = /png|webp|gif|avif/.test(im.type) && KE.hasAlpha((function () { var c = document.createElement('canvas'); c.width = Math.min(512, im.w); c.height = Math.round(c.width * im.h / im.w); c.getContext('2d').drawImage(im.bmp, 0, 0, c.width, c.height); return c; })()); me.fmtUi(); me.upUi(); });
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
  var FMTN = { webp: 'WebP', avif: 'AVIF', jpg: 'JPG', mp4: 'MP4', webm: 'WebM', gif: 'GIF' };
  KE.FMTN = FMTN;
  ImageEditor.prototype.fmtUi = function () {
    var r = this.root, f = this.fmt, me = this;
    $$(r, '[data-ifmt=avif]').forEach(function (b) { b.disabled = me.avifOk === false; });
    if (f === 'avif' && this.avifOk === false) { this.fmt = f = 'webp'; selChip(r, 'data-ifmt', 'webp'); }
    $$(r, '[data-el=expLbl]').forEach(function (e) { e.textContent = 'ساخت ' + FMTN[f]; });
    $$(r, '[data-qm=lossless]').forEach(function (b) { b.hidden = f !== 'webp'; });
    if (f !== 'webp' && this.qm === 'lossless') { this.qm = 'smart'; selChip(r, 'data-qm', 'smart'); r.classList.remove('qm-manual'); }
    var note = this.avifOk === false && f === 'webp' ? '' : (f !== 'webp' && this.st && this.alpha ? 'پس‌زمینهٔ شفاف سفید می‌شود' : '');
    $$(r, '[data-el=fmtNote]').forEach(function (e) { e.textContent = note; e.hidden = !note; });
  };
  ImageEditor.prototype.upUi = function () {
    var r = this.root, me = this, up = this.up;
    $$(r, '[data-el=resSec]').forEach(function (e) { e.classList.toggle('dim', up > 0); });
    $$(r, '[data-el=resNote]').forEach(function (e) { e.textContent = up ? 'با ارتقا خاموش است' : 'بزرگ‌تر از اصل = بزرگ‌نمایی ساده'; });
    if (!this.st) return;
    var crop = this.crop.rect(), px = crop.w * crop.h;
    KE.Up.speed().then(function (sp) {
      var lim = KE.Up.limits(sp.kind), big = px > lim.inPx, msg;
      $$(r, '[data-up]').forEach(function (b) { var k = +b.getAttribute('data-up'); b.disabled = k > 0 && (big || Math.max(crop.w, crop.h) * k > lim.outSide); });
      if (up && $(r, '[data-up="' + up + '"]').disabled) { me.up = up = 0; selChip(r, 'data-up', '0'); me.upUi(); me.est(); return; }
      if (big) msg = 'عکس بزرگ است؛ ارتقا برای عکس تا ' + KE.fa((lim.inPx / 1e6).toFixed(lim.inPx < 1e6 ? 2 : 1)) + ' مگاپیکسل';
      else if (up) { var o = KE.imgOutSize(crop, 0, up); msg = 'هوش مصنوعی | خروجی ' + KE.dims(o.w, o.h) + (sp.kind === 'cpu' ? ' | حالت کند' : ''); }
      else msg = 'هوش مصنوعی | جزئیات تازه می‌سازد';
      $$(r, '[data-el=upNote]').forEach(function (e) { e.innerHTML = msg; });
    }, function () {
      $$(r, '[data-up]').forEach(function (b) { b.disabled = +b.getAttribute('data-up') > 0; });
      $$(r, '[data-el=upNote]').forEach(function (e) { e.textContent = 'ارتقا روی این دستگاه در دسترس نیست'; });
    });
  };
  KE.etaText = function (ms) { if (ms == null) return '—'; var s = ms / 1000; return s < 1 ? 'کمتر از ۱ ثانیه' : s < 60 ? 'حدود ' + KE.fa(Math.round(s)) + ' ثانیه' : 'حدود ' + KE.fa(Math.round(s / 60)) + ' دقیقه'; };
  KE.setEta = function (root, ms) { $$(root, '[data-el=eta] i').forEach(function (e) { e.textContent = KE.etaText(ms); }); };
  ImageEditor.prototype.est = function () {
    if (!this.st) return;
    var me = this, crop = this.crop.rect(), out = KE.imgOutSize(crop, this.res, this.up), o = KE.oriented(this.st);
    var info = { inW: o.w, inH: o.h, inSize: this.st.size, outW: out.w, outH: out.h, outSize: null };
    KE.UI.showEst(this.root, info); KE.setEta(this.root, null);
    clearTimeout(this.et); var g = (this.eg = (this.eg || 0) + 1), up = this.up, fmt = this.fmt;
    this.et = setTimeout(function () {
      if (me.ui.isBusy() || !me.st) return;
      Promise.all([KE.estimateImg(me.st, crop, me.res, me.qm, me.q, fmt, up), up ? KE.Up.speed() : null]).then(function (a) {
        if (g !== me.eg || !me.st) return;
        info.outSize = a[0].size; KE.UI.showEst(me.root, info);
        KE.setEta(me.root, a[0].ms + (up ? crop.w * crop.h / a[1].pxs * 1000 + 400 : 0));
      }).catch(function () {});
    }, 450);
  };
  ImageEditor.prototype.exportNow = function () {
    var me = this; if (!me.st || me.ui.isBusy()) return;
    var crop = me.crop.rect(), fmt = me.fmt, up = me.up, t0 = performance.now(), cancelled = false, o = KE.oriented(me.st);
    me.ui.busy(up ? 'ارتقا با هوش مصنوعی' : (me.qm === 'smart' ? 'یافتن کمترین حجم بی‌افت' : 'ساخت ' + FMTN[fmt]), up || me.qm === 'smart' ? 0 : -1, up ? function () { cancelled = true; } : null);
    setTimeout(function () {
      var p;
      if (up) {
        var fxOld = me.st.fx; me.st.fx = 0; var base = KE.renderOut(me.st, crop, 0); me.st.fx = fxOld; var tUp = performance.now();
        p = KE.Up.speed().then(function (sp) {
          return KE.Up.run(base, up, function (f, d, n) {
            me.ui.progress(f * 0.92);
            var left = (performance.now() - tUp) / Math.max(1, d) * (n - d);
            me.ui.sub('قطعهٔ ' + KE.fa(d) + ' از ' + KE.fa(n) + ' | ' + KE.etaText(left).replace('حدود ', 'حدود ') + ' مانده');
          }, function () { return cancelled; });
        }).then(function (c) {
          base.width = base.height = 1;
          if (me.st.fx && me.st.fxk > 0) KE.FX.canvas(c, me.st.fx, me.st.fxk);
          me.ui.sub(''); me.ui.label('ساخت ' + FMTN[fmt]); return c;
        });
      } else p = Promise.resolve(KE.renderOut(me.st, crop, me.res));
      p.then(function (c) {
        var cc = fmt === 'webp' ? c : KE.flatten(c), q;
        if (me.qm === 'lossless' && fmt === 'webp') q = KE.webp(cc, 1).then(function (b) { return { blob: b, q: 1 }; });
        else if (me.qm === 'manual') q = KE.encodeImg(cc, fmt, me.q).then(function (b) { return { blob: b, q: me.q }; });
        else q = KE.smartEncode(cc, fmt, 42, function (f) { me.ui.progress(up ? 0.92 + f * 0.08 : f); });
        return q.then(function (r) {
          var before = KE.beforeCanvas(me.st, crop, c.width, c.height);
          me.ui.idle();
          me.ui.result({ kind: 'image', fmt: fmt, blob: r.blob, url: URL.createObjectURL(r.blob), w: c.width, h: c.height, inW: o.w, inH: o.h, cropW: crop.w, cropH: crop.h, orig: me.st.size, origType: me.st.type,
            name: KE.baseName(me.st.name) + '-kedit.' + (fmt === 'jpg' ? 'jpg' : fmt), mode: me.qm, q: r.q, up: up, ms: performance.now() - t0, before: before });
          if (cc !== c) cc.width = cc.height = 1;
        });
      }).catch(function (e) {
        me.ui.idle(); me.ui.sub('');
        if (String(e && e.message) === 'cancel') return;
        me.ui.toast(up ? 'ارتقا انجام نشد؛ عکس کوچک‌تری بدهید یا ۲× را بزنید' : 'ساخت ' + FMTN[fmt] + ' انجام نشد؛ دوباره امتحان کنید', 'err');
      });
    }, 30);
  };
  // the "before" side of the comparison: the original crop, no edits, at the output size
  KE.beforeCanvas = function (st, crop, w, h) {
    var k = Math.min(1, 4096 / Math.max(w, h)), c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
    KE.drawImg(c.getContext('2d'), st, crop, c.width, c.height, true); return c;
  };

  /* ================= video ================= */
  function VideoEditor(root, ui) {
    this.root = root; this.ui = ui; this.v = $(root, '[data-el=video]'); this.stage = $(root, '[data-el=stage]'); this.frame = $(root, '[data-el=frame]');
    this.fps = 30; this.res = 480; this.gq = 'balanced'; this.speed = 1; this.loop = true; this.aspectKey = 'free'; this.a = 0; this.b = 0; this.ready = false;
    this.fmt = 'mp4'; this.fx = 0; this.fxk = 0.5; this.fxcv = $(root, '[data-el=fxcv]'); this.sound = true;
    this.fps = 30;
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
    root.addEventListener('click', function (e) { var b = e.target.closest('[data-fps]'); if (!b || !root.contains(b)) return; me.fps = +b.getAttribute('data-fps'); selChip(root, 'data-fps', me.fps); me.est(); });
    act(root, 'sound', function (e) { me.sound = !me.sound; e.currentTarget.classList.toggle('sel', me.sound); e.currentTarget.setAttribute('aria-pressed', me.sound); me.est(); });
    chips(root, 'data-res', function (val) { me.res = +val; me.est(); });
    chips(root, 'data-gq', function (val) { me.gq = val; me.est(); });
    chips(root, 'data-speed', function (val) { me.speed = +val; me.fmtUi(); me.est(); });
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
  var FPS = { vid: [15, 24, 30, 60], anim: [10, 12, 15, 20, 25, 30, 50] };
  VideoEditor.prototype.fmtUi = function () {
    var r = this.root, f = this.fmt, vid = f === 'mp4' || f === 'webm', me = this, list = vid ? FPS.vid : FPS.anim;
    if (list.indexOf(this.fps) < 0) this.fps = vid ? 30 : 15;
    $$(r, '[data-el=fpsBox]').forEach(function (box) {
      if (box.getAttribute('data-set') !== (vid ? 'v' : 'a')) { box.setAttribute('data-set', vid ? 'v' : 'a'); box.innerHTML = list.map(function (v) { return '<button class="chip" data-fps="' + v + '">' + KE.fa(v) + '</button>'; }).join(''); }
    });
    selChip(r, 'data-fps', this.fps);
    $$(r, '[data-el=expLbl]').forEach(function (e) { e.textContent = 'ساخت ' + (f === 'webp' ? 'WebP' : KE.FMTN[f]); });
    $$(r, '[data-act=sound]').forEach(function (b) { b.hidden = !vid; b.disabled = Math.abs(me.speed - 1) > 1e-3; });
    $$(r, '[data-act=loop]').forEach(function (b) { b.hidden = vid; });
    var note = vid && me.sound && Math.abs(me.speed - 1) > 1e-3 ? 'با تغییر سرعت، بی‌صدا' : (me.unsup && me.unsup[f] ? 'این دستگاه ' + KE.FMTN[f] + ' نمی‌سازد' : '');
    $$(r, '[data-el=fmtNote]').forEach(function (e) { e.textContent = note; e.hidden = !note; });
    $$(r, '[data-fmt]').forEach(function (b) { var k = b.getAttribute('data-fmt'); b.classList.toggle('off', !!(me.unsup && me.unsup[k])); });
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
          var inf = $(me.root, '[data-el=info]'); if (inf) inf.textContent = KE.dims(v.videoWidth, v.videoHeight) + ' | ' + KE.time(me.dur) + ' | ' + KE.size(file.size || 0);
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
  // ms per frame per megapixel, learned from real runs on this device
  var SPD = { mp4: 18, webm: 30, webp: 55, gif: 110 };
  try { var sv = JSON.parse(localStorage.getItem('ke-spd') || '{}'); for (var k in sv) SPD[k] = sv[k]; } catch (e) {}
  KE.learnSpeed = function (fmt, ms, frames, px) { var v = ms / Math.max(1, frames) / Math.max(0.05, px / 1e6); SPD[fmt] = Math.round((SPD[fmt] * 0.4 + v * 0.6) * 10) / 10; try { localStorage.setItem('ke-spd', JSON.stringify(SPD)); } catch (e) {} };
  VideoEditor.prototype.est = function () {
    if (!this.ready) return;
    var me = this, v = this.v, p = this.plan(), f = this.fmt;
    var info = { inW: v.videoWidth, inH: v.videoHeight, inSize: (this.file && this.file.size) || 0, outW: p.w, outH: p.h, outSize: null };
    KE.UI.showEst(this.root, info);
    $$(this.root, '[data-el=frames]').forEach(function (e) { e.innerHTML = KE.fa(p.n) + ' فریم | ' + KE.time(p.dur); });
    KE.setEta(this.root, p.n * SPD[f] * Math.max(0.05, p.w * p.h / 1e6) + 300);
    clearTimeout(this.et); var g = (this.eg = (this.eg || 0) + 1);
    var o = { video: me.ev, file: me.file, crop: me.crop.rect(), res: me.res, start: me.a, end: me.b, fps: me.fps, speed: me.speed, quality: me.gq, fx: me.fx, fxk: me.fxk, format: f, sound: me.sound, stale: function () { return g !== me.eg; } };
    this.et = setTimeout(function () {
      if (me.ui.isBusy() || !me.ready) return;
      var q = f === 'mp4' || f === 'webm' ? KE.estimateVideo(o).then(function (r) {
        me.unsup = me.unsup || {}; var was = !!me.unsup[f]; me.unsup[f] = !!r.unsupported; if (was !== me.unsup[f]) me.fmtUi(); return r.size;
      }) : (f === 'webp' ? KE.estimateAnimWebP : KE.estimateGif)(o);
      q.then(function (n) { if (g === me.eg && n != null) { info.outSize = n; KE.UI.showEst(me.root, info); } }).catch(function () {});
    }, 650);
  };
  VideoEditor.prototype.exportNow = function () {
    var me = this; if (!me.ready || me.ui.isBusy()) return;
    var p = me.plan(), f = me.fmt, vid = f === 'mp4' || f === 'webm', lim = vid ? 7200 : 900;
    if (me.unsup && me.unsup[f]) { me.ui.toast('این دستگاه ' + KE.FMTN[f] + ' نمی‌سازد؛ قالب دیگری بزنید', 'err'); return; }
    if (p.n > lim) { me.ui.toast('بازه خیلی بلند است؛ کوتاه‌ترش کنید یا فریم کمتر بگذارید', 'err'); return; }
    me.eg = (me.eg || 0) + 1; me.v.pause();
    var fxOn = me.fx && me.fxk > 0, t0 = performance.now();
    if (me.fxcv) me.fxcv.hidden = true;
    var o = { video: me.v, file: me.file, crop: me.crop.rect(), res: me.res, start: me.a, end: me.b, fps: me.fps, speed: me.speed, quality: me.gq, loop: me.loop, sound: me.sound, format: f,
      fx: fxOn ? me.fx : 0, fxk: me.fxk, onProgress: function (x) { me.ui.progress(x); } };
    var job = vid ? KE.makeVideo(o) : f === 'webp' ? KE.makeAnimWebP(o) : KE.makeGif(o);
    me.ui.busy('ساخت ' + (f === 'webp' ? 'WebP متحرک' : KE.FMTN[f]), 0, function () { job.cancel(); });
    job.promise.then(function (res) {
      var blob = res.blob || res, ms = performance.now() - t0;
      KE.learnSpeed(f, ms, p.n, p.w * p.h);
      me.ui.idle(); me.seekTo(me.a); me.drawFx();
      me.ui.result({ kind: vid ? 'video' : (f === 'webp' ? 'awebp' : 'gif'), fmt: f, anim: true, blob: blob, url: URL.createObjectURL(blob), w: p.w, h: p.h, inW: me.v.videoWidth, inH: me.v.videoHeight,
        orig: me.file.size || 0, origType: me.file.type, origName: me.file.name, frames: p.n, fps: me.fps, dur: p.dur, ms: ms, audio: vid ? !!res.audio : false, soundAsked: vid && me.sound,
        name: KE.baseName(me.file.name) + '-kedit.' + (f === 'webp' ? 'webp' : f) });
    }, function (e) {
      me.ui.idle(); me.seekTo(me.a); me.drawFx();
      var m = String(e && e.message);
      if (m === 'cancel') return;
      if (m === 'nocodec') { me.unsup = me.unsup || {}; me.unsup[f] = true; me.fmtUi(); me.ui.toast('این دستگاه ' + KE.FMTN[f] + ' نمی‌سازد؛ قالب دیگری بزنید', 'err'); return; }
      me.ui.toast('ساخت ' + KE.FMTN[f] + ' انجام نشد؛ بازه یا اندازه را کمتر کنید', 'err');
    });
  };

  KE.ImageEditor = ImageEditor; KE.VideoEditor = VideoEditor; KE.selChip = selChip;
})();
