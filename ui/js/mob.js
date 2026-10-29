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
    if (top === 'edVid' || top === 'edImg') resetSteps($(top));
    document.querySelectorAll('.scr').forEach(function (s) { s.classList.remove('left'); s.classList.toggle('on', s.id === to); });
    return true;
  }
  window.kBack = back;
  function resetSteps(root) { root.querySelectorAll('.tl2').forEach(function (t) { t.classList.remove('done'); }); if (root.openTool) root.openTool(root.querySelector('.tl2').getAttribute('data-tab')); }
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
  // tools at the bottom: each opens one small drawer above the bar; tap it again or ✓ to close
  var SPEEDS = [0.5, 1, 1.5, 2];
  document.querySelectorAll('.ed').forEach(function (root) {
    var E = root.id === 'edImg' ? IE : VE, tabs = [].slice.call(root.querySelectorAll('.tl2')), dws = root.querySelector('.dws');
    function measure() {
      var d = root.querySelector('.dw.on'), h = d ? d.offsetHeight + 8 : 0;
      if (root.style.getPropertyValue('--dwh') !== h + 'px') root.style.setProperty('--dwh', h + 'px'); // the picture follows through its size observer
    }
    function sub(k) { root.querySelectorAll('.dw.on .sub').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-s') === k); }); measure(); }
    function open(k) {
      root.setAttribute('data-tool', k || 'none');
      tabs.forEach(function (t) { var on = t.getAttribute('data-tab') === k; t.classList.toggle('sel', on); t.setAttribute('aria-pressed', on); });
      root.querySelectorAll('.dw').forEach(function (d) { d.classList.toggle('on', d.getAttribute('data-pane') === k); });
      sub(''); measure(); requestAnimationFrame(function () { E.layout(); });
    }
    function cur() { var t = root.getAttribute('data-tool'); return t === 'none' ? '' : t; }
    function closeDone() { var k = cur(); tabs.forEach(function (t) { if (t.getAttribute('data-tab') === k) t.classList.add('done'); }); open(''); }
    root.openTool = open;
    tabs.forEach(function (t) { t.addEventListener('click', function () { if (cur() === t.getAttribute('data-tab')) closeDone(); else open(t.getAttribute('data-tab')); }); });
    root.querySelectorAll('[data-act=close]').forEach(function (b) { b.addEventListener('click', closeDone); });
    root.querySelectorAll('[data-sub]').forEach(function (b) { b.addEventListener('click', function () { sub(b.getAttribute('data-sub')); }); });
    root.querySelectorAll('[data-act=stepReset]').forEach(function (b) { b.addEventListener('click', function () {
      var k = cur(), q = function (s) { var x = root.querySelector(s); if (x) x.click(); };
      if (k === 'crop') { if (E === IE) IE.resetGeo(); else VE.resetCrop(); }
      else if (k === 'adj') q('[data-act=resetAdj]');
      else if (k === 'fx') { q('.fxi[data-fx="0"]'); var r = root.querySelector('input[data-k=fxk]'); if (r) { r.value = 50; r.dispatchEvent(new Event('input', { bubbles: true })); } }
    }); });
    var sp = root.querySelector('[data-act=speedNext]');
    if (sp) sp.addEventListener('click', function () { VE.setSpeed(SPEEDS[(SPEEDS.indexOf(VE.speed) + 1) % SPEEDS.length]); });
    if (window.ResizeObserver) new ResizeObserver(measure).observe(dws);
    open(tabs[0].getAttribute('data-tab'));
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
    $('resStat').className = 'status'; $('resStat').textContent = 'ذخیره نشده'; $('resSave').classList.remove('saved'); $('resSaveT').textContent = 'ذخیره در گالری';
    KE.UI.info(false); show('res', true); requestAnimationFrame(function () { KE.UI.cmp && KE.UI.cmp.fit(); });
  }
  $('resSave').addEventListener('click', function () {
    if (!cur) return;
    KE.save(cur.blob, cur.name, 'save').then(function (r) {
      if (r.ok) { $('resStat').className = 'status ok'; $('resStat').textContent = 'ذخیره شد'; $('resSave').classList.add('saved'); $('resSaveT').textContent = 'ذخیره شد'; ui.toast('در گالری: ' + (r.where || 'Pictures/K-Edit')); }
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
