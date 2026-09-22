import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const PHRASES = [
  "Como el girasol, miro hacia ti",
  "Gracias por ser mi sol de siempre",
  "Contigo hasta lo simple brilla",
  "Hoy el amarillo lleva tu nombre",
  "Un girasol para quien ilumina",
  "Tu cariño le da luz a mis días",
  "Pétalos dorados solo para ti",
  "Que esta flor te alcance hoy",
  "Aquí siempre tienes un lugar",
  "Feliz día, contigo todo es mejor",
];

function createRingTexture() {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.Texture();

  context.translate(size / 2, size / 2);
  const inner = size * 0.2;
  const outer = size * 0.49;
  const gradient = context.createRadialGradient(0, 0, inner, 0, 0, outer);
  gradient.addColorStop(0, "rgba(255,255,245,1)");
  gradient.addColorStop(0.35, "rgba(255,231,109,1)");
  gradient.addColorStop(0.72, "rgba(255,190,35,.95)");
  gradient.addColorStop(1, "rgba(255,145,0,.8)");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(0, 0, outer, 0, Math.PI * 2);
  context.arc(0, 0, inner, 0, Math.PI * 2, true);
  context.fill();

  for (let index = 0; index < 28; index += 1) {
    const radius = inner + ((outer - inner) * index) / 27;
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.lineWidth = 3 + Math.random() * 6;
    context.strokeStyle = index % 3 === 0 ? "rgba(122,65,0,.18)" : "rgba(255,255,225,.18)";
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createGlowTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.Texture();
  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    12,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, "rgba(255,244,150,.55)");
  gradient.addColorStop(0.45, "rgba(255,183,20,.24)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function createPhraseTexture(text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.Texture();
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "42px 'Cormorant Garamond', serif";
  context.fillStyle = "#fff2a8";
  context.shadowColor = "#f4a900";
  context.shadowBlur = 18;
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  return new THREE.CanvasTexture(canvas);
}

function createFlower() {
  const flower = new THREE.Group();
  const petalMaterial = new THREE.MeshBasicMaterial({ color: 0xffd43b, side: THREE.DoubleSide });
  for (let index = 0; index < 8; index += 1) {
    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), petalMaterial);
    const angle = (index / 8) * Math.PI * 2;
    petal.position.set(Math.cos(angle) * 0.24, Math.sin(angle) * 0.24, 0);
    petal.scale.set(1.2, 0.55, 0.35);
    petal.rotation.z = angle;
    flower.add(petal);
  }
  const center = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x6e3b08 }),
  );
  flower.add(center);
  return flower;
}

