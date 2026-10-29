/* K-Edit AI upscale: Real-ESRGAN general x4v3 (SRVGGNetCompact, BSD-3-Clause) run on the GPU (WebGPU) or, if there is none, on the CPU in workers.
   The picture is processed in overlapping tiles, so memory stays small and progress / stop work like Upscayl. */
(function () {
  'use strict';
  var KE = window.KE, U = KE.Up = {};
  var PAD = 10;
  var HT = null;
  function half0(h) { var s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 31, f = h & 1023; if (e === 0) return s * f * Math.pow(2, -24); if (e === 31) return f ? NaN : s * Infinity; return s * (1 + f / 1024) * Math.pow(2, e - 15); }
  function half(h) { if (!HT) { HT = new Float32Array(65536); for (var i = 0; i < 65536; i++) HT[i] = half0(i); } return HT[h]; }
  // two official weight sets mixed by strength (Real-ESRGAN "denoise strength"): x4v3 smooths noise, wdn keeps fine texture
  var raw = null, model = null, mixed = -1;
  var DN = { soft: 0.25, mid: 0.55, strong: 0.9 };
  U.strength = DN[KE.pref('ais')] ? KE.pref('ais') : 'mid';
  function get(u, need) { return fetch(u).then(function (r) { if (!r.ok) throw new Error('nomodel'); return r.arrayBuffer(); }).catch(function (e) { if (need) throw e; return null; }); }
  U.load = function () {
    raw = raw || Promise.all([fetch('ai/x4v3.json').then(function (r) { if (!r.ok) throw new Error('nomodel'); return r.json(); }), get('ai/x4v3.bin', true), get('ai/wdn.bin', false)])
      .then(function (a) { var w = a[2] && a[2].byteLength === a[1].byteLength ? new Uint16Array(a[2]) : null; return { meta: a[0], x: new Uint16Array(a[1]), w: w }; });
    raw.catch(function () { raw = null; });
    var dn = DN[U.strength] || DN.mid;
    if (model && mixed === dn) return model;
    mixed = dn;
    model = raw.then(function (R) {
      var p = 0, L = [], X = R.x, W = R.w, k = W ? dn : 1;
      function v() { var a = half(X[p]); if (W) a = k * a + (1 - k) * half(W[p]); p++; return a; }
      R.meta.layers.forEach(function (l) {
        var nw = l.cout * l.cin * 9, w = new Float32Array(nw), b = new Float32Array(l.cout), al = new Float32Array(l.cout), i;
        for (i = 0; i < nw; i++) w[i] = v();
        for (i = 0; i < l.cout; i++) b[i] = v();
        if (l.act) for (i = 0; i < l.cout; i++) al[i] = v();
        L.push({ cin: l.cin, cout: l.cout, act: l.act, w: w, b: b, a: al });
      });
      return { layers: L, scale: R.meta.scale || 4, mix: !!W };
    });
    model.catch(function () { model = null; mixed = -1; });
    return model;
  };
  // a new strength is used from the next build on (the network is rebuilt then, never while it works)
  U.setStrength = function (k) { if (DN[k]) U.strength = k; };

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

  /* ---------- GPU through WebGL2 (every Android WebView has it; WebGPU often not) ---------- */
  var VS = '#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}';
  var FS = '#version 300 es\nprecision highp float;precision highp int;precision highp sampler2DArray;\n' +
    'uniform sampler2DArray X;uniform int nIn;uniform int act;uniform ivec2 sz;\n' +
    'layout(std140) uniform Wb{mat4 w[144];vec4 b;vec4 a;};\nout vec4 o;\n' +
    'void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec4 s=b;\n' +
    ' for(int g=0;g<16;g++){if(g>=nIn)break;\n' +
    '  for(int t=0;t<9;t++){ivec2 q=p+ivec2(t-(t/3)*3-1,t/3-1);\n' +
    '   if(q.x<0||q.y<0||q.x>=sz.x||q.y>=sz.y)continue;\n' +
    '   s+=w[g*9+t]*texelFetch(X,ivec3(q,g),0);}}\n' +
    ' o=act==1?max(s,0.0)+a*min(s,0.0):s;}';
  function GlNet(M) {
    var c = document.createElement('canvas'); c.width = c.height = 1;
    var gl = c.getContext('webgl2', { antialias: false, depth: false, stencil: false, alpha: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: true });
    if (!gl) throw new Error('nogl');
    var f32 = !!gl.getExtension('EXT_color_buffer_float'), f16 = f32 || !!gl.getExtension('EXT_color_buffer_half_float');
    if (!f16) throw new Error('nofloat');
    this.gl = gl; this.fmt = f32 && !U._force16 ? gl.RGBA32F : gl.RGBA16F; this.M = M; var me = this;
    function sh(t, src) { var x = gl.createShader(t); gl.shaderSource(x, src); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error('shader ' + gl.getShaderInfoLog(x)); return x; }
    var pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('link');
    this.pr = pr; gl.useProgram(pr);
    this.uIn = gl.getUniformLocation(pr, 'nIn'); this.uAct = gl.getUniformLocation(pr, 'act'); this.uSz = gl.getUniformLocation(pr, 'sz');
    gl.uniform1i(gl.getUniformLocation(pr, 'X'), 0);
    var bi = gl.getUniformBlockIndex(pr, 'Wb'); gl.uniformBlockBinding(pr, bi, 0);
    var al = gl.getParameter(gl.UNIFORM_BUFFER_OFFSET_ALIGNMENT), blk = 144 * 64 + 32, stride = Math.ceil(blk / al) * al;
    // one block per (layer, 4 output channels): 144 mat4 (16 input groups x 9 taps), bias, prelu
    var nb = 0; M.layers.forEach(function (l) { nb += l.cout / 4; });
    var data = new Float32Array(nb * stride / 4), bk = 0; this.blocks = [];
    M.layers.forEach(function (l) {
      var s9 = l.cin * 9, list = [];
      for (var og = 0; og < l.cout / 4; og++) {
        var base = bk * stride / 4;
        for (var g = 0; g < Math.ceil(l.cin / 4); g++) for (var t = 0; t < 9; t++) for (var cc = 0; cc < 4; cc++) for (var r = 0; r < 4; r++) {
          var ic = g * 4 + cc, oc = og * 4 + r; data[base + (g * 9 + t) * 16 + cc * 4 + r] = ic < l.cin ? l.w[oc * s9 + ic * 9 + t] : 0;
        }
        for (r = 0; r < 4; r++) { data[base + 144 * 16 + r] = l.b[og * 4 + r]; data[base + 144 * 16 + 4 + r] = l.act ? l.a[og * 4 + r] : 0; }
        list.push(bk * stride); bk++;
      }
      me.blocks.push(list);
    });
    this.ubo = gl.createBuffer(); gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo); gl.bufferData(gl.UNIFORM_BUFFER, data, gl.STATIC_DRAW); this.blk = blk;
    this.fb = gl.createFramebuffer(); this.vao = gl.createVertexArray();
    c.addEventListener('webglcontextlost', function () { me.lost = true; eng = null; speed = null; });
  }
  GlNet.prototype.prep = function (W, H) {
    if (this.W === W && this.H === H) return;
    var gl = this.gl, me = this;
    if (this.T) this.T.forEach(function (t) { gl.deleteTexture(t); });
    this.T = [0, 1].map(function () {
      var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, me.fmt, W, H, 16); return t;
    });
    this.W = W; this.H = H;
  };
  GlNet.prototype.run = function (rgb, W, H) {
    if (this.lost) return Promise.reject(new Error('lost'));
    this.prep(W, H);
    var gl = this.gl, me = this, pl = W * H, L = this.M.layers, px = new Float32Array(pl * 4), i;
    for (i = 0; i < pl; i++) { px[i * 4] = rgb[i]; px[i * 4 + 1] = rgb[pl + i]; px[i * 4 + 2] = rgb[2 * pl + i]; }
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.T[0]); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, W, H, 1, gl.RGBA, gl.FLOAT, px);
    gl.useProgram(this.pr); gl.bindVertexArray(this.vao); gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb); gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.uniform2i(this.uSz, W, H);
    var src = 0;
    L.forEach(function (l, li) {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, me.T[src]);
      gl.uniform1i(me.uIn, Math.ceil(l.cin / 4)); gl.uniform1i(me.uAct, l.act ? 1 : 0);
      me.blocks[li].forEach(function (off, og) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, me.T[1 - src], 0, og);
        gl.bindBufferRange(gl.UNIFORM_BUFFER, 0, me.ubo, off, me.blk);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      });
      src = 1 - src;
    });
    var sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
    return new Promise(function (res, rej) {
      (function wait() {
        if (me.lost) return rej(new Error('lost'));
        var st = gl.clientWaitSync(sync, 0, 0);
        if (st === gl.TIMEOUT_EXPIRED) return setTimeout(wait, 4);
        gl.deleteSync(sync);
        var out = new Float32Array(48 * pl), buf = new Float32Array(pl * 4);
        for (var g = 0; g < 12; g++) {
          gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, me.T[src], 0, g);
          gl.readPixels(0, 0, W, H, gl.RGBA, gl.FLOAT, buf);
          for (var c = 0; c < 4; c++) { var ob = (g * 4 + c) * pl; for (var k = 0; k < pl; k++) out[ob + k] = buf[k * 4 + c]; }
        }
        if (gl.getError() !== gl.NO_ERROR) return rej(new Error('gl'));
        res(out);
      })();
    });
  };
  GlNet.prototype.free = function () { var gl = this.gl; if (this.T) this.T.forEach(function (t) { gl.deleteTexture(t); }); gl.deleteBuffer(this.ubo); var x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); };

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
  var eng = null, engDn = 0, prefer = null;
  U.engine = function () {
    var dn = DN[U.strength] || DN.mid;
    if (eng && engDn === dn) return eng;
    if (eng) eng.then(function (E) { try { E.net.free(); } catch (e) {} });
    engDn = dn;
    eng = U.load().then(function (M) {
      var cpu = U._forceCpu || prefer === 'cpu';
      return (cpu || U._forceGl ? Promise.resolve(null) : U.gpu()).then(function (g) {
        if (g) { try { return { kind: 'gpu', net: new GpuNet(g, M), M: M }; } catch (e) {} }
        if (!cpu) { try { return { kind: 'gl', net: new GlNet(M), M: M }; } catch (e) {} }
        return { kind: 'cpu', net: new CpuNet(M), M: M };
      });
    });
    eng.catch(function () { eng = null; });
    return eng;
  };
  U.limits = function (kind, pxs) { // sizes this device can hold in memory; time is shown, never used to switch the feature off
    var phone = KE.platform === 'android' || /Android|iPhone|iPad/.test(navigator.userAgent);
    var outPx = kind === 'cpu' ? (phone ? 12e6 : 36e6) : (phone ? 24e6 : 64e6);
    return { outPx: outPx, inPx: outPx / 4, outSide: phone ? 6144 : 12288, pxs: pxs };
  };
  // speed of this device in input pixels per second (measured once on a small tile)
  var speed = null;
  function probe(E) {
    var T = 48, rgb = new Float32Array(3 * T * T); for (var i = 0; i < rgb.length; i++) rgb[i] = (i * 37 % 255) / 255;
    var rgb2 = new Float32Array(rgb), t0 = performance.now();
    return E.net.run(rgb, T, T).then(function () { var t1 = performance.now(); return E.net.run(rgb2, T, T).then(function () {
      var ms = Math.max(1, performance.now() - t1); return T * T / (ms / 1000) * (E.kind === 'gpu' ? 1.6 : E.kind === 'gl' ? 1.3 : E.net.parallel()); }); });
  }
  U.speed = function () {
    if (speed) return speed;
    speed = U.engine().then(function (E) {
      return probe(E).then(function (g) {
        if (E.kind !== 'gl' || U._forceGl || g > 6000) return { kind: E.kind, pxs: g };
        var C = { kind: 'cpu', net: new CpuNet(E.M), M: E.M }; // graphics looks emulated: compare with the processor and keep the faster
        return probe(C).then(function (c) { if (c > g) { E.net.free(); prefer = 'cpu'; eng = Promise.resolve(C); return { kind: 'cpu', pxs: c }; } C.net.free(); return { kind: 'gl', pxs: g }; });
      });
    });
    speed.catch(function () { speed = null; });
    return speed;
  };
  // src: canvas with the (cropped, edited) picture. scale: 1 (same size, rebuilt detail), 2, 3 or 4. Resolves to a canvas scale x bigger.
  U.run = function (src, scale, onProgress, cancelled) {
    return U.engine().then(function (E) {
      var w = src.width, h = src.height, T = E.kind === 'gpu' ? (Math.min(w, h) > 600 ? 256 : 192) : E.kind === 'gl' ? 160 : 96;
      while (E.kind === 'gpu' && 64 * (T + 2 * PAD) * (T + 2 * PAD) * 4 > E.net.g.maxBuf) T -= 32;
      var sx = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
      var S = Math.max(1, Math.min(4, Math.round(scale) || 4)); // the network gives 4x; each tile is reduced at once (to 1x-4x) so memory stays at the size asked for
      var out = document.createElement('canvas'); out.width = w * S; out.height = h * S;
      var wts = {}; function axis(n) { // area weights from 4n source pixels to S*n target pixels
        var k = n + ':' + S; if (wts[k]) return wts[k]; var r = [], f = 4 / S;
        for (var X = 0; X < n * S; X++) { var a0 = X * f, a1 = a0 + f, lst = []; for (var q = Math.floor(a0); q < Math.ceil(a1 - 1e-9); q++) { var wgt = Math.min(a1, q + 1) - Math.max(a0, q); if (wgt > 1e-9) lst.push(q, wgt / f); } r.push(lst); }
        return (wts[k] = r);
      }
      function shrink(img, tw, th) {
        if (S === 4) return img; var iw = tw * 4, s = img.data, ax = axis(tw), ay = axis(th), o = new ImageData(tw * S, th * S), d = o.data;
        for (var Y = 0; Y < th * S; Y++) { var ly = ay[Y]; for (var X = 0; X < tw * S; X++) { var lx = ax[X], c0 = 0, c1 = 0, c2 = 0, c3 = 0;
          for (var b = 0; b < ly.length; b += 2) { var row = ly[b] * iw, wy = ly[b + 1]; for (var a = 0; a < lx.length; a += 2) { var i = (row + lx[a]) * 4, wv = wy * lx[a + 1]; c0 += s[i] * wv; c1 += s[i + 1] * wv; c2 += s[i + 2] * wv; c3 += s[i + 3] * wv; } }
          var di = (Y * tw * S + X) * 4; d[di] = c0 + 0.5; d[di + 1] = c1 + 0.5; d[di + 2] = c2 + 0.5; d[di + 3] = c3 + 0.5; } }
        return o;
      }
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
          ox.putImageData(shrink(img, t[2], t[3]), t[0] * S, t[1] * S);
          done++; onProgress && onProgress(done / tiles.length, done, tiles.length);
        });
      }
      function lane() { if (cancelled && cancelled()) return Promise.reject(new Error('cancel')); if (next >= tiles.length) return Promise.resolve(); return tile(tiles[next++]).then(lane); }
      var lanes = []; for (var k = 0; k < par; k++) lanes.push(lane());
      var watch, stop = new Promise(function (res, rej) { watch = setInterval(function () { if (cancelled && cancelled()) { clearInterval(watch); if (E.kind === 'cpu') { E.net.free(); eng = null; } rej(new Error('cancel')); } }, 80); });
      return Promise.race([Promise.all(lanes), stop]).then(function (x) { clearInterval(watch); return x; }, function (e) { clearInterval(watch); throw e; }).then(function () {
        return out;
      });
    });
  };
})();
