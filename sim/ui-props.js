/*
 * ui-props.js — 오른쪽 Properties 패널
 * -------------------------------------------------------------------------
 * 선택된 대상(장치 노드 · 배선 · MCU 핀 · 주변장치 · NVIC · 프로젝트)에 따라 설정 폼을 그린다.
 */
(function (global) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function opt(list, cur) {
    return list.map(function (o) { var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('');
  }

  function Props(root, app) { this.root = root; this.app = app; this.ctx = { kind: 'project' }; }
  Props.prototype.set = function (ctx) { this.ctx = ctx; this.render(); };
  Props.prototype.render = function () {
    var c = this.ctx, fn = this['r_' + c.kind];
    this.root.innerHTML = fn ? fn.call(this, c) : '';
    this.bind();
  };
  Props.prototype.bind = function () {
    var self = this, app = this.app, root = this.root;
    root.querySelectorAll('[data-k]').forEach(function (inp) {
      var ev = inp.type === 'range' ? 'input' : 'change';
      inp.addEventListener(ev, function () {
        var v = inp.type === 'checkbox' ? inp.checked : inp.type === 'number' || inp.type === 'range' ? +inp.value : inp.value;
        self.apply(inp.dataset.k, v, inp);
      });
    });
    root.querySelectorAll('[data-act]').forEach(function (b) { b.addEventListener('click', function () { self.act(b.dataset.act, b.dataset); }); });
  };

  // ---------------------------------------------------------------- 렌더러
  Props.prototype.r_project = function () {
    var app = this.app, P = app.project;
    return '<h4>프로젝트 <span class="type">' + esc(app.board.title) + '</span></h4>' +
      '<div class="prow"><label>이름</label><input type="text" data-k="proj.name" value="' + esc(P.name || '') + '"></div>' +
      '<div class="prow"><label>보드</label><select data-k="proj.board">' + opt(Object.keys(global.STM32Chips.BOARDS).map(function (b) { return [b, global.STM32Chips.BOARDS[b].title]; }), P.board) + '</select></div>' +
      '<div class="pdesc">' + esc(app.board.desc) + '</div>' +
      '<div class="prow"><label>SYSCLK</label><select data-k="proj.sysclk">' + opt(app.chip.sysclks.map(function (m) { return [m, m + ' MHz']; }), (P.clock && P.clock.sysclk) || app.chip.defClk) + '</select></div>' +
      '<div class="prow"><label>printf float</label><input type="checkbox" data-k="proj.printfFloat"' + (P.settings && P.settings.printfFloat !== false ? ' checked' : '') + '></div>' +
      '<div class="pdesc">CubeIDE 의 <code>-u _printf_float</code> 링커 옵션에 해당합니다. 꺼져 있으면 %f 가 비어서 출력됩니다.</div>' +
      '<h4>사용법</h4><div class="pdesc">1. <b>회로</b> 탭에서 장치를 놓고 포트를 MCU 핀에 연결합니다.<br>2. <b>핀아웃 &amp; 설정</b>에서 핀 신호와 주변장치를 정합니다 (배선하면 자동 설정).<br>3. <b>코드 생성</b> → <b>코드</b> 탭의 USER CODE 구역에 HAL 코드를 씁니다.<br>4. <b>실행</b>으로 결과를 확인합니다.</div>' +
      '<div class="pbtns"><button class="tb" data-act="fit">회로 맞춤 보기</button><button class="tb danger" data-act="new">새 프로젝트</button></div>';
  };
  Props.prototype.r_node = function (c) {
    var app = this.app, n = app.nodeById(c.id); if (!n) return '<div class="empty">선택된 장치가 없습니다.</div>';
    var d = global.STM32Devices.DEVICES[n.type], html = '<h4>' + esc(d.name) + ' <span class="type">' + esc(n.id) + '</span></h4>';
    html += '<h4 style="margin-top:8px">포트 연결</h4>';
    var gpio = app.chip.pins.filter(function (p, i) { return global.STM32Chips.isGpio(p) && !global.STM32Chips.RESERVED[p] && app.chip.pins.indexOf(p) === i; });
    d.ports.forEach(function (p) {
      var cur = n.conn && n.conn[p.id] || '';
      html += '<div class="prow"><label>' + esc(p.label || p.id) + ' <span class="type">' + p.dir + '</span></label><select data-k="port.' + p.id + '"><option value="">— 연결 안 함 —</option>' + opt(gpio, cur) + '</select></div>';
    });
    if (d.props.length) html += '<h4>설정</h4>';
    d.props.forEach(function (p) {
      var v = n.props && n.props[p.key] != null ? n.props[p.key] : p.default;
      if (p.type === 'select') html += '<div class="prow"><label>' + esc(p.label) + '</label><select data-k="prop.' + p.key + '">' + opt(p.options, v) + '</select></div>';
      else if (p.type === 'bool') html += '<div class="prow"><label>' + esc(p.label) + '</label><input type="checkbox" data-k="prop.' + p.key + '"' + (v ? ' checked' : '') + '></div>';
      else if (p.type === 'range') html += '<div class="prow"><label>' + esc(p.label) + '</label><div><input type="range" min="' + p.min + '" max="' + p.max + '" data-k="prop.' + p.key + '" value="' + v + '"><span class="val">' + v + '</span></div></div>';
      else if (p.type === 'number') html += '<div class="prow"><label>' + esc(p.label) + '</label><input type="number" min="' + p.min + '" max="' + p.max + '" data-k="prop.' + p.key + '" value="' + v + '"></div>';
      else if (p.type === 'textarea') html += '<div class="prow full"><label>' + esc(p.label) + '</label><textarea data-k="prop.' + p.key + '">' + esc(v) + '</textarea></div>';
      else html += '<div class="prow"><label>' + esc(p.label) + '</label><input type="text" data-k="prop.' + p.key + '" value="' + esc(v) + '"></div>';
    });
    html += this.nodeAdvice(n, d);
    if (!d.builtin) html += '<div class="pbtns"><button class="tb danger" data-act="delnode" data-id="' + esc(n.id) + '">장치 삭제</button></div>';
    return html;
  };
  Props.prototype.nodeAdvice = function (n, d) {
    var app = this.app, P = app.project, out = '';
    d.ports.forEach(function (p) {
      var pin = n.conn && n.conn[p.id]; if (!pin) { if (!d.builtin) out += '<div class="pwarn">' + esc(p.label || p.id) + ' 포트가 연결되지 않았습니다.</div>'; return; }
      var cfg = P.pins[pin] || {}, sig = cfg.signal || '';
      if (p.dir === 'in' && !/GPIO_Output|TIM\d+_CH|USART\d_TX/.test(sig)) out += '<div class="pwarn">' + pin + ' 이(가) 출력(GPIO_Output 또는 TIMx_CHn)으로 설정되지 않았습니다. 현재: ' + (sig || '설정 없음') + '</div>';
      if (p.dir === 'out' && !/GPIO_Input|GPIO_EXTI|USART\d_RX|SPI\d_MISO/.test(sig)) out += '<div class="pwarn">' + pin + ' 이(가) 입력으로 설정되지 않았습니다. 현재: ' + (sig || '설정 없음') + '</div>';
      if (p.dir === 'analog' && !/^ADC/.test(sig)) out += '<div class="pwarn">' + pin + ' 을(를) ADC1_INx 로 설정해야 아날로그 값을 읽습니다.</div>';
      if (p.dir === 'io' && !/I2C\d_(SCL|SDA)/.test(sig)) out += '<div class="pwarn">' + pin + ' 을(를) I2Cx_' + p.id.toUpperCase() + ' 로 설정하세요.</div>';
      if (n.type === 'button' && (n.props || {}).wiring === 'gnd' && cfg.pull !== 'up') out += '<div class="pwarn">GND 배선 버튼은 ' + pin + ' 에 풀업(Pull-up)이 필요합니다. 없으면 플로팅되어 값이 흔들립니다.</div>';
      if (n.type === 'button' && (n.props || {}).wiring === 'vcc' && cfg.pull !== 'down') out += '<div class="pwarn">3.3V 배선 버튼은 ' + pin + ' 에 풀다운(Pull-down)이 필요합니다.</div>';
    });
    if (n.type === 'lcd1602' || n.type === 'i2cdev') out += '<div class="pdesc">HAL 주소 인자: <code>' + esc((n.props || {}).addr || d.props[0].default) + ' &lt;&lt; 1</code></div>';
    return out;
  };
  Props.prototype.r_wire = function (c) {
    var w = this.app.project.wires[c.i]; if (!w) return '';
    return '<h4>배선</h4><div class="pcode">' + esc(w[0]) + ' ↔ ' + esc(w[1]) + '</div><div class="pbtns"><button class="tb danger" data-act="delwire" data-i="' + c.i + '">배선 삭제</button></div>';
  };
  Props.prototype.r_pin = function (c) {
    var app = this.app, pin = c.pin, cfg = app.project.pins[pin] || {}, sigs = global.STM32Chips.pinSignals(app.chip, pin), C = global.STM32Chips;
    var html = '<h4>핀 ' + pin + ' <span class="type">' + (C.RESERVED[pin] ? C.RESERVED[pin] : 'GPIO' + pin[1] + ' · PIN ' + pin.slice(2)) + '</span></h4>';
    if (!C.isGpio(pin)) return html + '<div class="pdesc">전원/리셋 핀입니다.</div>';
    if (C.RESERVED[pin]) return html + '<div class="pdesc">디버그(SWD) 또는 오실레이터로 예약된 핀입니다. 실물에서도 쓰지 않는 것이 좋습니다.</div>';
    html += '<div class="prow"><label>신호</label><select data-k="pin.signal">' + opt(sigs, cfg.signal || 'Reset_State') + '</select></div>';
    var s = cfg.signal || '';
    if (/^GPIO_/.test(s)) html += '<div class="prow"><label>사용자 라벨</label><input type="text" data-k="pin.label" value="' + esc(cfg.label || '') + '" placeholder="예: LED1 → LED1_Pin"></div>';
    if (s === 'GPIO_Output') html += '<div class="prow"><label>초기 레벨</label><select data-k="pin.level">' + opt([[0, 'Low'], [1, 'High']], cfg.level || 0) + '</select></div>' +
      '<div class="prow"><label>출력 형태</label><select data-k="pin.od">' + opt([[0, 'Push-pull'], [1, 'Open-drain']], cfg.od ? 1 : 0) + '</select></div>';
    if (s === 'GPIO_Input' || s === 'GPIO_EXTI' || s === 'GPIO_Output') html += '<div class="prow"><label>풀업/풀다운</label><select data-k="pin.pull">' + opt([['none', 'No pull-up and no pull-down'], ['up', 'Pull-up'], ['down', 'Pull-down']], cfg.pull || 'none') + '</select></div>';
    if (s === 'GPIO_EXTI') {
      var line = global.STM32Codegen.exti(+pin.slice(2));
      html += '<div class="prow"><label>트리거</label><select data-k="pin.trigger">' + opt([['falling', 'Falling edge (하강)'], ['rising', 'Rising edge (상승)'], ['both', 'Rising/Falling 둘 다']], cfg.trigger || 'falling') + '</select></div>' +
        '<div class="chk"><input type="checkbox" data-k="nvic.' + line + '"' + (app.project.nvic[line] ? ' checked' : '') + '><span>NVIC: ' + line + ' 인터럽트 켜기</span><span class="irq">' + line + '_IRQn</span></div>' +
        '<div class="pdesc">콜백: <code>void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin)</code> 에서 <code>GPIO_Pin == GPIO_PIN_' + (+pin.slice(2)) + '</code> 로 구분합니다.</div>';
    }
    var m = /^(USART\d|I2C\d|SPI\d|TIM\d+|ADC1)_/.exec(s);
    if (m) {
      var on = global.STM32Codegen.activePeriph(app.project).indexOf(m[1]) >= 0;
      html += (on ? '<div class="pok">' + m[1] + ' 이(가) 켜져 있습니다.</div>' : '<div class="pwarn">' + m[1] + ' 이(가) 아직 꺼져 있습니다. 아래 버튼으로 켜세요.</div>') +
        '<div class="pbtns"><button class="tb" data-act="periph" data-p="' + m[1] + '">' + m[1] + ' 설정으로</button></div>';
    }
    if (cfg.label) html += '<div class="pdesc">main.h 에 생성: <code>#define ' + esc(cfg.label) + '_Pin GPIO_PIN_' + (+pin.slice(2)) + '</code> / <code>' + esc(cfg.label) + '_GPIO_Port GPIO' + pin[1] + '</code></div>';
    var used = app.project.wires.filter(function (w) { return w[0] === pin; });
    if (used.length) html += '<div class="pdesc">연결: ' + used.map(function (w) { return esc(w[1]); }).join(', ') + '</div>';
    return html;
  };
  Props.prototype.r_periph = function (c) {
    var app = this.app, P = app.project, k = c.p, cfg = P.periph[k] || {}, info = app.chip.periph[k] || {}, html = '<h4>' + k + ' <span class="type">' + (info.kind || '') + '</span></h4>';
    var on = global.STM32Codegen.activePeriph(P).indexOf(k) >= 0;
    if (/^USART/.test(k)) {
      html += '<div class="prow"><label>모드</label><select data-k="pp.mode">' + opt([['off', 'Disable'], ['async', 'Asynchronous']], cfg.mode || 'off') + '</select></div>';
      if (on) html += '<div class="prow"><label>보레이트</label><select data-k="pp.baud">' + opt(['9600', '19200', '38400', '57600', '115200', '230400'], cfg.baud || 115200) + '</select></div>' +
        '<div class="pdesc">8 data bits, no parity, 1 stop. 핀: TX ' + esc(app.pinsFor(k, 'TX').join('/') || info.pins.TX) + ', RX ' + esc(app.pinsFor(k, 'RX').join('/') || info.pins.RX) + '</div>' +
        this.nvicRow(info.irq, k + ' global interrupt') + '<div class="pdesc">핸들 <code>' + global.STM32Codegen.handleName(k) + '</code> · 콜백 <code>HAL_UART_RxCpltCallback</code></div>';
    } else if (/^I2C/.test(k)) {
      html += '<div class="prow"><label>모드</label><select data-k="pp.mode">' + opt([['off', 'Disable'], ['i2c', 'I2C']], cfg.mode || 'off') + '</select></div>';
      if (on) html += '<div class="prow"><label>속도</label><select data-k="pp.speed">' + opt([[100000, 'Standard 100 kHz'], [400000, 'Fast 400 kHz']], cfg.speed || 100000) + '</select></div>' +
        '<div class="pdesc">핀: SCL ' + esc(app.pinsFor(k, 'SCL').join('/') || info.pins.SCL) + ', SDA ' + esc(app.pinsFor(k, 'SDA').join('/') || info.pins.SDA) + ' · 핸들 <code>' + global.STM32Codegen.handleName(k) + '</code></div>';
    } else if (/^SPI/.test(k)) {
      html += '<div class="prow"><label>모드</label><select data-k="pp.mode">' + opt([['off', 'Disable'], ['master', 'Full-Duplex Master']], cfg.mode || 'off') + '</select></div>';
      if (on) html += '<div class="prow"><label>프리스케일러</label><select data-k="pp.prescaler">' + opt([2, 4, 8, 16, 32, 64, 128, 256], cfg.prescaler || 16) + '</select></div>' +
        '<div class="pdesc">CPOL=Low, CPHA=1Edge, 8 bit MSB first, NSS=Software. 핀: SCK ' + esc(app.pinsFor(k, 'SCK').join('/') || info.pins.SCK) + ', MISO ' + esc(app.pinsFor(k, 'MISO').join('/') || info.pins.MISO) + ', MOSI ' + esc(app.pinsFor(k, 'MOSI').join('/') || info.pins.MOSI) + '</div>';
    } else if (/^TIM/.test(k)) {
      html += '<div class="prow"><label>활성화</label><input type="checkbox" data-k="pp.enabled"' + (on ? ' checked' : '') + '></div>';
      if (on) {
        var psc = cfg.psc != null ? cfg.psc : 0, arr = cfg.arr != null ? cfg.arr : 65535, f = app.timclk / (psc + 1) / (arr + 1);
        html += '<div class="prow"><label>Prescaler (PSC)</label><input type="number" min="0" max="65535" data-k="pp.psc" value="' + psc + '"></div>' +
          '<div class="prow"><label>Counter Period (ARR)</label><input type="number" min="1" max="' + (info.bits === 32 ? 4294967295 : 65535) + '" data-k="pp.arr" value="' + arr + '"></div>' +
          '<div class="pdesc">타이머 클럭 ' + (app.timclk / 1e6) + ' MHz → 카운트 ' + (app.timclk / (psc + 1) / 1e3).toFixed(3) + ' kHz → 주기 <b>' + (f >= 1 ? f.toFixed(3) + ' Hz' : (1 / f).toFixed(3) + ' s') + '</b> (' + (1000 / f).toFixed(3) + ' ms)</div>';
        [1, 2, 3, 4].forEach(function (ch) {
          var pin = info.chPins && info.chPins[ch], v = (cfg.ch || {})[ch] || 'disable';
          html += '<div class="prow"><label>Channel ' + ch + ' <span class="type">' + esc(app.pinsFor(k, 'CH' + ch).join('/') || pin || '') + '</span></label><select data-k="pp.ch' + ch + '">' + opt([['disable', 'Disable'], ['pwm', 'PWM Generation CH' + ch]], v) + '</select></div>';
          if (v === 'pwm') html += '<div class="prow"><label>Pulse (CCR' + ch + ')</label><input type="number" min="0" data-k="pp.pulse' + ch + '" value="' + ((cfg.pulse || {})[ch] || 0) + '"></div>';
        });
        html += this.nvicRow(info.irq, k + ' global interrupt') + '<div class="pdesc">핸들 <code>' + global.STM32Codegen.handleName(k) + '</code> · 콜백 <code>HAL_TIM_PeriodElapsedCallback(&amp;htim)</code></div>';
      }
    } else if (k === 'ADC1') {
      var chans = cfg.channels || [];
      html += '<div class="pdesc">켤 채널을 고르세요 (rank 순서 = 고른 순서). 12비트, 0–4095.</div>';
      for (var ch = 0; ch <= 15; ch++) {
        var pin = global.STM32Chips.adcPin(app.chip, ch); if (!pin) continue;
        var idx = chans.indexOf(ch);
        html += '<div class="chk"><input type="checkbox" data-k="adc.' + ch + '"' + (idx >= 0 ? ' checked' : '') + '><span>IN' + ch + ' <span class="type">' + pin + '</span></span><span class="irq">' + (idx >= 0 ? 'rank ' + (idx + 1) : '') + '</span></div>';
      }
      html += '<div class="prow"><label>연속 변환</label><input type="checkbox" data-k="pp.continuous"' + (cfg.continuous ? ' checked' : '') + '></div>' + this.nvicRow(info.irq, 'ADC global interrupt');
      html += '<div class="pdesc">핸들 <code>hadc1</code> · 여러 채널 폴링 시 Start/Poll/GetValue 를 채널 수만큼 반복.</div>';
    }
    return html;
  };
  Props.prototype.nvicRow = function (irq, label) {
    return '<div class="chk"><input type="checkbox" data-k="nvic.' + irq + '"' + (this.app.project.nvic[irq] ? ' checked' : '') + '><span>NVIC: ' + esc(label) + '</span><span class="irq">' + irq + '_IRQn</span></div>';
  };
  Props.prototype.r_NVIC = function () {
    var app = this.app, P = app.project, chip = app.chip, html = '<h4>NVIC 인터럽트</h4><div class="pdesc">켠 인터럽트만 HAL 콜백이 호출됩니다 (CubeMX 의 NVIC Settings 탭).</div>';
    var lines = {};
    Object.keys(P.pins).forEach(function (p) { if (P.pins[p].signal === 'GPIO_EXTI') lines[global.STM32Codegen.exti(+p.slice(2))] = (lines[global.STM32Codegen.exti(+p.slice(2))] || []).concat(p); });
    Object.keys(lines).forEach(function (l) { html += '<div class="chk"><input type="checkbox" data-k="nvic.' + l + '"' + (P.nvic[l] ? ' checked' : '') + '><span>' + l + ' (' + lines[l].join(', ') + ')</span><span class="irq">EXTI</span></div>'; });
    global.STM32Codegen.activePeriph(P).forEach(function (k) { var irq = chip.periph[k].irq; if (irq) html += '<div class="chk"><input type="checkbox" data-k="nvic.' + irq + '"' + (P.nvic[irq] ? ' checked' : '') + '><span>' + k + ' global interrupt</span><span class="irq">' + irq + '</span></div>'; });
    return html;
  };
  Props.prototype.r_GPIO = function () {
    var P = this.app.project, html = '<h4>GPIO 요약</h4>';
    Object.keys(P.pins).sort().forEach(function (p) { var c = P.pins[p]; if (!c.signal || c.signal === 'Reset_State') return; html += '<div class="prow"><label>' + p + '</label><span class="val">' + esc(c.signal) + (c.label ? ' · ' + esc(c.label) : '') + (c.pull && c.pull !== 'none' ? ' · pull-' + c.pull : '') + '</span></div>'; });
    return html;
  };

  // ---------------------------------------------------------------- 값 적용
  Props.prototype.apply = function (key, v, inp) {
    var app = this.app, P = app.project, c = this.ctx, parts = key.split('.'), head = parts[0], k = parts.slice(1).join('.');
    if (head === 'proj') {
      if (k === 'name') P.name = v; else if (k === 'board') { app.setBoard(v); return; }
      else if (k === 'sysclk') { P.clock = { sysclk: +v }; app.onClockChange(); }
      else if (k === 'printfFloat') { P.settings = P.settings || {}; P.settings.printfFloat = !!v; }
      app.dirty(); app.refreshHeader(); return;
    }
    if (head === 'port') { app.connect(v || null, c.id, k); this.render(); return; }
    if (head === 'prop') {
      var n = app.nodeById(c.id); n.props = n.props || {}; n.props[k] = v;
      if (inp.type === 'range') inp.parentNode.querySelector('.val').textContent = v;
      app.onNodePropChange(n, k); return;
    }
    if (head === 'pin') {
      var cfg = P.pins[c.pin] = P.pins[c.pin] || {};
      if (k === 'signal') { if (v === 'Reset_State') delete P.pins[c.pin]; else { cfg.signal = v; if (!/^GPIO_/.test(v)) { delete cfg.label; delete cfg.pull; } app.onSignalSet(c.pin, v); } }
      else if (k === 'level' || k === 'od') cfg[k] = +v; else if (k === 'label') { if (v.trim()) cfg.label = v.trim().replace(/[^\w]/g, '_'); else delete cfg.label; } else cfg[k] = v;
      app.dirty(); app.refreshDesign(); this.render(); return;
    }
    if (head === 'nvic') { P.nvic[k] = !!v; app.dirty(); app.refreshDesign(); return; }
    if (head === 'pp') {
      var pc = P.periph[c.p] = P.periph[c.p] || {}, m;
      if (k === 'mode') { if (v === 'off') delete P.periph[c.p]; else { pc.mode = v; app.onPeriphOn(c.p); } }
      else if (k === 'enabled') { if (v) { pc.enabled = true; if (pc.psc == null) pc.psc = 0; if (pc.arr == null) pc.arr = 65535; app.onPeriphOn(c.p); } else delete P.periph[c.p]; }
      else if ((m = /^ch(\d)$/.exec(k))) { pc.ch = pc.ch || {}; if (v === 'disable') delete pc.ch[m[1]]; else { pc.ch[m[1]] = v; app.onPwmOn(c.p, +m[1]); } }
      else if ((m = /^pulse(\d)$/.exec(k))) { pc.pulse = pc.pulse || {}; pc.pulse[m[1]] = +v; }
      else if (k === 'continuous') pc.continuous = !!v;
      else pc[k] = isNaN(+v) ? v : +v;
      app.dirty(); app.refreshDesign(); this.render(); return;
    }
    if (head === 'adc') {
      var ac = P.periph.ADC1 = P.periph.ADC1 || { channels: [] }, ch = +k; ac.channels = ac.channels || [];
      if (v) { if (ac.channels.indexOf(ch) < 0) ac.channels.push(ch); app.onSignalSet(global.STM32Chips.adcPin(app.chip, ch), 'ADC1_IN' + ch, true); }
      else { ac.channels = ac.channels.filter(function (x) { return x !== ch; }); var pin = global.STM32Chips.adcPin(app.chip, ch); if (pin && P.pins[pin] && P.pins[pin].signal === 'ADC1_IN' + ch) delete P.pins[pin]; }
      if (!ac.channels.length) delete P.periph.ADC1;
      app.dirty(); app.refreshDesign(); this.render();
    }
  };
  Props.prototype.act = function (a, d) {
    var app = this.app;
    if (a === 'delnode') app.removeNode(d.id);
    else if (a === 'delwire') app.removeWire(+d.i);
    else if (a === 'periph') app.selectPeriph(d.p);
    else if (a === 'fit') app.canvas.fit();
    else if (a === 'new') app.newProject();
  };

  global.SimProps = Props;
})(window);
