// 3D sky: an original "six emotions" crystal with orbiting lights inside a spiral galaxy.
// Loaded lazily after the page is interactive. Never runs with reduced motion or without WebGL.
// Perf: capped pixel ratio, one draw per object, simple shaders, pauses when hidden, adapts quality to frame time.
import * as THREE from "./vendor/three-0.160.0.module.min.js";

const root = document.documentElement;
const host = document.querySelector(".magic");
const lite = root.classList.contains("lite");
const isLight = () => root.dataset.theme === "light" || (!root.dataset.theme && !matchMedia("(prefers-color-scheme: dark)").matches);

const EMO = ["#7B6CFF", "#FF5C9A", "#FF6A3D", "#FFC24B", "#D94BFF", "#3FA9F5"].map(c => new THREE.Color(c));

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: !lite, alpha: true, powerPreference: "default" });
} catch (e) { throw new Error("no webgl"); }
let pr = Math.min(devicePixelRatio || 1, lite ? 1 : 1.5);
renderer.setPixelRatio(pr);
renderer.setClearColor(0x000000, 0);
const cv = renderer.domElement; cv.className = "sky3d"; cv.setAttribute("aria-hidden", "true");
host.appendChild(cv);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(0, 0, 7);

const U = { uTime: { value: 0 }, uPx: { value: pr }, uLight: { value: 0 }, uPulse: { value: 0 } };

// ---------- Galaxy: spiral arms of emotion-coloured stars ----------
const N = lite ? 1400 : 3200;
const gPos = new Float32Array(N * 3), gCol = new Float32Array(N * 3), gSize = new Float32Array(N), gPhase = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const arm = i % 6, r = Math.pow(Math.random(), 0.7) * 9 + 1.2;
  const a = arm / 6 * Math.PI * 2 + r * 0.55 + (Math.random() - .5) * 0.5;
  const spread = (Math.random() - .5) * (0.25 + r * 0.06);
  gPos[i * 3] = Math.cos(a) * r + spread;
  gPos[i * 3 + 1] = (Math.random() - .5) * (0.35 + 1.4 / r);
  gPos[i * 3 + 2] = Math.sin(a) * r + spread;
  const c = EMO[arm].clone().lerp(new THREE.Color("#ffffff"), Math.random() * 0.45);
  gCol.set([c.r, c.g, c.b], i * 3);
  gSize[i] = Math.random() < 0.06 ? 7 + Math.random() * 6 : 2 + Math.random() * 3;
  gPhase[i] = Math.random() * 6.283;
}
const gGeo = new THREE.BufferGeometry();
gGeo.setAttribute("position", new THREE.BufferAttribute(gPos, 3));
gGeo.setAttribute("color", new THREE.BufferAttribute(gCol, 3));
gGeo.setAttribute("aSize", new THREE.BufferAttribute(gSize, 1));
gGeo.setAttribute("aPhase", new THREE.BufferAttribute(gPhase, 1));
const pointsVS = `
  attribute float aSize; attribute float aPhase; attribute vec3 color;
  uniform float uTime, uPx; varying vec3 vC; varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float tw = 0.55 + 0.45 * sin(uTime * 1.7 + aPhase);
    gl_PointSize = aSize * uPx * (0.6 + tw * 0.6) * (7.0 / -mv.z);
    gl_Position = projectionMatrix * mv; vC = color; vA = tw;
  }`;
const pointsFS = `
  uniform float uLight; varying vec3 vC; varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a;
    vec3 c = mix(vC, vC * 0.75, uLight);
    gl_FragColor = vec4(c + (1.0 - uLight) * pow(a, 4.0) * 0.6, a * vA * mix(1.0, 0.8, uLight));
  }`;
const gMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: pointsVS, fragmentShader: pointsFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const galaxy = new THREE.Points(gGeo, gMat);
galaxy.rotation.x = 0.42;
galaxy.position.y = -1.2;
scene.add(galaxy);

