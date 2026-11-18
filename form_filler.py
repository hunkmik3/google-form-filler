#!/usr/bin/env python3
"""Điền Google Form bằng link điền sẵn (pre-filled link).

Bước 1 - tạo file trả lời mẫu từ form:
    python3 form_filler.py template <link_form | file.html> [-o tra_loi.txt]
Bước 2 - ghi số thứ tự đáp án vào file, rồi tạo link (và mở trình duyệt):
    python3 form_filler.py link tra_loi.txt [--open]

Link mở ra form đã điền sẵn; bạn xem lại rồi tự bấm Gửi.
Không cần cài thêm thư viện. Câu "Tải file lên" không điền sẵn được.
"""
import argparse, html, json, os, re, shutil, subprocess, sys, tempfile, urllib.error, urllib.parse, urllib.request

UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'
SECTION, PAGE = 6, 8
CHOICE, DROPDOWN, CHECKBOX, SCALE, GRID = 2, 3, 4, 5, 7
SHORT, PARAGRAPH, DATE, TIME, UPLOAD, RATING = 0, 1, 9, 10, 13, 18
TYPE_NAME = {SHORT: 'trả lời ngắn', PARAGRAPH: 'đoạn văn', CHOICE: 'chọn 1', DROPDOWN: 'chọn 1',
             CHECKBOX: 'chọn nhiều, cách nhau dấu phẩy', SCALE: 'ghi giá trị trên thang',
             DATE: 'ngày, dạng YYYY-MM-DD', TIME: 'giờ, dạng HH:MM', RATING: 'ghi số sao'}
TYPE_PUBLIC = {SHORT: 'short', PARAGRAPH: 'paragraph', CHOICE: 'choice', DROPDOWN: 'dropdown',
               CHECKBOX: 'checkbox', SCALE: 'scale', GRID: 'grid', DATE: 'date', TIME: 'time',
               UPLOAD: 'upload', RATING: 'rating'}


class FormError(Exception):
    pass


BROWSERS = (
    ("Google Chrome", "/Applications/Google Chrome.app"),
    ("Google Chrome Canary", "/Applications/Google Chrome Canary.app"),
    ("Chromium", "/Applications/Chromium.app"),
    ("Microsoft Edge", "/Applications/Microsoft Edge.app"),
    ("Brave Browser", "/Applications/Brave Browser.app"),
)


def sweep_old_profiles():
    """Xóa profile tạm của những lần mở trước, nếu trình duyệt đó đã tắt."""
    live = set()
    try:
        out = subprocess.run(["ps", "-ax", "-o", "command="], capture_output=True, text=True)
    except OSError:
        return
    for line in out.stdout.splitlines():
        m = re.search(r"--user-data-dir=(?P<p>\S+)", line)
        if m and "form-filler-browser-" in m.group("p"):
            live.add(os.path.abspath(m.group("p").strip("'\"")))
    root = tempfile.gettempdir()
    for name in os.listdir(root):
        if not name.startswith("form-filler-browser-"):
            continue
        path = os.path.abspath(os.path.join(root, name))
        if path in live:
            continue
        shutil.rmtree(path, ignore_errors=True)


