// Hero 3D: the cracked stone face. A depth-displaced relief that turns with the pointer (or the phone's tilt),
// whose closed eyelid slowly opens on a glowing blue eye, while blue light starts leaking through the gold cracks.
// Doodle stars and pencil orbits keep circling it, in the site's sketch style.
// Loaded lazily after the page is interactive; never with reduced motion or without WebGL2 (the page shows a still face then).
// Perf: one textured mesh + a glow sprite, capped pixel ratio, pauses when hidden or scrolled away, adapts to slow frames.
import * as THREE from "./vendor/three-0.160.0.module.min.js";

const root = document.documentElement;
const host = document.querySelector(".magic");
const hero = document.querySelector(".hero3d");
const lite = root.classList.contains("lite");
const isDark = () => root.dataset.theme === "dark" || (!root.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);

// Phones: the canvas lives inside the hero and scrolls with the page like any other element, so nothing has to chase
// the scroll position per frame, and drawing pauses while a finger is moving the page. The canvas is also only hero-sized.
const phone = matchMedia("(max-width: 719px), (max-height: 500px) and (pointer: coarse)");
const lineup = document.getElementById("v-lineup");
let lastScroll = -1e9, heroOn = true, small = phone.matches;
phone.addEventListener?.("change", () => { small = phone.matches; });
addEventListener("scroll", () => { lastScroll = performance.now(); }, { passive: true });
if (hero && "IntersectionObserver" in window) new IntersectionObserver(es => { heroOn = es[es.length - 1].isIntersecting; }, { rootMargin: "40px" }).observe(hero);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
let pr = Math.min(devicePixelRatio || 1, lite ? 1.25 : phone.matches ? 1.5 : 1.75);
renderer.setPixelRatio(pr);
renderer.setClearColor(0x000000, 0);
const cv = renderer.domElement; cv.className = "sky3d"; cv.setAttribute("aria-hidden", "true");

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(0, 0, 7);

const heart = new THREE.Group();
scene.add(heart);

// ---------- The face ----------
// face.webp is the artwork cropped to x 100..1024, y 0..1430 of the 1086×1448 original; eye maths below uses those crop pixels.
const IMG = new THREE.Vector2(924, 1430), CROP_X = 100;
const FH = 3.9, FW = FH * IMG.x / IMG.y;
const loader = new THREE.TextureLoader();
const load = url => new Promise((ok, no) => loader.load(url, ok, undefined, no));
const [tex, depth] = await Promise.all([load("/hero/face.webp"), load("/hero/face-depth.png")]);
tex.anisotropy = 4; // left in sRGB: the shader writes straight to the canvas without a colour-space pass

