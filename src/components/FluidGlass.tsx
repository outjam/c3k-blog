"use client";

import * as THREE from 'three';
import { useMemo, useRef, useEffect, useState, memo } from 'react';
import { Canvas, createPortal, useFrame, useThree, ThreeElements } from '@react-three/fiber';
import {
  useFBO,
  useGLTF,
  MeshTransmissionMaterial,
} from '@react-three/drei';
import { easing } from 'maath';

type Mode = 'lens' | 'bar' | 'cube';

type ModeProps = Record<string, unknown>;

interface FluidGlassProps {
  mode?: Mode;
  lensProps?: ModeProps;
  barProps?: ModeProps;
  cubeProps?: ModeProps;
}

export default function FluidGlass({ mode = 'lens', lensProps = {}, barProps = {}, cubeProps = {} }: FluidGlassProps) {
  const Wrapper = mode === 'bar' ? Bar : mode === 'cube' ? Cube : Lens;
  const modeProps = mode === 'bar' ? barProps : mode === 'cube' ? cubeProps : lensProps;

  return (
    <Canvas
      camera={{ position: [0, 0, 20], fov: 15 }}
      gl={{ alpha: true, antialias: true, premultipliedAlpha: true }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
      }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 3, 6]} intensity={0.55} />
      <Wrapper modeProps={modeProps} />
    </Canvas>
  );
}

type MeshProps = ThreeElements['mesh'];

interface ModeWrapperProps extends MeshProps {
  glb: string;
  geometryKey: string;
  lockToBottom?: boolean;
  followPointer?: boolean;
  modeProps?: ModeProps;
}

const ModeWrapper = memo(function ModeWrapper({
  glb,
  geometryKey,
  lockToBottom = false,
  followPointer = true,
  modeProps = {},
  ...props
}: ModeWrapperProps) {
  const ref = useRef<THREE.Mesh>(null!);
  const { nodes } = useGLTF(glb) as { nodes: Record<string, THREE.Object3D> };
  const buffer = useFBO();
  const { viewport: vp } = useThree();
  const [scene] = useState<THREE.Scene>(() => new THREE.Scene());
  const geoWidthRef = useRef<number>(1);
  const fallbackGeometry = useMemo(() => new THREE.BoxGeometry(6, 1.1, 1.1, 8, 4, 4), []);
  const geometry = useMemo(() => {
    const preferred = nodes?.[geometryKey] as THREE.Mesh | undefined;
    if (preferred?.isMesh && preferred.geometry) {
      return preferred.geometry;
    }

    const firstMesh = Object.values(nodes ?? {}).find((node): node is THREE.Mesh => {
      return (node as THREE.Mesh).isMesh === true && !!(node as THREE.Mesh).geometry;
    });

    return firstMesh?.geometry ?? fallbackGeometry;
  }, [nodes, geometryKey, fallbackGeometry]);

  useEffect(() => {
    const geo = geometry;
    geo.computeBoundingBox();
    geoWidthRef.current = geo.boundingBox!.max.x - geo.boundingBox!.min.x || 1;
  }, [geometry]);

  useFrame((state, delta) => {
    const { gl, viewport, pointer, camera } = state;
    const v = viewport.getCurrentViewport(camera, [0, 0, 15]);

    const destX = followPointer ? (pointer.x * v.width) / 2 : 0;
    const destY = lockToBottom ? -v.height / 2 + 0.2 : followPointer ? (pointer.y * v.height) / 2 : 0;
    easing.damp3(ref.current.position, [destX, destY, 15], 0.15, delta);

    if ((modeProps as { scale?: number }).scale == null) {
      const maxWorld = v.width * 0.9;
      const desired = maxWorld / geoWidthRef.current;
      ref.current.scale.setScalar(Math.min(0.15, desired));
    }

    const prevColor = gl.getClearColor(new THREE.Color());
    const prevAlpha = gl.getClearAlpha();
    gl.setClearColor(0x000000, 0);
    gl.setRenderTarget(buffer);
    gl.clear();
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    gl.setClearColor(prevColor, prevAlpha);
  });

  const { scale, ior, thickness, anisotropy, chromaticAberration, ...extraMat } = modeProps as {
    scale?: number;
    ior?: number;
    thickness?: number;
    anisotropy?: number;
    chromaticAberration?: number;
    [key: string]: unknown;
  };

  return (
    <>
      {createPortal(
        <group>
          <mesh position={[0, 0, 0]} scale={[vp.width * 1.2, vp.height * 1.2, 1]}>
            <planeGeometry />
            <meshBasicMaterial color="#9cc0ff" transparent opacity={0.35} />
          </mesh>
          <mesh position={[0, -0.15, -0.2]} scale={[vp.width * 1.25, vp.height * 0.95, 1]}>
            <planeGeometry />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.16} />
          </mesh>
        </group>,
        scene
      )}
      <mesh scale={[vp.width, vp.height, 1]} position={[0, 0, 0]}>
        <planeGeometry />
        <meshBasicMaterial map={buffer.texture} transparent opacity={0.92} />
      </mesh>
      <mesh
        ref={ref}
        scale={scale ?? 0.15}
        rotation-x={Math.PI / 2}
        geometry={geometry}
        {...props}
      >
        <MeshTransmissionMaterial
          buffer={buffer.texture}
          ior={ior ?? 1.15}
          thickness={thickness ?? 5}
          roughness={0.06}
          transmission={1}
          clearcoat={1}
          clearcoatRoughness={0}
          anisotropy={anisotropy ?? 0.01}
          chromaticAberration={chromaticAberration ?? 0.1}
          distortion={0.22}
          distortionScale={0.35}
          temporalDistortion={0.08}
          backside
          {...(typeof extraMat === 'object' && extraMat !== null ? extraMat : {})}
        />
      </mesh>
    </>
  );
});

function Lens({ modeProps, ...p }: { modeProps?: ModeProps } & MeshProps) {
  return <ModeWrapper glb="/assets/3d/lens.glb" geometryKey="Cylinder" followPointer modeProps={modeProps} {...p} />;
}

function Cube({ modeProps, ...p }: { modeProps?: ModeProps } & MeshProps) {
  return <ModeWrapper glb="/assets/3d/cube.glb" geometryKey="Cube" followPointer modeProps={modeProps} {...p} />;
}

function Bar({ modeProps = {}, ...p }: { modeProps?: ModeProps } & MeshProps) {
  const defaultMat = {
    transmission: 1,
    roughness: 0,
    thickness: 10,
    ior: 1.15,
    color: '#ffffff',
    attenuationColor: '#ffffff',
    attenuationDistance: 0.25
  };

  return (
    <ModeWrapper
      glb="/assets/3d/bar.glb"
      geometryKey="Cube"
      lockToBottom={false}
      followPointer={false}
      modeProps={{ ...defaultMat, ...modeProps }}
      {...p}
    />
  );
}
