// Dựng nội dung báo cáo từ dữ liệu thật của học sinh; xuất PDF (in) và DOCX.
import { STEPS, STATUS_LABEL, TASK_STATUS, CONFIG } from './config.js';
import { stepsDone } from './store.js';
import { h, formatDate } from './ui.js';
import { downloadBlob } from './actions.js';

const T = (v) => (typeof v === 'string' ? v.trim() : '');

export function buildReportModel(p, profile, opts = {}) {
  const showName = opts.showName !== false;
  const d = p.data;
  const meta = [];
  if (profile) {
    if (profile.anonymous || !profile.name) meta.push(['Người thực hiện', `Ẩn danh (mã ${profile.code})`]);
    else if (showName) {
      meta.push(['Người thực hiện', profile.name]);
      if (profile.cls) meta.push(['Lớp', profile.cls]);
    } else meta.push(['Người thực hiện', `Ẩn danh (mã ${profile.code})`]);
  }
  meta.push(['Ngày tạo', formatDate(p.createdAt)]);
  meta.push(['Cập nhật gần nhất', formatDate(p.updatedAt)]);
  meta.push(['Tiến trình', `${stepsDone(p)}/6 bước do học sinh xác nhận hoàn thành`]);
  if (d.category) meta.push(['Lĩnh vực', d.category]);

  const sections = [];
  const head = (n) => `Bước ${n}. ${STEPS[n - 1].name} (${STATUS_LABEL[p.steps[n].status]})`;
  const qa = (q, a) => ({ type: 'qa', q, a: T(a) || '(chưa có nội dung)' });

  sections.push({ heading: head(1), blocks: [qa('Vấn đề em đang gặp phải là…', d.problem)] });
  sections.push({
    heading: head(2),
    blocks: [qa('Theo em, nguyên nhân của vấn đề này là gì?', d.cause || [d.known, d.guess, d.unknown].filter(Boolean).join('\n')), qa('Kết quả em mong muốn đạt được là gì?', d.goal)]
  });

  const sols = d.solutions.filter((s) => T(s.text));
  sections.push({
    heading: head(3),
    blocks: [
      sols.length
        ? { type: 'bullets', items: sols.map((s) => `${s.text}${s.source === 'ai' ? ' (gợi ý từ AI, em chọn thêm)' : ' (em tự nghĩ)'}`) }
        : { type: 'p', text: '(chưa có phương án)' }
    ]
  });

  const chosen = d.solutions.find((s) => s.id === d.chosenId);
  const anyPicked = sols.some((s) => s.picked);
  const rows = sols.filter((s) => !anyPicked || s.picked).map((s, i) => {
    const a = d.analysis[s.id] || {};
    return [String(i + 1), s.text, T(a.pros) || '-', T(a.cons) || '-'];
  });
  const s4 = [];
  if (rows.length) s4.push({ type: 'table', head: ['#', 'Biện pháp', 'Ưu điểm', 'Hạn chế'], rows, widths: [5, 35, 30, 30] });
  else s4.push({ type: 'p', text: '(chưa có phân tích)' });
  s4.push(qa('Phương án em đã chọn', chosen ? chosen.text : ''));
  if (T(d.reason)) s4.push(qa('Lý do em chọn', d.reason));
  sections.push({ heading: head(4), blocks: s4 });

  const plan = d.plan.filter((t) => T(t.text));
  sections.push({
    heading: head(5),
    blocks: plan.length
      ? [{ type: 'table', head: ['#', 'Việc cần làm', 'Hướng dẫn', 'Thời gian', 'Tình trạng (em cập nhật)'], rows: plan.map((t, i) => [String(i + 1), t.text, [t.detail || '-', t.expect ? 'Kết quả mong đợi: ' + t.expect : '', t.backup ? 'Nếu chưa được: ' + t.backup : ''].filter(Boolean).join('\n'), t.time || '-', TASK_STATUS[t.status] || '-']), widths: [5, 22, 45, 10, 18] }]
      : [{ type: 'p', text: '(chưa có kế hoạch)' }]
  });

  const s6 = [];
  const ach = { yes: 'Đã đạt', part: 'Đạt một phần', no: 'Chưa đạt' }[d.achieved];
  if (ach) s6.push(qa('Em đạt được kết quả mong muốn chưa?', ach));
  s6.push(qa('Em có hài lòng với cách giải quyết không?', d.happy === 'yes' ? 'Hài lòng' : d.happy === 'no' ? 'Chưa hài lòng' : ''));
  s6.push(qa('Điểm em cho (1-5)', d.satisfaction ? String(d.satisfaction) : ''));
  if (T(d.good)) s6.push(qa('Điều đã làm tốt', d.good));
  if (T(d.better)) s6.push(qa('Điều cần làm tốt hơn', d.better));
  if (!T(d.good) && !T(d.better)) s6.push(qa('Nhận xét của em', d.final || [d.result, d.compare].filter(Boolean).join('\n')));
  sections.push({ heading: head(6), blocks: s6 });

  sections.push({ heading: 'Nhận xét của giáo viên', blocks: [{ type: 'box' }] });

  return {
    title: p.title,
    meta,
    sections,
    footnote: `Nội dung do học sinh nhập; phản hồi của AI chỉ mang tính gợi ý. Tạo bởi ${CONFIG.creditNames} - ${CONFIG.schoolName}.`
  };
}

