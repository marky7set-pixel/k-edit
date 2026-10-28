/* Animated WebP: each frame is encoded by the built-in WebP encoder, then packed into one RIFF file (VP8X + ANIM + ANMF).
   Only the changed area of a frame is stored, so still parts of the video cost almost nothing. */
(function () {
  'use strict';
  var KE = window.KE;
  KE.AWQ = { best: { q: 0.9, thr: 6 }, balanced: { q: 0.8, thr: 10 }, small: { q: 0.66, thr: 16 } };
  function u24(a, o, v) { a[o] = v & 255; a[o + 1] = (v >> 8) & 255; a[o + 2] = (v >> 16) & 255; }
  function u32(a, o, v) { a[o] = v & 255; a[o + 1] = (v >> 8) & 255; a[o + 2] = (v >> 16) & 255; a[o + 3] = (v >>> 24) & 255; }
  function tag(a, o, s) { for (var i = 0; i < 4; i++) a[o + i] = s.charCodeAt(i); }
  function str(u, o) { return String.fromCharCode(u[o], u[o + 1], u[o + 2], u[o + 3]); }
  // keep only the image chunks (ALPH + VP8 / VP8L) of a still WebP
  function chunks(u) {
    if (str(u, 0) !== 'RIFF' || str(u, 8) !== 'WEBP') throw new Error('webp');
    var o = 12, keep = [], alpha = false, end = Math.min(u.length, 8 + (u[4] | u[5] << 8 | u[6] << 16 | u[7] << 24));
    while (o + 8 <= end) {
      var id = str(u, o), sz = u[o + 4] | u[o + 5] << 8 | u[o + 6] << 16 | u[o + 7] << 24, full = 8 + sz + (sz & 1);
      if (id === 'ALPH' || id === 'VP8 ' || id === 'VP8L') { keep.push(u.subarray(o, o + full)); if (id === 'ALPH') alpha = true; if (id === 'VP8L') alpha = alpha || !!(u[o + 8 + 4] & 0x10); }
      o += full;
    }
    if (!keep.length) throw new Error('webp');
    var n = keep.reduce(function (s, k) { return s + k.length; }, 0), out = new Uint8Array(n), p = 0;
    keep.forEach(function (k) { out.set(k, p); p += k.length; });
    return { data: out, alpha: alpha };
  }
  function Enc(w, h, quality) {
    var Q = KE.AWQ[quality] || KE.AWQ.balanced;
    this.w = w; this.h = h; this.q = Q.q; this.thr = Q.thr; this.frames = []; this.ref = null; this.alpha = false;
    this.cv = document.createElement('canvas'); this.cx = this.cv.getContext('2d', { willReadFrequently: true });
  }
  // changed area against what the viewer already shows
  Enc.prototype.box = function (d) {
    var r = this.ref, w = this.w, h = this.h, T = this.thr, L = w, R = -1, Tp = h, B = -1;
    for (var y = 0; y < h; y++) {
      var row = y * w * 4, hit = false;
      for (var x = 0; x < w; x++) {
        var i = row + x * 4;
        if (Math.abs(d[i] - r[i]) > T || Math.abs(d[i + 1] - r[i + 1]) > T || Math.abs(d[i + 2] - r[i + 2]) > T) { hit = true; if (x < L) L = x; if (x > R) R = x; }
      }
      if (hit) { if (y < Tp) Tp = y; B = y; }
    }
    if (R < 0) return null;
    L = Math.max(0, L - 2) & ~1; Tp = Math.max(0, Tp - 2) & ~1; R = Math.min(w - 1, R + 2); B = Math.min(h - 1, B + 2);
    return { x: L, y: Tp, w: R - L + 1, h: B - Tp + 1 };
  };
  // add one RGBA frame (ImageData) shown for dur milliseconds
  Enc.prototype.add = function (img, dur) {
    var me = this, d = img.data, rc;
    if (!me.ref) rc = { x: 0, y: 0, w: me.w, h: me.h };
    else {
      rc = me.box(d);
      if (!rc) { me.frames[me.frames.length - 1].dur += dur; return Promise.resolve(0); } // nothing moved: show the last frame longer
      if (rc.w * rc.h > me.w * me.h * 0.72) rc = { x: 0, y: 0, w: me.w, h: me.h };
    }
    me.cv.width = rc.w; me.cv.height = rc.h; me.cx.putImageData(img, -rc.x, -rc.y, rc.x, rc.y, rc.w, rc.h);
    if (!me.ref) me.ref = new Uint8ClampedArray(d);
    else for (var y = rc.y; y < rc.y + rc.h; y++) { var s = (y * me.w + rc.x) * 4; me.ref.set(d.subarray(s, s + rc.w * 4), s); }
    return KE.webp(me.cv, me.q).then(function (b) { return b.arrayBuffer(); }).then(function (ab) {
      var c = chunks(new Uint8Array(ab)); if (c.alpha) me.alpha = true;
      me.frames.push({ x: rc.x, y: rc.y, w: rc.w, h: rc.h, dur: dur, blob: new Blob([c.data]), size: c.data.length + 24 });
      return c.data.length + 24;
    });
  };
  Enc.prototype.sizes = function () { return this.frames.map(function (f) { return f.size; }); };
  Enc.prototype.finish = function (loop) {
    var me = this, body = 4 + 18 + 14, parts = [];
    me.frames.forEach(function (f) { body += f.size; });
    var head = new Uint8Array(12 + 18 + 14);
    tag(head, 0, 'RIFF'); u32(head, 4, body); tag(head, 8, 'WEBP');
    tag(head, 12, 'VP8X'); u32(head, 16, 10); head[20] = 0x02 | (me.alpha ? 0x10 : 0); u24(head, 24, me.w - 1); u24(head, 27, me.h - 1);
    tag(head, 30, 'ANIM'); u32(head, 34, 6); u32(head, 38, 0); head[42] = loop ? 0 : 1; head[43] = 0;
    parts.push(head);
    me.frames.forEach(function (f) {
      var a = new Uint8Array(24);
      tag(a, 0, 'ANMF'); u32(a, 4, f.size - 8); u24(a, 8, f.x / 2); u24(a, 11, f.y / 2); u24(a, 14, f.w - 1); u24(a, 17, f.h - 1);
      u24(a, 20, Math.max(10, Math.min(0xffffff, Math.round(f.dur)))); a[23] = 0x02; // replace, no blending
      parts.push(a, f.blob);
    });
    me.frames = []; me.ref = null; me.cv.width = me.cv.height = 1;
    return new Blob(parts, { type: 'image/webp' });
  };
  KE.AnimWebP = Enc;
})();