export default function YellowGalaxyScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 3000);
    let targetDistance = 320;
    let currentDistance = 320;
    let rotationX = 0.18;
    let rotationY = 0;
    let dragging = false;
    let lastPointerX = 0;
    let lastPointerY = 0;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setClearColor(0x02020a, 1);

    const starPositions = new Float32Array(1800 * 3);
    for (let index = 0; index < starPositions.length; index += 3) {
      starPositions[index] = (Math.random() - 0.5) * 1200;
      starPositions[index + 1] = (Math.random() - 0.5) * 700;
      starPositions[index + 2] = (Math.random() - 0.5) * 1200;
    }
    const starsGeometry = new THREE.BufferGeometry();
    starsGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(
      starsGeometry,
      new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, transparent: true, opacity: 0.9 }),
    );
    scene.add(stars);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(43, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0x010106 }),
    );
    scene.add(core);

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: createGlowTexture(), transparent: true, depthWrite: false }),
    );
    glow.scale.set(360, 360, 1);
    scene.add(glow);

    const ringSystem = new THREE.Group();
    ringSystem.rotation.x = 0.72;
    ringSystem.rotation.z = -0.18;
    scene.add(ringSystem);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(46, 122, 160),
      new THREE.MeshBasicMaterial({
        map: createRingTexture(),
        transparent: true,
        side: THREE.DoubleSide,
      }),
    );
    ringSystem.add(ring);

    const innerHalo = new THREE.Mesh(
      new THREE.RingGeometry(42, 52, 160),
      new THREE.MeshBasicMaterial({
        color: 0xfff1a0,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    innerHalo.position.z = 1.5;
    ringSystem.add(innerHalo);

    const outerHalo = new THREE.Mesh(
      new THREE.RingGeometry(116, 130, 160),
      new THREE.MeshBasicMaterial({
        color: 0xffad18,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    outerHalo.position.z = -1.5;
    ringSystem.add(outerHalo);

    const orbitPositions = new Float32Array(260 * 3);
    for (let index = 0; index < 260; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 50 + Math.random() * 69;
      orbitPositions[index * 3] = Math.cos(angle) * radius;
      orbitPositions[index * 3 + 1] = Math.sin(angle) * radius;
      orbitPositions[index * 3 + 2] = (Math.random() - 0.5) * 5;
    }
    const orbitGeometry = new THREE.BufferGeometry();
    orbitGeometry.setAttribute("position", new THREE.BufferAttribute(orbitPositions, 3));
    const orbitParticles = new THREE.Points(
      orbitGeometry,
      new THREE.PointsMaterial({
        color: 0xffef9b,
        size: 2.3,
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    orbitParticles.position.z = 2;
    ringSystem.add(orbitParticles);

    const phraseGroup = new THREE.Group();
    PHRASES.forEach((phrase, index) => {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: createPhraseTexture(`🌻 ${phrase}`), transparent: true }),
      );
      const angle = (index / PHRASES.length) * Math.PI * 2;
      const radius = 155 + (index % 3) * 28;
      sprite.position.set(
        Math.cos(angle) * radius,
        Math.sin(angle * 1.7) * 90,
        Math.sin(angle) * radius,
      );
      sprite.scale.set(92, 18, 1);
      sprite.userData = { angle, radius, speed: 0.0004 + (index % 4) * 0.00012 };
      phraseGroup.add(sprite);
    });
    scene.add(phraseGroup);

    const flowerGroup = new THREE.Group();
    for (let index = 0; index < 18; index += 1) {
      const flower = createFlower();
      const angle = (index / 18) * Math.PI * 2;
      const radius = 145 + (index % 4) * 24;
      flower.position.set(
        Math.cos(angle) * radius,
        Math.sin(index * 1.8) * 80,
        Math.sin(angle) * radius,
      );
      flower.scale.setScalar(4 + (index % 3));
      flower.userData = { angle, radius, speed: 0.0003 + (index % 3) * 0.00015 };
      flowerGroup.add(flower);
    }
    scene.add(flowerGroup);

    const resize = () => {
      const width = canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth;
      const height =
        canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();
    window.addEventListener("resize", resize);

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const deltaX = (event.clientX - lastPointerX) / Math.max(1, canvas.clientWidth);
      const deltaY = (event.clientY - lastPointerY) / Math.max(1, canvas.clientHeight);
      rotationY -= deltaX * 4.5;
      rotationX = Math.max(-0.9, Math.min(0.9, rotationX + deltaY * 2.5));
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
    };
    const stopDragging = () => {
      dragging = false;
    };
    const onWheel = (event: WheelEvent) => {
      targetDistance = Math.max(220, Math.min(520, targetDistance + event.deltaY * 0.18));
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", stopDragging);
    canvas.addEventListener("pointercancel", stopDragging);
    canvas.addEventListener("wheel", onWheel, { passive: true });

    let frame = 0;
    let animationFrame = 0;
    const animate = () => {
      animationFrame = window.requestAnimationFrame(animate);
      frame += 0.004;
      ringSystem.rotation.z += 0.0018;
      ringSystem.rotation.x = 0.72 + Math.sin(frame * 0.48) * 0.08;
      ringSystem.rotation.y = Math.cos(frame * 0.34) * 0.08;
      core.scale.setScalar(1 + Math.sin(frame * 3) * 0.025);
      glow.scale.setScalar(360 + Math.sin(frame) * 9);
      orbitParticles.rotation.z -= 0.004;
      orbitParticles.rotation.x = Math.sin(frame * 0.7) * 0.04;
      phraseGroup.children.forEach((child) => {
        const data = child.userData as { angle: number; radius: number; speed: number };
        data.angle += data.speed;
        child.position.x = Math.cos(data.angle) * data.radius;
        child.position.z = Math.sin(data.angle) * data.radius;
      });
      flowerGroup.children.forEach((child) => {
        const data = child.userData as { angle: number; radius: number; speed: number };
        data.angle += data.speed;
        child.position.x = Math.cos(data.angle) * data.radius;
        child.position.z = Math.sin(data.angle) * data.radius;
        child.rotation.z += 0.002;
      });
      currentDistance += (targetDistance - currentDistance) * 0.06;
      const cameraCosX = Math.cos(rotationX);
      camera.position.set(
        currentDistance * Math.sin(rotationY) * cameraCosX,
        currentDistance * Math.sin(rotationX),
        currentDistance * Math.cos(rotationY) * cameraCosX,
      );
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", stopDragging);
      canvas.removeEventListener("pointercancel", stopDragging);
      canvas.removeEventListener("wheel", onWheel);
      starsGeometry.dispose();
      (stars.material as THREE.Material).dispose();
      core.geometry.dispose();
      (core.material as THREE.Material).dispose();
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
      innerHalo.geometry.dispose();
      (innerHalo.material as THREE.Material).dispose();
      outerHalo.geometry.dispose();
      (outerHalo.material as THREE.Material).dispose();
      orbitGeometry.dispose();
      (orbitParticles.material as THREE.Material).dispose();
      renderer.dispose();
      canvas.replaceChildren();
    };
  }, []);

  return (
    <div className="relative h-[min(100svh,52rem)] min-h-[38rem] overflow-hidden bg-[#02020a]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        aria-label="Galaxia con flores amarillas"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(2,2,10,.4)_68%,rgba(2,2,10,.95)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-5 z-10 px-4 text-center text-yellow-50 sm:top-8">
        <h1 className="font-display text-3xl drop-shadow-[0_0_18px_rgba(255,215,0,.8)] sm:text-5xl">
          Feliz Día de las Flores Amarillas 🌻
        </h1>
      </div>
      <div className="absolute inset-x-0 bottom-8 z-10 flex flex-col items-center px-5 text-center text-white sm:bottom-10">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-yellow-100/75">
          Una galaxia para ti
        </p>
        <p className="mt-3 max-w-md text-sm text-white/70 sm:text-base">
          Desliza para explorar la galaxia.
        </p>
      </div>
      {!started && (
        <button
          type="button"
          onClick={() => setStarted(true)}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/75 px-6 text-center text-white backdrop-blur-sm"
        >
          <span className="animate-[pulse_1.35s_ease-in-out_infinite] text-7xl drop-shadow-[0_0_28px_rgba(255,215,0,.8)] sm:text-9xl">
            🌻
          </span>
          <span className="mt-5 font-display text-2xl text-yellow-50 sm:text-3xl">
            Toca para iniciar
          </span>
        </button>
      )}
    </div>
  );
}
