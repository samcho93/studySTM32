/*
 * chips.js — 칩 / 보드 데이터
 * -------------------------------------------------------------------------
 * 패키지 핀 순서, 핀별 대체 기능(AF), 주변장치 기본 핀, 보드 내장 장치.
 * 값은 각 칩 데이터시트의 "Pin definitions" 표(기본 매핑)를 기준으로 추렸다.
 * 시뮬레이터가 다루는 주변장치(USART, I2C, SPI, TIM, ADC)만 싣는다.
 */
(function (global) {
  'use strict';

  // LQFP64 (F103RB / F411RE 공통 배치, 차이는 overrides)
  var LQFP64 = [
    'VBAT', 'PC13', 'PC14', 'PC15', 'PH0', 'PH1', 'NRST', 'PC0', 'PC1', 'PC2', 'PC3', 'VSSA', 'VDDA', 'PA0', 'PA1', 'PA2',
    'PA3', 'VSS', 'VDD', 'PA4', 'PA5', 'PA6', 'PA7', 'PC4', 'PC5', 'PB0', 'PB1', 'PB2', 'PB10', 'PB11', 'VSS', 'VDD',
    'PB12', 'PB13', 'PB14', 'PB15', 'PC6', 'PC7', 'PC8', 'PC9', 'PA8', 'PA9', 'PA10', 'PA11', 'PA12', 'PA13', 'VSS', 'VDD',
    'PA14', 'PA15', 'PC10', 'PC11', 'PC12', 'PD2', 'PB3', 'PB4', 'PB5', 'PB6', 'PB7', 'BOOT0', 'PB8', 'PB9', 'VSS', 'VDD'
  ];
  var LQFP48 = [
    'VBAT', 'PC13', 'PC14', 'PC15', 'PD0', 'PD1', 'NRST', 'VSSA', 'VDDA', 'PA0', 'PA1', 'PA2',
    'PA3', 'PA4', 'PA5', 'PA6', 'PA7', 'PB0', 'PB1', 'PB2', 'PB10', 'PB11', 'VSS', 'VDD',
    'PB12', 'PB13', 'PB14', 'PB15', 'PA8', 'PA9', 'PA10', 'PA11', 'PA12', 'PA13', 'VSS', 'VDD',
    'PA14', 'PA15', 'PB3', 'PB4', 'PB5', 'PB6', 'PB7', 'BOOT0', 'PB8', 'PB9', 'VSS', 'VDD'
  ];

  // STM32F1 기본 매핑(리맵 없음)
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
  // STM32F411
  var AF_F4 = {
    PA0: ['ADC1_IN0', 'TIM2_CH1', 'TIM5_CH1'], PA1: ['ADC1_IN1', 'TIM2_CH2', 'TIM5_CH2'],
    PA2: ['ADC1_IN2', 'USART2_TX', 'TIM2_CH3', 'TIM5_CH3'], PA3: ['ADC1_IN3', 'USART2_RX', 'TIM2_CH4', 'TIM5_CH4'],
    PA4: ['ADC1_IN4', 'SPI1_NSS'], PA5: ['ADC1_IN5', 'SPI1_SCK', 'TIM2_CH1'], PA6: ['ADC1_IN6', 'SPI1_MISO', 'TIM3_CH1'],
    PA7: ['ADC1_IN7', 'SPI1_MOSI', 'TIM3_CH2'], PA8: ['TIM1_CH1', 'I2C3_SCL'], PA9: ['USART1_TX', 'TIM1_CH2'],
    PA10: ['USART1_RX', 'TIM1_CH3'], PA11: ['USART6_TX', 'TIM1_CH4'], PA12: ['USART6_RX'], PA15: ['TIM2_CH1', 'SPI1_NSS'],
    PB0: ['ADC1_IN8', 'TIM3_CH3'], PB1: ['ADC1_IN9', 'TIM3_CH4'], PB2: [], PB3: ['TIM2_CH2', 'SPI1_SCK', 'I2C2_SDA'],
    PB4: ['TIM3_CH1', 'SPI1_MISO', 'I2C3_SDA'], PB5: ['TIM3_CH2', 'SPI1_MOSI'], PB6: ['I2C1_SCL', 'TIM4_CH1', 'USART1_TX'],
    PB7: ['I2C1_SDA', 'TIM4_CH2', 'USART1_RX'], PB8: ['I2C1_SCL', 'TIM4_CH3'], PB9: ['I2C1_SDA', 'TIM4_CH4'],
    PB10: ['I2C2_SCL', 'TIM2_CH3', 'SPI2_SCK'], PB11: [], PB12: ['SPI2_NSS'], PB13: ['SPI2_SCK'], PB14: ['SPI2_MISO'], PB15: ['SPI2_MOSI'],
    PC0: ['ADC1_IN10'], PC1: ['ADC1_IN11'], PC2: ['ADC1_IN12', 'SPI2_MISO'], PC3: ['ADC1_IN13', 'SPI2_MOSI'],
    PC4: ['ADC1_IN14'], PC5: ['ADC1_IN15'], PC6: ['TIM3_CH1', 'USART6_TX'], PC7: ['TIM3_CH2', 'USART6_RX'],
    PC8: ['TIM3_CH3'], PC9: ['TIM3_CH4', 'I2C3_SDA'], PC10: [], PC11: [], PC12: [], PC13: [], PD2: []
  };

  function periphDefaults(isF4) {
    var p = {
      USART1: { kind: 'usart', pins: { TX: 'PA9', RX: 'PA10' }, bus: 'APB2', irq: 'USART1' },
      USART2: { kind: 'usart', pins: { TX: 'PA2', RX: 'PA3' }, bus: 'APB1', irq: 'USART2' },
      I2C1: { kind: 'i2c', pins: { SCL: 'PB8', SDA: 'PB9' }, irq: 'I2C1_EV' },
      I2C2: { kind: 'i2c', pins: { SCL: 'PB10', SDA: isF4 ? 'PB3' : 'PB11' }, irq: 'I2C2_EV' },
      SPI1: { kind: 'spi', pins: { SCK: 'PA5', MISO: 'PA6', MOSI: 'PA7' }, irq: 'SPI1' },
      SPI2: { kind: 'spi', pins: { SCK: 'PB13', MISO: 'PB14', MOSI: 'PB15' }, irq: 'SPI2' },
      TIM1: { kind: 'tim', bits: 16, bus: 'APB2', chPins: { 1: 'PA8', 2: 'PA9', 3: 'PA10', 4: 'PA11' }, irq: isF4 ? 'TIM1_UP_TIM10' : 'TIM1_UP' },
      TIM2: { kind: 'tim', bits: isF4 ? 32 : 16, bus: 'APB1', chPins: { 1: 'PA0', 2: 'PA1', 3: 'PA2', 4: 'PA3' }, irq: 'TIM2' },
      TIM3: { kind: 'tim', bits: 16, bus: 'APB1', chPins: { 1: 'PA6', 2: 'PA7', 3: 'PB0', 4: 'PB1' }, irq: 'TIM3' },
      TIM4: { kind: 'tim', bits: 16, bus: 'APB1', chPins: { 1: 'PB6', 2: 'PB7', 3: 'PB8', 4: 'PB9' }, irq: 'TIM4' },
      ADC1: { kind: 'adc', irq: isF4 ? 'ADC' : 'ADC1_2' }
    };
    if (isF4) {
      p.USART6 = { kind: 'usart', pins: { TX: 'PC6', RX: 'PC7' }, bus: 'APB2', irq: 'USART6' };
      p.TIM5 = { kind: 'tim', bits: 32, bus: 'APB1', chPins: { 1: 'PA0', 2: 'PA1', 3: 'PA2', 4: 'PA3' }, irq: 'TIM5' };
    } else {
      p.USART3 = { kind: 'usart', pins: { TX: 'PB10', RX: 'PB11' }, bus: 'APB1', irq: 'USART3' };
      p.I2C1.pins = { SCL: 'PB6', SDA: 'PB7' };
    }
    return p;
  }

  var CHIPS = {
    STM32F411RE: {
      name: 'STM32F411RETx', family: 'STM32F4', series: 'F4', core: 'Cortex-M4F', pkg: 'LQFP64', pins: LQFP64.slice(),
      af: AF_F4, flash: 512, ram: 128, maxClk: 100, sysclks: [16, 48, 84, 100], defClk: 84,
      apb1Max: 50, periph: periphDefaults(true), hal: 'STM32F4xx_HAL_Driver', halPrefix: 'stm32f4xx'
    },
    STM32F103RB: {
      name: 'STM32F103RBTx', family: 'STM32F1', series: 'F1', core: 'Cortex-M3', pkg: 'LQFP64',
      pins: LQFP64.map(function (p) { return p === 'PH0' ? 'PD0' : p === 'PH1' ? 'PD1' : p; }),
      af: AF_F1, flash: 128, ram: 20, maxClk: 72, sysclks: [8, 36, 64, 72], defClk: 72,
      apb1Max: 36, periph: periphDefaults(false), hal: 'STM32F1xx_HAL_Driver', halPrefix: 'stm32f1xx'
    },
    STM32F103C8: {
      name: 'STM32F103C8Tx', family: 'STM32F1', series: 'F1', core: 'Cortex-M3', pkg: 'LQFP48', pins: LQFP48.slice(),
      af: AF_F1, flash: 64, ram: 20, maxClk: 72, sysclks: [8, 36, 64, 72], defClk: 72,
      apb1Max: 36, periph: periphDefaults(false), hal: 'STM32F1xx_HAL_Driver', halPrefix: 'stm32f1xx'
    }
  };
  // F103C8 엔 PC0–PC12, PD2 가 없다
  (function () {
    var c = CHIPS.STM32F103C8;
    delete c.periph.USART3; c.periph.USART3 = { kind: 'usart', pins: { TX: 'PB10', RX: 'PB11' }, bus: 'APB1', irq: 'USART3' };
  })();

  var BOARDS = {
    'NUCLEO-F411RE': {
      chip: 'STM32F411RE', title: 'NUCLEO-F411RE',
      desc: 'STM32F411RE · Cortex-M4F 100MHz · 512KB Flash · ST-Link/V2-1 내장',
      builtin: [
        { id: 'LD2', type: 'board-led', pin: 'PA5', props: { color: 'green', active: 'high' } },
        { id: 'B1', type: 'board-button', pin: 'PC13', props: { wiring: 'module', label: 'B1 USER' } },
        { id: 'VCP', type: 'vcp', pins: { tx: 'PA3', rx: 'PA2' }, props: { baud: 115200, name: 'ST-Link VCP' } }
      ],
      defaults: {
        pins: { PA5: { signal: 'GPIO_Output', label: 'LD2' }, PC13: { signal: 'GPIO_EXTI', label: 'B1', trigger: 'falling' },
          PA2: { signal: 'USART2_TX', label: 'USART_TX' }, PA3: { signal: 'USART2_RX', label: 'USART_RX' } },
        periph: { USART2: { mode: 'async', baud: 115200 } },
        nvic: {}
      }
    },
    'NUCLEO-F103RB': {
      chip: 'STM32F103RB', title: 'NUCLEO-F103RB',
      desc: 'STM32F103RB · Cortex-M3 72MHz · 128KB Flash · ST-Link/V2-1 내장',
      builtin: [
        { id: 'LD2', type: 'board-led', pin: 'PA5', props: { color: 'green', active: 'high' } },
        { id: 'B1', type: 'board-button', pin: 'PC13', props: { wiring: 'module', label: 'B1 USER' } },
        { id: 'VCP', type: 'vcp', pins: { tx: 'PA3', rx: 'PA2' }, props: { baud: 115200, name: 'ST-Link VCP' } }
      ],
      defaults: {
        pins: { PA5: { signal: 'GPIO_Output', label: 'LD2' }, PC13: { signal: 'GPIO_EXTI', label: 'B1', trigger: 'falling' },
          PA2: { signal: 'USART2_TX', label: 'USART_TX' }, PA3: { signal: 'USART2_RX', label: 'USART_RX' } },
        periph: { USART2: { mode: 'async', baud: 115200 } },
        nvic: {}
      }
    },
    'BLUEPILL-F103C8': {
      chip: 'STM32F103C8', title: 'Blue Pill (F103C8)',
      desc: 'STM32F103C8T6 · Cortex-M3 72MHz · 64KB Flash · 외부 ST-Link 필요',
      builtin: [
        { id: 'LED', type: 'board-led', pin: 'PC13', props: { color: 'green', active: 'low' } }
      ],
      defaults: {
        pins: { PC13: { signal: 'GPIO_Output', label: 'LED', level: 1 } },
        periph: {},
        nvic: {}
      }
    }
  };

  function isGpio(name) { return /^P[A-H]\d+$/.test(name); }
  var RESERVED = { PA13: 'SYS_JTMS-SWDIO', PA14: 'SYS_JTCK-SWCLK', PC14: 'RCC_OSC32_IN', PC15: 'RCC_OSC32_OUT',
    PH0: 'RCC_OSC_IN', PH1: 'RCC_OSC_OUT', PD0: 'RCC_OSC_IN', PD1: 'RCC_OSC_OUT' };

  /** 핀에서 고를 수 있는 신호 목록 (CubeMX 핀 메뉴와 같은 순서) */
  function pinSignals(chip, pin) {
    var list = ['Reset_State'];
    if (!isGpio(pin)) return [];
    if (RESERVED[pin]) return [RESERVED[pin]];
    list.push('GPIO_Input', 'GPIO_Output', 'GPIO_Analog', 'GPIO_EXTI');
    return list.concat(chip.af[pin] || []);
  }

  /** ADC 채널 → 핀 */
  function adcPin(chip, ch) {
    for (var p in chip.af) if (chip.af[p].indexOf('ADC1_IN' + ch) >= 0) return p;
    return null;
  }

  /** 신호 이름 → 가능한 핀 목록 */
  function signalPins(chip, sig) {
    var out = [];
    chip.pins.forEach(function (p) { if ((chip.af[p] || []).indexOf(sig) >= 0 && out.indexOf(p) < 0) out.push(p); });
    return out;
  }

  global.STM32Chips = {
    CHIPS: CHIPS, BOARDS: BOARDS, RESERVED: RESERVED,
    isGpio: isGpio, pinSignals: pinSignals, adcPin: adcPin, signalPins: signalPins,
    chipOf: function (boardId) { return CHIPS[(BOARDS[boardId] || BOARDS['NUCLEO-F411RE']).chip]; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
