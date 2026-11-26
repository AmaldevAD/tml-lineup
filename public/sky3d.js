// 3D "temple of emotions": an original, stylised piece inspired by the mood of a festival main stage (not a replica).
// A serene golden face crowned with six emotion rays, framed by a pointed arch and stepped spires, stairs leading down,
// six glowing emotion orbs circling it, sweeping light beams and a starry sky.
// Loaded lazily after the page is interactive; never with reduced motion or without WebGL2.
// Perf: capped pixel ratio, parts merged by material (a couple of dozen draw calls), pauses when hidden, adapts to slow frames.
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
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
camera.position.set(0, 0.4, 9);

const U = { uTime: { value: 0 }, uDark: { value: 1 }, uPulse: { value: 0 }, uRim: { value: new THREE.Color("#5B8CFF") } };

// ---------- Sculpted material: soft three-step shading, a cool rim light and a metallic glint for gold ----------
const vert = `varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vV = mv.xyz; gl_Position = projectionMatrix * mv; }`;
const frag = `uniform float uTime, uDark, uPulse, uMetal, uEmis; uniform vec3 uColor, uRim; varying vec3 vV;
  void main(){
    vec3 n = normalize(cross(dFdx(vV), dFdy(vV)));
    vec3 L = normalize(vec3(-0.35, 0.75, 0.6)), V = normalize(-vV);
    float d = dot(n, L) * 0.5 + 0.5;
    float ramp = d < 0.38 ? 0.55 : (d < 0.7 ? 0.8 : 1.0);
    vec3 shade = mix(uColor * vec3(0.58, 0.5, 0.74), uColor, ramp);
    float spec = pow(max(dot(reflect(-L, n), V), 0.0), 18.0) * uMetal;
    float rim = pow(1.0 - max(dot(n, V), 0.0), 2.5) * (0.35 + 0.45 * uDark);
    vec3 c = shade + spec * vec3(1.0, 0.92, 0.75) + rim * uRim + uColor * (uEmis + uPulse * 0.35);
    gl_FragColor = vec4(c, 1.0);
  }`;

const temple = new THREE.Group();
scene.add(temple);
const face = new THREE.Group();
temple.add(face);
const MATS = {};
function mat(key, color, metal = 0, emis = 0) {
  return MATS[key] ||= new THREE.ShaderMaterial({ uniforms: { ...U, uColor: { value: new THREE.Color(color) }, uMetal: { value: metal }, uEmis: { value: emis } }, vertexShader: vert, fragmentShader: frag });
}
// Parts are transformed once and merged per material, so the whole temple is a handful of meshes
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3();
const templeParts = new Map(), faceParts = new Map();
function put(bucket, g, key, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  M.compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz));
  const ng = (g.index ? g.toNonIndexed() : g).applyMatrix4(M);
  (bucket.get(key) || bucket.set(key, []).get(key)).push(ng.attributes.position.array);
}
const add = (g, key, o) => put(templeParts, g, key, o);
const addFace = (g, key, o) => put(faceParts, g, key, o);
const ext = (shape, depth, segs = 8) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: segs });

// Palette: the six emotions + gold + stone
const EMO = ["#5C86F2", "#EDBE55", "#9B74F0", "#E25C8A", "#E57A4A", "#4AA6CF"]; // wonder, joy, desire, love, anger, sadness
mat("gold", "#E9BC62", 1.0); mat("goldD", "#B07E3A", 0.8); mat("stone", "#5B4C9E", 0.1);
mat("sp0", "#7E5BC9", 0.25); mat("sp1", "#C8614A", 0.25); mat("sp2", "#4B6FC4", 0.25); mat("night", "#22164F", 0, 0.15); mat("ink", "#2A1B4E");
EMO.forEach((c, i) => mat("e" + i, c, 0.3, 0.12));

