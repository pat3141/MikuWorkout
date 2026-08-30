(function () {
  var root = document.documentElement;
  var THEME_KEY = 'miku-plan-theme';
  var LANG_KEY = 'miku-plan-lang';
  var CHECK_KEY = 'miku-plan-checks-v1';

  // ---- theme ----
  function systemTheme() {
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  var storedTheme = null;
  try { storedTheme = localStorage.getItem(THEME_KEY); } catch (e) {}
  applyTheme(storedTheme || systemTheme());

  function applyTheme(t) {
    root.setAttribute('data-theme', t);
  }
  function toggleTheme() {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  }

  // ---- language ----
  var storedLang = null;
  try { storedLang = localStorage.getItem(LANG_KEY); } catch (e) {}
  if (storedLang) root.setAttribute('data-lang', storedLang);

  function toggleLang() {
    var next = root.getAttribute('data-lang') === 'ja' ? 'en' : 'ja';
    root.setAttribute('data-lang', next);
    root.setAttribute('lang', next);
    try { localStorage.setItem(LANG_KEY, next); } catch (e) {}
  }

  // ---- checkbox persistence ----
  var state = {};
  try { state = JSON.parse(localStorage.getItem(CHECK_KEY) || '{}'); } catch (e) { state = {}; }

  function keyFor(section, idx) { return section + ':' + idx; }

  function applyChecks() {
    document.querySelectorAll('section.day').forEach(function (section) {
      var dayId = section.getAttribute('data-day');
      var boxes = section.querySelectorAll('input.chk');
      boxes.forEach(function (box, idx) {
        var k = keyFor(dayId, idx);
        var checked = !!state[k];
        box.checked = checked;
        var row = box.closest('tr');
        if (row) row.classList.toggle('done', checked);
      });
    });
  }
  function saveChecks() {
    try { localStorage.setItem(CHECK_KEY, JSON.stringify(state)); } catch (e) {}
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('section.day').forEach(function (section) {
      var dayId = section.getAttribute('data-day');
      var boxes = section.querySelectorAll('input.chk');
      boxes.forEach(function (box, idx) {
        box.addEventListener('change', function () {
          var k = keyFor(dayId, idx);
          state[k] = box.checked;
          var row = box.closest('tr');
          if (row) row.classList.toggle('done', box.checked);
          saveChecks();
        });
      });
    });
    applyChecks();

    var resetBtn = document.getElementById('resetBtn');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      state = {};
      saveChecks();
      applyChecks();
    });

    var langBtn = document.getElementById('langBtn');
    if (langBtn) langBtn.addEventListener('click', toggleLang);

    var themeBtn = document.getElementById('themeBtn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
  });
})();
