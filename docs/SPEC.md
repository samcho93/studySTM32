# studySTM32 — 설계 명세 (SPEC)

GitHub Pages(`https://samcho93.github.io/studySTM32/`)로 배포하는 **정적** STM32 학습 사이트.
빌드 체인(npm) 없음. 외부 라이브러리는 cdnjs / jsdelivr **버전 고정** URL만.
본문·UI는 한국어(존댓말), 코드·커밋은 영어(주석 한국어 허용).

디자인은 "SAM 로봇강좌" 디자인 시스템(인디고 `accent` + 진한 노랑 `info`, Pretendard + JetBrains Mono,
라이트 기본 / 다크 지원)을 따른다. 토큰은 `assets/css/ml-theme.css` 에 있다. 이모지 금지(안전 콜아웃의 ⚠만 예외).

```
studySTM32/
├── index.html                 # 홈 (build.py 산출물)
├── build.py                   # content/*.md → lessons/*.html, index.html
├── content/curriculum.json    # 트랙·파트·챕터
├── content/<track>/*.md       # 레슨 원고
├── lessons/*.html             # 산출물 (직접 수정 금지)
├── sim/index.html             # ★ STM32 시뮬레이터 (CubeIDE + CubeMX 혼합 UI)
├── sim/sim.css
├── assets/css/main.css, ml-theme.css, stm32.css
├── assets/js/theme.js, site.js
├── assets/js/stm32/
│   ├── ccompiler.js           # C 서브셋 → JS(generator) 컴파일러
│   ├── chips.js               # 칩/보드 핀맵·AF 표
│   ├── runtime.js             # HAL 런타임 + 스케줄러
│   ├── devices.js             # 주변기기 모델(LED, 스위치, LCD, 모터 …)
│   ├── codegen.js             # CubeMX식 main.c / main.h 생성
│   ├── examples.js            # 레슨 예제 프로젝트 (window.STM32_EXAMPLES)
│   └── ui/*.js                # 노드 편집기, 핀아웃, 속성, 결과 화면
└── docs/SPEC.md
```

---------------------------------------------------------------------------------------------------

## 1. 시뮬레이터 URL

- `sim/index.html` — 마지막 작업(localStorage) 또는 기본 프로젝트
- `sim/index.html?ex=<exampleId>` — `STM32_EXAMPLES[exampleId]` 를 불러옴
- `sim/index.html?ex=<id>&embed=1` — 레슨 페이지 오른쪽 도크(iframe)용: 상단 사이트 헤더 숨김

## 2. 지원 보드

| board id | MCU | 패키지 | SYSCLK 기본 | 보드 내장 장치 |
|---|---|---|---|---|
| `NUCLEO-F411RE` | STM32F411RET6 | LQFP64 | 84 MHz | LD2=PA5, B1=PC13(누르면 LOW, 외부 풀업), ST-Link VCP=USART2(PA2 TX / PA3 RX) |
| `NUCLEO-F103RB` | STM32F103RBT6 | LQFP64 | 72 MHz | 위와 동일 |
| `BLUEPILL-F103C8` | STM32F103C8T6 | LQFP48 | 72 MHz | LED=PC13 (Active LOW) |

## 3. 예제 프로젝트 스키마 (`assets/js/stm32/examples.js`)

