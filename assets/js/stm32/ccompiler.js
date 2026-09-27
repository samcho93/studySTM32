/*
 * ccompiler.js — C 서브셋 → JavaScript(generator) 컴파일러 (studySTM32 시뮬레이터용)
 *
 * API (docs/SPEC.md 6장):
 *   STM32C.compile({ files, entry, env }) →
 *     성공: { ok: true, js, warnings, symbols: { globals, functions }, size: { text, data, bss } }
 *     실패: { ok: false, errors: [{ file, line, col, msg }], warnings }
 *   js 는 new Function('H', js)(H) 로 실행하면 { fns, globals } 를 돌려주는 함수 본문.
 *
 * 구조: 전처리기(토큰 기반) → 파서(재귀 하강, AST + 타입) → 주소 사용(&x) 사전 조사 → 타입 검사 겸 JS 생성.
 *
 * 계약(6.1) 해석 / 모호한 부분의 결정 사항:
 *  - 문자열 리터럴은 H.str("<JS 문자열>") 로 내보낸다. 런타임이 UTF-8 로 인코딩한다.
 *    따라서 "\xff" 처럼 0x80 이상의 \x/8진 이스케이프는 U+00FF 로 전달되어 UTF-8 2바이트가 된다(제한).
 *    sizeof("...") 와 char 배열 초기화는 컴파일러가 직접 UTF-8 바이트로 계산한다.
 *  - 구조체(사용자 struct / HAL 구조체 / 핸들)를 가리키는 포인터는 H.Ptr 가 아니라 그 객체 자체다
 *    (&s → 객체, p->f → p.f). 따라서 구조체 포인터의 산술(p++ 등)은 지원하지 않는다.
 *    구조체 배열이 포인터로 쓰이면 첫 원소 객체(arr[0])가 되고, &arr[i] 는 arr[i] 객체다.
 *  - 포인터 캐스트((uint8_t*)&x 등)는 값 변환 없이 같은 Ptr 을 쓴다(바이트 재해석 없음).
 *  - 스칼라 구조체 필드의 주소(&s.x)는 지원하지 않는다(컴파일 오류).
 *  - 사용자 함수의 인자/반환 구조체는 값 복사(__clone). HAL 구조체·핸들은 참조 그대로.
 *  - 비교 결과(==, <, && …)는 조건 안에서는 JS boolean 그대로, 값으로 쓰일 때 (x?1:0).
 *  - 정수 산술 중간값도 C 처럼 32비트로 자른다(i32: |0, Math.imul / u32: >>>0).
 *    64비트 정수는 double 로 계산한다(정확한 랩어라운드 없음).
 *  - HAL 구조체·핸들·주변장치 객체의 멤버는 타입이 없는 값(any)으로 취급하고, 산술에서는 u32 로 본다.
 *    any 멤버에 대한 복합 대입은 JS 복합 대입(H.o.GPIOA.ODR ^= …)을 그대로 쓴다.
 *  - 배열 원소 단순 대입은 typed array 가 자르므로 자르기 코드를 넣지 않는다. 다만 ++/--/복합 대입의 결과를
 *    값으로 쓰는 경우에는 올바른 값을 위해 자르기를 넣는다.
 *  - 전역 변수 globals() 에는 사용자 전역 + static 지역('함수명.변수명' 키)을 넣는다. 핸들·HAL 구조체는 제외.
 *  - #include "x.h" 에서 프로젝트에 없는 파일(stm32f4xx_hal.h 등)은 조용히 무시한다.
 *  - 원형만 있고 정의가 없는 함수를 호출하면(런타임 함수도 아니면) 링크 오류(undefined reference)로 처리.
 *  - 생성 코드는 모듈 상단에 작은 도우미(__ta, __fa, __clone, __mk_<tag>)를 둔다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.STM32C = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- 오류
  function CErr(tok, msg) {
    this.cerr = true;
    this.file = tok ? tok.file : '';
    this.line = tok ? tok.line : 0;
    this.col = tok ? tok.col : 0;
    this.msg = msg;
  }
  function fail(tok, msg) { throw new CErr(tok, msg); }

  // ---------------------------------------------------------------- 토크나이저
  const PUNCS = ['<<=', '>>=', '...', '->', '++', '--', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||',
    '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '##',
    '[', ']', '(', ')', '{', '}', '.', '&', '*', '+', '-', '~', '!', '/', '%', '<', '>', '^', '|', '?', ':', ';', '=', ',', '#'];
  const ID_START = /[A-Za-z_]/, ID_CHAR = /[A-Za-z0-9_]/;

  function lex(src, file) {
    const toks = [];
    let i = 0, line = 1, col = 1, bol = true;
    const n = src.length;
    while (i < n) {
      const c = src[i];
      if (c === '\n') { i++; line++; col = 1; bol = true; continue; }
      if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === '﻿') { i++; col++; continue; }
      if (c === '\\' && (src[i + 1] === '\n' || (src[i + 1] === '\r' && src[i + 2] === '\n'))) {
        i += src[i + 1] === '\n' ? 2 : 3; line++; col = 1; continue;
      }
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') {
        const st = { file, line, col };
        i += 2; col += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
          if (src[i] === '\n') { line++; col = 1; } else col++;
          i++;
        }
        if (i >= n) fail(st, '주석이 닫히지 않았습니다 (unterminated comment)');
        i += 2; col += 2; continue;
      }
      const tok = { t: null, v: null, file, line, col, bol };
      bol = false;
      let j = i;
      if (ID_START.test(c)) {
        while (j < n && ID_CHAR.test(src[j])) j++;
        // 접두어가 붙은 문자열/문자 리터럴 (u8"..", L'..') — 접두어는 무시
        const w = src.slice(i, j);
        if ((w === 'L' || w === 'u8' || w === 'u' || w === 'U') && (src[j] === '"' || src[j] === "'")) { i = j; col += w.length; tok.col = col; }
        else { tok.t = 'id'; tok.v = w; }
      }
      if (!tok.t && (/[0-9]/.test(src[i]) || (src[i] === '.' && /[0-9]/.test(src[i + 1] || '')))) {
        j = i;
        const hex = /^0[xX]/.test(src.slice(i, i + 2));
        while (j < n && (/[0-9A-Za-z_.]/.test(src[j]) ||
          ((src[j] === '+' || src[j] === '-') && (hex ? /[pP]/.test(src[j - 1]) : /[eE]/.test(src[j - 1]))))) j++;
        tok.t = 'num'; tok.v = src.slice(i, j);
      }
      if (!tok.t && (src[i] === '"' || src[i] === "'")) {
        const q = src[i];
        j = i + 1;
        while (j < n && src[j] !== q) {
          if (src[j] === '\\') j++;
          if (src[j] === '\n' || j >= n) fail(tok, q === '"' ? '문자열이 닫히지 않았습니다 (missing terminating " character)'
            : "문자 상수가 닫히지 않았습니다 (missing terminating ' character)");
          j++;
        }
        if (j >= n) fail(tok, '리터럴이 닫히지 않았습니다 (missing terminating quote)');
        tok.t = q === '"' ? 'str' : 'chr';
        tok.v = src.slice(i + 1, j);
        j++;
      }
      if (!tok.t) {
        for (const p of PUNCS) {
          if (src.startsWith(p, i)) { tok.t = 'punc'; tok.v = p; j = i + p.length; break; }
        }
      }
      if (!tok.t) fail(tok, "프로그램에 잘못된 문자 '" + c + "' 이(가) 있습니다 (stray '" + c + "' in program)");
      col += j - i; i = j;
      toks.push(tok);
    }
    return toks;
  }

  // ---------------------------------------------------------------- 리터럴 해석
  function parseNumber(raw, tok) {
    let s = raw;
    const isHex = /^0[xX]/.test(s);
    const isFloat = !isHex ? /[.eE]/.test(s) : /[.pP]/.test(s);
    if (isFloat) {
      let isF = false;
      if (/[fF]$/.test(s)) { isF = true; s = s.slice(0, -1); }
      else if (/[lL]$/.test(s)) s = s.slice(0, -1);
      const v = isHex ? parseHexFloat(s) : Number(s);
      if (!isFinite(v) && !/inf/i.test(s)) fail(tok, "잘못된 실수 상수 '" + raw + "' (invalid floating constant)");
      return { v, kind: isF ? 'float' : 'double' };
    }
    const m = /^(.*?)([uUlL]*)$/.exec(s);
    const body = m[1], suf = m[2].toLowerCase();
    let v;
    if (/^0[xX][0-9a-fA-F]+$/.test(body)) v = parseInt(body.slice(2), 16);
    else if (/^0[bB][01]+$/.test(body)) v = parseInt(body.slice(2), 2);
    else if (/^0[0-7]*$/.test(body)) v = body.length > 1 ? parseInt(body.slice(1), 8) : 0;
    else if (/^[1-9][0-9]*$/.test(body)) v = parseInt(body, 10);
    else fail(tok, "잘못된 정수 상수 '" + raw + "' (invalid suffix or digits on integer constant)");
    const unsigned = suf.indexOf('u') >= 0;
    const ll = suf.indexOf('ll') >= 0;
    const decimal = /^[1-9]/.test(body);
    let kind;
    if (ll) kind = unsigned ? 'u64' : 'i64';
    else if (unsigned) kind = v > 0xFFFFFFFF ? 'u64' : 'u32';
    else if (v <= 0x7FFFFFFF) kind = 'i32';
    else if (!decimal && v <= 0xFFFFFFFF) kind = 'u32';
    else kind = 'i64';
    return { v, kind };
  }
  function parseHexFloat(s) {
    const m = /^0[xX]([0-9a-fA-F]*)\.?([0-9a-fA-F]*)[pP]([+-]?\d+)$/.exec(s);
    if (!m) return NaN;
    let v = parseInt(m[1] || '0', 16);
    for (let k = 0; k < m[2].length; k++) v += parseInt(m[2][k], 16) / Math.pow(16, k + 1);
    return v * Math.pow(2, parseInt(m[3], 10));
  }

  // C 이스케이프 해석 → 코드포인트 배열
  function decodeEscapes(raw, tok) {
    const out = [];
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c !== '\\') { const cp = raw.codePointAt(i); out.push(cp); if (cp > 0xFFFF) i++; continue; }
      const e = raw[++i];
      switch (e) {
        case 'n': out.push(10); break;
        case 't': out.push(9); break;
        case 'r': out.push(13); break;
        case '0': case '1': case '2': case '3': case '4': case '5': case '6': case '7': {
          let k = i, s = '';
          while (k < raw.length && s.length < 3 && /[0-7]/.test(raw[k])) s += raw[k++];
          out.push(parseInt(s, 8) & 255); i = k - 1; break;
        }
        case 'x': {
          let k = i + 1, s = '';
          while (k < raw.length && /[0-9a-fA-F]/.test(raw[k])) s += raw[k++];
          if (!s) fail(tok, '\\x 뒤에 16진 숫자가 없습니다 (\\x used with no following hex digits)');
          out.push(parseInt(s, 16) & 255); i = k - 1; break;
        }
        case 'a': out.push(7); break;
        case 'b': out.push(8); break;
        case 'f': out.push(12); break;
        case 'v': out.push(11); break;
        case 'e': out.push(27); break;
        case '\\': out.push(92); break;
        case "'": out.push(39); break;
        case '"': out.push(34); break;
        case '?': out.push(63); break;
        default: out.push(e.codePointAt(0));
      }
    }
    return out;
  }
  function utf8(cps) {
    const b = [];
    for (const cp of cps) {
      if (cp < 0x80) b.push(cp);
      else if (cp < 0x800) b.push(0xC0 | (cp >> 6), 0x80 | (cp & 63));
      else if (cp < 0x10000) b.push(0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      else b.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    }
    return b;
  }
  function charValue(raw, tok) {
    const cps = decodeEscapes(raw, tok);
    if (!cps.length) fail(tok, "빈 문자 상수입니다 (empty character constant)");
    if (cps.length === 1) { const b = utf8(cps); return b.length === 1 ? b[0] : b[b.length - 1]; }
    let v = 0;
    for (const cp of cps) v = ((v << 8) | (cp & 255)) | 0;
    return v;
  }

  // ---------------------------------------------------------------- 전처리기
  function basename(p) { return String(p).replace(/\\/g, '/').split('/').pop(); }

  function preprocess(files, entry) {
    const byBase = {};
    for (const k of Object.keys(files)) byBase[basename(k)] = k;
    const macros = new Map();
    const once = new Set();
    const warnings = [];

    function lineOf(toks, i) { // i 부터 같은 줄(다음 bol 전)까지
      let j = i + 1;
      while (j < toks.length && !toks[j].bol) j++;
      return j;
    }

    function processFile(path, depth, incTok) {
      if (depth > 24) fail(incTok, '#include 중첩이 너무 깊습니다 (#include nested too deeply)');
      const toks = lex(files[path], path);
      const out = [];
      let pending = [];
      const cond = []; // {active, taken, parent}
      const active = () => cond.length === 0 || cond[cond.length - 1].active;
      const flush = () => { if (pending.length) { for (const t of expand(pending, macros)) out.push(t); pending = []; } };
      let i = 0;
      while (i < toks.length) {
        const t = toks[i];
        if (t.bol && t.t === 'punc' && t.v === '#') {
          const end = lineOf(toks, i);
          const d = toks.slice(i + 1, end);
          i = end;
          const name = d.length ? d[0].v : '';
          const rest = d.slice(1);
          if (name === 'ifdef' || name === 'ifndef') {
            const on = active();
            const def = rest.length && macros.has(rest[0].v);
            const v = name === 'ifdef' ? def : !def;
            cond.push({ active: on && v, taken: v, parent: on });
            continue;
          }
          if (name === 'if') {
            const on = active();
            const v = on ? !!ppEval(rest, macros, d[0]) : false;
            cond.push({ active: on && v, taken: v, parent: on });
            continue;
          }
          if (name === 'elif') {
            const c = cond[cond.length - 1];
            if (!c) fail(d[0], '#if 없는 #elif (#elif without #if)');
            if (c.taken || !c.parent) c.active = false;
            else { const v = !!ppEval(rest, macros, d[0]); c.active = v; c.taken = v; }
            continue;
          }
          if (name === 'else') {
            const c = cond[cond.length - 1];
            if (!c) fail(d[0], '#if 없는 #else (#else without #if)');
            c.active = c.parent && !c.taken; c.taken = true;
            continue;
          }
          if (name === 'endif') {
            if (!cond.length) fail(d[0], '#if 없는 #endif (#endif without #if)');
            cond.pop(); continue;
          }
          if (!active()) continue;
          if (name === 'define') {
            flush();
            const nt = rest[0];
            if (!nt || nt.t !== 'id') fail(d[0] || t, '매크로 이름이 필요합니다 (macro names must be identifiers)');
            const m = { fn: false, params: [], body: [], variadic: false };
            let k = 1;
            const nx = rest[1];
            if (nx && nx.t === 'punc' && nx.v === '(' && nx.line === nt.line && nx.col === nt.col + nt.v.length) {
              m.fn = true; k = 2;
              while (k < rest.length && rest[k].v !== ')') {
                if (rest[k].v === '...') m.variadic = true;
                else if (rest[k].t === 'id') m.params.push(rest[k].v);
                k++;
              }
              k++;
            }
            m.body = rest.slice(k);
            macros.set(nt.v, m);
            continue;
          }
          if (name === 'undef') { flush(); if (rest[0]) macros.delete(rest[0].v); continue; }
          if (name === 'include') {
            flush();
            if (rest[0] && rest[0].t === 'str') {
              const b = basename(rest[0].v);
              const p = byBase[b];
              if (p && !once.has(p)) for (const x of processFile(p, depth + 1, rest[0])) out.push(x);
            }
            continue;
          }
          if (name === 'pragma') { if (rest[0] && rest[0].v === 'once') once.add(path); continue; }
          if (name === 'error') fail(d[0], '#error ' + rest.map(x => x.v).join(' '));
          continue; // #warning, #line 등은 무시
        }
        if (active()) pending.push(t);
        i++;
      }
      if (cond.length) fail(toks[toks.length - 1] || { file: path, line: 1, col: 1 }, '#endif 가 없습니다 (unterminated conditional directive)');
      flush();
      return out;
    }

    if (!(entry in files)) fail({ file: entry, line: 1, col: 1 }, "'" + entry + "' 파일이 없습니다 (No such file or directory)");
    const toks = processFile(entry, 0, null);
    const last = toks[toks.length - 1];
    toks.push({ t: 'eof', v: '<EOF>', file: entry, line: last ? last.line : 1, col: last ? last.col + 1 : 1 });
    return { toks, warnings };
  }

  function relex(text, at) {
    let ts;
    try { ts = lex(text, at.file); } catch (e) { ts = [{ t: 'id', v: text }]; }
    return ts.map(x => Object.assign({}, x, { file: at.file, line: at.line, col: at.col, bol: false }));
  }

  function expand(toks, macros) {
    const out = [];
    const stack = toks.slice().reverse();
    while (stack.length) {
      const t = stack.pop();
      if (t.t !== 'id' || !macros.has(t.v) || (t.hide && t.hide.has(t.v))) { out.push(t); continue; }
      const m = macros.get(t.v);
      const hs = new Set(t.hide || []);
      hs.add(t.v);
      const place = (x) => Object.assign({}, x, { file: t.file, line: t.line, col: t.col, bol: false, hide: hs });
      if (!m.fn) {
        const body = m.body.map(place);
        for (let k = body.length - 1; k >= 0; k--) stack.push(body[k]);
        continue;
      }
      const nx = stack[stack.length - 1];
      if (!nx || nx.t !== 'punc' || nx.v !== '(') { out.push(t); continue; }
      stack.pop();
      const args = [[]];
      let depth = 0;
      for (;;) {
        if (!stack.length) fail(t, "매크로 '" + t.v + "' 호출이 닫히지 않았습니다 (unterminated argument list invoking macro)");
        const a = stack.pop();
        if (a.t === 'punc' && a.v === '(') depth++;
        else if (a.t === 'punc' && a.v === ')') { if (depth === 0) break; depth--; }
        else if (a.t === 'punc' && a.v === ',' && depth === 0 && !(m.variadic && args.length === m.params.length + 1)) { args.push([]); continue; }
        args[args.length - 1].push(a);
      }
      if (m.params.length === 0 && !m.variadic && args.length === 1 && args[0].length === 0) args.length = 0;
      if (m.variadic && args.length === m.params.length) args.push([]);
      const need = m.params.length + (m.variadic ? 1 : 0);
      if (args.length !== need && !(m.variadic && args.length >= need)) {
        fail(t, "매크로 '" + t.v + "' 의 인자 개수가 맞지 않습니다 (macro \"" + t.v + '" requires ' + need + ' arguments, but ' + args.length + ' given)');
      }
      const pIndex = (name) => name === '__VA_ARGS__' && m.variadic ? m.params.length : m.params.indexOf(name);
      const res = [];
      const body = m.body;
      for (let k = 0; k < body.length; k++) {
        const b = body[k];
        if (b.t === 'punc' && b.v === '#' && body[k + 1] && pIndex(body[k + 1].v) >= 0) {
          const a = args[pIndex(body[k + 1].v)];
          res.push(place({ t: 'str', v: a.map(x => x.t === 'str' ? '"' + x.v + '"' : x.v).join(' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"') }));
          k++; continue;
        }
        if (b.t === 'punc' && b.v === '##' && res.length && body[k + 1]) {
          const prev = res.pop();
          const nb = body[k + 1];
          let right = [nb];
          if (nb.t === 'id' && pIndex(nb.v) >= 0) right = args[pIndex(nb.v)].slice();
          const first = right.shift();
          const text = (prev.t === 'str' ? '"' + prev.v + '"' : prev.v) + (first ? (first.t === 'str' ? '"' + first.v + '"' : first.v) : '');
          for (const x of relex(text, t)) res.push(place(x));
          for (const x of right) res.push(place(x));
          k++; continue;
        }
        if (b.t === 'id' && pIndex(b.v) >= 0) {
          const nextIsPaste = body[k + 1] && body[k + 1].v === '##';
          const a = args[pIndex(b.v)];
          const ex = nextIsPaste ? a : expand(a, macros);
          for (const x of ex) res.push(place(x));
          continue;
        }
        res.push(place(b));
      }
      for (let k = res.length - 1; k >= 0; k--) stack.push(res[k]);
    }
    return out;
  }

  const PP_PREC = { '*': 10, '/': 10, '%': 10, '+': 9, '-': 9, '<<': 8, '>>': 8, '<': 7, '>': 7, '<=': 7, '>=': 7,
    '==': 6, '!=': 6, '&': 5, '^': 4, '|': 3, '&&': 2, '||': 1 };
  function ppEval(toks, macros, at) {
    const t1 = [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.t === 'id' && t.v === 'defined') {
        let name;
        if (toks[i + 1] && toks[i + 1].v === '(') { name = toks[i + 2] && toks[i + 2].v; i += 3; }
        else { name = toks[i + 1] && toks[i + 1].v; i += 1; }
        t1.push(Object.assign({}, t, { t: 'num', v: macros.has(name) ? '1' : '0' }));
      } else t1.push(t);
    }
    const ts = expand(t1, macros);
    let p = 0;
    function unary() {
      const t = ts[p];
      if (!t) return 0;
      if (t.t === 'punc') {
        if (t.v === '(') { p++; const v = tern(); p++; return v; }
        if (t.v === '!') { p++; return unary() ? 0 : 1; }
        if (t.v === '-') { p++; return -unary(); }
        if (t.v === '+') { p++; return unary(); }
        if (t.v === '~') { p++; return ~unary(); }
      }
      p++;
      if (t.t === 'num') { try { return parseNumber(t.v, t).v; } catch (e) { return 0; } }
      if (t.t === 'chr') return charValue(t.v, t);
      return 0;
    }
    function bin(minP) {
      let l = unary();
      for (;;) {
        const t = ts[p];
        const pr = t && t.t === 'punc' ? PP_PREC[t.v] : undefined;
        if (pr === undefined || pr < minP) return l;
        p++;
        const r = bin(pr + 1);
        switch (t.v) {
          case '*': l = l * r; break; case '/': l = r ? Math.trunc(l / r) : 0; break; case '%': l = r ? l % r : 0; break;
          case '+': l = l + r; break; case '-': l = l - r; break; case '<<': l = l << r; break; case '>>': l = l >> r; break;
          case '<': l = +(l < r); break; case '>': l = +(l > r); break; case '<=': l = +(l <= r); break; case '>=': l = +(l >= r); break;
          case '==': l = +(l === r); break; case '!=': l = +(l !== r); break; case '&': l = l & r; break; case '^': l = l ^ r; break;
          case '|': l = l | r; break; case '&&': l = +(l && r); break; case '||': l = +(l || r); break;
        }
      }
    }
    function tern() {
      const c = bin(1);
      if (ts[p] && ts[p].v === '?') { p++; const a = tern(); p++; const b = tern(); return c ? a : b; }
      return c;
    }
    return tern();
  }

  // ---------------------------------------------------------------- 타입
  function mkInt(n, sz, sg, disp) { return { k: 'int', n, sz, sg, disp }; }
  const TY = {
    u8: mkInt('u8', 1, false, 'uint8_t'), i8: mkInt('i8', 1, true, 'int8_t'),
    u16: mkInt('u16', 2, false, 'uint16_t'), i16: mkInt('i16', 2, true, 'int16_t'),
    u32: mkInt('u32', 4, false, 'uint32_t'), i32: mkInt('i32', 4, true, 'int'),
    u64: mkInt('u64', 8, false, 'uint64_t'), i64: mkInt('i64', 8, true, 'int64_t'),
    bool: mkInt('bool', 1, false, 'bool'),
    float: { k: 'float', sz: 4, disp: 'float' }, double: { k: 'double', sz: 8, disp: 'double' },
    void: { k: 'void', disp: 'void' }, any: { k: 'any', disp: 'unknown' }, obj: { k: 'obj', disp: 'peripheral' }
  };
  const CHAR = Object.assign({}, TY.u8, { disp: 'char' });
  function withDisp(t, d) { return (t.k === 'int' || t.k === 'float' || t.k === 'double') ? Object.assign({}, t, { disp: d }) : t; }
  function ptrT(t) { return { k: 'ptr', to: t }; }
  function arrT(t, n) { return { k: 'arr', of: t, n }; }
  const BUILTIN_TYPEDEFS = {
    uint8_t: TY.u8, int8_t: TY.i8, uint16_t: TY.u16, int16_t: TY.i16, uint32_t: TY.u32, int32_t: TY.i32,
    uint64_t: TY.u64, int64_t: TY.i64, size_t: withDisp(TY.u32, 'size_t'), ssize_t: withDisp(TY.i32, 'ssize_t'),
    uintptr_t: withDisp(TY.u32, 'uintptr_t'), intptr_t: withDisp(TY.i32, 'intptr_t'), bool: TY.bool,
    float32_t: withDisp(TY.float, 'float32_t'), float64_t: withDisp(TY.double, 'float64_t'),
    HAL_StatusTypeDef: withDisp(TY.i32, 'HAL_StatusTypeDef'), GPIO_PinState: withDisp(TY.i32, 'GPIO_PinState'),
    IRQn_Type: withDisp(TY.i32, 'IRQn_Type'), FlagStatus: withDisp(TY.i32, 'FlagStatus'), ITStatus: withDisp(TY.i32, 'ITStatus'),
    FunctionalState: withDisp(TY.i32, 'FunctionalState'), ErrorStatus: withDisp(TY.i32, 'ErrorStatus'),
    HAL_LockTypeDef: withDisp(TY.i32, 'HAL_LockTypeDef'), HAL_TickFreqTypeDef: withDisp(TY.i32, 'HAL_TickFreqTypeDef')
  };
  const isInt = t => t.k === 'int';
  const isFlt = t => t.k === 'float' || t.k === 'double';
  const isArith = t => t.k === 'int' || t.k === 'float' || t.k === 'double' || t.k === 'any';

  function typeStr(t) {
    if (!t) return '?';
    switch (t.k) {
      case 'ptr': return typeStr(t.to) + ' *';
      case 'arr': return typeStr(t.of) + '[' + (t.n == null ? '' : t.n) + ']';
      case 'struct': return t.disp || ('struct ' + t.tag);
      case 'hal': return t.name;
      case 'fn': return typeStr(t.ret) + ' (' + t.params.map(p => typeStr(p.type)).join(', ') + ')';
      default: return t.disp || t.k;
    }
  }
  function sizeOf(t) {
    switch (t.k) {
      case 'int': return t.sz;
      case 'float': return 4;
      case 'double': return 8;
      case 'ptr': return 4;
      case 'arr': return (t.n || 0) * sizeOf(t.of);
      case 'struct': return t.fields.reduce((s, f) => s + sizeOf(f.type), 0);
      case 'void': return 1;
      default: return 4;
    }
  }
  function truncConst(v, t) {
    if (t.k === 'float') return Math.fround(v);
    if (t.k !== 'int') return v;
    v = Math.trunc(v);
    switch (t.n) {
      case 'u8': return v & 255;
      case 'i8': return (v << 24) >> 24;
      case 'u16': return v & 65535;
      case 'i16': return (v << 16) >> 16;
      case 'i32': return v | 0;
      case 'u32': return v >>> 0;
      case 'bool': return v ? 1 : 0;
      default: return v;
    }
  }
  function wrapCode(c, t) {
    if (t.k === 'float') return 'Math.fround(' + c + ')';
    if (t.k !== 'int') return c;
    switch (t.n) {
      case 'u8': return '((' + c + ') & 255)';
      case 'i8': return '((' + c + ') << 24 >> 24)';
      case 'u16': return '((' + c + ') & 65535)';
      case 'i16': return '((' + c + ') << 16 >> 16)';
      case 'i32': return '((' + c + ') | 0)';
      case 'u32': return '((' + c + ') >>> 0)';
      case 'bool': return '((' + c + ') ? 1 : 0)';
      default: return 'Math.trunc(' + c + ')';
    }
  }
  function ctorOf(t) {
    if (t.k === 'int') return { u8: 'Uint8Array', bool: 'Uint8Array', i8: 'Int8Array', u16: 'Uint16Array', i16: 'Int16Array',
      i32: 'Int32Array', u32: 'Uint32Array', i64: 'Float64Array', u64: 'Float64Array' }[t.n];
    if (t.k === 'float') return 'Float32Array';
    if (t.k === 'double') return 'Float64Array';
    return null;
  }
  // from 의 모든 값이 to 에 그대로 들어가는가
  const FITS = {
    bool: ['bool', 'u8', 'i8', 'u16', 'i16', 'i32', 'u32', 'i64', 'u64'], u8: ['u8', 'u16', 'i16', 'i32', 'u32', 'i64', 'u64'],
    i8: ['i8', 'i16', 'i32', 'i64'], u16: ['u16', 'i32', 'u32', 'i64', 'u64'], i16: ['i16', 'i32', 'i64'],
    i32: ['i32', 'i64'], u32: ['u32', 'i64', 'u64'], i64: ['i64'], u64: ['u64']
  };
  function fitsInt(from, to) { return !!FITS[from.n] && FITS[from.n].indexOf(to.n) >= 0; }
  function promote(t) {
    if (t.k === 'any') return TY.u32;
    if (t.k !== 'int') return t;
    if (t.n === 'u32') return TY.u32;
    if (t.n === 'i64' || t.n === 'u64') return TY.i64;
    return TY.i32;
  }
  function arithConv(a, b) {
    if (a.k === 'double' || b.k === 'double') return TY.double;
    if (a.k === 'float' || b.k === 'float') return TY.float;
    const pa = promote(a), pb = promote(b);
    if (pa.n === 'i64' || pb.n === 'i64') return TY.i64;
    if (pa.n === 'u32' || pb.n === 'u32') return TY.u32;
    return TY.i32;
  }

  // ---------------------------------------------------------------- 파서
  const TYPE_KW = new Set(['void', 'char', 'short', 'int', 'long', 'float', 'double', 'signed', 'unsigned', '_Bool',
    'struct', 'enum', 'union', 'const', 'volatile', 'static', 'extern', 'register', 'inline', 'typedef', 'auto',
    '__IO', '__I', '__O', '__weak', '__inline', '__STATIC_INLINE', 'restrict', '__restrict', '__attribute__', '__packed',
    '__NO_RETURN', '__volatile__', '__INLINE']);
  const QUAL_KW = new Set(['const', 'volatile', 'register', 'inline', 'auto', '__IO', '__I', '__O', '__weak', '__inline',
    '__STATIC_INLINE', 'restrict', '__restrict', '__packed', '__NO_RETURN', '__volatile__', '__INLINE']);
  const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=']);
  const BIN_PREC = PP_PREC;
  const STMT_KW = new Set(['if', 'else', 'while', 'do', 'for', 'switch', 'case', 'default', 'break', 'continue', 'return', 'goto', 'sizeof']);

  function tokDesc(t) { return t.t === 'eof' ? 'end of input' : t.t === 'str' ? '"' + t.v + '"' : t.t === 'chr' ? "'" + t.v + "'" : t.v; }

  function Parser(toks, env, halTypes) {
    this.toks = toks; this.p = 0; this.env = env; this.halTypes = halTypes;
    this.typedefs = new Map(); this.structs = new Map(); this.structList = [];
    this.enumConsts = new Map(); this.anon = 0;
  }
  const P = Parser.prototype;
  P.peek = function (k) { return this.toks[Math.min(this.p + (k || 0), this.toks.length - 1)]; };
  P.next = function () { const t = this.toks[this.p]; if (this.p < this.toks.length - 1) this.p++; return t; };
  P.is = function (v, k) { const t = this.peek(k); return (t.t === 'punc' || t.t === 'id') && t.v === v; };
  P.accept = function (v) { if (this.is(v)) { return this.next(); } return null; };
  P.expect = function (v) {
    if (this.is(v)) return this.next();
    const cur = this.peek();
    const prev = this.p > 0 ? this.toks[this.p - 1] : null;
    const at = prev && (cur.t === 'eof' || prev.line < cur.line || prev.file !== cur.file) && (v === ';' || v === ')' || v === ']' || v === '}') ? prev : cur;
    fail(at, "'" + v + "' 이(가) 필요합니다 (expected '" + v + "' before '" + tokDesc(cur) + "')");
  };
  P.isTypeName = function (t) {
    if (!t || t.t !== 'id') return false;
    const v = t.v;
    return TYPE_KW.has(v) || this.typedefs.has(v) || Object.prototype.hasOwnProperty.call(BUILTIN_TYPEDEFS, v) ||
      this.halTypes.has(v) || /^[A-Za-z0-9]+_TypeDef$/.test(v);
  };
  P.skipAttribute = function () {
    this.next();
    if (!this.is('(')) return;
    let d = 0;
    do { const t = this.next(); if (t.v === '(') d++; else if (t.v === ')') d--; if (t.t === 'eof') break; } while (d > 0);
  };

  P.parseSpecs = function () {
    const st = { static: false, extern: false, typedef: false };
    let isConst = false, sgn = null, shortC = 0, longC = 0, base = null, named = null, any = false;
    const start = this.peek();
    for (;;) {
      const t = this.peek();
      if (t.t !== 'id') break;
      const v = t.v;
      if (v === '__attribute__') { this.skipAttribute(); continue; }
      if (v === 'const') { isConst = true; this.next(); continue; }
      if (QUAL_KW.has(v)) { this.next(); continue; }
      if (v === 'static' || v === 'extern' || v === 'typedef') { st[v] = true; this.next(); continue; }
      if (v === 'signed' || v === 'unsigned') { sgn = v; this.next(); any = true; continue; }
      if (v === 'short') { shortC++; this.next(); any = true; continue; }
      if (v === 'long') { longC++; this.next(); any = true; continue; }
      if (v === 'void' || v === 'char' || v === 'int' || v === 'float' || v === 'double' || v === '_Bool') {
        if (base && !(base === 'int' || v === 'int')) fail(t, '타입 지정이 중복되었습니다 (two or more data types in declaration specifiers)');
        if (!base || base === 'int') base = v;
        this.next(); any = true; continue;
      }
      if (v === 'struct' || v === 'union' || v === 'enum') { named = this.parseTagged(); any = true; continue; }
      if (!base && !named && !shortC && !longC && !sgn) {
        if (this.typedefs.has(v)) { named = this.typedefs.get(v); this.next(); any = true; continue; }
        if (Object.prototype.hasOwnProperty.call(BUILTIN_TYPEDEFS, v)) { named = BUILTIN_TYPEDEFS[v]; this.next(); any = true; continue; }
        if (this.halTypes.has(v) || /^[A-Za-z0-9]+_TypeDef$/.test(v)) { named = { k: 'hal', name: v }; this.next(); any = true; continue; }
      }
      break;
    }
    let type;
    if (named) type = named;
    else if (base === 'void') type = TY.void;
    else if (base === 'char') type = sgn === 'signed' ? Object.assign({}, TY.i8, { disp: 'signed char' }) : sgn === 'unsigned' ? Object.assign({}, TY.u8, { disp: 'unsigned char' }) : CHAR;
    else if (base === 'float') type = TY.float;
    else if (base === 'double') type = TY.double;
    else if (base === '_Bool') type = TY.bool;
    else if (shortC) type = sgn === 'unsigned' ? Object.assign({}, TY.u16, { disp: 'unsigned short' }) : Object.assign({}, TY.i16, { disp: 'short' });
    else if (longC >= 2) type = sgn === 'unsigned' ? Object.assign({}, TY.u64, { disp: 'unsigned long long' }) : Object.assign({}, TY.i64, { disp: 'long long' });
    else if (base === 'int' || sgn || longC) {
      type = Object.assign({}, sgn === 'unsigned' ? TY.u32 : TY.i32, { disp: (sgn === 'unsigned' ? 'unsigned ' : '') + (longC ? 'long' : 'int') });
    } else if (any || isConst || st.static || st.extern) type = TY.i32;
    else fail(start, "타입 이름이 필요합니다 (expected declaration specifiers before '" + tokDesc(start) + "')");
    return { type, st, isConst };
  };

  P.parseTagged = function () {
    const kw = this.next();
    if (kw.v === 'union') fail(kw, 'union 은 지원하지 않습니다 (unsupported: union)');
    let tagTok = null;
    if (this.peek().t === 'id' && !this.is('{')) tagTok = this.next();
    while (this.is('__attribute__')) this.skipAttribute();
    if (kw.v === 'enum') {
      if (this.accept('{')) {
        let val = 0;
        while (!this.accept('}')) {
          const nt = this.next();
          if (nt.t !== 'id') fail(nt, "열거 상수 이름이 필요합니다 (expected identifier before '" + tokDesc(nt) + "')");
          if (this.accept('=')) {
            const e = this.parseAssign();
            const v = this.constEval(e);
            if (v === undefined) fail(nt, '열거 값이 상수가 아닙니다 (enumerator value is not an integer constant)');
            val = v;
          }
          this.enumConsts.set(nt.v, val | 0);
          val = (val + 1) | 0;
          if (!this.accept(',')) { this.expect('}'); break; }
        }
      }
      return Object.assign({}, TY.i32, { disp: 'enum' + (tagTok ? ' ' + tagTok.v : '') });
    }
    let st = tagTok ? this.structs.get(tagTok.v) : null;
    if (this.accept('{')) {
      if (!st || st.complete) {
        st = { k: 'struct', tag: tagTok ? tagTok.v : '__anon' + (++this.anon), fields: [], complete: false, disp: tagTok ? 'struct ' + tagTok.v : 'struct <anonymous>' };
        if (tagTok) this.structs.set(tagTok.v, st);
        this.structList.push(st);
      }
      while (!this.accept('}')) {
        if (this.peek().t === 'eof') this.expect('}');
        const sp = this.parseSpecs();
        if (this.accept(';')) continue;
        for (;;) {
          const d = this.parseDeclarator(sp.type, false);
          if (this.is(':')) fail(this.peek(), '비트필드는 지원하지 않습니다 (unsupported: bit-field)');
          if (st.fields.some(f => f.name === d.name)) fail(d.tok, "'" + d.name + "' 멤버가 중복되었습니다 (duplicate member '" + d.name + "')");
          if (d.type.k === 'arr' && d.type.n == null) fail(d.tok, '구조체 멤버 배열의 크기가 필요합니다 (flexible array member not supported)');
          st.fields.push({ name: d.name, type: d.type });
          if (!this.accept(',')) break;
        }
        this.expect(';');
      }
      st.complete = true;
      return st;
    }
    if (!tagTok) fail(kw, "구조체 이름이 필요합니다 (expected '{' or identifier)");
    if (!st) {
      st = { k: 'struct', tag: tagTok.v, fields: [], complete: false, disp: 'struct ' + tagTok.v };
      this.structs.set(tagTok.v, st);
      this.structList.push(st);
    }
    return st;
  };

  P.parseDeclarator = function (base, abstract) {
    let t = base;
    while (this.accept('*')) {
      t = ptrT(t);
      while (this.peek().t === 'id' && (QUAL_KW.has(this.peek().v))) this.next();
    }
    if (this.is('(') && this.is('*', 1)) fail(this.peek(), '함수 포인터는 지원하지 않습니다 (unsupported: function pointer)');
    let nameTok = null;
    if (this.peek().t === 'id' && !STMT_KW.has(this.peek().v) && !(abstract && this.isTypeName(this.peek()))) nameTok = this.next();
    else if (!abstract) {
      const cur = this.peek();
      fail(cur, "식별자가 필요합니다 (expected identifier or '(' before '" + tokDesc(cur) + "')");
    }
    const dims = [];
    let fn = null;
    for (;;) {
      if (this.accept('[')) {
        if (this.accept(']')) { dims.push(null); continue; }
        const et = this.peek();
        const n = this.constEval(this.parseAssign());
        if (n === undefined) fail(et, '배열 크기가 상수가 아닙니다 (variable length array is not supported)');
        if (n <= 0) fail(et, '배열 크기는 양수여야 합니다 (size of array is not positive)');
        this.expect(']');
        dims.push(n);
      } else if (this.is('(') && !fn && !dims.length) fn = this.parseParams();
      else break;
    }
    while (this.is('__attribute__')) this.skipAttribute();
    for (let k = dims.length - 1; k >= 0; k--) t = arrT(t, dims[k]);
    if (fn) t = { k: 'fn', ret: t, params: fn.params, variadic: fn.variadic, unspecified: fn.unspecified };
    return { name: nameTok ? nameTok.v : null, tok: nameTok || this.peek(), type: t };
  };

  P.parseParams = function () {
    this.expect('(');
    const r = { params: [], variadic: false, unspecified: false };
    if (this.accept(')')) { r.unspecified = true; return r; }
    if (this.is('void') && this.is(')', 1)) { this.next(); this.next(); return r; }
    for (;;) {
      if (this.accept('...')) { r.variadic = true; break; }
      const sp = this.parseSpecs();
      const d = this.parseDeclarator(sp.type, true);
      let ty = d.type;
      if (ty.k === 'arr') ty = ptrT(ty.of);
      r.params.push({ name: d.name, type: ty, tok: d.tok });
      if (!this.accept(',')) break;
    }
    this.expect(')');
    return r;
  };

  P.parseTypeName = function () {
    const sp = this.parseSpecs();
    return this.parseDeclarator(sp.type, true).type;
  };

  P.parseUnit = function () {
    const items = [];
    while (this.peek().t !== 'eof') {
      if (this.accept(';')) continue;
      const t0 = this.peek();
      if (!this.isTypeName(t0)) {
        if (t0.t === 'id' && this.peek(1).t === 'id') fail(t0, "알 수 없는 타입 이름 '" + t0.v + "' (unknown type name '" + t0.v + "')");
        fail(t0, "선언이 필요합니다 (expected declaration before '" + tokDesc(t0) + "')");
      }
      const sp = this.parseSpecs();
      if (this.accept(';')) continue;
      let d = this.parseDeclarator(sp.type, false);
      if (d.type.k === 'fn' && this.is('{')) {
        const body = this.parseBlock();
        items.push({ k: 'func', name: d.name, type: d.type, tok: d.tok, body, isStatic: sp.st.static });
        continue;
      }
      const vars = [];
      for (;;) {
        this.declOne(d, sp, vars, items);
        if (!this.accept(',')) break;
        d = this.parseDeclarator(sp.type, false);
      }
      this.expect(';');
      if (vars.length) items.push({ k: 'decl', vars });
    }
    return items;
  };
  P.declOne = function (d, sp, vars, protos) {
    if (sp.st.typedef) {
      if (d.type.k === 'struct' && /^__anon/.test(d.type.tag) && d.type.disp === 'struct <anonymous>') d.type.disp = d.name;
      this.typedefs.set(d.name, d.type.k === 'struct' || d.type.k === 'hal' ? d.type : withDisp(d.type, d.name));
      return;
    }
    if (d.type.k === 'fn') { if (protos) protos.push({ k: 'proto', name: d.name, type: d.type, tok: d.tok }); return; }
    const v = { k: 'var', name: d.name, type: d.type, tok: d.tok, init: null, isStatic: sp.st.static, isExtern: sp.st.extern, isConst: sp.isConst, addr: false };
    if (this.accept('=')) v.init = this.parseInitializer();
    vars.push(v);
  };
  P.parseInitializer = function () {
    const t = this.peek();
    if (this.accept('{')) {
      const items = [];
      while (!this.accept('}')) {
        let desig = null;
        if (this.is('.') && this.peek(1).t === 'id') {
          this.next(); desig = { field: this.next().v }; this.expect('=');
        } else if (this.is('[')) {
          this.next(); const it = this.peek(); const ix = this.constEval(this.parseAssign());
          if (ix === undefined) fail(it, '배열 지정자가 상수가 아닙니다 (array index in initializer not of integer type)');
          this.expect(']'); this.expect('='); desig = { index: ix };
        }
        items.push({ desig, val: this.parseInitializer() });
        if (!this.accept(',')) { this.expect('}'); break; }
      }
      return { k: 'list', items, tok: t };
    }
    return this.parseAssign();
  };

  // ---- 문장
  P.parseBlock = function () {
    const t = this.expect('{');
    const body = [];
    while (!this.is('}')) {
      if (this.peek().t === 'eof') fail(this.peek(), "입력 끝에서 '}' 이(가) 필요합니다 (expected '}' at end of input)");
      body.push(this.parseStatement());
    }
    this.next();
    return { k: 'block', body, tok: t };
  };
  P.parseLocalDecl = function () {
    const t = this.peek();
    const sp = this.parseSpecs();
    const vars = [];
    if (!this.accept(';')) {
      for (;;) {
        const d = this.parseDeclarator(sp.type, false);
        this.declOne(d, sp, vars, null);
        if (!this.accept(',')) break;
      }
      this.expect(';');
    }
    return { k: 'declstmt', vars, tok: t };
  };
  P.parseStatement = function () {
    const t = this.peek();
    if (t.t === 'punc') {
      if (t.v === '{') return this.parseBlock();
      if (t.v === ';') { this.next(); return { k: 'empty', tok: t }; }
    }
    if (t.t === 'id') {
      switch (t.v) {
        case 'if': {
          this.next(); this.expect('(');
          const c = this.parseExpr(); this.expect(')');
          const a = this.parseStatement();
          const b = this.accept('else') ? this.parseStatement() : null;
          return { k: 'if', c, a, b, tok: t };
        }
        case 'while': {
          this.next(); this.expect('(');
          const c = this.parseExpr(); this.expect(')');
          return { k: 'while', c, body: this.parseStatement(), tok: t };
        }
        case 'do': {
          this.next();
          const body = this.parseStatement();
          this.expect('while');
          this.expect('(');
          const c = this.parseExpr(); this.expect(')'); this.expect(';');
          return { k: 'do', c, body, tok: t };
        }
        case 'for': {
          this.next(); this.expect('(');
          let init = null, c = null, upd = null;
          if (this.isTypeName(this.peek())) init = this.parseLocalDecl();
          else if (!this.accept(';')) { init = { k: 'expr', e: this.parseExpr(), tok: this.peek() }; this.expect(';'); }
          if (!this.is(';')) c = this.parseExpr();
          this.expect(';');
          if (!this.is(')')) upd = this.parseExpr();
          this.expect(')');
          return { k: 'for', init, c, upd, body: this.parseStatement(), tok: t };
        }
        case 'switch': {
          this.next(); this.expect('(');
          const e = this.parseExpr(); this.expect(')');
          return { k: 'switch', e, body: this.parseStatement(), tok: t };
        }
        case 'case': {
          this.next();
          const e = this.parseCond();
          this.expect(':');
          return { k: 'case', e, tok: t };
        }
        case 'default': this.next(); this.expect(':'); return { k: 'default', tok: t };
        case 'break': this.next(); this.expect(';'); return { k: 'break', tok: t };
        case 'continue': this.next(); this.expect(';'); return { k: 'continue', tok: t };
        case 'return': {
          this.next();
          const e = this.is(';') ? null : this.parseExpr();
          this.expect(';');
          return { k: 'return', e, tok: t };
        }
        case 'goto': fail(t, 'goto 는 지원하지 않습니다 (unsupported: goto)');
      }
      if (this.isTypeName(t)) return this.parseLocalDecl();
      if (this.peek(1).t === 'id' && !STMT_KW.has(t.v)) fail(t, "알 수 없는 타입 이름 '" + t.v + "' (unknown type name '" + t.v + "')");
      if (this.is(':', 1)) fail(t, '레이블/goto 는 지원하지 않습니다 (unsupported: label)');
    }
    const e = this.parseExpr();
    this.expect(';');
    return { k: 'expr', e, tok: t };
  };

  // ---- 식
  P.parseExpr = function () {
    let e = this.parseAssign();
    while (this.is(',')) { const t = this.next(); e = { k: 'comma', l: e, r: this.parseAssign(), tok: t }; }
    return e;
  };
  P.parseAssign = function () {
    const l = this.parseCond();
    const t = this.peek();
    if (t.t === 'punc' && ASSIGN_OPS.has(t.v)) { this.next(); return { k: 'assign', op: t.v, l, r: this.parseAssign(), tok: t }; }
    return l;
  };
  P.parseCond = function () {
    const c = this.parseBin(1);
    if (this.is('?')) {
      const t = this.next();
      const a = this.parseExpr();
      this.expect(':');
      return { k: 'cond', c, a, b: this.parseCond(), tok: t };
    }
    return c;
  };
  P.parseBin = function (minP) {
    let l = this.parseUnary();
    for (;;) {
      const t = this.peek();
      const pr = t.t === 'punc' ? BIN_PREC[t.v] : undefined;
      if (pr === undefined || pr < minP) return l;
      this.next();
      l = { k: 'bin', op: t.v, l, r: this.parseBin(pr + 1), tok: t };
    }
  };
  P.parseUnary = function () {
    const t = this.peek();
    if (t.t === 'punc') {
      if (t.v === '++' || t.v === '--') { this.next(); return { k: 'preinc', op: t.v, e: this.parseUnary(), tok: t }; }
      if (t.v === '&' || t.v === '*' || t.v === '-' || t.v === '+' || t.v === '!' || t.v === '~') {
        this.next(); return { k: 'unary', op: t.v, e: this.parseUnary(), tok: t };
      }
      if (t.v === '(' && this.isTypeName(this.peek(1))) {
        this.next();
        const type = this.parseTypeName();
        this.expect(')');
        if (this.is('{')) fail(this.peek(), '복합 리터럴은 지원하지 않습니다 (unsupported: compound literal)');
        return { k: 'cast', type, e: this.parseUnary(), tok: t };
      }
    }
    if (t.t === 'id' && t.v === 'sizeof') {
      this.next();
      if (this.is('(') && this.isTypeName(this.peek(1))) {
        this.next(); const type = this.parseTypeName(); this.expect(')');
        return { k: 'sizeofT', type, tok: t };
      }
      return { k: 'sizeofE', e: this.parseUnary(), tok: t };
    }
    return this.parsePostfix(this.parsePrimary());
  };
  P.parsePrimary = function () {
    const t = this.next();
    if (t.t === 'num') { const r = parseNumber(t.v, t); return { k: 'num', v: r.v, kind: r.kind, tok: t }; }
    if (t.t === 'chr') return { k: 'num', v: charValue(t.v, t), kind: 'i32', tok: t };
    if (t.t === 'str') {
      let cps = decodeEscapes(t.v, t);
      while (this.peek().t === 'str') { const s = this.next(); cps = cps.concat(decodeEscapes(s.v, s)); }
      return { k: 'str', cps, tok: t };
    }
    if (t.t === 'id' && !STMT_KW.has(t.v) && !TYPE_KW.has(t.v)) return { k: 'id', name: t.v, tok: t };
    if (t.t === 'punc' && t.v === '(') { const e = this.parseExpr(); this.expect(')'); return e; }
    const prev = this.toks[this.p - 2];
    fail(t.t === 'eof' && prev ? prev : t, "식이 필요합니다 (expected expression before '" + tokDesc(t) + "')");
  };
  P.parsePostfix = function (e) {
    for (;;) {
      const t = this.peek();
      if (t.t !== 'punc') return e;
      if (t.v === '[') { this.next(); const i = this.parseExpr(); this.expect(']'); e = { k: 'index', e, i, tok: t }; continue; }
      if (t.v === '(') {
        this.next();
        const args = [];
        if (!this.accept(')')) {
          for (;;) { args.push(this.parseAssign()); if (!this.accept(',')) break; }
          this.expect(')');
        }
        if (e.k !== 'id') fail(t, '함수 이름으로만 호출할 수 있습니다 (called object is not a function)');
        e = { k: 'call', name: e.name, args, tok: e.tok };
        continue;
      }
      if (t.v === '.' || t.v === '->') {
        this.next();
        const nt = this.next();
        if (nt.t !== 'id') fail(nt, "멤버 이름이 필요합니다 (expected identifier before '" + tokDesc(nt) + "')");
        e = { k: 'member', e, name: nt.v, arrow: t.v === '->', tok: nt };
        continue;
      }
      if (t.v === '++' || t.v === '--') { this.next(); e = { k: 'postinc', op: t.v, e, tok: t }; continue; }
      return e;
    }
  };

  // 컴파일 시간 상수 계산. 상수가 아니면 undefined.
  P.constEval = function (e) {
    const self = this;
    function ev(e) {
      switch (e.k) {
        case 'num': return e.v;
        case 'id':
          if (self.localShadow && self.localShadow(e.name)) return undefined;
          if (self.enumConsts.has(e.name)) return self.enumConsts.get(e.name);
          if (self.env.constants && Object.prototype.hasOwnProperty.call(self.env.constants, e.name) && typeof self.env.constants[e.name] === 'number') return self.env.constants[e.name];
          if (e.name === 'NULL' || e.name === 'false') return 0;
          if (e.name === 'true') return 1;
          return undefined;
        case 'unary': {
          const v = ev(e.e); if (v === undefined) return undefined;
          switch (e.op) { case '-': return -v; case '+': return v; case '~': return ~v; case '!': return v ? 0 : 1; }
          return undefined;
        }
        case 'bin': {
          const a = ev(e.l); if (a === undefined) return undefined;
          const b = ev(e.r); if (b === undefined) return undefined;
          const fl = !Number.isInteger(a) || !Number.isInteger(b);
          switch (e.op) {
            case '+': return a + b; case '-': return a - b; case '*': return a * b;
            case '/': if (b === 0) return undefined; return fl ? a / b : Math.trunc(a / b);
            case '%': if (b === 0) return undefined; return a % b;
            case '<<': return a << b; case '>>': return a >> b;
            case '<': return +(a < b); case '>': return +(a > b); case '<=': return +(a <= b); case '>=': return +(a >= b);
            case '==': return +(a === b); case '!=': return +(a !== b);
            case '&': return a & b; case '|': return a | b; case '^': return a ^ b;
            case '&&': return +(!!a && !!b); case '||': return +(!!a || !!b);
          }
          return undefined;
        }
        case 'cond': { const c = ev(e.c); if (c === undefined) return undefined; return c ? ev(e.a) : ev(e.b); }
        case 'cast': { const v = ev(e.e); if (v === undefined) return undefined; return truncConst(v, e.type); }
        case 'sizeofT': return sizeOf(e.type);
        case 'sizeofE': if (e.e.k === 'str') return utf8(e.e.cps).length + 1; return self.sizeofHook ? self.sizeofHook(e.e) : undefined;
        case 'comma': return ev(e.r);
      }
      return undefined;
    }
    return ev(e);
  };

  // ---------------------------------------------------------------- 코드 생성 (타입 검사 포함)
  const SIMPLE = /^[\w$.[\]]+$/;
  const IDENT = /^[A-Za-z_$][\w$]*$/;
  const LOOP_CHECK = 'if (++H.$.n >= H.$.q) yield 0;';
  function lit(v) {
    if (Object.is(v, -0)) return '0';
    if (!isFinite(v)) return v > 0 ? 'Infinity' : v < 0 ? '(-Infinity)' : 'NaN';
    return v < 0 ? '(' + v + ')' : String(v);
  }
  function cpsToString(cps) {
    let s = '';
    for (let i = 0; i < cps.length; i += 4096) s += String.fromCodePoint.apply(null, cps.slice(i, i + 4096));
    return s;
  }
  const isScalarT = t => t.k === 'int' || t.k === 'float' || t.k === 'double' || t.k === 'ptr';
  const isPtrLike = t => t.k === 'ptr' || t.k === 'arr';
  const isObjT = t => t.k === 'struct' || t.k === 'hal' || t.k === 'obj';
  const isStructPtr = t => t.k === 'ptr' && (t.to.k === 'struct' || t.to.k === 'hal');

  function Gen(parser, items, env, entry, warnings) {
    this.P = parser; this.items = items; this.env = env; this.entry = entry; this.warnings = warnings;
    this.funcs = new Map();
    this.globals = new Map();
    this.strings = new Map(); this.strCount = 0; this.strBytes = 0;
    this.code = [];
    this.errors = [];
    this.stmtCount = 0; this.dataBytes = 0; this.bssBytes = 0;
    this.usedStructs = new Set();
    this.called = new Map();
    this.expose = [];
    this.jsNames = new Set();
    this.fnEnv = env.functions || {};
    this.objects = new Set(env.objects || []);
    this.handleTypes = new Set(env.handleTypes || []);
    this.halTypes = new Set([].concat(env.structTypes || [], env.handleTypes || []));
    this.consts = env.constants || {};
    this.cpat = env.constantPattern || null;
    this.retCache = {};
    this.gctx = { global: true, scopes: [], temps: 0, tempPrefix: '__g', loopDepth: 0, switchDepth: 0 };
  }
  const G = Gen.prototype;

  G.warn = function (tok, msg) { this.warnings.push({ file: tok ? tok.file : this.entry, line: tok ? tok.line : 0, col: tok ? tok.col : 0, msg }); };
  G.newTemp = function (ctx) { return ctx.tempPrefix + (ctx.temps++); };
  G.strId = function (cps) {
    const s = cpsToString(cps);
    let id = this.strings.get(s);
    if (!id) { id = '__s' + (this.strCount++); this.strings.set(s, id); this.strBytes += utf8(cps).length + 1; }
    return id;
  };
  G.lookup = function (name, ctx) {
    for (let i = ctx.scopes.length - 1; i >= 0; i--) { const s = ctx.scopes[i].get(name); if (s) return s; }
    return this.globals.get(name) || null;
  };
  G.retType = function (s) {
    if (s == null) return TY.any;
    if (this.retCache[s]) return this.retCache[s];
    let str = String(s).replace(/\b(const|volatile|__IO)\b/g, ' ');
    let stars = 0;
    str = str.replace(/\*/g, () => { stars++; return ' '; }).trim().replace(/\s+/g, ' ');
    let t;
    const map = { void: TY.void, int: TY.i32, 'signed int': TY.i32, unsigned: TY.u32, 'unsigned int': TY.u32, long: TY.i32,
      'unsigned long': TY.u32, short: TY.i16, 'unsigned short': TY.u16, char: CHAR, 'unsigned char': TY.u8, 'signed char': TY.i8,
      float: TY.float, double: TY.double, 'long long': TY.i64, 'unsigned long long': TY.u64, _Bool: TY.bool };
    if (map[str]) t = map[str];
    else if (Object.prototype.hasOwnProperty.call(BUILTIN_TYPEDEFS, str)) t = BUILTIN_TYPEDEFS[str];
    else if (this.halTypes.has(str) || /_TypeDef$/.test(str)) t = { k: 'hal', name: str };
    else t = TY.any;
    for (let i = 0; i < stars; i++) t = ptrT(t);
    return (this.retCache[s] = t);
  };

  // ---- 값 변환
  G.val = function (R, tok) {
    if (R.t.k === 'void') fail(tok, 'void 값은 사용할 수 없습니다 (void value not ignored as it ought to be)');
    return R.b ? '(' + R.c + ' ? 1 : 0)' : R.c;
  };
  G.cond = function (R, tok) {
    if (R.t.k === 'void') fail(tok, 'void 값은 조건으로 쓸 수 없습니다 (void value not ignored as it ought to be)');
    if (R.t.k === 'struct') fail(tok, '구조체는 조건으로 쓸 수 없습니다 (used struct type value where scalar is required)');
    if (R.t.k === 'arr') return 'true';
    return R.c;
  };
  G.decay = function (R) {
    const el = R.t.of;
    if (el.k === 'struct' || el.k === 'hal') return R.c + '[0]';
    return 'new H.Ptr(' + R.c + ', 0)';
  };
  G.argRt = function (R, tok) {
    if (R.t.k === 'arr') return this.decay(R);
    return this.val(R, tok);
  };
  G.conv = function (R, t, tok) {
    const incompatible = () => fail(tok, "호환되지 않는 타입입니다: '" + typeStr(R.t) + "' 을(를) '" + typeStr(t) + "' 에 넣을 수 없습니다 (incompatible types)");
    if (R.t.k === 'void') fail(tok, 'void 값은 사용할 수 없습니다 (void value not ignored as it ought to be)');
    if (t.k === 'int' || t.k === 'float' || t.k === 'double') {
      if (R.t.k === 'arr' || R.t.k === 'struct') incompatible();
      if (R.k !== undefined) return lit(t.k === 'int' ? truncConst(R.k, t) : t.k === 'float' ? Math.fround(R.k) : R.k);
      if (R.b) return '(' + R.c + ' ? 1 : 0)';
      if (t.k === 'double') return R.c;
      if (t.k === 'float') return R.t.k === 'float' ? R.c : 'Math.fround(' + R.c + ')';
      if (R.t.k === 'int' && fitsInt(R.t, t)) return R.c;
      if (R.t.k === 'ptr' || R.t.k === 'obj' || R.t.k === 'hal') return R.c;
      return wrapCode(R.c, t);
    }
    if (t.k === 'ptr') {
      if (R.t.k === 'arr') return this.decay(R);
      if (R.t.k === 'struct' || R.t.k === 'hal' || R.t.k === 'obj') return R.c;
      if (R.t.k === 'float' || R.t.k === 'double') incompatible();
      return this.val(R, tok);
    }
    if (t.k === 'struct') {
      if (R.t.k !== 'struct') incompatible();
      if (R.t !== t && R.t.tag !== t.tag) incompatible();
      return R.fresh ? R.c : '__clone(' + R.c + ')';
    }
    if (t.k === 'arr') fail(tok, '배열에는 대입할 수 없습니다 (assignment to expression with array type)');
    return this.argRt(R, tok);
  };

  // ---- 식별자
  G.genId = function (e, ctx) {
    const s = this.lookup(e.name, ctx);
    if (s) return { c: s.boxed ? s.js + '[0]' : s.js, t: s.type, sym: s };
    const name = e.name;
    if (this.P.enumConsts.has(name)) { const v = this.P.enumConsts.get(name); return { c: lit(v), t: TY.i32, k: v }; }
    if (Object.prototype.hasOwnProperty.call(this.consts, name) && typeof this.consts[name] === 'number') {
      const v = this.consts[name];
      return { c: lit(v), t: !Number.isInteger(v) ? TY.double : v > 0x7FFFFFFF ? TY.u32 : TY.i32, k: v };
    }
    if (name === 'NULL') return { c: '0', t: TY.i32, k: 0, isNull: true };
    if (name === 'true') return { c: '1', t: TY.i32, k: 1 };
    if (name === 'false') return { c: '0', t: TY.i32, k: 0 };
    if (this.objects.has(name)) return { c: 'H.o.' + name, t: TY.obj };
    if (this.cpat && this.cpat.test(name)) return { c: "H.k('" + name + "')", t: TY.i32 };
    if (this.funcs.has(name) || this.fnEnv[name]) fail(e.tok, "함수 '" + name + "' 을(를) 값으로 쓸 수 없습니다 (함수 포인터 미지원)");
    fail(e.tok, "'" + name + "' 이(가) 선언되지 않았습니다 ('" + name + "' undeclared" + (ctx.global ? ')' : ' (first use in this function))'));
  };

  // ---- lvalue: { pre:[], c, t, typed, sym }
  G.stab = function (code, L, ctx) {
    if (SIMPLE.test(code)) return code;
    const t = this.newTemp(ctx);
    L.pre.push(t + ' = ' + code);
    return t;
  };
  G.genLval = function (e, ctx, stable) {
    const L = { pre: [], c: '', t: null, typed: false, sym: null };
    switch (e.k) {
      case 'id': {
        const R = this.genId(e, ctx);
        if (!R.sym) fail(e.tok, "대입할 수 없는 식입니다 (lvalue required: '" + e.name + "')");
        L.c = R.c; L.t = R.t; L.sym = R.sym;
        return L;
      }
      case 'index': {
        const B = this.genExpr(e.e, ctx);
        const I = this.genExpr(e.i, ctx);
        if (!(I.t.k === 'int' || I.t.k === 'any')) fail(e.tok, '배열 첨자가 정수가 아닙니다 (array subscript is not an integer)');
        let iv = this.val(I, e.tok);
        if (B.t.k === 'arr') {
          const obj = stable ? this.stab(B.c, L, ctx) : B.c;
          if (stable) iv = this.stab(iv, L, ctx);
          L.c = obj + '[' + iv + ']'; L.t = B.t.of; L.typed = !!ctorOf(B.t.of);
          return L;
        }
        if (B.t.k === 'ptr') {
          const to = B.t.to;
          if (to.k === 'void') fail(e.tok, 'void 포인터는 역참조할 수 없습니다 (dereferencing \'void *\' pointer)');
          if (to.k === 'struct' || to.k === 'hal') {
            if (I.k === 0) { L.c = B.c; L.t = to; return L; }
            fail(e.tok, '구조체 포인터의 첨자/산술은 지원하지 않습니다 (unsupported: struct pointer arithmetic)');
          }
          const p = this.stab(B.c, L, ctx);
          if (stable) iv = this.stab(iv, L, ctx);
          L.c = p + '.a[' + (iv === '0' ? p + '.o' : p + '.o + ' + iv) + ']';
          L.t = to; L.typed = !!ctorOf(to);
          return L;
        }
        if (B.t.k === 'any' || B.t.k === 'obj' || B.t.k === 'hal') {
          L.c = (stable ? this.stab(B.c, L, ctx) : B.c) + '[' + iv + ']'; L.t = TY.any;
          return L;
        }
        fail(e.tok, '첨자 연산 대상이 배열이나 포인터가 아닙니다 (subscripted value is neither array nor pointer)');
      }
      // falls through (unreachable)
      case 'member': {
        const B = this.genExpr(e.e, ctx);
        let st = B.t;
        if (e.arrow) {
          if (st.k === 'ptr') st = st.to;
          else if (!(st.k === 'obj' || st.k === 'any' || st.k === 'hal')) fail(e.tok, "'->' 의 대상이 포인터가 아닙니다 (invalid type argument of '->' (have '" + typeStr(st) + "'))");
        } else if (st.k === 'ptr' && (st.to.k === 'struct' || st.to.k === 'hal')) {
          fail(e.tok, "포인터에는 '.' 대신 '->' 를 써야 합니다 (request for member '" + e.name + "' in something that is a pointer; did you mean '->'?)");
        }
        let ft;
        if (st.k === 'struct') {
          if (!st.complete) fail(e.tok, "불완전한 구조체 '" + typeStr(st) + "' (dereferencing pointer to incomplete type)");
          const f = st.fields.find(x => x.name === e.name);
          if (!f) fail(e.tok, "'" + typeStr(st) + "' 에 '" + e.name + "' 멤버가 없습니다 (has no member named '" + e.name + "')");
          ft = f.type;
        } else if (st.k === 'hal' || st.k === 'any' || st.k === 'obj') ft = TY.any;
        else fail(e.tok, "구조체가 아닌 값의 멤버 요청입니다 (request for member '" + e.name + "' in something not a structure)");
        const obj = stable ? this.stab(B.c, L, ctx) : B.c;
        L.c = obj + (IDENT.test(e.name) ? '.' + e.name : '[' + JSON.stringify(e.name) + ']');
        L.t = ft;
        return L;
      }
      case 'unary':
        if (e.op === '*') {
          const B = this.genExpr(e.e, ctx);
          if (B.t.k === 'arr') {
            const obj = stable ? this.stab(B.c, L, ctx) : B.c;
            L.c = obj + '[0]'; L.t = B.t.of; L.typed = !!ctorOf(B.t.of);
            return L;
          }
          if (B.t.k === 'ptr') {
            const to = B.t.to;
            if (to.k === 'void') fail(e.tok, "void 포인터는 역참조할 수 없습니다 (dereferencing 'void *' pointer)");
            if (to.k === 'struct' || to.k === 'hal') { L.c = B.c; L.t = to; return L; }
            const p = this.stab(B.c, L, ctx);
            L.c = p + '.a[' + p + '.o]'; L.t = to; L.typed = !!ctorOf(to);
            return L;
          }
          if (B.t.k === 'any') { L.c = B.c; L.t = TY.any; return L; }
          fail(e.tok, "단항 '*' 의 피연산자가 포인터가 아닙니다 (invalid type argument of unary '*' (have '" + typeStr(B.t) + "'))");
        }
    }
    fail(e.tok, '대입할 수 없는 식입니다 (lvalue required as left operand of assignment)');
  };
  function withPre(pre, c) { return pre.length ? '(' + pre.join(', ') + ', ' + c + ')' : c; }

  // ---- 식
  G.genExpr = function (e, ctx, discard) {
    switch (e.k) {
      case 'num': {
        const t = e.kind === 'float' ? TY.float : e.kind === 'double' ? TY.double : TY[e.kind];
        const v = e.kind === 'float' ? Math.fround(e.v) : e.v;
        return { c: lit(v), t, k: v };
      }
      case 'str': {
        const id = this.strId(e.cps);
        return { c: id, t: ptrT(CHAR), strBytes: utf8(e.cps).length + 1 };
      }
      case 'id': return this.genId(e, ctx);
      case 'index': case 'member': {
        const L = this.genLval(e, ctx, false);
        return { c: withPre(L.pre, L.c), t: L.t };
      }
      case 'unary': return this.genUnary(e, ctx);
      case 'preinc': return this.genInc(e, ctx, discard, false);
      case 'postinc': return this.genInc(e, ctx, discard, true);
      case 'assign': return this.genAssign(e, ctx, discard);
      case 'bin': {
        if (e.op === '&&' || e.op === '||') {
          const A = this.genExpr(e.l, ctx), B = this.genExpr(e.r, ctx);
          if (A.k !== undefined && B.k !== undefined) {
            const v = e.op === '&&' ? +(!!A.k && !!B.k) : +(!!A.k || !!B.k);
            return { c: String(v), t: TY.i32, k: v };
          }
          return { c: '(' + this.cond(A, e.tok) + ' ' + e.op + ' ' + this.cond(B, e.tok) + ')', t: TY.i32, b: true };
        }
        return this.binop(e.op, this.genExpr(e.l, ctx), this.genExpr(e.r, ctx), e.tok);
      }
      case 'cond': {
        const C = this.genExpr(e.c, ctx), A = this.genExpr(e.a, ctx), B = this.genExpr(e.b, ctx);
        let t, a, b;
        if (A.t.k === 'void' || B.t.k === 'void') { t = TY.void; a = A.c; b = B.c; }
        else if (isArith(A.t) && isArith(B.t)) { t = arithConv(A.t, B.t); a = this.val(A, e.tok); b = this.val(B, e.tok); }
        else if (isPtrLike(A.t) || isPtrLike(B.t)) {
          t = isPtrLike(A.t) ? (A.t.k === 'arr' ? ptrT(A.t.of) : A.t) : (B.t.k === 'arr' ? ptrT(B.t.of) : B.t);
          a = this.argRt(A, e.tok); b = this.argRt(B, e.tok);
        } else { t = A.t; a = A.c; b = B.c; }
        return { c: '(' + this.cond(C, e.tok) + ' ? ' + a + ' : ' + b + ')', t };
      }
      case 'comma': {
        const A = this.genExpr(e.l, ctx, true), B = this.genExpr(e.r, ctx, discard);
        return { c: '(' + A.c + ', ' + B.c + ')', t: B.t, b: B.b };
      }
      case 'call': return this.genCall(e, ctx);
      case 'cast': return this.genCast(e, ctx);
      case 'sizeofT': { const n = sizeOf(e.type); return { c: String(n), t: BUILTIN_TYPEDEFS.size_t, k: n }; }
      case 'sizeofE': {
        const R = this.genExpr(e.e, { global: true, scopes: ctx.scopes, temps: 0, tempPrefix: '__z', loopDepth: 0, switchDepth: 0, dry: true });
        const n = R.strBytes !== undefined ? R.strBytes : sizeOf(R.t);
        return { c: String(n), t: BUILTIN_TYPEDEFS.size_t, k: n };
      }
      case 'list': fail(e.tok, "여기에는 '{' 초기화 목록을 쓸 수 없습니다 (expected expression before '{' token)");
    }
    fail(e.tok, '지원하지 않는 식입니다 (unsupported expression)');
  };

  G.genUnary = function (e, ctx) {
    if (e.op === '&') return this.genAddr(e.e, ctx, e.tok);
    if (e.op === '*') { const L = this.genLval(e, ctx, false); return { c: withPre(L.pre, L.c), t: L.t }; }
    const A = this.genExpr(e.e, ctx);
    if (e.op === '!') {
      if (A.k !== undefined) { const v = A.k ? 0 : 1; return { c: String(v), t: TY.i32, k: v }; }
      return { c: '!' + (SIMPLE.test(A.c) ? '' : '') + '(' + this.cond(A, e.tok) + ')', t: TY.i32, b: true };
    }
    if (!isArith(A.t)) fail(e.tok, "단항 '" + e.op + "' 의 피연산자 타입이 잘못되었습니다 (wrong type argument to unary " + (e.op === '~' ? 'complement' : e.op === '-' ? 'minus' : 'plus') + ")");
    const rt = isFlt(A.t) ? A.t : promote(A.t);
    const v = this.val(A, e.tok);
    if (e.op === '+') return { c: v, t: rt, k: A.k };
    if (e.op === '-') {
      if (A.k !== undefined) { const k = isFlt(rt) ? -A.k : truncConst(-A.k, rt); return { c: lit(k), t: rt, k }; }
      if (isFlt(rt) || rt.n === 'i64') return { c: '(-(' + v + '))', t: rt };
      return { c: rt.n === 'u32' ? '(-(' + v + ') >>> 0)' : '(-(' + v + ') | 0)', t: rt };
    }
    if (e.op === '~') {
      if (isFlt(rt)) fail(e.tok, "'~' 의 피연산자는 정수여야 합니다 (wrong type argument to bit-complement)");
      if (A.k !== undefined) { const k = truncConst(~A.k, rt); return { c: lit(k), t: rt, k }; }
      return { c: rt.n === 'u32' ? '(~(' + v + ') >>> 0)' : '(~(' + v + '))', t: rt };
    }
    fail(e.tok, '지원하지 않는 연산자입니다');
  };

  G.genAddr = function (x, ctx, tok) {
    switch (x.k) {
      case 'id': {
        const R = this.genId(x, ctx);
        if (R.t.k === 'obj') return R;
        const s = R.sym;
        if (!s) fail(tok, "상수의 주소는 얻을 수 없습니다 (lvalue required as unary '&' operand)");
        if (s.type.k === 'struct' || s.type.k === 'hal') return { c: s.js, t: ptrT(s.type) };
        if (s.type.k === 'arr') return { c: 'new H.Ptr(' + s.js + ', 0)', t: ptrT(s.type.of) };
        if (s.boxed) return { c: 'new H.Ptr(' + s.js + ', 0)', t: ptrT(s.type) };
        fail(tok, "'" + x.name + "' 의 주소를 얻을 수 없습니다 (unsupported address-of)");
      }
      // falls through (unreachable)
      case 'index': {
        const B = this.genExpr(x.e, ctx), I = this.genExpr(x.i, ctx);
        const iv = this.val(I, tok);
        if (B.t.k === 'arr') {
          const el = B.t.of;
          if (el.k === 'struct' || el.k === 'hal') return { c: B.c + '[' + iv + ']', t: ptrT(el) };
          return { c: 'new H.Ptr(' + B.c + ', ' + iv + ')', t: ptrT(el) };
        }
        if (B.t.k === 'ptr') {
          if (isStructPtr(B.t)) { if (I.k === 0) return B; fail(tok, '구조체 포인터의 산술은 지원하지 않습니다 (unsupported: struct pointer arithmetic)'); }
          return { c: iv === '0' ? B.c : B.c + '.add(' + iv + ')', t: B.t };
        }
        fail(tok, '첨자 연산 대상이 배열이나 포인터가 아닙니다 (subscripted value is neither array nor pointer)');
      }
      // falls through (unreachable)
      case 'member': {
        const L = this.genLval(x, ctx, false);
        const c = withPre(L.pre, L.c);
        if (L.t.k === 'struct' || L.t.k === 'hal') return { c, t: ptrT(L.t) };
        if (L.t.k === 'arr') return { c: 'new H.Ptr(' + c + ', 0)', t: ptrT(L.t.of) };
        if (L.t.k === 'any') return { c, t: TY.any };
        fail(tok, "구조체 스칼라 멤버의 주소(&s." + x.name + ")는 지원하지 않습니다 (unsupported: address of scalar struct member)");
      }
      // falls through (unreachable)
      case 'unary':
        if (x.op === '*') { const R = this.genExpr(x.e, ctx); return R.t.k === 'arr' ? { c: this.decay(R), t: ptrT(R.t.of) } : R; }
        break;
      case 'str': return this.genExpr(x, ctx);
    }
    fail(tok, "단항 '&' 의 피연산자는 lvalue 여야 합니다 (lvalue required as unary '&' operand)");
  };

  G.genInc = function (e, ctx, discard, post) {
    const L = this.genLval(e.e, ctx, true);
    const sign = e.op === '++' ? '+' : '-';
    if (L.sym && L.sym.isConst) fail(e.tok, "읽기 전용 변수 '" + L.sym.name + "' 은(는) 바꿀 수 없습니다 (increment of read-only variable)");
    const parts = L.pre.slice();
    let t = L.t;
    if (t.k === 'ptr') {
      if (isStructPtr(t)) fail(e.tok, '구조체 포인터의 증감은 지원하지 않습니다 (unsupported: struct pointer arithmetic)');
      const step = sign === '+' ? '1' : '-1';
      if (!post || discard) parts.push(L.c + ' = ' + L.c + '.add(' + step + ')');
      else { const tmp = this.newTemp(ctx); parts.push(tmp + ' = ' + L.c, L.c + ' = ' + tmp + '.add(' + step + ')', tmp); }
    } else if (t.k === 'any') {
      parts.push(post ? L.c + e.op : e.op + L.c);
    } else if (t.k === 'int' || t.k === 'float' || t.k === 'double') {
      const nv = (x) => (isFlt(t) ? (t.k === 'float' ? 'Math.fround(' + x + ' ' + sign + ' 1)' : x + ' ' + sign + ' 1')
        : (L.typed && discard ? x + ' ' + sign + ' 1' : wrapCode(x + ' ' + sign + ' 1', t)));
      if (!post || discard) parts.push(L.c + ' = ' + nv(L.c));
      else { const tmp = this.newTemp(ctx); parts.push(tmp + ' = ' + L.c, L.c + ' = ' + nv(tmp), tmp); }
    } else fail(e.tok, "증감 연산자의 피연산자 타입이 잘못되었습니다 (wrong type argument to " + (sign === '+' ? 'increment' : 'decrement') + ")");
    return { c: parts.length === 1 && discard ? parts[0] : '(' + parts.join(', ') + ')', t };
  };

  G.genAssign = function (e, ctx, discard) {
    const L = this.genLval(e.l, ctx, e.op !== '=');
    if (L.sym && L.sym.isConst) fail(e.tok, "읽기 전용 변수 '" + L.sym.name + "' 에 대입할 수 없습니다 (assignment of read-only variable '" + L.sym.name + "')");
    if (L.t.k === 'arr') fail(e.tok, '배열에는 대입할 수 없습니다 (assignment to expression with array type)');
    const R = this.genExpr(e.r, ctx);
    let a;
    if (e.op === '=') {
      let v;
      if (L.t.k === 'any') v = this.argRt(R, e.tok);
      else if (L.typed && discard && isArith(R.t) && L.t.k !== 'bool') v = R.k !== undefined ? this.conv(R, L.t, e.tok) : R.c;
      else v = this.conv(R, L.t, e.tok);
      a = L.c + ' = ' + v;
    } else {
      const op = e.op.slice(0, -1);
      if (L.t.k === 'any') {
        const rv = this.argRt(R, e.tok);
        if (op === '/' || op === '%') a = L.c + ' = H.' + (op === '/' ? 'idiv' : 'imod') + '(' + L.c + ', ' + rv + ')';
        else if (op === '>>') a = L.c + ' >>>= ' + rv;
        else a = L.c + ' ' + e.op + ' ' + rv;
      } else if (L.t.k === 'ptr' && (op === '+' || op === '-')) {
        if (isStructPtr(L.t)) fail(e.tok, '구조체 포인터의 산술은 지원하지 않습니다 (unsupported: struct pointer arithmetic)');
        const n = this.val(R, e.tok);
        a = L.c + ' = ' + L.c + '.add(' + (op === '-' ? '-(' + n + ')' : n) + ')';
      } else {
        const B = this.binop(op, { c: L.c, t: L.t }, R, e.tok);
        const v = L.typed && discard && !B.b && L.t.k !== 'bool' ? B.c : this.conv(B, L.t, e.tok);
        a = L.c + ' = ' + v;
      }
    }
    const parts = L.pre.concat([a]);
    if (discard && parts.length === 1) return { c: a, t: L.t };
    return { c: '(' + parts.join(', ') + ')', t: L.t };
  };

  G.binop = function (op, A, B, tok) {
    const bad = () => fail(tok, "이항 '" + op + "' 의 피연산자가 잘못되었습니다 (invalid operands to binary " + op + " (have '" + typeStr(A.t) + "' and '" + typeStr(B.t) + "'))");
    if (A.t.k === 'void' || B.t.k === 'void') fail(tok, 'void 값은 사용할 수 없습니다 (void value not ignored as it ought to be)');
    // 포인터 산술
    if (op === '+' || op === '-') {
      if (op === '+' && isInt(A.t) && isPtrLike(B.t)) { const x = A; A = B; B = x; }
      if (isPtrLike(A.t) && (isInt(B.t) || B.t.k === 'any')) {
        const el = A.t.k === 'arr' ? A.t.of : A.t.to;
        if (el.k === 'struct' || el.k === 'hal') fail(tok, '구조체 포인터의 산술은 지원하지 않습니다 (unsupported: struct pointer arithmetic)');
        let n = this.val(B, tok);
        if (op === '-') n = B.k !== undefined ? lit(-B.k) : '-(' + n + ')';
        if (A.t.k === 'arr') return { c: 'new H.Ptr(' + A.c + ', ' + n + ')', t: ptrT(el) };
        return { c: A.c + '.add(' + n + ')', t: A.t };
      }
      if (op === '-' && isPtrLike(A.t) && isPtrLike(B.t)) {
        const off = R => R.t.k === 'arr' ? '0' : R.c + '.o';
        return { c: '(' + off(A) + ' - ' + off(B) + ')', t: TY.i32 };
      }
    }
    const CMP = { '<': '<', '>': '>', '<=': '<=', '>=': '>=', '==': '===', '!=': '!==' };
    if (CMP[op]) {
      const nonArith = R => !isArith(R.t);
      if (nonArith(A) || nonArith(B)) {
        if (A.t.k === 'struct' || B.t.k === 'struct') bad();
        const ac = this.argRt(A, tok), bc = this.argRt(B, tok);
        if (isPtrLike(A.t) && isPtrLike(B.t)) {
          if (op === '==') return { c: 'H.peq(' + ac + ', ' + bc + ')', t: TY.i32, b: true };
          if (op === '!=') return { c: '!H.peq(' + ac + ', ' + bc + ')', t: TY.i32, b: true };
          const off = (R, c) => R.t.k === 'arr' ? '0' : c + '.o';
          return { c: '(' + off(A, ac) + ' ' + op + ' ' + off(B, bc) + ')', t: TY.i32, b: true };
        }
        return { c: '(' + ac + ' ' + CMP[op] + ' ' + bc + ')', t: TY.i32, b: true };
      }
      const rt = arithConv(A.t, B.t);
      if (A.k !== undefined && B.k !== undefined && !isFlt(rt)) {
        const a = truncConst(A.k, rt), b = truncConst(B.k, rt);
        const v = +({ '<': a < b, '>': a > b, '<=': a <= b, '>=': a >= b, '==': a === b, '!=': a !== b }[op]);
        return { c: String(v), t: TY.i32, k: v };
      }
      return { c: '(' + this.opnd(A, rt, tok) + ' ' + CMP[op] + ' ' + this.opnd(B, rt, tok) + ')', t: TY.i32, b: true };
    }
    if (!isArith(A.t) || !isArith(B.t)) bad();
    if (op === '<<' || op === '>>') {
      if (isFlt(A.t) || isFlt(B.t)) bad();
      const rt = promote(A.t);
      if (A.k !== undefined && B.k !== undefined) {
        const k = op === '<<' ? truncConst(A.k << B.k, rt) : rt.n === 'u32' ? (A.k >>> B.k) : truncConst(A.k >> B.k, rt);
        return { c: lit(k), t: rt, k };
      }
      const a = this.val(A, tok), b = this.val(B, tok);
      if (op === '<<') {
        if (rt.n === 'u32') return { c: '((' + a + ' << ' + b + ') >>> 0)', t: rt };
        if (rt.n === 'i64') return { c: '(' + a + ' * Math.pow(2, ' + b + '))', t: rt };
        return { c: '(' + a + ' << ' + b + ')', t: rt };
      }
      if (rt.n === 'u32') return { c: '(' + a + ' >>> ' + b + ')', t: rt };
      if (rt.n === 'i64') return { c: 'Math.floor(' + a + ' / Math.pow(2, ' + b + '))', t: rt };
      return { c: '(' + a + ' >> ' + b + ')', t: rt };
    }
    const rt = arithConv(A.t, B.t);
    const fl = isFlt(rt);
    if ((op === '%' || op === '&' || op === '|' || op === '^') && fl) bad();
    // 상수 접기
    if (A.k !== undefined && B.k !== undefined) {
      let k;
      const a = A.k, b = B.k;
      switch (op) {
        case '+': k = a + b; break;
        case '-': k = a - b; break;
        case '*': k = fl ? a * b : (rt.n === 'i64' ? a * b : Math.imul(a, b)); break;
        case '/': if (b !== 0) k = fl ? a / b : Math.trunc(a / b); break;
        case '%': if (b !== 0) k = a % b; break;
        case '&': k = a & b; break;
        case '|': k = a | b; break;
        case '^': k = a ^ b; break;
      }
      if (k !== undefined) { k = fl ? (rt.k === 'float' ? Math.fround(k) : k) : truncConst(k, rt); return { c: lit(k), t: rt, k }; }
    }
    if (fl) {
      const a = this.val(A, tok), b = this.val(B, tok);
      return { c: '(' + a + ' ' + op + ' ' + b + ')', t: rt };
    }
    if (op === '/' || op === '%') {
      const a = this.opnd(A, rt, tok), b = this.opnd(B, rt, tok);
      return { c: 'H.' + (op === '/' ? 'idiv' : 'imod') + '(' + a + ', ' + b + ')', t: rt };
    }
    const a = this.val(A, tok), b = this.val(B, tok);
    if (rt.n === 'i64') return { c: '(' + a + ' ' + op + ' ' + b + ')', t: rt };
    if (op === '*') return { c: rt.n === 'u32' ? '(Math.imul(' + a + ', ' + b + ') >>> 0)' : 'Math.imul(' + a + ', ' + b + ')', t: rt };
    if (op === '+' || op === '-') return { c: '((' + a + ' ' + op + ' ' + b + ') ' + (rt.n === 'u32' ? '>>> 0' : '| 0') + ')', t: rt };
    return { c: rt.n === 'u32' ? '((' + a + ' ' + op + ' ' + b + ') >>> 0)' : '(' + a + ' ' + op + ' ' + b + ')', t: rt };
  };
  // 부호 없는 32비트 연산에서 부호 있는 피연산자를 u32 로
  G.opnd = function (R, rt, tok) {
    const v = this.val(R, tok);
    if (rt.n === 'u32' && R.t.k === 'int' && R.t.sg && !(R.k !== undefined && R.k >= 0)) return '(' + v + ' >>> 0)';
    if (rt.n === 'u32' && R.k !== undefined) return lit(R.k >>> 0);
    return v;
  };

  G.genCast = function (e, ctx) {
    const R = this.genExpr(e.e, ctx);
    const T = e.type;
    if (T.k === 'void') return { c: '(void ' + R.c + ')', t: TY.void };
    if (T.k === 'int' || T.k === 'float' || T.k === 'double') {
      if (R.t.k === 'struct' || R.t.k === 'arr') fail(e.tok, "'" + typeStr(R.t) + "' 을(를) '" + typeStr(T) + "' 로 변환할 수 없습니다 (conversion to non-scalar type requested)");
      if (R.k !== undefined) { const k = T.k === 'int' ? truncConst(R.k, T) : T.k === 'float' ? Math.fround(R.k) : R.k; return { c: lit(k), t: T, k }; }
      return { c: this.conv(R, T, e.tok), t: T };
    }
    if (T.k === 'ptr') {
      if (R.t.k === 'arr') return { c: this.decay(R), t: T };
      if (R.t.k === 'float' || R.t.k === 'double') fail(e.tok, '실수를 포인터로 변환할 수 없습니다 (cannot convert to a pointer type)');
      return { c: this.val(R, e.tok), t: T, isNull: R.k === 0 };
    }
    if (T.k === 'struct' && R.t.k !== 'struct') fail(e.tok, '구조체로 변환할 수 없습니다 (conversion to non-scalar type requested)');
    return { c: R.c, t: T };
  };

  G.genCall = function (e, ctx) {
    const name = e.name;
    const uf = this.funcs.get(name);
    const rf = this.fnEnv[name];
    if (uf && (uf.def || !rf)) {
      if (ctx.global && !ctx.dry) fail(e.tok, "전역 초기화 식에서는 함수를 호출할 수 없습니다 (initializer element is not constant)");
      const ft = uf.type;
      if (!ft.unspecified) {
        if (e.args.length < ft.params.length) fail(e.tok, "함수 '" + name + "' 의 인자가 너무 적습니다 (too few arguments to function '" + name + "')");
        if (e.args.length > ft.params.length && !ft.variadic) fail(e.tok, "함수 '" + name + "' 의 인자가 너무 많습니다 (too many arguments to function '" + name + "')");
      }
      const args = e.args.map((a, i) => {
        const R = this.genExpr(a, ctx);
        const p = ft.params[i];
        return p ? this.conv(R, p.type, a.tok || e.tok) : this.argRt(R, e.tok);
      });
      if (!this.called.has(name)) this.called.set(name, e.tok);
      return { c: '(yield* v_' + name + '(' + args.join(', ') + '))', t: ft.ret, fresh: true };
    }
    if (rf) {
      if (rf.gen && ctx.global && !ctx.dry) fail(e.tok, "전역 초기화 식에서는 함수를 호출할 수 없습니다 (initializer element is not constant)");
      const args = e.args.map(a => this.argRt(this.genExpr(a, ctx), a.tok || e.tok));
      const call = 'H.f.' + name + '(' + args.join(', ') + ')';
      return { c: rf.gen ? '(yield* ' + call + ')' : call, t: this.retType(rf.ret) };
    }
    if (this.lookup(name, ctx)) fail(e.tok, "'" + name + "' 은(는) 함수가 아닙니다 (called object '" + name + "' is not a function)");
    fail(e.tok, "함수 '" + name + "' 이(가) 선언되지 않았습니다 (implicit declaration of function '" + name + "')");
  };

  // ---- 초기화
  G.defaultVal = function (t) {
    switch (t.k) {
      case 'arr': {
        const C = ctorOf(t.of);
        if (C) return 'new ' + C + '(' + t.n + ')';
        if (t.of.k === 'ptr' || t.of.k === 'any') return 'new Array(' + t.n + ').fill(0)';
        return 'Array.from({ length: ' + t.n + ' }, () => ' + this.defaultVal(t.of) + ')';
      }
      case 'struct':
        this.usedStructs.add(t);
        return '__mk_' + t.tag + '()';
      case 'hal': return "H.struct('" + t.name + "')";
      default: return '0';
    }
  };
  G.isZeroInit = function (init) {
    if (!init) return true;
    if (init.k === 'list') return init.items.every(it => this.isZeroInit(it.val));
    return init.k === 'num' && init.v === 0;
  };
  // 중괄호 생략({1,2,3,4} → {{1,2},{3,4}}) 정리
  G.regroup = function (items, el) {
    let m = 0;
    if (el.k === 'arr') m = el.n;
    else if (el.k === 'struct') m = el.fields.length;
    if (!m || items.every(it => it.val.k === 'list' || it.desig || (it.val.k === 'str' && el.k === 'arr'))) return items;
    const out = [];
    let cur = null;
    for (const it of items) {
      if (it.val.k === 'list' || it.desig) { cur = null; out.push(it); continue; }
      if (!cur || cur.val.items.length >= m) { cur = { desig: null, val: { k: 'list', items: [], tok: it.val.tok } }; out.push(cur); }
      cur.val.items.push({ desig: null, val: it.val });
    }
    return out;
  };
  G.genInit = function (t, init, ctx, tok) {
    if (!init) return this.defaultVal(t);
    if (t.k === 'hal') {
      if (init.k !== 'list') { const R = this.genExpr(init, ctx); return R.c; }
      if (!this.isZeroInit(init)) this.warn(init.tok, "HAL 구조체 '" + t.name + "' 의 초기화 목록은 무시됩니다 (필드를 따로 대입하세요)");
      return "H.struct('" + t.name + "')";
    }
    if (t.k === 'arr') return this.genArrInit(t, init, ctx, tok);
    if (t.k === 'struct') {
      if (init.k === 'list') return this.genStructInit(t, init, ctx);
      return this.conv(this.genExpr(init, ctx), t, init.tok || tok);
    }
    if (init.k === 'list') {
      if (!init.items.length) return this.defaultVal(t);
      if (init.items.length > 1) this.warn(init.tok, '스칼라 초기화에 값이 너무 많습니다 (excess elements in scalar initializer)');
      return this.genInit(t, init.items[0].val, ctx, tok);
    }
    return this.conv(this.genExpr(init, ctx), t, init.tok || tok);
  };
  G.genArrInit = function (t, init, ctx, tok) {
    const el = t.of, n = t.n;
    let str = null;
    if (init.k === 'str') str = init;
    else if (init.k === 'list' && init.items.length === 1 && init.items[0].val.k === 'str' && el.k === 'int' && el.sz === 1) str = init.items[0].val;
    if (str) {
      if (!(el.k === 'int' && el.sz === 1)) fail(str.tok, '문자열로는 char 배열만 초기화할 수 있습니다 (array of inappropriate type initialized from string constant)');
      let bytes = utf8(str.cps);
      if (bytes.length > n) { this.warn(str.tok, 'char 배열에 비해 문자열이 너무 깁니다 (initializer-string for array of chars is too long)'); bytes = bytes.slice(0, n); }
      if (el.n === 'i8') bytes = bytes.map(b => (b << 24) >> 24);
      return '__ta(' + ctorOf(el) + ', ' + n + ', [' + bytes.join(', ') + '])';
    }
    if (init.k !== 'list') fail(init.tok || tok, '배열 초기화에는 { } 목록이 필요합니다 (invalid initializer)');
    const items = this.regroup(init.items, el);
    const slots = [];
    let idx = 0;
    for (const it of items) {
      if (it.desig && it.desig.index !== undefined) idx = it.desig.index;
      else if (it.desig) fail(init.tok, '배열에 멤버 지정자를 쓸 수 없습니다 (field name not in record or union initializer)');
      if (idx >= n) { this.warn(it.val.tok || init.tok, '배열 초기화 값이 너무 많습니다 (excess elements in array initializer)'); break; }
      slots[idx++] = it.val;
    }
    const C = ctorOf(el);
    if (C) {
      const vals = [];
      for (let i = 0; i < slots.length; i++) {
        let s = slots[i];
        if (s && s.k === 'list') s = s.items.length ? s.items[0].val : null;
        vals.push(s ? this.conv(this.genExpr(s, ctx), el, s.tok || tok) : '0');
      }
      while (vals.length && vals[vals.length - 1] === '0') vals.pop();
      if (!vals.length) return 'new ' + C + '(' + n + ')';
      return '__ta(' + C + ', ' + n + ', [' + vals.join(', ') + '])';
    }
    const vals = [];
    for (let i = 0; i < slots.length; i++) vals.push(slots[i] ? this.genInit(el, slots[i], ctx, tok) : this.defaultVal(el));
    if (vals.length === n) return '[' + vals.join(', ') + ']';
    return '__fa(' + n + ', [' + vals.join(', ') + '], () => ' + this.defaultVal(el) + ')';
  };
  G.genStructInit = function (t, init, ctx) {
    if (!t.complete) fail(init.tok, "불완전한 구조체 '" + typeStr(t) + "' (variable has initializer but incomplete type)");
    const vals = {};
    let fi = 0;
    const items = init.items.slice();
    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      if (it.desig && it.desig.field !== undefined) {
        fi = t.fields.findIndex(f => f.name === it.desig.field);
        if (fi < 0) fail(init.tok, "'" + typeStr(t) + "' 에 '" + it.desig.field + "' 멤버가 없습니다 (unknown field specified in initializer)");
      }
      const f = t.fields[fi++];
      if (!f) { this.warn(init.tok, '구조체 초기화 값이 너무 많습니다 (excess elements in struct initializer)'); break; }
      let v = it.val;
      // 중괄호 생략: 배열/구조체 멤버에 스칼라가 오면 필요한 개수만큼 묶는다
      if (v.k !== 'list' && !(v.k === 'str' && f.type.k === 'arr') && (f.type.k === 'arr' || f.type.k === 'struct')) {
        const m = f.type.k === 'arr' ? f.type.n : f.type.fields.length;
        const grp = [{ desig: null, val: v }];
        while (grp.length < m && k + 1 < items.length && !items[k + 1].desig && items[k + 1].val.k !== 'list') grp.push({ desig: null, val: items[++k].val });
        v = { k: 'list', items: grp, tok: v.tok };
      }
      vals[f.name] = this.genInit(f.type, v, ctx, init.tok);
    }
    this.usedStructs.add(t);
    return '{ ' + t.fields.map(f => (IDENT.test(f.name) ? f.name : JSON.stringify(f.name)) + ': ' +
      (vals[f.name] !== undefined ? vals[f.name] : this.defaultVal(f.type))).join(', ') + ' }';
  };
  // 변수 선언 공통: 크기 추론 + 박싱
  G.varInit = function (v, ctx) {
    let t = v.type;
    if (t.k === 'arr' && t.n == null) {
      let n;
      if (v.init && v.init.k === 'str') n = utf8(v.init.cps).length + 1;
      else if (v.init && v.init.k === 'list') {
        if (v.init.items.length === 1 && v.init.items[0].val.k === 'str' && t.of.k === 'int' && t.of.sz === 1) n = utf8(v.init.items[0].val.cps).length + 1;
        else {
          const items = this.regroup(v.init.items, t.of);
          let idx = 0; n = 0;
          for (const it of items) { if (it.desig && it.desig.index !== undefined) idx = it.desig.index; idx++; n = Math.max(n, idx); }
        }
      }
      if (!n) fail(v.tok, "배열 '" + v.name + "' 의 크기가 없습니다 (array size missing in '" + v.name + "')");
      t = v.type = arrT(t.of, n);
    }
    if (t.k === 'void') fail(v.tok, "변수 '" + v.name + "' 을(를) void 로 선언할 수 없습니다 (variable or field '" + v.name + "' declared void)");
    if (t.k === 'struct' && !t.complete) fail(v.tok, "'" + v.name + "' 의 타입 '" + typeStr(t) + "' 이(가) 불완전합니다 (storage size of '" + v.name + "' isn't known)");
    const boxed = v.addr && isScalarT(t);
    let code = this.genInit(t, v.init, ctx, v.tok);
    if (boxed) { const C = ctorOf(t); code = C ? 'new ' + C + '([' + code + '])' : '[' + code + ']'; }
    return { code, boxed, type: t };
  };

  // ---- 문장
  G.mark = function (tok) { return tok && tok.file === this.entry ? 'H.$.l = ' + tok.line + '; ' : ''; };
  G.emit = function (ctx, line) { ctx.lines.push('  '.repeat(ctx.indent) + line); };
  G.declareLocal = function (v, ctx, js) {
    const top = ctx.scopes[ctx.scopes.length - 1];
    if (top.has(v.name)) fail(v.tok, "'" + v.name + "' 이(가) 다시 선언되었습니다 (redeclaration of '" + v.name + "')");
    const sym = { name: v.name, type: v.type, js, boxed: false, isConst: v.isConst && isScalarT(v.type) && v.type.k !== 'ptr' };
    top.set(v.name, sym);
    return sym;
  };
  G.localJs = function (name, ctx) {
    let js = 'v_' + name;
    if (this.lookup(name, ctx) || this.funcs.has(name) || ctx.usedJs.has(js)) js = 'v_' + name + '$' + (++ctx.shadowN);
    ctx.usedJs.add(js);
    return js;
  };
  G.genLocalDecl = function (s, ctx, inFor) {
    const parts = [];
    for (const v of s.vars) {
      if (v.isExtern) { const g = this.globals.get(v.name); if (!g) fail(v.tok, "'" + v.name + "' 이(가) 선언되지 않았습니다 (undeclared)"); ctx.scopes[ctx.scopes.length - 1].set(v.name, g); continue; }
      if (v.isStatic) {
        if (inFor) fail(v.tok, 'for 초기식에는 static 을 쓸 수 없습니다');
        let js = 'v_' + ctx.fnName + '$' + v.name;
        while (this.jsNames.has(js)) js += '_';
        this.jsNames.add(js);
        const r = this.varInit(v, this.gctx);
        ctx.statics.push('let ' + js + ' = ' + r.code + ';');
        const sym = this.declareLocal(v, ctx, js);
        sym.boxed = r.boxed; sym.type = r.type;
        this.expose.push([ctx.fnName + '.' + v.name, r.boxed ? js + '[0]' : js]);
        const sz = sizeOf(r.type);
        if (v.init && !this.isZeroInit(v.init)) this.dataBytes += sz; else this.bssBytes += sz;
        continue;
      }
      const r = this.varInit(v, ctx);
      const js = this.localJs(v.name, ctx);
      const sym = this.declareLocal(v, ctx, js);
      sym.boxed = r.boxed; sym.type = r.type;
      parts.push(js + ' = ' + r.code);
    }
    return parts;
  };
  G.genSub = function (s, ctx) {
    ctx.indent++;
    ctx.scopes.push(new Map());
    if (s.k === 'block') for (const x of s.body) this.genStmt(x, ctx);
    else this.genStmt(s, ctx);
    ctx.scopes.pop();
    ctx.indent--;
  };
  G.condCode = function (e, ctx) {
    const R = this.genExpr(e, ctx);
    return this.cond(R, e.tok);
  };
  G.genStmt = function (s, ctx) {
    const m = this.mark(s.tok);
    if (s.k !== 'block' && s.k !== 'empty') this.stmtCount++;
    switch (s.k) {
      case 'block':
        this.emit(ctx, '{');
        this.genSub(s, ctx);
        this.emit(ctx, '}');
        return;
      case 'empty': return;
      case 'expr': {
        const R = this.genExpr(s.e, ctx, true);
        this.emit(ctx, m + R.c + ';');
        return;
      }
      case 'declstmt': {
        const parts = this.genLocalDecl(s, ctx, false);
        for (const p of parts) this.emit(ctx, m + 'let ' + p + ';');
        return;
      }
      case 'if': {
        this.emit(ctx, m + 'if (' + this.condCode(s.c, ctx) + ') {');
        this.genSub(s.a, ctx);
        if (s.b) { this.emit(ctx, '} else {'); this.genSub(s.b, ctx); }
        this.emit(ctx, '}');
        return;
      }
      case 'while': {
        this.emit(ctx, m + 'while (' + this.condCode(s.c, ctx) + ') {');
        ctx.indent++; this.emit(ctx, LOOP_CHECK); ctx.indent--;
        ctx.loopDepth++; this.genSub(s.body, ctx); ctx.loopDepth--;
        this.emit(ctx, '}');
        return;
      }
      case 'do': {
        this.emit(ctx, m + 'do {');
        ctx.indent++; this.emit(ctx, LOOP_CHECK); ctx.indent--;
        ctx.loopDepth++; this.genSub(s.body, ctx); ctx.loopDepth--;
        this.emit(ctx, '} while (' + this.condCode(s.c, ctx) + ');');
        return;
      }
      case 'for': {
        ctx.scopes.push(new Map());
        let init = '';
        if (s.init && s.init.k === 'declstmt') { const p = this.genLocalDecl(s.init, ctx, true); init = p.length ? 'let ' + p.join(', ') : ''; }
        else if (s.init) init = this.genExpr(s.init.e, ctx, true).c;
        const c = s.c ? this.condCode(s.c, ctx) : '';
        const u = s.upd ? this.genExpr(s.upd, ctx, true).c : '';
        this.emit(ctx, m + 'for (' + init + '; ' + c + '; ' + u + ') {');
        ctx.indent++; this.emit(ctx, LOOP_CHECK); ctx.indent--;
        ctx.loopDepth++; this.genSub(s.body, ctx); ctx.loopDepth--;
        this.emit(ctx, '}');
        ctx.scopes.pop();
        return;
      }
      case 'switch': {
        const R = this.genExpr(s.e, ctx);
        if (!(R.t.k === 'int' || R.t.k === 'any')) fail(s.tok, 'switch 식이 정수가 아닙니다 (switch quantity not an integer)');
        if (s.body.k !== 'block') fail(s.tok, 'switch 본문은 { } 블록이어야 합니다 (unsupported switch body)');
        this.emit(ctx, m + 'switch (' + this.val(R, s.tok) + ') {');
        ctx.switchDepth++;
        ctx.scopes.push(new Map());
        const seen = new Set();
        let hasDefault = false;
        for (const x of s.body.body) {
          if (x.k === 'case') {
            const v = this.P.constEval(x.e);
            if (v === undefined || !Number.isInteger(v)) fail(x.tok, 'case 레이블이 정수 상수가 아닙니다 (case label does not reduce to an integer constant)');
            const key = truncConst(v, promote(R.t.k === 'any' ? TY.u32 : R.t));
            if (seen.has(key)) fail(x.tok, "case 값 " + v + " 이(가) 중복되었습니다 (duplicate case value)");
            seen.add(key);
            this.emit(ctx, 'case ' + lit(key) + ':');
          } else if (x.k === 'default') {
            if (hasDefault) fail(x.tok, 'default 레이블이 여러 개입니다 (multiple default labels in one switch)');
            hasDefault = true;
            this.emit(ctx, 'default:');
          } else { ctx.indent++; this.genStmt(x, ctx); ctx.indent--; }
        }
        ctx.scopes.pop();
        ctx.switchDepth--;
        this.emit(ctx, '}');
        return;
      }
      case 'case': case 'default':
        fail(s.tok, "'" + s.k + "' 레이블이 switch 문 밖(또는 중첩 블록 안)에 있습니다 (case label not within a switch statement)");
      // falls through (unreachable)
      case 'break':
        if (!ctx.loopDepth && !ctx.switchDepth) fail(s.tok, 'break 문이 루프나 switch 밖에 있습니다 (break statement not within loop or switch)');
        this.emit(ctx, m + 'break;');
        return;
      case 'continue':
        if (!ctx.loopDepth) fail(s.tok, 'continue 문이 루프 밖에 있습니다 (continue statement not within a loop)');
        this.emit(ctx, m + 'continue;');
        return;
      case 'return': {
        const rt = ctx.retType;
        if (!s.e) {
          if (rt.k !== 'void') this.warn(s.tok, "값 없는 'return' — 함수가 '" + typeStr(rt) + "' 을(를) 반환해야 합니다 ('return' with no value, in function returning non-void)");
          this.emit(ctx, m + 'return' + (rt.k === 'void' ? '' : ' 0') + ';');
          return;
        }
        const R = this.genExpr(s.e, ctx);
        if (rt.k === 'void') {
          if (R.t.k !== 'void') this.warn(s.tok, "void 함수에서 값을 반환합니다 ('return' with a value, in function returning void)");
          this.emit(ctx, m + R.c + '; return;');
          return;
        }
        this.emit(ctx, m + 'return ' + this.conv(R, rt, s.tok) + ';');
        return;
      }
    }
    fail(s.tok, '지원하지 않는 문장입니다 (unsupported statement)');
  };

  // ---- &x 사전 조사: 주소를 얻는 스칼라 변수 표시
  G.scanAddr = function () {
    const gscope = new Map();
    const find = (scopes, name) => { for (let i = scopes.length - 1; i >= 0; i--) { const d = scopes[i].get(name); if (d) return d; } return null; };
    const walkE = (e, scopes) => {
      if (!e || typeof e !== 'object') return;
      if (e.k === 'unary' && e.op === '&' && e.e.k === 'id') { const d = find(scopes, e.e.name); if (d) d.addr = true; }
      if (e.k === 'list') { for (const it of e.items) walkE(it.val, scopes); return; }
      for (const key of ['l', 'r', 'e', 'i', 'c', 'a', 'b']) if (e[key] && typeof e[key] === 'object' && e[key].k) walkE(e[key], scopes);
      if (e.args) for (const a of e.args) walkE(a, scopes);
    };
    const walkS = (s, scopes) => {
      if (!s) return;
      switch (s.k) {
        case 'block': scopes.push(new Map()); for (const x of s.body) walkS(x, scopes); scopes.pop(); return;
        case 'declstmt': for (const v of s.vars) { walkE(v.init, scopes); scopes[scopes.length - 1].set(v.name, v); } return;
        case 'for': scopes.push(new Map()); walkS(s.init, scopes); walkE(s.c, scopes); walkE(s.upd, scopes); walkS(s.body, scopes); scopes.pop(); return;
        case 'if': walkE(s.c, scopes); walkS(s.a, scopes); walkS(s.b, scopes); return;
        case 'while': case 'do': walkE(s.c, scopes); walkS(s.body, scopes); return;
        case 'switch': walkE(s.e, scopes); walkS(s.body, scopes); return;
        case 'expr': case 'return': walkE(s.e, scopes); return;
      }
    };
    for (const it of this.items) {
      if (it.k === 'decl') for (const v of it.vars) { walkE(v.init, [gscope]); if (!gscope.has(v.name) || !v.isExtern) { const old = gscope.get(v.name); if (old && old.addr) v.addr = true; gscope.set(v.name, v); } }
      else if (it.k === 'func') {
        const ps = new Map();
        for (const p of it.type.params) if (p.name) ps.set(p.name, p);
        const scopes = [gscope, ps];
        for (const x of it.body.body) walkS(x, scopes);
      }
    }
    // extern 선언과 정의가 같은 변수를 가리키도록 addr 전파
    const byName = new Map();
    for (const it of this.items) if (it.k === 'decl') for (const v of it.vars) { if (v.addr) byName.set(v.name, true); }
    for (const it of this.items) if (it.k === 'decl') for (const v of it.vars) if (byName.get(v.name)) v.addr = true;
  };

  G.genGlobalVar = function (v) {
    const existing = this.globals.get(v.name);
    if (v.isExtern && !v.init) {
      if (!existing) this.globals.set(v.name, { name: v.name, type: v.type, js: 'v_' + v.name, boxed: v.addr && isScalarT(v.type), externOnly: true, decl: v, isConst: false });
      return;
    }
    if (existing && !existing.externOnly) {
      if (!existing.decl.init && !v.init) return; // 잠정 정의 반복
      fail(v.tok, "'" + v.name + "' 이(가) 중복 정의되었습니다 (redefinition of '" + v.name + "')");
    }
    if (this.funcs.has(v.name)) fail(v.tok, "'" + v.name + "' 이(가) 다른 종류의 기호로 다시 선언되었습니다 ('" + v.name + "' redeclared as different kind of symbol)");
    const js = 'v_' + v.name;
    this.jsNames.add(js);
    const isHandle = v.type.k === 'hal' && this.handleTypes.has(v.type.name);
    let code, boxed = false, type = v.type;
    if (isHandle) code = "H.handle('" + v.name + "', '" + v.type.name + "')";
    else { const r = this.varInit(v, this.gctx); code = r.code; boxed = r.boxed; type = r.type; }
    this.code.push('let ' + js + ' = ' + code + ';');
    const sym = { name: v.name, type, js, boxed, isHandle, decl: v, isConst: v.isConst && isScalarT(type) && type.k !== 'ptr' };
    this.globals.set(v.name, sym);
    if (!isHandle && type.k !== 'hal') {
      this.expose.push([v.name, boxed ? js + '[0]' : js]);
      const sz = sizeOf(type);
      if (v.init && !this.isZeroInit(v.init)) this.dataBytes += sz; else this.bssBytes += sz;
    } else this.bssBytes += 64;
  };

  G.genFunc = function (it) {
    const info = this.funcs.get(it.name);
    const ctx = { global: false, scopes: [new Map()], temps: 0, tempPrefix: '__t', loopDepth: 0, switchDepth: 0,
      lines: [], indent: 1, shadowN: 0, usedJs: new Set(), statics: [], fnName: it.name, retType: it.type.ret, dry: false };
    const params = [], prologue = [];
    for (const p of it.type.params) {
      if (!p.name) fail(p.tok, '매개변수 이름이 없습니다 (parameter name omitted)');
      if (p.type.k === 'void') fail(p.tok, "매개변수 '" + p.name + "' 의 타입이 void 입니다 (parameter has incomplete type)");
      const js = 'v_' + p.name;
      ctx.usedJs.add(js);
      const sym = this.declareLocal({ name: p.name, type: p.type, tok: p.tok, isConst: false }, ctx, js);
      if (p.addr && isScalarT(p.type)) {
        sym.boxed = true;
        params.push('p_' + p.name);
        const C = ctorOf(p.type);
        prologue.push('const ' + js + ' = ' + (C ? 'new ' + C + '([p_' + p.name + '])' : '[p_' + p.name + ']') + ';');
      } else params.push(js);
    }
    if (it.type.ret.k === 'arr') fail(it.tok, '함수는 배열을 반환할 수 없습니다 (function returns an array)');
    for (const s of it.body.body) this.genStmt(s, ctx);
    const out = ctx.statics.slice();
    out.push('function* v_' + it.name + '(' + params.join(', ') + ') {');
    if (ctx.temps) { const ts = []; for (let i = 0; i < ctx.temps; i++) ts.push('__t' + i); out.push('  let ' + ts.join(', ') + ';'); }
    for (const p of prologue) out.push('  ' + p);
    for (const l of ctx.lines) out.push(l);
    if (it.type.ret.k !== 'void' && it.type.ret.k !== 'struct' && it.type.ret.k !== 'hal') out.push('  return 0;');
    out.push('}');
    for (const l of out) this.code.push(l);
    info.emitted = true;
  };

  G.run = function () {
    // 1단계: 함수 원형/정의 등록 (정의 전 호출 허용)
    for (const it of this.items) {
      if (it.k !== 'func' && it.k !== 'proto') continue;
      const ex = this.funcs.get(it.name);
      if (!ex) { this.funcs.set(it.name, { name: it.name, type: it.type, def: it.k === 'func' ? it : null, tok: it.tok }); continue; }
      if (it.k === 'func') {
        if (ex.def) { this.errors.push(new CErr(it.tok, "함수 '" + it.name + "' 이(가) 중복 정의되었습니다 (redefinition of '" + it.name + "')")); continue; }
        if (!ex.type.unspecified && !it.type.unspecified && ex.type.params.length !== it.type.params.length) {
          this.errors.push(new CErr(it.tok, "함수 '" + it.name + "' 의 원형과 정의가 맞지 않습니다 (conflicting types for '" + it.name + "')"));
        }
        ex.def = it; ex.type = it.type;
      }
    }
    this.scanAddr();
    // 2단계: 순서대로 생성
    for (const it of this.items) {
      try {
        if (it.k === 'decl') for (const v of it.vars) this.genGlobalVar(v);
        else if (it.k === 'func') this.genFunc(it);
      } catch (e) {
        if (!e || !e.cerr) throw e;
        this.errors.push(e);
      }
    }
    // extern 만 있고 정의가 없는 전역 → 기본값으로 정의
    for (const s of this.globals.values()) {
      if (s.externOnly) {
        this.code.push('let ' + s.js + ' = ' + (s.boxed ? (ctorOf(s.type) ? 'new ' + ctorOf(s.type) + '(1)' : '[0]') : this.defaultVal(s.type)) + ';');
        s.externOnly = false;
        this.expose.push([s.name, s.boxed ? s.js + '[0]' : s.js]);
      }
    }
    for (const [name, tok] of this.called) {
      const f = this.funcs.get(name);
      if (f && !f.def && !this.fnEnv[name]) this.errors.push(new CErr(tok, "함수 '" + name + "' 의 정의가 없습니다 (undefined reference to '" + name + "')"));
    }
    const mainF = this.funcs.get('main');
    if (!mainF || !mainF.def) this.errors.push(new CErr({ file: this.entry, line: 1, col: 1 }, "'main' 함수가 없습니다 (undefined reference to 'main')"));
    if (this.errors.length) return null;

    // 구조체 팩토리 (중첩 구조체가 새로 쓰일 수 있으므로 반복)
    const factories = [];
    const done = new Set();
    let again = true;
    while (again) {
      again = false;
      for (const st of Array.from(this.usedStructs)) {
        if (done.has(st)) continue;
        done.add(st); again = true;
        factories.push('function __mk_' + st.tag + '() { return { ' + st.fields.map(f => (IDENT.test(f.name) ? f.name : JSON.stringify(f.name)) + ': ' + this.defaultVal(f.type)).join(', ') + ' }; }');
      }
    }
    const head = [
      "'use strict';",
      'const __ta = (C, n, v) => { const a = new C(n); a.set(v.length > n ? v.slice(0, n) : v); return a; };',
      'const __fa = (n, a, mk) => { while (a.length < n) a.push(mk()); return a; };',
      'const __clone = (o) => { if (o === null || typeof o !== "object") return o; if (ArrayBuffer.isView(o)) return o.slice(); if (o instanceof H.Ptr) return o; if (Array.isArray(o)) return o.map(__clone); const r = {}; for (const k of Object.keys(o)) r[k] = __clone(o[k]); return r; };'
    ];
    for (const [s, id] of this.strings) head.push('const ' + id + ' = H.str(' + JSON.stringify(s) + ');');
    if (this.gctx.temps) { const ts = []; for (let i = 0; i < this.gctx.temps; i++) ts.push('__g' + i); head.push('let ' + ts.join(', ') + ';'); }
    const fnNames = [];
    for (const f of this.funcs.values()) if (f.def) fnNames.push(f.name);
    const tail = [
      'return {',
      '  fns: { ' + fnNames.map(n => n + ': v_' + n).join(', ') + ' },',
      '  globals: () => ({ ' + this.expose.map(([k, c]) => JSON.stringify(k) + ': ' + c).join(', ') + ' })',
      '};'
    ];
    const js = head.concat(factories, this.code, tail).join('\n') + '\n';
    const symbols = {
      globals: Array.from(this.globals.values()).filter(s => !s.isHandle).map(s => ({ name: s.name, type: typeStr(s.type) })),
      functions: fnNames.map(n => { const f = this.funcs.get(n); return { name: n, ret: typeStr(f.type.ret), params: f.type.params.map(p => ({ name: p.name, type: typeStr(p.type) })) }; })
    };
    const size = {
      text: 1024 + this.stmtCount * 6 + fnNames.length * 24 + this.strBytes,
      data: this.dataBytes,
      bss: this.bssBytes + 1536
    };
    return { js, symbols, size };
  };

  // ---------------------------------------------------------------- 공개 API
  function errObj(e) { return { file: e.file, line: e.line, col: e.col, msg: e.msg }; }
  function compile(opts) {
    const warnings = [];
    opts = opts || {};
    const files = opts.files || {};
    const entry = opts.entry || Object.keys(files)[0];
    try {
      const env = opts.env || {};
      const halTypes = new Set([].concat(env.structTypes || [], env.handleTypes || []));
      const pp = preprocess(files, entry);
      const parser = new Parser(pp.toks, env, halTypes);
      const items = parser.parseUnit();
      const g = new Gen(parser, items, env, entry, warnings);
      const res = g.run();
      if (!res) {
        const errs = g.errors.map(errObj);
        errs.sort((a, b) => (a.file !== b.file ? 0 : a.line - b.line || a.col - b.col));
        return { ok: false, errors: errs, warnings };
      }
      return { ok: true, js: res.js, warnings, symbols: res.symbols, size: res.size };
    } catch (e) {
      if (e && e.cerr) return { ok: false, errors: [errObj(e)], warnings };
      return { ok: false, errors: [{ file: entry, line: 0, col: 0, msg: '컴파일러 내부 오류: ' + (e && e.stack || e) }], warnings };
    }
  }

  return { compile, version: '1.0.0', _internal: { lex, preprocess, Parser } };
});
