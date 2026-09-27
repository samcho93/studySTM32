#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
studySTM32 static site builder
  content/curriculum.json + content/<track>/*.md + content/reference/hal.md
      ->  index.html, lessons/<id>.html, lessons/hal-reference.html

Standard library only (the small markdown renderer below is self-contained).
Usage:
  python build.py            # full build
  python build.py --serve    # build, then preview at http://localhost:8000
  python build.py --check    # build and fail (exit 1) on missing lessons / sections / example ids / links
"""
from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote


def _utf8_stdout() -> None:
    """Windows 콘솔(cp949)에서도 한글이 깨지지 않게 합니다."""
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except (ValueError, OSError):
                pass


_utf8_stdout()

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / "content"
LESSONS = ROOT / "lessons"
FIGURES = CONTENT / "figures"
EXAMPLES_JS = ROOT / "assets" / "js" / "stm32" / "examples.js"
SITE_URL = "https://samcho93.github.io/studySTM32/"

TOOL_LINKS = {
    "sim": ("sim/index.html", "시뮬레이터"),
    "ref": ("lessons/hal-reference.html", "HAL 레퍼런스"),
}

REQUIRED_SECTIONS = ["학습 목표", "자주 나는 오류와 해결", "참고자료"]

# 홈 facts 바에 쓰는 값 (docs/SPEC.md 2장·3.1장·5장과 맞춥니다)
BOARDS = ["NUCLEO-F411RE", "NUCLEO-F103RB", "BLUEPILL-F103C8"]
DEVICE_TYPES = ["led", "rgb", "button", "pot", "ldr", "buzzer", "fnd", "lcd1602", "motor",
                "servo", "stepper", "uart", "i2cdev", "spidev", "logic"]
SUPPORTED_HAL_API = [
    # 코어
    "HAL_Init", "HAL_Delay", "HAL_GetTick", "HAL_NVIC_SetPriority", "HAL_NVIC_EnableIRQ",
    "HAL_NVIC_DisableIRQ",
    # GPIO / EXTI
    "HAL_GPIO_WritePin", "HAL_GPIO_ReadPin", "HAL_GPIO_TogglePin", "HAL_GPIO_Init",
    "HAL_GPIO_EXTI_Callback",
    # UART
    "HAL_UART_Transmit", "HAL_UART_Receive", "HAL_UART_Transmit_IT", "HAL_UART_Receive_IT",
    "HAL_UART_RxCpltCallback", "HAL_UART_TxCpltCallback",
    # TIM
    "HAL_TIM_Base_Start", "HAL_TIM_Base_Start_IT", "HAL_TIM_Base_Stop", "HAL_TIM_Base_Stop_IT",
    "HAL_TIM_PWM_Start", "HAL_TIM_PWM_Stop", "__HAL_TIM_SET_COMPARE", "__HAL_TIM_GET_COMPARE",
    "__HAL_TIM_SET_AUTORELOAD", "__HAL_TIM_GET_AUTORELOAD", "__HAL_TIM_SET_COUNTER",
    "__HAL_TIM_GET_COUNTER", "__HAL_TIM_SET_PRESCALER", "HAL_TIM_PeriodElapsedCallback",
    # ADC
    "HAL_ADC_Start", "HAL_ADC_PollForConversion", "HAL_ADC_GetValue", "HAL_ADC_Stop",
    "HAL_ADC_ConfigChannel", "HAL_ADC_Start_IT", "HAL_ADC_ConvCpltCallback", "HAL_ADC_Start_DMA",
    # I2C
    "HAL_I2C_Master_Transmit", "HAL_I2C_Master_Receive", "HAL_I2C_Mem_Write", "HAL_I2C_Mem_Read",
    "HAL_I2C_IsDeviceReady",
    # SPI
    "HAL_SPI_Transmit", "HAL_SPI_Receive", "HAL_SPI_TransmitReceive",
]


# ---------------------------------------------------------------- examples.js

class Examples:
    """assets/js/stm32/examples.js 를 정규식 + 작은 식 해석기로 읽습니다.

    user 섹션 값은  C`...`  (String.raw 태그), '...' 문자열, 앞에서 정의한  var NAME = C`...`;
    상수를 + 로 이은 식만 지원합니다 (examples.js 머리 주석의 규칙).
    """

    SECTIONS = ["includes", "pv", "pfp", "u0", "u2", "loop", "u4"]

    def __init__(self, path: Path):
        self.path = path
        self.items: dict = {}
        self.errors: list = []
        if not path.exists():
            self.errors.append("examples.js 없음: %s" % path)
            return
        src = path.read_text(encoding="utf-8").replace("\r\n", "\n")
        self.consts = {m.group(1): self._raw(m.group(2))
                       for m in re.finditer(r"var\s+(\w+)\s*=\s*C`([^`]*)`\s*;", src)}
        heads = list(re.finditer(r"STM32_EXAMPLES\['([\w-]+)'\]\s*=\s*\{", src))
        for k, m in enumerate(heads):
            end = heads[k + 1].start() if k + 1 < len(heads) else len(src)
            block = src[m.end():end]
            ex_id = m.group(1)
            info = {"id": ex_id}
            for key in ("title", "lesson", "board", "desc"):
                mm = re.search(r"\b%s:\s*'((?:\\.|[^'\\])*)'" % key, block)
                info[key] = self._js_str(mm.group(1)) if mm else ""
            um = re.search(r"\buser:\s*\{", block)
            info["user"] = {}
            if um:
                try:
                    info["user"] = self._parse_user(block, um.end())
                except ValueError as e:
                    self.errors.append("%s: user 섹션 해석 실패 (%s)" % (ex_id, e))
            else:
                self.errors.append("%s: user 없음" % ex_id)
            self.items[ex_id] = info

    @staticmethod
    def _raw(s: str) -> str:
        return s[1:] if s.startswith("\n") else s

    @staticmethod
    def _js_str(s: str) -> str:
        return re.sub(r"\\(.)", lambda m: {"n": "\n", "t": "\t", "r": "\r"}.get(m.group(1), m.group(1)), s)

    def _parse_user(self, s: str, i: int) -> dict:
        out = {}
        n = len(s)
        while i < n:
            while i < n and s[i] in " \t\n,":
                i += 1
            if i < n and s[i] == "}":
                return out
            m = re.compile(r"(\w+)\s*:\s*").match(s, i)
            if not m:
                raise ValueError("키를 찾을 수 없음: %r" % s[i:i + 30])
            key = m.group(1)
            i = m.end()
            parts = []
            while True:
                while i < n and s[i] in " \t\n":
                    i += 1
                if s.startswith("C`", i):
                    j = s.index("`", i + 2)
                    parts.append(self._raw(s[i + 2:j]))
                    i = j + 1
                elif s[i] == "'":
                    mm = re.compile(r"'((?:\\.|[^'\\])*)'").match(s, i)
                    parts.append(self._js_str(mm.group(1)))
                    i = mm.end()
                else:
                    mm = re.compile(r"[A-Za-z_]\w*").match(s, i)
                    if not mm or mm.group(0) not in self.consts:
                        raise ValueError("알 수 없는 값: %r" % s[i:i + 30])
                    parts.append(self.consts[mm.group(0)])
                    i = mm.end()
                while i < n and s[i] in " \t\n":
                    i += 1
                if i < n and s[i] == "+":
                    i += 1
                    continue
                break
            out[key] = "".join(parts)
        raise ValueError("user 블록이 닫히지 않음")

    def main_c(self, ex_id: str, sections=None) -> str:
        """CubeMX main.c 의 USER CODE 구역 모양으로 코드를 엮습니다."""
        user = self.items[ex_id]["user"]
        want = sections or [s for s in self.SECTIONS if user.get(s, "").strip()]
        chunks = []
        for sec in want:
            code = user.get(sec, "").rstrip("\n")
            if sec == "includes":
                chunks.append("/* USER CODE BEGIN Includes */\n%s\n/* USER CODE END Includes */" % code)
            elif sec == "pv":
                chunks.append("/* USER CODE BEGIN PV */\n%s\n/* USER CODE END PV */" % code)
            elif sec == "pfp":
                chunks.append("/* USER CODE BEGIN PFP */\n%s\n/* USER CODE END PFP */" % code)
            elif sec == "u0":
                chunks.append("/* USER CODE BEGIN 0 */\n%s\n/* USER CODE END 0 */" % code)
            elif sec == "u2":
                chunks.append("  /* USER CODE BEGIN 2 */\n%s\n  /* USER CODE END 2 */" % code)
            elif sec == "loop":
                chunks.append("  /* USER CODE BEGIN WHILE */\n  while (1)\n  {\n"
                              "    /* USER CODE END WHILE */\n\n    /* USER CODE BEGIN 3 */\n"
                              "%s\n  }\n  /* USER CODE END 3 */" % code)
            elif sec == "u4":
                chunks.append("/* USER CODE BEGIN 4 */\n%s\n/* USER CODE END 4 */" % code)
        return "\n\n".join(chunks)


