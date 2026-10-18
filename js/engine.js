/* =========================================================================
 * POPSMART — Learning + Adaptive Engine (vanilla JS, zero dependencies)
 * =========================================================================
 * Pure data/logic layer. NO UI code: the frontend owns rendering and calls
 * this module, subscribing to state changes via Engine.on('change', cb).
 *
 * Public API:
 *   Engine.registerPack(pack)        register one lesson-pack JSON object
 *   Engine.registerPacks(packs)      register many
 *   Engine.registerCards(cards)      register flashcard JSON objects
 *   Engine.startLesson(packId)       begin a lesson session -> session view
 *   Engine.current()                 current card/question of active session
 *   Engine.nextCard()                advance lesson cards -> {done, item}
 *   Engine.answer(qId, choiceIx)     answer lesson question -> {correct,...}
 *   Engine.finishLesson()            close session, record stats
 *   Engine.dueCards()                flashcards due for review (SM-2)
 *   Engine.reviewCard(id, quality)   grade a card 0-5, reschedule (SM-2)
 *   Engine.runCheckpoint(skillId, questions?)  begin quiz gate
 *   Engine.answerCheckpoint(qId, choiceIx)
 *   Engine.finishCheckpoint()        -> {score, passed, unlocked}
 *   Engine.on(evt, cb) / Engine.off(evt, cb)
 *   Engine.progress()                skill-level progress summary
 *   Adapt.record(event)              ingest a focus/habit event
 *   Adapt.sessionPlan()              -> {difficulty, cardCount, sessionMinutes, suggestedHour, reasons[]}
 *   Adapt.stats()                    raw focus + habit metrics (read-only copy)
 *
 * Lesson-pack JSON schema (content team):
 *   { id, title, subject, skill, difficulty:1-5,
 *     cards:[ {id, kind:'text'|'tip'|'example', body, code?} ],   // 3-6 cards
 *     questions:[ {id, prompt, choices:[...], answer:ix, explain?} ] } // 2-3
 * Flashcard JSON schema:
 *   { id, front, back, packId?, skill? }
 * Checkpoint questions reuse the lesson question shape.
 *
 * Storage: everything under localStorage keys `popsmart.v1.*`.
 * Falls back to in-memory storage when localStorage is unavailable (tests).
 * ========================================================================= */
