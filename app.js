import { createClient } from '@supabase/supabase-js';

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
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS = 6;
const QUESTION_SECONDS = 18;
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
let subscribed = false;
let hostPresent = false;
let soundOn = false;
let audio = null;
let localSequence = [];
let sequenceVisible = false;
let lastStateAt = 0;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);
const myPlayer = () => game?.players?.find(p => p.id === myId);
const alivePlayers = () => (game?.players || []).filter(p => p.alive && p.hearts > 0);
const isActive = () => Boolean(myPlayer()?.alive && myPlayer()?.hearts > 0);
const playerName = (id) => game?.players?.find(p => p.id === id)?.name || 'Guest';
const randomCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const shuffled = (items) => [...items].sort(() => Math.random() - .5);
const toast = (text) => { let t = document.querySelector('.connection-toast'); if (!t) { t = document.createElement('div'); t.className = 'connection-toast'; document.body.append(t); } t.textContent = text; clearTimeout(t._timer); t._timer = setTimeout(() => t.remove(), 4200); };

function sound(type) {
  if (!soundOn) return;
  audio ||= new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audio.createOscillator(); const gain = audio.createGain();
  oscillator.type = 'sine'; oscillator.frequency.value = type === 'wrong' ? 110 : type === 'right' ? 540 : 280;
  gain.gain.setValueAtTime(.035, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .16);
  oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + .16);
}

function initialGame(hostId) {
  return { hostId, phase: 'lobby', players: [], round: 0, questionId: null, questions: [], answers: {}, deadline: null, challenge: null, finaleCount: 0, finaleAnswers: {}, winnerId: null, createdAt: Date.now() };
}

function showHome() {
  homeEl.classList.remove('hidden'); roomEl.classList.add('hidden');
  document.querySelector('#connection-label').textContent = 'NIGHT WINDOW OPEN';
  document.querySelector('#home-error').textContent = '';
}

function draw() {
  if (!game) return;
  homeEl.classList.add('hidden'); roomEl.classList.remove('hidden');
  document.querySelector('#connection-label').textContent = subscribed ? 'CONNECTED TO ROOM' : 'RECONNECTING';
  if (game.phase === 'lobby') return drawLobby();
  if (game.phase === 'question' || game.phase === 'finale') return drawQuestion();
  if (game.phase === 'challenge') return drawChallenge();
  if (game.phase === 'result') return drawResult();
  if (game.phase === 'over') return drawOver();
}

function commonTop() {
  const phase = game.phase === 'lobby' ? 'THE LOBBY' : game.phase === 'challenge' ? 'THE HOUSE TEST' : game.phase === 'over' ? 'CHECKOUT' : game.phase === 'result' ? 'THE VERDICT' : game.phase === 'finale' ? 'THE EXIT RUN' : `QUESTION ${game.round} OF 5`;
  return `<div class="game-top"><span class="phase-label">${phase.toUpperCase()}</span><span class="room-code-label">ROOM <strong>${esc(roomCode)}</strong></span></div>`;
}

function roster() {
  const people = game.players || [];
  return `<aside class="player-panel"><div class="panel-title"><span>ON THE GUEST LIST</span><span class="lobby-player-count">${people.length}/${MAX_PLAYERS}</span></div><div class="player-list">${people.map(p => `<div class="player"><span class="player-avatar">${esc((p.name || '?')[0].toUpperCase())}</span><span class="player-name">${esc(p.name)}${p.id === game.hostId ? ' <span class="player-meta">· HOST</span>' : ''}${p.id === myId ? ' <span class="player-meta">· YOU</span>' : ''}</span><span class="hearts" aria-label="${p.hearts} hearts">${'♥'.repeat(Math.max(0,p.hearts))}<span class="heart-lost">${'♥'.repeat(Math.max(0,3-p.hearts))}</span></span></div>`).join('') || '<p class="waiting">The corridor is quiet.</p>'}</div></aside>`;
}

function hostButton(text, action) {
  return isHost ? `<div class="host-controls"><button class="button button-primary" data-action="${action}">${text}<span>→</span></button></div>` : '<p class="waiting">Waiting for the host.</p>';
}

