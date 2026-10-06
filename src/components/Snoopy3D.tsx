import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import * as THREE from "three";

function PerroRig({ caminando, durmiendo, ladrando }: Props) {
  const cuerpo = useRef<Group>(null);
  const cola = useRef<Group>(null);
  const orejaI = useRef<Group>(null);
  const orejaD = useRef<Group>(null);
  const pataI = useRef<Group>(null);
  const pataD = useRef<Group>(null);
  const tiempo = useRef(0);

  useFrame((_, delta) => {
    tiempo.current += delta;
    const t = tiempo.current;
    const paso = caminando ? Math.sin(t * 9) : 0;
    const respirar = Math.sin(t * 2.4) * 0.018;

    if (cuerpo.current) {
      cuerpo.current.position.y = respirar + (caminando ? Math.abs(Math.sin(t * 9)) * 0.035 : 0);
      cuerpo.current.rotation.z = caminando ? Math.sin(t * 9) * 0.035 : 0;
    }
    if (cola.current) {
      cola.current.rotation.z = Math.sin(t * (caminando ? 8 : 2.2)) * (caminando ? 0.25 : 0.12);
    }
    if (orejaI.current) orejaI.current.rotation.z = Math.sin(t * 2.1) * 0.08;
    if (orejaD.current) orejaD.current.rotation.z = Math.sin(t * 2.1 + 1.1) * 0.08;
    if (pataI.current) {
      pataI.current.rotation.x = caminando ? paso * 0.48 : 0;
      pataI.current.position.z = caminando ? paso * 0.04 : 0;
    }
    if (pataD.current) {
      pataD.current.rotation.x = caminando ? -paso * 0.48 : 0;
      pataD.current.position.z = caminando ? -paso * 0.04 : 0;
    }
    if (ladrando && cuerpo.current) cuerpo.current.rotation.y = Math.sin(t * 28) * 0.025;
    if (durmiendo && cuerpo.current) cuerpo.current.rotation.z = Math.sin(t * 1.4) * 0.025;
  });

  return (
    <group ref={cuerpo} position={[0, 0.02, 0]}>
      <mesh castShadow scale={[1.18, 0.76, 0.66]}>
        <sphereGeometry args={[0.62, 20, 14]} />
        <meshStandardMaterial color="#f4f1eb" roughness={0.82} />
      </mesh>
      <mesh castShadow position={[0.48, 0.38, 0]} scale={[0.66, 0.58, 0.55]}>
        <sphereGeometry args={[0.58, 20, 14]} />
        <meshStandardMaterial color="#f5f2eb" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0.82, 0.25, 0]} scale={[0.42, 0.28, 0.3]}>
        <sphereGeometry args={[0.5, 16, 10]} />
        <meshStandardMaterial color="#191722" roughness={0.6} />
      </mesh>
      <mesh position={[0.62, 0.48, 0.46]} scale={[0.065, 0.08, 0.035]}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshStandardMaterial color="#17151b" />
      </mesh>
      <mesh position={[0.62, 0.48, -0.46]} scale={[0.065, 0.08, 0.035]}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshStandardMaterial color="#17151b" />
      </mesh>
      <mesh position={[0.43, 0.36, 0]} scale={[0.68, 0.06, 0.7]}>
        <torusGeometry args={[0.52, 0.045, 8, 32]} />
        <meshStandardMaterial color="#d63845" roughness={0.55} />
      </mesh>
      <group ref={orejaI} position={[0.28, 0.58, 0.42]} rotation={[0, 0, -0.18]}>
        <mesh castShadow scale={[0.12, 0.42, 0.08]}>
          <capsuleGeometry args={[0.45, 0.7, 8, 12]} />
          <meshStandardMaterial color="#252330" roughness={0.8} />
        </mesh>
      </group>
      <group ref={orejaD} position={[0.28, 0.58, -0.42]} rotation={[0, 0, -0.18]}>
        <mesh castShadow scale={[0.12, 0.42, 0.08]}>
          <capsuleGeometry args={[0.45, 0.7, 8, 12]} />
          <meshStandardMaterial color="#252330" roughness={0.8} />
        </mesh>
      </group>
      <group ref={pataI} position={[-0.2, -0.56, 0.34]}>
        <mesh castShadow scale={[0.18, 0.48, 0.18]}>
          <capsuleGeometry args={[0.42, 0.55, 8, 12]} />
          <meshStandardMaterial color="#f4f1eb" roughness={0.85} />
        </mesh>
      </group>
      <group ref={pataD} position={[-0.2, -0.56, -0.34]}>
        <mesh castShadow scale={[0.18, 0.48, 0.18]}>
          <capsuleGeometry args={[0.42, 0.55, 8, 12]} />
          <meshStandardMaterial color="#f4f1eb" roughness={0.85} />
        </mesh>
      </group>
      <group ref={cola} position={[-0.68, 0.24, 0]} rotation={[0, 0, -0.4]}>
        <mesh castShadow scale={[0.14, 0.55, 0.14]}>
          <capsuleGeometry args={[0.4, 0.8, 8, 12]} />
          <meshStandardMaterial color="#f4f1eb" roughness={0.82} />
        </mesh>
      </group>
    </group>
  );
}

interface Props {
  caminando?: boolean;
  durmiendo?: boolean;
  ladrando?: boolean;
}

export function Snoopy3D(props: Props) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [2.8, 1.25, 3.6], fov: 34 }}
      gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
      style={{ pointerEvents: "none" }}
    >
      <ambientLight intensity={1.8} />
      <directionalLight position={[2, 4, 3]} intensity={2.4} castShadow />
      <PerroRig {...props} />
    </Canvas>
  );
}
