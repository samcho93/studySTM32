---
id: hal-reference
title: HAL API 레퍼런스
---

## 이 페이지 사용법

시뮬레이터가 에뮬레이션하는 STM32 HAL 함수를 모듈별로 모았습니다. 모든 함수는 **실물 STM32CubeIDE 의 HAL 과 같은 이름·같은 인자**이므로,
여기 예제를 그대로 CubeIDE 프로젝트에 써도 됩니다. 원형은 STM32F4 HAL 기준이며 F1 도 같습니다.

- 핸들(`huart2`, `htim3`, `hadc1`, `hi2c1`, `hspi2` …)과 `MX_..._Init()` 은 CubeMX(시뮬레이터 핀아웃·설정)가 자동으로 만듭니다. 사용자 코드는 `&huart2` 처럼 **주소**를 넘기기만 합니다.
- 대부분의 함수는 `HAL_StatusTypeDef` 를 돌려줍니다.

@table[api]
| 반환값 | 값 | 의미 |
|---|---|---|
| `HAL_OK` | 0 | 성공 |
| `HAL_ERROR` | 1 | 실패 (예: I2C 장치가 ACK 하지 않음, 잘못된 인자) |
| `HAL_BUSY` | 2 | 이미 다른 전송이 진행 중 (예: `_IT` 수신 중에 다시 `_IT` 수신 요청) |
| `HAL_TIMEOUT` | 3 | `Timeout` ms 안에 끝나지 않음 |

"시뮬레이터 미지원" 으로 표시한 함수는 실물 HAL 에는 있지만 시뮬레이터에서 빌드 오류가 나거나 동작하지 않습니다.

## 코어

```c
HAL_StatusTypeDef HAL_Init(void);
void     HAL_Delay(uint32_t Delay);
uint32_t HAL_GetTick(void);
void     HAL_NVIC_SetPriority(IRQn_Type IRQn, uint32_t PreemptPriority, uint32_t SubPriority);
void     HAL_NVIC_EnableIRQ(IRQn_Type IRQn);
void     HAL_NVIC_DisableIRQ(IRQn_Type IRQn);
```

@table[api]
| 함수 | 설명 |
|---|---|
| `HAL_Init()` | HAL 초기화, 1 ms SysTick 시작. `main()` 첫 줄에서 생성 코드가 호출 |
| `HAL_Delay(ms)` | `ms` 밀리초 동안 기다림(블로킹). **인터럽트 콜백 안에서 쓰지 말 것** |
| `HAL_GetTick()` | 부팅 후 경과 ms (`uint32_t`, 약 49.7일 뒤 0으로 돌아감). 시간 비교는 `HAL_GetTick() - t0 >= 간격` 처럼 뺄셈으로 |
| `HAL_NVIC_SetPriority(irq, pre, sub)` | 인터럽트 우선순위. 숫자가 작을수록 높음 |
| `HAL_NVIC_EnableIRQ(irq)` / `DisableIRQ` | 인터럽트 채널 켜기/끄기. 보통 CubeMX NVIC 탭 설정으로 생성됨 |
| `__HAL_RCC_GPIOA_CLK_ENABLE()` 등 | 주변장치 클럭 켜기 매크로. 시뮬레이터에서는 받아들이고 무시 |
| `__disable_irq()` / `__enable_irq()` | 모든 인터럽트 잠시 막기/풀기 (공유 변수 여러 개를 한꺼번에 읽을 때) |
| `__NOP()` | 아무것도 안 하는 명령 1개 |

```c
uint32_t t0 = HAL_GetTick();
while (HAL_GetTick() - t0 < 500) {
  // 500 ms 동안 다른 일을 하며 기다리기
}
```

## GPIO

```c
void          HAL_GPIO_WritePin(GPIO_TypeDef *GPIOx, uint16_t GPIO_Pin, GPIO_PinState PinState);
GPIO_PinState HAL_GPIO_ReadPin(GPIO_TypeDef *GPIOx, uint16_t GPIO_Pin);
void          HAL_GPIO_TogglePin(GPIO_TypeDef *GPIOx, uint16_t GPIO_Pin);
void          HAL_GPIO_Init(GPIO_TypeDef *GPIOx, GPIO_InitTypeDef *GPIO_Init);
```

@table[api]
| 인자 | 값 | 설명 |
|---|---|---|
| `GPIOx` | `GPIOA` ~ `GPIOH`, 라벨 매크로 `LD2_GPIO_Port` | 포트 |
| `GPIO_Pin` | `GPIO_PIN_0` ~ `GPIO_PIN_15` (= `1 << n`), 라벨 매크로 `LD2_Pin` | 핀. `\|` 로 여러 핀을 묶을 수 있음 |
| `PinState` | `GPIO_PIN_SET` (1) / `GPIO_PIN_RESET` (0) | 출력 레벨 |
| 반환 (`ReadPin`) | `GPIO_PIN_SET` / `GPIO_PIN_RESET` | 입력 레벨 (IDR 비트) |

```c
HAL_GPIO_WritePin(LD2_GPIO_Port, LD2_Pin, GPIO_PIN_SET);        // 켜기
HAL_GPIO_TogglePin(LD2_GPIO_Port, LD2_Pin);                     // 반전
if (HAL_GPIO_ReadPin(B1_GPIO_Port, B1_Pin) == GPIO_PIN_RESET) { // B1 눌림 (active-low)
  // ...
}
```

`HAL_GPIO_Init` 은 실행 중에 핀 모드를 바꿀 때 씁니다(보통은 CubeMX 가 생성한 `MX_GPIO_Init` 이 처리).

```c
GPIO_InitTypeDef init = {0};
init.Pin = GPIO_PIN_6;
init.Mode = GPIO_MODE_OUTPUT_PP;      // GPIO_MODE_INPUT, GPIO_MODE_IT_FALLING …
init.Pull = GPIO_NOPULL;              // GPIO_PULLUP, GPIO_PULLDOWN
init.Speed = GPIO_SPEED_FREQ_LOW;
HAL_GPIO_Init(GPIOA, &init);
```

관련 레슨: L03, L04 · 시뮬레이터 미지원: `HAL_GPIO_LockPin`, `HAL_GPIO_DeInit`

