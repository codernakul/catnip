/* ═══════════════════════════════════════════════════════
   CAT Mock Exam — TCS iON Style
   app.js — all application logic (no server required)
═══════════════════════════════════════════════════════ */

/* ── Global data (populated from JSON) ── */
let QS       = [];   // question array
let SECTIONS = [];   // section config array
let EXAM     = {};   // exam + candidate metadata
let PASSAGES = {};   // passageId → passage object

/* ── Application state ── */
const ST = {
  sec:     0,           // current section index
  qi:      0,           // current question index within section
  answers: {},          // questionId → number (MCQ) | string (TITA)
  marked:  new Set(),   // questionIds marked for review
  visited: new Set(),   // questionIds visited at least once
  times:   [],          // remaining seconds per section
  done:    [],          // whether each section's time has expired
  timer:   null         // setInterval handle
};

/* ═══════════════════════════════════════════════════════
   BOOTSTRAP — load JSON then initialise UI
═══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  fetch('data/questions.json')
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(data => {
      EXAM     = data.exam;
      SECTIONS = data.sections.map(s => ({ ...s, dur: s.durationMinutes * 60 }));
      QS       = data.questions;
      (data.passages || []).forEach(p => { PASSAGES[p.id] = p; });
      buildWelcome();
    })
    .catch(err => {
      document.body.innerHTML =
        `<div style="padding:40px;font-family:sans-serif;color:#CC0000;">
           <h2>Failed to load questions.json</h2>
           <p style="margin-top:8px;color:#444;">${err.message}</p>
           <p style="margin-top:8px;color:#444;">
             Serve this folder with a local HTTP server, e.g.:<br>
             <code style="background:#eee;padding:4px 8px;border-radius:4px;">node serve.js</code>
           </p>
         </div>`;
    });
});

/* ═══════════════════════════════════════════════════════
   SCREEN MANAGEMENT
═══════════════════════════════════════════════════════ */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

/* ═══════════════════════════════════════════════════════
   SCREEN 1 — WELCOME: populate candidate info
═══════════════════════════════════════════════════════ */
function buildWelcome() {
  const c = EXAM.candidate;
  const initial = c.name.charAt(0).toUpperCase();

  document.querySelectorAll('.js-avatar-letter').forEach(el => { el.textContent = initial; });
  document.getElementById('cand-name-banner').textContent  = `Welcome, ${c.name}`;
  document.getElementById('cand-name-hdr').textContent     = c.name;
  document.getElementById('cand-reg-hdr').textContent      = c.regNo;
  document.getElementById('info-name').textContent         = c.name;
  document.getElementById('info-reg').textContent          = c.regNo;
  document.getElementById('info-centre').textContent       = c.centre;
  document.getElementById('info-code').textContent         = c.centreCode;
  document.getElementById('info-date').textContent         = c.date;
  document.getElementById('info-session').textContent      = c.session;
  document.getElementById('info-exam').textContent         = EXAM.name;

  buildTimingTable();
}

/* ── Build the timing table on the instructions screen ── */
function buildTimingTable() {
  const tbody = document.getElementById('timing-tbody');
  const tfoot = document.getElementById('timing-tfoot');
  let totalQ = 0, totalMCQ = 0, totalTITA = 0, totalMin = 0;

  tbody.innerHTML = SECTIONS.map(sec => {
    const qs   = QS.filter(q => q.section === sec.id);
    const mcq  = qs.filter(q => q.type === 'MCQ').length;
    const tita = qs.filter(q => q.type === 'TITA').length;
    const min  = sec.durationMinutes;
    totalQ += qs.length; totalMCQ += mcq; totalTITA += tita; totalMin += min;
    return `<tr>
      <td>${sec.full}</td>
      <td>${qs.length}</td><td>${mcq}</td><td>${tita}</td>
      <td>${min} min</td>
    </tr>`;
  }).join('');

  tfoot.innerHTML = `<tr>
    <td><strong>Total</strong></td>
    <td><strong>${totalQ}</strong></td>
    <td><strong>${totalMCQ}</strong></td>
    <td><strong>${totalTITA}</strong></td>
    <td><strong>${totalMin} min</strong></td>
  </tr>`;
}

