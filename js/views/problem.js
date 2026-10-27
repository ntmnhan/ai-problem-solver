// Màn hình làm việc: mỗi bước một màn hình, không cuộn trang. Chú cú hỏi một câu, em trả lời, bấm Tiếp.
// Trợ lý AI nằm trong khay "Hỏi trợ lý" (mở khi em cần), không chiếm chỗ của câu hỏi chính.
import { STEPS, CATEGORIES, STATUS_LABEL, TASK_STATUS } from '../config.js';
import * as store from '../store.js';
import * as voice from '../voice.js';
import { askAI, shareProblem } from '../api.js';
import { detectRisk } from '../safety.js';
import { owl, badge, STEP_ICON, STEP_COLOR, CAT_ICON, CAT_COLOR } from '../art.js';
import { voiceInput } from '../voiceui.js';
import { playSfx, sfxOn, setSfx } from '../sound.js';
import { h, icon, btn, clear, autoGrow, toast, modal, confirmDialog, promptDialog, safetyCard } from '../ui.js';

const FEAS = ['Rất khó', 'Khó', 'Vừa', 'Dễ', 'Rất dễ'];

function firstUnfinished(p) {
  for (let i = 1; i <= 6; i++) if (p.steps[i].status !== 'done') return i;
  return 6;
}

