/* Gallery filters and full-size viewer. */
(function () {
  'use strict';
  var dlg = document.getElementById('lightbox');
  if (!dlg) return;

  var tiles = [].slice.call(document.querySelectorAll('.tile'));
  var status = document.getElementById('gallery-status');
  var empty = document.getElementById('gallery-empty');
  var state = { cat: 'all', room: 'all' };
  var pos = 0;

  function visibleTiles() { return tiles.filter(function (t) { return !t.hidden; }); }

  function applyFilters() {
    tiles.forEach(function (t) {
      var ok = (state.cat === 'all' || t.getAttribute('data-cat') === state.cat) &&
               (state.room === 'all' || t.getAttribute('data-room') === state.room);
      t.hidden = !ok;
    });
    var n = visibleTiles().length;
    empty.hidden = n > 0;
    status.textContent = n + (n === 1 ? ' photo' : ' photos') + ' shown';
  }

  function markPressed(group, attr, value) {
    group.querySelectorAll('.chip').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute(attr) === value));
    });
  }

  document.getElementById('cat-chips').addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return;
    state.cat = b.getAttribute('data-cat');
    markPressed(this, 'data-cat', state.cat);
    applyFilters();
  });
  document.getElementById('room-chips').addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return;
    state.room = b.getAttribute('data-room');
    markPressed(this, 'data-room', state.room);
    applyFilters();
  });

  function show() {
    var list = visibleTiles();
    var t = list[pos];
    var key = t.querySelector('.media').getAttribute('data-img');
    var src = (window.EH_IMAGES || {})[key];
    var media = document.getElementById('lb-media');
    media.style.backgroundImage = src ? 'url("' + src + '")' : '';
    document.getElementById('lb-title').textContent = t.getAttribute('data-title');
    document.getElementById('lb-cap').textContent =
      t.getAttribute('data-caption') + ' \u00b7 ' + (pos + 1) + ' of ' + list.length;
  }

  tiles.forEach(function (t) {
    t.addEventListener('click', function () {
      pos = visibleTiles().indexOf(t);
      show();
      dlg.showModal();
      document.getElementById('lb-close').focus();
    });
  });

  document.getElementById('lb-prev').addEventListener('click', function () {
    var n = visibleTiles().length;
    pos = (pos - 1 + n) % n; show();
  });
  document.getElementById('lb-next').addEventListener('click', function () {
    pos = (pos + 1) % visibleTiles().length; show();
  });
  document.getElementById('lb-close').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') document.getElementById('lb-prev').click();
    if (e.key === 'ArrowRight') document.getElementById('lb-next').click();
  });
})();