# ---------------------------------------------------------------- C 색칠

C_KEYWORDS = set("""auto break case const continue default do else enum extern for goto if inline
register return sizeof static struct switch typedef union volatile while true false NULL""".split())
C_TYPES = set("""void char short int long float double signed unsigned bool size_t
uint8_t uint16_t uint32_t uint64_t int8_t int16_t int32_t int64_t
HAL_StatusTypeDef GPIO_PinState GPIO_TypeDef GPIO_InitTypeDef UART_HandleTypeDef TIM_HandleTypeDef
ADC_HandleTypeDef ADC_ChannelConfTypeDef I2C_HandleTypeDef SPI_HandleTypeDef IRQn_Type
TIM_TypeDef USART_TypeDef""".split())
C_TOKEN = re.compile(r"""
    (?P<com>/\*.*?\*/|//[^\n]*)
  | (?P<pre>^[ \t]*\#[ \t]*\w+(?:[ \t]*<[^>\n]*>)?)
  | (?P<str>"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')
  | (?P<num>\b(?:0[xX][0-9A-Fa-f]+|\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)[uUlLfF]*\b)
  | (?P<id>\b[A-Za-z_]\w*\b)
""", re.S | re.M | re.X)


def highlight_c(code: str) -> str:
    out, last = [], 0
    for m in C_TOKEN.finditer(code):
        out.append(html.escape(code[last:m.start()], quote=False))
        t = m.group(0)
        kind = m.lastgroup
        cls = None
        if kind == "com":
            cls = "tk-c"
        elif kind == "pre":
            cls = "tk-p"
        elif kind == "str":
            cls = "tk-s"
        elif kind == "num":
            cls = "tk-n"
        else:
            nxt = code[m.end():m.end() + 1]
            rest = code[m.end():].lstrip(" ")
            if t in C_KEYWORDS:
                cls = "tk-k"
            elif t in C_TYPES or t.endswith("_TypeDef") or t.endswith("_HandleTypeDef"):
                cls = "tk-t"
            elif (t.startswith("HAL_") or t.startswith("__HAL_") or t.startswith("MX_")) and rest.startswith("("):
                cls = "tk-h"
            elif rest.startswith("(") and nxt in "( ":
                cls = "tk-f"
            elif re.match(r"^[A-Z][A-Z0-9_]*[A-Z0-9]$", t) and len(t) > 1:
                cls = "tk-m"
        esc = html.escape(t, quote=False)
        out.append('<span class="%s">%s</span>' % (cls, esc) if cls else esc)
        last = m.end()
    out.append(html.escape(code[last:], quote=False))
    return "".join(out)


# ---------------------------------------------------------------- markdown

