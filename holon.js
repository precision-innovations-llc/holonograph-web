// holon.js — generative "multidimensional scan" background for Holonograph.
//
// A spinning data-cube hinted by fragmented grids. Colour-zoned node clusters are
// thin organic slabs on the walls; their glow runs along the grid lines and
// thickens with density. Each cluster fires a shotgun of short vectors plus a few
// aimed shots; the ones that reach another cluster (connectors) fade to zero in the
// no-man's-land middle and carry sporadic, colour-shifting pulses.
//
// Tuner: append ?tune to the URL for an on-screen control panel (dev only).
// Runs on desktop AND mobile; reduced-motion / no-WebGL fall back to the static image.

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

// ───────────────────────────── CONFIG (tweak freely / via ?tune) ─────────────
const CONFIG = {
  half: 9,
  snapSteps: [0.5, 0.75, 1.0],

  grids: [
    { divisions: 18, grey: 0.3,  keep: 0.5 },  // fine grid — sparse hint
    { divisions: 8,  grey: 0.18, keep: 0.76 }, // coarse grid — carries the cube hint
  ],

  clusters: 21,
  pointsPerCluster: [90, 170],
  slabThin: [0.5, 1.1],
  slabWide: [2.2, 4.3],
  slabSkew: 0.14,
  tendrilFrac: 0.3,
  tendrilReach: 5.0,

  coreSize: 0.05, coreBright: 1.1,
  sheathBase: 0.6,
  sheathDenseBoost: 1.25,
  sheathLenCells: [0.8, 1.7],
  densityRadius: 1.3, densityMax: 13,

  // organic vectors fired from the bright cluster cores
  emittersPerCluster: 2,
  emitterJitter: 1.0,
  blastShots: [12, 10],
  blastLen: [1.0, 4.0],
  aimedShots: [2, 4],
  rayJitter: 0.32,
  rayLen: [0.55, 1.12],
  arriveRadius: 1.7,
  lineBright: 0.85,
  lineGap: 0.36,
  stubFade: 0.7,

  // travelling pulses (live-tunable)
  sparkSize: 0.115,
  sparkSpeed: 1.45,      // fraction of the line per second
  sparkEase: 0.5,        // 0 = linear travel, 1 = full smoothstep ease in/out
  sparkWait: [0.4, 3.3], // sporadic idle gap between a connector's pulses (s)

  bloom: { strength: 1.7, radius: 0.85, threshold: 0.0 },

  camDist: 21, fov: 55,
  spin: 0.145, fog: [14, 50],

  // drag left/right to spin; release flings with momentum, and resistance decays
  // the fling back to the ambient spin (the released velocity is the fastest point).
  dragSpinSens: 0.005,   // radians of spin per pixel dragged
  spinFriction: 1.7,     // how fast a fling decays back toward the ambient spin
  maxFling: 2.4,         // cap on fling speed (rad/s)

  // cursor highlight: brighten the nodes nearest the pointer (replaces the halo)
  highlightRadius: 130,  // screen px
  highlightStrength: 1.7,
};

const ZONES = [
  { c: [-5.5, 3.5, 1.5],  cols: [0xa78bfa, 0xc4b5fd, 0xe879f9] },
  { c: [6.0, -2.0, -3.0], cols: [0xfcd34d, 0xf0abfc] },
  { c: [1.5, -4.5, 4.0],  cols: [0x7dd3fc, 0x818cf8] },
  { c: [3.0, 5.0, -4.5],  cols: [0xe879f9, 0xa78bfa] },
];

// ───────────────────────────── boot guards ──────────────────────────────────
const canvas = document.getElementById("holon");
const reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
const smallMQ = window.matchMedia("(max-width: 900px)");
function webglOK() {
  try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"))); }
  catch (e) { return false; }
}
// runs wherever WebGL is available (desktop + mobile). Reduced-motion renders a
// STATIC frame (no animation loop); only missing WebGL falls back to the image.
const shouldRun = () => !!canvas && webglOK();
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

