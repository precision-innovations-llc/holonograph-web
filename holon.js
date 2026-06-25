// holon.js — generative "multidimensional scan" background for Holonograph.
//
// A spinning data-cube. Its 12 edges are drawn brighter to read as a frame, and
// it sits INSIDE the viewport so you see it from outside and into it. Colour-zoned
// node clusters are THIN ORGANIC SLABS plastered to the cube walls (defining the
// surfaces, not cubes-in-a-cube). Nodes snap across several tightly-packed grids
// (not one), so they pack tight and reveal fine structure. Their glow runs along
// the grid lines and THICKENS where nodes crowd. Mycelium strands thread inward to
// other clusters; a FEW tiny fast sparks (muon-style detections) skip along them.
//
// Desktop only. Mobile / reduced-motion / no-WebGL fall back to the static image.

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

// ───────────────────────────── CONFIG (tweak freely) ─────────────────────────
const CONFIG = {
  half: 9,                       // cube half-size
  snapSteps: [0.5, 0.75, 1.0],   // several tightly-packed grids nodes can land on

  // the grid system: faint grey lattices whose lines FADE to zero in random
  // windows, so we see pieces of the grids — never a clean full cube / hard edges.
  grids: [
    { divisions: 18, grey: 0.27, keep: 0.22 }, // fine grid — only ~22% of lines, sparse hint
    { divisions: 8,  grey: 0.18, keep: 0.4 },  // coarse grid — carries the cube hint
  ],

  clusters: 16,
  pointsPerCluster: [90, 170],
  slabThin: [0.3, 0.85],         // thickness perpendicular to the wall (THIN)
  slabWide: [2.2, 4.3],          // spread along the wall (WIDE organic patch)
  slabSkew: 0.14,                // oblique lean of the slab
  tendrilFrac: 0.3,              // fraction of nodes that root inward (mycelium)
  tendrilReach: 5.0,

  coreSize: 0.05, coreBright: 1.1,
  sheathBase: 0.6,               // sheath brightness for a lone node
  sheathDenseBoost: 1.0,         // extra brightness at full local density
  sheathLenCells: [0.8, 1.7],    // glow length in units of the node's own grid step
  densityRadius: 1.3, densityMax: 13, // local-density normalisation

  // organic straight vectors fired from the bright cluster cores toward other
  // clusters. length × direction decide whether they arrive; reaching lines are
  // coloured source→dest with a dark no-man's-land gap, and carry sporadic pulses.
  emittersPerCluster: 2,         // origin points scattered around each cluster core
  emitterJitter: 1.0,            // how far the emitters spread (kept inside the cube)
  blastShots: [6, 12],           // many SHORT shotgun shots per cluster (most go nowhere)
  blastLen: [1.0, 4.0],          // short shot length (world units) — not full-length beams
  aimedShots: [2, 4],            // long shots aimed at other clusters (only a few reach)
  rayJitter: 0.32,               // angular wobble (rad) on aimed shots — bigger = more misses
  rayLen: [0.55, 1.12],          // aimed length as a fraction of distance to the target
  arriveRadius: 1.7,             // how close the tip must land to count as "reached"
  lineBright: 0.85,
  lineGap: 0.36,                 // fade length from each end of a connector (dark middle)
  stubFade: 0.7,                 // where an unreached shot fades to nothing
  sparkWait: [0.4, 3.5],         // sporadic gap between a connector's pulses (s)
  sparkTravel: [0.6, 1.5],       // pulse speed (fraction of line / s)
  sparkSize: 0.11,

  bloom: { strength: 1.1, radius: 0.55, threshold: 0.0 },

  camDist: 21, fov: 55,          // pulled back → whole cube sits inside the frame
  spin: 0.05, fog: [14, 50],
};

// ───────────────────────────── boot guards ──────────────────────────────────
const canvas = document.getElementById("holon");
const reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
const smallMQ = window.matchMedia("(max-width: 900px)");
function webglOK() {
  try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"))); }
  catch (e) { return false; }
}
const shouldRun = () => !!canvas && !reduceMQ.matches && !smallMQ.matches && webglOK();
let started = false;
function maybeStart() {
  if (started || !shouldRun()) { if (!webglOK()) document.documentElement.classList.add("no-webgl"); return; }
  started = true; start();
}

// ───────────────────────────── helpers ──────────────────────────────────────
function makeSprite() {
  const s = 64, c = document.createElement("canvas"); c.width = c.height = s;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,255,255,0.6)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
