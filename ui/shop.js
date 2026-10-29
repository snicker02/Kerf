// Shop mode: big text and buttons for use at the bench, a strop reminder, hands-free
// voice commands ("next", "back", "repeat", "done", "stropped") and a screen that stays on.

const $ = id => document.getElementById(id);
const KEY = 'kerf:shop';

function loadState() {
  try { return { every: 20, last: Date.now(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { return { every: 20, last: Date.now() }; }
}

// parse a recognised phrase into a command; exported for tests
export function parseCommand(text) {
  const t = ' ' + String(text).toLowerCase().replace(/[^a-z ]+/g, ' ') + ' ';
  const has = (...w) => w.some(x => t.includes(' ' + x + ' '));
  if (has('stropped', 'strop done', 'done stropping', 'finished stropping')) return 'stropped';
  if (has('back', 'previous', 'go back', 'last step')) return 'back';
  if (has('repeat', 'again', 'read', 'say again')) return 'repeat';
  if (has('done', 'finished', 'check')) return 'done';
  if (has('next', 'forward', 'skip', 'continue')) return 'next';
  if (has('stop listening', 'quiet')) return 'mute';
  return null;
}

export class Shop {
  constructor({ guide, toast, onExit }) {
    this.guide = guide; this.toast = toast || (() => {}); this.onExit = onExit || (() => {});
    this.on = false; this.listening = false;
    this.st = loadState();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.SR = SR || null;
    $('strop-every').value = String(this.st.every);
    $('strop-every').onchange = e => { this.st.every = +e.target.value; this.st.last = Date.now(); this._save(); this._tick(); };
    $('strop-now').onclick = () => this.stropped();
    $('strop-ok').onclick = () => this.stropped();
    $('strop-snooze').onclick = () => { this.st.last = Date.now() - (this.st.every - 5) * 60000; this.alerted = false; this._save(); $('strop-alert').hidden = true; };
    $('shop-exit').onclick = () => this.exit();
    $('mic').onclick = () => (this.listening ? this.stopVoice() : this.startVoice());
    if (!SR) { $('mic').disabled = true; $('mic').title = 'This browser has no speech recognition. Try Chrome, Edge or Safari.'; }
    document.addEventListener('visibilitychange', () => { if (this.on && document.visibilityState === 'visible') this._wake(); });
  }

  _save() { try { localStorage.setItem(KEY, JSON.stringify({ every: this.st.every, last: this.st.last })); } catch (e) { /* ignore */ } }

  enter() {
    if (this.on) return;
    this.on = true;
    document.body.classList.add('shop');
    $('shopbar').hidden = false;
    $('g-shop').classList.add('on');
    if (Date.now() - this.st.last > 4 * 3600e3) { this.st.last = Date.now(); this._save(); } // a new session
    this._wake();
    this._timer = setInterval(() => this._tick(), 1000);
    this._tick();
    // speech needs a user gesture on some browsers; entering shop mode is one
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }
  exit() {
    if (!this.on) return;
    this.on = false;
    document.body.classList.remove('shop');
    $('shopbar').hidden = true; $('strop-alert').hidden = true;
    $('g-shop').classList.remove('on');
    clearInterval(this._timer);
    this.stopVoice();
    if (this.lock) { this.lock.release().catch(() => {}); this.lock = null; }
    this.onExit();
  }
  toggle() { this.on ? this.exit() : this.enter(); }

  async _wake() {
    try { if ('wakeLock' in navigator && !this.lock) { this.lock = await navigator.wakeLock.request('screen'); this.lock.addEventListener('release', () => { this.lock = null; }); } } catch (e) { /* not allowed: fine */ }
  }

  stropped() {
    this.st.last = Date.now(); this.alerted = false; this._save();
    $('strop-alert').hidden = true; this._tick();
    this.toast('Strop timer reset.');
  }

  _tick() {
    const box = $('strop-time');
    if (!this.st.every) { box.textContent = 'Strop: off'; return; }
    const left = this.st.last + this.st.every * 60000 - Date.now();
    if (left <= 0) {
      box.textContent = 'Strop now';
      box.classList.add('due');
      if (!this.alerted) { this.alerted = true; this._alert(); }
      return;
    }
    box.classList.remove('due');
    const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
    box.textContent = `Strop in ${m}:${String(s).padStart(2, '0')}`;
  }

  _alert() {
    $('strop-alert').hidden = false;
    this.chime();
    setTimeout(() => this.say('Time to strop your blades.'), 900);
  }

  chime() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ac = this.ac || new AC();
      const ac = this.ac, t0 = ac.currentTime + 0.02;
      [[880, 0], [1318.5, 0.18], [1760, 0.36]].forEach(([f, d]) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.25, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 1.2);
        o.connect(g).connect(ac.destination); o.start(t0 + d); o.stop(t0 + d + 1.3);
      });
    } catch (e) { /* audio blocked */ }
  }

  say(text) {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.98;
    window.speechSynthesis.speak(u);
  }

  startVoice() {
    if (!this.SR || this.listening) return;
    const r = new this.SR();
    r.continuous = true; r.interimResults = false; r.lang = navigator.language || 'en-US';
    r.onresult = e => {
      const res = e.results[e.results.length - 1];
      if (!res.isFinal) return;
      if (window.speechSynthesis && window.speechSynthesis.speaking) return; // don't obey our own voice
      this.command(parseCommand(res[0].transcript), res[0].transcript);
    };
    r.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.toast('Microphone permission was refused, so voice commands are off.'); this.stopVoice(); }
      else if (e.error === 'network') { this.toast('Voice commands need an internet connection in this browser. The rest of shop mode works offline.'); this.stopVoice(); }
    };
    r.onend = () => { if (this.listening) { try { r.start(); } catch (e) { /* already started */ } } };
    try { r.start(); } catch (e) { this.toast('Couldn’t start the microphone.'); return; }
    this.rec = r; this.listening = true;
    $('mic').classList.add('on'); $('mic').textContent = 'Voice: on';
    this.toast('Listening. Say “next”, “back”, “repeat”, “done” or “stropped”.');
  }
  stopVoice() {
    this.listening = false;
    if (this.rec) { try { this.rec.abort(); } catch (e) { /* ignore */ } this.rec = null; }
    $('mic').classList.remove('on'); $('mic').textContent = 'Voice: off';
  }

  command(c, heard) {
    const g = this.guide;
    if (!c) { $('heard').textContent = heard ? `Heard “${heard.trim()}”` : ''; return; }
    $('heard').textContent = `“${c}”`;
    if (c === 'next') g.next();
    else if (c === 'back') g.back();
    else if (c === 'done') g.done();
    else if (c === 'repeat') g.speak();
    else if (c === 'stropped') this.stropped();
    else if (c === 'mute') this.stopVoice();
    // read the new step aloud when moving by voice, so you needn't look up
    if ((c === 'next' || c === 'back' || c === 'done') && !g.speakOn) g.speak();
  }
}