// Pointed arch frame with a deep night panel inside
function archShape(hw, side, top) {
  const s = new THREE.Shape(); s.moveTo(-hw, 0); s.lineTo(-hw, side);
  s.quadraticCurveTo(-hw, side + (top - side) * 0.75, 0, top); s.quadraticCurveTo(hw, side + (top - side) * 0.75, hw, side);
  s.lineTo(hw, 0); s.closePath(); return s;
}
const inner = archShape(1.02, 1.3, 2.42);
const archFrame = archShape(1.25, 1.35, 2.75); archFrame.holes.push(new THREE.Path(inner.getPoints(16).reverse()));
add(ext(archFrame, 0.18, 16), "gold", { z: -0.75 });
add(new THREE.ShapeGeometry(inner, 16), "night", { z: -0.7 });
add(new THREE.OctahedronGeometry(0.12, 0), "gold", { y: 2.92, z: -0.66, sy: 1.6 });

// Stepped spires either side, mirrored: desire, anger and wonder colours with gold bands and finials
[[1.62, 2.45, 0.2, 0], [2.08, 1.95, 0.17, 1], [2.5, 1.45, 0.14, 2]].forEach(([x, h, r, e]) => {
  for (const sx of [-1, 1]) {
    add(new THREE.CylinderGeometry(r, r * 1.15, h * 0.62, 6), "sp" + e, { x: x * sx, y: h * 0.31, z: -0.55 });
    add(new THREE.CylinderGeometry(r * 1.25, r * 1.25, 0.08, 6), "gold", { x: x * sx, y: h * 0.62, z: -0.55 });
    add(new THREE.ConeGeometry(r * 1.1, h * 0.42, 6), "sp" + e, { x: x * sx, y: h * 0.83, z: -0.55 });
    add(new THREE.OctahedronGeometry(0.07, 0), "gold", { x: x * sx, y: h * 1.06, z: -0.55, sy: 1.5 });
  }
});

// Platform and stairs flowing down towards the crowd
add(new THREE.CylinderGeometry(1.55, 1.7, 0.2, 18), "stone", { y: -0.1, z: -0.2, sz: 0.6 });
for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(1.1 + i * 0.32, 0.12, 0.2), i % 2 ? "stone" : "goldD", { y: -0.26 - i * 0.12, z: 0.18 + i * 0.2 });

// The serene face: closed eyes, a single tear, a quiet smile, crowned with six emotion rays
const ray = new THREE.Shape(); ray.moveTo(-0.09, 0); ray.quadraticCurveTo(-0.13, 0.32, 0, 0.62); ray.quadraticCurveTo(0.13, 0.32, 0.09, 0); ray.closePath();
EMO.forEach((_, i) => { const a = (i - 2.5) * 0.36; addFace(ext(ray, 0.06), "e" + i, { x: Math.sin(a) * 0.62, y: 1.32 + Math.cos(a) * 0.62, z: -0.22, rz: -a }); });
addFace(new THREE.TorusGeometry(0.66, 0.035, 6, 32, Math.PI * 1.1), "gold", { y: 1.32, z: -0.2, rz: -0.05 * Math.PI });
addFace(new THREE.SphereGeometry(0.5, 16, 12), "gold", { y: 1.22, sx: 0.84, sy: 1.1, sz: 0.74 });
addFace(new THREE.TorusGeometry(0.09, 0.02, 4, 10, Math.PI), "ink", { x: -0.17, y: 1.28, z: 0.33, rz: Math.PI });
addFace(new THREE.TorusGeometry(0.09, 0.02, 4, 10, Math.PI), "ink", { x: 0.17, y: 1.28, z: 0.33, rz: Math.PI });
addFace(new THREE.ConeGeometry(0.055, 0.2, 4), "gold", { y: 1.13, z: 0.37, rx: 0.35 });
addFace(new THREE.TorusGeometry(0.08, 0.018, 4, 10, Math.PI), "e3", { y: 0.96, z: 0.33, rz: Math.PI });
addFace(new THREE.SphereGeometry(0.035, 8, 6), "e5", { x: 0.22, y: 1.13, z: 0.34, sy: 1.4 });
addFace(new THREE.CylinderGeometry(0.2, 0.28, 0.32, 10), "goldD", { y: 0.56 });
addFace(new THREE.CylinderGeometry(0.62, 0.82, 0.3, 14), "gold", { y: 0.3, sz: 0.7 });

