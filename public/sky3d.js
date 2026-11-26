// Sketched 3D: a hand-drawn festival crest in ink, shaded with pencil hatching, with doodle stars orbiting it.
// Lines "boil" (re-jitter a few times a second) like frame-by-frame hand-drawn animation.
// Loaded lazily after the page is interactive; never with reduced motion or without WebGL2.
// Perf: capped pixel ratio, a handful of draw calls, pauses when hidden, adapts to slow frames.
import * as THREE from "./vendor/three-0.160.0.module.min.js";

const root = document.documentElement;
const host = document.querySelector(".magic");
const hero = document.querySelector(".hero3d");
const lite = root.classList.contains("lite");
const isDark = () => root.dataset.theme === "dark" || (!root.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
let pr = Math.min(devicePixelRatio || 1, lite ? 1.25 : 1.75);
renderer.setPixelRatio(pr);
renderer.setClearColor(0x000000, 0);
const cv = renderer.domElement; cv.className = "sky3d"; cv.setAttribute("aria-hidden", "true");
host.appendChild(cv);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(0, 0, 7);

const U = { uTime: { value: 0 }, uPx: { value: pr }, uDark: { value: 0 }, uPulse: { value: 0 },
  uInk: { value: new THREE.Color("#2B1D14") } };

const heart = new THREE.Group();
scene.add(heart);

// ---------- Festival crest: an original, symmetrical badge (ring of gems, six emotion petals, heart, star crown, ribbon) ----------
// Flat marker colours + pencil hatching by light. Parts of one colour are merged, so the whole crest is a few draw calls.
const hatchFrag = `uniform float uTime, uPx, uDark, uPulse; uniform vec3 uInk, uColor; varying vec3 vV;
  float hatch(vec2 p, float a, float w){ float s = sin(a), c = cos(a); float v = (p.x * c + p.y * s) / (6.0 * uPx); return smoothstep(w, w * 0.4, abs(fract(v) - 0.5)); }
  void main(){
    vec3 n = normalize(cross(dFdx(vV), dFdy(vV)));
    float l = clamp(dot(n, normalize(vec3(-0.45, 0.6, 0.9))) * 0.5 + 0.5, 0.0, 1.0);
    vec2 p = gl_FragCoord.xy;
    float h = 0.0;
    if (l < 0.72) h = max(h, hatch(p, 0.8, 0.12));
    if (l < 0.45) h = max(h, hatch(p, -0.7, 0.12));
    if (l < 0.25) h = max(h, hatch(p + 3.0, 0.8, 0.16));
    vec3 base = mix(uColor, uColor * 0.85, uDark) + uPulse * 0.25;
    gl_FragColor = vec4(mix(base, uInk, h * 0.75), 1.0);
  }`;
const hatchVert = `varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vV = mv.xyz; gl_Position = projectionMatrix * mv; }`;

const crest = new THREE.Group();
crest.scale.setScalar(1.15);
heart.add(crest);
const buckets = new Map(), edgeParts = [], M = new THREE.Matrix4();
function part(g, color, x = 0, y = 0, z = 0, rz = 0) {
  M.makeRotationZ(rz).setPosition(x, y, z);
  const ng = (g.index ? g.toNonIndexed() : g).applyMatrix4(M);
  (buckets.get(color) || buckets.set(color, []).get(color)).push(ng.attributes.position.array);
  edgeParts.push(new THREE.EdgesGeometry(ng, 25).attributes.position.array);
}
const cat = arrs => { const out = new Float32Array(arrs.reduce((n, a) => n + a.length, 0)); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; };
const ext = (shape, depth) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10 });
const circle = (r, hole) => { const s = new THREE.Shape().absarc(0, 0, r, 0, Math.PI * 2, false); if (hole) s.holes.push(new THREE.Path().absarc(0, 0, hole, 0, Math.PI * 2, true)); return s; };

