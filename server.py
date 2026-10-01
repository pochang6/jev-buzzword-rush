#!/usr/bin/env python3
"""Jev デモ用のローカルサーバー。

web/ を配信し、POST /api/jev を TypeSafe に中継する。
API キーはサーバー側だけが持ち、ブラウザには渡さない。

    TYPESAFE_AI_KEY=... python3 server.py
    → http://localhost:8787
"""
import json
import os
import time
import urllib.error
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

URL = "https://api.typesafe.ai/v1/systemone"
PORT = int(os.environ.get("PORT", 8787))
KEY = os.environ.get("TYPESAFE_AI_KEY")
LOG = Path(__file__).parent / "logs" / "server.jsonl"  # 呼び出しごとに1行。あとで分析する用


class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/api/jev":
            self.send_error(404)
            return
        body = self.rfile.read(int(self.headers["Content-Length"]))
        req = urllib.request.Request(
            URL, data=body, method="POST",
            headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
        )
        t0 = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                status, raw = r.status, r.read()
        except urllib.error.HTTPError as e:
            status, raw = e.code, e.read()
        ms = (time.perf_counter() - t0) * 1000
        res = json.loads(raw)
        LOG.parent.mkdir(exist_ok=True)
        with LOG.open("a") as f:
            f.write(json.dumps({
                "at": time.strftime("%Y-%m-%dT%H:%M:%S"), "kind": self.headers.get("X-Kind", ""),
                "status": status, "ms": round(ms), "request": json.loads(body), "response": res,
            }, ensure_ascii=False) + "\n")

        out = json.dumps({
            "status": status,
            "ms": round(ms),
            "url": URL,
            "authorization": "Bearer ********（キーはサーバー側で注入。ブラウザには渡さない）",
            "request_bytes": len(body),
            "response": res,
        }, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def end_headers(self):
        # 画面を直したら再読み込みだけで反映されるよう、キャッシュさせない
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        if self.command == "POST":
            print(f"{self.command} {self.path} {args[1] if len(args) > 1 else ''}")


if __name__ == "__main__":
    if not KEY:
        raise SystemExit("TYPESAFE_AI_KEY がありません。環境変数で渡してください（例: TYPESAFE_AI_KEY=... python3 server.py）。")
    web = Path(__file__).parent / "web"
    ThreadingHTTPServer.request_queue_size = 64  # 同時接続が多くても接続を落とさない
    server = ThreadingHTTPServer(("127.0.0.1", PORT), partial(Handler, directory=str(web)))
    print(f"http://localhost:{PORT}")
    server.serve_forever()
