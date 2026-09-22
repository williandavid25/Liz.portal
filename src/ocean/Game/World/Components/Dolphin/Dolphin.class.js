import * as THREE from "three";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import vertexShader from "../../../../Shaders/Dolphin/vertex.glsl?raw";
import fragmentShader from "../../../../Shaders/Dolphin/fragment.glsl?raw";
import sparkleVertexShader from "../../../../Shaders/Dolphin/sparkleVertex.glsl?raw";
import sparkleFragmentShader from "../../../../Shaders/Dolphin/sparkleFragment.glsl?raw";
import Game from "../../../Game.class";

const UP_AXIS = new THREE.Vector3(0, 1, 0);

export default class Dolphin {
  constructor() {
    this.game = Game.getInstance();
    this.scene = this.game.scene;
    this.resources = this.game.resources;
    this.time = this.game.time;
    this.keyboard = this.game.keyboard;

    this.modelResource = this.resources.items.dolphinAnimatedModel;

    this.outset = 0.017;
    this._tmpBasePos = new THREE.Vector3();
    this._tmpSkinned = new THREE.Vector3();
    this._tmpLocalOut = new THREE.Vector3();
    this._tmpNormal = new THREE.Vector3();

    // Frame optimization flags
    this._skeletonUpdatedThisFrame = false;
    this._matrixWorldUpdatedThisFrame = false;

    // --- Nado: sigue al mouse/dedo (funciona en celular, sin teclado), con
    // el teclado como control extra en escritorio. ---
    this.swim = {
      bounds: { x: 6.5, y: 5, z: 6.5 },
      maxSpeed: 3.4,
      turnSpeed: 3,
      speedEase: 3.2,
      verticalKeySpeed: 1.8,
      idleSpeed: 0.5,
    };
    this.forward = new THREE.Vector3(0, 0, 1);
    this._prevForward = new THREE.Vector3(0, 0, 1);
    this.speed = 0;
    this._tmpTarget = new THREE.Vector3();
    this._tmpToTarget = new THREE.Vector3();
    this._tmpLookTarget = new THREE.Vector3();
    this._tmpLookMatrix = new THREE.Matrix4();
    this._tmpOrientation = new THREE.Quaternion();

    this.setMaterial();
    this.setModelInstance();
    this.setAnimation();
    this.setupSurfaceSampling();
    this.setDebug();
  }

