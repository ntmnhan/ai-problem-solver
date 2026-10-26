// Màn hình làm việc: quy trình sáu bước (ghi chép + trò chuyện với trợ lý + xác nhận hoàn thành).
import { STEPS, CATEGORIES, STATUS_LABEL, TASK_STATUS } from '../config.js';
import * as store from '../store.js';
import * as voice from '../voice.js';
import { askAI } from '../api.js';
import { detectRisk } from '../safety.js';
import { h, icon, btn, clear, autoGrow, toast, confirmDialog, promptDialog, safetyCard } from '../ui.js';

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
      h('div', { class: 'card empty' }, icon('alert', 32), h('h2', null, 'Không tìm thấy vấn đề này'),
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

  const P = () => store.getProblem(id);
  const S = STEPS[n - 1];
  const refs = {}; // key -> textarea (để đồng bộ khi chat tự điền)

  // ---------- Khung ----------
  const titleEl = h('h1', { class: 'pb-title', style: 'margin:0;font-size:1.3rem;word-break:break-word' }, P().title);
  const stepperEl = h('ol', { class: 'stepper', 'aria-label': 'Sáu bước giải quyết vấn đề' });
  const statusEl = h('div', { class: 'step-status' });
  const formEl = h('div');
  const chatHost = h('section', { class: 'card chat' });
  const actionsEl = h('div', { class: 'nav-actions' });

  root.appendChild(
    h(
      'div',
      null,
      h('div', { class: 'row between', style: 'margin-bottom:10px' },
        h('a', { class: 'btn btn-sm btn-ghost', href: '#/home' }, icon('left', 16), h('span', null, 'Vấn đề của em')),
        h('a', { class: 'btn btn-sm', href: `#/result/${id}` }, icon('file', 16), h('span', null, 'Trang kết quả'))
      ),
      h('div', { class: 'row', style: 'margin-bottom:10px;flex-wrap:nowrap' },
        titleEl,
        h('button', {
          type: 'button', class: 'icon-btn', 'aria-label': 'Đổi tên vấn đề', title: 'Đổi tên vấn đề',
          onClick: async () => {
            const v = await promptDialog({ title: 'Đổi tên vấn đề', label: 'Tên vấn đề', value: P().title });
            if (v) {
              store.renameProblem(id, v);
              titleEl.textContent = P().title;
            }
          }
        }, icon('edit', 18))
      ),
      stepperEl,
      statusEl,
      h('section', { class: 'card' },
        h('div', { class: 'row', style: 'margin-bottom:4px' },
          h('span', { class: 'chip' }, `Bước ${n}/6`), h('span', { class: 'muted small' }, S.name)),
        h('h2', null, S.title),
        formEl
      ),
      chatHost,
      actionsEl
    )
  );

  // ---------- Cập nhật dữ liệu ----------
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
      problem: d.problem,
      known: d.known,
      guess: d.guess,
      unknown: d.unknown,
      goal: d.goal,
      solutions: d.solutions.map((s) => s.text),
      chosen: chosen ? chosen.text : '',
      reason: d.reason,
      plan: d.plan.filter((t) => t.text.trim()).map((t) => `${t.text}${t.time ? ' - ' + t.time : ''} (${TASK_STATUS[t.status] || ''})`),
      result: d.result
    };
  }

  function chatMessages() {
    return P().steps[n].messages.filter((m) => m.role === 'user' || m.role === 'ai').slice(-14).map((m) => ({ role: m.role, text: m.text }));
  }

  async function aiTask(task, payload, setBusy) {
    setBusy(true);
    try {
      return await askAI({ step: n, task, context: buildContext(), messages: chatMessages(), payload });
    } catch (e) {
      toast(e.message || 'Chưa gọi được trợ lý.', 'error', 5500);
      return null;
    } finally {
      setBusy(false);
    }
  }

  // ---------- Thanh tiến trình, trạng thái, nút điều hướng ----------
  function refreshMeta() {
    renderStepper();
    renderStatus();
    renderActions();
  }

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
      const b = h('button', {
        type: 'button', 'aria-label': label, title: label, disabled: !open && s.n !== n,
        'aria-current': s.n === n ? 'step' : null,
        onClick: () => { if (open && s.n !== n) location.hash = `#/problem/${id}/${s.n}`; }
      },
        h('span', { class: 'dot' }, st.status === 'done' ? icon('check', 18) : !open ? icon('lock', 14) : String(s.n)),
        h('span', { class: 'lbl' }, s.short)
      );
      stepperEl.appendChild(h('li', { class: cls.join(' ') }, b, st.needsReview ? h('span', { class: 'review', title: 'Cần xem lại' }) : null));
    });
  }

  function renderStatus() {
    const st = P().steps[n];
    clear(statusEl);
    statusEl.appendChild(
      h('div', { class: 'row', style: 'margin-bottom:8px' },
        h('span', { class: `chip ${st.status === 'done' ? 'ok' : st.status === 'in_progress' ? 'warn' : ''}` }, `Trạng thái: ${STATUS_LABEL[st.status]}`))
    );
    if (st.needsReview) {
      statusEl.appendChild(
        h('div', { class: 'banner' }, icon('alert', 20),
          h('div', null,
            h('strong', null, 'Em vừa sửa nội dung ở bước trước. '),
            'Phần ở bước này có thể đã cũ, em xem lại xem còn đúng không nhé. ',
            btn('Em đã xem lại', { small: true, onClick: () => { store.clearReview(id, n); refreshMeta(); } })
          ))
      );
    }
  }

  function stepReady() {
    const d = P().data;
    if (n === 1 && !d.problem.trim()) return 'Em hãy ghi vấn đề em đang gặp ở ô “Vấn đề em đang gặp phải là…”.';
    if (n === 2 && !(d.known.trim() || d.guess.trim() || d.unknown.trim())) return 'Em hãy điền ít nhất một trong ba ô: đã biết, đang đoán, chưa rõ.';
    if (n === 3 && !d.solutions.some((s) => s.text.trim())) return 'Em hãy ghi ít nhất một phương án.';
    if (n === 4) {
      if (!d.solutions.some((s) => s.id === d.chosenId)) return 'Em hãy tự chọn một phương án (bấm “Em chọn phương án này”).';
      if (!d.reason.trim()) return 'Em hãy viết lý do vì sao em chọn phương án đó.';
    }
    if (n === 5 && !d.plan.some((t) => t.text.trim())) return 'Em hãy ghi ít nhất một việc nhỏ trong kế hoạch.';
    if (n === 6 && !(d.result.trim() && d.final.trim())) return 'Em hãy điền “Kết quả thực tế” và “Kết luận của em”.';
    return null;
  }

  async function confirmComplete() {
    const problem = stepReady();
    if (problem) {
      toast(problem, 'error', 4500);
      return;
    }
    const ok = await confirmDialog({
      title: `Em xác nhận Bước ${n} đã hoàn tất?`,
      text: 'Mình sẽ không tự đánh dấu thay em. Nếu em đã chắc chắn nội dung bước này xong rồi, bấm “Đã xong”. Em vẫn có thể quay lại sửa sau.',
      okLabel: 'Đã xong',
      cancelLabel: 'Chưa, để em xem lại'
    });
    if (!ok) return;
    store.completeStep(id, n);
    toast(`Em đã hoàn thành Bước ${n}.`, 'ok');
    location.hash = n < 6 ? `#/problem/${id}/${n + 1}` : `#/result/${id}`;
    if (n === 6) return;
  }

  function renderActions() {
    const p = P();
    const st = p.steps[n];
    clear(actionsEl);
    actionsEl.appendChild(
      n > 1
        ? h('a', { class: 'btn', href: `#/problem/${id}/${n - 1}` }, icon('left', 18), h('span', null, 'Bước trước'))
        : h('span')
    );
    actionsEl.appendChild(
      st.status === 'done'
        ? h('span', { class: 'chip ok grow', style: 'justify-content:center;min-height:44px' }, icon('check', 16), 'Em đã xác nhận hoàn thành bước này')
        : h('div', { class: 'grow' }, btn('Em xác nhận đã xong bước này', { kind: 'ok', icon: 'check', onClick: confirmComplete }))
    );
    if (n < 6) {
      const open = store.canOpen(p, n + 1);
      actionsEl.appendChild(
        open
          ? h('a', { class: 'btn btn-primary', href: `#/problem/${id}/${n + 1}` }, h('span', null, 'Bước sau'), icon('right', 18))
          : h('button', { type: 'button', class: 'btn', disabled: true, title: 'Hãy xác nhận hoàn thành bước này trước' }, icon('lock', 16), h('span', null, 'Bước sau'))
      );
    } else {
      actionsEl.appendChild(h('a', { class: 'btn btn-primary', href: `#/result/${id}` }, h('span', null, 'Xem kết quả'), icon('right', 18)));
    }
  }

  // ---------- Trường nhập ----------
  function textField({ label, hint, key, rows = 3, placeholder }) {
    const ta = h('textarea', { rows, placeholder: placeholder || '', 'aria-label': label, maxlength: 1500 });
    ta.value = P().data[key] || '';
    autoGrow(ta, 300);
    ta.addEventListener('input', () => update((d) => { d[key] = ta.value; }));
    refs[key] = ta;
    return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), ta, hint ? h('span', { class: 'field-hint' }, hint) : null);
  }

  function seg(options, current, onPick, labelFn) {
    const wrap = h('div', { class: 'seg', role: 'group' });
    options.forEach((v) => {
      wrap.appendChild(h('button', {
        type: 'button', class: v === current ? 'on' : '', 'aria-pressed': v === current ? 'true' : 'false',
        title: labelFn ? labelFn(v) : null,
        onClick: () => onPick(v)
      }, String(v)));
    });
    return wrap;
  }

  // ---------- Biểu mẫu từng bước ----------
  function formStep1() {
    const wrap = h('div');
    const chips = h('div', { class: 'chips', style: 'margin-bottom:14px', role: 'group', 'aria-label': 'Lĩnh vực của vấn đề' });
    const drawChips = () => {
      clear(chips);
      CATEGORIES.forEach((c) => {
        chips.appendChild(h('button', {
          type: 'button', class: `chip ${P().data.category === c ? 'sel' : ''}`, 'aria-pressed': P().data.category === c ? 'true' : 'false',
          onClick: () => { update((d) => { d.category = d.category === c ? '' : c; }); drawChips(); }
        }, c));
      });
    };
    drawChips();
    wrap.append(
      h('p', { class: 'muted' }, 'Vấn đề này thuộc lĩnh vực nào? (không bắt buộc)'),
      chips,
      textField({
        label: 'Vấn đề em đang gặp phải là…', key: 'problem', rows: 4,
        placeholder: 'Em hãy viết ngắn gọn chuyện em đang gặp. Em cũng có thể nói qua nút micro ở khung trò chuyện bên dưới.',
        hint: 'Em đừng ghi tên thật của người khác, số điện thoại hay địa chỉ nhé.'
      })
    );
    return wrap;
  }

  function formStep2() {
    return h('div', null,
      textField({ label: 'Điều em đã biết (chắc chắn)', key: 'known', placeholder: 'Những điều em biết chắc, đã xảy ra thật…' }),
      textField({ label: 'Điều em đang suy đoán', key: 'guess', placeholder: 'Những điều em nghĩ là có thể, nhưng chưa chắc…' }),
      textField({ label: 'Điều còn chưa rõ', key: 'unknown', placeholder: 'Những điều em chưa biết hoặc muốn tìm hiểu thêm…' }),
      textField({ label: 'Em muốn kết quả cuối cùng như thế nào? (mục tiêu của em)', key: 'goal', rows: 2, placeholder: 'Ví dụ: làm hòa với bạn, hiểu bài toán, ba mẹ hiểu cho em…' })
    );
  }

  function formStep3() {
    const wrap = h('div');
    const listEl = h('div');
    const sugEl = h('div');
    const hint = h('p', { class: 'muted small' });
    let aiBusy = false;
    let aiIntro = '';
    let aiRisk = 'none';
    const ownCount = () => P().data.solutions.filter((s) => s.source !== 'ai' && s.text.trim()).length;
    const aiBtn = btn('Gợi ý thêm từ AI', { icon: 'spark', onClick: askSuggest });
    const addInput = h('input', { type: 'text', class: 'input', maxlength: 200, placeholder: 'Em nghĩ ra cách nào? Gõ vào đây rồi bấm Thêm', 'aria-label': 'Thêm phương án' });

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
        inp.addEventListener('input', () => update((dd) => { const t = dd.solutions.find((x) => x.id === s.id); if (t) t.text = inp.value; }));
        listEl.appendChild(
          h('div', { class: 'list-item' },
            h('div', { class: 'item-row' }, h('span', { class: 'chip' }, `${i + 1}`), inp,
              h('button', {
                type: 'button', class: 'icon-btn', 'aria-label': `Xóa phương án ${i + 1}`,
                onClick: () => {
                  update((dd) => {
                    dd.solutions = dd.solutions.filter((x) => x.id !== s.id);
                    delete dd.analysis[s.id];
                    delete dd.aiAnalysis[s.id];
                    if (dd.chosenId === s.id) dd.chosenId = null;
                  });
                  drawList();
                }
              }, icon('trash', 18))),
            h('div', { class: 'row' }, s.source === 'ai' ? h('span', { class: 'chip ai' }, 'Gợi ý từ AI, em chọn thêm') : h('span', { class: 'chip ok' }, 'Em tự nghĩ'))
          )
        );
      });
      aiBtn.disabled = aiBusy || ownCount() < 1;
      hint.textContent = ownCount() < 1 ? 'Em hãy tự nghĩ ít nhất 1 phương án trước, rồi mới nhờ AI gợi ý thêm nhé.' : 'Nghĩ thêm được càng nhiều cách càng tốt. Chưa cần chọn cách nào ở bước này.';
      drawSug();
    }

    function drawSug() {
      clear(sugEl);
      const pending = P().data.aiSuggestions.filter((x) => !x.added);
      if (aiRisk !== 'none') sugEl.appendChild(safetyCard(aiRisk));
      if (!pending.length) return;
      sugEl.appendChild(
        h('div', { class: 'suggest-box' },
          h('p', null, h('strong', null, 'Gợi ý để em cân nhắc. '), aiIntro || 'Đây chỉ là gợi ý, em là người quyết định. Em chỉ thêm những cách em thấy phù hợp.'),
          pending.map((sug) =>
            h('div', { class: 'suggest-row' },
              h('span', null, sug.text),
              btn('Thêm', {
                small: true, icon: 'plus',
                onClick: () => {
                  update((d) => { const t = d.aiSuggestions.find((x) => x.id === sug.id); if (t) t.added = true; }, true);
                  addSolution(sug.text, 'ai');
                }
              }))
          ))
      );
    }

    async function askSuggest() {
      const res = await aiTask('suggest_options', { existing: P().data.solutions.map((s) => s.text) }, (b) => { aiBusy = b; aiBtn.disabled = b || ownCount() < 1; aiBtn.querySelector('span').textContent = b ? 'Đang nghĩ…' : 'Gợi ý thêm từ AI'; });
      if (!res) return;
      aiIntro = String(res.intro || '');
      aiRisk = res.risk || 'none';
      const opts = (Array.isArray(res.options) ? res.options : []).map((t) => String(t).trim()).filter(Boolean).slice(0, 6);
      update((d) => { d.aiSuggestions = opts.map((t) => ({ id: store.newId('sg'), text: t.slice(0, 200), added: false })); }, true);
      drawSug();
      if (!opts.length) toast('Mình chưa nghĩ ra thêm cách nào. Em thử nói rõ hơn ở khung trò chuyện nhé.');
    }

    const addNow = () => { if (addSolution(addInput.value, 'me')) { addInput.value = ''; addInput.focus(); } };
    addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addNow(); } });

    wrap.append(
      h('p', { class: 'muted' }, 'Em hãy tự nghĩ ra các cách giải quyết trước. Sau đó mới nhờ AI gợi mở thêm.'),
      listEl,
      h('div', { class: 'item-row', style: 'margin-bottom:8px' }, addInput, btn('Thêm', { icon: 'plus', onClick: addNow })),
      hint,
      h('div', { class: 'row', style: 'margin:8px 0' }, aiBtn),
      sugEl,
      h('div', { class: 'safety-note' }, icon('shield', 20), h('div', null,
        'Em nên tâm sự với ba mẹ hoặc thầy cô về chuyện này, các thầy cô và ba mẹ luôn muốn giúp em. Nếu em bị bạo lực hoặc xâm hại, hãy gọi Tổng đài quốc gia bảo vệ trẻ em ', h('a', { href: 'tel:111' }, '111'), '.'))
    );
    drawList();
    return wrap;
  }

  function formStep4() {
    const wrap = h('div');
    const listEl = h('div');
    const noteEl = h('div');
    let aiBusy = false;
    let aiNote = '';
    let aiRisk = 'none';
    const analyzeBtn = btn('AI gợi ý ưu điểm, hạn chế (để em tham khảo)', { icon: 'spark', onClick: analyze });

    const A = (sid) => Object.assign({ pros: '', cons: '', consequences: '', feasibility: 0 }, P().data.analysis[sid] || {});
    const setA = (sid, patch) => update((d) => { d.analysis[sid] = Object.assign({ pros: '', cons: '', consequences: '', feasibility: 0 }, d.analysis[sid], patch); });

    function fieldArea(sid, key, label, rows = 2) {
      const ta = h('textarea', { rows, 'aria-label': label, maxlength: 800 });
      ta.value = A(sid)[key] || '';
      autoGrow(ta, 200);
      ta.addEventListener('input', () => setA(sid, { [key]: ta.value }));
      return h('label', { class: 'field', style: 'margin-bottom:8px' }, h('span', { class: 'field-label' }, label), ta);
    }

    function appendTo(sid, key, items) {
      const cur = A(sid)[key] || '';
      const add = (Array.isArray(items) ? items : [items]).map((x) => String(x).trim()).filter(Boolean).filter((x) => !cur.includes(x));
      if (!add.length) return;
      setA(sid, { [key]: (cur ? cur.trimEnd() + '\n' : '') + add.map((x) => '- ' + x).join('\n') });
    }

    function drawList() {
      const d = P().data;
      clear(listEl);
      if (!d.solutions.length) {
        listEl.appendChild(h('div', { class: 'banner info' }, icon('info', 20), h('div', null, 'Em chưa có phương án nào. Hãy quay lại ', h('a', { href: `#/problem/${id}/3` }, 'Bước 3'), ' để thêm nhé.')));
      }
      analyzeBtn.disabled = aiBusy || !d.solutions.length;
      d.solutions.forEach((s, i) => {
        const chosen = d.chosenId === s.id;
        const ai = d.aiAnalysis[s.id];
        listEl.appendChild(
          h('div', { class: `list-item ${chosen ? 'sel' : ''}` },
            h('div', { class: 'row between' },
              h('strong', null, `${i + 1}. ${s.text}`),
              chosen ? h('span', { class: 'chip ok' }, icon('check', 14), 'Em đã chọn') : null),
            fieldArea(s.id, 'pros', 'Ưu điểm'),
            fieldArea(s.id, 'cons', 'Hạn chế'),
            fieldArea(s.id, 'consequences', 'Hậu quả có thể xảy ra'),
            h('div', null, h('span', { class: 'field-label' }, 'Mức khả thi (1 = rất khó, 5 = rất dễ làm)'),
              seg([1, 2, 3, 4, 5], A(s.id).feasibility, (v) => { setA(s.id, { feasibility: v }); drawList(); }, (v) => FEAS[v - 1])),
            ai ? h('details', null,
              h('summary', null, 'Gợi ý của AI (chỉ để tham khảo)'),
              ai.pros && ai.pros.length ? h('div', null, h('strong', null, 'Ưu điểm'), h('ul', null, ai.pros.map((x) => h('li', null, x)))) : null,
              ai.cons && ai.cons.length ? h('div', null, h('strong', null, 'Hạn chế'), h('ul', null, ai.cons.map((x) => h('li', null, x)))) : null,
              ai.consequences ? h('p', null, h('strong', null, 'Hậu quả: '), ai.consequences) : null,
              btn('Chép vào ghi chú của em', {
                small: true, icon: 'copy',
                onClick: () => { appendTo(s.id, 'pros', ai.pros); appendTo(s.id, 'cons', ai.cons); appendTo(s.id, 'consequences', ai.consequences); drawList(); }
              })
            ) : null,
            h('div', { class: 'row' },
              chosen
                ? btn('Bỏ chọn', { small: true, onClick: () => { update((dd) => { dd.chosenId = null; }); drawList(); } })
                : btn('Em chọn phương án này', { small: true, kind: 'primary', icon: 'check', onClick: () => { update((dd) => { dd.chosenId = s.id; }); drawList(); } }))
          )
        );
      });
      clear(noteEl);
      if (aiRisk !== 'none') noteEl.appendChild(safetyCard(aiRisk));
      if (aiNote) noteEl.appendChild(h('p', { class: 'muted small' }, aiNote));
    }

    async function analyze() {
      const sols = P().data.solutions.slice(0, 8);
      const res = await aiTask('analyze', { solutions: sols.map((s) => s.text) }, (b) => { aiBusy = b; analyzeBtn.disabled = b; analyzeBtn.querySelector('span').textContent = b ? 'Đang phân tích…' : 'AI gợi ý ưu điểm, hạn chế (để em tham khảo)'; });
      if (!res) return;
      const items = Array.isArray(res.items) ? res.items : [];
      update((d) => {
        sols.forEach((s, i) => {
          const it = items[i];
          if (it) d.aiAnalysis[s.id] = { pros: (it.pros || []).map(String).slice(0, 4), cons: (it.cons || []).map(String).slice(0, 4), consequences: String(it.consequences || '') };
        });
      }, true);
      aiNote = String(res.note || 'Đây chỉ là gợi ý để em tham khảo, em tự cân nhắc theo mục tiêu và hoàn cảnh của mình nhé.');
      aiRisk = res.risk || 'none';
      drawList();
    }

    wrap.append(
      h('p', { class: 'muted' }, 'Với mỗi cách, em ghi ưu điểm, hạn chế và hậu quả có thể xảy ra. Sau đó chính em chọn một cách. AI sẽ không chọn thay em.'),
      h('div', { class: 'row', style: 'margin-bottom:10px' }, analyzeBtn),
      noteEl,
      listEl,
      textField({ label: 'Vì sao cách em chọn phù hợp với mục tiêu và hoàn cảnh của em?', key: 'reason', rows: 3, placeholder: 'Em giải thích bằng lời của mình nhé…' })
    );
    drawList();
    return wrap;
  }

  function formStep5() {
    const wrap = h('div');
    const chosenEl = h('div');
    const listEl = h('div');
    const sugEl = h('div');
    const summary = h('p', { class: 'muted' });
    let aiBusy = false;
    let aiNote = '';
    let aiRisk = 'none';
    const chosenText = () => { const d = P().data; const c = d.solutions.find((s) => s.id === d.chosenId); return c ? c.text : ''; };
    const breakBtn = btn('AI gợi ý cách chia nhỏ', { icon: 'spark', onClick: breakdown });

    function addTask(t) {
      update((d) => { d.plan.push(Object.assign({ id: store.newId('tk'), text: '', time: '', resource: '', status: 'todo' }, t)); });
      drawList();
    }

    function drawSummary() {
      const plan = P().data.plan.filter((t) => t.text.trim());
      const done = plan.filter((t) => t.status === 'done').length;
      summary.textContent = plan.length ? `Đã xong ${done}/${plan.length} việc (do em tự cập nhật).` : 'Em chưa có việc nào.';
    }

    function drawChosen() {
      clear(chosenEl);
      const c = chosenText();
      chosenEl.appendChild(c
        ? h('div', { class: 'banner info' }, icon('check', 20), h('div', null, h('strong', null, 'Cách em đã chọn: '), c))
        : h('div', { class: 'banner' }, icon('alert', 20), h('div', null, 'Em chưa chọn phương án ở ', h('a', { href: `#/problem/${id}/4` }, 'Bước 4'), '. Hãy chọn trước để chia việc nhé.')));
      breakBtn.disabled = aiBusy || !c;
    }

    function drawList() {
      clear(listEl);
      const d = P().data;
      d.plan.forEach((t, i) => {
        const row = h('div', { class: `plan-row ${t.status === 'done' ? 'done' : ''}` });
        const txt = h('input', { type: 'text', class: 'input', maxlength: 200, value: t.text, placeholder: 'Việc cần làm', 'aria-label': `Việc ${i + 1}` });
        const time = h('input', { type: 'text', class: 'input', maxlength: 60, value: t.time, placeholder: 'Thời gian dự kiến (vd: 15 phút, ngày mai)', 'aria-label': `Thời gian việc ${i + 1}` });
        const res = h('input', { type: 'text', class: 'input', maxlength: 120, value: t.resource, placeholder: 'Cần gì / nhờ ai giúp', 'aria-label': `Nguồn lực việc ${i + 1}` });
        const sel = h('select', { 'aria-label': `Trạng thái việc ${i + 1}` }, Object.entries(TASK_STATUS).map(([k, v]) => h('option', { value: k, selected: t.status === k }, v)));
        const patch = (k, v, soft) => update((dd) => { const x = dd.plan.find((y) => y.id === t.id); if (x) x[k] = v; }, soft);
        txt.addEventListener('input', () => { patch('text', txt.value); drawSummary(); });
        time.addEventListener('input', () => patch('time', time.value));
        res.addEventListener('input', () => patch('resource', res.value));
        sel.addEventListener('change', () => { patch('status', sel.value, true); row.classList.toggle('done', sel.value === 'done'); drawSummary(); });
        row.append(
          h('div', { class: 'item-row' }, h('span', { class: 'chip' }, String(i + 1)), txt,
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Xóa việc ${i + 1}`, onClick: () => { update((dd) => { dd.plan = dd.plan.filter((y) => y.id !== t.id); }); drawList(); } }, icon('trash', 18))),
          h('div', { class: 'grid2' }, time, res),
          h('label', { class: 'field', style: 'margin:0' }, h('span', { class: 'field-label' }, 'Tình trạng (em tự cập nhật)'), sel)
        );
        listEl.appendChild(row);
      });
      drawSummary();
      drawSug();
    }

    function drawSug() {
      clear(sugEl);
      if (aiRisk !== 'none') sugEl.appendChild(safetyCard(aiRisk));
      const pending = P().data.aiPlan.filter((x) => !x.added);
      if (!pending.length) return;
      sugEl.appendChild(
        h('div', { class: 'suggest-box' },
          h('p', null, h('strong', null, 'Gợi ý chia việc. '), aiNote || 'Em chỉnh lại cho hợp với mình nhé.'),
          pending.map((it) => h('div', { class: 'suggest-row' },
            h('span', null, it.text, it.time ? h('span', { class: 'muted small' }, ` · ${it.time}`) : null),
            btn('Thêm', { small: true, icon: 'plus', onClick: () => {
              update((d) => { const x = d.aiPlan.find((y) => y.id === it.id); if (x) x.added = true; }, true);
              addTask({ text: it.text, time: it.time, resource: it.resource });
            } })))
        )
      );
    }

    async function breakdown() {
      const c = chosenText();
      if (!c) return;
      const res = await aiTask('breakdown', { chosen: c }, (b) => { aiBusy = b; breakBtn.disabled = b; breakBtn.querySelector('span').textContent = b ? 'Đang nghĩ…' : 'AI gợi ý cách chia nhỏ'; });
      if (!res) return;
      aiNote = String(res.note || '');
      aiRisk = res.risk || 'none';
      const items = (Array.isArray(res.items) ? res.items : []).slice(0, 8).map((it) => ({
        id: store.newId('ap'), text: String(it.text || '').slice(0, 200), time: String(it.time || '').slice(0, 60), resource: String(it.resource || '').slice(0, 120), added: false
      })).filter((x) => x.text);
      update((d) => { d.aiPlan = items; }, true);
      drawSug();
    }

    wrap.append(
      chosenEl,
      h('p', { class: 'muted' }, 'Chia cách em chọn thành các việc nhỏ. Làm xong việc nào, em tự đổi tình trạng việc đó. Mình sẽ không tự đánh dấu thay em.'),
      h('div', { class: 'row', style: 'margin-bottom:10px' }, breakBtn),
      listEl,
      h('div', { class: 'row', style: 'margin-bottom:8px' }, btn('Thêm việc', { icon: 'plus', onClick: () => addTask({}) })),
      summary,
      sugEl
    );
    drawChosen();
    drawList();
    return wrap;
  }

  function formStep6() {
    const d0 = P().data;
    const wrap = h('div');
    const plan = d0.plan.filter((t) => t.text.trim());
    const done = plan.filter((t) => t.status === 'done').length;
    wrap.append(
      d0.goal.trim() ? h('div', { class: 'banner info' }, icon('info', 20), h('div', null, h('strong', null, 'Mục tiêu ban đầu của em: '), d0.goal)) : null,
      plan.length ? h('p', { class: 'muted' }, `Kế hoạch: em đã tự đánh dấu xong ${done}/${plan.length} việc.`) : null,
      textField({ label: 'Kết quả thực tế là gì?', key: 'result', rows: 3, placeholder: 'Em đã làm và điều gì đã xảy ra…' }),
      textField({ label: 'So với mục tiêu ban đầu thì thế nào?', key: 'compare', rows: 3 }),
      textField({ label: 'Điều gì đã hiệu quả?', key: 'worked', rows: 2 }),
      textField({ label: 'Điều gì cần điều chỉnh lần sau?', key: 'adjust', rows: 2 })
    );
    const satEl = h('div', { class: 'field' });
    const drawSat = () => {
      clear(satEl);
      satEl.append(
        h('span', { class: 'field-label' }, 'Em hài lòng với kết quả đến mức nào? (1 = chưa hài lòng, 5 = rất hài lòng)'),
        seg([1, 2, 3, 4, 5], P().data.satisfaction, (v) => { update((d) => { d.satisfaction = d.satisfaction === v ? 0 : v; }); drawSat(); })
      );
    };
    drawSat();
    wrap.append(
      satEl,
      textField({ label: 'Kết luận cuối cùng của em', key: 'final', rows: 3, placeholder: 'Em rút ra được điều gì từ chuyện này?' }),
      h('div', { class: 'safety-note' }, icon('info', 20), h('div', null, 'Nếu vấn đề vẫn chưa ổn, em có thể quay lại Bước 3 để thử cách khác, hoặc nói chuyện với ba mẹ, thầy cô nhé.'))
    );
    return wrap;
  }

  formEl.appendChild([formStep1, formStep2, formStep3, formStep4, formStep5, formStep6][n - 1]());

  // ---------- Trò chuyện + Voice Mode ----------
  (function buildChat() {
    const log = h('div', { class: 'chat-log', role: 'log', 'aria-label': 'Cuộc trò chuyện với trợ lý', tabindex: '0' });
    const ta = h('textarea', { rows: 1, placeholder: 'Em muốn nói gì với mình?', 'aria-label': 'Tin nhắn của em', maxlength: 1500 });
    const fit = autoGrow(ta, 140);
    const sendBtn = h('button', { type: 'button', class: 'icon-btn send', 'aria-label': 'Gửi tin nhắn' }, icon('send', 20));
    const micBtn = h('button', { type: 'button', class: 'icon-btn mic', 'aria-label': 'Bật Voice Mode (nói thay vì gõ)', 'aria-pressed': 'false', title: 'Voice Mode' }, icon('mic', 20));
    const voiceHost = h('div');
    let busy = false;
    let voiceOn = false;
    let readAloud = true;
    let vState = 'idle';
    let baseText = '';

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

    // --- Voice Mode (một điểm truy cập duy nhất) ---
    const V_LABEL = {
      listening: 'Đang nghe…', processing: 'Đang xử lý…', stopped: 'Đã dừng', speaking: 'Đang phát âm thanh…',
      denied: 'Chưa được phép dùng micro', unsupported: 'Trình duyệt chưa hỗ trợ nhận diện giọng nói', 'no-speech': 'Mình chưa nghe thấy gì', error: 'Có lỗi khi nghe', idle: 'Sẵn sàng'
    };
    function setV(s) { vState = s; if (voiceOn) drawVoice(); }

    function drawVoice() {
      clear(voiceHost);
      if (!voiceOn) return;
      const listening = vState === 'listening' || vState === 'processing';
      const note = vState === 'denied'
        ? 'Em đã chặn micro. Em có thể bật lại quyền micro trong cài đặt trình duyệt, hoặc cứ gõ chữ bình thường nhé.'
        : vState === 'unsupported'
          ? 'Trình duyệt này không nghe được giọng nói. Em vẫn gõ chữ được bình thường' + (voice.supportsTTS ? ', và vẫn có thể nghe trợ lý đọc phản hồi.' : '.')
          : vState === 'stopped' ? 'Em xem lại chữ trong ô nhập, sửa nếu cần rồi bấm Gửi nhé.' : '';
      voiceHost.appendChild(
        h('div', { class: 'voice-panel', role: 'group', 'aria-label': 'Voice Mode' },
          h('div', { class: `voice-state ${vState}`, role: 'status' }, h('span', { class: 'dotlive' }), V_LABEL[vState] || ''),
          listening ? btn('Dừng nghe', { small: true, icon: 'stop', onClick: () => voice.stopListening(false) }) : null,
          listening ? btn('Hủy', { small: true, icon: 'x', onClick: () => { voice.stopListening(true); ta.value = baseText.trimEnd(); fit(); setV('stopped'); } }) : null,
          !listening && vState !== 'speaking' && vState !== 'unsupported' ? btn('Nói tiếp', { small: true, icon: 'mic', onClick: startListen }) : null,
          vState === 'speaking' ? btn('Dừng đọc', { small: true, icon: 'stop', onClick: () => { voice.stopSpeaking(); setV('stopped'); } }) : null,
          voice.supportsTTS ? h('label', { class: 'check', style: 'min-height:36px' },
            h('input', { type: 'checkbox', checked: readAloud, onChange: (e) => { readAloud = e.target.checked; if (!readAloud) voice.stopSpeaking(); } }),
            h('span', { class: 'small' }, 'Đọc phản hồi của trợ lý')) : null,
          btn('Quay lại nhập văn bản', { small: true, onClick: closeVoice }),
          note ? h('p', { class: 'voice-note' }, note) : null
        )
      );
    }

    function startListen() {
      if (!voice.supportsSTT) { setV('unsupported'); return; }
      voice.stopSpeaking();
      baseText = ta.value ? ta.value.replace(/\s*$/, ' ') : '';
      voice.startListening({
        onText: (f, i) => { ta.value = baseText + f + i; fit(); },
        onState: (s, info) => {
          if (s === 'error') setV(info && info.reason === 'denied' ? 'denied' : info && info.reason === 'no-speech' ? 'no-speech' : info && info.reason === 'unsupported' ? 'unsupported' : 'error');
          else setV(s);
        }
      });
    }

    function openVoice() {
      voiceOn = true;
      micBtn.classList.add('on');
      micBtn.setAttribute('aria-pressed', 'true');
      micBtn.setAttribute('aria-label', 'Tắt Voice Mode');
      vState = 'idle';
      drawVoice();
      startListen();
    }

    function closeVoice() {
      voice.stopAll();
      voiceOn = false;
      vState = 'idle';
      micBtn.classList.remove('on');
      micBtn.setAttribute('aria-pressed', 'false');
      micBtn.setAttribute('aria-label', 'Bật Voice Mode (nói thay vì gõ)');
      drawVoice();
      ta.focus();
    }

    micBtn.addEventListener('click', () => (voiceOn ? closeVoice() : openVoice()));

    // --- Gửi / nhận ---
    async function requestReply() {
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
        if (voiceOn && readAloud && voice.supportsTTS) {
          voice.stopListening(true);
          voice.speak(text, (s) => setV(s === 'speaking' ? 'speaking' : 'stopped'));
        }
      } catch (e) {
        typing.remove();
        const err = h('div', { class: 'msg err', role: 'alert' }, h('strong', null, 'Chưa gửi được. '), e.message || 'Có lỗi xảy ra.', ' ',
          btn('Thử lại', { small: true, onClick: () => { err.remove(); requestReply(); } }));
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
      if (voiceOn && vState === 'listening') setV('stopped');
      ta.value = '';
      fit();
      const m = { role: 'user', text, risk: detectRisk(text) };
      store.addMessage(id, n, m);
      if (n === 1 && !P().data.problem.trim()) {
        update((d) => { d.problem = text.slice(0, 1500); });
        if (refs.problem) { refs.problem.value = P().data.problem; refs.problem.dispatchEvent(new Event('input')); }
      }
      refreshMeta();
      log.append(...bubble(m));
      scroll();
      requestReply();
    }

    sendBtn.addEventListener('click', send);
    const finePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && finePointer && !e.isComposing) {
        e.preventDefault();
        send();
      }
    });

    chatHost.append(
      h('h2', null, icon('chat', 22), 'Trò chuyện với trợ lý'),
      log,
      h('div', { class: 'composer' }, ta, micBtn, sendBtn),
      voiceHost,
      h('p', { class: 'muted small', style: 'margin:8px 0 0' }, 'Trợ lý là AI nên có thể nhầm, em hãy tự kiểm tra lại nhé. Em đừng ghi họ tên, số điện thoại hay địa chỉ.')
    );
    drawLog();
  })();

  refreshMeta();

  return () => voice.stopAll();
}
