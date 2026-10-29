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
  function resetSteps(root) { root.querySelectorAll('.st').forEach(function (t) { t.classList.remove('done'); }); root.classList.remove('folded'); if (root.goStep) root.goStep(0); }
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
  // step by step: a strip of steps on top, one fixed panel below that can fold away
  document.querySelectorAll('.ed').forEach(function (root) {
    var E = root.id === 'edImg' ? IE : VE, tabs = [].slice.call(root.querySelectorAll('.st')), nm = root.querySelector('.ch-n'), kk = root.querySelector('.ch-k'), mn = root.querySelector('.mini-n');
    function cur() { for (var i = 0; i < tabs.length; i++) if (tabs[i].classList.contains('sel')) return i; return 0; }
    function go(i) {
      i = Math.max(0, Math.min(tabs.length - 1, i)); var t = tabs[i], k = t.getAttribute('data-tab');
      tabs.forEach(function (x) { x.classList.toggle('sel', x === t); x.setAttribute('aria-pressed', x === t); });
      root.querySelectorAll('.pane').forEach(function (p) { p.classList.toggle('on', p.getAttribute('data-pane') === k); });
      root.setAttribute('data-tool', k); root.classList.toggle('last', i === tabs.length - 1);
      nm.textContent = mn.textContent = t.getAttribute('data-title'); kk.textContent = KE.fa(i + 1) + ' از ' + KE.fa(tabs.length);
      if (E === VE && k !== 'cut' && !VE.v.paused) VE.v.pause();
      root.querySelector('.panel').scrollTop = 0; requestAnimationFrame(function () { E.layout(); });
    }
    root.goStep = go;
    tabs.forEach(function (t, i) { t.addEventListener('click', function () { fold(false); go(i); }); });
    root.querySelector('[data-act=next]').addEventListener('click', function () { var i = cur(); tabs[i].classList.add('done'); go(i + 1); });
    root.querySelector('[data-act=prevStep]').addEventListener('click', function () { go(cur() - 1); });
    root.querySelector('[data-act=stepReset]').addEventListener('click', function () {
      var k = tabs[cur()].getAttribute('data-tab'), q = function (s) { var b = root.querySelector(s); if (b) b.click(); };
      tabs[cur()].classList.remove('done');
      if (k === 'crop') { if (E === IE) IE.resetGeo(); else q('[data-act=resetCrop]'); }
      else if (k === 'adj') q('[data-act=resetAdj]');
      else if (k === 'fx') { q('.fxi[data-fx="0"]'); var r = root.querySelector('input[data-k=fxk]'); if (r) { r.value = 50; r.dispatchEvent(new Event('input', { bubbles: true })); } }
      else if (k === 'cut') { q('[data-act=resetTrim]'); q('[data-speed="1"]'); }
    });
    // fold: tap the handle, or swipe the panel down; swipe the bar up (or tap) to bring it back
    function fold(on) { if (root.classList.contains('folded') === !!on) return; root.classList.toggle('folded', !!on); requestAnimationFrame(function () { E.layout(); }); }
    root.querySelector('[data-act=fold]').addEventListener('click', function () { fold(true); });
    root.querySelector('[data-act=unfold]').addEventListener('click', function () { fold(false); });
    function swipe(el, dir) {
      var y0 = null;
      el.addEventListener('touchstart', function (e) { if (e.target.closest('input,.trim,.row.scroll,.fxrow')) { y0 = null; return; } y0 = e.touches[0].clientY; }, { passive: true });
      el.addEventListener('touchend', function (e) { if (y0 == null) return; var dy = e.changedTouches[0].clientY - y0; y0 = null; if (dir > 0 ? dy > 60 : dy < -40) fold(dir > 0); }, { passive: true });
    }
    swipe(root.querySelector('.ctl'), 1); swipe(root.querySelector('.mini'), -1);
    root.foldPanel = fold; go(0);
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
