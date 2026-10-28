/* K-Edit GIF engine (Web Worker). Global palette (median cut + k-means), ordered dither,
   inter-frame transparency with tight rectangles, LZW. No dependencies. */
'use strict';
var W = 0, H = 0, PAL = null, NPAL = 0, LUT = null, DISP = null, FRAMES = [], SPREAD = 0, THR2 = 0, SHARP = 0;
var T = 255; // transparent index
var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(function (v) { return (v + 0.5) / 16 - 0.5; });

function buildPalette(samples, maxColors) {
  var hist = new Uint32Array(32768), sr = new Float64Array(32768), sg = new Float64Array(32768), sb = new Float64Array(32768);
  for (var s = 0; s < samples.length; s++) {
    var d = new Uint8ClampedArray(samples[s]);
    for (var i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      var r = d[i], g = d[i + 1], b = d[i + 2], k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      hist[k]++; sr[k] += r; sg[k] += g; sb[k] += b;
    }
  }
  var bins = [];
  for (var k2 = 0; k2 < 32768; k2++) if (hist[k2]) bins.push(k2);
  var n = bins.length, cr = new Float64Array(n), cg = new Float64Array(n), cb = new Float64Array(n), cc = new Float64Array(n);
  for (var j = 0; j < n; j++) { var q = bins[j], c = hist[q]; cr[j] = sr[q] / c; cg[j] = sg[q] / c; cb[j] = sb[q] / c; cc[j] = c; }
  var order = new Int32Array(n); for (j = 0; j < n; j++) order[j] = j;
  var pal = [];
  if (n === 0) { pal.push([0, 0, 0]); }
  else if (n <= maxColors) { for (j = 0; j < n; j++) pal.push([cr[j], cg[j], cb[j]]); }
  else {
    var boxes = [{ s: 0, e: n }];
    var stat = function (bx) {
      var mn = [255, 255, 255], mx = [0, 0, 0], tot = 0;
      for (var t = bx.s; t < bx.e; t++) { var o = order[t], v = [cr[o], cg[o], cb[o]]; tot += cc[o]; for (var ch = 0; ch < 3; ch++) { if (v[ch] < mn[ch]) mn[ch] = v[ch]; if (v[ch] > mx[ch]) mx[ch] = v[ch]; } }
      var rg = [(mx[0] - mn[0]) * 1.0, (mx[1] - mn[1]) * 1.2, (mx[2] - mn[2]) * 0.9];
      var ax = rg[0] >= rg[1] && rg[0] >= rg[2] ? 0 : (rg[1] >= rg[2] ? 1 : 2);
      bx.ax = ax; bx.score = (bx.e - bx.s > 1) ? rg[ax] * Math.sqrt(tot) : -1; bx.tot = tot;
    };
    stat(boxes[0]);
    while (boxes.length < maxColors) {
      var bi = -1, best = 0;
      for (var b2 = 0; b2 < boxes.length; b2++) if (boxes[b2].score > best) { best = boxes[b2].score; bi = b2; }
      if (bi < 0) break;
      var bx = boxes[bi], arr = [cr, cg, cb][bx.ax];
      var sub = Array.prototype.slice.call(order.subarray(bx.s, bx.e));
      sub.sort(function (a, b) { return arr[a] - arr[b]; });
      for (var t = 0; t < sub.length; t++) order[bx.s + t] = sub[t];
      var half = bx.tot / 2, acc = 0, cut = bx.s + 1;
      for (t = bx.s; t < bx.e - 1; t++) { acc += cc[order[t]]; if (acc >= half) { cut = t + 1; break; } }
      var A = { s: bx.s, e: cut }, B = { s: cut, e: bx.e };
      stat(A); stat(B); boxes.splice(bi, 1, A, B);
    }
    for (b2 = 0; b2 < boxes.length; b2++) {
      var R = 0, G = 0, Bb = 0, Cn = 0;
      for (t = boxes[b2].s; t < boxes[b2].e; t++) { var o = order[t]; R += cr[o] * cc[o]; G += cg[o] * cc[o]; Bb += cb[o] * cc[o]; Cn += cc[o]; }
      pal.push([R / Cn, G / Cn, Bb / Cn]);
    }
    // k-means refinement over histogram bins
    for (var it = 0; it < 4; it++) {
      var P = pal.length, ar = new Float64Array(P), ag = new Float64Array(P), ab = new Float64Array(P), an = new Float64Array(P);
      for (j = 0; j < n; j++) {
        var bd = 1e18, bp = 0;
        for (var p = 0; p < P; p++) { var dr = cr[j] - pal[p][0], dg = cg[j] - pal[p][1], db = cb[j] - pal[p][2], dd = dr * dr * 3 + dg * dg * 4 + db * db * 2; if (dd < bd) { bd = dd; bp = p; } }
        ar[bp] += cr[j] * cc[j]; ag[bp] += cg[j] * cc[j]; ab[bp] += cb[j] * cc[j]; an[bp] += cc[j];
      }
      for (p = 0; p < P; p++) if (an[p] > 0) pal[p] = [ar[p] / an[p], ag[p] / an[p], ab[p] / an[p]];
    }
  }
  var out = new Uint8Array(256 * 3);
  for (j = 0; j < pal.length; j++) { out[j * 3] = Math.round(pal[j][0]); out[j * 3 + 1] = Math.round(pal[j][1]); out[j * 3 + 2] = Math.round(pal[j][2]); }
  NPAL = pal.length; return out;
}

