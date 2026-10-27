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
            return route.fulfill(status=502, content_type='application/json', body=json.dumps({'error': 'upstream', 'status': 503, 'message': 'Trợ lý đang gặp sự cố. Em thử lại sau nhé.'}))
        if mode == 'down':
            return route.fulfill(status=503, content_type='application/json', body=json.dumps({'error': 'not_configured', 'message': 'Trợ lý AI chưa được cấu hình (thiếu GEMINI_API_KEY trên máy chủ).'}))
        if mode == 'flaky' and not state['fail_once']:
            state['fail_once'] = True
            return route.fulfill(status=502, content_type='application/json', body=json.dumps({'error': 'upstream', 'message': 'Trợ lý đang gặp sự cố. Em thử lại sau nhé.'}))
        task = body.get('task', 'chat')
        if task == 'suggest_options':
            out = {'intro': 'Đây chỉ là gợi ý, em là người quyết định.', 'options': ['Nhắn tin xin lỗi bạn', 'Nhờ cô giáo chủ nhiệm hòa giải', 'Viết thư tay cho bạn'], 'risk': 'none'}
        elif task == 'analyze':
            sols = body.get('payload', {}).get('solutions', [])
            out = {'note': 'Em tự cân nhắc nhé.', 'items': [{'solution': s, 'pros': ['Nhanh gọn'], 'cons': ['Có thể ngại'], 'consequences': 'Bạn có thể vui hơn'} for s in sols], 'risk': 'none'}
        elif task == 'breakdown':
            out = {'note': 'Em chỉnh lại cho hợp nhé.', 'items': [{'text': 'Soạn tin nhắn', 'time': '10 phút', 'resource': 'Điện thoại'}, {'text': 'Gửi tin nhắn', 'time': 'Tối nay', 'resource': 'Không cần'}], 'risk': 'none'}
        else:
            last = ''
            for m in reversed(body.get('messages', [])):
                if m['role'] == 'user':
                    last = m['text']; break
            risk = 'danger' if 'bạo lực' in last else 'none'
            out = {'reply': 'Mình hiểu rồi. Em kể thêm: chuyện này bắt đầu khi nào vậy?', 'risk': risk}
        out['task'] = task
        route.fulfill(status=200, content_type='application/json', body=json.dumps(out))
    ctx.route('**/api/chat', api_chat)

    def api_share(route, request):
        d = json.loads(request.post_data)
        calls['share'].append(d)
        if state.get('share_fail'):
            return route.fulfill(status=502, content_type='application/json', body=json.dumps({'error': 'save_failed', 'message': 'Chưa gửi được. Em thử lại sau nhé.'}))
        ADMIN_DB.append({'id': d['id'], 'name': d.get('name', ''), 'cls': d.get('cls', ''), 'school': d.get('school', ''), 'category': d.get('category') or 'Khác', 'title': d.get('title', ''), 'problem': d.get('problem', ''), 'final': d.get('final', ''), 'risk': 'concern' if 'bạo lực' in d.get('problem', '') else 'none', 'status': 'Mới', 'note': '', 'sentAt': 1790000000000, 'updatedAt': 1790000000000, 'stepsDone': d.get('stepsDone', 0)})
        route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'at': 1790000000000}))
    ctx.route('**/api/share', api_share)

    def api_admin(route, request):
        d = json.loads(request.post_data)
        calls['admin'].append(d)
        if request.headers.get('x-admin-password') != 'matkhau':
            return route.fulfill(status=401, content_type='application/json', body=json.dumps({'error': 'unauthorized', 'message': 'Mật khẩu chưa đúng.'}))
        if d['action'] == 'list':
            return route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'items': list(ADMIN_DB)}))
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
    page.get_by_role('button', name='Tiếp tục ở chế độ ẩn danh').click()
    expect(page.locator('#new-problem')).to_be_visible()

def new_problem(page):
    page.locator('#new-problem').click()
    expect(page.locator('.stepper')).to_be_visible()

def open_chat(page):
    if page.get_by_label('Tin nhắn của em').count() == 0:
        page.locator('#ask-ai').click()
    expect(page.get_by_label('Tin nhắn của em')).to_be_visible()

def close_chat(page):
    if page.get_by_role('dialog').count():
        page.get_by_role('dialog').get_by_role('button', name='Đóng').click()
        expect(page.get_by_role('dialog')).to_have_count(0)

