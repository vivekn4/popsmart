/* POPSMART views — renders engine state into the app shell. Vanilla JS. */
(function(){
'use strict';
var $ = function(s, r){ return (r||document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };
var esc = function(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
// SEC-FIX: color allowlist for style attributes (CSS injection hardening)
var safeColor = function(c){ return /^#[0-9a-fA-F]{6}$/.test(c||'') ? c : '#111111'; };

var PACKS = {};   // packId -> pack
var LEVELS = {};  // levelId -> {pack, level}

/* ---------- subject categories ---------- */
var CATEGORIES = ['All', 'Coding', 'Science', 'Life Skills', 'Arts'];
function categoryFor(packId){
  var id = String(packId||'').toLowerCase();
  if (/^(web|js|python|java|cpp|rust|go|ts|sql|html|css)$/.test(id)) return 'Coding';
  if (/^(spanish|french|german|italian|japanese|chinese|hindi)$/.test(id)) return 'Language';
  if (/^(physics|bio|biology|chem|chemistry|math|maths|algebra|geometry|astro|astronomy|geo|geography|nutrition|psych|psychology)$/.test(id)) return 'Science';
  if (/^(study|finance|money|budget|invest|productivity|career|firstaid|econ|economics|chess)$/.test(id)) return 'Life Skills';
  if (/^(cooking|music|photo|photography|history|garden|art|draw|paint|arthist|writing)$/.test(id)) return 'Arts';
  return 'Life Skills'; // default bucket for uncategorized subjects
}

/* ---------- learn-view filter state (survives re-render) ---------- */
var learnState = { q: '', cat: 'All' };

/* ---------- bootstrap: load content packs ---------- */
function boot(){
  // content is inlined in data/packs.js (works on file:// and http)
  var packs = window.POPSMART_PACKS || [];
  if (!packs.length) {
    $('#lesson-player').innerHTML = '<div class="card"><p>Could not load lessons.</p></div>';
    return Promise.resolve();
  }
  return Promise.resolve().then(function(){
    var allCards = [];
    packs.forEach(function(pack){
      PACKS[pack.id] = pack;
      // publish subjects for the shell
      (pack.levels||[]).forEach(function(lv, li){
        var levelId = lv.id;
        LEVELS[levelId] = { pack: pack, level: lv, ix: li };
        // flatten level into an engine lesson
        Engine.registerPack({
          id: levelId, skill: pack.id, title: lv.title,
          cards: (lv.cards||[]).map(function(c, ci){
            var copy = JSON.parse(JSON.stringify(c));
            copy.id = levelId + '-c' + ci;
            return copy;
          }),
          questions: [] // check-cards render inline
        });
        // extract flashcards
        (lv.flashcards||[]).forEach(function(fc, fi){
          allCards.push({
            id: levelId + '-f' + fi,
            front: fc.front, back: fc.back,
            pack: pack.id, level: levelId
          });
        });
      });
    });
    Engine.registerCards(allCards);
    window.POPSMART_CONTENT = {
      subjects: packs.map(function(p){
        return { id:p.id, name:p.title, color:p.color, icon:p.icon,
                 category: p.category || categoryFor(p.id) };
      })
    };
    if (window.POPSMART && POPSMART.renderSkills) POPSMART.renderSkills();
    renderAll();
    if (window.POPSMART) POPSMART.emit('progress');
  });
}

/* ---------- DASHBOARD ---------- */
function renderDashboard(){
  var stats = (window.Adapt && Adapt.stats) ? Adapt.stats() : null;
  var plan = (window.Adapt && Adapt.sessionPlan) ? Adapt.sessionPlan() : null;
  // streak
  var streak = 0;
  try { streak = (POPSMART.Store.get('streak', {count:0})||{}).count || 0; } catch(e){}
  $('#dash-streak').textContent = streak;
  $('#streak-count').textContent = streak;
  // focus score: rolling accuracy blended with consistency
  var focus = 0;
  if (stats && stats.accuracy != null) focus = Math.round(stats.accuracy * 100);
  $('#dash-focus').textContent = focus;
  $('#focus-score').textContent = focus;
  var ring = $('#focus-ring');
  if (ring) ring.style.strokeDashoffset = 238.8 * (1 - focus/100);
  $('#dash-focus-msg').textContent = focus === 0
    ? 'Do one lesson to light this up.'
    : focus >= 80 ? 'Locked in. Your brain is humming.'
    : focus >= 60 ? 'Solid. Keep the streak alive.'
    : 'Rough patch — shorter sessions will help.';
  // rhythm chart: single renderer lives in app.js (POPSMART.renderRhythm)
  if (window.POPSMART && POPSMART.renderRhythm) POPSMART.renderRhythm();
  if (plan && plan.suggestedHour != null && $('#rhythm-tip')) {
    $('#rhythm-tip').textContent = 'Your sharpest hour looks like ' + plan.suggestedHour + ':00. ' +
      (plan.reasons||[]).join(' ');
  }
  renderSkills();
  // trophy shelf (rewards module owns the rendering)
  if (window.Rewards) Rewards.renderShelf($('#badge-shelf'));
}

function renderSkills(){
  var wrap = $('#skill-rings');
  if (!wrap || !window.POPSMART_CONTENT) return;
  var prog = {};
  try { prog = Engine.progress ? Engine.progress() : {}; } catch(e){}
  wrap.innerHTML = window.POPSMART_CONTENT.subjects.map(function(s){
    var sk = (prog[s.id]||{xp:0, level:1});
    var pct = Math.min(100, (sk.xp % 100));
    // deterministic tilt per subject (no flicker on re-render)
    var tilt = (s.id.charCodeAt(0) + s.id.length) % 2 === 0 ? 'l' : 'r';
    return '<div class="card tilt-' + tilt + '">' +
      '<div class="card-title">' + esc(s.name) + '</div>' +
      '<div class="row"><div class="ring-wrap"><svg class="ring" viewBox="0 0 92 92">' +
      '<circle class="ring-bg" cx="46" cy="46" r="38" fill="none" stroke-width="10"/>' +
      '<circle class="ring-fg" cx="46" cy="46" r="38" fill="none" stroke-width="10" ' +
      'stroke-dasharray="238.8" stroke-dashoffset="' + (238.8*(1-pct/100)).toFixed(1) + '"/></svg>' +
      '<span class="ring-label">Lv ' + esc(String(sk.level)) + '</span></div>' +
      '<p>' + esc(String(sk.xp)) + ' XP · ' + pct + '% to next level</p></div></div>';
  }).join('');
}

/* ---------- LEARN ---------- */
function subjectStats(pack){
  var levels = pack.levels || [];
  var cards = 0;
  levels.forEach(function(lv){
    cards += (lv.cards||[]).length + (lv.flashcards||[]).length;
  });
  return { levels: levels.length, cards: cards };
}
function filteredSubjects(){
  var q = learnState.q.trim().toLowerCase();
  var cat = learnState.cat;
  return (window.POPSMART_CONTENT.subjects||[]).filter(function(s){
    if (cat !== 'All' && s.category !== cat) return false;
    if (q && s.name.toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
}
function renderLearn(){
  var picker = $('#subject-picker');
  if (!picker || !window.POPSMART_CONTENT) return;
  // search + category shell
  picker.innerHTML =
    '<div class="search-wrap">' +
      '<label class="visually-hidden" for="subject-search">Search subjects</label>' +
      '<input class="search-input" id="subject-search" type="search" ' +
        'placeholder="Search subjects..." autocomplete="off" ' +
        'value="' + esc(learnState.q) + '" aria-label="Search subjects">' +
      '<div class="cat-chips" role="group" aria-label="Filter by category">' +
        CATEGORIES.map(function(c){
          return '<button class="cat-chip" data-cat="' + esc(c) + '" ' +
            'aria-pressed="' + (learnState.cat===c?'true':'false') + '">' + esc(c) + '</button>';
        }).join('') +
      '</div>' +
    '</div>' +
    '<p class="result-count" id="subject-count" aria-live="polite"></p>' +
    '<div id="subject-grid" class="grid two" role="list" aria-label="Subjects"></div>';

  var input = $('#subject-search');
  input.addEventListener('input', function(){
    learnState.q = input.value;
    renderSubjectGrid();
  });
  // Escape clears the search
  input.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && input.value) { input.value=''; learnState.q=''; renderSubjectGrid(); }
  });
  $$('#subject-picker .cat-chip').forEach(function(chip){
    chip.addEventListener('click', function(){
      learnState.cat = chip.getAttribute('data-cat');
      $$('#subject-picker .cat-chip').forEach(function(c){
        c.setAttribute('aria-pressed', c===chip ? 'true' : 'false');
      });
      renderSubjectGrid();
    });
  });
  renderSubjectGrid();
}
function renderSubjectGrid(){
  var grid = $('#subject-grid');
  var count = $('#subject-count');
  if (!grid) return;
  var list = filteredSubjects();
  if (count) count.textContent = list.length + ' subject' + (list.length===1?'':'s');
  if (!list.length) {
    grid.innerHTML = '<div class="empty-state"><p>No subjects match — try another word.</p></div>';
    return;
  }
  grid.innerHTML = list.map(function(s){
    var pack = PACKS[s.id];
    if (!pack) return '';
    var st = subjectStats(pack);
    var levels = (pack.levels||[]).map(function(lv){
      return '<button class="btn small" data-level="' + esc(lv.id) + '" style="margin:4px">' +
        esc(lv.title) + '</button>';
    }).join('');
    return '<div class="card subject-card" role="listitem" style="border-top-color:' + safeColor(s.color) + '">' +
      '<div class="card-title">' + esc(s.name) + '</div>' +
      '<div class="subject-meta">' +
        '<span class="chip">' + st.levels + ' levels</span>' +
        '<span class="chip yellow">' + st.cards + ' cards</span>' +
        '<span class="chip">' + esc(s.category||'') + '</span>' +
      '</div>' + levels + '</div>';
  }).join('');
  $$('#subject-grid [data-level]').forEach(function(btn){
    btn.addEventListener('click', function(){ startLesson(btn.getAttribute('data-level')); });
  });
}

function cardHTML(item){
  if (item.type === 'text') {
    return '<div class="card"><div class="card-title">' + esc(item.title||'Read') + '</div>' +
      '<p>' + esc(item.body) + '</p></div>';
  }
  if (item.type === 'tip') {
    return '<div class="card tilt-r" style="background:var(--yellow)"><div class="card-title">Pro tip</div>' +
      '<p><strong>' + esc(item.body) + '</strong></p></div>';
  }
  if (item.type === 'example') {
    return '<div class="card tilt-l"><div class="card-title">Example</div>' +
      '<p><code>' + esc(item.body) + '</code></p></div>';
  }
  if (item.type === 'check') {
    return '<div class="card" style="background:var(--purple);color:#fff">' +
      '<div class="card-title" style="color:#fff">Quick check</div>' +
      '<p><strong>' + esc(item.q) + '</strong></p>' +
      '<div class="choices" data-qid="' + esc(item.id) + '">' +
      item.choices.map(function(ch, i){
        return '<button class="choice" data-ix="' + i + '">' + esc(ch) + '</button>';
      }).join('') + '</div><p class="explain" aria-live="polite" hidden></p></div>';
  }
  return '<div class="card"><p>' + esc(item.body||'') + '</p></div>';
}

function startLesson(levelId){
  var view = Engine.startLesson(levelId);
  renderLessonView(view);
  if (window.POPSMART) POPSMART.touchStreak();
}

function renderLessonView(view){
  var host = $('#lesson-player');
  if (!view || view.phase === 'done') {
    var summary = Engine.finishLesson(false);
    host.innerHTML = '<div class="card tilt-l"><div class="card-title">Lesson done!</div>' +
      '<p>You answered ' + summary.correct + '/' + summary.answered + ' right in ' +
      summary.minutes + ' min.</p>' +
      '<button class="btn primary" id="lesson-back">Back to subjects</button></div>';
    $('#lesson-back').addEventListener('click', function(){ host.innerHTML=''; renderLearn(); });
    if (window.POPSMART) POPSMART.emit('progress');
    return;
  }
  var item = view.item;
  host.innerHTML =
    '<div class="row mb"><span class="chip yellow">Card ' + (view.ix+1) + '/' + view.total + '</span></div>' +
    cardHTML(item) +
    '<div class="row mt"><button class="btn" id="lesson-quit">Quit</button>' +
    '<button class="btn primary" id="lesson-next">Next ' +
    '<svg width="18" height="18" aria-hidden="true"><use href="#i-arrow"/></svg></button></div>';

  $('#lesson-quit').addEventListener('click', function(){
    Engine.finishLesson(true); host.innerHTML=''; renderLearn();
  });
  var nextBtn = $('#lesson-next');
  if (item.type === 'check') {
    nextBtn.disabled = true;
    $$('#lesson-player .choice').forEach(function(chBtn){
      chBtn.addEventListener('click', function(){
        var ix = +chBtn.getAttribute('data-ix');
        // Engine.answer grades check-cards in the cards phase (and emits
        // the 'change' event that drives badges + sounds)
        var res = Engine.answer(item.id, ix);
        $$('#lesson-player .choice').forEach(function(b){ b.disabled = true; });
        chBtn.classList.add(res.correct ? 'correct' : 'wrong');
        var expl = $('#lesson-player .explain');
        if (expl) {
          expl.hidden = false;
          expl.innerHTML = (res.correct ? '<strong>Right.</strong> ' : '<strong>Not quite.</strong> ') +
            esc(res.explain || '');
        }
        nextBtn.disabled = false;
        if (window.POPSMART) POPSMART.emit('progress');
      });
    });
  }
  nextBtn.addEventListener('click', function(){
    var v = Engine.nextCard();
    renderLessonView(Engine.current());
  });
  // a11y: move focus to the new card heading so keyboard/SR users keep their place
  var heading = host.querySelector('.card-title');
  if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: false }); }
}

/* ---------- FLASHCARDS ---------- */
function renderCards(){
  var host = $('#card-player');
  var due = [];
  try { due = Engine.dueCards(50) || []; } catch(e){}
  $('#cards-due').textContent = due.length + ' due';
  if (!due.length) {
    host.innerHTML = '<div class="card tilt-r"><div class="card-title">All caught up</div>' +
      '<p>No cards due. The algorithm will bring them back right before you forget.</p></div>';
    return;
  }
  showCard(due[0], due);
}

function showCard(card, queue){
  var host = $('#card-player');
  host.innerHTML =
    '<div class="flashcard" id="fc" tabindex="0" role="button" aria-label="Flashcard: tap to flip">' +
    '<div class="flashcard-inner"><div class="flashcard-face flashcard-front"><p>' +
    esc(card.front) + '</p><p class="lede">Tap to flip</p></div>' +
    '<div class="flashcard-face flashcard-back"><p>' + esc(card.back) + '</p></div></div></div>' +
    '<div class="grade-row" hidden><p>How well did you know it?</p><div class="row">' +
    [0,1,2,3,4,5].map(function(q){
      var labels = ['Blank','Wrong','Hard','OK','Easy','Nailed it'];
      return '<button class="btn small" data-q="' + q + '">' + labels[q] + '</button>';
    }).join('') + '</div></div>';

  var fc = $('#fc'), flipped = false;
  function flip(){
    if (flipped) return; flipped = true;
    fc.classList.add('flipped');
    $('.grade-row', host).hidden = false;
  }
  fc.addEventListener('click', flip);
  fc.addEventListener('keydown', function(e){ if(e.key===' '||e.key==='Enter'){ e.preventDefault(); flip(); } });

  $$('.grade-row [data-q]', host).forEach(function(b){
    b.addEventListener('click', function(){
      Engine.reviewCard(card.id, +b.getAttribute('data-q'));
      if (window.POPSMART) { POPSMART.emit('progress'); POPSMART.touchStreak(); }
      var rest = queue.slice(1);
      if (rest.length) showCard(rest[0], rest);
      else renderCards();
    });
  });
}

/* ---------- CHECKPOINT ---------- */
function renderCheckpoint(){
  var host = $('#checkpoint-picker');
  if (!host || !window.POPSMART_CONTENT) return;
  host.innerHTML = window.POPSMART_CONTENT.subjects.map(function(s){
    var pack = PACKS[s.id];
    var btns = (pack.levels||[]).map(function(lv){
      return '<button class="btn small" data-cp="' + esc(lv.id) + '" style="margin:4px">' + esc(lv.title) + '</button>';
    }).join('');
    return '<div class="card"><div class="card-title">' + esc(s.name) + '</div>' + btns + '</div>';
  }).join('');
  $$('#checkpoint-picker [data-cp]').forEach(function(b){
    b.addEventListener('click', function(){ startCheckpoint(b.getAttribute('data-cp')); });
  });
}

function startCheckpoint(levelId){
  var entry = LEVELS[levelId];
  var qs = (entry.level.checkpoint.questions||[]).map(function(q, i){
    var c = JSON.parse(JSON.stringify(q)); c.id = levelId + '-q' + i; return c;
  });
  Engine.runCheckpoint(entry.pack.id, qs);
  renderCheckpointQ();
}

function renderCheckpointQ(){
  var host = $('#checkpoint-player');
  var view = Engine.currentCheckpoint ? Engine.currentCheckpoint() : null;
  if (!view) { // engine may expose differently; fall back to internal flow
    host.innerHTML = '<p>Checkpoint engine not ready.</p>'; return;
  }
  if (view.phase === 'done' || view.done) {
    var res = Engine.finishCheckpoint();
    var total = res.total || res.answered || 0, correct = Math.round(res.score * total);
    host.innerHTML = '<div class="card tilt-l"><div class="card-title">' +
      (res.passed ? 'Level up!' : 'Not yet') + '</div>' +
      '<p>Score: ' + Math.round(res.score*100) + '%</p>' +
      '<p>' + (res.passed ? 'Checkpoint cleared. Next level unlocked.' : 'Review the lesson and try again.') + '</p>' +
      '<button class="btn primary" id="cp-back">Back</button></div>';
    $('#cp-back').addEventListener('click', function(){ host.innerHTML=''; });
    if (window.POPSMART) POPSMART.emit('progress');
    return;
  }
  var q = view.item;
  host.innerHTML = '<div class="row mb"><span class="chip pink">Q ' + (view.ix+1) + '/' + view.total + '</span></div>' +
    '<div class="card"><p><strong>' + esc(q.q) + '</strong></p>' +
    '<div class="choices">' + q.choices.map(function(ch, i){
      return '<button class="choice" data-ix="' + i + '">' + esc(ch) + '</button>';
    }).join('') + '</div><p class="explain" aria-live="polite" hidden></p></div>';
  $$('#checkpoint-player .choice').forEach(function(b){
    b.addEventListener('click', function(){
      var r = Engine.answerCheckpoint(q.id, +b.getAttribute('data-ix'));
      $$('#checkpoint-player .choice').forEach(function(x){ x.disabled = true; });
      b.classList.add(r.correct ? 'correct' : 'wrong');
      var expl = $('#checkpoint-player .explain');
      expl.hidden = false;
      expl.innerHTML = (r.correct ? '<strong>Right.</strong> ' : '<strong>Nope.</strong> ') + esc(q.explain||'');
      setTimeout(renderCheckpointQ, 1400);
    });
  });
  // a11y: move focus to the new question so keyboard/SR users keep their place
  var qText = host.querySelector('.card strong');
  if (qText) { qText.setAttribute('tabindex', '-1'); qText.focus({ preventScroll: false }); }
}

/* ---------- TRACKER ---------- */
var trackerState = { sort: 'recent' };
var trackerWired = false;

function renderTracker(){
  var list = $('#tracker-list');
  var wall = $('#badge-wall');
  if (wall && window.Rewards) Rewards.renderWall(wall);
  if (!list || !window.POPSMART_CONTENT || !window.Rewards) return;

  var subjects = window.POPSMART_CONTENT.subjects || [];
  var rows = [];
  var untouched = 0;
  subjects.forEach(function(s){
    var rep = Rewards.subjectReport(s.id);
    if (!rep.touched){ untouched++; return; }
    rows.push({ s: s, rep: rep });
  });

  if (trackerState.sort === 'recent'){
    rows.sort(function(a, b){ return b.rep.lastAt - a.rep.lastAt; });
  } else {
    rows.sort(function(a, b){ return (b.rep.xp + b.rep.lessonsDone * 20) - (a.rep.xp + a.rep.lessonsDone * 20); });
  }

  var sr = $('#sort-recent'), sp = $('#sort-progress');
  if (sr) sr.setAttribute('aria-pressed', trackerState.sort === 'recent' ? 'true' : 'false');
  if (sp) sp.setAttribute('aria-pressed', trackerState.sort === 'progress' ? 'true' : 'false');

  if (!rows.length){
    list.innerHTML = '<div class="card tilt-l"><div class="card-title">Nothing tracked yet</div>' +
      '<p>Finish a lesson and your subjects will show up here with levels, XP and stats.</p>' +
      '<a class="btn primary" href="#/learn">Pick a subject</a></div>';
  } else {
    list.innerHTML = rows.map(function(r){
      var s = r.s, rep = r.rep;
      var pct = Math.min(100, rep.xp % 100);
      var accTxt = rep.accuracy == null ? '—' : Math.round(rep.accuracy * 100) + '%';
      return '<div class="card tracker-row" style="border-top:6px solid ' + safeColor(s.color) + '">' +
        '<div class="row spread"><div class="card-title">' + esc(s.name) + '</div>' +
        '<span class="chip purple">Lv ' + esc(String(rep.level)) + '</span></div>' +
        '<div class="xp-bar" role="img" aria-label="' + esc(s.name) + ' ' + pct + ' percent to next level">' +
          '<div class="xp-fill" style="width:' + pct + '%;background:' + safeColor(s.color) + '"></div></div>' +
        '<p class="lede">' + esc(String(rep.xp)) + ' XP</p>' +
        '<div class="stat-line">' +
          '<span class="chip">' + esc(String(rep.cardsSeen)) + ' cards seen</span>' +
          '<span class="chip yellow">' + esc(String(rep.lessonsDone)) + ' lessons</span>' +
          '<span class="chip teal">' + esc(String(rep.checkpointsPassed)) + ' checkpoints</span>' +
          '<span class="chip pink">' + accTxt + ' accuracy</span>' +
        '</div>' +
        '<p class="lede">Last studied: ' + esc(Rewards.relTime(rep.lastAt)) + '</p>' +
      '</div>';
    }).join('');
  }

  var more = $('#tracker-more');
  if (more){
    more.textContent = untouched > 0
      ? untouched + ' more subject' + (untouched === 1 ? '' : 's') + ' waiting — go explore.'
      : 'You have touched every subject. Polymath energy.';
  }

  if (!trackerWired){
    trackerWired = true;
    var rsr = $('#sort-recent'), rsp = $('#sort-progress');
    if (rsr) rsr.addEventListener('click', function(){ trackerState.sort = 'recent'; renderTracker(); });
    if (rsp) rsp.addEventListener('click', function(){ trackerState.sort = 'progress'; renderTracker(); });
  }
}

/* ---------- wire-up ---------- */
function renderAll(){
  renderDashboard(); renderLearn(); renderCards(); renderCheckpoint(); renderTracker();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function(){ boot().then(renderAll); });
} else { boot().then(renderAll); }

// re-render on route change + engine progress events
if (window.POPSMART) {
  POPSMART.on('route', renderAll);
  POPSMART.on('progress', function(){
    renderDashboard();
    if ($('#card-player')) renderCards();
    if ($('#tracker-list')) renderTracker();
  });
}
window.POPSMART_VIEWS = { renderAll: renderAll };
})();
