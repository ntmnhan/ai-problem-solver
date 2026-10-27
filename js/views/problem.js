// Màn hình làm việc: mỗi bước một màn hình, không cuộn trang. Chú cú hỏi một câu, em trả lời, bấm Tiếp.
// Trợ lý AI nằm trong khay "Hỏi trợ lý" (mở khi em cần), không chiếm chỗ của câu hỏi chính.
import { STEPS, CATEGORIES, STATUS_LABEL, TASK_STATUS } from '../config.js';
import * as store from '../store.js';
import * as voice from '../voice.js';
import { askAI, shareProblem } from '../api.js';
import { detectRisk } from '../safety.js';
import { owl, badge, STEP_ICON, STEP_COLOR, CAT_ICON, CAT_COLOR } from '../art.js';
import { voiceInput } from '../voiceui.js';
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
      problem: d.problem, known: d.known, guess: d.guess, unknown: d.unknown, goal: d.goal,
      solutions: d.solutions.map((s) => s.text),
      chosen: chosen ? chosen.text : '',
      reason: d.reason,
      plan: d.plan.filter((t) => t.text.trim()).map((t) => `${t.text}${t.time ? ' - ' + t.time : ''} (${TASK_STATUS[t.status] || ''})`),
      result: d.result
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
    if (n === 2 && !(d.known.trim() || d.guess.trim() || d.unknown.trim())) return 'Em hãy điền ít nhất một trong ba ô: đã biết, đang đoán, chưa rõ.';
    if (n === 3 && !d.solutions.some((s) => s.text.trim())) return 'Em hãy ghi ít nhất một phương án.';
    if (n === 4) {
      if (!d.solutions.some((s) => s.id === d.chosenId)) return 'Em hãy tự chọn một phương án ở trang cuối.';
      if (!d.reason.trim()) return 'Em hãy viết lý do vì sao em chọn phương án đó.';
    }
    if (n === 5 && !d.plan.some((t) => t.text.trim())) return 'Em hãy ghi ít nhất một việc nhỏ trong kế hoạch.';
    if (n === 6 && !(d.result.trim() && d.final.trim())) return 'Em hãy điền “Kết quả thực tế” và “Kết luận của em”.';
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
      h('button', { type: 'button', class: 'btn btn-ask', id: 'ask-ai', onClick: openChat }, owl({ size: 26 }), h('span', null, 'Hỏi trợ lý'))
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

  function pagesStep2() {
    const mk = (q, hint, key, label, ph, caption) => ({ q, hint, mood: 'think', render: () => textField({ label, key, placeholder: ph, caption }) });
    return [
      mk('Điều gì em biết chắc?', 'Những chuyện đã xảy ra thật.', 'known', 'Điều em đã biết (chắc chắn)', 'Em biết chắc rằng…'),
      mk('Điều gì em đang đoán?', 'Em nghĩ có thể, nhưng chưa chắc.', 'guess', 'Điều em đang suy đoán', 'Em đoán là…'),
      mk('Điều gì em chưa rõ?', 'Em muốn tìm hiểu thêm điều gì?', 'unknown', 'Điều còn chưa rõ', 'Em chưa biết…'),
      mk('Em muốn kết quả ra sao?', 'Đó là mục tiêu của em, ví dụ: làm hòa với bạn.', 'goal', 'Mục tiêu của em', 'Em muốn…')
    ];
  }

  function pageStep3() {
    return [{
      q: 'Em có thể làm gì?', hint: 'Nghĩ gì ghi nấy, chưa cần hoàn hảo.', mood: 'happy',
      render: () => {
        const listEl = h('div', { class: 'sol-list' });
        const hint = h('p', { class: 'wz-hint' });
        const addInput = h('input', { type: 'text', class: 'input', maxlength: 200, placeholder: 'Em nghĩ ra cách nào?', 'aria-label': 'Thêm phương án' });
        const addVi = voiceInput({ ta: addInput });
        const ownCount = () => P().data.solutions.filter((s) => s.source !== 'ai' && s.text.trim()).length;
        const aiBtn = btn('Nhờ AI gợi ý thêm', { icon: 'bulb', small: true, onClick: () => openSuggest(drawList) });

        function addSolution(text, source) {
          const t = String(text || '').trim();
          if (!t) return false;
          update((d) => { d.solutions.push({ id: store.newId('sl'), text: t.slice(0, 200), source }); });
          drawList();
          return true;
        }

        function drawList() {
          const d = P().data;
          clear(listEl);
          d.solutions.forEach((s, i) => {
            const inp = h('input', { type: 'text', class: 'input', maxlength: 200, value: s.text, 'aria-label': `Phương án ${i + 1}` });
            inp.addEventListener('input', () => { update((dd) => { const t = dd.solutions.find((x) => x.id === s.id); if (t) t.text = inp.value; }); checkRisk(); });
            listEl.appendChild(h('div', { class: 'sol' },
              h('span', { class: 'num' }, String(i + 1)), inp,
              s.source === 'ai' ? h('span', { class: 'chip ai tiny', title: 'Gợi ý từ AI, em chọn thêm' }, 'AI') : null,
              h('button', {
                type: 'button', class: 'icon-btn mini', 'aria-label': `Xóa phương án ${i + 1}`,
                onClick: () => {
                  update((dd) => {
                    dd.solutions = dd.solutions.filter((x) => x.id !== s.id);
                    delete dd.analysis[s.id]; delete dd.aiAnalysis[s.id];
                    if (dd.chosenId === s.id) dd.chosenId = null;
                  });
                  drawList();
                }
              }, icon('trash', 16))));
          });
          if (!d.solutions.length) listEl.appendChild(h('p', { class: 'wz-empty' }, 'Chưa có cách nào. Em thêm cách đầu tiên ở ô phía trên nhé.'));
          aiBtn.disabled = ownCount() < 1;
          hint.textContent = ownCount() < 1 ? 'Em tự nghĩ ít nhất 1 cách trước, rồi mới nhờ AI gợi ý thêm nhé.' : 'Càng nhiều cách càng tốt. Chưa cần chọn ở bước này.';
        }

        const addNow = () => { if (addSolution(addInput.value, 'me')) { addInput.value = ''; addInput.focus(); checkRisk(); } };
        addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addNow(); } });
        addInput.addEventListener('input', checkRisk);
        const w = h('div', { class: 'col grow' },
          h('div', { class: 'add-row' }, h('div', { class: 'fld-box single' }, addInput, addVi.btn), btn('Thêm', { kind: 'primary', icon: 'plus', onClick: addNow })),
          addVi.strip,
          listEl,
          h('div', { class: 'row-end' }, hint, aiBtn));
        drawList();
        return w;
      }
    }];
  }

  function pagesStep4() {
    const d0 = P().data;
    const sols = d0.solutions;
    if (!sols.length) {
      return [{
        q: 'Mình chưa có cách nào để so sánh', hint: '', mood: 'think',
        render: () => h('div', { class: 'wz-empty-card' }, icon('bulb', 28), h('p', null, 'Em hãy quay lại Bước 3 để thêm ít nhất một cách nhé.'),
          h('a', { class: 'btn btn-primary', href: `#/problem/${id}/3` }, 'Về Bước 3'))
      }];
    }
    const pages = sols.map((s, i) => ({
      q: `Cách ${i + 1}: ${s.text}`, hint: 'Em cân nhắc ưu điểm, hạn chế và hậu quả của cách này.', mood: 'think', qclass: 'long',
      render: () => {
        const A = () => Object.assign({ pros: '', cons: '', consequences: '', feasibility: 0 }, P().data.analysis[s.id] || {});
        const feas = h('div', { class: 'feas' });
        const drawFeas = () => { clear(feas); feas.append(h('span', { class: 'fld-cap' }, 'Khả thi (1 = rất khó, 5 = rất dễ)'), seg([1, 2, 3, 4, 5], A().feasibility, (v) => { setA(s.id, { feasibility: v }); drawFeas(); }, (v) => FEAS[v - 1])); };
        drawFeas();
        return h('div', { class: 'col grow' },
          areaOf(s.id, 'pros', 'Ưu điểm', 'Cách này tốt ở chỗ…'),
          areaOf(s.id, 'cons', 'Hạn chế', 'Cách này khó ở chỗ…'),
          areaOf(s.id, 'consequences', 'Hậu quả có thể xảy ra', 'Nếu làm thì có thể…'),
          h('div', { class: 'row-between' }, feas, btn('AI gợi ý', { small: true, icon: 'bulb', onClick: () => openAnalyze(s.id) })));
      }
    }));
    pages.push({
      q: 'Em chọn cách nào?', hint: 'Em là người quyết định, AI không chọn thay em.', mood: 'cheer',
      render: () => {
        const listEl = h('div', { class: 'pick-list', role: 'group', 'aria-label': 'Chọn một phương án' });
        const draw = () => {
          clear(listEl);
          const d = P().data;
          d.solutions.forEach((s, i) => {
            const on = d.chosenId === s.id;
            listEl.appendChild(h('button', {
              type: 'button', class: `pick ${on ? 'on' : ''}`, 'aria-pressed': on ? 'true' : 'false', 'aria-label': on ? `Em đã chọn: ${s.text}` : `Em chọn phương án: ${s.text}`,
              onClick: () => { update((dd) => { dd.chosenId = dd.chosenId === s.id ? null : s.id; }); draw(); }
            }, h('span', { class: 'num' }, on ? icon('check', 16) : String(i + 1)), h('span', { class: 'pt' }, s.text)));
          });
        };
        draw();
        return h('div', { class: 'col grow' }, listEl,
          textField({ label: 'Vì sao cách em chọn phù hợp với mục tiêu và hoàn cảnh của em?', key: 'reason', placeholder: 'Em chọn cách này vì…' }));
      }
    });
    return pages;
  }

  function pageStep5() {
    return [{
      q: 'Chia nhỏ thành từng việc', hint: 'Làm xong việc nào, em tự đánh dấu việc đó.', mood: 'cheer',
      render: () => {
        const chosenEl = h('div', { class: 'chosen-note' });
        const listEl = h('div', { class: 'plan-list' });
        const summary = h('span', { class: 'wz-hint' });
        const chosenText = () => { const d = P().data; const c = d.solutions.find((s) => s.id === d.chosenId); return c ? c.text : ''; };
        const breakBtn = btn('AI gợi ý chia việc', { small: true, icon: 'bulb', onClick: () => openBreakdown(chosenText(), drawList) });

        function addTask(t) {
          update((d) => { d.plan.push(Object.assign({ id: store.newId('tk'), text: '', time: '', resource: '', status: 'todo' }, t)); });
          drawList();
        }
        function drawSummary() {
          const plan = P().data.plan.filter((t) => t.text.trim());
          const done = plan.filter((t) => t.status === 'done').length;
          summary.textContent = plan.length ? `Đã xong ${done}/${plan.length} việc (em tự cập nhật).` : '';
        }
        function drawChosen() {
          clear(chosenEl);
          const c = chosenText();
          chosenEl.className = `chosen-note ${c ? '' : 'warn'}`;
          if (c) chosenEl.append(icon('check', 16), h('span', null, h('b', null, 'Cách em chọn: '), c));
          else chosenEl.append(icon('alert', 16), h('span', null, 'Em chưa chọn phương án ở ', h('a', { href: `#/problem/${id}/4` }, 'Bước 4'), '.'));
          breakBtn.disabled = !c;
        }
        function drawList() {
          clear(listEl);
          P().data.plan.forEach((t, i) => {
            const row = h('div', { class: `task ${t.status === 'done' ? 'done' : ''}` });
            const txt = h('input', { type: 'text', class: 'input', maxlength: 200, value: t.text, placeholder: 'Việc cần làm', 'aria-label': `Việc ${i + 1}` });
            const time = h('input', { type: 'text', class: 'input', maxlength: 60, value: t.time, placeholder: 'Khi nào? (vd: ngày mai)', 'aria-label': `Thời gian việc ${i + 1}` });
            const res = h('input', { type: 'text', class: 'input', maxlength: 120, value: t.resource, placeholder: 'Cần gì / nhờ ai?', 'aria-label': `Nguồn lực việc ${i + 1}` });
            const sel = h('select', { class: 'st-sel', 'aria-label': `Trạng thái việc ${i + 1}` }, Object.entries(TASK_STATUS).map(([k, v]) => h('option', { value: k, selected: t.status === k }, v)));
            const patch = (k, v, soft) => update((dd) => { const x = dd.plan.find((y) => y.id === t.id); if (x) x[k] = v; }, soft);
            txt.addEventListener('input', () => { patch('text', txt.value); drawSummary(); checkRisk(); });
            time.addEventListener('input', () => patch('time', time.value));
            res.addEventListener('input', () => patch('resource', res.value));
            sel.addEventListener('change', () => { patch('status', sel.value, true); row.classList.toggle('done', sel.value === 'done'); drawSummary(); });
            row.append(
              h('div', { class: 'task-top' }, h('span', { class: 'num' }, String(i + 1)), txt, sel,
                h('button', { type: 'button', class: 'icon-btn mini', 'aria-label': `Xóa việc ${i + 1}`, onClick: () => { update((dd) => { dd.plan = dd.plan.filter((y) => y.id !== t.id); }); drawList(); } }, icon('trash', 16))),
              h('div', { class: 'task-sub' }, time, res));
            listEl.appendChild(row);
          });
          if (!P().data.plan.length) listEl.appendChild(h('p', { class: 'wz-empty' }, 'Bấm “Thêm việc” để ghi việc nhỏ đầu tiên.'));
          drawSummary();
        }
        drawChosen();
        drawList();
        return h('div', { class: 'col grow' }, chosenEl, listEl,
          h('div', { class: 'row-between' }, btn('Thêm việc', { small: true, icon: 'plus', onClick: () => addTask({}) }), breakBtn), summary);
      }
    }];
  }

  function pagesStep6() {
    const goal = P().data.goal.trim();
    const goalNote = goal ? h('div', { class: 'chosen-note' }, icon('target', 16), h('span', null, h('b', null, 'Mục tiêu ban đầu: '), goal)) : null;
    return [
      { q: 'Kết quả thực tế thế nào?', hint: 'Em đã làm và điều gì đã xảy ra?', mood: 'think', render: () => textField({ label: 'Kết quả thực tế là gì?', key: 'result', placeholder: 'Em đã làm… và kết quả là…' }) },
      { q: 'So với mục tiêu ban đầu?', hint: '', mood: 'think', render: () => h('div', { class: 'col grow' }, goalNote, textField({ label: 'So với mục tiêu ban đầu thì thế nào?', key: 'compare', placeholder: 'So với điều em mong muốn…' })) },
      {
        q: 'Điều gì hiệu quả, điều gì cần chỉnh?', hint: 'Để lần sau em làm tốt hơn.', mood: 'happy',
        render: () => h('div', { class: 'col grow' },
          textField({ label: 'Điều gì đã hiệu quả?', key: 'worked', placeholder: 'Điều đã hiệu quả…', small: true, caption: 'Hiệu quả' }),
          textField({ label: 'Điều gì cần điều chỉnh lần sau?', key: 'adjust', placeholder: 'Lần sau em sẽ…', small: true, caption: 'Cần điều chỉnh' }))
      },
      {
        q: 'Em rút ra điều gì?', hint: 'Chấm mức hài lòng rồi viết kết luận của em.', mood: 'cheer',
        render: () => {
          const satEl = h('div', { class: 'feas' });
          const drawSat = () => {
            clear(satEl);
            satEl.append(h('span', { class: 'fld-cap' }, 'Em hài lòng đến mức nào? (1 = chưa, 5 = rất hài lòng)'),
              seg([1, 2, 3, 4, 5], P().data.satisfaction, (v) => { update((d) => { d.satisfaction = d.satisfaction === v ? 0 : v; }); drawSat(); }));
          };
          drawSat();
          return h('div', { class: 'col grow' }, satEl, textField({ label: 'Kết luận cuối cùng của em', key: 'final', placeholder: 'Em rút ra được điều gì từ chuyện này?' }));
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
          problem: d.problem, known: d.known, unknown: d.unknown, goal: d.goal,
          chosen: ch ? ch.text : '', reason: d.reason,
          result: d.result, compare: d.compare, worked: d.worked, adjust: d.adjust, final: d.final,
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

  // ---------- Khay gợi ý của AI (không chiếm chỗ màn hình chính) ----------
  function openSuggest(onChange) {
    const body = h('div', { class: 'ai-pane' });
    let busy = false;
    let intro = '';
    let risk = 'none';
    const draw = () => {
      clear(body);
      if (risk !== 'none') body.appendChild(safetyCard(risk));
      if (busy) { body.appendChild(h('p', { class: 'ai-wait' }, owl({ size: 44, mood: 'think' }), 'Mình đang nghĩ…')); return; }
      const pending = P().data.aiSuggestions.filter((x) => !x.added);
      if (!pending.length) {
        body.appendChild(h('p', { class: 'muted' }, 'Chưa có gợi ý nào.'));
      } else {
        body.appendChild(h('p', { class: 'muted small' }, intro || 'Đây chỉ là gợi ý, em là người quyết định. Em chỉ thêm cách em thấy phù hợp.'));
        pending.forEach((sug) => body.appendChild(h('div', { class: 'suggest-row' }, h('span', null, sug.text),
          btn('Thêm', { small: true, icon: 'plus', onClick: () => {
            update((d) => { const t = d.aiSuggestions.find((x) => x.id === sug.id); if (t) t.added = true; }, true);
            update((d) => { d.solutions.push({ id: store.newId('sl'), text: sug.text.slice(0, 200), source: 'ai' }); });
            onChange && onChange(); draw();
          } }))));
      }
      body.appendChild(btn(pending.length ? 'Gợi ý cách khác' : 'Nhờ AI gợi ý', { small: true, icon: 'refresh', onClick: ask }));
    };
    async function ask() {
      busy = true; draw();
      const res = await aiTask('suggest_options', { existing: P().data.solutions.map((s) => s.text) });
      busy = false;
      if (res) {
        intro = String(res.intro || '');
        risk = res.risk || 'none';
        const opts = (Array.isArray(res.options) ? res.options : []).map((t) => String(t).trim()).filter(Boolean).slice(0, 6);
        update((d) => { d.aiSuggestions = opts.map((t) => ({ id: store.newId('sg'), text: t.slice(0, 200), added: false })); }, true);
        if (!opts.length) toast('Mình chưa nghĩ ra thêm cách nào. Em thử nói rõ hơn với trợ lý nhé.');
      }
      draw();
    }
    modal({ title: 'Gợi ý từ trợ lý', titleIcon: owl({ size: 28 }), body, variant: 'sheet', actions: [] });
    if (P().data.aiSuggestions.some((x) => !x.added)) draw(); else ask();
  }

  function openAnalyze(sid) {
    const body = h('div', { class: 'ai-pane' });
    let busy = false;
    let risk = 'none';
    let note = '';
    const appendTo = (key, items) => {
      const cur = (P().data.analysis[sid] || {})[key] || '';
      const add = (Array.isArray(items) ? items : [items]).map((x) => String(x).trim()).filter(Boolean).filter((x) => !cur.includes(x));
      if (add.length) setA(sid, { [key]: (cur ? cur.trimEnd() + '\n' : '') + add.map((x) => '- ' + x).join('\n') });
    };
    const draw = () => {
      clear(body);
      if (risk !== 'none') body.appendChild(safetyCard(risk));
      if (busy) { body.appendChild(h('p', { class: 'ai-wait' }, owl({ size: 44, mood: 'think' }), 'Mình đang nghĩ…')); return; }
      const ai = P().data.aiAnalysis[sid];
      if (!ai) { body.appendChild(h('p', { class: 'muted' }, 'Chưa có gợi ý.')); body.appendChild(btn('Nhờ AI gợi ý', { small: true, icon: 'bulb', onClick: ask })); return; }
      body.appendChild(h('p', { class: 'muted small' }, note || 'Đây chỉ là gợi ý để em tham khảo, em tự cân nhắc theo mục tiêu và hoàn cảnh của mình nhé.'));
      if (ai.pros && ai.pros.length) body.appendChild(h('div', null, h('strong', null, 'Ưu điểm'), h('ul', null, ai.pros.map((x) => h('li', null, x)))));
      if (ai.cons && ai.cons.length) body.appendChild(h('div', null, h('strong', null, 'Hạn chế'), h('ul', null, ai.cons.map((x) => h('li', null, x)))));
      if (ai.consequences) body.appendChild(h('p', null, h('strong', null, 'Hậu quả: '), ai.consequences));
      body.appendChild(h('div', { class: 'row' },
        btn('Chép vào ghi chú của em', { small: true, kind: 'primary', icon: 'copy', onClick: () => {
          appendTo('pros', ai.pros); appendTo('cons', ai.cons); appendTo('consequences', ai.consequences);
          toast('Đã chép. Em xem và sửa lại ở trang này nhé.', 'ok');
          closeSheet(); goPage(sub);
        } })));
    };
    let closeSheet = () => {};
    async function ask() {
      busy = true; draw();
      const sols = P().data.solutions.slice(0, 8);
      const res = await aiTask('analyze', { solutions: sols.map((s) => s.text) });
      busy = false;
      if (res) {
        const items = Array.isArray(res.items) ? res.items : [];
        update((d) => {
          sols.forEach((s, i) => {
            const it = items[i];
            if (it) d.aiAnalysis[s.id] = { pros: (it.pros || []).map(String).slice(0, 4), cons: (it.cons || []).map(String).slice(0, 4), consequences: String(it.consequences || '') };
          });
        }, true);
        note = String(res.note || '');
        risk = res.risk || 'none';
      }
      draw();
    }
    closeSheet = modal({ title: 'Gợi ý từ trợ lý', titleIcon: owl({ size: 28 }), body, variant: 'sheet', actions: [] });
    if (P().data.aiAnalysis[sid]) draw(); else ask();
  }

  function openBreakdown(chosen, onChange) {
    if (!chosen) return;
    const body = h('div', { class: 'ai-pane' });
    let busy = false;
    let note = '';
    let risk = 'none';
    const draw = () => {
      clear(body);
      if (risk !== 'none') body.appendChild(safetyCard(risk));
      if (busy) { body.appendChild(h('p', { class: 'ai-wait' }, owl({ size: 44, mood: 'think' }), 'Mình đang nghĩ…')); return; }
      const pending = P().data.aiPlan.filter((x) => !x.added);
      if (!pending.length) body.appendChild(h('p', { class: 'muted' }, 'Chưa có gợi ý nào.'));
      else {
        body.appendChild(h('p', { class: 'muted small' }, note || 'Em chỉnh lại cho hợp với mình nhé.'));
        pending.forEach((it) => body.appendChild(h('div', { class: 'suggest-row' },
          h('span', null, it.text, it.time ? h('span', { class: 'muted small' }, ` · ${it.time}`) : null),
          btn('Thêm', { small: true, icon: 'plus', onClick: () => {
            update((d) => { const x = d.aiPlan.find((y) => y.id === it.id); if (x) x.added = true; }, true);
            update((d) => { d.plan.push({ id: store.newId('tk'), text: it.text, time: it.time, resource: it.resource, status: 'todo' }); });
            onChange && onChange(); draw();
          } }))));
      }
      body.appendChild(btn(pending.length ? 'Gợi ý cách khác' : 'Nhờ AI gợi ý', { small: true, icon: 'refresh', onClick: ask }));
    };
    async function ask() {
      busy = true; draw();
      const res = await aiTask('breakdown', { chosen });
      busy = false;
      if (res) {
        note = String(res.note || '');
        risk = res.risk || 'none';
        const items = (Array.isArray(res.items) ? res.items : []).slice(0, 8).map((it) => ({
          id: store.newId('ap'), text: String(it.text || '').slice(0, 200), time: String(it.time || '').slice(0, 60), resource: String(it.resource || '').slice(0, 120), added: false
        })).filter((x) => x.text);
        update((d) => { d.aiPlan = items; }, true);
      }
      draw();
    }
    modal({ title: 'Gợi ý từ trợ lý', titleIcon: owl({ size: 28 }), body, variant: 'sheet', actions: [] });
    if (P().data.aiPlan.some((x) => !x.added)) draw(); else ask();
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
    pageList = [pageStep1, pagesStep2, pageStep3, pagesStep4, pageStep5, pagesStep6][n - 1]();
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
        pg.hint ? h('div', { class: 'qh' }, pg.hint) : null)
    );
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

  return () => {
    document.body.classList.remove('wiz');
    voice.stopAll();
  };
}
