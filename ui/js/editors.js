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
    this.fmt = 'webp'; this.up = 0; this.keep = KE.pref('keep') === '1';
    var me = this;
    chips(root, 'data-ifmt', function (v) { me.fmt = v; me.fmtUi(); me.est(); });
    chips(root, 'data-up', function (v) { me.up = +v; me.upUi(); me.est(); });
    chips(root, 'data-ais', function (v) { KE.Up.setStrength(v); KE.pref('ais', v); me.upUi(); });
    selChip(root, 'data-ais', KE.Up.strength);
    act(root, 'keep', function () { me.keep = !me.keep; KE.pref('keep', me.keep ? '1' : '0'); me.upUi(); me.est(); });
    KE.avifSupport(1024, 1024).then(function (c) { me.avifOk = !!c; me.fmtUi(); });
    this.strip = new FxStrip(root, function (i) { me.fx = i; if (me.st) { me.st.fx = i; me.paint(); me.est(); } });
    this.stage = $(root, '[data-el=stage]'); this.frame = $(root, '[data-el=frame]'); this.cv = $(root, '[data-el=canvas]');
    this.crop = new KE.Crop($(root, '[data-el=crop]'), function (r, end) { if (end) me.upUi(); me.est(); });
    chips(root, 'data-aspect', function (v) { me.aspectKey = v; if (me.st) me.crop.setAspect(aspectOf(v, KE.oriented(me.st))); });
    chips(root, 'data-res', function (v) { me.res = +v; me.upUi(); me.est(); });
    chips(root, 'data-qm', function (v) { me.qm = v; root.classList.toggle('qm-manual', v === 'manual'); me.vals(); me.est(); });
    act(root, 'rotl', function () { me.turn(270); }); act(root, 'rotr', function () { me.turn(90); });
    act(root, 'fliph', function () { if (!me.st) return; me.st.fh = !me.st.fh; me.paint(); me.thumbs(); });
    act(root, 'flipv', function () { if (!me.st) return; me.st.fv = !me.st.fv; me.paint(); me.thumbs(); });
    act(root, 'resetCrop', function () { if (!me.st) return; me.aspectKey = 'free'; selChip(root, 'data-aspect', 'free'); me.crop.reset(); });
    act(root, 'resetAdj', function () { if (!me.st) return; ['bright', 'contrast', 'sat'].forEach(function (k) { me.st[k] = 100; var r = $(root, '[data-k=' + k + ']'); if (r) r.value = 100; me.lbl(k); }); me.paint(); me.thumbs(); });
    act(root, 'export', function () { me.exportNow(); });
    $$(root, 'input[data-k]').forEach(function (r) {
      r.addEventListener('input', function () {
        var k = r.getAttribute('data-k');
        if (k === 'q') { me.q = r.value / 100; me.lbl('q'); me.vals(); me.est(); return; }
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
    this.zoomable();
    this.hist = new History(this);
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
      $$(me.root, '[data-el=name]').forEach(function (e) { e.textContent = im.name; });
      $$(me.root, '[data-el=info]').forEach(function (e) { e.textContent = KE.dims(im.w, im.h) + ' | ' + KE.size(im.size); });
      $$(me.root, '[data-el=infoS]').forEach(function (e) { e.textContent = KE.dims(im.w, im.h) + ' | ' + KE.size(im.size); });
      me.ambUrl = KE.ambOf(im.bmp, im.w, im.h); KE.setAmb(me.ambUrl);
      requestAnimationFrame(function () { me.layout(true); me.thumbs(); me.hist.reset(); me.alpha = /png|webp|gif|avif/.test(im.type) && KE.hasAlpha((function () { var c = document.createElement('canvas'); c.width = Math.min(512, im.w); c.height = Math.round(c.width * im.h / im.w); c.getContext('2d').drawImage(im.bmp, 0, 0, c.width, c.height); return c; })()); me.fmtUi(); me.upUi(); });
      return true;
    }, function () { me.ui.idle(); me.ui.toast('این فرمت عکس باز نمی‌شود؛ JPG، PNG یا WebP بدهید', 'err'); return false; });
  };
  ImageEditor.prototype.close = function () { if (this.st && this.st.bmp.close) this.st.bmp.close(); this.st = null; this.ambUrl = null; this.root.classList.remove('has-file'); };
  ImageEditor.prototype.turn = function (deg) {
    if (!this.st) return; this.st.rot = (this.st.rot + deg) % 360; this.layout(true); this.thumbs();
  };
  // outside the crop tool the picture is shown already cut, as it will come out
  function cview(ed) { var t = ed.root.getAttribute('data-tool'), on = t !== 'edit' && t !== 'crop' && !ed.crop.isFull(); ed.root.classList.toggle('cview', on); return on; }
  ImageEditor.prototype.layout = function (resetCrop) {
    if (!this.st || !this.stage.clientWidth) return;
    var o = KE.oriented(this.st);
    if (resetCrop) { this.crop.setNatural(o.w, o.h); if (this.aspectKey !== 'free') this.crop.setAspect(aspectOf(this.aspectKey, o), true); }
    else this.crop.setNatural(o.w, o.h, true);
    var cv = cview(this), r = cv ? this.crop.rect() : { x: 0, y: 0, w: o.w, h: o.h }, pad = document.body.classList.contains('mob') ? 16 : 10;
    var bw = this.stage.clientWidth - pad * 2, bh = this.stage.clientHeight - pad * 2, z = this.zoom || 1;
    var k = Math.min(bw / r.w, bh / r.h, 4) * z, w = Math.max(1, Math.floor(r.w * k)), h = Math.max(1, Math.floor(r.h * k));
    this.frame.style.width = w + 'px'; this.frame.style.height = h + 'px'; this.view = r;
    this.stage.classList.toggle('zoomed', z > 1.001);
    var dpr = Math.min(2, window.devicePixelRatio || 1), cw = Math.min(r.w, Math.round(w * dpr)), ch = Math.min(r.h, Math.round(h * dpr)), m = Math.min(1, Math.sqrt(2.4e7 / (cw * ch)));
    cw = Math.max(1, Math.round(cw * m)); ch = Math.max(1, Math.round(ch * m));
    if (this.cv.width !== cw || this.cv.height !== ch) { this.cv.width = cw; this.cv.height = ch; }
    this.paint(); this.est(); this.zoomUi();
  };
  ImageEditor.prototype.paint = function () {
    var me = this; if (!me.st || me.pending) return; me.pending = true;
    requestAnimationFrame(function () {
      me.pending = false; if (!me.st) return;
      var x = me.cv.getContext('2d'); x.clearRect(0, 0, me.cv.width, me.cv.height);
      KE.drawImg(x, me.st, me.view || KE.oriented(me.st), me.cv.width, me.cv.height, me.raw);
      if (!me.raw && me.st.fx) KE.FX.canvas(me.cv, me.st.fx, me.st.fxk);
    });
  };
  /* zoom (desktop): wheel, double click, + / − and "whole picture"; drag the picture to move around */
  ImageEditor.prototype.setZoom = function (z, cx, cy) {
    z = Math.max(1, Math.min(8, z)); var s = this.stage, f = this.frame, old = this.zoom || 1; if (Math.abs(z - old) < 1e-3) return;
    var sr = s.getBoundingClientRect(), fr = f.getBoundingClientRect();
    if (cx == null) { cx = sr.left + sr.width / 2; cy = sr.top + sr.height / 2; }
    var u = (cx - fr.left) / fr.width, v = (cy - fr.top) / fr.height;
    this.zoom = z; this.layout();
    var nr = f.getBoundingClientRect();
    s.scrollLeft += nr.left + u * nr.width - cx; s.scrollTop += nr.top + v * nr.height - cy;
  };
  ImageEditor.prototype.zoomUi = function () { var z = this.zoom || 1; $$(this.root, '[data-el=zpct]').forEach(function (e) { e.textContent = KE.fa(Math.round(z * 100)) + '٪'; }); $$(this.root, '[data-act=zout],[data-act=zfit]').forEach(function (b) { b.disabled = z <= 1.001; }); };
  ImageEditor.prototype.zoomable = function () {
    var me = this, s = this.stage, pan = null; if (!$(this.root, '[data-act=zin]')) return; // desktop only
    act(this.root, 'zin', function () { me.setZoom((me.zoom || 1) * 1.25); });
    act(this.root, 'zout', function () { me.setZoom((me.zoom || 1) / 1.25); });
    act(this.root, 'zfit', function () { me.setZoom(1); });
    s.addEventListener('wheel', function (e) { if (!me.st) return; e.preventDefault(); me.setZoom((me.zoom || 1) * Math.pow(1.0015, -e.deltaY), e.clientX, e.clientY); }, { passive: false });
    s.addEventListener('dblclick', function (e) { if (!me.st || e.target.closest('button,.hd')) return; me.setZoom((me.zoom || 1) > 1.4 ? 1 : 2.5, e.clientX, e.clientY); });
    s.addEventListener('pointerdown', function (e) {
      if (!me.st || (me.zoom || 1) <= 1.001 || e.target.closest('button,.hd')) return;
      var inBox = e.target.closest('.cb'), editing = !me.root.classList.contains('cview') && /edit|crop/.test(me.root.getAttribute('data-tool'));
      if (e.button === 0 && inBox && editing && !me.crop.isFull()) return; // that drag moves the crop frame
      e.preventDefault(); e.stopPropagation(); pan = { x: e.clientX, y: e.clientY, l: s.scrollLeft, t: s.scrollTop }; s.setPointerCapture(e.pointerId); s.classList.add('panning');
    }, true);
    s.addEventListener('pointermove', function (e) { if (pan) { s.scrollLeft = pan.l - (e.clientX - pan.x); s.scrollTop = pan.t - (e.clientY - pan.y); } });
    var end = function () { pan = null; s.classList.remove('panning'); };
    s.addEventListener('pointerup', end); s.addEventListener('pointercancel', end);
  };
  var FMTN = { webp: 'WebP', avif: 'AVIF', jpg: 'JPG', png: 'PNG', mp4: 'MP4', webm: 'WebM', gif: 'GIF' };
  KE.FMTN = FMTN;
  var QMN = { smart: 'هوشمند', lossless: 'بی‌افت', manual: 'دستی' }, UPN = ['خاموش', 'بهبود', '۲×', '۳×', '۴×'];
  ImageEditor.prototype.fmtUi = function () {
    var r = this.root, f = this.fmt, me = this;
    $$(r, '[data-ifmt=avif]').forEach(function (b) { b.disabled = me.avifOk === false; });
    if (f === 'avif' && this.avifOk === false) { this.fmt = f = 'webp'; selChip(r, 'data-ifmt', 'webp'); }
    $$(r, '[data-qm=lossless]').forEach(function (b) { b.hidden = f !== 'webp'; });
    if (f !== 'webp' && this.qm === 'lossless') { this.qm = 'smart'; selChip(r, 'data-qm', 'smart'); r.classList.remove('qm-manual'); }
    r.classList.toggle('is-png', f === 'png'); // PNG is always lossless: no quality to pick
    var note = (f === 'jpg' || f === 'avif') && this.st && this.alpha ? 'پس‌زمینهٔ شفاف سفید می‌شود' : f === 'png' ? 'PNG بی‌افت است؛ حجمش زیاد می‌شود' : '';
    $$(r, '[data-el=fmtNote]').forEach(function (e) { e.textContent = note; e.hidden = !note; });
    this.vals();
  };
  // the current choice written on each option button (phone) and on the build button
  ImageEditor.prototype.vals = function () {
    var r = this.root, me = this, set = function (k, t) { $$(r, '[data-el=' + k + ']').forEach(function (e) { e.textContent = t; }); };
    var ai = this.plan ? this.plan.ai : this.up;
    set('vFmt', FMTN[this.fmt]); set('vQ', this.fmt === 'png' ? 'بی‌افت' : this.qm === 'manual' ? 'دستی ' + KE.fa(Math.round(this.q * 100)) : QMN[this.qm]);
    set('vRes', this.up >= 2 ? UPN[this.up] : this.res ? (this.res === 1440 ? '2K' : this.res === 2160 ? '4K' : this.res + 'p') : 'اصلی');
    set('vAi', ai ? (this.plan && this.plan.auto ? 'خودکار' : UPN[ai]) : 'خاموش');
    set('expLbl', (ai ? 'هوش مصنوعی | ' : 'ساخت ') + FMTN[this.fmt]);
    r.classList.toggle('ai-on', !!ai);
  };
  ImageEditor.prototype.upUi = function () {
    var r = this.root, me = this, up = this.up, keep = this.keep;
    $$(r, '[data-act=keep]').forEach(function (b) { b.classList.toggle('on', keep); b.setAttribute('aria-checked', keep); });
    r.classList.toggle('keep-on', keep);
    $$(r, '[data-el=resSec]').forEach(function (e) { e.classList.toggle('dim', up >= 2); });
    $$(r, '[data-el=resNote]').forEach(function (e) { e.textContent = up >= 2 ? 'اندازه را ضریب هوش مصنوعی تعیین می‌کند' : keep ? 'قفل: کمتر از اصل نمی‌شود' : ''; });
    if (!this.st) { this.vals(); return; }
    var o = KE.oriented(this.st), crop = this.crop.rect(), short = Math.min(o.w, o.h);
    $$(r, '[data-res]').forEach(function (b) { var v = +b.getAttribute('data-res'); b.disabled = keep && v > 0 && v < short; });
    if (keep && this.res && this.res < short) { this.res = 0; selChip(r, 'data-res', '0'); }
    var lim = this.lim, plan = this.plan = KE.imgPlan(this.st, crop, { res: this.res, up: up, keep: keep, lim: lim });
    $$(r, '[data-upd]').forEach(function (e) { var p = KE.imgPlan(me.st, crop, { up: +e.getAttribute('data-upd'), keep: keep, lim: lim }); e.textContent = KE.dims(p.w, p.h); });
    this.vals();
    var msg;
    if (plan.ai && this.aiOk == null) this.aiProbe();
    if (this.aiOk === false) msg = 'هوش مصنوعی روی این دستگاه در دسترس نیست';
    else if (plan.ai && !this.aiOk) msg = 'آماده‌سازی هوش مصنوعی…';
    else if (plan.ai) {
      var secs = plan.base.w * plan.base.h / Math.max(1, this.pxs);
      msg = (plan.auto ? 'برای حفظ وضوح، هوش مصنوعی روشن شد | ' : '') + (plan.cap ? 'تا حد ممکن: ' : 'خروجی ') + KE.dims(plan.w, plan.h) + ' | ' + KE.etaText(secs * 1000);
    } else msg = 'هوش مصنوعی جزئیات تازه می‌سازد';
    $$(r, '[data-el=upNote]').forEach(function (e) { e.textContent = msg; });
    $$(r, '[data-up]').forEach(function (b) { b.disabled = +b.getAttribute('data-up') > 0 && me.aiOk === false; });
  };
  // the AI engine and its speed: measured once, only when the AI is first needed
  ImageEditor.prototype.aiProbe = function () {
    var me = this; if (this.aiOk != null) return Promise.resolve();
    return this.aiP || (this.aiP = KE.Up.speed().then(function (sp) { me.aiOk = true; me.pxs = sp.pxs; me.lim = KE.Up.limits(sp.kind, sp.pxs); }, function () { me.aiOk = false; })
      .then(function () { me.aiP = null; me.upUi(); me.est(); }));
  };
  KE.etaText = function (ms) {
    if (ms === 'wait') return 'سنجش زمان…'; if (ms == null) return '—';
    var s = ms / 1000; if (s < 1) return 'کمتر از ۱ ثانیه'; if (s < 55) return 'حدود ' + KE.fa(Math.max(1, Math.round(s))) + ' ثانیه';
    var m = Math.floor((s + 5) / 60), r = Math.round((s - m * 60) / 10) * 10; if (r >= 60) { m++; r = 0; } if (r < 0) r = 0;
    return 'حدود ' + KE.fa(m) + ' دقیقه' + (r && m < 10 ? ' و ' + KE.fa(r) + ' ثانیه' : '');
  };
  // during a build: real remaining time from the measured pace, and a ring that moves with time (never stuck)
  KE.liveEta = function (ui, n, E, guessMs) {
    var t0, done = 0, lastAt = 0, at = [], per = E ? E.per : Math.max(5, guessMs / Math.max(1, n)), flush = E ? E.flush : 3 * per, audio = E ? E.audio : 300;
    var tailStart = 0, timer = null, shown = null;
    function pace() { // measured pace over the last frames (the first ones only fill the queues)
      if (done < 12) return per;
      var a = Math.max(8, done - 60), obs = (at[done] - at[a]) / (done - a), w = Math.min(1, (done - a) / 30);
      return w * obs + (1 - w) * per;
    }
    function remaining(now) {
      if (tailStart) return Math.max(0, audio - (now - tailStart));
      var p = pace(), left;
      if (!done) left = (E ? E.fixed : 0) + n * p - (now - t0);
      else left = (n - done) * p - (now - lastAt);
      if (done >= n) left = flush - (now - lastAt);
      return Math.max(0, left) + (done >= n ? 0 : flush * 0) + audio;
    }
    function tick() {
      var now = performance.now(), el = now - t0, rem = remaining(now), over = tailStart ? now - tailStart - audio : (done >= n ? now - lastAt - flush : -1);
      var fr = over > 0 ? Math.min(0.99, 0.97 + 0.02 * (1 - Math.exp(-over / 4000))) : Math.min(0.97, el / Math.max(1, el + rem));
      ui.progress(fr);
      if (shown == null || Math.abs(rem - shown) > Math.max(900, rem * 0.12) || rem < 1500) shown = rem;
      ui.sub(over > 0 || rem < 400 ? 'آخرین مرحله…' : KE.etaText(shown) + ' مانده');
    }
    return {
      start: function () { t0 = performance.now(); tick(); timer = setInterval(tick, 250); },
      frame: function (i) { var now = performance.now(); done = i; lastAt = now; at[i] = now; },
      tail: function () { if (!tailStart) tailStart = performance.now(); },
      stop: function () { clearInterval(timer); timer = null; }
    };
  };
  KE.etaShort = function (ms) {
    if (ms === 'wait') return 'سنجش…'; if (ms == null) return '—';
    var s = ms / 1000; if (s < 1) return '< ۱ ث'; if (s < 55) return '≈ ' + KE.fa(Math.max(1, Math.round(s))) + ' ث';
    return '≈ ' + KE.fa(Math.max(1, Math.round(s / 60))) + ' دقیقه';
  };
  KE.setEta = function (root, ms) {
    $$(root, '[data-el=eta] i').forEach(function (e) { e.textContent = KE.etaText(ms); });
    $$(root, '[data-el=etaS]').forEach(function (e) { e.textContent = KE.etaShort(ms); });
  };
  ImageEditor.prototype.est = function () {
    if (!this.st) return;
    var me = this, crop = this.crop.rect(), o = KE.oriented(this.st), plan = this.plan = KE.imgPlan(this.st, crop, { res: this.res, up: this.up, keep: this.keep, lim: this.lim });
    var info = { inW: o.w, inH: o.h, inSize: this.st.size, outW: plan.w, outH: plan.h, outSize: null };
    KE.UI.showEst(this.root, info); KE.setEta(this.root, null); this.vals();
    clearTimeout(this.et); var g = (this.eg = (this.eg || 0) + 1), fmt = this.fmt;
    this.et = setTimeout(function () {
      if (me.ui.isBusy() || !me.st) return;
      KE.estimateImg(me.st, crop, plan, me.qm, me.q, fmt).then(function (e) {
        if (g !== me.eg || !me.st) return;
        info.outSize = e.size; KE.UI.showEst(me.root, info);
        me.lastEta = e.ms + (plan.ai && me.pxs ? plan.base.w * plan.base.h / me.pxs * 1000 + 400 : 0); KE.setEta(me.root, me.lastEta);
      }).catch(function () {});
    }, 450);
  };
  ImageEditor.prototype.exportNow = function () {
    var me = this; if (!me.st || me.ui.isBusy()) return;
    if (me.aiOk == null && KE.imgPlan(me.st, me.crop.rect(), { res: me.res, up: me.up, keep: me.keep }).ai) { // device limits first, so the size always fits in memory
      me.ui.busy('آماده‌سازی هوش مصنوعی', -1); return me.aiProbe().then(function () { me.ui.idle(); me.exportNow(); });
    }
    var crop = me.crop.rect(), fmt = me.fmt, t0 = performance.now(), cancelled = false, o = KE.oriented(me.st);
    var plan = KE.imgPlan(me.st, crop, { res: me.res, up: me.up, keep: me.keep, lim: me.lim }), ai = plan.ai && me.aiOk !== false;
    me.ui.busy(ai ? 'پخت و پز با هوش مصنوعی' : 'در حال پخت و پز ' + FMTN[fmt], ai || me.qm === 'smart' ? 0 : -1, ai ? function () { cancelled = true; } : null,
      { meta: (ai ? 'عکس | ' + (plan.S > 1 ? '\u2066' + KE.fa(plan.S) + '×\u2069' : 'بهبود جزئیات') + ' | ' : fmt === 'png' ? 'بی‌افت | ' : me.qm === 'smart' ? 'کمترین حجم بی‌افت | ' : 'عکس | ') + KE.dims(plan.w, plan.h), eta: me.lastEta || 0 });
    setTimeout(function () {
      var p;
      if (ai) {
        var base = KE.renderOut(me.st, crop, plan.base, true), tUp = performance.now();
        p = KE.Up.run(base, plan.S, function (f, d, n) {
          me.ui.progress(f * 0.92);
          me.ui.sub(KE.etaText((performance.now() - tUp) / Math.max(1, d) * (n - d)) + ' مانده');
        }, function () { return cancelled; }).then(function (c) {
          base.width = base.height = 1;
          var r = KE.resize(c, plan.w, plan.h); if (r !== c) c.width = c.height = 1;
          if (me.st.fx && me.st.fxk > 0) KE.FX.canvas(r, me.st.fx, me.st.fxk);
          me.ui.sub(''); me.ui.label('در حال پخت و پز ' + FMTN[fmt]); return r;
        });
      } else p = Promise.resolve(KE.renderOut(me.st, crop, plan));
      p.then(function (c) {
        var cc = fmt === 'jpg' || fmt === 'avif' ? KE.flatten(c) : c, q;
        if (fmt === 'png') q = KE.encodeImg(cc, 'png').then(function (b) { return { blob: b, q: 1 }; });
        else if (me.qm === 'lossless' && fmt === 'webp') q = KE.webp(cc, 1).then(function (b) { return { blob: b, q: 1 }; });
        else if (me.qm === 'manual') q = KE.encodeImg(cc, fmt, me.q).then(function (b) { return { blob: b, q: me.q }; });
        else q = KE.smartEncode(cc, fmt, 42, function (f) { me.ui.progress(ai ? 0.92 + f * 0.08 : f); });
        return q.then(function (r) {
          var before = KE.beforeCanvas(me.st, crop, c.width, c.height);
          me.ui.done(function () {
            me.ui.result({ kind: 'image', fmt: fmt, blob: r.blob, url: URL.createObjectURL(r.blob), w: c.width, h: c.height, inW: o.w, inH: o.h, cropW: crop.w, cropH: crop.h, orig: me.st.size, origType: me.st.type,
              name: KE.baseName(me.st.name) + '-kedit.' + fmt, mode: fmt === 'png' ? 'lossless' : me.qm, q: r.q, up: ai ? plan.S : 0, ai: ai, ms: performance.now() - t0, before: before });
          });
          if (cc !== c) cc.width = cc.height = 1;
        });
      }).catch(function (e) {
        me.ui.idle(); me.ui.sub('');
        if (String(e && e.message) === 'cancel') return;
        me.ui.toast(ai ? 'هوش مصنوعی کامل نشد؛ برش کوچک‌تری بزنید یا ضریب کمتری بگذارید' : 'ساخت ' + FMTN[fmt] + ' انجام نشد؛ دوباره امتحان کنید', 'err');
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
    root.addEventListener('click', function (e) { var b = e.target.closest('[data-fps]'); if (!b || !root.contains(b)) return; me.fps = +b.getAttribute('data-fps'); selChip(root, 'data-fps', me.fps); me.vals(); me.est(); });
    act(root, 'sound', function (e) { me.sound = !me.sound; e.currentTarget.classList.toggle('sel', me.sound); e.currentTarget.setAttribute('aria-pressed', me.sound); me.est(); });
    chips(root, 'data-res', function (val) { me.res = +val; me.vals(); me.est(); });
    chips(root, 'data-gq', function (val) { me.gq = val; me.vals(); me.est(); });
    chips(root, 'data-speed', function (val) { me.setSpeed(+val); });
    act(root, 'loop', function (e) { me.loop = !me.loop; me.est(); e.currentTarget.classList.toggle('sel', me.loop); e.currentTarget.setAttribute('aria-pressed', me.loop); });
    act(root, 'resetCrop', function () { me.resetCrop(); });
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
    this.hist = new History(this);
  }
  VideoEditor.prototype.resetCrop = function () { if (!this.ready) return; this.aspectKey = 'free'; selChip(this.root, 'data-aspect', 'free'); this.crop.reset(); this.layout(); };
  VideoEditor.prototype.setSpeed = function (v) { this.speed = v; selChip(this.root, 'data-speed', String(v)); this.fmtUi(); this.est(); };
  var GQN = { best: 'عالی', balanced: 'متعادل', small: 'کم‌حجم' };
  VideoEditor.prototype.vals = function () {
    var r = this.root, me = this, set = function (k, t) { $$(r, '[data-el=' + k + ']').forEach(function (e) { e.textContent = t; }); };
    set('vFmt', this.fmt === 'webp' ? 'WebP' : FMTN[this.fmt]); set('vRes', this.res ? this.res + 'p' : 'اصلی'); set('vQ', GQN[this.gq]); set('vFps', KE.fa(this.fps));
    set('vSpd', KE.fa(this.speed).replace('.', '٫') + '×');
  };
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
    this.vals();
  };
  // live look on the video: a canvas copy of the current frame sits over the player
  VideoEditor.prototype.drawFx = function () {
    var c = this.fxcv, v = this.v; if (!c || !this.ready) return;
    if (!this.fx || !(this.fxk > 0)) { c.hidden = true; return; }
    var fw = this.frame.clientWidth, fh = this.frame.clientHeight; if (!fw || !fh) return;
    var dpr = Math.min(1.5, window.devicePixelRatio || 1), w = Math.max(1, Math.round(fw * dpr)), h = Math.max(1, Math.round(fh * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    var x = c.getContext('2d', { willReadFrequently: true }), r = this.view;
    if (r) x.drawImage(v, r.x, r.y, r.w, r.h, 0, 0, w, h); else x.drawImage(v, 0, 0, w, h);
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
          $$(me.root, '[data-el=name]').forEach(function (e) { e.textContent = file.name || 'video'; });
          $$(me.root, '[data-el=info]').forEach(function (e) { e.textContent = KE.dims(v.videoWidth, v.videoHeight) + ' | ' + KE.time(me.dur) + ' | ' + KE.size(file.size || 0); });
          $$(me.root, '[data-el=infoS]').forEach(function (e) { e.textContent = KE.time(me.dur) + ' | ' + KE.dims(v.videoWidth, v.videoHeight); });
          $$(me.root, '[data-el=tDur]').forEach(function (e) { e.innerHTML = KE.time(me.dur); });
          me.ambUrl = KE.ambOf(v, v.videoWidth, v.videoHeight); KE.setAmb(me.ambUrl);
          requestAnimationFrame(function () {
            me.layout(true); me.trim.set(me.dur, me.a, me.b); me.trim.setT(0); me.times(); me.cur();
            me.trim.thumbs(me.url, v.videoWidth, v.videoHeight);
            me.drawFx(); me.thumbs(); me.hist.reset();
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
  VideoEditor.prototype.close = function () { this.eg = (this.eg || 0) + 1; if (this.ev) { this.ev.removeAttribute('src'); this.ev.load(); } this.v.pause(); this.v.removeAttribute('src'); this.v.load(); this.ready = false; this.ambUrl = null; if (this.fxcv) this.fxcv.hidden = true; this.root.classList.remove('has-file'); if (this.url) URL.revokeObjectURL(this.url); this.url = null; };
  VideoEditor.prototype.layout = function (resetCrop) {
    if (!this.ready || !this.stage.clientWidth) return;
    var v = this.v, vw = v.videoWidth, vh = v.videoHeight, pad = document.body.classList.contains('mob') ? 16 : 10;
    if (resetCrop) { this.crop.setNatural(vw, vh); if (this.aspectKey !== 'free') this.crop.setAspect(aspectOf(this.aspectKey, { w: vw, h: vh }), true); }
    else this.crop.setNatural(vw, vh, true);
    var cv = cview(this), r = cv ? this.crop.rect() : { x: 0, y: 0, w: vw, h: vh };
    var bw = this.stage.clientWidth - pad * 2, bh = this.stage.clientHeight - pad * 2, k = Math.min(bw / r.w, bh / r.h, 3);
    this.frame.style.width = Math.floor(r.w * k) + 'px'; this.frame.style.height = Math.floor(r.h * k) + 'px'; this.view = cv ? r : null;
    var vs = v.style; // the player keeps its full size; the frame shows only the cut part
    if (cv) { vs.width = vw * k + 'px'; vs.height = vh * k + 'px'; vs.left = -r.x * k + 'px'; vs.top = -r.y * k + 'px'; vs.right = vs.bottom = 'auto'; }
    else vs.width = vs.height = vs.left = vs.top = vs.right = vs.bottom = '';
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
  // time: measured on this device with this file and these settings (a short real build), corrected by past runs
  var ETK = { mp4: 1, webm: 1, webp: 1, gif: 1, aud: 25 };
  try { var ek = JSON.parse(localStorage.getItem('ke-eta2') || '{}'); for (var k2 in ek) ETK[k2] = ek[k2]; } catch (e) {}
  function saveEtk() { try { localStorage.setItem('ke-eta2', JSON.stringify(ETK)); } catch (e) {} }
  KE.makeJob = function (o) { var f = o.format; return f === 'mp4' || f === 'webm' ? KE.makeVideo(o) : f === 'webp' ? KE.makeAnimWebP(o) : KE.makeGif(o); };
  KE.trialRun = function (o, P) {
    var m = Math.min(P.n, 24), k0 = Math.min(3, m - 1), step = (o.end - o.start) / P.n, ts = [], t0 = performance.now(), t;
    var o2 = Object.assign({}, o, { end: o.start + m * step, trial: true, sound: false, onProgress: null, onTail: null, onFrame: function (i) { ts[i] = performance.now(); } });
    var job = KE.makeJob(o2), poll = setInterval(function () { if (o.stale && o.stale()) job.cancel(); }, 60);
    return job.promise.then(function () {
      clearInterval(poll); t = performance.now();
      // pace from the whole tail of the run (frames waiting inside the decoder/encoder are finished by then), setup separately
      var per = k0 >= 1 && ts[k0] ? (t - ts[k0]) / (m - k0) : (t - t0) / m;
      return { per: per, fixed: Math.max(0, (ts[k0] || t0) - t0 - k0 * per), m: m };
    }, function (e) { clearInterval(poll); throw e; });
  };
  // parts of the expected time (ms): setup, per frame, what is left after the last frame (encoder queue + sound)
  KE.etaParts = function (fmt, T, n, audio) { var k = ETK[fmt] || 1, vid = fmt === 'mp4' || fmt === 'webm'; return { fixed: T.fixed * k, per: T.per * k, flush: (vid ? 3 : 0.5) * T.per * k, audio: audio || 0 }; };
  KE.etaTotal = function (E, n) { return E.fixed + n * E.per + E.audio; };
  KE.audioEst = function (copy, file, dur) { return copy ? 80 + 6 * dur : ETK.aud * ((file && file.size) || 0) / 1048576 + 300; };
  KE.learnEta = function (fmt, predicted, actual, audioMs, copy, file) {
    if (predicted > 1500) { var r = Math.max(0.7, Math.min(1.6, actual / predicted)); ETK[fmt] = Math.round(Math.max(0.7, Math.min(1.8, (ETK[fmt] || 1) * (0.7 + 0.3 * r))) * 100) / 100; }
    if (!copy && audioMs != null && file && file.size > 1048576) ETK.aud = Math.round(Math.max(3, Math.min(400, ETK.aud * 0.4 + 0.6 * audioMs / (file.size / 1048576))));
    saveEtk();
  };
  VideoEditor.prototype.est = function () {
    if (!this.ready) return;
    var me = this, v = this.v, p = this.plan(), f = this.fmt;
    var info = { inW: v.videoWidth, inH: v.videoHeight, inSize: (this.file && this.file.size) || 0, outW: p.w, outH: p.h, outSize: null };
    KE.UI.showEst(this.root, info);
    $$(this.root, '[data-el=frames]').forEach(function (e) { e.innerHTML = KE.fa(p.n) + ' فریم | ' + KE.time(p.dur); });
    var crop = me.crop.rect(), fxOn = me.fx && me.fxk > 0, vid = f === 'mp4' || f === 'webm', withA = vid && me.sound && Math.abs(me.speed - 1) < 1e-3;
    var tkey = [me.file && me.file.name, me.file && me.file.size, f, Math.round(crop.x), Math.round(crop.y), Math.round(crop.w), Math.round(crop.h), p.w, p.h, me.fps, me.speed, me.gq, fxOn ? me.fx : 0, Math.round(me.a * 2)].join('|');
    me.etaNow = function () { // current best estimate (ms) or null while measuring
      if (!me.trial || me.trial.key !== tkey) return null;
      me.etaE = KE.etaParts(f, me.trial.T, p.n, withA ? KE.audioEst(me.trial.copy, me.file, p.dur) : 0); me.etaE.copy = me.trial.copy; me.etaE.withA = withA;
      return KE.etaTotal(me.etaE, p.n);
    };
    var now = me.etaNow(); KE.setEta(this.root, now == null ? 'wait' : now);
    clearTimeout(this.et); var g = (this.eg = (this.eg || 0) + 1);
    var o = { video: me.ev, file: me.file, crop: crop, res: me.res, start: me.a, end: me.b, fps: me.fps, speed: me.speed, quality: me.gq, fx: fxOn ? me.fx : 0, fxk: me.fxk, format: f, sound: me.sound, stale: function () { return g !== me.eg; } };
    this.et = setTimeout(function () {
      if (me.ui.isBusy() || !me.ready) return;
      var q = vid ? KE.estimateVideo(o).then(function (r) {
        me.unsup = me.unsup || {}; var was = !!me.unsup[f]; me.unsup[f] = !!r.unsupported; if (was !== me.unsup[f]) me.fmtUi(); return r.size;
      }) : (f === 'webp' ? KE.estimateAnimWebP : KE.estimateGif)(o);
      q.then(function (n) { if (g === me.eg && n != null) { info.outSize = n; KE.UI.showEst(me.root, info); } }).catch(function () {})
        .then(function () {
          if (g !== me.eg || me.ui.isBusy() || (me.unsup && me.unsup[f]) || (me.trial && me.trial.key === tkey)) return;
          var cp = vid ? KE.copyAudioOk(me.file, f) : Promise.resolve(false);
          return Promise.all([KE.trialRun(o, p), cp]).then(function (r) {
            if (g !== me.eg) return; me.trial = { key: tkey, T: r[0], copy: r[1] };
            KE.setEta(me.root, me.etaNow());
          });
        }).catch(function () { if (g === me.eg) KE.setEta(me.root, p.n * SPD[f] * Math.max(0.05, p.w * p.h / 1e6) + 300); });
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
      fx: fxOn ? me.fx : 0, fxk: me.fxk };
    var pred = me.etaNow && me.etaNow(), E = pred != null ? me.etaE : null, live = KE.liveEta(me.ui, p.n, E, p.n * SPD[f] * Math.max(0.05, p.w * p.h / 1e6));
    o.onFrame = live.frame; o.onTail = live.tail;
    var job = KE.makeJob(o);
    me.ui.busy('در حال پخت و پز ' + (f === 'webp' ? 'WebP متحرک' : KE.FMTN[f]), 0, function () { job.cancel(); }, { meta: 'ویدیو | ' + KE.dims(p.w, p.h) });
    live.start();
    job.promise.then(function (res) {
      var blob = res.blob || res, ms = performance.now() - t0;
      live.stop();
      KE.learnSpeed(f, ms, p.n, p.w * p.h);
      if (pred != null) KE.learnEta(f, pred - E.audio, ms - (vid && o.sound ? (KE.audioMs || 0) : 0), vid && o.sound ? KE.audioMs : null, res.audioCopied, me.file);
      me.seekTo(me.a); me.drawFx();
      me.ui.done(function () { me.ui.result({ kind: vid ? 'video' : (f === 'webp' ? 'awebp' : 'gif'), fmt: f, anim: true, blob: blob, url: URL.createObjectURL(blob), w: p.w, h: p.h, inW: me.v.videoWidth, inH: me.v.videoHeight,
        orig: me.file.size || 0, origType: me.file.type, origName: me.file.name, frames: p.n, fps: me.fps, dur: p.dur, ms: ms, audio: vid ? !!res.audio : false, soundAsked: vid && me.sound,
        name: KE.baseName(me.file.name) + '-kedit.' + (f === 'webp' ? 'webp' : f) }); });
    }, function (e) {
      live.stop();
      me.ui.idle(); me.seekTo(me.a); me.drawFx();
      var m = String(e && e.message);
      if (m === 'cancel') return;
      if (m === 'nocodec') { me.unsup = me.unsup || {}; me.unsup[f] = true; me.fmtUi(); me.ui.toast('این دستگاه ' + KE.FMTN[f] + ' نمی‌سازد؛ قالب دیگری بزنید', 'err'); return; }
      me.ui.toast('ساخت ' + KE.FMTN[f] + ' انجام نشد؛ بازه یا اندازه را کمتر کنید', 'err');
    });
  };


  /* back / forward: every change the user makes is a step that can be undone and redone */
  function History(ed) { this.ed = ed; this.list = []; this.i = -1; this.lock = false; var me = this, r = ed.root;
    var mark = function (e) { if (e && e.target && e.target.closest && e.target.closest('[data-act=undo],[data-act=redo]')) return; me.mark(); };
    r.addEventListener('click', mark); r.addEventListener('input', mark); r.addEventListener('pointerup', mark);
    act(r, 'undo', function () { me.go(-1); }); act(r, 'redo', function () { me.go(1); });
    this.ui();
  }
  History.prototype.reset = function () { clearTimeout(this.t); this.list = this.ed.has() ? [this.ed.snap()] : []; this.i = this.list.length - 1; this.ui(); };
  History.prototype.push = function () {
    if (this.lock || !this.ed.has()) return; var s = this.ed.snap(), last = this.list[this.i];
    if (last && JSON.stringify(last) === JSON.stringify(s)) return;
    this.list = this.list.slice(0, this.i + 1); this.list.push(s); if (this.list.length > 80) this.list.shift(); this.i = this.list.length - 1; this.ui();
  };
  History.prototype.mark = function () { var me = this; if (me.lock) return; clearTimeout(me.t); me.t = setTimeout(function () { me.push(); }, 300); };
  History.prototype.go = function (d) {
    clearTimeout(this.t); this.push(); var j = this.i + d; if (j < 0 || j >= this.list.length || !this.ed.has()) return;
    this.i = j; this.lock = true; try { this.ed.apply(this.list[j]); } finally { var me = this; setTimeout(function () { me.lock = false; }, 0); } this.ui();
  };
  History.prototype.can = function () { return { undo: this.i > 0, redo: this.i >= 0 && this.i < this.list.length - 1 }; };
  History.prototype.ui = function () {
    var c = this.can(), r = this.ed.root;
    $$(r, '[data-act=undo]').forEach(function (b) { b.disabled = !c.undo; }); $$(r, '[data-act=redo]').forEach(function (b) { b.disabled = !c.redo; });
    r.dispatchEvent(new CustomEvent('kehist', { detail: c }));
  };
  function setVal(root, k, v, lbl) { var el = $(root, '[data-k=' + k + ']'); if (el) el.value = v; if (lbl) lbl(k); }
  ImageEditor.prototype.has = function () { return !!this.st; };
  ImageEditor.prototype.snap = function () { var st = this.st; return { cr: Object.assign({}, this.crop.r), asp: this.aspectKey, rot: st.rot, fh: st.fh, fv: st.fv, bright: st.bright, contrast: st.contrast, sat: st.sat, fx: this.fx, fxk: this.fxk, up: this.up, fmt: this.fmt, res: this.res, qm: this.qm, q: this.q }; };
  ImageEditor.prototype.apply = function (s) {
    var me = this, st = me.st, r = me.root, lb = me.lbl.bind(me); if (!st) return;
    st.rot = s.rot; st.fh = s.fh; st.fv = s.fv;
    ['bright', 'contrast', 'sat'].forEach(function (k) { st[k] = s[k]; setVal(r, k, s[k], lb); });
    me.aspectKey = s.asp; selChip(r, 'data-aspect', s.asp);
    me.crop.aspect = s.asp === 'free' ? null : aspectOf(s.asp, KE.oriented(st)); me.layout(true);
    me.crop.r = Object.assign({}, s.cr); me.crop.draw();
    me.fx = st.fx = s.fx; me.strip.pick(s.fx, true); me.fxk = st.fxk = s.fxk; setVal(r, 'fxk', Math.round(s.fxk * 100), lb);
    me.fmt = s.fmt; selChip(r, 'data-ifmt', s.fmt); me.up = s.up; selChip(r, 'data-up', String(s.up)); me.res = s.res; selChip(r, 'data-res', String(s.res));
    me.qm = s.qm; selChip(r, 'data-qm', s.qm); r.classList.toggle('qm-manual', s.qm === 'manual'); me.q = s.q; setVal(r, 'q', Math.round(s.q * 100), lb);
    me.fmtUi(); me.upUi(); me.paint(); me.est(); me.thumbs();
  };
  ImageEditor.prototype.resetGeo = function () { if (!this.st) return; this.st.rot = 0; this.st.fh = this.st.fv = false; this.aspectKey = 'free'; selChip(this.root, 'data-aspect', 'free'); this.crop.aspect = null; this.layout(true); this.thumbs(); this.hist.mark(); };
  VideoEditor.prototype.has = function () { return !!this.ready; };
  VideoEditor.prototype.snap = function () { return { cr: Object.assign({}, this.crop.r), asp: this.aspectKey, a: this.a, b: this.b, speed: this.speed, fx: this.fx, fxk: this.fxk, fmt: this.fmt, res: this.res, fps: this.fps, gq: this.gq, sound: this.sound, loop: this.loop }; };
  VideoEditor.prototype.apply = function (s) {
    var me = this, r = me.root, v = me.v; if (!me.ready) return;
    me.aspectKey = s.asp; selChip(r, 'data-aspect', s.asp); me.crop.setAspect(s.asp === 'free' ? null : aspectOf(s.asp, { w: v.videoWidth, h: v.videoHeight }), true);
    me.crop.r = Object.assign({}, s.cr); me.crop.draw();
    me.a = s.a; me.b = s.b; me.trim.set(me.dur, s.a, s.b); me.times();
    me.speed = s.speed; selChip(r, 'data-speed', String(s.speed));
    me.fx = s.fx; me.strip.pick(s.fx, true); me.fxk = s.fxk; setVal(r, 'fxk', Math.round(s.fxk * 100)); me.lbl();
    me.fmt = s.fmt; selChip(r, 'data-fmt', s.fmt); me.res = s.res; selChip(r, 'data-res', String(s.res)); me.fps = s.fps; me.gq = s.gq; selChip(r, 'data-gq', s.gq);
    me.sound = s.sound; me.loop = s.loop;
    $$(r, '[data-act=sound]').forEach(function (b) { b.classList.toggle('sel', s.sound); b.setAttribute('aria-pressed', s.sound); });
    $$(r, '[data-act=loop]').forEach(function (b) { b.classList.toggle('sel', s.loop); b.setAttribute('aria-pressed', s.loop); });
    me.fmtUi(); me.drawFx(); me.est();
  };
  KE.ImageEditor = ImageEditor; KE.VideoEditor = VideoEditor;
})();