```js
window.STM32_EXAMPLES = window.STM32_EXAMPLES || {};
STM32_EXAMPLES['l03-blink'] = {
  title: 'LED 깜빡이기',            // 시뮬레이터 상단에 표시
  lesson: 'l03',                    // 돌아갈 레슨 id
  board: 'NUCLEO-F411RE',
  // 핀 설정: 핀 이름 → { signal, label?, pull?, level?, trigger? }
  //   signal: 'GPIO_Output' | 'GPIO_Input' | 'GPIO_Analog' | 'GPIO_EXTI'
  //         | AF 신호 이름 ('USART2_TX','TIM2_CH1','ADC1_IN0','I2C1_SCL','SPI1_SCK' …)
  //   pull: 'none'|'up'|'down'  level: 0|1 (출력 초기값)  trigger: 'rising'|'falling'|'both' (EXTI)
  pins: {
    PA5:  { signal: 'GPIO_Output', label: 'LD2' },
    PC13: { signal: 'GPIO_EXTI', label: 'B1', trigger: 'falling' }
  },
  // 주변장치 설정. 모드를 켜면 기본 핀이 자동 배정되지만 pins 에 적은 AF 가 우선.
  periph: {
    USART2: { mode: 'async', baud: 115200 },
    TIM2:   { psc: 83, arr: 999, ch: { 1: 'pwm' }, pulse: { 1: 0 } },   // ch: 'pwm' | 'disable'
    TIM3:   { psc: 8399, arr: 9999 },                                    // 기본 타이머(인터럽트용)
    ADC1:   { channels: [0], continuous: false, dma: 'circular' },   // 켤 채널(rank 순서); dma 를 주면 MX_DMA_Init + DMAContinuousRequests
    I2C1:   { mode: 'i2c', speed: 100000 },
    SPI1:   { mode: 'master', prescaler: 16 }
  },
  nvic: { EXTI15_10: true, TIM3: true, USART2: true },   // 켤 인터럽트
  settings: { printfFloat: true },
  // 회로(노드). 보드 내장 장치(LD2, B1, VCP)는 자동으로 들어가므로 적지 않는다.
  nodes: [
    { id: 'led1', type: 'led', x: 520, y: 80, props: { color: 'red', active: 'high' } }
  ],
  wires: [ ['PA6', 'led1.in'] ],          // [MCU 핀, '노드id.포트']
  // CubeMX 생성 코드의 USER CODE 구역에 들어갈 사용자 코드
  user: {
    includes: '#include <stdio.h>\n',    // USER CODE BEGIN Includes
    pv: 'uint32_t count = 0;\n',         // USER CODE BEGIN PV  (전역 변수)
    pfp: '',                             // USER CODE BEGIN PFP (함수 원형)
    u0: '',                              // USER CODE BEGIN 0   (사용자 함수 정의, main 위)
    u2: '',                              // USER CODE BEGIN 2   (초기화 후, while 전)
    loop: '    HAL_GPIO_TogglePin(LD2_GPIO_Port, LD2_Pin);\n    HAL_Delay(500);\n',  // USER CODE BEGIN 3 (while(1) 안)
    u4: ''                               // USER CODE BEGIN 4   (콜백 함수 등, main 아래)
  }
};
```

라벨을 준 핀은 `main.h` 에 `#define LD2_Pin GPIO_PIN_5` / `#define LD2_GPIO_Port GPIOA` 로 생성된다.
핸들 변수(`huart2`, `htim2`, `hadc1`, `hi2c1`, `hspi1` …)와 `MX_*_Init()` 은 자동 생성된다.

### 3.1 장치 노드 타입과 포트

| type | 이름 | 포트 | props |
|---|---|---|---|
| `led` | LED | `in` | `color`: red/green/yellow/blue/white, `active`: high/low |
| `rgb` | RGB LED | `r` `g` `b` | `common`: cathode/anode |
| `button` | 푸시 버튼 | `out` | `wiring`: gnd(누르면 LOW, 풀업 필요) / vcc(누르면 HIGH, 풀다운 필요) / module(모듈 내장 풀업: 평소 HIGH, 누르면 LOW), `mode`: push/toggle, `label` |
| `pot` | 가변저항 | `out`(아날로그) | `value`: 0–4095 |
| `ldr` | 조도센서(CDS) | `out`(아날로그) | `lux`: 0–1000 |
| `buzzer` | 부저 | `in` | `kind`: active/passive, `sound`: true/false |
| `fnd` | 7세그먼트 1자리 | `a` `b` `c` `d` `e` `f` `g` `dp` | `common`: cathode/anode |
| `lcd1602` | I2C LCD 16x2 (PCF8574) | `scl` `sda` | `addr`: '0x27' (문자열 또는 숫자) |
| `motor` | DC모터 + 드라이버(L298N) | `in1` `in2` `en` | `maxRpm`: 200 (`en` 에 PWM 또는 HIGH) |
| `servo` | 서보(SG90) | `sig` | `minUs`: 500, `maxUs`: 2500 (50 Hz PWM) |
| `stepper` | 스텝모터 28BYJ-48 + ULN2003 | `in1`–`in4` | `stepsPerRev`: 4096 (하프스텝 기준) |
| `uart` | UART 터미널 | `tx`(장치→MCU RX) `rx`(MCU TX→장치) | `baud`: 115200, `name` |
| `i2cdev` | 범용 I2C 장치 | `scl` `sda` | `addr`: 0x48, `regs`: 16바이트 hex 문자열 |
| `spidev` | 범용 SPI 장치 | `sck` `mosi` `miso` `cs` | `reply`: 응답 바이트 hex 문자열 |
| `logic` | 로직 분석기 | `ch0`–`ch3` | — |

