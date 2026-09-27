#include "main.h"
#include "main.h"   /* header guard check */
#include <stdio.h>

uint32_t count = 0;

int main(void)
{
  HAL_Init();
  for (int i = 0; i < 4; i++)
  {
    HAL_GPIO_TogglePin(LD2_GPIO_Port, LD2_Pin);
    HAL_Delay(500);
    count++;
    printf("t=%lu odr=%lX count=%lu\n", HAL_GetTick(), GPIOA->ODR, count);
  }
  while (count < 6) { count++; }
  printf("done %u\n", count);
  return 0;
}
