// ВРЕМЕННАЯ панель: шрифт выделенных частей заголовков — «открытым способом» («Добыча»),
// «Собственная» («Дорога»), «Собственный» («Порт»). Остальные части заголовков не меняются.
// Меняет CSS-переменные --accent-*; кнопка копирует значения. Когда не нужна — убрать подключение из dark/index.html.
(() => {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const num = v => parseFloat(v) || 0;
  const KEY = 'elga-accent-tweaks';
  const SLIDERS = [
    { v: '--accent-size', label: 'Размер', min: 14, max: 90, step: 1, unit: 'px', def: num(cs.getPropertyValue('--title-size')) || 50 },
    { v: '--accent-lh', label: 'Интерлиньяж', min: .8, max: 1.8, step: .01, unit: '', def: num(cs.getPropertyValue('--title-lh')) || 1.2 },
    { v: '--accent-ls', label: 'Трекинг', min: -.05, max: .3, step: .005, unit: 'em', def: num(cs.getPropertyValue('--title-ls')) || .045 },
  ];
  const FONTS = [['Activist', "'Activist', 'Golos Text', sans-serif"], ['Golos Text', "'Golos Text', sans-serif"]];
  const CASES = [['Как есть', 'none'], ['Заглавные', 'uppercase'], ['Строчные', 'lowercase']];
  let val = {};
  SLIDERS.forEach(p => { val[p.v] = p.def; });
  val['--accent-font'] = FONTS[0][1]; val['--accent-case'] = 'none';
  try { Object.assign(val, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  const unit = v => (SLIDERS.find(p => p.v === v) || {}).unit || '';
  const apply = () => {
    Object.keys(val).forEach(v => root.style.setProperty(v, val[v] + unit(v)));
    dispatchEvent(new Event('resize'));                                  // блоки пересчитывают места под новый размер текста
    try { localStorage.setItem(KEY, JSON.stringify(val)); } catch (e) {}
  };

  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:50;width:270px;padding:12px 14px;background:rgba(14,16,20,.92);' +
    'color:#e9edf2;font:12px/1.4 "Golos Text",system-ui,sans-serif;border:1px solid rgba(255,255,255,.12);border-radius:10px';
  const btn = 'background:rgba(255,255,255,.1);color:inherit;border:1px solid rgba(255,255,255,.18);border-radius:6px;padding:5px 8px;cursor:pointer;font:inherit';
  const sel = (key, list) => `<select data-sel="${key}" style="width:100%;margin-top:3px;font:inherit">${list.map(([t, v]) => `<option value="${v}" ${val[key] === v ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  const render = () => {
    panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <b style="font-weight:500">Выделенные строки</b><button data-act="reset" style="${btn}">Сброс</button></div>
      <div style="opacity:.6;margin-bottom:6px">«открытым способом», «Собственная», «Собственный»</div>
      <label style="display:block;margin:6px 0">Шрифт ${sel('--accent-font', FONTS)}</label>
      <label style="display:block;margin:6px 0">Регистр ${sel('--accent-case', CASES)}</label>` +
      SLIDERS.map(p => `<label style="display:block;margin:6px 0">${p.label}: <span data-out="${p.v}">${val[p.v]}${p.unit}</span>
        <input type="range" data-v="${p.v}" min="${p.min}" max="${p.max}" step="${p.step}" value="${val[p.v]}" style="width:100%"></label>`).join('') +
      `<button data-act="copy" style="${btn};width:100%;margin-top:8px">Скопировать настройки</button>
       <div data-msg style="margin-top:6px;opacity:.7;min-height:16px"></div>`;
  };
  render();
  document.body.appendChild(panel);

  panel.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.v) { val[t.dataset.v] = +t.value; panel.querySelector(`[data-out="${t.dataset.v}"]`).textContent = t.value + unit(t.dataset.v); }
    else if (t.dataset.sel) val[t.dataset.sel] = t.value;
    else return;
    apply();
  });
  panel.addEventListener('click', e => {
    const act = e.target.dataset.act;
    if (act === 'reset') {
      SLIDERS.forEach(p => { val[p.v] = p.def; });
      val['--accent-font'] = FONTS[0][1]; val['--accent-case'] = 'none';
      render(); apply();
    }
    if (act === 'copy') {
      const text = Object.keys(val).map(v => `${v}: ${val[v]}${unit(v)};`).join(' ');
      const msg = panel.querySelector('[data-msg]'), done = () => { msg.textContent = 'Скопировано'; };
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(done).catch(() => { msg.textContent = text; });
    }
  });
  apply();
})();
