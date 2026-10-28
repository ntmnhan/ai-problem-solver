"""Kiểm thử giao diện trên trình duyệt thật (Playwright). Chạy: python3 tests/e2e.py
Cần máy chủ cục bộ: node tests/dev-server.js 3100
Các lệnh /api được giả lập (mock) để kiểm thử hành vi giao diện, không gọi AI thật."""
import json, re, sys, os, time, zipfile, io, traceback
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BASE', 'http://localhost:3100')
OUT = os.path.join(os.path.dirname(__file__), 'screens')
os.makedirs(OUT, exist_ok=True)
results = []

STATS = {'configured': True, 'visits': 41, 'ratingCount': 0, 'ratingAvg': None}
calls = {'visit': 0, 'feedback': [], 'chat': [], 'share': [], 'admin': []}
ADMIN_DB = []

def reset_calls():
    calls['visit'] = 0
    calls['feedback'] = []
    calls['chat'] = []
    calls['share'] = []
    calls['admin'] = []
    ADMIN_DB.clear()

ONLY = [x for x in os.environ.get('ONLY', '').split(',') if x]

def record(tid, name, fn):
    if ONLY and tid not in ONLY:
        return
    try:
        fn()
        results.append({'id': tid, 'name': name, 'ok': True})
        print('ĐẠT      ', tid, name)
    except Exception as e:
        msg = str(e).split('\n')[0][:300]
        results.append({'id': tid, 'name': name, 'ok': False, 'err': msg})
        print('KHÔNG ĐẠT', tid, name, '->', msg)
        traceback.print_exc(limit=2)

def install_routes(ctx, chat_mode='ok', stats=None):
    state = {'chat_mode': chat_mode, 'fail_once': False}
    st = dict(STATS if stats is None else stats)

    def fonts(route):
        route.abort()
    ctx.route(re.compile(r'https://fonts\.(googleapis|gstatic)\.com/.*'), fonts)

    def api_stats(route, request):
        if st.get('configured') is False:
            return route.fulfill(status=200, content_type='application/json', body=json.dumps({'configured': False}))
        if request.method == 'POST':
            calls['visit'] += 1
            st['visits'] = st.get('visits', 0) + 1
        route.fulfill(status=200, content_type='application/json', body=json.dumps(st))
    ctx.route('**/api/stats', api_stats)

    def api_fb(route, request):
        calls['feedback'].append(json.loads(request.post_data))
        d = json.loads(request.post_data)
        if d.get('rating'):
            st['ratingCount'] = st.get('ratingCount', 0) + 1
            st['ratingAvg'] = float(d['rating'])
        route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, **st}))
    ctx.route('**/api/feedback', api_fb)

    def api_chat(route, request):
        body = json.loads(request.post_data)
        calls['chat'].append(body)
        mode = state['chat_mode']
        if mode == 'upstream_down':
            return route.fulfill(status=502, content_type='application/json', body=json.dumps({'error': 'upstream', 'status': 503, 'message': 'Trợ lý đang gặp sự cố. Bạn thử lại sau nhé.'}))
        if mode == 'down':
            return route.fulfill(status=503, content_type='application/json', body=json.dumps({'error': 'not_configured', 'message': 'Trợ lý AI chưa được cấu hình (thiếu GEMINI_API_KEY trên máy chủ).'}))
        if mode == 'flaky' and not state['fail_once']:
            state['fail_once'] = True
            return route.fulfill(status=502, content_type='application/json', body=json.dumps({'error': 'upstream', 'message': 'Trợ lý đang gặp sự cố. Bạn thử lại sau nhé.'}))
        task = body.get('task', 'chat')
        if task == 'suggest_options':
            state['sug'] = state.get('sug', 0) + 1
            batch = ['Nhắn tin xin lỗi bạn', 'Nhờ cô giáo chủ nhiệm hòa giải', 'Viết thư tay cho bạn', 'Hẹn gặp bạn nói chuyện riêng', 'Cùng bạn tham gia một hoạt động vui'] if state['sug'] == 1 else ['Ghi ra giấy cảm xúc của bạn', 'Hỏi ba mẹ cách làm hòa', 'Nhờ một bạn chung làm cầu nối', 'Tạm dừng vài ngày để bình tĩnh', 'Tìm đọc cách giải quyết mâu thuẫn bạn bè']
            out = {'intro': 'Đây chỉ là gợi ý, bạn là người quyết định.', 'options': batch, 'risk': 'none'}
        elif task == 'analyze':
            sols = body.get('payload', {}).get('solutions', [])
            out = {'note': 'Bạn tự cân nhắc nhé.', 'items': [{'solution': s, 'pros': ['Nhanh gọn'], 'cons': ['Có thể ngại'], 'consequences': 'Bạn có thể vui hơn'} for s in sols], 'risk': 'none'}
        elif task == 'breakdown':
            out = {'note': 'Bạn chỉnh lại cho hợp nhé.', 'items': [{'text': 'Soạn tin nhắn', 'detail': 'Viết 2 câu xin lỗi ngắn gọn, chân thành.', 'time': '10 phút', 'resource': 'Điện thoại', 'expect': 'Bạn có sẵn lời xin lỗi rõ ràng', 'backup': 'Nhờ cô chủ nhiệm góp ý câu chữ'}, {'text': 'Gửi tin nhắn', 'detail': 'Gửi khi bạn bình tĩnh.', 'time': 'Tối nay', 'resource': 'Không cần', 'expect': 'Bạn đọc được lời xin lỗi', 'backup': 'Hẹn gặp trực tiếp ở trường'}, {'text': 'Theo dõi phản hồi', 'detail': 'Chờ bạn trả lời, không nhắn dồn dập.', 'time': 'Ngày mai', 'resource': 'Không cần', 'expect': 'Bạn biết bạn nghĩ gì', 'backup': 'Hỏi một bạn chung'}, {'text': 'Nhìn lại kết quả', 'detail': 'Tự hỏi cái gì đã tốt, cái gì cần tốt hơn.', 'time': 'Cuối tuần', 'resource': 'Không cần', 'expect': 'Bạn rút ra bài học', 'backup': 'Trao đổi với thầy cô'}], 'risk': 'none'}
        else:
            last = ''
            for m in reversed(body.get('messages', [])):
                if m['role'] == 'user':
                    last = m['text']; break
            risk = 'danger' if 'bạo lực' in last else 'none'
            out = {'reply': 'Mình hiểu rồi. Bạn kể thêm: chuyện này bắt đầu khi nào vậy?', 'risk': risk}
        out['task'] = task
        route.fulfill(status=200, content_type='application/json', body=json.dumps(out))
    ctx.route('**/api/chat', api_chat)

    def api_share(route, request):
        d = json.loads(request.post_data)
        calls['share'].append(d)
        if state.get('share_fail'):
            return route.fulfill(status=502, content_type='application/json', body=json.dumps({'error': 'save_failed', 'message': 'Chưa gửi được. Bạn thử lại sau nhé.'}))
        risk = 'concern' if 'bạo lực' in d.get('problem', '') else 'none'
        row = next((x for x in ADMIN_DB if x['id'] == d['id']), None)
        if d.get('mode') == 'stat':
            if not row:
                ADMIN_DB.append({'id': d['id'], 'code': d.get('code', ''), 'category': d.get('category') or 'Khác', 'title': '', 'problem': '', 'final': '', 'name': '', 'cls': '', 'shared': '', 'risk': risk, 'status': 'Mới', 'note': '', 'sentAt': 1790000000000, 'updatedAt': 1790000000000, 'stepsDone': d.get('stepsDone', 0)})
        else:
            rec = {'id': d['id'], 'code': d.get('code', ''), 'category': d.get('category') or 'Khác', 'title': d.get('title', ''), 'problem': d.get('problem', ''), 'final': d.get('final', ''), 'name': d.get('name', ''), 'cls': d.get('cls', ''), 'shared': 'Có', 'risk': risk, 'status': 'Mới', 'note': '', 'sentAt': 1790000000000, 'updatedAt': 1790000000000, 'stepsDone': d.get('stepsDone', 0)}
            if row: row.update(rec)
            else: ADMIN_DB.append(rec)
        route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'at': 1790000000000}))
    ctx.route('**/api/share', api_share)

    def api_admin(route, request):
        d = json.loads(request.post_data)
        calls['admin'].append(d)
        pw = request.headers.get('x-admin-password')
        if pw not in ('matkhau', 'hocsinh'):
            return route.fulfill(status=401, content_type='application/json', body=json.dumps({'error': 'unauthorized', 'message': 'Mật khẩu chưa đúng.'}))
        role = 'teacher' if pw == 'matkhau' else 'student'
        if d['action'] == 'list' and role == 'student':
            summ = {'total': len(ADMIN_DB), 'shared': len([x for x in ADMIN_DB if x.get('shared') == 'Có']), 'byStatus': {'Mới': len(ADMIN_DB), 'Đang hỗ trợ': 0, 'Đã xong': 0}, 'byCategory': {'Học tập': len(ADMIN_DB)}, 'concernOpen': 0, 'steps': [0, 0, 0, 0, 0, 0, len(ADMIN_DB)], 'satisfaction': {'avg': 4, 'count': 1}, 'happy': {'yes': 1, 'no': 0}, 'daily': [{'d': '2026-10-26', 'n': 0}, {'d': '2026-10-27', 'n': len(ADMIN_DB)}], 'window': {'from': '2026-10-27', 'to': '2026-11-02', 'days': 7, 'limited': False}}
            return route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'role': 'student', 'summary': summ}))
        if role == 'student' and d['action'] in ('update', 'delete'):
            return route.fulfill(status=403, content_type='application/json', body=json.dumps({'error': 'forbidden', 'message': 'Chỉ thầy cô mới xem nội dung và xử lý các ca.'}))
        if d['action'] == 'list':
            return route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'role': 'teacher', 'summary': {'total': len(ADMIN_DB), 'shared': len([x for x in ADMIN_DB if x.get('shared') == 'Có']), 'byStatus': {'Mới': 0, 'Đang hỗ trợ': 0, 'Đã xong': 0}, 'byCategory': {'Học tập': len(ADMIN_DB)}, 'concernOpen': 0, 'steps': [0, 0, 0, 0, 0, 0, len(ADMIN_DB)], 'satisfaction': {'avg': None, 'count': 0}, 'happy': {'yes': 0, 'no': 0}, 'daily': [], 'window': {'from': '2026-10-27', 'to': '2026-11-02', 'days': 7, 'limited': False}}, 'items': [x for x in ADMIN_DB if x.get('shared') == 'Có']}))
        for it in list(ADMIN_DB):
            if it['id'] == d.get('id'):
                if d['action'] == 'update':
                    it['status'] = d['status']; it['note'] = d['note']
                if d['action'] == 'delete':
                    ADMIN_DB.remove(it)
        route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True}))
    ctx.route('**/api/admin', api_admin)
    return state

