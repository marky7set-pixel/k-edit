/* K-Edit AI upscale: Real-ESRGAN general x4v3 (SRVGGNetCompact, BSD-3-Clause) run on the GPU (WebGPU) or, if there is none, on the CPU in workers.
   The picture is processed in overlapping tiles, so memory stays small and progress / stop work like Upscayl. */
(function () {
  'use strict';
  var KE = window.KE, U = KE.Up = {};
  var PAD = 10;
  function half(h) { var s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 31, f = h & 1023; if (e === 0) return s * f * Math.pow(2, -24); if (e === 31) return f ? NaN : s * Infinity; return s * (1 + f / 1024) * Math.pow(2, e - 15); }
  var model = null;
  U.load = function () {
    if (model) return model;
    model = Promise.all([fetch('ai/x4v3.json').then(function (r) { if (!r.ok) throw new Error('nomodel'); return r.json(); }), fetch('ai/x4v3.bin').then(function (r) { if (!r.ok) throw new Error('nomodel'); return r.arrayBuffer(); })])
      .then(function (a) {
        var meta = a[0], h = new Uint16Array(a[1]), p = 0, L = [];
        meta.layers.forEach(function (l) {
          var nw = l.cout * l.cin * 9, w = new Float32Array(nw), b = new Float32Array(l.cout), al = new Float32Array(l.cout), i;
          for (i = 0; i < nw; i++) w[i] = half(h[p++]);
          for (i = 0; i < l.cout; i++) b[i] = half(h[p++]);
          if (l.act) for (i = 0; i < l.cout; i++) al[i] = half(h[p++]);
          L.push({ cin: l.cin, cout: l.cout, act: l.act, w: w, b: b, a: al });
        });
        return { layers: L, scale: meta.scale || 4 };
      });
    model.catch(function () { model = null; });
    return model;
  };

  /* ---------- GPU ---------- */
  var WGSL = 'struct P { W: u32, H: u32, cin: u32, cout: u32, act: u32 };\n' +
    '@group(0) @binding(0) var<storage, read> inp: array<f32>;\n@group(0) @binding(1) var<storage, read> wts: array<f32>;\n' +
    '@group(0) @binding(2) var<storage, read> bia: array<f32>;\n@group(0) @binding(3) var<storage, read> alp: array<f32>;\n' +
    '@group(0) @binding(4) var<storage, read_write> outp: array<f32>;\n@group(0) @binding(5) var<uniform> p: P;\n' +
    '@compute @workgroup_size(8, 8, 1)\nfn main(@builtin(global_invocation_id) g: vec3<u32>) {\n' +
    '  let x = g.x; let y = g.y; let ob = g.z * 4u;\n  if (x >= p.W || y >= p.H || ob >= p.cout) { return; }\n' +
    '  var acc = vec4<f32>(0.0); let st = p.cin * 9u; let plane = p.H * p.W;\n' +
    '  for (var ic = 0u; ic < p.cin; ic = ic + 1u) {\n    let base = ic * plane;\n' +
    '    for (var ky = 0u; ky < 3u; ky = ky + 1u) {\n      let yy = i32(y) + i32(ky) - 1;\n      if (yy < 0 || yy >= i32(p.H)) { continue; }\n' +
    '      for (var kx = 0u; kx < 3u; kx = kx + 1u) {\n        let xx = i32(x) + i32(kx) - 1;\n        if (xx < 0 || xx >= i32(p.W)) { continue; }\n' +
    '        let v = inp[base + u32(yy) * p.W + u32(xx)]; let wi = ic * 9u + ky * 3u + kx;\n' +
    '        acc = acc + v * vec4<f32>(wts[ob * st + wi], wts[(ob + 1u) * st + wi], wts[(ob + 2u) * st + wi], wts[(ob + 3u) * st + wi]);\n      }\n    }\n  }\n' +
    '  for (var k = 0u; k < 4u; k = k + 1u) {\n    let oc = ob + k; var v = acc[k] + bia[oc];\n    if (p.act == 1u && v < 0.0) { v = v * alp[oc]; }\n    outp[oc * plane + y * p.W + x] = v;\n  }\n}\n';
  var gpu = null;
  U.gpu = function () {
    if (gpu) return gpu;
    gpu = (navigator.gpu ? navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }) : Promise.resolve(null)).then(function (ad) {
      if (!ad) return null;
      return ad.requestDevice({ requiredLimits: { maxStorageBufferBindingSize: Math.min(ad.limits.maxStorageBufferBindingSize, 256 * 1048576), maxBufferSize: Math.min(ad.limits.maxBufferSize, 256 * 1048576) } }).then(function (dev) {
        var mod = dev.createShaderModule({ code: WGSL });
        var pipe = dev.createComputePipeline({ layout: 'auto', compute: { module: mod, entryPoint: 'main' } });
        dev.lost.then(function () { gpu = null; });
        return { dev: dev, pipe: pipe, maxBuf: dev.limits.maxStorageBufferBindingSize };
      });
    }).catch(function () { return null; });
    return gpu;
  };
  function GpuNet(g, M) {
    var d = g.dev, me = this; this.g = g; this.M = M; this.L = [];
    M.layers.forEach(function (l) {
      function buf(arr) { var b = d.createBuffer({ size: Math.max(16, arr.byteLength), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }); d.queue.writeBuffer(b, 0, arr); return b; }
      me.L.push({ l: l, w: buf(l.w), b: buf(l.b), a: buf(l.a), u: d.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }) });
    });
    this.size = 0;
  }
  GpuNet.prototype.prep = function (W, H) {
    if (this.W === W && this.H === H) return;
    var d = this.g.dev, me = this, bytes = 64 * W * H * 4;
    if (this.A) { this.A.destroy(); this.B.destroy(); this.R.destroy(); }
    this.A = d.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
    this.B = d.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    this.R = d.createBuffer({ size: 48 * W * H * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    this.W = W; this.H = H;
    this.groups = this.L.map(function (x, i) {
      d.queue.writeBuffer(x.u, 0, new Uint32Array([W, H, x.l.cin, x.l.cout, x.l.act, 0, 0, 0]));
      var src = i % 2 ? me.B : me.A, dst = i % 2 ? me.A : me.B;
      return d.createBindGroup({ layout: me.g.pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: src } }, { binding: 1, resource: { buffer: x.w } }, { binding: 2, resource: { buffer: x.b } }, { binding: 3, resource: { buffer: x.a } }, { binding: 4, resource: { buffer: dst } }, { binding: 5, resource: { buffer: x.u } }] });
    });
  };
  // planar rgb tile (3 x H x W) -> 48 x H x W
  GpuNet.prototype.run = function (rgb, W, H) {
    this.prep(W, H);
    var d = this.g.dev, me = this; d.queue.writeBuffer(this.A, 0, rgb);
    var enc = d.createCommandEncoder();
    this.L.forEach(function (x, i) { var ps = enc.beginComputePass(); ps.setPipeline(me.g.pipe); ps.setBindGroup(0, me.groups[i]); ps.dispatchWorkgroups(Math.ceil(W / 8), Math.ceil(H / 8), Math.ceil(x.l.cout / 4)); ps.end(); });
    var last = this.L.length % 2 ? this.B : this.A;
    enc.copyBufferToBuffer(last, 0, this.R, 0, 48 * W * H * 4);
    d.queue.submit([enc.finish()]);
    return this.R.mapAsync(GPUMapMode.READ).then(function () { var o = new Float32Array(me.R.getMappedRange().slice(0)); me.R.unmap(); return o; });
  };
  GpuNet.prototype.free = function () { if (this.A) { this.A.destroy(); this.B.destroy(); this.R.destroy(); } this.L.forEach(function (x) { x.w.destroy(); x.b.destroy(); x.a.destroy(); x.u.destroy(); }); };

  /* ---------- CPU (workers) ---------- */
  function CpuNet(M) {
    var n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)); this.ws = []; this.q = [];
    for (var i = 0; i < n; i++) {
      var w = new Worker('js/upworker.js'); w.postMessage({ cmd: 'init', layers: M.layers.map(function (l) { return { cin: l.cin, cout: l.cout, act: l.act, w: l.w, b: l.b, a: l.a }; }) });
      this.ws.push({ w: w, busy: false });
    }
  }
  CpuNet.prototype.run = function (rgb, W, H) {
    var me = this;
    return new Promise(function (res, rej) {
      function go() {
        var f = me.ws.filter(function (x) { return !x.busy; })[0]; if (!f) { me.q.push(go); return; }
        f.busy = true;
        f.w.onmessage = function (e) { f.busy = false; var nx = me.q.shift(); if (nx) nx(); if (e.data.err) rej(new Error(e.data.err)); else res(e.data.out); };
        f.w.postMessage({ cmd: 'run', rgb: rgb, W: W, H: H }, [rgb.buffer]);
      }
      go();
    });
  };
  CpuNet.prototype.parallel = function () { return this.ws.length; };
  CpuNet.prototype.free = function () { this.ws.forEach(function (x) { x.w.terminate(); }); };

  /* ---------- engine ---------- */
  var eng = null;
  U.engine = function () {
    if (eng) return eng;
    eng = U.load().then(function (M) {
      return (U._forceCpu ? Promise.resolve(null) : U.gpu()).then(function (g) {
        if (g) { try { return { kind: 'gpu', net: new GpuNet(g, M), M: M }; } catch (e) {} }
        return { kind: 'cpu', net: new CpuNet(M), M: M };
      });
    });
    eng.catch(function () { eng = null; });
    return eng;
  };
  U.limits = function (kind) { // input pixels allowed, so the device is never pushed too hard
    var phone = KE.platform === 'android' || /Android|iPhone|iPad/.test(navigator.userAgent);
    if (kind === 'cpu') return { inPx: phone ? 0.08e6 : 0.3e6, outSide: phone ? 4096 : 8192 };
    return { inPx: phone ? 1.0e6 : 4.2e6, outSide: phone ? 4096 : 8192 };
  };
  // speed of this device in input pixels per second (measured once on a small tile)
  var speed = null;
  U.speed = function () {
    if (speed) return speed;
    speed = U.engine().then(function (E) {
      var T = 48, rgb = new Float32Array(3 * T * T); for (var i = 0; i < rgb.length; i++) rgb[i] = (i * 37 % 255) / 255;
      var t0 = performance.now(), rgb2 = new Float32Array(rgb);
      return E.net.run(rgb, T, T).then(function () {
        var t1 = performance.now(); return E.net.run(rgb2, T, T).then(function () {
          var ms = Math.max(1, performance.now() - t1), par = E.kind === 'cpu' ? E.net.parallel() : 1;
          return { kind: E.kind, pxs: T * T / (ms / 1000) * (E.kind === 'gpu' ? 1.6 : par), first: t1 - t0 };
        });
      });
    });
    speed.catch(function () { speed = null; });
    return speed;
  };
  // src: canvas with the (cropped, edited) picture. scale: 2, 3 or 4. Resolves to a canvas scale x bigger.
  U.run = function (src, scale, onProgress, cancelled) {
    return U.engine().then(function (E) {
      var w = src.width, h = src.height, T = E.kind === 'gpu' ? (Math.min(w, h) > 600 ? 256 : 192) : 96;
      while (E.kind === 'gpu' && 64 * (T + 2 * PAD) * (T + 2 * PAD) * 4 > E.net.g.maxBuf) T -= 32;
      var sx = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
      var out = document.createElement('canvas'); out.width = w * 4; out.height = h * 4;
      var ox = out.getContext('2d'), tiles = [];
      for (var ty = 0; ty < h; ty += T) for (var tx = 0; tx < w; tx += T) tiles.push([tx, ty, Math.min(T, w - tx), Math.min(T, h - ty)]);
      var done = 0, par = E.kind === 'cpu' ? E.net.parallel() : 1, next = 0;
      function tile(t) {
        var x0 = Math.max(0, t[0] - PAD), y0 = Math.max(0, t[1] - PAD), x1 = Math.min(w, t[0] + t[2] + PAD), y1 = Math.min(h, t[1] + t[3] + PAD), W = x1 - x0, H = y1 - y0, pl = W * H;
        var rgb = new Float32Array(3 * pl);
        for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) { var si = ((y0 + y) * w + x0 + x) * 4, di = y * W + x; rgb[di] = sx[si] / 255; rgb[pl + di] = sx[si + 1] / 255; rgb[2 * pl + di] = sx[si + 2] / 255; }
        var keep = new Float32Array(rgb);
        return E.net.run(rgb, W, H).then(function (o) {
          if (cancelled && cancelled()) throw new Error('cancel');
          var iw = t[2] * 4, ih = t[3] * 4, img = new ImageData(iw, ih), d = img.data, offx = (t[0] - x0), offy = (t[1] - y0);
          for (var yy = 0; yy < ih; yy++) {
            var ly = offy + (yy >> 2), i = yy & 3;
            for (var xx = 0; xx < iw; xx++) {
              var lx = offx + (xx >> 2), j = xx & 3, p = ly * W + lx, di2 = (yy * iw + xx) * 4;
              for (var c = 0; c < 3; c++) d[di2 + c] = (o[(c * 16 + i * 4 + j) * pl + p] + keep[c * pl + p]) * 255 + 0.5;
              d[di2 + 3] = sx[((t[1] + (yy >> 2)) * w + t[0] + (xx >> 2)) * 4 + 3];
            }
          }
          ox.putImageData(img, t[0] * 4, t[1] * 4);
          done++; onProgress && onProgress(done / tiles.length, done, tiles.length);
        });
      }
      function lane() { if (cancelled && cancelled()) return Promise.reject(new Error('cancel')); if (next >= tiles.length) return Promise.resolve(); return tile(tiles[next++]).then(lane); }
      var lanes = []; for (var k = 0; k < par; k++) lanes.push(lane());
      var watch, stop = new Promise(function (res, rej) { watch = setInterval(function () { if (cancelled && cancelled()) { clearInterval(watch); if (E.kind === 'cpu') { E.net.free(); eng = null; } rej(new Error('cancel')); } }, 80); });
      return Promise.race([Promise.all(lanes), stop]).then(function (x) { clearInterval(watch); return x; }, function (e) { clearInterval(watch); throw e; }).then(function () {
        if (scale === 4) return out;
        var f = document.createElement('canvas'); f.width = Math.round(w * scale); f.height = Math.round(h * scale);
        var fx = f.getContext('2d'); fx.imageSmoothingEnabled = true; fx.imageSmoothingQuality = 'high'; fx.drawImage(out, 0, 0, f.width, f.height);
        out.width = out.height = 1; return f;
      });
    });
  };
})();
