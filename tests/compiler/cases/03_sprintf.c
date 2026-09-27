#include "main.h"
#include <string.h>
#include <stdio.h>

UART_HandleTypeDef huart2;

int main(void)
{
  char buf[64];
  int n = -42;
  float v = 3.14159f;
  const char *name = "ST" "M";
  sprintf(buf, "%d %5.2f %s %02X %c\r\n", n, v, name, 10, 'Z');
  HAL_UART_Transmit(&huart2, (uint8_t*)buf, strlen(buf), HAL_MAX_DELAY);
  int len = strlen(buf);
  sprintf(buf, "len=%d sizeof=%u\n", len, sizeof(buf));
  HAL_UART_Transmit(&huart2, (uint8_t *)buf, strlen(buf), 100);
  sprintf(buf, "%s", "한글");
  printf("utf8=%d %s\n", (int)strlen(buf), buf);
  return 0;
}
