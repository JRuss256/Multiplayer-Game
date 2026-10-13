import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

// The public publishable key is designed for browser clients. Realtime topics
// are public room-code topics: share the code only with the people in your game.
const SUPABASE_URL = 'https://zwskozcbimqatqfauyuh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ZJd-P83kadZ1XyNo4WA23g__43fX1R5';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { params: { eventsPerSecond: 12 } },
});

const QUESTIONS = [
  { q: 'In which year did NASA’s Perseverance rover land on Mars?', a: ['2020', '2021', '2022', '2023'], correct: 1, source: 'https://www.nasa.gov/missions/mars-2020-perseverance/perseverance-rover/' },
  { q: 'In which year did NASA launch the Mars 2020 mission carrying the Perseverance rover?', a: ['2019', '2020', '2021', '2022'], correct: 1, source: 'https://science.nasa.gov/mission/mars-2020-perseverance/' },
  { q: 'Which space telescope released its first full-color images in 2022?', a: ['Hubble', 'Kepler', 'James Webb', 'Chandra'], correct: 2, source: 'https://science.nasa.gov/blogs/webb/2022/07/13/nasa-reveals-webb-telescopes-first-images-of-unseen-universe/' },
  { q: 'Who won the 2022 men’s FIFA World Cup?', a: ['France', 'Brazil', 'Argentina', 'Croatia'], correct: 2, source: 'https://www.fifa.com/en/articles/world-cup-finals-that-made-history' },
  { q: 'Which city hosted the 2024 Summer Olympics?', a: ['Tokyo', 'Paris', 'Los Angeles', 'Rome'], correct: 1, source: 'https://olympics.com/en/olympic-games/paris-2024' },
  { q: 'Who received the 2023 Nobel Peace Prize?', a: ['Narges Mohammadi', 'Malala Yousafzai', 'Maria Ressa', 'Sviatlana Tsikhanouskaya'], correct: 0, source: 'https://www.nobelprize.org/prizes/peace/2023/press-release/' },
  { q: 'Which album won the 2024 Grammy for Album of the Year?', a: ['GUTS', 'SOS', 'Midnights', 'The Record'], correct: 2, source: 'https://www.grammy.com/awards/categories/album-of-the-year/2024/' },
  { q: 'NASA’s Artemis I mission sent which spacecraft on an uncrewed trip around the Moon?', a: ['Orion', 'Dragon', 'Starliner', 'New Shepard'], correct: 0, source: 'https://www.nasa.gov/missions/artemis/artemis-1/' },
  { q: 'The 2023 film “Barbie” was directed by whom?', a: ['Greta Gerwig', 'Chloé Zhao', 'Sofia Coppola', 'Emerald Fennell'], correct: 0, source: 'https://www.warnerbros.com/movies/barbie' },
  { q: 'Which country won the 2023 FIFA Women’s World Cup?', a: ['England', 'Sweden', 'Spain', 'Australia'], correct: 2, source: 'https://www.fifa.com/en/tournaments/womens/womensworldcup/australia-new-zealand2023' },
  { q: 'The 2021 Nobel Prize in Physics recognized work on which broad topic?', a: ['Climate and complex systems', 'Quantum computers', 'Gravitational waves', 'Gene editing'], correct: 0, source: 'https://www.nobelprize.org/prizes/physics/2021/summary/' },
  { q: 'Which film won Best Picture at the 2023 Academy Awards?', a: ['The Fabelmans', 'Tár', 'Everything Everywhere All at Once', 'Top Gun: Maverick'], correct: 2, source: 'https://www.oscars.org/oscars/ceremonies/2023' },
];
const SYMBOLS = ['▲', '✦', '●', '◆'];
const SYMBOL_NAMES = ['triangle', 'star', 'circle', 'diamond'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS = 6;
const QUESTION_SECONDS = 18;
const CHALLENGE_SECONDS = 15;
const roomEl = document.querySelector('#room');
const homeEl = document.querySelector('#home');
let channel = null;
let isHost = false;
let roomCode = '';
const newPlayerId = () => globalThis.crypto?.randomUUID?.() || `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
// Player identity must be scoped to a tab. localStorage is shared by every
// tab on the same browser profile, which makes a second local playtest client
// overwrite the host's Realtime presence key.
let myId = sessionStorage.getItem('nightshift-player-id') || newPlayerId();
sessionStorage.setItem('nightshift-player-id', myId);
let myName = localStorage.getItem('nightshift-player-name') || '';
let game = null;
let roundTimer = null;
let revealTimer = null;
let sequenceRevealTimer = null;
let subscribed = false;
let hostPresent = false;
let soundOn = false;
let audio = null;
let masterGain = null;
let ambientGain = null;
let ambientNodes = [];
let musicTimer = null;
let ambienceStopTimer = null;
let musicNoteIndex = 0;
let localSequence = [];
let sequenceVisible = false;
let lastStateAt = 0;
let lastDrawnPhase = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const hasOnlyKeys = (value, allowed) => isRecord(value) && Object.keys(value).every(key => allowed.includes(key));
const validId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 80;
const validIndexMap = (value, players) => isRecord(value) && Object.keys(value).length <= MAX_PLAYERS && Object.entries(value).every(([id, n]) => players.has(id) && Number.isInteger(n) && n >= 0 && n <= 3);
const validBooleanMap = (value, players) => isRecord(value) && Object.keys(value).length <= MAX_PLAYERS && Object.entries(value).every(([id, locked]) => players.has(id) && typeof locked === 'boolean');
function isValidGameState(state) {
  const fields = ['hostId','phase','players','round','questionId','questions','answers','deadline','challenge','finaleCount','finaleAnswers','finaleLocked','winnerId','createdAt','updatedAt','lastResult','phaseLabel'];
  if (!hasOnlyKeys(state, fields) || !validId(state.hostId)) return false;
  if (!['lobby','tutorial','question','challenge','result','finale','over'].includes(state.phase)) return false;
  if (!Array.isArray(state.players) || state.players.length > MAX_PLAYERS || !Number.isInteger(state.round) || state.round < 0 || state.round > 6) return false;
  const ids = new Set();
  for (const player of state.players) {
    if (!hasOnlyKeys(player, ['id','name','hearts','alive','correct','escapeScore','connected']) || !validId(player.id) || ids.has(player.id)) return false;
    if (typeof player.name !== 'string' || player.name.length > 18 || !Number.isInteger(player.hearts) || player.hearts < 0 || player.hearts > 3) return false;
    if (typeof player.alive !== 'boolean' || !Number.isInteger(player.correct) || player.correct < 0 || player.correct > 20 || !Number.isInteger(player.escapeScore) || player.escapeScore < 0 || player.escapeScore > 8) return false;
    if (player.connected !== undefined && typeof player.connected !== 'boolean') return false;
    ids.add(player.id);
  }
  if (!Array.isArray(state.questions) || state.questions.length > QUESTIONS.length || state.questions.some(id => !Number.isInteger(id) || id < 0 || id >= QUESTIONS.length)) return false;
  if (state.questionId !== null && (!Number.isInteger(state.questionId) || state.questionId < 0 || state.questionId >= QUESTIONS.length)) return false;
  if (!validIndexMap(state.answers || {}, ids) || !validIndexMap(state.finaleAnswers || {}, ids)) return false;
  if (!validBooleanMap(state.finaleLocked || {}, ids)) return false;
  if (state.deadline !== null && (!Number.isFinite(state.deadline) || state.deadline < 0)) return false;
  if (!Number.isInteger(state.finaleCount) || state.finaleCount < 0 || state.finaleCount > 8) return false;
  if (state.winnerId !== null && (!validId(state.winnerId) || !ids.has(state.winnerId))) return false;
  if (!Number.isFinite(state.createdAt) || (state.updatedAt !== undefined && !Number.isFinite(state.updatedAt))) return false;
  if (state.phaseLabel !== undefined && (typeof state.phaseLabel !== 'string' || state.phaseLabel.length > 240)) return false;
  if (state.lastResult !== undefined) {
    const allowed = ['passed','failed','correct','wrong','escaped','missed','safe'];
    if (!isRecord(state.lastResult) || Object.keys(state.lastResult).length > MAX_PLAYERS || Object.entries(state.lastResult).some(([id,value]) => !ids.has(id) || !allowed.includes(value))) return false;
  }
  if (state.challenge !== null) {
    const challenge = state.challenge;
    if (!hasOnlyKeys(challenge, ['players','sequences','submitted','revealUntil','deadline']) || !Array.isArray(challenge.players) || challenge.players.length > MAX_PLAYERS || challenge.players.some(id => !ids.has(id))) return false;
    if (!isRecord(challenge.sequences) || Object.keys(challenge.sequences).length > MAX_PLAYERS || Object.entries(challenge.sequences).some(([id,seq]) => !challenge.players.includes(id) || !Array.isArray(seq) || seq.length !== 3 || seq.some(n => !Number.isInteger(n) || n < 0 || n > 3))) return false;
    if (!isRecord(challenge.submitted) || Object.keys(challenge.submitted).length > MAX_PLAYERS || Object.entries(challenge.submitted).some(([id,seq]) => !challenge.players.includes(id) || !Array.isArray(seq) || seq.length !== 3 || seq.some(n => !Number.isInteger(n) || n < 0 || n > 3))) return false;
    if (!Number.isFinite(challenge.revealUntil) || !Number.isFinite(challenge.deadline)) return false;
  }
  return true;
}
const myPlayer = () => game?.players?.find(p => p.id === myId);
const alivePlayers = () => (game?.players || []).filter(p => p.alive && p.hearts > 0);
const isActive = () => Boolean(myPlayer()?.alive && myPlayer()?.hearts > 0);
const playerName = (id) => game?.players?.find(p => p.id === id)?.name || 'Guest';
const randomCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const shuffled = (items) => [...items].sort(() => Math.random() - .5);
const toast = (text) => { let t = document.querySelector('.connection-toast'); if (!t) { t = document.createElement('div'); t.className = 'connection-toast'; document.body.append(t); } t.textContent = text; clearTimeout(t._timer); t._timer = setTimeout(() => t.remove(), 4200); };

function sound(type) {
  if (!soundOn) return;
  const context = ensureAudio();
  if (!context) return;
  const notes = type === 'right' ? [523.25, 659.25, 783.99] : type === 'wrong' ? [164.81, 110] : type === 'win' ? [392, 523.25, 659.25, 783.99] : type === 'transition' ? [293.66, 440] : [293.66];
  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator(); const gain = context.createGain();
    const start = context.currentTime + index * (type === 'win' ? .11 : .055);
    const duration = type === 'wrong' ? .3 : .22;
    oscillator.type = type === 'wrong' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    if (type === 'wrong') oscillator.frequency.exponentialRampToValueAtTime(Math.max(55, frequency * .62), start + duration);
    gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(type === 'tap' ? .018 : .028, start + .018); gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain); gain.connect(masterGain || context.destination); oscillator.start(start); oscillator.stop(start + duration + .02);
  });
}

function ensureAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audio) {
    audio = new AudioContextClass();
    masterGain = audio.createGain(); masterGain.gain.value = soundOn ? .85 : .0001; masterGain.connect(audio.destination);
  }
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  return audio;
}

function startAmbience() {
  const context = ensureAudio();
  if (!context) return;
  clearTimeout(ambienceStopTimer); ambienceStopTimer=null;
  masterGain.gain.cancelScheduledValues(context.currentTime); masterGain.gain.setTargetAtTime(.85,context.currentTime,.06);
  if (ambientNodes.length) {
    ambientGain.gain.cancelScheduledValues(context.currentTime); ambientGain.gain.setTargetAtTime(.055,context.currentTime,.08);
    return;
  }
  ambientGain = context.createGain(); ambientGain.gain.value = .055;
  const lowpass = context.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 720; lowpass.Q.value = .45;
  ambientGain.connect(lowpass); lowpass.connect(masterGain || context.destination); ambientNodes.push(lowpass);
  // Original oscillator-only bed: a soft low drone, a slow wavering mid tone,
  // and occasional bell-like notes. No recorded or third-party audio is used.
  [[55,'sine',.38],[82.41,'triangle',.16],[110,'sine',.11],[164.81,'sine',.045]].forEach(([frequency,type,level], index) => {
    const oscillator = context.createOscillator(); const voiceGain = context.createGain();
    oscillator.type = type; oscillator.frequency.value = frequency; voiceGain.gain.value = level;
    oscillator.connect(voiceGain); voiceGain.connect(ambientGain); oscillator.start(); ambientNodes.push(oscillator, voiceGain);
    if (index === 1) {
      const lfo = context.createOscillator(); const lfoGain = context.createGain();
      lfo.frequency.value = .06; lfoGain.gain.value = 3.5; lfo.connect(lfoGain); lfoGain.connect(oscillator.frequency); lfo.start(); ambientNodes.push(lfo, lfoGain);
    }
  });
  const motif = [220, 261.63, 196, 293.66, 220, 164.81];
  musicNoteIndex = 0;
  musicTimer = setInterval(() => {
    if (soundOn) playMusicNote(motif[musicNoteIndex++ % motif.length]);
  }, 3200);
}

function playMusicNote(frequency) {
  if (!audio || !soundOn) return;
  const oscillator = audio.createOscillator(); const gain = audio.createGain(); const now = audio.currentTime;
  oscillator.type = 'sine'; oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(.018, now + .65); gain.gain.exponentialRampToValueAtTime(.0001, now + 3.1);
  oscillator.connect(gain); gain.connect(masterGain || audio.destination); oscillator.start(now); oscillator.stop(now + 3.2);
}

function stopAmbience() {
  clearInterval(musicTimer); musicTimer = null;
  if (masterGain && audio) { masterGain.gain.cancelScheduledValues(audio.currentTime); masterGain.gain.setTargetAtTime(.0001,audio.currentTime,.035); }
  if (ambientGain && audio) { ambientGain.gain.cancelScheduledValues(audio.currentTime); ambientGain.gain.setTargetAtTime(.0001,audio.currentTime,.12); }
  clearTimeout(ambienceStopTimer);
  ambienceStopTimer=setTimeout(() => { ambientNodes.forEach(node => { try { node.stop?.(); node.disconnect(); } catch {} }); ambientNodes=[]; ambientGain=null; ambienceStopTimer=null; }, 600);
}

function initialGame(hostId) {
  return { hostId, phase: 'lobby', players: [], round: 0, questionId: null, questions: [], answers: {}, deadline: null, challenge: null, finaleCount: 0, finaleAnswers: {}, finaleLocked: {}, winnerId: null, createdAt: Date.now() };
}

function showHome() {
  homeEl.classList.remove('hidden'); roomEl.classList.add('hidden');
  document.querySelector('#connection-label').textContent = 'NIGHT WINDOW OPEN';
  document.querySelector('#home-error').textContent = '';
}

function draw() {
  if (!game) return;
  if (lastDrawnPhase !== game.phase) {
    if (game.phase !== 'challenge') { clearTimeout(sequenceRevealTimer); sequenceRevealTimer = null; }
    if (lastDrawnPhase !== null) sound(game.phase === 'over' ? 'win' : 'transition');
    lastDrawnPhase = game.phase;
  }
  homeEl.classList.add('hidden'); roomEl.classList.remove('hidden');
  document.querySelector('#connection-label').textContent = subscribed ? 'CONNECTED TO ROOM' : 'RECONNECTING';
  if (game.phase === 'lobby') return drawLobby();
  if (game.phase === 'tutorial') return drawTutorial();
  if (game.phase === 'question' || game.phase === 'finale') return drawQuestion();
  if (game.phase === 'challenge') return drawChallenge();
  if (game.phase === 'result') return drawResult();
  if (game.phase === 'over') return drawOver();
}

function commonTop() {
  const phase = game.phase === 'lobby' ? 'THE LOBBY' : game.phase === 'tutorial' ? 'HOW TO PLAY' : game.phase === 'challenge' ? 'THE HOUSE TEST' : game.phase === 'over' ? 'CHECKOUT' : game.phase === 'result' ? 'THE VERDICT' : game.phase === 'finale' ? 'THE EXIT RUN' : `QUESTION ${esc(game.round)} OF 5`;
  return `<div class="game-top"><span class="phase-label">${phase.toUpperCase()}</span><span class="room-code-label">ROOM <strong>${esc(roomCode)}</strong>${isHost && game.phase === 'lobby' ? '<button class="copy-code-button" data-action="copylink" type="button">COPY INVITE</button>' : ''}</span></div>`;
}

function roster() {
  const people = game.players || [];
  return `<aside class="player-panel"><div class="panel-title"><span>ON THE GUEST LIST</span><span class="lobby-player-count">${people.length}/${MAX_PLAYERS}</span></div><div class="player-list">${people.map(p => `<div class="player"><span class="player-avatar">${esc((p.name || '?')[0].toUpperCase())}</span><span class="player-name">${esc(p.name)}${p.id === game.hostId ? ' <span class="player-meta">· HOST</span>' : ''}${p.id === myId ? ' <span class="player-meta">· YOU</span>' : ''}</span><span class="hearts" aria-label="${esc(p.hearts)} hearts">${'♥'.repeat(Math.max(0,p.hearts))}<span class="heart-lost">${'♥'.repeat(Math.max(0,3-p.hearts))}</span></span></div>`).join('') || '<p class="waiting">The corridor is quiet.</p>'}</div></aside>`;
}

function hostButton(text, action) {
  return isHost ? `<div class="host-controls"><button class="button button-primary" data-action="${action}">${text}<span>→</span></button></div>` : '<p class="waiting">Waiting for the host.</p>';
}

function drawLobby() {
  const hasMe = Boolean(myPlayer());
  roomEl.innerHTML = `${commonTop()}<div class="game-grid"><section class="card"><div class="round-label">WELCOME, NIGHT GUEST</div><h2 class="lobby-title">Leave a light on.</h2><p class="lobby-copy">Five questions stand between you and the front door. Miss one and the house gives you a test. Pass, and keep your heart. Three hearts. Six guests. Only the living can leave.</p>${hasMe ? `<div class="host-banner">YOU ARE CHECKED IN AS ${esc(myName.toUpperCase())}${isHost ? ' · YOU OPENED THE HOTEL' : ''}</div>${hostButton('START THE NIGHT', 'start')}` : `<div class="lobby-tools"><input class="name-input" id="name-input" maxlength="18" autocomplete="nickname" placeholder="YOUR NAME" aria-label="Your name"><button class="button button-primary" data-action="checkin">CHECK IN <span>→</span></button></div>`}<p class="lobby-note">${isHost ? 'Invite 1–5 people with the room code above. Everyone plays from their own phone or laptop.' : 'Use the same room code on each device. No account or download needed.'}</p></section>${roster()}</div>`;
}

function drawTutorial() {
  const steps = [
    ['01', 'Answer together', 'Each question gives you 18 seconds. Lock in one answer; the room waits for the clock.'],
    ['02', 'Survive the mirror', 'Miss a question and watch three marks, then tap those same marks in order. Three taps submit. Fail the 15-second test and lose one of your three hearts.'],
    ['03', 'Find the exit', 'After five rounds, survivors enter the exit run. Pick an answer, then lock it in; change it any time before locking. When everyone locks, the question resolves. First to three correct escapes; after eight questions, the highest score wins.'],
  ];
  roomEl.innerHTML = `${commonTop()}<div class="game-grid"><section class="card tutorial-card"><div class="round-label">BEFORE THE NIGHT BEGINS</div><h2 class="lobby-title">Three things to know.</h2><div class="tutorial-steps">${steps.map(([number,title,copy])=>`<article class="tutorial-step"><span class="tutorial-number">${number}</span><div><h3>${title}</h3><p>${copy}</p></div></article>`).join('')}</div><p class="tutorial-audio-note">Sound is optional. Turn it on any time; the eerie music and effects are generated in your browser.</p>${hostButton('BEGIN THE FIRST QUESTION', 'begin')}</section>${roster()}</div>`;
}

function activeQuestion() { return QUESTIONS[game.questionId] || QUESTIONS[0]; }

function drawQuestion() {
  const q = activeQuestion(); const final = game.phase === 'finale';
  const seconds = Math.max(0, Math.ceil(((game.deadline || Date.now()) - Date.now()) / 1000));
  const selectedAnswer = final ? game.finaleAnswers?.[myId] : game.answers?.[myId];
  const locked = final ? Boolean(game.finaleLocked?.[myId]) : selectedAnswer !== undefined;
  const roundAnswers = final ? (game.finaleAnswers || {}) : (game.answers || {});
  const allAnswersIn = alivePlayers().length > 0 && alivePlayers().every(player => final ? game.finaleLocked?.[player.id] === true : roundAnswers[player.id] !== undefined);
  const canAnswer = isActive() && !locked;
  const prompt = final ? `<p class="finale-progress">${myPlayer()?.escapeScore || 0} / 3 CORRECT TO ESCAPE</p>` : `<div class="round-label">QUESTION ${esc(game.round)} · GET IT RIGHT TO KEEP YOUR HEART</div>`;
  const options = q.a.map((answer, i) => `<button class="answer ${selectedAnswer === i ? 'selected' : ''} ${final && locked ? 'locked' : ''}" data-action="answer" data-answer="${i}" ${canAnswer ? '' : 'disabled'}><span class="answer-key">0${i+1}</span><span>${esc(answer)}</span></button>`).join('');
  const stateLine = !isActive() ? 'YOU ARE OUT · WATCH THE LIVING' : final ? locked ? allAnswersIn ? 'EVERYONE LOCKED · THE HOUSE OPENS THE DOOR' : 'ANSWER LOCKED · WAITING FOR THE OTHER GUESTS' : selectedAnswer === undefined ? 'CHOOSE AN ANSWER, THEN LOCK IT IN' : 'ANSWER SELECTED · CHANGE IT ANYTIME BEFORE LOCKING' : locked && allAnswersIn ? 'EVERYONE LOCKED · WAITING FOR THE CLOCK' : locked ? 'ANSWER LOCKED · THE HOUSE IS LISTENING' : 'LOCK AN ANSWER BEFORE THE LIGHT GOES OUT';
  const lockControl = final && isActive() ? `<button class="button button-primary finale-lock" data-action="lock" ${selectedAnswer === undefined || locked ? 'disabled' : ''}>${locked ? 'ANSWER LOCKED' : 'LOCK IN ANSWER'}<span>${locked ? '✓' : '→'}</span></button>` : '';
  roomEl.innerHTML = `${commonTop()}<div class="game-grid"><section class="card"><progress class="question-progress" max="${QUESTION_SECONDS}" value="${seconds}" aria-label="Time remaining"></progress>${prompt}<h2 class="question">${esc(q.q)}</h2><div class="answers">${options}</div>${lockControl}<div class="question-foot"><span>${stateLine}</span><span class="timer"><span class="timer-number">${seconds}</span> SEC</span></div>${final && isHost && (myPlayer()?.escapeScore || 0) >= 3 ? hostButton('CHECK OUT', 'forcefinish') : ''}</section>${roster()}</div>`;
  clearInterval(roundTimer);
  roundTimer = setInterval(() => { const timer = roomEl.querySelector('.timer-number'); const progress = roomEl.querySelector('.question-progress'); if (timer && game?.deadline) { const remaining=Math.max(0,game.deadline-Date.now()); timer.textContent=String(Math.ceil(remaining/1000)); timer.closest('.timer')?.classList.toggle('urgent',remaining<5000); if(progress) progress.value=remaining/1000; } }, 100);
}

function drawChallenge() {
  clearInterval(roundTimer);
  const challenge = game.challenge || { players: [], sequences: {}, submitted: {} };
  sequenceVisible = Date.now() < (challenge.revealUntil || 0);
  const assigned = challenge.players.includes(myId) && isActive();
  const done = challenge.submitted?.[myId] !== undefined;
  const seconds = Math.max(0, Math.ceil(((challenge.deadline || Date.now()) - Date.now()) / 1000));
  const seq = challenge.sequences?.[myId] || [];
  const sequenceRow = seq.map((n,i) => `<span class="sequence-slot shown"><span class="slot-number">${i+1}</span><span class="glyph ${sequenceVisible ? 'current' : ''}" aria-label="${SYMBOL_NAMES[n]}">${sequenceVisible ? SYMBOLS[n] : '·'}</span></span>`).join('');
  const ownStatus = !assigned ? (isActive() ? 'SAFE FOR NOW · THE HOUSE TESTS THE PEOPLE WHO MISSED' : 'YOU ARE OUT · WATCH THE LIVING') : done ? 'TEST COMPLETE · WAIT FOR THE VERDICT' : sequenceVisible ? 'WATCH AND MEMORIZE THESE THREE MARKS' : 'TAP THE SAME MARKS IN THE SAME ORDER';
  const buttons = SYMBOLS.map((sym,i)=>`<button class="tile" data-action="sequence" data-symbol="${i}" ${assigned && !done && !sequenceVisible && localSequence.length<3 ? '' : 'disabled'} aria-label="Tap ${SYMBOL_NAMES[i]}"><span class="tile-symbol" aria-hidden="true">${sym}</span><span class="tile-label">${SYMBOL_NAMES[i]}</span></button>`).join('');
  const entered = Array.from({length:3},(_,i)=>`<span class="sequence-slot ${localSequence[i] !== undefined ? 'filled' : ''}"><span class="slot-number">${i+1}</span><span class="glyph" aria-label="${localSequence[i] !== undefined ? SYMBOL_NAMES[localSequence[i]] : `mark ${i+1} empty`}">${localSequence[i] !== undefined ? SYMBOLS[localSequence[i]] : '·'}</span></span>`).join('');
  const display = assigned ? `<div class="sequence-caption">${sequenceVisible ? 'WATCH THESE MARKS' : 'YOUR SEQUENCE'}</div><div class="sequence-slots" aria-live="polite">${sequenceVisible ? sequenceRow : entered}</div>` : '<span class="waiting">The house is testing the guests who missed.</span>';
  const instructions = assigned ? sequenceVisible ? 'Watch the three marks for a moment. They will disappear; then tap the matching buttons below in the same order.' : 'Tap the same three marks, in order, using the labeled buttons. Your taps fill the numbered boxes. Your third tap submits automatically.' : 'Only guests who missed the question take this test.';
  roomEl.innerHTML = `${commonTop()}<div class="game-grid"><section class="card"><progress class="question-progress" max="${CHALLENGE_SECONDS}" value="${seconds}" aria-label="Test time remaining"></progress><div class="round-label">THE MIRROR TEST · ${CHALLENGE_SECONDS} SECONDS</div><h2 class="challenge-title">Remember what the mirror shows.</h2><p class="challenge-copy">${instructions}</p>${display}${assigned && !done ? `<div class="tile-grid" role="group" aria-label="Choose a mark">${buttons}</div><p class="challenge-help">Each button has its symbol name. You get three taps; the third submits your answer. A correct order keeps your heart. A wrong order costs one.</p>` : ''}<div class="question-foot"><span>${ownStatus}</span><span class="timer"><span class="timer-number">${seconds}</span> SEC</span></div><p class="challenge-note">${localSequence.length}/3 MARKS ENTERED · ${Object.keys(challenge.submitted || {}).length}/${challenge.players.length} TESTS COMPLETE</p></section>${roster()}</div>`;
  clearTimeout(sequenceRevealTimer);
  if (assigned && !done && sequenceVisible) {
    sequenceRevealTimer = setTimeout(() => { sequenceVisible = false; sequenceRevealTimer = null; if (game?.phase === 'challenge') drawChallenge(); }, Math.max(30, challenge.revealUntil - Date.now()));
  }
  clearInterval(roundTimer);
  roundTimer = setInterval(() => { const timer = roomEl.querySelector('.timer-number'); const progress = roomEl.querySelector('.question-progress'); const remaining=Math.max(0,(challenge.deadline-Date.now())/1000); if(timer) { timer.textContent=String(Math.ceil(remaining)); timer.closest('.timer')?.classList.toggle('urgent',remaining<5); } if(progress) progress.value=remaining; }, 100);
}

function drawResult() {
  clearInterval(roundTimer);
  const q = activeQuestion(); const you = myPlayer();
  const gotIt = game.answers?.[myId] === q.correct;
  const resultLine = game.lastResult?.[myId];
  const headline = resultLine === 'passed' ? 'Still breathing.' : resultLine === 'failed' ? 'One less heartbeat.' : resultLine === 'correct' ? 'The house approves.' : resultLine === 'wrong' ? 'The hallway gets longer.' : resultLine === 'escaped' ? 'The lock turns.' : resultLine === 'missed' ? 'The door stays shut.' : gotIt ? 'The house approves.' : 'The answer is revealed.';
  const text = game.phaseLabel || (resultLine === 'passed' ? 'You remembered the marks. Your heart stays.' : resultLine === 'failed' ? `The marks were ${SYMBOLS[(game.challenge?.sequences?.[myId] || [])[0]] || 'hidden'} ${SYMBOLS[(game.challenge?.sequences?.[myId] || [])[1]] || 'in'} ${SYMBOLS[(game.challenge?.sequences?.[myId] || [])[2]] || 'the mirror'}.` : `The correct answer: ${q.a[q.correct]}.`);
  roomEl.innerHTML = `${commonTop()}<div class="game-grid"><section class="card"><div class="result-icon">${resultLine === 'failed' || resultLine === 'wrong' || resultLine === 'missed' ? '×' : '✓'}</div><h2 class="challenge-title">${headline}</h2><p class="result-copy">${esc(text)}</p><p class="result-answer">${resultLine === 'passed' || resultLine === 'failed' ? 'HEARTS LEFT: ' + (you?.hearts ?? 0) : 'THE HOTEL REMEMBERS EVERY ANSWER.'}</p><a class="source-link" href="${esc(q.source)}" target="_blank" rel="noreferrer">VERIFY THIS FACT ↗</a>${hostButton('CONTINUE', 'next')}</section>${roster()}</div>`;
}

function drawOver() {
  clearInterval(roundTimer);
  const winner = game.winnerId ? game.players.find(p => p.id === game.winnerId) : null;
  roomEl.innerHTML = `${commonTop()}<div class="game-grid"><section class="card"><div class="round-label">FRONT DESK · FINAL RECORD</div><h2 class="game-over-title">${winner ? `<span class="winner-name">${esc(winner.name)}</span><br>GOT OUT.` : 'THE HOTEL<br>KEEPS ITS GUESTS.'}</h2><p class="subtle">${winner ? 'The lights are on in the morning. The other guests are still in the hallway.' : 'No one found the exit this time. Some rooms have a way of keeping their stories.'}</p><p class="result-answer">ROOM ${esc(roomCode)} · THE SHIFT IS OVER</p><button class="button button-primary host-next" data-action="home">BACK TO THE FRONT DESK <span>↗</span></button></section>${roster()}</div>`;
}

function setPlayerName(name) {
  const normalized = name.trim().replace(/\s+/g,' ').slice(0,18);
  if (normalized.length < 2) throw new Error('Choose a name with at least 2 characters.');
  myName = normalized;
}

function publish() {
  if (!isHost || !channel || !game) return;
  game.updatedAt = Date.now();
  try { sessionStorage.setItem(`nightshift:${roomCode}`, JSON.stringify(game)); } catch { /* Browser storage can be unavailable in private modes. */ }
  channel.send({ type: 'broadcast', event: 'state', payload: { game } });
  lastStateAt = Date.now();
  draw();
}

async function emitIntent(action, payload = {}) {
  if (!channel || !subscribed) { toast('Reconnecting to the room. Try again in a moment.'); return; }
  if (isHost) return handleIntent(myId, action, payload);
  await channel.send({ type: 'broadcast', event: 'intent', payload: { id: myId, action, ...payload } });
}

function rememberPlayer(id, name) {
  if (!isHost || !game) return;
  let player = game.players.find(p=>p.id===id);
  if (player) { player.name = name; player.connected = true; publish(); return; }
  if (game.players.length >= MAX_PLAYERS) {
    if (id === myId) { toast('The hotel has reached its six guest limit.'); }
    else channel.send({ type:'broadcast', event:'full', payload:{id} });
    return;
  }
  if (game.phase !== 'lobby') return;
  game.players.push({ id, name, hearts: 3, alive: true, correct: 0, escapeScore: 0, connected: true });
  publish();
}

function handleIntent(id, action, payload) {
  if (!isHost || !game) return;
  const player = game.players.find(p=>p.id===id);
  if (action === 'join') {
    if (typeof payload.name !== 'string') return;
    if (game.players.some(p=>p.id===id)) { const existing=game.players.find(p=>p.id===id); existing.name=payload.name.trim().slice(0,18); existing.connected=true; publish(); return; }
    if (game.phase !== 'lobby') { channel.send({type:'broadcast',event:'started',payload:{id}}); return; }
    rememberPlayer(id, payload.name.trim().replace(/\s+/g,' ').slice(0,18)); return;
  }
  if (action === 'answer') {
    if (!player?.alive || player.hearts < 1 || !Number.isInteger(payload.answer)) return;
    if (game.phase === 'question' && game.answers[id] === undefined) {
      if (Date.now() >= game.deadline || payload.answer < 0 || payload.answer > 3) return;
      game.answers[id] = payload.answer;
      publish();
    } else if (game.phase === 'finale' && game.finaleLocked?.[id] !== true) {
      if (Date.now() >= game.deadline || payload.answer < 0 || payload.answer > 3) return;
      game.finaleAnswers[id] = payload.answer;
      publish();
    }
    return;
  }
  if (action === 'lock') {
    if (game.phase !== 'finale' || Date.now() >= game.deadline || !player?.alive || player.hearts < 1 || game.finaleAnswers?.[id] === undefined || game.finaleLocked?.[id] === true) return;
    game.finaleLocked = { ...(game.finaleLocked || {}), [id]: true };
    publish();
    const living = alivePlayers();
    if (living.length > 0 && living.every(guest => game.finaleLocked[guest.id] === true)) resolveFinaleQuestion();
    return;
  }
  if (action === 'sequence') {
    if (game.phase !== 'challenge' || !player?.alive || !game.challenge.players.includes(id) || game.challenge.submitted[id] !== undefined || !Array.isArray(payload.values) || payload.values.length !== 3 || payload.values.some(n=>!Number.isInteger(n)||n<0||n>3)) return;
    game.challenge.submitted[id] = payload.values;
    publish();
    return;
  }
  if (id !== game.hostId) return;
  if (action === 'start' && game.phase === 'lobby' && game.players.length >= 2) startGame();
  if (action === 'begin' && game.phase === 'tutorial' && game.players.length >= 2) { sound('transition'); beginQuestion(false); }
  if (action === 'checkin' && game.phase === 'lobby' && typeof payload.name === 'string') {
    const normalized = payload.name.trim().replace(/\s+/g,' ').slice(0,18);
    if (normalized.length < 2) { toast('Choose a name with at least 2 characters.'); return; }
    myName = normalized; rememberPlayer(myId,myName);
  }
  if (action === 'next' && game.phase === 'result') nextStage();
  if (action === 'forcefinish' && game.phase === 'finale') finishGame(game.players.filter(p=>p.alive).sort((a,b)=>b.escapeScore-a.escapeScore||b.correct-a.correct)[0]?.id);
}

function startGame() {
  if (game.players.length < 2) return toast('Invite at least one other guest to begin.');
  game.questions = shuffled(QUESTIONS.map((_,i)=>i));
  game.round = 1;
  game.phase = 'tutorial';
  game.deadline = null;
  game.answers = {};
  publish();
}

function beginQuestion(final) {
  if (final) {
    if (alivePlayers().length <= 1) return finishGame(alivePlayers()[0]?.id || null);
    if (game.finaleCount >= 8) {
      const best = alivePlayers().sort((a,b)=>b.escapeScore-a.escapeScore||b.correct-a.correct)[0];
      return finishGame(best?.id || null);
    }
    game.phase = 'finale';
    const next = game.questions[(5 + game.finaleCount) % game.questions.length];
    game.questionId = next;
    game.finaleAnswers = {};
    game.finaleLocked = {};
    game.deadline = Date.now() + QUESTION_SECONDS * 1000;
    game.finaleCount++;
    publish();
    scheduleDeadline(() => resolveFinaleQuestion(), QUESTION_SECONDS * 1000);
  } else {
    if (game.round > 5 || alivePlayers().length <= 1) return startFinale();
    game.phase = 'question';
    game.questionId = game.questions[game.round - 1];
    game.answers = {};
    game.deadline = Date.now() + QUESTION_SECONDS * 1000;
    publish();
    scheduleDeadline(() => resolveQuestion(), QUESTION_SECONDS * 1000);
  }
}

function scheduleDeadline(callback, delay) {
  clearTimeout(revealTimer); clearInterval(roundTimer);
  revealTimer = setTimeout(() => { if (isHost) callback(); }, delay + 80);
}

function resolveQuestion() {
  if (!isHost || game?.phase !== 'question') return;
  clearTimeout(revealTimer);
  const q = activeQuestion(); const missed = [];
  for (const p of alivePlayers()) {
    if (game.answers[p.id] === q.correct) p.correct++;
    else missed.push(p.id);
  }
  game.deadline = null;
  if (!missed.length) {
    game.phase = 'result'; game.lastResult = Object.fromEntries(alivePlayers().map(p=>[p.id,'correct'])); game.phaseLabel = `Everyone still standing got it. The correct answer was ${q.a[q.correct]}.`;
    publish(); setTimeout(()=>{ if (isHost && game.phase==='result') nextStage(); }, 2400); return;
  }
  const now = Date.now();
  game.phase = 'challenge';
  game.challenge = { players: missed, sequences: Object.fromEntries(missed.map(id=>[id,Array.from({length:3},()=>Math.floor(Math.random()*4))])), submitted: {}, revealUntil: now + 3200, deadline: now + CHALLENGE_SECONDS * 1000 };
  game.lastResult = {};
  sequenceVisible = false;
  publish();
  scheduleDeadline(()=>resolveChallenge(), CHALLENGE_SECONDS * 1000);
}

function resolveChallenge() {
  if (!isHost || game?.phase !== 'challenge') return;
  clearTimeout(revealTimer);
  const report = {};
  for (const id of game.challenge.players) {
    const p = game.players.find(x=>x.id===id); if (!p?.alive) continue;
    const seq = game.challenge.sequences[id];
    const response = game.challenge.submitted[id];
    const passed = Array.isArray(response) && response.length===3 && response.every((n,i)=>n===seq[i]);
    if (passed) report[id]='passed';
    else { p.hearts = Math.max(0,p.hearts-1); if (p.hearts===0) p.alive=false; report[id]='failed'; }
  }
  game.lastResult = { ...report, ...Object.fromEntries(alivePlayers().filter(p=>!report[p.id]).map(p=>[p.id,'safe'])) };
  game.phase = 'result'; game.challenge.submitted = game.challenge.submitted || {}; game.phaseLabel = `The correct answer was ${activeQuestion().a[activeQuestion().correct]}.`;
  publish();
  setTimeout(()=>{ if (isHost && game.phase==='result') nextStage(); }, 3000);
}

function nextStage() {
  if (!isHost) return;
  game.phaseLabel = '';
  game.lastResult = {};
  game.round++;
  if (game.round > 5 || alivePlayers().length <= 1) startFinale();
  else beginQuestion(false);
}

function startFinale() {
  const living = alivePlayers();
  if (living.length <= 1) return finishGame(living[0]?.id || null);
  game.finaleCount = 0;
  beginQuestion(true);
}

function resolveFinaleQuestion() {
  if (!isHost || game?.phase !== 'finale') return;
  clearTimeout(revealTimer);
  const q = activeQuestion(); const report={};
  for (const p of alivePlayers()) {
    const ans=game.finaleAnswers[p.id];
    if (ans===q.correct) { p.correct++; p.escapeScore++; report[p.id]='escaped'; }
    else report[p.id]=ans===undefined?'missed':'wrong';
  }
  const winner=alivePlayers().filter(p=>p.escapeScore>=3).sort((a,b)=>a.escapeScore-b.escapeScore)[0];
  game.lastResult=report; game.deadline=null;
  if (winner) { game.winnerId=winner.id; game.phase='over'; game.phaseLabel='A guest reached the exit.'; publish(); return; }
  game.phase='result'; game.phaseLabel=`Correct answer: ${q.a[q.correct]}. The lock is still turning.`; publish();
  setTimeout(()=>{ if (isHost && game.phase==='result') beginQuestion(true); }, 1500);
}

function finishGame(winnerId) { game.winnerId=winnerId || null; game.phase='over'; game.deadline=null; publish(); }

function connect(code, host) {
  roomCode = code; isHost = host; subscribed = false; game = host ? (game?.hostId === myId ? game : initialGame(myId)) : null;
  channel = supabase.channel(`nightshift:${code}`, { config: { broadcast: { self: false } } });
  channel.on('broadcast',{event:'state'},({payload})=>{
    if (host || !isValidGameState(payload?.game)) return;
    if (game?.hostId && game.hostId !== payload.game.hostId) return;
    // A state response also confirms the room is live; Presence sync can lag
    // or be missed during a reconnect.
    hostPresent = true;
    if (payload.game.updatedAt && payload.game.updatedAt < lastStateAt) return;
    if (game?.phase !== payload.game.phase || game?.challenge?.deadline !== payload.game.challenge?.deadline) localSequence=[];
    game=payload.game; lastStateAt=game.updatedAt||Date.now();
    try { sessionStorage.setItem(`nightshift:${roomCode}`, JSON.stringify(game)); } catch { /* Optional reconnect cache. */ }
    if (game.phase==='challenge') sequenceVisible=Date.now()<(game.challenge?.revealUntil||0); else sequenceVisible=false;
    draw();
  });
  channel.on('broadcast',{event:'intent'},({payload})=>{
    if(!host||!payload?.id||payload.id===myId) return;
    if(payload.action==='sync'){
      channel.send({type:'broadcast',event:'state',payload:{game}});
      return;
    }
    if(payload.action==='join'){
      const existing=game?.players?.find(p=>p.id===payload.id);
      if(existing){existing.name=String(payload.name||existing.name).trim().slice(0,18);existing.connected=true;publish();return;}
      if(game?.phase!=='lobby'){channel.send({type:'broadcast',event:'started',payload:{id:payload.id}});return;}
      handleIntent(payload.id,'join',payload);return;
    }
    handleIntent(payload.id,payload.action,payload);
  });
  channel.on('broadcast',{event:'full'},({payload})=>{ if(payload?.id===myId){ toast('This room already has six guests.'); leaveRoom(); } });
  channel.on('broadcast',{event:'started'},({payload})=>{if(payload?.id===myId){toast('This night has already started.');}});
  channel.subscribe(async status=>{
    if(status==='SUBSCRIBED'){
      subscribed=true; draw();
    if(host){
        if(game.phase==='question' && game.deadline) scheduleDeadline(resolveQuestion,Math.max(0,game.deadline-Date.now()));
        if(game.phase==='finale' && game.deadline) scheduleDeadline(resolveFinaleQuestion,Math.max(0,game.deadline-Date.now()));
        if(game.phase==='challenge' && game.challenge?.deadline) scheduleDeadline(resolveChallenge,Math.max(0,game.challenge.deadline-Date.now()));
      } else if (myName) { await channel.send({type:'broadcast',event:'intent',payload:{id:myId,action:'join',name:myName}}); }
      else await channel.send({type:'broadcast',event:'intent',payload:{id:myId,action:'sync'}});
    }
    if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){subscribed=false;toast('The connection dropped. Reconnecting…');draw();}
  });
  draw();
}

async function createRoom() {
  document.querySelector('#home-error').textContent='';
  try {
    game=null;
    roomCode=randomCode();
    history.replaceState(null,'',`#room=${roomCode}`);
    connect(roomCode,true);
  } catch (e) { document.querySelector('#home-error').textContent='Could not open the hotel. Check your connection and try again.'; }
}