  setMaterial() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uBaseColor: { value: new THREE.Color(0x6fd3fb) },
      },
    });
  }

  setModelInstance() {
    this.dolphin = this.modelResource.scene;

    this.dolphin.traverse((child) => {
      if (child.isMesh) {
        child.material = this.material;
      }
    });

    this.scene.add(this.dolphin);
  }

  setAnimation() {
    this.animation = {};
    this.animation.mixer = new THREE.AnimationMixer(this.dolphin);

    if (this.modelResource.animations && this.modelResource.animations.length > 0) {
      this.animation.action = this.animation.mixer.clipAction(this.modelResource.animations[0]);
      this.animation.action.play();
    } else {
      console.warn("No animations found in dolphin model");
    }
  }

  setDebug() {
    if (!this.game.isDebugEnabled) return;

    const debug = this.game.debug;

    debug.add(
      this.material.uniforms.uBaseColor,
      "value",
      {
        label: "Base Color",
      },
      "Dolphin",
    );

    if (this.sparklesMaterial) {
      debug.add(
        this.sparklesMaterial.uniforms.uSize,
        "value",
        {
          min: 1,
          max: 50,
          step: 1,
          label: "Sparkle Size",
        },
        "Dolphin",
      );

      debug.add(
        this.sparklesMaterial.uniforms.uColor1,
        "value",
        {
          label: "Sparkle Color 1",
        },
        "Dolphin",
      );

      debug.add(
        this.sparklesMaterial.uniforms.uColor2,
        "value",
        {
          label: "Sparkle Color 2",
        },
        "Dolphin",
      );

      debug.add(
        this,
        "connectionDistance",
        {
          min: 0.1,
          max: 1.0,
          step: 0.05,
          label: "Connection Dist",
        },
        "Dolphin",
      );

      debug.add(
        this.linesMaterial,
        "opacity",
        {
          min: 0,
          max: 1,
          step: 0.1,
          label: "Line Opacity",
        },
        "Dolphin",
      );
    }

    const materialSettings = {
      wireframe: false,
      visible: true,
      sparklesVisible: true,
    };

    debug.add(
      materialSettings,
      "wireframe",
      {
        label: "Wireframe",
        onChange: (value) => {
          this.material.wireframe = value;
        },
      },
      "Dolphin",
    );

    debug.add(
      materialSettings,
      "visible",
      {
        label: "Visible",
        onChange: (value) => {
          this.dolphin.visible = value;
        },
      },
      "Dolphin",
    );

    debug.add(
      materialSettings,
      "sparklesVisible",
      {
        label: "Sparkles Visible",
        onChange: (value) => {
          if (this.sparkles) this.sparkles.visible = value;
          if (this.lines) this.lines.visible = value;
        },
      },
      "Dolphin",
    );

    if (this.animation?.action) {
      const animSettings = {
        timeScale: 1,
        paused: false,
      };

      debug.add(
        animSettings,
        "timeScale",
        {
          min: 0,
          max: 3,
          step: 0.1,
          label: "Anim Speed",
          onChange: (value) => {
            this.animation.action.timeScale = value;
          },
        },
        "Dolphin",
      );

      debug.add(
        animSettings,
        "paused",
        {
          label: "Pause Anim",
          onChange: (value) => {
            if (value) {
              this.animation.action.paused = true;
            } else {
              this.animation.action.paused = false;
            }
          },
        },
        "Dolphin",
      );
    }

    debug.addButton(
      {
        label: "Reset Transform",
        onClick: () => {
          this.dolphin.position.set(0, 0.5, 0);
          this.dolphin.rotation.set(0, 0, 0);
          this.dolphin.scale.set(1, 1, 1);
        },
      },
      "Dolphin",
    );
  }

  update() {
    this.updateSwim(this.time.delta);

    if (this.animation?.mixer) {
      this.animation.mixer.update(this.time.delta);
    }

    if (this.material.uniforms.uTime) {
      this.material.uniforms.uTime.value = this.time.elapsedTime;
    }

    this._sparkleFrame = (this._sparkleFrame || 0) + 1;
    const sparkleInterval = window.innerWidth < 768 ? 3 : 2;
    if (this.sparkles && this.dolphinMesh && this._sparkleFrame % sparkleInterval === 0) {
      this.updateSparklePositions();
    }

    if (this.sparklesMaterial?.uniforms.uTime) {
      this.sparklesMaterial.uniforms.uTime.value = this.time.elapsedTime;
    }
  }

  updateSwim(delta) {
    const keys = this.keyboard?.keys;
    const mouse = this.game.mouse;
    const { bounds, maxSpeed, turnSpeed, speedEase, verticalKeySpeed, idleSpeed } = this.swim;
    const pos = this.dolphin.position;
    const t = this.time.elapsedTime;
    const hasPointerTarget = mouse?.targetActive === true;

    // El delfín persigue la posición del mouse/dedo (X/Y en pantalla), pero el
    // punto que persigue nunca queda quieto: se le suma un vaivén orgánico en
    // los tres ejes (distinta frecuencia/fase por eje) para que siga nadando
    // en todos los ángulos —izquierda/derecha, arriba/abajo, cerca/lejos— en
    // vez de llegar al dedo y quedarse parado ahí.
    const mx = mouse?.smoothedMousePosition?.x ?? 0;
    const my = mouse?.smoothedMousePosition?.y ?? 0;
    const wanderX = Math.sin(t * 0.19) * 1.1 + Math.sin(t * 0.41 + 1.7) * 0.4;
    const wanderY = Math.sin(t * 0.23 + 2.4) * 0.8 + Math.sin(t * 0.37 + 0.6) * 0.3;
    // Ciclo lento y más marcado hacia +Z (donde está la cámara): cada tanto se
    // acerca bastante a la pantalla, como mirando de frente, y después vuelve
    // a alejarse hacia el fondo.
    const wanderZ = Math.sin(t * 0.11 + 4.2) * 3.1 + Math.sin(t * 0.26 + 3.1) * 0.9 + 0.4;
    let desiredSpeed = maxSpeed * 0.72;
    if (hasPointerTarget) {
      this._tmpTarget.set(mx * bounds.x * 0.9, -my * bounds.y * 0.75, wanderZ);
      const toTarget = this._tmpToTarget.copy(this._tmpTarget).sub(pos);
      const distance = toTarget.length();

      desiredSpeed = Math.max(idleSpeed, Math.min(maxSpeed, distance * 1.8));
      if (distance > 0.02) {
        toTarget.normalize();
        this.forward.lerp(toTarget, Math.min(1, turnSpeed * delta));
        if (this.forward.lengthSq() > 0.0001) this.forward.normalize();
      }
    } else {
      // Sin mouse ni dedo no persigue un punto móvil: conserva el rumbo y lo
      // modifica lentamente para nadar de forma natural, sin entrar en órbitas.
      this._tmpTarget.copy(this.forward);
      this._tmpTarget.x += Math.sin(t * 0.17) * 0.22 + Math.sin(t * 0.31 + 1.4) * 0.1;
      this._tmpTarget.y += Math.sin(t * 0.13 + 2.1) * 0.18 + Math.sin(t * 0.27) * 0.08;
      this._tmpTarget.z += Math.sin(t * 0.11 + 0.8) * 0.16;
      this._tmpTarget.normalize();
      this.forward.lerp(this._tmpTarget, Math.min(1, 0.8 * delta));
      this.forward.normalize();
    }

    // Teclado (extra en escritorio): gira y puede forzar la velocidad por
    // encima de lo que pida el seguimiento del mouse.
    if (keys?.left) this.forward.applyAxisAngle(UP_AXIS, turnSpeed * delta);
    if (keys?.right) this.forward.applyAxisAngle(UP_AXIS, -turnSpeed * delta);
    if (keys?.forward) desiredSpeed = maxSpeed;
    if (keys?.backward) desiredSpeed = -maxSpeed * 0.5;
    if (keys?.up) pos.y += verticalKeySpeed * delta;
    if (keys?.down) pos.y -= verticalKeySpeed * delta;

    this.speed += (desiredSpeed - this.speed) * Math.min(1, speedEase * delta);
    pos.addScaledVector(this.forward, this.speed * delta);

    // Orienta el modelo gradualmente para evitar vibraciones al cambiar de rumbo.
    if (this.forward.lengthSq() > 0.0001) {
      this._tmpLookTarget.copy(pos).add(this.forward);
      this._tmpLookMatrix.lookAt(this._tmpLookTarget, pos, UP_AXIS);
      this._tmpOrientation.setFromRotationMatrix(this._tmpLookMatrix);
      this.dolphin.quaternion.slerp(this._tmpOrientation, Math.min(1, 5 * delta));
    }

    // La animación de nado va más rápido cuanto más rápido se mueve.
    if (this.animation?.action) {
      const intensity = Math.min(1, Math.abs(this.speed) / maxSpeed);
      this.animation.action.timeScale = 0.6 + intensity * 1.4;
    }
  }

  _buildVertexGrid(posAttr) {
    // El tamaño de celda se deriva del tamaño del modelo (no de un valor fijo)
    // para que funcione sin importar la escala/unidades con la que se exportó.
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (let i = 0; i < posAttr.count; i++) {
      v.fromBufferAttribute(posAttr, i);
      box.expandByPoint(v);
    }
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const cellSize = maxDim / 40;

    this._vertexGrid = new Map();
    for (let i = 0; i < posAttr.count; i++) {
      v.fromBufferAttribute(posAttr, i);
      const key = this._cellKey(v, cellSize);
      let bucket = this._vertexGrid.get(key);
      if (!bucket) {
        bucket = [];
        this._vertexGrid.set(key, bucket);
      }
      bucket.push(i);
    }

    return cellSize;
  }

  _cellKey(v, cellSize) {
    const cx = Math.floor(v.x / cellSize);
    const cy = Math.floor(v.y / cellSize);
    const cz = Math.floor(v.z / cellSize);
    return `${cx},${cy},${cz}`;
  }

  _findNearestVertex(point, posAttr, cellSize) {
    const cx = Math.floor(point.x / cellSize);
    const cy = Math.floor(point.y / cellSize);
    const cz = Math.floor(point.z / cellSize);
    let closestIndex = 0;
    let closestDist = Infinity;
    const v = new THREE.Vector3();

    // Va agrandando el radio de búsqueda hasta encontrar vértices cercanos
    // (normalmente basta con radio 0 o 1).
    for (let radius = 0; radius <= 4; radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dz = -radius; dz <= radius; dz++) {
            // Solo la "cáscara" del radio actual: las celdas de radios menores
            // ya se revisaron en vueltas anteriores.
            if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== radius) continue;

            const bucket = this._vertexGrid.get(`${cx + dx},${cy + dy},${cz + dz}`);
            if (!bucket) continue;

            for (const idx of bucket) {
              v.fromBufferAttribute(posAttr, idx);
              const dist = v.distanceToSquared(point);
              if (dist < closestDist) {
                closestDist = dist;
                closestIndex = idx;
              }
            }
          }
        }
      }
      if (closestDist !== Infinity) break;
    }

    return closestIndex;
  }

  setupSurfaceSampling() {
    this.dolphinMesh = null;
    this.dolphin.traverse((child) => {
      if (child.isSkinnedMesh) {
        this.dolphinMesh = child;
      }
    });

    if (!this.dolphinMesh) {
      console.warn("No skinned mesh found for surface sampling");
      return;
    }

    const isSmallScreen = typeof window !== "undefined" && window.innerWidth < 768;
    this.sparkleCount = isSmallScreen ? 360 : 700;
    this.connectionDistance = 0.15;

    this.sampler = new MeshSurfaceSampler(this.dolphinMesh).setWeightAttribute(null).build();

    this.sampledData = [];
    const tempPosition = new THREE.Vector3();
    const tempNormal = new THREE.Vector3();
    const geometry = this.dolphinMesh.geometry;
    const posAttr = geometry.getAttribute("position");

    // Antes esto comparaba cada uno de los 1500 puntos muestreados contra
    // TODOS los vértices del modelo (O(sparkles * vértices)) — con mallas de
    // varios miles de vértices eso trababa el arranque de la escena unos
    // buenos cientos de ms, más en celular. Con una grilla espacial armada
    // una sola vez, cada búsqueda solo mira los vértices cercanos.
    const cellSize = this._buildVertexGrid(posAttr);

    for (let i = 0; i < this.sparkleCount; i++) {
      this.sampler.sample(tempPosition, tempNormal);

      const closestIndex = this._findNearestVertex(tempPosition, posAttr, cellSize);

      this.sampledData.push({
        vertexIndex: closestIndex,
        offset: tempPosition
          .clone()
          .sub(new THREE.Vector3().fromBufferAttribute(posAttr, closestIndex)),
        normal: tempNormal.clone(),
        random: Math.random(),
        size: Math.random() * 0.5 + 0.5,
      });
    }

    const positions = new Float32Array(this.sparkleCount * 3);
    const randoms = new Float32Array(this.sparkleCount);
    const sizes = new Float32Array(this.sparkleCount);

    for (let i = 0; i < this.sparkleCount; i++) {
      randoms[i] = this.sampledData[i].random;
      sizes[i] = this.sampledData[i].size;
    }

    this.sparklesGeometry = new THREE.BufferGeometry();
    this.sparklesGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.sparklesGeometry.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1));
    this.sparklesGeometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

    this.sparklesMaterial = new THREE.ShaderMaterial({
      vertexShader: sparkleVertexShader,
      fragmentShader: sparkleFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 50.0 },
        uColor1: { value: new THREE.Color(0x327fe2) },
        uColor2: { value: new THREE.Color(0x719bf8) },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
    });

    this.sparkles = new THREE.Points(this.sparklesGeometry, this.sparklesMaterial);
    this.sparkles.frustumCulled = false;

    this.scene.add(this.sparkles);

    this.updateSparklePositions();
  }

  setupConnectionLines() {
    const maxConnections = this.sparkleCount * 10;
    this.linePositions = new Float32Array(maxConnections * 6);
    this.lineColors = new Float32Array(maxConnections * 6);

    this.linesGeometry = new THREE.BufferGeometry();
    this.linesGeometry.setAttribute("position", new THREE.BufferAttribute(this.linePositions, 3));
    this.linesGeometry.setAttribute("color", new THREE.BufferAttribute(this.lineColors, 3));
    this.linesGeometry.setDrawRange(0, 0);

    this.linesMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.lines = new THREE.LineSegments(this.linesGeometry, this.linesMaterial);
    this.lines.frustumCulled = false;
    this.scene.add(this.lines);
  }

  updateSparklePositions() {
    if (!this.dolphinMesh || !this.sparklesGeometry) return;

    const positionAttribute = this.sparklesGeometry.getAttribute("position");

    // Only update skeleton if it exists and cache the result
    if (this.dolphinMesh.skeleton && !this._skeletonUpdatedThisFrame) {
      this.dolphinMesh.skeleton.update();
      this._skeletonUpdatedThisFrame = true;
    }

    // Only update matrix world if needed
    if (!this._matrixWorldUpdatedThisFrame) {
      this.dolphinMesh.updateMatrixWorld(true);
      this._matrixWorldUpdatedThisFrame = true;
    }

    // Reuse Vector3 objects to avoid allocations
    const basePos = this._tmpBasePos;
    const skinned = this._tmpSkinned;
    const localOut = this._tmpLocalOut;
    const normalV = this._tmpNormal;

    const posAttr = this.dolphinMesh.geometry.getAttribute("position");
    for (let i = 0; i < this.sparkleCount; i++) {
      const data = this.sampledData[i];

      basePos.fromBufferAttribute(posAttr, data.vertexIndex);

      if (data.normal) {
        normalV.copy(data.normal).normalize();
        localOut.copy(basePos).addScaledVector(normalV, this.outset);
      } else {
        localOut.copy(basePos).add(data.offset);
      }

      // Apply skinning transform
      if (this.dolphinMesh.applyBoneTransform) {
        skinned.copy(localOut);
        this.dolphinMesh.applyBoneTransform(data.vertexIndex, skinned);
        skinned.applyMatrix4(this.dolphinMesh.matrixWorld);
      } else if (this.dolphinMesh.boneTransform) {
        skinned.copy(localOut);
        this.dolphinMesh.boneTransform(data.vertexIndex, skinned);
        skinned.applyMatrix4(this.dolphinMesh.matrixWorld);
      } else {
        skinned.copy(localOut).applyMatrix4(this.dolphinMesh.matrixWorld);
      }

      positionAttribute.array[i * 3] = skinned.x;
      positionAttribute.array[i * 3 + 1] = skinned.y;
      positionAttribute.array[i * 3 + 2] = skinned.z;
    }

    positionAttribute.needsUpdate = true;

    // Reset frame flags for next frame
    this._skeletonUpdatedThisFrame = false;
    this._matrixWorldUpdatedThisFrame = false;
  }

  updateConnectionLines(positions) {
    let lineIndex = 0;
    const color1 = this.sparklesMaterial.uniforms.uColor1.value;
    const color2 = this.sparklesMaterial.uniforms.uColor2.value;
    const connectionDistSq = this.connectionDistance * this.connectionDistance; // Use squared distance to avoid sqrt

    // Simple spatial grid optimization
    const gridSize = this.connectionDistance * 2;
    const grid = new Map();

    // Place particles in grid cells
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      const cellX = Math.floor(pos.x / gridSize);
      const cellY = Math.floor(pos.y / gridSize);
      const cellZ = Math.floor(pos.z / gridSize);
      const cellKey = `${cellX},${cellY},${cellZ}`;

      if (!grid.has(cellKey)) {
        grid.set(cellKey, []);
      }
      grid.get(cellKey).push({ index: i, position: pos });
    }

    // Check connections only within neighboring cells
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      const cellX = Math.floor(pos.x / gridSize);
      const cellY = Math.floor(pos.y / gridSize);
      const cellZ = Math.floor(pos.z / gridSize);

      // Check current cell and 26 neighboring cells
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const neighborKey = `${cellX + dx},${cellY + dy},${cellZ + dz}`;
            const neighbors = grid.get(neighborKey);

            if (neighbors) {
              for (const neighbor of neighbors) {
                const j = neighbor.index;
                if (j <= i) continue; // Avoid duplicate pairs

                const distSq = pos.distanceToSquared(neighbor.position);

                if (distSq < connectionDistSq) {
                  const alpha = 1.0 - Math.sqrt(distSq) / this.connectionDistance;

                  this.linePositions[lineIndex * 6] = pos.x;
                  this.linePositions[lineIndex * 6 + 1] = pos.y;
                  this.linePositions[lineIndex * 6 + 2] = pos.z;

                  this.linePositions[lineIndex * 6 + 3] = neighbor.position.x;
                  this.linePositions[lineIndex * 6 + 4] = neighbor.position.y;
                  this.linePositions[lineIndex * 6 + 5] = neighbor.position.z;

                  const mixedColor = color1.clone().lerp(color2, this.sampledData[i].random);
                  this.lineColors[lineIndex * 6] = mixedColor.r * alpha;
                  this.lineColors[lineIndex * 6 + 1] = mixedColor.g * alpha;
                  this.lineColors[lineIndex * 6 + 2] = mixedColor.b * alpha;

                  this.lineColors[lineIndex * 6 + 3] = mixedColor.r * alpha;
                  this.lineColors[lineIndex * 6 + 4] = mixedColor.g * alpha;
                  this.lineColors[lineIndex * 6 + 5] = mixedColor.b * alpha;

                  lineIndex++;

                  if (lineIndex >= this.linePositions.length / 6) break;
                }
              }
            }
            if (lineIndex >= this.linePositions.length / 6) break;
          }
          if (lineIndex >= this.linePositions.length / 6) break;
        }
        if (lineIndex >= this.linePositions.length / 6) break;
      }
      if (lineIndex >= this.linePositions.length / 6) break;
    }

    this.linesGeometry.attributes.position.needsUpdate = true;
    this.linesGeometry.attributes.color.needsUpdate = true;
    this.linesGeometry.setDrawRange(0, lineIndex * 2);
  }
}