function sharpen(d, w, h, amt) { // unsharp mask (3x3 box) for upscaled frames
  var src = new Uint8ClampedArray(d), row = w * 4;
  for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
    var i = y * row + x * 4;
    for (var c = 0; c < 3; c++) {
      var k = i + c, b = (src[k - row - 4] + src[k - row] + src[k - row + 4] + src[k - 4] + src[k] + src[k + 4] + src[k + row - 4] + src[k + row] + src[k + row + 4]) / 9;
      d[k] = src[k] + amt * (src[k] - b);
    }
  }
}

function nearest(r, g, b) {
  var bd = 1e18, bp = 0;
  for (var p = 0; p < NPAL; p++) { var dr = r - PAL[p * 3], dg = g - PAL[p * 3 + 1], db = b - PAL[p * 3 + 2], dd = dr * dr * 3 + dg * dg * 4 + db * db * 2; if (dd < bd) { bd = dd; bp = p; } }
  return bp;
}

function lzw(ix, out) {
  var MIN = 8, CLEAR = 256, EOI = 257;
  var codeSize = MIN + 1, next = EOI + 1;
  var dictCode = lzw.dc || (lzw.dc = new Int32Array(4096 * 256)), dictGen = lzw.dg || (lzw.dg = new Int32Array(4096 * 256));
  var gen = (lzw.g = (lzw.g || 0) + 1);
  var cur = 0, bits = 0, block = new Uint8Array(255), bl = 0;
  out.push(MIN);
  function flushBlock() { if (bl) { out.push(bl); for (var i = 0; i < bl; i++) out.push(block[i]); bl = 0; } }
  function emit(code) {
    cur |= code << bits; bits += codeSize;
    while (bits >= 8) { block[bl++] = cur & 255; if (bl === 255) flushBlock(); cur >>>= 8; bits -= 8; }
  }
  emit(CLEAR);
  var prefix = ix[0];
  for (var i = 1; i < ix.length; i++) {
    var k = ix[i], key = prefix * 256 + k;
    if (dictGen[key] === gen) { prefix = dictCode[key]; continue; }
    emit(prefix);
    if (next < 4096) {
      dictGen[key] = gen; dictCode[key] = next++;
      if ((next - 1) === (1 << codeSize) && codeSize < 12) codeSize++;
    } else {
      emit(CLEAR); gen = (lzw.g = lzw.g + 1); codeSize = MIN + 1; next = EOI + 1;
    }
    prefix = k;
  }
  emit(prefix);
  if (next < 4096 && next === (1 << codeSize) && codeSize < 12) codeSize++;
  emit(EOI);
  if (bits > 0) { block[bl++] = cur & 255; if (bl === 255) flushBlock(); }
  flushBlock(); out.push(0);
}