const FU = {
  uTex: { value: tex }, uDepth: { value: depth }, uTime: { value: 0 },
  uOpen: { value: 0 }, uWake: { value: 0 }, uGlow: { value: 0 }, uDark: { value: 0 },
  uLook: { value: new THREE.Vector2() }, uLight: { value: new THREE.Vector3(-0.4, 0.5, 0.8) }, uImg: { value: IMG },
};
const faceMat = new THREE.ShaderMaterial({
  uniforms: FU, transparent: true,
  vertexShader: `uniform sampler2D uDepth; varying vec2 vUv; varying vec3 vV;
    void main(){ vUv = uv; float d = texture2D(uDepth, uv).r;
      vec3 p = position + vec3(0.0, 0.0, d * 0.95);
      vec4 mv = modelViewMatrix * vec4(p, 1.0); vV = mv.xyz; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform sampler2D uTex; uniform float uTime, uOpen, uWake, uGlow, uDark; uniform vec2 uLook, uImg; uniform vec3 uLight;
    varying vec2 vUv; varying vec3 vV;
    const vec3 BLUE = vec3(0.30, 0.78, 1.0);
    void main(){
      vec4 c = texture2D(uTex, vUv);
      if (c.a < 0.45) discard;
      vec3 col = c.rgb;
      // Relight from the displaced surface so turning the head reads as real depth
      vec3 n = normalize(cross(dFdx(vV), dFdy(vV)));
      float l = clamp(dot(n, normalize(uLight)), 0.0, 1.0);
      col *= 0.92 + 0.3 * l;
      vec2 p = vec2(vUv.x * uImg.x + ${CROP_X.toFixed(1)}, (1.0 - vUv.y) * uImg.y); // original-image pixels
      // Gold cracks: a slow shimmer sweeps across them; once awake, cold blue light seeps out of them
      float gold = smoothstep(0.22, 0.38, c.r - c.b) * smoothstep(0.35, 0.6, c.g);
      float sweep = smoothstep(0.1, 0.0, abs(fract(dot(vUv, vec2(0.55, -0.85)) * 0.8 - uTime * 0.09) - 0.5));
      col += gold * sweep * vec3(1.0, 0.85, 0.45) * 0.55;
      float beat = 0.65 + 0.35 * sin(uTime * 2.4);
      col = mix(col, col * 0.6 + BLUE * 0.8, gold * uWake * (0.3 + 0.25 * beat) * (0.6 + 0.4 * uDark));
      // The eye: the lid line is a gentle downward curve; it parts into an almond around a glowing iris
      float dx = (p.x - 650.0) / 102.0, env = max(0.0, 1.0 - dx * dx);
      float lid = 617.0 - 17.0 * dx * dx;
      float up = lid - uOpen * 38.0 * pow(env, 0.7), lo = lid + uOpen * 9.0 * env;
      float inside = smoothstep(up - 1.5, up + 1.5, p.y) * smoothstep(lo + 1.5, lo - 1.5, p.y) * step(0.001, env);
      vec2 ic = vec2(650.0 + uLook.x * 26.0, lid - 13.0 * uOpen + uLook.y * 5.0);
      float r = length(p - ic);
      float iris = smoothstep(24.0, 20.0, r);
      float pupil = smoothstep(2.6, 1.2, abs(p.x - ic.x)) * smoothstep(17.0, 13.0, abs(p.y - ic.y));
      vec3 iriscol = mix(BLUE * 1.35, vec3(0.75, 0.95, 1.0), smoothstep(18.0, 5.0, r)) * (0.85 + 0.25 * beat + uGlow * 0.5);
      vec3 eye = mix(vec3(0.02, 0.03, 0.07), iriscol, iris);
      eye = mix(eye, vec3(0.0, 0.02, 0.06), pupil * iris);
      eye += BLUE * 0.35 * exp(-r * r / 900.0); // light spilling over the dark sclera
      col = mix(col, eye, inside);
      // A dark crease rides above the opening lid, then the glow lights up the stone around the eye
      col *= 1.0 - 0.55 * uOpen * smoothstep(3.5, 0.0, abs(p.y - (up - 2.5))) * step(0.001, env) * (1.0 - inside);
      float halo = exp(-dot(p - ic, p - ic) / (2.0 * 70.0 * 70.0)) * uOpen * (0.6 + 0.25 * beat + uGlow);
      col += BLUE * halo * 0.55 * (1.0 - inside);
      // The second eye is hidden behind the broken stone: a cold glint shows through the crevice
      float lum = dot(c.rgb, vec3(0.3, 0.59, 0.11));
      vec2 q = p - vec2(868.0, 612.0);
      col += BLUE * exp(-dot(q, q) / (2.0 * 26.0 * 26.0)) * smoothstep(0.55, 0.3, lum) * uWake * (0.9 + 0.4 * beat);
      gl_FragColor = vec4(col, smoothstep(0.45, 0.6, c.a));
    }`,
});
const face = new THREE.Mesh(new THREE.PlaneGeometry(FW, FH, lite ? 70 : 110, lite ? 108 : 170), faceMat);
const faceRig = new THREE.Group(); faceRig.add(face); heart.add(faceRig);
const eyeLocal = (x, y, z) => new THREE.Vector3(((x - CROP_X) / IMG.x - 0.5) * FW, (0.5 - y / IMG.y) * FH, z);

// Soft blue bloom in front of the eye so the glow spills past the stone's edge
function glowTex() {
  const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(190,235,255,1)"); g.addColorStop(0.18, "rgba(90,190,255,.55)"); g.addColorStop(0.5, "rgba(60,140,255,.14)"); g.addColorStop(1, "rgba(40,110,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 }));
glow.position.copy(eyeLocal(650, 605, 0.75)); glow.scale.setScalar(0.9); face.add(glow);

// ---------- Pencil orbits that boil (re-jitter ~8 times a second, like hand-drawn frames) ----------
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
function ellipseSrc(rx, rz, n) { const s = []; for (let i = 0; i < n; i++) { const a0 = i / n * 6.283, a1 = (i + 1) / n * 6.283;
  s.push(Math.cos(a0) * rx, 0, Math.sin(a0) * rz, Math.cos(a1) * rx, 0, Math.sin(a1) * rz); } return new Float32Array(s); }
