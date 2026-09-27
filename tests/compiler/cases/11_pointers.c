#include "main.h"
#include "util.h"
#include <stdbool.h>

#define N 5
#define BUF_LEN (N * 2)

int table[BUF_LEN];
char msgs[2][6] = { "hi", "yo" };
static int level = 3;

typedef struct { uint8_t data[4]; int len; } Packet;

int fact(int n) { return n <= 1 ? 1 : n * fact(n - 1); }

int early(void) { return later(4) + 1; }   // 원형 없이 뒤에 정의된 함수 호출
int later(int v) { return v * 10; }

void fill(uint8_t *dst, uint8_t v, int n)
{
  while (n--) *dst++ = v++;
}

int count_char(const char *s, char c)
{
  int k = 0;
  const char *start = s;
  while (*s) { if (*s == c) k++; s++; }
  return k * 100 + (int)(s - start);
}

int main(void)
{
  uint8_t buf[6] = {0};
  fill(buf, 250, 6);
  printf("%d %d %d %d %d %d\n", buf[0], buf[1], buf[2], buf[3], buf[4], buf[5]);

  int i = 0;
  table[i++] += 2;
  table[i++] = 7;
  int v = table[i - 1]++;
  int w = ++table[1];
  printf("t=%d %d i=%d v=%d w=%d\n", table[0], table[1], i, v, w);

  Packet pk = {0};
  pk.data[pk.len++] = 0xAA;
  pk.data[pk.len++] = 0xBB;
  int old = pk.len--;
  printf("pk=%X %X len=%d old=%d\n", pk.data[0], pk.data[1], pk.len, old);

  uint8_t *p = buf;
  uint8_t *e = &buf[5];
  int dist = e - p;
  p++;
  uint8_t first = *p++;
  uint8_t second = *++p;
  printf("dist=%d first=%d second=%d lt=%d\n", dist, first, second, p < e);

  printf("cc=%d %s %s %c\n", count_char("hello world", 'o'), msgs[0], msgs[1], msgs[1][1]);
  printf("fact=%d early=%d sq=%d lvl=%d\n", fact(6), early(), square_u8(20), level);

  bool flag = false;
  flag = !flag;
  bool b2 = 5;
  printf("flag=%d b2=%d sz=%d %d %d\n", flag, b2, (int)sizeof(int), (int)sizeof table, (int)sizeof(Packet));

  float acc = 0.1f;
  for (int k = 0; k < 3; k++) acc += 0.1f;
  double d = acc;
  printf("acc=%.6f ok=%d\n", d, acc > 0.39f && acc < 0.41f);

  char *names[] = { "a", "bb", NULL };
  int cnt = 0;
  while (names[cnt] != NULL) cnt++;
  char text[16] = "abc";
  char *t = text;
  t[3] = 'd';
  *(t + 4) = '!';
  (void)cnt;
  printf("cnt=%d text=%s\n", cnt, text);
  return 0;
}
