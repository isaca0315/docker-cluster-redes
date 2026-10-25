#!/usr/bin/env python3
"""Convierte una transcripción de comandos en un HTML con aspecto de terminal.

Uso: render-terminal.py <entrada.txt> <salida.html> <título>
Imprime por stdout la altura recomendada en píxeles para la captura.
"""
import html
import math
import re
import sys

FONT_PX = 13
LINE_H = 21
CHARS_PER_LINE = 146
PAD_X = 28
HEADER_H = 46
TOP_PAD = 22
BOTTOM_PAD = 26


def main() -> None:
    src, dst, title = sys.argv[1], sys.argv[2], sys.argv[3]
    raw = open(src, encoding="utf-8", errors="replace").read().rstrip("\n")
    raw = re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", raw)
    lines = raw.split("\n") if raw else [""]

    rows = []
    wrapped_total = 0
    for line in lines:
        if line.startswith("kernel@"):
            cls = "cmd"
        elif line.lstrip().startswith("#"):
            cls = "note"
        elif not line.strip():
            cls = "blank"
        else:
            cls = "out"
        rows.append(f'<span class="{cls}">{html.escape(line) or "&nbsp;"}</span>')
        wrapped_total += max(1, math.ceil(len(line) / CHARS_PER_LINE))

    height = HEADER_H + TOP_PAD + wrapped_total * LINE_H + BOTTOM_PAD
    body = "\n".join(rows)

    doc = f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>{html.escape(title)}</title>
<style>
  * {{ box-sizing: border-box; }}
  html, body {{ margin: 0; background: #060a12; }}
  body {{ padding: 18px; font-family: "DejaVu Sans Mono", "Noto Emoji", monospace; }}
  .window {{
    border: 1px solid #24344d; border-radius: 12px; overflow: hidden;
    box-shadow: 0 18px 50px rgba(0,0,0,.55);
    background: linear-gradient(180deg, #0b1220, #080d17 60%);
  }}
  .bar {{
    height: {HEADER_H}px; display: flex; align-items: center; gap: 8px;
    padding: 0 16px; background: #101a2b; border-bottom: 1px solid #1e2c44;
  }}
  .dot {{ width: 11px; height: 11px; border-radius: 50%; }}
  .r {{ background: #ff5f57; }} .y {{ background: #febc2e; }} .g {{ background: #28c840; }}
  .title {{
    margin-left: 10px; color: #8ea3c4; font-size: 12px; letter-spacing: .02em;
  }}
  pre {{
    margin: 0; padding: {TOP_PAD}px {PAD_X}px {BOTTOM_PAD}px;
    color: #c9d6e8; font-size: {FONT_PX}px; line-height: {LINE_H}px;
    white-space: pre-wrap; overflow-wrap: anywhere;
  }}
  .cmd {{ color: #7ee787; font-weight: 700; }}
  .out {{ color: #c9d6e8; }}
  .note {{ color: #7d93b5; font-style: italic; }}
  .blank {{ color: transparent; }}
</style>
</head>
<body>
  <div class="window">
    <div class="bar">
      <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
      <span class="title">{html.escape(title)}</span>
    </div>
    <pre>{body}</pre>
  </div>
</body>
</html>
"""
    with open(dst, "w", encoding="utf-8") as fh:
        fh.write(doc)
    print(min(height, 12000))


if __name__ == "__main__":
    main()