(function (global) {
'use strict';

/* ------------------------------------------------------------------ utils */
function nowMs() { return Date.now(); }
function dayKey(d) { // local YYYY-MM-DD
  d = d || new Date();
  var m = d.getMonth() + 1, dd = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd;
}
function hourOf(d) { return (d || new Date()).getHours(); }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function median(xs) {
  if (!xs.length) return 0;
  var s = xs.slice().sort(function (a, b) { return a - b; });
  var m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function mean(xs) {
  if (!xs.length) return 0;
  return xs.reduce(function (a, b) { return a + b; }, 0) / xs.length;
}
function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }

/* ------------------------------------------------------------ storage */
/**
 * Namespaced, versioned key-value store. Falls back to memory when
 * localStorage is missing (Node tests) or throws (private mode / quota).
 */
var Store = (function () {
  var PREFIX = 'popsmart.v1.';
  var mem = {};
  function ls() {
    try {
      if (typeof global.localStorage === 'undefined') return null;
      return global.localStorage;
    } catch (e) { return null; }
  }
  return {
    prefix: PREFIX,
    get: function (key, fallback) {
      var k = PREFIX + key, raw = null;
      var s = ls();
      try { raw = s ? s.getItem(k) : (key in mem ? mem[key] : null); }
      catch (e) { raw = (key in mem ? mem[key] : null); }
      if (raw == null) return deepCopy(fallback);
      try { return JSON.parse(raw); } catch (e) { return deepCopy(fallback); }
    },
    set: function (key, val) {
      var k = PREFIX + key, raw;
      try { raw = JSON.stringify(val); } catch (e) { return false; }
      var s = ls();
      try {
        if (s) s.setItem(k, raw); else mem[key] = raw;
        return true;
      } catch (e) {
        try { mem[key] = raw; return true; } catch (e2) { return false; }
      }
    },
    clearAll: function () { // test/dev helper: wipes this namespace only
      var s = ls(), i, k;
      if (s) {
        try {
          var drop = [];
          for (i = 0; i < s.length; i++) { k = s.key(i); if (k && k.indexOf(PREFIX) === 0) drop.push(k); }
          drop.forEach(function (kk) { s.removeItem(kk); });
        } catch (e) {}
      }
      mem = {};
    }
  };
})();

/* ------------------------------------------------------- event emitter */
var listeners = {};
function emit(evt, data) {
  (listeners[evt] || []).slice().forEach(function (cb) {
    try { cb(deepCopy(data)); } catch (e) {}
  });
}

/* ------------------------------------------------------------ SM-2 ---- */
/**
 * Pure SM-2 step. Classic SuperMemo-2 scheduling.
 * @param {Object} st {ef, interval, reps} current card state
 * @param {number} quality 0-5 self-rating (5 = perfect recall)
 * @param {number} nowMs epoch ms for due-date computation
 * @returns {Object} new {ef, interval, reps, due}
 */
function sm2Step(st, quality, now) {
  var q = clamp(Math.round(quality), 0, 5);
  var ef = st.ef || 2.5, interval = st.interval || 0, reps = st.reps || 0;
  if (q < 3) { reps = 0; interval = 1; }
  else {
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 6;
    else interval = Math.round(interval * ef);
  }
  ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ef < 1.3) ef = 1.3;
  return { ef: +ef.toFixed(2), interval: interval, reps: reps, due: now + interval * 86400000 };
}

/* ------------------------------------------------------------ Adapt --- */
var EV_CAP = 500;      // bounded event log
var ROLL_N = 50;       // rolling window for accuracy / response time
var SESS_N = 20;       // session-length window

function defaultStats() {
  return {
    answers: [],        // [{correct:0|1, ms, hour, difficulty, at}]
    sessions: [],       // [{minutes, cards, quit:0|1, hour, at}]
    reviews: [],        // [{quality, ms, at}]
    checkpoints: [],    // [{skill, score, passed, at}]
    hourMap: {},        // hour -> {answers, correct, msTotal}
    streak: { days: [], count: 0, last: null },
    difficulty: 2,      // current adaptive level 1-5
    totalCardsSeen: 0
  };
}
/* SEC-FIX S4: shape validation on localStorage reads — corrupt/poisoned
   values fall back to defaults instead of throwing later. */
function validStats(s) {
  if (!s || typeof s !== 'object') return false;
  if (!Array.isArray(s.answers) || !Array.isArray(s.sessions) ||
      !Array.isArray(s.reviews) || !Array.isArray(s.checkpoints)) return false;
  if (!s.streak || !Array.isArray(s.streak.days) ||
      typeof s.streak.count !== 'number') return false;
  if (typeof s.difficulty !== 'number' || typeof s.totalCardsSeen !== 'number') return false;
  return true;
}
function loadStats() {
  var s = Store.get('stats', defaultStats());
  return validStats(s) ? s : defaultStats();
}
function saveStats(s) { Store.set('stats', s); }

function touchStreak(st) {
  var today = dayKey(), days = st.streak.days;
  if (days[days.length - 1] !== today) {
    days.push(today);
    if (days.length > 370) days = days.slice(-370);
  }
  // recompute consecutive count ending today/yesterday
  var count = 0, d = new Date();
  var set = {};
  days.forEach(function (k) { set[k] = 1; });
  var cursor = new Date(d);
  if (!set[dayKey(cursor)]) cursor.setDate(cursor.getDate() - 1); // allow today pending
  while (set[dayKey(cursor)]) { count++; cursor.setDate(cursor.getDate() - 1); }
  st.streak.count = count;
  st.streak.last = today;
}

var Adapt = {
  /**
   * Ingest one focus/habit event. Event shapes:
   *  {type:'answer', correct:bool, ms, difficulty?, hour?}
   *  {type:'card_view', ms}                    dwell on a lesson card
   *  {type:'session_start'|'session_end', minutes?, cards?, quit?}
   *  {type:'review', quality:0-5, ms?}
   *  {type:'checkpoint', skill, score:0-1, passed}
   */
  record: function (ev) {
    if (!ev || !ev.type) return;
    var st = loadStats(), at = nowMs(), h = (ev.hour != null ? ev.hour : hourOf());
    if (ev.type === 'answer') {
      st.answers.push({ correct: ev.correct ? 1 : 0, ms: +ev.ms || 0, hour: h, difficulty: ev.difficulty || st.difficulty, at: at });
      if (st.answers.length > EV_CAP) st.answers = st.answers.slice(-EV_CAP);
      var hm = st.hourMap[h] || (st.hourMap[h] = { answers: 0, correct: 0, msTotal: 0 });
      hm.answers++; if (ev.correct) hm.correct++; hm.msTotal += (+ev.ms || 0);
    } else if (ev.type === 'session_start' || ev.type === 'session_end') {
      if (ev.type === 'session_end') {
        st.sessions.push({ minutes: +ev.minutes || 0, cards: +ev.cards || 0, quit: ev.quit ? 1 : 0, hour: h, at: at });
        if (st.sessions.length > SESS_N * 3) st.sessions = st.sessions.slice(-SESS_N * 3);
      }
    } else if (ev.type === 'review') {
      st.reviews.push({ quality: clamp(Math.round(ev.quality), 0, 5), ms: +ev.ms || 0, at: at });
      if (st.reviews.length > EV_CAP) st.reviews = st.reviews.slice(-EV_CAP);
    } else if (ev.type === 'checkpoint') {
      st.checkpoints.push({ skill: ev.skill, score: +ev.score || 0, passed: !!ev.passed, at: at });
      if (st.checkpoints.length > 100) st.checkpoints = st.checkpoints.slice(-100);
    } else if (ev.type === 'card_view') {
      st.totalCardsSeen++;
    }
    touchStreak(st);
    saveStats(st);
    emit('adapt', { type: ev.type });
  },

  /** Rolling accuracy over the last ROLL_N answers (0-1). */
  accuracy: function () {
    var a = loadStats().answers.slice(-ROLL_N);
    if (!a.length) return null;
    return a.reduce(function (s, x) { return s + x.correct; }, 0) / a.length;
  },

  /** Median response time (ms) over the last ROLL_N answers. */
  medianResponseMs: function () {
    var a = loadStats().answers.slice(-ROLL_N).map(function (x) { return x.ms; }).filter(function (m) { return m > 0; });
    return a.length ? median(a) : null;
  },

  /** Quit rate over recent sessions (0-1). */
  quitRate: function () {
    var s = loadStats().sessions.slice(-SESS_N);
    if (!s.length) return 0;
    return s.reduce(function (n, x) { return n + x.quit; }, 0) / s.length;
  },

  /**
   * Per-hour performance: [{hour, accuracy, answers, avgMs}] sorted best-first.
   * Hours with <5 answers are excluded (not enough signal).
   */
  hourPerformance: function () {
    var hm = loadStats().hourMap, out = [];
    for (var h in hm) {
      if (!hm.hasOwnProperty(h)) continue;
      var e = hm[h];
      if (e.answers < 5) continue;
      out.push({ hour: +h, accuracy: e.correct / e.answers, answers: e.answers, avgMs: Math.round(e.msTotal / e.answers) });
    }
    out.sort(function (a, b) { return (b.accuracy - a.accuracy) || (b.answers - a.answers); });
    return out;
  },

  /**
   * Adaptive session plan.
   * Rules:
   *  - accuracy > 85% (min 10 answers)  -> difficulty +1 (cap 5)
   *  - accuracy < 60% (min 10 answers)   -> difficulty -1 (floor 1)
   *  - median response > 15s -> 6 cards; > 25s -> 4 cards (default 10)
   *  - quit rate > 30% -> shorter 5-min sessions (default 10)
   *  - suggestedHour: next upcoming hour among the user's top-3 productive hours
   * @returns {{difficulty:number, cardCount:number, sessionMinutes:number,
   *           suggestedHour:number|null, streak:number, reasons:string[]}}
   */
  sessionPlan: function () {
    var st = loadStats(), reasons = [];
    var difficulty = clamp(st.difficulty, 1, 5);
    var cardCount = 10, sessionMinutes = 10;

    var recent = st.answers.slice(-ROLL_N);
    if (recent.length >= 10) {
      var acc = recent.reduce(function (s, x) { return s + x.correct; }, 0) / recent.length;
      if (acc > 0.85 && difficulty < 5) { difficulty++; reasons.push('accuracy ' + Math.round(acc * 100) + '% > 85% — stepping difficulty up to ' + difficulty); }
      else if (acc < 0.60 && difficulty > 1) { difficulty--; reasons.push('accuracy ' + Math.round(acc * 100) + '% < 60% — easing difficulty down to ' + difficulty); }
      else reasons.push('accuracy ' + Math.round(acc * 100) + '% — holding difficulty at ' + difficulty);
    } else {
      reasons.push('only ' + recent.length + ' answers so far — holding difficulty at ' + difficulty);
    }

    var med = this.medianResponseMs();
    if (med != null) {
      if (med > 25000) { cardCount = 4; reasons.push('slow median response (' + Math.round(med / 1000) + 's) — trimming to 4 cards'); }
      else if (med > 15000) { cardCount = 6; reasons.push('slow median response (' + Math.round(med / 1000) + 's) — trimming to 6 cards'); }
    }

    var qr = this.quitRate();
    if (qr > 0.30) { sessionMinutes = 5; reasons.push('quit rate ' + Math.round(qr * 100) + '% — keeping sessions short (5 min)'); }

    var top = this.hourPerformance().slice(0, 3).map(function (e) { return e.hour; });
    var suggestedHour = null;
    if (top.length) {
      var nowH = hourOf(), best = null;
      top.forEach(function (hh) { // next upcoming productive hour (wraps to tomorrow)
        var delta = (hh - nowH + 24) % 24;
        if (best == null || delta < best.delta) best = { hour: hh, delta: delta };
      });
      suggestedHour = best.hour;
      reasons.push('your sharpest hours: ' + top.map(function (hh) { return hh + ':00'; }).join(', '));
    }

    st.difficulty = difficulty; // persist the adapted level
    saveStats(st);
    return { difficulty: difficulty, cardCount: cardCount, sessionMinutes: sessionMinutes, suggestedHour: suggestedHour, streak: st.streak.count, reasons: reasons };
  },

  /** Read-only snapshot of focus + habit metrics. */
  stats: function () {
    var st = loadStats();
    return {
      accuracy: this.accuracy(),
      medianResponseMs: this.medianResponseMs(),
      quitRate: this.quitRate(),
      streak: st.streak.count,
      difficulty: st.difficulty,
      hourPerformance: this.hourPerformance(),
      totalAnswers: st.answers.length,
      totalReviews: st.reviews.length,
      totalCheckpoints: st.checkpoints.length
    };
  },

  _defaultStats: defaultStats, // exposed for tests
  _sm2Step: sm2Step
};

/* ------------------------------------------------------------ Engine -- */
var packs = {};   // packId -> pack JSON
var cardDefs = {}; // cardId -> flashcard JSON
var active = null; // current lesson/checkpoint session

function getCardState(id) {
  var all = Store.get('cards', {});
  if (!all[id]) all[id] = { ef: 2.5, interval: 0, reps: 0, due: 0 };
  return { all: all, st: all[id] };
}

var Engine = {
  /* ---------------- registration ---------------- */
  /** @param {Object} pack lesson-pack JSON (see schema above) */
  registerPack: function (pack) {
    if (!pack || !pack.id) throw new Error('registerPack: pack.id required');
    packs[pack.id] = deepCopy(pack);
  },
  registerPacks: function (arr) { (arr || []).forEach(Engine.registerPack); },
  /** @param {Object[]} cards flashcard JSON objects */
  registerCards: function (arr) {
    (arr || []).forEach(function (c) { if (c && c.id) cardDefs[c.id] = deepCopy(c); });
  },

  /* ---------------- events ---------------- */
  on: function (evt, cb) { (listeners[evt] = listeners[evt] || []).push(cb); },
  off: function (evt, cb) {
    if (!listeners[evt]) return;
    listeners[evt] = listeners[evt].filter(function (f) { return f !== cb; });
  },

  /* ---------------- lessons ---------------- */
  /**
   * Begin a lesson. Emits 'change' with the session view.
   * @param {string} packId
   * @returns {Object} session view {packId, title, total, ix, item}
   */
  startLesson: function (packId) {
    var p = packs[packId];
    if (!p) throw new Error('startLesson: unknown pack ' + packId);
    active = {
      kind: 'lesson', packId: packId, ix: 0,
      cards: (p.cards || []).slice(),
      questions: (p.questions || []).slice(),
      qIx: 0, phase: 'cards', // 'cards' -> 'questions' -> 'done'
      startedAt: nowMs(), cardAt: nowMs(),
      answers: [], views: []
    };
    Adapt.record({ type: 'session_start' });
    var view = this.current();
    emit('change', { session: view });
    return view;
  },

  /** Current card or question of the active session (null when none). */
  current: function () {
    if (!active) return null;
    if (active.phase === 'cards') {
      var c = active.cards[active.ix];
      if (!c) { active.phase = 'questions'; return this.current(); }
      return { phase: 'cards', ix: active.ix, total: active.cards.length + active.questions.length, item: deepCopy(c) };
    }
    if (active.phase === 'questions') {
      var q = active.questions[active.qIx];
      if (!q) { active.phase = 'done'; return this.current(); }
      var qq = deepCopy(q); delete qq.answer; // never leak the answer key
      return { phase: 'questions', ix: active.cards.length + active.qIx, total: active.cards.length + active.questions.length, item: qq };
    }
    return { phase: 'done', ix: active.cards.length + active.questions.length, total: active.cards.length + active.questions.length, item: null };
  },

  /**
   * Advance past the current lesson card (records dwell time).
   * @returns {{done:boolean, item:Object|null}} next view
   */
  nextCard: function () {
    if (!active || active.kind !== 'lesson' || active.phase !== 'cards') return { done: true, item: null };
    var dwell = nowMs() - active.cardAt;
    var c = active.cards[active.ix];
    active.views.push({ cardId: c && c.id, ms: dwell });
    Adapt.record({ type: 'card_view', ms: dwell });
    active.ix++; active.cardAt = nowMs();
    if (active.ix >= active.cards.length) active.phase = 'questions';
    var view = this.current();
    emit('change', { session: view });
    return { done: active.phase === 'done', item: view.item };
  },

  /**
   * Answer the current lesson question.
   * Also grades inline check-cards (type:'check') while the lesson is in
   * the 'cards' phase — the frontend renders those inline and the Next
   * button stays disabled until they are answered.
   * @param {string} qId
   * @param {number} choiceIx
   * @returns {{correct:boolean, explain:string|null, done:boolean}}
   */
  answer: function (qId, choiceIx) {
    if (!active || active.kind !== 'lesson') throw new Error('answer: no active lesson');
    var q = null, isCheckCard = false;
    if (active.phase === 'questions') {
      q = active.questions[active.qIx];
      if (!q || q.id !== qId) throw new Error('answer: question mismatch (expected ' + (q && q.id) + ')');
    } else if (active.phase === 'cards') {
      var c = active.cards[active.ix];
      if (!c || c.id !== qId || c.type !== 'check') throw new Error('answer: no active question');
      q = { id: c.id, answer: c.answer, explain: c.explain };
      isCheckCard = true;
    } else {
      throw new Error('answer: no active question');
    }
    var ms = nowMs() - active.cardAt;
    var correct = choiceIx === q.answer;
    active.answers.push({ qId: qId, correct: correct, ms: ms });
    Adapt.record({ type: 'answer', correct: correct, ms: ms });
    if (!isCheckCard) {
      active.qIx++; active.cardAt = nowMs();
      if (active.qIx >= active.questions.length) active.phase = 'done';
    }
    var view = this.current();
    emit('change', { session: view, lastAnswer: { qId: qId, correct: correct } });
    return { correct: correct, explain: q.explain || null, done: active.phase === 'done' };
  },

  /**
   * Close the lesson session, persist progress + skill XP.
   * @param {boolean} [quit] true if the user abandoned the lesson
   * @returns {Object} summary {answered, correct, accuracy, minutes}
   */
  finishLesson: function (quit) {
    if (!active || active.kind !== 'lesson') return null;
    var minutes = (nowMs() - active.startedAt) / 60000;
    var answered = active.answers.length;
    var correct = active.answers.filter(function (a) { return a.correct; }).length;
    Adapt.record({ type: 'session_end', minutes: minutes, cards: active.views.length, quit: !!quit });
    var p = packs[active.packId];
    if (!quit && p && answered > 0) {
      var prog = Store.get('progress', {});
      var sk = prog[p.skill] || (prog[p.skill] = { xp: 0, lessonsDone: [], level: 1, unlocked: 1 });
      sk.xp += correct * 10 + (answered - correct) * 2;
      if (sk.lessonsDone.indexOf(active.packId) < 0) sk.lessonsDone.push(active.packId);
      // level-up: every 100 xp
      sk.level = 1 + Math.floor(sk.xp / 100);
      Store.set('progress', prog);
    }
    var summary = { packId: active.packId, answered: answered, correct: correct, accuracy: answered ? correct / answered : null, minutes: +minutes.toFixed(2), quit: !!quit };
    active = null;
    emit('change', { session: null, lessonSummary: summary });
    return summary;
  },

  /* ---------------- flashcards (SM-2) ---------------- */
  /**
   * Cards due for review now, soonest-due first. Registers unknown cards
   * with a fresh SM-2 state on first call.
   * @param {number} [limit] max cards to return (default 20)
   * @returns {Object[]} [{id, front, back, packId, skill, state}]
   */
  dueCards: function (limit) {
    limit = limit || 20;
    var now = nowMs(), found = Store.get('cards', {}), out = [];
    Object.keys(cardDefs).forEach(function (id) {
      if (!found[id]) found[id] = { ef: 2.5, interval: 0, reps: 0, due: 0 };
      if (found[id].due <= now) {
        var d = cardDefs[id];
        out.push({ id: id, front: d.front, back: d.back, packId: d.packId, skill: d.skill, state: deepCopy(found[id]) });
      }
    });
    Store.set('cards', found);
    out.sort(function (a, b) { return a.state.due - b.state.due; });
    return out.slice(0, limit);
  },

  /**
   * Grade a flashcard review (SM-2) and reschedule it.
   * @param {string} id card id
   * @param {number} quality 0-5 (5 = perfect recall)
   * @param {number} [ms] response time
   * @returns {Object} new card state {ef, interval, reps, due}
   */
  reviewCard: function (id, quality, ms) {
    if (!cardDefs[id]) throw new Error('reviewCard: unknown card ' + id);
    var g = getCardState(id), next = sm2Step(g.st, quality, nowMs());
    g.all[id] = next;
    Store.set('cards', g.all);
    Adapt.record({ type: 'review', quality: quality, ms: ms || 0 });
    emit('change', { review: { id: id, state: deepCopy(next) } });
    return deepCopy(next);
  },

  /* ---------------- checkpoints ---------------- */
  /**
   * Begin a quiz gate for a skill. Pass mark 70% unlocks the next level.
   * @param {string} skillId
   * @param {Object[]} [questions] overrides auto-collected skill questions
   * @returns {Object} session view
   */
  runCheckpoint: function (skillId, questions) {
    var qs = questions && questions.length ? questions :
      Object.keys(packs).reduce(function (acc, pid) {
        var p = packs[pid];
        if (p.skill === skillId && p.questions) {
          p.questions.forEach(function (q) { acc.push(deepCopy(q)); });
        }
        return acc;
      }, []);
    if (!qs.length) throw new Error('runCheckpoint: no questions for skill ' + skillId);
    // shuffle a max of 8
    for (var i = qs.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = qs[i]; qs[i] = qs[j]; qs[j] = t;
    }
    qs = qs.slice(0, 8);
    active = { kind: 'checkpoint', skillId: skillId, questions: qs, qIx: 0, startedAt: nowMs(), cardAt: nowMs(), answers: [] };
    Adapt.record({ type: 'session_start' });
    var v = this.currentCheckpoint();
    emit('change', { checkpoint: v });
    return v;
  },
  currentCheckpoint: function () {
    if (!active || active.kind !== 'checkpoint') return null;
    var q = active.questions[active.qIx];
    if (!q) return { phase: 'done', ix: active.qIx, total: active.questions.length, item: null };
    var qq = deepCopy(q); delete qq.answer;
    return { phase: 'questions', ix: active.qIx, total: active.questions.length, item: qq };
  },
  /** @returns {{correct:boolean, done:boolean}} */
  answerCheckpoint: function (qId, choiceIx) {
    if (!active || active.kind !== 'checkpoint') throw new Error('answerCheckpoint: no active checkpoint');
    var q = active.questions[active.qIx];
    if (!q || q.id !== qId) throw new Error('answerCheckpoint: question mismatch');
    var ms = nowMs() - active.cardAt;
    var correct = choiceIx === q.answer;
    active.answers.push({ qId: qId, correct: correct, ms: ms });
    Adapt.record({ type: 'answer', correct: correct, ms: ms });
    active.qIx++; active.cardAt = nowMs();
    var done = active.qIx >= active.questions.length;
    emit('change', { checkpoint: this.currentCheckpoint(), lastAnswer: { qId: qId, correct: correct } });
    return { correct: correct, done: done };
  },
  /**
   * Score the checkpoint. >= 70% passes and unlocks the next skill level.
   * @returns {{score:number, passed:boolean, unlocked:number}}
   */
  finishCheckpoint: function () {
    if (!active || active.kind !== 'checkpoint') throw new Error('finishCheckpoint: no active checkpoint');
    var n = active.answers.length, ok = active.answers.filter(function (a) { return a.correct; }).length;
    var score = n ? ok / n : 0, passed = score >= 0.70;
    var minutes = (nowMs() - active.startedAt) / 60000;
    Adapt.record({ type: 'checkpoint', skill: active.skillId, score: score, passed: passed });
    Adapt.record({ type: 'session_end', minutes: minutes, cards: n, quit: false });
    var prog = Store.get('progress', {});
    var sk = prog[active.skillId] || (prog[active.skillId] = { xp: 0, lessonsDone: [], level: 1, unlocked: 1 });
    if (passed) { sk.unlocked = Math.max(sk.unlocked, sk.level + 1); sk.xp += 50; sk.level = 1 + Math.floor(sk.xp / 100); }
    Store.set('progress', prog);
    var res = { skill: active.skillId, score: +score.toFixed(3), passed: passed, unlocked: sk.unlocked };
    active = null;
    emit('change', { checkpoint: null, checkpointResult: res });
    return res;
  },

  /** Skill-level progress summary: {skill: {xp, level, unlocked, lessonsDone[]}}. */
  progress: function () { return Store.get('progress', {}); },

  /** Abort the active session without recording completion. */
  abandon: function () {
    if (active && active.kind === 'lesson') return this.finishLesson(true);
    if (active && active.kind === 'checkpoint') {
      Adapt.record({ type: 'session_end', minutes: (nowMs() - active.startedAt) / 60000, cards: active.answers.length, quit: true });
      active = null; emit('change', { checkpoint: null });
      return { quit: true };
    }
    return null;
  },

  /* test/dev hooks (not part of the public contract) */
  _reset: function () { Store.clearAll(); active = null; packs = {}; cardDefs = {}; for (var k in listeners) delete listeners[k]; },
  _store: Store,
  _sm2: sm2Step,
  _adapt: Adapt
};

global.Engine = Engine;
global.Adapt = Adapt;
global.PopSmartStore = Store;

})(typeof window !== 'undefined' ? window : global);