export function render(root, params) {
  const id = params.id;
  const first = store.getProblem(id);
  if (!first) {
    root.appendChild(
      h('div', { class: 'card empty' }, owl({ size: 80, mood: 'think' }), h('h2', null, 'Không tìm thấy vấn đề này'),
        h('p', null, 'Có thể vấn đề đã bị xóa hoặc nằm trên thiết bị khác.'),
        h('a', { class: 'btn btn-primary', href: '#/home' }, 'Về danh sách vấn đề'))
    );
    return;
  }
  let n = parseInt(params.step, 10);
  if (!(n >= 1 && n <= 6)) n = firstUnfinished(first);
  if (!store.canOpen(first, n)) {
    let t = n - 1;
    while (t > 1 && !store.canOpen(first, t)) t--;
    location.replace(`#/problem/${id}/${Math.max(1, t)}`);
    return;
  }

  document.body.classList.add('wiz');
  const P = () => store.getProblem(id);
  const S = STEPS[n - 1];
  const refs = {};
  let sub = 0;

  // ---------- Khung ----------
  const titleEl = h('h1', { class: 'wz-title' }, P().title);
  const stepperEl = h('ol', { class: 'stepper', 'aria-label': 'Sáu bước giải quyết vấn đề' });
  const reviewEl = h('div', { class: 'wz-review hidden' });
  const bubbleEl = h('div', { class: 'wz-q' });
  const mainEl = h('div', { class: 'wz-main' });
  const dotsEl = h('div', { class: 'wz-dots' });
  const riskEl = h('div', { class: 'wz-risk hidden', role: 'note' });
  const actionsEl = h('div', { class: 'wz-actions' });
  const sfxBtn = h('button', { type: 'button', id: 'sfx-btn', class: 'icon-btn', title: 'Âm thanh khi chuyển bước' }, icon('spark', 18));
  const drawSfx = () => { sfxBtn.setAttribute('aria-pressed', sfxOn() ? 'true' : 'false'); sfxBtn.setAttribute('aria-label', sfxOn() ? 'Tắt âm thanh chuyển bước' : 'Bật âm thanh chuyển bước'); sfxBtn.classList.toggle('off', !sfxOn()); };
  sfxBtn.addEventListener('click', () => { setSfx(!sfxOn()); drawSfx(); if (sfxOn()) playSfx('step'); });
  drawSfx();
  const AUTO_KEY = 'aips_autoread';
  const autoRead = () => { try { return localStorage.getItem(AUTO_KEY) !== '0'; } catch (e) { return true; } };
  let lastKey = '';
  let reading = false;

  root.appendChild(
    h('div', { class: 'wz' },
      h('div', { class: 'wz-top' },
        h('a', { class: 'icon-btn', href: '#/home', 'aria-label': 'Vấn đề của em', title: 'Vấn đề của em' }, icon('left', 20)),
        titleEl,
        h('button', {
          type: 'button', class: 'icon-btn', 'aria-label': 'Đổi tên vấn đề', title: 'Đổi tên vấn đề',
          onClick: async () => {
            const v = await promptDialog({ title: 'Đổi tên vấn đề', label: 'Tên vấn đề', value: P().title });
            if (v) { store.renameProblem(id, v); titleEl.textContent = P().title; }
          }
        }, icon('edit', 18)),
        sfxBtn,
        h('a', { class: 'icon-btn', href: `#/result/${id}`, 'aria-label': 'Trang kết quả', title: 'Trang kết quả' }, icon('file', 18))
      ),
      stepperEl,
      h('section', { class: 'wz-card' }, reviewEl, bubbleEl, mainEl, dotsEl),
      riskEl,
      actionsEl
    )
  );

  // ---------- Dữ liệu ----------
  function update(fn, soft = false) {
    const p = store.edit(id, fn, { step: n, soft });
    if (p && n === 1 && p.titleAuto) {
      const t = (p.data.problem || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      p.title = t || 'Vấn đề mới';
      titleEl.textContent = p.title;
    }
    refreshMeta();
  }

  function buildContext() {
    const p = P();
    const d = p.data;
    const chosen = d.solutions.find((s) => s.id === d.chosenId);
    return {
      title: p.title === 'Vấn đề mới' ? '' : p.title,
      problem: d.problem, cause: d.cause, goal: d.goal,
      solutions: d.solutions.map((s) => s.text),
      chosen: chosen ? chosen.text : '',
      reason: d.reason,
      plan: d.plan.filter((t) => t.text.trim()).map((t) => `${t.text}${t.time ? ' - ' + t.time : ''} (${TASK_STATUS[t.status] || ''})`),
      final: d.final
    };
  }

  const chatMessages = () => P().steps[n].messages.filter((m) => m.role === 'user' || m.role === 'ai').slice(-14).map((m) => ({ role: m.role, text: m.text }));

  async function aiTask(task, payload) {
    try {
      return await askAI({ step: n, task, context: buildContext(), messages: chatMessages(), payload });
    } catch (e) {
      toast(e.message || 'Chưa gọi được trợ lý.', 'error', 5500);
      return null;
    }
  }

  // ---------- Thanh bước, nhắc xem lại ----------
  function renderStepper() {
    const p = P();
    clear(stepperEl);
    STEPS.forEach((s) => {
      const st = p.steps[s.n];
      const open = store.canOpen(p, s.n);
      const cls = ['step'];
      if (st.status === 'done') cls.push('done');
      else if (st.status === 'in_progress') cls.push('progress');
      if (s.n === n) cls.push('current');
      const label = `Bước ${s.n}: ${s.name} (${STATUS_LABEL[st.status]}${st.needsReview ? ', cần xem lại' : ''})${open ? '' : ' - chưa mở'}`;
      const dotContent = st.status === 'done' ? icon('check', 18) : !open && s.n !== n ? icon('lock', 14) : icon(STEP_ICON[s.n - 1], 18);
      const b = h('button', {
        type: 'button', 'aria-label': label, title: label, disabled: !open && s.n !== n,
        'aria-current': s.n === n ? 'step' : null,
        onClick: () => { if (open && s.n !== n) location.hash = `#/problem/${id}/${s.n}`; }
      }, h('span', { class: 'dot' }, dotContent), h('span', { class: 'lbl' }, s.short));
      stepperEl.appendChild(h('li', { class: cls.join(' ') }, b, st.needsReview ? h('span', { class: 'review', title: 'Cần xem lại' }) : null));
    });
  }

  function renderReview() {
    const st = P().steps[n];
    clear(reviewEl);
    reviewEl.classList.toggle('hidden', !st.needsReview);
    if (!st.needsReview) return;
    reviewEl.append(icon('alert', 18), h('span', null, 'Em vừa sửa bước trước, xem lại bước này còn đúng không nhé.'),
      btn('Em đã xem lại', { small: true, onClick: () => { store.clearReview(id, n); refreshMeta(); } }));
  }

  function refreshMeta() {
    renderStepper();
    renderReview();
    renderActions();
  }

  // ---------- Kiểm tra điều kiện hoàn thành ----------
  function stepReady() {
    const d = P().data;
    if (n === 1 && !d.problem.trim()) return 'Em hãy ghi vấn đề em đang gặp trước nhé.';
    if (n === 2 && !d.cause.trim()) return 'Em hãy trả lời câu hỏi nguyên nhân trước nhé.';
    if (n === 2 && !d.goal.trim()) return 'Em hãy ghi kết quả em mong muốn nhé.';
    if (n === 3 && !d.solutions.some((s) => s.picked && s.text.trim())) return 'Em hãy chọn ít nhất một biện pháp (chạm vào biện pháp để chọn).';
    if (n === 4) {
      if (!d.solutions.some((s) => s.picked && s.id === d.chosenId)) return 'Em hãy tự chọn một biện pháp ở trang cuối.';
      if (!d.reason.trim()) return 'Em hãy viết lý do vì sao em chọn cách đó.';
    }
    if (n === 5 && !d.plan.some((t) => t.text.trim())) return 'Chưa có việc nào trong kế hoạch. Em bấm “Soạn lại” hoặc tự thêm một việc nhé.';
    if (n === 6 && d.happy === 'no') return 'Em chưa hài lòng thì mình quay lại Bước 3 nhé.';
    if (n === 6 && d.happy !== 'yes') return 'Em hãy cho mình biết em có hài lòng không nhé.';
    return null;
  }

  async function confirmComplete() {
    const problem = stepReady();
    if (problem) { toast(problem, 'error', 4500); return; }
    const ok = await confirmDialog({
      title: `Xong Bước ${n} chưa em?`,
      text: 'Em xác nhận nội dung bước này đã hoàn tất. Em vẫn có thể quay lại sửa sau.',
      okLabel: 'Đã xong',
      cancelLabel: 'Chưa, để em xem lại'
    });
    if (!ok) return;
    store.completeStep(id, n);
    toast(`Em đã hoàn thành Bước ${n}.`, 'ok');
    location.hash = n < 6 ? `#/problem/${id}/${n + 1}` : `#/result/${id}`;
  }

  // ---------- Thanh nút dưới ----------
  function renderActions() {
    const st = P().steps[n];
    const total = pageList.length;
    const isLast = sub >= total - 1;
    clear(actionsEl);
    const canBack = sub > 0 || n > 1;
    actionsEl.appendChild(
      canBack
        ? h('button', {
            type: 'button', class: 'btn btn-quiet', 'aria-label': 'Quay lại',
            onClick: () => { if (sub > 0) goPage(sub - 1); else location.hash = `#/problem/${id}/${n - 1}`; }
          }, icon('left', 18), h('span', { class: 'lbl-hide' }, 'Quay lại'))
        : h('span', { class: 'spacer' })
    );
    actionsEl.appendChild(
      n === 1 ? h('span', { class: 'spacer' }) : h('button', { type: 'button', class: 'btn btn-ask', id: 'ask-ai', onClick: openChat }, owl({ size: 26 }), h('span', null, 'Hỏi trợ lý'))
    );
    let next;
    if (!isLast) next = h('button', { type: 'button', class: 'btn btn-primary', onClick: () => goPage(sub + 1) }, h('span', null, 'Tiếp'), icon('right', 18));
    else if (st.status !== 'done') next = h('button', { type: 'button', class: 'btn btn-ok', id: 'finish-step', onClick: confirmComplete }, icon('check', 18), h('span', null, 'Xong bước này'));
    else if (n < 6) next = h('a', { class: 'btn btn-primary', href: `#/problem/${id}/${n + 1}` }, h('span', null, 'Bước tiếp'), icon('right', 18));
    else next = h('a', { class: 'btn btn-primary', href: `#/result/${id}` }, h('span', null, 'Xem kết quả'), icon('right', 18));
    actionsEl.appendChild(next);
  }

  // ---------- Cảnh báo an toàn gọn cho ô nhập chính ----------
  function checkRisk() {
    const texts = [...mainEl.querySelectorAll('textarea, input[type="text"]')].map((e) => e.value).join(' \n ');
    const risky = !!detectRisk(texts);
    riskEl.classList.toggle('hidden', !risky);
    if (!risky) { clear(riskEl); return; }
    if (!riskEl.firstChild) {
      riskEl.append(icon('heart', 18), h('span', null, 'Em ơi, nếu em đang không an toàn, hãy nói với người lớn em tin tưởng hoặc gọi ', h('a', { href: 'tel:111' }, '111'), '.'),
        btn('Xem thêm', { small: true, onClick: () => modal({ title: 'Em không đơn độc', body: safetyCard('danger'), actions: [{ label: 'Đã hiểu', kind: 'primary' }] }) }));
    }
  }

  // ---------- Thành phần nhập ----------
  function textField({ label, key, placeholder, grow = true, small = false, caption = '' }) {
    const ta = h('textarea', { placeholder: placeholder || '', 'aria-label': label, maxlength: 1500 });
    ta.value = P().data[key] || '';
    ta.addEventListener('input', () => { update((d) => { d[key] = ta.value; }); checkRisk(); });
    refs[key] = ta;
    const vi = voiceInput({ ta });
    return h('div', { class: `fld ${grow ? 'grow' : ''} ${small ? 'small' : ''}` },
      caption ? h('span', { class: 'fld-cap' }, caption) : null,
      h('div', { class: 'fld-box' }, ta, vi.btn),
      vi.strip);
  }

  function areaOf(sid, key, label, placeholder) {
    const A = () => Object.assign({ pros: '', cons: '', consequences: '', feasibility: 0 }, P().data.analysis[sid] || {});
    const ta = h('textarea', { placeholder, 'aria-label': label, maxlength: 800 });
    ta.value = A()[key] || '';
    ta.addEventListener('input', () => { setA(sid, { [key]: ta.value }); checkRisk(); });
    const vi = voiceInput({ ta });
    return h('div', { class: 'fld grow small' }, h('span', { class: 'fld-cap' }, label), h('div', { class: 'fld-box' }, ta, vi.btn), vi.strip);
  }

  const setA = (sid, patch) => update((d) => { d.analysis[sid] = Object.assign({ pros: '', cons: '', consequences: '', feasibility: 0 }, d.analysis[sid], patch); });

  function seg(options, current, onPick, labelFn) {
    const wrap = h('div', { class: 'seg', role: 'group' });
    options.forEach((v) => {
      wrap.appendChild(h('button', {
        type: 'button', class: v === current ? 'on' : '', 'aria-pressed': v === current ? 'true' : 'false',
        title: labelFn ? labelFn(v) : null, onClick: () => onPick(v)
      }, String(v)));
    });
    return wrap;
  }

  // ---------- Các trang của từng bước ----------
  function pageStep1() {
    const chips = h('div', { class: 'cat-row', role: 'group', 'aria-label': 'Lĩnh vực của vấn đề' });
    const drawChips = () => {
      clear(chips);
      CATEGORIES.forEach((c) => {
        const on = P().data.category === c;
        chips.appendChild(h('button', {
          type: 'button', class: `cat ${on ? 'sel' : ''}`, 'aria-pressed': on ? 'true' : 'false', style: `--c:${CAT_COLOR[c]}`,
          onClick: () => { update((d) => { d.category = d.category === c ? '' : c; }); drawChips(); }
        }, icon(CAT_ICON[c], 16), h('span', null, c)));
      });
    };
    drawChips();
    return [{
      q: S.title,
      hint: 'Kể ngắn gọn thôi. Em đừng ghi tên thật của người khác nhé.',
      mood: 'happy',
      render: () => h('div', { class: 'col grow' }, chips,
        textField({ label: 'Vấn đề em đang gặp phải là…', key: 'problem', placeholder: 'Em viết vào đây, hoặc bấm micro để nói…' }))
    }];
  }

  function loadingPage(text) {
    return [{ q: text, hint: 'Chờ mình một chút nhé…', mood: 'think', render: () => h('div', { class: 'wz-wait', role: 'status' }, owl({ size: 110, mood: 'think' }), h('span', { class: 'dots-anim' }, '• • •')) }];
  }
  function errorPage(text, retry) {
    return [{ q: text, hint: '', mood: 'think', render: () => h('div', { class: 'wz-empty-card' }, icon('alert', 28), h('p', null, 'Trợ lý đang bận hoặc mạng chưa ổn.'), btn('Thử lại', { kind: 'primary', icon: 'refresh', onClick: retry })) }];
  }
  const pickedSols = () => P().data.solutions.filter((s) => s.picked && s.text.trim());

  const clean = (t) => String(t || '').split('\n').map((l) => l.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean).map((l) => (/[.!?…]$/.test(l) ? l : l + '.')).join(' ');

  function pagesStep2() {
    return [
      { q: 'Theo em, nguyên nhân của vấn đề này là gì?', hint: 'Em nghĩ vì sao chuyện này xảy ra? Đoán cũng được.', mood: 'think', render: () => textField({ label: 'Nguyên nhân em nghĩ là…', key: 'cause', placeholder: 'Em nghĩ là vì…' }) },
      { q: 'Kết quả em mong muốn đạt được là gì?', hint: 'Ví dụ: làm hòa với bạn, điểm môn Toán tốt hơn.', mood: 'happy', render: () => textField({ label: 'Kết quả em mong muốn là…', key: 'goal', placeholder: 'Em muốn…' }) }
    ];
  }

  // ----- Bước 3: AI đề xuất khoảng 3 biện pháp, em chọn (hoặc tự thêm) -----
  function pageStep3() {
    if (busy.suggest && !P().data.solutions.length) return loadingPage('Mình đang nghĩ vài biện pháp cho em…');
    if (fail.suggest && !P().data.solutions.length) return errorPage('Chưa nghĩ ra được biện pháp', () => fetchSuggest());
    return [{
      q: 'Em chọn biện pháp nào?', hint: 'Chạm để chọn một hoặc nhiều cách, hoặc tự thêm cách của em.', mood: 'happy',
      speak: () => 'Em chọn biện pháp nào? Mình gợi ý các cách sau. ' + P().data.solutions.map((x, i) => `Cách ${i + 1}: ${x.text}.`).join(' ') + ' Em chạm vào cách em thích để chọn nhé.',
      render: () => {
        const listEl = h('div', { class: 'pick-list grow', role: 'group', 'aria-label': 'Các biện pháp' });
        const hint = h('p', { class: 'wz-hint' });
        const addInput = h('input', { type: 'text', class: 'input', maxlength: 200, placeholder: 'Em có cách nào khác?', 'aria-label': 'Thêm biện pháp của em' });
        const addVi = voiceInput({ ta: addInput });
        const moreBtn = btn('Gợi ý cách khác', { small: true, icon: 'bulb', onClick: () => fetchSuggest() });
        moreBtn.id = 'more-sug';
        moreBtn.disabled = busy.suggest;
        function drawList() {
          const d = P().data;
          clear(listEl);
          d.solutions.forEach((s, i) => {
            const on = !!s.picked;
            listEl.appendChild(h('div', { class: 'pick-row' },
              h('button', {
                type: 'button', class: `pick ${on ? 'on' : ''}`, 'aria-pressed': on ? 'true' : 'false', 'aria-label': `${on ? 'Đã chọn' : 'Chọn'}: ${s.text}`,
                onClick: () => { update((dd) => { const t = dd.solutions.find((x) => x.id === s.id); if (t) t.picked = !t.picked; }); drawList(); }
              }, h('span', { class: 'num' }, on ? icon('check', 16) : String(i + 1)), h('span', { class: 'pt' }, s.text), s.source === 'ai' ? h('span', { class: 'chip ai tiny' }, 'AI') : null),
              h('button', {
                type: 'button', class: 'icon-btn mini', 'aria-label': `Xóa biện pháp ${i + 1}`,
                onClick: () => { update((dd) => { dd.solutions = dd.solutions.filter((x) => x.id !== s.id); delete dd.analysis[s.id]; delete dd.aiAnalysis[s.id]; if (dd.chosenId === s.id) dd.chosenId = null; }); drawList(); }
              }, icon('trash', 16))));
          });
          if (busy.suggest) listEl.appendChild(h('p', { class: 'ai-wait' }, owl({ size: 36, mood: 'think' }), 'Mình đang nghĩ thêm…'));
          const c = pickedSols().length;
          hint.textContent = c ? `Đã chọn ${c} biện pháp` : 'Chưa chọn biện pháp nào';
        }
        const addNow = () => {
          const t = addInput.value.trim();
          if (!t) return;
          update((dd) => { dd.solutions.push({ id: store.newId('sl'), text: t.slice(0, 200), source: 'me', picked: true }); });
          addInput.value = ''; addInput.focus(); checkRisk(); drawList();
        };
        addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addNow(); } });
        addInput.addEventListener('input', checkRisk);
        sugRedraw = () => { moreBtn.disabled = busy.suggest; drawList(); };
        drawList();
        return h('div', { class: 'col grow' },
          listEl,
          h('div', { class: 'add-row' }, h('div', { class: 'fld-box single' }, addInput, addVi.btn), btn('Thêm', { kind: 'primary', icon: 'plus', onClick: addNow })),
          addVi.strip,
          h('div', { class: 'row-end' }, hint, moreBtn));
      }
    }];
  }

  // ----- Bước 4: ưu điểm, hạn chế của từng biện pháp em đã chọn; rồi em quyết định -----
  function pagesStep4() {
    const sols = pickedSols();
    if (!sols.length) {
      return [{
        q: 'Em chưa chọn biện pháp nào', hint: '', mood: 'think',
        render: () => h('div', { class: 'wz-empty-card' }, icon('bulb', 28), h('p', null, 'Em hãy quay lại Bước 3 để chọn ít nhất một biện pháp nhé.'),
          h('a', { class: 'btn btn-primary', href: `#/problem/${id}/3` }, 'Về Bước 3'))
      }];
    }
    if (busy.analyze) return loadingPage('Mình đang phân tích từng biện pháp…');
    const pages = sols.map((s, i) => ({
      q: `Cách ${i + 1}: ${s.text}`, hint: 'Đây là gợi ý của mình, em có thể sửa lại cho đúng ý em.', mood: 'think', qclass: 'long',
      speak: () => {
        const a = P().data.analysis[s.id] || {};
        return `Cách ${i + 1}: ${s.text}. ` + (a.pros ? `Ưu điểm: ${clean(a.pros)} ` : '') + (a.cons ? `Hạn chế: ${clean(a.cons)}` : '');
      },
      render: () => h('div', { class: 'col grow' },
        areaOf(s.id, 'pros', 'Ưu điểm', 'Cách này tốt ở chỗ…'),
        areaOf(s.id, 'cons', 'Hạn chế', 'Cách này khó ở chỗ…'),
        P().data.aiAnalysis[s.id] ? null : h('div', { class: 'row-end' }, h('span', { class: 'wz-hint' }, 'Chưa có gợi ý từ AI.'), btn('Nhờ AI phân tích', { small: true, icon: 'bulb', onClick: () => fetchAnalysis(true) })))
    }));
    pages.push({
      q: 'Em quyết định chọn cách nào?', hint: 'Em là người quyết định, AI không chọn thay em.', mood: 'cheer',
      speak: () => 'Em quyết định chọn cách nào? ' + pickedSols().map((x, i) => `Cách ${i + 1}: ${x.text}.`).join(' ') + ' Em là người quyết định, mình không chọn thay em.',
      render: () => {
        const listEl = h('div', { class: 'pick-list', role: 'group', 'aria-label': 'Chọn một biện pháp' });
        const draw = () => {
          clear(listEl);
          const d = P().data;
          pickedSols().forEach((s, i) => {
            const on = d.chosenId === s.id;
            listEl.appendChild(h('button', {
              type: 'button', class: `pick ${on ? 'on' : ''}`, 'aria-pressed': on ? 'true' : 'false', 'aria-label': on ? `Em đã chọn: ${s.text}` : `Em chọn biện pháp: ${s.text}`,
              onClick: () => { update((dd) => { dd.chosenId = dd.chosenId === s.id ? null : s.id; }); draw(); }
            }, h('span', { class: 'num' }, on ? icon('check', 16) : String(i + 1)), h('span', { class: 'pt' }, s.text)));
          });
        };
        draw();
        return h('div', { class: 'col grow' }, listEl,
          textField({ label: 'Vì sao cách em chọn phù hợp với em?', key: 'reason', placeholder: 'Em chọn cách này vì…', small: true }));
      }
    });
    return pages;
  }

  // ----- Bước 5: AI hướng dẫn các việc cần làm theo trình tự -----
  const TSTAT = [['todo', 'Chưa làm'], ['doing', 'Đang làm'], ['done', 'Đã xong']];
  function pagesStep5() {
    const d0 = P().data;
    const chosen = d0.solutions.find((s) => s.id === d0.chosenId);
    if (!chosen) {
      return [{
        q: 'Em chưa chọn cách giải quyết', hint: '', mood: 'think',
        render: () => h('div', { class: 'wz-empty-card' }, icon('bulb', 28), h('p', null, 'Em hãy quay lại Bước 4 để chọn một cách nhé.'),
          h('a', { class: 'btn btn-primary', href: `#/problem/${id}/4` }, 'Về Bước 4'))
      }];
    }
    if (busy.plan) return loadingPage('Mình đang soạn các việc cần làm…');
    const overview = {
      q: 'Các việc cần làm theo thứ tự', hint: 'Bấm Tiếp để xem hướng dẫn chi tiết từng việc.', mood: 'cheer',
      speak: () => `Cách em chọn: ${chosen.text}. Các việc cần làm theo thứ tự. ` + P().data.plan.map((t, i) => `Việc ${i + 1}: ${t.text}${t.time ? ', khoảng ' + t.time : ''}.`).join(' '),
      render: () => {
        const listEl = h('ol', { class: 'plan-ov' });
        const addInput = h('input', { type: 'text', class: 'input', maxlength: 200, placeholder: 'Thêm việc của em (không bắt buộc)', 'aria-label': 'Thêm việc' });
        const draw = () => {
          clear(listEl);
          P().data.plan.forEach((t) => listEl.appendChild(h('li', { class: t.status === 'done' ? 'done' : '' }, h('span', { class: 'pt' }, t.text), t.time ? h('span', { class: 'tag-time' }, t.time) : null)));
          if (!P().data.plan.length) listEl.appendChild(h('li', { class: 'muted' }, 'Chưa có việc nào. Em bấm “Soạn lại” hoặc tự thêm nhé.'));
        };
        const addNow = () => {
          const t = addInput.value.trim();
          if (!t) return;
          update((dd) => { dd.plan.push({ id: store.newId('tk'), text: t.slice(0, 200), detail: '', time: '', resource: '', status: 'todo' }); });
          addInput.value = ''; checkRisk(); goPage(0);
        };
        addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addNow(); } });
        draw();
        return h('div', { class: 'col grow' },
          h('div', { class: 'chosen-note' }, icon('check', 16), h('span', null, h('b', null, 'Cách em chọn: '), chosen.text)),
          listEl,
          h('div', { class: 'add-row' }, addInput, btn('Thêm', { icon: 'plus', onClick: addNow })),
          h('div', { class: 'row-end' }, btn('Soạn lại', { small: true, icon: 'refresh', onClick: () => fetchPlan(true) })));
      }
    };
    const pages = [overview];
    P().data.plan.forEach((t, i) => pages.push({
      q: `Việc ${i + 1}: ${t.text}`, hint: t.time ? `Thời gian dự kiến: ${t.time}` : '', mood: 'happy', qclass: 'long',
      speak: () => `Việc ${i + 1}: ${t.text}. ` + (t.detail ? `Cách làm: ${clean(t.detail)} ` : '') + (t.resource ? `Cần: ${t.resource}.` : '') + (t.time ? ` Thời gian dự kiến: ${t.time}.` : ''),
      render: () => {
        const stat = h('div', { class: 'seg tstat', role: 'group', 'aria-label': 'Tình trạng việc này' });
        const drawStat = () => {
          clear(stat);
          const cur = (P().data.plan.find((x) => x.id === t.id) || {}).status;
          TSTAT.forEach(([k, v]) => stat.appendChild(h('button', {
            type: 'button', class: cur === k ? 'on' : '', 'aria-pressed': cur === k ? 'true' : 'false',
            onClick: () => { update((dd) => { const x = dd.plan.find((y) => y.id === t.id); if (x) x.status = k; }, true); drawStat(); }
          }, v)));
        };
        drawStat();
        const body = t.detail
          ? h('div', { class: 'how' }, h('b', null, 'Cách làm'), h('p', null, t.detail))
          : (() => {
            const ta = h('textarea', { placeholder: 'Em sẽ làm như sau…', 'aria-label': 'Cách em sẽ làm việc này', maxlength: 600 });
            ta.addEventListener('input', () => { update((dd) => { const x = dd.plan.find((y) => y.id === t.id); if (x) x.detail = ta.value; }); checkRisk(); });
            const vi = voiceInput({ ta });
            return h('div', { class: 'fld grow small' }, h('span', { class: 'fld-cap' }, 'Cách em sẽ làm việc này'), h('div', { class: 'fld-box' }, ta, vi.btn), vi.strip);
          })();
        return h('div', { class: 'col grow' }, body,
          t.resource ? h('div', { class: 'chosen-note' }, icon('users', 16), h('span', null, h('b', null, 'Cần: '), t.resource)) : null,
          h('div', { class: 'fld-cap' }, 'Em đã làm việc này chưa? (em tự cập nhật)'), stat);
      }
    }));
    return pages;
  }

  // ----- Bước 6: em đánh giá cách giải quyết; chưa hài lòng thì quay lại Bước 3 -----
  async function redoFromStep3() {
    const ok = await confirmDialog({
      title: 'Quay lại Bước 3?',
      text: 'Mình giữ lại các biện pháp cũ để em chọn lại hoặc thêm cách mới. Kế hoạch và đánh giá hiện tại sẽ được làm mới.',
      okLabel: 'Quay lại Bước 3', cancelLabel: 'Ở lại'
    });
    if (!ok) return;
    store.reopenFrom(id, 3, (d) => {
      d.chosenId = null; d.reason = ''; d.plan = []; d.aiPlan = []; d.happy = ''; d.satisfaction = 0; d.final = '';
      d.solutions.forEach((s) => { s.picked = false; });
    });
    location.hash = `#/problem/${id}/3`;
  }

  function pagesStep6() {
    const d0 = P().data;
    const chosen = d0.solutions.find((s) => s.id === d0.chosenId);
    return [
      {
        q: 'Em có hài lòng với cách giải quyết này không?', hint: chosen ? `Cách em chọn: ${chosen.text}` : '', mood: 'think', qclass: 'long',
        render: () => {
          const box = h('div', { class: 'col grow happy-box' });
          const draw = () => {
            clear(box);
            const cur = P().data.happy;
            box.append(
              h('div', { class: 'happy-row', role: 'group', 'aria-label': 'Em có hài lòng không?' },
                h('button', { type: 'button', id: 'happy-yes', class: `happy yes ${cur === 'yes' ? 'on' : ''}`, 'aria-pressed': cur === 'yes' ? 'true' : 'false', onClick: () => { update((d) => { d.happy = 'yes'; }); draw(); refreshMeta(); } }, icon('heart', 26), h('span', null, 'Em hài lòng')),
                h('button', { type: 'button', id: 'happy-no', class: `happy no ${cur === 'no' ? 'on' : ''}`, 'aria-pressed': cur === 'no' ? 'true' : 'false', onClick: () => { update((d) => { d.happy = 'no'; }); draw(); refreshMeta(); } }, icon('refresh', 26), h('span', null, 'Em chưa hài lòng'))),
              cur === 'no'
                ? h('div', { class: 'redo-note' }, h('p', null, 'Không sao đâu em! Mình quay lại Bước 3 để chọn cách khác nhé.'), btn('Quay lại Bước 3', { kind: 'primary', icon: 'left', onClick: redoFromStep3 }))
                : h('span'));
          };
          draw();
          return box;
        }
      },
      {
        q: 'Em cho điểm và viết nhận xét nhé', hint: 'Không bắt buộc, nhưng giúp mình làm tốt hơn.', mood: 'cheer',
        render: () => {
          const satEl = h('div', { class: 'feas' });
          const drawSat = () => {
            clear(satEl);
            satEl.append(h('span', { class: 'fld-cap' }, 'Em cho mấy điểm? (1 = chưa tốt, 5 = rất tốt)'),
              seg([1, 2, 3, 4, 5], P().data.satisfaction, (v) => { update((d) => { d.satisfaction = d.satisfaction === v ? 0 : v; }); drawSat(); }));
          };
          drawSat();
          return h('div', { class: 'col grow' }, satEl, textField({ label: 'Nhận xét của em', key: 'final', placeholder: 'Em thấy cách giải quyết này…' }));
        }
      },
      { q: 'Em có muốn nhờ thầy cô đồng hành thêm không?', hint: 'Không bắt buộc. Chỉ gửi khi em tin tưởng và đồng ý.', mood: 'wave', render: shareCard }
    ];
  }

  // ---------- Trang cuối: gửi cho thầy cô (tùy chọn, cần em tick đồng ý) ----------
  function shareCard() {
    const prof = store.getProfile() || {};
    const last = P().shared || {};
    const nameI = h('input', { type: 'text', class: 'input', maxlength: 60, placeholder: 'Họ và tên (có thể bỏ trống)', 'aria-label': 'Họ và tên', id: 'sh-name', autocomplete: 'off', value: last.name != null ? last.name : (prof.anonymous ? '' : prof.name || '') });
    const clsI = h('input', { type: 'text', class: 'input', maxlength: 20, placeholder: 'Lớp', 'aria-label': 'Lớp', id: 'sh-cls', autocomplete: 'off', value: last.cls != null ? last.cls : (prof.anonymous ? '' : prof.cls || '') });
    const schI = h('input', { type: 'text', class: 'input', maxlength: 80, placeholder: 'Trường', 'aria-label': 'Trường', id: 'sh-school', autocomplete: 'off', value: last.school || '' });
    const chk = h('input', { type: 'checkbox', id: 'sh-ok', checked: false });
    const status = h('div', { class: 'share-status', role: 'status' });
    const sendB = btn(last.at ? 'Gửi lại bản cập nhật' : 'Gửi cho thầy cô', { kind: 'primary', icon: 'send', onClick: send });
    sendB.id = 'sh-send';
    sendB.disabled = true;
    chk.addEventListener('change', () => { sendB.disabled = !chk.checked; });
    const paint = () => {
      clear(status);
      if (P().shared && P().shared.at) {
        status.append(icon('check', 16), h('span', null, 'Đã gửi cho thầy cô lúc ' + new Date(P().shared.at).toLocaleString('vi-VN') + '. Cảm ơn em đã tin tưởng!'));
      }
    };
    async function send() {
      if (!chk.checked) return;
      const d = P().data;
      const ch = d.solutions.find((x) => x.id === d.chosenId);
      sendB.disabled = true;
      try {
        const r = await shareProblem({
          consent: true, id,
          name: nameI.value, cls: clsI.value, school: schI.value,
          category: d.category, title: P().title,
          problem: d.problem, cause: d.cause, goal: d.goal,
          chosen: ch ? ch.text : '', reason: d.reason,
          plan: d.plan.filter((t) => t.text.trim()).map((t, i) => `${i + 1}. ${t.text}${t.time ? ' (' + t.time + ')' : ''}${t.detail ? ': ' + t.detail : ''}`).join('\n'),
          happy: d.happy, final: d.final,
          satisfaction: d.satisfaction, stepsDone: store.stepsDone(P())
        });
        store.markShared(id, { at: (r && r.at) || Date.now(), name: nameI.value.trim(), cls: clsI.value.trim(), school: schI.value.trim() });
        toast('Đã gửi cho thầy cô.', 'ok');
        paint();
        const lbl = sendB.querySelector('span'); if (lbl) lbl.textContent = 'Gửi lại bản cập nhật';
      } catch (e) {
        toast(e.message || 'Chưa gửi được. Em thử lại nhé.', 'error', 5000);
      } finally {
        sendB.disabled = !chk.checked;
      }
    }
    paint();
    return h('div', { class: 'col grow share-card' },
      h('div', { class: 'share-fields' }, nameI, h('div', { class: 'share-row' }, clsI, schI)),
      h('label', { class: 'check share-ok' }, chk,
        h('span', null, 'Em đồng ý gửi vấn đề này (không gồm trò chuyện với AI) cho thầy cô để được hỗ trợ.')),
      sendB, status,
      h('p', { class: 'muted small share-note' }, 'Em có thể bỏ trống họ tên để ẩn danh. Nếu không muốn gửi, em bấm “Xong bước này” là được.'));
  }

  // ---------- AI tự chạy ở các bước 3, 4, 5 (không cần em bấm) ----------
  const busy = { suggest: false, analyze: false, plan: false };
  const fail = { suggest: false, analyze: false, plan: false };
  let alive = true;
  let sugRedraw = null;
  const refreshPages = () => { if (alive) goPage(sub); };

  async function fetchSuggest() {
    if (busy.suggest) return;
    busy.suggest = true; fail.suggest = false;
    if (P().data.solutions.length) { if (sugRedraw) sugRedraw(); } else refreshPages();
    const res = await aiTask('suggest_options', { existing: P().data.solutions.map((s) => s.text) });
    busy.suggest = false;
    if (!alive) return;
    if (res) {
      const opts = (Array.isArray(res.options) ? res.options : []).map((t) => String(t).trim()).filter(Boolean).slice(0, 3);
      update((d) => { opts.forEach((t) => d.solutions.push({ id: store.newId('sl'), text: t.slice(0, 200), source: 'ai', picked: false })); }, true);
      if (!opts.length) fail.suggest = true;
    } else fail.suggest = true;
    refreshPages();
  }

  async function fetchAnalysis(force) {
    const sols = pickedSols();
    const todo = force ? sols : sols.filter((s) => !P().data.aiAnalysis[s.id]);
    if (busy.analyze || !todo.length) return;
    busy.analyze = true; fail.analyze = false;
    refreshPages();
    const res = await aiTask('analyze', { solutions: todo.map((s) => s.text) });
    busy.analyze = false;
    if (!alive) return;
    if (res && Array.isArray(res.items)) {
      const bullets = (arr) => (Array.isArray(arr) ? arr : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 4).map((x) => '- ' + x).join('\n');
      update((d) => {
        todo.forEach((s, i) => {
          const it = res.items[i];
          if (!it) return;
          const cur = d.analysis[s.id] || {};
          d.analysis[s.id] = Object.assign({ pros: '', cons: '', consequences: '', feasibility: 0 }, cur, { pros: bullets(it.pros), cons: bullets(it.cons) });
          d.aiAnalysis[s.id] = true;
        });
      }, true);
    } else fail.analyze = true;
    refreshPages();
  }

  async function fetchPlan(force) {
    const d = P().data;
    const chosen = d.solutions.find((s) => s.id === d.chosenId);
    if (busy.plan || !chosen) return;
    if (force && d.plan.some((t) => t.status !== 'todo')) {
      const ok = await confirmDialog({ title: 'Soạn lại kế hoạch?', text: 'Các việc em đã đánh dấu sẽ bị thay bằng kế hoạch mới.', okLabel: 'Soạn lại', cancelLabel: 'Giữ nguyên' });
      if (!ok) return;
    }
    busy.plan = true; fail.plan = false;
    refreshPages();
    const res = await aiTask('breakdown', { chosen: chosen.text });
    busy.plan = false;
    if (!alive) return;
    const items = res && Array.isArray(res.items)
      ? res.items.slice(0, 6).map((it) => ({ id: store.newId('tk'), text: String(it.text || '').slice(0, 200), detail: String(it.detail || '').slice(0, 600), time: String(it.time || '').slice(0, 60), resource: String(it.resource || '').slice(0, 120), status: 'todo' })).filter((x) => x.text)
      : [];
    if (items.length) update((dd) => { dd.plan = items; dd.aiPlan = []; }, true); else fail.plan = true;
    refreshPages();
  }

  // ---------- Khay trò chuyện với trợ lý ----------
  const chat = buildChat();
  function openChat() {
    modal({
      title: 'Trợ lý AI', titleIcon: owl({ size: 30 }), variant: 'sheet', body: chat.el, headExtra: chat.ttsBtn,
      onClose: () => { voice.stopAll(); chat.vi.reset(); chat.afterClose(); }
    });
    chat.afterOpen();
  }

  function buildChat() {
    const log = h('div', { class: 'chat-log', role: 'log', 'aria-label': 'Cuộc trò chuyện với trợ lý', tabindex: '0' });
    const ta = h('textarea', { rows: 1, placeholder: 'Em muốn nói gì với mình?', 'aria-label': 'Tin nhắn của em', maxlength: 1500 });
    const fit = autoGrow(ta, 120);
    const sendBtn = h('button', { type: 'button', class: 'icon-btn send', 'aria-label': 'Gửi tin nhắn' }, icon('send', 20));
    const vi = voiceInput({ ta, hint: 'Em xem lại chữ, sửa nếu cần rồi bấm Gửi nhé.' });
    const ttsBtn = h('button', { type: 'button', class: 'icon-btn tts', 'aria-pressed': 'true', 'aria-label': 'Đọc phản hồi của trợ lý', title: 'Đọc phản hồi của trợ lý' }, icon('volume', 18));
    let busy = false;
    let readAloud = true;
    if (!voice.supportsTTS) { ttsBtn.classList.add('hidden'); readAloud = false; }
    ttsBtn.addEventListener('click', () => {
      readAloud = !readAloud;
      ttsBtn.setAttribute('aria-pressed', readAloud ? 'true' : 'false');
      ttsBtn.classList.toggle('off', !readAloud);
      if (!readAloud) { voice.stopSpeaking(); vi.setSpeaking(false); }
    });
    ta.addEventListener('input', fit);

    const scroll = () => { log.scrollTop = log.scrollHeight; };

    function bubble(m) {
      const me = m.role === 'user';
      const nodes = [h('div', { class: `msg ${me ? 'me' : 'ai'}` }, h('span', { class: 'who' }, me ? 'Em' : 'Trợ lý'), m.text)];
      const level = me ? (m.risk ? 'concern' : null) : m.risk === 'danger' ? 'danger' : m.risk === 'concern' ? 'concern' : null;
      if (level) nodes.push(safetyCard(level));
      return nodes;
    }

    function drawLog() {
      clear(log);
      log.appendChild(h('div', { class: 'msg ai' }, h('span', { class: 'who' }, 'Trợ lý'), S.intro));
      P().steps[n].messages.forEach((m) => log.append(...bubble(m)));
      scroll();
    }

    async function requestReply(viaVoice = false) {
      if (busy) return;
      busy = true;
      sendBtn.disabled = true;
      const typing = h('div', { class: 'msg ai' }, h('span', { class: 'who' }, 'Trợ lý'),
        h('span', { class: 'typing', role: 'status', 'aria-label': 'Trợ lý đang trả lời' }, h('i'), h('i'), h('i')));
      log.appendChild(typing);
      scroll();
      try {
        const res = await askAI({ step: n, task: 'chat', context: buildContext(), messages: chatMessages() });
        typing.remove();
        const text = String(res.reply || '').trim() || 'Mình chưa nghĩ ra câu trả lời, em nói lại giúp mình nhé.';
        const m = { role: 'ai', text, risk: res.risk || 'none' };
        store.addMessage(id, n, m);
        log.append(...bubble(m));
        if (readAloud && viaVoice && voice.supportsTTS) {
          voice.stopListening(true);
          voice.speak(text, (s) => vi.setSpeaking(s === 'speaking'));
        }
      } catch (e) {
        typing.remove();
        const err = h('div', { class: 'msg err', role: 'alert' }, h('strong', null, 'Chưa gửi được. '), e.message || 'Có lỗi xảy ra.', ' ',
          btn('Thử lại', { small: true, onClick: () => { err.remove(); requestReply(viaVoice); } }));
        log.appendChild(err);
      } finally {
        busy = false;
        sendBtn.disabled = false;
        scroll();
      }
    }

    function send() {
      const text = ta.value.trim();
      if (!text || busy) return;
      voice.stopListening(true);
      const viaVoice = vi.used;
      vi.used = false;
      vi.reset();
      ta.value = '';
      fit();
      const m = { role: 'user', text, risk: detectRisk(text) };
      store.addMessage(id, n, m);
      if (n === 1 && !P().data.problem.trim()) {
        update((d) => { d.problem = text.slice(0, 1500); });
        if (refs.problem) { refs.problem.value = P().data.problem; }
      }
      refreshMeta();
      log.append(...bubble(m));
      scroll();
      requestReply(viaVoice);
    }

    sendBtn.addEventListener('click', send);
    const finePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && finePointer && !e.isComposing) { e.preventDefault(); send(); }
    });

    const el = h('div', { class: 'chat' },
      log,
      vi.strip,
      h('div', { class: 'composer' }, ta, vi.btn, sendBtn),
      h('p', { class: 'chat-note' }, 'Trợ lý là AI nên có thể nhầm. Em đừng ghi họ tên, số điện thoại hay địa chỉ nhé.'));
    drawLog();
    return {
      el, ttsBtn, vi,
      afterOpen: () => { drawLog(); setTimeout(scroll, 30); },
      afterClose: () => { if (refs.problem && n === 1) refs.problem.value = P().data.problem; if (n === 1) goPage(sub); }
    };
  }

  // ---------- Dựng trang ----------
  let pageList = [];
  function buildPages() {
    pageList = [pageStep1, pagesStep2, pageStep3, pagesStep4, pagesStep5, pagesStep6][n - 1]();
  }

  let syncListen = () => {};
  let warnedNoVoice = false;
  function noViVoice() {
    if (warnedNoVoice) return;
    warnedNoVoice = true;
    toast('Máy này chưa có giọng đọc tiếng Việt nên mình không đọc to (tránh đọc bằng giọng tiếng Anh). Em thêm giọng Tiếng Việt trong Cài đặt > Ngôn ngữ > Chuyển văn bản thành giọng nói nhé.', 'info', 9000);
  }
  function readTools(pg) {
    const lb = h('button', { type: 'button', class: 'btn btn-small listen-btn', 'aria-label': 'Nghe đọc nội dung' }, icon('volume', 16), h('span', null, 'Nghe'));
    const cb = h('input', { type: 'checkbox', id: 'auto-read' });
    cb.checked = autoRead();
    cb.addEventListener('change', () => { try { localStorage.setItem(AUTO_KEY, cb.checked ? '1' : '0'); } catch (e) { /* bỏ qua */ } if (!cb.checked) voice.stopSpeaking(); });
    syncListen = () => { lb.querySelector('span').textContent = reading ? 'Dừng' : 'Nghe'; lb.classList.toggle('on', reading); };
    lb.addEventListener('click', () => {
      if (reading) { voice.stopSpeaking(); reading = false; syncListen(); return; }
      voice.speak(pg.speak(), (st) => { reading = st === 'speaking'; syncListen(); if (st === 'novoice') noViVoice(); });
    });
    return h('div', { class: 'qtools' }, lb, h('label', { class: 'auto-read' }, cb, h('span', null, 'Tự đọc')));
  }

  function goPage(i) {
    buildPages();
    sub = Math.max(0, Math.min(i, pageList.length - 1));
    const pg = pageList[sub];
    clear(bubbleEl);
    bubbleEl.append(
      owl({ size: 56, mood: pg.mood || 'happy' }),
      h('div', { class: `bubble ${pg.qclass || ''}` },
        h('div', { class: 'qs' }, h('span', { class: 'qstep', style: `background:${STEP_COLOR[n - 1]}` }, `Bước ${n}`), pg.q),
        pg.hint ? h('div', { class: 'qh' }, pg.hint) : null,
        pg.speak && voice.supportsTTS ? readTools(pg) : null)
    );
    const key = `${n}:${sub}:${pg.q}`;
    if (key !== lastKey) {
      const first = lastKey === '';
      lastKey = key;
      playSfx(first ? 'step' : 'page');
      voice.stopSpeaking();
      if (pg.speak && voice.supportsTTS && autoRead()) setTimeout(() => { if (alive && lastKey === key && !voice.isListening()) voice.speak(pg.speak(), (st) => { reading = st === 'speaking'; syncListen(); if (st === 'novoice') noViVoice(); }); }, 450);
    }
    clear(mainEl);
    mainEl.appendChild(pg.render());
    clear(dotsEl);
    dotsEl.classList.toggle('hidden', pageList.length < 2);
    pageList.forEach((_, k) => {
      dotsEl.appendChild(h('button', { type: 'button', class: `pdot ${k === sub ? 'on' : ''}`, 'aria-label': `Câu ${k + 1} trên ${pageList.length}`, 'aria-current': k === sub ? 'step' : null, onClick: () => goPage(k) }));
    });
    checkRisk();
    refreshMeta();
  }

  goPage(0);
  // AI tự chạy khi em vào bước cần (chỉ khi chưa có nội dung)
  if (n === 3 && !P().data.solutions.length) fetchSuggest();
  if (n === 4) fetchAnalysis(false);
  if (n === 5 && !P().data.plan.length && P().data.chosenId) fetchPlan(false);

  return () => {
    alive = false;
    document.body.classList.remove('wiz');
    voice.stopAll();
  };
}