보드 내장 장치 노드: `board-led`(LD2), `board-button`(B1), `vcp`(ST-Link 가상 COM = USART2 터미널).

## 4. 지원 C 문법 (C 서브셋 컴파일러)

지원: 전역/지역 변수, 정수형(`char` `short` `int` `long` `unsigned …` `uint8_t`~`uint32_t`, `int8_t`~`int32_t`, `size_t`, `bool`),
`float` `double`, 1·2차원 배열과 초기화 목록, 문자열, 포인터(배열·문자열·`&변수`, `*p++`, `p[i]`),
`struct`/`typedef struct`, `enum`, `#define`(상수·함수형 매크로), `static` 지역 변수, `const` `volatile`,
`if/else` `while` `do-while` `for` `switch/case` `break` `continue` `return`, 삼항, 비트 연산, 캐스트, `sizeof`,
정수 나눗셈·오버플로 (타입 폭에 맞춰 잘림).
미지원: 함수 포인터, union, goto, 비트필드, 포인터의 포인터, 가변 길이 배열, 64비트 정수 연산의 정확한 랩어라운드.

## 5. 지원 HAL / 라이브러리 API

- 코어: `HAL_Init` `HAL_Delay(ms)` `HAL_GetTick()` `HAL_NVIC_SetPriority` `HAL_NVIC_EnableIRQ` `HAL_NVIC_DisableIRQ`
  `__HAL_RCC_GPIOx_CLK_ENABLE()` 등 클럭 매크로(무시) `__disable_irq()` `__enable_irq()` `__NOP()`
- GPIO: `HAL_GPIO_WritePin(port,pin,state)` `HAL_GPIO_ReadPin(port,pin)` `HAL_GPIO_TogglePin(port,pin)` `HAL_GPIO_Init(port,&init)`
  레지스터: `GPIOA->ODR` `->IDR` `->BSRR` `->BRR`
  콜백: `void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin)` (해당 EXTI 인터럽트를 NVIC에서 켜야 호출됨)
- UART: `HAL_UART_Transmit(&huartX, data, size, timeout)` `HAL_UART_Receive(...)` `HAL_UART_Transmit_IT` `HAL_UART_Receive_IT(&huartX, buf, size)`
  콜백: `HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)` `HAL_UART_TxCpltCallback`
  `printf`: 실물과 같이 **리타깃 함수가 있어야** 출력된다 — 사용자 코드에 `int __io_putchar(int ch)` 또는 `int _write(int file, char *ptr, int len)` 정의.
  stdout 은 줄 버퍼(`\n` 에서 내보냄). `%f` 는 설정 `printfFloat` 이 켜져 있어야 출력.
- TIM: `HAL_TIM_Base_Start` `HAL_TIM_Base_Start_IT` `HAL_TIM_Base_Stop(_IT)` `HAL_TIM_PWM_Start(&htimX, TIM_CHANNEL_n)` `HAL_TIM_PWM_Stop`
  `__HAL_TIM_SET_COMPARE` `__HAL_TIM_GET_COMPARE` `__HAL_TIM_SET_AUTORELOAD` `__HAL_TIM_GET_AUTORELOAD` `__HAL_TIM_SET_COUNTER` `__HAL_TIM_GET_COUNTER` `__HAL_TIM_SET_PRESCALER`
  레지스터: `TIM2->CCR1`~`CCR4` `->ARR` `->PSC` `->CNT`, `htim2.Instance->CCR1`
  콜백: `HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim)` (`htim->Instance == TIM3` 로 구분)
- ADC: `HAL_ADC_Start` `HAL_ADC_PollForConversion(&hadc1, timeout)` `HAL_ADC_GetValue` `HAL_ADC_Stop` `HAL_ADC_ConfigChannel(&hadc1,&sConfig)`
  `HAL_ADC_Start_IT` + `HAL_ADC_ConvCpltCallback`, `HAL_ADC_Start_DMA(&hadc1, (uint32_t*)buf, n)` (여러 채널을 rank 순서로 계속 채움)
  12비트(0–4095). 여러 채널을 켜고 폴링하면 Start/Poll/GetValue 한 번마다 rank 순서대로 다음 채널 값.
