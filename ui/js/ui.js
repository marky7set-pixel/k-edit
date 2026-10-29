/* shared busy / toast / result helpers */
(function () {
  'use strict';
  var busyOn = false, cancelFn = null, finT, tt, tick = null, own = false, manual = false, t0 = 0, eta = 0, nTitle = '', nLast = -9, nT = 0, nOn = false;
  function native(on, p) { // Android: keep working with the screen off, progress in a notification
    var N = window.KEditNative; if (!N || !N.busy || (on && !nOn)) return;
    var v = p == null || p < 0 ? -1 : Math.round(p * 100), now = Date.now();
    if (on && v === nLast) return; if (on && v >= 0 && Math.abs(v - nLast) < 2 && now - nT < 1500) return;
    nLast = v; nT = now; try { N.busy(!!on, v, nTitle); } catch (e) {}
  }
  var UI = KE.UI = {
    isBusy: function () { return busyOn; },
    busy: function (label, p, onCancel, opt) {
      opt = opt || {}; busyOn = true; cancelFn = onCancel || null;
      document.getElementById('busyT').textContent = label; nTitle = label; nLast = -9; nOn = /پخت|ارتقا|ساخت/.test(label);
      var m = document.getElementById('busyM'); m.textContent = opt.meta || ''; m.hidden = !opt.meta;
      document.getElementById('busyX').hidden = !onCancel;
      own = false; manual = p != null && p >= 0 && !opt.eta; t0 = performance.now(); eta = opt.eta || 0;
      clearInterval(tick); UI.progress(p, true); UI.sub('', true);
      if (eta) tick = setInterval(function () { // time-based until the job reports its own progress
        var el = performance.now() - t0, rem = Math.max(0, eta - el);
        if (!manual) UI.progress(Math.min(0.95, el / Math.max(1, eta)), true);
        if (!own) UI.sub(rem < 400 ? 'آخرین مرحله…' : KE.etaText(rem) + ' مانده', true);
      }, 250);
      var bz = document.getElementById('busy'); clearTimeout(finT); bz.classList.remove('fin', 'out'); bz.classList.add('on'); native(true, p);
    },
    progress: function (p, auto) {
      var r = document.getElementById('ring'), t = document.getElementById('ringP');
      if (!auto && p != null && p >= 0) manual = true;
      if (p == null || p < 0) { r.classList.add('spin'); t.classList.add('spin'); return; }
      r.classList.remove('spin'); t.classList.remove('spin'); var v = Math.round(p * 100);
      r.firstElementChild.style.transform = 'scaleX(' + Math.min(1, Math.max(0, p)).toFixed(4) + ')'; t.textContent = KE.fa(v) + '٪'; if (busyOn) native(true, p);
    },
    idle: function () { if (busyOn && nOn) native(false); nOn = false; busyOn = false; cancelFn = null; clearInterval(tick); clearTimeout(finT); document.getElementById('busy').classList.remove('on', 'fin', 'out'); UI.sub('', true); },
    // finished: the bar fills, a check replaces the pan, the screen fades into the result
    done: function (then) {
      var bz = document.getElementById('busy'); clearInterval(tick); cancelFn = null; document.getElementById('busyX').hidden = true;
      UI.progress(1); UI.sub('', true); bz.classList.add('fin'); clearTimeout(finT);
      finT = setTimeout(function () { then(); bz.classList.add('out'); finT = setTimeout(UI.idle, 360); }, 520);
    },
    sub: function (t, auto) { if (!auto && t) own = true; var e = document.getElementById('busyS'); if (e) { document.getElementById('busySt').textContent = t || ''; e.hidden = !t; } },
    label: function (t) { document.getElementById('busyT').textContent = t; nTitle = t; nLast = -9; if (busyOn) native(true, -1); },
    toast: function (msg, kind) {
      var t = document.getElementById('toast'); t.textContent = msg; t.className = 'toast on ' + (kind || ''); clearTimeout(tt);
      tt = setTimeout(function () { t.className = 'toast ' + (kind || ''); }, 3200);
    },
    // input → output panel: dimensions, size, and how much both change
    showEst: function (root, e) {
      var sh = function (b) { return KE.size(b).replace('مگابایت', 'مگ').replace('کیلوبایت', 'ک').replace('بایت', 'ب'); };
      var set = function (k, html, cls) { KE.$$(root, '[data-el=' + k + ']').forEach(function (x) { x.innerHTML = html; if (cls !== undefined) x.className = x.className.replace(/ ?\b(up|down|wait|gd)\b/g, '') + (cls ? ' ' + cls : ''); }); };
      set('inDims', KE.dims(e.inW, e.inH)); set('outDims', KE.dims(e.outW, e.outH));
      if (e.outSize == null) { set('outSize', 'در حال محاسبه', 'wait'); set('dPct', '…', 'wait'); }
      else {
        set('outSize', '≈ ' + KE.size(e.outSize), '');
        var d = e.inSize ? Math.round((e.outSize / e.inSize - 1) * 100) : null;
        set('dPct', d == null ? '' : d <= 0 ? '٪' + KE.fa(-d) + ' کمتر' : '٪' + KE.fa(d) + ' بیشتر', d == null ? '' : d <= 0 ? 'down' : 'up');
      }
      set('outS', e.outSize == null ? '…' : '≈ ' + sh(e.outSize));
      set('szPair', e.inSize ? sh(e.inSize) + ' ← ' + (e.outSize == null ? '…' : sh(e.outSize)) : '—');
      var r = Math.round(((e.outW * e.outH) / (e.inW * e.inH) - 1) * 100), kx = e.outW / e.inW;
      set('rPct', Math.abs(r) < 1 ? '۰٪' : (r > 0 ? '٪' + KE.fa(r) + ' بیشتر' : '٪' + KE.fa(-r) + ' کمتر'), r > 0 ? 'gd' : '');
      set('rTxt', Math.abs(r) < 1 ? 'بدون تغییر' : (kx > 1.9 && Math.abs(kx - Math.round(kx)) < 0.05 ? KE.fa(Math.round(kx)) + ' برابر' : KE.fa(Math.min(e.outW, e.outH)) + 'p'));
    },
    fillResult: function (r) {
      var img = document.getElementById('resImg'), vid = document.getElementById('resVid'), cv = document.getElementById('cmpv');
      if (!UI.cmp) UI.cmp = new KE.Compare(cv);
      img.hidden = true; vid.hidden = true; vid.pause(); vid.removeAttribute('src'); UI.cmp.hide();
      if (r.kind === 'video') { vid.src = r.url; vid.hidden = false; vid.loop = true; }
      else if (r.kind === 'image') UI.cmp.set(r.before, r.url, r.w, r.h, 'بعد' + (r.up > 1 ? ' | \u2066' + KE.fa(r.up) + '×\u2069' : r.ai ? ' | هوش مصنوعی' : ''));
      else { img.src = r.url; img.hidden = false; }
      var inF = (r.origType || '').split('/')[1] || ((r.origName || '').split('.').pop() || '');
      inF = { jpeg: 'JPG', png: 'PNG', webp: 'WebP', avif: 'AVIF', gif: 'GIF', mp4: 'MP4', webm: 'WebM', quicktime: 'MOV', mov: 'MOV', heic: 'HEIC', 'x-matroska': 'MKV' }[inF.toLowerCase()] || inF.toUpperCase() || '—';
      var outF = r.kind === 'awebp' ? 'WebP متحرک' : KE.FMTN[r.fmt] || 'WebP';
      if (r.kind === 'image' && r.ai) outF += r.up > 1 ? ' | هوش مصنوعی \u2066' + KE.fa(r.up) + '×\u2069' : ' | بهبود هوش مصنوعی';
      if (r.kind === 'video') outF += r.audio ? ' | با صدا' : ' | بی‌صدا';
      var d = r.orig ? Math.round((1 - r.blob.size / r.orig) * 100) : null;
      var tag = d == null ? '' : ' <em class="' + (d >= 0 ? 'dn' : 'upc') + '">' + (d >= 0 ? '٪' + KE.fa(d) + ' کمتر' : '٪' + KE.fa(-d) + ' بیشتر') + '</em>';
      var rows = [['dims', 'ابعاد', KE.dims(r.inW, r.inH), KE.dims(r.w, r.h)], ['weight', 'حجم', r.orig ? KE.size(r.orig) : '—', KE.size(r.blob.size) + tag], ['file', 'قالب', inF, outF]];
      if (r.anim) rows.push(['film', 'مدت', '', KE.fa((Math.round(r.dur * 10) / 10)) + ' ثانیه | ' + KE.fa(r.frames) + ' فریم']);
      var h = '<span></span><span class="h">ورودی</span><span></span><span class="h">خروجی</span>';
      rows.forEach(function (x) {
        if (x[0] === 'film') h += '<span class="k">' + KE.icon('film') + x[1] + '</span><span class="tm">' + x[3] + '</span>';
        else h += '<span class="k">' + KE.icon(x[0]) + x[1] + '</span><span class="a">' + x[2] + '</span><span class="ar">' + KE.icon('prev') + '</span><span class="b">' + x[3] + '</span>';
      });
      h += '<span class="k">' + KE.icon('clock') + 'زمان ساخت</span><span class="tm">' + (r.ms < 1000 ? KE.fa((r.ms / 1000).toFixed(1)) : KE.fa((r.ms / 1000).toFixed(r.ms < 10000 ? 1 : 0))) + ' ثانیه</span>';
      document.getElementById('resTable').innerHTML = h;
    }
  };
  document.getElementById('busyX').addEventListener('click', function () { if (cancelFn) cancelFn(); });
  // result details: open / close
  UI.info = function (on) { var b = document.getElementById('resInfoBox'), t = document.getElementById('resInfo'); if (!b) return false; var was = !b.hidden; b.hidden = on === undefined ? was : !on; if (t) t.classList.toggle('on', !b.hidden); document.body.classList.toggle('info-on', !b.hidden); return was; };
  (function () { var t = document.getElementById('resInfo'), x = document.getElementById('resInfoX'); if (t) t.addEventListener('click', function () { UI.info(); }); if (x) x.addEventListener('click', function () { UI.info(false); }); })();

  // safety net: an unexpected error never leaves the app stuck or blank
  function oops() { if (busyOn) UI.idle(); UI.toast('کار انجام نشد؛ دوباره امتحان کنید', 'err'); }
  window.addEventListener('error', function (e) { if (e && e.message) oops(); });
  window.addEventListener('unhandledrejection', function () { oops(); });
})();