/* ═══════════════════════════════════════════════════════
   SCREEN 2 — INSTRUCTIONS: agree checkbox
═══════════════════════════════════════════════════════ */
function onAgreeChange(checked) {
  document.getElementById('start-btn').disabled = !checked;
}

/* ═══════════════════════════════════════════════════════
   START EXAM
═══════════════════════════════════════════════════════ */
function startExam() {
  // Reset state
  ST.sec  = 0;
  ST.qi   = 0;
  ST.answers = {};
  ST.marked.clear();
  ST.visited.clear();
  ST.times = SECTIONS.map(s => s.dur);
  ST.done  = SECTIONS.map(() => false);

  showScreen('exam-screen');
  renderTabs();
  renderQuestion();
  startTimer();
}

/* ═══════════════════════════════════════════════════════
   TIMER
═══════════════════════════════════════════════════════ */
function startTimer() {
  clearInterval(ST.timer);
  ST.timer = setInterval(tick, 1000);
  updateTimerDisplay();
}

function tick() {
  ST.times[ST.sec]--;
  if (ST.times[ST.sec] <= 0) {
    ST.times[ST.sec] = 0;
    updateTimerDisplay();
    advanceSection();
    return;
  }
  updateTimerDisplay();
  renderTabs();
}

function updateTimerDisplay() {
  const t  = ST.times[ST.sec];
  const el = document.getElementById('timer-val');
  el.textContent = formatTime(t);
  el.className   = 'timer-val' + (t <= 60 ? ' danger' : t <= 120 ? ' warn' : '');
}

function advanceSection() {
  ST.done[ST.sec] = true;
  if (ST.sec < SECTIONS.length - 1) {
    ST.sec++;
    ST.qi = 0;
    updateTimerDisplay();
    renderTabs();
    renderQuestion();
  } else {
    clearInterval(ST.timer);
    goToSummary();
  }
}

/* ═══════════════════════════════════════════════════════
   SECTION TABS
═══════════════════════════════════════════════════════ */
function renderTabs() {
  const container = document.getElementById('sec-tabs');
  container.innerHTML = SECTIONS.map((sec, i) => {
    let cls = 'sec-tab';
    if (i === ST.sec)                 cls += ' active';
    if (i < ST.sec || ST.done[i])    cls += ' locked';
    const t = i > ST.sec ? '—:——' : formatTime(ST.times[i]);
    return `<div class="${cls}" onclick="handleTabClick(${i})">
      <span class="tab-name">${sec.name}</span>
      <span class="tab-time">${t}</span>
    </div>`;
  }).join('');
}

function handleTabClick(i) {
  // Only current section is clickable; locked/future tabs are pointer-events:none via CSS
  if (i === ST.sec) { /* already on this section, tab click does nothing extra */ }
}

/* ═══════════════════════════════════════════════════════
   QUESTION RENDERING
═══════════════════════════════════════════════════════ */
function secQs(i)  { return QS.filter(q => q.section === SECTIONS[i].id); }
function curQ()    { return secQs(ST.sec)[ST.qi]; }

