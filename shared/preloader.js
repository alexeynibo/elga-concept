// Прелоадер и загрузка тяжёлых файлов — общий для светлого и тёмного концептов.
// Подключается обычным скриптом сразу после <body> (data-theme="light" | "dark"), чтобы экран загрузки был виден сразу.
//
// Как работает:
//  1. Экран загрузки ждёт только то, что нужно первому экрану (critical): шрифты, текстуры, первый кадр сцены.
//  2. Тяжёлые файлы (видео, картинки) грузятся в фоне по очереди — в порядке, в котором они нужны по сюжету (queue).
//  3. Если пользователь долистал до блока, а его файлы ещё не загрузились, прокрутка останавливается перед блоком
//     и поверх снова показывается экран загрузки с процентом этих файлов (gate) — блок появляется уже готовым.
//
// window.ElgaPreloader:
//   asset(key, url, size)  — зарегистрировать файл (size — примерный размер в байтах, если сервер его не сообщит)
//   queue([keys])          — грузить по очереди; каждый файл скачивается целиком и отдаётся адресом в памяти (blob:)
//   when(key) → Promise<url> — адрес готового файла (при ошибке или открытии с диска — исходный адрес)
//   critical(list)         — list: [{ promise, weight }]; когда всё готово — экран загрузки уходит
//   gate(sy, list)         — каждый кадр: list = [{ at, keys }]; держит прокрутку перед блоком, пока его файлы не готовы
window.ElgaPreloader = (() => {
  const theme = (document.currentScript && document.currentScript.dataset.theme) || 'light';
  const css = `
    .preloader { position: fixed; inset: 0; z-index: 100; display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: var(--pl-bg); color: var(--pl-ink); transition: opacity .6s ease, visibility .6s; }
    .preloader[data-theme="light"] { --pl-bg: #dde3e8; --pl-ink: #1d2a33; }
    .preloader[data-theme="dark"] { --pl-bg: #05070b; --pl-ink: #f4f6f8; }
    .preloader.is-gate { background: color-mix(in srgb, var(--pl-bg) 88%, transparent); }
    .preloader.is-hidden { opacity: 0; visibility: hidden; pointer-events: none; }
    .preloader__logo { width: 100px; height: 100px; overflow: visible; }
    /* круг логотипа поворачивается на 90° с лёгким перелётом (инерция), затем пауза; знак симметричен — круг бесшовный */
    .preloader__ring { transform-box: view-box; transform-origin: 54.98px 54.98px; animation: pl-turn 1.8s infinite; }
    @keyframes pl-turn {
      0% { transform: rotate(0deg); animation-timing-function: cubic-bezier(.55, 0, .35, 1); }
      42% { transform: rotate(95deg); animation-timing-function: cubic-bezier(.4, 0, .4, 1); }
      58% { transform: rotate(90deg); }
      100% { transform: rotate(90deg); }
    }
    /* точка в центре медленно пульсирует */
    .preloader__dot { transform-box: fill-box; transform-origin: center; animation: pl-pulse 2.6s ease-in-out infinite; }
    @keyframes pl-pulse { 0%, 100% { transform: scale(.82); opacity: .55; } 50% { transform: scale(1.18); opacity: 1; } }
    .preloader__txt { margin-top: 52px; font: 400 13px/1 'Golos Text', system-ui, sans-serif; letter-spacing: .06em;
      opacity: .6; font-variant-numeric: tabular-nums; }
    @media (prefers-reduced-motion: reduce) { .preloader__ring, .preloader__dot { animation: none; } }`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  const el = document.createElement('div');
  el.className = 'preloader'; el.dataset.theme = theme; el.setAttribute('role', 'status');
  el.innerHTML = `<svg class="preloader__logo" viewBox="0 0 109.96 109.96" fill="currentColor" aria-hidden="true">
      <path class="preloader__ring" d="m93.86 16.1c-10.38-10.38-24.19-16.1-38.88-16.1s-28.49 5.72-38.88 16.1c-10.38 10.39-16.1 24.2-16.1 38.88s5.72 28.49 16.1 38.88c10.39 10.39 24.19 16.1 38.88 16.1s28.49-5.72 38.88-16.1 16.1-24.19 16.1-38.88-5.72-28.49-16.1-38.88zm-75.33 68.19c0 1.2-1.52 1.72-2.26.77-6.68-8.56-10.31-19.04-10.31-30.08s3.62-21.51 10.31-30.08c.74-.95 2.26-.44 2.26.77zm66.53 9.4c-8.56 6.68-19.04 10.31-30.08 10.31s-21.51-3.62-30.08-10.31c-.95-.74-.44-2.26.77-2.26h58.62c1.2 0 1.72 1.52.77 2.26zm-60.62-8.16v-61.09h60.99v61.09zm59.85-67h-58.62c-1.2 0-1.72-1.52-.77-2.26 8.56-6.68 19.04-10.31 30.08-10.31s21.51 3.62 30.08 10.31c.95.74.44 2.26-.77 2.26zm9.4 66.52c-.74.95-2.26.44-2.26-.77v-58.61c0-1.2 1.52-1.72 2.26-.77 6.68 8.56 10.31 19.04 10.31 30.08s-3.62 21.51-10.31 30.08z"/>
      <path class="preloader__dot" d="m55.08 45.62c-5.33 0-9.65 4.32-9.65 9.65s4.32 9.65 9.65 9.65 9.65-4.32 9.65-9.65-4.32-9.65-9.65-9.65z"/>
    </svg>
    <div class="preloader__txt">Загрузка <span class="preloader__pct">0</span>&nbsp;%</div>`;
  document.body.appendChild(el);
  const pctEl = el.querySelector('.preloader__pct');
  document.documentElement.style.overflow = 'hidden';     // пока грузится первый экран — не листаем

  // ── файлы ──
  const FILE_MODE = location.protocol === 'file:';
  const assets = new Map();
  function asset(key, url, size = 1e6) {
    let resolve; const promise = new Promise(r => { resolve = r; });
    assets.set(key, { key, url, size, got: 0, done: false, out: null, promise, resolve });
  }
  const finish = (a, out) => { a.done = true; a.got = a.size; a.out = out; a.resolve(out); };
  async function fetchAsset(a) {
    if (a.done) return;
    if (FILE_MODE) { finish(a, a.url); return; }           // с диска fetch не работает — браузер грузит файл сам
    try {
      const res = await fetch(a.url);
      if (!res.ok || !res.body) throw new Error(res.status);
      const len = +res.headers.get('content-length');
      if (len > 0 && !res.headers.get('content-encoding')) a.size = len;
      const reader = res.body.getReader(), parts = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value); a.got = Math.min(a.size, a.got + value.length);
      }
      finish(a, URL.createObjectURL(new Blob(parts, { type: res.headers.get('content-type') || '' })));
    } catch (e) { finish(a, a.url); }                         // не вышло — отдаём исходный адрес, браузер догрузит сам
  }
  let queueRun = Promise.resolve();
  function queue(keys) {
    keys.forEach(k => { queueRun = queueRun.then(() => fetchAsset(assets.get(k))); });
  }
  const when = key => assets.get(key).promise;
  const bytes = keys => keys.reduce((s, k) => { const a = assets.get(k); return [s[0] + a.got, s[1] + a.size]; }, [0, 0]);

  // ── проценты: число на экране плавно догоняет настоящее и никогда не идёт назад ──
  let shown = 0, goal = 0, mode = 'critical', raf = 0;
  function tick() {
    shown += Math.max(.4, (goal - shown) * .12);
    if (shown > goal) shown = goal;
    pctEl.textContent = Math.floor(shown);
    raf = shown < goal ? requestAnimationFrame(tick) : 0;
  }
  function setGoal(v) { goal = Math.max(goal, Math.min(100, v)); if (!raf) raf = requestAnimationFrame(tick); }
  const show = () => el.classList.remove('is-hidden');
  const hide = () => el.classList.add('is-hidden');

  // экран загрузки первого экрана
  function critical(list) {
    const total = list.reduce((s, i) => s + i.weight, 0);
    let got = 0;
    list.forEach(i => i.promise.then(() => { got += i.weight; setGoal(got / total * 100); }, () => { got += i.weight; setGoal(got / total * 100); }));
    return Promise.allSettled(list.map(i => i.promise)).then(() => new Promise(r => {
      setGoal(100);
      const wait = () => { if (document.hidden) shown = 100; shown >= 100 ? r() : setTimeout(wait, 50); };   // в фоновой вкладке анимация чисел стоит
      wait();
    })).then(() => {
      mode = 'idle'; hide();
      el.classList.add('is-gate');
      document.documentElement.style.overflow = '';
    });
  }

  // остановка перед блоком, пока не готовы его файлы
  let gateKeys = null;
  function gate(sy, list) {
    if (mode === 'critical') return;
    const g = list.find(i => sy >= i.at && i.keys.some(k => !assets.get(k).done));
    if (g) {
      if (window.scrollY > g.at + 1) window.scrollTo(0, g.at);
      if (gateKeys !== g.keys) { gateKeys = g.keys; shown = 0; goal = 0; pctEl.textContent = '0'; }
      const [got, size] = bytes(g.keys);
      setGoal(got / size * 100);
      if (mode !== 'gate') { mode = 'gate'; show(); }
    } else if (mode === 'gate') { mode = 'idle'; gateKeys = null; hide(); }
  }
  return { asset, queue, when, critical, gate };
})();