class MarkdownRenderer:
    """강의에 필요한 범위만 지원하는 소형 마크다운 렌더러."""

    CALLOUT_LABEL = {
        "tip": "TIP",
        "info": "참고",
        "warn": "주의",
        "warning": "주의",
        "danger": "위험",
        "safety": "안전 확인 (실물 실습 전 필수)",
        "check": "체크포인트",
        "task": "실습",
        "mission": "미션",
    }

    def __init__(self, examples: Examples, depth: int = 1):
        self.examples = examples
        self.rel = "../" * depth
        self.toc: list = []
        self.sim_ids: list = []      # @sim 으로 참조한 예제 id (--check 용)
        self.code_refs: list = []    # @code 로 참조한 (id, sections)
        self.table_class = ""

    # ---- inline --------------------------------------------------------
    def inline(self, text: str) -> str:
        out = []
        for part in re.split(r"(`[^`]+`)", text):
            if len(part) > 1 and part.startswith("`") and part.endswith("`"):
                out.append("<code>" + html.escape(part[1:-1]) + "</code>")
                continue
            s = html.escape(part, quote=False)
            s = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", self._img, s)
            s = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", self._link, s)
            s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
            s = re.sub(r"(?<![\w*])\*([^*\n]+)\*(?![\w*])", r"<em>\1</em>", s)
            s = re.sub(r"~~([^~]+)~~", r"<del>\1</del>", s)
            s = re.sub(r"\$([^$\n]+)\$", r'<span class="math">\1</span>', s)
            out.append(s)
        return "".join(out)

    def _img(self, m):
        return '<img src="%s" alt="%s" loading="lazy">' % (self._href(m.group(2)), m.group(1))

    def _link(self, m):
        url = m.group(2)
        ext = ' target="_blank" rel="noopener"' if "://" in url else ""
        return '<a href="%s"%s>%s</a>' % (self._href(url), ext, m.group(1))

    def _href(self, url: str) -> str:
        if url.startswith("~/"):
            return self.rel + url[2:]
        return url

    def _sub(self):
        sub = MarkdownRenderer(self.examples, depth=0)
        sub.rel = self.rel
        sub.sim_ids = self.sim_ids
        sub.code_refs = self.code_refs
        return sub

    # ---- blocks --------------------------------------------------------
    def render(self, md: str) -> str:
        lines = md.replace("\r\n", "\n").split("\n")
        out = []
        i, n = 0, len(lines)

        while i < n:
            line = lines[i]
            stripped = line.strip()

            if not stripped:
                i += 1
                continue

            if stripped.startswith("```"):
                info = stripped[3:].strip() or "text"
                i += 1
                buf = []
                while i < n and not lines[i].strip().startswith("```"):
                    buf.append(lines[i])
                    i += 1
                i += 1
                out.append(self._code_block(info, "\n".join(buf)))
                continue

            if stripped.startswith("@fig["):
                m = re.match(r"@fig\[([\w-]+)\]\s*(.*)", stripped)
                if m:
                    out.append(self._figure(m.group(1), m.group(2).strip()))
                    i += 1
                    continue

            if stripped.startswith("@btn["):
                m = re.match(r"@btn\[([^\]]+)\]\s*(.*)", stripped)
                if m:
                    out.append('<p class="cta-row"><a class="ghost-btn cta" href="%s">%s</a></p>'
                               % (html.escape(self._href(m.group(1))),
                                  html.escape(m.group(2).strip() or "열기")))
                    i += 1
                    continue

            if stripped.startswith("@sim["):
                m = re.match(r"@sim\[([\w-]+)\]\s*(.*)", stripped)
                if m:
                    out.append(self._sim_button(m.group(1), m.group(2).strip()))
                    i += 1
                    continue

            if stripped.startswith("@code["):
                m = re.match(r"@code\[([\w-]+)\]\s*(.*)", stripped)
                if m:
                    out.append(self._example_code(m.group(1), m.group(2).strip()))
                    i += 1
                    continue

            if stripped.startswith("@table["):
                m = re.match(r"@table\[([\w -]+)\]", stripped)
                if m:
                    self.table_class = m.group(1).strip()
                    i += 1
                    continue

            if stripped.startswith(":::"):
                m = re.match(r":::\s*([\w-]+)\s*(.*)", stripped)
                kind = (m.group(1) if m else "info").lower()
                title = (m.group(2).strip() if m else "")
                i += 1
                buf = []
                depth = 0
                while i < n:
                    s = lines[i].strip()
                    if s == ":::" and depth == 0:
                        break
                    if re.match(r":::\s*[\w-]+", s):
                        depth += 1
                    elif s == ":::":
                        depth -= 1
                    buf.append(lines[i])
                    i += 1
                i += 1
                label = title or self.CALLOUT_LABEL.get(kind, "참고")
                css = "warn" if kind == "warning" else kind
                out.append(
                    '<div class="callout callout-%s"><div class="callout-title">%s</div>'
                    '<div class="callout-body">%s</div></div>'
                    % (css, html.escape(label), self._sub().render("\n".join(buf))))
                continue

            m = re.match(r"^(#{1,4})\s+(.*)$", stripped)
            if m:
                level = len(m.group(1))
                text = m.group(2).strip()
                slug = self._slug(text)
                if level in (2, 3):
                    self.toc.append((level, slug, text))
                out.append('<h%d id="%s">%s<a class="anchor" href="#%s">#</a></h%d>'
                           % (level, slug, self.inline(text), slug, level))
                i += 1
                continue

            if re.match(r"^(---|\*\*\*)$", stripped):
                out.append("<hr>")
                i += 1
                continue

            if ("|" in stripped and i + 1 < n
                    and re.match(r"^\s*\|?[\s:|-]+\|[\s:|-]*$", lines[i + 1])):
                head = self._row(stripped)
                i += 2
                body = []
                while i < n and "|" in lines[i] and lines[i].strip():
                    body.append(self._row(lines[i]))
                    i += 1
                thead = "".join("<th>%s</th>" % self.inline(c) for c in head)
                rows = "".join("<tr>%s</tr>" % "".join("<td>%s</td>" % self.inline(c) for c in r)
                               for r in body)
                cls = (' ' + html.escape(self.table_class)) if self.table_class else ""
                self.table_class = ""
                out.append('<div class="table-wrap%s"><table><thead><tr>%s</tr></thead>'
                           "<tbody>%s</tbody></table></div>" % (cls, thead, rows))
                continue

            if stripped.startswith(">"):
                buf = []
                while i < n and lines[i].strip().startswith(">"):
                    buf.append(re.sub(r"^\s*>\s?", "", lines[i]))
                    i += 1
                out.append("<blockquote>%s</blockquote>" % self._sub().render("\n".join(buf)))
                continue

            if re.match(r"^\s*([-*+]|\d+\.)\s+", line):
                block, i = self._collect_list(lines, i)
                out.append(block)
                continue

            if stripped.startswith("<"):
                buf = []
                while i < n and lines[i].strip():
                    buf.append(lines[i])
                    i += 1
                out.append("\n".join(buf))
                continue

            buf = []
            while (i < n and lines[i].strip() and not re.match(
                    r"^\s*(#{1,4}\s|```|:::|@fig\[|@btn\[|@sim\[|@code\[|@table\[|>|[-*+]\s|\d+\.\s|---$)",
                    lines[i])):
                buf.append(lines[i].strip())
                i += 1
            out.append("<p>%s</p>" % self.inline(" ".join(buf)))

        return "\n".join(out)

    # ---- STM32 directives ---------------------------------------------
    def _sim_button(self, ex_id: str, label: str) -> str:
        self.sim_ids.append(ex_id)
        info = self.examples.items.get(ex_id, {})
        label = label or info.get("title") or ex_id
        base = "%ssim/index.html?ex=%s" % (self.rel, ex_id)
        return ('<div class="sim-cta">'
                '<a class="sim-btn" href="%s" data-sim-src="%s&amp;embed=1" data-sim-id="%s">'
                '<span class="sim-btn-k">시뮬레이터에서 열기</span>'
                '<span class="sim-btn-l">%s</span></a>'
                '<a class="sim-newtab" href="%s" target="_blank" rel="noopener">새 창</a>'
                '<code class="sim-id">%s</code></div>'
                % (html.escape(base), html.escape(base), html.escape(ex_id), html.escape(label),
                   html.escape(base), html.escape(ex_id)))

    def _example_code(self, ex_id: str, spec: str) -> str:
        sections = [s.strip() for s in spec.split(",") if s.strip()] or None
        self.code_refs.append((ex_id, sections or []))
        if ex_id not in self.examples.items:
            return ('<div class="callout callout-warn"><div class="callout-title">예제 없음</div>'
                    '<div class="callout-body"><p>%s</p></div></div>' % html.escape(ex_id))
        bad = [s for s in (sections or []) if s not in Examples.SECTIONS]
        if bad:
            sections = [s for s in sections if s in Examples.SECTIONS]
        code = self.examples.main_c(ex_id, sections)
        return ('<div class="code-block code-example" data-example="%s">'
                '<div class="code-head"><span class="code-lang">c</span>'
                '<span class="code-file">Core/Src/main.c</span>'
                '<span class="code-actions"><button class="copy-btn" type="button">복사</button></span></div>'
                '<pre><code class="lang-c">%s</code></pre></div>'
                % (html.escape(ex_id), highlight_c(code)))

    # ---- helpers -------------------------------------------------------
    def _row(self, line: str) -> list:
        cells = re.split(r"(?<!\\)\|", line.strip().strip("|"))
        return [c.strip().replace("\\|", "|") for c in cells]

    def _figure(self, name: str, caption: str) -> str:
        path = FIGURES / (name + ".svg")
        if not path.exists():
            return ('<div class="callout callout-warn"><div class="callout-title">그림 없음</div>'
                    '<div class="callout-body"><p>content/figures/%s.svg</p></div></div>'
                    % html.escape(name))
        svg = path.read_text(encoding="utf-8").strip()
        cap = ('<figcaption>%s</figcaption>' % self.inline(caption)) if caption else ""
        return '<figure class="fig" id="fig-%s">%s%s</figure>' % (html.escape(name), svg, cap)

    def _code_block(self, info: str, code: str) -> str:
        parts = info.split()
        lang = parts[0]
        flags = parts[1:]
        file_tag = ""
        if flags:
            file_tag = '<span class="code-file">%s</span>' % html.escape(" ".join(flags))
        body = highlight_c(code) if lang in ("c", "h", "cpp") else html.escape(code)
        return ('<div class="code-block">'
                '<div class="code-head"><span class="code-lang">%s</span>%s'
                '<span class="code-actions"><button class="copy-btn" type="button">복사</button></span></div>'
                '<pre><code class="lang-%s">%s</code></pre></div>'
                % (html.escape(lang), file_tag, html.escape(lang), body))

    def _collect_list(self, lines: list, i: int):
        n = len(lines)
        items = []
        while i < n:
            m = re.match(r"^(\s*)([-*+]|\d+\.)\s+(.*)$", lines[i])
            if not m:
                if lines[i].strip() and items and lines[i].startswith("   "):
                    indent, text, ordered = items[-1]
                    items[-1] = (indent, text + " " + lines[i].strip(), ordered)
                    i += 1
                    continue
                break
            items.append((len(m.group(1)), m.group(3), m.group(2)[0].isdigit()))
            i += 1

        def item_html(text: str) -> str:
            m = re.match(r"^\[( |x|X)\]\s+(.*)$", text)
            if m:
                checked = " checked" if m.group(1).lower() == "x" else ""
                return ('<label class="check-item"><input type="checkbox"%s> %s</label>'
                        % (checked, self.inline(m.group(2))))
            return self.inline(text)

        def build(pos, level):
            tag = "ol" if items[pos][2] else "ul"
            buf = ["<%s>" % tag]
            while pos < len(items) and items[pos][0] >= level:
                indent, text, _ = items[pos]
                if indent > level:
                    sub, pos = build(pos, indent)
                    buf.append(sub)
                    continue
                buf.append("<li>" + item_html(text))
                if pos + 1 < len(items) and items[pos + 1][0] > level:
                    sub, pos = build(pos + 1, items[pos + 1][0])
                    buf.append(sub)
                else:
                    pos += 1
                buf.append("</li>")
            buf.append("</%s>" % tag)
            return "".join(buf), pos

        block = build(0, items[0][0])[0] if items else ""
        return block, i

    @staticmethod
    def _slug(text: str) -> str:
        s = re.sub(r"[`*_\[\]()#]", "", text).strip().lower()
        s = re.sub(r"[^0-9a-z가-힣]+", "-", s).strip("-")
        return s or "section"


