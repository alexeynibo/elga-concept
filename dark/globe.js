// Земной шар после порта (тёмный концепт): чёрный глянцевый шар с сеткой, континенты серые, Якутия залита точками,
// из порта «Эльга» по очереди вылетают едва заметные дуги к странам-покупателям; страна обводится точечным пунктиром,
// когда дуга до неё дошла. Границы стран — открытый набор world-atlas (Natural Earth, 1:110 млн) с jsDelivr,
// контур Якутии — свой, приблизительный (в наборе только страны).
// Обычный скрипт (не модуль): window.ElgaGlobe.create(THREE, renderer, noiseTex) →
//   { render(fade, p, time, mx, my, arcs, overlay), renderVeil(density, rise, time), resize(w, h), BUYERS }
window.ElgaGlobe = (() => {
  const WORLD_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';
  // Порт «Эльга» — мыс Манорский, Удская губа
  const PORT = [54.8, 136.0];
  // Эльгинское месторождение (юго-восток Якутии) и упрощённая трасса своей железной дороги к порту (~500 км)
  const MINE = [56.4, 129.9];
  const RAIL = [MINE, [56.15, 130.9], [55.85, 131.9], [55.5, 133.1], [55.2, 134.3], [54.95, 135.3], PORT];
  // Покупатели — страны АТР (по фактоиду «Поставки в страны АТР»); точка, куда приходит дуга
  const BUYERS = [
    { id: '156', name: 'Китай', at: [31.5, 121.0] },
    { id: '392', name: 'Япония', at: [35.0, 137.0] },
    { id: '410', name: 'Южная Корея', at: [36.5, 127.8] },
    { id: '158', name: 'Тайвань', at: [23.8, 121.0] },
    { id: '704', name: 'Вьетнам', at: [16.0, 107.5] },
    { id: '356', name: 'Индия', at: [21.0, 79.0] },
  ];
  // Якутия (Республика Саха) — приблизительный контур [долгота, широта]
  const YAKUTIA = [
    [106.0, 60.5], [108.5, 58.8], [112.5, 57.6], [116.0, 57.0], [119.5, 56.4], [124.0, 55.8], [128.0, 55.9],
    [132.0, 56.6], [135.0, 57.6], [138.2, 58.7], [140.5, 60.1], [142.3, 61.6], [146.5, 62.6], [150.0, 64.4],
    [153.5, 65.6], [157.0, 66.8], [160.5, 68.4], [161.6, 69.5], [158.0, 70.8], [153.0, 71.0], [150.0, 71.6],
    [146.0, 72.4], [141.0, 72.7], [137.5, 71.5], [133.0, 71.4], [129.5, 71.8], [128.0, 73.0], [124.0, 73.4],
    [119.0, 73.1], [114.0, 73.6], [110.8, 73.6], [110.0, 72.4], [109.5, 71.2], [107.0, 69.8], [106.2, 68.0],
    [106.5, 66.2], [105.0, 64.2], [106.0, 62.4],
  ];

  // широта/долгота → точка на шаре радиуса r (y — к северному полюсу)
  const ll = (THREE, lat, lon, r = 1) => {
    const a = THREE.MathUtils.degToRad(lat), b = THREE.MathUtils.degToRad(lon);
    return new THREE.Vector3(Math.cos(a) * Math.cos(b) * r, Math.sin(a) * r, -Math.cos(a) * Math.sin(b) * r);
  };

  // минимальный разбор TopoJSON: дуги с квантованием → кольца [долгота, широта]
  function topoRings(topo, geom) {
    const { scale, translate } = topo.transform;
    const arcs = topo.arcs.map(arc => { let x = 0, y = 0; return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; }); });
    const ring = idx => { const out = []; idx.forEach(i => { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; out.push(...(out.length ? a.slice(1) : a)); }); return out; };
    const polys = geom.type === 'Polygon' ? [geom.arcs] : geom.type === 'MultiPolygon' ? geom.arcs : [];
    return polys.map(p => p.map(ring));
  }

  function create(THREE, renderer, noiseTex) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, .01, 200);
    const root = new THREE.Group(); scene.add(root);

    // ── карта на холсте (равнопромежуточная проекция): R — суша, G — границы и сетка, B — точки Якутии;
    // две отдельные текстуры — точечные обводки покупателей, по стране на канал (чтобы проявлять по одной) ──
    const W = 4096, H = 2048;
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    const mapC = mk(), outA = mk(), outB = mk();
    const px = (lon, lat) => [(lon + 180) / 360 * W, (90 - lat) / 180 * H];
    // кольцо без скачка через линию перемены дат; рисуем с копиями −360/+360, чтобы края карты были целыми
    function ringPath(g, ring) {
      let prev = null, off = 0;
      const pts = ring.map(([lon, lat]) => { if (prev !== null) { if (lon - prev > 180) off -= 360; else if (prev - lon > 180) off += 360; } prev = lon; return [lon + off, lat]; });
      const lons = pts.map(p => p[0]), span = Math.max(...lons) - Math.min(...lons);
      if (span > 350) { const a = pts[pts.length - 1], b = pts[0]; pts.push([a[0], -90], [b[0], -90]); }   // Антарктида — замыкаем через полюс
      for (const sh of [-360, 0, 360]) pts.forEach(([lon, lat], i) => { const [x, y] = px(lon + sh, lat); i ? g.lineTo(x, y) : (g.moveTo(x, y)); });
    }
    const mapTex = new THREE.CanvasTexture(mapC), outTexA = new THREE.CanvasTexture(outA), outTexB = new THREE.CanvasTexture(outB);
    [mapTex, outTexA, outTexB].forEach(t => { t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.colorSpace = THREE.NoColorSpace; });

    function drawMap(topo) {
      const g = mapC.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      const countries = topo.objects.countries.geometries;
      // суша
      g.fillStyle = 'rgb(255,0,0)';
      countries.forEach(c => topoRings(topo, c).forEach(poly => { g.beginPath(); poly.forEach(r => ringPath(g, r)); g.fill('evenodd'); }));
      // сетка каждые 15°
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = 'rgb(0,90,0)'; g.lineWidth = 1.4;
      for (let lon = -180; lon <= 180; lon += 15) { g.beginPath(); const [x] = px(lon, 0); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for (let lat = -75; lat <= 75; lat += 15) { g.beginPath(); const [, y] = px(0, lat); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      // границы стран
      g.strokeStyle = 'rgb(0,200,0)'; g.lineWidth = 1.6;
      countries.forEach(c => topoRings(topo, c).forEach(poly => poly.forEach(r => { g.beginPath(); ringPath(g, r); g.stroke(); })));
      // Якутия — сплошная заливка в канале B; сами точки рисует шейдер шара ровной сеткой по поверхности
      g.fillStyle = 'rgb(0,0,255)';
      g.beginPath(); ringPath(g, YAKUTIA.concat([YAKUTIA[0]])); g.fill();
      g.globalCompositeOperation = 'source-over';
      mapTex.needsUpdate = true;

      // обводки покупателей: точечный пунктир, страна i — в своём канале
      [outA, outB].forEach(c => { const o = c.getContext('2d'); o.fillStyle = '#000'; o.fillRect(0, 0, W, H); o.globalCompositeOperation = 'lighter'; });
      BUYERS.forEach((b, i) => {
        const geom = countries.find(c => String(c.id) === b.id);
        if (!geom) return;
        const o = (i < 3 ? outA : outB).getContext('2d');
        o.strokeStyle = ['rgb(255,0,0)', 'rgb(0,255,0)', 'rgb(0,0,255)'][i % 3];
        o.lineWidth = 4.5; o.lineCap = 'round'; o.setLineDash([.1, 11]);
        topoRings(topo, geom).forEach(poly => poly.forEach(r => { o.beginPath(); ringPath(o, r); o.stroke(); }));
      });
      outTexA.needsUpdate = outTexB.needsUpdate = true;
    }
    fetch(WORLD_URL).then(r => r.json()).then(topo => { drawMap(topo); pickTargets(topo); }).catch(() => {});   // без сети — пустой шар с сеткой не рисуется, но страница работает

    // ── шар ──
    const globeMat = new THREE.ShaderMaterial({
      uniforms: {
        tMap: { value: mapTex }, tOutA: { value: outTexA }, tOutB: { value: outTexB },
        uShown: { value: new Array(6).fill(0) }, uFade: { value: 0 }, uTime: { value: 0 },
      },
      vertexShader: `
        varying vec3 vObj, vN, vV;
        void main() {
          vObj = normalize(position);
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D tMap, tOutA, tOutB; uniform float uShown[6]; uniform float uFade, uTime;
        varying vec3 vObj, vN, vV;
        void main() {
          vec3 n = normalize(vObj);
          vec2 uv = vec2(atan(-n.z, n.x) / 6.2831853 + .5, asin(clamp(n.y, -1., 1.)) / 3.1415927 + .5);
          vec3 m = texture2D(tMap, uv).rgb;
          vec3 oa = texture2D(tOutA, uv).rgb, ob = texture2D(tOutB, uv).rgb;
          float outl = oa.r * uShown[0] + oa.g * uShown[1] + oa.b * uShown[2] + ob.r * uShown[3] + ob.g * uShown[4] + ob.b * uShown[5];
          // свет слева (в координатах камеры): блик и освещённая сторона — слева, правый край уходит в тень
          vec3 N = normalize(vN), V = normalize(vV), L = normalize(vec3(-.9, .3, .32));
          float dif = max(dot(N, L), 0.);
          float fres = pow(1. - max(dot(N, V), 0.), 3.);
          vec3 base = mix(vec3(.025), vec3(.2, .205, .21), m.r);                 // океан почти чёрный, суша серая
          vec3 col = base * (.14 + 1.05 * dif);      // рассеянный свет мягкий — без серой засветки
          col += m.g * vec3(.55) * (.35 + .65 * dif);                            // границы и сетка
          // Якутия — точки ровной сеткой по поверхности шара (шаг 0,75°, на любой широте одинаковый, ряды со сдвигом);
          // заливка тихая, примерно каждая третья точка в случайный момент коротко вспыхивает
          float latD = degrees(asin(clamp(n.y, -1., 1.))), lonD = degrees(atan(-n.z, n.x));
          vec2 gp = vec2(lonD * cos(radians(latD)), latD) / .75;
          float row = floor(gp.y + .5), sh = mod(row, 2.) * .5;
          vec2 cell = vec2(floor(gp.x - sh + .5), row);
          float d = length(vec2(gp.x - sh, gp.y) - cell);
          float aa = fwidth(d) * .8;
          float dotm = 1. - smoothstep(.24 - aa, .24 + aa, d);
          float rnd = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          float blink = step(.66, rnd) * smoothstep(.93, 1., sin(uTime * (.6 + rnd * .9) + rnd * 91.));      // вспыхивают
          float dim = step(rnd, .3) * smoothstep(.9, 1., sin(uTime * (.5 + rnd * 1.4) + rnd * 57.));          // гаснут
          col += step(.5, m.b) * dotm * vec3(.95, .96, 1.) * (.45 + 1.1 * blink) * (1. - .9 * dim);
          col += outl * vec3(1., .98, .94) * .45;                                // обводка покупателя — полупрозрачная
          // свет слева — как отражение на глянце: небольшое яркое ядро блика с плавным спадом
          // и тонкий яркий ободок по левому краю. Накладывается мягко (как «экран»), без пересвета:
          // под бликом карта не сереет и пятно не становится плоским
          float glossy = pow(max(dot(reflect(-L, N), V), 0.), 140.);                 // только чистое ядро блика, без мутного ореола
          vec3 Lr = normalize(vec3(-.85, .25, -.45));
          float edge = 1. - max(dot(N, V), 0.);
          float rim = smoothstep(.62, .97, edge) * smoothstep(-.2, .8, dot(N, Lr));   // чёткий белый ободок
          float lightA = clamp(glossy + rim * 1.6, 0., 1.);
          col = col + (vec3(1.) - col) * lightA;
          gl_FragColor = vec4(col, uFade);
        }`,
      transparent: true,
    });
    const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 96), globeMat);
    root.add(globe);
    // свечение вокруг шара — тонкий светящийся ореол, ярче со стороны контрового света
    const haloMat = new THREE.ShaderMaterial({
      uniforms: { uFade: { value: 0 } },
      vertexShader: `varying vec3 vN, vV; void main() { vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        uniform float uFade; varying vec3 vN, vV;
        void main() {
          float f = dot(normalize(vN), normalize(vV));                 // внешний край ореола — 0, у самого шара — около −0,4
          float a = pow(clamp(-f / .4, 0., 1.), 3.);                   // тонко: ярко у самого шара, быстро тает
          float side = .15 + .85 * smoothstep(-.2, .9, -normalize(vN).x);  // сильнее слева, со стороны света
          gl_FragColor = vec4(vec3(.72, .78, .9) * a * side * .9 * uFade, 1.);
        }`,
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.06, 96, 64), haloMat));

    // ── облака на шаре: продолжение облачной пелены перехода. В начале отлёта слой почти сплошной,
    // дальше разрывается на клочья и рассеивается, открывая континенты; освещён тем же светом слева ──
    const cloudShellMat = new THREE.ShaderMaterial({
      uniforms: { tNoise: { value: noiseTex }, uCover: { value: 0 }, uFade: { value: 0 }, uTime: { value: 0 } },
      vertexShader: `
        varying vec3 vObj, vN, vV;
        void main() { vObj = normalize(position); vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        uniform sampler2D tNoise; uniform float uCover, uFade, uTime; varying vec3 vObj, vN, vV;
        float fbm(vec2 p) { float v = 0., a = .5; for (int i = 0; i < 5; i++) { v += a * texture2D(tNoise, p).r; p = p * 2.07 + vec2(.13, .29); a *= .5; } return v; }
        void main() {
          vec3 n = normalize(vObj);
          vec2 uv = vec2(atan(-n.z, n.x) / 6.2831853 + .5, asin(clamp(n.y, -1., 1.)) / 3.1415927 + .5);
          vec2 q = uv * vec2(7., 3.5) + vec2(uTime * .002, 0.);
          float c = fbm(q) * .7 + fbm(q * 2.3 + vec2(-uTime * .003, uTime * .001) + 3.1) * .4;
          float th = mix(.7, .3, uCover);                                  // чем меньше покрытие, тем выше порог — облака рвутся
          float a = smoothstep(th, th + .22, c);
          vec3 N = normalize(vN), V = normalize(vV), L = normalize(vec3(-.9, .3, .32));
          float dif = max(dot(N, L), 0.);
          vec3 col = mix(vec3(.12, .13, .16), vec3(.78, .82, .9), clamp(.15 + dif * .9 + (c - .5) * .4, 0., 1.));
          gl_FragColor = vec4(col, a * uFade);
        }`,
      transparent: true, depthWrite: false,
    });
    const cloudShell = new THREE.Mesh(new THREE.SphereGeometry(1.012, 128, 80), cloudShellMat);
    cloudShell.renderOrder = 3; root.add(cloudShell);

    // ── дуги продаж: на каждую страну две дуги со сдвигом по времени. Дуга прорисовывается из порта,
    // светит (по ней бегут слабые импульсы), гаснет — и следом рисуется новая, в другую точку той же страны ──
    const ARC_N = 160, SLOTS = 2;
    const p0 = ll(THREE, ...PORT);
    const targets = BUYERS.map(b => [b.at]);                       // точки внутри страны; пока карта не загрузилась — одна
    function setArc(geo, lat, lon) {
      const p1 = ll(THREE, lat, lon), ang = p0.angleTo(p1), pos = geo.attributes.position, v = new THREE.Vector3();
      for (let k = 0; k <= ARC_N; k++) {
        const t = k / ARC_N;
        v.copy(p0).lerp(p1, t).normalize().multiplyScalar(1.004 + Math.sin(Math.PI * t) * (.03 + ang * .22));
        pos.setXYZ(k, v.x, v.y, v.z);
      }
      pos.needsUpdate = true;
    }
    const arcList = [];
    BUYERS.forEach((b, ci) => {
      for (let s = 0; s < SLOTS; s++) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((ARC_N + 1) * 3), 3));
        g.setAttribute('aT', new THREE.Float32BufferAttribute(Array.from({ length: ARC_N + 1 }, (_, k) => k / ARC_N), 1));
        setArc(g, ...b.at);
        const mat = new THREE.ShaderMaterial({
          uniforms: { uReveal: { value: 0 }, uTime: { value: 0 }, uFade: { value: 0 }, uOff: { value: ci * .17 + s * .5 } },
          vertexShader: `attribute float aT; varying float vT; void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
          fragmentShader: `
            uniform float uReveal, uTime, uFade, uOff; varying float vT;
            void main() {
              if (vT > uReveal) discard;
              float pulse = exp(-pow((fract(uTime * .22 + uOff) - vT) * 9., 2.));    // бегущий импульс
              float head = exp(-pow((uReveal - vT) * 40., 2.)) * step(uReveal, .999);  // светящаяся «голова», пока дуга растёт
              gl_FragColor = vec4(vec3(1., .97, .92) * (.3 + .7 * pulse + 1.2 * head) * uFade, 1.);
            }`,
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        });
        const line = new THREE.Line(g, mat); line.renderOrder = 2; root.add(line);
        // цикл дуги: 1,6 с — рисуется, 2,8 с — светит, 1,4 с — гаснет, 0,6 с — пауза; у второй дуги страны — сдвиг на полцикла
        arcList.push({ ci, geo: g, mat, start: null, period: 6.4 + ci * .37, shift: s * 3.2, k: 0, arrived: false });
      }
    });
    // случайные точки внутри страны — по её границам (чётно-нечётное правило по всем кольцам)
    function inside(rings, lon, lat) {
      let c = false;
      rings.forEach(r => { for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, yi] = r[i], [xj, yj] = r[j];
        if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c;
      } });
      return c;
    }
    function pickTargets(topo) {
      let s = 17; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      BUYERS.forEach((b, i) => {
        const geom = topo.objects.countries.geometries.find(c => String(c.id) === b.id);
        if (!geom) return;
        const rings = topoRings(topo, geom).flat();
        const all = rings.flat(), lons = all.map(p => p[0]), lats = all.map(p => p[1]);
        const [x0, x1, y0, y1] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
        const pts = [];
        for (let k = 0; k < 4000 && pts.length < 24; k++) {
          const lon = x0 + r() * (x1 - x0), lat = y0 + r() * (y1 - y0);
          if (inside(rings, lon, lat)) pts.push([lat, lon]);
        }
        if (pts.length) targets[i] = pts;
      });
    }
    // ── железная дорога от разреза до порта: тонкая линия, по ней к порту медленно бегут штрихи-составы ──
    const railMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFade: { value: 0 } },
      vertexShader: `attribute float aT; varying float vT; void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: `
        uniform float uTime, uFade; varying float vT;
        void main() {
          float dash = step(.55, fract(vT * 14. - uTime * .35));          // штрихи едут от разреза к порту
          gl_FragColor = vec4(vec3(1., .97, .92) * (.35 + .65 * dash) * uFade, 1.);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    {
      const pts = [], tt = [];
      const way = RAIL.map(([la, lo]) => ll(THREE, la, lo));
      const lens = way.slice(1).map((v, i) => v.angleTo(way[i])), total = lens.reduce((a, b) => a + b, 0);
      let acc = 0;
      way.slice(1).forEach((b, i) => {
        const a = way[i];
        for (let k = i ? 1 : 0; k <= 12; k++) {
          const t = k / 12, v = a.clone().lerp(b, t).normalize().multiplyScalar(1.003);
          pts.push(v); tt.push((acc + lens[i] * t) / total);
        }
        acc += lens[i];
      });
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      g.setAttribute('aT', new THREE.Float32BufferAttribute(tt, 1));
      const rail = new THREE.Line(g, railMat); rail.renderOrder = 2; root.add(rail);
    }
    // точка порта
    const dotMat = new THREE.PointsMaterial({ color: '#fff', size: 6, sizeAttenuation: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    // точки порта и разреза
    const portDot = new THREE.Points(new THREE.BufferGeometry().setFromPoints([p0.clone().multiplyScalar(1.004), ll(THREE, ...MINE, 1.004)]), dotMat);
    root.add(portDot);

    // ── звёзды вокруг ──
    const starMat = new THREE.PointsMaterial({ color: '#cfd6e6', size: 1.6, sizeAttenuation: false, transparent: true, depthWrite: false });
    {
      const pts = []; let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 1400; i++) { const v = new THREE.Vector3(r() - .5, r() - .5, r() - .5).normalize().multiplyScalar(60 + r() * 40); pts.push(v); }
      scene.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts), starMat));
    }

    // ── камера: начинает низко над портом и отлетает далеко — шар целиком, по центру кадра.
    // Сам шар поворачивается за курсором (плавно, с запаздыванием) ──
    const dirPort = ll(THREE, ...PORT).normalize(), dirEnd = ll(THREE, 33, 112).normalize();
    const camDir = new THREE.Vector3(), look = new THREE.Vector3(), right = new THREE.Vector3();
    let aspect = 1;
    function placeCamera(p, time, mx, my) {
      const e = p * p * (3 - 2 * p);
      // первую треть отлёта камера поднимается строго над портом, потом плавно поворачивает к финальному виду;
      // поворот шара и сдвиг по правилу третей — тоже после этого
      const turn = Math.min(1, Math.max(0, (p - .3) / .7)), et = turn * turn * (3 - 2 * turn);
      camDir.copy(dirPort).lerp(dirEnd, et).normalize();
      const dist = 1.06 * Math.pow(3.4 / 1.06, e);                                // экспоненциально — без рывка у поверхности
      camera.position.copy(camDir).multiplyScalar(dist);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
      // поворот шара за курсором: влево-вправо сильнее, вверх-вниз слегка; у поверхности почти не крутится
      const k = et;                                                    // пока камера над портом, курсор шар не крутит
      // базовый поворот на 15° вправо нарастает с отлётом: в начале камера ровно над портом
      spinY += (THREE.MathUtils.degToRad(15) * et + (mx - .5) * 1.1 * k - spinY) * .06;
      spinX += (-(my - .5) * .45 * k - spinX) * .06;
      root.quaternion.setFromAxisAngle(camUp.copy(camera.up).applyQuaternion(camera.quaternion), spinY);
      root.quaternion.premultiply(qx.setFromAxisAngle(camRight.set(1, 0, 0).applyQuaternion(camera.quaternion), spinX));
      // композиция по правилу третей: центр шара — на левой трети экрана (нарастает с отлётом; на узком экране — по центру)
      const wide = Math.min(1, Math.max(0, (aspect - .9) / .5));
      camera.setViewOffset(viewW, viewH, viewW / 6 * et * wide, 0, viewW, viewH);
    }
    let spinX = 0, spinY = 0;
    const camUp = new THREE.Vector3(), camRight = new THREE.Vector3(), qx = new THREE.Quaternion();

    // ── облачная пелена перехода: экран затягивает густыми облаками, будто камера пролетает сквозь них вверх ──
    const veilMat = new THREE.ShaderMaterial({
      uniforms: { tNoise: { value: noiseTex }, uDensity: { value: 0 }, uRise: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
      fragmentShader: `
        uniform sampler2D tNoise; uniform float uDensity, uRise, uTime, uAspect; varying vec2 vUv;
        float fbm(vec2 p) { float v = 0., a = .5; for (int i = 0; i < 5; i++) { v += a * texture2D(tNoise, p).r; p = p * 2.03 + vec2(.17, .31); a *= .5; } return v; }
        void main() {
          vec2 p = (vUv - .5) * vec2(uAspect, 1.);
          // летим вверх: рисунок облаков разъезжается от центра и уходит вниз
          float zoom = 1. + uRise * 2.2;
          vec2 q = p / zoom * .5 + vec2(uTime * .003, -uRise * .9);
          float c = fbm(q + .37) * .65 + fbm(q * 1.8 + vec2(-uTime * .005, uRise * .4) + 1.3) * .45;
          float th = mix(1.05, .3, uDensity);
          float a = smoothstep(th - .2, th + .1, c);
          a = max(a, smoothstep(.75, 1., uDensity) * .9);             // на пике — почти сплошная пелена
          vec3 col = mix(vec3(.13, .15, .19), vec3(.58, .63, .72), smoothstep(.3, .95, c));
          gl_FragColor = vec4(col, a * min(1., uDensity * 1.5));
        }`,
      transparent: true, depthTest: false, depthWrite: false,
    });
    const veilScene = new THREE.Scene(), veilCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    veilScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), veilMat));
    function renderVeil(density, rise, time) {
      veilMat.uniforms.uDensity.value = density; veilMat.uniforms.uRise.value = rise; veilMat.uniforms.uTime.value = time;
      renderer.autoClear = false; renderer.render(veilScene, veilCam); renderer.autoClear = true;
    }

    let viewW = 1, viewH = 1;
    function resize(w, h) { viewW = w; viewH = h; camera.aspect = aspect = w / h; camera.updateProjectionMatrix(); veilMat.uniforms.uAspect.value = aspect; }

    // fade — проявление (0…1), p — пролёт камеры (0…1), arcs — сколько дуг выпущено (0…6, дробное — дуга в пути)
    function render(fade, p, time, mx, my, arcs, overlay) {
      placeCamera(Math.min(1, Math.max(0, p)), time, mx, my);
      globeMat.uniforms.uFade.value = fade; globeMat.uniforms.uTime.value = time;
      // страна «включается» по скроллу (arcs — сколько стран включено); дальше её дуги живут циклом по времени
      const shown = globeMat.uniforms.uShown.value;
      arcList.forEach(a => {
        const on = arcs > a.ci + .02;
        if (!on) { a.start = null; a.arrived = false; a.mat.uniforms.uReveal.value = 0; return; }
        if (a.start === null) { a.start = time; a.k = -1; }
        const local = time - a.start - a.shift;
        let reveal = 0, alpha = 0;
        if (local >= 0) {
          const k = Math.floor(local / a.period), t = local - k * a.period;
          if (k !== a.k) { a.k = k; const pts = targets[a.ci]; setArc(a.geo, ...pts[(k * 7 + a.shift * 3 + a.ci) % pts.length | 0]); }
          reveal = Math.min(1, t / 1.6);
          alpha = t < 4.4 ? 1 : Math.max(0, 1 - (t - 4.4) / 1.4);
          if (reveal >= 1) a.arrived = true;
        }
        a.mat.uniforms.uReveal.value = reveal; a.mat.uniforms.uTime.value = time; a.mat.uniforms.uFade.value = fade * alpha;
      });
      // страна обводится, когда до неё впервые дошла дуга, и обводка остаётся
      BUYERS.forEach((b, i) => {
        const target = arcList.some(a => a.ci === i && a.arrived) ? 1 : 0;
        shown[i] += (target - shown[i]) * .08;
      });
      dotMat.opacity = fade; starMat.opacity = fade * .8; haloMat.uniforms.uFade.value = fade;
      // облака на шаре: сплошные в начале отлёта, к середине рвутся и рассеиваются
      const cp = Math.min(1, Math.max(0, p));
      const cs = Math.min(1, cp / .8);
      cloudShellMat.uniforms.uCover.value = 1 - cs * cs * (3 - 2 * cs);
      cloudShellMat.uniforms.uFade.value = fade * (1 - Math.min(1, Math.max(0, (cp - .65) / .35)));
      cloudShellMat.uniforms.uTime.value = time;
      cloudShell.visible = cloudShellMat.uniforms.uFade.value > .002;
      railMat.uniforms.uFade.value = fade; railMat.uniforms.uTime.value = time;
      if (overlay) {
        renderer.autoClear = false; renderer.clearDepth();
        renderer.render(scene, camera);
        renderer.autoClear = true;
      } else {
        renderer.setClearColor('#0b0b0b', 1);
        renderer.render(scene, camera);
      }
    }

    return { render, renderVeil, resize, BUYERS };
  }
  return { create };
})();