// Outer ring and inner disc
part(ext(circle(1.25, 1.0), 0.22), "#C8734A", 0, 0, -0.11);
part(ext(circle(1.0), 0.1), "#EAD3AE", 0, 0, -0.05);
// Golden sun rays fanning out behind the crest, alternating long and short
for (let k = 0; k < 16; k++) { const r = new THREE.Shape(), L = k % 2 ? 1.75 : 2.15; r.moveTo(-0.08, 1.2); r.lineTo(0, L); r.lineTo(0.08, 1.2); r.closePath(); part(ext(r, 0.02), "#EDC266", 0, 0, -0.32, k * Math.PI / 8 + Math.PI / 16); }
// Six emotion petals (one per colour), raised off the disc
const petal = new THREE.Shape(); petal.moveTo(0, 0.3); petal.quadraticCurveTo(0.24, 0.62, 0, 0.94); petal.quadraticCurveTo(-0.24, 0.62, 0, 0.3);
["#D9825B", "#E8B84A", "#9DB58A", "#7E9CC6", "#A98BD8", "#D99A8B"].forEach((c, k) => part(ext(petal, 0.12), c, 0, 0, 0.03, k * Math.PI / 3));
// Heart in the middle
const hs = new THREE.Shape(); hs.moveTo(0, -0.2);
hs.bezierCurveTo(-0.08, -0.12, -0.27, 0.0, -0.22, 0.12); hs.bezierCurveTo(-0.18, 0.24, -0.04, 0.24, 0, 0.13);
hs.bezierCurveTo(0.04, 0.24, 0.18, 0.24, 0.22, 0.12); hs.bezierCurveTo(0.27, 0.0, 0.08, -0.12, 0, -0.2);
part(ext(hs, 0.18), "#B8452F", 0, 0.01, 0.05);
// Twelve gems around the ring
const gem = new THREE.OctahedronGeometry(0.075, 0);
for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6 + Math.PI / 12; part(gem.clone(), k % 2 ? "#F3E3C3" : "#E8B84A", Math.cos(a) * 1.125, Math.sin(a) * 1.125, 0.12); }
// Star crown, with two small diamonds beside it
const star = (ro, ri) => { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? ri : ro, a = Math.PI / 2 + i * Math.PI / 5; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); } return s; };
part(ext(star(0.36, 0.16), 0.16), "#E8B84A", 0, 1.52, -0.08);
const dia = new THREE.Shape(); dia.moveTo(0, 0.14); dia.lineTo(0.08, 0); dia.lineTo(0, -0.14); dia.lineTo(-0.08, 0); dia.closePath();
part(ext(dia, 0.1), "#7E9CC6", -0.46, 1.36, -0.05, 0.5); part(ext(dia, 0.1), "#7E9CC6", 0.46, 1.36, -0.05, -0.5);
// Ribbon banner across the bottom: a gentle smile curve with swallowtail ends
const rib = new THREE.Shape(), W = 1.45, cy = x => -1.18 + 0.16 * (x / W) ** 2, N = 12;
for (let i = 0; i <= N; i++) { const x = -W + 2 * W * i / N; i ? rib.lineTo(x, cy(x) + 0.17) : rib.moveTo(x, cy(x) + 0.17); }
rib.lineTo(W - 0.16, cy(W)); rib.lineTo(W, cy(W) - 0.17);
for (let i = N; i >= 0; i--) { const x = -W + 2 * W * i / N; rib.lineTo(x, cy(x) - 0.17); }
rib.lineTo(-W + 0.16, cy(-W)); rib.closePath();
part(ext(rib, 0.08), "#6F8FBF", 0, 0, 0.16);
// Cracks in the clay disc: a few branching hand-drawn fissures (ink lines only, they boil with the outlines)
{ let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cracks = [];
  for (let c = 0; c < 5; c++) {
    let a = c * 1.26 + 0.4, r = 0.98, x = Math.cos(a) * r, y = Math.sin(a) * r;
    for (let st = 0; st < 5; st++) {
      a += (rnd() - 0.5) * 0.9; r -= 0.1 + rnd() * 0.06;
      const nx = Math.cos(a) * r, ny = Math.sin(a) * r; cracks.push(x, y, 0.052, nx, ny, 0.052);
      if (st === 2) { const b = a + (rnd() > 0.5 ? 0.7 : -0.7); cracks.push(nx, ny, 0.052, nx + Math.cos(b) * 0.14, ny + Math.sin(b) * 0.14, 0.052); }
      x = nx; y = ny;
    }
  }
  edgeParts.push(new Float32Array(cracks)); }

const crestMats = [];
for (const [color, arrs] of buckets) {
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(cat(arrs), 3));
  const m = new THREE.ShaderMaterial({ uniforms: { ...U, uColor: { value: new THREE.Color(color) } }, vertexShader: hatchVert, fragmentShader: hatchFrag });
  crestMats.push(m); crest.add(new THREE.Mesh(g, m));
}