function drawLobby() {
  const hasMe = Boolean(myPlayer());
  roomEl.innerHTML = `${commonTop()}<div class="game-grid"><section class="card"><div class="round-label">WELCOME, NIGHT GUEST</div><h2 class="lobby-title">Leave a light on.</h2><p class="lobby-copy">Five questions stand between you and the front door. Miss one and the house gives you a test. Pass, and keep your heart. Three hearts. Six guests. Only the living can leave.</p>${hasMe ? `<div class="host-banner">YOU ARE CHECKED IN AS ${esc(myName.toUpperCase())}${isHost ? ' · YOU OPENED THE HOTEL' : ''}</div>${hostButton('START THE NIGHT', 'start')}` : `<div class="lobby-tools"><input class="name-input" id="name-input" maxlength="18" autocomplete="nickname" placeholder="YOUR NAME" aria-label="Your name"><button class="button button-primary" data-action="checkin">CHECK IN <span>→</span></button></div>`}<p class="lobby-note">${isHost ? 'Invite 1–5 people with the room code above. Everyone plays from their own phone or laptop.' : 'Use the same room code on each device. No account or download needed.'}</p></section>${roster()}</div>`;
}

function activeQuestion() { return QUESTIONS[game.questionId] || QUESTIONS[0]; }

function drawQuestion() {
  const q = activeQuestion(); const final = game.phase === 'finale';
  const seconds = Math.max(0, Math.ceil(((game.deadline || Date.now()) - Date.now()) / 1000));
  const submitted = game.answers?.[myId] !== undefined || game.finaleAnswers?.[myId] !== undefined;
  const canAnswer = isActive() && !submitted;
  const prompt = final ? `<p class="finale-progress">${myPlayer()?.escapeScore || 0} / 3 CORRECT TO ESCAPE</p>` : `<div class="round-label">QUESTION ${game.round} · GET IT RIGHT TO KEEP YOUR HEART</div>`;
  const options = q.a.map((answer, i) => `<button class="answer ${game.answers?.[myId] === i || game.finaleAnswers?.[myId] === i ? 'selected' : ''}" data-action="answer" data-answer="${i}" ${canAnswer ? '' : 'disabled'}><span class="answer-key">0${i+1}</span><span>${esc(answer)}</span></button>`).join('');
  const stateLine = !isActive() ? 'YOU ARE OUT · WATCH THE LIVING' : submitted ? 'ANSWER LOCKED · THE HOUSE IS LISTENING' : 'LOCK AN ANSWER BEFORE THE LIGHT GOES OUT';
  roomEl.innerHTML = `${commonTop()}<div class="game-grid"><section class="card">${prompt}<h2 class="question">${esc(q.q)}</h2><div class="answers">${options}</div><div class="question-foot"><span>${stateLine}</span><span class="timer"><span class="timer-number">${seconds}</span> SEC</span></div>${final && isHost && (myPlayer()?.escapeScore || 0) >= 3 ? hostButton('CHECK OUT', 'forcefinish') : ''}</section>${roster()}</div>`;
  clearInterval(roundTimer);
  roundTimer = setInterval(() => { const timer = roomEl.querySelector('.timer-number'); if (timer && game?.deadline) timer.textContent = String(Math.max(0, Math.ceil((game.deadline - Date.now()) / 1000))); }, 250);
}