# ---------------------------------------------------------------- front matter

def split_front_matter(text: str):
    text = text.replace("\r\n", "\n")
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---", 4)
    if end == -1:
        return {}, text
    meta: dict = {}
    for line in text[4:end].split("\n"):
        line = re.sub(r"\s+#.*$", "", line)
        if ":" in line:
            k, v = line.split(":", 1)
            v = v.strip().strip('"')
            if v.startswith("[") and v.endswith("]"):
                meta[k.strip()] = [x.strip().strip('"') for x in v[1:-1].split(",") if x.strip()]
            else:
                meta[k.strip()] = v
    return meta, text[end + 4:].lstrip("\n")


# ---------------------------------------------------------------- templates

def sidebar_html(cur: dict, current, rel: str) -> str:
    ref = cur["reference"]
    out = ['<nav class="sidebar-nav">']
    out.append('<div class="brand-row">'
               '<a class="brand" href="%sindex.html"><span class="brand-mark">32</span>'
               '<span class="brand-text">studySTM32<small>STM32 HAL 인터랙티브 강좌</small></span></a>'
               "</div>" % rel)
    out.append('<div class="side-tools">'
               '<a class="side-tool" href="%ssim/index.html">시뮬레이터</a>'
               '<a class="side-tool%s" href="%slessons/%s.html">HAL 레퍼런스</a>'
               "</div>" % (rel, " active" if current == ref["id"] else "", rel, ref["id"]))
    for track in cur["tracks"]:
        out.append('<div class="nav-track" data-track="%s">' % track["id"])
        for part in track["parts"]:
            out.append('<div class="nav-track-title track-%s"><span class="nav-part-no">%s</span>%s</div>'
                       % (track["id"], html.escape(part["no"]), html.escape(part["title"])))
            out.append("<ul>")
            for cid in part["chapters"]:
                ch = cur["index"][cid]
                active = ' class="active"' if cid == current else ""
                out.append('<li><a href="%slessons/%s.html"%s data-slug="%s">'
                           '<span class="nav-no">%s</span>%s</a></li>'
                           % (rel, cid, active, cid, cid.upper(), html.escape(ch["title"])))
            out.append("</ul>")
        out.append("</div>")
    out.append("</nav>")
    return "\n".join(out)