function renderQuestion() {
  const q = curQ();
  if (!q) return;
  ST.visited.add(q.id);

  const allSecQs = secQs(ST.sec);
  const localN   = allSecQs.indexOf(q) + 1;
  const globalN  = QS.indexOf(q) + 1;
  const sec      = SECTIONS[ST.sec];

  /* ── Meta badges ── */
  document.getElementById('q-meta').innerHTML =
    `<span class="badge badge-num">Q${globalN} of ${QS.length}</span>` +
    `<span class="badge badge-type">${q.type}</span>` +
    `<span class="badge badge-pos">+${q.marks} Marks</span>` +
    (q.negativeMarks > 0
      ? `<span class="badge badge-neg">&minus;${q.negativeMarks} Negative</span>`
      : `<span class="badge badge-noneg">No Negative Marking</span>`) +
    `<span class="q-meta-right">${sec.full}&nbsp;&nbsp;|&nbsp;&nbsp;Q${localN}/${allSecQs.length}</span>`;

  /* ── Passage / scenario ── */
  const passageBox = document.getElementById('passage-box');
  if (q.passageId && PASSAGES[q.passageId]) {
    const p = PASSAGES[q.passageId];
    passageBox.innerHTML =
      `<div class="passage-title">${p.title}</div>` +
      `<div class="passage-text">${p.text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>').replace(/^/, '<p>').replace(/$/, '</p>')}</div>`;
    passageBox.hidden = false;
  } else {
    passageBox.hidden = true;
    passageBox.innerHTML = '';
  }

  /* ── Question text ── */
  document.getElementById('q-text').textContent = q.question;

  /* ── Answer input ── */
  const wrap = document.getElementById('opts-wrap');
  if (q.type === 'MCQ') {
    const cur = ST.answers[q.id];
    wrap.innerHTML = `<div class="opts-list">` +
      q.options.map((opt, i) =>
        `<div class="opt-item ${cur === i ? 'sel' : ''}" onclick="pickOption(${i})">
           <div class="opt-key">${String.fromCharCode(65 + i)}</div>
           <div class="opt-val">${opt}</div>
         </div>`
      ).join('') +
      `</div>`;
  } else {
    const cur = ST.answers[q.id] !== undefined ? ST.answers[q.id] : '';
    wrap.innerHTML =
      `<div class="tita-wrap">
         <div class="tita-lbl">Type your answer in the box below:</div>
         <input type="number" id="tita-in" class="tita-in"
           value="${cur}" placeholder="Enter integer…"
           oninput="onTITAInput(this.value)">
       </div>`;
  }

  document.getElementById('q-scroll').scrollTop = 0;
  renderPalette();
}

function pickOption(i) {
  ST.answers[curQ().id] = i;
  renderQuestion();
}

function onTITAInput(val) {
  ST.answers[curQ().id] = val;
  renderPalette();
}

/* ═══════════════════════════════════════════════════════
   ACTION BAR HANDLERS
═══════════════════════════════════════════════════════ */
function syncTITA() {
  const q = curQ();
  if (q.type === 'TITA') {
    const inp = document.getElementById('tita-in');
    if (inp) ST.answers[q.id] = inp.value;
  }
}

function saveAndNext() {
  syncTITA();
  navigateQ(1);
}

function markAndNext() {
  syncTITA();
  ST.marked.add(curQ().id);
  navigateQ(1);
}

function clearResponse() {
  const q = curQ();
  delete ST.answers[q.id];
  ST.marked.delete(q.id);
  if (q.type === 'TITA') {
    const inp = document.getElementById('tita-in');
    if (inp) inp.value = '';
  }
  renderQuestion();
}

function navigateQ(dir) {
  const qs  = secQs(ST.sec);
  const nxt = ST.qi + dir;
  if (nxt >= 0 && nxt < qs.length) {
    ST.qi = nxt;
    renderQuestion();
  }
}

function jumpToQuestion(idx) {
  ST.qi = idx;
  renderQuestion();
}

/* ═══════════════════════════════════════════════════════
   QUESTION PALETTE
═══════════════════════════════════════════════════════ */
function qStatus(q) {
  const a       = ST.answers[q.id];
  const answered = a !== undefined && a !== '';
  const marked   = ST.marked.has(q.id);
  const visited  = ST.visited.has(q.id);
  if (answered && marked) return 's-am';
  if (answered)           return 's-an';
  if (marked)             return 's-mk';
  if (visited)            return 's-na';
  return 's-nv';
}

