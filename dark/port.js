// Порт «Эльга» — условная ночная 3D-модель для экрана после «Обогащения» (тёмный концепт).
// Собрана по описаниям порта: скалистый мыс на берегу Удской губы, ледозащитный мол, эстакада
// с причальной платформой на 4 причала (у двух — балкеры), судопогрузочные машины, конвейерные галереи
// от склада, штабели угля со штабелёрами, станция разгрузки вагонов с путями, льдины в море.
// Пропорции условные, 1 единица = 1 м. Суша — z > 0, море — z < 0, уровень воды — y = 0.
// Обычный скрипт (не модуль), чтобы страница открывалась двойным щелчком:
// window.ElgaPort.create(THREE, renderer, coalMat, noiseTex) → { render(reveal, p, time, mx, my, trailTex), renderSnow(alpha, time), resize(w, h) }
window.ElgaPort = (() => {
  // ── шум для рельефа ──
  const hash = (x, y, s) => {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const vnoise = (x, y, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y, s) => { let v = 0, a = .5; for (let o = 0; o < 5; o++) { v += a * vnoise(x, y, s + o); x *= 2.03; y *= 2.03; a *= .5; } return v; };
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // береговая линия и высота суши: у воды — скальный обрыв, дальше ровная площадка порта, за ней сопки
  const coastZ = x => 25 * Math.sin(x * .004) + 18 * Math.sin(x * .011 + 1.3) + (x < -650 ? (-650 - x) * -.35 : 0);
  const PAD = { x0: -620, x1: 560, z0: 60, z1: 760 };       // ровная площадка: склад, станция, пути
  function landH(x, z) {
    const d = z - coastZ(x);
    if (d < 0) return -14 + d * .05;                          // дно у берега — под водой
    const cliff = -3 + 12 * sm(0, 28, d);                     // скальный край
    const rough = (fbm(x * .006, z * .006, 3) - .5) * 70 + fbm(x * .03, z * .03, 7) * 8;
    const hills = Math.max(0, (d - 300) * .09) + rough * sm(150, 700, d);
    const inPad = sm(PAD.x0 - 160, PAD.x0, x) * (1 - sm(PAD.x1, PAD.x1 + 160, x)) * sm(PAD.z0 - 40, PAD.z0, z) * (1 - sm(PAD.z1, PAD.z1 + 200, z));
    const wild = cliff + Math.max(0, hills) + rough * .08 * sm(0, 60, d);
    return wild * (1 - inPad) + 9 * inPad * sm(0, 28, d);
  }

  function create(THREE, renderer, coalMat, noiseTex) {
    const scene = new THREE.Scene();
    const BG = new THREE.Color('#171b22');
    scene.background = BG;
    scene.fog = new THREE.FogExp2('#1d222b', .00016);
    const camera = new THREE.PerspectiveCamera(42, 1, 1, 12000);

    // ── небо: ночной градиент и северное сияние у горизонта (зелень снизу, фиолетовый кверху) ──
    const skyMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uReveal: { value: 0 } },
      vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }`,
      fragmentShader: `
        uniform float uTime, uReveal; varying vec3 vDir;
        float h(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float n3(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
          return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
        void main() {
          vec3 d = normalize(vDir);
          float el = d.y, az = atan(d.x, d.z), t = uTime;
          vec3 col = mix(vec3(.11, .13, .17), vec3(.05, .06, .08), smoothstep(0., .6, el));
          // занавеси сияния: несколько волнистых лент над горизонтом, с вертикальными лучами
          vec3 aur = vec3(0.);
          for (int i = 0; i < 3; i++) {
            float fi = float(i);
            float base = .04 + fi * .05 + .03 * sin(az * 2. + t * .04 + fi * 2.1) + .02 * n3(vec3(az * 3., fi, t * .03));
            float k = smoothstep(base - .02, base, el) * exp(-max(el - base, 0.) * (9. - fi * 2.));
            float rays = (.35 + .65 * n3(vec3(az * 26. + fi * 7., t * .12, fi))) * (.5 + .5 * n3(vec3(az * 70., t * .2, fi + 4.)));
            float side = .4 + .6 * smoothstep(-.2, .8, sin(az * 1.3 + fi + t * .02));   // сияние гуще в одной стороне неба
            vec3 tint = mix(vec3(.12, .85, .5), vec3(.62, .3, 1.), smoothstep(base, base + .12, el));
            aur += k * rays * side * tint * (1. - fi * .2);
          }
          col += aur * .9 * smoothstep(-.01, .02, el);
          gl_FragColor = vec4(col * uReveal, 1.);
        }`,
      side: THREE.BackSide, depthWrite: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(10000, 48, 24), skyMat);
    sky.renderOrder = -1;
    scene.add(sky);
    const root = new THREE.Group();
    scene.add(root);

    // свет: холодная луна сзади-сбоку — контуры; слабое небо — чтобы тени не проваливались в чёрное
    const hemi = new THREE.HemisphereLight('#7f92b8', '#12151a', 3.4);
    const moon = new THREE.DirectionalLight('#cfdaf2', 3.8);
    moon.position.set(-900, 700, 1400);
    const warm = new THREE.DirectionalLight('#ffb070', .7);  // отсвет фонарей снизу-спереди
    warm.position.set(300, 120, -900);
    scene.add(hemi, moon, warm);
    const LIGHTS = { hemi: 3.4, moon: 3.8, warm: 1.2 };

    // ── материалы ──
    const steel = new THREE.MeshPhongMaterial({ color: '#3d4450', specular: '#7a8496', shininess: 50, flatShading: true });
    const steelDark = new THREE.MeshPhongMaterial({ color: '#16191e', specular: '#3a414c', shininess: 30, flatShading: true });
    const concrete = new THREE.MeshPhongMaterial({ color: '#4a4e55', specular: '#2a2a2a', shininess: 8, flatShading: true });
    const rock = new THREE.MeshPhongMaterial({ color: '#2a2e34', specular: '#3a414b', shininess: 12, flatShading: true });
    const hullMat = new THREE.MeshPhongMaterial({ color: '#1c2734', specular: '#46546a', shininess: 70 });
    const hullRed = new THREE.MeshPhongMaterial({ color: '#41201b', specular: '#2a1a18', shininess: 30 });
    const deckMat = new THREE.MeshPhongMaterial({ color: '#3a2a22', specular: '#222', shininess: 10, flatShading: true });
    const cabinMat = new THREE.MeshPhongMaterial({ color: '#9aa0a8', specular: '#666', shininess: 30, flatShading: true });
    const iceMat = new THREE.MeshPhongMaterial({ color: '#46505d', specular: '#8fa2c4', shininess: 40, flatShading: true });
    const coal = coalMat || new THREE.MeshPhongMaterial({ color: '#0e0f12', specular: '#5a6274', shininess: 90, flatShading: true });
    const landMat = new THREE.MeshPhongMaterial({ vertexColors: true, specular: '#1b2027', shininess: 14, flatShading: true });

    const box = (w, h, d, mat, x, y, z, parent = root) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); parent.add(m); return m;
    };
    const cyl = (r, h, mat, x, y, z, seg = 8, parent = root) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
      m.position.set(x, y, z); parent.add(m); return m;
    };
    // балка между двумя точками
    const beam = (a, b, w, h, mat, parent = root) => {
      const dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), mat);
      m.position.copy(a).addScaledVector(dir, .5);
      m.lookAt(b); parent.add(m); return m;
    };

    // огни: светящиеся точки + отражения-дорожки на воде
    const lights = [];   // { x, y, z, size, color }
    const addLight = (x, y, z, size = 6, color = '#ffb46b') => lights.push({ x, y, z, size, c: new THREE.Color(color) });

    // ── суша ──
    {
      const W = 5200, D = 3200, cx = 0, cz = 1300;
      const geo = new THREE.PlaneGeometry(W, D, 260, 160);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position, col = [];
      const dark = new THREE.Color('#1d2128'), snow = new THREE.Color('#7d8796'), pad = new THREE.Color('#24262a');
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
        const h = landH(x, z);
        pos.setXYZ(i, x, h, z);
        // снег — пятнами на вершинах сопок; площадка порта — тёмная, в угольной пыли
        const s = sm(25, 70, h) * sm(.45, .7, fbm(x * .01, z * .01, 21));
        const inPad = x > PAD.x0 && x < PAD.x1 && z > PAD.z0 && z < PAD.z1 ? 1 : 0;
        const c = dark.clone().lerp(snow, s * .9).lerp(pad, inPad * .6);
        col.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.computeVertexNormals();
      root.add(new THREE.Mesh(geo, landMat));
    }

    // ── вода: тёмная, с бликами луны и мелкой рябью ──
    const waterMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uReveal: { value: 0 }, uCam: { value: new THREE.Vector3() },
        uMoonDir: { value: new THREE.Vector3(-.45, .35, .82).normalize() },
      },
      vertexShader: `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform float uTime, uReveal; uniform vec3 uCam, uMoonDir; varying vec3 vW;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          vec2 p = vW.xz;
          // рябь: несколько слоёв шума, медленно бегут
          float e = .6;
          // рябь бежит в двух направлениях, поверх — медленные пологие волны с моря
          vec2 t1 = vec2(uTime * .35, uTime * .14), t2 = vec2(-uTime * .24, uTime * .32);
          vec2 g = vec2(n(p * .06 + t1) - n(p * .06 + vec2(e, 0.) + t1), n(p * .06 + t1) - n(p * .06 + vec2(0., e) + t1));
          g += .5 * vec2(n(p * .2 + t2) - n(p * .2 + vec2(e, 0.) + t2), n(p * .2 + t2) - n(p * .2 + vec2(0., e) + t2));
          float swell = sin(p.y * .0125 + p.x * .004 - uTime * 1.) + .6 * sin(p.y * .02 - p.x * .0085 - uTime * 1.4);
          g += vec2(.004, .02) * swell;
          vec3 N = normalize(vec3(g.x * .45, 1., g.y * .45));
          vec3 V = normalize(uCam - vW);
          float fres = pow(1. - max(dot(N, V), 0.), 4.);
          vec3 R = reflect(-V, N);
          float glint = pow(max(dot(R, uMoonDir), 0.), 220.) * .9;
          vec3 col = mix(vec3(.022, .03, .042), vec3(.15, .18, .24), fres) + glint * vec3(.6, .7, .9);
          // гребни волн светлее — бегущие полосы видно и сверху
          float crest = smoothstep(.5, 1., swell * .32 + .5 + (n(p * .01 + t1 * .2) - .5) * .8);
          col += crest * vec3(.06, .075, .1);
          // искры: мелкие блики вспыхивают и гаснут по всей воде
          // искры: в ячейке сетки — маленькое круглое пятно со случайным центром и мягким краем (не квадрат ячейки)
          vec2 q = p * .175, cell = floor(q);
          float tw = fract(uTime * 1.1 + h(cell) * 7.);
          vec2 sc = vec2(h(cell + 3.1), h(cell + 7.7)) * .6 + .2;
          float dot_ = smoothstep(.2, 0., length(fract(q) - sc));
          col += step(.985, h(cell + floor(uTime * 1.1 + h(cell) * 7.))) * sin(tw * 3.14159) * dot_ * vec3(.55, .6, .75);
          float dist = length(uCam - vW);
          col = mix(col, vec3(.086, .1, .13), 1. - exp(-dist * .00018));
          gl_FragColor = vec4(col * uReveal, 1.);
        }`,
    });
    {
      const water = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), waterMat);
      water.rotation.x = -Math.PI / 2; water.position.set(0, 0, -2000);
      root.add(water);
    }

    // ── ледозащитный мол: каменная насыпь дугой вокруг причалов ──
    {
      const pts = [];
      for (let i = 0; i <= 60; i++) {
        const t = i / 60;
        // от берега на западе уходит в море и дугой заворачивает на восток, оставляя проход для судов
        const a = THREE.MathUtils.lerp(Math.PI * .98, Math.PI * .1, t);
        pts.push(new THREE.Vector2(380 + Math.cos(a) * 820, -120 + Math.sin(-a) * 660 * (.6 + .4 * Math.sin(t * Math.PI))));
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const m = beam(new THREE.Vector3(a.x, 2, a.y), new THREE.Vector3(b.x, 2, b.y), 26, 14, rock);
        m.scale.y = .8 + .4 * rnd();
        // валуны поверх насыпи
        for (let k = 0; k < 3; k++) {
          const t = rnd();
          const r = 4 + rnd() * 5;
          const s = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rock);
          s.position.set(a.x + (b.x - a.x) * t + (rnd() - .5) * 18, 6 + rnd() * 3, a.y + (b.y - a.y) * t + (rnd() - .5) * 18);
          s.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
          root.add(s);
        }
        if (i % 6 === 0) addLight(a.x, 14, a.y, 4, '#ff5a4a');   // сигнальные огни на моле
      }
    }

    // ── эстакада и причальная платформа ──
    const TRESTLE_X = 320, PLAT_Z = -470, PLAT_X0 = -40, PLAT_X1 = 760;
    {
      // подходная эстакада от берега к платформе
      box(16, 2, 470, concrete, TRESTLE_X, 12, -235);
      for (let z = -20; z > PLAT_Z; z -= 26) { cyl(1.2, 24, steelDark, TRESTLE_X - 6, 0, z); cyl(1.2, 24, steelDark, TRESTLE_X + 6, 0, z); }
      // платформа вдоль берега: причалы с обеих сторон
      box(PLAT_X1 - PLAT_X0, 3, 34, concrete, (PLAT_X0 + PLAT_X1) / 2, 12, PLAT_Z);
      for (let x = PLAT_X0 + 10; x < PLAT_X1; x += 24) for (const dz of [-14, 0, 14]) cyl(1.3, 24, steelDark, x, 0, PLAT_Z + dz);
      // кранцы и подкрановые пути
      box(PLAT_X1 - PLAT_X0, .8, 1, steel, (PLAT_X0 + PLAT_X1) / 2, 13.9, PLAT_Z - 9);
      box(PLAT_X1 - PLAT_X0, .8, 1, steel, (PLAT_X0 + PLAT_X1) / 2, 13.9, PLAT_Z + 9);
      for (let x = PLAT_X0 + 20; x < PLAT_X1; x += 40) { addLight(x, 30, PLAT_Z - 16, 7); addLight(x + 20, 30, PLAT_Z + 16, 7); cyl(.5, 18, steel, x, 22, PLAT_Z - 16); }
      for (let z = -40; z > PLAT_Z; z -= 50) addLight(TRESTLE_X + 9, 26, z, 6);
    }

    // ── балкеры у причалов ──
    function ship(x, z, side) {
      const g = new THREE.Group();
      const L = 225, B = 32, Hh = 18;
      const s = new THREE.Shape();
      s.moveTo(-L / 2, -B / 2); s.lineTo(L / 2 - 30, -B / 2);
      s.quadraticCurveTo(L / 2, -B / 2, L / 2 + 4, 0); s.quadraticCurveTo(L / 2, B / 2, L / 2 - 30, B / 2);
      s.lineTo(-L / 2, B / 2); s.quadraticCurveTo(-L / 2 - 6, 0, -L / 2, -B / 2);
      const hullGeo = new THREE.ExtrudeGeometry(s, { depth: Hh, bevelEnabled: false });
      hullGeo.rotateX(-Math.PI / 2);
      const hull = new THREE.Mesh(hullGeo, hullMat); hull.position.y = -8; g.add(hull);
      const boot = new THREE.Mesh(hullGeo, hullRed); boot.scale.set(1.002, .25, 1.004); boot.position.y = -9.5; g.add(boot);
      // крышки трюмов
      for (let i = 0; i < 7; i++) box(20, 2.4, 22, deckMat, -L / 2 + 52 + i * 24, 11, 0, g);
      // надстройка в корме, мостик, труба
      box(22, 16, 30, cabinMat, -L / 2 + 14, 18, 0, g);
      box(10, 3, 40, cabinMat, -L / 2 + 20, 27, 0, g);
      box(7, 9, 7, steelDark, -L / 2 + 6, 30, 0, g);
      // огни: окна мостика, палубные прожекторы, топовые
      for (let k = -3; k <= 3; k++) addLight(x + (-L / 2 + 25) * 1, 25, z + k * 4 * side, 2.2, '#fff1d6');
      for (let i = 0; i < 4; i++) addLight(x - L / 2 + 50 + i * 50, 16, z - side * 14, 3.5, '#ffe2b0');
      addLight(x - L / 2 + 8, 40, z, 3, '#fff');
      addLight(x + L / 2 - 4, 22, z, 3, '#fff');
      g.position.set(x, 0, z);
      root.add(g);
    }
    ship(250, PLAT_Z - 34, -1);   // со стороны моря
    ship(520, PLAT_Z + 34, 1);    // со стороны берега

    // ── судопогрузочные машины на платформе: портал, башня, стрела над трюмом ──
    function shiploader(x, side, angle = .14, reach = 52) {
      const g = new THREE.Group();
      box(14, 3, 16, steel, 0, 22, 0, g);
      for (const dx of [-6, 6]) for (const dz of [-7, 7]) box(1.6, 9, 1.6, steel, dx, 17.5, dz, g);
      box(6, 26, 6, steel, 0, 37, 0, g);
      const arm = new THREE.Group(); arm.position.set(0, 46, 0); arm.rotation.x = side * angle; g.add(arm);
      box(4, 3.5, reach, steel, 0, 0, side * reach / 2, arm);
      box(5, 4, 14, steelDark, 0, 1, -side * 8, arm);                 // противовес
      box(2.5, 14, 2.5, steelDark, 0, -8, side * reach, arm);         // телескопический лоток
      beam(new THREE.Vector3(0, 52, 0), new THREE.Vector3(0, 46 + side * angle * -reach * .5, side * reach * .55), .6, .6, steelDark, g);
      addLight(x, 52, PLAT_Z, 4, '#ffd29a');
      addLight(x, 44, PLAT_Z + side * reach * .9, 3, '#ffffff');
      g.position.set(x, 0, PLAT_Z);
      root.add(g);
    }
    shiploader(230, -1); shiploader(300, -1, .05, 46);
    shiploader(540, 1); shiploader(650, 1, .32, 40);

    // ── конвейерные галереи на опорах ──
    function gallery(pts, h = 16) {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const ya = (a.y ?? h), yb = (b.y ?? h);
        const A = new THREE.Vector3(a.x, ya, a.z), B = new THREE.Vector3(b.x, yb, b.z);
        beam(A, B, 5, 4, steel);
        beam(A.clone().add(new THREE.Vector3(0, 2.6, 0)), B.clone().add(new THREE.Vector3(0, 2.6, 0)), 5.6, .6, steelDark);  // кровля
        const len = A.distanceTo(B), n = Math.max(1, Math.floor(len / 32));
        for (let k = 1; k < n; k++) {
          const p = A.clone().lerp(B, k / n);
          const ground = Math.max(-2, landH(p.x, p.z));
          box(1.4, p.y - ground, 1.4, steelDark, p.x - 2, (p.y + ground) / 2, p.z);
          box(1.4, p.y - ground, 1.4, steelDark, p.x + 2, (p.y + ground) / 2, p.z);
          if (k % 3 === 0) addLight(p.x, p.y + 3, p.z, 3, '#ffc27d');
        }
      }
      // пересыпные башни на изломах
      pts.slice(1, -1).forEach(p => { box(12, (p.y ?? h) + 10, 12, steel, p.x, ((p.y ?? h) + 10) / 2, p.z); addLight(p.x, (p.y ?? h) + 11, p.z, 4); });
    }
    gallery([{ x: -260, z: 420, y: 18 }, { x: 260, z: 200, y: 22 }, { x: TRESTLE_X, z: 30, y: 20 }, { x: TRESTLE_X, z: PLAT_Z + 6, y: 17 }]);
    gallery([{ x: TRESTLE_X, z: PLAT_Z, y: 17 }, { x: PLAT_X0 + 20, z: PLAT_Z, y: 17 }], 17);
    gallery([{ x: TRESTLE_X, z: PLAT_Z, y: 17 }, { x: PLAT_X1 - 20, z: PLAT_Z, y: 17 }], 17);
    gallery([{ x: -420, z: 520, y: 14 }, { x: -260, z: 420, y: 18 }]);

    // ── склад: штабели угля и штабелёры между ними ──
    {
      const pileGeo = (len, w, h) => {
        const s = new THREE.Shape();
        s.moveTo(-w / 2, 0); s.lineTo(-w * .08, h); s.lineTo(w * .08, h); s.lineTo(w / 2, 0); s.lineTo(-w / 2, 0);
        const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: true, bevelThickness: 14, bevelSize: 6, bevelSegments: 2, steps: 24 });
        g.translate(0, 0, -len / 2);
        // неровный верх штабеля
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > 1) p.setY(i, y + (vnoise(p.getZ(i) * .05, p.getX(i) * .1, 5) - .5) * 4); }
        g.computeVertexNormals();
        return g;
      };
      const piles = [{ x: -120, len: 520 }, { x: -40, len: 560 }, { x: 40, len: 480 }];
      piles.forEach((pl, i) => {
        const m = new THREE.Mesh(pileGeo(pl.len, 46, 17), coal);
        m.position.set(pl.x * 1.2 + 60, 9, 420 + i * 10);
        m.rotation.y = Math.PI / 2 - .32;
        root.add(m);
      });
      // штабелёры-реклаймеры: база на рельсах, стрела с роторным колесом
      [[-30, 360, .35], [120, 470, -.4]].forEach(([x, z, a]) => {
        const g = new THREE.Group();
        box(12, 8, 14, steel, 0, 13, 0, g);
        box(4, 20, 4, steel, 0, 27, 0, g);
        const arm = new THREE.Group(); arm.position.set(0, 30, 0); arm.rotation.set(0, a, -.18); g.add(arm);
        box(46, 3, 3, steel, 23, 0, 0, arm);
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 2, 14), steelDark);
        wheel.rotation.x = Math.PI / 2; wheel.position.set(47, 0, 0); arm.add(wheel);
        box(16, 4, 5, steelDark, -10, 1, 0, arm);
        g.position.set(x, 0, z); g.rotation.y = -.32;
        root.add(g);
        addLight(x, 40, z, 4, '#ffd29a');
      });
      // мачты освещения склада
      for (let i = 0; i < 6; i++) {
        const x = -330 + i * 120, z = 300 + (i % 2) * 260;
        cyl(.8, 42, steelDark, x, 30, z);
        for (const d of [-2, 0, 2]) addLight(x + d, 52, z, 6, '#ffcf8f');
      }
    }

    // ── станция разгрузки вагонов: корпус вагоноопрокидывателя, пути, составы полувагонов ──
    {
      box(80, 30, 46, concrete, -470, 24, 560);
      box(84, 3, 50, steelDark, -470, 40, 560);
      for (let k = 0; k < 6; k++) addLight(-505 + k * 14, 30, 536, 2.2, '#fff0cf');
      const trackX = k => -640 + k * 12;
      for (let k = 0; k < 8; k++) box(2.2, .5, 1500, steelDark, trackX(k), 9.4, 1300);
      [1, 3, 4, 6].forEach((k, j) => {
        const n = 26 + j * 6, z0 = 640 + j * 70;
        for (let c = 0; c < n; c++) {
          box(3.2, 3.6, 13, steelDark, trackX(k), 11.6, z0 + c * 14.5);
          box(2.8, .8, 12, coal, trackX(k), 13.6, z0 + c * 14.5);
        }
      });
    }

    // ── льдины в море: за молом, дальше от берега — больше; медленно дрейфуют ──
    const iceGroup = new THREE.Group();
    {
      const variants = [0, 1, 2].map(v => {
        const s = new THREE.Shape(), n = 14 + v * 3;
        for (let i = 0; i < n; i++) {
          const a = (i + (hash(i, v, 4) - .5) * .6) / n * Math.PI * 2, r = .45 + .55 * hash(i, v, 9);
          i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        const g = new THREE.ExtrudeGeometry(s, { depth: .12, bevelEnabled: false });
        g.rotateX(-Math.PI / 2);
        return g;
      });
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3();
      root.add(iceGroup);
      // Удская губа бо́льшую часть года во льду: за молом — поле льдин, к горизонту крупнее и гуще;
      // в гавани — редкое мелкое крошево (её чистят ледоколы), у причалов и судов чисто
      variants.forEach((geo, vi) => {
        const N = 760, mesh = new THREE.InstancedMesh(geo, iceMat, N);
        let k = 0, tries = 0;
        while (k < N && tries++ < 20000) {
          const x = -4000 + rnd() * 9000, z = -6000 + rnd() * 5600;
          if (z > coastZ(x) - 40) continue;                          // не на берегу
          const inside = Math.hypot((x - 380) / 900, (z + 120) / 720) < 1;
          const nearBerth = x > -120 && x < 820 && z > PLAT_Z - 80 && z < PLAT_Z + 80;
          if (nearBerth || (x > TRESTLE_X - 30 && x < TRESTLE_X + 30 && z > PLAT_Z)) continue;
          if (inside && rnd() > .12) continue;                       // в гавани — редко
          const far = sm(-700, -4000, z);
          const r = inside ? 2 + rnd() * 5 : 6 + rnd() * 26 * (.35 + far * 1.4);
          e.set(0, rnd() * 6.28, 0); q.setFromEuler(e);
          m4.compose(v3.set(x, .4, z), q, new THREE.Vector3(r * (.7 + rnd() * .6), 1 + rnd() * 3, r));
          mesh.setMatrixAt(k++, m4);
        }
        mesh.count = k;
        iceGroup.add(mesh);
      });
    }

    // ── огни: точки с ореолом; отражения — вытянутые дорожки на воде под огнями над морем ──
    const glowMat = new THREE.ShaderMaterial({
      uniforms: { uReveal: { value: 0 }, uScale: { value: 1 }, uTime: { value: 0 } },
      vertexShader: `
        attribute float aSize; attribute vec3 aColor; varying vec3 vC; varying float vA;
        uniform float uScale, uTime;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.);
          gl_PointSize = clamp(aSize * uScale / -mv.z, 3.5, 48.);
          vC = aColor; vA = .85 + .15 * sin(uTime * 2. + position.x * .3);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vC; varying float vA; uniform float uReveal;
        void main() { float d = length(gl_PointCoord - .5) * 2.; float a = exp(-d * d * 5.) + .6 * smoothstep(.25, 0., d);
          gl_FragColor = vec4(vC * a * vA * 1.5 * uReveal, 1.); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const reflMat = new THREE.ShaderMaterial({
      uniforms: { uReveal: { value: 0 }, uTime: { value: 0 } },
      vertexShader: `
        attribute vec3 aCenter, aColor; attribute float aLen; varying vec2 vUv; varying vec3 vC; varying float vSeed;
        void main() {
          vUv = uv; vC = aColor; vSeed = aCenter.x * .13 + aCenter.z * .07;
          vec4 mv = viewMatrix * vec4(aCenter, 1.);
          mv.xy += position.xy * vec2(aLen * .12, aLen);      // дорожка тянется по экрану вниз от огня
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec2 vUv; varying vec3 vC; varying float vSeed; uniform float uReveal, uTime;
        void main() {
          float x = abs(vUv.x - .5) * 2., y = vUv.y;
          float ripple = .55 + .45 * sin(y * 40. + uTime * 3. + vSeed) * sin(y * 13. - uTime * 1.7 + vSeed * 2.);
          float a = (1. - x * x) * smoothstep(0., .25, y) * (1. - smoothstep(.55, 1., y)) * ripple;
          gl_FragColor = vec4(vC * a * .35 * uReveal, 1.);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    {
      const pos = [], size = [], color = [];
      lights.forEach(l => { pos.push(l.x, l.y, l.z); size.push(l.size * 900); color.push(l.c.r, l.c.g, l.c.b); });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
      g.setAttribute('aColor', new THREE.Float32BufferAttribute(color, 3));
      const pts = new THREE.Points(g, glowMat); pts.frustumCulled = false; root.add(pts);

      const sea = lights.filter(l => l.z < coastZ(l.x) - 10);
      const rg = new THREE.InstancedBufferGeometry();
      const quad = new THREE.PlaneGeometry(1, 1); quad.translate(0, -.5, 0);
      rg.index = quad.index; rg.setAttribute('position', quad.attributes.position); rg.setAttribute('uv', quad.attributes.uv);
      rg.setAttribute('aCenter', new THREE.InstancedBufferAttribute(new Float32Array(sea.flatMap(l => [l.x, .3, l.z])), 3));
      rg.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(sea.flatMap(l => [l.c.r, l.c.g, l.c.b])), 3));
      rg.setAttribute('aLen', new THREE.InstancedBufferAttribute(new Float32Array(sea.map(l => 20 + l.y * 1.6)), 1));
      rg.instanceCount = sea.length;
      const refl = new THREE.Mesh(rg, reflMat); refl.frustumCulled = false; refl.renderOrder = 1; root.add(refl);
    }

    // ── камера: медленный пролёт над портом со скроллом. По горизонтали не поворачивается —
    // направление взгляда одно и то же, меняются только положение и наклон ──
    const YAW = Math.atan2(-.42, 1);                         // смотрим с моря на берег, чуть вправо
    const FWD = new THREE.Vector3(Math.sin(YAW), 0, Math.cos(YAW));
    const CENTER = new THREE.Vector3(320, 0, -330);            // середина порта (у причалов), на неё смотрит пролёт
    // начало — близко к причалам, низко; конец — высоко, вид с высоты птичьего полёта.
    // Камера отлетает назад вдоль одной линии и наклоняется так, чтобы середина порта оставалась в кадре
    const NEAR = { back: 470, h: 95 }, FAR = { back: 560, h: 880 };
    const look = new THREE.Vector3(), cpos = new THREE.Vector3();
    function placeCamera(p, time, mx, my) {
      // за 1 (текст про порт уехал) — резкий взлёт: высота растёт в разы, порт быстро уменьшается
      const e = p <= 1 ? p * p * (3 - 2 * p) * .7 + p * .3 : 1 + (p - 1) * 2.2;
      const back = THREE.MathUtils.lerp(NEAR.back, FAR.back, e);
      const h = NEAR.h * Math.pow(FAR.h / NEAR.h, e);             // высота растёт плавно, без рывка в начале
      cpos.copy(CENTER).addScaledVector(FWD, -back); cpos.y = h;
      cpos.x += Math.sin(time * .1) * 4 + (mx - .5) * 30;
      cpos.y += Math.sin(time * .13) * 2 + (my - .5) * 14;
      camera.position.copy(cpos);
      // в начале взгляд ближе к горизонту — над сопками видно небо с сиянием; с подъёмом опускается на порт
      look.copy(CENTER); look.y = 110 * Math.pow(1 - Math.min(1, e), 1.5);
      camera.lookAt(look);
    }

    // ── метель: редкие снежинки перед камерой, сносит ветром ──
    const snowScene = new THREE.Scene(), snowCam = new THREE.PerspectiveCamera(42, 1, .1, 200);
    const snowMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uReveal: { value: 0 }, uScale: { value: 1 } },
      vertexShader: `
        attribute float aSeed; uniform float uTime, uScale; varying float vA;
        void main() {
          // ящик 60×40×70 м перед камерой (в её координатах); снежинка падает, её сносит вбок, ящик повторяется
          vec3 box = vec3(60., 40., 70.);
          vec3 p = position + vec3(uTime * (6. + 4. * aSeed), -uTime * (2.5 + 2. * aSeed), 0.);
          p.x += sin(uTime * (.7 + aSeed) + aSeed * 30.) * 1.5;
          p = mod(p + box * .5, box) - box * .5;
          p.z -= 40.;                                          // перед камерой
          vA = smoothstep(-75., -60., p.z) * (1. - smoothstep(-12., -6., p.z));   // не вплотную и не слишком далеко
          gl_PointSize = clamp((1.2 + aSeed) * 90. * uScale / -p.z, 1., 14.);
          gl_Position = projectionMatrix * vec4(p, 1.);
        }`,
      fragmentShader: `
        varying float vA; uniform float uReveal;
        void main() { float d = length(gl_PointCoord - .5) * 2.; gl_FragColor = vec4(vec3(.85, .88, .95) * exp(-d * d * 3.) * vA * .55 * uReveal, 1.); }`,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    });
    {
      const N = 950, pos = [], sd = [];
      for (let i = 0; i < N; i++) { pos.push((rnd() - .5) * 60, (rnd() - .5) * 40, (rnd() - .5) * 70); sd.push(rnd()); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aSeed', new THREE.Float32BufferAttribute(sd, 1));
      const snow = new THREE.Points(g, snowMat); snow.frustumCulled = false;
      snowScene.add(snow);
    }
    // метель рисуется отдельным слоем поверх любого экрана — начинается ещё до порта
    function renderSnow(alpha, time) {
      snowMat.uniforms.uReveal.value = alpha; snowMat.uniforms.uTime.value = time;
      renderer.autoClear = false;
      renderer.render(snowScene, snowCam);
      renderer.autoClear = true;
    }

    // ── облака: проступают, когда камера поднимается; над причалами и на линии взгляда — просвет.
    // Курсор их расчищает и раздувает край — как туман в начале страницы ──
    const cloudMat = new THREE.ShaderMaterial({
      uniforms: {
        tNoise: { value: noiseTex }, tTrail: { value: null }, uTime: { value: 0 }, uVis: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: `
        attribute float aSeed, aAlpha; varying vec2 vUv; varying float vSeed, vAlpha;
        void main() {
          vUv = uv; vSeed = aSeed;
          vec3 center = instanceMatrix[3].xyz;
          vec2 scale = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
          vec4 mv = modelViewMatrix * vec4(center, 1.);
          mv.xy += position.xy * scale;
          vAlpha = aAlpha * smoothstep(40., .5 * scale.x, -mv.z);   // вплотную к камере облако растворяется
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D tNoise, tTrail; uniform float uTime, uVis; uniform vec2 uRes;
        varying vec2 vUv; varying float vSeed, vAlpha;
        void main() {
          float t = uTime, tr = texture2D(tTrail, gl_FragCoord.xy / uRes).r;
          vec2 dUv = vUv;
          dUv += .28 * (texture2D(tNoise, vUv * .35 + vSeed + vec2(.01 * t, 0.)).r - .5);
          dUv += .14 * (texture2D(tNoise, vUv * .9 + vSeed * 1.7 - vec2(.007 * t)).g - .5);
          dUv += .08 * tr;                                          // курсор раздувает край
          float c = smoothstep(.5, .08, length((dUv - .5) * vec2(1., 1.25)));
          float detail = texture2D(tNoise, vUv * 1.4 + vSeed * 3. + vec2(.008 * t, .004 * t)).b;
          c *= .55 + .7 * detail;
          vec3 col = mix(vec3(.24, .28, .35), vec3(.72, .77, .86), clamp(smoothstep(.15, .85, dUv.y) * .8 + .3 * (detail - .5), 0., 1.));
          gl_FragColor = vec4(col, clamp(c, 0., 1.) * vAlpha * uVis * (1. - .9 * tr));   // курсор расчищает
        }`,
      transparent: true, depthWrite: false,
    });
    const clouds = [];
    {
      const camFar = CENTER.clone().addScaledVector(FWD, -FAR.back); camFar.y = FAR.h;
      const ray = new THREE.Vector3().subVectors(CENTER, camFar).normalize(), tmp = new THREE.Vector3();
      let tries = 0;
      while (clouds.length < 150 && tries++ < 10000) {
        const c = new THREE.Vector3(CENTER.x + (rnd() - .5) * 2600, 220 + rnd() * 360, CENTER.z + (rnd() - .5) * 2600);
        // над самими причалами и на луче взгляда к ним — просвет, по краям кадра облака есть
        if (Math.hypot(c.x - CENTER.x, c.z - CENTER.z) < 260) continue;
        tmp.subVectors(c, camFar); const along = tmp.dot(ray);
        if (along > 0 && tmp.addScaledVector(ray, -along).length() < 190) continue;
        const sx = 180 + rnd() * 320;
        clouds.push({ p: c, sx, sy: sx * (.45 + rnd() * .2), a: .5 + rnd() * .35, seed: rnd() * 10 });
      }
    }
    const cloudGeo = new THREE.PlaneGeometry(1, 1);
    const cSeed = new THREE.InstancedBufferAttribute(new Float32Array(clouds.length), 1);
    const cAlpha = new THREE.InstancedBufferAttribute(new Float32Array(clouds.length), 1);
    cloudGeo.setAttribute('aSeed', cSeed); cloudGeo.setAttribute('aAlpha', cAlpha);
    const cloudMesh = new THREE.InstancedMesh(cloudGeo, cloudMat, clouds.length);
    cloudMesh.frustumCulled = false; cloudMesh.renderOrder = 3; scene.add(cloudMesh);
    const cm = new THREE.Matrix4(), order = clouds.map((_, i) => i);
    // ветер: облака плывут вправо относительно камеры — туда же, куда сносит метель; уйдя за край полосы,
    // облако гаснет и появляется с другой стороны; над самими причалами становится прозрачным
    const WIND_DIR = new THREE.Vector3(-FWD.z, 0, FWD.x), WIND = 14, SPAN = 1500;
    const cpos3 = new THREE.Vector3();
    function updateClouds(time) {
      clouds.forEach(c => {
        const s0 = (c.p.x - CENTER.x) * WIND_DIR.x + (c.p.z - CENTER.z) * WIND_DIR.z;
        const s = ((s0 + time * WIND + SPAN) % (2 * SPAN) + 2 * SPAN) % (2 * SPAN) - SPAN;
        cpos3.copy(c.p).addScaledVector(WIND_DIR, s - s0);
        c.cx = cpos3.x; c.cz = cpos3.z;
        const overPort = Math.hypot(c.cx - CENTER.x, c.cz - CENTER.z);
        c.ca = c.a * (1 - sm(SPAN * .8, SPAN, Math.abs(s))) * (.25 + .75 * sm(200, 420, overPort));
        c.d = camera.position.distanceToSquared(cpos3);
      });
      order.sort((a, b) => clouds[b].d - clouds[a].d);          // от дальних к ближним — прозрачность ложится правильно
      order.forEach((i, slot) => {
        const c = clouds[i];
        cm.makeScale(c.sx, c.sy, 1).setPosition(c.cx, c.p.y, c.cz);
        cloudMesh.setMatrixAt(slot, cm); cSeed.array[slot] = c.seed; cAlpha.array[slot] = c.ca;
      });
      cloudMesh.instanceMatrix.needsUpdate = true; cSeed.needsUpdate = cAlpha.needsUpdate = true;
    }

    function resize(w, h) {
      camera.aspect = w / h; camera.updateProjectionMatrix();
      snowCam.aspect = w / h; snowCam.updateProjectionMatrix();
      cloudMat.uniforms.uRes.value.copy(renderer.getDrawingBufferSize(new THREE.Vector2()));
      glowMat.uniforms.uScale.value = h / 900 * renderer.getPixelRatio();
      snowMat.uniforms.uScale.value = h / 900 * renderer.getPixelRatio();
    }

    function render(reveal, p, time, mx, my, trail) {
      placeCamera(Math.min(1.5, Math.max(0, p)), time, mx, my);   // после 1 — взлёт к шару
      sky.position.copy(camera.position);
      skyMat.uniforms.uTime.value = time; skyMat.uniforms.uReveal.value = reveal;
      // чем выше камера, тем больше света — с высоты порт не проваливается в темноту
      const lift = 1 + .7 * sm(120, 880, camera.position.y);
      hemi.intensity = LIGHTS.hemi * reveal * lift; moon.intensity = LIGHTS.moon * reveal * lift; warm.intensity = LIGHTS.warm * reveal;
      waterMat.uniforms.uTime.value = time; waterMat.uniforms.uReveal.value = reveal; waterMat.uniforms.uCam.value.copy(camera.position);
      glowMat.uniforms.uReveal.value = sm(.25, 1, reveal); glowMat.uniforms.uTime.value = time;
      reflMat.uniforms.uReveal.value = sm(.25, 1, reveal); reflMat.uniforms.uTime.value = time;
      // облака проступают по мере подъёма камеры
      cloudMat.uniforms.uVis.value = reveal * sm(260, 760, camera.position.y);
      cloudMat.uniforms.uTime.value = time; cloudMat.uniforms.tTrail.value = trail || null;
      cloudMesh.visible = cloudMat.uniforms.uVis.value > .001;
      if (cloudMesh.visible) updateClouds(time);
      iceGroup.position.set(Math.sin(time * .03) * 25, 0, Math.cos(time * .025) * 15);   // льдины дрейфуют
      scene.background = BG.clone().multiplyScalar(.4 + .6 * reveal);
      renderer.render(scene, camera);
    }

    return { render, renderSnow, resize };
  }
  return { create };
})();