// ---------- Ink outlines that boil: each edge drawn twice, slightly off, re-jittered ~8 times a second ----------
function sketchLines(src, passes, overshoot) {
  const arr = new Float32Array(src.length * passes);
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
  g.userData = { src, passes, overshoot };
  return g;
}
function boil(g, amt) {
  const { src, passes, overshoot } = g.userData, a = g.attributes.position.array; let o = 0;
  const j = () => (Math.random() - .5) * amt;
  for (let ps = 0; ps < passes; ps++) for (let i = 0; i < src.length; i += 6) {
    const ax = src[i], ay = src[i + 1], az = src[i + 2], dx = src[i + 3] - ax, dy = src[i + 4] - ay, dz = src[i + 5] - az;
    const e1 = -overshoot * Math.random(), e2 = 1 + overshoot * Math.random();
    a[o++] = ax + dx * e1 + j(); a[o++] = ay + dy * e1 + j(); a[o++] = az + dz * e1 + j();
    a[o++] = ax + dx * e2 + j(); a[o++] = ay + dy * e2 + j(); a[o++] = az + dz * e2 + j();
  }
  g.attributes.position.needsUpdate = true;
}
const inkMat = new THREE.LineBasicMaterial({ color: 0x2B1D14 });
const crestLines = sketchLines(cat(edgeParts), 2, 0.12);
boil(crestLines, 0.022);
crest.add(new THREE.LineSegments(crestLines, inkMat));

// Loose doodled orbit ellipses (dashed pencil)
function ellipseSrc(rx, rz, n) { const s = []; for (let i = 0; i < n; i++) { const a0 = i / n * 6.283, a1 = (i + 1) / n * 6.283;
  s.push(Math.cos(a0) * rx, 0, Math.sin(a0) * rz, Math.cos(a1) * rx, 0, Math.sin(a1) * rz); } return new Float32Array(s); }
const orbitMat = new THREE.LineDashedMaterial({ color: 0x2B1D14, dashSize: 0.16, gapSize: 0.12, transparent: true, opacity: 0.6 });
const orbits = [[2.3, 1.0, 0.35], [2.0, 0.85, -0.5]].map(([rx, rz, tilt]) => {
  const g = sketchLines(ellipseSrc(rx, rz, 56), 1, 0); boil(g, 0.025);
  const l = new THREE.LineSegments(g, orbitMat); l.computeLineDistances(); l.rotation.set(tilt, 0, tilt * 0.6); heart.add(l); return l;
});

// ---------- Doodle stars orbiting (sprites drawn on a canvas: marker fill + ink outline) ----------
function starTex(fill, ink) {
  const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d");
  const pts = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 24 : 54, a = -Math.PI / 2 + i * Math.PI / 5; pts.push([64 + Math.cos(a) * r, 66 + Math.sin(a) * r]); }
  x.lineJoin = "round"; x.lineCap = "round";
  x.beginPath(); pts.forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py)); x.closePath();
  x.fillStyle = fill; x.fill(); x.lineWidth = 7; x.strokeStyle = ink; x.stroke();
  x.beginPath(); x.moveTo(pts[9][0] + 3, pts[9][1] + 2); x.lineTo(pts[0][0] + 2, pts[0][1] + 3); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const STAR_FILLS = ["#E8B84A", "#D9825B", "#7E9CC6", "#9DB58A", "#EAD3AE", "#A98BD8"];
const stars = STAR_FILLS.map((f, k) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex(f, "#2B1D14"), transparent: true, depthWrite: false }));
  s.scale.setScalar(0.5 + (k % 3) * 0.08); s.userData = { k, fill: f }; heart.add(s); return s;
});
const orbitPos = (k, t, v) => {
  const r = 2.0 + (k % 3) * 0.28, a = t * (0.35 + k * 0.05) + k * 1.047, tilt = (k - 2.5) * 0.35;
  const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.45, y = Math.sin(a * 2 + k) * 0.2;
  v.set(x, y * Math.cos(tilt) - z * Math.sin(tilt), y * Math.sin(tilt) + z * Math.cos(tilt));
};

// ---------- Interaction ----------
let px = 0, py = 0, tx = 0, ty = 0, pulse = 0, spinBoost = 0;
addEventListener("pointermove", e => { tx = (e.clientX / innerWidth - .5) * 2; ty = (e.clientY / innerHeight - .5) * 2; }, { passive: true });
document.addEventListener("click", e => { if (e.target.closest("#days button, nav.tabs a, .fav, .play, .support")) { pulse = 1; spinBoost = 3; } }, true);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 62 : 50; camera.updateProjectionMatrix();
}
addEventListener("resize", resize); resize();

function syncTheme() {
  const d = isDark(), ink = d ? "#F3E6D0" : "#2B1D14";
  U.uDark.value = d ? 1 : 0; U.uInk.value.set(d ? "#16120E" : "#2B1D14");
  inkMat.color.set(ink); orbitMat.color.set(ink);
  stars.forEach(s => { s.material.map.dispose(); s.material.map = starTex(s.userData.fill, d ? "#16120E" : ink); s.material.needsUpdate = true; });
}
new MutationObserver(syncTheme).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", syncTheme);
syncTheme();

