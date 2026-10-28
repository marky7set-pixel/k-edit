/* shared busy / toast / result helpers */
(function () {
  'use strict';
  var busyOn = false, cancelFn = null, tt;
  var UI = KE.UI = {
    isBusy: function () { return busyOn; },
    busy: function (label, p, onCancel) {
      busyOn = true; cancelFn = onCancel || null;
      document.getElementById('busyT').textContent = label;
      document.getElementById('busyX').hidden = !onCancel;
      UI.progress(p); document.getElementById('busy').classList.add('on');
    },
    progress: function (p) {
      var r = document.getElementById('ring');
      if (p == null || p < 0) { r.classList.add('spin'); return; }
      r.classList.remove('spin'); var v = Math.round(p * 100); r.style.setProperty('--p', v); document.getElementById('ringP').textContent = KE.fa(v) + '٪';
    },
    idle: function () { busyOn = false; cancelFn = null; document.getElementById('busy').classList.remove('on'); UI.sub(''); },
    sub: function (t) { var e = document.getElementById('busyS'); if (e) { e.textContent = t || ''; e.hidden = !t; } },
    label: function (t) { document.getElementById('busyT').textContent = t; },
    toast: function (msg, kind) {
      var t = document.getElementById('toast'); t.textContent = msg; t.className = 'toast on ' + (kind || ''); clearTimeout(tt);
      tt = setTimeout(function () { t.className = 'toast ' + (kind || ''); }, 3200);
    },
    // input → output panel: dimensions, size, and how much both change
    showEst: function (root, e) {
      var set = function (k, html, cls) { KE.$$(root, '[data-el=' + k + ']').forEach(function (x) { x.innerHTML = html; if (cls !== undefined) x.className = x.className.replace(/ ?(up|down|wait)/g, '') + (cls ? ' ' + cls : ''); }); };
      set('inDims', KE.dims(e.inW, e.inH)); set('inSize', e.inSize ? KE.size(e.inSize) : '—');
      set('outDims', KE.dims(e.outW, e.outH)); set('est', KE.dims(e.outW, e.outH));
      if (e.outSize == null) { set('outSize', 'در حال محاسبه', 'wait'); set('dSize', 'حجم: محاسبه…', 'wait'); }
      else {
        set('outSize', '≈ ' + KE.size(e.outSize), '');
        if (e.inSize) { var d = Math.round((e.outSize / e.inSize - 1) * 100); set('dSize', d <= 0 ? 'حجم ' + KE.fa(-d) + '٪ کمتر' : 'حجم ' + KE.fa(d) + '٪ بیشتر', d <= 0 ? 'down' : 'up'); }
        else set('dSize', '', '');
      }
      var r = Math.round(((e.outW * e.outH) / (e.inW * e.inH) - 1) * 100);
      set('dRes', Math.abs(r) < 1 ? 'وضوح بدون تغییر' : (r > 0 ? 'وضوح ' + KE.fa(r) + '٪ بیشتر' : 'وضوح ' + KE.fa(-r) + '٪ کمتر'), r > 0 ? 'down' : '');
    },
    fillResult: function (r) {
      var img = document.getElementById('resImg'), vid = document.getElementById('resVid'), cv = document.getElementById('cmpv');
      if (!UI.cmp) UI.cmp = new KE.Compare(cv);
      img.hidden = true; vid.hidden = true; vid.pause(); vid.removeAttribute('src'); UI.cmp.hide();
      if (r.kind === 'video') { vid.src = r.url; vid.hidden = false; vid.loop = true; }
      else if (r.kind === 'image') UI.cmp.set(r.before, r.url, r.w, r.h, 'بعد' + (r.up ? ' | \u2066' + KE.fa(r.up) + '×\u2069' : ''));
      else { img.src = r.url; img.hidden = false; }
      var inF = (r.origType || '').split('/')[1] || ((r.origName || '').split('.').pop() || '');
      inF = { jpeg: 'JPG', png: 'PNG', webp: 'WebP', avif: 'AVIF', gif: 'GIF', mp4: 'MP4', webm: 'WebM', quicktime: 'MOV', mov: 'MOV', heic: 'HEIC', 'x-matroska': 'MKV' }[inF.toLowerCase()] || inF.toUpperCase() || '—';
      var outF = r.kind === 'awebp' ? 'WebP متحرک' : KE.FMTN[r.fmt] || 'WebP';
      if (r.kind === 'image' && r.up) outF += ' | ارتقا \u2066' + KE.fa(r.up) + '×\u2069';
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
  // safety net: an unexpected error never leaves the app stuck or blank
  function oops() { if (busyOn) UI.idle(); UI.toast('کار انجام نشد؛ دوباره امتحان کنید', 'err'); }
  window.addEventListener('error', function (e) { if (e && e.message) oops(); });
  window.addEventListener('unhandledrejection', function () { oops(); });
})();
