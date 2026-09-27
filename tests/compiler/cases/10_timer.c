#include "main.h"

#define SQUARE(x) ((x) * (x))
#define LOG(fmt, ...) printf(fmt "\n", __VA_ARGS__)

TIM_HandleTypeDef htim2;
TIM_HandleTypeDef htim3;
volatile uint32_t ticks = 0;
uint16_t duty = 0;

void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim)
{
  if (htim->Instance == TIM3)
  {
    ticks++;
  }
}

int classify(int v)
{
  int r = 0;
  switch (v)
  {
    case 0:
    case 1:
      r = 10;
      break;
    case 2:
      r = 20;
      /* fallthrough */
    case 3:
      r += 3;
      break;
    default:
      r = -1;
  }
  return r;
}

int main(void)
{
  htim2.Instance = TIM2;
  htim3.Instance = TIM3;
  HAL_TIM_PWM_Start(&htim2, TIM_CHANNEL_1);
  for (duty = 0; duty <= 1000; duty += 250)
  {
    __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_1, duty);
    printf("ccr1=%lu\n", htim2.Instance->CCR1);
  }
  TIM2->CCR1 = 42;
  TIM2->ARR |= 0x400;
  htim2.Instance->CCR2 = TIM2->CCR1 * 2;
  printf("%lu %lu %lu\n", TIM2->CCR1, TIM2->ARR, TIM2->CCR2);
  HAL_TIM_PeriodElapsedCallback(&htim3);
  HAL_TIM_PeriodElapsedCallback(&htim2);
  HAL_TIM_PeriodElapsedCallback(&htim3);
  GPIOA->ODR ^= (1 << 5);
  GPIOA->ODR |= LD2_Pin << 1;
  printf("ticks=%lu odr=%lX\n", ticks, GPIOA->ODR);
  LOG("c=%d %d %d %d %d", classify(0), classify(1), classify(2), classify(3), classify(9));
  int n = 0, i = 0;
  do { n += SQUARE(i + 1); i++; } while (i < 3);
  for (i = 0; i < 10; i++)
  {
    if (i % 2) continue;
    if (i > 6) break;
    n += i;
  }
  printf("n=%d i=%d %s\n", n, i, n > 20 ? "big" : "small");
  return 0;
}
