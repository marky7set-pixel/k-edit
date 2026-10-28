/* K-Edit media: MP4 (H.264 + AAC/Opus), WebM (VP9/VP8 + Opus) and AVIF (AV1 still), using the device's own encoders (WebCodecs).
   The files are packed here (MP4 boxes, WebM/EBML, HEIF), so nothing extra is needed. */
(function () {
  'use strict';
  var KE = window.KE;
  /* ---------- tiny byte writer ---------- */
  function W() { this.a = new Uint8Array(256); this.n = 0; }
  W.prototype.need = function (k) { if (this.n + k > this.a.length) { var b = new Uint8Array(Math.max(this.a.length * 2, this.n + k + 64)); b.set(this.a.subarray(0, this.n)); this.a = b; } };
  W.prototype.u8 = function (v) { this.need(1); this.a[this.n++] = v & 255; return this; };
  W.prototype.u16 = function (v) { return this.u8(v >> 8).u8(v); };
  W.prototype.u24 = function (v) { return this.u8(v >> 16).u8(v >> 8).u8(v); };
  W.prototype.u32 = function (v) { return this.u8(v >>> 24).u8(v >>> 16).u8(v >>> 8).u8(v); };
  W.prototype.i32 = function (v) { return this.u32(v >>> 0); };
  W.prototype.bytes = function (b) { this.need(b.length); this.a.set(b, this.n); this.n += b.length; return this; };
  W.prototype.str = function (s) { for (var i = 0; i < s.length; i++) this.u8(s.charCodeAt(i)); return this; };
  W.prototype.zero = function (k) { for (var i = 0; i < k; i++) this.u8(0); return this; };
  W.prototype.out = function () { return this.a.slice(0, this.n); };
  function cat(list) { var n = 0, i; for (i = 0; i < list.length; i++) n += list[i].length; var o = new Uint8Array(n), p = 0; for (i = 0; i < list.length; i++) { o.set(list[i], p); p += list[i].length; } return o; }
  function box(type, parts) { var body = cat(parts || []), w = new W(); w.u32(8 + body.length).str(type).bytes(body); return w.out(); }
  function fbox(type, ver, flags, parts) { var h = new W(); h.u8(ver).u24(flags); return box(type, [h.out()].concat(parts || [])); }
  function bin(fn) { var w = new W(); fn(w); return w.out(); }
  function u8(x) { if (!x) return null; if (x instanceof Uint8Array) return x; if (x instanceof ArrayBuffer) return new Uint8Array(x); return new Uint8Array(x.buffer, x.byteOffset, x.byteLength); }
  var MATRIX = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000];

  /* ---------- MP4 ---------- */
  // tracks: [{kind:'video'|'audio', codec, w, h, rate, ch, desc, samples:[{data, pts (us), dur (us), key}]}]
  KE.muxMP4 = function (tracks) {
    var MT = 1000, durMs = 0, traks = [], order = [];
    tracks.forEach(function (t, ti) {
      var ts = t.kind === 'video' ? 90000 : t.rate, s = t.samples, n = s.length;
      var pts = s.map(function (x) { return Math.round(x.pts * ts / 1e6); });
      var dts = pts.slice().sort(function (a, b) { return a - b; });
      var end = Math.round((s[n - 1].pts + s[n - 1].dur) * ts / 1e6), tdur = end - dts[0];
      durMs = Math.max(durMs, Math.round(tdur * MT / ts));
      var stts = [], i;
      for (i = 0; i < n; i++) { var d = (i < n - 1 ? dts[i + 1] : end) - dts[i]; if (stts.length && stts[stts.length - 1][1] === d) stts[stts.length - 1][0]++; else stts.push([1, d]); }
      var ct = pts.map(function (p, k) { return p - dts[k]; }), needCt = ct.some(function (c) { return c !== 0; });
      t._ts = ts; t._dur = tdur; t._stts = stts; t._ct = needCt ? ct : null; t._id = ti + 1;
      for (i = 0; i < n; i++) order.push({ t: t, i: i, at: s[i].pts });
    });
    order.sort(function (a, b) { return a.at - b.at; });
    function stbl(t, offs) {
      var s = t.samples, entry;
      if (t.kind === 'video') {
        entry = box('avc1', [bin(function (w) { w.zero(6).u16(1).u16(0).u16(0).zero(12).u16(t.w).u16(t.h).u32(0x480000).u32(0x480000).u32(0).u16(1).u8(6).str('K-Edit').zero(25).u16(0x18).u16(0xffff); }), box('avcC', [t.desc])]);
      } else if (t.codec === 'aac') {
        var asc = t.desc, dsi = bin(function (w) { w.u8(5).u8(asc.length).bytes(asc); }), dcd = bin(function (w) { w.u8(4).u8(13 + dsi.length).u8(0x40).u8(0x15).u24(0).u32(t.br || 128000).u32(t.br || 128000).bytes(dsi); });
        var esd = bin(function (w) { w.u8(3).u8(3 + dcd.length + 3).u16(1).u8(0).bytes(dcd).u8(6).u8(1).u8(2); });
        entry = box('mp4a', [bin(function (w) { w.zero(6).u16(1).zero(8).u16(t.ch).u16(16).u16(0).u16(0).u32(t.rate * 65536); }), fbox('esds', 0, 0, [esd])]);
      } else {
        entry = box('Opus', [bin(function (w) { w.zero(6).u16(1).zero(8).u16(t.ch).u16(16).u16(0).u16(0).u32(48000 * 65536); }),
          box('dOps', [bin(function (w) { w.u8(0).u8(t.ch).u16(t.preskip || 312).u32(48000).u16(0).u8(0); })])]);
      }
      var parts = [fbox('stsd', 0, 0, [bin(function (w) { w.u32(1); }), entry]),
        fbox('stts', 0, 0, [bin(function (w) { w.u32(t._stts.length); t._stts.forEach(function (e) { w.u32(e[0]).u32(e[1]); }); })])];
      if (t._ct) parts.push(fbox('ctts', 1, 0, [bin(function (w) { w.u32(t._ct.length); t._ct.forEach(function (c) { w.u32(1).i32(c); }); })]));
      if (t.kind === 'video') parts.push(fbox('stss', 0, 0, [bin(function (w) { var k = []; s.forEach(function (x, i) { if (x.key) k.push(i + 1); }); w.u32(k.length); k.forEach(function (v) { w.u32(v); }); })]));
      parts.push(fbox('stsc', 0, 0, [bin(function (w) { w.u32(1).u32(1).u32(1).u32(1); })]));
      parts.push(fbox('stsz', 0, 0, [bin(function (w) { w.u32(0).u32(s.length); s.forEach(function (x) { w.u32(x.data.length); }); })]));
      parts.push(fbox('stco', 0, 0, [bin(function (w) { w.u32(s.length); for (var i = 0; i < s.length; i++) w.u32(offs ? offs[i] : 0); })]));
      return box('stbl', parts);
    }
    function moov(offsets) {
      var tk = tracks.map(function (t) {
        var vid = t.kind === 'video', ms = Math.round(t._dur * MT / t._ts);
        var tkhd = fbox('tkhd', 0, 3, [bin(function (w) { w.u32(0).u32(0).u32(t._id).u32(0).u32(ms).zero(8).u16(0).u16(vid ? 0 : 1).u16(vid ? 0 : 0x100).u16(0); MATRIX.forEach(function (m) { w.u32(m); }); w.u32((vid ? t.w : 0) * 65536).u32((vid ? t.h : 0) * 65536); })]);
        var mdhd = fbox('mdhd', 0, 0, [bin(function (w) { w.u32(0).u32(0).u32(t._ts).u32(t._dur).u16(0x55c4).u16(0); })]);
        var hdlr = fbox('hdlr', 0, 0, [bin(function (w) { w.u32(0).str(vid ? 'vide' : 'soun').zero(12).str(vid ? 'VideoHandler' : 'SoundHandler').u8(0); })]);
        var mh = vid ? fbox('vmhd', 0, 1, [bin(function (w) { w.zero(8); })]) : fbox('smhd', 0, 0, [bin(function (w) { w.zero(4); })]);
        var dinf = box('dinf', [fbox('dref', 0, 0, [bin(function (w) { w.u32(1); }), fbox('url ', 0, 1, [])])]);
        return box('trak', [tkhd, box('mdia', [mdhd, hdlr, box('minf', [mh, dinf, stbl(t, offsets && offsets[t._id])])])]);
      });
      var mvhd = fbox('mvhd', 0, 0, [bin(function (w) { w.u32(0).u32(0).u32(MT).u32(durMs).u32(0x10000).u16(0x100).zero(10); MATRIX.forEach(function (m) { w.u32(m); }); w.zero(24).u32(tracks.length + 1); })]);
      return box('moov', [mvhd].concat(tk));
    }
    var ftyp = box('ftyp', [bin(function (w) { w.str('isom').u32(0x200).str('isomiso2avc1mp41'); })]);
    var size0 = moov(null).length, pos = ftyp.length + size0 + 8, offs = {};
    tracks.forEach(function (t) { offs[t._id] = new Array(t.samples.length); });
    order.forEach(function (o) { offs[o.t._id][o.i] = pos; pos += o.t.samples[o.i].data.length; });
    var mv = moov(offs), mdatSize = pos - ftyp.length - size0;
    var head = new W(); head.u32(mdatSize).str('mdat');
    var parts = [ftyp, mv, head.out()];
    order.forEach(function (o) { parts.push(o.t.samples[o.i].data); });
    return new Blob(parts, { type: 'video/mp4' });
  };

  /* ---------- WebM ---------- */
  function vint(n) { // EBML size, shortest form
    for (var len = 1; len <= 8; len++) if (n < Math.pow(2, 7 * len) - 1) break;
    var o = new Uint8Array(len), v = n;
    for (var i = len - 1; i >= 0; i--) { o[i] = v % 256; v = Math.floor(v / 256); }
    o[0] |= 1 << (8 - len); return o;
  }
  function idb(id) { var a = []; while (id > 0) { a.unshift(id & 255); id = Math.floor(id / 256); } return new Uint8Array(a); }
  function el(id, body) { body = body instanceof Uint8Array ? body : cat(body); return cat([idb(id), vint(body.length), body]); }
  function uintb(v) { var a = []; do { a.unshift(v % 256); v = Math.floor(v / 256); } while (v > 0); return new Uint8Array(a); }
  function ue(id, v) { return el(id, uintb(v)); }
  function fe(id, v) { var b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v); return el(id, b); }
  function se(id, s) { return el(id, bin(function (w) { w.str(s); })); }
  KE.opusHead = function (ch, preskip) { return bin(function (w) { w.str('OpusHead').u8(1).u8(ch).u8(preskip & 255).u8(preskip >> 8).u8(48000 & 255).u8((48000 >> 8) & 255).u8(0).u8(0).u8(0).u8(0).u8(0); }); };
  KE.muxWebM = function (tracks) {
    var v = tracks[0], a = tracks[1], durMs = 0;
    tracks.forEach(function (t) { var l = t.samples[t.samples.length - 1]; durMs = Math.max(durMs, (l.pts + l.dur) / 1000); });
    var ebml = el(0x1A45DFA3, [ue(0x4286, 1), ue(0x42F7, 1), ue(0x42F2, 4), ue(0x42F3, 8), se(0x4282, 'webm'), ue(0x4287, 4), ue(0x4285, 2)]);
    var info = el(0x1549A966, [ue(0x2AD7B1, 1000000), fe(0x4489, durMs), se(0x4D80, 'K-Edit'), se(0x5741, 'K-Edit')]);
    var te = [el(0xAE, [ue(0xD7, 1), ue(0x73C5, 1), ue(0x83, 1), se(0x86, v.codec === 'vp8' ? 'V_VP8' : 'V_VP9'), el(0xE0, [ue(0xB0, v.w), ue(0xBA, v.h)])])];
    if (a) te.push(el(0xAE, [ue(0xD7, 2), ue(0x73C5, 2), ue(0x83, 2), se(0x86, 'A_OPUS'), el(0x63A2, KE.opusHead(a.ch, a.preskip || 312)),
      ue(0x56AA, Math.round((a.preskip || 312) / 48000 * 1e9)), ue(0x56BB, 80000000), el(0xE1, [fe(0xB5, 48000), ue(0x9F, a.ch)])]));
    var tracksEl = el(0x1654AE6B, te);
    // all blocks in time order, new cluster at each video key frame (or every 5 s)
    var all = [];
    tracks.forEach(function (t, ti) { t.samples.forEach(function (s) { all.push({ tn: ti + 1, ms: Math.round(s.pts / 1000), key: ti === 1 || s.key, data: s.data, vk: ti === 0 && s.key }); }); });
    all.sort(function (x, y) { return x.ms - y.ms || x.tn - y.tn; });
    var clusters = [], cur = null;
    all.forEach(function (b) {
      if (!cur || (b.vk && b.ms - cur.t >= 1000) || b.ms - cur.t > 5000) { cur = { t: b.ms, blocks: [], key: b.vk }; clusters.push(cur); }
      var hd = new Uint8Array(4); hd[0] = 0x80 | b.tn; var rel = b.ms - cur.t; hd[1] = (rel >> 8) & 255; hd[2] = rel & 255; hd[3] = b.key ? 0x80 : 0;
      cur.blocks.push(cat([idb(0xA3), vint(4 + b.data.length), hd, b.data]));
    });
    var clEls = clusters.map(function (c) { return el(0x1F43B675, [ue(0xE7, c.t)].concat(c.blocks)); });
    function cues(base) {
      var pts = [], pos = base;
      clusters.forEach(function (c, i) { if (c.key) pts.push(el(0xBB, [ue(0xB3, c.t), el(0xB7, [ue(0xF7, 1), ue(0xF1, pos)])])); pos += clEls[i].length; });
      return el(0x1C53BB6B, pts.length ? pts : [el(0xBB, [ue(0xB3, 0), el(0xB7, [ue(0xF7, 1), ue(0xF1, base)])])]);
    }
    var pre = info.length + tracksEl.length, c0 = cues(pre + 100), c1 = cues(pre + c0.length);
    for (var k = 0; k < 3 && c1.length !== c0.length; k++) { c0 = c1; c1 = cues(pre + c0.length); }
    var body = [info, tracksEl, c1].concat(clEls), size = body.reduce(function (s, b) { return s + b.length; }, 0);
    var seg = cat([idb(0x18538067), (function () { var o = new Uint8Array(8); o[0] = 1; var v2 = size; for (var i = 7; i >= 1; i--) { o[i] = v2 % 256; v2 = Math.floor(v2 / 256); } return o; })()]);
    return new Blob([ebml, seg].concat(body), { type: 'video/webm' });
  };

  /* ---------- codec choice ---------- */
  function avcLevel(w, h, fps) {
    var mbs = Math.ceil(w / 16) * Math.ceil(h / 16), r = mbs * fps;
    var L = [[3600, 108000, '1f'], [8192, 245760, '28'], [8704, 522240, '2a'], [22080, 589824, '32'], [36864, 983040, '33'], [36864, 2073600, '34'], [139264, 4177920, '3c']];
    for (var i = 0; i < L.length; i++) if (mbs <= L[i][0] && r <= L[i][1]) return L[i][2];
    return '3c';
  }
  var cache = {};
  KE.pickVideoCodec = function (fmt, w, h, fps, bitrate) {
    var key = [fmt, w, h, fps].join('x');
    if (cache[key]) return cache[key].then(function (c) { return c && Object.assign({}, c, { bitrate: bitrate }); });
    if (!window.VideoEncoder) return (cache[key] = Promise.resolve(null));
    var lv = avcLevel(w, h, fps), list = fmt === 'mp4' ? ['avc1.6400' + lv, 'avc1.4d00' + lv, 'avc1.4200' + lv, 'avc1.640033', 'avc1.42e033']
      : ['vp09.00.' + (w * h > 2228224 ? '51' : w * h > 983040 ? (fps > 30 ? '41' : '40') : '31') + '.08', 'vp09.00.51.08', 'vp8'];
    var i = 0;
    function nx() {
      if (i >= list.length) return null;
      var c = list[i++], cfg = { codec: c, width: w, height: h, bitrate: bitrate, framerate: fps, bitrateMode: 'variable' };
      if (fmt === 'mp4') cfg.avc = { format: 'avc' };
      return VideoEncoder.isConfigSupported(cfg).then(function (r) { return r.supported ? cfg : nx(); }, nx);
    }
    cache[key] = Promise.resolve().then(nx);
    return cache[key].then(function (c) { return c && Object.assign({}, c, { bitrate: bitrate }); });
  };
  KE.pickAudioCodec = function (fmt, rate, ch) {
    if (!window.AudioEncoder) return Promise.resolve(null);
    var list = fmt === 'mp4' ? [['mp4a.40.2', 'aac'], ['opus', 'opus']] : [['opus', 'opus']], i = 0;
    function nx() {
      if (i >= list.length) return null;
      var c = list[i++], sr = c[1] === 'opus' ? 48000 : (rate === 44100 ? 44100 : 48000), cfg = { codec: c[0], sampleRate: sr, numberOfChannels: ch, bitrate: ch > 1 ? 128000 : 96000 };
      return AudioEncoder.isConfigSupported(cfg).then(function (r) { return r.supported ? { cfg: cfg, kind: c[1] } : nx(); }, nx);
    }
    return Promise.resolve().then(nx);
  };
  KE.VQ = { best: 0.15, balanced: 0.085, small: 0.045 }; // bits per pixel per frame (H.264); VP9 needs ~30% less
  KE.videoBitrate = function (fmt, w, h, fps, q) { var b = w * h * fps * (KE.VQ[q] || KE.VQ.balanced) * (fmt === 'webm' ? 0.7 : 1); return Math.round(Math.max(250000, Math.min(60e6, b))); };

  /* ---------- audio: cut the same range from the source ---------- */
  KE.loadAudio = function (file, a, b) {
    if (!file || file.size > 450 * 1048576 || !(window.AudioContext || window.webkitAudioContext)) return Promise.resolve(null);
    var AC = window.AudioContext || window.webkitAudioContext, ctx;
    return file.arrayBuffer().then(function (ab) { ctx = new AC({ sampleRate: 48000 }); return ctx.decodeAudioData(ab); }).then(function (buf) {
      try { ctx.close(); } catch (e) {}
      var sr = buf.sampleRate, s0 = Math.max(0, Math.floor(a * sr)), s1 = Math.min(buf.length, Math.ceil(b * sr)), ch = Math.min(2, buf.numberOfChannels);
      if (s1 - s0 < sr * 0.05) return null;
      var data = [], silent = true;
      for (var c = 0; c < ch; c++) { var d = buf.getChannelData(c).slice(s0, s1); data.push(d); if (silent) for (var i = 0; i < d.length; i += 97) if (Math.abs(d[i]) > 1e-4) { silent = false; break; } }
      return silent ? null : { rate: sr, ch: ch, data: data, frames: s1 - s0 };
    }, function () { try { ctx && ctx.close(); } catch (e) {} return null; });
  };
  KE.encodeAudio = function (pcm, fmt) {
    return KE.pickAudioCodec(fmt, pcm.rate, pcm.ch).then(function (pick) {
      if (!pick) return null;
      var out = [], desc = null, err = null;
      var enc = new AudioEncoder({ output: function (c, m) { var d = new Uint8Array(c.byteLength); c.copyTo(d); out.push({ data: d, pts: c.timestamp, dur: c.duration || 20000, key: true }); if (m && m.decoderConfig && m.decoderConfig.description) desc = u8(m.decoderConfig.description).slice(); }, error: function (e) { err = e; } });
      enc.configure(pick.cfg);
      var step = 4800, rate = pcm.rate, n = pcm.frames;
      for (var i = 0; i < n; i += step) {
        var k = Math.min(step, n - i), buf = new Float32Array(k * pcm.ch);
        for (var c = 0; c < pcm.ch; c++) buf.set(pcm.data[c].subarray(i, i + k), c * k);
        var ad = new AudioData({ format: 'f32-planar', sampleRate: rate, numberOfFrames: k, numberOfChannels: pcm.ch, timestamp: Math.round(i * 1e6 / rate), data: buf });
        enc.encode(ad); ad.close();
      }
      return enc.flush().then(function () {
        enc.close(); if (err || !out.length) return null;
        var preskip = 312;
        if (pick.kind === 'opus' && desc && desc.length >= 12 && String.fromCharCode.apply(null, desc.subarray(0, 8)) === 'OpusHead') preskip = desc[10] | (desc[11] << 8);
        out.forEach(function (s) { s.pts = Math.max(0, s.pts); });
        return { kind: 'audio', codec: pick.kind, rate: pick.cfg.sampleRate, ch: pcm.ch, br: pick.cfg.bitrate, desc: pick.kind === 'aac' ? (desc || aacASC(pick.cfg.sampleRate, pcm.ch)) : null, preskip: preskip, samples: out };
      }, function () { try { enc.close(); } catch (e) {} return null; });
    }).catch(function () { return null; });
  };
  function aacASC(rate, ch) { var idx = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000].indexOf(rate); if (idx < 0) idx = 3; return new Uint8Array([(2 << 3) | (idx >> 1), ((idx & 1) << 7) | (ch << 3)]); }


  /* ---------- frames in order: exact decode of the file, or seeking as a fallback ---------- */
  KE.runFrames = function (o, times, consume, cancelled) {
    var started = false, v = o.video;
    function seekRun() {
      var i = 0;
      function one() {
        if (cancelled && cancelled()) return Promise.reject(new Error('cancel'));
        if (i >= times.length) return Promise.resolve();
        var k = i++;
        return KE.seek(v, times[k] + 0.008).then(function () { return consume(k, function (ctx, crop, w, h) { ctx.drawImage(v, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h); }); }).then(one);
      }
      KE.lastSource = 'seek'; return one();
    }
    if (!o.file || o.noDecode) return seekRun();
    KE.lastSource = 'decode';
    return KE.decodeRun(o.file, times, function (i, draw) { started = true; return consume(i, draw); }, { cancelled: cancelled })
      .catch(function (e) { if (!started && String(e && e.message) !== 'cancel') return seekRun(); throw e; });
  };

  /* ---------- video file (MP4 / WebM) ---------- */
  KE.makeVideo = function (o) {
    var v = o.video, P = KE.gifPlan(o), fmt = o.format, cancelled = false, api = { cancel: function () { cancelled = true; } }, t0 = performance.now();
    var br = KE.videoBitrate(fmt, P.w, P.h, o.fps, o.quality);
    var c = document.createElement('canvas'); c.width = P.w; c.height = P.h;
    var ctx = c.getContext('2d', { willReadFrequently: true }); ctx.imageSmoothingQuality = 'high';
    var heavy = !!(o.fx || P.sharpen);
    v.pause();
    api.promise = KE.pickVideoCodec(fmt, P.w, P.h, o.fps, br).then(function (cfg) {
      if (!cfg) throw new Error('nocodec');
      var samples = [], desc = null, err = null, enc = new VideoEncoder({
        output: function (ch, m) { var d = new Uint8Array(ch.byteLength); ch.copyTo(d); samples.push({ data: d, pts: ch.timestamp, dur: ch.duration || Math.round(1e6 / o.fps), key: ch.type === 'key' }); if (m && m.decoderConfig && m.decoderConfig.description) desc = u8(m.decoderConfig.description).slice(); },
        error: function (e) { err = e; }
      });
      enc.configure(cfg);
      var audioP = (o.sound && Math.abs((o.speed || 1) - 1) < 1e-3) ? KE.loadAudio(o.file, o.start, o.end) : Promise.resolve(null);
      var step = (o.end - o.start) / P.n, gop = Math.max(1, Math.round(o.fps * 2)), times = [];
      for (var k = 0; k < P.n; k++) times.push(Math.min(o.end - 0.001, o.start + k * step));
      function wait() { return enc.encodeQueueSize > 3 ? new Promise(function (r) { setTimeout(r, 3); }).then(wait) : Promise.resolve(); }
      function consume(i, draw) {
        if (err) throw err;
        draw(ctx, o.crop, P.w, P.h);
        if (heavy) { var im = ctx.getImageData(0, 0, P.w, P.h); if (o.fx) KE.FX.apply(im.data, P.w, P.h, o.fx, o.fxk); if (P.sharpen) KE.sharpen(im.data, P.w, P.h, P.sharpen); ctx.putImageData(im, 0, 0); }
        var fr = new VideoFrame(c, { timestamp: Math.round(i * 1e6 / o.fps), duration: Math.round(1e6 / o.fps) });
        enc.encode(fr, { keyFrame: i % gop === 0 }); fr.close();
        o.onProgress && o.onProgress(0.92 * (i + 1) / P.n);
        return wait();
      }
      function one() { return KE.runFrames(o, times, consume, function () { return cancelled; }); }
      return one().then(function () { return enc.flush(); }).then(function () {
        enc.close(); if (err) throw err; if (!samples.length) throw new Error('empty');
        var vt = { kind: 'video', codec: cfg.codec.indexOf('vp8') === 0 ? 'vp8' : cfg.codec.indexOf('vp09') === 0 ? 'vp9' : 'avc', w: P.w, h: P.h, desc: desc, samples: samples };
        if (fmt === 'mp4' && !desc) throw new Error('nodesc');
        o.onProgress && o.onProgress(0.94);
        return audioP.then(function (pcm) { return pcm ? KE.encodeAudio(pcm, fmt) : null; }).then(function (at) {
          var tr = at ? [vt, at] : [vt];
          var blob = fmt === 'mp4' ? KE.muxMP4(tr) : KE.muxWebM(tr);
          o.onProgress && o.onProgress(1);
          return { blob: blob, audio: !!at, audioCodec: at && at.codec, codec: vt.codec, ms: performance.now() - t0 };
        });
      }, function (e) { try { enc.close(); } catch (x) {} throw e; });
    });
    return api;
  };
  // size: from the target bitrate (the encoder follows it closely); time: measured speed of one frame
  KE.estimateVideo = function (o) {
    var P = KE.gifPlan(o), br = KE.videoBitrate(o.format, P.w, P.h, o.fps, o.quality), aud = (o.sound && Math.abs((o.speed || 1) - 1) < 1e-3) ? 128000 : 0;
    return KE.pickVideoCodec(o.format, P.w, P.h, o.fps, br).then(function (cfg) {
      if (!cfg) return { size: null, unsupported: true };
      return { size: Math.round(((br * 0.82) + aud) * P.dur / 8 + 2000), codec: cfg.codec };
    });
  };

  /* ---------- AVIF (one AV1 key frame in a HEIF box) ---------- */
  var avifCfg = null;
  KE.avifSupport = function (w, h) {
    if (!window.VideoEncoder) return Promise.resolve(null);
    var px = w * h, lv = px <= 2228224 ? '08' : px <= 8912896 ? '12' : '16', list = ['av01.0.' + lv + 'M.08', 'av01.0.12M.08', 'av01.0.16M.08', 'av01.0.19M.08'], i = 0;
    w += w & 1; h += h & 1;
    function nx() {
      if (i >= list.length) return null;
      var c = list[i++], cfg = { codec: c, width: w, height: h, bitrateMode: 'quantizer', framerate: 1 };
      return VideoEncoder.isConfigSupported(cfg).then(function (r) { if (r.supported) return cfg; cfg = { codec: c, width: w, height: h, bitrate: Math.round(px * 1.2), framerate: 1 }; return VideoEncoder.isConfigSupported(cfg).then(function (r2) { return r2.supported ? cfg : nx(); }); }, nx);
    }
    return Promise.resolve().then(nx);
  };
  function obus(u) { // split OBUs, drop temporal delimiters; return {data, seq}
    var o = 0, keep = [], seq = null;
    while (o < u.length) {
      var h = u[o], type = (h >> 3) & 15, ext = (h >> 2) & 1, hasSize = (h >> 1) & 1, p = o + 1 + ext, size = 0, shift = 0, b;
      if (!hasSize) { size = u.length - p; } else { do { b = u[p++]; size += (b & 127) * Math.pow(2, shift); shift += 7; } while (b & 128); }
      var end = p + size, whole = u.subarray(o, end);
      if (type === 1) seq = whole;
      if (type !== 2) keep.push(whole);
      o = end;
    }
    return { data: cat(keep), seq: seq };
  }
  KE.muxAVIF = function (av1, w, h, levelIdx) {
    var ob = obus(av1); if (!ob.seq) throw new Error('noseq');
    var av1C = box('av1C', [new Uint8Array([0x81, (0 << 5) | (levelIdx & 31), 0x0C, 0]), ob.seq]);
    var ispe = fbox('ispe', 0, 0, [bin(function (x) { x.u32(w).u32(h); })]);
    var pixi = fbox('pixi', 0, 0, [new Uint8Array([3, 8, 8, 8])]);
    var cc = KE.avifColr || [1, 13, 6, 0]; // BT.709 primaries, sRGB transfer, BT.601 matrix (we convert ourselves), limited range
    var colr = box('colr', [bin(function (x) { x.str('nclx').u16(cc[0]).u16(cc[1]).u16(cc[2]).u8(cc[3] ? 0x80 : 0); })]);
    var ipco = box('ipco', [ispe, av1C, pixi, colr]);
    var ipma = fbox('ipma', 0, 0, [bin(function (x) { x.u32(1).u16(1).u8(4).u8(1).u8(0x82).u8(3).u8(4); })]);
    var ftyp = box('ftyp', [bin(function (x) { x.str('avif').u32(0).str('avifmif1miafMA1B'); })]);
    function meta(off) {
      return fbox('meta', 0, 0, [
        fbox('hdlr', 0, 0, [bin(function (x) { x.u32(0).str('pict').zero(12).u8(0); })]),
        fbox('pitm', 0, 0, [bin(function (x) { x.u16(1); })]),
        fbox('iloc', 0, 0, [bin(function (x) { x.u8(0x44).u8(0x00).u16(1).u16(1).u16(0).u16(1).u32(off).u32(ob.data.length); })]),
        fbox('iinf', 0, 0, [bin(function (x) { x.u16(1); }), fbox('infe', 2, 0, [bin(function (x) { x.u16(1).u16(0).str('av01').u8(0); })])]),
        box('iprp', [ipco, ipma])
      ]);
    }
    var m0 = meta(0), off = ftyp.length + m0.length + 8, m = meta(off);
    var mh = new W(); mh.u32(8 + ob.data.length).str('mdat');
    return new Blob([ftyp, m, mh.out(), ob.data], { type: 'image/avif' });
  };
  // our own RGB -> YUV 4:2:0 (BT.601, limited range), so every device encodes exactly the same colours
  KE.i420Frame = function (canvas) {
    var w = canvas.width, h = canvas.height, d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    var cw = w >> 1, ch = h >> 1, buf = new Uint8Array(w * h + 2 * cw * ch), Y = buf.subarray(0, w * h), U = buf.subarray(w * h, w * h + cw * ch), V = buf.subarray(w * h + cw * ch);
    for (var i = 0, j = 0; i < w * h; i++, j += 4) Y[i] = (16 + (65.738 * d[j] + 129.057 * d[j + 1] + 25.064 * d[j + 2]) / 256) + 0.5;
    for (var y = 0; y < ch; y++) for (var x = 0; x < cw; x++) {
      var r = 0, g = 0, b = 0;
      for (var dy = 0; dy < 2; dy++) for (var dx = 0; dx < 2; dx++) { var k = ((y * 2 + dy) * w + x * 2 + dx) * 4; r += d[k]; g += d[k + 1]; b += d[k + 2]; }
      r /= 4; g /= 4; b /= 4; var o = y * cw + x;
      U[o] = (128 + (-37.945 * r - 74.494 * g + 112.439 * b) / 256) + 0.5; V[o] = (128 + (112.439 * r - 94.154 * g - 18.285 * b) / 256) + 0.5;
    }
    return new VideoFrame(buf, { format: 'I420', codedWidth: w, codedHeight: h, timestamp: 0, colorSpace: { primaries: 'bt709', transfer: 'iec61966-2-1', matrix: 'smpte170m', fullRange: false } });
  };
  // quality 0..1 -> AV1 quantizer 0..63
  KE.avif = function (canvas, q) {
    var w = canvas.width, h = canvas.height;
    return KE.avifSupport(w, h).then(function (cfg) {
      if (!cfg) throw new Error('noavif');
      var cw = cfg.width, ch = cfg.height, src = canvas;
      if (cw !== w || ch !== h) { src = document.createElement('canvas'); src.width = cw; src.height = ch; var x = src.getContext('2d'); x.drawImage(canvas, 0, 0); x.drawImage(canvas, w - 1, 0, 1, h, w, 0, 1, h); x.drawImage(canvas, 0, h - 1, w, 1, 0, h, w, 1); }
      return new Promise(function (res, rej) {
        var got = null, enc = new VideoEncoder({ output: function (c) { var d = new Uint8Array(c.byteLength); c.copyTo(d); got = d; }, error: rej });
        enc.configure(cfg);
        var fr = KE.i420Frame(src), opt = { keyFrame: true };
        if (cfg.bitrateMode === 'quantizer') opt.av1 = { quantizer: Math.max(0, Math.min(63, Math.round((1 - q) * 70))) };
        enc.encode(fr, opt); fr.close();
        enc.flush().then(function () {
          enc.close(); if (!got) return rej(new Error('empty'));
          var lv = parseInt(cfg.codec.split('.')[2], 10) || 8;
          var b = KE.muxAVIF(got, cw, ch, lv);
          if (cw !== w || ch !== h) b = KE.avifCrop(b, w, h, cw, ch);
          res(b);
        }, rej);
      });
    });
  };
  // odd sizes: AV1 codes even sizes; the true size goes in ispe + a clean-aperture box would be needed, so we keep the even size (1 px) instead
  KE.avifCrop = function (b) { return b; };
})();
