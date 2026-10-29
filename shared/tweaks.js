// Панель настройки шрифтов в макете: заголовок, описание, крупный текст, подписи, цифры и поля страницы.
// Рабочий инструмент для концепта, не часть дизайна. Значения пишутся в CSS-переменные
// (--title-size, --sub-size и др. в shared/base.css) и запоминаются в браузере — общие для обоих концептов.
// Чтобы закрепить итог — «Скопировать CSS» и прислать: значения переносятся в :root в shared/base.css.
// Убрать панель перед показом клиенту — удалить подключение tweaks.js в концепте.

(function () {
  const KEY = 'elga-type-tweaks';
  const root = document.documentElement;

  // как прочитать текущее значение с образца на странице
  const px = (cs) => Math.round(parseFloat(cs.fontSize));
  const lh = (cs) => cs.lineHeight === 'normal' ? 1.2 : +(parseFloat(cs.lineHeight) / parseFloat(cs.fontSize)).toFixed(2);
  const ls = (cs) => cs.letterSpacing === 'normal' ? 0 : +(parseFloat(cs.letterSpacing) / parseFloat(cs.fontSize)).toFixed(3);
  const wt = (cs) => Math.round(parseFloat(cs.fontWeight));

  const size = (v, min, max) => ({ label: 'Размер', min, max, step: 1, unit: 'px', read: px, css: x => x + 'px', v });
  const lineH = (v) => ({ label: 'Интерлиньяж', min: .7, max: 2, step: .01, unit: '', read: lh, css: x => String(x), v });
  const track = (v, max = .4) => ({ label: 'Между букв', min: -.08, max, step: .005, unit: 'em', read: ls, css: x => x + 'em', v });
  const weight = (v) => ({ label: 'Насыщенность', min: 400, max: 900, step: 10, unit: '', read: wt, css: x => String(x), v });

  const GROUPS = [
    { title: 'Заголовок', sample: '.caption__title', fields: [size('--title-size', 24, 160), lineH('--title-lh'), track('--title-ls')] },
    { title: 'Описание', sample: '.caption__sub', fields: [size('--sub-size', 12, 32), lineH('--sub-lh'), track('--sub-ls', .2), weight('--sub-w')] },
    { title: 'Крупный текст', sample: '.caption__lead', fields: [size('--lead-size', 16, 80), lineH('--lead-lh'), track('--lead-ls', .2), weight('--lead-w')] },
    { title: 'Подписи глав', sample: '.caption__label', fields: [size('--label-size', 9, 24), track('--label-ls', .6), weight('--label-w')] },
    { title: 'Большие цифры', sample: '.caption__num', fields: [size('--num-size', 40, 220), track('--num-ls', .2), weight('--num-w')] },
    { title: 'Поля страницы', sample: null, fields: [{ label: 'Слева и справа', min: 16, max: 320, step: 1, unit: 'px',
      read: () => Math.round(parseFloat(getComputedStyle(root).getPropertyValue('--side')) || 120), css: x => x + 'px', v: '--side' }] },
  ];
  const ALL = GROUPS.flatMap(g => g.fields.map(f => ({ ...f, sample: g.sample })));

  function current() {
    const out = {};
    ALL.forEach(f => {
      const el = f.sample ? document.querySelector(f.sample) : root;
      out[f.v] = el ? f.read(getComputedStyle(el)) : f.min;
    });
    return out;
  }

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
  function save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* в приватном режиме просто не запомнится */ } }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  function apply(v, keys) { (keys || Object.keys(v)).forEach(k => { const f = ALL.find(a => a.v === k); if (f) root.style.setProperty(k, f.css(v[k])); }); }

  function build() {
    const saved = load();
    // применяем только то, что реально двигали, — остальное остаётся как в стилях
    let touched = saved ? Object.keys(saved) : [];
    if (saved) apply(saved);
    let vals = { ...current(), ...(saved || {}) };

    const style = document.createElement('style');
    style.textContent = `
      .tw { position: fixed; right: 16px; bottom: 16px; z-index: 1000; width: 280px; max-height: calc(100vh - 32px); overflow: auto;
        font: 12px/1.3 'Golos Text', system-ui, sans-serif; color: #e9edf1;
        background: rgba(16, 19, 23, .9); backdrop-filter: blur(8px); border-radius: 12px; padding: 12px 14px; }
      .tw.min { width: auto; padding: 8px 12px; overflow: visible; }
      .tw.min .tw__body, .tw.min .tw__title { display: none; }
      .tw__head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
      .tw__title { font-weight: 600; letter-spacing: .08em; text-transform: uppercase; font-size: 11px; }
      .tw button { font: inherit; color: inherit; background: rgba(255, 255, 255, .1); border: 0; border-radius: 6px; padding: 4px 8px; cursor: pointer; }
      .tw button:hover { background: rgba(255, 255, 255, .18); }
      .tw details { margin-top: 12px; }
      .tw summary { cursor: pointer; font-weight: 600; list-style: none; }
      .tw summary::before { content: '▸ '; opacity: .6; }
      .tw details[open] summary::before { content: '▾ '; }
      .tw__row { margin-top: 10px; }
      .tw__lbl { display: flex; justify-content: space-between; margin-bottom: 3px; opacity: .85; }
      .tw__val { font-variant-numeric: tabular-nums; }
      .tw input[type=range] { width: 100%; accent-color: #9fb8e8; }
      .tw__btns { display: flex; gap: 8px; margin-top: 14px; }
      .tw__btns button { flex: 1; }
    `;
    document.head.appendChild(style);

    const box = document.createElement('div');
    box.className = 'tw';
    box.innerHTML = `
      <div class="tw__head"><span class="tw__title">Шрифты</span><button data-act="min">Свернуть</button></div>
      <div class="tw__body">
        ${GROUPS.map((g, gi) => `
          <details ${gi === 0 ? 'open' : ''}>
            <summary>${g.title}</summary>
            ${g.fields.map(f => `
              <div class="tw__row">
                <div class="tw__lbl"><span>${f.label}</span><span class="tw__val" data-val="${f.v}"></span></div>
                <input type="range" data-key="${f.v}" min="${f.min}" max="${f.max}" step="${f.step}">
              </div>`).join('')}
          </details>`).join('')}
        <div class="tw__btns"><button data-act="reset">Сбросить</button><button data-act="copy">Скопировать CSS</button></div>
      </div>`;
    document.body.appendChild(box);

    const show = () => ALL.forEach(f => {
      box.querySelector(`[data-key="${f.v}"]`).value = vals[f.v];
      box.querySelector(`[data-val="${f.v}"]`).textContent = vals[f.v] + f.unit;
    });
    show();

    box.addEventListener('input', e => {
      const key = e.target.dataset.key;
      if (!key) return;
      vals = { ...vals, [key]: +e.target.value };
      if (!touched.includes(key)) touched.push(key);
      const changed = Object.fromEntries(touched.map(k => [k, vals[k]]));
      apply(changed, [key]); save(changed); show();
    });
    box.addEventListener('click', e => {
      const act = e.target.dataset.act;
      if (act === 'min') {
        box.classList.toggle('min');
        e.target.textContent = box.classList.contains('min') ? 'Шрифты' : 'Свернуть';
      }
      if (act === 'reset') {
        clear();
        ALL.forEach(f => root.style.removeProperty(f.v));
        touched = [];
        vals = current(); show();
      }
      if (act === 'copy') {
        // все значения, включая нетронутые, — чтобы закрепить макет целиком
        const text = ALL.map(f => `  ${f.v}: ${f.css(vals[f.v])};`).join('\n');
        const done = () => { e.target.textContent = 'Скопировано'; setTimeout(() => { e.target.textContent = 'Скопировать CSS'; }, 1400); };
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => prompt('Скопируйте значения:', text));
        else prompt('Скопируйте значения:', text);
      }
    });
  }

  // ждём, пока подставятся тексты и загрузятся шрифты, — иначе стартовые значения будут неточными
  const start = () => (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => setTimeout(build, 300));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