export function renderReportHTML(model) {
  const root = h('article', { class: 'report', id: 'report' });
  root.appendChild(h('p', { class: 'meta', style: 'margin:0 0 4px' }, `${CONFIG.name} · ${CONFIG.tagline}`));
  root.appendChild(h('h1', null, model.title));
  root.appendChild(h('div', { class: 'meta' }, model.meta.map(([k, v]) => h('div', null, h('strong', null, `${k}: `), v))));
  model.sections.forEach((s) => {
    root.appendChild(h('h2', null, s.heading));
    s.blocks.forEach((b) => {
      if (b.type === 'qa') root.appendChild(h('div', { class: 'qa' }, h('b', null, b.q), h('p', null, b.a)));
      else if (b.type === 'p') root.appendChild(h('p', { class: 'muted' }, b.text));
      else if (b.type === 'bullets') root.appendChild(h('ul', null, b.items.map((i) => h('li', null, i))));
      else if (b.type === 'table') {
        root.appendChild(
          h('div', { class: 'table-wrap' },
            h('table', null,
              h('thead', null, h('tr', null, b.head.map((x) => h('th', null, x)))),
              h('tbody', null, b.rows.map((r) => h('tr', null, r.map((c, i) => h('td', { 'data-label': b.head[i] }, c)))))))
        );
      } else if (b.type === 'box') root.appendChild(h('div', { class: 'teacher-box' }, 'Giáo viên ghi nhận xét tại đây (nếu cần).'));
    });
  });
  root.appendChild(h('p', { class: 'muted small', style: 'margin-top:18px' }, model.footnote));
  return root;
}

let docxPromise = null;
function loadDocx() {
  if (window.docx) return Promise.resolve();
  if (docxPromise) return docxPromise;
  docxPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/docx.iife.js';
    s.onload = () => (window.docx ? resolve() : reject(new Error('Không nạp được thư viện DOCX.')));
    s.onerror = () => { docxPromise = null; reject(new Error('Không tải được thư viện xuất DOCX. Em kiểm tra mạng rồi thử lại.')); };
    document.head.appendChild(s);
  });
  return docxPromise;
}

export async function exportDocx(model, fileBase) {
  await loadDocx();
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, HeightRule, ShadingType } = window.docx;
  const BLUE = '1355C7';
  const lines = (text, extra = {}) => {
    const parts = String(text).split('\n');
    return new Paragraph({
      spacing: { after: 80 },
      children: parts.map((t, i) => new TextRun({ text: t, break: i ? 1 : 0, ...extra }))
    });
  };
  const children = [];
  children.push(new Paragraph({ children: [new TextRun({ text: `${CONFIG.name} · ${CONFIG.tagline}`, color: '666666', size: 20 })] }));
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 120 }, children: [new TextRun({ text: model.title, bold: true, color: BLUE })] }));
  model.meta.forEach(([k, v]) => children.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: `${k}: `, bold: true }), new TextRun({ text: v })] })));

  model.sections.forEach((s) => {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 100 }, children: [new TextRun({ text: s.heading, bold: true, color: BLUE })] }));
    s.blocks.forEach((b) => {
      if (b.type === 'qa') {
        children.push(new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: b.q, bold: true })] }));
        children.push(lines(b.a));
      } else if (b.type === 'p') {
        children.push(lines(b.text, { italics: true, color: '666666' }));
      } else if (b.type === 'bullets') {
        b.items.forEach((i) => children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [new TextRun({ text: i })] })));
      } else if (b.type === 'table') {
        const widths = b.widths || b.head.map(() => Math.floor(100 / b.head.length));
        const cell = (txt, w, header) =>
          new TableCell({
            width: { size: w, type: WidthType.PERCENTAGE },
            shading: header ? { type: ShadingType.CLEAR, fill: 'E3EEFF', color: 'auto' } : undefined,
            margins: { top: 60, bottom: 60, left: 80, right: 80 },
            children: String(txt).split('\n').map((t) => new Paragraph({ children: [new TextRun({ text: t, bold: !!header, size: 20 })] }))
          });
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ tableHeader: true, children: b.head.map((x, i) => cell(x, widths[i], true)) }),
              ...b.rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, widths[i], false)) }))
            ]
          })
        );
        children.push(new Paragraph({ children: [] }));
      } else if (b.type === 'box') {
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [new TableRow({ height: { value: 1600, rule: HeightRule.AT_LEAST }, children: [new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Giáo viên ghi nhận xét tại đây (nếu cần).', color: '888888', italics: true })] })] })] })]
          })
        );
      }
    });
  });
  children.push(new Paragraph({ spacing: { before: 280 }, alignment: AlignmentType.LEFT, children: [new TextRun({ text: model.footnote, color: '666666', size: 18 })] }));

  const doc = new Document({
    creator: CONFIG.name,
    title: model.title,
    styles: { default: { document: { run: { font: 'Times New Roman', size: 24 } } } },
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } }, children }]
  });
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${fileBase}.docx`);
}