- I2C: `HAL_I2C_Master_Transmit(&hi2cX, addr<<1, data, size, timeout)` `HAL_I2C_Master_Receive` `HAL_I2C_Mem_Write` `HAL_I2C_Mem_Read` `HAL_I2C_IsDeviceReady`
  응답하는 장치가 없으면 `HAL_ERROR`.
- SPI: `HAL_SPI_Transmit` `HAL_SPI_Receive` `HAL_SPI_TransmitReceive` — CS 핀(GPIO 출력)이 LOW 인 장치와 통신.
- libc: `printf` `sprintf` `snprintf` `puts` `putchar` `fflush` `strlen` `strcpy` `strncpy` `strcat` `strcmp` `strncmp` `memset` `memcpy`
  `atoi` `atof` `abs` `fabs` `sqrt` `pow` `sin` `cos` `tan` `atan2` `floor` `ceil` `round` `rand` `srand` `isdigit` `isalpha` `toupper` `tolower`
- 상수: `HAL_OK` `HAL_ERROR` `HAL_BUSY` `HAL_TIMEOUT` `HAL_MAX_DELAY` `GPIO_PIN_0`~`GPIO_PIN_15` `GPIO_PIN_SET` `GPIO_PIN_RESET`
  `TIM_CHANNEL_1`~`4` `ADC_CHANNEL_0`~`17` `I2C_MEMADD_SIZE_8BIT` `NULL` `true` `false`

## 6. C 컴파일러 인터페이스 (`assets/js/stm32/ccompiler.js`)

브라우저: `window.STM32C`, node: `module.exports`. 표준 라이브러리 외 의존성 없음.

```js
const r = STM32C.compile({
  files: { 'Core/Src/main.c': '...', 'Core/Inc/main.h': '...' },   // #include "x.h" 는 basename 으로 찾음, <...> 는 무시
  entry: 'Core/Src/main.c',
  env: {
    functions: { HAL_Delay: { gen: true, ret: 'void' }, HAL_GetTick: { ret: 'uint32_t' }, printf: { gen: true, ret: 'int', variadic: true }, ... },
    constants: { GPIO_PIN_5: 32, GPIO_PIN_SET: 1, HAL_OK: 0, ... },
    objects:   ['GPIOA', 'GPIOB', 'TIM2', 'USART2', 'RCC', ...],          // 코드에서 H.o.NAME 으로 접근
    structTypes: ['UART_HandleTypeDef', 'GPIO_InitTypeDef', 'TIM_HandleTypeDef', ...],   // HAL 구조체 타입
    handleTypes: ['UART_HandleTypeDef', 'TIM_HandleTypeDef', 'ADC_HandleTypeDef', 'I2C_HandleTypeDef', 'SPI_HandleTypeDef'],
    constantPattern: /^(RCC|FLASH|UART|USART|TIM|ADC|I2C|SPI|GPIO|PWR|SYSTICK|NVIC|DMA|EXTI)_[A-Z0-9_]+$|^[A-Z0-9_]+_IRQn$/
  }
});
// 성공: { ok: true, js, warnings, symbols: { globals: [{name, type}], functions: [{name, ret, params}] }, size: { text, data, bss } }
// 실패: { ok: false, errors: [{ file, line, col, msg }], warnings }
```

`js` 는 `new Function('H', js)(H)` 로 실행하면 다음 객체를 돌려주는 함수 본문이다.

```js
{ fns: { main: function*(){...}, HAL_GPIO_EXTI_Callback: function*(pin){...}, ... },   // 사용자 정의 함수 전부 (C 이름)
  globals: () => ({ count: v_count, buf: v_buf, ... }) }                             // Live Expressions 용
```

### 6.1 생성 코드 규약 (런타임 H 와의 계약)