const rand = (a, b) => a + Math.random() * (b - a);
const irand = (a, b) => Math.round(rand(a, b));
function gauss(scale) { return ((Math.random() + Math.random() + Math.random()) / 3 - 0.5) * 2 * scale; }
const axisVec = (a, s) => new THREE.Vector3(a === 0 ? s : 0, a === 1 ? s : 0, a === 2 ? s : 0);
// the grid is only HINTED: most lines aren't drawn at all (big empty regions),
// and the kept ones appear as short fragments that fade to true zero at both ends
function makeFragmentedGrid(half, divisions, grey, keep) {
  const step = (half * 2) / divisions, pos = [], col = [], SUB = 9;
  const push2 = (a, b, ba, bb) => { pos.push(a[0], a[1], a[2], b[0], b[1], b[2]); col.push(ba, ba, ba * 1.18, bb, bb, bb * 1.18); };
  for (let dir = 0; dir < 3; dir++) {
    const o = [0, 1, 2].filter((a) => a !== dir);
    for (let i = 0; i <= divisions; i++) for (let j = 0; j <= divisions; j++) {
      if (Math.random() > keep) continue;                 // most lines: not drawn → real gaps
      const v = [0, 0, 0]; v[o[0]] = -half + i * step; v[o[1]] = -half + j * step;
      const frags = Math.random() < 0.22 ? 2 : 1;
      for (let f = 0; f < frags; f++) {
        const lineMax = grey * rand(0.4, 1.0);
        const hl = rand(0.04, 0.15), c = rand(hl, 1 - hl); // a short fragment somewhere on the line
        let prev = null, prevBr = 0;
        for (let s = 0; s <= SUB; s++) {
          const t = (c - hl) + 2 * hl * (s / SUB);
          const br = lineMax * Math.sin((s / SUB) * Math.PI); // 0 at both ends → fades to nothing
          v[dir] = -half + t * half * 2;
          const cur = [v[0], v[1], v[2]];
          if (prev) push2(prev, cur, prevBr, br);
          prev = cur; prevBr = br;
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }));
}

// ───────────────────────────── scene build ──────────────────────────────────
function start() {
  const sprite = makeSprite();
  const H = CONFIG.half;
  const clamp = (v) => Math.max(-H, Math.min(H, v));

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x04030c, CONFIG.fog[0], CONFIG.fog[1]);
  const camera = new THREE.PerspectiveCamera(CONFIG.fov, 1, 0.1, 100);
  camera.position.set(0, 1.0, CONFIG.camDist);
  const world = new THREE.Group();
  world.rotation.set(0.28, 0.5, 0);
  scene.add(world);

  // fragmented grey grid system (no explicit cube frame — the cube is only implied)
  for (const G of CONFIG.grids) world.add(makeFragmentedGrid(H, G.divisions, G.grey, G.keep));

  function zoneColor(a) {
    const up = a.y / H;
    const set = up > 0.2 ? [0xe879f9, 0xa78bfa, 0xc4b5fd] : up < -0.2 ? [0xfcd34d, 0xf0abfc] : [0x7dd3fc, 0x818cf8, 0xe879f9];
    return new THREE.Color(set[(Math.random() * set.length) | 0]);
  }
  // snap a point onto a grid LINE on one of several tightly-packed grids
  function snapToLine(p) {
    const step = CONFIG.snapSteps[(Math.random() * CONFIG.snapSteps.length) | 0];
    const free = (Math.random() * 3) | 0, s = (v) => Math.round(v / step) * step;
    if (free !== 0) p.x = clamp(s(p.x));
    if (free !== 1) p.y = clamp(s(p.y));
    if (free !== 2) p.z = clamp(s(p.z));
    p[["x", "y", "z"][free]] = clamp(p[["x", "y", "z"][free]]);
    return { free, step };
  }

  // ── clusters as thin organic slabs plastered to the walls ───────────────────
  const nodes = [];     // {pos, color, free, step, density}
  const anchors = [];   // cluster centroids → mycelium endpoints
  for (let ci = 0; ci < CONFIG.clusters; ci++) {
    const nAxis = (Math.random() * 3) | 0;          // wall normal axis
    const sign = Math.random() < 0.5 ? -1 : 1;       // which wall
    const ip = [0, 1, 2].filter((a) => a !== nAxis); // in-plane axes
    const center = new THREE.Vector3();
    center.setComponent(nAxis, sign * H);
    center.setComponent(ip[0], rand(-H * 0.62, H * 0.62));
    center.setComponent(ip[1], rand(-H * 0.62, H * 0.62));
    const color = zoneColor(center);
    anchors.push({ pos: center.clone(), color, idx: ci });

    const sigN = rand(CONFIG.slabThin[0], CONFIG.slabThin[1]);   // thin (perp to wall)
    const sigP = rand(CONFIG.slabWide[0], CONFIG.slabWide[1]);   // wide (along wall)
    const count = irand(CONFIG.pointsPerCluster[0], CONFIG.pointsPerCluster[1]);
    for (let j = 0; j < count; j++) {
      const off = new THREE.Vector3();
      off.setComponent(nAxis, -sign * Math.abs(gauss(sigN)));     // hug wall, lean inward
      const u = gauss(sigP), v = gauss(sigP);
      off.setComponent(ip[0], u);
      off.setComponent(ip[1], v);
      off.setComponent(nAxis, off.getComponent(nAxis) + u * rand(-CONFIG.slabSkew, CONFIG.slabSkew)); // oblique
      const p = center.clone().add(off);
      if (Math.random() < CONFIG.tendrilFrac) p.addScaledVector(axisVec(nAxis, -sign), rand(0, CONFIG.tendrilReach)); // root inward
      const { free, step } = snapToLine(p);
      nodes.push({ pos: p, color: color.clone().multiplyScalar(rand(0.72, 1.05)), free, step, density: 0 });
    }
  }

  // ── local density (spatial hash) → drives sheath thickening ─────────────────
  const DC = CONFIG.densityRadius, dh = new Map();
  const dk = (x, y, z) => `${Math.floor(x / DC)},${Math.floor(y / DC)},${Math.floor(z / DC)}`;
  for (const nd of nodes) { const k = dk(nd.pos.x, nd.pos.y, nd.pos.z); let a = dh.get(k); if (!a) { a = []; dh.set(k, a); } a.push(nd); }
  for (const nd of nodes) {
    let cnt = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const a = dh.get(dk(nd.pos.x + dx * DC, nd.pos.y + dy * DC, nd.pos.z + dz * DC));
      if (!a) continue;
      for (const o of a) { if (o !== nd && nd.pos.distanceToSquared(o.pos) < DC * DC) cnt++; }
    }
    nd.density = Math.min(1, cnt / CONFIG.densityMax);
  }

  // ── node cores (size/brightness rise with density) ──────────────────────────
  const nPos = new Float32Array(nodes.length * 3), nCol = new Float32Array(nodes.length * 3);
  nodes.forEach((nd, i) => {
    const b = CONFIG.coreBright * (0.7 + 0.6 * nd.density);
    nPos[i * 3] = nd.pos.x; nPos[i * 3 + 1] = nd.pos.y; nPos[i * 3 + 2] = nd.pos.z;
    nCol[i * 3] = nd.color.r * b; nCol[i * 3 + 1] = nd.color.g * b; nCol[i * 3 + 2] = nd.color.b * b;
  });
  const coreGeo = new THREE.BufferGeometry();
  coreGeo.setAttribute("position", new THREE.BufferAttribute(nPos, 3));
  coreGeo.setAttribute("color", new THREE.BufferAttribute(nCol, 3));
  world.add(new THREE.Points(coreGeo, new THREE.PointsMaterial({ size: CONFIG.coreSize, map: sprite, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })));

  // ── sheaths: glow along grid lines, THICKER (more arms + brighter) when dense ─
  const shPos = [], shCol = [];
  const addSheath = (from, ax, dir, len, col, b) => {
    const e = from.clone().add(axisVec(ax, dir * len));
    e.x = clamp(e.x); e.y = clamp(e.y); e.z = clamp(e.z); // never extend beyond the cube
    shPos.push(from.x, from.y, from.z, e.x, e.y, e.z);
    shCol.push(col.r * b, col.g * b, col.b * b, 0, 0, 0);
  };
  for (const nd of nodes) {
    const b = CONFIG.sheathBase + CONFIG.sheathDenseBoost * nd.density;
    const len = nd.step * rand(CONFIG.sheathLenCells[0], CONFIG.sheathLenCells[1]) * (1 + 0.4 * nd.density);
    addSheath(nd.pos, nd.free, 1, len, nd.color, b);
    addSheath(nd.pos, nd.free, -1, len, nd.color, b);
    // perpendicular arms — more of them where it's dense (thicker bundle)
    const perps = [0, 1, 2].filter((a) => a !== nd.free);
    const arms = 1 + Math.round(nd.density * 2);
    for (let a = 0; a < arms; a++) {
      const pa = perps[(Math.random() * perps.length) | 0];
      addSheath(nd.pos, pa, Math.random() < 0.5 ? 1 : -1, nd.step * rand(0.4, 0.9), nd.color, b * 0.7);
    }
  }
  const shGeo = new THREE.BufferGeometry();
  shGeo.setAttribute("position", new THREE.Float32BufferAttribute(shPos, 3));
  shGeo.setAttribute("color", new THREE.Float32BufferAttribute(shCol, 3));
  world.add(new THREE.LineSegments(shGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92, depthWrite: false, blending: THREE.AdditiveBlending })));

  // ── organic vectors: a SHOTGUN of short shots per cluster; only a few aimed
  //    shots reach another cluster (connectors). All points kept inside the cube. ─
  const SEGO = 16, connectors = [], orgPos = [], orgCol = [], tmpP = new THREE.Vector3();
  const clampV = (p) => { p.x = Math.max(-H, Math.min(H, p.x)); p.y = Math.max(-H, Math.min(H, p.y)); p.z = Math.max(-H, Math.min(H, p.z)); return p; };
  const pushOrg = (a, b, ca, cb) => { orgPos.push(a.x, a.y, a.z, b.x, b.y, b.z); orgCol.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2]); };
  const jitterDir = (base, angle) => {
    const r = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1));
    const perp = new THREE.Vector3().crossVectors(base, r);
    if (perp.lengthSq() < 1e-6) perp.set(1, 0, 0); else perp.normalize();
    return base.clone().applyAxisAngle(perp, angle);
  };
  const buildStub = (a, end, col) => {
    let prev = null, prevC = null;
    for (let s = 0; s <= SEGO; s++) {
      const t = s / SEGO; tmpP.lerpVectors(a, end, t);
      const glow = Math.max(0, 1 - t / CONFIG.stubFade) * CONFIG.lineBright;
      const c = [col.r * glow, col.g * glow, col.b * glow];
      if (prev) pushOrg(prev, tmpP, prevC, c);
      prev = tmpP.clone(); prevC = c;
    }
  };
  const buildConnector = (a, b, ca, cb) => {
    const gap = CONFIG.lineGap, B = CONFIG.lineBright;
    let prev = null, prevC = null;
    for (let s = 0; s <= SEGO; s++) {
      const t = s / SEGO; tmpP.lerpVectors(a, b, t);
      const sg = Math.max(0, 1 - t / gap), dg = Math.max(0, (t - (1 - gap)) / gap);
      const c = [(ca.r * sg + cb.r * dg) * B, (ca.g * sg + cb.g * dg) * B, (ca.b * sg + cb.b * dg) * B];
      if (prev) pushOrg(prev, tmpP, prevC, c);
      prev = tmpP.clone(); prevC = c;
    }
    connectors.push({ a: a.clone(), b: b.clone(), ca: ca.clone(), cb: cb.clone() });
  };
  for (const ac of anchors) {
    const emitters = [];
    for (let e = 0; e < CONFIG.emittersPerCluster; e++)
      emitters.push(clampV(ac.pos.clone().add(new THREE.Vector3(gauss(CONFIG.emitterJitter), gauss(CONFIG.emitterJitter), gauss(CONFIG.emitterJitter)))));
    const pick = () => emitters[(Math.random() * emitters.length) | 0];

    // shotgun: many short shots in random directions (the blast — most go nowhere)
    const shots = irand(CONFIG.blastShots[0], CONFIG.blastShots[1]);
    for (let s = 0; s < shots; s++) {
      const o = pick();
      const dir = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
      const end = clampV(o.clone().addScaledVector(dir, rand(CONFIG.blastLen[0], CONFIG.blastLen[1])));
      buildStub(o, end, ac.color);
    }

    // aimed long shots: only the ones with enough length + small jitter reach → connectors
    const aimed = irand(CONFIG.aimedShots[0], CONFIG.aimedShots[1]);
    for (let r = 0; r < aimed; r++) {
      const o = pick();
      const tgt = anchors[(Math.random() * anchors.length) | 0];
      if (tgt.idx === ac.idx) continue;
      const to = tgt.pos.clone().sub(o); const dist = to.length(); if (dist < 0.5) continue;
      const dir = jitterDir(to.multiplyScalar(1 / dist), gauss(CONFIG.rayJitter));
      const lf = rand(CONFIG.rayLen[0], CONFIG.rayLen[1]);
      const end = o.clone().addScaledVector(dir, dist * lf);
      if (lf >= 0.85 && end.distanceTo(tgt.pos) < CONFIG.arriveRadius) buildConnector(o, tgt.pos, ac.color, tgt.color);
      else buildStub(o, clampV(end), ac.color);
    }
  }
  if (orgPos.length) {
    const orgGeo = new THREE.BufferGeometry();
    orgGeo.setAttribute("position", new THREE.Float32BufferAttribute(orgPos, 3));
    orgGeo.setAttribute("color", new THREE.Float32BufferAttribute(orgCol, 3));
    world.add(new THREE.LineSegments(orgGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending })));
  }

  // ── sporadic pulses on the connectors (colour-shift, do NOT fade in the gap) ──
  const nS = connectors.length;
  const sparks = [];
  for (let i = 0; i < nS; i++) sparks.push({ active: Math.random() < 0.3, t: 0, wait: rand(0, CONFIG.sparkWait[1]), speed: rand(CONFIG.sparkTravel[0], CONFIG.sparkTravel[1]), phase: Math.random() * 6.28 });
  const spPos = new Float32Array(Math.max(1, nS) * 3), spCol = new Float32Array(Math.max(1, nS) * 3);
  const spGeo = new THREE.BufferGeometry();
  spGeo.setAttribute("position", new THREE.BufferAttribute(spPos, 3).setUsage(THREE.DynamicDrawUsage));
  spGeo.setAttribute("color", new THREE.BufferAttribute(spCol, 3).setUsage(THREE.DynamicDrawUsage));
  world.add(new THREE.Points(spGeo, new THREE.PointsMaterial({ size: CONFIG.sparkSize, map: sprite, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })));

  // ── post-processing ──────────────────────────────────────────────────────────
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), CONFIG.bloom.strength, CONFIG.bloom.radius, CONFIG.bloom.threshold);
  composer.addPass(bloom);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false); composer.setSize(w, h); bloom.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize); resize();

  // ── animation loop ───────────────────────────────────────────────────────────
  const clock = new THREE.Clock();
  const pos = new THREE.Vector3();
  let running = true;
  document.addEventListener("visibilitychange", () => { running = !document.hidden; if (running) { clock.getDelta(); loop(); } });

  function loop() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    world.rotation.y += CONFIG.spin * dt;
    for (let i = 0; i < nS; i++) {
      const sp = sparks[i], cn = connectors[i];
      if (!sp.active) {                                   // sporadic: idle, then fire
        sp.wait -= dt;
        if (sp.wait <= 0) { sp.active = true; sp.t = 0; sp.speed = rand(CONFIG.sparkTravel[0], CONFIG.sparkTravel[1]); }
        spCol[i * 3] = spCol[i * 3 + 1] = spCol[i * 3 + 2] = 0;
        continue;
      }
      sp.t += sp.speed * dt;
      if (sp.t >= 1) { sp.active = false; sp.wait = rand(CONFIG.sparkWait[0], CONFIG.sparkWait[1]); spCol[i * 3] = spCol[i * 3 + 1] = spCol[i * 3 + 2] = 0; continue; }
      pos.lerpVectors(cn.a, cn.b, sp.t);
      spPos[i * 3] = pos.x; spPos[i * 3 + 1] = pos.y; spPos[i * 3 + 2] = pos.z;
      // colour shifts source→dest, full brightness across (does NOT fade in the gap)
      const tc = sp.t * sp.t * (3 - 2 * sp.t), tw = 0.8 + 0.2 * Math.sin(t * 40 + sp.phase);
      spCol[i * 3] = (cn.ca.r + (cn.cb.r - cn.ca.r) * tc) * tw;
      spCol[i * 3 + 1] = (cn.ca.g + (cn.cb.g - cn.ca.g) * tc) * tw;
      spCol[i * 3 + 2] = (cn.ca.b + (cn.cb.b - cn.ca.b) * tc) * tw;
    }
    spGeo.attributes.position.needsUpdate = true; spGeo.attributes.color.needsUpdate = true;
    composer.render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(() => { canvas.classList.add("ready"); });
  loop();

  const onPref = () => { if (!shouldRun()) { running = false; canvas.classList.remove("ready"); } };
  reduceMQ.addEventListener && reduceMQ.addEventListener("change", onPref);
  smallMQ.addEventListener && smallMQ.addEventListener("change", onPref);
}

maybeStart();
smallMQ.addEventListener && smallMQ.addEventListener("change", maybeStart);
reduceMQ.addEventListener && reduceMQ.addEventListener("change", maybeStart);
