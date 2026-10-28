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
    idle: function () { busyOn = false; cancelFn = null; document.getElementById('busy').classList.remove('on'); },
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
      document.getElementById('resImg').src = r.url;
      document.getElementById('resA').textContent = r.orig ? KE.size(r.orig) : '—';
      document.getElementById('resB').textContent = KE.size(r.blob.size);
      var pc = document.getElementById('resPct');
      document.getElementById('resAL').textContent = r.anim ? 'ویدیوی اصلی' : 'فایل اصلی';
      document.getElementById('resAD').innerHTML = KE.dims(r.inW, r.inH);
      document.getElementById('resBD').innerHTML = KE.dims(r.w, r.h);
      if (r.orig) {
        var d = Math.round((1 - r.blob.size / r.orig) * 100);
        pc.textContent = d >= 0 ? KE.fa(d) + '٪ سبک‌تر' : KE.fa(-d) + '٪ سنگین‌تر'; pc.classList.toggle('up', d < 0); pc.hidden = false;
      } else pc.hidden = true;
      var px = Math.round(((r.w * r.h) / (r.inW * r.inH) - 1) * 100);
      var meta = Math.abs(px) < 1 ? 'وضوح بدون تغییر' : 'وضوح ' + KE.fa(Math.abs(px)) + '٪ ' + (px > 0 ? 'بیشتر' : 'کمتر');
      if (r.anim) meta += ' · ' + KE.fa(r.frames) + ' فریم · ' + KE.time(r.dur);
      else meta += ' · ' + (r.mode === 'lossless' ? 'بی‌افت' : 'کیفیت ' + KE.fa(Math.round(r.q * 100)));
      document.getElementById('resMeta').innerHTML = meta;
    }
  };
  document.getElementById('busyX').addEventListener('click', function () { if (cancelFn) cancelFn(); });
  // safety net: an unexpected error never leaves the app stuck or blank
  function oops() { if (busyOn) UI.idle(); UI.toast('کار انجام نشد؛ دوباره امتحان کنید', 'err'); }
  window.addEventListener('error', function (e) { if (e && e.message) oops(); });
  window.addEventListener('unhandledrejection', function () { oops(); });
})();