- 사용자 식별자는 `v_` 접두어 (`count` → `v_count`), static 지역 변수는 모듈 전역으로 끌어올리고 이름 변경.
- 모든 사용자 함수는 generator(`function*`). 호출은 `(yield* v_f(a, b))`.
- 런타임 함수: `env.functions[name].gen` 이면 `(yield* H.f.name(args))`, 아니면 `H.f.name(args)`.
- 런타임 객체: `H.o.GPIOA`. 숫자 상수는 리터럴로 인라인. `constantPattern` 에 맞는데 `constants` 에 없는 이름은 `H.k('NAME')` (런타임이 번호 부여).
- 문장마다 `H.$.l = <줄번호>;` (런타임 오류 위치 / 현재 줄 표시용). 여러 파일이면 main.c 기준 줄만.
- 모든 루프(while / do / for)는 반복마다 맨 앞에서 `if (++H.$.n >= H.$.q) yield 0;`
- 정수 나눗셈/나머지: `H.idiv(a, b)` / `H.imod(a, b)` (0으로 나누면 HardFault). 한쪽이라도 실수면 JS `/`.
- 저장 시 타입 폭으로 자르기: u8 `&255`, i8 `<<24>>24`, u16 `&65535`, i16 `<<16>>16`, i32 `|0`, u32 `>>>0`, bool `?1:0`, float `Math.fround`, double 그대로.
  배열 원소 저장은 typed array 가 자르므로 그대로 둔다(`/=` 등 정수 나눗셈은 H.idiv 사용).
- 배열: u8/char/bool→`Uint8Array`, i8→`Int8Array`, u16→`Uint16Array`, i16→`Int16Array`, int/i32/long→`Int32Array`, u32→`Uint32Array`,
  float→`Float32Array`, double/64비트→`Float64Array`, 포인터·구조체 배열→`Array`. 2차원은 `Array` of typed array.
- 포인터 값은 `H.Ptr` (`new H.Ptr(arr, off)`, 필드 `.a` `.o`, `add(n)` 은 새 Ptr). 역참조/인덱스는 `p.a[p.o + i]` (lvalue 로도 사용).
  배열이 포인터로 쓰일 때(함수 인자, 포인터 변수 대입, 캐스트) `new H.Ptr(arr, 0)` 로 감싼다.
  `&x` 를 하는 스칼라 변수는 길이 1 typed array 로 박싱해 선언하고 모든 사용을 `v_x[0]` 으로, `&x` 는 `new H.Ptr(v_x, 0)`.
  `&arr[i]` → `new H.Ptr(arr, i)`. 구조체 변수는 JS 객체이고 `&s` 는 그 객체 자체, `->` 는 `.`.
  NULL 은 0. 포인터 비교는 `==`/`!=` 만 (Ptr 둘이면 `H.peq(a,b)`).
- 문자열 리터럴: 모듈 맨 위 `const __s0 = H.str("...")` (null 종료 Uint8Array 의 Ptr, UTF-8).
  `char s[] = "abc"` / `char s[20] = "abc"` 는 새 Uint8Array 에 복사.
- 문자 리터럴 `'A'` 는 숫자 65.
- 논리 `&&` `||` `!` 결과는 0/1 로 (조건문 안에서는 그대로 써도 됨).
- 핸들 타입(`handleTypes`)의 전역 변수는 `let v_huart2 = H.handle('huart2', 'UART_HandleTypeDef')`.
  HAL 구조체 타입(`structTypes`)의 다른 변수와 `= {0}` 초기화는 `H.struct('GPIO_InitTypeDef')` (자동 생성 프록시).
  사용자 struct 는 필드별 0 초기화된 객체 리터럴.
- 전역 초기화는 팩토리 실행 시 즉시 수행.
- 컴파일 오류 메시지는 한국어 + gcc 풍(예: `'cnt' undeclared (first use in this function)` 를 한국어로 풀어 씀).

## 7. HAL 라이브러리 지원 방침

- 사용자 코드는 실물 STM32CubeIDE 와 **같은 HAL API** 로 작성한다(5장 목록). 시뮬레이터 런타임이 HAL 을 에뮬레이션한다.
- 시뮬레이터 프로젝트 탐색기에 `Drivers/STM32F4xx_HAL_Driver/Inc/*.h` (또는 F1xx) 읽기 전용 헤더를 보여 준다:
  지원 함수 원형·구조체·상수와 한국어 주석.
- 사이트에 **HAL API 레퍼런스** 페이지(`lessons/hal-reference.html`, 원고 `content/reference/hal.md`)를 둔다:
  모듈별(GPIO/UART/TIM/ADC/I2C/SPI/코어) 함수 원형, 인자 설명, 반환값, 짧은 예제, 레지스터 직접 접근 비교.