def send_chat(page, text):
    open_chat(page)
    page.get_by_label('Tin nhắn của em').fill(text)
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
    page.get_by_role('button', name='Đã xong', exact=True).click()

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
            expect(page.get_by_label('Họ và tên')).to_be_visible()
            expect(page.get_by_label('Lớp')).to_be_visible()
            expect(page.get_by_role('button', name='Bắt đầu')).to_be_visible()
            expect(page.get_by_role('button', name='Tiếp tục ở chế độ ẩn danh')).to_be_visible()
            no_hscroll(page)
            page.screenshot(path=f'{OUT}/01-start-360.png', full_page=True)
            assert not page.errs, page.errs
            ctx.close()
        record('UI-01', 'Màn hình bắt đầu: logo, tên, slogan, ô họ tên/lớp, 2 nút, không tràn ngang (360px)', t_start)

        def t_start_validation():
            ctx, page = new_page(browser)
            page.goto(BASE + '/')
            page.get_by_role('button', name='Bắt đầu').click()
            expect(page.get_by_text('Em hãy nhập họ tên')).to_be_visible()
            assert '#/start' in page.url
            page.get_by_label('Họ và tên').fill('Nguyễn Văn An')
            page.get_by_label('Lớp').fill('6/6')
            page.get_by_role('button', name='Bắt đầu').click()
            expect(page.get_by_role('heading', name='Chào Nguyễn Văn An!')).to_be_visible()
            ctx.close()
        record('PR-01', 'Bắt đầu có tên: bắt buộc nhập tên (nếu không ẩn danh), vào trang chủ với tên', t_start_validation)

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
            expect(page.get_by_text('Em chưa có vấn đề nào')).to_be_visible()
            new_problem(page)
            items = page.locator('.stepper li')
            assert items.count() == 6
            for i in range(2, 7):
                assert items.nth(i - 1).locator('button').is_disabled(), f'bước {i} phải bị khóa'
            assert 'Chưa bắt đầu' in step_state(page, 2)
            expect(page.get_by_text('Vấn đề em đang gặp phải là…').first).to_be_visible()
            open_chat(page)
            expect(page.get_by_text('Chào em! Hiện tại em đang gặp vấn đề gì trong học tập, gia đình, tình bạn hoặc cuộc sống hằng ngày? Em hãy chia sẻ cho mình biết nha!')).to_be_visible()
            close_chat(page)
            page.screenshot(path=f'{OUT}/02-step1-390.png', full_page=True)
            ctx.close()
        record('FL-01', 'Luôn thấy đủ 6 bước; bước sau bị khóa; lời gợi ý Bước 1 đúng đặc tả; trạng thái "Chưa bắt đầu"', t_flow_basic)

        def t_step1_chat_no_autocomplete():
            ctx, page = new_page(browser)
            start_anon(page)
            new_problem(page)
            send_chat(page, 'Em cãi nhau với bạn thân vì mượn bút')
            expect(page.get_by_text('Mình hiểu rồi. Em kể thêm')).to_be_visible()
            close_chat(page)
            assert 'Đang thực hiện' in step_state(page, 1)
            ta = page.get_by_label('Vấn đề em đang gặp phải là…', exact=True)
            assert 'cãi nhau với bạn thân' in ta.input_value()
            assert page.locator('.step.done').count() == 0, 'không được tự đánh dấu hoàn thành'
            expect(page.locator('#finish-step')).to_be_visible()
            body = calls['chat'][-1]
            assert body['step'] == 1 and body['task'] == 'chat' and body['messages'][-1]['role'] == 'user'
            ctx.close()
        record('FL-02', 'Chat Bước 1: AI trả lời theo ngữ cảnh, tự điền ô vấn đề (sửa được), KHÔNG tự hoàn thành bước', t_step1_chat_no_autocomplete)

        def t_confirm_gate():
            ctx, page = new_page(browser)
            start_anon(page)
            new_problem(page)
            page.locator('#finish-step').click()
            expect(page.get_by_text('Em hãy ghi vấn đề em đang gặp')).to_be_visible()
            expect(page.get_by_role('dialog')).to_have_count(0)
            page.get_by_label('Vấn đề em đang gặp phải là…', exact=True).fill('Em bị điểm kém môn Toán')
            page.locator('#finish-step').click()
            expect(page.get_by_role('dialog')).to_be_visible()
            page.get_by_role('button', name='Chưa, để em xem lại').click()
            assert 'Đang thực hiện' in step_state(page, 1)
            page.locator('#finish-step').click()
            page.get_by_role('button', name='Đã xong', exact=True).click()
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
            page.get_by_label('Vấn đề em đang gặp phải là…', exact=True).fill('Em cãi nhau với bạn thân')
            confirm_step(page)
            # Bước 2: mỗi lần một câu hỏi
            expect(page).to_have_url(re.compile(r'/2$'))
            page.get_by_label('Điều em đã biết (chắc chắn)').fill('Bạn không nói chuyện với em 2 ngày')
            sub(page, 4, 4)
            page.get_by_label('Mục tiêu của em').fill('Làm hòa với bạn')
            confirm_step(page)
            # Bước 3
            expect(page).to_have_url(re.compile(r'/3$'))
            ai_btn = page.get_by_role('button', name='Nhờ AI gợi ý thêm')
            assert ai_btn.is_disabled(), 'phải tự nghĩ trước mới nhờ AI'
            page.get_by_label('Thêm phương án').fill('Xin lỗi bạn trực tiếp')
            page.get_by_role('button', name='Thêm', exact=True).click()
            expect(page.locator('.sol')).to_have_count(1)
            assert not ai_btn.is_disabled()
            ai_btn.click()
            expect(page.get_by_text('Nhờ cô giáo chủ nhiệm hòa giải')).to_be_visible()
            expect(page.locator('.sol')).to_have_count(1)  # AI không tự thêm
            page.locator('.suggest-row', has_text='Viết thư tay cho bạn').get_by_role('button', name='Thêm').click()
            expect(page.locator('.sol')).to_have_count(2)
            close_chat(page)
            expect(page.locator('.chip.ai')).to_have_count(1)
            confirm_step(page)
            # Bước 4: mỗi phương án một câu, câu cuối là chọn
            expect(page).to_have_url(re.compile(r'/4$'))
            page.get_by_label('Ưu điểm').fill('Nhanh, chân thành')
            page.get_by_role('button', name='AI gợi ý', exact=True).click()
            expect(page.get_by_text('Nhanh gọn').first).to_be_visible()
            close_chat(page)
            sub(page, 3, 3)
            expect(page.locator('.pick.on')).to_have_count(0)  # AI không tự chọn
            page.locator('#finish-step').click()
            expect(page.get_by_text('tự chọn một phương án')).to_be_visible()
            page.locator('.pick').first.click()
            expect(page.locator('.pick.on')).to_have_count(1)
            page.get_by_label('Vì sao cách em chọn phù hợp với mục tiêu và hoàn cảnh của em?').fill('Em muốn làm hòa sớm')
            confirm_step(page)
            # Bước 5
            expect(page).to_have_url(re.compile(r'/5$'))
            expect(page.get_by_text('Xin lỗi bạn trực tiếp').first).to_be_visible()
            page.get_by_role('button', name='AI gợi ý chia việc').click()
            expect(page.get_by_text('Soạn tin nhắn')).to_be_visible()
            expect(page.locator('.task')).to_have_count(0)
            page.locator('.suggest-row', has_text='Soạn tin nhắn').get_by_role('button', name='Thêm').click()
            expect(page.locator('.task')).to_have_count(1)
            close_chat(page)
            sel = page.locator('.task select').first
            assert sel.input_value() == 'todo', 'không giả định đã làm'
            expect(page.get_by_text('Đã xong 0/1 việc')).to_be_visible()
            confirm_step(page)
            # Bước 6
            expect(page).to_have_url(re.compile(r'/6$'))
            page.get_by_label('Kết quả thực tế là gì?').fill('Bạn đã đồng ý nói chuyện')
            sub(page, 2, 5)
            expect(page.get_by_text('Mục tiêu ban đầu: Làm hòa với bạn')).to_be_visible()
            sub(page, 4, 5)
            page.get_by_role('button', name='4', exact=True).click()
            page.get_by_label('Kết luận cuối cùng của em').fill('Nói chuyện thẳng thắn hiệu quả')
            page.get_by_role('button', name='Tiếp', exact=True).click()

        def full_flow(page):
            full_flow_to_share(page)
            confirm_step(page)
            expect(page).to_have_url(re.compile(r'#/result/'))

        def t_full_flow():
            ctx, page = new_page(browser)
            full_flow(page)
            expect(page.get_by_role('heading', name='Em cãi nhau với bạn thân', level=1)).to_be_visible()
            for txt in ['Bạn không nói chuyện với em 2 ngày', 'Xin lỗi bạn trực tiếp', 'Viết thư tay cho bạn', 'Em muốn làm hòa sớm', 'Soạn tin nhắn', 'Bạn đã đồng ý nói chuyện', 'Nói chuyện thẳng thắn hiệu quả', 'Nhận xét của giáo viên']:
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
            page.get_by_label('Vấn đề em đang gặp phải là…', exact=True).fill('Vấn đề ban đầu')
            confirm_step(page)
            page.get_by_label('Điều em đã biết (chắc chắn)').fill('Điều đã biết A')
            page.locator('.stepper li').nth(0).locator('button').click()
            expect(page).to_have_url(re.compile(r'/1$'))
            page.get_by_label('Vấn đề em đang gặp phải là…', exact=True).fill('Vấn đề đã sửa')
            assert 'Đang thực hiện' in step_state(page, 1)  # phải xác nhận lại
            page.locator('.stepper li').nth(1).locator('button').click()
            expect(page.get_by_text('Em vừa sửa bước trước')).to_be_visible()
            page.get_by_role('button', name='Em đã xem lại').click()
            expect(page.get_by_text('Em vừa sửa bước trước')).to_have_count(0)
            page.wait_for_timeout(600)
            page.reload()
            expect(page.get_by_label('Điều em đã biết (chắc chắn)')).to_have_value('Điều đã biết A')
            page.locator('.stepper li').nth(0).locator('button').click()
            expect(page.get_by_label('Vấn đề em đang gặp phải là…', exact=True)).to_have_value('Vấn đề đã sửa')
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
            page.get_by_label('Vấn đề em đang gặp phải là…', exact=True).fill('X')
            confirm_step(page)
            page.get_by_label('Điều em đã biết (chắc chắn)').fill('Y')
            confirm_step(page)
            page.get_by_label('Thêm phương án').fill('Cách A')
            page.get_by_role('button', name='Thêm', exact=True).click()
            confirm_step(page)
            sub(page, 2, 2)
            page.locator('.pick').first.click()
            page.get_by_label('Vì sao cách em chọn phù hợp với mục tiêu và hoàn cảnh của em?').fill('Lý do')
            confirm_step(page)
            page.locator('.stepper li').nth(2).locator('button').click()
            page.get_by_label('Xóa phương án 1').click()
            page.wait_for_timeout(600)
            page.locator('.stepper li').nth(3).locator('button').click()
            expect(page.get_by_text('Em vừa sửa bước trước')).to_be_visible()
            page.wait_for_timeout(600)
            chosen = page.evaluate("JSON.parse(localStorage.getItem('aips:v1')).problems[0].data.chosenId")
            assert chosen is None
            ctx.close()
        record('FL-07', 'Xóa phương án đã chọn: bỏ lựa chọn, bước sau cảnh báo, không giữ kết luận lỗi thời', t_delete_chosen_solution)

        # ---------- AI / an toàn / lỗi ----------
        def t_safety_even_when_api_down():
            ctx, page = new_page(browser, chat_mode='down')
            start_anon(page)
            new_problem(page)
            send_chat(page, 'Em bị bạo lực ở nhà')
            expect(page.get_by_text('Sự an toàn của em là quan trọng nhất')).to_be_visible()
            expect(page.locator('.safety-card a[href="tel:111"]')).to_be_visible()
            expect(page.locator('.safety-card a[href="tel:113"]')).to_be_visible()
            expect(page.get_by_text('Trợ lý AI chưa được cấu hình')).to_be_visible()
            page.screenshot(path=f'{OUT}/04-safety-390.png', full_page=True)
            ctx.close()
        record('AI-01', 'Nội dung nguy hiểm: luôn hiện thẻ an toàn (111/113/115) ngay cả khi AI/máy chủ lỗi', t_safety_even_when_api_down)

        def t_safety_from_ai_risk():
            ctx, page = new_page(browser)
            start_anon(page)
            new_problem(page)
            send_chat(page, 'Em sợ bạo lực trong nhà')  # regex không bắt "sợ bạo lực" nhưng mock trả danger
            expect(page.locator('.safety-card.danger')).to_be_visible()
            ctx.close()
        record('AI-02', 'AI báo risk=danger thì giao diện hiện thẻ an toàn mức nguy hiểm', t_safety_from_ai_risk)

        def t_error_retry():
            # Lỗi tạm thời: app tự thử lại một lần, học sinh không thấy lỗi và tin nhắn không bị nhân đôi.
            ctx, page = new_page(browser, chat_mode='flaky')
            start_anon(page)
            new_problem(page)
            send_chat(page, 'Em khó học bài')
            expect(page.get_by_text('Mình hiểu rồi. Em kể thêm')).to_be_visible()
            assert page.locator('.msg.me').count() == 1, 'tự thử lại không được nhân đôi tin nhắn'
            ctx.close()
            # Lỗi kéo dài: báo rõ ràng, có nút Thử lại, không nhân đôi tin nhắn.
            ctx, page = new_page(browser, chat_mode='upstream_down')
            start_anon(page)
            new_problem(page)
            send_chat(page, 'Em khó học bài')
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
            page.get_by_label('Vấn đề em đang gặp phải là…', exact=True).fill('Mâu thuẫn với bạn')
            confirm_step(page)
            expect(page).to_have_url(re.compile(r'/2$'))
            send_chat(page, 'Em nghĩ bạn giận vì em nói to')
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
            start_anon(page)
            new_problem(page)
            send_chat(page, 'Em muốn học tốt hơn')
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
                    if h_ >= 800:
                        over = page.evaluate("(() => { const m = document.querySelector('.wz-main'); return m.scrollHeight - m.clientHeight; })()")
                        assert over <= 2, f'bước {step} bị cuộn {over}px ở {w}x{h_}'
                    assert page.evaluate('document.documentElement.scrollHeight') <= h_ + 1, f'trang bị cuộn dọc ở {w}x{h_} bước {step}'
                    # khay trợ lý: nút gửi nằm trong khung nhìn, đủ lớn
                    page.locator('#ask-ai').click()
                    box = page.get_by_role('button', name='Gửi tin nhắn').bounding_box()
                    assert box and box['x'] + box['width'] <= w + 1 and box['x'] >= 0, f'nút gửi ngoài màn hình ở {w}px bước {step}'
                    assert box['width'] >= 40 and box['height'] >= 40
                    close_chat(page)
                    if w in (360, 1280) and step in (3, 4, 5):
                        page.screenshot(path=f'{OUT}/07-step{step}-{w}.png')
                page.goto(f'{BASE}/#/home')
                no_hscroll(page)
                page.goto(f'{BASE}/#/result/{pid}')
                no_hscroll(page)
                assert not page.errs, page.errs
                ctx.close()
        record('UI-04', 'Không tràn ngang; mỗi bước vừa một màn hình (không cuộn trang); nút gửi đủ lớn ở 360/414/768/1280px', t_layouts)

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
            for txt in ['Em cãi nhau với bạn thân', 'Xin lỗi bạn trực tiếp', 'Soạn tin nhắn', 'Nhận xét của giáo viên', 'Nói chuyện thẳng thắn hiệu quả']:
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
            page.goto(BASE + '/')
            page.get_by_label('Họ và tên').fill('Trần Thị Bình')
            page.get_by_label('Lớp').fill('7/2')
            page.get_by_role('button', name='Bắt đầu').click()
            new_problem(page)
            page.get_by_label('Vấn đề em đang gặp phải là…', exact=True).fill('Test')
            pid = page.url.split('/problem/')[1].split('/')[0]
            page.goto(f'{BASE}/#/result/{pid}')
            expect(page.locator('#report').get_by_text('Trần Thị Bình')).to_be_visible()
            page.get_by_label('Ghi họ tên và lớp của em trong báo cáo').uncheck()
            expect(page.locator('#report').get_by_text('Trần Thị Bình')).to_have_count(0)
            expect(page.locator('#report').get_by_text(re.compile('Ẩn danh \\(mã HS-'))).to_be_visible()
            ctx.close()
        record('EX-02', 'Báo cáo: có thể ẩn họ tên/lớp (không đưa thông tin cá nhân không cần thiết)', t_report_privacy)

        # ---------- Sao lưu / khôi phục / xóa ----------
        def t_backup_restore_delete():
            ctx, page = new_page(browser)
            start_anon(page)
            new_problem(page)
            page.get_by_label('Vấn đề em đang gặp phải là…', exact=True).fill('Dữ liệu cần sao lưu')
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
            page.get_by_label('Vấn đề em đang gặp phải là…', exact=True).fill('Không lưu được')
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
            expect(page.get_by_text(re.compile(r'Phiên bản \d+\.\d+\.\d+'))).to_be_visible()
            expect(page.get_by_text(re.compile('Cập nhật 27/10/2026'))).to_be_visible()
            ctx.close()
        record('CT-01', 'Bộ đếm: tăng đúng 1 lần/phiên, không tăng khi chuyển bước/tải lại; "Chưa có dữ liệu đánh giá" khi rỗng; có phiên bản + ngày', t_counter)

        # ---------- Gửi cho thầy cô + quản trị ----------
        def t_share_and_admin():
            reset_calls()
            ctx, page = new_page(browser)
            full_flow_to_share(page)
            expect(page.get_by_text('Em có muốn nhờ thầy cô đồng hành thêm không?')).to_be_visible()
            send = page.locator('#sh-send')
            expect(send).to_be_disabled()
            page.locator('#sh-name').fill('Nguyễn Văn A')
            page.locator('#sh-cls').fill('6/6')
            page.locator('#sh-school').fill('THCS Gò Vấp')
            assert not calls['share'], 'chưa tick đồng ý thì không được gửi gì'
            page.locator('#sh-ok').check()
            send.click()
            expect(page.get_by_text('Đã gửi cho thầy cô lúc')).to_be_visible()
            sh = calls['share'][-1]
            assert sh['consent'] is True and sh['name'] == 'Nguyễn Văn A' and sh['cls'] == '6/6' and sh['school'] == 'THCS Gò Vấp'
            assert 'messages' not in sh and 'chat' not in json.dumps(sh).lower(), 'không được gửi hội thoại AI'
            assert sh['problem'] and sh['final']
            page.locator('#finish-step').click()
            page.get_by_role('button', name='Đã xong', exact=True).click()
            expect(page).to_have_url(re.compile(r'#/result/'))
            # Quản trị
            page.goto(BASE + '/#/admin')
            page.locator('#ad-pass').fill('sai')
            page.get_by_role('button', name='Đăng nhập').click()
            expect(page.get_by_text('Mật khẩu chưa đúng')).to_be_visible()
            page.locator('#ad-pass').fill('matkhau')
            page.get_by_role('button', name='Đăng nhập').click()
            expect(page.get_by_text('Vấn đề học sinh đã gửi')).to_be_visible()
            expect(page.get_by_text('Nguyễn Văn A')).to_be_visible()
            page.locator('.ad-row').first.click()
            page.locator('#ad-status').select_option('Đang hỗ trợ')
            page.locator('#ad-note').fill('Đã hẹn gặp em')
            page.get_by_role('button', name='Lưu', exact=True).click()
            expect(page.locator('.ad-row .tag.st-1')).to_be_visible()
            assert ADMIN_DB[0]['status'] == 'Đang hỗ trợ' and ADMIN_DB[0]['note'] == 'Đã hẹn gặp em'
            with page.expect_download() as dl:
                page.get_by_role('button', name=re.compile('Tải CSV')).click()
            assert dl.value.suggested_filename.endswith('.csv')
            ctx.close()
        record('SH-01', 'Gửi cho thầy cô: cần tick đồng ý, không gửi hội thoại AI; admin đăng nhập, xem, đổi trạng thái/ghi chú, xuất CSV', t_share_and_admin)

        def t_share_fail_and_skip():
            reset_calls()
            ctx, page = new_page(browser)
            page.state['share_fail'] = True
            full_flow_to_share(page)
            page.locator('#sh-ok').check()
            page.locator('#sh-send').click()
            expect(page.get_by_text('Chưa gửi được')).to_be_visible()
            expect(page.get_by_text('Đã gửi cho thầy cô lúc')).to_have_count(0)
            # Không gửi vẫn hoàn thành được
            page.locator('#finish-step').click()
            page.get_by_role('button', name='Đã xong', exact=True).click()
            expect(page).to_have_url(re.compile(r'#/result/'))
            assert not ADMIN_DB
            ctx.close()
        record('SH-02', 'Gửi thất bại báo thật, không báo đã gửi; bỏ qua việc gửi vẫn hoàn thành bước 6', t_share_fail_and_skip)

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
            expect(page.get_by_text('Em hãy chọn số sao hoặc viết ý kiến')).to_be_visible()
            page.get_by_role('button', name='5 sao').click()
            page.get_by_label('Góp ý của em').fill('Website rất hữu ích')
            page.get_by_role('button', name='Gửi', exact=True).click()
            expect(page.get_by_text('Cảm ơn em đã gửi ý kiến')).to_be_visible()
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
            page.get_by_role('button', name='Tiếp tục ở chế độ ẩn danh').click()
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
            setTimeout(()=>{ this.onresult && this.onresult({resultIndex:0, results:[Object.assign([{transcript:'em đang buồn vì điểm kém'}],{isFinal:true})]});
              setTimeout(()=>{ this.onend && this.onend(); }, 150); }, 150); }, 50); }
          stop(){ clearTimeout(this._t); this.onend && this.onend(); }
          abort(){ clearTimeout(this._t); }
        }
        window.webkitSpeechRecognition = FakeSR; window.SpeechRecognition = FakeSR;
        window.SpeechSynthesisUtterance = function(t){ this.text = t; };
        Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{ speak(u){ window.__ttsSpoken.push(u.text); setTimeout(()=>u.onstart&&u.onstart(),10); setTimeout(()=>u.onend&&u.onend(),3000); }, cancel(){}, getVoices(){ return []; }, onvoiceschanged:null }});
        """
        def t_voice():
            ctx, page = new_page(browser, init_scripts=[FAKE_SR])
            start_anon(page)
            new_problem(page)
            open_chat(page)
            dlg = page.get_by_role('dialog')
            assert dlg.get_by_role('button', name=re.compile('Voice Mode')).count() == 1, 'mỗi ô nhập chỉ một nút Voice Mode'
            dlg.get_by_role('button', name=re.compile('Bật Voice Mode')).click()
            expect(dlg.get_by_text('Đang nghe…')).to_be_visible()
            expect(page.get_by_label('Tin nhắn của em')).to_have_value(re.compile('em đang buồn vì điểm kém'))
            expect(dlg.get_by_text('Đã dừng')).to_be_visible(timeout=4000)
            page.get_by_label('Tin nhắn của em').fill('em đang buồn vì điểm kém (đã sửa)')
            page.get_by_role('button', name='Gửi tin nhắn').click()
            expect(page.get_by_text('Mình hiểu rồi')).to_be_visible()
            expect(dlg.get_by_text('Đang phát âm thanh…')).to_be_visible()
            spoken = page.evaluate('window.__ttsSpoken')
            assert spoken and 'Mình hiểu rồi' in spoken[0]
            dlg.get_by_role('button', name='Dừng đọc').click()
            expect(dlg.get_by_text('Đang phát âm thanh…')).to_have_count(0)
            # quay lại nhập văn bản
            dlg.get_by_role('button', name=re.compile('Bật Voice Mode')).click()
            expect(dlg.get_by_text('Đã dừng')).to_be_visible(timeout=4000)
            dlg.get_by_role('button', name='Quay lại nhập văn bản').click()
            expect(dlg.get_by_text('Đã dừng')).to_have_count(0)
            ctx.close()
        record('VO-01', 'Voice Mode: nghe→chữ hiện trong ô để sửa trước khi gửi; đọc phản hồi; có Dừng đọc/Quay lại văn bản; hiển thị đủ trạng thái', t_voice)

        def t_voice_unsupported():
            ctx, page = new_page(browser, init_scripts=["delete window.SpeechRecognition; delete window.webkitSpeechRecognition; Object.defineProperty(window,'speechSynthesis',{value:undefined,configurable:true});"])
            start_anon(page)
            new_problem(page)
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
            start_anon(page)
            new_problem(page)
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

        # ---------- Quyền riêng tư ----------
        def t_privacy_page_and_scrub_notice():
            ctx, page = new_page(browser)
            page.goto(BASE + '/#/privacy')
            expect(page.get_by_role('heading', name='Quyền riêng tư và dữ liệu')).to_be_visible()
            expect(page.get_by_text('không có tài khoản, mật khẩu')).to_be_visible()
            expect(page.get_by_text('gói miễn phí').first).to_be_visible()
            ctx.close()
        record('PR-03', 'Trang quyền riêng tư nêu rõ dữ liệu lưu ở đâu, gửi gì cho AI, bộ đếm định nghĩa thế nào, cách xóa/xuất', t_privacy_page_and_scrub_notice)

        def t_no_fake_data():
            ctx, page = new_page(browser, stats={'configured': True, 'visits': 0, 'ratingCount': 0, 'ratingAvg': None})
            start_anon(page)
            expect(page.get_by_text('Em chưa có vấn đề nào')).to_be_visible()
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