async function joinRoom() {
  document.querySelector('#home-error').textContent='';
  const code=document.querySelector('#room-input').value.trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{5}$/.test(code)) { document.querySelector('#home-error').textContent='Enter the 5-character room code shown by your host.'; return; }
  roomCode=code; isHost=false; game=initialGame('');
  // Ask for a name before connecting so the host can place the guest in the lobby.
  myName='';
  history.replaceState(null,'',`#room=${roomCode}`);
  hostPresent=false;
  connect(roomCode,false);
  const enteredCode=roomCode;
  setTimeout(()=>{
    if(!isHost && roomCode===enteredCode && channel && !hostPresent){
      leaveRoom();
      document.querySelector('#home-error').textContent='That room is not open. Check the code and ask the host to open the hotel again.';
    }
  },5000);
}

function leaveRoom() {
  clearInterval(roundTimer); clearTimeout(revealTimer); clearTimeout(sequenceRevealTimer); sequenceRevealTimer = null;
  if (channel) { supabase.removeChannel(channel); channel=null; }
  game=null; isHost=false; subscribed=false; hostPresent=false; lastDrawnPhase=null; history.replaceState(null,'',location.pathname); showHome();
}

async function copyInviteLink() {
  const invite = new URL(location.href);
  invite.hash = `room=${roomCode}`;
  try {
    await navigator.clipboard.writeText(invite.href);
    toast('Invite link copied. Send it to your guests.');
  } catch {
    toast(`Share room code ${roomCode} with your guests.`);
  }
}