## EXTI (외부 인터럽트)

```c
void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin);   /* 사용자가 정의 (weak 재정의) */
```

- CubeMX 에서 핀을 `GPIO_EXTIn` 으로, 트리거(rising / falling / both)를 고르고 **NVIC 에서 해당 EXTI 채널을 켜야** 불립니다.
- 채널: `EXTI0_IRQn` ~ `EXTI4_IRQn`, `EXTI9_5_IRQn`(5~9), `EXTI15_10_IRQn`(10~15, B1 = PC13). 시뮬레이터 예제의 `nvic` 키는 `EXTI0` … `EXTI9_5`, `EXTI15_10`.
- 인자 `GPIO_Pin` 으로 어느 핀인지 구분합니다. 콜백은 짧게, 공유 변수는 `volatile`.

```c
volatile uint32_t presses = 0;

void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin)
{
  if (GPIO_Pin == B1_Pin) {
    presses++;
  }
}
```

관련 레슨: L05 · 시뮬레이터 미지원: `HAL_GPIO_EXTI_Rising_Callback` / `Falling_Callback` (G0·L5·U5 등 다른 제품군의 이름)

## UART

```c
HAL_StatusTypeDef HAL_UART_Transmit(UART_HandleTypeDef *huart, const uint8_t *pData, uint16_t Size, uint32_t Timeout);
HAL_StatusTypeDef HAL_UART_Receive(UART_HandleTypeDef *huart, uint8_t *pData, uint16_t Size, uint32_t Timeout);
HAL_StatusTypeDef HAL_UART_Transmit_IT(UART_HandleTypeDef *huart, const uint8_t *pData, uint16_t Size);
HAL_StatusTypeDef HAL_UART_Receive_IT(UART_HandleTypeDef *huart, uint8_t *pData, uint16_t Size);
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart);   /* 사용자 정의 */
void HAL_UART_TxCpltCallback(UART_HandleTypeDef *huart);   /* 사용자 정의 */
```

@table[api]
| 인자 | 설명 |
|---|---|
| `huart` | `&huart2` (Nucleo 가상 COM), `&huart1` … |
| `pData` | 보낼/받을 바이트 배열. 문자열은 `(uint8_t *)msg` 로 캐스트 |
| `Size` | 바이트 수 |
| `Timeout` | ms. `HAL_MAX_DELAY` = 무한 대기 |

| 함수 | 동작 | 반환 |
|---|---|---|
| `Transmit` / `Receive` | 다 끝날 때까지 기다림(블로킹) | `HAL_OK`, 시간 초과 시 `HAL_TIMEOUT` |
| `Transmit_IT` / `Receive_IT` | 예약하고 바로 돌아옴. 끝나면 `TxCplt` / `RxCplt` 콜백 | 진행 중이면 `HAL_BUSY` |

```c
uint8_t rx;
HAL_UART_Receive_IT(&huart2, &rx, 1);            // USER CODE 2: 첫 예약

void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
  if (huart->Instance == USART2) {
    // rx 처리 (플래그만 세우기)
    HAL_UART_Receive_IT(&huart2, &rx, 1);        // 다시 예약
  }
}
```

