/* CPU fallback for the AI upscale: 3x3 convolutions + PReLU on planar float tiles (4 output channels per pass) */
var L = null;
self.onmessage = function (e) {
  var m = e.data;
  if (m.cmd === 'init') { L = m.layers; return; }
  try {
    var W = m.W, H = m.H, pl = W * H, x = m.rgb;
    for (var li = 0; li < L.length; li++) {
      var l = L[li], o = new Float32Array(l.cout * pl), w = l.w, cin = l.cin;
      for (var oc = 0; oc < l.cout; oc += 4) {
        var o0 = o.subarray(oc * pl, (oc + 1) * pl), o1 = o.subarray((oc + 1) * pl, (oc + 2) * pl), o2 = o.subarray((oc + 2) * pl, (oc + 3) * pl), o3 = o.subarray((oc + 3) * pl, (oc + 4) * pl);
        o0.fill(l.b[oc]); o1.fill(l.b[oc + 1]); o2.fill(l.b[oc + 2]); o3.fill(l.b[oc + 3]);
        for (var ic = 0; ic < cin; ic++) {
          var ib = ic * pl;
          for (var ky = 0; ky < 3; ky++) {
            var dy = ky - 1, ys = dy < 0 ? 1 : 0, ye = dy > 0 ? H - 1 : H;
            for (var kx = 0; kx < 3; kx++) {
              var t = ic * 9 + ky * 3 + kx, s9 = cin * 9;
              var w0 = w[oc * s9 + t], w1 = w[(oc + 1) * s9 + t], w2 = w[(oc + 2) * s9 + t], w3 = w[(oc + 3) * s9 + t];
              var dx = kx - 1, xs = dx < 0 ? 1 : 0, xe = dx > 0 ? W - 1 : W;
              for (var y = ys; y < ye; y++) {
                var r = y * W, ir = ib + (y + dy) * W + dx;
                for (var xx = xs; xx < xe; xx++) { var v = x[ir + xx], k = r + xx; o0[k] += w0 * v; o1[k] += w1 * v; o2[k] += w2 * v; o3[k] += w3 * v; }
              }
            }
          }
        }
      }
      if (l.act) for (var c = 0; c < l.cout; c++) { var a = l.a[c], b0 = c * pl; for (var q = 0; q < pl; q++) { var vv = o[b0 + q]; if (vv < 0) o[b0 + q] = vv * a; } }
      x = o;
    }
    self.postMessage({ out: x }, [x.buffer]);
  } catch (err) { self.postMessage({ err: String(err && err.message || err) }); }
};