function makeFragmentedGrid(half, divisions, grey, keep) {
  const step = (half * 2) / divisions, pos = [], col = [], SUB = 9;
  const push2 = (a, b, ba, bb) => { pos.push(a[0], a[1], a[2], b[0], b[1], b[2]); col.push(ba, ba, ba * 1.18, bb, bb, bb * 1.18); };
  for (let dir = 0; dir < 3; dir++) {
    const o = [0, 1, 2].filter((a) => a !== dir);
    for (let i = 0; i <= divisions; i++) for (let j = 0; j <= divisions; j++) {
      if (Math.random() > keep) continue;
      const v = [0, 0, 0]; v[o[0]] = -half + i * step; v[o[1]] = -half + j * step;
      const frags = Math.random() < 0.22 ? 2 : 1;
      for (let f = 0; f < frags; f++) {
        const lineMax = grey * rand(0.4, 1.0);
        const hl = rand(0.04, 0.15), c = rand(hl, 1 - hl);
        let prev = null, prevBr = 0;
        for (let s = 0; s <= SUB; s++) {
          const t = (c - hl) + 2 * hl * (s / SUB);
          const br = lineMax * Math.sin((s / SUB) * Math.PI);
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

// ───────────────────────────── main ─────────────────────────────────────────
function start() {
  const sprite = makeSprite();
  const H = CONFIG.half;
  const clamp = (v) => Math.max(-H, Math.min(H, v));
  const clampV = (p) => { p.x = clamp(p.x); p.y = clamp(p.y); p.z = clamp(p.z); return p; };

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

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), CONFIG.bloom.strength, CONFIG.bloom.radius, CONFIG.bloom.threshold);
  composer.addPass(bloom);

  // ── interaction: drag L/R to spin (fling + resistance); cursor highlights nodes ──
  let dragging = false, lastX = 0, lastMoveT = 0;
  let mxPx = -1, myPx = -1, mouseOn = false; // cursor in screen px for the node highlight
  const interactive = (el) => el && el.closest && el.closest("a, button, input, textarea, .contact-panel");
  window.addEventListener("pointerdown", (e) => {
    if (interactive(e.target)) return;
    dragging = true; lastX = e.clientX; lastMoveT = performance.now();
    document.body.style.cursor = "grabbing";
  });
  window.addEventListener("pointermove", (e) => {
    mxPx = e.clientX; myPx = e.clientY; mouseOn = true;
    if (!dragging) return;
    const now = performance.now(), ddt = Math.max(8, now - lastMoveT) / 1000, dx = e.clientX - lastX;
    world.rotation.y += dx * CONFIG.dragSpinSens;                        // drag spins directly
    angVelY = Math.max(-CONFIG.maxFling, Math.min(CONFIG.maxFling, (dx * CONFIG.dragSpinSens) / ddt)); // release velocity
    lastX = e.clientX; lastMoveT = now;
  }, { passive: true });
  const endDrag = () => { dragging = false; document.body.style.cursor = ""; };
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
  window.addEventListener("pointerout", (e) => { if (!e.relatedTarget) mouseOn = false; });

  // ── rebuildable scene content (the GUI calls rebuild() on structural edits) ──
  let swarmMat, spMat, spGeo, spPos, spCol, sparks = [], connectors = [], nS = 0;
  let coreGeo, coreCol, coreBase, nodePos, nodeCount = 0; // dynamic cores → cursor highlight
  let angVelY = CONFIG.spin;                              // live spin speed, decays to CONFIG.spin

  function clearWorld() {
    for (let i = world.children.length - 1; i >= 0; i--) {
      const c = world.children[i];
      world.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }
  }

  function rebuild() {
    clearWorld();

    for (const G of CONFIG.grids) world.add(makeFragmentedGrid(H, G.divisions, G.grey, G.keep));

    // clusters as thin organic wall-slabs
    const nodes = [], anchors = [];
    for (let ci = 0; ci < CONFIG.clusters; ci++) {
      const nAxis = (Math.random() * 3) | 0, sign = Math.random() < 0.5 ? -1 : 1, ip = [0, 1, 2].filter((a) => a !== nAxis);
      const center = new THREE.Vector3();
      center.setComponent(nAxis, sign * H);
      center.setComponent(ip[0], rand(-H * 0.62, H * 0.62));
      center.setComponent(ip[1], rand(-H * 0.62, H * 0.62));
      const set = center.y / H > 0.2 ? [0xe879f9, 0xa78bfa, 0xc4b5fd] : center.y / H < -0.2 ? [0xfcd34d, 0xf0abfc] : [0x7dd3fc, 0x818cf8, 0xe879f9];
      const color = new THREE.Color(set[(Math.random() * set.length) | 0]);
      anchors.push({ pos: center.clone(), color, idx: ci });
      const sigN = rand(CONFIG.slabThin[0], CONFIG.slabThin[1]), sigP = rand(CONFIG.slabWide[0], CONFIG.slabWide[1]);
      const count = irand(CONFIG.pointsPerCluster[0], CONFIG.pointsPerCluster[1]);
      for (let j = 0; j < count; j++) {
        const off = new THREE.Vector3();
        off.setComponent(nAxis, -sign * Math.abs(gauss(sigN)));
        const u = gauss(sigP), v = gauss(sigP);
        off.setComponent(ip[0], u); off.setComponent(ip[1], v);
        off.setComponent(nAxis, off.getComponent(nAxis) + u * rand(-CONFIG.slabSkew, CONFIG.slabSkew));
        const p = center.clone().add(off);
        if (Math.random() < CONFIG.tendrilFrac) p.addScaledVector(axisVec(nAxis, -sign), rand(0, CONFIG.tendrilReach));
        // snap onto a grid line (2 coords snapped to one of several fine grids)
        const step = CONFIG.snapSteps[(Math.random() * CONFIG.snapSteps.length) | 0], free = (Math.random() * 3) | 0, sn = (x) => Math.round(x / step) * step;
        if (free !== 0) p.x = clamp(sn(p.x)); if (free !== 1) p.y = clamp(sn(p.y)); if (free !== 2) p.z = clamp(sn(p.z));
        p.x = clamp(p.x); p.y = clamp(p.y); p.z = clamp(p.z);
        nodes.push({ pos: p, color: color.clone().multiplyScalar(rand(0.72, 1.05)), free, step });
      }
    }

    // local density → sheath thickening
    const DC = CONFIG.densityRadius, dh = new Map(), dk = (x, y, z) => `${Math.floor(x / DC)},${Math.floor(y / DC)},${Math.floor(z / DC)}`;
    for (const nd of nodes) { const k = dk(nd.pos.x, nd.pos.y, nd.pos.z); let a = dh.get(k); if (!a) { a = []; dh.set(k, a); } a.push(nd); }
    for (const nd of nodes) {
      let cnt = 0;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const a = dh.get(dk(nd.pos.x + dx * DC, nd.pos.y + dy * DC, nd.pos.z + dz * DC));
        if (a) for (const o of a) if (o !== nd && nd.pos.distanceToSquared(o.pos) < DC * DC) cnt++;
      }
      nd.density = Math.min(1, cnt / CONFIG.densityMax);
    }

    // node cores (dynamic colour buffer so the cursor can highlight nearby nodes)
    nodeCount = nodes.length;
    nodePos = new Float32Array(nodeCount * 3);
    coreCol = new Float32Array(nodeCount * 3);
    nodes.forEach((nd, i) => {
      const b = CONFIG.coreBright * (0.7 + 0.6 * nd.density);
      nodePos[i * 3] = nd.pos.x; nodePos[i * 3 + 1] = nd.pos.y; nodePos[i * 3 + 2] = nd.pos.z;
      coreCol[i * 3] = nd.color.r * b; coreCol[i * 3 + 1] = nd.color.g * b; coreCol[i * 3 + 2] = nd.color.b * b;
    });
    coreBase = coreCol.slice(); // immutable base; highlight is added on top each frame
    coreGeo = new THREE.BufferGeometry();
    coreGeo.setAttribute("position", new THREE.BufferAttribute(nodePos, 3));
    coreGeo.setAttribute("color", new THREE.BufferAttribute(coreCol, 3).setUsage(THREE.DynamicDrawUsage));
    swarmMat = new THREE.PointsMaterial({ size: CONFIG.coreSize, map: sprite, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    world.add(new THREE.Points(coreGeo, swarmMat));

    // sheaths along grid lines, thicker where dense
    const shPos = [], shCol = [];
    const addSheath = (from, ax, dir, len, col, b) => {
      const e = from.clone().add(axisVec(ax, dir * len)); clampV(e);
      shPos.push(from.x, from.y, from.z, e.x, e.y, e.z); shCol.push(col.r * b, col.g * b, col.b * b, 0, 0, 0);
    };
    for (const nd of nodes) {
      const b = CONFIG.sheathBase + CONFIG.sheathDenseBoost * nd.density;
      const len = nd.step * rand(CONFIG.sheathLenCells[0], CONFIG.sheathLenCells[1]) * (1 + 0.4 * nd.density);
      addSheath(nd.pos, nd.free, 1, len, nd.color, b);
      addSheath(nd.pos, nd.free, -1, len, nd.color, b);
      const perps = [0, 1, 2].filter((a) => a !== nd.free), arms = 1 + Math.round(nd.density * 2);
      for (let a = 0; a < arms; a++) addSheath(nd.pos, perps[(Math.random() * perps.length) | 0], Math.random() < 0.5 ? 1 : -1, nd.step * rand(0.4, 0.9), nd.color, b * 0.7);
    }
    const shGeo = new THREE.BufferGeometry();
    shGeo.setAttribute("position", new THREE.Float32BufferAttribute(shPos, 3));
    shGeo.setAttribute("color", new THREE.Float32BufferAttribute(shCol, 3));
    world.add(new THREE.LineSegments(shGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92, depthWrite: false, blending: THREE.AdditiveBlending })));

    // organic vectors: shotgun of short shots + a few aimed shots (some reach → connectors)
    const SEGO = 16, orgPos = [], orgCol = [], tmpP = new THREE.Vector3();
    connectors = [];
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
      const shots = irand(CONFIG.blastShots[0], CONFIG.blastShots[1]);
      for (let s = 0; s < shots; s++) {
        const o = pick(), dir = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
        buildStub(o, clampV(o.clone().addScaledVector(dir, rand(CONFIG.blastLen[0], CONFIG.blastLen[1]))), ac.color);
      }
      const aimed = irand(CONFIG.aimedShots[0], CONFIG.aimedShots[1]);
      for (let r = 0; r < aimed; r++) {
        const o = pick(), tgt = anchors[(Math.random() * anchors.length) | 0];
        if (tgt.idx === ac.idx) continue;
        const to = tgt.pos.clone().sub(o), dist = to.length(); if (dist < 0.5) continue;
        const dir = jitterDir(to.multiplyScalar(1 / dist), gauss(CONFIG.rayJitter)), lf = rand(CONFIG.rayLen[0], CONFIG.rayLen[1]);
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

    // pulses on the connectors
    nS = connectors.length;
    sparks = [];
    for (let i = 0; i < nS; i++) sparks.push({ active: Math.random() < 0.3, t: 0, wait: rand(0, CONFIG.sparkWait[1]), speedF: rand(0.8, 1.2), phase: Math.random() * 6.28 });
    spPos = new Float32Array(Math.max(1, nS) * 3); spCol = new Float32Array(Math.max(1, nS) * 3);
    spGeo = new THREE.BufferGeometry();
    spGeo.setAttribute("position", new THREE.BufferAttribute(spPos, 3).setUsage(THREE.DynamicDrawUsage));
    spGeo.setAttribute("color", new THREE.BufferAttribute(spCol, 3).setUsage(THREE.DynamicDrawUsage));
    spMat = new THREE.PointsMaterial({ size: CONFIG.sparkSize, map: sprite, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    world.add(new THREE.Points(spGeo, spMat));
  }

  // ── resize ───────────────────────────────────────────────────────────────────
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false); composer.setSize(w, h); bloom.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);

  // ── animation loop ───────────────────────────────────────────────────────────
  const clock = new THREE.Clock();
  const pos = new THREE.Vector3();
  const proj = new THREE.Vector3();
  let running = true;
  document.addEventListener("visibilitychange", () => { running = !document.hidden; if (running) { clock.getDelta(); loop(); } });

  function loop() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    const motion = !reduceMQ.matches; // reduced-motion → render a single static frame

    if (motion) {
      // spin: while dragging, the pointer drives rotation directly; otherwise the
      // fling coasts and resistance eases it back toward the ambient spin
      if (!dragging) {
        world.rotation.y += angVelY * dt;
        angVelY += (CONFIG.spin - angVelY) * Math.min(1, CONFIG.spinFriction * dt);
      }
      // cursor highlight: reset cores to base, then brighten the nodes nearest the pointer
      coreCol.set(coreBase);
      if (mouseOn && nodeCount) {
        world.updateMatrixWorld();
        const W = window.innerWidth, H = window.innerHeight, R = CONFIG.highlightRadius, R2 = R * R, HS = CONFIG.highlightStrength;
        for (let n = 0; n < nodeCount; n++) {
          proj.set(nodePos[n * 3], nodePos[n * 3 + 1], nodePos[n * 3 + 2]).applyMatrix4(world.matrixWorld).project(camera);
          if (proj.z > 1) continue; // behind the camera / beyond the far plane
          const dxs = (proj.x * 0.5 + 0.5) * W - mxPx, dys = (-proj.y * 0.5 + 0.5) * H - myPx, dsq = dxs * dxs + dys * dys;
          if (dsq < R2) { const f = (1 - Math.sqrt(dsq) / R) * HS; coreCol[n * 3] += f; coreCol[n * 3 + 1] += f; coreCol[n * 3 + 2] += f; }
        }
      }
      coreGeo.attributes.color.needsUpdate = true;
      if (swarmMat) swarmMat.size = CONFIG.coreSize * (1 + 0.08 * Math.sin(t * 1.5));
      for (let i = 0; i < nS; i++) {
        const sp = sparks[i], cn = connectors[i];
        if (!sp.active) {
          sp.wait -= dt;
          if (sp.wait <= 0) { sp.active = true; sp.t = 0; sp.speedF = rand(0.8, 1.2); }
          spCol[i * 3] = spCol[i * 3 + 1] = spCol[i * 3 + 2] = 0; continue;
        }
        sp.t += CONFIG.sparkSpeed * sp.speedF * dt;
        if (sp.t >= 1) { sp.active = false; sp.wait = rand(CONFIG.sparkWait[0], CONFIG.sparkWait[1]); spCol[i * 3] = spCol[i * 3 + 1] = spCol[i * 3 + 2] = 0; continue; }
        const ss = sp.t * sp.t * (3 - 2 * sp.t), te = sp.t * (1 - CONFIG.sparkEase) + ss * CONFIG.sparkEase; // eased travel
        pos.lerpVectors(cn.a, cn.b, te);
        spPos[i * 3] = pos.x; spPos[i * 3 + 1] = pos.y; spPos[i * 3 + 2] = pos.z;
        const tw = 0.8 + 0.2 * Math.sin(t * 40 + sp.phase);
        spCol[i * 3] = (cn.ca.r + (cn.cb.r - cn.ca.r) * te) * tw;
        spCol[i * 3 + 1] = (cn.ca.g + (cn.cb.g - cn.ca.g) * te) * tw;
        spCol[i * 3 + 2] = (cn.ca.b + (cn.cb.b - cn.ca.b) * te) * tw;
      }
      if (spGeo) { spGeo.attributes.position.needsUpdate = true; spGeo.attributes.color.needsUpdate = true; }
    }

    bloom.strength = CONFIG.bloom.strength; bloom.radius = CONFIG.bloom.radius; // live
    if (spMat) spMat.size = CONFIG.sparkSize;

    composer.render();
    if (motion) requestAnimationFrame(loop); // static under reduced-motion
  }

  // ── tuner GUI (only when the URL contains "tune") ────────────────────────────
  async function setupGUI() {
    if (!/tune/.test(location.search + location.hash)) return;
    let GUI;
    try { const m = await import("lil-gui"); GUI = m.GUI || m.default; } catch (e) { console.warn("lil-gui failed to load", e); return; }
    const gui = new GUI({ title: "holon tuner" });
    const addRange = (f, label, arr, min, max, step, structural) => {
      const p = { lo: arr[0], hi: arr[1] };
      f.add(p, "lo", min, max, step).name(label + " min").onChange((v) => { arr[0] = v; if (structural) rebuild(); });
      f.add(p, "hi", min, max, step).name(label + " max").onChange((v) => { arr[1] = v; if (structural) rebuild(); });
    };

    const fScene = gui.addFolder("Scene");
    fScene.add(CONFIG, "spin", 0, 0.25, 0.005);
    fScene.add(CONFIG.bloom, "strength", 0, 3, 0.05).name("bloom");
    fScene.add(CONFIG.bloom, "radius", 0, 1.5, 0.05).name("bloom radius");

    const fP = gui.addFolder("Pulses");
    fP.add(CONFIG, "sparkSize", 0.02, 0.4, 0.005).name("size");
    fP.add(CONFIG, "sparkSpeed", 0.1, 4, 0.05).name("speed");
    fP.add(CONFIG, "sparkEase", 0, 1, 0.05).name("easing");
    addRange(fP, "wait", CONFIG.sparkWait, 0, 8, 0.1, false);

    const fO = gui.addFolder("Organics");
    addRange(fO, "blast shots", CONFIG.blastShots, 0, 30, 1, true);
    addRange(fO, "blast len", CONFIG.blastLen, 0.2, 8, 0.1, true);
    addRange(fO, "aimed shots", CONFIG.aimedShots, 0, 8, 1, true);
    fO.add(CONFIG, "arriveRadius", 0.5, 4, 0.1).onChange(rebuild);
    fO.add(CONFIG, "rayJitter", 0, 1, 0.02).onChange(rebuild);
    fO.add(CONFIG, "lineGap", 0.05, 0.5, 0.02).onChange(rebuild);

    const fG = gui.addFolder("Grid");
    fG.add(CONFIG.grids[0], "keep", 0, 1, 0.02).name("fine keep").onChange(rebuild);
    fG.add(CONFIG.grids[0], "grey", 0, 0.6, 0.01).name("fine grey").onChange(rebuild);
    fG.add(CONFIG.grids[1], "keep", 0, 1, 0.02).name("coarse keep").onChange(rebuild);

    const fC = gui.addFolder("Clusters & sheaths");
    fC.add(CONFIG, "clusters", 2, 30, 1).onChange(rebuild);
    addRange(fC, "slab thin", CONFIG.slabThin, 0.1, 2, 0.05, true);
    addRange(fC, "slab wide", CONFIG.slabWide, 1, 6, 0.1, true);
    fC.add(CONFIG, "sheathBase", 0, 2, 0.05).name("sheath base").onChange(rebuild);
    fC.add(CONFIG, "sheathDenseBoost", 0, 2, 0.05).name("sheath dense+").onChange(rebuild);

    gui.add({ log: () => console.log(JSON.stringify(CONFIG, null, 2)) }, "log").name("⤓ log values to console");
    gui.add({ rebuild }, "rebuild").name("↻ reseed scene");
    fScene.open(); fP.open();
  }

  // boot
  rebuild();
  resize();
  setupGUI();
  // reveal the scene AND clear any safety-net fallback (e.g. a slow load that tripped it)
  requestAnimationFrame(() => { canvas.classList.add("ready"); document.documentElement.classList.remove("no-webgl"); });
  loop();

  // if the user turns OFF reduce-motion at runtime, resume the animation loop
  reduceMQ.addEventListener && reduceMQ.addEventListener("change", () => {
    if (!reduceMQ.matches && running) { clock.getDelta(); loop(); }
  });
}

maybeStart();
