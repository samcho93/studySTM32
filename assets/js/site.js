/* site.js — 공통 UI: 모바일 내비, 코드 복사, 진행률, 목차 하이라이트 */
(function () {
  'use strict';

  var KEY = 'studystm32.progress.v1';

  // ---------------------------------------------------------- 진행률 저장소
  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
    } catch (e) {
      return {};
    }
  }

  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) { /* 프라이빗 모드 등에서는 조용히 무시 */ }
  }

  var progress = load();

  // ------------------------------------------------------------ 모바일 내비
  var toggle = document.getElementById('navToggle');
  var sidebar = document.getElementById('sidebar');
  var scrim = document.getElementById('scrim');

  function closeNav() {
    if (sidebar) sidebar.classList.remove('open');
    if (scrim) scrim.classList.remove('open');
  }

  if (toggle && sidebar) {
    toggle.addEventListener('click', function () {
      var open = sidebar.classList.toggle('open');
      if (scrim) scrim.classList.toggle('open', open);
    });
  }
  if (scrim) scrim.addEventListener('click', closeNav);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeNav();
  });

  // ------------------------------------------------------------- 코드 복사
  document.querySelectorAll('.copy-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var block = btn.closest('.code-block');
      var code = block && block.querySelector('code');
      if (!code) return;
      var text = code.textContent;

      var done = function () {
        btn.textContent = '복사됨';
        btn.classList.add('copied');
        setTimeout(function () {
          btn.textContent = '복사';
          btn.classList.remove('copied');
        }, 1400);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else {
        fallback();
      }

      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { /* noop */ }
        document.body.removeChild(ta);
      }
    });
  });

  // ------------------------------------------------- 사이드바 완료 표시
  function paintSidebar() {
    document.querySelectorAll('.sidebar-nav a[data-slug]').forEach(function (a) {
      a.classList.toggle('done', !!progress[a.dataset.slug]);
    });
  }

  // ------------------------------------------------------ 레슨 완료 체크박스
  var article = document.querySelector('.lesson[data-slug]');
  var check = document.getElementById('doneCheck');

  if (article && check) {
    var slug = article.dataset.slug;
    check.checked = !!progress[slug];
    check.addEventListener('change', function () {
      if (check.checked) progress[slug] = Date.now();
      else delete progress[slug];
      save(progress);
      paintSidebar();
    });
  }

  // ------------------------------------------------------------- 홈 진행률
  var cards = document.querySelectorAll('.lesson-card[data-slug]');
  var fill = document.getElementById('progFill');
  var text = document.getElementById('progText');
  var reset = document.getElementById('resetProg');

  function paintHome() {
    if (!cards.length) return;
    var done = 0;
    cards.forEach(function (card) {
      var isDone = !!progress[card.dataset.slug];
      card.classList.toggle('done', isDone);
      if (isDone) done++;
    });
    var pct = Math.round((done / cards.length) * 100);
    if (fill) fill.style.width = pct + '%';
    if (text) text.textContent = done + ' / ' + cards.length + ' 레슨 완료 (' + pct + '%)';
  }

  if (reset) {
    reset.addEventListener('click', function () {
      if (!confirm('학습 진행률을 모두 지울까요?')) return;
      progress = {};
      save(progress);
      paintHome();
      paintSidebar();
    });
  }

  paintHome();
  paintSidebar();

  // -------------------------------------------------------- 목차 하이라이트
  var tocLinks = Array.prototype.slice.call(
    document.querySelectorAll('.lesson-toc a'));

  if (tocLinks.length && 'IntersectionObserver' in window) {
    var map = {};
    tocLinks.forEach(function (a) {
      var id = decodeURIComponent(a.getAttribute('href').slice(1));
      map[id] = a;
    });

    var visible = new Set();
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      });

      // 문서 순서상 가장 위에 있는 보이는 헤딩을 현재로 표시
      var current = null;
      Object.keys(map).forEach(function (id) {
        if (current === null && visible.has(id)) current = id;
      });
      tocLinks.forEach(function (a) { a.classList.remove('current'); });
      if (current && map[current]) map[current].classList.add('current');
    }, { rootMargin: '-8% 0px -70% 0px', threshold: 0 });

    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  }

  // ---------------------------------------------------- 키보드 단축키 (← →)
  document.addEventListener('keydown', function (e) {
    if (e.target.matches('input, textarea, select')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowLeft') {
      var prev = document.querySelector('a.pager-prev');
      if (prev) location.href = prev.getAttribute('href');
    } else if (e.key === 'ArrowRight') {
      var next = document.querySelector('a.pager-next');
      if (next) location.href = next.getAttribute('href');
    }
  });

  // 활성 사이드바 항목을 화면 안으로
  var active = document.querySelector('.sidebar-nav a.active');
  if (active && sidebar) {
    var top = active.offsetTop - sidebar.clientHeight / 2;
    if (top > 0) sidebar.scrollTop = top;
  }
})();

