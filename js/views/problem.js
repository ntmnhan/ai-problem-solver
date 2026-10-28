// Màn hình làm việc: mỗi bước một màn hình, không cuộn trang. Chú thỏ hỏi một câu, bạn trả lời, bấm Tiếp.
// Trợ lý AI nằm trong khay "Hỏi trợ lý" (mở khi bạn cần), không chiếm chỗ của câu hỏi chính.
import { STEPS, CATEGORIES, STATUS_LABEL, TASK_STATUS } from '../config.js';
import * as store from '../store.js';
import * as voice from '../voice.js';
import { askAI, shareProblem } from '../api.js';
import { detectRisk } from '../safety.js';
import { owl, badge, STEP_ICON, STEP_COLOR, CAT_ICON, CAT_COLOR } from '../art.js';
import { voiceInput } from '../voiceui.js';
import { playSfx, sfxOn, setSfx } from '../sound.js';
import { settingsButton } from '../voicesettings.js';
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
  let lastKey = '';
  let reading = false;

  root.appendChild(
    h('div', { class: 'wz' },
      h('div', { class: 'wz-top' },
        h('a', { class: 'icon-btn', href: '#/home', 'aria-label': 'Vấn đề của bạn', title: 'Vấn đề của bạn' }, icon('left', 20)),
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
    const p = store.edit(id, (d) => { fn(d); if (n === 6) d.final = [d.good && ('Đã tốt: ' + d.good), d.better && ('Cần tốt hơn: ' + d.better)].filter(Boolean).join('\n'); }, { step: n, soft });
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
    reviewEl.append(icon('alert', 18), h('span', null, 'Bạn vừa sửa bước trước, xem lại bước này còn đúng không nhé.'),
      btn('Bạn đã xem lại', { small: true, onClick: () => { store.clearReview(id, n); refreshMeta(); } }));
  }

  function refreshMeta() {
    renderStepper();
    renderReview();
    renderActions();
  }

  // ---------- Kiểm tra điều kiện hoàn thành ----------
  function stepReady() {
    const d = P().data;
    if (n === 1 && !d.problem.trim()) return 'Bạn hãy ghi vấn đề bạn đang gặp trước nhé.';
    if (n === 2 && !d.cause.trim()) return 'Bạn hãy trả lời câu hỏi nguyên nhân trước nhé.';
    if (n === 2 && !d.goal.trim()) return 'Bạn hãy ghi kết quả bạn mong muốn nhé.';
    if (n === 3 && !d.solutions.some((s) => s.picked && s.text.trim())) return 'Bạn hãy chọn ít nhất một biện pháp (chạm vào biện pháp để chọn).';
    if (n === 4) {
      if (!d.solutions.some((s) => s.picked && s.id === d.chosenId)) return 'Bạn hãy tự chọn một biện pháp ở trang cuối.';
    }
    if (n === 5 && !d.plan.some((t) => t.text.trim())) return 'Chưa có việc nào trong kế hoạch. Bạn bấm “Soạn lại” hoặc tự thêm một việc nhé.';
    if (n === 6 && d.happy === 'no') return 'Bạn chưa hài lòng thì mình quay lại Bước 3 nhé.';
    if (n === 6 && d.happy !== 'yes') return 'Bạn hãy cho mình biết bạn có hài lòng không nhé.';
    return null;
  }

  async function confirmComplete() {
    const problem = stepReady();
    if (problem) { toast(problem, 'error', 4500); return; }
    const ok = await confirmDialog({
      title: `Xong Bước ${n} chưa bạn?`,
      text: 'Bạn xác nhận nội dung bước này đã hoàn tất. Bạn vẫn có thể quay lại sửa sau.',
      okLabel: 'Đã xong',
      cancelLabel: 'Chưa, để bạn xem lại'
    });
    if (!ok) return;
    store.completeStep(id, n);
    toast(`Bạn đã hoàn thành Bước ${n}.`, 'ok');
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
      n !== 2 ? h('span', { class: 'spacer' }) : h('button', { type: 'button', class: 'btn btn-ask', id: 'ask-ai', onClick: openChat }, owl({ size: 26 }), h('span', null, 'Hỏi trợ lý'))
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
      riskEl.append(icon('heart', 18), h('span', null, 'Bạn ơi, nếu bạn đang không an toàn, hãy nói với người lớn bạn tin tưởng hoặc gọi ', h('a', { href: 'tel:111' }, '111'), '.'),
        btn('Xem thêm', { small: true, onClick: () => modal({ title: 'Bạn không đơn độc', body: safetyCard('danger'), actions: [{ label: 'Đã hiểu', kind: 'primary' }] }) }));
    }
  }

  // ---------- Thành phần nhập ----------
  function textField({ label, key, placeholder, grow = true, small = false, caption = '' }) {
    const ta = h('textarea', { placeholder: placeholder || '', 'aria-label': label, maxlength: 1500 });
    ta.value = P().data[key] || '';
    const fitTa = autoGrow(ta, 1500); setTimeout(fitTa, 250);
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
    const fitTa = autoGrow(ta, 1500); setTimeout(fitTa, 250);
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
      hint: 'Kể ngắn gọn thôi. Bạn đừng ghi tên thật của người khác nhé.',
      mood: 'happy',
      render: () => h('div', { class: 'col grow' }, chips,
        textField({ label: 'Vấn đề bạn đang gặp phải là…', key: 'problem', placeholder: 'Bạn viết vào đây, hoặc bấm micro để nói…' }))
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
      { q: 'Theo bạn, nguyên nhân của vấn đề này là gì?', hint: 'Bạn nghĩ vì sao chuyện này xảy ra? Đoán cũng được.', mood: 'think', render: () => textField({ label: 'Nguyên nhân bạn nghĩ là…', key: 'cause', placeholder: 'Bạn nghĩ là vì…' }) },
      { q: 'Kết quả bạn mong muốn đạt được là gì?', hint: 'Ví dụ: làm hòa với bạn, điểm môn Toán tốt hơn.', mood: 'happy', render: () => textField({ label: 'Kết quả bạn mong muốn là…', key: 'goal', placeholder: 'Bạn muốn…' }) }
    ];
  }

  // ----- Bước 3: AI đề xuất khoảng 3 biện pháp, bạn chọn (hoặc tự thêm) -----
  function pageStep3() {
    if (busy.suggest && !P().data.solutions.length) return loadingPage('Mình đang nghĩ vài biện pháp cho bạn…');
    if (fail.suggest && !P().data.solutions.length) return errorPage('Chưa nghĩ ra được biện pháp', () => fetchSuggest());
    return [{
      q: 'Bạn chọn biện pháp nào?', hint: 'Bạn có thể chọn NHIỀU cách cùng lúc: chạm vào từng cách bạn thấy hợp. Bạn cũng có thể tự thêm cách của bạn.', mood: 'happy',
      speak: () => 'Bạn chọn biện pháp nào? Mình gợi ý các cách sau. ' + P().data.solutions.map((x, i) => `Cách ${i + 1}: ${x.text}.`).join(' ') + ' Bạn có thể chọn nhiều cách cùng lúc, chạm vào những cách bạn thấy hợp nhé.',
      render: () => {
        const listEl = h('div', { class: 'pick-list grow', role: 'group', 'aria-label': 'Các biện pháp' });
        const hint = h('p', { class: 'wz-hint' });
        const addInput = h('input', { type: 'text', class: 'input', maxlength: 200, placeholder: 'Bạn có cách nào khác?', 'aria-label': 'Thêm biện pháp của bạn' });
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

  // ----- Bước 4: ưu điểm, hạn chế của từng biện pháp bạn đã chọn; rồi bạn quyết định -----
  function pagesStep4() {
    const sols = pickedSols();
    if (!sols.length) {
      return [{
        q: 'Bạn chưa chọn biện pháp nào', hint: '', mood: 'think',
        render: () => h('div', { class: 'wz-empty-card' }, icon('bulb', 28), h('p', null, 'Bạn hãy quay lại Bước 3 để chọn ít nhất một biện pháp nhé.'),
          h('a', { class: 'btn btn-primary', href: `#/problem/${id}/3` }, 'Về Bước 3'))
      }];
    }
    if (busy.analyze) return loadingPage('Mình đang phân tích từng biện pháp…');
    const pages = sols.map((s, i) => ({
      q: `Cách ${i + 1}: ${s.text}`, hint: 'Đây là gợi ý của mình, bạn có thể sửa lại cho đúng ý bạn.', mood: 'think', qclass: 'long',
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
      q: 'Bạn quyết định chọn cách nào?', hint: 'Bạn là người quyết định, AI không chọn thay bạn. Phần lý do bên dưới không bắt buộc.', mood: 'cheer',
      speak: () => 'Bạn quyết định chọn cách nào? ' + pickedSols().map((x, i) => `Cách ${i + 1}: ${x.text}.`).join(' ') + ' Bạn là người quyết định, mình không chọn thay bạn.',
      render: () => {
        const listEl = h('div', { class: 'pick-list grow', role: 'group', 'aria-label': 'Chọn một biện pháp' });
        const draw = () => {
          clear(listEl);
          const d = P().data;
          pickedSols().forEach((s, i) => {
            const on = d.chosenId === s.id;
            listEl.appendChild(h('button', {
              type: 'button', class: `pick ${on ? 'on' : ''}`, 'aria-pressed': on ? 'true' : 'false', 'aria-label': on ? `Bạn đã chọn: ${s.text}` : `Bạn chọn biện pháp: ${s.text}`,
              onClick: () => { update((dd) => { dd.chosenId = dd.chosenId === s.id ? null : s.id; }); draw(); }
            }, h('span', { class: 'num' }, on ? icon('check', 16) : String(i + 1)), h('span', { class: 'pt' }, s.text)));
          });
        };
        draw();
        return h('div', { class: 'col grow' }, listEl,
          textField({ label: 'Vì sao cách bạn chọn phù hợp với bạn? (không bắt buộc, bạn có thể bỏ qua)', key: 'reason', placeholder: 'Bạn chọn cách này vì… (có thể để trống)', small: true, grow: false }));
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
        q: 'Bạn chưa chọn cách giải quyết', hint: '', mood: 'think',
        render: () => h('div', { class: 'wz-empty-card' }, icon('bulb', 28), h('p', null, 'Bạn hãy quay lại Bước 4 để chọn một cách nhé.'),
          h('a', { class: 'btn btn-primary', href: `#/problem/${id}/4` }, 'Về Bước 4'))
      }];
    }
    if (busy.plan) return loadingPage('Mình đang soạn các việc cần làm…');
    const overview = {
      q: 'Các việc cần làm theo thứ tự', hint: 'Bấm Tiếp để xem hướng dẫn chi tiết từng việc.', mood: 'cheer',
      speak: () => `Cách bạn chọn: ${chosen.text}. Các việc cần làm theo thứ tự. ` + P().data.plan.map((t, i) => `Việc ${i + 1}: ${t.text}${t.time ? ', khoảng ' + t.time : ''}.`).join(' '),
      render: () => {
        const listEl = h('ol', { class: 'plan-ov' });
        const addInput = h('input', { type: 'text', class: 'input', maxlength: 200, placeholder: 'Thêm việc của bạn (không bắt buộc)', 'aria-label': 'Thêm việc' });
        const draw = () => {
          clear(listEl);
          P().data.plan.forEach((t) => listEl.appendChild(h('li', { class: t.status === 'done' ? 'done' : '' }, h('span', { class: 'pt' }, t.text), t.time ? h('span', { class: 'tag-time' }, t.time) : null)));
          if (!P().data.plan.length) listEl.appendChild(h('li', { class: 'muted' }, 'Chưa có việc nào. Bạn bấm “Soạn lại” hoặc tự thêm nhé.'));
        };
        const addNow = () => {
          const t = addInput.value.trim();
          if (!t) return;
          update((dd) => { dd.plan.push({ id: store.newId('tk'), text: t.slice(0, 200), detail: '', time: '', resource: '', expect: '', backup: '', status: 'todo' }); });
          addInput.value = ''; checkRisk(); goPage(0);
        };
        addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addNow(); } });
        draw();
        return h('div', { class: 'col grow' },
          h('div', { class: 'chosen-note' }, icon('check', 16), h('span', null, h('b', null, 'Cách bạn chọn: '), chosen.text)),
          listEl,
          h('div', { class: 'add-row' }, addInput, btn('Thêm', { icon: 'plus', onClick: addNow })),
          h('div', { class: 'row-end' }, btn('Soạn lại', { small: true, icon: 'refresh', onClick: () => fetchPlan(true) })));
      }
    };
    const pages = [overview];
    P().data.plan.forEach((t, i) => pages.push({
      q: `Việc ${i + 1}: ${t.text}`, hint: t.time ? `Thời gian dự kiến: ${t.time}` : '', mood: 'happy', qclass: 'long',
      speak: () => `Việc ${i + 1}: ${t.text}. ` + (t.detail ? `Cách làm: ${clean(t.detail)} ` : '') + (t.expect ? `Làm xong, bạn sẽ: ${clean(t.expect)} ` : '') + (t.backup ? `Nếu chưa được: ${clean(t.backup)} ` : '') + (t.resource ? `Cần: ${t.resource}.` : '') + (t.time ? ` Thời gian dự kiến: ${t.time}.` : ''),
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
            const ta = h('textarea', { placeholder: 'Bạn sẽ làm như sau…', 'aria-label': 'Cách bạn sẽ làm việc này', maxlength: 600 });
            autoGrow(ta, 1500);
            ta.addEventListener('input', () => { update((dd) => { const x = dd.plan.find((y) => y.id === t.id); if (x) x.detail = ta.value; }); checkRisk(); });
            const vi = voiceInput({ ta });
            return h('div', { class: 'fld grow small' }, h('span', { class: 'fld-cap' }, 'Cách bạn sẽ làm việc này'), h('div', { class: 'fld-box' }, ta, vi.btn), vi.strip);
          })();
        return h('div', { class: 'col grow' }, body,
          t.expect ? h('div', { class: 'chosen-note' }, icon('target', 16), h('span', null, h('b', null, 'Làm xong, bạn sẽ: '), t.expect)) : null,
          t.backup ? h('div', { class: 'chosen-note warn' }, icon('refresh', 16), h('span', null, h('b', null, 'Nếu chưa được: '), t.backup)) : null,
          t.resource ? h('div', { class: 'chosen-note' }, icon('users', 16), h('span', null, h('b', null, 'Cần: '), t.resource)) : null,
          h('div', { class: 'fld-cap' }, 'Bạn đã làm việc này chưa? (bạn tự cập nhật)'), stat);
      }
    }));
    return pages;
  }

  // ----- Bước 6: bạn đánh giá cách giải quyết; chưa hài lòng thì quay lại Bước 3 -----
  async function redoFromStep3() {
    const ok = await confirmDialog({
      title: 'Quay lại Bước 3?',
      text: 'Mình giữ lại các biện pháp cũ để bạn chọn lại hoặc thêm cách mới. Kế hoạch và đánh giá hiện tại sẽ được làm mới.',
      okLabel: 'Quay lại Bước 3', cancelLabel: 'Ở lại'
    });
    if (!ok) return;
    store.reopenFrom(id, 3, (d) => {
      d.chosenId = null; d.reason = ''; d.plan = []; d.aiPlan = []; d.happy = ''; d.achieved = ''; d.good = ''; d.better = ''; d.satisfaction = 0; d.final = '';
      d.solutions.forEach((s) => { s.picked = false; });
    });
    location.hash = `#/problem/${id}/3`;
  }

  function pagesStep6() {
    const d0 = P().data;
    const chosen = d0.solutions.find((s) => s.id === d0.chosenId);
    const ACH = [['yes', 'Đã đạt'], ['part', 'Đạt một phần'], ['no', 'Chưa đạt']];
    return [
      {
        q: 'Nhìn lại kế hoạch của bạn', hint: d0.goal ? `Kết quả bạn mong muốn: ${d0.goal}` : 'Bạn đã làm được những việc nào rồi?', mood: 'think', qclass: 'long',
        render: () => {
          const listEl = h('div', { class: 'rv-list' });
          const achEl = h('div', { class: 'seg tstat', role: 'group', 'aria-label': 'Bạn đạt được kết quả mong muốn chưa?' });
          const draw = () => {
            clear(listEl); clear(achEl);
            P().data.plan.filter((t) => t.text.trim()).forEach((t, i) => {
              const next = () => TSTAT[(TSTAT.findIndex(([k]) => k === t.status) + 1) % TSTAT.length][0];
              const lab = (TSTAT.find(([k]) => k === t.status) || TSTAT[0])[1];
              listEl.appendChild(h('div', { class: 'rv-row' },
                h('span', { class: 'rv-t' }, `${i + 1}. ${t.text}`),
                h('button', { type: 'button', class: `rv-chip ${t.status}`, 'aria-label': `Việc ${i + 1}: ${lab}. Chạm để đổi tình trạng`, onClick: () => { update((dd) => { const x = dd.plan.find((y) => y.id === t.id); if (x) x.status = next(); }, true); draw(); } }, lab)));
            });
            if (!listEl.firstChild) listEl.appendChild(h('p', { class: 'muted' }, 'Chưa có việc nào trong kế hoạch.'));
            const cur = P().data.achieved;
            ACH.forEach(([k, v]) => achEl.appendChild(h('button', { type: 'button', class: cur === k ? 'on' : '', 'aria-pressed': cur === k ? 'true' : 'false', onClick: () => { update((dd) => { dd.achieved = dd.achieved === k ? '' : k; }); draw(); } }, v)));
          };
          draw();
          return h('div', { class: 'col grow' }, listEl, h('p', { class: 'wz-hint' }, 'Chạm vào tình trạng để đổi.'), h('div', { class: 'fld-cap' }, 'Bạn đạt được kết quả mong muốn chưa? (không bắt buộc)'), achEl);
        }
      },
      {
        q: 'Bạn có hài lòng với cách giải quyết này không?', hint: chosen ? `Cách bạn chọn: ${chosen.text}` : '', mood: 'think', qclass: 'long',
        render: () => {
          const box = h('div', { class: 'col grow happy-box' });
          const draw = () => {
            clear(box);
            const cur = P().data.happy;
            box.append(
              h('div', { class: 'happy-row', role: 'group', 'aria-label': 'Bạn có hài lòng không?' },
                h('button', { type: 'button', id: 'happy-yes', class: `happy yes ${cur === 'yes' ? 'on' : ''}`, 'aria-pressed': cur === 'yes' ? 'true' : 'false', onClick: () => { update((d) => { d.happy = 'yes'; }); draw(); refreshMeta(); } }, icon('heart', 26), h('span', null, 'Bạn hài lòng')),
                h('button', { type: 'button', id: 'happy-no', class: `happy no ${cur === 'no' ? 'on' : ''}`, 'aria-pressed': cur === 'no' ? 'true' : 'false', onClick: () => { update((d) => { d.happy = 'no'; }); draw(); refreshMeta(); } }, icon('refresh', 26), h('span', null, 'Bạn chưa hài lòng'))),
              cur === 'no'
                ? h('div', { class: 'redo-note' }, h('p', null, 'Không sao đâu bạn! Mình quay lại Bước 3 để chọn cách khác nhé.'), btn('Quay lại Bước 3', { kind: 'primary', icon: 'left', onClick: redoFromStep3 }))
                : h('span'));
          };
          draw();
          return box;
        }
      },
      {
        q: 'Cái gì đã tốt? Cái gì cần tốt hơn?', hint: 'Không bắt buộc, nhưng giúp bạn rút kinh nghiệm cho lần sau.', mood: 'cheer',
        render: () => h('div', { class: 'col grow' },
          textField({ label: 'Điều đã làm tốt', key: 'good', placeholder: 'Bạn thấy mình đã làm tốt…', small: true }),
          textField({ label: 'Điều cần làm tốt hơn', key: 'better', placeholder: 'Lần sau bạn sẽ cố gắng…', small: true }))
      },
      {
        q: 'Bạn cho mấy điểm cho cách giải quyết này?', hint: '1 = chưa tốt, 5 = rất tốt. Không bắt buộc.', mood: 'happy',
        render: () => {
          const satEl = h('div', { class: 'feas' });
          const drawSat = () => {
            clear(satEl);
            satEl.append(seg([1, 2, 3, 4, 5], P().data.satisfaction, (v) => { update((d) => { d.satisfaction = d.satisfaction === v ? 0 : v; }); drawSat(); }));
          };
          drawSat();
          return h('div', { class: 'col grow' }, satEl);
        }
      },
      { q: 'Bạn có muốn nhờ thầy cô đồng hành thêm không?', hint: 'Không bắt buộc. Chỉ gửi khi bạn tin tưởng và đồng ý.', mood: 'wave', render: shareCard }
    ];
  }

  // ---------- Trang cuối: gửi cho thầy cô (tùy chọn, cần bạn tick đồng ý) ----------
  function shareCard() {
    const prof = store.getProfile() || {};
    const last = P().shared || {};
    const chk = h('input', { type: 'checkbox', id: 'sh-ok', checked: false });
    const status = h('div', { class: 'share-status', role: 'status' });
    const sendB = btn(last.at ? 'Gửi lại bản cập nhật' : 'Gửi cho thầy cô', { kind: 'primary', icon: 'send', onClick: send });
    sendB.id = 'sh-send';
    sendB.disabled = true;
    chk.addEventListener('change', () => { sendB.disabled = !chk.checked; });
    const paint = () => {
      clear(status);
      if (P().shared && P().shared.at) {
        status.append(icon('check', 16), h('span', null, 'Đã gửi cho thầy cô lúc ' + new Date(P().shared.at).toLocaleString('vi-VN') + '. Cảm ơn bạn đã tin tưởng!'));
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
          code: prof.code || '',
          category: d.category, title: P().title,
          problem: d.problem, cause: d.cause, goal: d.goal,
          chosen: ch ? ch.text : '', reason: d.reason,
          plan: d.plan.filter((t) => t.text.trim()).map((t, i) => `${i + 1}. ${t.text}${t.time ? ' (' + t.time + ')' : ''}${t.detail ? ': ' + t.detail : ''}${t.backup ? ' (Nếu chưa được: ' + t.backup + ')' : ''}`).join('\n'),
          happy: d.happy, final: d.final,
          satisfaction: d.satisfaction, stepsDone: store.stepsDone(P())
        });
        store.markShared(id, { at: (r && r.at) || Date.now() });
        toast('Đã gửi cho thầy cô.', 'ok');
        paint();
        const lbl = sendB.querySelector('span'); if (lbl) lbl.textContent = 'Gửi lại bản cập nhật';
      } catch (e) {
        toast(e.message || 'Chưa gửi được. Bạn thử lại nhé.', 'error', 5000);
      } finally {
        sendB.disabled = !chk.checked;
      }
    }
    paint();
    return h('div', { class: 'col grow share-card' },
      h('p', { class: 'muted small share-note' }, `Chỉ thầy cô tư vấn của trường xem được nội dung bạn gửi, kèm mã ẩn danh (${prof.code || ''}); không có họ tên, lớp hay trường. Nhóm học sinh quản trị chỉ thấy thống kê chung.`),
      h('label', { class: 'check share-ok' }, chk,
        h('span', null, 'Bạn đồng ý gửi vấn đề này (không gồm trò chuyện với AI) cho thầy cô để được hỗ trợ.')),
      sendB, status,
      h('p', { class: 'muted small share-note' }, 'Bạn kiểm tra nội dung, đừng để lộ họ tên, số điện thoại, địa chỉ của bạn hay người khác. Nếu không muốn gửi, bạn bấm “Xong bước này” là được.'));
  }

  // ---------- AI tự chạy ở các bước 3, 4, 5 (không cần bạn bấm) ----------
  const busy = { suggest: false, analyze: false, plan: false };
  const fail = { suggest: false, analyze: false, plan: false };
  let alive = true;
  let sugRedraw = null;
  const refreshPages = () => { if (alive) goPage(sub); };

  // Bỏ các ý quá giống nhau (so sánh tập từ), để các biện pháp / việc không lặp lại.
  let NON_WORD = null;
  try { NON_WORD = new RegExp('[^\\p{L}\\p{N}\\s]', 'gu'); } catch (e) { NON_WORD = /[.,;:!?"'()\[\]{}\-–—…]/g; } // trình duyệt cũ không hỗ trợ \p{L}
  const words = (t) => new Set(String(t || '').toLowerCase().replace(NON_WORD, ' ').split(/\s+/).filter((w) => w.length > 1));
  const similar = (a, b) => {
    const A = words(a), B = words(b);
    if (!A.size || !B.size) return false;
    let inter = 0;
    A.forEach((w) => { if (B.has(w)) inter++; });
    return inter / Math.min(A.size, B.size) >= 0.7 && inter / (A.size + B.size - inter) >= 0.5;
  };
  function dedupe(list, key, seed = []) {
    const kept = [];
    list.forEach((x) => {
      const k = key(x);
      if (![...seed, ...kept.map(key)].some((o) => similar(o, k))) kept.push(x);
    });
    return kept;
  }

  async function fetchSuggest() {
    if (busy.suggest) return;
    busy.suggest = true; fail.suggest = false;
    if (P().data.solutions.length) { if (sugRedraw) sugRedraw(); } else refreshPages();
    const res = await aiTask('suggest_options', { existing: P().data.solutions.map((s) => s.text) });
    busy.suggest = false;
    if (!alive) return;
    if (res) {
      const have = P().data.solutions.map((x) => x.text);
      const opts = dedupe((Array.isArray(res.options) ? res.options : []).map((t) => String(t).trim()).filter(Boolean), (t) => t, have).slice(0, 5);
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
      const ok = await confirmDialog({ title: 'Soạn lại kế hoạch?', text: 'Các việc bạn đã đánh dấu sẽ bị thay bằng kế hoạch mới.', okLabel: 'Soạn lại', cancelLabel: 'Giữ nguyên' });
      if (!ok) return;
    }
    busy.plan = true; fail.plan = false;
    refreshPages();
    const res = await aiTask('breakdown', { chosen: chosen.text });
    busy.plan = false;
    if (!alive) return;
    const items = res && Array.isArray(res.items)
      ? dedupe(res.items.map((it) => ({ id: store.newId('tk'), text: String(it.text || '').slice(0, 200), detail: String(it.detail || '').slice(0, 700), time: String(it.time || '').slice(0, 60), resource: String(it.resource || '').slice(0, 120), expect: String(it.expect || '').slice(0, 250), backup: String(it.backup || '').slice(0, 250), status: 'todo' })).filter((x) => x.text), (x) => x.text + ' ' + x.detail).slice(0, 6)
      : [];
    if (items.length) update((dd) => { dd.plan = items; dd.aiPlan = []; }, true); else fail.plan = true;
    refreshPages();
  }

  // ---------- Khay trò chuyện với trợ lý ----------
  // Chỉ có ở Bước 2 và tối đa 8 lượt hỏi cho mỗi vấn đề (các bước 3-6 AI đã tự gợi ý, bạn tự quyết định)
  const CHAT_LIMIT = 8;
  const chatUsed = () => P().steps[n].messages.filter((m) => m.role === 'user').length;

  const chat = buildChat();
  function openChat() {
    modal({
      title: 'Trợ lý AI', titleIcon: owl({ size: 30 }), variant: 'sheet', body: chat.el, headExtra: settingsButton(),
      onClose: () => { voice.stopAll(); chat.vi.reset(); chat.afterClose(); }
    });
    chat.afterOpen();
  }

  function buildChat() {
    const log = h('div', { class: 'chat-log', role: 'log', 'aria-label': 'Cuộc trò chuyện với trợ lý', tabindex: '0' });
    const ta = h('textarea', { rows: 1, placeholder: 'Bạn muốn nói gì với mình?', 'aria-label': 'Tin nhắn của bạn', maxlength: 1500 });
    const fit = autoGrow(ta, 120);
    const sendBtn = h('button', { type: 'button', class: 'icon-btn send', 'aria-label': 'Gửi tin nhắn' }, icon('send', 20));
    const vi = voiceInput({ ta, hint: 'Bạn xem lại chữ, sửa nếu cần rồi bấm Gửi nhé.' });
    let busy = false;
    const limitNote = h('p', { class: 'banner info chat-limit hidden', role: 'status' }, 'Bạn đã dùng hết ' + CHAT_LIMIT + ' lượt hỏi trợ lý ở bước này. Bạn hãy tự ghi lại điều bạn nghĩ vào ô câu hỏi, hoặc nói chuyện với thầy cô hay người lớn bạn tin tưởng nhé.');
    const syncLimit = () => {
      const full = chatUsed() >= CHAT_LIMIT;
      limitNote.classList.toggle('hidden', !full);
      ta.disabled = full; sendBtn.disabled = full || busy; vi.btn.disabled = full;
      ta.placeholder = full ? 'Đã hết lượt hỏi trợ lý' : 'Bạn muốn nói gì với mình?';
    };
    ta.addEventListener('input', fit);

    const scroll = () => { log.scrollTop = log.scrollHeight; };

    function bubble(m) {
      const me = m.role === 'user';
      const listen = !me && voice.supportsTTS ? h('button', { type: 'button', class: 'msg-listen', 'aria-label': 'Nghe câu trả lời này' }, icon('volume', 14), h('span', null, 'Nghe')) : null;
      if (listen) listen.addEventListener('click', () => { voice.stopListening(true); voice.speak(m.text, (s) => { vi.setSpeaking(s === 'speaking'); if (s === 'novoice') noViVoice(); }); });
      const nodes = [h('div', { class: `msg ${me ? 'me' : 'ai'}` }, h('span', { class: 'who' }, me ? 'Bạn' : 'Trợ lý'), m.text, listen)];
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
        const text = String(res.reply || '').trim() || 'Mình chưa nghĩ ra câu trả lời, bạn nói lại giúp mình nhé.';
        const m = { role: 'ai', text, risk: res.risk || 'none' };
        store.addMessage(id, n, m);
        log.append(...bubble(m));
      } catch (e) {
        typing.remove();
        const err = h('div', { class: 'msg err', role: 'alert' }, h('strong', null, 'Chưa gửi được. '), e.message || 'Có lỗi xảy ra.', ' ',
          btn('Thử lại', { small: true, onClick: () => { err.remove(); requestReply(viaVoice); } }));
        log.appendChild(err);
      } finally {
        busy = false;
        sendBtn.disabled = chatUsed() >= CHAT_LIMIT;
        scroll();
      }
    }

    function send() {
      const text = ta.value.trim();
      if (!text || busy || chatUsed() >= CHAT_LIMIT) return;
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
      syncLimit();
      requestReply(viaVoice);
    }

    sendBtn.addEventListener('click', send);
    const finePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && finePointer && !e.isComposing) { e.preventDefault(); send(); }
    });

    const el = h('div', { class: 'chat' },
      log,
      limitNote,
      vi.strip,
      h('div', { class: 'composer' }, ta, vi.btn, sendBtn),
      h('p', { class: 'chat-note' }, 'Trợ lý là AI nên có thể nhầm. Bạn đừng ghi họ tên, số điện thoại hay địa chỉ nhé. Mỗi vấn đề có tối đa ' + CHAT_LIMIT + ' lượt hỏi.'));
    drawLog();
    return {
      el, vi,
      afterOpen: () => { drawLog(); syncLimit(); setTimeout(scroll, 30); },
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
    toast('Máy này chưa có giọng đọc tiếng Việt nên mình không đọc to (tránh đọc bằng giọng tiếng Anh). Bạn mở bằng Microsoft Edge hoặc thêm giọng Tiếng Việt cho máy; cách làm có trong mục Hướng dẫn sử dụng (Nghe AI đọc).', 'info', 9000);
  }
  function readTools(pg) {
    const lb = h('button', { type: 'button', class: 'btn btn-small listen-btn', 'aria-label': 'Nghe đọc nội dung' }, icon('volume', 16), h('span', { class: 'lt' }, 'Nghe'));
    syncListen = () => { lb.querySelector('.lt').textContent = reading ? 'Dừng' : 'Nghe'; lb.classList.toggle('on', reading); };
    lb.addEventListener('click', () => {
      if (reading) { voice.stopSpeaking(); reading = false; syncListen(); return; }
      voice.speak(pg.speak(), (st) => { reading = st === 'speaking'; syncListen(); if (st === 'novoice') noViVoice(); });
    });
    return h('div', { class: 'qtools' }, lb, settingsButton());
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
  // AI tự chạy khi bạn vào bước cần (chỉ khi chưa có nội dung)
  if (n === 3 && !P().data.solutions.length) fetchSuggest();
  if (n === 4) fetchAnalysis(false);
  if (n === 5 && !P().data.plan.length && P().data.chosenId) fetchPlan(false);

  return () => {
    alive = false;
    document.body.classList.remove('wiz');
    voice.stopAll();
  };
}
