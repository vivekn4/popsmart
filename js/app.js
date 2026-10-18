/* ============================================================
   POPSMART — app shell: router, store, shared UI helpers.
   The learning engine (lessons / cards / checkpoints) mounts
   into the #*-player / #*-picker containers defined in index.html
   and talks to this shell via window.POPSMART.
   ============================================================ */
(function(){
'use strict';

/* ---------------- Store: namespaced localStorage ---------------- */
var NS = 'popsmart.v1.';
var memoryFallback = {};
var storageOK = (function(){
  try{
    localStorage.setItem('__ps_test', '1');
    localStorage.removeItem('__ps_test');
    return true;
  }catch(e){ return false; }
})();

var Store = {
  get: function(key, def){
    var raw;
    try{
      raw = storageOK ? localStorage.getItem(NS + key) : memoryFallback[NS + key];
    }catch(e){ raw = null; }
    if(raw == null) return def;
    try{ return JSON.parse(raw); }
    catch(e){ return def; }
  },
  set: function(key, val){
    var raw;
    try{ raw = JSON.stringify(val); }
    catch(e){ return false; }
    try{
      if(storageOK) localStorage.setItem(NS + key, raw);
      else memoryFallback[NS + key] = raw;
      return true;
    }catch(e){ return false; }
  },
  remove: function(key){
    try{
      if(storageOK) localStorage.removeItem(NS + key);
      else delete memoryFallback[NS + key];
    }catch(e){}
  }
};

/* ---------------- Tiny event bus ---------------- */
var listeners = {};
function on(evt, fn){
  (listeners[evt] = listeners[evt] || []).push(fn);
}
function emit(evt, data){
  (listeners[evt] || []).forEach(function(fn){
    try{ fn(data); }catch(e){}
  });
}

/* ---------------- Toast ---------------- */
var toastStack = null;
function toast(msg){
  if(!toastStack) toastStack = document.getElementById('toast-stack');
  var el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  toastStack.appendChild(el);
  setTimeout(function(){
    el.style.opacity = '0';
    setTimeout(function(){ el.remove(); }, 250);
  }, 2600);
}

/* ---------------- Router ---------------- */
var ROUTES = ['dashboard', 'learn', 'cards', 'tracker', 'checkpoint'];
var views = {};
var navLinks = [];

function currentRoute(){
  var h = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
  return ROUTES.indexOf(h) >= 0 ? h : 'dashboard';
}

function render(route){
  ROUTES.forEach(function(r){
    var v = views[r];
    if(!v) return;
    var active = (r === route);
    v.hidden = !active;
    v.classList.toggle('active', active);
  });
  navLinks.forEach(function(a){
    if(a.dataset.route === route) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  emit('route', route);
}

function navigate(route){
  if(ROUTES.indexOf(route) < 0) route = 'dashboard';
  if(('#/' + route) !== location.hash){
    location.hash = '#/' + route;
  }else{
    render(route);
  }
}

/* ---------------- Header stats ---------------- */
function todayKey(){
  var d = new Date();
  return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
}

function getStreak(){
  return Store.get('streak', { count: 0, lastDate: null });
}

function touchStreak(){
  var s = getStreak();
  var today = todayKey();
  if(s.lastDate === today) return s.count;
  var y = new Date(); y.setDate(y.getDate() - 1);
  var yKey = y.getFullYear() + '-' + (y.getMonth()+1) + '-' + y.getDate();
  s.count = (s.lastDate === yKey) ? s.count + 1 : 1;
  s.lastDate = today;
  Store.set('streak', s);
  return s.count;
}

function getFocusScore(){
  var scores = Store.get('focusScores', {});
  return scores[todayKey()] || 0;
}

function renderHeader(){
  var streak = getStreak().count;
  var focus = getFocusScore();
  var sc = document.getElementById('streak-count');
  var fs = document.getElementById('focus-score');
  if(sc) sc.textContent = streak;
  if(fs) fs.textContent = focus;
  var ss = document.getElementById('streak-sticker');
  if(ss) ss.setAttribute('aria-label', 'Current streak: ' + streak + ' days');
  var fz = document.getElementById('focus-sticker');
  if(fz) fz.setAttribute('aria-label', 'Focus score: ' + focus);

  // dashboard mirrors
  var ds = document.getElementById('dash-streak');
  if(ds) ds.textContent = streak;
  var df = document.getElementById('dash-focus');
  if(df) df.textContent = focus;
  var ring = document.getElementById('focus-ring');
  if(ring){
    var C = 238.8;
    ring.style.strokeDashoffset = String(C * (1 - Math.min(100, focus) / 100));
  }
  var fm = document.getElementById('dash-focus-msg');
  if(fm){
    fm.textContent = focus === 0 ? 'Do one lesson to light this up.'
      : focus < 40 ? 'Warming up. One more rep.'
      : focus < 75 ? 'Solid focus. Keep the streak alive.'
      : 'Locked in. You are unstoppable today.';
  }
  var sm = document.getElementById('dash-streak-msg');
  if(sm){
    sm.textContent = streak === 0 ? 'Start today — future you says thanks.'
      : streak === 1 ? 'Day one in the books. Come back tomorrow.'
      : streak < 7 ? streak + ' days strong. The habit is forming.'
      : streak + ' days. Certified brain athlete.';
  }
}

/* ---------------- Rhythm chart ----------------
   Data source: Adapt.hourPerformance() (array sorted by accuracy).
   The old 'rhythm' Store key was never written; this is the single renderer. */
function renderRhythm(){
  var chart = document.getElementById('rhythm-chart');
  if(!chart || !window.Adapt) return;
  var perf = Adapt.hourPerformance ? Adapt.hourPerformance() : [];
  var byHour = {};
  perf.forEach(function(e){ byHour[e.hour] = e.accuracy; });
  var bestHour = perf.length ? perf[0].hour : -1;
  chart.innerHTML = '';
  for(var h = 6; h <= 22; h++){
    var v = byHour[h] || 0;
    var lab = (h % 12 === 0 ? 12 : h % 12) + (h < 12 ? 'a' : 'p');
    var bar = document.createElement('div');
    bar.className = 'bar' + (h === bestHour ? ' best' : '');
    bar.style.height = Math.max(6, Math.round(v * 100)) + '%';
    bar.setAttribute('role', 'presentation');
    bar.title = lab + ': ' + Math.round(v * 100) + '% accuracy';
    var l = document.createElement('span');
    l.className = 'bar-label';
    l.textContent = lab;
    bar.appendChild(l);
    chart.appendChild(bar);
  }
  var tip = document.getElementById('rhythm-tip');
  if(tip){
    if(!perf.length){
      tip.textContent = 'Study a few sessions and I will spot your power hours.';
    }else{
      var bh = perf[0].hour;
      var label = (bh % 12 === 0 ? 12 : bh % 12) + (bh < 12 ? ' AM' : ' PM');
      tip.textContent = 'Your sharpest hour looks like ' + label + ' (' +
        Math.round(perf[0].accuracy * 100) + '% accuracy) — I will nudge you then.';
    }
  }
  // accessible summary for the chart (bars are role="presentation")
  var old = document.getElementById('rhythm-summary');
  if(old) old.remove();
  if(perf.length){
    var s = document.createElement('p');
    s.id = 'rhythm-summary';
    s.className = 'visually-hidden';
    s.textContent = 'Best study hour: ' + perf[0].hour + ':00, ' +
      Math.round(perf[0].accuracy * 100) + '% accuracy across ' + perf[0].answers + ' answers.';
    chart.parentNode.appendChild(s);
  }
}

/* ---------------- Skill rings ---------------- */
function renderSkills(){
  var wrap = document.getElementById('skill-rings');
  if(!wrap) return;
  var skills = Store.get('skills', {}); // {subjectId: {xp, level}}
  var subjects = (window.POPSMART_CONTENT && window.POPSMART_CONTENT.subjects) || [];
  wrap.innerHTML = '';
  if(subjects.length === 0){
    wrap.innerHTML = '<p>Subjects are loading…</p>';
    return;
  }
  // SEC-FIX: escape helper + color allowlist (stored-XSS hardening)
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function safeColor(c){ return /^#[0-9a-fA-F]{6}$/.test(c||'') ? c : '#7C3AED'; }

  subjects.forEach(function(sub){
    var s = skills[sub.id] || { xp: 0, level: 1 };
    var pct = Math.min(100, Math.round((s.xp % 100)));
    var cell = document.createElement('div');
    cell.className = 'ring-wrap';
    var C = 238.8;
    var ringAria = esc(sub.name) + ' progress level ' + esc(String(s.level)) + ', ' + pct + ' percent to next level';
    cell.innerHTML =
      '<svg class="ring" viewBox="0 0 92 92" role="img" aria-label="' + ringAria + '">' +
      '<circle class="ring-bg" cx="46" cy="46" r="38" fill="none" stroke-width="10"/>' +
      '<circle class="ring-fg" cx="46" cy="46" r="38" fill="none" stroke-width="10" ' +
      'stroke-dasharray="' + C + '" stroke-dashoffset="' + (C * (1 - pct / 100)) + '" ' +
      'style="stroke:' + safeColor(sub.color) + '"/>' +
      '</svg>' +
      '<span class="ring-label">' + esc(sub.name) + ' · Lv ' + esc(String(s.level)) + '</span>';
    wrap.appendChild(cell);
  });
}

/* ---------------- Boot ---------------- */
function onHashChange(){
  var route = currentRoute();
  render(route);
  // move focus to main for screen-reader users on nav
  var main = document.getElementById('main');
  if(main && document.activeElement && document.activeElement.classList.contains('nav-link')){
    main.focus({ preventScroll: true });
  }
}

function boot(){
  ROUTES.forEach(function(r){
    views[r] = document.getElementById('view-' + r);
  });
  navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav-link'));

  window.addEventListener('hashchange', onHashChange);

  // keyboard shortcut: 1-5 jump between sections
  document.addEventListener('keydown', function(e){
    if(e.target.matches('input, textarea, select')) return;
    var map = { '1': 'dashboard', '2': 'learn', '3': 'cards', '4': 'tracker', '5': 'checkpoint' };
    if(map[e.key]) navigate(map[e.key]);
  });

  renderHeader();
  renderRhythm();
  renderSkills();
  onHashChange();

  // engine hooks re-render shell when progress changes
  on('progress', function(){
    renderHeader();
    renderRhythm();
    renderSkills();
  });
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', boot);
}else{
  boot();
}

/* Public API for the learning engine + content packs */
window.POPSMART = {
  Store: Store,
  Router: { navigate: navigate, current: currentRoute },
  toast: toast,
  on: on,
  emit: emit,
  renderHeader: renderHeader,
  renderRhythm: renderRhythm,
  renderSkills: renderSkills,
  touchStreak: touchStreak,
  todayKey: todayKey,
  getFocusScore: getFocusScore
};

})();
