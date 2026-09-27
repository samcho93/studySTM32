/*
 * app.js — 시뮬레이터 셸: 프로젝트 상태, 코드 생성 · 빌드 · 실행 루프, 패널 연결
 */
(function (global) {
  'use strict';
  var C = global.STM32Chips, G = global.STM32Codegen, R = global.STM32Runtime, D = global.STM32Devices, PJ = global.STM32Project;
  var STORE = 'studystm32.sim.project.v1';
  var $ = function (id) { return document.getElementById(id); };

  var app = {
    project: null, chip: null, board: null, machine: null, devices: [], mod: null,
    selPin: null, selPeriph: null, running: false, paused: false, speed: 1, dirtyFlag: false, lastRaf: 0
  };
  global.app = app;

  // ---------------------------------------------------------------- 프로젝트
  function emptyProject(mcu, board) { return PJ.create(mcu, board); }
  app.loadProject = function (P) {
    app.stop();
    PJ.normalize(P);
    app.project = P; app.chip = C.CHIPS[P.mcu]; app.board = P.board ? C.BOARDS[P.board] : null;
    app.onClockChange();
    app.selPin = null; app.selPeriph = null;
    if (!P.mainc) P.mainc = G.genMainC(P, P.user ? G.userFromExample(P.user) : {});
    app.openFiles();
    app.refreshHeader(); app.refreshDesign(); app.props.set({ kind: 'project' });
    app.makeMachine();
    app.result.clearLog();
    app.result.log('info', '프로젝트 열림: ' + (P.name || '') + ' — ' + app.chip.part + (app.board ? ' / ' + app.board.title : ' (MCU 만)'));
    setTimeout(function () { app.canvas.fit(); }, 30);
  };
  app.newProject = function () { if (!confirm('새 프로젝트를 만들까요? 현재 작업은 사라집니다.')) return; app.loadProject(emptyProject(app.project.mcu, app.project.board)); app.dirty(); };
  /** MCU / 보드 바꾸기: 사용자 장치·배선·USER CODE 는 유지, 핀·주변장치는 새 기본값 */
  app.setMcu = function (mcu, board) {
    var P = app.project, np = emptyProject(mcu, board);
    np.name = P.name; np.nodes = P.nodes.filter(function (n) { return !D.DEVICES[n.type].builtin; });
    var ids = {}; np.nodes.forEach(function (n) { ids[n.id] = 1; });
    np.wires = P.wires.filter(function (w) { return ids[w[1].split('.')[0]]; });
    np.user = G.extractUser(P.mainc); np.mainc = null; np.settings = P.settings; np.lesson = P.lesson;
    app.loadProject(np); app.regen(); app.dirty();
    app.toast(C.CHIPS[np.mcu].part + (np.board ? ' · ' + C.BOARDS[np.board].title : ' (MCU 만)'));
  };
  app.setBoard = function (id) { app.setMcu(id && C.BOARDS[id] ? C.BOARDS[id].chip : app.project.mcu, id || null); };
  app.dirty = function () { app.dirtyFlag = true; clearTimeout(app._saveT); app._saveT = setTimeout(app.save, 500); };
  app.save = function () {
    try { app.project.mainc = app.editor.get('Core/Src/main.c'); localStorage.setItem(STORE, JSON.stringify(app.project)); } catch (e) { }
  };
  app.refreshHeader = function () {
    $('proj-name').textContent = app.project.name || 'stm32_project'; $('proj-board').textContent = app.chip.part + (app.board ? ' · ' + app.board.title : '');
    var l = $('lesson-link'); if (app.project.lesson) { l.hidden = false; l.href = '../lessons/' + app.project.lesson + '.html'; } else l.hidden = true;
  };
  app.refreshDesign = function () { app.canvas.render(); app.pinout.render(); app.tree(); };
  app.onClockChange = function () {
    var mhz = (app.project.clock && app.project.clock.sysclk) || app.chip.defClk;
    if (app.chip.sysclks.indexOf(mhz) < 0) { mhz = app.chip.defClk; app.project.clock = {}; }
    app.clk = C.clocks(app.chip, mhz); app.timclk = app.clk.tim1 * 1e6;
    if ($('area-design').querySelector('.tabpane[data-pane=clock]').classList.contains('active')) app.clockPane();
  };
  /** 타이머 k 의 클럭(Hz) — APB2 타이머(TIM1/9/10/11)는 apb2 기준 */
  app.timclkOf = function (k) { var info = app.chip.periph[k]; return ((info && info.bus === 'APB2') ? app.clk.tim2 : app.clk.tim1) * 1e6; };

  // ---------------------------------------------------------------- 파일
  app.openFiles = function () {
    var P = app.project, ed = app.editor, hp = app.chip.halPrefix;
    Object.keys(ed.files).forEach(function (f) { ed.close(f); });
    ed.open('Core/Src/main.c', P.mainc, false);
    ed.open('Core/Inc/main.h', G.genMainH(P), true);
    Object.keys(global.STM32_HAL_HEADERS).forEach(function (h) { ed.open('Drivers/' + app.chip.hal + '/Inc/' + h.replace('stm32xx', hp), global.STM32_HAL_HEADERS[h], true); });
    ed.open((P.name || 'stm32_project') + '.ioc', G.genIoc(P), true);
    ed.show('Core/Src/main.c');
  };
  app.tree = function () {
    var P = app.project, ul = $('tree'), items = [
      ['dir', 0, (P.name || 'stm32_project'), null], ['dir', 1, 'Core', null], ['dir', 2, 'Inc', null], ['h', 3, 'main.h', 'Core/Inc/main.h'], ['dir', 2, 'Src', null], ['c', 3, 'main.c', 'Core/Src/main.c'],
      ['dir', 1, 'Drivers', null], ['dir', 2, app.chip.hal, null], ['dir', 3, 'Inc', null]];
    Object.keys(global.STM32_HAL_HEADERS).forEach(function (h) { var n = h.replace('stm32xx', app.chip.halPrefix); items.push(['h ro', 4, n, 'Drivers/' + app.chip.hal + '/Inc/' + n]); });
    items.push(['ioc ro', 1, (P.name || 'stm32_project') + '.ioc', (P.name || 'stm32_project') + '.ioc']);
    ul.innerHTML = items.map(function (it) { return '<li class="' + it[0] + (it[3] === app.editor.cur ? ' active' : '') + '" style="--d:' + it[1] + '"' + (it[3] ? ' data-f="' + it[3] + '"' : '') + '><i></i>' + it[2] + '</li>'; }).join('');
    ul.querySelectorAll('li[data-f]').forEach(function (li) { li.onclick = function () { app.showTab('design', 'code'); app.editor.show(li.dataset.f); app.tree(); }; });
  };

  // ---------------------------------------------------------------- 노드 · 배선
  app.nodeById = function (id) { return app.project.nodes.filter(function (n) { return n.id === id; })[0]; };
  app.deviceById = function (id) { return (app.devices || []).filter(function (d) { return d.node.id === id; })[0]; };
  app.addNode = function (type, x, y) {
    var d = D.DEVICES[type], base = { led: 'led', button: 'sw', pot: 'pot', ldr: 'cds', buzzer: 'bz', fnd: 'fnd', lcd1602: 'lcd', motor: 'motor', servo: 'servo', stepper: 'step', uart: 'ser', i2cdev: 'i2c', spidev: 'spi', logic: 'la', rgb: 'rgb' }[type] || type, k = 1;
    while (app.nodeById(base + k)) k++;
    var n = { id: base + k, type: type, x: Math.round(x), y: Math.round(y), props: {} };
    d.props.forEach(function (p) { n.props[p.key] = p.default; });
    if (n.props.label !== undefined) n.props.label = base.toUpperCase() + k;
    app.project.nodes.push(n); app.dirty(); app.rebuildDevices(); app.canvas.select({ kind: 'node', id: n.id });
    app.toast(d.name + ' 추가됨 — 포트를 MCU 핀으로 끌어 연결하세요');
  };
  app.removeNode = function (id) {
    var n = app.nodeById(id); if (!n || D.DEVICES[n.type].builtin) return;
    app.project.nodes = app.project.nodes.filter(function (x) { return x.id !== id; });
    app.project.wires = app.project.wires.filter(function (w) { return w[1].split('.')[0] !== id; });
    app.dirty(); app.rebuildDevices(); app.refreshDesign(); app.selectNone();
  };
  app.removeWire = function (i) { app.project.wires.splice(i, 1); app.dirty(); app.rebuildDevices(); app.refreshDesign(); };
  /** pin(null 이면 끊기) ↔ node.port 연결 + 핀 자동 설정 */
  app.connect = function (pin, nodeId, port) {
    var P = app.project, key = nodeId + '.' + port;
    P.wires = P.wires.filter(function (w) { return w[1] !== key; });
    if (pin) {
      P.wires.push([pin, key]);
      app.autoConfig(pin, app.nodeById(nodeId), port);
    }
    app.dirty(); app.rebuildDevices(); app.refreshDesign();
    if (app.props.ctx.kind === 'node') app.props.render();
  };
  /** 배선에 맞춰 핀 신호 자동 지정 (이미 설정된 핀은 건드리지 않음) */
  app.autoConfig = function (pin, n, port) {
    var P = app.project, cfg = P.pins[pin], d = D.DEVICES[n.type], pdef = d.ports.filter(function (p) { return p.id === port; })[0];
    if (cfg && cfg.signal && cfg.signal !== 'Reset_State' && !(n.type === 'servo' || n.type === 'lcd1602' || n.type === 'uart' || n.type === 'i2cdev' || n.type === 'spidev' || (n.type === 'motor' && port === 'en'))) return;
    var af = app.chip.af[pin] || [], pick = function (re) { return af.filter(function (s) { return re.test(s); })[0]; }, sig = null, extra = {};
    if (n.type === 'servo' || (n.type === 'motor' && port === 'en') || (n.type === 'buzzer' && n.props.kind === 'passive')) {
      sig = pick(/^TIM\d+_CH\d$/); if (sig) { var m = /^(TIM\d+)_CH(\d)$/.exec(sig); app.onPeriphOn(m[1]); app.onPwmOn(m[1], +m[2]); if (n.type === 'servo') { P.periph[m[1]].psc = Math.round(app.timclkOf(m[1]) / 1e6) - 1; P.periph[m[1]].arr = 19999; } else if (P.periph[m[1]].arr === 65535) { P.periph[m[1]].psc = Math.round(app.timclkOf(m[1]) / 1e6) - 1; P.periph[m[1]].arr = 999; } }
      else { sig = 'GPIO_Output'; app.toast(pin + ' 에는 타이머 채널이 없어 GPIO 출력으로 설정했습니다.'); }
    } else if (pdef.dir === 'in') { sig = n.type === 'uart' || n.type === 'vcp' ? (pick(/^USART\d_TX$/) || null) : 'GPIO_Output'; if (n.type === 'uart' && sig) app.onPeriphOn(sig.split('_')[0]); }
    else if (pdef.dir === 'out') {
      if (n.type === 'uart' || n.type === 'vcp') { sig = pick(/^USART\d_RX$/); if (sig) app.onPeriphOn(sig.split('_')[0]); }
      else if (n.type === 'spidev') { sig = pick(/^SPI\d_MISO$/); if (sig) app.onPeriphOn(sig.split('_')[0]); }
      else { sig = 'GPIO_Input'; if (n.type === 'button' || n.type === 'board-button') extra.pull = n.props.wiring === 'gnd' ? 'up' : n.props.wiring === 'vcc' ? 'down' : 'none'; }
    } else if (pdef.dir === 'analog') { sig = pick(/^ADC1_IN\d+$/); if (sig) { var ch = +sig.slice(8); P.periph.ADC1 = P.periph.ADC1 || { channels: [] }; if (P.periph.ADC1.channels.indexOf(ch) < 0) P.periph.ADC1.channels.push(ch); } else app.toast(pin + ' 은(는) ADC 채널이 없는 핀입니다 (PA0–PA7, PB0, PB1, PC0–PC5).'); }
    else if (pdef.dir === 'io') {
      if (n.type === 'lcd1602' || n.type === 'i2cdev') { sig = pick(port === 'scl' ? /^I2C\d_SCL$/ : /^I2C\d_SDA$/); if (sig) app.onPeriphOn(sig.split('_')[0]); else app.toast(pin + ' 은(는) I2C ' + port.toUpperCase() + ' 로 쓸 수 없는 핀입니다 (I2C1: PB6/PB7 또는 PB8/PB9).'); }
    }
    if (n.type === 'spidev' && (port === 'sck' || port === 'mosi')) { sig = pick(port === 'sck' ? /^SPI\d_SCK$/ : /^SPI\d_MOSI$/); if (sig) app.onPeriphOn(sig.split('_')[0]); }
    if (n.type === 'spidev' && port === 'cs') { sig = 'GPIO_Output'; extra.level = 1; extra.label = 'CS'; }
    if (!sig) return;
    P.pins[pin] = Object.assign({ signal: sig }, extra);
    if (sig === 'GPIO_Output' || sig === 'GPIO_Input') { var lbl = (n.props && n.props.label) || n.id.toUpperCase(); if (d.ports.length > 1) lbl += '_' + port.toUpperCase(); P.pins[pin].label = lbl.replace(/[^\w]/g, '_'); }
    app.onSignalSet(pin, sig, true);
  };
  app.onSignalSet = function (pin, sig, quiet) {
    var P = app.project, m = /^(USART\d|I2C\d|SPI\d|TIM\d+)_/.exec(sig);
    if (!pin) return;
    if (m) app.onPeriphOn(m[1]);
    var t = /^(TIM\d+)_CH(\d)$/.exec(sig); if (t) app.onPwmOn(t[1], +t[2]);
    var a = /^ADC1_IN(\d+)$/.exec(sig); if (a) { P.periph.ADC1 = P.periph.ADC1 || { channels: [] }; if (P.periph.ADC1.channels.indexOf(+a[1]) < 0) P.periph.ADC1.channels.push(+a[1]); }
    if (sig === 'GPIO_EXTI') { P.nvic[G.exti(+pin.slice(2), app.chip)] = true; if (!P.pins[pin].trigger) P.pins[pin].trigger = 'falling'; }
    // 같은 신호를 다른 핀이 갖고 있으면 그쪽을 지운다 (CubeMX 처럼 한 신호 = 한 핀)
    if (m || a) Object.keys(P.pins).forEach(function (p) { if (p !== pin && P.pins[p].signal === sig) delete P.pins[p]; });
    if (!quiet) app.toast(pin + ' → ' + sig);
  };
  app.onPeriphOn = function (k) {
    var P = app.project, c = P.periph[k] = P.periph[k] || {};
    if (/^USART/.test(k)) { c.mode = 'async'; c.baud = c.baud || 115200; }
    else if (/^I2C/.test(k)) { c.mode = 'i2c'; c.speed = c.speed || 100000; }
    else if (/^SPI/.test(k)) { c.mode = 'master'; c.prescaler = c.prescaler || 16; }
    else if (/^TIM/.test(k)) { c.enabled = true; if (c.psc == null) c.psc = 0; if (c.arr == null) c.arr = 65535; }
    // 기본 핀이 비어 있으면 배정
    var info = app.chip.periph[k];
    if (info && info.pins) Object.keys(info.pins).forEach(function (s) {
      var has = Object.keys(P.pins).some(function (p) { return P.pins[p].signal === k + '_' + s; });
      if (!has) { var pin = info.pins[s]; if (!P.pins[pin] || !P.pins[pin].signal || P.pins[pin].signal === 'Reset_State') P.pins[pin] = { signal: k + '_' + s }; }
    });
  };
  app.onPwmOn = function (tim, ch) {
    var P = app.project, c = P.periph[tim]; c.ch = c.ch || {}; c.ch[ch] = 'pwm';
    var sig = tim + '_CH' + ch, has = Object.keys(P.pins).some(function (p) { return P.pins[p].signal === sig; });
    if (!has) { var pin = app.chip.periph[tim].chPins[ch]; if (pin && (!P.pins[pin] || !P.pins[pin].signal)) P.pins[pin] = { signal: sig }; }
  };
  app.pinsFor = function (periph, sig) { var P = app.project; return Object.keys(P.pins).filter(function (p) { return P.pins[p].signal === periph + '_' + sig; }); };
  app.onNodePropChange = function (n, k) {
    app.dirty();
    var inst = app.deviceById(n.id);
    if (inst && inst.apply) inst.apply();
    if (k === 'wiring' && n.conn && n.conn.out) { var cfg = app.project.pins[n.conn.out]; if (cfg && cfg.signal === 'GPIO_Input' || cfg && cfg.signal === 'GPIO_EXTI') { cfg.pull = n.props.wiring === 'gnd' ? 'up' : n.props.wiring === 'vcc' ? 'down' : 'none'; } }
    if (!inst || k === 'kind' || k === 'baud' || k === 'addr') app.rebuildDevices();
    app.refreshDesign(); app.props.render();
  };

  // ---------------------------------------------------------------- 선택
  app.selectNode = function (id) { app.props.set({ kind: 'node', id: id }); };
  app.selectWire = function (i) { app.props.set({ kind: 'wire', i: i }); };
  app.selectNone = function () { if (app.props.ctx.kind !== 'project') app.props.set({ kind: 'project' }); };
  app.selectPin = function (pin) { app.selPin = pin; app.selPeriph = null; app.pinout.render(); app.props.set({ kind: 'pin', pin: pin }); };
  app.selectPeriph = function (k) { app.selPeriph = k; app.selPin = null; app.pinout.render(); app.showTab('design', 'pinout'); app.props.set(k === 'NVIC' || k === 'GPIO' ? { kind: k } : { kind: 'periph', p: k }); };
  app.showTab = function (area, tab) {
    var sec = $('area-' + area);
    sec.querySelectorAll('.atab').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === tab); });
    sec.querySelectorAll('.tabpane').forEach(function (p) { p.classList.toggle('active', p.dataset.pane === tab); });
    if (area === 'design' && tab === 'clock') app.clockPane();
    if (area === 'design' && tab === 'code') app.editor.render();
    if (area === 'result' && tab === 'vars') app.result.updateVars();
  };
  app.summary = function (inst) {
    var s = inst.state(), t = inst.def.type;
    if (t === 'led' || t === 'board-led') return s.on > .99 ? 'ON' : s.on < .01 ? 'OFF' : Math.round(s.on * 100) + '%';
    if (t === 'button' || t === 'board-button') return s.pressed ? '누름' : '';
    if (t === 'pot') return s.value + ' (' + s.volt.toFixed(2) + 'V)'; if (t === 'ldr') return s.lux + ' lux';
    if (t === 'motor') return Math.abs(s.rpm) < 1 ? '정지' : s.rpm.toFixed(0) + ' rpm'; if (t === 'servo') return s.angle.toFixed(0) + '°';
    if (t === 'stepper') return s.angle.toFixed(0) + '°'; if (t === 'lcd1602') return s.rows ? String.fromCharCode.apply(null, s.rows[0]).trim().slice(0, 16) : '';
    if (t === 'buzzer') return s.on ? '♪' : ''; if (t === 'fnd') return '';
    return '';
  };

  // ---------------------------------------------------------------- 클럭/프로젝트 탭
  app.mcuOptions = function (cur) {
    var fams = {}; Object.keys(C.CHIPS).forEach(function (k) { var c = C.CHIPS[k]; (fams[c.family] = fams[c.family] || []).push(c); });
    return Object.keys(fams).map(function (f) { return '<optgroup label="' + f + ' · ' + fams[f][0].core + '">' + fams[f].map(function (c) { return '<option value="' + c.part + '"' + (c.part === cur ? ' selected' : '') + '>' + c.part + ' — ' + c.desc + '</option>'; }).join('') + '</optgroup>'; }).join('');
  };
  app.boardOptions = function (mcu, cur) {
    return '<option value=""' + (!cur ? ' selected' : '') + '>없음 — MCU 만 (맨 칩)</option>' + C.boardsFor(mcu).map(function (b) { return '<option value="' + b + '"' + (b === cur ? ' selected' : '') + '>' + C.BOARDS[b].title + ' (' + C.BOARDS[b].kind + ')</option>'; }).join('');
  };
  app.clockPane = function () {
    var P = app.project, ck = app.clk, mhz = ck.sysclk, ch = app.chip, fam = ch.series, hsi = ch.hsi;
    var pllTxt = fam === 'F4' ? '/16 ×' + (mhz * 2) + ' /2' : fam === 'F1' ? (mhz > 64 ? 'HSE 8 MHz ×' + Math.round(mhz / 8) : '/2 ×' + Math.round(mhz / 4)) : fam === 'F0' ? '/2 ×' + Math.round(mhz / 4) : fam === 'G0' ? '/1 ×8 /' + (mhz >= 64 ? 2 : 4) : '/1 ×10 /' + (mhz >= 80 ? 2 : 4);
    $('clockpane').innerHTML = '<h4>클럭 구성 (Clock Configuration) — ' + ch.part + '</h4><div class="clock-diagram">' +
      '<div class="clock-box"><b>' + (fam === 'F1' && mhz > 64 ? 'HSE' : 'HSI') + '</b>' + (fam === 'F1' && mhz > 64 ? 8 : hsi) + ' MHz</div><span class="clock-arrow">→</span>' +
      (mhz !== hsi ? '<div class="clock-box"><b>PLL</b>' + pllTxt + '</div><span class="clock-arrow">→</span>' : '') +
      '<div class="clock-box"><b>SYSCLK</b><select id="clk-sel">' + ch.sysclks.map(function (m) { return '<option value="' + m + '"' + (m === mhz ? ' selected' : '') + '>' + m + ' MHz</option>'; }).join('') + '</select></div><span class="clock-arrow">→</span>' +
      '<div class="clock-box"><b>HCLK (AHB)</b>' + mhz + ' MHz</div><span class="clock-arrow">→</span>' +
      '<div class="clock-box"><b>APB1</b>/' + ck.div1 + ' = ' + ck.apb1 + ' MHz<br><small>TIM2–5 클럭 ' + ck.tim1 + ' MHz</small></div>' +
      '<div class="clock-box"><b>APB2</b>/' + ck.div2 + ' = ' + ck.apb2 + ' MHz<br><small>TIM1 클럭 ' + ck.tim2 + ' MHz</small></div><div class="clock-box"><b>SysTick</b>1 kHz (HAL_Delay)</div></div>' +
      '<div class="pdesc">APB 버스가 분주되면 그 버스의 타이머 클럭은 ×2 입니다. 업데이트 주기 = (PSC+1)×(ARR+1)/TIMCLK. 최대 클럭 ' + ch.maxClk + ' MHz.</div>' +
      '<h4>프로젝트 관리자</h4>' +
      '<div class="form-row"><label>프로젝트 이름</label><input type="text" id="pm-name" value="' + (P.name || '') + '"></div>' +
      '<div class="form-row"><label>MCU</label><select id="pm-mcu">' + app.mcuOptions(P.mcu) + '</select></div>' +
      '<div class="form-row"><label>보드 프리셋</label><select id="pm-board">' + app.boardOptions(P.mcu, P.board) + '</select><span class="desc">보드를 고르면 내장 LED·버튼·가상 COM 이 회로에 들어가고 기본 핀이 설정됩니다. "없음"은 MCU 만 놓고 직접 배선합니다.</span></div>' +
      '<div class="form-row"><label>MCU 정보</label><span>' + ch.name + ' · ' + ch.core + ' · ' + ch.pkg + ' · Flash ' + ch.flash + ' KB · RAM ' + ch.ram + ' KB' + (ch.note ? '<br><small class="desc">' + ch.note + '</small>' : '') + '</span></div>' +
      '<div class="form-row"><label>툴체인</label><span>STM32CubeIDE (시뮬레이터)</span></div>' +
      '<div class="form-row"><label>printf float</label><input type="checkbox" id="pm-float"' + (P.settings.printfFloat !== false ? ' checked' : '') + '><span class="desc">링커 옵션 -u _printf_float — 켜야 %f 가 출력됩니다.</span></div>' +
      '<div class="form-row"><label>코드 생성</label><span><button class="tb" id="pm-gen">main.c / main.h 다시 생성</button> <small class="desc">USER CODE 구역 보존</small></span></div>';
    $('clk-sel').onchange = function () { P.clock = { sysclk: +this.value }; app.onClockChange(); app.dirty(); app.props.render(); };
    $('pm-name').onchange = function () { P.name = this.value.replace(/[^\w-]/g, '_') || 'stm32_project'; app.refreshHeader(); app.dirty(); app.tree(); };
    $('pm-mcu').onchange = function () { app.setMcu(this.value, null); };
    $('pm-board').onchange = function () { app.setBoard(this.value); };
    $('pm-float').onchange = function () { P.settings.printfFloat = this.checked; app.dirty(); };
    $('pm-gen').onclick = app.regen;
  };

  // ---------------------------------------------------------------- 코드 생성 · 빌드 · 실행
  app.regen = function () {
    var P = app.project, user = G.extractUser(app.editor.get('Core/Src/main.c'));
    P.mainc = G.genMainC(P, user);
    app.editor.open('Core/Src/main.c', P.mainc, false); app.editor.open('Core/Inc/main.h', G.genMainH(P), true); app.editor.open((P.name || 'stm32_project') + '.ioc', G.genIoc(P), true);
    app.editor.show('Core/Src/main.c'); app.showTab('design', 'code');
    app.result.log('build', '코드 생성 완료 — 주변장치: ' + (G.activePeriph(P).join(', ') || '없음') + ' · USER CODE 구역 ' + Object.keys(user).filter(function (k) { return user[k].trim(); }).length + '개 보존');
    app.dirty();
  };
  app.build = function () {
    var P = app.project, src = app.editor.get('Core/Src/main.c'), t0 = performance.now();
    P.mainc = src;
    app.editor.markError(null, 0);
    app.result.log('build', '빌드 시작 (' + (P.name || 'stm32_project') + ' / ' + app.chip.name + ')');
    if (!global.STM32C) { app.result.log('error', '컴파일러(ccompiler.js)가 로드되지 않았습니다.'); return null; }
    var files = { 'Core/Src/main.c': src, 'Core/Inc/main.h': G.genMainH(P) };
    files[app.chip.halPrefix + '_hal.h'] = '/* HAL (simulated) */\n';
    var env = R.compilerEnv();
    var r;
    try { r = global.STM32C.compile({ files: files, entry: 'Core/Src/main.c', env: env }); }
    catch (e) { app.result.log('error', '컴파일러 내부 오류: ' + (e.message || e)); console.error(e); return null; }
    (r.warnings || []).forEach(function (w) { app.result.log('warn', 'main.c:' + (w.line || '?') + ': warning: ' + w.msg, w.line); });
    if (!r.ok) {
      r.errors.forEach(function (e) { app.result.log('error', (e.file || 'main.c').split('/').pop() + ':' + e.line + ':' + (e.col || 1) + ': error: ' + e.msg, e.line); });
      app.result.log('error', '빌드 실패 — 오류 ' + r.errors.length + '개');
      app.editor.markError('Core/Src/main.c', r.errors[0].line); app.showTab('design', 'code'); app.showTab('result', 'console');
      return null;
    }
    var sz = r.size || {};
    app.result.log('ok', '빌드 성공 (' + Math.round(performance.now() - t0) + ' ms) — text ' + (sz.text || 0) + ' B · data ' + (sz.data || 0) + ' B · bss ' + (sz.bss || 0) + ' B  [' + app.chip.name + ' Flash ' + app.chip.flash + ' KB]');
    app.checks();
    return r;
  };
  /** 정적 점검: 흔한 실수 안내 */
  app.checks = function () {
    var src = app.editor.get('Core/Src/main.c'), P = app.project;
    if (/\bprintf\s*\(/.test(src) && !/__io_putchar|_write\s*\(/.test(src)) app.result.log('warn', 'printf 를 쓰지만 __io_putchar() / _write() 리타깃 함수가 없어 출력이 나가지 않습니다.');
    if (/HAL_GPIO_EXTI_Callback/.test(src) && !Object.keys(P.nvic).some(function (k) { return /^EXTI/.test(k) && P.nvic[k]; })) app.result.log('warn', 'EXTI 콜백이 있지만 NVIC 에서 EXTI 인터럽트가 켜져 있지 않습니다.');
    if (/HAL_TIM_PeriodElapsedCallback/.test(src) && !Object.keys(P.nvic).some(function (k) { return /^TIM/.test(k) && P.nvic[k]; })) app.result.log('warn', '타이머 콜백이 있지만 NVIC 에서 TIMx global interrupt 가 켜져 있지 않습니다.');
    if (/HAL_UART_RxCpltCallback/.test(src) && !Object.keys(P.nvic).some(function (k) { return /^USART/.test(k) && P.nvic[k]; })) app.result.log('warn', 'UART 수신 콜백이 있지만 NVIC 에서 USARTx global interrupt 가 켜져 있지 않습니다.');
    if (/%f/.test(src) && P.settings.printfFloat === false) app.result.log('warn', '%f 를 쓰지만 printf float 옵션이 꺼져 있습니다 (클럭 & 프로젝트 탭).');
  };
  app.makeMachine = function () {
    var m = app.machine = new R.Machine({ project: app.project });
    m.on('log', function (lv, msg) { app.result.log(lv, msg); });
    m.on('fault', function (msg, line) { app.editor.markError('Core/Src/main.c', line); app.setRunState(); });
    m.on('terminal', function (inst, bytes) { app.result.termWrite(inst, bytes); });
    m.on('bus', function (ev) { app.busLog(ev); });
    app.rebuildDevices();
  };
  app.rebuildDevices = function () {
    if (!app.machine) return;
    var nodes = app.project.nodes;
    app.devices = D.instantiate(app.machine, nodes, app.project.wires);
    app.result.build();
  };
  app.run = function () {
    if (app.running) { app.stop(); return; }
    var r = app.build(); if (!r) return;
    app.makeMachine();
    try { app.machine.load(r.js); } catch (e) { app.result.log('error', '로드 실패: ' + (e.message || e)); console.error(e); return; }
    app.running = true; app.paused = false; app.lastRaf = performance.now();
    app.setRunState();
    app.showTab('result', app.devices.some(function (d) { return d.def.type === 'uart' || d.def.type === 'vcp'; }) && /printf|HAL_UART_Transmit/.test(app.project.mainc) && !app.devices.some(function (d) { return !d.def.builtin; }) ? 'terminal' : 'devices');
    requestAnimationFrame(app.frame);
  };
  app.stop = function () {
    if (!app.running && !app.machine) return;
    app.running = false; app.paused = false;
    if (app.machine) { app.machine.state = 'idle'; }
    app.audio(null, 0);
    app.setRunState(); app.editor.markCurrent(0);
    app.makeMachine();
    app.result.log('info', '정지 · 리셋');
  };
  app.pause = function () { if (!app.running) return; app.paused = !app.paused; if (!app.paused) { app.lastRaf = performance.now(); requestAnimationFrame(app.frame); } app.setRunState(); };
  app.setRunState = function () {
    var m = app.machine, st = $('run-status'), run = $('btn-run');
    var s = !app.running ? 'idle' : app.paused ? 'paused' : (m && (m.state === 'fault' || m.state === 'halted')) ? 'fault' : m && m.state === 'done' ? 'done' : 'running';
    st.className = 'run-status ' + s; st.querySelector('b').textContent = { idle: '대기', paused: '일시정지', fault: '정지(오류)', done: '종료', running: '실행 중' }[s];
    run.classList.toggle('running', app.running); run.querySelector('span').textContent = app.running ? '정지' : '실행';
    run.querySelector('svg').innerHTML = app.running ? '<rect x="6" y="6" width="12" height="12" rx="1"/>' : '<path d="M7 4l12 8-12 8z"/>';
    $('btn-pause').disabled = !app.running; $('btn-stop').disabled = !app.running;
  };
  app.frame = function (now) {
    if (!app.running || app.paused) return;
    var m = app.machine, dt = Math.min(100, now - app.lastRaf); app.lastRaf = now;
    if (m.state === 'running') m.step(dt * app.speed, 12);
    (app.devices || []).forEach(function (d) { if (d.tick) d.tick(dt * app.speed); });
    m.frameMark();
    app.result.update(); app.canvas.updateLive();
    $('run-time').textContent = (m.now() / 1000).toFixed(3) + ' s';
    if ($('area-result').querySelector('.tabpane[data-pane=wave]').classList.contains('active')) app.result.updateWave();
    if ((app._vf = (app._vf || 0) + 1) % 10 === 0) { if ($('area-result').querySelector('.tabpane[data-pane=vars]').classList.contains('active')) app.result.updateVars(); if ($('area-design').querySelector('.tabpane[data-pane=code]').classList.contains('active')) app.editor.markCurrent(m.$.l); }
    if (m.state !== 'running') { app.setRunState(); if (m.state === 'fault' || m.state === 'halted') { app.showTab('result', 'console'); } }
    requestAnimationFrame(app.frame);
  };
  app.busLog = function (ev) {
    app._bus = app._bus || { n: 0, t: 0 };
    if (ev.kind === 'i2c' && !ev.ack) return;   // 경고는 runtime 이 이미 냄
    if (app.machine.now() - app._bus.t >= 1000) { if (app._bus.n > 20) app.result.log('info', '… 버스 로그 ' + (app._bus.n - 20) + '건 생략 (장치 카드에서 확인)'); app._bus.n = 0; app._bus.t = app.machine.now(); }
    if (app._bus.n++ >= 20) return;
    var hx = function (a) { return a.map(D.hex).join(' '); };
    if (ev.kind === 'i2c') app.result.log('info', ev.bus + ' ' + ev.dir + ' 0x' + ev.addr.toString(16).toUpperCase() + ': ' + hx(ev.bytes.slice(0, 16)) + (ev.bytes.length > 16 ? ' …' : ''));
    else if (ev.kind === 'spi') app.result.log('info', ev.bus + ' TX ' + hx(ev.tx.slice(0, 12)) + ' / RX ' + hx(ev.rx.slice(0, 12)));
  };
  // 부저 소리 (WebAudio)
  app.audio = function (id, freq) {
    app._osc = app._osc || {};
    if (!freq) { if (id == null) { Object.keys(app._osc).forEach(function (k) { try { app._osc[k].stop(); } catch (e) { } }); app._osc = {}; } else if (app._osc[id]) { try { app._osc[id].stop(); } catch (e) { } delete app._osc[id]; } return; }
    try {
      app._ac = app._ac || new (window.AudioContext || window.webkitAudioContext)();
      if (!app._osc[id]) { var o = app._ac.createOscillator(), g = app._ac.createGain(); g.gain.value = .05; o.type = 'square'; o.connect(g); g.connect(app._ac.destination); o.start(); app._osc[id] = o; }
      app._osc[id].frequency.value = Math.max(50, Math.min(8000, freq));
    } catch (e) { }
  };

  // ---------------------------------------------------------------- 예제 · 파일
  app.loadExample = function (id) {
    var ex = (global.STM32_EXAMPLES || {})[id]; if (!ex) { app.toast('예제 "' + id + '" 가 없습니다.'); return false; }
    var P = PJ.fromExample(id, ex);
    app.loadProject(P);
    $('proj-name').textContent = ex.title || id;
    app.result.log('info', '예제 "' + (ex.title || id) + '" 를 열었습니다. [실행]을 눌러 보세요.');
    app.dirty();
    return true;
  };
  app.examplesModal = function () {
    var EX = global.STM32_EXAMPLES || {}, ids = Object.keys(EX), html = '<div class="ex-list">';
    if (!ids.length) html += '<div class="dev-empty">등록된 예제가 없습니다.</div>';
    ids.forEach(function (id) { var e = EX[id], cid = C.chipOf(e.mcu || e.board || 'NUCLEO-F411RE').part; html += '<div class="ex-item" data-ex="' + id + '"><b>' + (e.title || id) + '</b><small>' + id + (e.lesson ? ' · ' + e.lesson.toUpperCase() : '') + '</small><div class="ex-board">' + cid + (e.board ? ' · ' + e.board : '') + '</div></div>'; });
    app.modal('레슨 예제', html + '</div>');
    $('modal-body').querySelectorAll('.ex-item').forEach(function (it) { it.onclick = function () { app.closeModal(); app.loadExample(it.dataset.ex); }; });
  };
  app.saveFile = function () {
    app.save();
    var blob = new Blob([JSON.stringify(app.project, null, 1)], { type: 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = (app.project.name || 'stm32_project') + '.stm32sim.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  };
  app.loadFile = function (file) {
    var rd = new FileReader(); rd.onload = function () { try { var P = JSON.parse(rd.result); if (!P.mcu && !P.board) throw new Error('MCU 정보 없음'); app.loadProject(P); app.dirty(); app.toast('프로젝트를 열었습니다'); } catch (e) { app.toast('파일을 읽을 수 없습니다: ' + e.message); } }; rd.readAsText(file);
  };
  app.modal = function (title, html) { $('modal-title').textContent = title; $('modal-body').innerHTML = html; $('modal').hidden = false; };
  app.closeModal = function () { $('modal').hidden = true; };
  app.toast = function (msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(app._tt); app._tt = setTimeout(function () { t.hidden = true; }, 2600); };
  app.help = function () {
    app.modal('시뮬레이터 사용법', '<h4>화면 구성</h4><p><b>디자인 영역</b>(위): 회로 · 핀아웃 &amp; 설정(CubeMX) · 클럭 &amp; 프로젝트 · 코드(CubeIDE). <b>실습 결과 영역</b>(아래): 장치 · 시리얼 터미널 · 파형 · 변수 · 콘솔. 오른쪽 <b>Properties</b>에서 선택한 장치/핀/주변장치를 설정합니다.</p>' +
      '<h4>흐름</h4><ol><li>팔레트에서 장치를 회로에 놓고 포트(점)를 MCU 핀으로 끌어 연결합니다. 핀 신호와 주변장치가 자동으로 설정됩니다.</li><li>핀아웃 탭에서 핀을 클릭해 신호·풀업·EXTI 를 조정하고, 주변장치 목록에서 USART/TIM/ADC/I2C/SPI 와 NVIC 를 설정합니다.</li><li><b>코드 생성</b>을 누르면 main.c / main.h 가 CubeMX 처럼 만들어집니다. 초록으로 표시된 USER CODE 구역에 HAL 코드를 씁니다.</li><li><b>실행</b>(F5) → 결과 영역에서 LED·LCD·모터·터미널을 확인합니다. 버튼·가변저항은 결과 영역에서 직접 조작합니다.</li></ol>' +
      '<h4>단축키</h4><p><span class="kbd">F5</span> 실행/정지 · <span class="kbd">Ctrl+B</span> 빌드 · <span class="kbd">Ctrl+S</span> 저장 · <span class="kbd">Delete</span> 선택한 장치/배선 삭제 · 회로에서 핀 <span class="kbd">더블클릭</span> 핀 설정</p>' +
      '<h4>지원 HAL</h4><p>GPIO · EXTI · UART(폴링/인터럽트, printf 리타깃) · TIM(인터럽트, PWM) · ADC(폴링/IT/DMA) · I2C · SPI · HAL_Delay/GetTick · NVIC. 자세한 원형은 프로젝트 탐색기의 Drivers 헤더 또는 <a href="../lessons/hal-reference.html" target="_blank">HAL 레퍼런스</a>.</p>');
  };

  // ---------------------------------------------------------------- 초기화
  function init() {
    app.editor = new global.SimEditor($('editor'), { onChange: function () { app.dirty(); } });
    app.canvas = new global.SimCanvas($('canvas'), app);
    app.pinout = new global.SimPinout($('pinout'), app);
    app.props = new global.SimProps($('props'), app);
    app.result = new global.SimResult(app);
    // 팔레트
    var cats = {}, pal = $('palette');
    Object.keys(D.DEVICES).forEach(function (t) { var d = D.DEVICES[t]; if (d.builtin) return; (cats[d.cat] = cats[d.cat] || []).push(d); });
    Object.keys(cats).forEach(function (c) {
      pal.insertAdjacentHTML('beforeend', '<div class="pal-cat">' + c + '</div>' + cats[c].map(function (d) { return '<div class="pal-item" draggable="true" data-type="' + d.type + '"><span class="ic" style="background:' + app.canvas.catColor(d.cat) + '">' + d.type.slice(0, 2).toUpperCase() + '</span>' + d.name + '</div>'; }).join(''));
    });
    pal.querySelectorAll('.pal-item').forEach(function (it) {
      it.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/x-device', it.dataset.type); });
      it.addEventListener('click', function () { var n = app.project.nodes.length; app.addNode(it.dataset.type, 340 + (n % 3) * 170, 40 + Math.floor(n / 3) * 120); app.showTab('design', 'circuit'); });
    });
    // 탭
    document.querySelectorAll('.area').forEach(function (sec) {
      sec.querySelectorAll('.atab').forEach(function (b) { b.onclick = function () { app.showTab(sec.id.replace('area-', ''), b.dataset.tab); }; });
    });
    // 툴바
    $('btn-gen').onclick = app.regen; $('btn-build').onclick = app.build; $('btn-run').onclick = app.run; $('btn-pause').onclick = app.pause; $('btn-stop').onclick = app.stop;
    $('sel-speed').onchange = function () { app.speed = +this.value; };
    $('btn-examples').onclick = app.examplesModal; $('btn-save').onclick = app.saveFile; $('btn-load').onclick = function () { $('file-load').click(); };
    $('file-load').onchange = function () { if (this.files[0]) app.loadFile(this.files[0]); this.value = ''; };
    $('btn-help').onclick = app.help; $('modal-close').onclick = app.closeModal; $('modal').onclick = function (e) { if (e.target === this) app.closeModal(); };
    document.addEventListener('keydown', function (e) {
      if (e.key === 'F5') { e.preventDefault(); app.run(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); app.build(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); app.save(); app.toast('저장됨 (브라우저)'); }
      else if (e.key === 'Escape') app.closeModal();
    });
    // 스플리터
    var vs = $('vsplit'), hs = $('hsplit');
    vs.onmousedown = function (e) { e.preventDefault(); var c = $('sim-center'); function mv(ev) { var r = c.getBoundingClientRect(); document.documentElement.style.setProperty('--design-h', Math.max(20, Math.min(85, (ev.clientY - r.top) / r.height * 100)) + '%'); } function up() { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); } window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); };
    hs.onmousedown = function (e) { e.preventDefault(); function mv(ev) { document.documentElement.style.setProperty('--sim-right-w', Math.max(220, Math.min(520, window.innerWidth - ev.clientX)) + 'px'); } function up() { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); } window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); };
    // URL
    var q = new URLSearchParams(location.search);
    if (q.get('embed')) document.body.classList.add('embed');
    var loaded = false;
    if (q.get('ex')) loaded = app.loadExample(q.get('ex'));
    if (!loaded) { var saved = null; try { saved = JSON.parse(localStorage.getItem(STORE)); } catch (e) { } if (saved && (saved.mcu || saved.board)) app.loadProject(saved); else app.loadProject(emptyProject('STM32F411RE', 'NUCLEO-F411RE')); }
    app.setRunState();
    document.addEventListener('themechange', function () { app.canvas.render(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
