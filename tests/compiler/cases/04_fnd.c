#include "main.h"

// 7세그먼트 표 (common cathode, gfedcba)
const uint8_t seg[10] = {0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F};
const char *names[] = { "zero", "one", "two" };
uint8_t grid[2][3] = { {1, 2, 3}, {4, 5, 6} };
int flat[2][2] = { 1, 2, 3, 4 };

void show(int n)
{
  char bits[9];
  for (int i = 0; i < 8; i++)
  {
    bits[7 - i] = ((seg[n] >> i) & 1) ? '1' : '0';
  }
  bits[8] = '\0';
  printf("%d:%s\n", n, bits);
}

int main(void)
{
  int value = 47;
  show(value / 10);
  show(value % 10);
  uint8_t pins = 0;
  for (int i = 0; i < 7; i++) if ((seg[8] >> i) & 1) pins++;
  printf("pins=%d n=%d\n", pins, (int)(sizeof(seg) / sizeof(seg[0])));
  for (int i = 0; i < 3; i++) printf("%s%c", names[i], i < 2 ? ',' : '\n');
  int sum = 0;
  for (int r = 0; r < 2; r++)
    for (int c = 0; c < 3; c++)
      sum += grid[r][c] * (r + 1);
  grid[1][2] += 250;
  printf("sum=%d g=%d flat=%d%d%d%d\n", sum, grid[1][2], flat[0][0], flat[0][1], flat[1][0], flat[1][1]);
  const uint8_t *p = seg;
  p += 2;
  printf("p=%X %X %X\n", *p, p[1], *(p + 2));
  uint8_t *q = &grid[0][1];
  *q = 77;
  q[1]++;
  printf("grid0=%d %d %d\n", grid[0][0], grid[0][1], grid[0][2]);
  return 0;
}