길이를 모르는 수신(IDLE 감지)과 DMA 송수신은 [UART DMA · IDLE](#uart-dma-idle) 을 보세요.

### printf 리타깃

printf 는 **리타깃 함수가 있어야** UART 로 나갑니다. stdout 은 줄 버퍼라 `\n` 에서 내보내며, `%f` 는 실수 printf 설정(`-u _printf_float` / 시뮬레이터 `printfFloat`)이 필요합니다.

```c
/* USER CODE BEGIN PFP */
int __io_putchar(int ch);
/* USER CODE BEGIN 4 */
int __io_putchar(int ch)
{
  HAL_UART_Transmit(&huart2, (uint8_t *)&ch, 1, HAL_MAX_DELAY);
  return ch;
}
```

`__io_putchar` 대신 `int _write(int file, char *ptr, int len)` 을 정의해 `len` 바이트를 한 번에 보내도 됩니다.

관련 레슨: L06 · 시뮬레이터 미지원: `HAL_UART_Transmit_DMA`, `HAL_UART_Receive_DMA`, `HAL_UARTEx_ReceiveToIdle_IT`, `HAL_UART_ErrorCallback`

## TIM · PWM

```c
HAL_StatusTypeDef HAL_TIM_Base_Start(TIM_HandleTypeDef *htim);
HAL_StatusTypeDef HAL_TIM_Base_Start_IT(TIM_HandleTypeDef *htim);
HAL_StatusTypeDef HAL_TIM_Base_Stop(TIM_HandleTypeDef *htim);
HAL_StatusTypeDef HAL_TIM_Base_Stop_IT(TIM_HandleTypeDef *htim);
HAL_StatusTypeDef HAL_TIM_PWM_Start(TIM_HandleTypeDef *htim, uint32_t Channel);
HAL_StatusTypeDef HAL_TIM_PWM_Stop(TIM_HandleTypeDef *htim, uint32_t Channel);
void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim);   /* 사용자 정의 */
```

주기 공식: **업데이트 주파수 = 타이머 클럭 / ((PSC + 1) × (ARR + 1))**, PWM 듀티 = **CCR / (ARR + 1)**. 타이머 클럭은 F411 84 MHz, F103 72 MHz (L07).

@table[api]
| 함수 / 매크로 | 설명 |
|---|---|
| `HAL_TIM_Base_Start_IT(&htim3)` | 카운터 시작 + 업데이트 인터럽트. 주기마다 `HAL_TIM_PeriodElapsedCallback` |
| `HAL_TIM_Base_Start(&htim3)` | 카운터만 시작 (시간 측정용, 콜백 없음) |
| `HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1)` | 채널 PWM 출력 시작. **없으면 핀이 움직이지 않음** |
| `__HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, ccr)` | 듀티(CCR) 설정 |
| `__HAL_TIM_GET_COMPARE(&htim3, TIM_CHANNEL_1)` | 현재 CCR |
| `__HAL_TIM_SET_AUTORELOAD(&htim3, arr)` / `GET_` | 주기(ARR) 변경 / 읽기 |
| `__HAL_TIM_SET_COUNTER(&htim2, 0)` / `GET_` | 카운터(CNT) 쓰기 / 읽기 — µs 측정 |
| `__HAL_TIM_SET_PRESCALER(&htim3, psc)` | 분주비(PSC) 변경 (다음 업데이트부터 적용) |
| `TIM_CHANNEL_1` ~ `TIM_CHANNEL_4` | 채널 상수 |

```c
/* 콜백: 여러 타이머가 공유하므로 Instance 로 구분 */
void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim)
{
  if (htim->Instance == TIM3) {
    HAL_GPIO_TogglePin(LD2_GPIO_Port, LD2_Pin);
  }
}

/* PWM: PSC 83, ARR 999 → 1 kHz, 듀티 25 % */
HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1);
__HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, 250);
```

입력 캡처(`HAL_TIM_IC_Start_IT`)는 아래 [TIM 입력 캡처](#tim-입력-캡처) 를 보세요.

관련 레슨: L07, L08, L13, L19 · 시뮬레이터 미지원: `HAL_TIM_Encoder_Start`, `HAL_TIM_OC_Start`, `HAL_TIMEx_PWMN_Start`, `__HAL_TIM_CLEAR_FLAG`

## ADC

```c
HAL_StatusTypeDef HAL_ADC_Start(ADC_HandleTypeDef *hadc);
HAL_StatusTypeDef HAL_ADC_PollForConversion(ADC_HandleTypeDef *hadc, uint32_t Timeout);
uint32_t          HAL_ADC_GetValue(ADC_HandleTypeDef *hadc);
HAL_StatusTypeDef HAL_ADC_Stop(ADC_HandleTypeDef *hadc);
HAL_StatusTypeDef HAL_ADC_ConfigChannel(ADC_HandleTypeDef *hadc, ADC_ChannelConfTypeDef *sConfig);
HAL_StatusTypeDef HAL_ADC_Start_IT(ADC_HandleTypeDef *hadc);
HAL_StatusTypeDef HAL_ADC_Start_DMA(ADC_HandleTypeDef *hadc, uint32_t *pData, uint32_t Length);
HAL_StatusTypeDef HAL_ADC_Stop_DMA(ADC_HandleTypeDef *hadc);
void HAL_ADC_ConvCpltCallback(ADC_HandleTypeDef *hadc);       /* 사용자 정의 — 변환 끝 / DMA 전체 완료 */
void HAL_ADC_ConvHalfCpltCallback(ADC_HandleTypeDef *hadc);   /* 사용자 정의 — DMA 절반 완료 */
```

12비트: 0 ~ 4095, 전압 = 값 × 3.3 / 4095. 여러 채널을 켜고 폴링하면 Start/Poll/GetValue 한 번마다 **rank 순서대로 다음 채널** 값이 나옵니다.

@table[api]
| 함수 | 설명 | 반환 |
|---|---|---|
| `HAL_ADC_Start` | 변환 시작 | `HAL_OK` |
| `HAL_ADC_PollForConversion(&hadc1, 10)` | 변환 끝까지 최대 10 ms 대기 | `HAL_OK` / `HAL_TIMEOUT` |
| `HAL_ADC_GetValue` | 결과 읽기 | 0 ~ 4095 |
| `HAL_ADC_Stop` | 정지 | `HAL_OK` |
| `HAL_ADC_ConfigChannel` | 채널·rank·샘플링 시간 변경 | `HAL_OK` |
| `HAL_ADC_Start_IT` | 변환 끝나면 `HAL_ADC_ConvCpltCallback` | `HAL_OK` |
| `HAL_ADC_Start_DMA(&hadc1, (uint32_t *)buf, n)` | 여러 채널을 rank 순서로 `buf` 에 계속 채움 (스캔 + 연속 + 순환 DMA) | `HAL_OK` |
| `HAL_ADC_ConvHalfCpltCallback` / `ConvCpltCallback` | 원형 DMA 에서 배열 앞 절반 / 뒤 절반이 찼을 때 (DMA 인터럽트 필요) | — |
| `HAL_ADC_Stop_DMA` | DMA 변환 정지 | `HAL_OK` |

```c
HAL_ADC_Start(&hadc1);
if (HAL_ADC_PollForConversion(&hadc1, 10) == HAL_OK) {
  uint32_t v = HAL_ADC_GetValue(&hadc1);
  uint32_t mv = v * 3300 / 4095;
}
HAL_ADC_Stop(&hadc1);

uint16_t adc_buf[2];
HAL_ADC_Start_DMA(&hadc1, (uint32_t *)adc_buf, 2);   // adc_buf[0] = rank1, [1] = rank2
```

관련 레슨: L09, L18 · 시뮬레이터 미지원: `HAL_ADCEx_Calibration_Start`(F1), 주입(Injected) 채널, 아날로그 워치독

## I2C

```c
HAL_StatusTypeDef HAL_I2C_Master_Transmit(I2C_HandleTypeDef *hi2c, uint16_t DevAddress, uint8_t *pData, uint16_t Size, uint32_t Timeout);
HAL_StatusTypeDef HAL_I2C_Master_Receive(I2C_HandleTypeDef *hi2c, uint16_t DevAddress, uint8_t *pData, uint16_t Size, uint32_t Timeout);
HAL_StatusTypeDef HAL_I2C_Mem_Write(I2C_HandleTypeDef *hi2c, uint16_t DevAddress, uint16_t MemAddress, uint16_t MemAddSize, uint8_t *pData, uint16_t Size, uint32_t Timeout);
HAL_StatusTypeDef HAL_I2C_Mem_Read(I2C_HandleTypeDef *hi2c, uint16_t DevAddress, uint16_t MemAddress, uint16_t MemAddSize, uint8_t *pData, uint16_t Size, uint32_t Timeout);
HAL_StatusTypeDef HAL_I2C_IsDeviceReady(I2C_HandleTypeDef *hi2c, uint16_t DevAddress, uint32_t Trials, uint32_t Timeout);
```

@table[api]
| 인자 | 설명 |
|---|---|
| `DevAddress` | **7비트 주소를 왼쪽으로 1비트 민 값** — `0x27 << 1` |
| `MemAddress` | 장치 내부 레지스터 번호 |
| `MemAddSize` | `I2C_MEMADD_SIZE_8BIT` (대부분의 센서) / `I2C_MEMADD_SIZE_16BIT` (큰 EEPROM) |
| `Trials` | `IsDeviceReady` 의 재시도 횟수 |
| 반환 | 응답(ACK)하는 장치가 없으면 **`HAL_ERROR`** |

```c
uint8_t data[2] = {0x01, 0x80};
HAL_I2C_Master_Transmit(&hi2c1, 0x27 << 1, data, 2, 10);            // 바이트 보내기
HAL_I2C_Mem_Write(&hi2c1, 0x48 << 1, 0x01, I2C_MEMADD_SIZE_8BIT, data, 1, 100);  // 레지스터 1에 쓰기
HAL_I2C_Mem_Read(&hi2c1, 0x48 << 1, 0x00, I2C_MEMADD_SIZE_8BIT, data, 2, 100);   // 레지스터 0부터 2바이트 읽기

for (uint16_t a = 1; a < 128; a++) {                                  // 스캐너
  if (HAL_I2C_IsDeviceReady(&hi2c1, a << 1, 1, 10) == HAL_OK) printf("0x%02X\r\n", a);
}
```

관련 레슨: L10 · 시뮬레이터 미지원: `HAL_I2C_Master_Transmit_IT` / `_DMA`, 슬레이브 모드 함수

## SPI

```c
HAL_StatusTypeDef HAL_SPI_Transmit(SPI_HandleTypeDef *hspi, uint8_t *pData, uint16_t Size, uint32_t Timeout);
HAL_StatusTypeDef HAL_SPI_Receive(SPI_HandleTypeDef *hspi, uint8_t *pData, uint16_t Size, uint32_t Timeout);
HAL_StatusTypeDef HAL_SPI_TransmitReceive(SPI_HandleTypeDef *hspi, uint8_t *pTxData, uint8_t *pRxData, uint16_t Size, uint32_t Timeout);
```

- CS 는 **GPIO 출력으로 직접** 내리고 올립니다(CubeMX: Hardware NSS Disable, CS 핀 초기 레벨 High). 시뮬레이터는 CS 가 LOW 인 장치와 통신합니다.
- `TransmitReceive` 는 `Size` 바이트를 보내며 같은 수를 받습니다. `Receive` 는 더미를 보내며 받습니다.

```c
uint8_t tx[4] = {0x9F, 0, 0, 0}, rx[4];
HAL_GPIO_WritePin(FLASH_CS_GPIO_Port, FLASH_CS_Pin, GPIO_PIN_RESET);   // 선택
HAL_SPI_TransmitReceive(&hspi2, tx, rx, 4, 100);                      // rx[1..3] = ID
HAL_GPIO_WritePin(FLASH_CS_GPIO_Port, FLASH_CS_Pin, GPIO_PIN_SET);     // 해제
```

관련 레슨: L11 · 시뮬레이터 미지원: `HAL_SPI_Transmit_IT` / `_DMA`, 하드웨어 NSS

## UART DMA · IDLE

```c
HAL_StatusTypeDef HAL_UARTEx_ReceiveToIdle_IT (UART_HandleTypeDef *huart, uint8_t *pData, uint16_t Size);
HAL_StatusTypeDef HAL_UARTEx_ReceiveToIdle_DMA(UART_HandleTypeDef *huart, uint8_t *pData, uint16_t Size);
void HAL_UARTEx_RxEventCallback(UART_HandleTypeDef *huart, uint16_t Size);   /* 사용자 정의 */
HAL_StatusTypeDef HAL_UART_Transmit_DMA(UART_HandleTypeDef *huart, const uint8_t *pData, uint16_t Size);
HAL_StatusTypeDef HAL_UART_Receive_DMA(UART_HandleTypeDef *huart, uint8_t *pData, uint16_t Size);
HAL_StatusTypeDef HAL_UART_DMAStop(UART_HandleTypeDef *huart);
```

@table[api]
| 함수 | 동작 | 끝나면 |
|---|---|---|
| `HAL_UARTEx_ReceiveToIdle_IT(&huart2, buf, 64)` | 최대 64바이트를 받되, 수신선이 1문자 시간 조용하면(IDLE) 거기서 끝 | `HAL_UARTEx_RxEventCallback(huart, Size)` — `Size` = 받은 바이트 수 |
| `HAL_UARTEx_ReceiveToIdle_DMA(&huart2, buf, 64)` | 위와 같고 바이트 복사를 DMA 가 함 | 같은 콜백 (DMA 절반 완료 때도 불림) |
| `HAL_UART_Transmit_DMA(&huart2, buf, n)` | 전송 예약 후 바로 돌아옴 | `HAL_UART_TxCpltCallback` |
| `HAL_UART_Receive_DMA(&huart2, buf, n)` | 정확히 n 바이트 수신 | `HAL_UART_RxCpltCallback` |
| `HAL_UART_DMAStop(&huart2)` | DMA 송수신 중단 | — |

- 수신 이벤트는 UART 인터럽트로 알리므로 **NVIC 의 USART2 global interrupt** 를 켭니다. 수신은 한 번 끝나면 멈추므로 처리 후 다시 호출합니다.
- DMA 판은 CubeMX 에서 USART2_RX DMA(F4: DMA1 Stream5 Channel4)를 추가해야 하고, 절반 완료 콜백을 막으려면 `__HAL_DMA_DISABLE_IT(&hdma_usart2_rx, DMA_IT_HT)`(실물).
- 시뮬레이터: `_DMA` 판은 `_IT` 판과 같게 동작하며, CubeMX 화면에 UART DMA 설정은 없습니다.

```c
uint8_t rx_buf[64];
volatile uint16_t rx_len = 0;
HAL_UARTEx_ReceiveToIdle_IT(&huart2, rx_buf, sizeof(rx_buf));     // USER CODE 2

void HAL_UARTEx_RxEventCallback(UART_HandleTypeDef *huart, uint16_t Size)
{
  if (huart->Instance == USART2) rx_len = Size;                   // 처리는 메인 루프에서, 처리 후 다시 ReceiveToIdle
}
```

ADC 의 원형 DMA 는 [ADC](#adc) 의 `HAL_ADC_Start_DMA` 와 `HAL_ADC_ConvHalfCpltCallback` 을 보세요. 관련 레슨: L18

## TIM 입력 캡처

```c
HAL_StatusTypeDef HAL_TIM_IC_Start(TIM_HandleTypeDef *htim, uint32_t Channel);
HAL_StatusTypeDef HAL_TIM_IC_Start_IT(TIM_HandleTypeDef *htim, uint32_t Channel);
HAL_StatusTypeDef HAL_TIM_IC_Stop(TIM_HandleTypeDef *htim, uint32_t Channel);
HAL_StatusTypeDef HAL_TIM_IC_Stop_IT(TIM_HandleTypeDef *htim, uint32_t Channel);
uint32_t HAL_TIM_ReadCapturedValue(TIM_HandleTypeDef *htim, uint32_t Channel);
__HAL_TIM_SET_CAPTUREPOLARITY(htim, Channel, Polarity);          /* 매크로 */
void HAL_TIM_IC_CaptureCallback(TIM_HandleTypeDef *htim);          /* 사용자 정의 */
```

에지가 들어오는 순간 카운터(CNT) 값이 CCRx 에 복사됩니다. 두 캡처 값의 차이 × 틱 = 주기 또는 펄스 폭. 틱 = (PSC + 1) / 타이머 클럭.

@table[api]
| 함수 / 상수 | 설명 |
|---|---|
| `HAL_TIM_IC_Start_IT(&htim2, TIM_CHANNEL_1)` | 카운터 시작 + CH1 캡처 인터럽트. 에지마다 `HAL_TIM_IC_CaptureCallback` |
| `HAL_TIM_IC_Start` | 인터럽트 없이 캡처만 (`ReadCapturedValue` 로 폴링) |
| `HAL_TIM_ReadCapturedValue(htim, TIM_CHANNEL_1)` | 마지막 캡처 값(CCR1) |
| `__HAL_TIM_SET_CAPTUREPOLARITY(htim, ch, pol)` | 다음 캡처 에지 바꾸기 |
| `TIM_INPUTCHANNELPOLARITY_RISING` / `_FALLING` / `_BOTHEDGE` | 상승 / 하강 / 양쪽 (F1 은 양쪽 미지원) |
| `htim->Channel == HAL_TIM_ACTIVE_CHANNEL_1` | 콜백에서 어느 채널인지 구분 (`TIM_CHANNEL_1` 과 값이 다름) |

CubeMX: TIMx → Channel1 **Input Capture direct mode**, Prescaler, Counter Period(**최댓값** 0xFFFF / 0xFFFFFFFF), Polarity, NVIC TIMx global interrupt.
생성 코드는 `TIM_IC_InitTypeDef sConfigIC` 와 `HAL_TIM_IC_ConfigChannel()` 입니다.

```c
/* TIM2: PSC 83 → 1 µs 틱, ARR 0xFFFFFFFF. HIGH 폭 재기 (극성 바꾸기) */
volatile uint32_t rise, width_us;
volatile uint8_t wait_fall = 0;

void HAL_TIM_IC_CaptureCallback(TIM_HandleTypeDef *htim)
{
  if (htim->Instance == TIM2 && htim->Channel == HAL_TIM_ACTIVE_CHANNEL_1) {
    uint32_t cap = HAL_TIM_ReadCapturedValue(htim, TIM_CHANNEL_1);
    if (!wait_fall) { rise = cap; __HAL_TIM_SET_CAPTUREPOLARITY(htim, TIM_CHANNEL_1, TIM_INPUTCHANNELPOLARITY_FALLING); }
    else            { width_us = cap - rise; __HAL_TIM_SET_CAPTUREPOLARITY(htim, TIM_CHANNEL_1, TIM_INPUTCHANNELPOLARITY_RISING); }
    wait_fall = !wait_fall;
  }
}
```

관련 레슨: L19 · 시뮬레이터: 타이머 자신의 PWM 출력은 캡처 에지를 만들지 않습니다(장치 · 버튼이 핀을 움직일 때 캡처). PWM 입력 모드(슬레이브 리셋)는 미지원.

## IWDG (워치독)

```c
HAL_StatusTypeDef HAL_IWDG_Init(IWDG_HandleTypeDef *hiwdg);       /* MX_IWDG_Init() 이 호출 — 이때부터 카운트 시작 */
HAL_StatusTypeDef HAL_IWDG_Refresh(IWDG_HandleTypeDef *hiwdg);    /* 카운터 다시 채우기 */
__HAL_RCC_GET_FLAG(RCC_FLAG_IWDGRST);                             /* 리셋 원인 플래그 읽기 (1 / 0) */
__HAL_RCC_CLEAR_RESET_FLAGS();                                    /* 리셋 플래그 모두 지우기 */
void NVIC_SystemReset(void);                                      /* 소프트웨어 리셋 (돌아오지 않음) */
```

**제한 시간 = 4 × 2^PR × (Reload + 1) / LSI** — `hiwdg.Init.Prescaler = IWDG_PRESCALER_4 ~ 256`, `hiwdg.Init.Reload = 0 ~ 4095`. LSI 는 F4 약 32 kHz(17~47 kHz), F1 약 40 kHz.

@table[api]
| 설정 (LSI 32 kHz) | 제한 시간 |
|---|---|
| `IWDG_PRESCALER_32`, Reload 999 | 1.0 s |
| `IWDG_PRESCALER_64`, Reload 4095 | 8.2 s |
| `IWDG_PRESCALER_256`, Reload 4095 | 32.8 s (최대) |

@table[api]
| 리셋 플래그 | 원인 |
|---|---|
| `RCC_FLAG_IWDGRST` / `RCC_FLAG_WWDGRST` | 독립 / 창 워치독 |
| `RCC_FLAG_SFTRST` | `NVIC_SystemReset()` |
| `RCC_FLAG_PORRST` / `RCC_FLAG_BORRST` | 전원 켜짐 / 브라운아웃 |
| `RCC_FLAG_PINRST` | NRST 핀 (다른 리셋에서도 함께 켜짐 → 마지막에 검사) |

```c
/* USER CODE 2: 리셋 원인 → 지우기 */
if (__HAL_RCC_GET_FLAG(RCC_FLAG_IWDGRST)) printf("reset by IWDG\r\n");
__HAL_RCC_CLEAR_RESET_FLAGS();

/* 메인 루프 끝: 한 바퀴가 정상일 때만 */
HAL_IWDG_Refresh(&hiwdg);
```

관련 레슨: L20 · 시뮬레이터 미지원: WWDG(`HAL_WWDG_Init`, `HAL_WWDG_Refresh`), `__HAL_DBGMCU_FREEZE_IWDG`

## RTC

```c
HAL_StatusTypeDef HAL_RTC_Init(RTC_HandleTypeDef *hrtc);
HAL_StatusTypeDef HAL_RTC_SetTime(RTC_HandleTypeDef *hrtc, RTC_TimeTypeDef *sTime, uint32_t Format);
HAL_StatusTypeDef HAL_RTC_GetTime(RTC_HandleTypeDef *hrtc, RTC_TimeTypeDef *sTime, uint32_t Format);
HAL_StatusTypeDef HAL_RTC_SetDate(RTC_HandleTypeDef *hrtc, RTC_DateTypeDef *sDate, uint32_t Format);
HAL_StatusTypeDef HAL_RTC_GetDate(RTC_HandleTypeDef *hrtc, RTC_DateTypeDef *sDate, uint32_t Format);
HAL_StatusTypeDef HAL_RTCEx_SetWakeUpTimer_IT(RTC_HandleTypeDef *hrtc, uint32_t WakeUpCounter, uint32_t WakeUpClock);
HAL_StatusTypeDef HAL_RTCEx_DeactivateWakeUpTimer(RTC_HandleTypeDef *hrtc);
void HAL_RTCEx_WakeUpTimerEventCallback(RTC_HandleTypeDef *hrtc);  /* 사용자 정의 */
```

@table[api]
| 항목 | 설명 |
|---|---|
| `RTC_TimeTypeDef` | `Hours` `Minutes` `Seconds` `SubSeconds` |
| `RTC_DateTypeDef` | `Year`(0~99) `Month`(1~12) `Date`(1~31) `WeekDay`(1 = 월 ~ 7 = 일) |
| `RTC_FORMAT_BIN` / `RTC_FORMAT_BCD` | 23 / `0x23`. CubeMX 생성 코드는 BCD 로 설정 |
| **GetTime 다음 GetDate** | 시각을 읽으면 날짜를 읽을 때까지 그림자 레지스터가 잠김. 날짜가 필요 없어도 GetDate 호출 |
| `SetWakeUpTimer_IT(&hrtc, n, RTC_WAKEUPCLOCK_CK_SPRE_16BITS)` | (n + 1) 초마다 웨이크업 인터럽트 (NVIC: RTC_WKUP) |
| `RTC_WAKEUPCLOCK_RTCCLK_DIV16` | 한 칸 488 µs (LSE 기준), 최대 약 32 s |

```c
RTC_TimeTypeDef t; RTC_DateTypeDef d;
HAL_RTC_GetTime(&hrtc, &t, RTC_FORMAT_BIN);
HAL_RTC_GetDate(&hrtc, &d, RTC_FORMAT_BIN);
printf("20%02d-%02d-%02d %02d:%02d:%02d\r\n", d.Year, d.Month, d.Date, t.Hours, t.Minutes, t.Seconds);
```

관련 레슨: L21 · 시뮬레이터 미지원: 알람(`HAL_RTC_SetAlarm_IT`), 백업 레지스터(`HAL_RTCEx_BKUPRead` / `Write`), 탬퍼 · 타임스탬프

## PWR (저전력)

```c
void HAL_PWR_EnterSLEEPMode(uint32_t Regulator, uint8_t SLEEPEntry);   /* PWR_MAINREGULATOR_ON, PWR_SLEEPENTRY_WFI */
void HAL_PWR_EnterSTOPMode(uint32_t Regulator, uint8_t STOPEntry);     /* PWR_LOWPOWERREGULATOR_ON, PWR_STOPENTRY_WFI */
void HAL_PWR_EnterSTANDBYMode(void);                                     /* 돌아오지 않음 — 깨어나면 리셋 */
void HAL_PWR_EnableWakeUpPin(uint32_t WakeUpPinx);                       /* PWR_WAKEUP_PIN1 = PA0 (F411) */
void HAL_SuspendTick(void);   void HAL_ResumeTick(void);                 /* SysTick 인터럽트 멈춤 / 재개 */
__HAL_PWR_GET_FLAG(PWR_FLAG_SB);  __HAL_PWR_CLEAR_FLAG(PWR_FLAG_WU);
```

@table[api]
| 모드 | 깨우는 원인 | 깨어난 뒤 |
|---|---|---|
| SLEEP | 아무 인터럽트 (SysTick 포함 → `HAL_SuspendTick()` 먼저) | 다음 줄부터 |
| STOP | EXTI 라인: GPIO EXTI, RTC 웨이크업 · 알람 | 다음 줄부터, 클럭 = HSI → **`SystemClock_Config()` 다시 호출** |
| STANDBY | WKUP 핀, RTC 알람 · 웨이크업, NRST, IWDG | 리셋 → `main()` 처음, `PWR_FLAG_SB` = 1 |

```c
HAL_SuspendTick();
HAL_PWR_EnterSTOPMode(PWR_LOWPOWERREGULATOR_ON, PWR_STOPENTRY_WFI);
SystemClock_Config();          /* PLL 다시 켜기 */
HAL_ResumeTick();
```

관련 레슨: L21 · 대표 소비 전류는 데이터시트의 Supply current 표를 확인하세요. 시뮬레이터의 전류 추정은 대략적인 값입니다.

## CMSIS-RTOS2 (FreeRTOS)

CubeMX 의 FREERTOS(Interface **CMSIS_V2**)를 켜면 `#include "cmsis_os.h"` 와 태스크 핸들 · 속성, `osKernelInitialize` → `osThreadNew` → `osKernelStart` 가 생성됩니다.
함수 대부분은 `osStatus_t` 를 돌려줍니다: `osOK`(0), `osErrorTimeout`(−2), `osErrorResource`(−3), `osErrorParameter`(−4), `osErrorISR`(−6).
`timeout` 은 틱(1 ms) 단위, `osWaitForever` = 무한 대기, **ISR 에서는 0**.

```c
/* 커널 · 태스크 */
osStatus_t   osKernelInitialize(void);
osStatus_t   osKernelStart(void);                                   /* 돌아오지 않음 */
uint32_t     osKernelGetTickCount(void);
osThreadId_t osThreadNew(osThreadFunc_t func, void *argument, const osThreadAttr_t *attr);
osThreadId_t osThreadGetId(void);          const char *osThreadGetName(osThreadId_t id);
osStatus_t   osThreadYield(void);          osStatus_t osThreadSuspend(osThreadId_t id);
osStatus_t   osThreadResume(osThreadId_t id);   osStatus_t osThreadTerminate(osThreadId_t id);   void osThreadExit(void);
osStatus_t   osDelay(uint32_t ticks);      osStatus_t osDelayUntil(uint32_t ticks);

/* 동기화 · 통신 */
osMutexId_t        osMutexNew(const osMutexAttr_t *attr);
osStatus_t         osMutexAcquire(osMutexId_t id, uint32_t timeout);   osStatus_t osMutexRelease(osMutexId_t id);
osSemaphoreId_t    osSemaphoreNew(uint32_t max_count, uint32_t initial_count, const osSemaphoreAttr_t *attr);
osStatus_t         osSemaphoreAcquire(osSemaphoreId_t id, uint32_t timeout);   osStatus_t osSemaphoreRelease(osSemaphoreId_t id);
uint32_t           osSemaphoreGetCount(osSemaphoreId_t id);
osMessageQueueId_t osMessageQueueNew(uint32_t msg_count, uint32_t msg_size, const osMessageQueueAttr_t *attr);
osStatus_t         osMessageQueuePut(osMessageQueueId_t id, const void *msg_ptr, uint8_t msg_prio, uint32_t timeout);
osStatus_t         osMessageQueueGet(osMessageQueueId_t id, void *msg_ptr, uint8_t *msg_prio, uint32_t timeout);
uint32_t           osMessageQueueGetCount(osMessageQueueId_t id);
uint32_t osThreadFlagsSet(osThreadId_t id, uint32_t flags);   uint32_t osThreadFlagsWait(uint32_t flags, uint32_t options, uint32_t timeout);
uint32_t osThreadFlagsClear(uint32_t flags);
osEventFlagsId_t osEventFlagsNew(const osEventFlagsAttr_t *attr);
uint32_t osEventFlagsSet(osEventFlagsId_t id, uint32_t flags);   uint32_t osEventFlagsClear(osEventFlagsId_t id, uint32_t flags);
uint32_t osEventFlagsWait(osEventFlagsId_t id, uint32_t flags, uint32_t options, uint32_t timeout);
osTimerId_t osTimerNew(osTimerFunc_t func, osTimerType_t type, void *argument, const osTimerAttr_t *attr);
osStatus_t  osTimerStart(osTimerId_t id, uint32_t ticks);   osStatus_t osTimerStop(osTimerId_t id);
```

@table[api]
| 도구 | ISR 에서 | 메모 |
|---|---|---|
| `osDelay` / `osDelayUntil` | 불가 | 태스크를 Blocked 로. 태스크 안에서는 `HAL_Delay` 대신 사용 |
| `osMessageQueuePut` / `Get` | Put · Get 가능 (timeout 0) | 값을 복사. 큐가 차면 ISR 은 `osErrorResource` |
| `osMutexAcquire` / `Release` | **불가** | 소유자 있음, 우선순위 상속. 공유 자원 보호 |
| `osSemaphoreAcquire` / `Release` | Release 가능 (Acquire 는 timeout 0) | 이진(최대 1) · 카운팅 |
| `osThreadFlagsSet` / `Wait` | Set 가능 | 특정 태스크 깨우기. `Wait` 옵션 `osFlagsWaitAny` / `osFlagsWaitAll` / `osFlagsNoClear` |
| `osEventFlagsSet` / `Wait` | Set 가능 | 여러 태스크가 보는 비트 모음 |
| `osTimerNew(fn, osTimerOnce / osTimerPeriodic, arg, NULL)` | — | 콜백은 타이머 서비스 태스크에서 실행 — 짧게, 대기 금지 |

우선순위: `osPriorityIdle`(1) · `Low`(8) · `BelowNormal`(16) · **`Normal`(24)** · `AboveNormal`(32) · `High`(40) · `Realtime`(48).
RTOS 함수를 부르는 인터럽트는 NVIC 우선순위를 **5 이상(숫자)** 으로 둡니다(CubeMX 기본 `LIBRARY_MAX_SYSCALL_INTERRUPT_PRIORITY` = 5).

```c
/* ISR → 태스크: 세마포어 */
void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin) { if (GPIO_Pin == B1_Pin) osSemaphoreRelease(buttonSemHandle); }

void StartButtonTask(void *argument)
{
  for (;;) {
    osSemaphoreAcquire(buttonSemHandle, osWaitForever);
    osMutexAcquire(uartMutexHandle, osWaitForever);
    printf("B1\r\n");
    osMutexRelease(uartMutexHandle);
  }
}
```

관련 레슨: L22, L23 · 시뮬레이터: 태스크 함수 이름을 값으로 넘기는 것은 되지만 함수 포인터 변수는 미지원. HAL 타임베이스(TIM6) 코드는 생략. 미지원: `osThreadGetStackSpace`, 메모리 풀, 스택 넘침 검사 훅.

## 레지스터 직접 접근

HAL 함수 대신 레지스터에 직접 쓰면 빠르고 코드가 짧습니다. 시뮬레이터가 지원하는 레지스터입니다.

@table[regmap]
| 레지스터 | 읽기/쓰기 | 설명 | HAL 대응 |
|---|---|---|---|
| `GPIOx->ODR` | R/W | 출력 데이터 (비트 0~15) | `WritePin` / `TogglePin` |
| `GPIOx->IDR` | R | 입력 데이터 | `ReadPin` |
| `GPIOx->BSRR` | W | 하위 16비트: 1 쓴 핀 SET, 상위 16비트: 1 쓴 핀 RESET (같은 핀이면 SET 우선) | `WritePin` 내부 동작 |
| `GPIOx->BRR` | W | 1 쓴 핀 RESET (F1 등) | — |
| `TIMx->CCR1` ~ `CCR4` | R/W | 채널 비교값(PWM 듀티) | `__HAL_TIM_SET_COMPARE` |
| `TIMx->ARR` | R/W | 자동 재장전(주기) | `__HAL_TIM_SET_AUTORELOAD` |
| `TIMx->PSC` | R/W | 분주비 | `__HAL_TIM_SET_PRESCALER` |
| `TIMx->CNT` | R/W | 카운터 | `__HAL_TIM_GET_COUNTER` |

```c
/* 같은 일, 두 방식 */
HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, GPIO_PIN_SET);   GPIOA->BSRR = GPIO_PIN_5;
HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, GPIO_PIN_RESET); GPIOA->BSRR = (uint32_t)GPIO_PIN_5 << 16;
HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5);                GPIOA->ODR ^= GPIO_PIN_5;
__HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, 500);    TIM3->CCR1 = 500;   /* = htim3.Instance->CCR1 */
```

`GPIOx->ODR ^= ...` 는 읽기-수정-쓰기라서 인터럽트와 같은 포트를 함께 바꾸면 경쟁이 생길 수 있습니다. 여러 핀을 동시에 바꿀 때는 BSRR 한 번 쓰기가 안전합니다(L12).

## libc 와 상수

**지원 libc 함수**: `printf` `sprintf` `snprintf` `puts` `putchar` `fflush` `strlen` `strcpy` `strncpy` `strcat` `strcmp` `strncmp` `memset` `memcpy`
`atoi` `atof` `abs` `fabs` `sqrt` `pow` `sin` `cos` `tan` `atan2` `floor` `ceil` `round` `rand` `srand` `isdigit` `isalpha` `toupper` `tolower`

**지원 상수**: `HAL_OK` `HAL_ERROR` `HAL_BUSY` `HAL_TIMEOUT` `HAL_MAX_DELAY` `GPIO_PIN_0`~`GPIO_PIN_15` `GPIO_PIN_SET` `GPIO_PIN_RESET`
`TIM_CHANNEL_1`~`4` `ADC_CHANNEL_0`~`17` `I2C_MEMADD_SIZE_8BIT` `NULL` `true` `false`
`TIM_INPUTCHANNELPOLARITY_*` `HAL_TIM_ACTIVE_CHANNEL_1`~`4` `IWDG_PRESCALER_4`~`256` `RCC_FLAG_*` `RTC_FORMAT_BIN` `RTC_FORMAT_BCD` `RTC_WAKEUPCLOCK_*` `RTC_MONTH_*` `RTC_WEEKDAY_*`
`PWR_*` `osOK` `osError*` `osWaitForever` `osPriority*` `osFlagsWaitAny` `osFlagsWaitAll` `osFlagsNoClear` `osTimerOnce` `osTimerPeriodic`

**C 문법 범위**: 정수·실수형(`uint8_t`~`uint32_t`, `int8_t`~`int32_t`, `float`, `double`, `bool`), 1·2차원 배열, 문자열, 포인터(`*p++`, `p[i]`, `&변수`),
`struct` / `typedef struct`, `enum`, `#define`(상수·함수형 매크로), `static` 지역 변수, `const` `volatile`, 모든 제어문, 삼항·비트 연산·캐스트·`sizeof`.
**미지원**: 함수 포인터, `union`, `goto`, 비트필드, 포인터의 포인터, 가변 길이 배열, 64비트 정수의 정확한 오버플로.

## 시뮬레이터 미지원 API 모음

아래는 실물 HAL 에서 자주 쓰지만 시뮬레이터에서는 지원하지 않는 API 입니다. 실물 보드(L16)에서는 그대로 쓸 수 있습니다.

@table[api]
| 모듈 | API (시뮬레이터 미지원) | 대신 쓸 수 있는 방법 |
|---|---|---|
| 코어 · 전원 | `HAL_WWDG_Init` / `Refresh`, `__HAL_DBGMCU_FREEZE_IWDG`, `HAL_PWREx_EnableFlashPowerDown` | IWDG |
| GPIO | `HAL_GPIO_LockPin`, `HAL_GPIO_DeInit` | — |
| UART | `HAL_UART_ErrorCallback`, `__HAL_DMA_DISABLE_IT`, CubeMX 의 UART DMA 설정 | `HAL_UARTEx_ReceiveToIdle_IT` |
| TIM | `HAL_TIM_Encoder_Start`, `HAL_TIM_OC_Start`, PWM 입력 모드, `__HAL_TIM_CLEAR_FLAG` | 입력 캡처, `__HAL_TIM_GET_COUNTER` |
| ADC | `HAL_ADCEx_Calibration_Start`, 주입 채널 | 일반 채널 + 평균 |
| I2C | `HAL_I2C_Master_Transmit_IT` / `_DMA` | 블로킹 함수 |
| SPI | `HAL_SPI_Transmit_IT` / `_DMA` | 블로킹 함수 |
| LL | `LL_GPIO_TogglePin` 등 LL 드라이버 전체 | HAL 또는 레지스터 직접 접근 |
| RTC | `HAL_RTC_SetAlarm_IT`, `HAL_RTCEx_BKUPRead` / `Write`, `HAL_RTC_WaitForSynchro` | 웨이크업 타이머 |
| RTOS | `osThreadGetStackSpace`, 메모리 풀, FreeRTOS 네이티브 API(`xQueueSend` 등) | CMSIS-RTOS2 함수 |
| 기타 | DAC, CAN, USB | — |

## 참고자료

- ST, *UM1725 — Description of STM32F4 HAL and low-layer drivers*
- ST, *UM1850 — Description of STM32F1 HAL and low-layer drivers*
- ST, *RM0383 — STM32F411xC/E Reference Manual*
- ARM, *CMSIS-RTOS2 API documentation* (`os…` 함수의 원형과 ISR 사용 가능 여부)
- FreeRTOS, *Mastering the FreeRTOS Real Time Kernel*
- 시뮬레이터 프로젝트 탐색기의 `Drivers/STM32F4xx_HAL_Driver/Inc/*.h` (지원 함수 원형과 한국어 주석)
