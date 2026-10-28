/* phone shell */
(function () {
  'use strict';
  KE.paintIcons();
  var $ = function (id) { return document.getElementById(id); };
  document.getElementById('ver').textContent = KE.fa(KE.version);
  var stack = ['home'], cur = null;
  var ui = Object.assign({}, KE.UI, { result: showResult });
  var IE = new KE.ImageEditor($('edImg'), ui), VE = new KE.VideoEditor($('edVid'), ui);
  if (window.__KE_TEST) { window.__IE = IE; window.__VE = VE; }
  function show(id, push) {
    var prev = stack[stack.length - 1];
    if (push) stack.push(id); else stack[stack.length - 1] = id;
    document.querySelectorAll('.scr').forEach(function (s) { s.classList.toggle('on', s.id === id); s.classList.toggle('left', s.id === prev && push); });
  }
  function back() {
    if (KE.UI.isBusy()) return true;
    if (stack.length <= 1) return false;
    if (stack[stack.length - 1] === 'res' && KE.UI.info(false)) return true; // details open: close them first
    var top = stack.pop(), to = stack[stack.length - 1];
    if (to === 'home') KE.setAmb(null);
    if (top === 'res') document.getElementById('resVid').pause();
    if (top === 'edVid') VE.close(); if (top === 'edImg') IE.close();
    document.querySelectorAll('.scr').forEach(function (s) { s.classList.remove('left'); s.classList.toggle('on', s.id === to); });
    return true;
  }
  window.kBack = back;
  document.querySelectorAll('[data-back]').forEach(function (b) { b.addEventListener('click', back); });
  function openIn(kind, f) {
    if (!f) return;
    var E = kind === 'img' ? IE : VE, id = kind === 'img' ? 'edImg' : 'edVid';
    if (stack[stack.length - 1] !== id) { stack = ['home']; show(id, true); }
    E.open(f).then(function (ok) { if (!ok && !E.root.classList.contains('has-file')) back(); });
  }
  $('goImg').addEventListener('click', function () { $('fImg').click(); });
  $('goVid').addEventListener('click', function () { $('fVid').click(); });
  document.querySelectorAll('[data-repick]').forEach(function (b) { b.addEventListener('click', function () { (b.closest('#edImg') ? $('fImg') : $('fVid')).click(); }); });
  $('fImg').addEventListener('change', function (e) { openIn('img', e.target.files[0]); e.target.value = ''; });
  $('fVid').addEventListener('change', function (e) { openIn('vid', e.target.files[0]); e.target.value = ''; });
  // dock row: each tab opens its own controls; the picture takes whatever room is left
  document.querySelectorAll('.ed').forEach(function (root) {
    var ctl = root.querySelector('.ctl'), nm = root.querySelector('.ch-n');
    root.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () {
        var k = t.getAttribute('data-tab');
        root.querySelectorAll('.tab').forEach(function (x) { x.classList.toggle('sel', x === t); x.setAttribute('aria-pressed', x === t); });
        root.querySelectorAll('.pane').forEach(function (p) { p.classList.toggle('on', p.getAttribute('data-pane') === k); });
        root.setAttribute('data-tool', k); if (nm) nm.textContent = t.getAttribute('data-title');
        fitCtl(); requestAnimationFrame(function () { (root.id === 'edImg' ? IE : VE).layout(); });
      });
    });
    // header line never wraps or cuts: long estimates get a slightly smaller size
    var ch = root.querySelector('.ch'), che = root.querySelector('.ch-e');
    function fitCh() { if (!ch || !ch.offsetWidth) return; var f = 12.5; che.style.fontSize = ''; while (ch.scrollWidth > ch.clientWidth + 1 && f > 10) { f -= 0.5; che.style.fontSize = f + 'px'; } }
    if (window.MutationObserver) new MutationObserver(fitCh).observe(che, { childList: true, subtree: true, characterData: true });
    root.querySelectorAll('.tab').forEach(function (t) { t.addEventListener('click', fitCh); });
    function fitCtl() { root.style.setProperty('--ctlh', ctl.offsetHeight + 'px'); }
    if (window.ResizeObserver) new ResizeObserver(fitCtl).observe(ctl);
    fitCtl();
  });
  if (window.ResizeObserver) {
    new ResizeObserver(function () { IE.layout(); }).observe(IE.stage);
    new ResizeObserver(function () { VE.layout(); }).observe(VE.stage);
  }
  // result
  if (!KE.canShare()) { $('resShare').hidden = true; document.querySelector('.res-acts').classList.add('solo'); }
  function showResult(r) {
    if (cur && cur.url) URL.revokeObjectURL(cur.url);
    cur = r; KE.UI.fillResult(r); $('res').classList.toggle('media', r.kind !== 'image');
    $('resTitle').textContent = { image: 'عکس آماده است', video: 'ویدیو آماده است', gif: 'GIF آماده است', awebp: 'WebP متحرک آماده است' }[r.kind] || 'آماده است';
    $('resStat').className = 'status'; $('resStat').textContent = 'ذخیره نشده';
    KE.UI.info(false); show('res', true); requestAnimationFrame(function () { KE.UI.cmp && KE.UI.cmp.fit(); });
  }
  $('resSave').addEventListener('click', function () {
    if (!cur) return;
    KE.save(cur.blob, cur.name, 'save').then(function (r) {
      if (r.ok) { $('resStat').className = 'status ok'; $('resStat').textContent = 'ذخیره شد'; ui.toast('ذخیره شد: ' + (r.where || 'Pictures/K-Edit')); }
      else if (r.perm) ui.toast('برای ذخیره، اجازهٔ دسترسی لازم است', 'err');
      else if (!r.cancelled) ui.toast('ذخیره نشد؛ دوباره امتحان کنید', 'err');
    });
  });
  $('resShare').addEventListener('click', function () { if (cur) KE.save(cur.blob, cur.name, 'share'); });
  // files shared to K-Edit from the gallery (Android)
  window.kOpenShared = function () {
    if (!window.KEditNative || !window.KEditNative.sharedType) return;
    var t = window.KEditNative.sharedType(); if (!t) return;
    fetch('/shared/file?ts=' + Date.now()).then(function (r) { return r.blob(); }).then(function (b) {
      if (window.KEditNative.clearShared) window.KEditNative.clearShared();
      var name = window.KEditNative.sharedName() || (t.indexOf('video') === 0 ? 'video.mp4' : 'image.jpg');
      openIn(t.indexOf('video') === 0 ? 'vid' : 'img', new File([b], name, { type: t }));
    }).catch(function () { ui.toast('فایل اشتراکی باز نشد', 'err'); });
  };
  setTimeout(window.kOpenShared, 300);
})();
