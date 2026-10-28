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
    fillResult: function (r) {
      document.getElementById('resImg').src = r.url;
      document.getElementById('resA').textContent = r.orig ? KE.size(r.orig) : '—';
      document.getElementById('resB').textContent = KE.size(r.blob.size);
      var pc = document.getElementById('resPct');
      document.getElementById('resAL').textContent = r.kind === 'gif' ? 'ویدیوی اصلی' : 'فایل اصلی';
      if (r.orig && r.kind !== 'gif') {
        var d = Math.round((1 - r.blob.size / r.orig) * 100);
        pc.textContent = d >= 0 ? KE.fa(d) + '٪ سبک‌تر' : KE.fa(-d) + '٪ سنگین‌تر'; pc.classList.toggle('up', d < 0); pc.hidden = false;
      } else pc.hidden = true;
      var meta = KE.dims(r.w, r.h);
      if (r.kind === 'gif') meta += ' · ' + KE.fa(r.frames) + ' فریم · ' + KE.time(r.dur);
      else meta += ' · ' + (r.mode === 'lossless' ? 'بی‌افت' : 'کیفیت ' + KE.fa(Math.round(r.q * 100)));
      document.getElementById('resMeta').innerHTML = meta;
    }
  };
  document.getElementById('busyX').addEventListener('click', function () { if (cancelFn) cancelFn(); });
})();
