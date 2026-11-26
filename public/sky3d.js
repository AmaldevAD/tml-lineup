// Sketched 3D: a hand-drawn crystal in ink, shaded with pencil hatching, with doodle stars orbiting it.
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
  uInk: { value: new THREE.Color("#1D1B19") } };

const heart = new THREE.Group();
scene.add(heart);

// ---------- Crystal faces: flat marker colours + pencil hatching by light ----------
const geo = new THREE.OctahedronGeometry(1.15, 0);
geo.scale(1, 1.45, 1);
const MARK = ["#FF9EBB", "#9CC8FF", "#FFE45C", "#8EE3BF"].map(c => new THREE.Color(c));
const fc = new Float32Array(geo.attributes.position.count * 3);
for (let f = 0; f < geo.attributes.position.count / 3; f++) { const c = MARK[f % 4]; for (let k = 0; k < 3; k++) fc.set([c.r, c.g, c.b], (f * 3 + k) * 3); }
geo.setAttribute("color", new THREE.BufferAttribute(fc, 3));
const faceMat = new THREE.ShaderMaterial({
  uniforms: U,
  vertexShader: `attribute vec3 color; varying vec3 vC; varying vec3 vV;
    void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); vV = mv.xyz; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform float uTime, uPx, uDark, uPulse; uniform vec3 uInk; varying vec3 vC; varying vec3 vV;
    float hatch(vec2 p, float a, float w){ float s = sin(a), c = cos(a); float v = (p.x * c + p.y * s) / (6.0 * uPx); return smoothstep(w, w * 0.4, abs(fract(v) - 0.5)); }
    void main(){
      vec3 n = normalize(cross(dFdx(vV), dFdy(vV)));
      float l = clamp(dot(n, normalize(vec3(-0.5, 0.8, 0.6))) * 0.5 + 0.5, 0.0, 1.0);
      vec2 p = gl_FragCoord.xy;
      float h = 0.0;
      if (l < 0.72) h = max(h, hatch(p, 0.8, 0.12));
      if (l < 0.45) h = max(h, hatch(p, -0.7, 0.12));
      if (l < 0.25) h = max(h, hatch(p + 3.0, 0.8, 0.16));
      vec3 base = mix(vC, vC * 0.85, uDark) + uPulse * 0.25;
      gl_FragColor = vec4(mix(base, uInk, h * 0.75), 1.0);
    }`
});
const faces = new THREE.Mesh(geo, faceMat);
heart.add(faces);

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
const edgeSrc = new THREE.EdgesGeometry(geo).attributes.position.array;
const inkMat = new THREE.LineBasicMaterial({ color: 0x1D1B19 });
const crystalLines = sketchLines(edgeSrc, 2, 0.07);
boil(crystalLines, 0.035);
const outline = new THREE.LineSegments(crystalLines, inkMat);
heart.add(outline);

// Loose doodled orbit ellipses (dashed pencil)
function ellipseSrc(rx, rz, n) { const s = []; for (let i = 0; i < n; i++) { const a0 = i / n * 6.283, a1 = (i + 1) / n * 6.283;
  s.push(Math.cos(a0) * rx, 0, Math.sin(a0) * rz, Math.cos(a1) * rx, 0, Math.sin(a1) * rz); } return new Float32Array(s); }
const orbitMat = new THREE.LineDashedMaterial({ color: 0x1D1B19, dashSize: 0.16, gapSize: 0.12, transparent: true, opacity: 0.6 });
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
const STAR_FILLS = ["#FFE45C", "#FF9EBB", "#9CC8FF", "#8EE3BF", "#FFB36B", "#C9A8FF"];
const stars = STAR_FILLS.map((f, k) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex(f, "#1D1B19"), transparent: true, depthWrite: false }));
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
  const d = isDark(), ink = d ? "#EDE9DE" : "#1D1B19";
  U.uDark.value = d ? 1 : 0; U.uInk.value.set(d ? "#121214" : "#1D1B19");
  inkMat.color.set(ink); orbitMat.color.set(ink);
  stars.forEach(s => { s.material.map.dispose(); s.material.map = starTex(s.userData.fill, d ? "#121214" : ink); s.material.needsUpdate = true; });
}
new MutationObserver(syncTheme).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", syncTheme);
syncTheme();

// ---------- Loop ----------
const clock = new THREE.Clock(), tmp = new THREE.Vector3(), goal = new THREE.Vector3();
let idle = false, running = true, raf = 0, frames = 0, acc = 0, every = lite ? 2 : 1, tick = 0, boilT = 0, snap = false, sc = 0.5, slowed = false, op = 1;
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
  if ((boilT += dt) > 0.12) { boilT = 0; boil(crystalLines, 0.035); }

  camera.position.x = px * 0.3; camera.position.y = -py * 0.2;
  camera.lookAt(camera.position.x, camera.position.y, 0);

  // Sit in the hero on the line-up page; elsewhere drift faintly in the background
  const vis = hero && hero.isConnected && hero.offsetParent !== null;
  const halfH = Math.tan(camera.fov * Math.PI / 360) * camera.position.z, halfW = halfH * camera.aspect;
  let sx = innerWidth * 0.5, sy = innerHeight * 0.5, ts = 0.38, to = 0.16;
  let off = false;
  if (vis) { const r = hero.getBoundingClientRect(); sy = r.top + r.height * 0.4; sx = innerWidth * (innerWidth < 720 ? 0.7 : 0.72); ts = Math.min(r.height / 560, 0.85); to = 1; off = r.bottom < -40; }
  goal.set((sx / innerWidth - 0.5) * 2 * halfW, (0.5 - sy / innerHeight) * 2 * halfH, vis ? 0 : -2);
  heart.position.lerp(goal, snap ? 0.25 : 1); snap = true;
  heart.position.y += Math.sin(t * 0.9) * 0.06;
  sc += (ts - sc) * 0.08; heart.scale.setScalar(sc * (1 + pulse * 0.12));
  op += (to - op) * 0.1; cv.style.opacity = op.toFixed(3);

  // Stepped rotation reads as hand-drawn frames rather than a smooth CG spin
  const ry = Math.round(t * (0.45 + spinBoost) * 12) / 12;
  faces.rotation.y = outline.rotation.y = ry;
  faces.rotation.x = outline.rotation.x = Math.sin(t * 0.4) * 0.12;
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
