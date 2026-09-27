/*
 * chips.js — MCU 카탈로그 (단일 출처)
 * -------------------------------------------------------------------------
 * 프로젝트의 중심은 MCU 이고, 보드는 "내장 장치 + 기본 핀"을 채워 주는 선택 프리셋이다.
 *   CHIPS[part]  : 제품군, 코어, 패키지 핀 배열, 핀별 대체기능(AF), 주변장치·IRQ 이름, 클럭 정보, HAL 접두어
 *   BOARDS[id]   : chip 과 내장 장치(LED·버튼·VCP), 기본 핀 설정
 * 값은 각 데이터시트 "Pin definitions" 표와 레퍼런스 매뉴얼 벡터 표를 기준으로 추렸다.
 * LQFP 핀 순서: F030/F103/F4xx/G071/L476 64핀·F103 48핀·F407 100핀은 데이터시트 순서. 나머지(144핀 등)는 개략 배치(pinsApprox).
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- 패키지 핀 순서
  var LQFP64_F4 = [
    'VBAT', 'PC13', 'PC14', 'PC15', 'PH0', 'PH1', 'NRST', 'PC0', 'PC1', 'PC2', 'PC3', 'VSSA', 'VDDA', 'PA0', 'PA1', 'PA2',
    'PA3', 'VSS', 'VDD', 'PA4', 'PA5', 'PA6', 'PA7', 'PC4', 'PC5', 'PB0', 'PB1', 'PB2', 'PB10', 'PB11', 'VSS', 'VDD',
    'PB12', 'PB13', 'PB14', 'PB15', 'PC6', 'PC7', 'PC8', 'PC9', 'PA8', 'PA9', 'PA10', 'PA11', 'PA12', 'PA13', 'VSS', 'VDD',
    'PA14', 'PA15', 'PC10', 'PC11', 'PC12', 'PD2', 'PB3', 'PB4', 'PB5', 'PB6', 'PB7', 'BOOT0', 'PB8', 'PB9', 'VSS', 'VDD'
  ];
  var LQFP64_F1 = LQFP64_F4.map(function (p) { return p === 'PH0' ? 'PD0' : p === 'PH1' ? 'PD1' : p; });
  var LQFP64_F0 = LQFP64_F4.map(function (p) { return p === 'PH0' ? 'PF0' : p === 'PH1' ? 'PF1' : p === 'VBAT' ? 'VDD' : p; });
  var LQFP48 = [
    'VBAT', 'PC13', 'PC14', 'PC15', 'PD0', 'PD1', 'NRST', 'VSSA', 'VDDA', 'PA0', 'PA1', 'PA2',
    'PA3', 'PA4', 'PA5', 'PA6', 'PA7', 'PB0', 'PB1', 'PB2', 'PB10', 'PB11', 'VSS', 'VDD',
    'PB12', 'PB13', 'PB14', 'PB15', 'PA8', 'PA9', 'PA10', 'PA11', 'PA12', 'PA13', 'VSS', 'VDD',
    'PA14', 'PA15', 'PB3', 'PB4', 'PB5', 'PB6', 'PB7', 'BOOT0', 'PB8', 'PB9', 'VSS', 'VDD'
  ];
  var LQFP100_F4 = [
    'PE2', 'PE3', 'PE4', 'PE5', 'PE6', 'VBAT', 'PC13', 'PC14', 'PC15', 'VSS', 'VDD', 'PH0', 'PH1', 'NRST', 'PC0', 'PC1', 'PC2', 'PC3', 'VDD', 'VSSA', 'VREF+', 'VDDA',
    'PA0', 'PA1', 'PA2', 'PA3', 'VSS', 'VDD', 'PA4', 'PA5', 'PA6', 'PA7', 'PC4', 'PC5', 'PB0', 'PB1', 'PB2', 'PE7', 'PE8', 'PE9', 'PE10', 'PE11',
    'PE12', 'PE13', 'PE14', 'PE15', 'PB10', 'PB11', 'VCAP1', 'VDD', 'PB12', 'PB13', 'PB14', 'PB15', 'PD8', 'PD9', 'PD10', 'PD11', 'PD12', 'PD13', 'PD14', 'PD15',
    'PC6', 'PC7', 'PC8', 'PC9', 'PA8', 'PA9', 'PA10', 'PA11', 'PA12', 'PA13', 'VCAP2', 'VSS', 'VDD', 'PA14', 'PA15', 'PC10', 'PC11', 'PC12', 'PD0', 'PD1',
    'PD2', 'PD3', 'PD4', 'PD5', 'PD6', 'PD7', 'PB3', 'PB4', 'PB5', 'PB6', 'PB7', 'BOOT0', 'PB8', 'PB9', 'PE0', 'PE1', 'VSS', 'VDD'
  ];

  // ---------------------------------------------------------------- 대체기능(AF) 표
  // 각 항목: 핀 → 이 시뮬레이터가 다루는 신호(USART/I2C/SPI/TIMx_CHn/ADC1_INn)
  function merge(a, b) { var o = {}; Object.keys(a).forEach(function (k) { o[k] = a[k].slice(); }); Object.keys(b).forEach(function (k) { o[k] = b[k].slice(); }); return o; }
  function withoutSignals(af, re) { var o = {}; Object.keys(af).forEach(function (k) { o[k] = af[k].filter(function (s) { return !re.test(s); }); }); return o; }
  function withAdc(af, map) { var o = withoutSignals(af, /^ADC1_IN/); Object.keys(map).forEach(function (p) { o[p] = ['ADC1_IN' + map[p]].concat(o[p] || []); }); return o; }

  var AF_F1 = {
    PA0: ['ADC1_IN0', 'TIM2_CH1'], PA1: ['ADC1_IN1', 'TIM2_CH2'], PA2: ['ADC1_IN2', 'USART2_TX', 'TIM2_CH3'],
    PA3: ['ADC1_IN3', 'USART2_RX', 'TIM2_CH4'], PA4: ['ADC1_IN4', 'SPI1_NSS'], PA5: ['ADC1_IN5', 'SPI1_SCK'],
    PA6: ['ADC1_IN6', 'SPI1_MISO', 'TIM3_CH1'], PA7: ['ADC1_IN7', 'SPI1_MOSI', 'TIM3_CH2'], PA8: ['TIM1_CH1'],
    PA9: ['USART1_TX', 'TIM1_CH2'], PA10: ['USART1_RX', 'TIM1_CH3'], PA11: ['TIM1_CH4'], PA12: [], PA15: [],
    PB0: ['ADC1_IN8', 'TIM3_CH3'], PB1: ['ADC1_IN9', 'TIM3_CH4'], PB2: [], PB3: [], PB4: [], PB5: [],
    PB6: ['I2C1_SCL', 'TIM4_CH1'], PB7: ['I2C1_SDA', 'TIM4_CH2'], PB8: ['TIM4_CH3', 'I2C1_SCL'], PB9: ['TIM4_CH4', 'I2C1_SDA'],
    PB10: ['I2C2_SCL', 'USART3_TX'], PB11: ['I2C2_SDA', 'USART3_RX'], PB12: ['SPI2_NSS'], PB13: ['SPI2_SCK'],
    PB14: ['SPI2_MISO'], PB15: ['SPI2_MOSI'],
    PC0: ['ADC1_IN10'], PC1: ['ADC1_IN11'], PC2: ['ADC1_IN12'], PC3: ['ADC1_IN13'], PC4: ['ADC1_IN14'], PC5: ['ADC1_IN15'],
    PC6: ['TIM3_CH1'], PC7: ['TIM3_CH2'], PC8: ['TIM3_CH3'], PC9: ['TIM3_CH4'],
    PC10: ['USART3_TX'], PC11: ['USART3_RX'], PC12: [], PC13: [], PD2: []
  };
  var AF_F4 = {
    PA0: ['ADC1_IN0', 'TIM2_CH1', 'TIM5_CH1'], PA1: ['ADC1_IN1', 'TIM2_CH2', 'TIM5_CH2'],
    PA2: ['ADC1_IN2', 'USART2_TX', 'TIM2_CH3', 'TIM5_CH3'], PA3: ['ADC1_IN3', 'USART2_RX', 'TIM2_CH4', 'TIM5_CH4'],
    PA4: ['ADC1_IN4', 'SPI1_NSS'], PA5: ['ADC1_IN5', 'SPI1_SCK', 'TIM2_CH1'], PA6: ['ADC1_IN6', 'SPI1_MISO', 'TIM3_CH1'],
    PA7: ['ADC1_IN7', 'SPI1_MOSI', 'TIM3_CH2'], PA8: ['TIM1_CH1', 'I2C3_SCL'], PA9: ['USART1_TX', 'TIM1_CH2'],
    PA10: ['USART1_RX', 'TIM1_CH3'], PA11: ['USART6_TX', 'TIM1_CH4'], PA12: ['USART6_RX'], PA15: ['TIM2_CH1', 'SPI1_NSS'],
    PB0: ['ADC1_IN8', 'TIM3_CH3'], PB1: ['ADC1_IN9', 'TIM3_CH4'], PB2: [], PB3: ['TIM2_CH2', 'SPI1_SCK', 'I2C2_SDA'],
    PB4: ['TIM3_CH1', 'SPI1_MISO', 'I2C3_SDA'], PB5: ['TIM3_CH2', 'SPI1_MOSI'], PB6: ['I2C1_SCL', 'TIM4_CH1', 'USART1_TX'],
    PB7: ['I2C1_SDA', 'TIM4_CH2', 'USART1_RX'], PB8: ['I2C1_SCL', 'TIM4_CH3'], PB9: ['I2C1_SDA', 'TIM4_CH4'],
    PB10: ['I2C2_SCL', 'TIM2_CH3', 'SPI2_SCK', 'USART3_TX'], PB11: ['I2C2_SDA', 'TIM2_CH4', 'USART3_RX'], PB12: ['SPI2_NSS'], PB13: ['SPI2_SCK'], PB14: ['SPI2_MISO'], PB15: ['SPI2_MOSI'],
    PC0: ['ADC1_IN10'], PC1: ['ADC1_IN11'], PC2: ['ADC1_IN12', 'SPI2_MISO'], PC3: ['ADC1_IN13', 'SPI2_MOSI'],
    PC4: ['ADC1_IN14'], PC5: ['ADC1_IN15'], PC6: ['TIM3_CH1', 'USART6_TX'], PC7: ['TIM3_CH2', 'USART6_RX'],
    PC8: ['TIM3_CH3'], PC9: ['TIM3_CH4', 'I2C3_SDA'], PC10: ['USART3_TX'], PC11: ['USART3_RX'], PC12: [], PC13: [], PD2: []
  };
  var AF_F4_100 = merge(AF_F4, {
    PD5: ['USART2_TX'], PD6: ['USART2_RX'], PD8: ['USART3_TX'], PD9: ['USART3_RX'], PD12: ['TIM4_CH1'], PD13: ['TIM4_CH2'], PD14: ['TIM4_CH3'], PD15: ['TIM4_CH4'],
    PE9: ['TIM1_CH1'], PE11: ['TIM1_CH2'], PE13: ['TIM1_CH3'], PE14: ['TIM1_CH4'], PE5: ['TIM9_CH1'], PE6: ['TIM9_CH2'],
    PD0: [], PD1: [], PD3: [], PD4: [], PD7: [], PD10: [], PD11: [], PE0: [], PE1: [], PE2: [], PE3: [], PE4: [], PE7: [], PE8: [], PE10: [], PE12: [], PE15: []
  });
  // L4: 주변장치 핀은 F4 와 거의 같고 ADC 채널 번호가 다르다 (PA0=IN5 …)
  var AF_L4 = withAdc(withoutSignals(AF_F4, /USART6|I2C3|TIM5/), {
    PA0: 5, PA1: 6, PA2: 7, PA3: 8, PA4: 9, PA5: 10, PA6: 11, PA7: 12, PB0: 15, PB1: 16, PC0: 1, PC1: 2, PC2: 3, PC3: 4, PC4: 13, PC5: 14
  });
  // G0: TIM4/5 없음, ADC 채널 PA0–7 = IN0–7, PB0 IN8, PB1 IN9, PB2 IN10, PB10 IN11
  var AF_G0 = withAdc(withoutSignals(AF_F4, /USART6|I2C3|TIM4|TIM5/), { PA0: 0, PA1: 1, PA2: 2, PA3: 3, PA4: 4, PA5: 5, PA6: 6, PA7: 7, PB0: 8, PB1: 9, PB2: 10, PB10: 11 });
  AF_G0.PC13 = []; AF_G0.PF0 = []; AF_G0.PF1 = [];
  // F0 (F030): TIM2/4/5 없음, TIM3/TIM1 만; USART3 없음(F030R8 은 USART1/2)
  var AF_F0 = withoutSignals(AF_F1, /TIM2|TIM4|USART3/);
  AF_F0.PF0 = []; AF_F0.PF1 = [];

  // 핀 순서를 데이터시트에서 옮기지 않은 큰 패키지용: 포트 순서로 GPIO 를 늘어놓고 16핀마다 VDD/VSS 를 끼운다 (pinsApprox)
  function approxPkg(n, ports, extra) {
    var gp = [];
    ports.forEach(function (pt) { var m = /^([A-K])-(\d+)-(\d+)$/.exec(pt); for (var i = +m[2]; i <= +m[3]; i++) gp.push('P' + m[1] + i); });
    var out = ['VBAT'].concat(extra || []), k = 0;
    while (out.length < n) {
      if (out.length % 16 === 15) out.push(out.length % 32 === 15 ? 'VSS' : 'VDD');
      else if (k < gp.length) out.push(gp[k++]);
      else out.push(out.length % 2 ? 'VSS' : 'VDD');
    }
    return out.slice(0, n);
  }
  function range(port, a, b) { var o = {}; for (var i = a; i <= b; i++) o['P' + port + i] = []; return o; }
  function mergeAll() { var o = {}; Array.prototype.forEach.call(arguments, function (t) { Object.keys(t).forEach(function (k) { o[k] = (o[k] || []).concat(t[k]).filter(function (v, i, a) { return a.indexOf(v) === i; }); }); }); return o; }

  // F3 (F303RE): F4 과 비슷, ADC1 채널 번호가 다름, I2C2 PA9/PA10, USART3 PB10/PB11
  var AF_F3 = withAdc(withoutSignals(AF_F4, /USART6|I2C3|TIM5|I2C2/), { PA0: 1, PA1: 2, PA2: 3, PA3: 4, PC0: 6, PC1: 7, PC2: 8, PC3: 9 });
  AF_F3.PA9 = AF_F3.PA9.concat(['I2C2_SCL']); AF_F3.PA10 = AF_F3.PA10.concat(['I2C2_SDA']);
  // Nucleo-144 급(F7/H7/U5) 144핀: A–G 포트
  var AF_144 = mergeAll(withoutSignals(AF_F4_100, /USART6|I2C3|TIM5|TIM9/), range('F', 0, 15), range('G', 0, 15), {
    PB7: ['USART1_RX', 'I2C1_SDA', 'TIM4_CH2'], PB6: ['USART1_TX', 'I2C1_SCL', 'TIM4_CH1'], PD8: ['USART3_TX'], PD9: ['USART3_RX'],
    PC6: ['TIM3_CH1', 'USART6_TX'], PC7: ['TIM3_CH2', 'USART6_RX'], PE9: ['TIM1_CH1'], PE11: ['TIM1_CH2'], PE13: ['TIM1_CH3'], PE14: ['TIM1_CH4'],
    PF0: ['I2C2_SDA'], PF1: ['I2C2_SCL'], PB10: ['I2C2_SCL', 'TIM2_CH3', 'SPI2_SCK', 'USART3_TX'], PB11: ['I2C2_SDA', 'TIM2_CH4', 'USART3_RX']
  });
  var AF_F7 = AF_144;
  var AF_H7 = withAdc(AF_144, { PA0: 16, PA1: 17, PA2: 14, PA3: 15, PA4: 18, PA5: 19, PA6: 3, PA7: 7, PB0: 9, PB1: 5, PC0: 10, PC1: 11, PC4: 4, PC5: 8, PF11: 2, PF12: 6 });
  var AF_U5 = withAdc(withoutSignals(AF_144, /USART6/), { PA0: 5, PA1: 6, PA2: 7, PA3: 8, PA4: 9, PA5: 10, PA6: 11, PA7: 12, PB0: 15, PB1: 16, PC0: 1, PC1: 2, PC2: 3, PC3: 4, PC4: 13, PC5: 14 });
  // G4 (G474RE): LPUART1 이 PA2/PA3(VCP), ADC1 채널
  var AF_G4 = withAdc(withoutSignals(AF_F4, /USART6|I2C3/), { PA0: 1, PA1: 2, PA2: 3, PA3: 4, PB0: 15, PB1: 12, PB11: 14, PB12: 11, PC0: 6, PC1: 7, PC2: 8, PC3: 9 });
  AF_G4.PA2 = AF_G4.PA2.concat(['LPUART1_TX']); AF_G4.PA3 = AF_G4.PA3.concat(['LPUART1_RX']);
  // L0 (L053R8): TIM1/TIM3 없음, TIM2·TIM21·TIM22
  var AF_L0 = withoutSignals(AF_F1, /TIM1_|TIM3_|TIM4_|USART3/);
  ['PA0', 'PA5', 'PA15'].forEach(function (p) { AF_L0[p] = (AF_L0[p] || []).filter(function (s) { return !/TIM2/.test(s); }).concat(['TIM2_CH1']); });
  AF_L0.PA1 = AF_L0.PA1.concat([]); AF_L0.PB3 = ['TIM2_CH2']; AF_L0.PB10 = ['I2C2_SCL', 'TIM2_CH3']; AF_L0.PB11 = ['I2C2_SDA', 'TIM2_CH4'];
  AF_L0.PA2 = AF_L0.PA2.concat(['TIM21_CH1']); AF_L0.PA3 = AF_L0.PA3.concat(['TIM21_CH2']); AF_L0.PA6 = AF_L0.PA6.concat(['TIM22_CH1']); AF_L0.PA7 = AF_L0.PA7.concat(['TIM22_CH2']);
  AF_L0.PB8 = ['I2C1_SCL']; AF_L0.PB9 = ['I2C1_SDA'];
  AF_L0.PH0 = []; AF_L0.PH1 = [];
  // C0 (C031C6 48핀): TIM2·I2C2·SPI2·USART3 없음
  var AF_C0 = withAdc(withoutSignals(AF_F1, /TIM2|TIM4|I2C2|SPI2|USART3/), { PA0: 0, PA1: 1, PA2: 2, PA3: 3, PA4: 4, PA5: 5, PA6: 6, PA7: 7 });
  AF_C0.PB8 = ['I2C1_SCL']; AF_C0.PB9 = ['I2C1_SDA']; AF_C0.PF0 = []; AF_C0.PF1 = [];
  // WB (WB55RG): USART2·TIM3 없음, LPUART1 PA2/PA3, USART1 PB6/PB7 도 가능
  var AF_WB = withAdc(withoutSignals(AF_F4, /USART2|USART6|TIM3|TIM4|TIM5|I2C2|I2C3|USART3/), { PA0: 5, PA1: 6, PA2: 7, PA3: 8, PA4: 9, PA5: 10, PA6: 11, PA7: 12, PC0: 1, PC1: 2, PC2: 3, PC3: 4, PC4: 13, PC5: 14 });
  AF_WB.PA2 = AF_WB.PA2.concat(['LPUART1_TX']); AF_WB.PA3 = AF_WB.PA3.concat(['LPUART1_RX']);
  AF_WB.PA5 = AF_WB.PA5.concat(['TIM2_CH1']); AF_WB.PB6 = ['USART1_TX', 'I2C1_SCL']; AF_WB.PB7 = ['USART1_RX', 'I2C1_SDA']; AF_WB.PD0 = []; AF_WB.PD1 = []; AF_WB.PE4 = [];

  // DS9773 Table 11 (STM32F030R8, LQFP64) · DS12232 Table 12 (STM32G071RB, LQFP64) — 데이터시트 순서
  var LQFP64_F030 = [
    'VDD', 'PC13', 'PC14', 'PC15', 'PF0', 'PF1', 'NRST', 'PC0', 'PC1', 'PC2', 'PC3', 'VSSA', 'VDDA', 'PA0', 'PA1', 'PA2',
    'PA3', 'PF4', 'PF5', 'PA4', 'PA5', 'PA6', 'PA7', 'PC4', 'PC5', 'PB0', 'PB1', 'PB2', 'PB10', 'PB11', 'VSS', 'VDD',
    'PB12', 'PB13', 'PB14', 'PB15', 'PC6', 'PC7', 'PC8', 'PC9', 'PA8', 'PA9', 'PA10', 'PA11', 'PA12', 'PA13', 'PF6', 'PF7',
    'PA14', 'PA15', 'PC10', 'PC11', 'PC12', 'PD2', 'PB3', 'PB4', 'PB5', 'PB6', 'PB7', 'BOOT0', 'PB8', 'PB9', 'VSS', 'VDD'
  ];
  var LQFP64_G071 = [
    'PC11', 'PC12', 'PC13', 'PC14', 'PC15', 'VBAT', 'VREF+', 'VDD', 'VSS', 'PF0', 'PF1', 'NRST', 'PC0', 'PC1', 'PC2', 'PC3',
    'PA0', 'PA1', 'PA2', 'PA3', 'PA4', 'PA5', 'PA6', 'PA7', 'PC4', 'PC5', 'PB0', 'PB1', 'PB2', 'PB10', 'PB11', 'PB12',
    'PB13', 'PB14', 'PB15', 'PA8', 'PA9', 'PC6', 'PC7', 'PD8', 'PD9', 'PA10', 'PA11', 'PA12', 'PA13', 'PA14', 'PA15', 'PC8',
    'PC9', 'PD0', 'PD1', 'PD2', 'PD3', 'PD4', 'PD5', 'PD6', 'PB3', 'PB4', 'PB5', 'PB6', 'PB7', 'PB8', 'PB9', 'PC10'
  ];
  var AF_F030 = {
    PA0: ['ADC1_IN0'], PA1: ['ADC1_IN1'], PA2: ['ADC1_IN2', 'USART2_TX'], PA3: ['ADC1_IN3', 'USART2_RX'],
    PA4: ['ADC1_IN4', 'SPI1_NSS'], PA5: ['ADC1_IN5', 'SPI1_SCK'], PA6: ['ADC1_IN6', 'SPI1_MISO', 'TIM3_CH1'],
    PA7: ['ADC1_IN7', 'SPI1_MOSI', 'TIM3_CH2'], PA8: ['TIM1_CH1'], PA9: ['USART1_TX', 'TIM1_CH2'],
    PA10: ['USART1_RX', 'TIM1_CH3'], PA11: ['TIM1_CH4'], PA12: [], PA13: [], PA14: ['USART2_TX'], PA15: ['USART2_RX', 'SPI1_NSS'],
    PB0: ['ADC1_IN8', 'TIM3_CH3'], PB1: ['ADC1_IN9', 'TIM3_CH4'], PB2: [], PB3: ['SPI1_SCK'],
    PB4: ['SPI1_MISO', 'TIM3_CH1'], PB5: ['SPI1_MOSI', 'TIM3_CH2'], PB6: ['I2C1_SCL', 'USART1_TX'], PB7: ['I2C1_SDA', 'USART1_RX'],
    PB8: ['I2C1_SCL'], PB9: ['I2C1_SDA'], PB10: ['I2C2_SCL'], PB11: ['I2C2_SDA'],
    PB12: ['SPI2_NSS'], PB13: ['SPI2_SCK'], PB14: ['SPI2_MISO'], PB15: ['SPI2_MOSI'],
    PC0: ['ADC1_IN10'], PC1: ['ADC1_IN11'], PC2: ['ADC1_IN12'], PC3: ['ADC1_IN13'], PC4: ['ADC1_IN14'], PC5: ['ADC1_IN15'],
    PC6: ['TIM3_CH1'], PC7: ['TIM3_CH2'], PC8: ['TIM3_CH3'], PC9: ['TIM3_CH4'],
    PC10: [], PC11: [], PC12: [], PC13: [], PC14: [], PC15: [], PD2: [],
    PF0: [], PF1: [], PF4: [], PF5: [], PF6: ['I2C2_SCL'], PF7: ['I2C2_SDA']
  };
  var AF_G071 = {
    PA0: ['ADC1_IN0', 'SPI2_SCK', 'TIM2_CH1'], PA1: ['ADC1_IN1', 'SPI1_SCK', 'TIM2_CH2'],
    PA2: ['ADC1_IN2', 'SPI1_MOSI', 'USART2_TX', 'TIM2_CH3'], PA3: ['ADC1_IN3', 'SPI2_MISO', 'USART2_RX', 'TIM2_CH4'],
    PA4: ['ADC1_IN4', 'SPI1_NSS', 'SPI2_MOSI'], PA5: ['ADC1_IN5', 'SPI1_SCK', 'TIM2_CH1', 'USART3_TX'],
    PA6: ['ADC1_IN6', 'SPI1_MISO', 'TIM3_CH1'], PA7: ['ADC1_IN7', 'SPI1_MOSI', 'TIM3_CH2'],
    PA8: ['SPI2_NSS', 'TIM1_CH1'], PA9: ['USART1_TX', 'TIM1_CH2', 'SPI2_MISO', 'I2C1_SCL'],
    PA10: ['USART1_RX', 'TIM1_CH3', 'SPI2_MOSI', 'I2C1_SDA'], PA11: ['SPI1_MISO', 'TIM1_CH4', 'I2C2_SCL'],
    PA12: ['SPI1_MOSI', 'I2C2_SDA'], PA13: [], PA14: ['USART2_TX'], PA15: ['SPI1_NSS', 'USART2_RX', 'TIM2_CH1'],
    PB0: ['ADC1_IN8', 'SPI1_NSS', 'TIM3_CH3', 'USART3_RX'], PB1: ['ADC1_IN9', 'TIM3_CH4'], PB2: ['ADC1_IN10', 'SPI2_MISO', 'USART3_TX'],
    PB3: ['SPI1_SCK', 'TIM1_CH2', 'TIM2_CH2'], PB4: ['SPI1_MISO', 'TIM3_CH1'], PB5: ['SPI1_MOSI', 'TIM3_CH2'],
    PB6: ['I2C1_SCL', 'USART1_TX', 'TIM1_CH3', 'SPI2_MISO'], PB7: ['I2C1_SDA', 'USART1_RX', 'SPI2_MOSI'],
    PB8: ['I2C1_SCL', 'SPI2_SCK', 'USART3_TX'], PB9: ['I2C1_SDA', 'SPI2_NSS', 'USART3_RX'],
    PB10: ['ADC1_IN11', 'I2C2_SCL', 'SPI2_SCK', 'TIM2_CH3', 'USART3_TX'], PB11: ['ADC1_IN15', 'I2C2_SDA', 'SPI2_MOSI', 'TIM2_CH4', 'USART3_RX'],
    PB12: ['ADC1_IN16', 'SPI2_NSS'], PB13: ['SPI2_SCK', 'I2C2_SCL'], PB14: ['SPI2_MISO', 'I2C2_SDA'], PB15: ['SPI2_MOSI'],
    PC0: [], PC1: [], PC2: ['SPI2_MISO'], PC3: ['SPI2_MOSI'],
    PC4: ['ADC1_IN17', 'USART1_TX', 'USART3_TX', 'TIM2_CH1'], PC5: ['ADC1_IN18', 'USART1_RX', 'USART3_RX', 'TIM2_CH2'],
    PC6: ['TIM3_CH1', 'TIM2_CH3'], PC7: ['TIM3_CH2', 'TIM2_CH4'], PC8: ['TIM3_CH3', 'TIM1_CH1'], PC9: ['TIM3_CH4', 'TIM1_CH2'],
    PC10: ['USART3_TX', 'TIM1_CH3'], PC11: ['USART3_RX', 'TIM1_CH4'], PC12: [], PC13: [], PC14: [], PC15: [],
    PD0: ['SPI2_NSS'], PD1: ['SPI2_SCK'], PD2: [], PD3: ['SPI2_MISO'], PD4: ['SPI2_MOSI'],
    PD5: ['USART2_TX', 'SPI1_MISO'], PD6: ['USART2_RX', 'SPI1_MOSI'], PD8: ['USART3_TX', 'SPI1_SCK'], PD9: ['USART3_RX', 'SPI1_NSS'],
    PF0: [], PF1: []
  };

  // ---------------------------------------------------------------- 주변장치 · IRQ 이름 (제품군별)
  function periphSet(family, opts) {
    opts = opts || {};
    var f4 = /^(F4|F7|H7)$/.test(family), f1 = family === 'F1', l4 = /^(L4|U5|WB|F3|G4)$/.test(family), g0 = /^(G0|C0|L0)$/.test(family), f0 = family === 'F0';
    var m0 = g0 || f0;
    var p = {
      USART1: { kind: 'usart', pins: { TX: 'PA9', RX: 'PA10' }, bus: 'APB2', irq: 'USART1' },
      USART2: { kind: 'usart', pins: { TX: 'PA2', RX: 'PA3' }, bus: 'APB1', irq: 'USART2' },
      I2C1: { kind: 'i2c', pins: { SCL: (f1 || f0) ? 'PB6' : 'PB8', SDA: (f1 || f0) ? 'PB7' : 'PB9' }, irq: m0 ? 'I2C1' : 'I2C1_EV' },
      I2C2: { kind: 'i2c', pins: { SCL: 'PB10', SDA: f4 ? 'PB3' : 'PB11' }, irq: m0 ? 'I2C2' : 'I2C2_EV' },
      SPI1: { kind: 'spi', pins: { SCK: 'PA5', MISO: 'PA6', MOSI: 'PA7' }, irq: 'SPI1' },
      SPI2: { kind: 'spi', pins: { SCK: 'PB13', MISO: 'PB14', MOSI: 'PB15' }, irq: 'SPI2' },
      TIM1: { kind: 'tim', bits: 16, bus: 'APB2', chPins: { 1: 'PA8', 2: 'PA9', 3: 'PA10', 4: 'PA11' },
        irq: f4 ? 'TIM1_UP_TIM10' : f1 ? 'TIM1_UP' : l4 ? 'TIM1_UP_TIM16' : 'TIM1_BRK_UP_TRG_COM' },
      TIM3: { kind: 'tim', bits: 16, bus: 'APB1', chPins: { 1: 'PA6', 2: 'PA7', 3: 'PB0', 4: 'PB1' }, irq: 'TIM3' },
      ADC1: { kind: 'adc', irq: f4 ? 'ADC' : (f1 || l4) ? 'ADC1_2' : family === 'G0' ? 'ADC1_COMP' : 'ADC1' }
    };
    if (!f0) p.TIM2 = { kind: 'tim', bits: (f4 || l4 || g0) ? 32 : 16, bus: 'APB1', chPins: { 1: 'PA0', 2: 'PA1', 3: 'PA2', 4: 'PA3' }, irq: 'TIM2' };
    if (f4 || f1 || l4) p.TIM4 = { kind: 'tim', bits: 16, bus: 'APB1', chPins: opts.tim4d ? { 1: 'PD12', 2: 'PD13', 3: 'PD14', 4: 'PD15' } : { 1: 'PB6', 2: 'PB7', 3: 'PB8', 4: 'PB9' }, irq: 'TIM4' };
    if (f4 || l4) p.TIM5 = { kind: 'tim', bits: 32, bus: 'APB1', chPins: { 1: 'PA0', 2: 'PA1', 3: 'PA2', 4: 'PA3' }, irq: 'TIM5' };
    if (f1 || l4 || g0 || opts.usart3) p.USART3 = { kind: 'usart', pins: { TX: 'PB10', RX: 'PB11' }, bus: 'APB1', irq: family === 'G0' ? 'USART3_4_LPUART1' : g0 ? 'USART3_4' : 'USART3' };
    if (f4 && opts.usart6) p.USART6 = { kind: 'usart', pins: { TX: 'PC6', RX: 'PC7' }, bus: 'APB2', irq: 'USART6' };
    (opts.remove || []).forEach(function (k) { delete p[k]; });
    Object.keys(opts.set || {}).forEach(function (k) { p[k] = opts.set[k]; });
    return p;
  }

  // ---------------------------------------------------------------- 제품군 공통 정보
  var FAMILIES = {
    F0: { name: 'STM32F0', core: 'Cortex-M0', hal: 'STM32F0xx_HAL_Driver', halPrefix: 'stm32f0xx', hsi: 8, exti: 'm0', apb1Max: 48, apb2Max: 48, desc: '입문형 32비트, Cortex-M0 48 MHz' },
    F1: { name: 'STM32F1', core: 'Cortex-M3', hal: 'STM32F1xx_HAL_Driver', halPrefix: 'stm32f1xx', hsi: 8, exti: 'm3', apb1Max: 36, apb2Max: 72, desc: '고전적인 메인스트림, Cortex-M3 72 MHz' },
    F4: { name: 'STM32F4', core: 'Cortex-M4F', hal: 'STM32F4xx_HAL_Driver', halPrefix: 'stm32f4xx', hsi: 16, exti: 'm3', apb1Max: 42, apb2Max: 84, desc: '고성능 메인스트림, Cortex-M4F + FPU' },
    G0: { name: 'STM32G0', core: 'Cortex-M0+', hal: 'STM32G0xx_HAL_Driver', halPrefix: 'stm32g0xx', hsi: 16, exti: 'm0', apb1Max: 64, apb2Max: 64, extiSplit: true, desc: '차세대 입문형, Cortex-M0+ 64 MHz' },
    L4: { name: 'STM32L4', core: 'Cortex-M4F', hal: 'STM32L4xx_HAL_Driver', halPrefix: 'stm32l4xx', hsi: 16, exti: 'm3', apb1Max: 80, apb2Max: 80, desc: '초저전력, Cortex-M4F 80 MHz' },
    F3: { name: 'STM32F3', core: 'Cortex-M4F', hal: 'STM32F3xx_HAL_Driver', halPrefix: 'stm32f3xx', hsi: 8, exti: 'f3', apb1Max: 36, apb2Max: 72, desc: '혼합 신호, Cortex-M4F 72 MHz + 아날로그 강화' },
    F7: { name: 'STM32F7', core: 'Cortex-M7', hal: 'STM32F7xx_HAL_Driver', halPrefix: 'stm32f7xx', hsi: 16, exti: 'm3', apb1Max: 54, apb2Max: 108, desc: '고성능, Cortex-M7 216 MHz + 캐시' },
    H7: { name: 'STM32H7', core: 'Cortex-M7', hal: 'STM32H7xx_HAL_Driver', halPrefix: 'stm32h7xx', hsi: 64, exti: 'm3', apb1Max: 120, apb2Max: 120, adcBits: 16, desc: '최고 성능, Cortex-M7 480 MHz, 16비트 ADC' },
    G4: { name: 'STM32G4', core: 'Cortex-M4F', hal: 'STM32G4xx_HAL_Driver', halPrefix: 'stm32g4xx', hsi: 16, exti: 'm3', apb1Max: 170, apb2Max: 170, desc: '모터·전원 제어용, Cortex-M4F 170 MHz' },
    L0: { name: 'STM32L0', core: 'Cortex-M0+', hal: 'STM32L0xx_HAL_Driver', halPrefix: 'stm32l0xx', hsi: 16, exti: 'm0', apb1Max: 32, apb2Max: 32, desc: '초저전력 입문형, Cortex-M0+ 32 MHz' },
    U5: { name: 'STM32U5', core: 'Cortex-M33', hal: 'STM32U5xx_HAL_Driver', halPrefix: 'stm32u5xx', hsi: 16, exti: 'u5', apb1Max: 160, apb2Max: 160, adcBits: 14, extiSplit: true, desc: '초저전력 + 보안(TrustZone), Cortex-M33 160 MHz' },
    C0: { name: 'STM32C0', core: 'Cortex-M0+', hal: 'STM32C0xx_HAL_Driver', halPrefix: 'stm32c0xx', hsi: 48, exti: 'm0', apb1Max: 48, apb2Max: 48, extiSplit: true, desc: '최저가 32비트, Cortex-M0+ 48 MHz' },
    WB: { name: 'STM32WB', core: 'Cortex-M4F', hal: 'STM32WBxx_HAL_Driver', halPrefix: 'stm32wbxx', hsi: 16, exti: 'm3', apb1Max: 64, apb2Max: 64, desc: 'Bluetooth LE 무선, Cortex-M4F 64 MHz + M0+ 무선 코어' }
  };

  function chip(part, o) {
    var fam = FAMILIES[o.family];
    var c = {
      part: part, name: part + 'Tx', family: fam.name, series: o.family, core: fam.core, pkg: o.pkg, pins: o.pins, pinsApprox: !!o.pinsApprox,
      af: o.af, flash: o.flash, ram: o.ram, maxClk: o.maxClk, sysclks: o.sysclks, defClk: o.defClk, hsi: fam.hsi,
      apb1Max: o.apb1Max || fam.apb1Max, apb2Max: o.apb2Max || fam.apb2Max, exti: fam.exti, extiSplit: !!fam.extiSplit, adcBits: fam.adcBits || 12, core2: o.core2 || null,
      periph: periphSet(o.family, o.periph || {}), hal: fam.hal, halPrefix: fam.halPrefix, desc: o.desc || fam.desc, note: o.note || ''
    };
    return c;
  }

  var CHIPS = {
    STM32F030R8: chip('STM32F030R8', { family: 'F0', pkg: 'LQFP64', pins: LQFP64_F030, af: AF_F030, flash: 64, ram: 8, maxClk: 48, sysclks: [8, 24, 48], defClk: 48,
      desc: 'Cortex-M0 48 MHz · 64 KB Flash · 8 KB RAM', note: 'TIM2/TIM4 가 없어 32비트 타이머와 TIM4 채널을 쓸 수 없습니다.' }),
    STM32F103C8: chip('STM32F103C8', { family: 'F1', pkg: 'LQFP48', pins: LQFP48, af: AF_F1, flash: 64, ram: 20, maxClk: 72, sysclks: [8, 36, 48, 64, 72], defClk: 72,
      desc: 'Cortex-M3 72 MHz · 64 KB Flash · 20 KB RAM (Blue Pill)' }),
    STM32F103RB: chip('STM32F103RB', { family: 'F1', pkg: 'LQFP64', pins: LQFP64_F1, af: AF_F1, flash: 128, ram: 20, maxClk: 72, sysclks: [8, 36, 48, 64, 72], defClk: 72,
      desc: 'Cortex-M3 72 MHz · 128 KB Flash · 20 KB RAM' }),
    STM32F401RE: chip('STM32F401RE', { family: 'F4', pkg: 'LQFP64', pins: LQFP64_F4, af: AF_F4, flash: 512, ram: 96, maxClk: 84, sysclks: [16, 48, 84], defClk: 84, periph: { usart6: true },
      desc: 'Cortex-M4F 84 MHz · 512 KB Flash · 96 KB RAM' }),
    STM32F411RE: chip('STM32F411RE', { family: 'F4', pkg: 'LQFP64', pins: LQFP64_F4, af: AF_F4, flash: 512, ram: 128, maxClk: 100, sysclks: [16, 48, 84, 100], defClk: 84, apb1Max: 50, apb2Max: 100, periph: { usart6: true },
      desc: 'Cortex-M4F 100 MHz · 512 KB Flash · 128 KB RAM' }),
    STM32F446RE: chip('STM32F446RE', { family: 'F4', pkg: 'LQFP64', pins: LQFP64_F4, af: AF_F4, flash: 512, ram: 128, maxClk: 180, sysclks: [16, 48, 84, 168, 180], defClk: 180, apb1Max: 45, apb2Max: 90, periph: { usart6: true, usart3: true },
      desc: 'Cortex-M4F 180 MHz · 512 KB Flash · 128 KB RAM' }),
    STM32F407VG: chip('STM32F407VG', { family: 'F4', pkg: 'LQFP100', pins: LQFP100_F4, af: AF_F4_100, flash: 1024, ram: 192, maxClk: 168, sysclks: [16, 48, 84, 168], defClk: 168, apb1Max: 42, apb2Max: 84, periph: { usart6: true, usart3: true, tim4d: true },
      desc: 'Cortex-M4F 168 MHz · 1 MB Flash · 192 KB RAM · 100핀' }),
    STM32G071RB: chip('STM32G071RB', { family: 'G0', pkg: 'LQFP64', pins: LQFP64_G071, af: AF_G071, flash: 128, ram: 36, maxClk: 64, sysclks: [16, 32, 64], defClk: 64,
      desc: 'Cortex-M0+ 64 MHz · 128 KB Flash · 36 KB RAM' }),
    STM32L476RG: chip('STM32L476RG', { family: 'L4', pkg: 'LQFP64', pins: LQFP64_F4, af: AF_L4, flash: 1024, ram: 128, maxClk: 80, sysclks: [16, 40, 80], defClk: 80,
      desc: 'Cortex-M4F 80 MHz · 1 MB Flash · 128 KB RAM · 초저전력' }),
    STM32F303RE: chip('STM32F303RE', { family: 'F3', pkg: 'LQFP64', pins: LQFP64_F0.map(function (p) { return p === 'VDD' && false ? p : p; }), pinsApprox: true, af: AF_F3, flash: 512, ram: 80, maxClk: 72, sysclks: [8, 36, 64, 72], defClk: 72,
      periph: { remove: ['I2C2', 'TIM5'], set: {
        I2C2: { kind: 'i2c', pins: { SCL: 'PA9', SDA: 'PA10' }, irq: 'I2C2_EV' },
        TIM1: { kind: 'tim', bits: 16, bus: 'APB2', chPins: { 1: 'PA8', 2: 'PA9', 3: 'PA10', 4: 'PA11' }, irq: 'TIM1_UP_TIM16' } } },
      desc: 'Cortex-M4F 72 MHz · 512 KB Flash · 80 KB RAM · ADC 4개·비교기·OP 앰프' }),
    STM32F746ZG: chip('STM32F746ZG', { family: 'F7', pkg: 'LQFP144', pins: approxPkg(144, ['A-0-15', 'B-0-15', 'C-0-15', 'D-0-15', 'E-0-15', 'F-0-15', 'G-0-15'], ['PH0', 'PH1', 'NRST', 'BOOT0']), pinsApprox: true,
      af: AF_F7, flash: 1024, ram: 320, maxClk: 216, sysclks: [16, 48, 96, 168, 216], defClk: 216,
      periph: { usart6: true, usart3: true, tim4d: true, set: { USART3: { kind: 'usart', pins: { TX: 'PD8', RX: 'PD9' }, bus: 'APB1', irq: 'USART3' } } },
      desc: 'Cortex-M7 216 MHz · 1 MB Flash · 320 KB RAM · 144핀' }),
    STM32H743ZI: chip('STM32H743ZI', { family: 'H7', pkg: 'LQFP144', pins: approxPkg(144, ['A-0-15', 'B-0-15', 'C-0-15', 'D-0-15', 'E-0-15', 'F-0-15', 'G-0-15'], ['PH0', 'PH1', 'NRST', 'BOOT0']), pinsApprox: true,
      af: AF_H7, flash: 2048, ram: 1024, maxClk: 480, sysclks: [64, 200, 400, 480], defClk: 400, apb1Max: 120, apb2Max: 120,
      periph: { usart6: true, usart3: true, tim4d: true, set: {
        USART3: { kind: 'usart', pins: { TX: 'PD8', RX: 'PD9' }, bus: 'APB1', irq: 'USART3' },
        TIM1: { kind: 'tim', bits: 16, bus: 'APB2', chPins: { 1: 'PE9', 2: 'PE11', 3: 'PE13', 4: 'PE14' }, irq: 'TIM1_UP' },
        ADC1: { kind: 'adc', irq: 'ADC' } } },
      desc: 'Cortex-M7 480 MHz · 2 MB Flash · 1 MB RAM · 16비트 ADC · 144핀', note: 'ADC 가 16비트(0–65535)입니다. 시뮬레이터는 400 MHz 설정을 기본으로 씁니다.' }),
    STM32G474RE: chip('STM32G474RE', { family: 'G4', pkg: 'LQFP64', pins: LQFP64_F0.map(function (p) { return p === 'PF0' ? 'PF0' : p; }), pinsApprox: true, af: AF_G4, flash: 512, ram: 128, maxClk: 170, sysclks: [16, 64, 150, 170], defClk: 170,
      periph: { usart3: true, set: {
        LPUART1: { kind: 'usart', pins: { TX: 'PA2', RX: 'PA3' }, bus: 'APB1', irq: 'LPUART1' },
        TIM1: { kind: 'tim', bits: 16, bus: 'APB2', chPins: { 1: 'PA8', 2: 'PA9', 3: 'PA10', 4: 'PA11' }, irq: 'TIM1_UP_TIM16' } } },
      desc: 'Cortex-M4F 170 MHz · 512 KB Flash · 128 KB RAM · 고분해능 타이머(HRTIM)', note: 'Nucleo-G474RE 의 가상 COM 은 LPUART1(PA2/PA3) 입니다 (핸들 hlpuart1).' }),
    STM32L053R8: chip('STM32L053R8', { family: 'L0', pkg: 'LQFP64', pins: LQFP64_F4, pinsApprox: true, af: AF_L0, flash: 64, ram: 8, maxClk: 32, sysclks: [16, 32], defClk: 32,
      periph: { remove: ['TIM1', 'TIM3', 'TIM4', 'TIM5', 'USART3'], set: {
        TIM2: { kind: 'tim', bits: 16, bus: 'APB1', chPins: { 1: 'PA0', 2: 'PA1', 3: 'PA2', 4: 'PA3' }, irq: 'TIM2' },
        TIM21: { kind: 'tim', bits: 16, bus: 'APB2', chPins: { 1: 'PA2', 2: 'PA3' }, irq: 'TIM21' },
        TIM22: { kind: 'tim', bits: 16, bus: 'APB2', chPins: { 1: 'PA6', 2: 'PA7' }, irq: 'TIM22' },
        ADC1: { kind: 'adc', irq: 'ADC1_COMP' }, I2C1: { kind: 'i2c', pins: { SCL: 'PB8', SDA: 'PB9' }, irq: 'I2C1' } } },
      desc: 'Cortex-M0+ 32 MHz · 64 KB Flash · 8 KB RAM · EEPROM 2 KB · LCD 드라이버', note: 'TIM1·TIM3 가 없습니다. PWM 은 TIM2(PA0·PA5) 또는 TIM21/TIM22 를 씁니다.' }),
    STM32U575ZI: chip('STM32U575ZI', { family: 'U5', pkg: 'LQFP144', pins: approxPkg(144, ['A-0-15', 'B-0-15', 'C-0-15', 'D-0-15', 'E-0-15', 'F-0-15', 'G-0-15'], ['PH0', 'PH1', 'NRST', 'BOOT0']), pinsApprox: true,
      af: AF_U5, flash: 2048, ram: 786, maxClk: 160, sysclks: [16, 48, 160], defClk: 160,
      periph: { usart3: true, tim4d: true, set: { USART3: { kind: 'usart', pins: { TX: 'PD8', RX: 'PD9' }, bus: 'APB1', irq: 'USART3' },
        TIM1: { kind: 'tim', bits: 16, bus: 'APB2', chPins: { 1: 'PE9', 2: 'PE11', 3: 'PE13', 4: 'PE14' }, irq: 'TIM1_UP' }, ADC1: { kind: 'adc', irq: 'ADC1' } } },
      desc: 'Cortex-M33 160 MHz · 2 MB Flash · 786 KB RAM · TrustZone · 14비트 ADC · 144핀', note: 'EXTI 인터럽트가 라인마다 따로(EXTI13_IRQn 등) 있고 콜백이 Rising/Falling 으로 나뉩니다.' }),
    STM32C031C6: chip('STM32C031C6', { family: 'C0', pkg: 'LQFP48', pins: LQFP48.map(function (p) { return p === 'PD0' ? 'PF0' : p === 'PD1' ? 'PF1' : p; }), pinsApprox: true, af: AF_C0, flash: 32, ram: 12, maxClk: 48, sysclks: [12, 24, 48], defClk: 48,
      periph: { remove: ['TIM2', 'I2C2', 'SPI2', 'USART3'], set: { ADC1: { kind: 'adc', irq: 'ADC1' }, I2C1: { kind: 'i2c', pins: { SCL: 'PB8', SDA: 'PB9' }, irq: 'I2C1' } } },
      desc: 'Cortex-M0+ 48 MHz · 32 KB Flash · 12 KB RAM · 최저가', note: 'TIM2·I2C2·SPI2 가 없습니다. HSI 48 MHz 를 PLL 없이 씁니다.' }),
    STM32WB55RG: chip('STM32WB55RG', { family: 'WB', pkg: 'VFQFPN68', pins: approxPkg(68, ['A-0-15', 'B-0-15', 'C-0-15', 'D-0-1', 'E-4-4'], ['PH3', 'NRST']), pinsApprox: true, af: AF_WB, flash: 1024, ram: 256, maxClk: 64, sysclks: [16, 32, 64], defClk: 64,
      core2: 'Cortex-M0+ (BLE 무선 스택)',
      periph: { remove: ['USART2', 'TIM3', 'TIM4', 'TIM5', 'I2C2', 'USART3'], set: {
        USART1: { kind: 'usart', pins: { TX: 'PB6', RX: 'PB7' }, bus: 'APB2', irq: 'USART1' },
        LPUART1: { kind: 'usart', pins: { TX: 'PA2', RX: 'PA3' }, bus: 'APB1', irq: 'LPUART1' },
        TIM1: { kind: 'tim', bits: 16, bus: 'APB2', chPins: { 1: 'PA8', 2: 'PA9', 3: 'PA10', 4: 'PA11' }, irq: 'TIM1_UP_TIM16' },
        TIM2: { kind: 'tim', bits: 32, bus: 'APB1', chPins: { 1: 'PA0', 2: 'PA1', 3: 'PA2', 4: 'PA3' }, irq: 'TIM2' },
        ADC1: { kind: 'adc', irq: 'ADC1' } } },
      desc: 'Cortex-M4F 64 MHz + M0+ 무선 · 1 MB Flash · 256 KB RAM · Bluetooth LE 5', note: 'USART2·TIM3 가 없습니다. 무선(BLE) 기능은 시뮬레이션하지 않습니다.' })
  };

  // ---------------------------------------------------------------- 보드 프리셋 (선택)
  function nucleo64(id, chipId, ledId) {
    return {
      chip: chipId, title: id, kind: 'Nucleo-64',
      desc: CHIPS[chipId].desc + ' · ST-Link/V2-1 내장 (VCP = USART2)',
      builtin: [
        { id: ledId || 'LD2', type: 'board-led', pin: 'PA5', props: { color: 'green', active: 'high' } },
        { id: 'B1', type: 'board-button', pin: 'PC13', props: { wiring: 'module', label: 'B1 USER' } },
        { id: 'VCP', type: 'vcp', pins: { tx: 'PA3', rx: 'PA2' }, props: { baud: 115200, name: 'ST-Link VCP' } }
      ],
      defaults: {
        pins: { PA5: { signal: 'GPIO_Output', label: ledId || 'LD2' }, PC13: { signal: 'GPIO_EXTI', label: 'B1', trigger: 'falling' },
          PA2: { signal: 'USART2_TX', label: 'USART_TX' }, PA3: { signal: 'USART2_RX', label: 'USART_RX' } },
        periph: { USART2: { mode: 'async', baud: 115200 } }, nvic: {}
      }
    };
  }
  function nucleo144(id, chipId, leds, vcp) {
    var b = { chip: chipId, title: id, kind: 'Nucleo-144',
      desc: CHIPS[chipId].desc + ' · ST-Link 내장 (VCP = ' + vcp.name + ') · LD1–LD3, B1(누르면 HIGH)',
      builtin: leds.map(function (l) { return { id: l[0], type: 'board-led', pin: l[1], props: { color: l[2], active: 'high' } }; }).concat([
        { id: 'B1', type: 'board-button', pin: 'PC13', props: { wiring: 'vcc', label: 'B1 USER' } },
        { id: 'VCP', type: 'vcp', pins: { tx: vcp.rx, rx: vcp.tx }, props: { baud: 115200, name: 'ST-Link VCP' } }]),
      defaults: { pins: {}, periph: {}, nvic: {} } };
    leds.forEach(function (l) { b.defaults.pins[l[1]] = { signal: 'GPIO_Output', label: l[0] }; });
    b.defaults.pins.PC13 = { signal: 'GPIO_EXTI', label: 'B1', trigger: 'rising', pull: 'down' };
    b.defaults.pins[vcp.tx] = { signal: vcp.name + '_TX', label: 'VCP_TX' }; b.defaults.pins[vcp.rx] = { signal: vcp.name + '_RX', label: 'VCP_RX' };
    b.defaults.periph[vcp.name] = { mode: 'async', baud: 115200 };
    return b;
  }
  var BOARDS = {
    'NUCLEO-F411RE': nucleo64('NUCLEO-F411RE', 'STM32F411RE'),
    'NUCLEO-F401RE': nucleo64('NUCLEO-F401RE', 'STM32F401RE'),
    'NUCLEO-F446RE': nucleo64('NUCLEO-F446RE', 'STM32F446RE'),
    'NUCLEO-F103RB': nucleo64('NUCLEO-F103RB', 'STM32F103RB'),
    'NUCLEO-L476RG': nucleo64('NUCLEO-L476RG', 'STM32L476RG'),
    'NUCLEO-G071RB': nucleo64('NUCLEO-G071RB', 'STM32G071RB', 'LD4'),
    'NUCLEO-F030R8': nucleo64('NUCLEO-F030R8', 'STM32F030R8'),
    'NUCLEO-F303RE': nucleo64('NUCLEO-F303RE', 'STM32F303RE'),
    'NUCLEO-L053R8': nucleo64('NUCLEO-L053R8', 'STM32L053R8'),
    'NUCLEO-G474RE': (function () {
      var b = nucleo64('NUCLEO-G474RE', 'STM32G474RE');
      b.desc = CHIPS.STM32G474RE.desc + ' · ST-Link/V3 내장 (VCP = LPUART1)';
      b.defaults.pins.PA2 = { signal: 'LPUART1_TX', label: 'LPUART1_TX' }; b.defaults.pins.PA3 = { signal: 'LPUART1_RX', label: 'LPUART1_RX' };
      b.defaults.periph = { LPUART1: { mode: 'async', baud: 115200 } };
      b.builtin[1].props.wiring = 'vcc'; b.defaults.pins.PC13 = { signal: 'GPIO_EXTI', label: 'B1', trigger: 'rising', pull: 'down' };
      return b;
    })(),
    'NUCLEO-C031C6': (function () { var b = nucleo64('NUCLEO-C031C6', 'STM32C031C6', 'LD4'); b.kind = 'Nucleo-64'; return b; })(),
    'NUCLEO-F746ZG': nucleo144('NUCLEO-F746ZG', 'STM32F746ZG', [['LD1', 'PB0', 'green'], ['LD2', 'PB7', 'blue'], ['LD3', 'PB14', 'red']], { name: 'USART3', tx: 'PD8', rx: 'PD9' }),
    'NUCLEO-H743ZI2': nucleo144('NUCLEO-H743ZI2', 'STM32H743ZI', [['LD1', 'PB0', 'green'], ['LD2', 'PE1', 'yellow'], ['LD3', 'PB14', 'red']], { name: 'USART3', tx: 'PD8', rx: 'PD9' }),
    'NUCLEO-U575ZI-Q': nucleo144('NUCLEO-U575ZI-Q', 'STM32U575ZI', [['LD1', 'PC7', 'green'], ['LD2', 'PB7', 'blue'], ['LD3', 'PG2', 'red']], { name: 'USART1', tx: 'PA9', rx: 'PA10' }),
    'NUCLEO-WB55RG': {
      chip: 'STM32WB55RG', title: 'P-NUCLEO-WB55', kind: 'Nucleo-68',
      desc: CHIPS.STM32WB55RG.desc + ' · LD1–LD3, SW1–SW3 · VCP = USART1(PB6/PB7)',
      builtin: [
        { id: 'LD1', type: 'board-led', pin: 'PB5', props: { color: 'blue', active: 'high' } },
        { id: 'LD2', type: 'board-led', pin: 'PB0', props: { color: 'green', active: 'high' } },
        { id: 'LD3', type: 'board-led', pin: 'PB1', props: { color: 'red', active: 'high' } },
        { id: 'SW1', type: 'board-button', pin: 'PC4', props: { wiring: 'gnd', label: 'SW1' } },
        { id: 'VCP', type: 'vcp', pins: { tx: 'PB7', rx: 'PB6' }, props: { baud: 115200, name: 'ST-Link VCP' } }
      ],
      defaults: {
        pins: { PB5: { signal: 'GPIO_Output', label: 'LD1' }, PB0: { signal: 'GPIO_Output', label: 'LD2' }, PB1: { signal: 'GPIO_Output', label: 'LD3' },
          PC4: { signal: 'GPIO_EXTI', label: 'SW1', trigger: 'falling', pull: 'up' }, PB6: { signal: 'USART1_TX', label: 'VCP_TX' }, PB7: { signal: 'USART1_RX', label: 'VCP_RX' } },
        periph: { USART1: { mode: 'async', baud: 115200 } }, nvic: {}
      }
    },
    'BLUEPILL-F103C8': {
      chip: 'STM32F103C8', title: 'Blue Pill (F103C8)', kind: '모듈',
      desc: 'STM32F103C8T6 · 8 MHz 크리스털 · 외부 ST-Link 필요',
      builtin: [{ id: 'LED', type: 'board-led', pin: 'PC13', props: { color: 'green', active: 'low' } }],
      defaults: { pins: { PC13: { signal: 'GPIO_Output', label: 'LED', level: 1 } }, periph: {}, nvic: {} }
    },
    'DISCO-F407VG': {
      chip: 'STM32F407VG', title: 'STM32F4DISCOVERY', kind: 'Discovery',
      desc: 'STM32F407VG · LED 4개(PD12–PD15) · 사용자 버튼 PA0 · ST-Link/V2 (VCP 없음)',
      builtin: [
        { id: 'LD4', type: 'board-led', pin: 'PD12', props: { color: 'green', active: 'high' } },
        { id: 'LD3', type: 'board-led', pin: 'PD13', props: { color: 'yellow', active: 'high' } },
        { id: 'LD5', type: 'board-led', pin: 'PD14', props: { color: 'red', active: 'high' } },
        { id: 'LD6', type: 'board-led', pin: 'PD15', props: { color: 'blue', active: 'high' } },
        { id: 'B1', type: 'board-button', pin: 'PA0', props: { wiring: 'vcc', label: 'B1 USER' } }
      ],
      defaults: {
        pins: { PD12: { signal: 'GPIO_Output', label: 'LD4' }, PD13: { signal: 'GPIO_Output', label: 'LD3' }, PD14: { signal: 'GPIO_Output', label: 'LD5' }, PD15: { signal: 'GPIO_Output', label: 'LD6' },
          PA0: { signal: 'GPIO_EXTI', label: 'B1', trigger: 'rising', pull: 'down' } },
        periph: {}, nvic: {}
      }
    }
  };

  // ---------------------------------------------------------------- 도우미
  function isGpio(name) { return /^P[A-K]\d+$/.test(name); }
  var RESERVED = { PA13: 'SYS_JTMS-SWDIO', PA14: 'SYS_JTCK-SWCLK', PC14: 'RCC_OSC32_IN', PC15: 'RCC_OSC32_OUT',
    PH0: 'RCC_OSC_IN', PH1: 'RCC_OSC_OUT', PD0: 'RCC_OSC_IN', PD1: 'RCC_OSC_OUT', PF0: 'RCC_OSC_IN', PF1: 'RCC_OSC_OUT', PH3: 'BOOT0' };
  function reserved(chip, pin) {
    // PD0/PD1 은 F1 48/64핀에서만 오실레이터. 100핀 F4 의 PD0/PD1 은 일반 GPIO.
    if ((pin === 'PD0' || pin === 'PD1') && chip.series !== 'F1') return null;
    // 144핀 칩의 PF0/PF1 은 일반 GPIO (오실레이터는 PH0/PH1)
    if ((pin === 'PF0' || pin === 'PF1') && chip.pins.indexOf('PH0') >= 0) return null;
    return RESERVED[pin] || null;
  }

  /** 핀에서 고를 수 있는 신호 목록 (CubeMX 핀 메뉴와 같은 순서) */
  function pinSignals(chip, pin) {
    if (!isGpio(pin)) return [];
    var r = reserved(chip, pin); if (r) return [r];
    return ['Reset_State', 'GPIO_Input', 'GPIO_Output', 'GPIO_Analog', 'GPIO_EXTI'].concat(chip.af[pin] || []);
  }
  /** ADC 채널 → 핀 */
  function adcPin(chip, ch) { for (var p in chip.af) if (chip.af[p].indexOf('ADC1_IN' + ch) >= 0) return p; return null; }
  /** 신호 이름 → 가능한 핀 목록 */
  function signalPins(chip, sig) {
    var out = [];
    chip.pins.forEach(function (p) { if ((chip.af[p] || []).indexOf(sig) >= 0 && out.indexOf(p) < 0) out.push(p); });
    return out;
  }
  /** EXTI 핀 번호 → NVIC 라인 이름 (M0 계열은 0_1 / 2_3 / 4_15) */
  function extiLine(chip, n) {
    if (chip && chip.exti === 'm0') return n <= 1 ? 'EXTI0_1' : n <= 3 ? 'EXTI2_3' : 'EXTI4_15';
    if (chip && chip.exti === 'u5') return 'EXTI' + n;
    if (chip && chip.exti === 'f3' && n === 2) return 'EXTI2_TSC';
    return n <= 4 ? 'EXTI' + n : n <= 9 ? 'EXTI9_5' : 'EXTI15_10';
  }
  /** 버스 분주: sysclk(MHz) 를 apbMax 이하로 만드는 최소 2^n */
  function apbDiv(mhz, max) { var d = 1; while (mhz / d > max + 1e-9 && d < 16) d *= 2; return d; }
  /** 클럭 요약 { sysclk, apb1, apb2, tim1, tim2, div1, div2 } (MHz) */
  function clocks(chip, mhz) {
    // H7: 200 MHz 넘으면 AHB = SYSCLK/2 (HCLK 최대 240 MHz)
    var ahbDiv = chip.series === 'H7' && mhz > 240 ? 2 : 1, h = mhz / ahbDiv;
    var d1 = apbDiv(h, chip.apb1Max), d2 = apbDiv(h, chip.apb2Max);
    return { sysclk: mhz, hclk: h, ahbDiv: ahbDiv, div1: d1, div2: d2, apb1: h / d1, apb2: h / d2, tim1: h / d1 * (d1 > 1 ? 2 : 1), tim2: h / d2 * (d2 > 1 ? 2 : 1) };
  }
  /** 프로젝트 / 보드 id / 칩 id 무엇을 주어도 칩 객체 */
  function chipOf(x) {
    if (!x) return CHIPS.STM32F411RE;
    if (typeof x === 'object') { if (x.mcu && CHIPS[x.mcu]) return CHIPS[x.mcu]; if (x.board && BOARDS[x.board]) return CHIPS[BOARDS[x.board].chip]; return CHIPS.STM32F411RE; }
    if (CHIPS[x]) return CHIPS[x];
    if (BOARDS[x]) return CHIPS[BOARDS[x].chip];
    return CHIPS.STM32F411RE;
  }
  function boardsFor(chipId) { return Object.keys(BOARDS).filter(function (b) { return BOARDS[b].chip === chipId; }); }

  global.STM32Chips = {
    CHIPS: CHIPS, BOARDS: BOARDS, FAMILIES: FAMILIES, RESERVED: RESERVED,
    isGpio: isGpio, reserved: reserved, pinSignals: pinSignals, adcPin: adcPin, signalPins: signalPins,
    extiLine: extiLine, clocks: clocks, chipOf: chipOf, boardsFor: boardsFor
  };
})(typeof window !== 'undefined' ? window : globalThis);