function renderPalette() {
  const qs  = secQs(ST.sec);
  const cur = curQ();

  document.getElementById('pal-sec-lbl').textContent = SECTIONS[ST.sec].name;

  /* ── Number grid ── */
  document.getElementById('pal-grid').innerHTML = qs.map((q, idx) => {
    const gn    = QS.indexOf(q) + 1;
    const st    = qStatus(q);
    const isCur = q.id === cur.id;
    return `<div class="pq ${st}${isCur ? ' cur' : ''}"
              onclick="jumpToQuestion(${idx})"
              title="Q${gn} — ${statusLabel(st)}">${gn}</div>`;
  }).join('');

  /* ── Count summary ── */
  const c = { 's-an': 0, 's-na': 0, 's-mk': 0, 's-am': 0, 's-nv': 0 };
  qs.forEach(q => { c[qStatus(q)]++; });

  document.getElementById('pal-sum').innerHTML =
    sumRow('Answered',           c['s-an'], 'var(--pal-green)')  +
    sumRow('Not Answered',       c['s-na'], 'var(--pal-red)')    +
    sumRow('Marked for Review',  c['s-mk'], 'var(--pal-purple)') +
    sumRow('Ans. &amp; Marked',  c['s-am'], 'var(--pal-purgrn)') +
    sumRow('Not Visited',        c['s-nv'], 'var(--text3)');
}

function sumRow(label, count, color) {
  return `<div class="sum-row">
    <span>${label}</span>
    <span class="sum-n" style="color:${color};">${count}</span>
  </div>`;
}

function statusLabel(s) {
  return { 's-nv':'Not Visited','s-na':'Not Answered','s-an':'Answered','s-mk':'Marked for Review','s-am':'Answered & Marked' }[s] || s;
}

/* ═══════════════════════════════════════════════════════
   SUBMIT FLOW
═══════════════════════════════════════════════════════ */
function confirmSubmit() {
  const unanswered = QS.filter(q => {
    const a = ST.answers[q.id];
    return a === undefined || a === '';
  }).length;
  document.getElementById('modal-unanswered').textContent = unanswered;
  document.getElementById('modal').hidden = false;
}

function closeModal() {
  document.getElementById('modal').hidden = true;
}

function goToSummary() {
  closeModal();
  renderSummary();
  showScreen('summary-screen');
}

function renderSummary() {
  const tbody = document.getElementById('sum-tbody');
  const tfoot = document.getElementById('sum-tfoot');

  const rows = SECTIONS.map(sec => {
    const qs = QS.filter(q => q.section === sec.id);
    const c  = { an: 0, na: 0, mk: 0, am: 0, nv: 0 };
    qs.forEach(q => {
      const s = qStatus(q);
      if (s === 's-an') c.an++; else if (s === 's-na') c.na++;
      else if (s === 's-mk') c.mk++; else if (s === 's-am') c.am++;
      else c.nv++;
    });
    return { name: sec.full, total: qs.length, ...c };
  });

  const tot = rows.reduce((a, r) => ({
    total: a.total + r.total, an: a.an + r.an, na: a.na + r.na,
    mk: a.mk + r.mk, am: a.am + r.am, nv: a.nv + r.nv
  }), { total: 0, an: 0, na: 0, mk: 0, am: 0, nv: 0 });

  tbody.innerHTML = rows.map(r =>
    `<tr>
       <td>${r.name}</td><td>${r.total}</td>
       <td style="color:var(--pal-green);font-weight:700;">${r.an}</td>
       <td style="color:var(--pal-red);">${r.na}</td>
       <td style="color:var(--pal-purple);">${r.mk}</td>
       <td style="color:var(--pal-purgrn);">${r.am}</td>
       <td style="color:var(--text3);">${r.nv}</td>
     </tr>`
  ).join('');

  tfoot.innerHTML =
    `<tr>
       <td>Total</td><td>${tot.total}</td>
       <td style="color:var(--pal-green);">${tot.an}</td>
       <td style="color:var(--pal-red);">${tot.na}</td>
       <td style="color:var(--pal-purple);">${tot.mk}</td>
       <td style="color:var(--pal-purgrn);">${tot.am}</td>
       <td style="color:var(--text3);">${tot.nv}</td>
     </tr>`;
}

function finalSubmit() {
  clearInterval(ST.timer);
  closeModal();
  renderResult();
  showScreen('result-screen');
}

/* ═══════════════════════════════════════════════════════
   RESULT CALCULATION & RENDERING
═══════════════════════════════════════════════════════ */
function isCorrect(q) {
  const a = ST.answers[q.id];
  if (a === undefined || a === '') return null;
  if (q.type === 'MCQ')  return parseInt(a) === q.correctAnswer;
  return String(a).trim() === String(q.correctAnswer).trim();
}

