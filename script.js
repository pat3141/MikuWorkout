(function () {
  var root = document.documentElement;
  var THEME_KEY = 'miku-plan-theme';
  var LANG_KEY = 'miku-plan-lang';
  var CHECK_KEY = 'miku-plan-checks-v1';

  // ---- theme ----
  var CANBERRA_TZ = 'Australia/Sydney'; // Canberra follows Sydney's clock (AEST/AEDT)
  var CANBERRA_LAT = -35.2809;
  var CANBERRA_LON = 149.1300;

  function systemTheme() {
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }

  // NOAA-style sunrise/sunset equation. Returns UTC Date objects (or null if the
  // sun doesn't rise/set that day), given a calendar date and lat/lon in degrees.
  function calcSunTimes(y, m, d, lat, lon) {
    var rad = Math.PI / 180;
    function normalize(v, max) {
      while (v < 0) v += max;
      while (v >= max) v -= max;
      return v;
    }
    var dayOfYear = Math.round((Date.UTC(y, m, d) - Date.UTC(y, 0, 0)) / 86400000);
    var lngHour = lon / 15;

    function calcTime(isSunrise) {
      var t = dayOfYear + ((isSunrise ? 6 : 18) - lngHour) / 24;
      var M = (0.9856 * t) - 3.289;
      var L = normalize(M + (1.916 * Math.sin(M * rad)) + (0.020 * Math.sin(2 * M * rad)) + 282.634, 360);
      var RA = normalize((1 / rad) * Math.atan(0.91764 * Math.tan(L * rad)), 360);
      var Lquadrant = Math.floor(L / 90) * 90;
      var RAquadrant = Math.floor(RA / 90) * 90;
      RA = (RA + (Lquadrant - RAquadrant)) / 15;
      var sinDec = 0.39782 * Math.sin(L * rad);
      var cosDec = Math.cos(Math.asin(sinDec));
      var cosH = (Math.cos(90.833 * rad) - (sinDec * Math.sin(lat * rad))) / (cosDec * Math.cos(lat * rad));
      if (cosH > 1 || cosH < -1) return null;
      var H = isSunrise ? (360 - (1 / rad) * Math.acos(cosH)) : ((1 / rad) * Math.acos(cosH));
      H = H / 15;
      var UT = normalize(H + RA - (0.06571 * t) - 6.622 - lngHour, 24);
      return UT;
    }

    var sunriseUT = calcTime(true);
    var sunsetUT = calcTime(false);
    if (sunriseUT === null || sunsetUT === null) return { sunrise: null, sunset: null };
    return {
      sunrise: new Date(Date.UTC(y, m, d, Math.floor(sunriseUT), Math.round((sunriseUT % 1) * 60))),
      sunset: new Date(Date.UTC(y, m, d, Math.floor(sunsetUT), Math.round((sunsetUT % 1) * 60)))
    };
  }

  // Today's date as seen on a Canberra clock (independent of the visitor's own timezone).
  function canberraCalendarDate(now) {
    var fmt = new Intl.DateTimeFormat('en-CA', { timeZone: CANBERRA_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
    var y, m, d;
    fmt.formatToParts(now).forEach(function (p) {
      if (p.type === 'year') y = parseInt(p.value, 10);
      if (p.type === 'month') m = parseInt(p.value, 10);
      if (p.type === 'day') d = parseInt(p.value, 10);
    });
    return { y: y, m: m - 1, d: d };
  }

  // Light while the sun is up in Canberra, dark otherwise.
  function canberraTheme(now) {
    try {
      var cal = canberraCalendarDate(now);
      var times = calcSunTimes(cal.y, cal.m, cal.d, CANBERRA_LAT, CANBERRA_LON);
      if (!times.sunrise || !times.sunset) return systemTheme();
      return (now >= times.sunrise && now < times.sunset) ? 'light' : 'dark';
    } catch (e) {
      return systemTheme();
    }
  }

  var storedTheme = null;
  try { storedTheme = localStorage.getItem(THEME_KEY); } catch (e) {}
  applyTheme(storedTheme || canberraTheme(new Date()));

  // If the visitor hasn't manually picked a theme, re-check every 15 min so an
  // open tab flips automatically at Canberra sunrise/sunset.
  if (!storedTheme) {
    setInterval(function () {
      var overridden = null;
      try { overridden = localStorage.getItem(THEME_KEY); } catch (e) {}
      if (!overridden) applyTheme(canberraTheme(new Date()));
    }, 15 * 60 * 1000);
  }

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

  // ---- workout tracker: start button, elapsed time, on-track finish time ----
  var WORKOUT_KEY = 'miku-plan-workout-v1';
  var workoutState = {};
  try { workoutState = JSON.parse(localStorage.getItem(WORKOUT_KEY) || '{}'); } catch (e) { workoutState = {}; }
  function saveWorkoutState() {
    try { localStorage.setItem(WORKOUT_KEY, JSON.stringify(workoutState)); } catch (e) {}
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1) + '-' + String(d.getDate());
  }
  function timeFmt(date) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  function elapsedFmt(ms) {
    var totalSec = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    var mm = h > 0 ? String(m).padStart(2, '0') : String(m);
    var ss = String(s).padStart(2, '0');
    return h > 0 ? (h + ':' + mm + ':' + ss) : (mm + ':' + ss);
  }

  var trackerTicks = {}; // dayId -> tick function, so checkbox changes can force a refresh

  function initTracker(tracker) {
    var dayId = tracker.getAttribute('data-day');
    var estMinAttr = tracker.getAttribute('data-est-min');
    var estMin = estMinAttr ? parseFloat(estMinAttr) : null;
    var startBtn = tracker.querySelector('.start-btn');
    var statsEl = tracker.querySelector('.tracker-stats');
    var elapsedEl = tracker.querySelector('.elapsed');
    var nowEl = tracker.querySelector('.now');
    var nowStat = tracker.querySelector('.now-stat');
    var estFinishStat = tracker.querySelector('.est-finish-stat');
    var estFinishEl = tracker.querySelector('.est-finish');
    var doneLabel = tracker.querySelector('.tracker-done-label');
    var resetBtn = tracker.querySelector('.stop-btn');
    var section = tracker.closest('section.day');
    var boxes = section ? section.querySelectorAll('input.chk') : [];
    var timerId = null;

    function progress() {
      var total = boxes.length, checked = 0;
      boxes.forEach(function (b) { if (b.checked) checked++; });
      return { total: total, checked: checked };
    }

    function tick() {
      var entry = workoutState[dayId];
      if (!entry) return;
      var now = new Date();
      var elapsedMs = now.getTime() - entry.start;
      var p = progress();

      if (p.total > 0 && p.checked === p.total) {
        stopTimer();
        statsEl.classList.add('done-state');
        elapsedEl.textContent = elapsedFmt(elapsedMs);
        if (nowStat) nowStat.hidden = true;
        if (estFinishStat) estFinishStat.hidden = true;
        if (doneLabel) doneLabel.hidden = false;
        return;
      }

      elapsedEl.textContent = elapsedFmt(elapsedMs);
      nowEl.textContent = timeFmt(now);

      var estMinutes = null;
      if (p.total > 0 && p.checked > 0) {
        estMinutes = (elapsedMs / 60000) / p.checked * p.total;
      } else if (estMin !== null) {
        estMinutes = estMin;
      }
      if (estFinishStat) {
        if (estMinutes !== null) {
          estFinishEl.textContent = timeFmt(new Date(entry.start + estMinutes * 60000));
          estFinishStat.hidden = false;
        } else {
          estFinishStat.hidden = true;
        }
      }
    }

    function startTimer() {
      if (timerId) return;
      tick();
      timerId = setInterval(tick, 1000);
    }
    function stopTimer() {
      if (timerId) { clearInterval(timerId); timerId = null; }
    }

    function beginWorkout() {
      workoutState[dayId] = { start: Date.now(), date: todayStr() };
      saveWorkoutState();
      startBtn.hidden = true;
      statsEl.hidden = false;
      statsEl.classList.remove('done-state');
      if (nowStat) nowStat.hidden = false;
      if (doneLabel) doneLabel.hidden = true;
      startTimer();
    }
    function resetWorkout() {
      delete workoutState[dayId];
      saveWorkoutState();
      stopTimer();
      statsEl.classList.remove('done-state');
      startBtn.hidden = false;
      statsEl.hidden = true;
    }

    startBtn.addEventListener('click', beginWorkout);
    if (resetBtn) resetBtn.addEventListener('click', resetWorkout);

    var existing = workoutState[dayId];
    if (existing && existing.date === todayStr()) {
      startBtn.hidden = true;
      statsEl.hidden = false;
      startTimer();
    }

    trackerTicks[dayId] = tick;
  }

  // ---- celebration: pat flies across the page on check ----
  function celebrate() {
    var img = document.createElement('img');
    img.src = 'assets/img/pat-head-icon.png';
    img.alt = '';
    img.className = 'flying-pat';
    img.style.setProperty('--fly-top', (12 + Math.random() * 60) + '%');
    document.body.appendChild(img);
    img.addEventListener('animationend', function () { img.remove(); });
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
          if (box.checked) celebrate();
          saveChecks();
          if (trackerTicks[dayId]) trackerTicks[dayId]();
        });
      });
    });
    applyChecks();

    document.querySelectorAll('.workout-tracker').forEach(initTracker);

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

    // ---- day-pill jump navigation ----
    document.querySelectorAll('.day-pill[data-target]').forEach(function (pill) {
      pill.addEventListener('click', function () {
        var target = document.querySelector('section.day[data-day="' + pill.getAttribute('data-target') + '"]');
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.classList.remove('flash');
        void target.offsetWidth; // restart animation if clicked again
        target.classList.add('flash');
      });
    });
  });
})();