def topbar_html(rel: str, current: str) -> str:
    def link(key, href, label):
        cls = ' class="active" aria-current="page"' if key == current else ""
        return '<a href="%s%s"%s>%s</a>' % (rel, href, cls, label)
    return ('<header class="topbar">'
            '<a class="topbar-brand" href="%sindex.html"><span class="brand-mark">32</span>studySTM32</a>'
            '<nav class="topnav" aria-label="사이트 메뉴">%s%s%s</nav>'
            '<button class="theme-icon" type="button" data-theme-toggle data-theme-icon aria-label="테마 전환"></button>'
            '</header>'
            % (rel, link("home", "index.html", "강의 홈"), link("sim", "sim/index.html", "시뮬레이터"),
               link("ref", "lessons/hal-reference.html", "HAL 레퍼런스")))


PAGE = """<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect x=%2210%22 y=%2210%22 width=%2280%22 height=%2280%22 rx=%2218%22 fill=%22%234f46e5%22/><text x=%2250%22 y=%2264%22 font-size=%2238%22 font-family=%22monospace%22 font-weight=%22700%22 text-anchor=%22middle%22 fill=%22white%22>32</text></svg>">
<link rel="stylesheet" href="{rel}assets/css/main.css">
<link rel="stylesheet" href="{rel}assets/css/stm32.css">
<link rel="stylesheet" href="{rel}assets/css/ml-theme.css">
<link rel="stylesheet" crossorigin="anonymous" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
<link rel="stylesheet" crossorigin="anonymous" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap">
<script src="{rel}assets/js/theme.js"></script>
</head>
<body class="{bodyclass}">
<button class="nav-toggle" id="navToggle" aria-label="목차 열기">&#9776;</button>
<aside class="sidebar" id="sidebar">
{sidebar}
</aside>
<div class="sidebar-scrim" id="scrim"></div>
<main class="main">
{topbar}
{content}
</main>
<script src="{rel}assets/js/site.js"></script>
</body>
</html>
"""


def _as_list(v) -> list:
    if not v:
        return []
    return [v] if isinstance(v, str) else list(v)