def open_fresh(url):
    """Mở link trong một cửa sổ trình duyệt mới, profile trống, không cache và không cookie cũ."""
    app = next((name for name, path in BROWSERS if os.path.isdir(path)), None)
    if not app:
        raise FormError("Không thấy Chrome, Edge hoặc Brave để mở một trình duyệt trống.")
    sweep_old_profiles()
    profile = tempfile.mkdtemp(prefix="form-filler-browser-")
    subprocess.Popen(
        ["open", "-na", app, "--args",
         f"--user-data-dir={profile}",
         "--incognito",
         "--no-first-run",
         "--no-default-browser-check",
         "--disable-sync",
         "--disable-extensions",
         "--disk-cache-size=1",
         "--media-cache-size=1",
         "--disable-application-cache",
         "--disable-gpu-shader-disk-cache",
         "--new-window",
         url],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    return profile


def load(src):
    """Trả về (html, link viewform) từ link form hoặc file .html đã lưu."""
    if re.match(r'https?://', src):
        req = urllib.request.Request(src, headers={'User-Agent': UA, 'Accept-Language': 'vi,en;q=0.8'})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                final, text = r.geturl(), r.read().decode('utf8', 'ignore')
        except urllib.error.URLError as ex:
            raise FormError(f'Không tải được form: {ex.reason}') from ex
        if 'accounts.google.com' in final:
            raise FormError('Form này bắt đăng nhập. Mở form trong Chrome, Cmd+S lưu thành file .html, rồi chạy lại với file đó.')
    else:
        try:
            text = open(src, encoding='utf8', errors='ignore').read()
        except OSError as ex:
            raise FormError(f'Không mở được file: {ex.strerror}') from ex
    m = re.search(r'action="(https://docs\.google\.com/forms/[^"]+?)/formResponse"', text)
    if not m:
        raise FormError('Không tìm thấy Google Form trong trang này.')
    return text, html.unescape(m.group(1)) + '/viewform'


def plain(value):
    text = html.unescape(value or '')
    text = re.sub(r'<[^>]+>', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def parse(text):
    """Trả về (tiêu đề, danh sách mục, lời giới thiệu). Hàng lưới có key Qn.r."""
    m = re.search(r'FB_PUBLIC_LOAD_DATA_\s*=\s*(.*?);\s*</script>', text, re.S)
    if not m:
        raise FormError('Không đọc được cấu trúc form.')
    data = json.loads(m.group(1))
    items, n = [], 0
    for it in data[1][1]:
        title, desc, typ = it[1] or '', it[2] or '', it[3]
        if typ in (SECTION, PAGE):
            items.append({'kind': 'heading', 'title': title, 'desc': desc, 'page': typ == PAGE})
            continue
        subs = it[4] if len(it) > 4 and it[4] else []
        if not subs:
            continue
        n += 1
        q = {'kind': 'question', 'key': f'Q{n}', 'title': title, 'desc': desc, 'type': typ, 'rows': []}
        for r, sub in enumerate(subs, 1):
            opts = sub[1] or []
            row = {
                'entry': sub[0],
                'required': bool(sub[2]) if len(sub) > 2 else False,
                'options': [o[0] for o in opts if o[0]],
                'has_other': any(len(o) > 4 and o[4] for o in opts),
                'label': (sub[3][0] if typ == GRID and len(sub) > 3 and sub[3] else ''),
                'multi': typ == CHECKBOX or (typ == GRID and len(sub) > 11 and bool(sub[11] and sub[11][0])),
                'key': f'Q{n}.{r}' if typ == GRID else f'Q{n}',
            }
            q['rows'].append(row)
        items.append(q)
    intro = data[1][0] if isinstance(data[1][0], str) else ''
    return data[3] or data[1][8] or 'Google Form', items, plain(intro)


def describe(title, url, items, intro=''):
    """Bản câu hỏi cho giao diện, không gửi entry id."""
    out = []
    for it in items:
        if it['kind'] == 'heading':
            out.append({'kind': 'heading', 'title': plain(it['title']), 'desc': plain(it['desc']), 'page': it['page']})
            continue
        rows = [{
            'key': r['key'],
            'label': r['label'] or '',
            'required': r['required'],
            'options': r['options'],
            'hasOther': r['has_other'],
            'multi': r['multi'],
        } for r in it['rows']]
        out.append({
            'kind': 'question',
            'key': it['key'],
            'title': plain(it['title']),
            'desc': plain(it['desc']),
            'type': TYPE_PUBLIC.get(it['type'], 'text'),
            'required': any(r['required'] for r in it['rows']),
            'rows': rows,
        })
    return {'title': plain(title), 'url': url, 'intro': intro, 'items': out}


def cmd_template(args):
    text, url = load(args.form)
    title, items, _intro = parse(text)
    L = [f'# FORM: {url}', f'# {title}', '#',
         '# Cách điền: ghi SỐ thứ tự đáp án sau dấu "=". Để trống là bỏ qua. Câu có dấu * là bắt buộc.',
         '# Chọn nhiều: ghi các số cách nhau bằng dấu phẩy, ví dụ: 1,3,4',
         '# Chọn mục "Khác": ghi  khac: nội dung   (có thể kèm số, ví dụ: 1,3, khac: nội dung)',
         '# Câu trả lời chữ: ghi thẳng nội dung. Xuống dòng trong đoạn văn thì gõ \\n', '']
    for it in items:
        if it['kind'] == 'heading':
            if it['page'] or it['title']:
                L += ['', f'{"=" * 20} {it["title"] or "(trang mới)"} {"=" * 20}' if it['page'] else f'# ----- {it["title"]} -----']
            continue
        rows, typ = it['rows'], it['type']
        req = ' *' if any(r['required'] for r in rows) else ''
        if typ == UPLOAD:
            L += ['', f'## {it["title"]}{req}', '##   (Câu tải file: không điền sẵn được, tự làm trên form)']
            continue
        L += ['', f'## {it["title"]}{req}']
        if it['desc']:
            L.append(f'##   ({it["desc"]})')
        opts = rows[0]['options']
        if typ == GRID:
            mode = 'mỗi hàng chọn nhiều, cách nhau dấu phẩy' if rows[0]['multi'] else 'mỗi hàng chọn 1'
            L.append(f'##   [{mode}]  ' + ' | '.join(f'{i}={o}' for i, o in enumerate(opts, 1)))
            for r in rows:
                L += [f'# {r["label"]}{" *" if r["required"] else ""}', f'{r["key"]} = ']
        else:
            hint = TYPE_NAME.get(typ, '')
            if typ in (CHOICE, DROPDOWN, CHECKBOX) and opts:
                extra = ' | khac=...' if rows[0]['has_other'] else ''
                L.append(f'##   [{hint}]  ' + ' | '.join(f'{i}={o}' for i, o in enumerate(opts, 1)) + extra)
            elif typ == SCALE and opts:
                L.append(f'##   [{hint}: {opts[0]} → {opts[-1]}]')
            elif hint:
                L.append(f'##   [{hint}]')
            L.append(f'{rows[0]["key"]} = ')
    out = args.output
    open(out, 'w', encoding='utf8').write('\n'.join(L) + '\n')
    nq = sum(1 for i in items if i['kind'] == 'question')
    nf = sum(len(i['rows']) for i in items if i['kind'] == 'question')
    print(f'Đã tạo {out}: {nq} câu hỏi, {nf} ô cần điền. Mở file, ghi đáp án rồi chạy:')
    print(f'  python3 {sys.argv[0]} link {out} --open')


def resolve(raw, row, typ, key):
    """Chuyển câu trả lời người dùng ghi thành danh sách (tên tham số, giá trị)."""
    e, opts, params = f'entry.{row["entry"]}', row['options'], []
    if typ in (SHORT, PARAGRAPH, DATE, TIME, SCALE, RATING):
        return [(e, raw.replace('\\n', '\n'))]
    other = None
    m = re.search(r'kh[aá]c\s*:\s*(.*)$', raw, re.I)
    if m:
        other, raw = m.group(1).strip(), raw[:m.start()]
    parts = [p.strip() for p in raw.split(',') if p.strip()]
    if len(parts) > 1 and not row['multi']:
        raise ValueError(f'{key}: câu này chỉ chọn 1, nhưng bạn ghi {len(parts)} đáp án')
    for p in parts:
        if p.isdigit() and 1 <= int(p) <= len(opts):
            params.append((e, opts[int(p) - 1]))
        else:
            hit = [o for o in opts if o.lower() == p.lower()]
            if not hit:
                raise ValueError(f'{key}: "{p}" không phải đáp án hợp lệ (chọn 1–{len(opts)})')
            params.append((e, hit[0]))
    if other is not None:
        if not row['has_other']:
            raise ValueError(f'{key}: câu này không có mục "Khác"')
        params += [(e, '__other_option__'), (f'{e}.other_option_response', other)]
    return params


def build_link(text, url, answers):
    """answers là {key: chuỗi đáp án}. Trả về (link, danh sách câu bắt buộc còn trống)."""
    _, items, _intro = parse(text)
    params, errors, missing, used = [('usp', 'pp_url')], [], [], set()
    for it in items:
        if it['kind'] != 'question' or it['type'] == UPLOAD:
            continue
        for row in it['rows']:
            raw = answers.get(row['key'])
            if raw is None or not str(raw).strip():
                if row['required']:
                    missing.append(f'{row["key"]} ({(row["label"] or it["title"])[:60]})')
                continue
            used.add(row['key'])
            try:
                params += resolve(str(raw), row, it['type'], row['key'])
            except ValueError as ex:
                errors.append(str(ex))
    for k in sorted(set(answers) - used):
        if str(answers.get(k) or '').strip():
            errors.append(f'{k}: không có câu này trong form (form đã bị sửa? tạo lại file mẫu)')
    if errors:
        raise ValueError('\n'.join(errors))
    base = url.split('?', 1)[0]
    link = base + '?' + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    return link, missing, len(used)


def cmd_link(args):
    lines = open(args.answers, encoding='utf8').read().splitlines()
    m = re.match(r'#\s*FORM:\s*(\S+)', lines[0] if lines else '')
    if not m:
        sys.exit('Dòng đầu file phải là "# FORM: <link>" (file tạo bằng lệnh template).')
    url = m.group(1)
    answers = {}
    for ln in lines:
        mm = re.match(r'\s*(Q\d+(?:\.\d+)?)\s*=\s*(.*?)\s*$', ln)
        if mm and mm.group(2):
            answers[mm.group(1)] = mm.group(2)
    text, url = load(url)
    link, missing, used = build_link(text, url, answers)
    out = re.sub(r'\.txt$', '', args.answers) + '.link.txt'
    open(out, 'w', encoding='utf8').write(link + '\n')
    print(f'Đã điền {used} ô. Link lưu ở {out} ({len(link)} ký tự).')
    if missing:
        print('Chú ý, còn câu bắt buộc chưa điền (điền tiếp trên form cũng được):\n  ' + '\n  '.join(missing))
    if len(link) > 15000:
        print('Cảnh báo: link rất dài, Google có thể từ chối. Thử bỏ bớt câu không bắt buộc.')
    if args.open:
        open_fresh(link)
        print('Đã mở một trình duyệt mới, không dùng cache. Xem lại từng trang rồi tự bấm Gửi.')
    else:
        print(link)


def main():
    ap = argparse.ArgumentParser(description='Điền Google Form bằng link điền sẵn.')
    sp = ap.add_subparsers(dest='cmd', required=True)
    t = sp.add_parser('template', help='tạo file trả lời mẫu từ form')
    t.add_argument('form', help='link Google Form hoặc file .html đã lưu')
    t.add_argument('-o', '--output', default='tra_loi.txt')
    t.set_defaults(fn=cmd_template)
    k = sp.add_parser('link', help='tạo link điền sẵn từ file trả lời')
    k.add_argument('answers')
    k.add_argument('--open', action='store_true', help='mở link trong trình duyệt')
    k.set_defaults(fn=cmd_link)
    a = ap.parse_args()
    try:
        a.fn(a)
    except (FormError, ValueError) as ex:
        sys.exit(str(ex))


if __name__ == '__main__':
    main()
