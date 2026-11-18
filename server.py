#!/usr/bin/env python3
"""Giao diện web cho form_filler. Chỉ nghe trên máy này, không tự bấm Gửi."""
import json, os, re, subprocess, sys, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import form_filler as ff

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
HOST, DEFAULT_PORT = "127.0.0.1", 8765


def check_source(src):
    src = (src or "").strip()
    if not src:
        raise ff.FormError("Dán link Google Form vào ô phía trên.")
    if re.match(r"https?://", src):
        u = urllib.parse.urlparse(src)
        if u.netloc != "docs.google.com" or not u.path.startswith("/forms/"):
            raise ff.FormError("Chỉ nhận link Google Form (docs.google.com/forms/...).")
    elif not os.path.isfile(src):
        raise ff.FormError("Không thấy file HTML này trên máy.")
    return src


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _send(self, code, body, ctype):
        data = body if isinstance(body, bytes) else body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _json(self, code, obj):
        self._send(code, json.dumps(obj, ensure_ascii=False), "application/json; charset=utf-8")

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path in ("/", ""):
            path = "/index.html"
        file = (WEB / path.lstrip("/")).resolve()
        if not str(file).startswith(str(WEB.resolve())) or not file.is_file():
            self._send(404, "Không thấy trang", "text/plain; charset=utf-8")
            return
        ctype = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
        }.get(file.suffix, "application/octet-stream")
        self._send(200, file.read_bytes(), ctype)

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        n = int(self.headers.get("Content-Length") or 0)
        if n > 2_000_000:
            self._json(413, {"error": "Dữ liệu quá lớn"})
            return
        try:
            body = json.loads(self.rfile.read(n) or b"{}")
        except json.JSONDecodeError:
            self._json(400, {"error": "JSON không đọc được"})
            return
        try:
            if path == "/api/load":
                src = check_source(body.get("source"))
                text, url = ff.load(src)
                title, items, intro = ff.parse(text)
                self._json(200, ff.describe(title, url, items, intro))
            elif path == "/api/link":
                src = check_source(body.get("source"))
                text, url = ff.load(src)
                answers = body.get("answers") or {}
                if not isinstance(answers, dict):
                    raise ff.FormError("Đáp án không đúng định dạng.")
                link, missing, used = ff.build_link(text, url, {str(k): str(v) for k, v in answers.items()})
                self._json(200, {"link": link, "missing": missing, "filled": used, "long": len(link) > 15000})
            elif path == "/api/open":
                link = body.get("link") or ""
                u = urllib.parse.urlparse(link)
                if u.scheme != "https" or u.netloc != "docs.google.com" or not u.path.startswith("/forms/"):
                    raise ff.FormError("Chỉ mở link Google Form.")
                ff.open_fresh(link)
                self._json(200, {"ok": True, "fresh": True})
            else:
                self._json(404, {"error": "Không có API này"})
        except (ff.FormError, ValueError) as ex:
            self._json(400, {"error": str(ex)})
        except Exception as ex:
            self._json(500, {"error": f"Lỗi máy: {ex}"})


def main():
    os.chdir(ROOT)
    port = DEFAULT_PORT
    for arg in sys.argv[1:]:
        if arg.isdigit():
            port = int(arg)
    httpd = ThreadingHTTPServer((HOST, port), Handler)
    url = f"http://{HOST}:{port}"
    print(f"Giao diện: {url}")
    print("Tắt bằng Ctrl+C. Trang này không tự bấm Gửi trên form.")
    if "--no-open" not in sys.argv:
        subprocess.run(["open", url], check=False)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nĐã tắt.")


if __name__ == "__main__":
    main()