/* ---- studySTM32: lesson practice dock ----
 * 레슨 본문의 @sim 버튼(.sim-btn, data-sim-src)과 시뮬레이터 링크는 페이지를 떠나지 않고
 * 오른쪽 실습 패널(iframe, sim/index.html?ex=<id>&embed=1)에서 엽니다. 좁은 화면에서는 아래쪽 시트.
 * Ctrl/⌘/가운데 클릭과 "새 창" 링크(target=_blank)는 평소처럼 새 탭으로 엽니다.            */
(function () {
  'use strict';
  var article = document.querySelector('.lesson');
  if (!article) return;
  var W_KEY = 'studystm32.dock.width';

  function isSim(u) {
    return u.origin === location.origin && /\/sim\/(index\.html)?$/.test(u.pathname);
  }
  function embedUrl(u) {
    var e = new URL(u.href);
    e.searchParams.set('embed', '1');
    return e;
  }
  function plainUrl(u) {
    var p = new URL(u.href);
    p.searchParams.delete('embed');
    return p;
  }

  // ------------------------------------------------------------ dock DOM
  var dock = document.createElement('aside');
  dock.className = 'lab-dock';
  dock.setAttribute('aria-label', '실습 패널');
  dock.hidden = true;
  dock.innerHTML =
    '<div class="lab-dock-grip" title="끌어서 폭 조절" aria-hidden="true"></div>' +
    '<div class="lab-dock-head"><b class="lab-dock-title">시뮬레이터</b>' +
    '<span class="lab-dock-note">레슨을 보면서 여기서 바로 실행합니다</span>' +
    '<a class="lab-dock-btn" target="_blank" rel="noopener" title="새 창에서 크게 열기">새 창</a>' +
    '<button class="lab-dock-btn" type="button" data-act="close" title="패널 닫기">닫기</button></div>' +
    '<iframe class="lab-dock-frame" title="STM32 시뮬레이터" allow="fullscreen; clipboard-write; serial"></iframe>';
  document.body.appendChild(dock);
  var frame = dock.querySelector('iframe');
  var newTab = dock.querySelector('a.lab-dock-btn');
  var current = '';

  try {
    var w = parseFloat(localStorage.getItem(W_KEY));
    if (w >= 320) document.documentElement.style.setProperty('--dock-w', w + 'px');
  } catch (e) { /* private mode */ }

  function show(title) {
    dock.querySelector('.lab-dock-title').textContent = title;
    dock.hidden = false;
    document.body.classList.add('dock-open');
  }
  function close() {
    dock.hidden = true;
    document.body.classList.remove('dock-open');
    document.querySelectorAll('.sim-btn.is-open').forEach(function (b) { b.classList.remove('is-open'); });
  }
  dock.querySelector('[data-act="close"]').addEventListener('click', close);

  function openSim(u, btn) {
    var e = embedUrl(u);
    var key = e.pathname + e.search;
    newTab.href = plainUrl(u).href;
    if (key !== current || !frame.getAttribute('src')) {
      current = key;
      frame.src = e.href;
    }
    var id = e.searchParams.get('ex');
    show(id ? '시뮬레이터 · ' + id : '시뮬레이터');
    document.querySelectorAll('.sim-btn.is-open').forEach(function (b) { b.classList.remove('is-open'); });
    if (btn && btn.classList.contains('sim-btn')) btn.classList.add('is-open');
  }

  article.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    if (a.target === '_blank') return;
    var u = new URL(a.getAttribute('data-sim-src') || a.getAttribute('href'), location.href);
    if (!isSim(u)) return;
    e.preventDefault();
    openSim(u, a);
  });

  // 시뮬레이터(iframe)가 "레슨으로 돌아가기" 등을 요청하면 패널을 닫습니다.
  window.addEventListener('message', function (ev) {
    if (ev.source !== frame.contentWindow || !ev.data) return;
    if (ev.data.type === 'stm32sim-close') close();
  });

  // ------------------------------------------------------------ width drag (wide screens)
  var grip = dock.querySelector('.lab-dock-grip');
  grip.addEventListener('pointerdown', function (e) {
    grip.setPointerCapture(e.pointerId);
    document.body.classList.add('dock-drag');
    var move = function (ev) {
      var w = Math.max(320, Math.min(window.innerWidth - 360, window.innerWidth - ev.clientX));
      document.documentElement.style.setProperty('--dock-w', w + 'px');
    };
    var up = function () {
      document.body.classList.remove('dock-drag');
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      try { localStorage.setItem(W_KEY, parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dock-w'))); } catch (err) { /* noop */ }
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    e.preventDefault();
  });
})();