const orbitMat = new THREE.LineDashedMaterial({ color: 0x2B1D14, dashSize: 0.16, gapSize: 0.12, transparent: true, opacity: 0.5 });
const orbits = [[2.1, 0.9, 0.35], [1.85, 0.8, -0.5]].map(([rx, rz, tilt]) => {
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
  s.scale.setScalar(0.42 + (k % 3) * 0.07); s.userData = { k, fill: f }; heart.add(s); return s;
});
const orbitPos = (k, t, v) => {
  const r = 1.9 + (k % 3) * 0.25, a = t * (0.3 + k * 0.045) + k * 1.047, tilt = (k - 2.5) * 0.35;
  const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.45, y = Math.sin(a * 2 + k) * 0.2;
  v.set(x, y * Math.cos(tilt) - z * Math.sin(tilt), y * Math.sin(tilt) + z * Math.cos(tilt));
};

// ---------- Interaction: the head turns toward the pointer (or the phone's tilt) and the eye follows ----------
let px = 0, py = 0, tx = 0, ty = 0, pulse = 0, usedPointer = false;
addEventListener("pointermove", e => { if (e.pointerType === "mouse") usedPointer = true; tx = (e.clientX / innerWidth - .5) * 2; ty = (e.clientY / innerHeight - .5) * 2; }, { passive: true });
addEventListener("deviceorientation", e => { if (usedPointer || e.gamma == null) return;
  tx = Math.max(-1, Math.min(1, e.gamma / 25)); ty = Math.max(-1, Math.min(1, (e.beta - 45) / 25)); }, { passive: true });
document.addEventListener("click", e => { if (e.target.closest("#days button, nav.tabs a, .fav, .play, .support")) pulse = 1; }, true);

let cw = innerWidth, ch = innerHeight, heroH = 300;
function resize() {
  const emb = cv.parentNode === hero;
  const w = emb ? cv.clientWidth || innerWidth : innerWidth, h = emb ? cv.clientHeight || 300 : innerHeight;
  const vfov = innerWidth / innerHeight < 0.8 ? 62 : 50;
  renderer.setSize(w, h, false); camera.aspect = w / h; cw = w; ch = h;
  if (emb) { // keep the face the same size on screen as it was with a full-screen canvas
    heroH = hero.offsetHeight;
    const ppu = innerHeight / (2 * Math.tan(vfov * Math.PI / 360) * camera.position.z);
    camera.fov = 2 * Math.atan(h / 2 / ppu / camera.position.z) * 180 / Math.PI;
  } else camera.fov = vfov;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize); resize();
if (hero && "ResizeObserver" in window) new ResizeObserver(() => { if (cv.parentNode === hero) resize(); }).observe(hero);

function syncTheme() {
  const d = isDark(), ink = d ? "#F3E6D0" : "#2B1D14";
  FU.uDark.value = d ? 1 : 0;
  glow.material.blending = d ? THREE.AdditiveBlending : THREE.NormalBlending; glow.material.needsUpdate = true;
  orbitMat.color.set(ink);
  stars.forEach(s => { s.material.map.dispose(); s.material.map = starTex(s.userData.fill, d ? "#16120E" : ink); s.material.needsUpdate = true; });
}
new MutationObserver(syncTheme).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", syncTheme);
syncTheme();

// ---------- Eye timeline: a twitch, a pause, then it opens; afterwards it blinks now and then ----------
const ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
let wakeAt = -1, nextBlink = 0;
function eyeOpen(t) {
  if (wakeAt < 0) return 0;
  const s = t - wakeAt;
  if (s < 0) return 0;
  if (s < 0.35) return 0.22 * ease(s / 0.35);                 // flicker open a crack
  if (s < 0.75) return 0.22 * (1 - ease((s - 0.35) / 0.25)); // …and shut again
  if (s < 1.2) return 0;
  if (s < 2.6) return ease((s - 1.2) / 1.4);                  // then slowly, fully open
  if (t > nextBlink) nextBlink = t + 5 + Math.random() * 5;
  const b = nextBlink - t;                                    // quick blink just before nextBlink
  return b < 0.2 ? Math.abs(b - 0.1) / 0.1 : 1;
}