function drawChallenge() {
  clearInterval(roundTimer);
  const challenge = game.challenge || { players: [], sequences: {}, submitted: {} };
  sequenceVisible = Date.now() < (challenge.revealUntil || 0);
  const assigned = challenge.players.includes(myId) && isActive();
  const done = challenge.submitted?.[myId] !== undefined;
  const seconds = Math.max(0, Math.ceil(((challenge.deadline || Date.now()) - Date.now()) / 1000));
  const seq = challenge.sequences?.[myId] || [];
  const sequenceRow = seq.map((n,i) => `<span class="glyph ${sequenceVisible ? 'current' : ''}" aria-hidden="true">${sequenceVisible ? SYMBOLS[n] : '·'}</span>`).join('');
  const ownStatus = !assigned ? (isActive() ? 'SAFE FOR NOW · THE HOUSE TESTS THE PEOPLE WHO MISSED' : 'YOU ARE OUT · WATCH THE LIVING') : done ? 'TEST COMPLETE · WAIT FOR THE VERDICT' : sequenceVisible ? 'MEMORIZE THE ORDER' : 'REPEAT THE ORDER BEFORE TIME RUNS OUT';
  const buttons = SYMBOLS.map((sym,i)=>`<button class="tile" data-action="sequence" data-symbol="${i}" ${assigned && !done && !sequenceVisible && localSequence.length<3 ? '' : 'disabled'} aria-label="Tap ${sym}">${sym}</button>`).join('');
  const entered = localSequence.map(n=>`<span class="glyph">${SYMBOLS[n]}</span>`).join('');
  roomEl.innerHTML = `${commonTop()}<div class="game-grid"><section class="card"><div class="round-label">THE MIRROR TEST</div><h2 class="challenge-title">The house has a good memory.</h2><p class="challenge-copy">Repeat the three marks in the right order. Take a breath. The mirror is already looking back.</p><div class="sequence-display">${assigned ? (sequenceVisible ? sequenceRow : (entered || '<span class="waiting">···</span>')) : '<span class="waiting">The house is testing the guests who missed.</span>'}</div>${assigned && !done ? `<div class="tile-grid">${buttons}</div>` : ''}<div class="question-foot"><span>${ownStatus}</span><span class="timer"><span class="timer-number">${seconds}</span> SEC</span></div><p class="challenge-note">${localSequence.length}/3 MARKS · ${Object.keys(challenge.submitted || {}).length}/${challenge.players.length} TESTS COMPLETE</p></section>${roster()}</div>`;
  if (assigned && !done && Date.now() < (challenge.revealUntil || 0) && !sequenceVisible) {
    sequenceVisible = true; clearTimeout(revealTimer); revealTimer = setTimeout(() => { sequenceVisible = false; if (game?.phase === 'challenge') drawChallenge(); }, Math.max(500, challenge.revealUntil - Date.now()));
  }
  clearInterval(roundTimer);
  roundTimer = setInterval(() => { const timer = roomEl.querySelector('.timer-number'); if (timer) timer.textContent = String(Math.max(0, Math.ceil((challenge.deadline - Date.now()) / 1000))); }, 250);
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
      if (payload.answer < 0 || payload.answer > 3) return;
      game.answers[id] = payload.answer;
      publish();
      if (alivePlayers().every(p => game.answers[p.id] !== undefined)) resolveQuestion();
    } else if (game.phase === 'finale' && game.finaleAnswers[id] === undefined) {
      if (payload.answer < 0 || payload.answer > 3) return;
      game.finaleAnswers[id] = payload.answer;
      publish();
      if (alivePlayers().every(p=>game.finaleAnswers[p.id] !== undefined)) resolveFinaleQuestion();
    }
    return;
  }
  if (action === 'sequence') {
    if (game.phase !== 'challenge' || !player?.alive || !game.challenge.players.includes(id) || game.challenge.submitted[id] !== undefined || !Array.isArray(payload.values) || payload.values.length !== 3 || payload.values.some(n=>!Number.isInteger(n)||n<0||n>3)) return;
    game.challenge.submitted[id] = payload.values;
    publish();
    if (game.challenge.players.every(pid=>game.challenge.submitted[pid] !== undefined)) resolveChallenge();
    return;
  }
  if (id !== game.hostId) return;
  if (action === 'start' && game.phase === 'lobby' && game.players.length >= 2) startGame();
  if (action === 'checkin' && game.phase === 'lobby' && typeof payload.name === 'string') {
    const normalized = payload.name.trim().replace(/\s+/g,' ').slice(0,18);
    if (normalized.length < 2) { toast('Choose a name with at least 2 characters.'); return; }
    myName = normalized; channel.track({ id: myId, name: myName }); rememberPlayer(myId,myName);
  }
  if (action === 'next' && game.phase === 'result') nextStage();
  if (action === 'forcefinish' && game.phase === 'finale') finishGame(game.players.filter(p=>p.alive).sort((a,b)=>b.escapeScore-a.escapeScore||b.correct-a.correct)[0]?.id);
}