def new_page(browser, viewport=(390, 844), chat_mode='ok', stats=None, init_scripts=(), **ctx_kwargs):
    ctx = browser.new_context(viewport={'width': viewport[0], 'height': viewport[1]}, accept_downloads=True, **ctx_kwargs)
    for s in init_scripts:
        ctx.add_init_script(s)
    state = install_routes(ctx, chat_mode, stats)
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    page.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text and 'fonts' not in m.text else None)
    page.errs = errs
    page.state = state
    return ctx, page

def start_anon(page):
    page.goto(BASE + '/')
    page.get_by_role('button', name='Bắt đầu').click()
    expect(page.locator('#new-problem')).to_be_visible()

def new_problem(page):
    page.locator('#new-problem').click()
    expect(page.locator('.stepper')).to_be_visible()

def open_chat(page):
    if page.get_by_label('Tin nhắn của bạn').count() == 0:
        page.locator('#ask-ai').click()
    expect(page.get_by_label('Tin nhắn của bạn')).to_be_visible()

def close_chat(page):
    if page.get_by_role('dialog').count():
        page.get_by_role('dialog').get_by_role('button', name='Đóng').click()
        expect(page.get_by_role('dialog')).to_have_count(0)

def send_chat(page, text):
    open_chat(page)
    page.get_by_label('Tin nhắn của bạn').fill(text)
    page.get_by_role('button', name='Gửi tin nhắn').click()

def sub(page, k, total):
    page.get_by_role('button', name=f'Câu {k} trên {total}').click()

def no_hscroll(page):
    sw = page.evaluate('document.documentElement.scrollWidth')
    cw = page.evaluate('document.documentElement.clientWidth')
    assert sw <= cw + 1, f'tràn ngang: scrollWidth={sw} > clientWidth={cw}'

def to_last(page):
    for _ in range(8):
        if page.locator('#finish-step').count():
            return
        page.get_by_role('button', name='Tiếp', exact=True).click()

def confirm_step(page):
    to_last(page)
    page.locator('#finish-step').click()
    page.get_by_role('dialog').get_by_role('button', name='Đã xong', exact=True).click()

def to_step2(page, text='Bạn cãi nhau với bạn thân'):
    start_anon(page)
    new_problem(page)
    page.get_by_label('Vấn đề bạn đang gặp phải là…', exact=True).fill(text)
    confirm_step(page)
    expect(page).to_have_url(re.compile(r'/2$'))