roomEl.addEventListener('click', async event=>{
  const target=event.target.closest('[data-action]'); if(!target) return;
  const {action}=target.dataset;
  if(action==='checkin' && !isHost){
    const name=document.querySelector('#name-input')?.value||'';
    try{setPlayerName(name);}catch(e){toast(e.message);return;}
    localStorage.setItem('nightshift-player-name',myName);
    emitIntent('join',{name:myName}); return;
  }
  if(action==='checkin' && isHost){
    const name=document.querySelector('#name-input')?.value||'';
    try{setPlayerName(name);}catch(e){toast(e.message);return;}
    localStorage.setItem('nightshift-player-name',myName);
    rememberPlayer(myId,myName); return;
  }
  if(action==='answer'){
    const answer=Number(target.dataset.answer);
    if(!isHost && game.phase==='question') { game.answers={...game.answers,[myId]:answer}; draw(); }
    if(!isHost && game.phase==='finale' && game.finaleLocked?.[myId] !== true) { game.finaleAnswers={...game.finaleAnswers,[myId]:answer}; draw(); }
    sound('tap');
    emitIntent('answer',{answer}); return;
  }
  if(action==='sequence'){
    localSequence.push(Number(target.dataset.symbol)); sound('tap');
    if(localSequence.length===3){ emitIntent('sequence',{values:localSequence}); localSequence=[]; }
    else drawChallenge();
    return;
  }
  if(action==='home'){leaveRoom();return;}
  if(action==='copylink'){await copyInviteLink();return;}
  emitIntent(action);
});

