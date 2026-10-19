/* ============================================================
   POPSMART — Sound engine: procedural WebAudio dopamine.
   Zero audio files, zero libraries. Every sound is synthesized
   live and kept under half a second — a nudge, not a jingle.
   Toggle persisted at popsmart.v1.soundOn (default: on).
   ============================================================ */
(function(){
'use strict';

var KEY = 'popsmart.v1.soundOn';
var ctx = null, master = null;

function isOn(){
  try{
    var v = localStorage.getItem(KEY);
    return v === null ? true : v === '1';
  }catch(e){ return true; }
}
function setOn(v){
  try{ localStorage.setItem(KEY, v ? '1' : '0'); }catch(e){}
}

/* Lazily created on the first user-triggered sound, so we never
   spin up an AudioContext before a gesture. */
function ac(){
  if (ctx) return ctx;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.32;
  master.connect(ctx.destination);
  return ctx;
}

function tone(freq, delay, dur, type, vol, slideTo){
  var c = ac();
  if (!c) return;
  if (c.state === 'suspended'){ try{ c.resume(); }catch(e){} }
  var t = c.currentTime + delay;
  var o = c.createOscillator(), g = c.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.5, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

function arp(notes, gap, dur, type, vol){
  notes.forEach(function(f, i){ tone(f, i * gap, dur, type, vol); });
}

/* filtered noise burst: whooshes, pops, shimmer beds */
function noise(dur, vol, delay, freq, q){
  var c = ac();
  if (!c) return;
  if (c.state === 'suspended'){ try{ c.resume(); }catch(e){} }
  var t = c.currentTime + (delay || 0);
  var len = Math.max(1, Math.floor(c.sampleRate * dur));
  var buf = c.createBuffer(1, len, c.sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  var src = c.createBufferSource();
  src.buffer = buf;
  var flt = c.createBiquadFilter();
  flt.type = 'bandpass';
  flt.frequency.value = freq || 2000;
  flt.Q.value = q || 1;
  var g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.4, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt); flt.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.05);
}

var SOUNDS = {
  /* bright two-note chime: you got it */
  'correct': function(){
    tone(659.25, 0, 0.12, 'sine', 0.5);
    tone(880.00, 0.09, 0.20, 'sine', 0.5);
  },
  /* soft low thud: missed it, no drama */
  'wrong': function(){
    tone(180, 0, 0.20, 'triangle', 0.32, 110);
  },
  /* little fanfare arpeggio: badge earned */
  'badge': function(){
    arp([523.25, 659.25, 783.99, 1046.50], 0.09, 0.16, 'triangle', 0.5);
  },
  /* triumphant four-note jingle: checkpoint cleared */
  'checkpoint-pass': function(){
    arp([523.25, 659.25, 783.99, 1046.50], 0.11, 0.20, 'sine', 0.55);
    tone(1318.50, 0.44, 0.30, 'sine', 0.38);
  },
  /* satisfying pop: lesson wrapped */
  'lesson-complete': function(){
    tone(320, 0, 0.13, 'sine', 0.5, 720);
  },
  /* high sparkle: streak milestone */
  'streak': function(){
    arp([1318.50, 1567.98, 2093.00], 0.06, 0.10, 'sine', 0.30);
  },
  /* rising heroic fanfare: global level up */
  'levelup': function(){
    arp([392.00, 523.25, 659.25, 783.99], 0.10, 0.18, 'triangle', 0.5);
    tone(1046.50, 0.40, 0.35, 'triangle', 0.5);
    tone(1318.50, 0.52, 0.45, 'sine', 0.35);
  },
  /* escalating triplet: combo milestone hit */
  'combo': function(){
    arp([880.00, 1174.66, 1567.98], 0.05, 0.09, 'square', 0.16);
  },
  /* big combo: 10+ in a row */
  'combo-big': function(){
    arp([880.00, 1108.73, 1318.50, 1760.00], 0.06, 0.12, 'square', 0.18);
    noise(0.25, 0.15, 0.20, 5000, 0.8);
  },
  /* warm chime + sparkle: daily quest complete */
  'quest': function(){
    tone(523.25, 0, 0.18, 'sine', 0.5);
    tone(783.99, 0.10, 0.22, 'sine', 0.5);
    arp([1567.98, 2093.00], 0.07, 0.10, 'sine', 0.22);
  },
  /* tiny UI tap */
  'click': function(){
    tone(1200, 0, 0.05, 'sine', 0.25);
  },
  /* card flip whoosh */
  'flip': function(){
    noise(0.12, 0.30, 0, 3000, 1.2);
  },
  /* magical shimmer: sticker / chest unlock */
  'chest': function(){
    arp([1046.50, 1318.50, 1567.98, 2093.00, 2637.00], 0.07, 0.14, 'sine', 0.28);
    noise(0.5, 0.10, 0.1, 7000, 0.7);
  },
  /* grand fanfare: flawless round */
  'perfect': function(){
    arp([523.25, 659.25, 783.99, 1046.50, 1318.50], 0.09, 0.16, 'triangle', 0.5);
    tone(1567.98, 0.45, 0.40, 'sine', 0.35);
    tone(2093.00, 0.60, 0.50, 'sine', 0.28);
  }
};

function play(name){
  if (!isOn()) return;
  var fn = SOUNDS[name];
  if (fn){ try{ fn(); }catch(e){} }
}

/* ---- header toggle wiring (runs once the DOM is ready) ---- */
function wireToggle(){
  var btn = document.getElementById('sound-toggle');
  if (!btn) return;
  var useEl = btn.querySelector('use');
  function paint(){
    var on = isOn();
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? 'Sound effects on' : 'Sound effects off');
    if (useEl) useEl.setAttribute('href', on ? '#i-sound' : '#i-mute');
  }
  btn.addEventListener('click', function(){
    var now = !isOn();
    setOn(now);
    paint();
    if (now) play('correct'); // tiny confirmation blip
  });
  paint();
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', wireToggle);
} else { wireToggle(); }

window.Sound = {
  play: play,
  isOn: isOn,
  setOn: setOn,
  toggle: function(){ var v = !isOn(); setOn(v); return v; }
};

})();