def lesson_page(cur: dict, cid: str, meta: dict, body_md: str, examples: Examples):
    info = cur["index"][cid]
    r = MarkdownRenderer(examples, depth=1)
    content_html = r.render(body_md)
    order = cur["order"]
    pos = order.index(cid)
    prev_id = order[pos - 1] if pos > 0 else None
    next_id = order[pos + 1] if pos < len(order) - 1 else None

    toc = "".join('<a class="toc-l%d" href="#%s">%s</a>' % (lvl, sid, html.escape(txt))
                  for lvl, sid, txt in r.toc)

    def pager(cls, label, other):
        if not other:
            return '<span class="%s disabled"></span>' % cls
        return ('<a class="%s" href="%s.html"><span>%s · %s</span>%s</a>'
                % (cls, other, label, other.upper(), html.escape(cur["index"][other]["title"])))

    requires = _as_list(meta.get("requires") or info.get("requires"))
    req_html = ""
    if requires:
        req_html = '<div class="requires">선수 레슨: %s</div>' % " ".join(
            '<a href="%s.html">%s</a>' % (x, x.upper()) for x in requires if x in cur["index"])

    tools = _as_list(meta.get("tools") or info.get("tools"))
    tool_btns = []
    for t in tools:
        if t == "sim":
            if r.sim_ids:
                ex = r.sim_ids[0]
                tool_btns.append('<a class="ghost-btn tool-sim" href="../sim/index.html?ex=%s" '
                                 'data-sim-src="../sim/index.html?ex=%s&amp;embed=1">시뮬레이터에서 실습</a>'
                                 % (ex, ex))
            else:
                tool_btns.append('<a class="ghost-btn tool-sim" href="../sim/index.html">시뮬레이터</a>')
        elif t == "ref":
            tool_btns.append('<a class="ghost-btn" href="hal-reference.html">HAL 레퍼런스</a>')

    level = meta.get("level", info.get("level", ""))
    duration = meta.get("duration", info.get("duration", 60))

    header = """
<article class="lesson" data-slug="{cid}" data-track="{track}">
  <div class="lesson-head">
    <div class="crumbs"><span class="track-pill track-{track}">{part_no}</span> {part} &middot; 약 {minutes}분 &middot; {level}</div>
    <h1><span class="lesson-no">{no}</span>{title}</h1>
    <p class="lede">{summary}</p>
    {req}
    <div class="lesson-actions">
      <label class="done-toggle"><input type="checkbox" id="doneCheck"><span>학습 완료로 표시</span></label>
      {tools}
    </div>
  </div>
  <div class="lesson-grid">
    <div class="lesson-body">
{content}
      <nav class="pager">{prev}{next}</nav>
    </div>
    <aside class="lesson-toc"><div class="toc-title">이 레슨의 내용</div><div class="toc-links">{toc}</div></aside>
  </div>
</article>
""".format(cid=cid, track=info["track"], part_no=html.escape(info["part_no"]),
           part=html.escape(info["part_title"]), minutes=duration, level=html.escape(level),
           no=cid.upper(), title=html.escape(info["title"]),
           summary=html.escape(info.get("summary", "")), req=req_html, tools="".join(tool_btns),
           content=content_html, prev=pager("pager-prev", "이전", prev_id),
           next=pager("pager-next", "다음", next_id), toc=toc)

    page = PAGE.format(
        title="%s. %s · studySTM32" % (cid.upper(), info["title"]),
        desc=html.escape(info.get("summary", "")),
        rel="../", bodyclass="lesson-page track-page-%s" % info["track"],
        sidebar=sidebar_html(cur, cid, "../"), topbar=topbar_html("../", ""),
        content=header)
    return page, r


def reference_page(cur: dict, body_md: str, examples: Examples):
    ref = cur["reference"]
    r = MarkdownRenderer(examples, depth=1)
    content_html = r.render(body_md)
    toc = "".join('<a class="toc-l%d" href="#%s">%s</a>' % (lvl, sid, html.escape(txt))
                  for lvl, sid, txt in r.toc)
    first = cur["order"][0]
    content = """
<article class="lesson reference" data-track="ref">
  <div class="lesson-head">
    <div class="crumbs"><span class="track-pill track-ref">REFERENCE</span> HAL API &middot; 시뮬레이터 지원 {napi}개</div>
    <h1>{title}</h1>
    <p class="lede">{summary}</p>
    <div class="lesson-actions">
      <a class="ghost-btn" href="../sim/index.html">시뮬레이터 열기</a>
      <a class="ghost-btn" href="{first}.html">{first_no}부터 강의 보기</a>
    </div>
  </div>
  <div class="lesson-grid">
    <div class="lesson-body">
{content}
    </div>
    <aside class="lesson-toc"><div class="toc-title">모듈</div><div class="toc-links">{toc}</div></aside>
  </div>
</article>
""".format(napi=len(SUPPORTED_HAL_API), title=html.escape(ref["title"]),
           summary=html.escape(ref["summary"]), first=first, first_no=first.upper(),
           content=content_html, toc=toc)
    page = PAGE.format(
        title="%s · studySTM32" % ref["title"], desc=html.escape(ref["summary"]),
        rel="../", bodyclass="lesson-page ref-page", sidebar=sidebar_html(cur, ref["id"], "../"),
        topbar=topbar_html("../", "ref"), content=content)
    return page, r


