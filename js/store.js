// Kho dữ liệu trên thiết bị (localStorage). Không gửi dữ liệu học sinh về máy chủ.
const KEY = 'aips:v1';
const SCHEMA = 1;

let state = null;
let timer = null;
let status = 'idle'; // idle | saving | saved | failed
const statusListeners = new Set();

export function newId(prefix = 'id') {
  const rnd = (crypto.getRandomValues ? Array.from(crypto.getRandomValues(new Uint8Array(6))).map((b) => b.toString(16).padStart(2, '0')).join('') : Math.random().toString(16).slice(2, 14));
  return `${prefix}_${Date.now().toString(36)}${rnd}`;
}

function defaultState() {
  return { schema: SCHEMA, profile: null, problems: [] };
}

function migrate(s) {
  if (!s || typeof s !== 'object') return defaultState();
  if (!Array.isArray(s.problems)) s.problems = [];
  if (!s.schema) s.schema = 1;
  // Chỗ để thêm migration khi đổi schema: if (s.schema < 2) {...; s.schema = 2}
  s.problems.forEach(normalizeProblem);
  return s;
}

export function emptyStep() {
  return { status: 'not_started', needsReview: false, completedAt: null, messages: [] };
}

export function emptyData() {
  return {
    category: '',
    problem: '',
    cause: '',
    happy: '',
    known: '',
    guess: '',
    unknown: '',
    goal: '',
    solutions: [],
    aiSuggestions: [],
    analysis: {},
    aiAnalysis: {},
    chosenId: null,
    reason: '',
    plan: [],
    aiPlan: [],
    result: '',
    compare: '',
    worked: '',
    adjust: '',
    satisfaction: 0,
    achieved: '',
    good: '',
    better: '',
    final: ''
  };
}

function normalizeProblem(p) {
  p.steps = p.steps || {};
  for (let i = 1; i <= 6; i++) {
    p.steps[i] = Object.assign(emptyStep(), p.steps[i] || {});
    if (!Array.isArray(p.steps[i].messages)) p.steps[i].messages = [];
  }
  p.data = Object.assign(emptyData(), p.data || {});
  if (!p.currentStep) p.currentStep = 1;
  return p;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      state = defaultState();
    } else {
      try {
        state = migrate(JSON.parse(raw));
      } catch (e) {
        // Dữ liệu hỏng: giữ lại bản gốc, không ghi đè mất dữ liệu.
        try { localStorage.setItem(KEY + ':corrupt-' + Date.now(), raw); } catch (e2) { /* bỏ qua */ }
        state = defaultState();
      }
    }
  } catch (e) {
    state = defaultState();
    setStatus('failed');
  }
  return state;
}

export function get() {
  if (!state) load();
  return state;
}

function setStatus(s) {
  status = s;
  statusListeners.forEach((fn) => fn(s));
}
export function getStatus() {
  return status;
}
export function onStatus(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

export function saveNow() {
  clearTimeout(timer);
  timer = null;
  try {
    const text = JSON.stringify(get());
    localStorage.setItem(KEY, text);
    if (localStorage.getItem(KEY) !== text) throw new Error('verify_failed');
    setStatus('saved');
    return true;
  } catch (e) {
    setStatus('failed');
    return false;
  }
}

export function scheduleSave() {
  setStatus('saving');
  clearTimeout(timer);
  timer = setTimeout(saveNow, 350);
}

export function flush() {
  if (timer) saveNow();
}

// ---------- Hồ sơ ----------
function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  const arr = crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(5)) : Array.from({ length: 5 }, () => Math.floor(Math.random() * 256));
  for (let i = 0; i < 5; i++) s += chars[arr[i] % chars.length];
  return 'HS-' + s;
}

export function getProfile() {
  const p = get().profile;
  // Từ v27 app không thu thập họ tên/lớp: xóa thông tin cũ (nếu có) khỏi thiết bị
  if (p && (p.name || p.cls || !p.anonymous)) { p.name = ''; p.cls = ''; p.anonymous = true; saveNow(); }
  return p;
}

export function setProfile() {
  const s = get();
  const prev = s.profile;
  s.profile = {
    code: prev && prev.code ? prev.code : randomCode(),
    name: '',
    cls: '',
    anonymous: true,
    createdAt: prev ? prev.createdAt : Date.now()
  };
  saveNow();
  return s.profile;
}

