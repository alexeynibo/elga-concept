// Сетка тёмного концепта — на всех экранах, кроме первого. 9 × 6 ячеек: 7 колонок от поля до поля (как контент)
// и по колонке слева и справа, которые уходят за край экрана; на всю высоту. Стиль — как у ячеек фактоидов:
// обводка 32 % и крестики 12 px на углах; общие линии соседних ячеек рисуются один раз.
// Видны только ячейки из раскладки PRESET. На каждом новом экране они появляются заново миганием — по очереди,
// по нескольку сразу, но не соседние; в момент смены экрана на мгновение вспыхивают выключенные ячейки.
// С ?grid в адресе — режим настройки: номера ячеек и панель (прозрачность и вкл/выкл для ячеек раскладки).
// Страница сообщает начала экранов: window.ElgaScreens = [px, px, …] в пикселях прокрутки,
// и какие ячейки раскладки на каком экране не показывать: window.ElgaScreenOff = [[номера], …];
// на каких экранах раскладку отразить по горизонтали (там текст справа): window.ElgaScreenMirror = [bool, …].
// Ячейка с кнопкой «наверх» не отражается — кнопка всегда в правом нижнем углу.
// Появившиеся ячейки «дышат» прозрачностью — каждая в своём ритме.
(() => {
  const IN_COLS = 7, ROWS = 6, EXTRA = 1, COLS = IN_COLS + EXTRA * 2;
  // закреплённая раскладка: номер ячейки → прозрачность (%)
  const PRESET = { 4: 55, 8: 60, 10: 62, 12: 75, 18: 100, 23: 45, 38: 50, 42: 68, 45: 100, 46: 67, 49: 62, 53: 100 };
  const IDS = Object.keys(PRESET).map(Number);
  const KEY = 'elga-grid-tool-v3';
  const EDIT = /[?&]grid\b/.test(location.search);
  let state = { collapsed: false, cells: {} };
  IDS.forEach(i => { state.cells[i] = { on: true, opacity: PRESET[i] }; });
  if (EDIT) try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); if (s.cells) IDS.forEach(i => { if (s.cells[i]) state.cells[i] = s.cells[i]; }); state.collapsed = !!s.collapsed; } catch (e) {}
  const save = () => { if (EDIT) try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };

  const rc = n => [Math.floor((n - 1) / COLS), (n - 1) % COLS];   // ряд, колонка
  const adjacent = (a, b) => { const [r1, c1] = rc(a), [r2, c2] = rc(b); return Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1; };

  // ── порядок появления: группы до трёх ячеек, внутри группы — ни одной соседней пары ──
  let seed = 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  function makeOrder() {
    const left = IDS.filter(i => state.cells[i].on).sort(() => rnd() - .5), groups = [];
    while (left.length) {
      const g = [left.shift()];
      for (let k = 0; k < left.length && g.length < 3;) { if (g.every(x => !adjacent(x, left[k]))) g.push(left.splice(k, 1)[0]); else k++; }
      groups.push(g);
    }
    const delay = {};
    groups.forEach((g, gi) => g.forEach(i => { delay[i] = gi * .14 + rnd() * .05; }));
    return delay;
  }
  // мигание: пара вспышек, затем ячейка встаёт на свою прозрачность
  const blink = t => t <= 0 ? 0 : t >= .42 ? 1 : [1, .15, .9, .3, 1][Math.min(4, Math.floor(t / .085))];

  // ── слой сетки ──
  const layer = document.createElement('div');
  layer.style.cssText = 'position:fixed;inset:0;z-index:6;pointer-events:none;color:var(--ink,#f4f6f8)';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible';
  layer.appendChild(svg);
  document.body.appendChild(layer);

  // ── кнопка «наверх» в центре нижней правой ячейки (53): табло из точек, как иконки фактоидов —
  // тот же шаг и размер точек, но круг меньше (11 точек по диаметру вместо 19); стрелка из горящих точек,
  // при наведении бежит вверх по рядам; появляется и мигает вместе со своей ячейкой ──
  const BTN_CELL = 53, BTN_N = 11, PITCH = 84 / 19;
  const btn = document.createElement('canvas');
  const btnPx = Math.round(BTN_N * PITCH);
  btn.style.cssText = `position:absolute;width:${btnPx}px;height:${btnPx}px;cursor:pointer;pointer-events:none;opacity:0;color:var(--ink,#f4f6f8)`;
  btn.setAttribute('role', 'button'); btn.setAttribute('aria-label', 'Наверх');
  layer.appendChild(btn);
  const dpr = Math.min(2, devicePixelRatio || 1);
  btn.width = btn.height = Math.round(btnPx * dpr);
  // точки — квадратной сеткой, как у иконок фактоидов; круглым круг делает прозрачность:
  // каждая точка у края светится настолько, насколько попадает в идеальный круг (сглаженный край без ступенек)
  const ARROW = ['..#..', '.###.', '#.#.#', '..#..', '..#..'];          // маленькая стрелка вверх 5 × 5
  let btnShift = 0, hover = false, lastStep = 0;
  function drawBtn() {
    const g = btn.getContext('2d'), S = btn.width, cell = S / BTN_N, R = BTN_N / 2, RC = R - .45, r = cell * .36;
    const h = ARROW.length, top = Math.round((BTN_N - h) / 2), left = Math.round((BTN_N - ARROW[0].length) / 2);
    const period = BTN_N - top;                                          // через столько рядов стрелка повторяется
    g.clearRect(0, 0, S, S);
    for (let j = 0; j < BTN_N; j++) for (let i = 0; i < BTN_N; i++) {
      const d = Math.hypot(i + .5 - R, j + .5 - R);
      const cover = Math.min(1, Math.max(0, (RC + .5 - d) / 1.1));   // доля точки внутри круга
      if (cover <= 0) continue;
      const edge = cover * cover * (3 - 2 * cover);
      const row = j + btnShift - top, lit = k => (ARROW[k] || '')[i - left] === '#';
      const k = ((row % period) + period) % period;
      const on = lit(k) || (btnShift > 0 && lit(k - period));
      const x = (i + .5) * cell, y = (j + .5) * cell;
      if (on) {
        const halo = g.createRadialGradient(x, y, r * .6, x, y, cell * 1.3);
        halo.addColorStop(0, `rgba(244,246,248,${.55 * edge})`); halo.addColorStop(1, 'rgba(244,246,248,0)');
        g.fillStyle = halo; g.fillRect(x - cell * 1.5, y - cell * 1.5, cell * 3, cell * 3);
      }
      g.fillStyle = `rgba(244,246,248,${on ? edge : edge * .2})`;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  }
  btn.addEventListener('mouseenter', () => { hover = true; });
  btn.addEventListener('mouseleave', () => { hover = false; btnShift = 0; drawBtn(); });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  drawBtn();

  let geo = null;
  function measure() {
    const W = innerWidth, H = innerHeight;
    const side = Math.max(120, (W - 1680) / 2);                      // как --side в стилях: шире 1920 контент 1680 px по центру
    const x0 = W <= 760 ? 16 : side, cw = (W - 2 * x0) / IN_COLS;
    geo = { xs: x0 - EXTRA * cw, cw, ch: H / ROWS };
    const [br, bc] = rc(BTN_CELL);
    // кнопка — в центре видимой части прямоугольника справа от ячейки 53 (между её правым краем и краем экрана);
    // если он уже кнопки с запасом (узкое окно, на телефоне поле 16 px) — в центре ячейки 53
    const rightW = W - (geo.xs + (bc + 1) * cw);
    const bx = rightW >= btnPx + 26 ? W - rightW / 2 : geo.xs + (bc + .5) * cw;
    btn.style.left = `${bx - btnPx / 2}px`;
    btn.style.top = `${(br + .5) * geo.ch - btnPx / 2}px`;
  }

  // a(n) — видимость ячейки 0…1 в этом кадре
  function draw(a) {
    const { xs, cw, ch } = geo;
    const op = (c, r) => (c < 0 || r < 0 || c >= COLS || r >= ROWS) ? 0 : a(r * COLS + c + 1);
    let out = '';
    for (let r = 0; r <= ROWS; r++) for (let c = 0; c < COLS; c++) {
      const v = Math.max(op(c, r - 1), op(c, r));
      if (v > .01) out += `<line x1="${xs + c * cw}" y1="${r * ch}" x2="${xs + (c + 1) * cw}" y2="${r * ch}" stroke="currentColor" stroke-opacity="${(.32 * v).toFixed(3)}"/>`;
    }
    for (let c = 0; c <= COLS; c++) for (let r = 0; r < ROWS; r++) {
      const v = Math.max(op(c - 1, r), op(c, r));
      if (v > .01) out += `<line x1="${xs + c * cw}" y1="${r * ch}" x2="${xs + c * cw}" y2="${(r + 1) * ch}" stroke="currentColor" stroke-opacity="${(.32 * v).toFixed(3)}"/>`;
    }
    for (let r = 0; r <= ROWS; r++) for (let c = 0; c <= COLS; c++) {
      const v = Math.max(op(c - 1, r - 1), op(c, r - 1), op(c - 1, r), op(c, r));
      if (v > .01) { const x = xs + c * cw, y = r * ch; out += `<path d="M${x - 6} ${y}H${x + 6}M${x} ${y - 6}V${y + 6}" stroke="currentColor" stroke-opacity="${(.55 * v).toFixed(3)}" fill="none"/>`; }
    }
    if (EDIT) for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const n = r * COLS + c + 1;
      if (state.cells[n]) out += `<text x="${Math.max(12, xs + c * cw + 12)}" y="${r * ch + 24}" fill="currentColor" fill-opacity="${(.6 * Math.max(.4, op(c, r))).toFixed(3)}" font-size="11" letter-spacing="2" font-family="Golos Text, sans-serif">${String(n).padStart(2, '0')}</text>`;
    }
    svg.innerHTML = out;
  }

  // ── смена экранов: заново мигаем; в момент смены — короткий «сбой» из выключенных ячеек ──
  let screen = -1, since = 0, delay = {}, glitch = [], btnSince = null;
  function onScreen(i, now) {
    screen = i; since = now; delay = makeOrder();
    const off = []; for (let n = 1; n <= COLS * ROWS; n++) if (!state.cells[n]) off.push(n);
    glitch = off.sort(() => rnd() - .5).slice(0, 7).map(n => ({ n, at: rnd() * .35, len: .06 + rnd() * .08, v: .25 + rnd() * .35 }));
  }
  let last = '';
  function tick(ms) {
    const now = ms / 1000, y = scrollY, starts = window.ElgaScreens || [];
    let i = -1; starts.forEach((s, k) => { if (y >= s) i = k; });
    if (i !== screen) onScreen(i, now);
    const t = now - since;
    const mirror = !!(window.ElgaScreenMirror || [])[screen];
    const a = m => {
      if (screen < 0) return 0;
      // на зеркальных экранах ячейка m показывает ячейку раскладки с другой стороны; ячейка кнопки — на своём месте
      let n = m;
      if (mirror && m !== BTN_CELL) { const [r, c] = rc(m); n = r * COLS + (COLS - 1 - c) + 1; if (n === BTN_CELL) return 0; }
      const c = state.cells[n];
      if (c) {
        const off = (window.ElgaScreenOff || [])[screen];
        if (!c.on || (off && off.includes(n))) return 0;
        // дыхание: у каждой ячейки свой темп и фаза — от 60 до 100 % её прозрачности
        const breathe = .8 + .2 * Math.sin(now * (.55 + (n * 37 % 23) / 40) + n * 2.3);
        return blink(t - .25 - (delay[n] || 0)) * c.opacity / 100 * breathe;
      }
      const g = glitch.find(q => q.n === n);
      return g && t >= g.at && t < g.at + g.len ? g.v : 0;
    };
    // перерисовываем только когда что-то заметно меняется
    let key = screen + ':';
    for (let n = 1; n <= COLS * ROWS; n++) key += a(n).toFixed(2) + ',';
    if (key !== last) { last = key; draw(a); }
    // кнопка — вместе со своей ячейкой
    // кнопка: со второго экрана (window.ElgaBtnFrom) — один раз мигает при появлении и дальше стоит постоянно,
    // переходы между экранами её не трогают; выше второго экрана — скрыта
    const btnOn = y >= (window.ElgaBtnFrom ?? Infinity);
    if (btnOn && btnSince === null) btnSince = now;
    if (!btnOn) btnSince = null;
    const vis = btnSince === null ? 0 : blink(now - btnSince);
    btn.style.opacity = vis.toFixed(2);
    btn.style.pointerEvents = vis > .5 ? 'auto' : 'none';
    if (hover && ms - lastStep > 90) { lastStep = ms; btnShift++; drawBtn(); }   // при наведении стрелка бежит вверх
    requestAnimationFrame(tick);
  }

  // ── панель (только в режиме настройки) ──
  if (EDIT) {
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:50;width:280px;max-height:70vh;overflow:auto;padding:12px 14px;' +
      'background:rgba(14,16,20,.92);color:#e9edf2;font:12px/1.4 "Golos Text",system-ui,sans-serif;border:1px solid rgba(255,255,255,.12);border-radius:10px';
    document.body.appendChild(panel);
    const btn = 'background:rgba(255,255,255,.1);color:inherit;border:1px solid rgba(255,255,255,.18);border-radius:6px;padding:4px 8px;cursor:pointer;font:inherit';
    const renderPanel = () => {
      if (state.collapsed) { panel.style.width = 'auto'; panel.innerHTML = `<button data-act="expand" style="${btn}">Сетка ▸</button>`; return; }
      panel.style.width = '280px';
      const rows = IDS.map(i => { const c = state.cells[i]; return `<div style="display:flex;align-items:center;gap:8px;margin:3px 0">
        <label style="display:flex;align-items:center;gap:6px;width:62px;cursor:pointer"><input type="checkbox" data-on="${i}" ${c.on ? 'checked' : ''}>${String(i).padStart(2, '0')}</label>
        <input type="range" min="0" max="100" value="${c.opacity}" data-op="${i}" style="flex:1">
        <span style="width:30px;text-align:right;opacity:.7" data-opv="${i}">${c.opacity}</span></div>`; }).join('');
      panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <b style="font-weight:500">Сетка</b><button data-act="collapse" style="${btn}">Свернуть</button></div>
        <div style="display:flex;gap:6px;margin-bottom:8px"><button data-act="replay" style="${btn}">Повторить мигание</button></div>
        ${rows}
        <button data-act="copy" style="${btn};width:100%;margin-top:10px;padding:7px">Скопировать настройки</button>
        <div data-msg style="margin-top:6px;opacity:.7;min-height:16px"></div>`;
    };
    panel.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.op) { state.cells[+t.dataset.op].opacity = +t.value; panel.querySelector(`[data-opv="${t.dataset.op}"]`).textContent = t.value; }
      else if (t.dataset.on) state.cells[+t.dataset.on].on = t.checked;
      save();
    });
    panel.addEventListener('click', e => {
      const act = e.target.dataset.act;
      if (act === 'collapse' || act === 'expand') { state.collapsed = act === 'collapse'; renderPanel(); save(); }
      if (act === 'replay') screen = -2;                               // на следующем кадре мигание начнётся заново
      if (act === 'copy') {
        const text = JSON.stringify({ cols: COLS, rows: ROWS, cells: IDS.map(i => ({ n: i, on: state.cells[i].on, opacity: state.cells[i].opacity })) });
        const msg = panel.querySelector('[data-msg]'), done = () => { msg.textContent = 'Скопировано'; };
        (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(done).catch(() => {
          const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
          try { document.execCommand('copy'); done(); } catch (err) { msg.textContent = text; }
          ta.remove();
        });
      }
    });
    renderPanel();
  }

  addEventListener('resize', () => { measure(); last = ''; });
  measure();
  requestAnimationFrame(tick);
})();