// ---------- The crystal ----------
const heart = new THREE.Group();
const hero = document.querySelector(".hero3d");
scene.add(heart);
const crystalMat = new THREE.ShaderMaterial({
  uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  vertexShader: `varying vec3 vV; varying vec3 vW;
    void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = mv.xyz; vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform float uTime, uLight, uPulse; varying vec3 vV; varying vec3 vW;
    void main() {
      vec3 n = normalize(cross(dFdx(vV), dFdy(vV)));
      float f = 1.0 - abs(dot(n, normalize(-vV)));
      float t = dot(n, vec3(0.55, 0.35, 0.25)) * 1.4 + uTime * 0.06 + vW.y * 0.15;
      vec3 irid = 0.55 + 0.45 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + t));
      vec3 c = irid * (0.22 + 1.1 * f * f) + vec3(1.0, 0.92, 0.8) * pow(f, 7.0) * 1.4 + uPulse * 0.35 * irid;
      vec3 lc = mix(vec3(1.0, 0.97, 1.0), irid, 0.5 + 0.35 * f) * (0.9 + 0.25 * f);
      gl_FragColor = vec4(mix(c, lc, uLight), mix(0.42 + 0.5 * f, 0.6 + 0.35 * f, uLight));
    }`
});
const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.15, 0), crystalMat);
crystal.scale.set(1, 1.45, 1);
heart.add(crystal);