def index_page(cur: dict) -> str:
    total = len(cur["order"])
    first = cur["order"][0]
    sections = []
    for track in cur["tracks"]:
        for part in track["parts"]:
            items = []
            for cid in part["chapters"]:
                ch = cur["index"][cid]
                tags = "".join('<span class="tag">%s</span>' % html.escape(TOOL_LINKS[t][1])
                               for t in ch.get("tools", []) if t in TOOL_LINKS)
                items.append(
                    '<a class="lesson-card" href="lessons/%s.html" data-slug="%s">'
                    '<div class="lc-no">%s</div>'
                    '<div class="lc-main"><div class="lc-title">%s</div>'
                    '<div class="lc-sum">%s</div>'
                    '<div class="lc-meta"><span class="lc-min">%s분 · %s</span>%s</div></div>'
                    '<div class="lc-check" aria-hidden="true"></div></a>'
                    % (cid, cid, cid.upper(), html.escape(ch["title"]),
                       html.escape(ch.get("summary", "")), ch.get("duration", 60),
                       html.escape(ch.get("level", "")), tags))
            sections.append(
                '<section class="part track-block" data-track="%s">'
                '<header class="part-head"><div class="part-no track-%s">%s</div>'
                '<div><h3>%s</h3><p>%s</p></div></header>'
                '<div class="part-list">%s</div></section>'
                % (track["id"], track["id"], html.escape(part["no"]), html.escape(part["title"]),
                   html.escape(track["desc"]), "".join(items)))

    hero = """
<header class="hero">
  <div class="hero-inner">
    <div class="hero-tag">STM32 &middot; HAL &middot; CubeMX &middot; CubeIDE &middot; 브라우저 시뮬레이터</div>
    <h1>STM32 HAL<br>인터랙티브 강좌</h1>
    <p class="hero-lede">
      <b>CubeMX로 핀을 설정</b>하고, 생성된 코드의 <code>USER CODE</code> 구역에 <b>HAL 코드</b>를 쓰고,
      브라우저 <b>시뮬레이터</b>에서 LED·버튼·LCD·모터 회로로 바로 실행해 봅니다.
      같은 코드를 STM32CubeIDE에 붙여 넣으면 <b>실물 Nucleo 보드</b>에서도 그대로 동작합니다.
      GPIO부터 UART·타이머·PWM·ADC·I2C·SPI, 모터 제어와 미니 프로젝트까지 총 {total}개 레슨.
    </p>
    <div class="hero-cta">
      <a class="btn primary" href="lessons/{first}.html">{first_no}부터 시작</a>
      <a class="btn" href="sim/index.html">시뮬레이터 열기</a>
      <a class="btn" href="lessons/hal-reference.html">HAL 레퍼런스</a>
    </div>
    <div class="progress-wrap">
      <div class="progress-bar"><div class="progress-fill" id="progFill"></div></div>
      <div class="progress-text"><span id="progText">0 / {total} 레슨 완료</span>
      <button class="link-btn" id="resetProg" type="button">진행률 초기화</button></div>
    </div>
  </div>
  <div class="hero-art">
    <div class="hero-flow" aria-label="학습 흐름">
      <div class="flow-step"><b>1</b><span>CubeMX 핀 설정<small>핀아웃 · 클럭 · 주변장치 · NVIC</small></span></div>
      <div class="flow-arrow">&darr;</div>
      <div class="flow-step"><b>2</b><span>HAL 코드<small>USER CODE 구역 · 콜백 · printf</small></span></div>
      <div class="flow-arrow">&darr;</div>
      <div class="flow-step"><b>3</b><span>시뮬레이터<small>회로 노드 · 실습 결과 · 로직 분석기</small></span></div>
      <div class="flow-arrow">&darr;</div>
      <div class="flow-step hot"><b>4</b><span>실물 보드<small>CubeIDE · ST-Link 플래시 · 디버그</small></span></div>
    </div>
    <div class="hero-art-cap">같은 .ioc 설정, 같은 HAL 코드 — 시뮬레이터에서 실물 보드로</div>
  </div>
</header>

<section class="facts">
  <div class="fact"><div class="fact-n">{total}</div><div class="fact-l">레슨 (PART 1~4)</div></div>
  <div class="fact"><div class="fact-n">{nboards}</div><div class="fact-l">지원 보드 (Nucleo F411RE · F103RB · BluePill)</div></div>
  <div class="fact"><div class="fact-n">{ndev}</div><div class="fact-l">종 주변기기 노드 (LED · LCD · 모터 …)</div></div>
  <div class="fact"><div class="fact-n">{napi}</div><div class="fact-l">개 HAL API 에뮬레이션</div></div>
</section>

<section class="entry-grid">
  <a class="entry-card entry-sim" href="sim/index.html">
    <div class="entry-k">SIMULATOR</div>
    <h3>STM32 시뮬레이터</h3>
    <p>CubeMX식 핀아웃·주변장치 설정, CubeIDE식 코드 편집기, 회로 노드 편집기와 실습 결과 화면을 한곳에 모았습니다.
    설치 없이 브라우저에서 HAL 코드를 빌드하고 실행합니다. 레슨마다 준비된 예제 프로젝트로 바로 열 수 있습니다.</p>
    <span class="entry-go">시뮬레이터 열기 &rarr;</span>
  </a>
  <a class="entry-card entry-ref" href="lessons/hal-reference.html">
    <div class="entry-k">REFERENCE</div>
    <h3>HAL API 레퍼런스</h3>
    <p>GPIO · EXTI · UART · TIM/PWM · ADC · I2C · SPI 모듈별 함수 원형, 인자 표, 반환값, 짧은 예제와
    레지스터 직접 접근 비교. 코드를 쓰다 막히면 여기서 찾아보세요.</p>
    <span class="entry-go">레퍼런스 보기 &rarr;</span>
  </a>
</section>

<section class="curriculum">
  <h2>커리큘럼</h2>
  {sections}
</section>

<footer class="site-foot">
  <p>STM32, STM32CubeMX, STM32CubeIDE, Nucleo 는 STMicroelectronics 의 상표입니다. 이 사이트는 교육용 비공식 자료이며,
  시뮬레이터는 실제 MCU 의 동작을 단순화해 흉내 냅니다. 실물 보드 배선·전원은 L16 의 안전 수칙을 꼭 지키세요.</p>
  <p class="foot-links">
    <a href="https://github.com/samcho93/studySTM32" target="_blank" rel="noopener">이 사이트 저장소</a>
    <a href="https://www.st.com/en/development-tools/stm32cubeide.html" target="_blank" rel="noopener">STM32CubeIDE</a>
    <a href="https://www.st.com/en/evaluation-tools/nucleo-f411re.html" target="_blank" rel="noopener">NUCLEO-F411RE</a>
  </p>
</footer>
""".format(total=total, first=first, first_no=first.upper(), nboards=len(BOARDS),
           ndev=len(DEVICE_TYPES), napi=len(SUPPORTED_HAL_API), sections="".join(sections))

    return PAGE.format(
        title="studySTM32 · STM32 HAL 인터랙티브 강좌",
        desc="CubeMX 핀 설정, HAL 코드, 브라우저 시뮬레이터, 실물 보드까지 — STM32를 한국어로 배우는 인터랙티브 강좌.",
        rel="", bodyclass="home", sidebar=sidebar_html(cur, None, ""),
        topbar=topbar_html("", "home"), content=hero)


# ---------------------------------------------------------------- build

def write_lf(path: Path, text: str) -> None:
    """Always write LF line endings (Path.write_text would emit CRLF on Windows)."""
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def load_curriculum() -> dict:
    data = json.loads((CONTENT / "curriculum.json").read_text(encoding="utf-8"))
    index, order = {}, []
    for track in data["tracks"]:
        for part in track["parts"]:
            for cid in part["chapters"]:
                info = data["chapters"][cid]
                info["track"] = track["id"]
                info["track_title"] = track["title"]
                info["part_no"] = part["no"]
                info["part_title"] = part["title"]
                index[cid] = info
                order.append(cid)
    data["index"] = index
    data["order"] = order
    return data