// ---------- Loop ----------
const clock = new THREE.Clock(), tmp = new THREE.Vector3(), goal = new THREE.Vector3();
let idle = false, running = true, raf = 0, frames = 0, acc = 0, every = lite ? 2 : 1, tick = 0, boilT = 0, snap = false, sc = 0.5, slowed = false, op = 0;
function frame() {
  raf = requestAnimationFrame(frame);
  if (++tick % every) return;
  const dt = Math.min(clock.getDelta(), 0.1), t = (FU.uTime.value += dt);
  acc += dt; frames++;
  if (acc > 2) { const ms = acc / frames * 1000 / every; acc = 0; frames = 0;
    if (ms > 26 && !slowed) { slowed = true; pr = Math.max(0.85, pr * 0.7); renderer.setPixelRatio(pr); resize(); }
    else if (ms > 26 && every === 1) every = 2; }

  // Where the canvas should live: inside the hero on phones while the line-up is showing, else the fixed background layer
  const shown = !!hero && hero.isConnected && lineup && !lineup.hidden;
  const embed = shown && small, want = embed ? hero : host;
  if (cv.parentNode !== want) { want.appendChild(cv); resize(); snap = false; }
  if (small && performance.now() - lastScroll < 180) return; // finger on the page: leave the frame as it is
  if (embed && !heroOn) { if (!idle) { renderer.clear(); idle = true; } return; }

  px += (tx - px) * 0.05; py += (ty - py) * 0.05;
  pulse *= 0.94;

  if ((boilT += dt) > 0.12) { boilT = 0; orbits.forEach(l => boil(l.geometry, 0.025)); }

  camera.position.x = px * 0.25; camera.position.y = -py * 0.15;
  camera.lookAt(camera.position.x, camera.position.y, 0);

  // Sit in the hero on the line-up page; elsewhere drift faintly in the background
  const vis = shown;
  const halfH = Math.tan(camera.fov * Math.PI / 360) * camera.position.z, halfW = halfH * camera.aspect;
  let sx = cw * 0.5, sy = ch * 0.5, ts = 0.38, to = 0.14, off = false;
  if (embed) { sx = cw * 0.68; sy = 24 + heroH * 0.34; ts = Math.min(heroH / 520, 0.9) * 0.92; to = 1;
    if (wakeAt < 0) wakeAt = t + 0.9; }
  else if (vis) { const r = hero.getBoundingClientRect(), phone = innerWidth < 720;
    sy = r.top + r.height * (phone ? 0.34 : 0.42); sx = phone ? innerWidth * 0.68 : Math.min(innerWidth * 0.72, r.right - r.height * 0.42);
    ts = Math.min(r.height / 520, 0.9) * (phone ? 0.92 : 1); to = 1; off = r.bottom < -40;
    if (wakeAt < 0 && !off) wakeAt = t + 0.9; }
  goal.set((sx / cw - 0.5) * 2 * halfW, (0.5 - sy / ch) * 2 * halfH, vis ? 0 : -2);
  heart.position.lerp(goal, snap ? 0.25 : 1); snap = true;
  heart.position.y += Math.sin(t * 0.8) * 0.05;
  sc += (ts - sc) * 0.08; heart.scale.setScalar(sc);
  const op0 = op.toFixed(2); op += (to - op) * 0.06; if (op.toFixed(2) !== op0) cv.style.opacity = op.toFixed(2); // no style write once settled

  // The head turns toward you; a slow breathing sway when nothing moves; a tap makes it shudder
  const shake = pulse * Math.sin(t * 55) * 0.05;
  faceRig.rotation.y = 0.12 + px * 0.3 + Math.sin(t * 0.45) * 0.08 + shake;
  faceRig.rotation.x = py * 0.22 + Math.sin(t * 0.33) * 0.04;
  faceRig.rotation.z = -0.04 + shake * 0.4;

  const o = eyeOpen(t);
  FU.uOpen.value = o;
  FU.uWake.value += ((wakeAt >= 0 && t - wakeAt > 1.6 ? 1 : 0) - FU.uWake.value) * 0.02;
  FU.uGlow.value = pulse;
  FU.uLook.value.set(Math.max(-1, Math.min(1, px - 0.25)), Math.max(-1, Math.min(1, py)));
  FU.uLight.value.set(-0.4 - px * 0.5, 0.5 + py * 0.3, 0.8);
  glow.material.opacity = o * (FU.uDark.value ? 0.9 : 0.55) * (0.8 + 0.2 * Math.sin(t * 2.4) + pulse * 0.6);
  glow.scale.setScalar(1.0 + o * 0.5 + pulse * 0.5);

  orbits.forEach((l, i) => { l.rotation.y = t * (i ? -0.15 : 0.12); });
  stars.forEach(s => { orbitPos(s.userData.k, t, tmp); s.position.copy(tmp); s.material.rotation = Math.round(Math.sin(t * 2 + s.userData.k) * 4) / 12; });

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

host.appendChild(cv);
cv.style.opacity = 0;
root.classList.add("three");
raf = requestAnimationFrame(frame);
