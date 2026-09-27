/*
 * examples.js — 레슨 예제 프로젝트 (window.STM32_EXAMPLES)
 * ---------------------------------------------------------------------------
 * 스키마는 docs/SPEC.md 3장을 따릅니다.
 *   sim/index.html?ex=<id>           → 이 예제를 불러와 시뮬레이터에서 엽니다.
 *   sim/index.html?ex=<id>&embed=1   → 레슨 오른쪽 실습 패널(iframe)용.
 *
 * user.* 는 CubeMX 생성 코드의 USER CODE 구역에 그대로 들어가는 C 코드입니다.
 * 코드는 C`...` (String.raw) 로 적어 "\r\n" 같은 C 이스케이프가 그대로 보존됩니다.
 * 들여쓰기: u2 는 main() 안(2칸), loop 는 while (1) 안(4칸), 함수는 CubeMX 식 2칸.
 *
 * build.py 가 이 파일을 정규식으로 읽어 레슨 본문(@code[id] 섹션)에 같은 코드를 싣습니다.
 * 그래서 각 섹션은 반드시  이름: C`...`  형태로 적고, 코드 안에 백틱(`)을 쓰지 않습니다.
 */
(function (root) {
  'use strict';
  var STM32_EXAMPLES = root.STM32_EXAMPLES = root.STM32_EXAMPLES || {};
  // 태그드 템플릿: 백슬래시를 그대로 두고 맨 앞 줄바꿈 하나만 뗍니다.
  var C = function (s) { return String.raw(s).replace(/^\n/, ''); };

  // 여러 예제가 함께 쓰는 코드 조각(PUTCHAR, LCD_DRIVER, MOTOR_SET …)은 처음 쓰이는 레슨 근처에 둡니다.
  // 레슨 본문에는 @code[id] 로 예제마다 펼쳐 보이므로 학생에게는 완성된 코드로 보입니다.

  // ======================================================================= L02
  STM32_EXAMPLES['l02-first'] = {
    title: '첫 프로젝트 — LD2 심장 박동',
    desc: 'LD2를 100 ms 켜고 900 ms 끄기를 반복합니다. CubeMX → Generate → USER CODE → Build → Run 흐름 연습.',
    lesson: 'l02',
    board: 'NUCLEO-F411RE',
    pins: {
      PA5: { signal: 'GPIO_Output', label: 'LD2', level: 0 },
      PC13: { signal: 'GPIO_Input', label: 'B1', pull: 'none' }
    },
    periph: {},
    nvic: {},
    nodes: [],
    wires: [],
    user: {
      includes: '', pv: '', pfp: '', u0: '', u2: '',
      loop: C`
    HAL_GPIO_WritePin(LD2_GPIO_Port, LD2_Pin, GPIO_PIN_SET);    // LD2 켜기
    HAL_Delay(100);
    HAL_GPIO_WritePin(LD2_GPIO_Port, LD2_Pin, GPIO_PIN_RESET);  // LD2 끄기
    HAL_Delay(900);
`,
      u4: ''
    }
  };

  // ======================================================================= L03
  STM32_EXAMPLES['l03-blink'] = {
    title: 'LED 깜빡이기 (TogglePin)',
    desc: '보드 LED LD2(PA5)를 0.5초마다 반전합니다.',
    lesson: 'l03',
    board: 'NUCLEO-F411RE',
    pins: {
      PA5: { signal: 'GPIO_Output', label: 'LD2', level: 0 }
    },
    periph: {},
    nvic: {},
    nodes: [],
    wires: [],
    user: {
      includes: '', pv: '', pfp: '', u0: '', u2: '',
      loop: C`
    HAL_GPIO_TogglePin(LD2_GPIO_Port, LD2_Pin);
    HAL_Delay(500);
`,
      u4: ''
    }
  };

  STM32_EXAMPLES['l03-traffic'] = {
    title: '신호등 — 외부 LED 3개',
    desc: 'PA6/PA7/PA8 에 연결한 빨강·노랑·초록 LED로 신호등 순서를 만듭니다.',
    lesson: 'l03',
    board: 'NUCLEO-F411RE',
    pins: {
      PA6: { signal: 'GPIO_Output', label: 'LED_RED', level: 0 },
      PA7: { signal: 'GPIO_Output', label: 'LED_YELLOW', level: 0 },
      PA8: { signal: 'GPIO_Output', label: 'LED_GREEN', level: 0 }
    },
    periph: {},
    nvic: {},
    nodes: [
      { id: 'red', type: 'led', x: 560, y: 80, props: { color: 'red', active: 'high' } },
      { id: 'yellow', type: 'led', x: 560, y: 170, props: { color: 'yellow', active: 'high' } },
      { id: 'green', type: 'led', x: 560, y: 260, props: { color: 'green', active: 'high' } }
    ],
    wires: [['PA6', 'red.in'], ['PA7', 'yellow.in'], ['PA8', 'green.in']],
    user: {
      includes: '', pv: '', pfp: '',
      u0: C`
/* 세 LED 를 한 번에 설정합니다. 인자가 0 이 아니면 켭니다. */
void set_lights(uint8_t red, uint8_t yellow, uint8_t green)
{
  HAL_GPIO_WritePin(LED_RED_GPIO_Port, LED_RED_Pin, red ? GPIO_PIN_SET : GPIO_PIN_RESET);
  HAL_GPIO_WritePin(LED_YELLOW_GPIO_Port, LED_YELLOW_Pin, yellow ? GPIO_PIN_SET : GPIO_PIN_RESET);
  HAL_GPIO_WritePin(LED_GREEN_GPIO_Port, LED_GREEN_Pin, green ? GPIO_PIN_SET : GPIO_PIN_RESET);
}
`,
      u2: '',
      loop: C`
    set_lights(0, 0, 1);   // 초록 3초
    HAL_Delay(3000);
    set_lights(0, 1, 0);   // 노랑 1초
    HAL_Delay(1000);
    set_lights(1, 0, 0);   // 빨강 3초
    HAL_Delay(3000);
`,
      u4: ''
    }
  };

  STM32_EXAMPLES['l03-bsrr'] = {
    title: '레지스터로 깜빡이기 (BSRR)',
    desc: 'HAL 함수 대신 GPIOA->BSRR 레지스터에 직접 써서 LD2를 켜고 끕니다.',
    lesson: 'l03',
    board: 'NUCLEO-F411RE',
    pins: {
      PA5: { signal: 'GPIO_Output', label: 'LD2', level: 0 }
    },
    periph: {},
    nvic: {},
    nodes: [],
    wires: [],
    user: {
      includes: '', pv: '', pfp: '', u0: '', u2: '',
      loop: C`
    GPIOA->BSRR = GPIO_PIN_5;                    // 하위 16비트: 1 을 쓴 핀을 HIGH
    HAL_Delay(500);
    GPIOA->BSRR = (uint32_t)GPIO_PIN_5 << 16;    // 상위 16비트: 1 을 쓴 핀을 LOW
    HAL_Delay(500);
`,
      u4: ''
    }
  };

  // ======================================================================= L04
  STM32_EXAMPLES['l04-button'] = {
    title: '버튼 누르는 동안 LED 켜기',
    desc: 'B1(PC13, 누르면 LOW)을 폴링해서 누르는 동안만 LD2를 켭니다.',
    lesson: 'l04',
    board: 'NUCLEO-F411RE',
    pins: {
      PA5: { signal: 'GPIO_Output', label: 'LD2', level: 0 },
      PC13: { signal: 'GPIO_Input', label: 'B1', pull: 'none' }
    },
    periph: {},
    nvic: {},
    nodes: [],
    wires: [],
    user: {
      includes: '', pv: '', pfp: '', u0: '', u2: '',
      loop: C`
    if (HAL_GPIO_ReadPin(B1_GPIO_Port, B1_Pin) == GPIO_PIN_RESET) {   // 눌림 (active-low)
      HAL_GPIO_WritePin(LD2_GPIO_Port, LD2_Pin, GPIO_PIN_SET);
    } else {
      HAL_GPIO_WritePin(LD2_GPIO_Port, LD2_Pin, GPIO_PIN_RESET);
    }
    HAL_Delay(10);
`,
      u4: ''
    }
  };

  STM32_EXAMPLES['l04-toggle'] = {
    title: '누를 때마다 LED 토글 (디바운스)',
    desc: '외부 버튼(PB4, 내부 풀업)의 눌린 순간만 잡아 LED(PA6)를 토글합니다. 20 ms 디바운스.',
    lesson: 'l04',
    board: 'NUCLEO-F411RE',
    pins: {
      PA6: { signal: 'GPIO_Output', label: 'LED', level: 0 },
      PB4: { signal: 'GPIO_Input', label: 'BTN', pull: 'up' }
    },
    periph: {},
    nvic: {},
    nodes: [
      { id: 'btn1', type: 'button', x: 540, y: 220, props: { wiring: 'gnd', mode: 'push', label: 'SW1' } },
      { id: 'led1', type: 'led', x: 560, y: 90, props: { color: 'green', active: 'high' } }
    ],
    wires: [['PB4', 'btn1.out'], ['PA6', 'led1.in']],
    user: {
      includes: '',
      pv: C`
uint8_t led_on = 0;          // LED 상태 (0: 꺼짐, 1: 켜짐)
uint8_t last_state = 1;      // 직전에 읽은 버튼 값 (풀업이므로 평소 1)
uint32_t press_count = 0;    // 눌린 횟수
`,
      pfp: '', u0: '', u2: '',
      loop: C`
    uint8_t now = HAL_GPIO_ReadPin(BTN_GPIO_Port, BTN_Pin);
    if (last_state == 1 && now == 0) {          // HIGH -> LOW : 눌린 순간(하강 에지)
      HAL_Delay(20);                            // 디바운스: 20 ms 뒤에 다시 확인
      if (HAL_GPIO_ReadPin(BTN_GPIO_Port, BTN_Pin) == GPIO_PIN_RESET) {
        led_on = !led_on;
        press_count++;
        HAL_GPIO_WritePin(LED_GPIO_Port, LED_Pin, led_on ? GPIO_PIN_SET : GPIO_PIN_RESET);
      }
    }
    last_state = now;
`,
      u4: ''
    }
  };

  // ======================================================================= L05
  STM32_EXAMPLES['l05-exti'] = {
    title: '외부 인터럽트로 LED 토글',
    desc: 'B1(PC13) 하강 에지 EXTI 로 LD2를 토글합니다. 메인 루프는 느리게 외부 LED를 깜빡여도 버튼은 즉시 반응합니다.',
    lesson: 'l05',
    board: 'NUCLEO-F411RE',
    pins: {
      PA5: { signal: 'GPIO_Output', label: 'LD2', level: 0 },
      PA6: { signal: 'GPIO_Output', label: 'LED', level: 0 },
      PC13: { signal: 'GPIO_EXTI', label: 'B1', pull: 'none', trigger: 'falling' }
    },
    periph: {},
    nvic: { EXTI15_10: true },
    nodes: [
      { id: 'led1', type: 'led', x: 560, y: 90, props: { color: 'yellow', active: 'high' } }
    ],
    wires: [['PA6', 'led1.in']],
    user: {
      includes: '',
      pv: C`
volatile uint32_t press_count = 0;   // 인터럽트에서 바꾸는 변수는 volatile
volatile uint32_t last_press = 0;    // 마지막으로 인정한 눌림 시각 [ms]
`,
      pfp: '', u0: '', u2: '',
      loop: C`
    HAL_GPIO_TogglePin(LED_GPIO_Port, LED_Pin);   // 느린 작업 흉내: 1초마다 깜빡임
    HAL_Delay(1000);
`,
      u4: C`
/* EXTI 인터럽트가 걸리면 HAL 이 이 함수를 불러 줍니다 (weak 함수 재정의). */
void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin)
{
  if (GPIO_Pin == B1_Pin) {
    uint32_t now = HAL_GetTick();
    if (now - last_press > 200) {              // 200 ms 안에 다시 들어온 채터링은 무시
      last_press = now;
      press_count++;
      HAL_GPIO_TogglePin(LD2_GPIO_Port, LD2_Pin);
    }
  }
}
`
    }
  };

  // ======================================================================= L06
  var PUTCHAR = C`
/* printf 리타깃: syscalls.c 의 _write() 가 글자마다 이 함수를 부릅니다. */
int __io_putchar(int ch)
{
  HAL_UART_Transmit(&huart2, (uint8_t *)&ch, 1, HAL_MAX_DELAY);
  return ch;
}
`;

  STM32_EXAMPLES['l06-printf'] = {
    title: 'printf 카운터 + 수신 에코',
    desc: 'USART2(ST-Link VCP)로 1초마다 카운터를 출력하고, 받은 글자를 수신 인터럽트로 되돌려 보냅니다.',
    lesson: 'l06',
    board: 'NUCLEO-F411RE',
    pins: {
      PA2: { signal: 'USART2_TX' },
      PA3: { signal: 'USART2_RX' },
      PA5: { signal: 'GPIO_Output', label: 'LD2', level: 0 }
    },
    periph: { USART2: { mode: 'async', baud: 115200 } },
    nvic: { USART2: true },
    nodes: [],
    wires: [],
    user: {
      includes: C`
#include <stdio.h>
`,
      pv: C`
uint8_t rx_byte;               // 수신 1바이트 버퍼
volatile uint8_t rx_flag = 0;  // 콜백 -> 메인 루프 알림
uint32_t count = 0;
uint32_t last_print = 0;
`,
      pfp: C`
int __io_putchar(int ch);
`,
      u0: '',
      u2: C`
  printf("\r\nHello, STM32!\r\n");
  HAL_UART_Receive_IT(&huart2, &rx_byte, 1);    // 1바이트 수신 인터럽트 시작
`,
      loop: C`
    if (HAL_GetTick() - last_print >= 1000) {   // 1초마다 (HAL_Delay 없이)
      last_print = HAL_GetTick();
      printf("count = %lu\r\n", count++);
      HAL_GPIO_TogglePin(LD2_GPIO_Port, LD2_Pin);
    }
    if (rx_flag) {
      rx_flag = 0;
      printf("echo: %c (0x%02X)\r\n", rx_byte, rx_byte);
    }
`,
      u4: PUTCHAR + C`

/* 요청한 바이트 수를 다 받으면 호출됩니다. */
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
  if (huart->Instance == USART2) {
    rx_flag = 1;
    HAL_UART_Receive_IT(&huart2, &rx_byte, 1);  // 다음 바이트를 받도록 다시 켜기
  }
}
`
    }
  };

  STM32_EXAMPLES['l06-command'] = {
    title: 'UART 명령어로 LED 제어',
    desc: '터미널에서 on / off / toggle 을 입력하고 Enter 를 누르면 LD2가 바뀝니다. 한 줄 버퍼 + strcmp.',
    lesson: 'l06',
    board: 'NUCLEO-F411RE',
    pins: {
      PA2: { signal: 'USART2_TX' },
      PA3: { signal: 'USART2_RX' },
      PA5: { signal: 'GPIO_Output', label: 'LD2', level: 0 }
    },
    periph: { USART2: { mode: 'async', baud: 115200 } },
    nvic: { USART2: true },
    nodes: [],
    wires: [],
    user: {
      includes: C`
#include <stdio.h>
#include <string.h>
`,
      pv: C`
uint8_t rx_byte;
char line[32];                   // 한 줄 명령 버퍼
uint8_t line_len = 0;
volatile uint8_t line_ready = 0; // Enter 가 들어오면 1
`,
      pfp: C`
int __io_putchar(int ch);
`,
      u0: '',
      u2: C`
  printf("\r\nCommands: on, off, toggle\r\n> ");
  fflush(stdout);                               // 줄바꿈 없는 프롬프트를 바로 내보내기
  HAL_UART_Receive_IT(&huart2, &rx_byte, 1);
`,
      loop: C`
    if (line_ready) {
      if (strcmp(line, "on") == 0) {
        HAL_GPIO_WritePin(LD2_GPIO_Port, LD2_Pin, GPIO_PIN_SET);
        printf("LED ON\r\n");
      } else if (strcmp(line, "off") == 0) {
        HAL_GPIO_WritePin(LD2_GPIO_Port, LD2_Pin, GPIO_PIN_RESET);
        printf("LED OFF\r\n");
      } else if (strcmp(line, "toggle") == 0) {
        HAL_GPIO_TogglePin(LD2_GPIO_Port, LD2_Pin);
        printf("LED TOGGLE\r\n");
      } else {
        printf("unknown command: %s\r\n", line);
      }
      printf("> ");
      fflush(stdout);
      line_len = 0;
      line_ready = 0;              // 처리 끝: 다음 줄 받기 허용
    }
`,
      u4: PUTCHAR + C`

void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
  if (huart->Instance == USART2) {
    if (rx_byte == '\r' || rx_byte == '\n') {
      if (line_len > 0 && !line_ready) {
        line[line_len] = '\0';     // 문자열 끝 표시
        line_ready = 1;
      }
    } else if (!line_ready && line_len < sizeof(line) - 1) {
      line[line_len++] = rx_byte;
    }
    HAL_UART_Receive_IT(&huart2, &rx_byte, 1);
  }
}
`
    }
  };

  // ======================================================================= L07
  STM32_EXAMPLES['l07-timer'] = {
    title: 'TIM3 1 Hz 인터럽트',
    desc: 'PSC=8399, ARR=9999 → 84 MHz / 8400 / 10000 = 1 Hz. 콜백에서 LD2 토글, 메인에서 경과 시간 출력.',
    lesson: 'l07',
    board: 'NUCLEO-F411RE',
    pins: {
      PA2: { signal: 'USART2_TX' },
      PA3: { signal: 'USART2_RX' },
      PA5: { signal: 'GPIO_Output', label: 'LD2', level: 0 }
    },
    periph: {
      USART2: { mode: 'async', baud: 115200 },
      TIM3: { psc: 8399, arr: 9999 }
    },
    nvic: { TIM3: true },
    nodes: [],
    wires: [],
    user: {
      includes: C`
#include <stdio.h>
`,
      pv: C`
volatile uint32_t seconds = 0;
volatile uint8_t tick_flag = 0;
`,
      pfp: C`
int __io_putchar(int ch);
`,
      u0: '',
      u2: C`
  HAL_TIM_Base_Start_IT(&htim3);     // 타이머 시작 + 업데이트 인터럽트 허용
`,
      loop: C`
    if (tick_flag) {
      tick_flag = 0;
      printf("uptime: %lu s\r\n", seconds);
    }
`,
      u4: PUTCHAR + C`

/* 타이머 카운터가 ARR 에 도달해 0 으로 돌아갈 때마다 호출됩니다. */
void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim)
{
  if (htim->Instance == TIM3) {
    seconds++;
    tick_flag = 1;
    HAL_GPIO_TogglePin(LD2_GPIO_Port, LD2_Pin);
  }
}
`
    }
  };

  STM32_EXAMPLES['l07-multi'] = {
    title: '1 kHz 타이머로 여러 주기 만들기',
    desc: 'TIM3 을 1 ms 마다 인터럽트(PSC=83, ARR=999)로 두고 소프트웨어 카운터로 LD2 500 ms, 외부 LED 100 ms 주기를 만듭니다.',
    lesson: 'l07',
    board: 'NUCLEO-F411RE',
    pins: {
      PA5: { signal: 'GPIO_Output', label: 'LD2', level: 0 },
      PA6: { signal: 'GPIO_Output', label: 'LED', level: 0 }
    },
    periph: { TIM3: { psc: 83, arr: 999 } },
    nvic: { TIM3: true },
    nodes: [
      { id: 'led1', type: 'led', x: 560, y: 90, props: { color: 'blue', active: 'high' } }
    ],
    wires: [['PA6', 'led1.in']],
    user: {
      includes: '',
      pv: C`
volatile uint32_t ms = 0;            // 1 ms 마다 1 씩 증가
`,
      pfp: '', u0: '',
      u2: C`
  HAL_TIM_Base_Start_IT(&htim3);
`,
      loop: C`
    // 할 일이 없습니다. 모든 깜빡임은 타이머 인터럽트가 처리합니다.
`,
      u4: C`
void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim)
{
  if (htim->Instance == TIM3) {
    ms++;
    if (ms % 500 == 0) HAL_GPIO_TogglePin(LD2_GPIO_Port, LD2_Pin);   // 1 Hz 깜빡임
    if (ms % 100 == 0) HAL_GPIO_TogglePin(LED_GPIO_Port, LED_Pin);   // 5 Hz 깜빡임
  }
}
`
    }
  };

  // ======================================================================= L08
  STM32_EXAMPLES['l08-pwm-led'] = {
    title: 'PWM 으로 LED 밝기 조절 (페이드)',
    desc: 'TIM3_CH1(PA6) 1 kHz PWM, 듀티 0~999 를 오르내리며 LED 가 서서히 밝아졌다 어두워집니다.',
    lesson: 'l08',
    board: 'NUCLEO-F411RE',
    pins: {
      PA6: { signal: 'TIM3_CH1' }
    },
    periph: { TIM3: { psc: 83, arr: 999, ch: { 1: 'pwm' }, pulse: { 1: 0 } } },
    nvic: {},
    nodes: [
      { id: 'led1', type: 'led', x: 560, y: 110, props: { color: 'red', active: 'high' } },
      { id: 'la', type: 'logic', x: 560, y: 260, props: {} }
    ],
    wires: [['PA6', 'led1.in'], ['PA6', 'la.ch0']],
    user: {
      includes: '',
      pv: C`
int duty = 0;      // 0 ~ 999 (ARR)
int step = 10;     // 한 번에 바뀌는 양 (+ 밝아짐, - 어두워짐)
`,
      pfp: '', u0: '',
      u2: C`
  HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1);   // PWM 출력 시작 (이걸 빼면 핀이 움직이지 않습니다)
`,
      loop: C`
    __HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, duty);
    duty += step;
    if (duty >= 999) {
      duty = 999;
      step = -step;
    } else if (duty <= 0) {
      duty = 0;
      step = -step;
    }
    HAL_Delay(10);
`,
      u4: ''
    }
  };

  STM32_EXAMPLES['l08-servo'] = {
    title: '서보 모터 0~180도 스윕',
    desc: 'TIM2_CH1(PA0) 50 Hz PWM(PSC=83, ARR=19999), 펄스 폭 500~2500 us 로 서보 각도를 바꿉니다.',
    lesson: 'l08',
    board: 'NUCLEO-F411RE',
    pins: {
      PA0: { signal: 'TIM2_CH1' }
    },
    periph: { TIM2: { psc: 83, arr: 19999, ch: { 1: 'pwm' }, pulse: { 1: 1500 } } },
    nvic: {},
    nodes: [
      { id: 'sv1', type: 'servo', x: 560, y: 120, props: { minUs: 500, maxUs: 2500 } }
    ],
    wires: [['PA0', 'sv1.sig']],
    user: {
      includes: '', pv: '', pfp: '',
      u0: C`
/* 0~180도 -> 500~2500 us. 타이머 1틱 = 1 us 이므로 펄스 폭(us)을 그대로 CCR 에 씁니다. */
void servo_write(uint8_t angle)
{
  if (angle > 180) angle = 180;
  uint32_t pulse = 500 + (uint32_t)angle * 2000 / 180;
  __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_1, pulse);
}
`,
      u2: C`
  HAL_TIM_PWM_Start(&htim2, TIM_CHANNEL_1);
`,
      loop: C`
    for (int a = 0; a <= 180; a += 10) {
      servo_write(a);
      HAL_Delay(100);
    }
    for (int a = 180; a >= 0; a -= 10) {
      servo_write(a);
      HAL_Delay(100);
    }
`,
      u4: ''
    }
  };

  // ======================================================================= L09
  STM32_EXAMPLES['l09-pot'] = {
    title: '가변저항 → UART 출력 + LED 밝기',
    desc: 'ADC1_IN0(PA0) 폴링으로 가변저항을 읽어 전압을 printf(%.2f)로 출력하고, 같은 값으로 TIM3_CH1(PA6) LED 밝기를 바꿉니다.',
    lesson: 'l09',
    board: 'NUCLEO-F411RE',
    pins: {
      PA0: { signal: 'ADC1_IN0' },
      PA2: { signal: 'USART2_TX' },
      PA3: { signal: 'USART2_RX' },
      PA6: { signal: 'TIM3_CH1' }
    },
    periph: {
      USART2: { mode: 'async', baud: 115200 },
      ADC1: { channels: [0] },
      TIM3: { psc: 83, arr: 999, ch: { 1: 'pwm' }, pulse: { 1: 0 } }
    },
    nvic: {},
    settings: { printfFloat: true },
    nodes: [
      { id: 'pot1', type: 'pot', x: 540, y: 230, props: { value: 2048 } },
      { id: 'led1', type: 'led', x: 560, y: 90, props: { color: 'white', active: 'high' } }
    ],
    wires: [['PA0', 'pot1.out'], ['PA6', 'led1.in']],
    user: {
      includes: C`
#include <stdio.h>
`,
      pv: C`
uint32_t adc_value = 0;     // 0 ~ 4095 (12비트)
uint32_t last_print = 0;
`,
      pfp: C`
int __io_putchar(int ch);
`,
      u0: '',
      u2: C`
  HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1);
`,
      loop: C`
    HAL_ADC_Start(&hadc1);                                  // 1) 변환 시작
    if (HAL_ADC_PollForConversion(&hadc1, 10) == HAL_OK) {  // 2) 끝날 때까지 대기 (최대 10 ms)
      adc_value = HAL_ADC_GetValue(&hadc1);                 // 3) 결과 읽기
    }
    HAL_ADC_Stop(&hadc1);

    __HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, adc_value * 999 / 4095);

    if (HAL_GetTick() - last_print >= 500) {
      last_print = HAL_GetTick();
      float volt = adc_value * 3.3f / 4095.0f;
      printf("ADC = %4lu   V = %.2f\r\n", adc_value, volt);
    }
    HAL_Delay(10);
`,
      u4: PUTCHAR
    }
  };

  STM32_EXAMPLES['l09-dma'] = {
    title: '가변저항 + 조도센서 — 다채널 DMA',
    desc: 'ADC1 IN0(PA0 가변저항)·IN1(PA1 CDS)을 스캔 + 연속 변환 + 순환 DMA 로 adc_buf[2] 에 계속 채웁니다.',
    lesson: 'l09',
    board: 'NUCLEO-F411RE',
    pins: {
      PA0: { signal: 'ADC1_IN0' },
      PA1: { signal: 'ADC1_IN1' },
      PA2: { signal: 'USART2_TX' },
      PA3: { signal: 'USART2_RX' }
    },
    periph: {
      USART2: { mode: 'async', baud: 115200 },
      ADC1: { channels: [0, 1], scan: true, continuous: true, dma: 'circular' }
    },
    nvic: {},
    nodes: [
      { id: 'pot1', type: 'pot', x: 540, y: 110, props: { value: 1000 } },
      { id: 'cds1', type: 'ldr', x: 540, y: 250, props: { lux: 300 } }
    ],
    wires: [['PA0', 'pot1.out'], ['PA1', 'cds1.out']],
    user: {
      includes: C`
#include <stdio.h>
`,
      pv: C`
uint16_t adc_buf[2];        // [0] = IN0 가변저항, [1] = IN1 조도센서 (rank 순서)
`,
      pfp: C`
int __io_putchar(int ch);
`,
      u0: '',
      u2: C`
  HAL_ADC_Start_DMA(&hadc1, (uint32_t *)adc_buf, 2);   // 한 번 시작하면 DMA 가 계속 채웁니다
`,
      loop: C`
    printf("POT = %4u   CDS = %4u\r\n", adc_buf[0], adc_buf[1]);
    HAL_Delay(500);
`,
      u4: PUTCHAR
    }
  };

  // ======================================================================= L10
  var LCD_DRIVER = C`
/* ---- I2C LCD1602 (PCF8574 백팩) 드라이버 ----
 * PCF8574 비트: P0=RS, P1=RW, P2=EN, P3=백라이트, P4~P7=D4~D7 (4비트 모드) */
#define LCD_ADDR  (0x27 << 1)   // HAL 은 7비트 주소를 왼쪽으로 1비트 민 값을 받습니다
#define LCD_RS    0x01
#define LCD_EN    0x04
#define LCD_BL    0x08

/* 상위 4비트(nibble)를 EN 펄스와 함께 보냅니다. */
void lcd_send4(uint8_t nibble, uint8_t rs)
{
  uint8_t data[2];
  data[0] = nibble | LCD_BL | LCD_EN | rs;   // EN = 1
  data[1] = nibble | LCD_BL | rs;            // EN = 0 (하강 에지에서 LCD 가 읽음)
  HAL_I2C_Master_Transmit(&hi2c1, LCD_ADDR, data, 2, 10);
}

/* 8비트 값을 상위 -> 하위 4비트 순서로 두 번 나눠 보냅니다. */
void lcd_send(uint8_t value, uint8_t rs)
{
  lcd_send4(value & 0xF0, rs);
  lcd_send4((value << 4) & 0xF0, rs);
}

void lcd_cmd(uint8_t cmd)
{
  lcd_send(cmd, 0);
  if (cmd == 0x01 || cmd == 0x02) HAL_Delay(2);   // Clear / Home 은 1.5 ms 이상 걸림
}

void lcd_data(uint8_t ch)
{
  lcd_send(ch, LCD_RS);
}

void lcd_init(void)
{
  HAL_Delay(50);                 // 전원 인가 후 안정화
  lcd_send4(0x30, 0); HAL_Delay(5);
  lcd_send4(0x30, 0); HAL_Delay(1);
  lcd_send4(0x30, 0); HAL_Delay(1);
  lcd_send4(0x20, 0); HAL_Delay(1);   // 4비트 모드로 전환
  lcd_cmd(0x28);                 // 4비트, 2줄, 5x8 글꼴
  lcd_cmd(0x08);                 // 표시 끔
  lcd_cmd(0x01);                 // 화면 지우기
  lcd_cmd(0x06);                 // 글자 쓰면 커서 오른쪽으로
  lcd_cmd(0x0C);                 // 표시 켬, 커서 숨김
}

void lcd_set_cursor(uint8_t row, uint8_t col)
{
  uint8_t addr = (row == 0 ? 0x00 : 0x40) + col;   // 1행 DDRAM 0x00, 2행 0x40
  lcd_cmd(0x80 | addr);
}

void lcd_print(const char *s)
{
  while (*s) {
    lcd_data((uint8_t)*s++);
  }
}
`;

  STM32_EXAMPLES['l10-lcd'] = {
    title: 'I2C LCD1602 — Hello + 카운터',
    desc: 'I2C1(PB8 SCL / PB9 SDA)에 연결한 PCF8574 LCD 에 첫 줄 인사말, 둘째 줄 1초 카운터를 표시합니다.',
    lesson: 'l10',
    board: 'NUCLEO-F411RE',
    pins: {
      PA5: { signal: 'GPIO_Output', label: 'LD2', level: 0 },
      PB8: { signal: 'I2C1_SCL' },
      PB9: { signal: 'I2C1_SDA' }
    },
    periph: { I2C1: { mode: 'i2c', speed: 100000 } },
    nvic: {},
    nodes: [
      { id: 'lcd', type: 'lcd1602', x: 520, y: 120, props: { addr: '0x27' } }
    ],
    wires: [['PB8', 'lcd.scl'], ['PB9', 'lcd.sda']],
    user: {
      includes: C`
#include <stdio.h>
`,
      pv: C`
uint32_t count = 0;
char buf[17];               // LCD 한 줄 16글자 + '\0'
`,
      pfp: '',
      u0: LCD_DRIVER,
      u2: C`
  if (HAL_I2C_IsDeviceReady(&hi2c1, LCD_ADDR, 3, 100) != HAL_OK) {
    HAL_GPIO_WritePin(LD2_GPIO_Port, LD2_Pin, GPIO_PIN_SET);   // LCD 응답 없음 -> LD2 켜서 알림
  }
  lcd_init();
  lcd_set_cursor(0, 0);
  lcd_print("Hello, STM32!");
`,
      loop: C`
    sprintf(buf, "Count: %-9lu", count++);   // 16칸을 꽉 채워 이전 글자를 덮어씀
    lcd_set_cursor(1, 0);
    lcd_print(buf);
    HAL_Delay(1000);
`,
      u4: ''
    }
  };

  STM32_EXAMPLES['l10-scan'] = {
    title: 'I2C 스캐너 + 레지스터 읽기',
    desc: '1~127 주소에 HAL_I2C_IsDeviceReady 를 보내 응답하는 장치를 찾고, 0x48 장치(LM75 형 온도센서)의 0번 레지스터를 Mem_Read 로 읽습니다.',
    lesson: 'l10',
    board: 'NUCLEO-F411RE',
    pins: {
      PA2: { signal: 'USART2_TX' },
      PA3: { signal: 'USART2_RX' },
      PB8: { signal: 'I2C1_SCL' },
      PB9: { signal: 'I2C1_SDA' }
    },
    periph: {
      USART2: { mode: 'async', baud: 115200 },
      I2C1: { mode: 'i2c', speed: 100000 }
    },
    nvic: {},
    nodes: [
      { id: 'lcd', type: 'lcd1602', x: 520, y: 80, props: { addr: '0x27' } },
      { id: 'temp', type: 'i2cdev', x: 520, y: 260, props: { addr: '0x48', regs: '19 80 00 4B 00 50 00 00 00 00 00 00 00 00 00 00' } }
    ],
    wires: [['PB8', 'lcd.scl'], ['PB9', 'lcd.sda'], ['PB8', 'temp.scl'], ['PB9', 'temp.sda']],
    user: {
      includes: C`
#include <stdio.h>
`,
      pv: C`
uint8_t reg[2];
`,
      pfp: C`
int __io_putchar(int ch);
`,
      u0: '',
      u2: C`
  printf("\r\nI2C scan...\r\n");
  for (uint16_t addr = 1; addr < 128; addr++) {
    if (HAL_I2C_IsDeviceReady(&hi2c1, addr << 1, 1, 10) == HAL_OK) {
      printf("  found device at 0x%02X\r\n", addr);
    }
  }
  printf("scan done.\r\n");
`,
      loop: C`
    if (HAL_I2C_Mem_Read(&hi2c1, 0x48 << 1, 0x00, I2C_MEMADD_SIZE_8BIT, reg, 2, 100) == HAL_OK) {
      int16_t raw = (int16_t)((reg[0] << 8) | reg[1]);
      int t10 = (raw >> 7) * 5;             // 0.5 도 단위 -> 0.1 도 단위 (양수 온도 기준)
      printf("temp = %d.%d C  (raw 0x%02X 0x%02X)\r\n", t10 / 10, t10 % 10, reg[0], reg[1]);
    } else {
      printf("0x48 no response\r\n");
    }
    HAL_Delay(1000);
`,
      u4: PUTCHAR
    }
  };

  // ======================================================================= L11
  var SPI_PINS = {
    PA2: { signal: 'USART2_TX' },
    PA3: { signal: 'USART2_RX' },
    PB12: { signal: 'GPIO_Output', label: 'FLASH_CS', level: 1 },
    PB13: { signal: 'SPI2_SCK' },
    PB14: { signal: 'SPI2_MISO' },
    PB15: { signal: 'SPI2_MOSI' }
  };
  var SPI_NODES = [
    { id: 'flash', type: 'spidev', x: 520, y: 140, props: { reply: 'FF EF 40 18' } }
  ];
  var SPI_WIRES = [['PB13', 'flash.sck'], ['PB15', 'flash.mosi'], ['PB14', 'flash.miso'], ['PB12', 'flash.cs']];

  STM32_EXAMPLES['l11-spi-id'] = {
    title: 'SPI 장치 ID 읽기 (TransmitReceive)',
    desc: 'SPI2(PB13/PB14/PB15) + CS(PB12)로 명령 0x9F 를 보내고 동시에 3바이트 ID 를 받습니다 (W25Q 계열 플래시 흉내).',
    lesson: 'l11',
    board: 'NUCLEO-F411RE',
    pins: SPI_PINS,
    periph: {
      USART2: { mode: 'async', baud: 115200 },
      SPI2: { mode: 'master', prescaler: 16 }
    },
    nvic: {},
    nodes: SPI_NODES,
    wires: SPI_WIRES,
    user: {
      includes: C`
#include <stdio.h>
`,
      pv: C`
uint8_t tx[4] = {0x9F, 0x00, 0x00, 0x00};   // 0x9F = Read JEDEC ID, 나머지는 클럭을 만들기 위한 더미
uint8_t rx[4];
`,
      pfp: C`
int __io_putchar(int ch);
`,
      u0: '',
      u2: C`
  printf("\r\nSPI2 JEDEC ID test\r\n");
`,
      loop: C`
    HAL_GPIO_WritePin(FLASH_CS_GPIO_Port, FLASH_CS_Pin, GPIO_PIN_RESET);   // CS LOW: 통신 시작
    if (HAL_SPI_TransmitReceive(&hspi2, tx, rx, 4, 100) == HAL_OK) {
      printf("JEDEC ID: %02X %02X %02X\r\n", rx[1], rx[2], rx[3]);
    } else {
      printf("SPI error\r\n");
    }
    HAL_GPIO_WritePin(FLASH_CS_GPIO_Port, FLASH_CS_Pin, GPIO_PIN_SET);     // CS HIGH: 통신 끝
    HAL_Delay(1000);
`,
      u4: PUTCHAR
    }
  };

  STM32_EXAMPLES['l11-spi-split'] = {
    title: 'SPI 명령 보내고 따로 받기 (Transmit + Receive)',
    desc: '같은 ID 읽기를 HAL_SPI_Transmit(명령 1바이트) + HAL_SPI_Receive(3바이트)로 나눠 합니다. CS 는 두 호출 내내 LOW.',
    lesson: 'l11',
    board: 'NUCLEO-F411RE',
    pins: SPI_PINS,
    periph: {
      USART2: { mode: 'async', baud: 115200 },
      SPI2: { mode: 'master', prescaler: 16 }
    },
    nvic: {},
    nodes: SPI_NODES,
    wires: SPI_WIRES,
    user: {
      includes: C`
#include <stdio.h>
`,
      pv: C`
uint8_t cmd = 0x9F;
uint8_t id[3];
`,
      pfp: C`
int __io_putchar(int ch);
`,
      u0: '',
      u2: '',
      loop: C`
    HAL_GPIO_WritePin(FLASH_CS_GPIO_Port, FLASH_CS_Pin, GPIO_PIN_RESET);
    HAL_SPI_Transmit(&hspi2, &cmd, 1, 100);     // 명령 전송 (이때 들어온 바이트는 버림)
    HAL_SPI_Receive(&hspi2, id, 3, 100);        // 더미를 보내며 3바이트 수신
    HAL_GPIO_WritePin(FLASH_CS_GPIO_Port, FLASH_CS_Pin, GPIO_PIN_SET);
    printf("ID = %02X %02X %02X\r\n", id[0], id[1], id[2]);
    HAL_Delay(1000);
`,
      u4: PUTCHAR
    }
  };

  // ======================================================================= L12
  var FND_PINS = {
    PC0: { signal: 'GPIO_Output', label: 'SEG_A', level: 0 },
    PC1: { signal: 'GPIO_Output', label: 'SEG_B', level: 0 },
    PC2: { signal: 'GPIO_Output', label: 'SEG_C', level: 0 },
    PC3: { signal: 'GPIO_Output', label: 'SEG_D', level: 0 },
    PC4: { signal: 'GPIO_Output', label: 'SEG_E', level: 0 },
    PC5: { signal: 'GPIO_Output', label: 'SEG_F', level: 0 },
    PC6: { signal: 'GPIO_Output', label: 'SEG_G', level: 0 },
    PC7: { signal: 'GPIO_Output', label: 'SEG_DP', level: 0 }
  };
  var FND_NODES = [
    { id: 'fnd', type: 'fnd', x: 540, y: 120, props: { common: 'cathode' } }
  ];
  var FND_WIRES = [['PC0', 'fnd.a'], ['PC1', 'fnd.b'], ['PC2', 'fnd.c'], ['PC3', 'fnd.d'],
                   ['PC4', 'fnd.e'], ['PC5', 'fnd.f'], ['PC6', 'fnd.g'], ['PC7', 'fnd.dp']];
  var FND_TABLE = C`
/* 공통 캐소드 FND 숫자 패턴: bit0=a ... bit6=g, bit7=dp (1 = 켜짐) */
const uint8_t FND_DIGITS[10] = {
  0x3F, 0x06, 0x5B, 0x4F, 0x66,   // 0 1 2 3 4
  0x6D, 0x7D, 0x07, 0x7F, 0x6F    // 5 6 7 8 9
};
`;

  STM32_EXAMPLES['l12-fnd'] = {
    title: '7세그먼트 0~9 카운터 (HAL)',
    desc: 'PC0~PC7 을 세그먼트 a~dp 에 연결하고, 숫자 패턴 표를 HAL_GPIO_WritePin 으로 한 비트씩 출력합니다.',
    lesson: 'l12',
    board: 'NUCLEO-F411RE',
    pins: FND_PINS,
    periph: {},
    nvic: {},
    nodes: FND_NODES,
    wires: FND_WIRES,
    user: {
      includes: '',
      pv: C`
uint8_t digit = 0;
`,
      pfp: '',
      u0: FND_TABLE + C`

/* n (0~9) 을 표시합니다. PC0~PC7 이 a~dp 이므로 i 번째 비트 = GPIO_PIN_i */
void fnd_show(uint8_t n)
{
  uint8_t pattern = FND_DIGITS[n % 10];
  for (int i = 0; i < 8; i++) {
    HAL_GPIO_WritePin(GPIOC, (uint16_t)(1 << i), ((pattern >> i) & 1) ? GPIO_PIN_SET : GPIO_PIN_RESET);
  }
}
`,
      u2: '',
      loop: C`
    fnd_show(digit);
    digit = (digit + 1) % 10;
    HAL_Delay(1000);
`,
      u4: ''
    }
  };

  STM32_EXAMPLES['l12-fnd-bsrr'] = {
    title: '7세그먼트 버튼 카운터 (BSRR 한 번에 쓰기)',
    desc: 'B1(EXTI)을 누를 때마다 숫자를 1 올리고, GPIOC->BSRR 한 번의 쓰기로 8개 세그먼트를 동시에 바꿉니다.',
    lesson: 'l12',
    board: 'NUCLEO-F411RE',
    pins: Object.assign({
      PC13: { signal: 'GPIO_EXTI', label: 'B1', pull: 'none', trigger: 'falling' }
    }, FND_PINS),
    periph: {},
    nvic: { EXTI15_10: true },
    nodes: FND_NODES,
    wires: FND_WIRES,
    user: {
      includes: '',
      pv: C`
volatile uint8_t digit = 0;
volatile uint32_t last_press = 0;
`,
      pfp: '',
      u0: FND_TABLE + C`

/* 상위 16비트(리셋)로 PC0~PC7 을 모두 끄고, 하위 16비트(셋)로 필요한 세그먼트만 켭니다.
   같은 비트에 셋·리셋이 함께 1 이면 셋이 우선하므로 한 번의 쓰기로 끝납니다. */
void fnd_show(uint8_t n)
{
  GPIOC->BSRR = 0x00FF0000 | FND_DIGITS[n % 10];
}
`,
      u2: C`
  fnd_show(0);
`,
      loop: C`
    fnd_show(digit);
    HAL_Delay(20);
`,
      u4: C`
void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin)
{
  if (GPIO_Pin == B1_Pin && HAL_GetTick() - last_press > 200) {
    last_press = HAL_GetTick();
    digit = (digit + 1) % 10;
  }
}
`
    }
  };

  // ======================================================================= L13
  var MOTOR_PINS = {
    PA6: { signal: 'TIM3_CH1' },
    PB4: { signal: 'GPIO_Output', label: 'MOTOR_IN1', level: 0 },
    PB5: { signal: 'GPIO_Output', label: 'MOTOR_IN2', level: 0 }
  };
  var MOTOR_SET = C`
/* speed: -999 ~ +999. 부호가 방향, 크기가 PWM 듀티(ARR=999 기준)입니다. */
void motor_set(int speed)
{
  if (speed > 999) speed = 999;
  if (speed < -999) speed = -999;

  if (speed > 0) {                 // 정방향: IN1=1, IN2=0
    HAL_GPIO_WritePin(MOTOR_IN1_GPIO_Port, MOTOR_IN1_Pin, GPIO_PIN_SET);
    HAL_GPIO_WritePin(MOTOR_IN2_GPIO_Port, MOTOR_IN2_Pin, GPIO_PIN_RESET);
  } else if (speed < 0) {          // 역방향: IN1=0, IN2=1
    HAL_GPIO_WritePin(MOTOR_IN1_GPIO_Port, MOTOR_IN1_Pin, GPIO_PIN_RESET);
    HAL_GPIO_WritePin(MOTOR_IN2_GPIO_Port, MOTOR_IN2_Pin, GPIO_PIN_SET);
    speed = -speed;
  } else {                         // 정지: EN=0 이면 자유 회전으로 멈춤
    HAL_GPIO_WritePin(MOTOR_IN1_GPIO_Port, MOTOR_IN1_Pin, GPIO_PIN_RESET);
    HAL_GPIO_WritePin(MOTOR_IN2_GPIO_Port, MOTOR_IN2_Pin, GPIO_PIN_RESET);
  }
  __HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, speed);   // ENA 에 PWM
}
`;

  STM32_EXAMPLES['l13-motor-basic'] = {
    title: 'DC 모터 정방향·정지·역방향',
    desc: 'L298N IN1(PB4)·IN2(PB5)로 방향, ENA(PA6, TIM3_CH1 21 kHz PWM)로 속도를 정해 순서대로 돌립니다.',
    lesson: 'l13',
    board: 'NUCLEO-F411RE',
    pins: MOTOR_PINS,
    periph: { TIM3: { psc: 3, arr: 999, ch: { 1: 'pwm' }, pulse: { 1: 0 } } },
    nvic: {},
    nodes: [
      { id: 'm1', type: 'motor', x: 540, y: 140, props: { maxRpm: 200 } }
    ],
    wires: [['PB4', 'm1.in1'], ['PB5', 'm1.in2'], ['PA6', 'm1.en']],
    user: {
      includes: '', pv: '', pfp: '',
      u0: MOTOR_SET,
      u2: C`
  HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1);
`,
      loop: C`
    motor_set(600);    // 정방향 60 %
    HAL_Delay(2000);
    motor_set(0);      // 정지
    HAL_Delay(1000);
    motor_set(-999);   // 역방향 100 %
    HAL_Delay(2000);
    motor_set(0);
    HAL_Delay(1000);
`,
      u4: ''
    }
  };

  STM32_EXAMPLES['l13-motor'] = {
    title: 'DC 모터 — 가변저항 속도 + 버튼 방향',
    desc: '가변저항(PA0)으로 속도, B1(EXTI)로 방향을 바꿉니다. 방향 전환 때는 잠깐 멈췄다가 반대로 돌고, 상태를 UART 로 기록합니다.',
    lesson: 'l13',
    board: 'NUCLEO-F411RE',
    pins: Object.assign({
      PA0: { signal: 'ADC1_IN0' },
      PA2: { signal: 'USART2_TX' },
      PA3: { signal: 'USART2_RX' },
      PC13: { signal: 'GPIO_EXTI', label: 'B1', pull: 'none', trigger: 'falling' }
    }, MOTOR_PINS),
    periph: {
      USART2: { mode: 'async', baud: 115200 },
      ADC1: { channels: [0] },
      TIM3: { psc: 3, arr: 999, ch: { 1: 'pwm' }, pulse: { 1: 0 } }
    },
    nvic: { EXTI15_10: true },
    nodes: [
      { id: 'm1', type: 'motor', x: 560, y: 90, props: { maxRpm: 200 } },
      { id: 'pot1', type: 'pot', x: 540, y: 270, props: { value: 2500 } }
    ],
    wires: [['PB4', 'm1.in1'], ['PB5', 'm1.in2'], ['PA6', 'm1.en'], ['PA0', 'pot1.out']],
    user: {
      includes: C`
#include <stdio.h>
`,
      pv: C`
volatile int dir = 1;              // +1 정방향, -1 역방향 (버튼 인터럽트가 바꿈)
volatile uint32_t last_press = 0;
int last_dir = 1;
uint32_t last_print = 0;
`,
      pfp: C`
int __io_putchar(int ch);
`,
      u0: MOTOR_SET + C`

uint32_t read_pot(void)
{
  uint32_t v = 0;
  HAL_ADC_Start(&hadc1);
  if (HAL_ADC_PollForConversion(&hadc1, 10) == HAL_OK) {
    v = HAL_ADC_GetValue(&hadc1);
  }
  HAL_ADC_Stop(&hadc1);
  return v;
}
`,
      u2: C`
  HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1);
  printf("\r\nDC motor: pot = speed, B1 = direction\r\n");
`,
      loop: C`
    int speed = (int)(read_pot() * 999 / 4095);
    if (speed < 50) speed = 0;          // 데드존: 끝까지 내리면 확실히 정지

    if (dir != last_dir) {              // 방향이 바뀌면 먼저 멈췄다가
      motor_set(0);
      HAL_Delay(300);
      last_dir = dir;
    }
    motor_set(dir * speed);

    if (HAL_GetTick() - last_print >= 500) {
      last_print = HAL_GetTick();
      printf("dir=%s  duty=%d%%\r\n", dir > 0 ? "CW " : "CCW", speed * 100 / 999);
    }
    HAL_Delay(20);
`,
      u4: PUTCHAR + C`

void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin)
{
  if (GPIO_Pin == B1_Pin && HAL_GetTick() - last_press > 200) {
    last_press = HAL_GetTick();
    dir = -dir;
  }
}
`
    }
  };

  // ======================================================================= L14
  var STEP_PINS = {
    PC0: { signal: 'GPIO_Output', label: 'ST_IN1', level: 0 },
    PC1: { signal: 'GPIO_Output', label: 'ST_IN2', level: 0 },
    PC2: { signal: 'GPIO_Output', label: 'ST_IN3', level: 0 },
    PC3: { signal: 'GPIO_Output', label: 'ST_IN4', level: 0 }
  };
  var STEP_NODES = [
    { id: 'st1', type: 'stepper', x: 540, y: 130, props: {} }   // 기본값: 출력축 1회전 = 하프스텝 4096 (풀스텝 2048)
  ];
  var STEP_WIRES = [['PC0', 'st1.in1'], ['PC1', 'st1.in2'], ['PC2', 'st1.in3'], ['PC3', 'st1.in4']];
  var STEP_OUT = C`
/* p 의 bit0~bit3 을 IN1~IN4 에 출력합니다. */
void stepper_out(uint8_t p)
{
  HAL_GPIO_WritePin(ST_IN1_GPIO_Port, ST_IN1_Pin, (p & 0x01) ? GPIO_PIN_SET : GPIO_PIN_RESET);
  HAL_GPIO_WritePin(ST_IN2_GPIO_Port, ST_IN2_Pin, (p & 0x02) ? GPIO_PIN_SET : GPIO_PIN_RESET);
  HAL_GPIO_WritePin(ST_IN3_GPIO_Port, ST_IN3_Pin, (p & 0x04) ? GPIO_PIN_SET : GPIO_PIN_RESET);
  HAL_GPIO_WritePin(ST_IN4_GPIO_Port, ST_IN4_Pin, (p & 0x08) ? GPIO_PIN_SET : GPIO_PIN_RESET);
}
`;

  STM32_EXAMPLES['l14-stepper'] = {
    title: '스텝모터 풀스텝 1회전 왕복',
    desc: '28BYJ-48 + ULN2003 을 PC0~PC3 으로 2상 여자 풀스텝 구동: 2048 스텝 정방향 1회전, 역방향 1회전.',
    lesson: 'l14',
    board: 'NUCLEO-F411RE',
    pins: STEP_PINS,
    periph: {},
    nvic: {},
    nodes: STEP_NODES,
    wires: STEP_WIRES,
    user: {
      includes: '',
      pv: C`
int step_index = 0;          // 시퀀스 표의 현재 위치
`,
      pfp: '',
      u0: C`
/* 2상 여자 풀스텝: 코일 두 개씩 차례로 (IN1..IN4 = bit0..bit3) */
const uint8_t FULL_SEQ[4] = {0x03, 0x06, 0x0C, 0x09};

` + STEP_OUT + C`

/* steps > 0 이면 정방향, < 0 이면 역방향. 한 스텝마다 delay_ms 쉽니다. */
void stepper_move(int steps, uint32_t delay_ms)
{
  int dir = (steps >= 0) ? 1 : -1;
  if (steps < 0) steps = -steps;
  for (int i = 0; i < steps; i++) {
    step_index = (step_index + dir + 4) % 4;
    stepper_out(FULL_SEQ[step_index]);
    HAL_Delay(delay_ms);
  }
  stepper_out(0);            // 멈추면 코일 전류를 끊어 발열을 줄입니다
}
`,
      u2: '',
      loop: C`
    stepper_move(2048, 2);     // 정방향 1회전 (약 4초)
    HAL_Delay(500);
    stepper_move(-2048, 2);    // 역방향 1회전
    HAL_Delay(500);
`,
      u4: ''
    }
  };

  STM32_EXAMPLES['l14-stepper-half'] = {
    title: '스텝모터 하프스텝 90도씩 이동',
    desc: '8단계 하프스텝 시퀀스(1회전 4096 스텝)로 90도(1024 스텝)씩 네 번 이동한 뒤 한 바퀴 되돌아옵니다.',
    lesson: 'l14',
    board: 'NUCLEO-F411RE',
    pins: STEP_PINS,
    periph: {},
    nvic: {},
    nodes: STEP_NODES,
    wires: STEP_WIRES,
    user: {
      includes: '',
      pv: C`
int step_index = 0;
`,
      pfp: '',
      u0: C`
/* 하프스텝: 1상 -> 2상 -> 1상 ... 8단계 (IN1..IN4 = bit0..bit3) */
const uint8_t HALF_SEQ[8] = {0x01, 0x03, 0x02, 0x06, 0x04, 0x0C, 0x08, 0x09};

` + STEP_OUT + C`

void stepper_move_half(int steps, uint32_t delay_ms)
{
  int dir = (steps >= 0) ? 1 : -1;
  if (steps < 0) steps = -steps;
  for (int i = 0; i < steps; i++) {
    step_index = (step_index + dir + 8) % 8;
    stepper_out(HALF_SEQ[step_index]);
    HAL_Delay(delay_ms);
  }
  stepper_out(0);
}
`,
      u2: '',
      loop: C`
    for (int k = 0; k < 4; k++) {
      stepper_move_half(1024, 1);   // 90도 = 4096 / 4
      HAL_Delay(500);
    }
    stepper_move_half(-4096, 1);    // 한 바퀴 되돌아가기
    HAL_Delay(1000);
`,
      u4: ''
    }
  };

  // ======================================================================= L15
  STM32_EXAMPLES['l15-fan'] = {
    title: '미니 프로젝트 — 스마트 선풍기',
    desc: '가변저항 → PWM 모터 속도, B1 로 모드(OFF/MANUAL/BREEZE) 전환, LCD 에 모드·속도 표시, UART 로 1초 로그.',
    lesson: 'l15',
    board: 'NUCLEO-F411RE',
    pins: Object.assign({
      PA0: { signal: 'ADC1_IN0' },
      PA2: { signal: 'USART2_TX' },
      PA3: { signal: 'USART2_RX' },
      PA5: { signal: 'GPIO_Output', label: 'LD2', level: 0 },
      PB8: { signal: 'I2C1_SCL' },
      PB9: { signal: 'I2C1_SDA' },
      PC13: { signal: 'GPIO_EXTI', label: 'B1', pull: 'none', trigger: 'falling' }
    }, MOTOR_PINS),
    periph: {
      USART2: { mode: 'async', baud: 115200 },
      ADC1: { channels: [0] },
      TIM3: { psc: 3, arr: 999, ch: { 1: 'pwm' }, pulse: { 1: 0 } },
      I2C1: { mode: 'i2c', speed: 100000 }
    },
    nvic: { EXTI15_10: true },
    nodes: [
      { id: 'm1', type: 'motor', x: 560, y: 60, props: { maxRpm: 200 } },
      { id: 'pot1', type: 'pot', x: 540, y: 200, props: { value: 3000 } },
      { id: 'lcd', type: 'lcd1602', x: 520, y: 320, props: { addr: '0x27' } }
    ],
    wires: [['PB4', 'm1.in1'], ['PB5', 'm1.in2'], ['PA6', 'm1.en'], ['PA0', 'pot1.out'],
            ['PB8', 'lcd.scl'], ['PB9', 'lcd.sda']],
    user: {
      includes: C`
#include <stdio.h>
`,
      pv: C`
#define MODE_OFF     0
#define MODE_MANUAL  1
#define MODE_BREEZE  2

const char *MODE_NAME[3] = {"OFF", "MANUAL", "BREEZE"};
volatile uint8_t mode = MODE_OFF;
volatile uint8_t mode_changed = 1;
volatile uint32_t last_press = 0;
uint32_t pot = 0;
int duty = 0;                        // 0 ~ 999
uint32_t last_lcd = 0;
uint32_t last_log = 0;
char line[17];
`,
      pfp: C`
int __io_putchar(int ch);
`,
      u0: LCD_DRIVER + '\n' + MOTOR_SET + C`

uint32_t read_pot(void)
{
  uint32_t v = 0;
  HAL_ADC_Start(&hadc1);
  if (HAL_ADC_PollForConversion(&hadc1, 10) == HAL_OK) {
    v = HAL_ADC_GetValue(&hadc1);
  }
  HAL_ADC_Stop(&hadc1);
  return v;
}

/* 모드에 따라 목표 듀티(0~999)를 계산합니다. */
int compute_duty(void)
{
  if (mode == MODE_MANUAL) {
    return (int)(pot * 999 / 4095);
  }
  if (mode == MODE_BREEZE) {                    // 자연풍: 8초 주기로 30 % ~ 80 % 오르내림
    uint32_t t = HAL_GetTick() % 8000;
    uint32_t tri = (t < 4000) ? t : 8000 - t;   // 0 -> 4000 -> 0 삼각파
    return 300 + (int)(tri * 500 / 4000);
  }
  return 0;                                     // MODE_OFF
}
`,
      u2: C`
  HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1);
  lcd_init();
  printf("\r\nSmart fan ready. B1 = mode\r\n");
`,
      loop: C`
    pot = read_pot();
    duty = compute_duty();
    motor_set(duty);
    HAL_GPIO_WritePin(LD2_GPIO_Port, LD2_Pin, mode != MODE_OFF ? GPIO_PIN_SET : GPIO_PIN_RESET);

    if (mode_changed || HAL_GetTick() - last_lcd >= 200) {   // LCD 는 0.2초마다만 갱신
      mode_changed = 0;
      last_lcd = HAL_GetTick();
      sprintf(line, "Mode: %-10s", MODE_NAME[mode]);
      lcd_set_cursor(0, 0);
      lcd_print(line);
      sprintf(line, "Speed: %3d %%    ", duty * 100 / 999);
      lcd_set_cursor(1, 0);
      lcd_print(line);
    }

    if (HAL_GetTick() - last_log >= 1000) {                  // UART 로그는 1초마다
      last_log = HAL_GetTick();
      printf("[%6lu] mode=%-6s pot=%4lu duty=%3d%%\r\n",
             last_log, MODE_NAME[mode], pot, duty * 100 / 999);
    }
    HAL_Delay(20);
`,
      u4: PUTCHAR + C`

void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin)
{
  if (GPIO_Pin == B1_Pin && HAL_GetTick() - last_press > 200) {
    last_press = HAL_GetTick();
    mode = (mode + 1) % 3;           // OFF -> MANUAL -> BREEZE -> OFF
    mode_changed = 1;
  }
}
`
    }
  };

  // ======================================================================= L16
  STM32_EXAMPLES['l16-bluepill'] = {
    title: 'BluePill 깜빡이기 (PC13 Active-LOW)',
    desc: 'STM32F103C8(72 MHz) BluePill 의 PC13 LED 는 LOW 일 때 켜집니다. 보드를 바꿨을 때 달라지는 점을 확인합니다.',
    lesson: 'l16',
    board: 'BLUEPILL-F103C8',
    pins: {
      PC13: { signal: 'GPIO_Output', label: 'LED', level: 1 }
    },
    periph: {},
    nvic: {},
    nodes: [],
    wires: [],
    user: {
      includes: '', pv: '', pfp: '', u0: '', u2: '',
      loop: C`
    HAL_GPIO_WritePin(LED_GPIO_Port, LED_Pin, GPIO_PIN_RESET);   // LOW = 켜짐
    HAL_Delay(200);
    HAL_GPIO_WritePin(LED_GPIO_Port, LED_Pin, GPIO_PIN_SET);     // HIGH = 꺼짐
    HAL_Delay(800);
`,
      u4: ''
    }
  };


  // ======================================================================= T01 — 제품군별 MCU 예제
  // 같은 HAL 코드가 제품군마다 어떻게 달라지는지(클럭·ADC 채널 번호·EXTI 콜백·보드 LED) 비교합니다.

  STM32_EXAMPLES['mcu-g0-blink'] = {
    title: 'G0 — LD4 깜빡이기 + 에지 콜백',
    desc: 'STM32G071RB(Cortex-M0+ 64 MHz). G0 HAL 은 HAL_GPIO_EXTI_Falling_Callback 처럼 에지별 콜백을 씁니다. B1 을 누르면 깜빡임 속도가 바뀝니다.',
    lesson: 't01',
    mcu: 'STM32G071RB',
    board: 'NUCLEO-G071RB',
    pins: {},
    periph: {},
    nvic: { EXTI4_15: true },
    nodes: [],
    wires: [],
    user: {
      includes: C`
#include <stdio.h>
`,
      pv: C`
volatile uint32_t period = 500;
`,
      pfp: '', u0: '',
      u2: C`
  printf("STM32G071RB @ %lu MHz\r\n", HAL_RCC_GetSysClockFreq() / 1000000);
`,
      loop: C`
    HAL_GPIO_TogglePin(LD4_GPIO_Port, LD4_Pin);
    HAL_Delay(period);
`,
      u4: C`
int __io_putchar(int ch)
{
  HAL_UART_Transmit(&huart2, (uint8_t *)&ch, 1, HAL_MAX_DELAY);
  return ch;
}

/* G0 는 HAL_GPIO_EXTI_Callback 대신 에지별 콜백을 부릅니다 */
void HAL_GPIO_EXTI_Falling_Callback(uint16_t GPIO_Pin)
{
  if (GPIO_Pin == B1_Pin)
  {
    period = (period == 500) ? 100 : 500;
    printf("period = %lu ms\r\n", period);
  }
}
`
    }
  };

  STM32_EXAMPLES['mcu-l4-adc'] = {
    title: 'L4 — 가변저항 ADC (채널 번호 차이)',
    desc: 'STM32L476RG(Cortex-M4F 80 MHz). PA0 은 F4 에서 ADC1_IN0 이지만 L4 에서는 ADC1_IN5 입니다. 사용 전 보정(Calibration)도 필요합니다.',
    lesson: 't01',
    mcu: 'STM32L476RG',
    board: 'NUCLEO-L476RG',
    pins: { PA0: { signal: 'ADC1_IN5' } },
    periph: { ADC1: { channels: [5] } },
    nvic: {},
    nodes: [{ id: 'pot1', type: 'pot', x: 520, y: 320, props: { value: 1500 } }],
    wires: [['PA0', 'pot1.out']],
    user: {
      includes: C`
#include <stdio.h>
`,
      pv: '', pfp: '', u0: '',
      u2: C`
  HAL_ADCEx_Calibration_Start(&hadc1, ADC_SINGLE_ENDED);   /* L4: 변환 전에 한 번 보정 */
`,
      loop: C`
    HAL_ADC_Start(&hadc1);
    HAL_ADC_PollForConversion(&hadc1, 10);
    uint32_t raw = HAL_ADC_GetValue(&hadc1);
    HAL_ADC_Stop(&hadc1);
    printf("ADC1_IN5 = %4lu  (%lu mV)\r\n", raw, raw * 3300 / 4095);
    HAL_GPIO_WritePin(LD2_GPIO_Port, LD2_Pin, raw > 2048 ? GPIO_PIN_SET : GPIO_PIN_RESET);
    HAL_Delay(500);
`,
      u4: C`
int __io_putchar(int ch)
{
  HAL_UART_Transmit(&huart2, (uint8_t *)&ch, 1, HAL_MAX_DELAY);
  return ch;
}
`
    }
  };

  STM32_EXAMPLES['mcu-f407-disco'] = {
    title: 'F407 Discovery — LED 4개 회전',
    desc: 'STM32F407VG(168 MHz, 100핀). 보드 LED 4개(PD12–PD15)를 차례로 켜고, 사용자 버튼 B1(PA0, 누르면 HIGH)으로 방향을 바꿉니다.',
    lesson: 't01',
    mcu: 'STM32F407VG',
    board: 'DISCO-F407VG',
    pins: {},
    periph: {},
    nvic: { EXTI0: true },
    nodes: [],
    wires: [],
    user: {
      includes: '',
      pv: C`
volatile int8_t dir = 1;
const uint16_t leds[4] = { LD4_Pin, LD3_Pin, LD5_Pin, LD6_Pin };
int8_t idx = 0;
`,
      pfp: '', u0: '', u2: '',
      loop: C`
    HAL_GPIO_WritePin(GPIOD, LD4_Pin | LD3_Pin | LD5_Pin | LD6_Pin, GPIO_PIN_RESET);
    HAL_GPIO_WritePin(GPIOD, leds[idx], GPIO_PIN_SET);
    idx = (idx + dir + 4) % 4;
    HAL_Delay(200);
`,
      u4: C`
void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin)
{
  if (GPIO_Pin == B1_Pin)
  {
    dir = -dir;
  }
}
`
    }
  };

  STM32_EXAMPLES['mcu-f030-pwm'] = {
    title: 'F030 맨 칩 — PWM LED 페이드',
    desc: 'STM32F030R8(Cortex-M0 48 MHz)만 놓고 직접 배선합니다. F0 에는 TIM2 가 없어 TIM3_CH1(PA6)을 씁니다. 48 MHz / (47+1) = 1 MHz 카운트.',
    lesson: 't01',
    mcu: 'STM32F030R8',
    pins: { PA6: { signal: 'TIM3_CH1' } },
    periph: { TIM3: { psc: 47, arr: 999, ch: { 1: 'pwm' }, pulse: { 1: 0 } } },
    nvic: {},
    nodes: [{ id: 'led1', type: 'led', x: 520, y: 80, props: { color: 'blue', active: 'high' } }],
    wires: [['PA6', 'led1.in']],
    user: {
      includes: '', pv: '', pfp: '', u0: '',
      u2: C`
  HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1);
`,
      loop: C`
    for (int d = 0; d <= 1000; d += 20)
    {
      __HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, d);
      HAL_Delay(10);
    }
    for (int d = 1000; d >= 0; d -= 20)
    {
      __HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, d);
      HAL_Delay(10);
    }
`,
      u4: ''
    }
  };

  STM32_EXAMPLES['mcu-f103-bare'] = {
    title: 'F103C8 맨 칩 — 버튼·LED·USART1',
    desc: 'STM32F103C8(Cortex-M3 72 MHz)만 놓고 버튼(PB12, 풀업)·LED(PB13)·UART 터미널(USART1 PA9/PA10)을 직접 배선합니다. printf 는 USART1 로 보냅니다.',
    lesson: 't01',
    mcu: 'STM32F103C8',
    pins: {
      PB12: { signal: 'GPIO_Input', label: 'SW1', pull: 'up' },
      PB13: { signal: 'GPIO_Output', label: 'LED1' },
      PA9: { signal: 'USART1_TX' }, PA10: { signal: 'USART1_RX' }
    },
    periph: { USART1: { mode: 'async', baud: 115200 } },
    nvic: {},
    nodes: [
      { id: 'sw1', type: 'button', x: 520, y: 40, props: { wiring: 'gnd', label: 'SW1' } },
      { id: 'led1', type: 'led', x: 520, y: 150, props: { color: 'red', active: 'high' } },
      { id: 'ser1', type: 'uart', x: 520, y: 250, props: { name: 'USB-UART (CH340)' } }
    ],
    wires: [['PB12', 'sw1.out'], ['PB13', 'led1.in'], ['PA9', 'ser1.rx'], ['PA10', 'ser1.tx']],
    user: {
      includes: C`
#include <stdio.h>
`,
      pv: C`
uint8_t last = 1;
uint32_t presses = 0;
`,
      pfp: '', u0: '',
      u2: C`
  printf("F103C8 bare chip ready\r\n");
`,
      loop: C`
    uint8_t now = HAL_GPIO_ReadPin(SW1_GPIO_Port, SW1_Pin);
    if (last == 1 && now == 0)          /* 풀업: 누르면 LOW */
    {
      presses++;
      HAL_GPIO_TogglePin(LED1_GPIO_Port, LED1_Pin);
      printf("press %lu\r\n", presses);
    }
    last = now;
    HAL_Delay(20);                      /* 간단한 디바운스 */
`,
      u4: C`
int __io_putchar(int ch)
{
  HAL_UART_Transmit(&huart1, (uint8_t *)&ch, 1, HAL_MAX_DELAY);
  return ch;
}
`
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = STM32_EXAMPLES;
})(typeof window !== 'undefined' ? window : globalThis);
