/* desktop shell */
(function () {
  'use strict';
  KE.paintIcons();
  var mode = 'img', cur = null, saved = null;
  var $ = function (id) { return document.getElementById(id); };
  var edImg = $('edImg'), edVid = $('edVid'), stat = $('stat');
  var ui = Object.assign({}, KE.UI, { result: showResult });
  var IE = new KE.ImageEditor(edImg, ui), VE = new KE.VideoEditor(edVid, ui);
  if (window.__KE_TEST) { window.__IE = IE; window.__VE = VE; }
  function ed() { return mode === 'img' ? IE : VE; }
  function root() { return mode === 'img' ? edImg : edVid; }
  function ink() {
    var b = document.querySelector('.mode.sel'), n = document.querySelector('.mode-ink');
    n.style.left = b.offsetLeft + 'px'; n.style.width = b.offsetWidth + 'px';
  }
  function setMode(m) {
    if (m === mode && !edImg.hidden === (m === 'img')) return;
    mode = m; document.body.className = 'desk mode-' + m;
    document.querySelectorAll('.mode').forEach(function (b) { b.classList.toggle('sel', b.getAttribute('data-mode') === m); });
    edImg.hidden = m !== 'img'; edVid.hidden = m !== 'vid'; if (m === 'img') VE.v.pause();
    ink(); sync(); requestAnimationFrame(function () { ed().layout(); });
  }
  function sync() {
    var has = root().classList.contains('has-file');
    $('btnBack').hidden = !has && $('res').hidden;
    stat.className = 'status'; stat.textContent = has ? (mode === 'img' ? 'عکس باز است' : 'ویدیو باز است') : 'آماده';
  }
  document.querySelectorAll('.mode').forEach(function (b) { b.addEventListener('click', function () { closeResult(); setMode(b.getAttribute('data-mode')); }); });
  function pick() { (mode === 'img' ? $('fImg') : $('fVid')).click(); }
  $('btnOpen').addEventListener('click', pick);
  document.querySelectorAll('[data-pick]').forEach(function (b) { b.addEventListener('click', pick); });
  function openFile(f) {
    if (!f) return;
    var isV = /^video\//.test(f.type) || /\.(mp4|webm|mov|m4v|mkv|ogv)$/i.test(f.name), isI = /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name);
    if (!isV && !isI) { ui.toast('فقط عکس یا ویدیو را می‌شود باز کرد', 'err'); return; }
    closeResult(); setMode(isV ? 'vid' : 'img');
    ed().open(f).then(sync);
  }
  $('fImg').addEventListener('change', function (e) { openFile(e.target.files[0]); e.target.value = ''; });
  $('fVid').addEventListener('change', function (e) { openFile(e.target.files[0]); e.target.value = ''; });
  // drag and drop + paste
  var dc = 0;
  window.addEventListener('dragenter', function (e) { e.preventDefault(); dc++; document.body.classList.add('dragging'); });
  window.addEventListener('dragleave', function () { if (--dc <= 0) { dc = 0; document.body.classList.remove('dragging'); } });
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) { e.preventDefault(); dc = 0; document.body.classList.remove('dragging'); openFile(e.dataTransfer.files[0]); });
  window.addEventListener('paste', function (e) { var it = [].slice.call(e.clipboardData.items || []).filter(function (i) { return i.kind === 'file'; })[0]; if (it) openFile(it.getAsFile()); });
  // back: one step at a time
  function back() {
    if (!$('res').hidden) { closeResult(); return true; }
    if (root().classList.contains('has-file')) { ed().close(); sync(); return true; }
    return false;
  }
  $('btnBack').addEventListener('click', back);
  // result
  function showResult(r) {
    if (cur && cur.url) URL.revokeObjectURL(cur.url);
    cur = r; saved = null; KE.UI.fillResult(r);
    $('resTitle').textContent = r.kind === 'gif' ? 'GIF آماده است' : r.kind === 'awebp' ? 'WebP متحرک آماده است' : 'WebP آماده است';
    $('resStat').className = 'status'; $('resStat').textContent = 'هنوز ذخیره نشده';
    $('resReveal').hidden = true; $('resSave').querySelector('.ic') && null;
    $('res').hidden = false; $('btnBack').hidden = false;
    stat.className = 'status ok'; stat.textContent = KE.size(r.blob.size);
  }
  function closeResult() { if ($('res').hidden) return; $('res').hidden = true; sync(); }
  $('resBack').addEventListener('click', closeResult);
  $('resSave').addEventListener('click', function () {
    if (!cur) return;
    KE.save(cur.blob, cur.name, 'save').then(function (r) {
      if (r.ok) { saved = r.where; $('resStat').className = 'status ok'; $('resStat').textContent = 'ذخیره شد'; $('resReveal').hidden = KE.platform !== 'desktop'; ui.toast('ذخیره شد: ' + r.where); }
      else if (!r.cancelled) ui.toast('ذخیره نشد؛ پوشهٔ دیگری انتخاب کنید', 'err');
    });
  });
  $('resReveal').addEventListener('click', function () { KE.reveal(saved); });
  // keyboard
  window.addEventListener('keydown', function (e) {
    var k = e.key, c = e.ctrlKey || e.metaKey;
    if (c && (k === 'o' || k === 'O')) { e.preventDefault(); pick(); return; }
    if (c && (k === 's' || k === 'S')) { e.preventDefault(); if (!$('res').hidden) $('resSave').click(); else root().querySelector('[data-act=export]').click(); return; }
    if (k === 'Escape') { back(); return; }
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    if (mode === 'vid' && VE.ready && $('res').hidden) {
      if (k === ' ') { e.preventDefault(); VE.toggle(); }
      else if (k === 'i' || k === 'I') VE.trim.setRange(VE.v.currentTime, VE.b);
      else if (k === 'o' || k === 'O') VE.trim.setRange(VE.a, VE.v.currentTime);
      else if (k === 'ArrowLeft' && e.target.type !== 'range') VE.step(-1);
      else if (k === 'ArrowRight' && e.target.type !== 'range') VE.step(1);
    }
  });
  window.addEventListener('resize', ink);
  document.fonts && document.fonts.ready.then(ink); ink();
  window.kBack = back;
})();
