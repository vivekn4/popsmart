/* ============================================================
   POPSMART — Rewards: badge engine, trophy wall, celebration
   overlay and achievement sharing. Vanilla JS, zero deps.

   Badges + activity live in localStorage:
     popsmart.v1.badges   -> [{id, at}]
     popsmart.v1.activity -> [{t, skill, at, ...}] (last 400)
     popsmart.v1.dailyCards -> {day, count}

   Hooks into Engine 'change' events — no engine changes needed.
   ============================================================ */
(function(){
'use strict';

var esc = function(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };

/* ---------------- badge definitions ---------------- */
var BADGES = [
  { id:'first-steps', name:'First Steps',   desc:'Complete your first lesson.',            icon:'i-star',  share:"I just earned the 'First Steps' badge on POPSMART — first lesson done. Small reps, big brain." },
  { id:'on-fire',     name:'On Fire',       desc:'Keep a 3-day learning streak.',           icon:'i-flame', share:"I just earned the 'On Fire' badge on POPSMART — a 3-day learning streak!" },
  { id:'unstoppable', name:'Unstoppable',   desc:'Keep a 7-day learning streak.',           icon:'i-flame', share:"7 days of learning in a row on POPSMART. 'Unstoppable' badge: earned." },
  { id:'legend',      name:'Legend',        desc:'Keep a 30-day learning streak.',          icon:'i-star',  share:"A 30-day learning streak on POPSMART. The 'Legend' badge is mine." },
  { id:'sharp',       name:'Sharp Shooter', desc:'Score 90% or more on a checkpoint.',      icon:'i-target',share:"I just scored 90%+ on a POPSMART checkpoint — 'Sharp Shooter' badge unlocked." },
  { id:'perfect',     name:'Perfect 100',   desc:'A flawless checkpoint. 100%.',            icon:'i-target',share:"A perfect 100% on a POPSMART checkpoint. 'Perfect 100' badge: mine." },
  { id:'scholar',     name:'Scholar',       desc:'Finish every level of one subject.',      icon:'i-book',  share:"I finished every level of a subject on POPSMART — 'Scholar' badge earned." },
  { id:'polymath',    name:'Polymath',      desc:'Start learning 5 different subjects.',    icon:'i-grid',  share:"Learning 5 subjects at once on POPSMART. 'Polymath' badge unlocked." },
  { id:'marathoner',  name:'Marathoner',    desc:'Blast through 50 cards in one day.',      icon:'i-bolt',  share:"50 cards in a single day on POPSMART. 'Marathoner' badge: earned." }
];
var byId = {};
BADGES.forEach(function(b){ byId[b.id] = b; });

/* ---------------- storage ---------------- */
function store(){ return window.PopSmartStore || (window.POPSMART && POPSMART.Store); }
function getBadges(){ var s = store(); return s ? s.get('badges', []) : []; }
function setBadges(list){ var s = store(); if (s) s.set('badges', list); }
function getActivity(){ var s = store(); return s ? s.get('activity', []) : []; }
function logActivity(entry){
  var s = store(); if (!s) return;
  var a = s.get('activity', []);
  entry.at = Date.now();
  a.push(entry);
  if (a.length > 400) a = a.slice(-400);
  s.set('activity', a);
}
function dayKey(){
  var d = new Date();
  return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
}
function bumpDailyCards(n){
  var s = store(); if (!s) return 0;
  var dc = s.get('dailyCards', { day: dayKey(), count: 0 });
  if (dc.day !== dayKey()) dc = { day: dayKey(), count: 0 };
  dc.count += n;
  s.set('dailyCards', dc);
  return dc.count;
}
function dailyCount(){
  var s = store(); if (!s) return 0;
  var dc = s.get('dailyCards', { day: dayKey(), count: 0 });
  return dc.day === dayKey() ? dc.count : 0;
}

/* ---------------- content indexes (built lazily) ---------------- */
var levelSkill = {}, levelCards = {}, cardSkill = {}, packLevels = {};
function buildIndexes(){
  var packs = window.POPSMART_PACKS || [];
  packs.forEach(function(p){
    packLevels[p.id] = (p.levels || []).length;
    (p.levels || []).forEach(function(lv){
      levelSkill[lv.id] = p.id;
      levelCards[lv.id] = (lv.cards || []).length;
      (lv.flashcards || []).forEach(function(fc, fi){
        cardSkill[lv.id + '-f' + fi] = p.id;
      });
    });
  });
}
function skillOfLevel(levelId){
  if (!levelSkill[levelId]) buildIndexes();
  return levelSkill[levelId] || null;
}
function cardsInLevel(levelId){
  if (!levelSkill[levelId]) buildIndexes();
  return levelCards[levelId] || 0;
}
function skillOfCard(cardId){
  if (!cardSkill[cardId]) buildIndexes();
  return cardSkill[cardId] || null;
}
function levelsInPack(packId){
  if (packLevels[packId] == null) buildIndexes();
  return packLevels[packId] || 0;
}

/* ---------------- badge awarding ---------------- */
var celebrateQueue = [];
var celebrating = false;

function has(id){
  return getBadges().some(function(b){ return b.id === id; });
}
function award(id, silent){
  if (has(id) || !byId[id]) return false;
  var list = getBadges();
  list.push({ id: id, at: Date.now() });
  setBadges(list);
  if (!silent){
    celebrateQueue.push(byId[id]);
    pumpQueue();
  }
  return true;
}

function currentStreak(){
  try{
    if (window.Adapt && Adapt.stats) return Adapt.stats().streak || 0;
  }catch(e){}
  return 0;
}

/* Evaluate every rule against current state. Returns newly earned badges. */
function checkAll(opts){
  var silent = !!(opts && opts.silent);
  var newly = [];
  var act = getActivity();
  var lessons = act.filter(function(e){ return e.t === 'lesson'; });
  var streak = currentStreak();

  function grant(id){ if (award(id, silent)) newly.push(byId[id]); }

  if (lessons.some(function(l){ return !l.quit; })) grant('first-steps');
  if (streak >= 3)  grant('on-fire');
  if (streak >= 7)  grant('unstoppable');
  if (streak >= 30) grant('legend');
  if (dailyCount() >= 50) grant('marathoner');

  // polymath: distinct subjects with at least one lesson
  var skills = {};
  lessons.forEach(function(l){ if (l.skill) skills[l.skill] = 1; });
  try{
    var prog = (window.Engine && Engine.progress) ? Engine.progress() : {};
    Object.keys(prog).forEach(function(k){
      if (prog[k] && prog[k].lessonsDone && prog[k].lessonsDone.length) skills[k] = 1;
    });
  }catch(e){}
  if (Object.keys(skills).length >= 5) grant('polymath');

  // scholar: every level of one subject finished
  try{
    var prog2 = (window.Engine && Engine.progress) ? Engine.progress() : {};
    Object.keys(prog2).forEach(function(k){
      var done = (prog2[k].lessonsDone || []).length;
      if (done > 0 && done >= levelsInPack(k)) grant('scholar');
    });
  }catch(e){}

  if (!silent && newly.length && window.POPSMART) POPSMART.emit('progress');
  return newly;
}

/* ---------------- engine event hooks ---------------- */
function onLesson(summary){
  var skill = skillOfLevel(summary.packId);
  logActivity({
    t: 'lesson', skill: skill, packId: summary.packId,
    correct: summary.correct, answered: summary.answered,
    quit: !!summary.quit, cards: cardsInLevel(summary.packId)
  });
  if (!summary.quit){
    bumpDailyCards(cardsInLevel(summary.packId) || summary.answered || 0);
    if (window.Sound) Sound.play('lesson-complete');
  }
  checkAll({});
}
function onReview(r){
  var skill = skillOfCard(r.id);
  logActivity({ t: 'review', skill: skill, cardId: r.id, quality: null });
  bumpDailyCards(1);
  checkAll({});
}
function onCheckpoint(res){
  logActivity({ t: 'checkpoint', skill: res.skill, score: res.score, passed: !!res.passed });
  // per-answer sounds already played during the quiz; only celebrate the win
  if (res.passed && window.Sound) Sound.play('checkpoint-pass');
  if (res.passed){
    if (res.score >= 1) award('perfect', false);
    else if (res.score >= 0.9) award('sharp', false);
  }
  checkAll({});
}
function onAnswer(correct){
  if (window.Sound) Sound.play(correct ? 'correct' : 'wrong');
}

function wireEngine(){
  if (!window.Engine || !Engine.on) return;
  Engine.on('change', function(d){
    if (!d) return;
    if (d.lessonSummary) onLesson(d.lessonSummary);
    else if (d.review) onReview(d.review);
    else if (d.checkpointResult) onCheckpoint(d.checkpointResult);
    else if (d.lastAnswer) onAnswer(!!d.lastAnswer.correct);
  });
}

/* ---------------- celebration overlay ---------------- */
function reducedMotion(){
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function ensureOverlay(){
  var ov = document.getElementById('celebrate');
  if (ov) return ov;
  ov = document.createElement('div');
  ov.id = 'celebrate';
  ov.className = 'celebrate-overlay';
  ov.hidden = true;
  ov.innerHTML =
    '<div class="confetti" id="confetti" aria-hidden="true"></div>' +
    '<div class="celebrate-card" role="dialog" aria-modal="true" aria-labelledby="cel-title">' +
      '<svg class="celebrate-icon" aria-hidden="true"><use id="cel-icon" href="#i-star"/></svg>' +
      '<p class="chip yellow">Badge earned</p>' +
      '<h2 id="cel-title"></h2>' +
      '<p id="cel-desc" class="lede"></p>' +
      '<div class="row spread mt">' +
        '<button class="btn primary" id="cel-share">Share</button>' +
        '<button class="btn" id="cel-close">Keep going</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(ov);
  var closeBtn = ov.querySelector('#cel-close');
  if (closeBtn) closeBtn.addEventListener('click', closeCelebration);
  var shareBtn = ov.querySelector('#cel-share');
  if (shareBtn) shareBtn.addEventListener('click', function(){
    var b = celebrating;
    if (b) shareBadge(b.id);
  });
  ov.addEventListener('keydown', function(e){
    if (e.key === 'Escape') closeCelebration();
  });
  return ov;
}
function confettiBurst(){
  if (reducedMotion()) return;
  var box = document.getElementById('confetti');
  if (!box) return;
  var colors = ['#FFE600','#7C3AED','#FF6B9D','#2EC4B6','#FF8C42','#FFFDF5'];
  box.innerHTML = '';
  for (var i = 0; i < 48; i++){
    var p = document.createElement('i');
    p.style.left = (Math.random() * 100) + '%';
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = (Math.random() * 0.6) + 's';
    p.style.transform = 'rotate(' + Math.floor(Math.random() * 360) + 'deg)';
    if (Math.random() > 0.5) p.style.borderRadius = '50%';
    box.appendChild(p);
  }
  setTimeout(function(){ box.innerHTML = ''; }, 3200);
}
function pumpQueue(){
  if (celebrating || !celebrateQueue.length) return;
  var badge = celebrateQueue.shift();
  celebrating = badge;
  var ov = ensureOverlay();
  ov.querySelector('#cel-icon').setAttribute('href', '#' + badge.icon);
  ov.querySelector('#cel-title').textContent = badge.name;
  ov.querySelector('#cel-desc').textContent = badge.desc;
  ov.hidden = false;
  confettiBurst();
  if (window.Sound) Sound.play(badge.id === 'on-fire' || badge.id === 'unstoppable' || badge.id === 'legend' ? 'streak' : 'badge');
  var closeBtn = ov.querySelector('#cel-close');
  if (closeBtn) closeBtn.focus();
}
function closeCelebration(){
  var ov = document.getElementById('celebrate');
  if (ov) ov.hidden = true;
  celebrating = false;
  setTimeout(pumpQueue, 250);
}

/* ---------------- sharing ---------------- */
function appUrl(){
  return location.href.split('#')[0];
}
function doShare(text){
  var url = appUrl();
  if (navigator.share){
    navigator.share({ title: 'POPSMART', text: text, url: url }).catch(function(){ /* dismissed */ });
    return;
  }
  var full = text + ' ' + url;
  function done(){
    if (window.POPSMART) POPSMART.toast('Copied — paste it anywhere.');
  }
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(full).then(done, function(){ fallbackCopy(full); done(); });
  } else { fallbackCopy(full); done(); }
}
function fallbackCopy(text){
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try{ document.execCommand('copy'); }catch(e){}
  ta.remove();
}
function shareBadge(id){
  var b = byId[id];
  if (b) doShare(b.share);
}
function shareProgress(){
  var n = getBadges().length;
  var streak = currentStreak();
  var text = n > 0
    ? "I've earned " + n + " badge" + (n === 1 ? '' : 's') + " on POPSMART" +
      (streak > 0 ? " with a " + streak + "-day learning streak" : "") +
      ". Small reps, big brain."
    : "I'm learning bite-size on POPSMART — streaks, badges, zero fluff. Small reps, big brain.";
  doShare(text);
}

/* ---------------- trophy rendering ---------------- */
function badgeCard(b, earnedAt){
  var inner = '<svg class="badge-star" aria-hidden="true"><use href="#' + b.icon + '"/></svg>' +
    '<span>' + esc(b.name) + '</span>';
  if (earnedAt){
    return '<span class="badge" title="' + esc(b.desc) + ' — earned ' + esc(fmtDate(earnedAt)) + '">' + inner + '</span>';
  }
  return '<span class="badge locked" title="' + esc(b.desc) + '">' + inner + '</span>';
}
function fmtDate(ts){
  var d = new Date(ts), now = new Date();
  var days = Math.floor((now - d) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return days + ' days ago';
  return d.toLocaleDateString();
}
/* compact shelf for the dashboard */
function renderShelf(el){
  if (!el) return;
  var earned = getBadges();
  if (!earned.length){
    el.innerHTML = '<p>Earn your first badge — finish one lesson.</p>';
    return;
  }
  el.innerHTML = earned.map(function(e){
    return badgeCard(byId[e.id] || { name: e.id, desc: '', icon: 'i-star' }, e.at);
  }).join('');
}
/* full wall for the tracker page: earned + locked */
function renderWall(el){
  if (!el) return;
  var earned = {};
  getBadges().forEach(function(e){ earned[e.id] = e.at; });
  el.innerHTML = BADGES.map(function(b){
    var at = earned[b.id];
    return badgeCard(b, at || null) +
      (at ? ' <button class="btn small" data-share-badge="' + esc(b.id) + '">Share</button>' : '');
  }).join('');
  Array.prototype.forEach.call(el.querySelectorAll('[data-share-badge]'), function(btn){
    btn.addEventListener('click', function(){ shareBadge(btn.getAttribute('data-share-badge')); });
  });
}

/* ---------------- per-subject rollup for the tracker ---------------- */
function subjectReport(skillId){
  var act = getActivity().filter(function(e){ return e.skill === skillId; });
  var prog = {};
  try{ prog = (window.Engine && Engine.progress) ? (Engine.progress()[skillId] || {}) : {}; }catch(e){}
  var lessons = act.filter(function(e){ return e.t === 'lesson'; });
  var reviews = act.filter(function(e){ return e.t === 'review'; });
  var cps = act.filter(function(e){ return e.t === 'checkpoint'; });
  var correct = 0, answered = 0;
  lessons.forEach(function(l){ correct += l.correct || 0; answered += l.answered || 0; });
  var cardsSeen = 0;
  lessons.forEach(function(l){ cardsSeen += l.cards || 0; });
  cardsSeen += reviews.length;
  var lastAt = 0;
  act.forEach(function(e){ if (e.at > lastAt) lastAt = e.at; });
  var acc = answered ? correct / answered : null;
  return {
    touched: lessons.length > 0 || reviews.length > 0 || cps.length > 0 ||
             ((prog.lessonsDone || []).length > 0),
    level: prog.level || 1,
    xp: prog.xp || 0,
    lessonsDone: (prog.lessonsDone || []).length,
    checkpointsPassed: cps.filter(function(c){ return c.passed; }).length,
    cardsSeen: cardsSeen,
    accuracy: acc,
    lastAt: lastAt
  };
}
function relTime(ts){
  if (!ts) return 'never';
  var mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + ' min ago';
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + ' hr ago';
  var days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return days + ' days ago';
  return new Date(ts).toLocaleDateString();
}

/* ---------------- boot ---------------- */
function boot(){
  buildIndexes();
  wireEngine();
  // silent retroactive award for returning users — no popups on load
  checkAll({ silent: true });
  var sp = document.getElementById('share-progress');
  if (sp) sp.addEventListener('click', shareProgress);
  if (window.POPSMART){
    // keep trophy views fresh when progress changes
    POPSMART.on('progress', function(){
      renderShelf(document.getElementById('badge-shelf'));
    });
  }
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', boot);
} else { boot(); }

window.Rewards = {
  all: function(){ return BADGES.slice(); },
  earned: getBadges,
  has: has,
  checkNow: function(){ return checkAll({}); },
  shareBadge: shareBadge,
  shareProgress: shareProgress,
  renderShelf: renderShelf,
  renderWall: renderWall,
  subjectReport: subjectReport,
  relTime: relTime,
  activity: getActivity
};

})();
