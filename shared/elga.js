// Общие приёмы для обоих концептов.
// Обычный скрипт (не модуль) — чтобы работал и при открытии файла двойным щелчком.
// three.js страница передаёт сама: ElgaPoints.screen(THREE, {...}).

(function () {
  // ── Тексты из content/content.js ──
  // В разметке: <h1 data-c="hero.title"></h1> — сюда подставится ELGA_CONTENT.hero.title
  function bind(root) {
    const C = window.ELGA_CONTENT || {};
    (root || document).querySelectorAll('[data-c]').forEach(el => {
      const val = el.dataset.c.split('.').reduce((o, k) => (o == null ? o : o[k]), C);
      if (val == null) { console.warn('Нет текста в content.js:', el.dataset.c); return; }
      el.innerHTML = Array.isArray(val) ? val.map(v => `<span>${v}</span>`).join('') : val;
    });
  }
  const get = path => path.split('.').reduce((o, k) => (o == null ? o : o[k]), window.ELGA_CONTENT || {});

  // ── Иконки фактоидов: линейные, 24×24, цвет берут от текста ──
  const ICONS = {
    // рельсы со шпалами в перспективе
    rail: '<path d="M8.5 3 5 21M15.5 3 19 21M7.4 7.5h9.2M6.6 12h10.8M5.8 16.5h12.4"/>',
    // медаль с лентами
    medal: '<circle cx="12" cy="9" r="5.5"/><path d="m9.2 13.8-1.7 7.2 4.5-2.4 4.5 2.4-1.7-7.2"/><path d="m12 6.6.8 1.6 1.7.2-1.3 1.2.3 1.7-1.5-.8-1.5.8.3-1.7-1.3-1.2 1.7-.2z"/>',
    // карьер уступами
    pit: '<path d="M2 6h20M4 6l2.5 4h11L20 6M6.5 10 9 14h6l2.5-4M9 14l1.5 3.5h3L15 14"/>',
    // пласты
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/>',
    // фабрика: цех с шедовой крышей и труба
    factory: '<path d="M3 21V11l5 3v-3l5 3v-3l5 3V4h3v17z"/><path d="M3 21h18M7 17.5h2M11 17.5h2M15 17.5h2"/>',
    // порт: судно на волне
    port: '<path d="M4 14h16l-2.2 4.5H6.2z"/><path d="M8 14V9h6v5M10 9V6h2"/><path d="M3 21c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1"/>',
  };
  // В разметке: <div class="facts" data-facts="intro.facts"></div>
  // Сетка в две колонки: фактоиды стоят в шахматном порядке, между ними — пустые ячейки (воздух).
  // Ряд 1 — слева, ряд 2 — справа и т. д.; на 4 фактоида получается 8 ячеек
  // ── Иконка-табло: круг из тёмных точек, часть точек светится и рисует знак (как светодиодный светофор) ──
  // Знак берётся из линейной иконки выше: она рисуется на маленьком холсте и раскладывается по сетке точек
  const LED_N = 15;                       // точек по диаметру круга
  // Знаки, нарисованные вручную по точкам (# — горит). Сетка 11 точек в ширину, ставится по центру круга.
  // Для иконок, которых здесь нет, знак получается автоматически из линейной иконки
  const LED_GLYPHS = {
    pit: [                                // разрез в сечении: уступы вниз
      '###.....###',
      '..#.....#..',
      '..###.###..',
      '....#.#....',
      '....###....',
    ],
    factory: [                            // цех с трубой и пилообразной крышей
      '##.........',
      '##.........',
      '##..#...#..',
      '##..##..##.',
      '##..###.###',
      '###########',
      '#.........#',
      '#.##.##.###',
      '#.##.##.###',
      '###########',
    ],
    rail: [                               // рельсы со шпалами в перспективе
      '....#.#....',
      '...#####...',
      '...#...#...',
      '..#######..',
      '..#.....#..',
      '.#########.',
      '.#.......#.',
      '###########',
      '#.........#',
    ],
    port: [                               // якорь
      '....###....',
      '....#.#....',
      '....###....',
      '..#######..',
      '.....#.....',
      '.....#.....',
      '#....#....#',
      '##...#...##',
      '.##..#..##.',
      '..#######..',
      '....###....',
    ],
  };
  const ledCache = {};
  function ledIcon(name) {
    if (ledCache[name]) return ledCache[name];
    const glyph = LED_GLYPHS[name];
    if (glyph) {
      const top = Math.round((LED_N - glyph.length) / 2), left = Math.round((LED_N - glyph[0].length) / 2);
      return (ledCache[name] = ledSvg((i, j) => (glyph[j - top] || '')[i - left] === '#'));
    }
    const markup = ICONS[name] || '';
    // все фигуры иконки — в контуры для Path2D (круги переводим в дуги)
    const paths = [...markup.matchAll(/<path d="([^"]+)"/g)].map(m => m[1]);
    [...markup.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)].forEach(([, cx, cy, r]) => {
      cx = +cx; cy = +cy; r = +r;
      paths.push(`M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`);
    });
    const CELL = 8, S = LED_N * CELL;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const k = S * .66 / 24, off = (S - 24 * k) / 2;      // знак занимает центральные ~2/3 круга
    g.setTransform(k, 0, 0, k, off, off);
    g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#000';
    paths.forEach(d => g.stroke(new Path2D(d)));
    const px = g.getImageData(0, 0, S, S).data;
    const lit = (i, j) => {
      let sum = 0;
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) sum += px[((j * CELL + y) * S + i * CELL + x) * 4 + 3];
      return sum / (CELL * CELL * 255) > .22;
    };
    return (ledCache[name] = ledSvg(lit));
  }
  // Сам круг: lit(i, j) говорит, горит ли точка в столбце i, строке j
  function ledSvg(lit) {
    let dots = '';
    const R = LED_N / 2;
    for (let j = 0; j < LED_N; j++) for (let i = 0; i < LED_N; i++) {
      const cx = i + .5, cy = j + .5;
      if (Math.hypot(cx - R, cy - R) > R - .15) continue;  // только точки внутри круга
      dots += `<circle class="${lit(i, j) ? 'on' : 'off'}" cx="${cx}" cy="${cy}" r=".36"/>`;
    }
    return `<svg class="led" viewBox="0 0 ${LED_N} ${LED_N}" aria-hidden="true">${dots}</svg>`;
  }

  // ── Фактоиды со сборкой и табло (включается атрибутом data-led="scroll" на блоке фактоидов) ──
  // Ячейки сначала стоят шахматкой и касаются углами. Каждая доезжает со скроллом до своего места
  // в таблице 2×2 по центру экрана и останавливается; когда приехала последняя, таблица уезжает вверх целиком.
  // Табло: круг сначала пустой, пока ячейка едет на место, знак выезжает в круг снизу и к прибытию встаёт по центру.
  // Когда таблица собралась и уезжает, знак сменяется по кругу: уезжает вверх, снизу тут же въезжает такой же
  // (одна смена за полэкрана прокрутки).
  // Круг крупнее по точкам, поэтому знак в нём меньше и вокруг больше воздуха; край круга плавно гаснет.
  // Знак шагает рывками по нескольку рядов (как у настоящего табло) и догоняет прокрутку.
  // Табло рисуется на холсте и перерисовывается, только когда знак сдвинулся; пока блок за экраном — ничего не считается
  const LED_SCROLL_N = 19;
  const LED_STEP_MS = 80;          // темп табло: один шаг за столько миллисекунд
  const LED_STEP_ROWS = 2;         // на сколько рядов знак прыгает за шаг
  const LED_BLINK_MS = 350;        // ячейка встала на место — знак плавно моргает 2 раза за это время
  function ledScrollGlyph(name) {
    const N = LED_SCROLL_N;
    const glyph = LED_GLYPHS[name] || [];
    const h = glyph.length, w = (glyph[0] || '').length;
    const top = Math.round((N - h) / 2);
    return { glyph, top, left: Math.round((N - w) / 2),
      start: top - N,                             // знак целиком под кругом
      period: Math.max(N - top, top + h) };       // через столько рядов на месте знака встаёт следующий
  }
  // Заготовка одной точки: погашенная — кружок, горящая — кружок с мягким ореолом (рисуется один раз, без фильтров)
  function ledSprite(cell, color, glow) {
    const s = Math.ceil(cell * 3), c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d'), m = s / 2, r = cell * .36;
    if (glow) {
      const [cr, cg, cb] = (color.match(/[\d.]+/g) || [255, 255, 255]).map(Number);
      const halo = g.createRadialGradient(m, m, r * .6, m, m, cell * 1.3);
      halo.addColorStop(0, `rgba(${cr},${cg},${cb},.55)`); halo.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      g.fillStyle = halo; g.fillRect(0, 0, s, s);
    }
    g.fillStyle = color;
    g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.fill();
    return c;
  }
  function ledScrollRun(root) {
    (root || document).querySelectorAll('[data-led="scroll"]').forEach(box => {
      const cells = [...box.querySelectorAll('.fact')];
      const rows = Math.ceil(cells.length / 2);
      const tabs = [...box.querySelectorAll('canvas.led')].map(cv => ({
        cv, g: ledScrollGlyph(cv.dataset.icon), k: null, shown: null, y: 0,
        row: Math.floor(cells.indexOf(cv.closest('.fact')) / 2),
      }));
      if (!tabs.length) return;
      const N = LED_SCROLL_N, R = N / 2;
      let size = 0, cell = 0, spriteOn, spriteOff;
      const draw = (t, glow = 1) => {
        const g = t.cv.getContext('2d'), half = spriteOn.width / 2;
        const lit = (i, row) => (t.g.glyph[row] || '')[i - t.g.left] === '#';
        g.clearRect(0, 0, size, size);
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const d = Math.hypot(i + .5 - R, j + .5 - R);
          if (d > R + .2) continue;
          // крайние точки прозрачнее — круг получается плавным, без ступенек
          const e = Math.min(1, Math.max(0, (R + .2 - d) / 2.2)), edge = e * e * (3 - 2 * e);
          // k < 0 — знак ещё въезжает снизу; k > 0 — знаки сменяются по кругу: первый уезжает вверх, второй въезжает снизу
          const k = t.k < 0 ? t.k : t.k % t.g.period, row = j + k - t.g.top;
          const on = lit(i, row) || (t.k >= 0 && lit(i, row - t.g.period));
          g.globalAlpha = on ? edge * (.2 + .8 * glow) : edge * .2;    // glow < 1 — знак притух (моргание)
          g.drawImage(on ? spriteOn : spriteOff, (i + .5) * cell - half, (j + .5) * cell - half);
        }
      };
      // Рамки — один общий слой поверх ячеек (прозрачность у слоя целиком, поэтому в пересечениях линии не темнеют)
      // Крестики на углах — свой слой, ярче обводки; группа крестиков на каждую ячейку
      const marks = [...box.querySelectorAll('.facts__marks g')];
      const frames = [...box.querySelectorAll('.facts__frames rect')].map((r, n) => ({ r, m: marks[n], cell: box.querySelectorAll('.fact:not(.fact--empty)')[n] }));
      const CROSS = 6;                                                           // половина крестика, px (крестик 12 px)
      const placeMarks = f => f.m && f.m.setAttribute('transform', `translate(${f.x} ${f.y + (offs[f.row] || 0)})`);
      // rowY — верх ряда в блоке, rowH — высота ряда; ряд r встаёт в строку таблицы floor(r / 2)
      let rowY = [], rowH = 0, offs = [], offsKey = '', place = [], doneTop = 0;
      const layout = top => {
        const vh = innerHeight, tableTop = (vh - Math.ceil(rows / 2) * rowH) / 2;
        place = rowY.map((y, r) => tableTop + Math.floor(r / 2) * rowH);         // место ряда на экране
        doneTop = Math.min(...rowY.map((y, r) => place[r] - y));                 // при таком верхе блока собрались все
        // Отметки для страницы — при каком верхе блока: таблица собралась и трогается вверх,
        // ушла за верх экрана наполовину, ушла целиком
        const tableH = place[place.length - 1] + rowH - place[0];
        box.elgaDoneTop = doneTop;
        box.elgaHalfTop = doneTop - (place[0] + tableH / 2);
        box.elgaExitTop = doneTop - (place[0] + tableH);
        return top;
      };
      const assemble = top => {
        const away = Math.max(0, doneTop - top);                                 // собрались — уезжаем вместе
        offs = rowY.map((y, r) => Math.round(Math.max(top + y, place[r]) - away - (top + y)));
        const key = offs.join();
        if (key === offsKey) return offs;
        offsKey = key;
        cells.forEach((c, i) => { const o = offs[Math.floor(i / 2)]; c.style.transform = o ? `translateY(${o}px)` : ''; });
        frames.forEach(f => { f.r.setAttribute('y', f.y + offs[f.row]); placeMarks(f); });
        return offs;
      };
      // размеры, места и холсты — один раз и при изменении окна
      const measure = () => {
        cells.forEach(c => { c.style.transform = ''; }); offsKey = '';
        const dpr = Math.min(2, devicePixelRatio || 1);
        size = Math.round(tabs[0].cv.getBoundingClientRect().width * dpr); cell = size / N;
        const color = getComputedStyle(box).color;
        spriteOn = ledSprite(cell, color, true); spriteOff = ledSprite(cell, color, false);
        const b = box.getBoundingClientRect();
        rowY = cells.filter((c, i) => i % 2 === 0).map(c => c.getBoundingClientRect().top - b.top);
        rowH = cells[0].getBoundingClientRect().height;
        frames.forEach(f => {
          const r = f.cell.getBoundingClientRect();
          f.y = r.top - b.top; f.row = Math.floor(cells.indexOf(f.cell) / 2);
          f.x = r.left - b.left;
          f.r.setAttribute('x', f.x); f.r.setAttribute('width', r.width); f.r.setAttribute('height', r.height);
          if (f.m) f.m.innerHTML = [[0, 0], [r.width, 0], [0, r.height], [r.width, r.height]]
            .map(([x, y]) => `<path d="M${x - CROSS} ${y}H${x + CROSS}M${x} ${y - CROSS}V${y + CROSS}"/>`).join('');
        });
        tabs.forEach(t => {
          const r = t.cv.getBoundingClientRect();
          t.y = r.top - b.top + r.height / 2;
          t.cv.width = t.cv.height = size; t.shown = null;
        });
        assemble(layout(b.top));
      };
      let visible = false, raf = 0, lastStep = 0;
      const tick = now => {
        raf = 0;
        if (!visible) return;
        const top = box.getBoundingClientRect().top, vh = innerHeight;   // один замер на весь блок за кадр
        assemble(top);
        const step = now - lastStep >= LED_STEP_MS;
        if (step) lastStep = now;
        tabs.forEach(t => {
          // насколько ячейка проехала путь от низа экрана до своего места: 0 — круг пустой, 1 — знак по центру
          const nat = top + rowY[t.row];
          const p = Math.min(1, Math.max(0, (vh - nat) / Math.max(1, vh - place[t.row])));
          const away = Math.max(0, doneTop - top);                         // насколько таблица уехала после сборки
          const target = away ? Math.round(away / (vh / 2) * t.g.period) : Math.round(t.g.start * (1 - p));
          if (t.k === null) t.k = target;
          else if (step && t.k !== target) t.k += Math.sign(target - t.k) * Math.min(Math.abs(target - t.k), LED_STEP_ROWS);
          // ячейка встала на место — знак моргает; уехала назад вниз — моргнёт снова при следующей стыковке
          const docked = nat <= place[t.row] + .5;
          if (docked && !t.docked) t.blink = now;
          t.docked = docked;
          const b = t.blink == null ? 1 : (now - t.blink) / LED_BLINK_MS;
          if (b < 1) { t.shown = t.k; draw(t, .5 + .5 * Math.cos(b * Math.PI * 4)); }   // два плавных провала яркости
          else if (t.blink != null) { t.blink = null; t.shown = t.k; draw(t); }
          else if (t.k !== t.shown) { t.shown = t.k; draw(t); }
        });
        raf = requestAnimationFrame(tick);
      };
      measure();
      const wake = () => { if (visible && !raf) raf = requestAnimationFrame(tick); };
      // запас сверху и снизу — пока таблица стоит, сам блок уже уехал выше
      new IntersectionObserver(([en]) => { visible = en.isIntersecting; wake(); }, { rootMargin: '100% 0px' }).observe(box);
      addEventListener('resize', () => { measure(); wake(); });
    });
  }
  function bindFacts(root) {
    (root || document).querySelectorAll('[data-facts]').forEach(el => {
      const list = get(el.dataset.facts) || [];
      const scroll = el.dataset.led === 'scroll';
      const cells = [];
      list.forEach((f, i) => {
        const fact = `
          <div class="fact">
            ${scroll ? `<canvas class="led" data-icon="${f.icon}" aria-hidden="true"></canvas>` : ledIcon(f.icon)}
            <div class="fact__text">${f.text}</div>
          </div>`;
        const empty = '<div class="fact fact--empty" aria-hidden="true"></div>';
        cells.push(...(i % 2 === 0 ? [fact, empty] : [empty, fact]));
      });
      // рамки — общим слоем поверх всех ячеек; размеры и место им задаёт ledScrollRun
      const frames = scroll
        ? `<svg class="facts__frames" aria-hidden="true">${list.map(() => '<rect/>').join('')}</svg>` +
          `<svg class="facts__marks" aria-hidden="true">${list.map(() => '<g></g>').join('')}</svg>` : '';
      el.innerHTML = cells.join('') + frames;
    });
    ledScrollRun(root);
  }

  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // ── Экран «изображение из точек» ──
  // source: { type: 'image', src } — картинка с прозрачным фоном;
  //         { type: 'video', src, clip: [от, до], bg: 'light' | 'dark' } — видео крутится по кругу
  //         (без clip — целиком). bg: 'light' — фон ролика белый, светятся тёмные места;
  //         'dark' — фон чёрный, светятся светлые места (объект на тёмном фоне).
  // palette: 'light' — тёмные точки на белом; 'dark' — светлые светящиеся точки на тёмном.
  // layout: 'right' — на широком экране изображение справа (слева текст); 'center' — по центру.
  // Сначала точки рассыпаны облаком, при прокрутке секции слетаются в изображение.
  function screen(THREE, opts) {
    const { section, stage, caption = null, source, palette = 'dark', layout = 'center' } = opts;
    const isVideo = source.type === 'video';
    const fileMode = location.protocol === 'file:';

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    stage.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, .1, 50);
    camera.position.set(0, 0, 4.4);
    const group = new THREE.Group();
    scene.add(group);

    // Видео: по кругу заданный отрезок, играет только пока экран виден
    let video = null, vTex = null;
    if (isVideo) {
      video = document.createElement('video');
      video.muted = true; video.playsInline = true; video.preload = 'auto';
      video.src = source.src;
      if (source.clip) {
        const [from, to] = source.clip;
        video.addEventListener('loadedmetadata', () => { video.currentTime = from; });
        video.addEventListener('timeupdate', () => {
          if (video.currentTime >= to || video.currentTime < from - .5) video.currentTime = from;
        });
      } else {
        video.loop = true;
      }
      vTex = new THREE.VideoTexture(video);
      vTex.minFilter = vTex.magFilter = THREE.LinearFilter;
      vTex.generateMipmaps = false;
      // при открытии файла двойным щелчком браузер не даёт читать кадры видео — подсказываем, что делать
      if (fileMode) {
        const note = document.createElement('div');
        note.className = 'vid-note';
        note.innerHTML = 'Экран с&nbsp;видео из&nbsp;точек работает только через локальный сервер.<br>' +
          'Откройте концепт по&nbsp;адресу <b>http://localhost:8083</b>&nbsp;— при открытии файла двойным щелчком браузер не&nbsp;даёт читать кадры видео.';
        stage.appendChild(note);
      }
    }

    const lightPal = palette === 'light';
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uProg: { value: 0 }, uTime: { value: 0 }, uPixel: { value: 1 }, uReady: { value: isVideo ? 0 : 1 },
        tVideo: { value: vTex },
      },
      defines: isVideo ? (source.bg === 'dark' ? { VIDEO: '', DARK_BG: '' } : { VIDEO: '' }) : {},
      vertexShader: `
        attribute vec3 aStart;
        attribute float aRand, aBright;
        attribute vec2 aUv;
        uniform sampler2D tVideo;
        uniform float uProg, uTime, uPixel, uReady;
        varying float vAlpha;
        void main() {
          // каждая точка прилетает со своей задержкой — изображение собирается постепенно
          float t = clamp((uProg - aRand * .4) / .6, 0., 1.);
          t = t * t * (3. - 2. * t);
          vec3 p = mix(aStart, position, t);
          p += (1. - t) * .06 * vec3(sin(uTime * .5 + aRand * 40.), cos(uTime * .4 + aRand * 30.), sin(uTime * .3 + aRand * 20.));
          vec4 mv = modelViewMatrix * vec4(p, 1.);
          float twinkle = .82 + .18 * sin(uTime * 1.7 + aRand * 60.);
        #ifdef VIDEO
          vec3 c = texture2D(tVideo, aUv).rgb;
          float lum = dot(c, vec3(.299, .587, .114));
        #ifdef DARK_BG
          // фон ролика чёрный: точка горит там, где кадр светлее фона
          float b = pow(smoothstep(.03, .55, lum), .75) * uReady;
        #else
          // фон ролика белый: точка горит там, где кадр темнее или насыщеннее белого
          float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
          float b = pow(smoothstep(.025, .45, 1. - lum + sat * .35), .6) * uReady;
        #endif
          vAlpha = max(b * mix(.5, 1., t), (1. - t) * .3) * twinkle;
          gl_PointSize = mix(.8, 2.5, max(b, 1. - t)) * (.85 + .4 * fract(aRand * 7.)) * uPixel * .5 / -mv.z;
        #else
          float b = aBright;
          vAlpha = mix(.12, 1., b) * twinkle * mix(.55, 1., t);
          gl_PointSize = mix(1.3, 2.4, b) * (.85 + .4 * fract(aRand * 7.)) * uPixel * .5 / -mv.z;
        #endif
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - .5);
          gl_FragColor = vec4(${lightPal ? 'vec3(.11, .13, .15)' : 'vec3(.94, .95, .97)'}, smoothstep(.5, .15, d) * vAlpha);
        }`,
      transparent: true, depthWrite: false,
      blending: lightPal ? THREE.NormalBlending : THREE.AdditiveBlending,
    });

    // Рассыпанное облако: шире изображения и сплюснутое, как эллипс в референсе
    let seed = isVideo ? 23 : 11;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const scatter = arr => {
      const a = r() * Math.PI * 2, b = Math.acos(2 * r() - 1), d = 1.2 + Math.pow(r(), .7) * 2.2;
      arr.push(Math.sin(b) * Math.cos(a) * d * 1.35, Math.cos(b) * d * .75, Math.sin(b) * Math.sin(a) * d);
    };
    function build(pos, start, rand, bright, uvs) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('aStart', new THREE.Float32BufferAttribute(start, 3));
      geo.setAttribute('aRand', new THREE.Float32BufferAttribute(rand, 1));
      geo.setAttribute('aBright', new THREE.Float32BufferAttribute(bright, 1));
      geo.setAttribute('aUv', new THREE.Float32BufferAttribute(uvs, 2));
      const pts = new THREE.Points(geo, material);
      pts.frustumCulled = false;
      group.add(pts);
    }

    let size = { w: 3.4, h: 1.75 };          // размер изображения в сцене
    if (isVideo) {
      // неподвижная сетка 16:9, цвет каждой точки берётся из кадра
      const COLS = 300, ROWS = 169, VW = 3.4, VH = VW * 9 / 16;
      size = { w: VW, h: VH };
      const pos = [], start = [], rand = [], bright = [], uvs = [];
      for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
        const u = (i + .5 + (r() - .5) * .6) / COLS, v = (j + .5 + (r() - .5) * .6) / ROWS;   // разброс — без муара
        pos.push((u - .5) * VW, (v - .5) * VH, (r() - .5) * .04);
        uvs.push(u, v); scatter(start); rand.push(r()); bright.push(0);
      }
      build(pos, start, rand, bright, uvs);
    } else {
      // точки там, где у картинки есть изображение; яркость — светотень плюс подсветка контуров
      const img = new Image();
      img.onload = () => {
        const W = img.width, H = img.height;
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const g2 = c.getContext('2d');
        g2.drawImage(img, 0, 0);
        const data = g2.getImageData(0, 0, W, H).data;
        const alphaAt = (x, y) => data[(y * W + x) * 4 + 3] / 255;
        const lumAt = (x, y) => data[(y * W + x) * 4] / 255;
        const STEP = 4, SCALE = 1.75 / H;
        size = { w: W * SCALE, h: 1.75 };
        const pos = [], start = [], rand = [], bright = [], uvs = [];
        for (let y = STEP; y < H - STEP; y += STEP) for (let x = STEP; x < W - STEP; x += STEP) {
          const jx = Math.min(W - 2, Math.max(1, Math.round(x + (r() - .5) * STEP)));
          const jy = Math.min(H - 2, Math.max(1, Math.round(y + (r() - .5) * STEP)));
          if (alphaAt(jx, jy) < .5) continue;
          const l = lumAt(jx, jy);
          const edge = Math.min(1, (Math.abs(lumAt(jx + 1, jy) - lumAt(jx - 1, jy)) + Math.abs(lumAt(jx, jy + 1) - lumAt(jx, jy - 1))) * 3);
          const b = Math.min(1, Math.pow(l, 1.6) * .75 + edge * .6);
          if (b < .08 && r() > .35) continue;
          pos.push((jx - W / 2) * SCALE, -(jy - H / 2) * SCALE, (l - .5) * .12 + (r() - .5) * .04);
          scatter(start); rand.push(r()); bright.push(b); uvs.push(0, 0);
        }
        build(pos, start, rand, bright, uvs);
        resize();
      };
      img.src = source.src;
    }

    const isWide = () => camera.aspect > 1.2;
    function resize() {
      const w = stage.clientWidth, h = stage.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      material.uniforms.uPixel.value = renderer.getPixelRatio() * h / 100;
      const visW = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z * camera.aspect;
      const fit = Math.min(1, visW * .9 / size.w);
      if (layout === 'right' && isWide()) {
        group.position.set(.7, -.05, 0);
        group.scale.setScalar(Math.min(.95, fit));
      } else if (layout === 'right') {
        group.position.set(0, -.55, 0);        // узкий экран: текст сверху, изображение под ним
        group.scale.setScalar(fit);
      } else {
        group.position.set(0, 0, 0);
        group.scale.setScalar(fit);
      }
    }
    window.addEventListener('resize', resize);
    resize();

    let prog = 0;
    // Возвращает true, пока экран под шапкой (чтобы страница перекрасила шапку под фон экрана)
    function render(time, dt, mouse) {
      const vh = window.innerHeight;
      const top = section.getBoundingClientRect().top;
      const visible = top < vh && top + section.offsetHeight > 0;
      if (video) {
        if (visible && video.paused) video.play().catch(() => {});
        if (!visible && !video.paused) video.pause();
      }
      if (!visible) return false;
      const local = -top;
      const q = Math.min(1, Math.max(0, (local + vh * .6) / (section.offsetHeight - vh * .4)));
      prog += (Math.min(1, q / .7) - prog) * Math.min(1, dt * 4);
      material.uniforms.uProg.value = prog;
      material.uniforms.uTime.value = time;
      if (video) {
        const ready = !fileMode && video.readyState >= 2 ? 1 : 0;
        material.uniforms.uReady.value += (ready - material.uniforms.uReady.value) * Math.min(1, dt * 3);
      }
      // лёгкое покачивание от прокрутки и мыши — точки на разной глубине дают объём
      const amp = isVideo ? .6 : 1;
      group.rotation.set((mouse.y - .5) * .12 * amp, (Math.sin(time * .15) * .06 + (q - .5) * .3 + (mouse.x - .5) * .2) * amp, 0);
      renderer.render(scene, camera);
      // текст поднимается снизу вместе с прокруткой и останавливается
      if (caption) {
        const stopAt = layout === 'right' && !isWide() ? .16 : .38;
        caption.style.transform = `translateY(${Math.max(vh * stopAt, vh * 1.05 - local)}px)`;
      }
      return top < vh * .5 && top + section.offsetHeight > vh * .5;
    }

    return { render, resize };
  }

  window.Elga = { bind: root => { bind(root); bindFacts(root); }, get, sm };
  window.ElgaPoints = { screen };
})();
