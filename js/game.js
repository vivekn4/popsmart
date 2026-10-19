/* ============================================================
   POPSMART — Game layer: global XP/levels, combos, daily quests,
   sticker collection. Vanilla JS, zero deps, offline-first.

   Storage (localStorage):
     popsmart.v1.gxp      -> {xp:number, level:number}
     popsmart.v1.comboBest -> number
     popsmart.v1.quests   -> {day:string, defs:[{id, target}], prog:{id:number}, done:[id]}
     popsmart.v1.stickers -> [{id, at}]
     popsmart.v1.qdone    -> number (total quests completed, all time)

   Hooks Engine 'change' events — no engine changes needed.
   UI renders into #game-level, #game-quests, #game-stickers
   on the dashboard; re-renders on POPSMART 'progress'.
   ============================================================ */
(function(){
'use strict';

var XP_PER_LEVEL = 150;
var LEVEL_NAMES = ['Rookie','Novice','Learner','Explorer','Student','Scholar',
  'Thinker','Brainiac','Whiz','Expert','Master','Sage','Genius','Prodigy',
  'Virtuoso','Champion','Titan','Legend','Mythic','Grandmaster'];

/* ---------------- storage ---------------- */
function store(){ return window.PopSmartStore || (window.POPSMART && POPSMART.Store); }
function sget(k, fb){ var s = store(); return s ? s.get(k, fb) : fb; }
function sset(k, v){ var s = store(); if (s) s.set(k, v); }
function dayKey(){
  var d = new Date();
  return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
}
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };

/* ---------------- global XP / levels ---------------- */
function gxp(){ return sget('gxp', { xp: 0, level: 1 }); }
function levelFor(xp){ return 1 + Math.floor(xp / XP_PER_LEVEL); }
function levelName(lv){
  if (lv <= LEVEL_NAMES.length) return LEVEL_NAMES[lv - 1];
  return 'Grandmaster ' + (lv - LEVEL_NAMES.length + 1);
}
function xpIntoLevel(xp){ return xp % XP_PER_LEVEL; }

function addXP(n, why){
  if (!n) return;
  var g = gxp();
  var before = g.level;
  g.xp += n;
  g.level = levelFor(g.xp);
  sset('gxp', g);
  if (g.level > before){
    if (window.Sound) Sound.play('levelup');
    toast('Level up! You are now ' + levelName(g.level) + ' (Lv ' + g.level + ').');
  } else if (why && window.POPSMART){
    // tiny floating feedback is handled by toasts at milestones only
  }
  emit();
  return g;
}

/* ---------------- combo ---------------- */
var combo = 0;
function comboMult(c){ return 1 + Math.min(c, 20) * 0.05; }
function onAnswer(correct){
  if (correct){
    combo++;
    var best = sget('comboBest', 0);
    if (combo > best) sset('comboBest', combo);
    if (combo === 3 || combo === 5 || combo === 8){
      if (window.Sound) Sound.play('combo');
      toast(combo + 'x combo! XP x' + comboMult(combo).toFixed(2));
    } else if (combo === 10 || combo === 15 || combo === 20){
      if (window.Sound) Sound.play('combo-big');
      addXP(25, 'combo');
      toast(combo + 'x MEGA combo! +25 bonus XP');
    }
  } else {
    combo = 0;
  }
}

/* ---------------- daily quests ---------------- */
var QUEST_POOL = [
  { id:'lessons-2',   name:'Double session',  desc:'Complete 2 lessons',            target:2,  ev:'lesson' },
  { id:'checkpoint-90',name:'Sharp shooter',  desc:'Score 90%+ on a checkpoint',    target:1,  ev:'checkpoint90' },
  { id:'review-15',   name:'Card shark',      desc:'Review 15 flashcards',           target:15, ev:'review' },
  { id:'cards-40',    name:'Marathon mind',   desc:'See 40 cards today',             target:40, ev:'card' },
  { id:'subjects-2',  name:'Polymath lite',   desc:'Learn in 2 subjects today',     target:2,  ev:'subject' },
  { id:'streak-keep', name:'Keep it burning',desc:'Complete any lesson',            target:1,  ev:'lesson' }
];
function hashStr(s){
  var h = 2166136261;
  for (var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}
function questsToday(){
  var day = dayKey();
  var q = sget('quests', null);
  if (q && q.day === day) return q;
  // deterministic 3-of-6 pick from the date
  var h = hashStr('popsmart-quests-' + day);
  var idx = [0,1,2,3,4,5];
  for (var i = idx.length - 1; i > 0; i--){
    h = (Math.imul(h, 1103515245) + 12345) & 0x7fffffff;
    var j = h % (i + 1);
    var t = idx[i]; idx[i] = idx[j]; idx[j] = t;
  }
  var defs = idx.slice(0, 3).map(function(k){
    var t = QUEST_POOL[k];
    return { id: t.id, name: t.name, desc: t.desc, target: t.target, ev: t.ev };
  });
  q = { day: day, defs: defs, prog: {}, done: [] };
  sset('quests', q);
  return q;
}
function questEvent(ev, n, extra){
  var q = questsToday();
  var changed = false;
  q.defs.forEach(function(d){
    if (d.ev !== ev || q.done.indexOf(d.id) >= 0) return;
    if (ev === 'subject'){
      // count distinct subjects via a set stored in prog
      var set = q.prog[d.id + ':set'] || {};
      if (extra && extra.skill) set[extra.skill] = 1;
      q.prog[d.id + ':set'] = set;
      q.prog[d.id] = Object.keys(set).length;
    } else {
      q.prog[d.id] = (q.prog[d.id] || 0) + (n || 1);
    }
    if (q.prog[d.id] >= d.target){
      q.done.push(d.id);
      var total = sget('qdone', 0) + 1;
      sset('qdone', total);
      if (window.Sound) Sound.play('quest');
      toast('Quest complete: ' + d.name + ' (+30 XP)');
      // quest XP awarded after save to avoid recursion
      setTimeout(function(){ addXP(30, 'quest'); }, 0);
    }
    changed = true;
  });
  if (changed){ sset('quests', q); emit(); }
}

/* ---------------- stickers ---------------- */
var STICKERS = [
  { id:'night-owl',   name:'Night Owl',   icon:'i-clock', desc:'Studied after 10pm.',            color:'#2B3A67' },
  { id:'early-bird',  name:'Early Bird',  icon:'i-star',  desc:'Studied before 7am.',             color:'#E67E22' },
  { id:'comeback',    name:'Comeback Kid',icon:'i-flame', desc:'Returned after 3+ days away.',   color:'#C0392B' },
  { id:'perfectionist',name:'Perfectionist',icon:'i-target',desc:'3 flawless checkpoints.',      color:'#7C3AED' },
  { id:'bookworm',    name:'Bookworm',    icon:'i-book',  desc:'5 lessons in one day.',          color:'#2980B9' },
  { id:'hat-trick',   name:'Hat Trick',   icon:'i-bolt',  desc:'3 checkpoints passed in a day.',color:'#D4AC0D' }
];
function getStickers(){ return sget('stickers', []); }
function hasSticker(id){ return getStickers().some(function(s){ return s.id === id; }); }
function giveSticker(id){
  if (hasSticker(id)) return;
  var list = getStickers();
  list.push({ id: id, at: Date.now() });
  sset('stickers', list);
  var def = null;
  STICKERS.forEach(function(s){ if (s.id === id) def = s; });
  if (window.Sound) Sound.play('chest');
  toast('New sticker: ' + (def ? def.name : id) + '!');
  emit();
}
function stickerDayKey(){
  var d = new Date();
  return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
}
function checkStickers(ctx){
  // ctx: {type:'lesson'|'checkpoint', at, perfect, skill}
  var hour = new Date(ctx.at).getHours();
  if (ctx.type === 'lesson'){
    if (hour >= 22) giveSticker('night-owl');
    if (hour < 7) giveSticker('early-bird');
    // comeback: last lesson 3+ days ago
    try{
      var last = sget('lastLessonAt', 0);
      if (last && (ctx.at - last) > 3 * 86400000) giveSticker('comeback');
      sset('lastLessonAt', ctx.at);
    }catch(e){}
    // bookworm: 5 lessons in one day
    try{
      var dk2 = stickerDayKey();
      var bw = sget('bookworm', { day: dk2, n: 0 });
      if (bw.day !== dk2) bw = { day: dk2, n: 0 };
      bw.n++;
      sset('bookworm', bw);
      if (bw.n >= 5) giveSticker('bookworm');
    }catch(e){}
  }
  if (ctx.type === 'checkpoint' && ctx.passed){
    if (ctx.perfect){
      var p = sget('perfectCount', 0) + 1;
      sset('perfectCount', p);
      if (p >= 3) giveSticker('perfectionist');
      if (window.Sound) Sound.play('perfect');
    }
    // hat-trick: checkpoints passed today
    var dk = stickerDayKey();
    var ht = sget('hatTrick', { day: dk, n: 0 });
    if (ht.day !== dk) ht = { day: dk, n: 0 };
    ht.n++;
    sset('hatTrick', ht);
    if (ht.n >= 3) giveSticker('hat-trick');
  }
}

/* ---------------- engine hooks ---------------- */
function skillOfPack(packId){
  // rewards.js builds the same index; reuse if available
  try{
    if (window.Rewards && Rewards.activity){
      var packs = window.POPSMART_PACKS || [];
      for (var i = 0; i < packs.length; i++)
        if (packs[i].id === packId) return packs[i].id;
    }
  }catch(e){}
  return packId;
}
function onLesson(s){
  if (s.quit){ combo = 0; return; }
  var cards = s.answered || 0;
  var correct = s.correct || 0;
  var mult = comboMult(combo);
  var xp = Math.round((20 + correct * 4) * mult);
  addXP(xp, 'lesson');
  questEvent('lesson', 1);
  questEvent('card', cards);
  if (s.packId) questEvent('subject', 1, { skill: skillOfPack(s.packId) });
  checkStickers({ type:'lesson', at: Date.now(), skill: skillOfPack(s.packId) });
  combo = 0; // new lesson, fresh combo
}
function onReview(){
  questEvent('review', 1);
  questEvent('card', 1);
}
function onCheckpoint(r){
  if (r.passed){
    var xp = 50 + Math.round((r.score || 0) * 50);
    addXP(xp, 'checkpoint');
    if ((r.score || 0) >= 0.9) questEvent('checkpoint90', 1);
  } else {
    addXP(10, 'checkpoint-try');
  }
  checkStickers({ type:'checkpoint', at: Date.now(), passed: !!r.passed, perfect: r.score >= 1 });
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

/* ---------------- ui ---------------- */
function toast(msg){
  try{
    if (window.POPSMART && POPSMART.toast) POPSMART.toast(msg);
  }catch(e){}
}
function emit(){
  renderWidgets();
  try{ if (window.POPSMART) POPSMART.emit('progress'); }catch(e){}
}
function $(id){ return document.getElementById(id); }

function renderWidgets(){
  renderLevel(); renderQuests(); renderStickers();
}
function renderLevel(){
  var el = $('game-level');
  if (!el) return;
  var g = gxp();
  var into = xpIntoLevel(g.xp);
  var pct = Math.round(into / XP_PER_LEVEL * 100);
  el.innerHTML =
    '<div class="g-level-top"><span class="g-level-num">Lv ' + g.level + '</span>' +
    '<span class="g-level-name">' + esc(levelName(g.level)) + '</span></div>' +
    '<div class="xp-bar" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">' +
    '<i style="width:' + pct + '%"></i></div>' +
    '<p class="g-level-sub">' + into + ' / ' + XP_PER_LEVEL + ' XP to ' + esc(levelName(g.level + 1)) + '</p>';
}
function renderQuests(){
  var el = $('game-quests');
  if (!el) return;
  var q = questsToday();
  var html = q.defs.map(function(d){
    var p = Math.min(q.prog[d.id] || 0, d.target);
    var done = q.done.indexOf(d.id) >= 0;
    var pct = Math.round(p / d.target * 100);
    return '<div class="quest' + (done ? ' done' : '') + '">' +
      '<div class="quest-top"><span class="quest-name">' + esc(d.name) + '</span>' +
      '<span class="quest-prog">' + p + '/' + d.target + '</span></div>' +
      '<p class="quest-desc">' + esc(d.desc) + '</p>' +
      '<div class="xp-bar slim"><i style="width:' + pct + '%"></i></div>' +
      (done ? '<span class="quest-tick">Done +30 XP</span>' : '') +
      '</div>';
  }).join('');
  el.innerHTML = html || '<p>No quests today — check back tomorrow.</p>';
}
function stickerById(id){
  for (var i = 0; i < STICKERS.length; i++) if (STICKERS[i].id === id) return STICKERS[i];
  return null;
}
function renderStickers(){
  var el = $('game-stickers');
  if (!el) return;
  var earned = {};
  getStickers().forEach(function(s){ earned[s.id] = true; });
  el.innerHTML = STICKERS.map(function(s, i){
    var has = !!earned[s.id];
    var rot = (i % 2 ? -1 : 1) * (3 + (i % 3) * 2);
    return '<span class="sticker' + (has ? '' : ' locked') + '" title="' + esc(s.name + ' — ' + s.desc) + '"' +
      ' style="--rot:' + rot + 'deg;--sc:' + s.color + '">' +
      '<svg aria-hidden="true"><use href="#' + s.icon + '"/></svg>' +
      '<span>' + esc(s.name) + '</span></span>';
  }).join('');
}

/* ---------------- public api (for rewards.js badge rules) ---------------- */
function api(){
  return {
    level: function(){ return gxp().level; },
    xp: function(){ return gxp().xp; },
    comboBest: function(){ return sget('comboBest', 0); },
    questsDone: function(){ return sget('qdone', 0); },
    stickerCount: function(){ return getStickers().length; },
    render: renderWidgets
  };
}

/* ---------------- boot ---------------- */
function boot(){
  questsToday(); // ensure today's set exists
  wireEngine();
  renderWidgets();
  if (window.POPSMART) POPSMART.on('progress', renderWidgets);
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', boot);
} else { boot(); }

window.Game = api();

})();