function build(bucket, group) {
  for (const [key, arrs] of bucket) {
    const arr = new Float32Array(arrs.reduce((a, b) => a + b.length, 0)); let o = 0;
    for (const a of arrs) { arr.set(a, o); o += a.length; }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    group.add(new THREE.Mesh(g, MATS[key]));
  }
}
build(templeParts, temple); build(faceParts, face);

// ---------- Light: glow sprites, emotion orbs, sweeping beams, stars ----------
function glowTex() {
  const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d");
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.25, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const GLOW = glowTex();
const glowMats = [];
const glow = (color, size, opacity, x, y, z, parent = temple) => {
  const m = new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
  m.userData.base = opacity; glowMats.push(m);
  const s = new THREE.Sprite(m); s.scale.setScalar(size); s.position.set(x, y, z); parent.add(s); return s;
};
glow("#F3C66B", 3.4, 0.35, 0, 1.25, -0.8);   // halo behind the face
glow("#7A55F0", 5.5, 0.3, 0, 0.6, -1.2);     // violet bloom
glow("#5B8CFF", 4.0, 0.22, 0, -0.5, 0.2);    // blue mist on the stairs

const orbGeo = new THREE.IcosahedronGeometry(0.11, 1);
const orbs = EMO.map((c, i) => {
  const g = new THREE.Group(); temple.add(g);
  g.add(new THREE.Mesh(orbGeo, mat("orb" + i, c, 0.4, 0.65)));
  glow(c, 0.9, 0.75, 0, 0, 0, g);
  return g;
});

// Light beams: open cones from behind the arch, additive, fading with height (night only)
const beamMat = new THREE.ShaderMaterial({
  uniforms: { uCol: { value: new THREE.Color("#5B8CFF") }, uStr: { value: 0.28 } },
  vertexShader: `varying float vH; varying vec3 vN; varying vec3 vV; void main(){ vH = position.y / 7.0; vec4 mv = modelViewMatrix * vec4(position,1.0); vV = mv.xyz; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform vec3 uCol; uniform float uStr; varying float vH; varying vec3 vN; varying vec3 vV;
    void main(){ float edge = abs(dot(normalize(vN), normalize(-vV))); gl_FragColor = vec4(uCol * uStr * (1.0 - vH) * edge * edge, 1.0); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
});
const beamGeo = new THREE.CylinderGeometry(0.75, 0.03, 7, 14, 1, true); beamGeo.translate(0, 3.5, 0);
const beams = [-1.9, -0.8, 0.8, 1.9].map((x, i) => { const b = new THREE.Mesh(beamGeo, beamMat); b.position.set(x, 0.2, -1.1); b.userData.i = i; temple.add(b); return b; });

// Stars: one draw call (night only)
const N = lite ? 160 : 280, sp = new Float32Array(N * 3);
for (let i = 0; i < N; i++) { sp[i * 3] = (Math.random() - 0.5) * 30; sp[i * 3 + 1] = (Math.random() - 0.3) * 18; sp[i * 3 + 2] = -6 - Math.random() * 8; }
const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
const starMat = new THREE.PointsMaterial({ map: GLOW, color: "#FFF4D6", size: 0.16, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
const stars = new THREE.Points(starGeo, starMat); scene.add(stars);

// ---------- Interaction ----------
let px = 0, py = 0, tx = 0, ty = 0, pulse = 0, dark = true;
addEventListener("pointermove", e => { tx = (e.clientX / innerWidth - .5) * 2; ty = (e.clientY / innerHeight - .5) * 2; }, { passive: true });
document.addEventListener("click", e => { if (e.target.closest("#days button, nav.tabs a, .fav, .play, .support")) pulse = 1; }, true);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener("resize", resize); resize();

function syncTheme() {
  dark = isDark();
  U.uDark.value = dark ? 1 : 0; U.uRim.value.set(dark ? "#5B8CFF" : "#B08CFF");
  MATS.night.uniforms.uColor.value.set(dark ? "#22164F" : "#5B47A8");
  beams.forEach(b => b.visible = dark); stars.visible = dark;
  // Additive glows vanish on a light background, so use normal blending there
  glowMats.forEach(m => { m.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending; m.opacity = m.userData.base * (dark ? 1 : 0.5); m.needsUpdate = true; });
}
new MutationObserver(syncTheme).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", syncTheme);
syncTheme();

// ---------- Loop ----------
const clock = new THREE.Clock(), goal = new THREE.Vector3();
let idle = false, running = true, raf = 0, frames = 0, acc = 0, every = lite ? 2 : 1, tick = 0, snap = false, sc = 0.5, slowed = false, op = 1;
const HT = 3.7, WD = 5.9; // temple size in world units (height incl. stairs, width incl. spires)
function frame() {
  raf = requestAnimationFrame(frame);
  if (++tick % every) return;
  const dt = Math.min(clock.getDelta(), 0.1), t = (U.uTime.value += dt);
  acc += dt; frames++;
  if (acc > 2) { const ms = acc / frames * 1000 / every; acc = 0; frames = 0;
    if (ms > 26 && !slowed) { slowed = true; pr = Math.max(0.85, pr * 0.7); renderer.setPixelRatio(pr); resize(); }
    else if (ms > 26 && every === 1) every = 2; }

  px += (tx - px) * 0.05; py += (ty - py) * 0.05;
  pulse *= 0.94; U.uPulse.value = pulse;

  camera.position.x = px * 0.35; camera.position.y = 0.4 - py * 0.2;
  camera.lookAt(camera.position.x * 0.5, 0.4, 0);

  // Stand in the hero above the title on the line-up page; elsewhere glow faintly in the background
  const vis = hero && hero.isConnected && hero.offsetParent !== null;
  const halfH = Math.tan(camera.fov * Math.PI / 360) * camera.position.z, halfW = halfH * camera.aspect, ppu = innerHeight / (2 * halfH);
  let sy = innerHeight * 0.45, ts = 0.55, to = 0.22, off = false;
  if (vis) {
    const r = hero.getBoundingClientRect(), ht = hero.querySelector(".ht"), bottom = ht ? ht.getBoundingClientRect().top : r.bottom;
    const area = Math.max(140, bottom - r.top);
    sy = r.top + area * 0.52; ts = Math.min(area * 0.86 / (HT * ppu), innerWidth * 0.98 / (WD * ppu), 1.1); to = 1; off = r.bottom < -40;
  }
  // The temple's visual centre sits about 1.05 units above its origin
  goal.set(0, (0.5 - sy / innerHeight) * 2 * halfH + 0.4 - 1.05 * sc, vis ? 0 : -3);
  temple.position.lerp(goal, snap ? 0.25 : 1); snap = true;
  sc += (ts - sc) * 0.08; temple.scale.setScalar(sc * (1 + pulse * 0.04));
  op += (to - op) * 0.1; cv.style.opacity = op.toFixed(3);

  temple.rotation.y = Math.sin(t * 0.25) * 0.22;
  face.rotation.y = Math.sin(t * 0.4) * 0.12; face.position.y = Math.sin(t * 0.8) * 0.03;
  orbs.forEach((o, i) => { const a = t * 0.35 + i * 1.047; o.position.set(Math.cos(a) * 1.75, 1.2 + Math.sin(a * 2 + i) * 0.25 + Math.sin(a) * 0.35, Math.sin(a) * 0.9); });
  if (dark) { beams.forEach(b => { b.rotation.z = Math.sin(t * 0.45 + b.userData.i * 1.3) * 0.45 + (b.position.x > 0 ? -0.15 : 0.15); }); beamMat.uniforms.uStr.value = 0.28 + pulse * 0.3; }
  stars.rotation.z = t * 0.004;

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