const coreMat = new THREE.ShaderMaterial({
  uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN = normalMatrix * normal; vec4 mv = modelViewMatrix * vec4(position,1.0); vV = mv.xyz; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform float uTime, uPulse; varying vec3 vN; varying vec3 vV;
    void main(){ float f = pow(abs(dot(normalize(vN), normalize(-vV))), 2.0);
      vec3 c = mix(vec3(1.0,0.55,0.8), vec3(1.0,0.85,0.45), 0.5 + 0.5 * sin(uTime * 0.8));
      gl_FragColor = vec4(c * f * (0.8 + uPulse), f * 0.9); }`
});
const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 2), coreMat);
heart.add(core);

const shell = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.95, 1)),
  new THREE.LineBasicMaterial({ color: 0xFFD27A, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
heart.add(shell);

const rings = EMO.filter((_, i) => i % 2 === 0).map((c, i) => {
  const m = new THREE.Mesh(new THREE.TorusGeometry(2.35 + i * 0.32, 0.008, 6, 160),
    new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.rotation.set(Math.PI / 2 + (i - 1) * 0.5, (i - 1) * 0.35, 0); heart.add(m); return m;
});

// Six emotion lights orbiting the crystal, each with a short comet trail
const TRAIL = lite ? 10 : 18;
const oCount = 6 * TRAIL;
const oPos = new Float32Array(oCount * 3), oCol = new Float32Array(oCount * 3), oSize = new Float32Array(oCount), oPhase = new Float32Array(oCount);
for (let k = 0; k < 6; k++) for (let j = 0; j < TRAIL; j++) {
  const i = k * TRAIL + j, fade = 1 - j / TRAIL;
  oCol.set([EMO[k].r * fade + .2, EMO[k].g * fade + .2, EMO[k].b * fade + .2], i * 3);
  oSize[i] = (j === 0 ? 30 : 16) * fade; oPhase[i] = 1.57;
}
const oGeo = new THREE.BufferGeometry();
oGeo.setAttribute("position", new THREE.BufferAttribute(oPos, 3));
oGeo.setAttribute("color", new THREE.BufferAttribute(oCol, 3));
oGeo.setAttribute("aSize", new THREE.BufferAttribute(oSize, 1));
oGeo.setAttribute("aPhase", new THREE.BufferAttribute(oPhase, 1));
const orbs = new THREE.Points(oGeo, gMat);
heart.add(orbs);
const orbit = (k, t, out) => {
  const r = 2.1 + (k % 3) * 0.35, sp = 0.55 + k * 0.07, a = t * sp + k * 1.047;
  const tilt = (k - 2.5) * 0.42;
  const x = Math.cos(a) * r, z = Math.sin(a) * r, y = Math.sin(a * 2 + k) * 0.25;
  out[0] = x; out[1] = y * Math.cos(tilt) - z * Math.sin(tilt); out[2] = y * Math.sin(tilt) + z * Math.cos(tilt);
};

// ---------- Interaction ----------
let px = 0, py = 0, tx = 0, ty = 0, pulse = 0, spinBoost = 0, lastY = scrollY, vel = 0;
addEventListener("pointermove", e => { tx = (e.clientX / innerWidth - .5) * 2; ty = (e.clientY / innerHeight - .5) * 2; }, { passive: true });
document.addEventListener("click", e => { if (e.target.closest("#days button, nav.tabs a, .fav, .play, .support")) { pulse = 1; spinBoost = 2.5; } }, true);
addEventListener("scroll", () => { const y = scrollY; vel += (y - lastY) * 0.002; lastY = y; }, { passive: true });

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 62 : 50; camera.updateProjectionMatrix();
}
addEventListener("resize", resize); resize();

function syncTheme() {
  const l = isLight(); U.uLight.value = l ? 1 : 0;
  const b = l ? THREE.NormalBlending : THREE.AdditiveBlending;
  if (gMat.blending !== b) { gMat.blending = b; gMat.needsUpdate = true; }
  shell.material.opacity = l ? 0.35 : 0.22; shell.material.color.set(l ? 0xB46BFF : 0xFFD27A);
  shell.material.blending = b; shell.material.needsUpdate = true;
  rings.forEach(m => { m.material.blending = b; m.material.needsUpdate = true; });
}
new MutationObserver(syncTheme).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", syncTheme);
syncTheme();

// ---------- Loop with adaptive quality ----------
const clock = new THREE.Clock();
let running = true, raf = 0, frames = 0, acc = 0, skip = false, every = lite ? 2 : 1, tick = 0;
const tmp = [0, 0, 0];
function frame() {
  raf = requestAnimationFrame(frame);
  if (++tick % every) return;
  const dt = Math.min(clock.getDelta(), 0.1), t = (U.uTime.value += dt);
  acc += dt; frames++;
  if (acc > 2) { const ms = acc / frames * 1000 / every; acc = 0; frames = 0;
    if (ms > 26 && !skip) { skip = true; pr = Math.max(0.75, pr * 0.7); renderer.setPixelRatio(pr); U.uPx.value = pr; resize(); gGeo.setDrawRange(0, Math.floor(N * 0.55)); }
    else if (ms > 26 && skip && every === 1) every = 2; }

  px += (tx - px) * 0.04; py += (ty - py) * 0.04;
  pulse *= 0.94; spinBoost *= 0.95; vel *= 0.9; U.uPulse.value = pulse;
  const p = Math.min(scrollY / 900, 1);

  camera.position.x = px * 0.35 + Math.sin(t * 0.13) * 0.15;
  camera.position.y = -py * 0.25 + Math.cos(t * 0.11) * 0.1;
  camera.lookAt(camera.position.x, camera.position.y, 0);

  // Anchor the crystal to the hero block on the line-up page; elsewhere it floats small, deeper in the sky
  const vis = hero && hero.isConnected && hero.offsetParent !== null;
  const halfH = Math.tan(camera.fov * Math.PI / 360) * camera.position.z, halfW = halfH * camera.aspect;
  let sx = innerWidth * 0.5, sy = innerHeight * 0.55, ts = 0.42, tz = -2.5;
  if (vis) { const r = hero.getBoundingClientRect(); sy = r.top + r.height * 0.42; sx = innerWidth * (innerWidth < 720 ? 0.66 : 0.7); ts = Math.min(r.height / 520, 0.9); tz = 0; }
  const goal = heart.userData.goal || (heart.userData.goal = new THREE.Vector3(0, 0, 0));
  goal.set((sx / innerWidth - 0.5) * 2 * halfW, (0.5 - sy / innerHeight) * 2 * halfH, tz);
  heart.position.lerp(goal, heart.userData.snap ? 0.25 : 1); heart.userData.snap = 1;
  heart.position.y += Math.sin(t * 0.7) * 0.08;
  heart.userData.s = (heart.userData.s || ts) + (ts - (heart.userData.s || ts)) * 0.08;
  heart.scale.setScalar(heart.userData.s * (1 + pulse * 0.12));
  crystal.rotation.y += dt * (0.35 + spinBoost);
  crystal.rotation.x = Math.sin(t * 0.3) * 0.15;
  shell.rotation.y -= dt * 0.12; shell.rotation.z += dt * 0.05;
  core.scale.setScalar(1 + Math.sin(t * 2.2) * 0.08 + pulse * 0.5);
  rings.forEach((m, i) => { m.rotation.z += dt * (0.1 + i * 0.05) * (i % 2 ? -1 : 1); });
  galaxy.rotation.y += dt * 0.03 + vel * 0.05;

  for (let k = 0; k < 6; k++) for (let j = 0; j < TRAIL; j++) {
    orbit(k, t * (1 + spinBoost * 0.3) - j * 0.035, tmp); oPos.set(tmp, (k * TRAIL + j) * 3);
  }
  oGeo.attributes.position.needsUpdate = true;

  cv.style.opacity = String(1 - p * 0.3);
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