function renderResult() {
  let totalScore = 0, totalCorrect = 0, totalWrong = 0, totalUnattempted = 0;
  const maxMarks = QS.reduce((s, q) => s + q.marks, 0);

  const secRows = SECTIONS.map(sec => {
    const qs = QS.filter(q => q.section === sec.id);
    let sc = 0, co = 0, wr = 0, un = 0;
    qs.forEach(q => {
      const ok = isCorrect(q);
      if (ok === null) { un++; }
      else if (ok)     { co++; sc += q.marks; }
      else             { wr++; sc -= q.negativeMarks; }
    });
    totalScore += sc; totalCorrect += co; totalWrong += wr; totalUnattempted += un;
    return { sec, sc, co, wr, un };
  });

  /* ── Score banner ── */
  document.getElementById('res-score').textContent = totalScore;
  document.getElementById('res-max').textContent   = maxMarks;

  /* ── Metrics ── */
  document.getElementById('metrics').innerHTML =
    `<div class="metric-cell"><div class="metric-n c">${totalCorrect}</div><div class="metric-l">Correct</div></div>` +
    `<div class="metric-cell"><div class="metric-n w">${totalWrong}</div><div class="metric-l">Incorrect</div></div>` +
    `<div class="metric-cell"><div class="metric-n u">${totalUnattempted}</div><div class="metric-l">Unattempted</div></div>`;

  /* ── Section breakdown ── */
  document.getElementById('sec-res-tbody').innerHTML = secRows.map(r =>
    `<tr>
       <td>${r.sec.name} — ${r.sec.full}</td>
       <td style="font-weight:800;color:${r.sc >= 0 ? 'var(--pal-green)' : 'var(--pal-red)'};">${r.sc >= 0 ? '+' : ''}${r.sc}</td>
       <td style="color:var(--pal-green);">${r.co}</td>
       <td style="color:var(--pal-red);">${r.wr}</td>
       <td style="color:var(--text3);">${r.un}</td>
     </tr>`
  ).join('');

  /* ── Question-wise review ── */
  document.getElementById('rev-list').innerHTML = QS.map((q, idx) => {
    const ok   = isCorrect(q);
    const a    = ST.answers[q.id];
    const answered = a !== undefined && a !== '';

    let userAns, correctAns;
    if (q.type === 'MCQ') {
      correctAns = q.options[q.correctAnswer];
      userAns    = answered ? q.options[parseInt(a)] : 'Not Attempted';
    } else {
      correctAns = String(q.correctAnswer);
      userAns    = answered ? String(a) : 'Not Attempted';
    }

    const col  = ok === null ? 'var(--text3)' : ok ? 'var(--pal-green)' : 'var(--pal-red)';
    const icon = ok === null ? '—' : ok ? '✓' : '✗';
    const pts  = ok === null ? '0' : ok ? `+${q.marks}` : q.negativeMarks > 0 ? `−${q.negativeMarks}` : '0';
    const snippet = q.question.length > 110 ? q.question.slice(0, 110) + '…' : q.question;

    return `<div class="rev-item">
      <div class="rev-head">
        <span style="font-size:15px;font-weight:900;color:${col};">${icon}</span>
        <span style="font-size:12.5px;font-weight:800;color:var(--text);">Q${idx + 1} &nbsp;&middot;&nbsp; ${q.section} &nbsp;&middot;&nbsp; ${q.type}</span>
        <span style="margin-left:auto;font-size:12.5px;font-weight:800;color:${col};">${pts} marks</span>
      </div>
      <div class="rev-body">
        <div class="rev-q">${snippet}</div>
        <div class="rev-ans">
          <span><span style="color:var(--text3);">Your answer: </span><strong style="color:${col};">${userAns}</strong></span>
          <span><span style="color:var(--text3);">Correct: </span><strong style="color:var(--pal-green);">${correctAns}</strong></span>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════ */
function formatTime(s) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}