document.querySelector('#host-button').addEventListener('click',createRoom);
document.querySelector('#join-button').addEventListener('click',joinRoom);
document.querySelector('#room-input').addEventListener('keydown',e=>{if(e.key==='Enter')joinRoom();});
document.querySelector('#room-input').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g,'');});
document.querySelector('#sound-toggle').addEventListener('click',e=>{
  soundOn=!soundOn;
  e.currentTarget.querySelector('span').textContent=soundOn?'SOUND ON':'SOUND OFF';
  e.currentTarget.setAttribute('aria-pressed',String(soundOn));
  e.currentTarget.setAttribute('aria-label',soundOn?'Turn sound and music off':'Turn sound and music on');
  e.currentTarget.title=soundOn?'Turn sound and music off':'Turn sound and music on';
  if(soundOn){startAmbience();sound('tap');}else stopAmbience();
});

const initialCode=new URLSearchParams(location.hash.slice(1)).get('room');
if(initialCode && /^[A-HJ-NP-Z2-9]{5}$/.test(initialCode)){
  document.querySelector('#room-input').value=initialCode;
  try {
    const saved=JSON.parse(sessionStorage.getItem(`nightshift:${initialCode}`)||'null');
    if(saved?.hostId===myId && saved.phase!=='over'){game=saved;connect(initialCode,true);}
  } catch { /* A bad cache should never block a fresh check-in. */ }
}

window.addEventListener('online',()=>{if(channel){subscribed=true;toast('Connection restored. Checking the room…');}});
window.addEventListener('offline',()=>{subscribed=false;toast('You are offline. Your game will reconnect when the network returns.');draw();});
window.addEventListener('pagehide',()=>{if(channel) supabase.removeChannel(channel);});