function Bytes() { this.a = new Uint8Array(1 << 16); this.n = 0; }
Bytes.prototype.push = function (v) { if (this.n >= this.a.length) { var b = new Uint8Array(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.n++] = v; };
Bytes.prototype.u16 = function (v) { this.push(v & 255); this.push((v >> 8) & 255); };
Bytes.prototype.str = function (s) { for (var i = 0; i < s.length; i++) this.push(s.charCodeAt(i)); };
Bytes.prototype.out = function () { return this.a.slice(0, this.n); };

function addFrame(rgba, delay) {
  if (SHARP) sharpen(rgba, W, H, SHARP);
  var n = W * H, idx = new Uint8Array(n), first = !DISP, x0 = W, y0 = H, x1 = -1, y1 = -1;
  if (first) DISP = new Uint8Array(n);
  for (var y = 0, i = 0; y < H; y++) {
    var row = (y & 3) * 4;
    for (var x = 0; x < W; x++, i++) {
      var o = i * 4, r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
      var dv = SPREAD ? BAYER[row + (x & 3)] * SPREAD : 0;
      var rr = r + dv, gg = g + dv, bb = b + dv;
      rr = rr < 0 ? 0 : rr > 255 ? 255 : rr; gg = gg < 0 ? 0 : gg > 255 ? 255 : gg; bb = bb < 0 ? 0 : bb > 255 ? 255 : bb;
      var key = ((rr >> 2) << 12) | ((gg >> 2) << 6) | (bb >> 2), ci = LUT[key];
      if (ci < 0) { ci = nearest((rr >> 2) * 4 + 2, (gg >> 2) * 4 + 2, (bb >> 2) * 4 + 2); LUT[key] = ci; }
      if (!first) {
        var pi = DISP[i];
        if (ci === pi) { idx[i] = T; continue; }
        if (THR2) { var p3 = pi * 3, er = r - PAL[p3], eg = g - PAL[p3 + 1], eb = b - PAL[p3 + 2]; if (er * er + eg * eg + eb * eb < THR2) { idx[i] = T; continue; } }
      }
      idx[i] = ci; DISP[i] = ci;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) { if (FRAMES.length) { FRAMES[FRAMES.length - 1].delay += delay; return; } x0 = y0 = 0; x1 = y1 = 0; }
  var fw = x1 - x0 + 1, fh = y1 - y0 + 1, sub = new Uint8Array(fw * fh);
  for (var yy = 0; yy < fh; yy++) sub.set(idx.subarray((y0 + yy) * W + x0, (y0 + yy) * W + x0 + fw), yy * fw);
  var bytes = new Bytes(); lzw(sub, bytes);
  FRAMES.push({ x: x0, y: y0, w: fw, h: fh, delay: delay, data: bytes.out(), tr: !first });
}

function finish(loop) { // returns a list of pieces, so no single huge buffer is ever needed
  var parts = [], o = new Bytes();
  o.str('GIF89a'); o.u16(W); o.u16(H); o.push(0xF7); o.push(0); o.push(0);
  for (var i = 0; i < 768; i++) o.push(PAL[i]);
  if (loop) { o.push(0x21); o.push(0xFF); o.push(11); o.str('NETSCAPE2.0'); o.push(3); o.push(1); o.u16(0); o.push(0); }
  parts.push(o.out().buffer);
  for (var f = 0; f < FRAMES.length; f++) {
    var fr = FRAMES[f], dl = Math.max(2, Math.min(65535, Math.round(fr.delay))), h = new Bytes();
    h.push(0x21); h.push(0xF9); h.push(4); h.push((1 << 2) | (fr.tr ? 1 : 0)); h.u16(dl); h.push(T); h.push(0);
    h.push(0x2C); h.u16(fr.x); h.u16(fr.y); h.u16(fr.w); h.u16(fr.h); h.push(0);
    parts.push(h.out().buffer, fr.data.buffer);
  }
  parts.push(new Uint8Array([0x3B]).buffer);
  return parts;
}

self.onmessage = function (e) {
  var m = e.data;
  try {
    if (m.cmd === 'start') {
      W = m.w; H = m.h; SPREAD = m.spread || 0; THR2 = (m.thr || 0) * (m.thr || 0); SHARP = m.sharpen || 0; FRAMES = []; DISP = null;
      if (SHARP) for (var q = 0; q < m.samples.length; q++) sharpen(new Uint8ClampedArray(m.samples[q]), W, H, SHARP);
      PAL = buildPalette(m.samples, Math.min(255, m.colors || 255));
      LUT = new Int16Array(1 << 18).fill(-1);
      self.postMessage({ cmd: 'ready', colors: NPAL });
    } else if (m.cmd === 'frame') {
      addFrame(new Uint8ClampedArray(m.buf), m.delay);
      self.postMessage({ cmd: 'framed', i: m.i });
    } else if (m.cmd === 'stats') {
      var sz = FRAMES.map(function (f) { return f.data.length + 20; });
      FRAMES = []; DISP = null;
      self.postMessage({ cmd: 'stats', sizes: sz });
    } else if (m.cmd === 'finish') {
      var parts = finish(m.loop !== false);
      FRAMES = []; DISP = null;
      self.postMessage({ cmd: 'done', parts: parts }, parts);
    }
  } catch (err) { self.postMessage({ cmd: 'error', message: String(err && err.message || err) }); }
};
