#!/usr/bin/env python3
"""Jev (TypeSafe System One) の呼び出しを、HTTP の中身ごと見える化する小さなクライアント。

使い方:
    TYPESAFE_AI_KEY=... python3 jev.py examples/journal.json

入力ファイルは API のリクエストボディそのもの（state / model / questions）。
呼び出しごとに logs/calls.jsonl へ追記する。
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

URL = "https://api.typesafe.ai/v1/systemone"
PRICE_PER_MTOK = 0.042  # 入力トークンのみ課金。出力は無料（docs.typesafe.ai/models）
LOG = Path(__file__).parent / "logs" / "calls.jsonl"

DIM, BOLD, CYAN, GREEN, YELLOW, RESET = "\033[2m", "\033[1m", "\033[36m", "\033[32m", "\033[33m", "\033[0m"


def rule(title):
    print(f"\n{BOLD}{CYAN}── {title} {'─' * (60 - len(title))}{RESET}")


def bar(p, width=30):
    return "█" * round(p * width) + DIM + "·" * (width - round(p * width)) + RESET


def show_answers(answers):
    for qid, a in answers.items():
        kind = a["type"]
        if kind == "noul":
            p = a["noul"]
            print(f"  {BOLD}{qid}{RESET} {DIM}(noul){RESET}")
            print(f"    yes {bar(p)} {p:.3f}")
        else:
            best = a.get(kind)
            conf = a.get("confidence")
            print(f"  {BOLD}{qid}{RESET} {DIM}({kind}){RESET} → {GREEN}{best}{RESET}"
                  + (f"  {DIM}confidence {conf:.3f}{RESET}" if conf is not None else ""))
            probs = sorted(a.get("probabilities", {}).items(), key=lambda kv: -kv[1])
            for name, p in probs[:6]:
                print(f"    {name[:24]:<24} {bar(p)} {p:.3f}")
            if len(probs) > 6:
                print(f"    {DIM}…ほか {len(probs) - 6} 件{RESET}")


def call(body):
    key = os.environ.get("TYPESAFE_AI_KEY")
    if not key:
        sys.exit("TYPESAFE_AI_KEY がありません。環境変数で渡してください（例: TYPESAFE_AI_KEY=... python3 jev.py ...）。")
    data = json.dumps(body, ensure_ascii=False).encode()
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    rule("REQUEST")
    print(f"{BOLD}POST{RESET} {URL}")
    for k, v in headers.items():
        shown = "Bearer ********" if k == "Authorization" else v
        print(f"{DIM}{k}:{RESET} {shown}")
    print(f"{DIM}Content-Length:{RESET} {len(data)} bytes\n")
    print(json.dumps(body, ensure_ascii=False, indent=2))

    req = urllib.request.Request(URL, data=data, headers=headers, method="POST")
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            status, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    ms = (time.perf_counter() - t0) * 1000

    rule(f"RESPONSE  {status}  {ms:.0f} ms")
    res = json.loads(raw)
    print(json.dumps(res, ensure_ascii=False, indent=2))

    if status == 200:
        rule("ANSWERS")
        show_answers(res["answers"])
        tok = res["usage"]["input_tokens"]
        cost = tok / 1e6 * PRICE_PER_MTOK
        rule("COST")
        print(f"  model {res['model']} / input {tok} tok / output {res['usage']['output_tokens']} tok")
        print(f"  ≈ ${cost:.6f}  （$5 で約 {int(5 / cost):,} 回）")

    LOG.parent.mkdir(exist_ok=True)
    with LOG.open("a") as f:
        f.write(json.dumps({"at": time.strftime("%Y-%m-%dT%H:%M:%S"), "ms": round(ms), "status": status,
                            "request": body, "response": res}, ensure_ascii=False) + "\n")
    return res


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    call(json.loads(Path(sys.argv[1]).read_text()))