// ---------- Vấn đề ----------
export function listProblems() {
  return get().problems.slice().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getProblem(id) {
  return get().problems.find((p) => p.id === id) || null;
}

export function createProblem() {
  const now = Date.now();
  const p = normalizeProblem({
    id: newId('pb'),
    title: 'Vấn đề mới',
    titleAuto: true,
    createdAt: now,
    updatedAt: now,
    currentStep: 1,
    steps: {},
    data: {}
  });
  get().problems.push(p);
  saveNow();
  return p;
}

export function markShared(id, info) {
  const p = getProblem(id);
  if (!p) return;
  p.shared = info || null;
  saveNow();
}

export function deleteProblem(id) {
  const s = get();
  s.problems = s.problems.filter((p) => p.id !== id);
  saveNow();
}

export function renameProblem(id, title) {
  const p = getProblem(id);
  if (!p) return;
  p.title = (title || '').trim().slice(0, 100) || 'Vấn đề mới';
  p.titleAuto = false;
  p.updatedAt = Date.now();
  saveNow();
}

export function stepsDone(p) {
  let n = 0;
  for (let i = 1; i <= 6; i++) if (p.steps[i].status === 'done') n++;
  return n;
}

export function canOpen(p, n) {
  if (n === 1) return true;
  return p.steps[n - 1].status === 'done' || p.steps[n].status !== 'not_started';
}

// Ghi nhận người học đã chỉnh sửa nội dung ở bước n.
export function markEdited(p, n) {
  const st = p.steps[n];
  if (st.status === 'not_started' || st.status === 'done') {
    // Sửa bước đã hoàn thành: bạn cần xác nhận lại, không tự giữ trạng thái cũ.
    st.status = 'in_progress';
    st.completedAt = null;
  }
  for (let s = n + 1; s <= 6; s++) {
    if (p.steps[s].status !== 'not_started') p.steps[s].needsReview = true;
  }
}

// Cập nhật dữ liệu của vấn đề. opts.step: bước đang sửa. opts.soft: không đổi trạng thái bước (vd cập nhật tiến độ việc nhỏ).
export function edit(id, fn, opts = {}) {
  const p = getProblem(id);
  if (!p) return null;
  fn(p.data, p);
  if (opts.step && !opts.soft) markEdited(p, opts.step);
  p.updatedAt = Date.now();
  scheduleSave();
  return p;
}

export function addMessage(id, step, msg) {
  const p = getProblem(id);
  if (!p) return null;
  p.steps[step].messages.push(Object.assign({ ts: Date.now() }, msg));
  if (msg.role === 'user') {
    const st = p.steps[step];
    if (st.status === 'not_started') st.status = 'in_progress';
    if (st.status === 'done') {
      st.status = 'in_progress';
      st.completedAt = null;
    }
  }
  p.updatedAt = Date.now();
  scheduleSave();
  return p;
}

export function completeStep(id, n) {
  const p = getProblem(id);
  if (!p) return;
  p.steps[n].status = 'done';
  p.steps[n].completedAt = Date.now();
  p.steps[n].needsReview = false;
  p.currentStep = Math.min(6, n + 1);
  p.updatedAt = Date.now();
  saveNow();
}

// Học sinh chưa hài lòng: mở lại từ bước n (các bước sau n về trạng thái chưa làm).
export function reopenFrom(id, n, resetFn) {
  const p = getProblem(id);
  if (!p) return;
  for (let i = n; i <= 6; i++) {
    p.steps[i].status = 'not_started';
    p.steps[i].completedAt = null;
    p.steps[i].needsReview = false;
  }
  if (resetFn) resetFn(p.data);
  p.currentStep = n;
  p.updatedAt = Date.now();
  saveNow();
}

export function clearReview(id, n) {
  const p = getProblem(id);
  if (!p) return;
  p.steps[n].needsReview = false;
  p.updatedAt = Date.now();
  saveNow();
}

// ---------- Sao lưu / khôi phục / xóa ----------
export function exportAll() {
  const s = get();
  return {
    app: 'ai-problem-solver',
    schema: SCHEMA,
    exportedAt: new Date().toISOString(),
    profile: s.profile,
    problems: s.problems
  };
}

export function importAll(obj) {
  if (!obj || obj.app !== 'ai-problem-solver' || !Array.isArray(obj.problems)) {
    throw new Error('Tệp này không phải bản sao lưu của AI Problem Solver.');
  }
  const s = get();
  let added = 0;
  let updated = 0;
  obj.problems.forEach((raw) => {
    if (!raw || typeof raw.id !== 'string') return;
    const p = normalizeProblem(raw);
    const idx = s.problems.findIndex((x) => x.id === p.id);
    if (idx === -1) {
      s.problems.push(p);
      added++;
    } else if ((p.updatedAt || 0) > (s.problems[idx].updatedAt || 0)) {
      s.problems[idx] = p;
      updated++;
    }
  });
  if (!s.profile && obj.profile && typeof obj.profile === 'object') {
    s.profile = {
      code: String(obj.profile.code || randomCode()).slice(0, 12),
      name: '',
      cls: '',
      anonymous: true,
      createdAt: obj.profile.createdAt || Date.now()
    };
  }
  if (!saveNow()) throw new Error('Không lưu được dữ liệu khôi phục.');
  return { added, updated };
}

export function clearAll() {
  state = defaultState();
  try {
    localStorage.removeItem(KEY);
    setStatus('idle');
  } catch (e) {
    setStatus('failed');
  }
}
