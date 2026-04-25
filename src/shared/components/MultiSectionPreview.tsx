import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { layoutSections, type PergolaSection } from '../lib/customSections';

interface Props {
  sections: PergolaSection[];
  height: number;
  frameColor: string;   // hex
  louverColor: string;  // hex
  /** 'top' = top-down orthographic. 'persp' = isometric perspective. */
  view?: 'top' | 'persp';
}

const POST = 7 / 12;        // 7" → ft
const BEAM_THICK = 11 / 12; // 11" beam height (visual)
const LOUVER_T = 0.3;        // ~3.5" louver thickness in ft (a little chunky for visibility)
const LOUVER_GAP = 1.0;      // ~1 ft spacing center-to-center

/** A single rectangular section: 4 posts + 4 perimeter beams + a louver array. */
function Section({
  s,
  offsetX,
  height,
  frameColor,
  louverColor,
}: {
  s: PergolaSection;
  offsetX: number;
  height: number;
  frameColor: string;
  louverColor: string;
}) {
  const w = s.width;
  const d = s.depth;
  const ox = offsetX + w / 2;  // section center X
  const oz = d / 2;            // section center Z (back wall at z=0)

  // Posts at the 4 corners. Their *centers* sit just inside the perimeter
  // so they read as edge posts in both top and persp views.
  const halfW = w / 2;
  const halfD = d / 2;
  const postY = height / 2;

  // Post positions (relative to section center)
  const postPositions: [number, number, number][] = [
    [-halfW, postY, -halfD],
    [ halfW, postY, -halfD],
    [-halfW, postY,  halfD],
    [ halfW, postY,  halfD],
  ];

  // Beam positions — center at top of frame, height/2 + beam/2 below the very top
  const beamY = height - BEAM_THICK / 2;

  // Louvers — count + axis depend on orientation
  const louvers = useMemo(() => {
    const arr: { pos: [number, number, number]; size: [number, number, number] }[] = [];
    if (s.louverOrientation === 'depth') {
      // Louvers run along the depth axis (parallel to depth). Their length
      // equals the depth, count is across the width.
      const count = Math.max(2, Math.floor(w / LOUVER_GAP));
      const startX = -halfW + (w - (count - 1) * LOUVER_GAP) / 2;
      for (let i = 0; i < count; i++) {
        const x = startX + i * LOUVER_GAP;
        arr.push({
          pos: [x, height - BEAM_THICK - LOUVER_T / 2, 0],
          size: [LOUVER_T * 0.85, LOUVER_T, d - 0.4],
        });
      }
    } else {
      // Louvers run along the width axis. Length = width, count across depth.
      const count = Math.max(2, Math.floor(d / LOUVER_GAP));
      const startZ = -halfD + (d - (count - 1) * LOUVER_GAP) / 2;
      for (let i = 0; i < count; i++) {
        const z = startZ + i * LOUVER_GAP;
        arr.push({
          pos: [0, height - BEAM_THICK - LOUVER_T / 2, z],
          size: [w - 0.4, LOUVER_T, LOUVER_T * 0.85],
        });
      }
    }
    return arr;
  }, [w, d, s.louverOrientation, height, halfW, halfD]);

  return (
    <group position={[ox, 0, oz]}>
      {/* Posts */}
      {postPositions.map((p, i) => (
        <mesh key={`post-${i}`} position={p} castShadow>
          <boxGeometry args={[POST, height, POST]} />
          <meshStandardMaterial color={frameColor} />
        </mesh>
      ))}
      {/* Front + back beams (run along width) */}
      <mesh position={[0, beamY, -halfD + POST / 2]} castShadow>
        <boxGeometry args={[w, BEAM_THICK, POST]} />
        <meshStandardMaterial color={frameColor} />
      </mesh>
      <mesh position={[0, beamY,  halfD - POST / 2]} castShadow>
        <boxGeometry args={[w, BEAM_THICK, POST]} />
        <meshStandardMaterial color={frameColor} />
      </mesh>
      {/* Left + right beams (run along depth) */}
      <mesh position={[-halfW + POST / 2, beamY, 0]} castShadow>
        <boxGeometry args={[POST, BEAM_THICK, d]} />
        <meshStandardMaterial color={frameColor} />
      </mesh>
      <mesh position={[ halfW - POST / 2, beamY, 0]} castShadow>
        <boxGeometry args={[POST, BEAM_THICK, d]} />
        <meshStandardMaterial color={frameColor} />
      </mesh>
      {/* Louvers */}
      {louvers.map((l, i) => (
        <mesh key={`louver-${i}`} position={l.pos}>
          <boxGeometry args={l.size} />
          <meshStandardMaterial color={louverColor} />
        </mesh>
      ))}
    </group>
  );
}

export default function MultiSectionPreview({ sections, height, frameColor, louverColor, view = 'persp' }: Props) {
  const { placed, totalWidth, maxDepth } = useMemo(
    () => layoutSections(sections),
    [sections]
  );

  if (sections.length === 0 || totalWidth === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-100 text-sm text-slate-400">
        Add a section to see a preview
      </div>
    );
  }

  // Camera tuned to the bounding box so all sections fit, with a bit of
  // breathing room. Orbit controls let the admin spin / pan / zoom.
  const span = Math.max(totalWidth, maxDepth, height + 4);
  const cam: [number, number, number] = view === 'top'
    ? [totalWidth / 2, span * 1.6, maxDepth / 2 + 0.001]
    : [totalWidth * 0.65, span * 0.9, maxDepth + span * 0.7];

  return (
    <Canvas
      shadows
      camera={{ position: cam, fov: view === 'top' ? 35 : 40 }}
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      style={{ background: '#f1f5f9' }}
    >
      <Suspense fallback={null}>
        {/* Lights */}
        <ambientLight intensity={0.55} />
        <directionalLight
          position={[totalWidth, span * 1.5, maxDepth * 1.5]}
          intensity={1.1}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-far={span * 4}
          shadow-camera-left={-span * 2}
          shadow-camera-right={span * 2}
          shadow-camera-top={span * 2}
          shadow-camera-bottom={-span * 2}
        />
        <directionalLight position={[-totalWidth, span, -maxDepth]} intensity={0.35} />

        {/* Ground + grid for spatial reference */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[span * 4, span * 4]} />
          <meshStandardMaterial color="#e2e8f0" />
        </mesh>
        <Grid
          position={[totalWidth / 2, 0.01, maxDepth / 2]}
          args={[span * 3, span * 3]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#cbd5e1"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#94a3b8"
          fadeDistance={span * 4}
          infiniteGrid={false}
        />

        {/* Sections */}
        {placed.map((p) => (
          <Section
            key={p.section.id}
            s={p.section}
            offsetX={p.offsetX}
            height={height}
            frameColor={frameColor}
            louverColor={louverColor}
          />
        ))}

        {/* Camera target: bounding box center at ground level */}
        <OrbitControls
          target={[totalWidth / 2, height / 2, maxDepth / 2]}
          enablePan
          enableZoom
          enableRotate
          maxPolarAngle={Math.PI / 2.05}
          minDistance={Math.max(8, span * 0.5)}
          maxDistance={span * 4}
        />
      </Suspense>
    </Canvas>
  );
}

// Silence unused-var lint when imported: THREE is the underlying lib.
void THREE;
