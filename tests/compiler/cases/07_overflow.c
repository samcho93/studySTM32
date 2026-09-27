#include "main.h"

int main(void)
{
  uint8_t a = 255; a = a + 1;
  uint8_t a2 = 250; a2 += 10;
  int8_t b = 127; b++;
  uint32_t c = 0; c = c - 1;
  uint16_t w = 65535; w++;
  int16_t sw = -32768; sw--;
  int q1 = 7 / 2, q2 = -7 / 2, m = -7 % 3;
  int x = 7, y = -2;
  float f = 7 / 2.0;
  double dd = 1.0 / 3;
  int tr = (int)3.99, trn = (int)-3.99;
  uint8_t cast = (uint8_t)300;
  unsigned int big = 0xFFFFFFFF;
  big >>= 28;
  int neg = -16; neg >>= 2;
  uint32_t shr = 0x80000000; shr = shr >> 31;
  int32_t ov = 2147483647; ov = ov + 1;
  char ch = 'A' + 2;
  char esc[] = "a\tb\\\x41\101";
  uint32_t mul = 65536u * 65536u;
  printf("%d %d %d %lu %u %d\n", a, a2, b, c, w, sw);
  printf("%d %d %d %d %d %d\n", q1, q2, m, x / y, x % y, -x / 2);
  printf("%.2f %.4f %d %d %d\n", f, dd, tr, trn, cast);
  printf("%u %d %u %d %c %d\n", big, neg, shr, ov, ch, (int)sizeof(esc));
  printf("%s|%u|%d|%d\n", esc, mul, (c == 4294967295u), (a == 0) && (b < 0));
  unsigned char uc = 200; signed char sc = uc;
  printf("%d %d %d\n", sc, (uc > 100) + (uc << 1), '\n' + '\0' + '\\');
  uint32_t u = 10; int s = -1;
  int k = 0, j;
  j = (k++, k++, k + 10);
  printf("%d %d %d %d\n", u > s, (int)(u * 3 / 4), j, k);
  float avg = (float)x / 2;
  int ip = avg * 10;
  printf("%.1f %d %d\n", avg, ip, !x);
  return 0;
}
