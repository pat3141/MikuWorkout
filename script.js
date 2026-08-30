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
    var meta = document.getElementById('themeColorMeta');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#161814' : '#f3f4ef');
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

  // ---- daily randomness: same pick all day, different pick each day ----
  function hashSeed(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) >>> 0; }
    return h;
  }
  function todayDateStr() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  // ---- weekly streak + deload tracking ----
  var HISTORY_KEY = 'miku-plan-history-v1';
  var PROGRAM_START_KEY = 'miku-plan-start-v1';
  var DELOAD_DISMISS_KEY = 'miku-plan-deload-dismissed-v1';
  var STREAK_THRESHOLD = 4; // out of 5 lift days counts as a "good" week
  var DELOAD_EVERY_WEEKS = 7;
  var LIFT_DAY_IDS = ['lowerA', 'upperA', 'lowerB', 'upperB', 'bonus'];

  function mondayOf(date) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var day = d.getDay();
    var diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    return d;
  }
  function dateKey(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function parseDateKey(key) {
    var parts = key.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveHistory(hist) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(hist)); } catch (e) {}
  }
  function weekCompletedCount(mondayDate, hist) {
    var seen = {};
    for (var i = 0; i < 7; i++) {
      var d = new Date(mondayDate);
      d.setDate(d.getDate() + i);
      var entries = hist[dateKey(d)];
      if (entries) entries.forEach(function (dayId) { seen[dayId] = true; });
    }
    return Object.keys(seen).length;
  }
  function recordSessionComplete(dayId) {
    if (LIFT_DAY_IDS.indexOf(dayId) === -1) return;
    var hist = loadHistory();
    var today = todayDateStr();
    if (!hist[today]) hist[today] = [];
    if (hist[today].indexOf(dayId) === -1) {
      hist[today].push(dayId);
      saveHistory(hist);
    }
    renderStats();
  }
  function computeStats() {
    var hist = loadHistory();
    var now = new Date();
    var thisMonday = mondayOf(now);
    var thisWeekCount = weekCompletedCount(thisMonday, hist);

    var streak = 0;
    var pointer = new Date(thisMonday);
    if (thisWeekCount >= STREAK_THRESHOLD) streak++;
    pointer.setDate(pointer.getDate() - 7);
    for (var i = 0; i < 52; i++) {
      var c = weekCompletedCount(pointer, hist);
      if (c >= STREAK_THRESHOLD) {
        streak++;
        pointer.setDate(pointer.getDate() - 7);
      } else {
        break;
      }
    }
    return { weekCount: thisWeekCount, streak: streak };
  }
  function renderStats() {
    var s = computeStats();
    var wc = document.getElementById('weekCount');
    var sc = document.getElementById('streakCount');
    if (wc) wc.textContent = s.weekCount + '/5';
    if (sc) sc.textContent = s.streak;
  }

  function getProgramStart() {
    var v = null;
    try { v = localStorage.getItem(PROGRAM_START_KEY); } catch (e) {}
    if (!v) {
      v = todayDateStr();
      try { localStorage.setItem(PROGRAM_START_KEY, v); } catch (e) {}
    }
    return v;
  }
  function weeksSinceStart() {
    var start = parseDateKey(getProgramStart());
    var diffDays = Math.floor((mondayOf(new Date()) - mondayOf(start)) / 86400000);
    return Math.floor(diffDays / 7);
  }
  function checkDeload() {
    var banner = document.getElementById('deloadBanner');
    if (!banner) return;
    var weeks = weeksSinceStart();
    if (weeks > 0 && weeks % DELOAD_EVERY_WEEKS === 0) {
      var dismissedWeek = null;
      try { dismissedWeek = localStorage.getItem(DELOAD_DISMISS_KEY); } catch (e) {}
      if (dismissedWeek !== String(weeks)) banner.hidden = false;
    }
  }

  // ---- random daily quote ----
  var QUOTES = [
    { jp: '継続は力なり', romaji: 'Keizoku wa chikara nari', en: 'Consistency is strength.' },
    { jp: '七転び八起き', romaji: 'Nana korobi ya oki', en: 'Fall down seven times, stand up eight.' },
    { jp: '千里の道も一歩から', romaji: 'Senri no michi mo ippo kara', en: 'A journey of a thousand miles begins with a single step.' },
    { jp: '塵も積もれば山となる', romaji: 'Chiri mo tsumoreba yama to naru', en: 'Even dust, piled up, becomes a mountain.' },
    { jp: '石の上にも三年', romaji: 'Ishi no ue ni mo san-nen', en: 'Three years sitting on a stone still pays off.' },
    { jp: '為せば成る', romaji: 'Naseba naru', en: "Where there's a will, there's a way." }
  ];
  function applyDailyQuote() {
    var q = QUOTES[hashSeed('quote:' + todayDateStr()) % QUOTES.length];
    var jpEl = document.getElementById('quoteJp');
    var romajiEl = document.getElementById('quoteRomaji');
    var enEl = document.getElementById('quoteEnText');
    if (jpEl) jpEl.textContent = q.jp;
    if (romajiEl) romajiEl.textContent = q.romaji;
    if (enEl) enEl.textContent = q.en;
  }

  // ---- mystery move: random wildcard exercise per day, tap to reveal ----
  var MYSTERY_POOL = [
    { en: 'Bear crawl', ja: 'ベアクロール', sets: { en: '3 × 20m', ja: '3セット × 20m' }, note: { en: 'Hips low, controlled steps', ja: '腰を低く、丁寧に進む' } },
    { en: 'Broad jump', ja: '立ち幅跳び', sets: { en: '4 × 5', ja: '4セット × 5回' }, note: { en: 'Land soft, reset each rep', ja: '着地は静かに、毎回リセット' } },
    { en: "Farmer's carry", ja: 'ファーマーズキャリー', sets: { en: '3 × 40m', ja: '3セット × 40m' }, note: { en: 'Heavy dumbbells, walk tall', ja: '重めのダンベルで、姿勢よく歩く' } },
    { en: 'Wall sit', ja: 'ウォールシット', sets: { en: '3 × 45s', ja: '3セット × 45秒' }, note: { en: 'Thighs parallel to the floor', ja: '太ももが床と平行になるように' } },
    { en: 'Box jump', ja: 'ボックスジャンプ', sets: { en: '4 × 8', ja: '4セット × 8回' }, note: { en: "Step down, don't jump down", ja: '降りるときはジャンプせず、ステップで' } },
    { en: 'Mountain climbers', ja: 'マウンテンクライマー', sets: { en: '3 × 30s', ja: '3セット × 30秒' }, note: { en: 'Quick knees, flat back', ja: '膝を素早く、背中はまっすぐ' } },
    { en: 'Turkish get-up', ja: 'ターキッシュゲットアップ', sets: { en: '3 × 5/side', ja: '3セット × 片側5回' }, note: { en: 'Slow and controlled, light weight', ja: '軽い重量でゆっくり丁寧に' } },
    { en: 'Jump squats', ja: 'ジャンプスクワット', sets: { en: '4 × 10', ja: '4セット × 10回' }, note: { en: 'Soft landing, full squat depth', ja: '着地は柔らかく、しっかりしゃがむ' } },
    { en: 'Battle ropes', ja: 'バトルロープ', sets: { en: '5 × 20s', ja: '5セット × 20秒' }, note: { en: 'Big waves, brace your core', ja: '大きく波打たせ、体幹を締める' } },
    { en: 'Plank shoulder taps', ja: 'プランクショルダータップ', sets: { en: '3 × 20', ja: '3セット × 20回' }, note: { en: 'Keep hips still and level', ja: '腰を動かさず水平に保つ' } },
    { en: 'Lateral band walks', ja: 'ラテラルバンドウォーク', sets: { en: '3 × 15/side', ja: '3セット × 片側15回' }, note: { en: 'Stay low, knees out', ja: '腰を落として、膝を外向きに' } },
    { en: 'Renegade row', ja: 'レネゲードロウ', sets: { en: '3 × 8/side', ja: '3セット × 片側8回' }, note: { en: 'Wide stance, minimal hip sway', ja: '足幅を広く取り、腰を振らない' } }
  ];
  function initMystery(card) {
    var dayId = card.getAttribute('data-day');
    var pick = MYSTERY_POOL[hashSeed('mystery:' + todayDateStr() + ':' + dayId) % MYSTERY_POOL.length];
    var nameEl = card.querySelector('.mystery-name');
    var setsEl = card.querySelector('.mystery-sets');
    var noteEl = card.querySelector('.mystery-note');
    nameEl.querySelector('.en').textContent = pick.en;
    nameEl.querySelector('.ja').textContent = pick.ja;
    setsEl.querySelector('.en').textContent = pick.sets.en;
    setsEl.querySelector('.ja').textContent = pick.sets.ja;
    noteEl.querySelector('.en').textContent = pick.note.en;
    noteEl.querySelector('.ja').textContent = pick.note.ja;

    var toggle = card.querySelector('.mystery-toggle');
    var reveal = card.querySelector('.mystery-reveal');
    var labelEn = toggle.querySelector('.mystery-label .en');
    var labelJa = toggle.querySelector('.mystery-label .ja');
    toggle.addEventListener('click', function () {
      var willShow = reveal.hidden;
      reveal.hidden = !willShow;
      toggle.setAttribute('aria-expanded', willShow ? 'true' : 'false');
      labelEn.textContent = willShow ? 'Mystery Move — tap to hide' : 'Mystery Move — tap to reveal';
      labelJa.textContent = willShow ? 'ミステリー種目・タップして隠す' : 'ミステリー種目・タップして公開';
    });
  }

  // ---- exercise detail overlay: tap a row to see muscles worked + full cue ----
  var MUSCLE_LABELS = {
    chest: { en: 'Chest', ja: '胸' },
    shoulders: { en: 'Shoulders', ja: '肩' },
    biceps: { en: 'Biceps', ja: '上腕二頭筋' },
    triceps: { en: 'Triceps', ja: '上腕三頭筋' },
    forearms: { en: 'Forearms / grip', ja: '前腕・握力' },
    abs: { en: 'Abs', ja: '腹筋' },
    obliques: { en: 'Obliques', ja: '腹斜筋' },
    traps: { en: 'Traps', ja: '僧帽筋' },
    lats: { en: 'Lats', ja: '広背筋' },
    'lower-back': { en: 'Lower back', ja: '下背部' },
    glutes: { en: 'Glutes', ja: 'お尻（臀筋）' },
    quads: { en: 'Quads', ja: '大腿四頭筋' },
    hamstrings: { en: 'Hamstrings', ja: 'ハムストリングス' },
    calves: { en: 'Calves', ja: 'ふくらはぎ' }
  };
  // keyed by the exercise photo's base filename (assets/exercises/<key>_0.jpg)
  var EXERCISE_DETAILS = {
    Goblet_Squat: { primary: ['quads', 'glutes'], secondary: ['abs'] },
    Romanian_Deadlift: { primary: ['hamstrings', 'glutes'], secondary: ['lower-back'] },
    Bodyweight_Walking_Lunge: { primary: ['quads', 'glutes'], secondary: ['hamstrings'] },
    Leg_Press: { primary: ['quads'], secondary: ['glutes', 'hamstrings'] },
    Seated_Leg_Curl: { primary: ['hamstrings'], secondary: [] },
    Standing_Calf_Raises: { primary: ['calves'], secondary: [] },
    Hanging_Leg_Raise: { primary: ['abs'], secondary: ['forearms'] },
    Dumbbell_Bench_Press: { primary: ['chest'], secondary: ['shoulders', 'triceps'] },
    Dumbbell_Shoulder_Press: { primary: ['shoulders'], secondary: ['triceps'] },
    Leverage_Incline_Chest_Press: { primary: ['chest'], secondary: ['shoulders'] },
    Cable_Seated_Lateral_Raise: { primary: ['shoulders'], secondary: [] },
    'Triceps_Pushdown_-_Rope_Attachment': { primary: ['triceps'], secondary: [] },
    Plank: { primary: ['abs'], secondary: ['shoulders'] },
    Push_Up_to_Side_Plank: { primary: ['obliques'], secondary: ['shoulders'] },
    Barbell_Hip_Thrust: { primary: ['glutes'], secondary: ['hamstrings'] },
    Split_Squat_with_Dumbbells: { primary: ['quads', 'glutes'], secondary: ['hamstrings'] },
    Glute_Kickback: { primary: ['glutes'], secondary: [] },
    Thigh_Abductor: { primary: ['glutes'], secondary: [] },
    Dumbbell_Step_Ups: { primary: ['quads', 'glutes'], secondary: ['hamstrings', 'calves'] },
    'Wide-Grip_Lat_Pulldown': { primary: ['lats'], secondary: ['biceps'] },
    Seated_Cable_Rows: { primary: ['lats'], secondary: ['biceps'] },
    'One-Arm_Dumbbell_Row': { primary: ['lats'], secondary: ['biceps', 'traps'] },
    Face_Pull: { primary: ['traps'], secondary: ['shoulders'] },
    Dumbbell_Bicep_Curl: { primary: ['biceps'], secondary: [] },
    Standing_Cable_Wood_Chop: { primary: ['obliques'], secondary: ['shoulders'] },
    'One-Arm_Kettlebell_Swings': { primary: ['glutes', 'hamstrings'], secondary: ['abs'] },
    Pushups: { primary: ['chest'], secondary: ['shoulders', 'triceps'] }
  };
  function exKeyFromThumb(row) {
    var img = row.querySelector('.thumb img');
    if (!img || !img.getAttribute('src')) return null;
    var m = img.getAttribute('src').match(/assets\/exercises\/(.+)_[01]\.jpg$/);
    return m ? m[1] : null;
  }
  function muscleListText(keys, lang) {
    if (!keys || !keys.length) return lang === 'ja' ? 'なし' : 'None';
    return keys.map(function (k) { return MUSCLE_LABELS[k] ? MUSCLE_LABELS[k][lang] : k; }).join(lang === 'ja' ? '・' : ', ');
  }

  var exOverlay, exBackBtn;
  function closeExercise(skipHistory) {
    if (!exOverlay || exOverlay.hidden) return;
    exOverlay.classList.remove('open');
    setTimeout(function () { exOverlay.hidden = true; }, 280);
    if (!skipHistory && history.state && history.state.exOpen) history.back();
  }
  function openExercise(row) {
    var exKey = exKeyFromThumb(row);
    var detail = exKey && EXERCISE_DETAILS[exKey];
    var section = row.closest('section.day');

    var nameCell = row.querySelector('td.ex');
    var setsCell = row.querySelector('td.setsreps');
    var restCell = row.querySelectorAll('td.num')[1] || row.querySelectorAll('td.num')[0];
    var noteCell = row.querySelector('td.note');
    var thumbImgs = row.querySelectorAll('.thumb img');

    document.getElementById('exName').innerHTML = nameCell ? nameCell.innerHTML : '';
    document.getElementById('exSetsReps').innerHTML = setsCell ? setsCell.innerHTML : '';
    document.getElementById('exRest').innerHTML = restCell ? restCell.innerHTML : '';
    document.getElementById('exNote').innerHTML = noteCell ? noteCell.innerHTML : '';

    if (section) {
      var h2 = section.querySelector('.day-head h2');
      var tag = section.querySelector('.day-head .tag');
      document.getElementById('exDayTag').innerHTML = (h2 ? h2.innerHTML : '') + (tag ? ' &middot; ' + tag.innerHTML : '');
    }

    var exThumb = document.getElementById('exThumb');
    var heroImgs = exThumb.querySelectorAll('img');
    if (thumbImgs.length > 1) {
      heroImgs[0].src = thumbImgs[0].getAttribute('src');
      heroImgs[1].src = thumbImgs[1].getAttribute('src');
      heroImgs[1].style.display = '';
      exThumb.classList.remove('thumb-hold');
    } else if (thumbImgs.length === 1) {
      heroImgs[0].src = thumbImgs[0].getAttribute('src');
      heroImgs[1].style.display = 'none';
      exThumb.classList.add('thumb-hold');
    }

    var primary = detail ? detail.primary : [];
    var secondary = detail ? detail.secondary : [];
    exOverlay.querySelectorAll('.mr-region').forEach(function (shape) {
      var region = shape.getAttribute('data-region');
      shape.classList.toggle('mr-primary', primary.indexOf(region) !== -1);
      shape.classList.toggle('mr-secondary', secondary.indexOf(region) !== -1);
    });
    document.getElementById('exMusclePrimary').textContent = muscleListText(primary, 'en') + ' / ' + muscleListText(primary, 'ja');
    document.getElementById('exMuscleSecondary').textContent = muscleListText(secondary, 'en') + ' / ' + muscleListText(secondary, 'ja');

    exOverlay.hidden = false;
    requestAnimationFrame(function () { exOverlay.classList.add('open'); });
    exOverlay.scrollTop = 0;
    history.pushState({ exOpen: true }, '');
  }
  function initExerciseOverlay() {
    exOverlay = document.getElementById('exOverlay');
    exBackBtn = document.getElementById('exBack');
    if (!exOverlay) return;
    document.querySelectorAll('section.day table tbody tr').forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target.closest('.chk-cell')) return;
        openExercise(row);
      });
    });
    if (exBackBtn) exBackBtn.addEventListener('click', function () { closeExercise(false); });
    window.addEventListener('popstate', function () {
      if (!exOverlay.hidden) closeExercise(true);
    });
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

  // ---- celebration: pat flies across the page on check, level with the checked row ----
  function celebrate(anchorEl) {
    var img = document.createElement('img');
    img.src = 'assets/img/pat-head-icon.png';
    img.alt = '';
    img.className = 'flying-pat';
    var top;
    if (anchorEl) {
      var rect = anchorEl.getBoundingClientRect();
      top = rect.top + rect.height / 2 - 28;
    } else {
      top = window.innerHeight * (0.12 + Math.random() * 0.6);
    }
    img.style.setProperty('--fly-top', top + 'px');
    document.body.appendChild(img);
    img.addEventListener('animationend', function () { img.remove(); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    applyDailyQuote();
    document.querySelectorAll('.mystery-card').forEach(initMystery);
    initExerciseOverlay();

    document.querySelectorAll('section.day').forEach(function (section) {
      var dayId = section.getAttribute('data-day');
      var boxes = section.querySelectorAll('input.chk');
      boxes.forEach(function (box, idx) {
        box.addEventListener('change', function () {
          var k = keyFor(dayId, idx);
          state[k] = box.checked;
          var row = box.closest('tr');
          if (row) row.classList.toggle('done', box.checked);
          if (box.checked) celebrate(row || box);
          saveChecks();
          if (trackerTicks[dayId]) trackerTicks[dayId]();
          if (boxes.length && Array.prototype.every.call(boxes, function (b) { return b.checked; })) {
            recordSessionComplete(dayId);
          }
        });
      });
    });
    applyChecks();

    document.querySelectorAll('.workout-tracker').forEach(initTracker);

    getProgramStart();
    renderStats();
    checkDeload();
    var deloadDismiss = document.getElementById('deloadDismiss');
    if (deloadDismiss) deloadDismiss.addEventListener('click', function () {
      var banner = document.getElementById('deloadBanner');
      if (banner) banner.hidden = true;
      try { localStorage.setItem(DELOAD_DISMISS_KEY, String(weeksSinceStart())); } catch (e) {}
    });

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
