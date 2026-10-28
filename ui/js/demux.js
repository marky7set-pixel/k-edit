/* K-Edit demux: read MP4/MOV and WebM/MKV files and decode frames in order with the device's video decoder (WebCodecs).
   Exact frames, no seeking. If anything is unsupported, the caller falls back to seeking the <video> element. */
(function () {
  'use strict';
  var KE = window.KE;
  function rd(file, a, b) { return file.slice(a, b).arrayBuffer().then(function (x) { return new Uint8Array(x); }); }
  function u32(u, o) { return ((u[o] << 24) | (u[o + 1] << 16) | (u[o + 2] << 8) | u[o + 3]) >>> 0; }
  function u16(u, o) { return (u[o] << 8) | u[o + 1]; }
  function s32(u, o) { return u32(u, o) | 0; }
  function u64(u, o) { return u32(u, o) * 4294967296 + u32(u, o + 4); }
  function typ(u, o) { return String.fromCharCode(u[o], u[o + 1], u[o + 2], u[o + 3]); }
  function hex2(v) { return (v < 16 ? '0' : '') + v.toString(16); }

  /* ================= MP4 / MOV ================= */
  function topBoxes(file) { // find moov without reading mdat
    var pos = 0, size = file.size;
    function nx() {
      if (pos + 8 > size) return Promise.reject(new Error('nomoov'));
      return rd(file, pos, Math.min(size, pos + 16)).then(function (h) {
        var s = u32(h, 0), t = typ(h, 4), hl = 8;
        if (s === 1) { s = u64(h, 8); hl = 16; } else if (s === 0) s = size - pos;
        if (t === 'moov') return rd(file, pos, pos + s);
        if (s < 8) return Promise.reject(new Error('bad'));
        pos += s; return nx();
      });
    }
    return nx();
  }
  function kids(u, a, b, fn) { var o = a; while (o + 8 <= b) { var s = u32(u, o), t = typ(u, o + 4), h = 8; if (s === 1) { s = u64(u, o + 8); h = 16; } else if (s === 0) s = b - o; if (s < 8) break; fn(t, o + h, o + s, o); o += s; } }
  function find(u, a, b, path) { var r = null; kids(u, a, b, function (t, s, e) { if (r) return; if (t === path[0]) r = path.length === 1 ? [s, e] : find(u, s, e, path.slice(1)); }); return r; }
  function codecFromEntry(u, t, s, e) {
    var cfgStart = s + 78, out = { type: t };
    kids(u, cfgStart, e, function (bt, bs, be) {
      if (bt === 'avcC') { out.desc = u.slice(bs, be); out.codec = 'avc1.' + hex2(u[bs + 1]) + hex2(u[bs + 2]) + hex2(u[bs + 3]); }
      else if (bt === 'hvcC') {
        out.desc = u.slice(bs, be);
        var b1 = u[bs + 1], space = ['', 'A', 'B', 'C'][b1 >> 6], tier = (b1 >> 5) & 1 ? 'H' : 'L', prof = b1 & 31, compat = u32(u, bs + 2), rev = 0;
        for (var i = 0; i < 32; i++) if (compat & (1 << i)) rev |= 1 << (31 - i);
        var lvl = u[bs + 12], cons = []; for (var k = 6; k < 12; k++) cons.push(u[bs + k]); while (cons.length && !cons[cons.length - 1]) cons.pop();
        out.codec = (t === 'hev1' ? 'hev1.' : 'hvc1.') + space + prof + '.' + (rev >>> 0).toString(16) + '.' + tier + lvl + (cons.length ? '.' + cons.map(function (c) { return c.toString(16); }).join('.') : '');
      } else if (bt === 'vpcC') { out.codec = 'vp09.' + hex2(u[bs + 4]) + '.' + hex2(u[bs + 5]) + '.' + hex2(u[bs + 6] >> 4); }
      else if (bt === 'av1C') { out.desc = u.slice(bs, be); var p = u[bs + 1] >> 5, l = u[bs + 1] & 31, tr = (u[bs + 2] >> 7) ? 'H' : 'M', bd = (u[bs + 2] >> 6) & 1 ? ((u[bs + 2] >> 5) & 1 ? 12 : 10) : 8; out.codec = 'av01.' + p + '.' + hex2(l) + tr + '.' + hex2(bd); }
    });
    if (!out.codec && t === 'vp08') out.codec = 'vp8';
    return out;
  }
  KE.demuxMP4 = function (file) {
    return topBoxes(file).then(function (u) {
      var mvhd = find(u, 8, u.length, ['mvhd']), movTs = mvhd ? u32(u, mvhd[0] + (u[mvhd[0]] === 1 ? 20 : 12)) : 1000, track = null;
      kids(u, 8, u.length, function (t, s, e) {
        if (t !== 'trak' || track) return;
        var hd = find(u, s, e, ['mdia', 'hdlr']); if (!hd || typ(u, hd[0] + 8) !== 'vide') return;
        var tk = find(u, s, e, ['tkhd']), v1 = u[tk[0]] === 1, mo = tk[0] + (v1 ? 52 : 40);
        var a = s32(u, mo) / 65536, bb = s32(u, mo + 4) / 65536, rot = (Math.round(Math.atan2(bb, a) * 180 / Math.PI) + 360) % 360;
        var md = find(u, s, e, ['mdia', 'mdhd']), ts = u32(u, md[0] + (u[md[0]] === 1 ? 20 : 12));
        var st = find(u, s, e, ['mdia', 'minf', 'stbl']), S = st[0], E = st[1], box = {};
        kids(u, S, E, function (bt, bs, be) { box[bt] = [bs, be]; });
        var sd = box.stsd, ent = null; kids(u, sd[0] + 8, sd[1], function (et, es, ee) { if (!ent) ent = codecFromEntry(u, et, es, ee); });
        var w = u16(u, sd[0] + 8 + 8 + 24), h = u16(u, sd[0] + 8 + 8 + 26);
        var sizes = [], n, i, o;
        o = box.stsz[0]; var fixed = u32(u, o + 4); n = u32(u, o + 8); for (i = 0; i < n; i++) sizes.push(fixed || u32(u, o + 12 + i * 4));
        var co = [], c64 = !box.stco; o = (box.stco || box.co64)[0]; var nc = u32(u, o + 4); for (i = 0; i < nc; i++) co.push(c64 ? u64(u, o + 8 + i * 8) : u32(u, o + 8 + i * 4));
        var stsc = []; o = box.stsc[0]; var ns = u32(u, o + 4); for (i = 0; i < ns; i++) stsc.push([u32(u, o + 8 + i * 12), u32(u, o + 12 + i * 12)]);
        var dts = [], d = 0; o = box.stts[0]; var nt = u32(u, o + 4); for (i = 0; i < nt; i++) { var cnt = u32(u, o + 8 + i * 8), dl = u32(u, o + 12 + i * 8); for (var k = 0; k < cnt; k++) { dts.push(d); d += dl; } }
        var cts = null; if (box.ctts) { cts = []; o = box.ctts[0]; var v = u[o], nct = u32(u, o + 4); for (i = 0; i < nct; i++) { var cc = u32(u, o + 8 + i * 8), off = v ? s32(u, o + 12 + i * 8) : u32(u, o + 12 + i * 8); for (k = 0; k < cc; k++) cts.push(off); } }
        var sync = null; if (box.stss) { sync = {}; o = box.stss[0]; var nss = u32(u, o + 4); for (i = 0; i < nss; i++) sync[u32(u, o + 8 + i * 4) - 1] = 1; }
        // edit list: shift so times match the <video> element
        var shift = 0, el = find(u, s, e, ['edts', 'elst']);
        if (el) { var ev = u[el[0]], ne = u32(u, el[0] + 4), p2 = el[0] + 8, empty = 0;
          for (i = 0; i < ne; i++) { var sd2 = ev ? u64(u, p2) : u32(u, p2), mt = ev ? (u32(u, p2 + 8) | 0) * 4294967296 + u32(u, p2 + 12) : s32(u, p2 + 4); p2 += ev ? 20 : 12;
            if (mt === -1) { empty += sd2 / movTs; continue; } shift = mt / ts - empty; break; } }
        var samples = [], si = 0;
        for (var ci = 0; ci < co.length; ci++) {
          var per = 0; for (var q = stsc.length - 1; q >= 0; q--) if (stsc[q][0] - 1 <= ci) { per = stsc[q][1]; break; }
          var off2 = co[ci];
          for (k = 0; k < per && si < sizes.length; k++, si++) { var pts = dts[si] + (cts ? cts[si] : 0); samples.push({ off: off2, size: sizes[si], t: pts / ts - shift, key: sync ? !!sync[si] : true }); off2 += sizes[si]; }
        }
        track = { codec: ent && ent.codec, desc: ent && ent.desc, w: w, h: h, rot: rot, samples: samples };
      });
      if (!track || !track.codec || !track.samples.length) throw new Error('notrack');
      return track;
    });
  };

  /* ================= WebM / MKV ================= */
  function vintAt(u, o) { var b = u[o], len = 1, m = 0x80; while (len <= 8 && !(b & m)) { m >>= 1; len++; } if (len > 8) return null; var v = b & (m - 1), all = v === m - 1; for (var i = 1; i < len; i++) { v = v * 256 + u[o + i]; if (u[o + i] !== 255) all = false; } return { v: v, len: len, unknown: all }; }
  function idAt(u, o) { var b = u[o], len = 1, m = 0x80; while (len <= 4 && !(b & m)) { m >>= 1; len++; } var v = 0; for (var i = 0; i < len; i++) v = v * 256 + u[o + i]; return { id: v, len: len }; }
  KE.demuxWebM = function (file) {
    if (file.size > 1.5e9) return Promise.reject(new Error('big'));
    return file.arrayBuffer().then(function (ab) {
      var u = new Uint8Array(ab), tracks = {}, vt = null, scale = 1e6, samples = [];
      var MASTER = { 0x18538067: 1, 0x1654AE6B: 1, 0xAE: 1, 0xE0: 1, 0x1F43B675: 1, 0xA0: 1, 0x1549A966: 1 };
      var o = 0, clusterTc = 0, cur = null, endStack = [];
      while (o < u.length - 2) {
        var id = idAt(u, o); if (!id.len || o + id.len >= u.length) break;
        var sz = vintAt(u, o + id.len); if (!sz) break;
        var ds = o + id.len + sz.len, de = sz.unknown ? u.length : Math.min(u.length, ds + sz.v), I = id.id;
        if (I === 0x1F43B675) clusterTc = 0;
        if (MASTER[I]) { if (I === 0xAE) cur = {}; if (I === 0xA0) cur = cur; o = ds; if (I === 0xAE) endStack.push([de, function (c) { return function () { tracks[c.num] = c; }; }(cur)]); }
        else {
          if (I === 0x2AD7B1) { scale = 0; for (var i = ds; i < de; i++) scale = scale * 256 + u[i]; }
          else if (I === 0xD7 && cur) { cur.num = 0; for (i = ds; i < de; i++) cur.num = cur.num * 256 + u[i]; }
          else if (I === 0x83 && cur) cur.type = u[ds];
          else if (I === 0x86 && cur) cur.codec = String.fromCharCode.apply(null, u.subarray(ds, de));
          else if (I === 0x63A2 && cur) cur.priv = u.slice(ds, de);
          else if (I === 0xB0 && cur) { cur.w = 0; for (i = ds; i < de; i++) cur.w = cur.w * 256 + u[i]; }
          else if (I === 0xBA && cur) { cur.h = 0; for (i = ds; i < de; i++) cur.h = cur.h * 256 + u[i]; }
          else if (I === 0xE7) { clusterTc = 0; for (i = ds; i < de; i++) clusterTc = clusterTc * 256 + u[i]; }
          else if (I === 0xA3 || I === 0xA1) { // SimpleBlock / Block
            if (!vt) { for (var k in tracks) if (tracks[k].type === 1) { vt = tracks[k]; break; } }
            var tn = vintAt(u, ds); if (vt && tn.v === vt.num) {
              var p = ds + tn.len, rel = (u[p] << 8 | u[p + 1]); if (rel & 0x8000) rel -= 0x10000; var fl = u[p + 2];
              if (fl & 0x06) throw new Error('lacing');
              samples.push({ off: p + 3, size: de - p - 3, t: (clusterTc + rel) * scale / 1e9, key: I === 0xA3 ? !!(fl & 0x80) : null });
            }
          }
          o = de;
        }
        while (endStack.length && o >= endStack[endStack.length - 1][0]) endStack.pop()[1]();
      }
      while (endStack.length) endStack.pop()[1]();
      if (!vt) { for (var k2 in tracks) if (tracks[k2].type === 1) { vt = tracks[k2]; break; } }
      if (!vt || !samples.length) throw new Error('notrack');
      var cid = vt.codec, codec = cid === 'V_VP8' ? 'vp8' : cid === 'V_VP9' ? 'vp09.00.10.08' : cid === 'V_AV1' ? 'av01.0.08M.08' : cid === 'V_MPEG4/ISO/AVC' && vt.priv ? 'avc1.' + hex2(vt.priv[1]) + hex2(vt.priv[2]) + hex2(vt.priv[3]) : null;
      if (!codec) throw new Error('codec');
      samples.forEach(function (s, i) { if (s.key === null) s.key = i === 0; s.data = u.subarray(s.off, s.off + s.size); });
      samples.sort(function (a, b) { return a.t - b.t; });
      return { codec: codec, desc: cid === 'V_VP9' || cid === 'V_VP8' ? null : vt.priv, w: vt.w, h: vt.h, rot: 0, samples: samples, inMemory: true };
    });
  };

  /* ================= decode in order ================= */
  function open(file) {
    var n = (file.name || '').toLowerCase(), t = file.type || '';
    var webm = /webm|matroska|mkv/.test(t) || /\.(webm|mkv)$/.test(n);
    return (webm ? KE.demuxWebM(file) : KE.demuxMP4(file).catch(function () { return KE.demuxWebM(file); }));
  }
  var cacheF = null, cacheT = null;
  KE.openTrack = function (file) {
    if (!window.VideoDecoder || !file) return Promise.reject(new Error('nodec'));
    if (cacheF === file) return cacheT;
    cacheF = file;
    cacheT = open(file).then(function (tr) {
      var cfg = { codec: tr.codec, codedWidth: tr.w, codedHeight: tr.h };
      if (tr.desc) cfg.description = tr.desc;
      return VideoDecoder.isConfigSupported(cfg).then(function (r) {
        if (r.supported) { tr.cfg = cfg; return tr; }
        var c2 = Object.assign({}, cfg, { hardwareAcceleration: 'prefer-software' });
        return VideoDecoder.isConfigSupported(c2).then(function (r2) { if (!r2.supported) throw new Error('unsupported'); tr.cfg = c2; return tr; });
      }).then(probeColor);
    });
    cacheT.catch(function () {});
    return cacheT;
  };
  // decode the first key frame once: if the file does not say its colour standard, use BT.601 like the player does
  function probeColor(tr) {
    var s = tr.samples[0];
    return (s.data ? Promise.resolve(s.data) : rd(cacheF, s.off, s.off + s.size)).then(function (d) {
      return new Promise(function (res) {
        var bt601 = { matrix: 'smpte170m', primaries: 'smpte170m', transfer: 'smpte170m', fullRange: false };
        if (tr.codec.indexOf('vp09') === 0 && vp9ColorSpace(d) === 0) tr.cfg = Object.assign({}, tr.cfg, { colorSpace: bt601 }); // unknown -> like the player
        res(tr);
      });
    });
  }
  function vp9ColorSpace(u) { // read color_space from the first key frame header (-1 = could not tell)
    var bit = 0; function b(n) { var v = 0; for (var i = 0; i < n; i++) { var by = u[bit >> 3]; v = (v << 1) | ((by >> (7 - (bit & 7))) & 1); bit++; } return v; }
    try {
      if (b(2) !== 2) return -1; var lo = b(1), hi = b(1), prof = (hi << 1) | lo; if (prof === 3) b(1);
      if (b(1)) return -1; if (b(1) !== 0) return -1; b(1); b(1);
      if (b(8) !== 0x49 || b(8) !== 0x83 || b(8) !== 0x42) return -1;
      if (prof >= 2) b(1);
      return b(3);
    } catch (e) { return -1; }
  }
  // draw a decoded frame (with the file's rotation) so that the display-space crop fills dw x dh
  KE.drawFrame = function (ctx, fr, rot, crop, dw, dh) {
    var fw = fr.displayWidth, fh = fr.displayHeight, Dw = rot % 180 ? fh : fw, Dh = rot % 180 ? fw : fh;
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(dw / crop.w, 0, 0, dh / crop.h, -crop.x * dw / crop.w, -crop.y * dh / crop.h);
    if (rot === 90) { ctx.translate(Dw, 0); ctx.rotate(Math.PI / 2); }
    else if (rot === 180) { ctx.translate(Dw, Dh); ctx.rotate(Math.PI); }
    else if (rot === 270) { ctx.translate(0, Dh); ctx.rotate(-Math.PI / 2); }
    ctx.drawImage(fr, 0, 0, fw, fh); ctx.restore();
  };
  // times: target times (s) in order. consume(i, draw) may return a promise; draw(ctx, crop, w, h) paints that frame.
  KE.decodeRun = function (file, times, consume, opt) {
    opt = opt || {};
    return KE.openTrack(file).then(function (tr) {
      var S = tr.samples, n = times.length, t0 = times[0], tEnd = times[n - 1];
      var startIdx = 0; for (var i = 0; i < S.length; i++) { if (S[i].t <= t0 + 1e-4 && S[i].key) startIdx = i; if (S[i].t > t0) break; }
      if (!S[startIdx].key) throw new Error('nokey');
      var q = [], err = null, j = 0, prev = null, fed = startIdx, flushed = false, dec;
      dec = new VideoDecoder({ output: function (f) { q.push(f); }, error: function (e) { err = e; } });
      dec.configure(tr.cfg);
      function data(s) { return s.data ? Promise.resolve(s.data) : rd(file, s.off, s.off + s.size); }
      function feed() {
        if (err) return Promise.reject(err);
        if (fed >= S.length || S[fed].t > tEnd + 1.0) { if (!flushed) { flushed = true; return dec.flush().catch(function (e) { err = e; }); } return Promise.resolve(); }
        if (q.length + dec.decodeQueueSize > 6) return Promise.resolve();
        var s = S[fed++];
        return data(s).then(function (d) { dec.decode(new EncodedVideoChunk({ type: s.key ? 'key' : 'delta', timestamp: Math.round(s.t * 1e6), data: d })); return feed(); });
      }
      var drawFn = function (f) { return function (ctx, crop, w, h) { KE.drawFrame(ctx, f, tr.rot, crop, w, h); }; };
      function emitUpTo(limit, f) { // targets before `limit` use frame f
        var p = Promise.resolve();
        while (j < n && times[j] < limit) { (function (k) { p = p.then(function () { if (opt.cancelled && opt.cancelled()) throw new Error('cancel'); return consume(k, drawFn(f)); }); })(j); j++; }
        return p;
      }
      function loop() {
        if (opt.cancelled && opt.cancelled()) return Promise.reject(new Error('cancel'));
        return feed().then(function () {
          if (err) throw err;
          if (j >= n) return;
          if (q.length) {
            var f = q.shift(), ft = f.timestamp / 1e6;
            var p = prev ? emitUpTo(ft - 1e-4, prev) : Promise.resolve();
            return p.then(function () { if (prev) prev.close(); prev = f; return loop(); });
          }
          if (flushed) return prev ? emitUpTo(Infinity, prev) : Promise.reject(new Error('noframes'));
          return new Promise(function (r) { setTimeout(r, 2); }).then(loop);
        });
      }
      function clean() { if (prev) { prev.close(); prev = null; } q.forEach(function (f) { f.close(); }); q = []; try { dec.close(); } catch (e) {} }
      return loop().then(function () { clean(); }, function (e) { clean(); throw e; });
    });
  };
})();