// ---------- Loop ----------
const clock = new THREE.Clock(), tmp = new THREE.Vector3(), goal = new THREE.Vector3();
let idle = false, running = true, raf = 0, frames = 0, acc = 0, every = lite ? 2 : 1, tick = 0, boilT = 0, snap = false, sc = 0.5, slowed = false, op = 1, spinA = 0;
function frame() {
  raf = requestAnimationFrame(frame);
  if (++tick % every) return;
  const dt = Math.min(clock.getDelta(), 0.1), t = (U.uTime.value += dt);
  acc += dt; frames++;
  if (acc > 2) { const ms = acc / frames * 1000 / every; acc = 0; frames = 0;
    if (ms > 26 && !slowed) { slowed = true; pr = Math.max(0.85, pr * 0.7); renderer.setPixelRatio(pr); U.uPx.value = pr; resize(); }
    else if (ms > 26 && every === 1) every = 2; }

  px += (tx - px) * 0.05; py += (ty - py) * 0.05;
  pulse *= 0.93; spinBoost *= 0.94; U.uPulse.value = pulse;

  // Hand-drawn "line boil": a fresh wobble about 8 times a second
  if ((boilT += dt) > 0.12) { boilT = 0; boil(crestLines, 0.022); }

  camera.position.x = px * 0.3; camera.position.y = -py * 0.2;
  camera.lookAt(camera.position.x, camera.position.y, 0);

  // Sit in the hero on the line-up page; elsewhere drift faintly in the background
  const vis = hero && hero.isConnected && hero.offsetParent !== null;
  const halfH = Math.tan(camera.fov * Math.PI / 360) * camera.position.z, halfW = halfH * camera.aspect;
  let sx = innerWidth * 0.5, sy = innerHeight * 0.5, ts = 0.38, to = 0.16;
  let off = false;
  if (vis) { const r = hero.getBoundingClientRect(); sy = r.top + r.height * (innerWidth < 720 ? 0.37 : 0.4); sx = innerWidth * (innerWidth < 720 ? 0.7 : 0.72); ts = Math.min(r.height / 560, 0.85) * (innerWidth < 720 ? 0.9 : 1); to = 1; off = r.bottom < -40; }
  goal.set((sx / innerWidth - 0.5) * 2 * halfW, (0.5 - sy / innerHeight) * 2 * halfH, vis ? 0 : -2);
  heart.position.lerp(goal, snap ? 0.25 : 1); snap = true;
  heart.position.y += Math.sin(t * 0.9) * 0.06;
  sc += (ts - sc) * 0.08; heart.scale.setScalar(sc * (1 + pulse * 0.12));
  op += (to - op) * 0.1; cv.style.opacity = op.toFixed(3);

  // Stepped rotation reads as hand-drawn frames rather than a smooth CG spin
  // A gentle rock keeps the crest's face to the viewer; a tap spins it all the way round and it settles face-on again
  spinA += spinBoost * dt * 1.6;
  if (spinBoost < 0.08) spinA += (Math.round(spinA / 6.2832) * 6.2832 - spinA) * 0.06;
  crest.rotation.y = Math.round((Math.sin(t * 0.55) * 0.42 + spinA) * 12) / 12;
  crest.rotation.x = Math.round(Math.sin(t * 0.4) * 0.12 * 24) / 24;
  orbits.forEach((l, i) => { l.rotation.y = t * (i ? -0.15 : 0.12); });
  stars.forEach(s => { orbitPos(s.userData.k, t * (1 + spinBoost * 0.3), tmp); s.position.copy(tmp); s.material.rotation = Math.round(Math.sin(t * 2 + s.userData.k) * 4) / 12; });

  // Save work: nothing to draw once the hero has scrolled away; the faint background version only needs ~20 fps
  if (off) { if (!idle) { renderer.clear(); idle = true; } return; }
  idle = false;
  if (!vis && tick % 3) return;
  renderer.render(scene, camera);
}
function setRunning(on) {
  if (on === running) return; running = on;
  if (on) { clock.getDelta(); raf = requestAnimationFrame(frame); } else cancelAnimationFrame(raf);
}
document.addEventListener("visibilitychange", () => setRunning(document.visibilityState === "visible"));
cv.addEventListener("webglcontextlost", e => { e.preventDefault(); setRunning(false); root.classList.remove("three"); cv.remove(); });

root.classList.add("three");
raf = requestAnimationFrame(frame);
