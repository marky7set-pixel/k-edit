/* K-Edit effects: 20 Kelid looks (gold, navy, champagne). One fast pass per pixel; blur-based looks use a small blurred copy. */
(function () {
  'use strict';
  var KE = window.KE = window.KE || {};
  var NAVY = [0.10, 0.15, 0.30], GOLD = [1.0, 0.80, 0.50], CHAMP = [1.0, 0.92, 0.78], OLD = [0.35, 0.28, 0.18], GOLDH = [0.95, 0.76, 0.475];
  // op codes
  var CURVE = 1, SPLIT = 2, LIFT = 3, EXPO = 4, WARM = 5, COOL = 6, SAT = 7, HAZE = 8, VIG = 9, GREENS = 10, SKY = 11, TOP = 12, BLOOM = 20, CLAR = 21, SOFT = 22;
  var LIST = [
    ['طلایی کلید', [[CURVE, .18], [SPLIT, .30, .32]]],
    ['سرمه‌ای و طلایی', [[CURVE, .30], [SPLIT, .50, .38]]],
    ['شب کلید', [[CURVE, .22], [EXPO, .68], [SPLIT, .55, .45], [VIG, .6]]],
    ['شامپاینی', [[CURVE, -.10], [LIFT, .10, CHAMP], [WARM, .07], [HAZE, .12, CHAMP]]],
    ['درخشش طلایی', [[BLOOM, 20, .85, GOLD, .45]]],
    ['شیشهٔ مات', [[SOFT, 2.2, .5], [BLOOM, 26, .6, CHAMP, .4], [HAZE, .10, CHAMP]]],
    ['لوکس سینمایی', [[CURVE, .38], [SAT, .78], [SPLIT, .40, .22], [VIG, .45]]],
    ['مات لوکس', [[CURVE, .12], [LIFT, .18, NAVY], [SPLIT, .26, .14]]],
    ['مخملی', [[CURVE, .30], [SAT, 1.25], [WARM, .06], [VIG, .38]]],
    ['ابریشمی', [[CURVE, -.16], [SAT, .82], [HAZE, .09, CHAMP]]],
    ['کریستالی', [[COOL, .05], [CLAR, .9, 10], [SAT, 1.10]]],
    ['شفاف و زنده', [[CURVE, .16], [CLAR, .5, 12], [SAT, 1.32]]],
    ['سبز ملک', [[CURVE, .16], [GREENS, .75]]],
    ['آسمان سرمه‌ای', [[SPLIT, .24, .18], [SKY, .7]]],
    ['نور طلایی از بالا', [[TOP, .55]]],
    ['غروب گرم', [[SPLIT, .18, .40], [WARM, .13], [VIG, .38]]],
    ['مه طلایی', [[BLOOM, 30, .45, GOLD, .55], [HAZE, .20, GOLDH]]],
    ['روز روشن', [[EXPO, 1.18], [CURVE, -.08], [SAT, 1.08]]],
    ['طلای کهنه', [[CURVE, .10], [SAT, .6], [LIFT, .20, OLD], [WARM, .10]]],
    ['امضای کلید', [[CURVE, .24], [SPLIT, .36, .30], [BLOOM, 18, .4, GOLD, .55], [VIG, .42]]]
  ];
  var FX = KE.FX = { names: LIST.map(function (e) { return e[0]; }), count: LIST.length };

  // lookup tables for the costly curves
  var SPW = new Float32Array(1024), SPH = new Float32Array(1024), VGT = new Float32Array(1025);
  (function () {
    for (var i = 0; i < 1024; i++) { var l = i / 1023; SPW[i] = Math.pow(Math.max(0, Math.min(1, 1 - l * 1.8)), 1.3); SPH[i] = Math.pow(Math.max(0, Math.min(1, (l - .45) / .55)), 1.2); }
    for (var j = 0; j <= 1024; j++) { var d = Math.sqrt(j / 511.5) / 1.414; VGT[j] = Math.pow(Math.max(0, Math.min(1, (d - .4) / .6)), 1.6); }
  })();
  function cl(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  // one per-pixel op on P = [r,g,b]; S = sample of the blurred copy for spatial ops; nx, ny = position 0..1
  function px(op, P, nx, ny, S) {
    var r = P[0], g = P[1], b = P[2], l, k, t;
    switch (op[0]) {
      case CURVE: k = op[1];
        r += k * (r - .5) * (1 - Math.abs(2 * r - 1)); g += k * (g - .5) * (1 - Math.abs(2 * g - 1)); b += k * (b - .5) * (1 - Math.abs(2 * b - 1)); break;
      case SPLIT:
        l = r * .299 + g * .587 + b * .114;
        var li = (cl(l) * 1023) | 0, ws = SPW[li] * op[1], wh = SPH[li] * op[2];
        r = r * (1 - ws) + NAVY[0] * ws; g = g * (1 - ws) + NAVY[1] * ws; b = b * (1 - ws) + NAVY[2] * ws;
        r = r * (1 - wh) + r * GOLD[0] * wh + GOLD[0] * wh * .15; g = g * (1 - wh) + g * GOLD[1] * wh + GOLD[1] * wh * .15; b = b * (1 - wh) + b * GOLD[2] * wh + GOLD[2] * wh * .15; break;
      case LIFT: k = op[1]; t = op[2]; r = r * (1 - k) + t[0] * k * 1.2; g = g * (1 - k) + t[1] * k * 1.2; b = b * (1 - k) + t[2] * k * 1.2; break;
      case EXPO: r *= op[1]; g *= op[1]; b *= op[1]; break;
      case WARM: k = op[1]; r *= 1 + k; g *= 1 + k * .4; b *= 1 - k * .7; break;
      case COOL: k = op[1]; r *= 1 - k * .6; b *= 1 + k; break;
      case SAT: k = op[1]; l = r * .299 + g * .587 + b * .114; r = l + (r - l) * k; g = l + (g - l) * k; b = l + (b - l) * k; break;
      case HAZE: k = op[1]; t = op[2]; r = r * (1 - k) + t[0] * k; g = g * (1 - k) + t[1] * k; b = b * (1 - k) + t[2] * k; break;
      case VIG:
        var dx = nx * 2 - 1, dy = ny * 2 - 1;
        k = 1 - op[1] * VGT[((dx * dx + dy * dy) * 511.5) | 0]; r *= k; g *= k; b *= k; break;
      case GREENS:
        var gm = cl((g - Math.max(r, b)) * 4) * op[1];
        if (gm > 0) { l = r * .299 + g * .587 + b * .114;
          r = r * (1 - gm) + (l + (r - l) * 1.25) * gm - gm * .04; g = g * (1 - gm) + (l + (g - l) * 1.25) * gm - gm * .04; b = b * (1 - gm) + (l + (b - l) * 1.25) * gm - gm * .04; }
        break;
      case SKY:
        l = r * .299 + g * .587 + b * .114; var bm = cl((b - r) * 3) * cl((l - .35) * 2) * op[1];
        if (bm > 0) { r = r * (1 - bm) + r * NAVY[0] * 2.2 * bm; g = g * (1 - bm) + g * NAVY[1] * 2.2 * bm; b = b * (1 - bm) + b * NAVY[2] * 2.2 * bm; }
        break;
      case TOP:
        var m = cl((1 - ny) - .4) / .6 * op[1];
        r = 1 - (1 - r) * (1 - GOLD[0] * m); g = 1 - (1 - g) * (1 - GOLD[1] * m); b = 1 - (1 - b) * (1 - GOLD[2] * m); break;
      case BLOOM: // screen the blurred highlights, tinted
        k = op[2]; t = op[3];
        r = 1 - (1 - cl(r)) * (1 - S[0] * t[0] * k); g = 1 - (1 - cl(g)) * (1 - S[1] * t[1] * k); b = 1 - (1 - cl(b)) * (1 - S[2] * t[2] * k); break;
      case CLAR: k = op[1]; r += (r - S[0]) * k; g += (g - S[1]) * k; b += (b - S[2]) * k; break;
      case SOFT: k = op[2]; r = S[0] * k + r * (1 - k); g = S[1] * k + g * (1 - k); b = S[2] * k + b * (1 - k); break;
    }
    P[0] = cl(r); P[1] = cl(g); P[2] = cl(b);
  }
  function radiusOf(op) { return op[0] === BLOOM ? op[1] : op[0] === CLAR ? op[2] : op[1]; }
  // 3 box passes ~ gaussian (sigma), on an interleaved rgb float image
  function boxes(sigma) {
    var n = 3, wI = Math.floor(Math.sqrt(12 * sigma * sigma / n + 1)); if (wI % 2 === 0) wI--;
    var wu = wI + 2, m = Math.round((12 * sigma * sigma - n * wI * wI - 4 * n * wI - 3 * n) / (-4 * wI - 4)), out = [];
    for (var i = 0; i < n; i++) out.push(Math.max(0, ((i < m ? wI : wu) - 1) / 2));
    return out;
  }
  function boxH(src, dst, w, h, r) {
    var iarr = 1 / (r + r + 1);
    for (var y = 0; y < h; y++) for (var c = 0; c < 3; c++) {
      var row = y * w * 3 + c, acc = 0, x;
      for (x = -r - 1; x < r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x)) * 3];
      for (x = 0; x < w; x++) {
        acc += src[row + Math.min(w - 1, x + r) * 3] - src[row + Math.max(0, x - r - 1) * 3];
        dst[row + x * 3] = acc * iarr;
      }
    }
  }
  function boxV(src, dst, w, h, r) {
    var iarr = 1 / (r + r + 1), st = w * 3;
    for (var x = 0; x < w; x++) for (var c = 0; c < 3; c++) {
      var col = x * 3 + c, acc = 0, y;
      for (y = -r - 1; y < r; y++) acc += src[col + Math.min(h - 1, Math.max(0, y)) * st];
      for (y = 0; y < h; y++) {
        acc += src[col + Math.min(h - 1, y + r) * st] - src[col + Math.max(0, y - r - 1) * st];
        dst[col + y * st] = acc * iarr;
      }
    }
  }
  function blur(a, w, h, sigma) {
    if (sigma < 0.35) return new Float32Array(a);
    var bx = boxes(sigma), t = new Float32Array(a.length), o = new Float32Array(a);
    for (var i = 0; i < 3; i++) { var r = Math.round(bx[i]); if (r < 1) continue; boxH(o, t, w, h, r); boxV(t, o, w, h, r); }
    return o;
  }
  // reduced copy (long side <= 480) so blur looks stay fast at any size
  function reduce(d, w, h) {
    var f = Math.max(1, Math.ceil(Math.max(w, h) / 360)), rw = Math.max(1, Math.round(w / f)), rh = Math.max(1, Math.round(h / f)), a = new Float32Array(rw * rh * 3);
    for (var y = 0; y < rh; y++) {
      var y0 = Math.floor(y * h / rh), y1 = Math.max(y0 + 1, Math.floor((y + 1) * h / rh));
      for (var x = 0; x < rw; x++) {
        var x0 = Math.floor(x * w / rw), x1 = Math.max(x0 + 1, Math.floor((x + 1) * w / rw)), r = 0, g = 0, b = 0, n = 0;
        for (var yy = y0; yy < y1; yy++) for (var xx = x0; xx < x1; xx++) { var i = (yy * w + xx) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        var o = (y * rw + x) * 3; a[o] = r / n / 255; a[o + 1] = g / n / 255; a[o + 2] = b / n / 255;
      }
    }
    return { a: a, w: rw, h: rh };
  }
  // run the whole look on the small copy to get each blur input at the right stage
  function prepare(d, w, h, ops) {
    var spatial = ops.some(function (o) { return o[0] >= 20; });
    if (!spatial) return null;
    var R = reduce(d, w, h), a = R.a, rw = R.w, rh = R.h, S = Math.max(w, h) / 960 * (rw / w), bufs = [], P = [0, 0, 0], Z = [0, 0, 0];
    for (var k = 0; k < ops.length; k++) {
      var op = ops[k], buf = null;
      if (op[0] >= 20) {
        var src = a;
        if (op[0] === BLOOM) { // highlights only
          src = new Float32Array(a.length); var th = op[4];
          for (var i = 0; i < a.length; i += 3) { var l = a[i] * .299 + a[i + 1] * .587 + a[i + 2] * .114, m = cl((l - th) / (1 - th)); src[i] = a[i] * m; src[i + 1] = a[i + 1] * m; src[i + 2] = a[i + 2] * m; }
        }
        buf = blur(src, rw, rh, radiusOf(op) * S); bufs[k] = buf;
      }
      for (var y = 0, j = 0; y < rh; y++) for (var x = 0; x < rw; x++, j += 3) {
        P[0] = a[j]; P[1] = a[j + 1]; P[2] = a[j + 2];
        if (buf) { Z[0] = buf[j]; Z[1] = buf[j + 1]; Z[2] = buf[j + 2]; }
        px(op, P, (x + .5) / rw, (y + .5) / rh, Z); a[j] = P[0]; a[j + 1] = P[1]; a[j + 2] = P[2];
      }
    }
    return { bufs: bufs, w: rw, h: rh };
  }
  // apply look #id (1..20) to RGBA pixels in place, mixed by amount 0..1
  FX.apply = function (d, w, h, id, amount) {
    if (!id || id < 1 || id > LIST.length || !(amount > 0)) return d;
    var ops = LIST[id - 1][1], pre = prepare(d, w, h, ops), k = Math.min(1, amount), P = [0, 0, 0], Z = [0, 0, 0], no = ops.length;
    var rw = pre ? pre.w : 0, rh = pre ? pre.h : 0, sx = rw / w, sy = rh / h;
    for (var y = 0; y < h; y++) {
      var ny = (y + .5) / h, fy = Math.min(rh - 1, Math.max(0, (y + .5) * sy - .5)), y0 = Math.floor(fy), y1 = Math.min(rh - 1, y0 + 1), wy = fy - y0;
      for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4, r0 = d[i] / 255, g0 = d[i + 1] / 255, b0 = d[i + 2] / 255, nx = (x + .5) / w;
        P[0] = r0; P[1] = g0; P[2] = b0;
        var fx = 0, x0 = 0, x1 = 0, wx = 0;
        if (pre) { fx = Math.min(rw - 1, Math.max(0, (x + .5) * sx - .5)); x0 = Math.floor(fx); x1 = Math.min(rw - 1, x0 + 1); wx = fx - x0; }
        for (var q = 0; q < no; q++) {
          var op = ops[q];
          if (op[0] >= 20) {
            var B = pre.bufs[q], a00 = (y0 * rw + x0) * 3, a01 = (y0 * rw + x1) * 3, a10 = (y1 * rw + x0) * 3, a11 = (y1 * rw + x1) * 3;
            for (var c = 0; c < 3; c++) Z[c] = (B[a00 + c] * (1 - wx) + B[a01 + c] * wx) * (1 - wy) + (B[a10 + c] * (1 - wx) + B[a11 + c] * wx) * wy;
          }
          px(op, P, nx, ny, Z);
        }
        d[i] = (r0 + (P[0] - r0) * k) * 255 + .5; d[i + 1] = (g0 + (P[1] - g0) * k) * 255 + .5; d[i + 2] = (b0 + (P[2] - b0) * k) * 255 + .5;
      }
    }
    return d;
  };
  // apply onto a 2d canvas in place
  FX.canvas = function (cv, id, amount) {
    if (!id || !(amount > 0)) return;
    var x = cv.getContext('2d', { willReadFrequently: true }), im = x.getImageData(0, 0, cv.width, cv.height);
    FX.apply(im.data, cv.width, cv.height, id, amount); x.putImageData(im, 0, 0);
  };
})();
