/* before / after slider: drag the gold line, pinch or wheel to zoom, drag to move when zoomed */
(function () {
  'use strict';
  var KE = window.KE;
  function Compare(el) {
    this.el = el; this.x = 0.5; this.z = 1; this.tx = 0; this.ty = 0;
    el.innerHTML = '<div class="cv-in"><div class="v bf"></div><div class="v af"><img alt=""></div></div><div class="ln"><span class="kn">‹›</span></div>' +
      '<span class="tl l">قبل</span><span class="tl r" data-r>بعد</span>' +
      '<div class="zm"><button class="ibtn" data-z="-" aria-label="کوچک‌نمایی">−</button><b data-zv>۱۰۰٪</b><button class="ibtn" data-z="+" aria-label="بزرگ‌نمایی">+</button><button class="btn" data-z="fit">کل عکس</button></div>';
    this.inner = el.querySelector('.cv-in'); this.bf = el.querySelector('.bf'); this.af = el.querySelector('.af'); this.img = this.af.querySelector('img');
    this.ln = el.querySelector('.ln'); this.zv = el.querySelector('[data-zv]');
    var me = this, pts = {}, mode = null, start = null;
    el.querySelectorAll('[data-z]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); var k = b.getAttribute('data-z'); if (k === 'fit') me.zoomTo(1); else me.zoomAt(k === '+' ? me.z * 1.6 : me.z / 1.6, 0.5, 0.5); });
      b.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    });
    el.addEventListener('wheel', function (e) { e.preventDefault(); var r = me.inner.getBoundingClientRect(); me.zoomAt(me.z * Math.pow(1.0015, -e.deltaY), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); }, { passive: false });
    el.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.zm')) return;
      e.preventDefault(); el.setPointerCapture(e.pointerId); pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pts), r = me.inner.getBoundingClientRect();
      if (ids.length === 2) { var a = pts[ids[0]], b2 = pts[ids[1]]; mode = 'pinch'; start = { d: Math.hypot(a.x - b2.x, a.y - b2.y), z: me.z }; return; }
      var lx = r.left + me.x * r.width, near = Math.abs(e.clientX - lx) < 26;
      mode = near || me.z <= 1.001 ? 'line' : 'pan'; start = { x: e.clientX, y: e.clientY, tx: me.tx, ty: me.ty };
      if (mode === 'line') me.setX((e.clientX - r.left) / r.width);
    });
    el.addEventListener('pointermove', function (e) {
      if (!pts[e.pointerId]) return; pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var r = me.inner.getBoundingClientRect();
      if (mode === 'pinch') { var ids = Object.keys(pts); if (ids.length < 2) return; var a = pts[ids[0]], b2 = pts[ids[1]], d = Math.hypot(a.x - b2.x, a.y - b2.y);
        me.zoomAt(start.z * d / Math.max(10, start.d), ((a.x + b2.x) / 2 - r.left) / r.width, ((a.y + b2.y) / 2 - r.top) / r.height); }
      else if (mode === 'line') me.setX((e.clientX - r.left) / r.width);
      else if (mode === 'pan') { me.tx = start.tx + (e.clientX - start.x) / r.width; me.ty = start.ty + (e.clientY - start.y) / r.height; me.apply(); }
    });
    function up(e) { delete pts[e.pointerId]; if (!Object.keys(pts).length) mode = null; else if (mode === 'pinch') mode = null; }
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    window.addEventListener('resize', function () { me.fit(); });
  }
  Compare.prototype.set = function (before, afterUrl, w, h, label) {
    this.bf.innerHTML = ''; if (before) { before.className = 'cv-img'; this.bf.appendChild(before); }
    this.img.src = afterUrl; this.w = w; this.h = h; this.el.querySelector('[data-r]').innerHTML = label || 'بعد';
    this.x = 0.5; this.z = 1; this.tx = this.ty = 0; this.el.hidden = false; var me = this; requestAnimationFrame(function () { me.fit(); });
  };
  Compare.prototype.fit = function () { // the box matches the picture (contain)
    if (this.el.hidden || !this.w) return;
    var p = this.el.parentElement, full = !!p.closest('#res'), pad = full ? 0 : 12, foot = full ? 0 : 46; // result screen: edge to edge
    var W = p.clientWidth - pad * 2, H = p.clientHeight - pad * 2 - foot, k = Math.min(W / this.w, H / this.h), w = this.w * k, h = this.h * k;
    var s = this.el.style; s.width = w + 'px'; s.height = h + 'px'; s.left = (p.clientWidth - w) / 2 + 'px'; s.top = Math.max(pad, (p.clientHeight - foot - h) / 2) + 'px';
    this.apply();
  };
  Compare.prototype.setX = function (x) { this.x = Math.max(0, Math.min(1, x)); this.apply(); };
  Compare.prototype.zoomTo = function (z) { this.z = z; this.tx = this.ty = 0; this.apply(); };
  Compare.prototype.zoomAt = function (z, fx, fy) { // keep the point under the finger still
    z = Math.max(1, Math.min(8, z)); var ox = (fx - this.tx) / this.z, oy = (fy - this.ty) / this.z;
    this.tx = fx - ox * z; this.ty = fy - oy * z; this.z = z; this.apply();
  };
  Compare.prototype.apply = function () {
    var z = this.z; this.tx = Math.min(0, Math.max(1 - z, this.tx)); this.ty = Math.min(0, Math.max(1 - z, this.ty));
    var t = 'translate(' + (this.tx * 100) + '%,' + (this.ty * 100) + '%) scale(' + z + ')';
    this.bf.style.transform = t; this.af.querySelector('img').style.transform = t;
    var c = this.bf.firstChild; if (c) c.style.transform = '';
    this.af.style.clipPath = 'inset(0 0 0 ' + (this.x * 100) + '%)'; this.ln.style.left = (this.x * 100) + '%';
    this.zv.textContent = KE.fa(Math.round(z * 100)) + '٪'; this.el.classList.toggle('zoomed', z > 1.001);
  };
  Compare.prototype.hide = function () { this.el.hidden = true; this.img.removeAttribute('src'); this.bf.innerHTML = ''; };
  KE.Compare = Compare;
})();