def check_links(pages: list) -> tuple:
    """생성된 HTML 의 상대 링크(href/src)가 실제 파일을 가리키는지 봅니다."""
    broken, pending_sim = [], set()
    for page in pages:
        text = page.read_text(encoding="utf-8")
        for m in re.finditer(r'(?:href|src)="([^"]+)"', text):
            url = html.unescape(m.group(1))
            if re.match(r"^(?:[a-z]+:|#|//)", url):
                continue
            path = unquote(url.split("#")[0].split("?")[0])
            if not path:
                continue
            target = (page.parent / path).resolve()
            if target.exists():
                continue
            rel = target.relative_to(ROOT).as_posix() if ROOT in target.parents else str(target)
            if rel.startswith("sim/"):
                pending_sim.add(rel)       # 시뮬레이터는 별도 작업 — 아직 없으면 알림만
            else:
                broken.append("%s -> %s" % (page.relative_to(ROOT).as_posix(), url))
    return broken, pending_sim


def main() -> int:
    cur = load_curriculum()
    examples = Examples(EXAMPLES_JS)
    LESSONS.mkdir(exist_ok=True)

    built, missing, problems, warnings = 0, [], list(examples.errors), []
    used_examples = set()
    pages = []
    for cid in cur["order"]:
        track = cur["index"][cid]["track"]
        src = CONTENT / track / (cid + ".md")
        if not src.exists():
            missing.append(cid)
            continue
        meta, body = split_front_matter(src.read_text(encoding="utf-8"))
        for key in ("id", "track", "title", "duration", "level", "requires", "tools"):
            if key not in meta:
                problems.append("%s: front matter '%s' 없음" % (cid, key))
        if meta.get("id") and meta["id"] != cid:
            problems.append("%s: front matter id 가 '%s'" % (cid, meta["id"]))
        if meta.get("track") and meta["track"] != track:
            problems.append("%s: front matter track 이 '%s' (curriculum: %s)" % (cid, meta["track"], track))
        for sec in REQUIRED_SECTIONS:
            if not re.search(r"^##\s+%s" % re.escape(sec), body, re.M):
                problems.append("%s: '## %s' 섹션 없음" % (cid, sec))
        if re.search(r"^##\s+실습 \(실물\)", body, re.M) and ":::safety" not in body:
            problems.append("%s: 실물 실습에 :::safety 블록 없음" % cid)
        page, r = lesson_page(cur, cid, meta, body, examples)
        for ex in r.sim_ids:
            used_examples.add(ex)
            if ex not in examples.items:
                problems.append("%s: @sim[%s] — examples.js 에 없는 예제" % (cid, ex))
        for ex, secs in r.code_refs:
            if ex not in examples.items:
                problems.append("%s: @code[%s] — examples.js 에 없는 예제" % (cid, ex))
            for s in secs:
                if s not in Examples.SECTIONS:
                    problems.append("%s: @code[%s] 알 수 없는 섹션 '%s'" % (cid, ex, s))
        if "sim" in _as_list(meta.get("tools")) and not r.sim_ids:
            problems.append("%s: tools 에 sim 이 있는데 @sim[...] 버튼이 없음" % cid)
        out = LESSONS / (cid + ".html")
        write_lf(out, page)
        pages.append(out)
        built += 1

    ref = cur["reference"]
    ref_src = CONTENT / ref["src"]
    if ref_src.exists():
        _, body = split_front_matter(ref_src.read_text(encoding="utf-8"))
        page, r = reference_page(cur, body, examples)
        for ex in r.sim_ids:
            used_examples.add(ex)
            if ex not in examples.items:
                problems.append("reference: @sim[%s] — examples.js 에 없는 예제" % ex)
        out = LESSONS / (ref["id"] + ".html")
        write_lf(out, page)
        pages.append(out)
    else:
        missing.append(ref["src"])

    for ex_id, info in examples.items.items():
        if info.get("lesson") and info["lesson"] not in cur["index"]:
            problems.append("examples.js %s: lesson '%s' 이 커리큘럼에 없음" % (ex_id, info["lesson"]))
        if ex_id not in used_examples:
            warnings.append("examples.js %s: 어느 레슨에서도 @sim 으로 열지 않음" % ex_id)

    index_path = ROOT / "index.html"
    write_lf(index_path, index_page(cur))
    pages.append(index_path)

    broken, pending_sim = check_links(pages)
    problems.extend("깨진 링크: " + b for b in broken)

    print("빌드 완료: 레슨 %d개 + HAL 레퍼런스 + index.html (예제 %d개)" % (built, len(examples.items)))
    if missing:
        print("원고 없음: %s" % ", ".join(missing))
    for w in warnings:
        print("알림:", w)
    if pending_sim:
        print("알림: 시뮬레이터 파일이 아직 없습니다 (별도 작업): %s" % ", ".join(sorted(pending_sim)))
    for p in problems:
        print("경고:", p)

    if "--check" in sys.argv:
        if missing or problems:
            print("검사 실패: 문제 %d건" % (len(missing) + len(problems)))
            return 1
        print("검사 통과")

    if "--serve" in sys.argv:
        import functools
        import http.server
        import socketserver

        class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
            extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                              ".wasm": "application/wasm", ".mjs": "text/javascript",
                              ".js": "text/javascript"}

            def end_headers(self):
                self.send_header("Cache-Control", "no-store, must-revalidate")
                super().end_headers()

            def log_message(self, fmt, *args):
                pass

        handler = functools.partial(NoCacheHandler, directory=str(ROOT))
        socketserver.TCPServer.allow_reuse_address = True
        with socketserver.TCPServer(("", 8000), handler) as httpd:
            print("미리보기: http://localhost:8000  (Ctrl+C 로 종료)")
            httpd.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