function startGame() {
  if (game.players.length < 2) return toast('Invite at least one other guest to begin.');
  game.questions = shuffled(QUESTIONS.map((_,i)=>i));
  game.round = 1;
  beginQuestion(false);
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
  game.challenge = { players: missed, sequences: Object.fromEntries(missed.map(id=>[id,Array.from({length:3},()=>Math.floor(Math.random()*4))])), submitted: {}, revealUntil: now + 2300, deadline: now + 12000 };
  game.lastResult = {};
  sequenceVisible = false;
  publish();
  scheduleDeadline(()=>resolveChallenge(), 12000);
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
  channel = supabase.channel(`nightshift:${code}`, { config: { broadcast: { self: false }, presence: { key: myId } } });
  channel.on('broadcast',{event:'state'},({payload})=>{
    if (host || !payload?.game) return;
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
  channel.on('presence',{event:'sync'},()=>{
    const state=channel.presenceState();
    const records=Object.values(state).flat();
    hostPresent=records.some(p=>p.role==='host');
    if (host) for (const p of records) if (p.id&&p.name) rememberPlayer(p.id,p.name);
  });
  channel.subscribe(async status=>{
    if(status==='SUBSCRIBED'){
      subscribed=true; draw();
    if(host){
        const own=game.players?.find(p=>p.id===myId);
        channel.track({id:myId,name:own?.name||myName||'',role:'host'});
        if(game.phase==='question' && game.deadline) scheduleDeadline(resolveQuestion,Math.max(0,game.deadline-Date.now()));
        if(game.phase==='finale' && game.deadline) scheduleDeadline(resolveFinaleQuestion,Math.max(0,game.deadline-Date.now()));
        if(game.phase==='challenge' && game.challenge?.deadline) scheduleDeadline(resolveChallenge,Math.max(0,game.challenge.deadline-Date.now()));
      } else if (myName) { channel.track({id:myId,name:myName}); await channel.send({type:'broadcast',event:'intent',payload:{id:myId,action:'join',name:myName}}); }
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
  clearInterval(roundTimer); clearTimeout(revealTimer);
  if (channel) { supabase.removeChannel(channel); channel=null; }
  game=null; isHost=false; subscribed=false; hostPresent=false; history.replaceState(null,'',location.pathname); showHome();
}

roomEl.addEventListener('click', async event=>{
  const target=event.target.closest('[data-action]'); if(!target) return;
  const {action}=target.dataset;
  if(action==='checkin' && !isHost){
    const name=document.querySelector('#name-input')?.value||'';
    try{setPlayerName(name);}catch(e){toast(e.message);return;}
    localStorage.setItem('nightshift-player-name',myName);
    channel.track({id:myId,name:myName});
    emitIntent('join',{name:myName}); return;
  }
  if(action==='checkin' && isHost){
    const name=document.querySelector('#name-input')?.value||'';
    try{setPlayerName(name);}catch(e){toast(e.message);return;}
    localStorage.setItem('nightshift-player-name',myName);
    channel.track({id:myId,name:myName,role:'host'}); rememberPlayer(myId,myName); return;
  }
  if(action==='answer'){
    const answer=Number(target.dataset.answer);
    if(!isHost && game.phase==='question') { game.answers={...game.answers,[myId]:answer}; draw(); }
    if(!isHost && game.phase==='finale') { game.finaleAnswers={...game.finaleAnswers,[myId]:answer}; draw(); }
    sound(answer===activeQuestion().correct?'right':'wrong');
    emitIntent('answer',{answer}); return;
  }
  if(action==='sequence'){
    localSequence.push(Number(target.dataset.symbol)); sound('tap');
    if(localSequence.length===3){ emitIntent('sequence',{values:localSequence}); localSequence=[]; }
    else drawChallenge();
    return;
  }
  if(action==='home'){leaveRoom();return;}
  emitIntent(action);
});

document.querySelector('#host-button').addEventListener('click',createRoom);
document.querySelector('#join-button').addEventListener('click',joinRoom);
document.querySelector('#room-input').addEventListener('keydown',e=>{if(e.key==='Enter')joinRoom();});
document.querySelector('#room-input').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g,'');});
document.querySelector('#sound-toggle').addEventListener('click',e=>{soundOn=!soundOn;e.currentTarget.querySelector('span').textContent=soundOn?'SOUND ON':'SOUND OFF';if(soundOn)sound('tap');});

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