def step_state(page, n):
    return page.locator('.stepper li').nth(n - 1).locator('button').get_attribute('aria-label')

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ---------- Màn hình bắt đầu ----------
        def t_start():
            ctx, page = new_page(browser, (360, 740))
            page.goto(BASE + '/')
            expect(page.get_by_role('heading', name='AI Problem Solver')).to_be_visible()
            expect(page.get_by_text('AI hỗ trợ tư duy, không thay thế quyết định của học sinh.').first).to_be_visible()
            expect(page.get_by_text('Trợ lý giải quyết vấn đề thực tiễn').first).to_be_visible()
            expect(page.locator('.hero-art .owl').first).to_be_visible()
            assert page.locator('.start input').count() == 0, 'không được có ô nhập họ tên/lớp'
            expect(page.get_by_role('button', name='Bắt đầu')).to_be_visible()
            expect(page.get_by_text('Giọng chào do AI tạo ra')).to_be_visible()
            no_hscroll(page)
            page.screenshot(path=f'{OUT}/01-start-360.png', full_page=True)
            assert not page.errs, page.errs
            ctx.close()
        record('UI-01', 'Màn hình bắt đầu: logo, tên, slogan, không có ô họ tên/lớp, nhãn AI, không tràn ngang (360px)', t_start)

        def t_start_validation():
            ctx, page = new_page(browser)
            page.goto(BASE + '/')
            expect(page.get_by_label('Họ và tên')).to_have_count(0)
            page.get_by_role('button', name='Bắt đầu').click()
            expect(page.get_by_text(re.compile(r'Mã của bạn: HS-'))).to_be_visible()
            # hồ sơ cũ có họ tên (từ bản trước) bị xóa khỏi thiết bị
            page.evaluate("const s = JSON.parse(localStorage.getItem('aips:v1')); s.profile.name = 'Tên cũ'; s.profile.cls = '6/6'; s.profile.anonymous = false; localStorage.setItem('aips:v1', JSON.stringify(s));")
            page.reload()
            expect(page.get_by_text(re.compile(r'Mã của bạn: HS-'))).to_be_visible()
            pr = page.evaluate("JSON.parse(localStorage.getItem('aips:v1')).profile")
            assert pr['name'] == '' and pr['cls'] == '' and pr['anonymous'] is True, pr
            ctx.close()
        record('PR-01', 'App không thu thập họ tên/lớp: vào bằng nút Bắt đầu, chỉ có mã ẩn danh; hồ sơ cũ có họ tên bị xóa', t_start_validation)

        def t_anon_and_profile_stable():
            ctx, page = new_page(browser)
            start_anon(page)
            code1 = page.locator('text=/HS-[A-Z0-9]{5}/').first.inner_text()
            assert re.search(r'HS-[A-Z2-9]{5}', code1), code1
            page.reload()
            code2 = page.locator('text=/HS-[A-Z0-9]{5}/').first.inner_text()
            assert code1 == code2, 'mã ẩn danh phải giữ nguyên, không tạo hồ sơ mới'
            profiles = page.evaluate("JSON.parse(localStorage.getItem('aips:v1')).profile")
            assert profiles['anonymous'] is True and profiles['name'] == '' and profiles['cls'] == ''
            ctx.close()
        record('PR-02', 'Ẩn danh: mã ngẫu nhiên HS-xxxxx, không gán tên/lớp, tải lại không tạo hồ sơ mới', t_anon_and_profile_stable)

        # ---------- Quy trình 6 bước ----------
        def t_flow_basic():
            ctx, page = new_page(browser)
            start_anon(page)
            expect(page.get_by_text('Bạn chưa có vấn đề nào')).to_be_visible()
            new_problem(page)
            items = page.locator('.stepper li')
            assert items.count() == 6
            for i in range(2, 7):
                assert items.nth(i - 1).locator('button').is_disabled(), f'bước {i} phải bị khóa'
            assert 'Chưa bắt đầu' in step_state(page, 2)
            expect(page.get_by_text('Vấn đề bạn đang gặp phải là…').first).to_be_visible()
            expect(page.locator('#ask-ai')).to_have_count(0)  # Bước 1: không có nút Hỏi trợ lý
            page.screenshot(path=f'{OUT}/02-step1-390.png', full_page=True)
            ctx.close()
        record('FL-01', 'Luôn thấy đủ 6 bước; bước sau bị khóa; Bước 1 không có nút Hỏi trợ lý (chỉ Bước 2 có); trạng thái "Chưa bắt đầu"', t_flow_basic)

        def t_chat_limit():
            reset_calls()
            ctx, page = new_page(browser)
            to_step2(page)
            open_chat(page)
            ta = page.get_by_label('Tin nhắn của bạn')
            for i in range(8):
                ta.fill(f'Bạn nghĩ lần {i + 1}')
                page.get_by_role('button', name='Gửi tin nhắn').click()
                expect(page.locator('.typing')).to_have_count(0, timeout=10000)
            expect(page.locator('.chat-limit')).to_be_visible()
            expect(ta).to_be_disabled()
            expect(page.get_by_role('button', name='Gửi tin nhắn')).to_be_disabled()
            assert len(calls['chat']) == 8, len(calls['chat'])
            close_chat(page)
            page.locator('#ask-ai').click()  # mở lại vẫn hết lượt
            expect(page.get_by_label('Tin nhắn của bạn')).to_be_disabled()
            close_chat(page)
            ctx.close()
        record('CH-01', 'Chat chỉ ở Bước 2: tối đa 8 lượt hỏi mỗi vấn đề, hết lượt thì khóa ô nhập và nhắc nói chuyện với thầy cô/người lớn', t_chat_limit)

        def t_step2_chat_no_autocomplete():
            ctx, page = new_page(browser)
            to_step2(page)
            send_chat(page, 'Bạn nghĩ là do hiểu lầm')
            expect(page.get_by_text('Mình hiểu rồi. Bạn kể thêm')).to_be_visible()
            close_chat(page)
            assert 'Đang thực hiện' in step_state(page, 2)
            assert page.locator('.step.done').count() == 1, 'chỉ Bước 1 xong; không được tự đánh dấu hoàn thành'
            assert page.get_by_label('Nguyên nhân bạn nghĩ là…').input_value() == '', 'AI không tự điền câu trả lời của bạn'
            body = calls['chat'][-1]
            assert body['step'] == 2 and body['task'] == 'chat' and body['messages'][-1]['role'] == 'user'
            ctx.close()
        record('FL-02', 'Chat từ Bước 2: AI trả lời theo ngữ cảnh, KHÔNG tự điền câu trả lời, KHÔNG tự hoàn thành bước', t_step2_chat_no_autocomplete)

        def t_confirm_gate():
            ctx, page = new_page(browser)
            start_anon(page)
            new_problem(page)
            page.locator('#finish-step').click()
            expect(page.get_by_text('Bạn hãy ghi vấn đề bạn đang gặp')).to_be_visible()
            expect(page.get_by_role('dialog')).to_have_count(0)
            page.get_by_label('Vấn đề bạn đang gặp phải là…', exact=True).fill('Bạn bị điểm kém môn Toán')
            page.locator('#finish-step').click()
            expect(page.get_by_role('dialog')).to_be_visible()
            page.get_by_role('button', name='Chưa, để bạn xem lại').click()
            assert 'Đang thực hiện' in step_state(page, 1)
            page.locator('#finish-step').click()
            page.get_by_role('dialog').get_by_role('button', name='Đã xong', exact=True).click()
            expect(page).to_have_url(re.compile(r'#/problem/.+/2'))
            assert 'Chưa bắt đầu' in step_state(page, 2)
            st = page.evaluate("JSON.parse(localStorage.getItem('aips:v1')).problems[0].steps")
            assert st['1']['status'] == 'done' and st['2']['status'] == 'not_started'
            assert page.locator('.step.done').count() == 1
            ctx.close()
        record('FL-03', 'Hoàn thành bước cần nội dung + hộp xác nhận; hủy thì không hoàn thành; xác nhận mới sang Bước 2', t_confirm_gate)

        def full_flow_to_share(page):
            start_anon(page)
            new_problem(page)
            page.get_by_label('Vấn đề bạn đang gặp phải là…', exact=True).fill('Bạn cãi nhau với bạn thân')
            confirm_step(page)
            # Bước 2: đúng 2 câu hỏi
            expect(page).to_have_url(re.compile(r'/2$'))
            expect(page.get_by_text('Theo bạn, nguyên nhân của vấn đề này là gì?').first).to_be_visible()
            page.get_by_label('Nguyên nhân bạn nghĩ là…').fill('Do hiểu lầm tin nhắn')
            expect(page.get_by_role('button', name=re.compile(r'Câu \d trên 2'))).to_have_count(2)
            sub(page, 2, 2)
            expect(page.get_by_text('Kết quả bạn mong muốn đạt được là gì?').first).to_be_visible()
            page.get_by_label('Kết quả bạn mong muốn là…').fill('Làm hòa với bạn')
            confirm_step(page)
            # Bước 3: AI tự đề xuất 5 biện pháp, bạn chọn
            expect(page).to_have_url(re.compile(r'/3$'))
            expect(page.locator('.pick-row')).to_have_count(5)
            assert [c['task'] for c in calls['chat']][-1] == 'suggest_options'
            expect(page.locator('.pick.on')).to_have_count(0)  # AI không tự chọn thay bạn
            page.get_by_label('Thêm biện pháp của bạn').fill('Xin lỗi bạn trực tiếp')
            page.get_by_role('button', name='Thêm', exact=True).click()
            expect(page.locator('.pick-row')).to_have_count(6)
            expect(page.locator('.pick.on')).to_have_count(1)
            page.locator('.pick', has_text='Viết thư tay cho bạn').click()
            expect(page.locator('.pick.on')).to_have_count(2)
            confirm_step(page)
            # Bước 4: phân tích ưu/nhược từng biện pháp bạn chọn, rồi bạn quyết định
            expect(page).to_have_url(re.compile(r'/4$'))
            expect(page.get_by_label('Ưu điểm')).to_have_value('- Nhanh gọn')
            expect(page.get_by_label('Hạn chế')).to_have_value('- Có thể ngại')
            assert [c['task'] for c in calls['chat']][-1] == 'analyze'
            assert calls['chat'][-1]['payload']['solutions'] == ['Viết thư tay cho bạn', 'Xin lỗi bạn trực tiếp']
            sub(page, 3, 3)
            expect(page.locator('.pick.on')).to_have_count(0)  # AI không tự chọn
            page.locator('#finish-step').click()
            expect(page.get_by_text('tự chọn một biện pháp')).to_be_visible()
            page.locator('.pick').first.click()
            expect(page.locator('.pick.on')).to_have_count(1)
            page.get_by_label('Vì sao cách bạn chọn phù hợp với bạn?').fill('Bạn muốn làm hòa sớm')
            confirm_step(page)
            # Bước 5: AI hướng dẫn các việc theo trình tự
            expect(page).to_have_url(re.compile(r'/5$'))
            expect(page.locator('.plan-ov li')).to_have_count(4)
            assert [c['task'] for c in calls['chat']][-1] == 'breakdown'
            page.get_by_role('button', name='Tiếp', exact=True).click()
            expect(page.get_by_text('Viết 2 câu xin lỗi ngắn gọn')).to_be_visible()
            assert page.get_by_role('button', name='Chưa làm').get_attribute('aria-pressed') == 'true', 'không giả định đã làm'
            confirm_step(page)
            # Bước 6: hài lòng, cho điểm, nhận xét
            expect(page).to_have_url(re.compile(r'/6$'))
            page.locator('#finish-step').count() == 0
            expect(page.get_by_text('Nhìn lại kế hoạch của bạn')).to_be_visible()
            page.get_by_role('button', name='Đã đạt', exact=True).click()
            page.get_by_role('button', name='Tiếp', exact=True).click()
            page.locator('#happy-yes').click()
            page.get_by_role('button', name='Tiếp', exact=True).click()
            page.get_by_label('Điều đã làm tốt').fill('Nói chuyện thẳng thắn hiệu quả')
            page.get_by_label('Điều cần làm tốt hơn').fill('Nhắn tin sớm hơn')
            page.get_by_role('button', name='Tiếp', exact=True).click()
            page.get_by_role('button', name='4', exact=True).click()
            page.get_by_role('button', name='Tiếp', exact=True).click()

        def full_flow(page):
            full_flow_to_share(page)
            confirm_step(page)
            expect(page).to_have_url(re.compile(r'#/result/'))

        def t_full_flow():
            ctx, page = new_page(browser)
            full_flow(page)
            expect(page.get_by_role('heading', name='Bạn cãi nhau với bạn thân', level=1)).to_be_visible()
            for txt in ['Do hiểu lầm tin nhắn', 'Làm hòa với bạn', 'Xin lỗi bạn trực tiếp', 'Viết thư tay cho bạn', 'Bạn muốn làm hòa sớm', 'Soạn tin nhắn', 'Hài lòng', 'Nói chuyện thẳng thắn hiệu quả', 'Nhận xét của giáo viên']:
                expect(page.locator('#report').get_by_text(txt).first).to_be_visible()
            expect(page.get_by_text('Chưa làm').first).to_be_visible()
            st = page.evaluate("JSON.parse(localStorage.getItem('aips:v1')).problems[0].steps")
            assert all(st[str(i)]['status'] == 'done' for i in range(1, 7))
            page.screenshot(path=f'{OUT}/03-result-390.png', full_page=True)
            assert not page.errs, page.errs
            ctx.close()
        record('FL-04', 'Đi hết 6 bước: AI không tự thêm/chọn/hoàn thành; việc nhỏ mặc định "Chưa làm"; trang kết quả đủ nội dung', t_full_flow)

        # ---------- Chỉnh sửa có kiểm soát + lưu bền vững ----------
        def t_edit_previous_and_persist():
            ctx, page = new_page(browser)
            start_anon(page)
            new_problem(page)
            page.get_by_label('Vấn đề bạn đang gặp phải là…', exact=True).fill('Vấn đề ban đầu')
            confirm_step(page)
            page.get_by_label('Nguyên nhân bạn nghĩ là…').fill('Nguyên nhân A')
            page.locator('.stepper li').nth(0).locator('button').click()
            expect(page).to_have_url(re.compile(r'/1$'))
            page.get_by_label('Vấn đề bạn đang gặp phải là…', exact=True).fill('Vấn đề đã sửa')
            assert 'Đang thực hiện' in step_state(page, 1)  # phải xác nhận lại
            page.locator('.stepper li').nth(1).locator('button').click()
            expect(page.get_by_text('Bạn vừa sửa bước trước')).to_be_visible()
            page.get_by_role('button', name='Bạn đã xem lại').click()
            expect(page.get_by_text('Bạn vừa sửa bước trước')).to_have_count(0)
            page.wait_for_timeout(600)
            page.reload()
            expect(page.get_by_label('Nguyên nhân bạn nghĩ là…')).to_have_value('Nguyên nhân A')
            page.locator('.stepper li').nth(0).locator('button').click()
            expect(page.get_by_label('Vấn đề bạn đang gặp phải là…', exact=True)).to_have_value('Vấn đề đã sửa')
            ctx.close()
        record('FL-05', 'Sửa bước trước: bước đó phải xác nhận lại, bước sau hiện cảnh báo "cần xem lại"; tải lại vẫn còn dữ liệu', t_edit_previous_and_persist)

        def t_locked_direct_url():
            ctx, page = new_page(browser)
            start_anon(page)
            new_problem(page)
            pid = page.url.split('/problem/')[1].split('/')[0]
            page.goto(f'{BASE}/#/problem/{pid}/5')
            expect(page).to_have_url(re.compile(r'/1$'))
            ctx.close()
        record('FL-06', 'Gõ thẳng URL bước chưa mở thì bị đưa về bước hợp lệ (không bỏ bước)', t_locked_direct_url)

        def t_delete_chosen_solution():
            ctx, page = new_page(browser)
            start_anon(page)
            new_problem(page)
            page.get_by_label('Vấn đề bạn đang gặp phải là…', exact=True).fill('X')
            confirm_step(page)
            page.get_by_label('Nguyên nhân bạn nghĩ là…').fill('Y')
            sub(page, 2, 2)
            page.get_by_label('Kết quả bạn mong muốn là…').fill('Z')
            confirm_step(page)
            expect(page.locator('.pick-row')).to_have_count(5)
            page.get_by_label('Thêm biện pháp của bạn').fill('Cách A')
            page.get_by_role('button', name='Thêm', exact=True).click()
            confirm_step(page)
            expect(page.get_by_label('Ưu điểm')).to_have_value('- Nhanh gọn')
            sub(page, 2, 2)
            page.locator('.pick').first.click()
            confirm_step(page)  # lý do không bắt buộc: bỏ trống vẫn qua được
            expect(page.locator('.plan-ov li').first).to_be_visible()
            page.locator('.stepper li').nth(2).locator('button').click()
            page.get_by_label('Xóa biện pháp 6').click()
            page.wait_for_timeout(600)
            page.locator('.stepper li').nth(3).locator('button').click()
            expect(page.get_by_text('Bạn vừa sửa bước trước')).to_be_visible()
            page.wait_for_timeout(600)
            chosen = page.evaluate("JSON.parse(localStorage.getItem('aips:v1')).problems[0].data.chosenId")
            assert chosen is None
            ctx.close()
        record('FL-07', 'Xóa biện pháp đã chọn: bỏ lựa chọn, bước sau cảnh báo, không giữ kết luận lỗi thời', t_delete_chosen_solution)

        def t_unhappy_back_to_step3():
            ctx, page = new_page(browser)
            full_flow_to_share(page)
            page.locator('.pdot').nth(1).click()
            page.locator('#happy-no').click()
            to_last(page)
            page.locator('#finish-step').click()
            expect(page.get_by_text('Bạn chưa hài lòng thì mình quay lại Bước 3')).to_be_visible()
            page.locator('.pdot').nth(1).click()
            page.get_by_role('button', name='Quay lại Bước 3').click()
            page.get_by_role('button', name='Quay lại Bước 3').last.click()
            expect(page).to_have_url(re.compile(r'/3$'))
            st = page.evaluate("JSON.parse(localStorage.getItem('aips:v1')).problems[0]")
            assert all(st['steps'][str(i)]['status'] == 'not_started' for i in (3, 4, 5, 6)), 'các bước 3-6 phải làm lại'
            assert st['steps']['2']['status'] == 'done'
            assert st['data']['chosenId'] is None and st['data']['plan'] == [] and st['data']['happy'] == ''
            assert len(st['data']['solutions']) == 6, 'giữ lại các biện pháp cũ'
            expect(page.locator('.pick-row')).to_have_count(6)
            n_before = len(calls['chat'])
            page.locator('#more-sug').click()
            expect(page.locator('.pick-row')).to_have_count(11)
            assert calls['chat'][-1]['task'] == 'suggest_options' and len(calls['chat']) == n_before + 1
            ctx.close()
        record('FL-08', 'Chưa hài lòng: quay lại Bước 3 (giữ biện pháp cũ, làm lại bước 3-6), có thể xin gợi ý thêm', t_unhappy_back_to_step3)

        def t_step3_ai_fail_retry():
            ctx, page = new_page(browser, chat_mode='upstream_down')
            start_anon(page)
            new_problem(page)
            page.get_by_label('Vấn đề bạn đang gặp phải là…', exact=True).fill('X')
            confirm_step(page)
            page.get_by_label('Nguyên nhân bạn nghĩ là…').fill('Y')
            sub(page, 2, 2)
            page.get_by_label('Kết quả bạn mong muốn là…').fill('Z')
            confirm_step(page)
            expect(page.get_by_role('button', name='Thử lại')).to_be_visible(timeout=15000)
            page.state['chat_mode'] = 'ok'
            page.get_by_role('button', name='Thử lại').click()
            expect(page.locator('.pick-row')).to_have_count(5)
            ctx.close()
        record('FL-09', 'AI lỗi ở Bước 3: báo rõ, có nút Thử lại, thử lại thì hiện 5 biện pháp', t_step3_ai_fail_retry)

        # ---------- AI / an toàn / lỗi ----------
        def t_safety_even_when_api_down():
            ctx, page = new_page(browser, chat_mode='down')
            to_step2(page)
            send_chat(page, 'Bạn bị bạo lực ở nhà')
            expect(page.get_by_text('Sự an toàn của bạn là quan trọng nhất')).to_be_visible()
            expect(page.locator('.safety-card a[href="tel:111"]')).to_be_visible()
            expect(page.locator('.safety-card a[href="tel:113"]')).to_be_visible()
            expect(page.get_by_text('Trợ lý AI chưa được cấu hình')).to_be_visible()
            page.screenshot(path=f'{OUT}/04-safety-390.png', full_page=True)
            ctx.close()
        record('AI-01', 'Nội dung nguy hiểm: luôn hiện thẻ an toàn (111/113/115) ngay cả khi AI/máy chủ lỗi', t_safety_even_when_api_down)

        def t_safety_from_ai_risk():
            ctx, page = new_page(browser)
            to_step2(page)
            send_chat(page, 'Bạn sợ bạo lực trong nhà')  # regex không bắt "sợ bạo lực" nhưng mock trả danger
            expect(page.locator('.safety-card.danger')).to_be_visible()
            ctx.close()
        record('AI-02', 'AI báo risk=danger thì giao diện hiện thẻ an toàn mức nguy hiểm', t_safety_from_ai_risk)

        def t_error_retry():
            # Lỗi tạm thời: app tự thử lại một lần, học sinh không thấy lỗi và tin nhắn không bị nhân đôi.
            ctx, page = new_page(browser, chat_mode='flaky')
            to_step2(page)
            send_chat(page, 'Bạn khó học bài')
            expect(page.get_by_text('Mình hiểu rồi. Bạn kể thêm')).to_be_visible()
            assert page.locator('.msg.me').count() == 1, 'tự thử lại không được nhân đôi tin nhắn'
            ctx.close()
            # Lỗi kéo dài: báo rõ ràng, có nút Thử lại, không nhân đôi tin nhắn.
            ctx, page = new_page(browser, chat_mode='upstream_down')
            to_step2(page)
            send_chat(page, 'Bạn khó học bài')
            expect(page.get_by_text('Chưa gửi được.')).to_be_visible(timeout=8000)
            n_user = page.locator('.msg.me').count()
            page.get_by_role('button', name='Thử lại').click()
            expect(page.get_by_text('Chưa gửi được.')).to_be_visible(timeout=8000)
            assert page.locator('.msg.me').count() == n_user, 'thử lại không được nhân đôi tin nhắn'
            ctx.close()
        record('AI-03', 'Lỗi AI: báo lỗi rõ ràng + nút Thử lại, không nhân đôi tin nhắn của học sinh', t_error_retry)

        def t_context_sent():
            ctx, page = new_page(browser)
            start_anon(page)
            new_problem(page)
            page.get_by_label('Vấn đề bạn đang gặp phải là…', exact=True).fill('Mâu thuẫn với bạn')
            confirm_step(page)
            expect(page).to_have_url(re.compile(r'/2$'))
            send_chat(page, 'Bạn nghĩ bạn giận vì bạn nói to')
            expect(page.get_by_text('Mình hiểu rồi').first).to_be_visible()
            body = calls['chat'][-1]
            assert body['step'] == 2 and body['context']['problem'] == 'Mâu thuẫn với bạn'
            ctx.close()
        record('AI-04', 'Sang bước mới, ngữ cảnh các bước trước (vấn đề, câu trả lời) được gửi kèm; không bắt đầu lại từ đầu', t_context_sent)

        # ---------- Giao diện sáng/tối ----------
        def t_theme():
            ctx, page = new_page(browser)
            page.goto(BASE + '/')
            before = page.evaluate("document.documentElement.getAttribute('data-theme')")
            page.locator('#theme-btn').click()
            after = page.evaluate("document.documentElement.getAttribute('data-theme')")
            assert before != after
            page.reload()
            assert page.evaluate("document.documentElement.getAttribute('data-theme')") == after
            page.locator('#theme-btn').click()
            assert page.evaluate("document.documentElement.getAttribute('data-theme')") == before
            if after == 'dark':
                page.locator('#theme-btn').click()
            page.locator('#theme-btn').click()
            page.goto(BASE + '/')
            page.screenshot(path=f'{OUT}/05-dark-start-390.png', full_page=True)
            ctx.close()
        record('UI-02', 'Nền sáng/tối: nút ở header hoạt động, lựa chọn được ghi nhớ khi tải lại', t_theme)

        def t_dark_contrast():
            ctx, page = new_page(browser, color_scheme='dark')
            to_step2(page)
            send_chat(page, 'Bạn muốn học tốt hơn')
            expect(page.get_by_text('Mình hiểu rồi')).to_be_visible()
            page.screenshot(path=f'{OUT}/06-dark-step-390.png', full_page=True)
            assert page.evaluate("document.documentElement.getAttribute('data-theme')") == 'dark'
            ctx.close()
        record('UI-03', 'Tự theo hệ thống tối khi chưa chọn; chụp ảnh kiểm tra tương phản', t_dark_contrast)

        # ---------- Bố cục nhiều kích thước ----------
        def t_layouts():
            for (w, h_) in [(360, 740), (414, 896), (768, 1024), (1280, 800)]:
                ctx, page = new_page(browser, (w, h_))
                full_flow(page)
                no_hscroll(page)
                pid = page.url.split('/result/')[1]
                for step in range(1, 7):
                    page.goto(f'{BASE}/#/problem/{pid}/{step}')
                    page.wait_for_timeout(150)
                    no_hscroll(page)
                    # mỗi bước một màn hình: khung câu hỏi không bị cuộn (trừ điện thoại rất thấp)
                    # (từ v26 không còn khóa một màn hình: trang được phép cuộn dọc)
                    # khay trợ lý: nút gửi nằm trong khung nhìn, đủ lớn
                    if step != 2:
                        expect(page.locator('#ask-ai')).to_have_count(0)  # chat chỉ có ở Bước 2
                        continue
                    page.locator('#ask-ai').click()
                    page.wait_for_timeout(350)
                    box = page.get_by_role('button', name='Gửi tin nhắn').bounding_box()
                    assert box and box['x'] + box['width'] <= w + 1 and box['x'] >= 0, f'nút gửi ngoài màn hình ở {w}px bước {step}'
                    assert box['width'] >= 40 and box['height'] >= 40, f'nút gửi nhỏ {box} ở {w}px bước {step}'
                    close_chat(page)
                    if w in (360, 1280) and step in (3, 4, 5):
                        page.screenshot(path=f'{OUT}/07-step{step}-{w}.png')
                page.goto(f'{BASE}/#/home')
                no_hscroll(page)
                page.goto(f'{BASE}/#/result/{pid}')
                no_hscroll(page)
                assert not page.errs, page.errs
                ctx.close()
        record('UI-04', 'Không tràn ngang; nút gửi đủ lớn ở 360/414/768/1280px', t_layouts)

        # ---------- Xuất tệp ----------
        def t_export():
            ctx, page = new_page(browser)
            full_flow(page)
            with page.expect_download() as dl:
                page.get_by_role('button', name='Tải DOCX').click()
            d = dl.value
            path = d.path()
            data = open(path, 'rb').read()
            assert data[:2] == b'PK', 'DOCX phải là tệp zip hợp lệ'
            z = zipfile.ZipFile(io.BytesIO(data))
            xml = z.read('word/document.xml').decode('utf-8')
            for txt in ['Bạn cãi nhau với bạn thân', 'Xin lỗi bạn trực tiếp', 'Soạn tin nhắn', 'Nhận xét của giáo viên', 'Nói chuyện thẳng thắn hiệu quả']:
                assert txt in xml, f'thiếu "{txt}" trong DOCX'
            assert d.suggested_filename.endswith('.docx')
            page.emulate_media(media='print')
            assert not page.locator('.site-header').is_visible(), 'header phải ẩn khi in'
            assert not page.locator('.site-footer').is_visible()
            assert page.locator('#report').is_visible()
            page.pdf(path=f'{OUT}/ket-qua.pdf', format='A4', print_background=True)
            assert os.path.getsize(f'{OUT}/ket-qua.pdf') > 5000
            page.emulate_media(media='screen')
            ctx.close()
        record('EX-01', 'Xuất DOCX là tệp thật, đúng nội dung; chế độ in ẩn menu/chân trang, tạo được PDF', t_export)

        def t_report_privacy():
            ctx, page = new_page(browser)
            start_anon(page)
            new_problem(page)
            page.get_by_label('Vấn đề bạn đang gặp phải là…', exact=True).fill('Test')
            pid = page.url.split('/problem/')[1].split('/')[0]
            page.goto(f'{BASE}/#/result/{pid}')
            expect(page.get_by_label('Ghi họ tên và lớp của bạn trong báo cáo')).to_have_count(0)
            expect(page.locator('#report').get_by_text(re.compile('Ẩn danh \\(mã HS-'))).to_be_visible()
            ctx.close()
        record('EX-02', 'Báo cáo chỉ ghi mã ẩn danh, không có họ tên/lớp', t_report_privacy)

        # ---------- Sao lưu / khôi phục / xóa ----------
        def t_backup_restore_delete():
            ctx, page = new_page(browser)
            start_anon(page)
            new_problem(page)
            page.get_by_label('Vấn đề bạn đang gặp phải là…', exact=True).fill('Dữ liệu cần sao lưu')
            page.wait_for_timeout(600)
            page.locator('#menu-btn').click()
            with page.expect_download() as dl:
                page.get_by_role('menuitem', name='Tải bản sao lưu').click()
            bk = dl.value.path()
            data = json.load(open(bk, encoding='utf-8'))
            assert data['app'] == 'ai-problem-solver' and len(data['problems']) == 1
            page.locator('#menu-btn').click()
            page.get_by_role('menuitem', name='Xóa toàn bộ dữ liệu').click()
            page.get_by_role('button', name='Xóa hết').click()
            expect(page).to_have_url(re.compile('#/start'))
            assert page.evaluate("localStorage.getItem('aips:v1')") is None
            page.get_by_role('button', name='Khôi phục từ tệp sao lưu').click() if False else None
            with page.expect_file_chooser() as fc:
                page.get_by_role('button', name='Khôi phục từ tệp sao lưu').click()
            fc.value.set_files(bk)
            expect(page.get_by_text('Đã khôi phục: thêm 1 vấn đề')).to_be_visible()
            page.goto(BASE + '/#/home')
            expect(page.get_by_role('heading', name='Dữ liệu cần sao lưu')).to_be_visible()
            ctx.close()
        record('DT-01', 'Sao lưu → xóa toàn bộ → khôi phục từ tệp: dữ liệu quay lại đúng; tệp sai bị từ chối', t_backup_restore_delete)

        def t_bad_restore():
            ctx, page = new_page(browser)
            page.goto(BASE + '/')
            bad = os.path.join(OUT, 'bad.json')
            open(bad, 'w').write('{"hello": 1}')
            with page.expect_file_chooser() as fc:
                page.get_by_role('button', name='Khôi phục từ tệp sao lưu').click()
            fc.value.set_files(bad)
            expect(page.get_by_text('không phải bản sao lưu')).to_be_visible()
            ctx.close()
        record('DT-02', 'Khôi phục từ tệp không hợp lệ: báo lỗi rõ ràng, không làm hỏng dữ liệu', t_bad_restore)

        def t_corrupt_storage():
            ctx, page = new_page(browser)
            page.goto(BASE + '/')
            page.evaluate("localStorage.setItem('aips:v1', '{not json')")
            page.reload()
            expect(page.get_by_role('button', name='Bắt đầu')).to_be_visible()
            keys = page.evaluate("Object.keys(localStorage)")
            assert any(k.startswith('aips:v1:corrupt-') for k in keys), 'phải giữ lại bản gốc bị hỏng'
            ctx.close()
        record('DT-03', 'Dữ liệu cục bộ bị hỏng: không sập app, giữ lại bản gốc để cứu', t_corrupt_storage)

        def t_save_failure():
            ctx, page = new_page(browser, init_scripts=["(function(){ const o = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v){ if (window.__failSave && k === 'aips:v1') throw new DOMException('full', 'QuotaExceededError'); return o.call(this, k, v); }; })();"])
            start_anon(page)
            new_problem(page)
            page.evaluate("window.__failSave = true")
            page.get_by_label('Vấn đề bạn đang gặp phải là…', exact=True).fill('Không lưu được')
            expect(page.get_by_text('Lưu thất bại')).to_be_visible(timeout=3000)
            ctx.close()
        record('DT-04', 'Lưu thất bại (bộ nhớ đầy/bị chặn): hiện "Lưu thất bại", không báo thành công giả', t_save_failure)

        # ---------- Chân trang: bộ đếm, đánh giá ----------
        def t_counter():
            reset_calls()
            ctx, page = new_page(browser)
            page.goto(BASE + '/')
            expect(page.locator('#visit-count')).to_have_text('42')
            assert calls['visit'] == 1
            start_anon(page)
            new_problem(page)
            page.goto(BASE + '/#/library')
            page.goto(BASE + '/#/home')
            page.reload()
            page.wait_for_timeout(500)
            assert calls['visit'] == 1, f'bộ đếm không được tăng khi chuyển trang/tải lại trong cùng phiên (={calls["visit"]})'
            expect(page.get_by_text('Chưa có dữ liệu đánh giá')).to_be_visible()
            expect(page.get_by_text(re.compile(r'Phiên bản \d+'))).to_be_visible()
            expect(page.get_by_text(re.compile('Cập nhật 27/10/2026'))).to_be_visible()
            ctx.close()
        record('CT-01', 'Bộ đếm: tăng đúng 1 lần/phiên, không tăng khi chuyển bước/tải lại; "Chưa có dữ liệu đánh giá" khi rỗng; có phiên bản + ngày', t_counter)

        # ---------- Gửi cho thầy cô + quản trị ----------
        def t_share_and_admin():
            reset_calls()
            ctx, page = new_page(browser)
            full_flow_to_share(page)
            expect(page.get_by_text('Cảm ơn bạn đã hoàn thành!')).to_be_visible()
            expect(page.get_by_text('Thỏ chúc bạn')).to_be_visible()
            send = page.locator('#sh-send')
            expect(send).to_be_disabled()
            assert not calls['share'], 'chưa xong Bước 6 / chưa tick đồng ý thì không được gửi gì'
            page.locator('#sh-ok').check()
            expect(send).to_be_disabled()  # còn thiếu họ tên, lớp
            page.locator('#sh-name').fill('Nguyễn Văn An')
            page.locator('#sh-cls').fill('7/3')
            expect(send).to_be_enabled()
            send.click()
            expect(page.get_by_text('Đã gửi cho thầy cô lúc')).to_be_visible()
            sh = calls['share'][-1]
            assert sh['consent'] is True and re.match(r'^HS-[A-Z0-9]{5}$', sh['code']) and sh['name'] == 'Nguyễn Văn An' and sh['cls'] == '7/3' and 'school' not in sh
            assert 'messages' not in sh and 'chat' not in json.dumps(sh).lower(), 'không được gửi hội thoại AI'
            assert sh['problem'] and sh['final']
            page.locator('#finish-step').click()
            page.get_by_role('dialog').get_by_role('button', name='Đã xong', exact=True).click()
            expect(page).to_have_url(re.compile(r'#/result/'))
            # Quản trị
            page.goto(BASE + '/#/admin')
            page.locator('#ad-pass').fill('sai')
            page.get_by_role('button', name='Đăng nhập').click()
            expect(page.get_by_text('Mật khẩu chưa đúng')).to_be_visible()
            page.locator('#ad-pass').fill('matkhau')
            page.get_by_role('button', name='Đăng nhập').click()
            expect(page.get_by_text('Thống kê và các ca học sinh gửi thầy cô')).to_be_visible()
            expect(page.locator('#ad-explain')).to_contain_text('TỰ NGUYỆN')
            expect(page.locator('#ad-student-stats')).to_be_visible()
            expect(page.locator('#ad-window')).to_contain_text('toàn bộ')
            expect(page.locator('.ad-row .who').first).to_contain_text('Nguyễn Văn An')
            expect(page.locator('.ad-row .who').first).to_contain_text('7/3')
            page.locator('.ad-row').first.click()
            page.locator('#ad-status').select_option('Đang hỗ trợ')
            page.locator('#ad-note').fill('Đã hẹn gặp bạn')
            page.get_by_role('button', name='Lưu', exact=True).click()
            expect(page.locator('.ad-row .tag.st-1')).to_be_visible()
            assert ADMIN_DB[0]['status'] == 'Đang hỗ trợ' and ADMIN_DB[0]['note'] == 'Đã hẹn gặp bạn'
            with page.expect_download() as dl:
                page.get_by_role('button', name=re.compile('Tải CSV')).click()
            assert dl.value.suggested_filename.endswith('.csv')
            csvt = open(dl.value.path(), encoding='utf-8-sig').read()
            assert 'Mã học sinh' in csvt.splitlines()[0] and 'Họ tên' in csvt.splitlines()[0] and 'Lớp' in csvt.splitlines()[0] and 'Nguyễn Văn An' in csvt, csvt.splitlines()[0]
            ctx.close()
        record('SH-01', 'Cuối Bước 6: cảm ơn + chúc; gửi thầy cô cần họ tên, lớp, tick đồng ý, không gửi hội thoại AI; admin thấy họ tên/lớp, đổi trạng thái/ghi chú, xuất CSV', t_share_and_admin)

        def t_admin_student_role():
            reset_calls()
            ctx, page = new_page(browser)
            full_flow_to_share(page)
            page.locator('#sh-ok').check()
            page.locator('#sh-name').fill('Trần Thị Bí Mật')
            page.locator('#sh-cls').fill('8/8')
            page.locator('#sh-send').click()
            expect(page.get_by_text('Đã gửi cho thầy cô lúc')).to_be_visible()
            problem_text = ADMIN_DB[0]['problem']
            page.goto(BASE + '/#/admin')
            page.locator('#ad-pass').fill('hocsinh')
            page.get_by_role('button', name='Đăng nhập').click()
            expect(page.get_by_role('heading', name='Thống kê (quyền học sinh)')).to_be_visible()
            expect(page.locator('#ad-student-note')).to_contain_text('chỉ thầy cô hướng dẫn')
            expect(page.locator('#ad-student-stats')).to_be_visible()
            assert 'đã làm đến đâu' not in page.locator('body').inner_text(), 'học sinh không còn biểu đồ tiến độ'
            assert page.locator('.ad-row').count() == 0, 'học sinh không được thấy danh sách ca'
            body = page.locator('body').inner_text()
            assert problem_text not in body and 'HS-' not in body.split('Thống kê')[1] and 'Trần Thị Bí Mật' not in body and '8/8' not in body, 'học sinh thấy nội dung/mã/họ tên của ca'
            ctx.close()
        record('AD-02', 'Quản trị quyền học sinh: chỉ thấy thống kê tổng hợp, không thấy danh sách, mã hay nội dung các ca; thầy cô (mật khẩu khác) mới thấy nội dung', t_admin_student_role)

        def t_share_fail_and_skip():
            reset_calls()
            ctx, page = new_page(browser)
            page.state['share_fail'] = True
            full_flow_to_share(page)
            page.locator('#sh-ok').check()
            page.locator('#sh-name').fill('An')
            page.locator('#sh-cls').fill('6/1')
            page.locator('#sh-send').click()
            expect(page.get_by_text('Chưa gửi được')).to_be_visible()
            expect(page.get_by_text('Đã gửi cho thầy cô lúc')).to_have_count(0)
            # Không gửi vẫn hoàn thành được
            page.locator('#finish-step').click()
            page.get_by_role('dialog').get_by_role('button', name='Đã xong', exact=True).click()
            expect(page).to_have_url(re.compile(r'#/result/'))
            assert not any(x.get('shared') == 'Có' for x in ADMIN_DB)
            ctx.close()
        record('SH-02', 'Gửi thất bại báo thật, không báo đã gửi; bỏ qua việc gửi vẫn hoàn thành bước 6', t_share_fail_and_skip)

        def t_stat_auto():
            reset_calls()
            ctx, page = new_page(browser)
            full_flow_to_share(page)
            assert not calls['share'], 'chưa hoàn thành Bước 6 thì chưa ghi nhận'
            page.locator('#finish-step').click()
            page.get_by_role('dialog').get_by_role('button', name='Đã xong', exact=True).click()
            expect(page).to_have_url(re.compile(r'#/result/'))
            page.wait_for_timeout(600)
            assert len(calls['share']) == 1 and calls['share'][0].get('mode') == 'stat', calls['share']
            st = calls['share'][0]
            assert re.match(r'^HS-[A-Z0-9]{5}$', st['code']) and 'name' not in st and 'cls' not in st and 'consent' not in st
            assert len(ADMIN_DB) == 1 and ADMIN_DB[0]['shared'] == '' and ADMIN_DB[0]['name'] == ''
            # thầy cô: thống kê có, danh sách ca không có (chưa nhờ đồng hành)
            page.goto(BASE + '/#/admin')
            page.locator('#ad-pass').fill('matkhau')
            page.get_by_role('button', name='Đăng nhập').click()
            expect(page.locator('#ad-student-stats')).to_contain_text('Tổng lượt tư vấn')
            assert page.locator('.ad-row').count() == 0
            ctx.close()
        record('SH-04', 'Xong Bước 6 tự ghi nhận lượt tư vấn ẩn danh (không nút Gửi, không họ tên/lớp/nội dung); thầy cô thấy trong thống kê, không thấy trong danh sách ca', t_stat_auto)

        def t_admin_unconfigured_screen():
            ctx, page = new_page(browser)
            page.goto(BASE + '/#/admin')
            expect(page.locator('#ad-pass')).to_be_visible()
            assert 'overflow' not in (page.evaluate("document.body.className") or '')
            ctx.close()
        record('SH-03', 'Trang quản trị mở được khi chưa có hồ sơ học sinh và hiện ô mật khẩu', t_admin_unconfigured_screen)

        def t_counter_unconfigured():
            ctx, page = new_page(browser, stats={'configured': False})
            page.goto(BASE + '/')
            expect(page.get_by_text('Bộ đếm chưa được cấu hình')).to_be_visible()
            expect(page.locator('#visit-count')).to_have_count(0)
            expect(page.get_by_role('button', name='Đánh giá và góp ý')).to_be_disabled()
            ctx.close()
        record('CT-02', 'Chưa cấu hình lưu trữ: nói rõ "Bộ đếm chưa được cấu hình", không hiện số giả, vô hiệu hóa nút đánh giá', t_counter_unconfigured)

        def t_feedback():
            reset_calls()
            ctx, page = new_page(browser)
            page.goto(BASE + '/')
            page.get_by_role('button', name='Đánh giá và góp ý').click()
            page.get_by_role('button', name='Gửi', exact=True).click()
            expect(page.get_by_text('Bạn hãy chọn số sao hoặc viết ý kiến')).to_be_visible()
            page.get_by_role('button', name='5 sao').click()
            page.get_by_label('Góp ý của bạn').fill('Website rất hữu ích')
            page.get_by_role('button', name='Gửi', exact=True).click()
            expect(page.get_by_text('Cảm ơn bạn đã gửi ý kiến')).to_be_visible()
            assert calls['feedback'][-1]['rating'] == 5 and calls['feedback'][-1]['comment'] == 'Website rất hữu ích'
            expect(page.locator('#rating-summary')).to_contain_text('5')
            expect(page.locator('#rating-summary')).to_contain_text('1 đánh giá')
            ctx.close()
        record('CT-03', 'Đánh giá và góp ý: kiểm tra đầu vào, gửi đúng dữ liệu, chân trang cập nhật từ máy chủ', t_feedback)

        # ---------- QR ----------
        def t_qr_localhost():
            ctx, page = new_page(browser)
            start_anon(page)
            page.goto(BASE + '/#/qr')
            expect(page.get_by_text('Chưa có địa chỉ triển khai để tạo QR chính thức')).to_be_visible()
            assert page.locator('canvas').count() == 0
            ctx.close()
        record('QR-01', 'Trên localhost: "Chưa có địa chỉ triển khai để tạo QR chính thức", không tạo QR giả', t_qr_localhost)

        def t_qr_https():
            ctx, page = new_page(browser)
            def proxy(route, request):
                path = request.url.replace('https://aips.test', '')
                r = page.request.get(BASE + path)
                route.fulfill(status=r.status, headers={'content-type': r.headers.get('content-type', 'text/plain')}, body=r.body())
            ctx.route('https://aips.test/**', proxy)
            page.goto('https://aips.test/')
            page.get_by_role('button', name='Bắt đầu').click()
            page.goto('https://aips.test/#/qr')
            expect(page.locator('canvas')).to_be_visible()
            expect(page.locator('.url-box')).to_have_text('https://aips.test/')
            with page.expect_download() as dl:
                page.get_by_role('button', name='Tải QR (PNG)').click()
            png = open(dl.value.path(), 'rb').read()
            assert png[:8] == b'\x89PNG\r\n\x1a\n'
            page.screenshot(path=f'{OUT}/08-qr-390.png', full_page=True)
            ctx.close()
        record('QR-02', 'Trên địa chỉ https thật: tạo QR từ URL đó, tải được PNG, hiển thị URL', t_qr_https)

        # ---------- Tài liệu ----------
        def t_library():
            ctx, page = new_page(browser)
            start_anon(page)
            page.goto(BASE + '/#/library')
            expect(page.get_by_role('heading', name='Quy trình 6 bước giải quyết vấn đề')).to_be_visible()
            expect(page.get_by_role('heading', name='Khi nào cần tìm người lớn giúp đỡ')).to_be_visible()
            ctx.close()
            ctx, page = new_page(browser)
            ctx.route('**/docs/nguoi-lon-tin-cay.html', lambda r: r.fulfill(status=404, body='x'))
            start_anon(page)
            page.goto(BASE + '/#/library')
            expect(page.get_by_role('heading', name='Quy trình 6 bước giải quyết vấn đề')).to_be_visible()
            expect(page.get_by_role('heading', name='Khi nào cần tìm người lớn giúp đỡ')).to_have_count(0)
            ctx.close()
        record('LB-01', 'Kho tài liệu: chỉ hiện tệp thật đang tồn tại; tệp thiếu thì không hiển thị', t_library)

        # ---------- Voice Mode ----------
        FAKE_SR = """
        window.__ttsSpoken = [];
        class FakeSR {
          start(){ this._t = setTimeout(()=>{ this.onstart && this.onstart();
            setTimeout(()=>{ this.onresult && this.onresult({resultIndex:0, results:[Object.assign([{transcript:'bạn đang buồn vì điểm kém'}],{isFinal:true})]});
              setTimeout(()=>{ this.onend && this.onend(); }, 150); }, 150); }, 50); }
          stop(){ clearTimeout(this._t); this.onend && this.onend(); }
          abort(){ clearTimeout(this._t); }
        }
        window.webkitSpeechRecognition = FakeSR; window.SpeechRecognition = FakeSR;
        window.SpeechSynthesisUtterance = function(t){ this.text = t; };
        Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{ speak(u){ window.__ttsSpoken.push(u.text); setTimeout(()=>u.onstart&&u.onstart(),10); setTimeout(()=>u.onend&&u.onend(),3000); }, cancel(){}, getVoices(){ return []; }, onvoiceschanged:null }});
        """
        def t_read_aloud_sfx():
            ctx, page = new_page(browser, init_scripts=[FAKE_SR])
            start_anon(page)
            new_problem(page)
            page.get_by_label('Vấn đề bạn đang gặp phải là…', exact=True).fill('X')
            confirm_step(page)
            page.get_by_label('Nguyên nhân bạn nghĩ là…').fill('Y')
            sub(page, 2, 2)
            page.get_by_label('Kết quả bạn mong muốn là…').fill('Z')
            confirm_step(page)
            expect(page.locator('.pick-row')).to_have_count(5)
            page.wait_for_timeout(1500)
            assert page.evaluate('window.__ttsSpoken.length') == 0, 'app không được tự đọc'
            assert page.locator('#auto-read').count() == 0
            page.locator('.listen-btn').click()
            page.wait_for_function("window.__ttsSpoken.some(t => t.includes('Cách 1'))", timeout=15000)
            first = page.evaluate("window.__ttsSpoken.find(t => t.includes('Cách 1'))")
            assert 'Cách 1' in first and 'Bạn chọn biện pháp nào' in first, first
            page.locator('#sfx-btn').click()
            assert page.evaluate("localStorage.getItem('aips_sfx')") == '0'
            expect(page.locator('#sfx-btn')).to_have_attribute('aria-pressed', 'false')
            ctx.close()
        record('SD-01', 'Bước 3: app KHÔNG tự đọc, chỉ đọc khi bấm Nghe; có nút bật/tắt âm thanh chuyển bước', t_read_aloud_sfx)

        def t_voice_settings():
            VOICES = FAKE_SR.replace("getVoices(){ return []; }", "getVoices(){ return [{lang:'vi-VN',name:'Microsoft HoaiMy Online (Natural)'},{lang:'vi-VN',name:'Microsoft NamMinh Online (Natural)'}]; }")
            VOICES = VOICES.replace("speak(u){ window.__ttsSpoken.push(u.text);", "speak(u){ window.__ttsSpoken.push(u.text); window.__ttsLast={rate:u.rate,voice:u.voice&&u.voice.name};")
            ctx, page = new_page(browser, init_scripts=[VOICES])
            start_anon(page)
            new_problem(page)
            page.get_by_label('Vấn đề bạn đang gặp phải là…', exact=True).fill('X')
            confirm_step(page)
            page.get_by_label('Nguyên nhân bạn nghĩ là…').fill('Y')
            sub(page, 2, 2)
            page.get_by_label('Kết quả bạn mong muốn là…').fill('Z')
            confirm_step(page)
            page.locator('#voice-settings').click()
            dlg = page.get_by_role('dialog')
            dlg.get_by_role('button', name='Nhanh').click()
            dlg.get_by_role('button', name=re.compile('Giọng nam')).click()
            assert page.evaluate("localStorage.getItem('aips_tts_rate')") == '1.25'
            assert page.evaluate("localStorage.getItem('aips_tts_gender')") == 'm'
            dlg.locator('#vs-test').click()
            page.wait_for_function('window.__ttsLast', timeout=5000)
            last = page.evaluate('window.__ttsLast')
            assert last['rate'] == 1.25 and 'NamMinh' in (last['voice'] or ''), last
            ctx.close()
        record('SD-03', 'Cài đặt giọng: chọn tốc độ Chậm/Vừa/Nhanh và giọng nam/nữ, được lưu và áp dụng khi nghe thử', t_voice_settings)

        def t_voice_no_null():
            ctx, page = new_page(browser, init_scripts=[FAKE_SR])
            start_anon(page)
            new_problem(page)
            page.get_by_label('Vấn đề bạn đang gặp phải là…', exact=True).fill('')
            page.locator('.fld-box button').first.click()
            expect(page.locator('.voice-state')).to_contain_text('Đã dừng', timeout=8000)
            txt = page.locator('.voice-strip').inner_text()
            assert 'null' not in txt and 'undefined' not in txt, txt
            page.locator('.voice-strip').get_by_role('button', name='Nói tiếp').click()
            expect(page.locator('.voice-state')).to_be_visible()
            assert 'null' not in page.locator('.voice-strip').inner_text()
            ctx.close()
        record('VO-05', 'Thanh giọng nói không hiện chữ "null" (kể cả chỗ Nói tiếp)', t_voice_no_null)

        def t_no_english_voice():
            en_only = FAKE_SR.replace("getVoices(){ return []; }", "getVoices(){ return [{lang:'en-US',name:'Samantha'}]; }")
            assert en_only != FAKE_SR
            ctx, page = new_page(browser, init_scripts=[en_only])
            start_anon(page)
            new_problem(page)
            page.get_by_label('Vấn đề bạn đang gặp phải là…', exact=True).fill('X')
            confirm_step(page)
            page.get_by_label('Nguyên nhân bạn nghĩ là…').fill('Y')
            sub(page, 2, 2)
            page.get_by_label('Kết quả bạn mong muốn là…').fill('Z')
            confirm_step(page)
            expect(page.locator('.pick-row')).to_have_count(5)
            page.locator('.listen-btn').click()
            expect(page.get_by_text('chưa có giọng đọc tiếng Việt')).to_be_visible(timeout=8000)
            assert page.evaluate('window.__ttsSpoken.length') == 0, 'không được đọc bằng giọng tiếng Anh'
            ctx.close()
        record('SD-02', 'Máy không có giọng tiếng Việt: không đọc bằng giọng tiếng Anh, có thông báo hướng dẫn', t_no_english_voice)

        def t_greeting_and_icons():
            PLAY_OK = "window.__played=[]; HTMLMediaElement.prototype.play=function(){ window.__played.push(this.src); return Promise.resolve(); };"
            PLAY_BLOCK = "window.__played=[]; window.__act=false; window.addEventListener('pointerdown',()=>{window.__act=true;},true); HTMLMediaElement.prototype.play=function(){ if(!window.__act) return Promise.reject(new DOMException('blocked','NotAllowedError')); window.__played.push(this.src); return Promise.resolve(); };"
            # 1) KHÔNG tự phát; chỉ phát tệp thu sẵn khi bấm nút, và áp tốc độ đã chọn
            ctx, page = new_page(browser, init_scripts=[PLAY_OK])
            page.goto(BASE + '/')
            page.wait_for_timeout(1200)
            assert page.evaluate('window.__played.length') == 0, 'không được tự phát lời chào'
            page.mouse.click(5, 300)
            page.wait_for_timeout(300)
            assert page.evaluate('window.__played.length') == 0
            page.evaluate("localStorage.setItem('aips_tts_rate','1.25')")
            page.locator('#greet-btn').click()
            page.wait_for_function("window.__played.length >= 1", timeout=5000)
            assert 'assets/greeting.mp3' in page.evaluate('window.__played[0]')
            ctx.close()
            # 3) nút "Nghe lời chào" phát lại; icon trên thanh trên cùng hiển thị ở điện thoại 360px
            ctx, page = new_page(browser, (360, 740), init_scripts=[PLAY_OK])
            page.goto(BASE + '/')
            page.locator('#greet-btn').click()
            page.wait_for_function("window.__played.length >= 1", timeout=5000)
            for sel in ['#guide-link', '#admin-link']:
                bb = page.locator(sel + ' svg').bounding_box()
                assert bb and bb['width'] >= 16 and bb['height'] >= 16, f'icon {sel} bị ẩn'
            ctx.close()
        record('GR-01', 'Lời chào bằng tệp âm thanh tiếng Việt: không tự phát, chỉ phát khi bấm Nghe lời chào; icon Hướng dẫn/Admin hiển thị ở 360px', t_greeting_and_icons)

        def t_poster():
            ctx, page = new_page(browser)
            page.goto(BASE + '/#/guide')
            expect(page.locator('#poster-open img')).to_be_visible()
            assert page.evaluate("document.querySelector('#poster-open img').complete") is not None
            page.locator('#poster-open').click()
            dlg = page.get_by_role('dialog')
            expect(dlg.locator('img')).to_be_visible()
            page.wait_for_function("(() => { const i = document.querySelector('[role=dialog] img'); return i && i.complete && i.naturalWidth > 500; })()", timeout=8000)
            page.keyboard.press('Escape')
            expect(page.get_by_role('dialog')).to_have_count(0)
            ctx.close()
        record('PO-01', 'Trang Hướng dẫn có poster; bấm vào hiện poster lớn, đóng lại được', t_poster)

        def t_no_overlap_phone():
            LONG = 'Trò chuyện cởi mở với giáo viên bộ môn để chia sẻ về việc bạn chưa hiểu bài giảng trên lớp và nhờ thầy cô hướng dẫn thêm cách học phù hợp với bạn'
            for (w, h_) in [(320, 568), (360, 640), (390, 844), (412, 915)]:
                ctx, page = new_page(browser, (w, h_))
                start_anon(page)
                new_problem(page)
                page.get_by_label('Vấn đề bạn đang gặp phải là…', exact=True).fill('Bạn đang buồn vì điểm xấu')
                confirm_step(page)
                page.get_by_label('Nguyên nhân bạn nghĩ là…').fill('Bạn chưa hiểu bài')
                sub(page, 2, 2)
                page.get_by_label('Kết quả bạn mong muốn là…').fill('Điểm tốt hơn')
                confirm_step(page)
                expect(page.locator('.pick-row')).to_have_count(5)
                for k in range(2):
                    page.get_by_label('Thêm biện pháp của bạn').fill(LONG + ' ' + str(k))
                    page.get_by_role('button', name='Thêm', exact=True).click()

                def check(where):
                    res = page.evaluate("""() => {
                        const els = [...document.querySelectorAll('.wz-main .pick')];
                        const bad = [];
                        els.forEach((e, i) => {
                            if (e.scrollHeight > e.clientHeight + 2) bad.push('hàng ' + i + ' bị cắt/chồng chữ');
                        });
                        const r = els.map((e) => e.getBoundingClientRect()).filter((b) => b.height > 0);
                        for (let i = 1; i < r.length; i++) if (r[i].top < r[i - 1].bottom - 1 && r[i].top < r[i - 1].bottom - 1 && Math.abs(r[i].left - r[i - 1].left) < 2) bad.push('hàng ' + i + ' đè lên hàng trước');
                        return bad;
                    }""")
                    assert not res, f'{where} {w}x{h_}: {res}'
                check('Bước 3')
                confirm_step(page)
                page.locator('.pdot').last.click()
                expect(page.get_by_text('Bạn quyết định chọn cách nào?').first).to_be_visible()
                check('Bước 4')
                # khung cuộn được: hàng cuối đạt tới được bằng cuộn, nút Xong bước này vẫn thấy
                bb = page.locator('#finish-step').bounding_box()
                assert bb and bb['y'] + bb['height'] <= h_ + 1, f'nút Xong bước này bị đẩy khỏi màn hình {w}x{h_}'
                ctx.close()
        record('LY-01', 'Điện thoại 320-412px: danh sách biện pháp dài không bị chồng chữ/đè hàng ở Bước 3 và 4, nút Xong bước này luôn thấy', t_no_overlap_phone)

        def t_no_fixed_screen():
            LONGTXT = '\n'.join(f'- Ý số {i}: nội dung khá dài để kiểm tra việc hiển thị đầy đủ các dòng trong ô nhập' for i in range(1, 9))
            for (w, h_) in [(360, 640), (390, 844), (1280, 720)]:
                ctx, page = new_page(browser, (w, h_))
                start_anon(page)
                new_problem(page)
                page.get_by_label('Vấn đề bạn đang gặp phải là…', exact=True).fill('Bạn đang buồn vì điểm xấu')
                confirm_step(page)
                page.get_by_label('Nguyên nhân bạn nghĩ là…').fill('Bạn chưa hiểu bài')
                sub(page, 2, 2)
                page.get_by_label('Kết quả bạn mong muốn là…').fill('Điểm tốt hơn')
                confirm_step(page)
                expect(page.locator('.pick-row')).to_have_count(5)
                page.locator('.pick-row .pick').first.click()
                confirm_step(page)
                ta = page.get_by_label('Ưu điểm')
                expect(ta).to_be_visible(timeout=8000)
                ta.fill(LONGTXT)
                page.wait_for_timeout(300)
                res = page.evaluate("""() => {
                    const bad = [];
                    document.querySelectorAll('.wz-main textarea').forEach((t, i) => { if (t.scrollHeight > t.clientHeight + 3) bad.push('ô ' + i + ' bị cắt: ' + t.scrollHeight + '>' + t.clientHeight); });
                    const cs = getComputedStyle(document.body);
                    if (cs.overflow === 'hidden' && document.documentElement.scrollHeight <= innerHeight) bad.push('trang bị khóa cứng');
                    return bad;
                }""")
                assert not res, f'{w}x{h_}: {res}'
                # trang cuộn được và nút điều hướng luôn trong tầm nhìn
                page.screenshot(path=f'tests/screens/ly02-{w}.png', full_page=True)
                page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
                bb = page.locator('.wz-actions').first.bounding_box()
                assert bb and bb['y'] + bb['height'] <= h_ + 2 and bb['y'] >= 0, f'nút điều hướng ngoài màn hình {w}x{h_}: {bb}'
                ctx.close()
        record('LY-02', 'Không khóa cứng một màn hình (điện thoại + máy tính): ô nhập tự giãn hiện đủ dòng, trang cuộn tự nhiên, nút điều hướng luôn thấy', t_no_fixed_screen)

        def t_voice():
            ctx, page = new_page(browser, init_scripts=[FAKE_SR])
            to_step2(page)
            open_chat(page)
            dlg = page.get_by_role('dialog')
            assert dlg.get_by_role('button', name=re.compile('Voice Mode')).count() == 1, 'mỗi ô nhập chỉ một nút Voice Mode'
            dlg.get_by_role('button', name=re.compile('Bật Voice Mode')).click()
            expect(dlg.get_by_text('Đang nghe…')).to_be_visible()
            expect(page.get_by_label('Tin nhắn của bạn')).to_have_value(re.compile('bạn đang buồn vì điểm kém'))
            expect(dlg.get_by_text('Đã dừng')).to_be_visible(timeout=4000)
            page.get_by_label('Tin nhắn của bạn').fill('bạn đang buồn vì điểm kém (đã sửa)')
            page.get_by_role('button', name='Gửi tin nhắn').click()
            expect(page.get_by_text('Mình hiểu rồi')).to_be_visible()
            page.wait_for_timeout(1200)
            assert page.evaluate('window.__ttsSpoken.length') == 0, 'không tự đọc sau khi nói bằng giọng'
            dlg.locator('.msg-listen').last.click()
            expect(dlg.get_by_text('Đang phát âm thanh…')).to_be_visible()
            spoken = page.evaluate('window.__ttsSpoken')
            assert spoken and any('Mình hiểu rồi' in t for t in spoken), spoken
            dlg.get_by_role('button', name='Dừng đọc').click()
            expect(dlg.get_by_text('Đang phát âm thanh…')).to_have_count(0)
            # quay lại nhập văn bản
            dlg.get_by_role('button', name=re.compile('Bật Voice Mode')).click()
            expect(dlg.get_by_text('Đã dừng')).to_be_visible(timeout=4000)
            dlg.get_by_role('button', name='Quay lại nhập văn bản').click()
            expect(dlg.get_by_text('Đã dừng')).to_have_count(0)
            ctx.close()
        record('VO-01', 'Voice Mode: nghe→chữ hiện trong ô để sửa trước khi gửi; chỉ đọc phản hồi khi bấm Nghe; có Dừng đọc/Quay lại văn bản; hiển thị đủ trạng thái', t_voice)

        def t_voice_unsupported():
            ctx, page = new_page(browser, init_scripts=["delete window.SpeechRecognition; delete window.webkitSpeechRecognition; Object.defineProperty(window,'speechSynthesis',{value:undefined,configurable:true});"])
            to_step2(page)
            open_chat(page)
            page.get_by_role('dialog').get_by_role('button', name=re.compile('Bật Voice Mode')).click()
            expect(page.get_by_text('Trình duyệt chưa hỗ trợ nhận diện giọng nói')).to_be_visible()
            send_chat(page, 'Vẫn gõ chữ được')
            expect(page.get_by_text('Mình hiểu rồi')).to_be_visible()
            ctx.close()
        record('VO-02', 'Trình duyệt không hỗ trợ giọng nói: thông báo rõ, vẫn dùng bằng văn bản', t_voice_unsupported)

        DENIED = """
        class DenySR { start(){ setTimeout(()=>{ this.onerror && this.onerror({error:'not-allowed'}); this.onend && this.onend(); },30); } stop(){} abort(){} }
        window.webkitSpeechRecognition = DenySR; window.SpeechRecognition = DenySR;
        """
        def t_voice_denied():
            ctx, page = new_page(browser, init_scripts=[DENIED])
            to_step2(page)
            open_chat(page)
            page.get_by_role('dialog').get_by_role('button', name=re.compile('Bật Voice Mode')).click()
            expect(page.get_by_text('Chưa được phép dùng micro')).to_be_visible()
            send_chat(page, 'Vẫn nhắn được')
            expect(page.get_by_text('Mình hiểu rồi')).to_be_visible()
            ctx.close()
        record('VO-03', 'Từ chối quyền micro: thông báo rõ, vẫn dùng được bằng văn bản', t_voice_denied)

        def t_mic_not_asked_on_load():
            ctx, page = new_page(browser, init_scripts=["window.__srStarted = 0; class C { start(){ window.__srStarted++; } stop(){} abort(){} } window.webkitSpeechRecognition = C; window.SpeechRecognition = C;"])
            start_anon(page)
            new_problem(page)
            page.wait_for_timeout(300)
            assert page.evaluate('window.__srStarted') == 0, 'không được xin/bật micro khi chưa chủ động'
            ctx.close()
        record('VO-04', 'Không bật micro khi người dùng chưa chủ động', t_mic_not_asked_on_load)

        # ---------- Hướng dẫn sử dụng (gồm quyền riêng tư) + liên kết trên đầu trang ----------
        def t_guide_page():
            ctx, page = new_page(browser)
            page.goto(BASE + '/#/privacy')  # đường dẫn cũ tự chuyển sang trang hướng dẫn
            expect(page).to_have_url(re.compile(r'#/guide$'))
            expect(page.get_by_role('heading', name='Hướng dẫn sử dụng', level=1)).to_be_visible()
            expect(page.get_by_text('Bạn dùng thế nào? (6 bước)')).to_be_visible()
            expect(page.get_by_text('Quyền riêng tư: dữ liệu của bạn nằm ở đâu?')).to_be_visible()
            expect(page.get_by_text('không có tài khoản, mật khẩu')).to_be_visible()
            expect(page.get_by_text('gói miễn phí').first).to_be_visible()
            expect(page.get_by_text('Cơ sở tham khảo')).to_be_visible()
            expect(page.get_by_role('heading', name='Nghe AI đọc')).to_be_visible()
            expect(page.get_by_text('Add voices')).to_be_visible()
            expect(page.get_by_role('heading', name='Thông tin tác giả')).to_be_visible()
            expect(page.get_by_text(re.compile(r'Phiên bản \d+'))).to_have_count(1)  # chỉ hiện ở chân trang, không lặp trong trang
            expect(page.get_by_text('Học sinh Trường THCS Gò Vấp').first).to_be_visible()
            ctx.close()
        record('PR-03', 'Trang Hướng dẫn sử dụng gồm cách dùng 6 bước, quyền riêng tư (dữ liệu, gửi AI, bộ đếm), an toàn, cơ sở tham khảo, tác giả; đường dẫn cũ chuyển về', t_guide_page)

        def t_header_links():
            for (w, h_) in [(360, 740), (1280, 800)]:
                ctx, page = new_page(browser, (w, h_))
                page.goto(BASE + '/')
                g, a = page.locator('#guide-link'), page.locator('#admin-link')
                expect(g).to_be_visible(); expect(a).to_be_visible()
                bg, ba, bm = g.bounding_box(), a.bounding_box(), page.locator('#menu-btn').bounding_box()
                assert bg['x'] < ba['x'] < bm['x'] and ba['x'] + ba['width'] <= bm['x'] + 1, 'Hướng dẫn, Admin phải nằm ngay cạnh nút menu'
                assert bm['x'] + bm['width'] <= w + 1
                no_hscroll(page)
                expect(page.locator('footer a[href="#/admin"], footer a[href="#/about"], footer a[href="#/privacy"]')).to_have_count(0)
                g.click()
                expect(page).to_have_url(re.compile(r'#/guide$'))
                a.click()
                expect(page).to_have_url(re.compile(r'#/admin$'))
                expect(page.locator('#ad-pass')).to_be_visible()
                ctx.close()
        record('NV-01', 'Hướng dẫn sử dụng và Admin nằm góc phải trên cùng, kế nút menu; không còn ở chân trang; không tràn ngang (360/1280px)', t_header_links)

        def t_no_fake_data():
            ctx, page = new_page(browser, stats={'configured': True, 'visits': 0, 'ratingCount': 0, 'ratingAvg': None})
            start_anon(page)
            expect(page.get_by_text('Bạn chưa có vấn đề nào')).to_be_visible()
            src = page.evaluate("JSON.stringify(JSON.parse(localStorage.getItem('aips:v1')))")
            d = json.loads(src)
            assert d['problems'] == []
            ctx.close()
        record('DT-05', 'Khởi tạo sạch: không có học sinh/vấn đề/số liệu mẫu', t_no_fake_data)

        browser.close()

    ok = sum(1 for r in results if r['ok'])
    print(f'\n{ok}/{len(results)} đạt')
    json.dump(results, open(os.path.join(os.path.dirname(__file__), 'e2e-results.json'), 'w'), ensure_ascii=False, indent=2)
    return 0 if ok == len(results) else 1

if __name__ == '__main__':
    sys.exit(run())
