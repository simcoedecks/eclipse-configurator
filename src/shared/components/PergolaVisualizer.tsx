import React, { useMemo, Suspense, useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, ContactShadows, RoundedBox, Sky, useGLTF, CameraControls, PerspectiveCamera, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useSpring, a } from '@react-spring/three';
import { Maximize2, Box, ArrowUp, ArrowRight, ChevronDown } from 'lucide-react';
import { ErrorBoundary } from './ErrorBoundary';

const Logo = ({ frameColor, position, rotation }: { frameColor: string, position: [number, number, number], rotation: [number, number, number] }) => {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture(undefined);
    
    const getLuminance = (hex: string) => {
      const rgb = parseInt(hex.replace('#', ''), 16);
      const r = (rgb >> 16) & 0xff;
      const g = (rgb >>  8) & 0xff;
      const b = (rgb >>  0) & 0xff;
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    
    const isLight = getLuminance(frameColor) > 128;
    const context = ctx as any;
    context.fillStyle = isLight ? '#0A0A0A' : '#F6F6F6';
    context.strokeStyle = isLight ? '#0A0A0A' : '#F6F6F6';
    context.lineCap = 'round';
    context.lineJoin = 'round';
    
    // Crescent
    context.beginPath();
    context.arc(75, 64, 40, -0.9348, 0.9348, true);
    context.arc(85, 64, 35, 1.167, -1.167, false);
    context.fill();
    
    // Top beam
    context.beginPath();
    context.moveTo(67, 34);
    context.lineTo(150, 34);
    context.lineWidth = 6;
    context.stroke();
    
    // Diagonal beam
    context.beginPath();
    context.moveTo(150, 34);
    context.lineTo(110, 84);
    context.lineWidth = 6;
    context.stroke();
    
    // Back post
    context.beginPath();
    context.moveTo(148, 34);
    context.lineTo(148, 74);
    context.lineWidth = 6;
    context.stroke();
    
    // Front post
    context.beginPath();
    context.moveTo(108, 84);
    context.lineTo(108, 114);
    context.lineWidth = 6;
    context.stroke();
    
    // Louvers
    context.lineWidth = 4;
    for (let y = 44; y <= 84; y += 10) {
      context.beginPath();
      let leftX = 85 - Math.sqrt(35 * 35 - (y - 64) * (y - 64));
      let rightX = 150 - 40 * (y - 34) / 50;
      context.moveTo(leftX, y);
      context.lineTo(rightX, y);
      context.stroke();
    }
    
    // Text
    context.font = '400 42px "Georgia", serif';
    if ('letterSpacing' in context) {
      context.letterSpacing = '8px';
      context.fillText('ECLIPSE PERGOLA', 180, 75);
    } else {
      context.fillText('E C L I P S E   P E R G O L A', 180, 75);
    }
    
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 16;
    return tex;
  }, [frameColor]);

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[5.25, 0.65625]} />
      <meshBasicMaterial map={texture} transparent={true} opacity={0.85} depthWrite={false} />
    </mesh>
  );
};

interface PergolaVisualizerProps {
  width: number;
  depth: number;
  height: number;
  accessories: Set<string>;
  frameColor: string;
  louverColor: string;
  louverAngle: number;
  screenDrop: number;
  guillotineOpen: number;
  wallColor: string;
  houseWallColor: string;
  customModels?: { post?: string; beam?: string; louver?: string };
  houseWall?: 'none' | 'back' | 'left' | 'right' | 'front';
  houseWalls?: Set<'back' | 'left' | 'right' | 'front'>;
  /** Partial structure-wall length (in feet) per side. Undefined = full side length. */
  houseWallLengths?: Partial<Record<'back'|'front'|'left'|'right', number>>;
  /** Anchor/position of the partial structure wall on its side. */
  houseWallAnchors?: Partial<Record<'back'|'front'|'left'|'right', 'start'|'center'|'end'>>;
  /** Per-end extension toggle: when false, the wall terminates flush at
   *  the pergola edge instead of extending past it. Default (true) keeps
   *  the original "house continues past pergola" visual. */
  houseWallExtensions?: Partial<Record<'back'|'front'|'left'|'right', { start?: boolean; end?: boolean }>>;
  /** Admin-only: shift middle posts + their beams left/right (along width) or
   *  forward/back (along depth) from their default even-distribution
   *  positions. Keys are middle-post indices (1..numBays-1); values are
   *  deltas in feet. */
  postXOffsets?: Record<number, number>;
  postZOffsets?: Record<number, number>;
  /** Admin-only: additional post-only offsets that move the physical
   *  support post without moving the beam it normally carries. */
  postXOnlyOffsets?: Record<number, number>;
  postZOnlyOffsets?: Record<number, number>;
  /** Admin-only: middle posts hidden. Beam/louver divider stay — only
   *  the vertical support mesh disappears. */
  removedMiddlePosts?: Set<string>;
  /** Admin-only: cantilever insets per edge (ft). Corner posts move
   *  inward by this amount; beams still extend to the pergola edge. */
  cantileverInsets?: Partial<Record<'left'|'right'|'front'|'back', number>>;
  view?: string;
  onViewChange?: (view: string) => void;
  staticMode?: boolean;
}

const NormalizedModel = ({ url, color, materialProps }: { url: string, color: string, materialProps: any }) => {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => {
    const c = scene.clone();
    const box = new THREE.Box3().setFromObject(c);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const wrapper = new THREE.Group();
    c.position.sub(center); // Center the geometry
    wrapper.add(c);
    
    // Scale to exactly 1x1x1 unit
    wrapper.scale.set(
      size.x === 0 ? 1 : 1 / size.x,
      size.y === 0 ? 1 : 1 / size.y,
      size.z === 0 ? 1 : 1 / size.z
    );
    
    // Apply color and material properties
    wrapper.traverse((child: any) => {
      if (child.isMesh) {
        child.material = new THREE.MeshStandardMaterial({
          color: color,
          ...materialProps
        });
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    
    return wrapper;
  }, [scene, color, materialProps]);

  return <primitive object={cloned} />;
};

const CustomPart = ({ url, position, scale, rotation, color, materialProps }: any) => {
  return (
    <group position={position} scale={scale} rotation={rotation}>
      <Suspense fallback={<RoundedBox args={[1, 1, 1]} radius={0.05}><meshStandardMaterial color={color} {...materialProps} /></RoundedBox>}>
        <NormalizedModel url={url} color={color} materialProps={materialProps} />
      </Suspense>
    </group>
  );
};

const WoodMaterial = ({ color }: { color: string }) => {
  return <meshStandardMaterial color={color} roughness={0.9} metalness={0.1} envMapIntensity={0.8} />;
};

const PrivacyWall = ({ width, height, position, rotation, color }: any) => {
  const slatHeight = 7 / 12; // 7 inches
  const slatDepth = 1.25 / 12; // 1.25 inches
  const numSlats = Math.floor(height / slatHeight);
  
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    const h = slatHeight;
    const d = slatDepth;
    const vSize = 0.02; // ~0.25 inch
    
    // Draw the profile of the slat (side view)
    s.moveTo(-d/2, 0);
    s.lineTo(d/2, 0);
    
    // Front face with V-groove at the top
    s.lineTo(d/2, h - vSize);
    s.lineTo(d/2 - vSize, h - vSize / 2);
    s.lineTo(d/2, h);
    
    s.lineTo(-d/2, h);
    s.lineTo(-d/2, 0);
    
    return s;
  }, [slatHeight, slatDepth]);

  const extrudeSettings = useMemo(() => ({
    steps: 1,
    depth: width,
    bevelEnabled: false
  }), [width]);
  
  return (
    <group position={position} rotation={rotation}>
      {Array.from({ length: numSlats }).map((_, i) => (
        <mesh 
          key={i} 
          position={[-width/2, -height/2 + (i * slatHeight), 0]} 
          rotation={[0, Math.PI / 2, 0]}
          castShadow 
          receiveShadow
        >
          <extrudeGeometry args={[shape, extrudeSettings]} />
          {color === '#8B5A2B' ? (
            <Suspense fallback={<meshStandardMaterial color={color} roughness={0.8} metalness={0.1} />}>
              <WoodMaterial color={color} />
            </Suspense>
          ) : (
            <meshStandardMaterial color={color} roughness={0.8} metalness={0.1} envMapIntensity={0.8} />
          )}
        </mesh>
      ))}
    </group>
  );
};

const MotorizedScreen = ({ width, height, position, rotation, color, frameColor, dropPercentage, staticMode }: any) => {
  const beamSize = 10.5165 / 12; // 0.876375 ft
  const housingSize = 5 / 12; // 5 inches = 0.4167 ft
  const channelSize = 1.5 / 12; // 1.5 inches = 0.125 ft
  const weightBarHeight = 2 / 12; // 2 inches = 0.1667 ft
  const weightBarThick = 1 / 12; // 1 inch = 0.0833 ft
  
  // Local Y for the bottom of the beam
  const beamBottomY = height / 2 - beamSize / 2;
  
  // Housing sits just below the beam
  const housingY = beamBottomY - housingSize / 2;
  
  // The channels run from the bottom of the post (-height/2) up to the housing box
  const channelTopY = beamBottomY - housingSize;
  const channelBottomY = -height / 2;
  const channelHeight = channelTopY - channelBottomY;
  const channelY = channelBottomY + channelHeight / 2;
  
  // Fabric drops from the bottom of the housing
  const fabricTopY = channelTopY;
  const travelDistance = channelHeight - weightBarHeight;

  const t = dropPercentage / 100;
  const { fabricScaleY, fabricPosY, weightBarPosY } = useSpring({
    fabricScaleY: Math.max(0.001, t),
    fabricPosY: fabricTopY - (t * travelDistance) / 2,
    weightBarPosY: fabricTopY - weightBarHeight / 2 - t * travelDistance,
    config: { mass: 1, tension: 120, friction: 40 },
    immediate: staticMode
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Motor Housing */}
      <mesh position={[0, housingY, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, housingSize, housingSize]} />
        <meshStandardMaterial color={frameColor} roughness={0.3} metalness={0.6} />
      </mesh>
      
      {/* Side Channels */}
      <mesh position={[-width / 2 + channelSize / 2, channelY, 0]} castShadow receiveShadow>
        <boxGeometry args={[channelSize, channelHeight, channelSize]} />
        <meshStandardMaterial color={frameColor} roughness={0.3} metalness={0.6} />
      </mesh>
      <mesh position={[width / 2 - channelSize / 2, channelY, 0]} castShadow receiveShadow>
        <boxGeometry args={[channelSize, channelHeight, channelSize]} />
        <meshStandardMaterial color={frameColor} roughness={0.3} metalness={0.6} />
      </mesh>

      {/* Screen Fabric */}
      <a.mesh position-y={fabricPosY} scale-y={fabricScaleY} position-z={0} castShadow receiveShadow>
        <planeGeometry args={[width - channelSize * 2, travelDistance]} />
        <meshPhysicalMaterial 
          color={color} 
          transparent 
          opacity={0.85} 
          roughness={0.9} 
          metalness={0.1} 
          transmission={0.1} 
          side={THREE.DoubleSide} 
        />
      </a.mesh>

      {/* Bottom Weight Bar */}
      <a.mesh position-y={weightBarPosY} position-z={0} castShadow receiveShadow>
        <boxGeometry args={[width - channelSize * 2, weightBarHeight, weightBarThick]} />
        <meshStandardMaterial color={frameColor} roughness={0.3} metalness={0.6} />
      </a.mesh>
    </group>
  );
};

const GuillotineWindow = ({ width, height, position, rotation, color, frameColor, openPercentage, staticMode }: any) => {
  const t = openPercentage / 100;
  const { posY } = useSpring({
    posY: t * (height - 0.5), // Slides up
    config: { mass: 1, tension: 100, friction: 30 },
    immediate: staticMode
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Frame */}
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, 0.1]} />
        <meshStandardMaterial color={frameColor} roughness={0.3} metalness={0.6} />
      </mesh>
      {/* Window */}
      <a.mesh position-y={posY} castShadow receiveShadow>
        <boxGeometry args={[width - 0.1, height - 0.1, 0.15]} />
        <meshPhysicalMaterial 
          color={color} 
          transparent 
          opacity={0.85} 
          roughness={0.1} 
          metalness={0.1} 
          transmission={0.5} 
          side={THREE.DoubleSide} 
        />
      </a.mesh>
    </group>
  );
};

const Beam = ({ length, color, materialProps, position, rotation }: any) => {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    // Dimensions in inches, converted to feet (1 unit = 1 foot)
    const H = 10.5165 / 12;
    const W = 6.8681 / 12;
    const topW = 3.25 / 12;
    const sideH = 2.68 / 12;
    const wall = 0.15 / 12;

    // Outer shell matching the provided profile
    // Start at bottom-left (outer face)
    s.moveTo(0, 0);
    // Bottom horizontal part
    s.lineTo(W, 0);
    // Right vertical lip
    s.lineTo(W, sideH);
    // Inner lip thickness
    s.lineTo(W - wall, sideH);
    // Down to inner floor
    s.lineTo(W - wall, wall);
    // Left along floor to the main vertical box
    s.lineTo(topW, wall);
    // Up the inner vertical wall
    s.lineTo(topW, H - wall);
    // Under the top flange
    s.lineTo(W - wall, H - wall); // Wait, looking at the drawing, the top flange is only at the top.
    // Actually, let's look at the 3D render again.
    // The top flange is at the very top.
    
    // Let's simplify to match the silhouette accurately
    s.moveTo(0, 0);
    s.lineTo(W, 0);
    s.lineTo(W, sideH);
    s.lineTo(W - wall, sideH);
    s.lineTo(W - wall, wall);
    s.lineTo(wall, wall);
    s.lineTo(wall, H - wall);
    s.lineTo(topW, H - wall);
    s.lineTo(topW, H);
    s.lineTo(0, H);
    s.lineTo(0, 0);
    
    return s;
  }, []);

  const extrudeSettings = useMemo(() => ({
    steps: 1,
    depth: length,
    bevelEnabled: false
  }), [length]);

  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <extrudeGeometry args={[shape, extrudeSettings]} />
      <meshStandardMaterial color={color} {...materialProps} />
    </mesh>
  );
};

const Louver = ({ length, color, materialProps, position, rotation }: any) => {
  const refinedShape = useMemo(() => {
    const s = new THREE.Shape();
    const scale = 1 / 12; // inches to feet
    
    // Pivot center in inches
    const pivotX = 7.5;
    const pivotY = 0.45;
    
    const moveTo = (x: number, y: number) => s.moveTo((x - pivotX) * scale, (y - pivotY) * scale);
    const lineTo = (x: number, y: number) => s.lineTo((x - pivotX) * scale, (y - pivotY) * scale);
    const absarc = (x: number, y: number, radius: number, startAngle: number, endAngle: number, clockwise: boolean) => 
      s.absarc((x - pivotX) * scale, (y - pivotY) * scale, radius * scale, startAngle, endAngle, clockwise);

    // Outer profile
    moveTo(0, 0);
    lineTo(5.5, 0); // Bottom edge
    lineTo(5.46, 0.2); // Up right wall to extension
    lineTo(7.5, 0.2); // Bottom of extension to pivot bottom
    
    // Arc to right edge of pivot
    absarc(7.5, 0.45, 0.25, -Math.PI/2, 0, false);
    
    // Right hook bottom
    lineTo(8.2, 0.45);
    // Right hook outer right
    lineTo(8.2, 1.4864);
    // Right hook top
    lineTo(7.8, 1.4864);
    // Right hook inner top
    lineTo(7.8, 1.3864);
    // Right hook inner right
    lineTo(8.1, 1.3864);
    // Right hook inner left (going down)
    lineTo(8.1, 0.55);
    // Connect back to pivot top
    lineTo(7.5, 0.7);
    
    // Top of extension
    lineTo(5.36, 0.7);
    // Up right wall
    lineTo(5.2, 1.5);
    // Top wall
    lineTo(0.5, 1.8);
    // Left hook top
    lineTo(-0.3, 1.8806);
    // Left hook outer left
    lineTo(-0.3, 1.5);
    // Left hook bottom
    lineTo(-0.2, 1.5);
    // Left hook inner left
    lineTo(-0.2, 1.78);
    // Left hook inner bottom
    lineTo(0.5, 1.78);
    // Down left wall
    lineTo(0, 0);

    // Internal hollow chambers (Holes must be drawn clockwise)
    
    // Hole 1 (Left Chamber)
    const h1 = new THREE.Path();
    h1.moveTo((0.15 - pivotX) * scale, (0.1 - pivotY) * scale);
    h1.lineTo((0.6 - pivotX) * scale, (1.7 - pivotY) * scale);
    h1.lineTo((1.95 - pivotX) * scale, (1.607 - pivotY) * scale);
    h1.lineTo((1.95 - pivotX) * scale, (0.1 - pivotY) * scale);
    h1.lineTo((0.15 - pivotX) * scale, (0.1 - pivotY) * scale);
    s.holes.push(h1);

    // Hole 2 (Middle Chamber)
    const h2 = new THREE.Path();
    h2.moveTo((2.05 - pivotX) * scale, (0.1 - pivotY) * scale);
    h2.lineTo((2.05 - pivotX) * scale, (1.601 - pivotY) * scale);
    h2.lineTo((3.75 - pivotX) * scale, (1.492 - pivotY) * scale);
    h2.lineTo((3.75 - pivotX) * scale, (0.1 - pivotY) * scale);
    h2.lineTo((2.05 - pivotX) * scale, (0.1 - pivotY) * scale);
    s.holes.push(h2);

    // Hole 3 (Right Chamber)
    const h3 = new THREE.Path();
    h3.moveTo((3.85 - pivotX) * scale, (0.1 - pivotY) * scale);
    h3.lineTo((3.85 - pivotX) * scale, (1.486 - pivotY) * scale);
    h3.lineTo((5.12 - pivotX) * scale, (1.406 - pivotY) * scale);
    h3.lineTo((5.38 - pivotX) * scale, (0.1 - pivotY) * scale);
    h3.lineTo((3.85 - pivotX) * scale, (0.1 - pivotY) * scale);
    s.holes.push(h3);

    // Hole 4 (Extension)
    const h4 = new THREE.Path();
    h4.moveTo((5.55 - pivotX) * scale, (0.3 - pivotY) * scale);
    h4.lineTo((5.55 - pivotX) * scale, (0.6 - pivotY) * scale);
    h4.lineTo((7.2 - pivotX) * scale, (0.6 - pivotY) * scale);
    h4.lineTo((7.2 - pivotX) * scale, (0.3 - pivotY) * scale);
    h4.lineTo((5.55 - pivotX) * scale, (0.3 - pivotY) * scale);
    s.holes.push(h4);

    // Hole 5 (Pivot)
    const h5 = new THREE.Path();
    h5.absarc((7.5 - pivotX) * scale, (0.45 - pivotY) * scale, 0.15 * scale, 0, Math.PI * 2, true);
    s.holes.push(h5);

    return s;
  }, []);

  const extrudeSettings = useMemo(() => ({
    steps: 1,
    depth: length,
    bevelEnabled: false
  }), [length]);

  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow receiveShadow>
        <extrudeGeometry args={[refinedShape, extrudeSettings]} />
        <meshStandardMaterial color={color} {...materialProps} />
      </mesh>
      {/* Pivot Pins at both ends */}
      <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.15/12, 0.15/12, 0.2/12, 16]} />
        <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[0, 0, length]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.15/12, 0.15/12, 0.2/12, 16]} />
        <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.1} />
      </mesh>
    </group>
  );
};

const HouseWall = ({ width, height, position, rotation, color }: any) => {
  const sidingHeight = 0.5; // 6 inches
  const sidingDepth = 0.05; // ~0.6 inches
  const numSiding = Math.ceil(height / sidingHeight);
  
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    // Lap siding profile
    s.moveTo(0, 0);
    s.lineTo(sidingDepth, 0);
    s.lineTo(0.01, sidingHeight); // Slight overlap/taper
    s.lineTo(0, sidingHeight);
    s.lineTo(0, 0);
    return s;
  }, []);

  const extrudeSettings = useMemo(() => ({
    steps: 1,
    depth: width,
    bevelEnabled: false
  }), [width]);

  return (
    <group position={position} rotation={rotation}>
      {/* Backing wall */}
      <mesh position={[0, 0, -0.5]}>
        <boxGeometry args={[width, height, 1]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      
      {/* Siding slats */}
      <group position={[-width/2, -height/2, 0.05]}>
        {Array.from({ length: numSiding }).map((_, i) => (
          <mesh 
            key={i} 
            position={[0, i * sidingHeight, 0]} 
            rotation={[0, Math.PI / 2, 0]}
            castShadow 
            receiveShadow
          >
            <extrudeGeometry args={[shape, extrudeSettings]} />
            <meshStandardMaterial color={color} roughness={0.8} metalness={0.1} />
          </mesh>
        ))}
      </group>
    </group>
  );
};

const PergolaModel: React.FC<PergolaVisualizerProps> = ({ width, depth, height, accessories, frameColor, louverColor, louverAngle, screenDrop, guillotineOpen, wallColor, houseWallColor, customModels, houseWall, houseWalls, houseWallLengths, houseWallAnchors, houseWallExtensions, postXOffsets, postZOffsets, postXOnlyOffsets, postZOnlyOffsets, removedMiddlePosts, cantileverInsets, staticMode }) => {
  const postSize = 7.25 / 12; // 7.25 inches
  const beamSize = 10.5165 / 12; // 10.5165 inches
  const beamWidth = 6.8681 / 12; // 6.8681 inches
  const screenColor = "#334155"; // Dark gray for screens
  const hasLED = accessories.has('led');

  // Calculate positions
  const xOffset = width / 2 - postSize / 2;
  const zOffset = depth / 2 - postSize / 2;

  // Structural Rules
  const maxLouverSpan = 13;
  const maxDepthSpan = 20;

  const numBaysX = Math.ceil(width / maxLouverSpan);
  const numBaysZ = Math.ceil(depth / maxDepthSpan);
  
  // Middle support posts only appear once a beam spans more than 20'.
  // Below that, louver-bay splits are structural only (no extra post).
  const needsMiddlePostX = width > 20;
  const needsMiddlePostZ = depth > 20;

  // Default post positions — corners at ends, middle posts evenly distributed.
  const defaultPostCentersX = Array.from({ length: numBaysX + 1 }).map((_, i) => -xOffset + i * ((width - postSize) / numBaysX));
  const defaultPostCentersZ = Array.from({ length: numBaysZ + 1 }).map((_, i) => -zOffset + i * ((depth - postSize) / numBaysZ));

  // Admin: apply per-post offsets to middle posts (corners are fixed).
  // 1ft in pergola coordinates = 1 scene unit (scene maps 1:1 to feet).
  //
  // postCentersX / postCentersZ — position of each BEAM (midspan beams
  // sit at the middle-post indices). Used for bay/louver/screen math.
  const postCentersX = defaultPostCentersX.map((p, i) => {
    if (i === 0 || i === numBaysX) return p;
    return p + (postXOffsets?.[i] || 0);
  });
  const postCentersZ = defaultPostCentersZ.map((p, i) => {
    if (i === 0 || i === numBaysZ) return p;
    return p + (postZOffsets?.[i] || 0);
  });
  // postRenderCentersX / postRenderCentersZ — where the physical post
  // MESH is drawn. Middle posts layer the post-only offset on top of
  // the beam offset. Corner posts (i=0 / i=numBays) honor the
  // cantilever inset for that edge. Insets are bidirectional:
  //   positive → post moves INWARD (beam cantilevers past it)
  //   negative → post moves OUTWARD past the default pergola corner
  //              (decorative/brace placement — post extends past beam)
  const leftInset  = cantileverInsets?.left  || 0;
  const rightInset = cantileverInsets?.right || 0;
  const backInset  = cantileverInsets?.back  || 0;
  const frontInset = cantileverInsets?.front || 0;
  const postRenderCentersX = postCentersX.map((p, i) => {
    if (i === 0)          return p + leftInset;   // +inset moves left corners right (inward)
    if (i === numBaysX)   return p - rightInset;  // +inset moves right corners left (inward)
    return p + (postXOnlyOffsets?.[i] || 0);
  });
  const postRenderCentersZ = postCentersZ.map((p, i) => {
    if (i === 0)          return p + backInset;   // +inset moves back corners forward
    if (i === numBaysZ)   return p - frontInset;  // +inset moves front corners backward
    return p + (postZOnlyOffsets?.[i] || 0);
  });

  // Admin: posts that are removed. Only the POST mesh is hidden — the
  // midspan beam, louver divider, and bay boundaries stay in place.
  // This lets admin pull a visible support without collapsing the
  // louver sections into one wider bay.
  const isMiddleXRemoved = (i: number) => i > 0 && i < numBaysX && !!removedMiddlePosts?.has(`x-${i}`);
  const isMiddleZRemoved = (i: number) => i > 0 && i < numBaysZ && !!removedMiddlePosts?.has(`z-${i}`);

  const louverDepth = 8 / 12; // 8 inches wide

  // Per-bay widths derived from (possibly shifted) post positions.
  // Removed posts don't change these — beams and louvers stay put.
  const bayPostGapsX = Array.from({ length: numBaysX }).map((_, i) =>
    postCentersX[i + 1] - postCentersX[i]);
  const bayCentersX = Array.from({ length: numBaysX }).map((_, i) =>
    (postCentersX[i] + postCentersX[i + 1]) / 2);
  const bayLouverWidthsX = bayPostGapsX.map(g => g - beamWidth - 0.05);
  // Midspan beams sit at each middle post's X position — always rendered
  // regardless of whether the physical post is removed.
  const bayBeamCentersX = postCentersX.slice(1, -1);

  // Legacy `louverWidth` kept for code that reads it as a scalar — use
  // the per-bay array via index in new call sites.
  const louverWidth = bayLouverWidthsX[0] ?? (((width - postSize) / numBaysX) - beamWidth - 0.05);

  // Screen / Privacy Wall logic — bay count follows post structure.
  const showScreenBaysX = needsMiddlePostX;
  const showScreenBaysZ = needsMiddlePostZ;
  const screenCentersX = showScreenBaysX
    ? bayCentersX
    : [-xOffset + (width - postSize) / 2];
  const screenWidthsX = showScreenBaysX
    ? bayPostGapsX.map(g => g - postSize)
    : [width - 2 * postSize];
  const screenWidthX = screenWidthsX[0];

  const bayPostGapsZ = Array.from({ length: numBaysZ }).map((_, i) =>
    postCentersZ[i + 1] - postCentersZ[i]);
  const screenCentersZ = showScreenBaysZ
    ? Array.from({ length: numBaysZ }).map((_, i) =>
        (postCentersZ[i] + postCentersZ[i + 1]) / 2)
    : [-zOffset + (depth - postSize) / 2];
  const screenWidthsZ = showScreenBaysZ
    ? bayPostGapsZ.map(g => g - postSize)
    : [depth - 2 * postSize];
  const screenWidthZ = screenWidthsZ[0];

  /** If a side has a partial structure wall, return the center + width
   *  (in pergola-axis coordinates) of the OPEN portion so screens/walls
   *  are rendered only there. Returns null when the side isn't partial,
   *  signalling the caller to fall back to normal bay-based rendering. */
  const getOpenSegmentOnSide = (side: 'front'|'back'|'left'|'right'): { center: number; width: number } | null => {
    const isSide = side === 'left' || side === 'right';
    const baseDim = isSide ? depth : width;
    const partialLen = houseWallLengths?.[side];
    if (typeof partialLen !== 'number' || partialLen >= baseDim) return null;
    const anchor = houseWallAnchors?.[side] ?? 'start';
    const openLen = baseDim - partialLen;
    // Structure-wall covered range
    let coveredStart: number, coveredEnd: number;
    if (anchor === 'start') {
      coveredStart = -baseDim / 2;
      coveredEnd = -baseDim / 2 + partialLen;
    } else if (anchor === 'end') {
      coveredEnd = baseDim / 2;
      coveredStart = baseDim / 2 - partialLen;
    } else {
      coveredStart = -partialLen / 2;
      coveredEnd = partialLen / 2;
    }
    // Open segment is the complement — for start/end anchors it's contiguous
    // (length = openLen); for center anchor it's split into two equal halves
    // (each length = openLen / 2), and we pick the right/front half.
    let openCenter: number;
    let openSegmentWidth: number;
    if (anchor === 'start') {
      openCenter = (coveredEnd + baseDim / 2) / 2;
      openSegmentWidth = openLen;
    } else if (anchor === 'end') {
      openCenter = (-baseDim / 2 + coveredStart) / 2;
      openSegmentWidth = openLen;
    } else {
      // Center anchor — open is split. Render on the right/front half.
      openCenter = (coveredEnd + baseDim / 2) / 2;
      openSegmentWidth = openLen / 2;
    }
    return { center: openCenter, width: Math.max(0.5, openSegmentWidth - postSize) };
  };

  // Louver bay logic — derived from (possibly shifted) post centers so
  // nudged posts redistribute louver section widths. Removed posts don't
  // affect this — bay boundaries stay.
  const louverBayCentersZ = Array.from({ length: numBaysZ }).map((_, i) =>
    (postCentersZ[i] + postCentersZ[i + 1]) / 2);
  const louverBayWidthsZ = bayPostGapsZ.map(g => g - postSize);
  const louverBayWidthZ = louverBayWidthsZ[0] ?? (((depth - postSize) / numBaysZ) - postSize);

  // Animate louvers
  const { louverRotation } = useSpring({
    louverRotation: -(louverAngle * Math.PI) / 180,
    config: { mass: 1, tension: 120, friction: 20 },
    immediate: staticMode
  });

  const frameMaterialProps = { roughness: 0.3, metalness: 0.6, envMapIntensity: 1.2 };
  const louverMaterialProps = { roughness: 0.3, metalness: 0.6, envMapIntensity: 1.2 };

  return (
    <group position={[0, -height / 2, 0]}>
      {/* Posts — use postRenderCentersX/Z so the physical post can be
          offset independently from the beam (cantilever / decorative
          post placement). */}
      {postRenderCentersX.map((x, i) => (
        <React.Fragment key={`post-row-${i}`}>
          {postRenderCentersZ.map((z, j) => {
            // A post is required if it's a corner, a side post if the span exceeds 20' and area > 260 sq ft, or an internal post for very large pergolas.
            const isCorner = (i === 0 || i === numBaysX) && (j === 0 || j === numBaysZ);
            const isSidePostX = (i > 0 && i < numBaysX && (j === 0 || j === numBaysZ));
            const isSidePostZ = (j > 0 && j < numBaysZ && (i === 0 || i === numBaysX));
            const isInternalPost = (i > 0 && i < numBaysX) && (j > 0 && j < numBaysZ);
            
            const isRequired = isCorner ||
                               (needsMiddlePostX && isSidePostX) ||
                               (needsMiddlePostZ && isSidePostZ) ||
                               (needsMiddlePostX && needsMiddlePostZ && isInternalPost);

            if (!isRequired) return null;
            // Admin-removed middle posts don't render (and the adjacent
            // bays merge in the beam/louver math above).
            if (isMiddleXRemoved(i) || isMiddleZRemoved(j)) return null;

            return (
              <React.Fragment key={`post-${i}-${j}`}>
                {customModels?.post ? (
                  <CustomPart url={customModels.post} position={[x, height / 2, z]} scale={[postSize, height, postSize]} rotation={[0, 0, 0]} color={frameColor} materialProps={frameMaterialProps} />
                ) : (
                  <RoundedBox args={[postSize, height, postSize]} radius={0.02} smoothness={4} position={[x, height / 2, z]} castShadow receiveShadow>
                    <meshStandardMaterial color={frameColor} {...frameMaterialProps} />
                  </RoundedBox>
                )}
              </React.Fragment>
            );
          })}
        </React.Fragment>
      ))}

      {/* Perimeter Beams */}
      {customModels?.beam ? (
        <>
          <CustomPart url={customModels.beam} position={[0, height, zOffset]} scale={[width, beamSize, postSize]} rotation={[0, 0, 0]} color={frameColor} materialProps={frameMaterialProps} />
          <CustomPart url={customModels.beam} position={[0, height, -zOffset]} scale={[width, beamSize, postSize]} rotation={[0, 0, 0]} color={frameColor} materialProps={frameMaterialProps} />
          <CustomPart url={customModels.beam} position={[xOffset, height, 0]} scale={[depth, beamSize, postSize]} rotation={[0, Math.PI / 2, 0]} color={frameColor} materialProps={frameMaterialProps} />
          <CustomPart url={customModels.beam} position={[-xOffset, height, 0]} scale={[depth, beamSize, postSize]} rotation={[0, Math.PI / 2, 0]} color={frameColor} materialProps={frameMaterialProps} />
        </>
      ) : (
        <>
          {/* Front Beam */}
          <Beam 
            length={width} 
            color={frameColor} 
            materialProps={frameMaterialProps} 
            position={[-width / 2, height - beamSize/2, zOffset + postSize/2]} 
            rotation={[0, Math.PI / 2, 0]} 
          />
          {/* Back Beam */}
          <Beam 
            length={width} 
            color={frameColor} 
            materialProps={frameMaterialProps} 
            position={[width / 2, height - beamSize/2, -zOffset - postSize/2]} 
            rotation={[0, -Math.PI / 2, 0]} 
          />
          {/* Right Beam */}
          <Beam 
            length={depth} 
            color={frameColor} 
            materialProps={frameMaterialProps} 
            position={[xOffset + postSize/2, height - beamSize/2, depth / 2]} 
            rotation={[0, Math.PI, 0]} 
          />
          {/* Left Beam */}
          <Beam 
            length={depth} 
            color={frameColor} 
            materialProps={frameMaterialProps} 
            position={[-xOffset - postSize/2, height - beamSize/2, -depth / 2]} 
            rotation={[0, 0, 0]} 
          />
        </>
      )}

      {/* Logos on the right side of each beam */}
      <Logo frameColor={frameColor} position={[xOffset + postSize / 2 - 2.65, height, zOffset + postSize / 2 + 0.001]} rotation={[0, 0, 0]} />
      <Logo frameColor={frameColor} position={[-xOffset - postSize / 2 + 2.65, height, -zOffset - postSize / 2 - 0.001]} rotation={[0, Math.PI, 0]} />
      <Logo frameColor={frameColor} position={[xOffset + postSize / 2 + 0.001, height, -zOffset - postSize / 2 + 2.65]} rotation={[0, Math.PI / 2, 0]} />
      <Logo frameColor={frameColor} position={[-xOffset - postSize / 2 - 0.001, height, zOffset + postSize / 2 - 2.65]} rotation={[0, -Math.PI / 2, 0]} />

      {/* Intermediate Louver Beams (Z-axis) */}
      {bayBeamCentersX.map((x, i) => (
        <React.Fragment key={`beam-bay-${i}`}>
          {customModels?.beam ? (
            <CustomPart url={customModels.beam} position={[x, height, 0]} scale={[depth, beamSize, postSize]} rotation={[0, Math.PI / 2, 0]} color={frameColor} materialProps={frameMaterialProps} />
          ) : (
            <Beam 
              length={depth} 
              color={frameColor} 
              materialProps={frameMaterialProps} 
              position={[x + beamWidth/2, height - beamSize/2, depth / 2]} 
              rotation={[0, Math.PI, 0]} 
            />
          )}
        </React.Fragment>
      ))}

      {/* Intermediate Depth Beams (X-axis) */}
      {postCentersZ.slice(1, -1).map((z, i) => (
        <React.Fragment key={`beam-depth-${i}`}>
          {customModels?.beam ? (
            <CustomPart url={customModels.beam} position={[0, height, z]} scale={[width, beamSize, postSize]} rotation={[0, 0, 0]} color={frameColor} materialProps={frameMaterialProps} />
          ) : (
            <Beam 
              length={width} 
              color={frameColor} 
              materialProps={frameMaterialProps} 
              position={[-width / 2, height - beamSize/2, z + beamWidth/2]} 
              rotation={[0, Math.PI / 2, 0]} 
            />
          )}
        </React.Fragment>
      ))}

      {/* LED Strips */}
      {hasLED && (
        <group>
          <mesh position={[0, height - beamSize/2 - 0.05, zOffset - postSize/2 - 0.05]}>
            <boxGeometry args={[width - postSize*2, 0.05, 0.05]} />
            <meshBasicMaterial color="#fef08a" />
            <pointLight color="#fef08a" intensity={0.5} distance={5} />
          </mesh>
          <mesh position={[0, height - beamSize/2 - 0.05, -zOffset + postSize/2 + 0.05]}>
            <boxGeometry args={[width - postSize*2, 0.05, 0.05]} />
            <meshBasicMaterial color="#fef08a" />
            <pointLight color="#fef08a" intensity={0.5} distance={5} />
          </mesh>
        </group>
      )}

      {/* Louvers — per-bay widths so merged/shifted bays render correctly */}
      {bayCentersX.map((bayX, bayIndexX) => {
        const thisLouverWidth = bayLouverWidthsX[bayIndexX] ?? louverWidth;
        return (
          <React.Fragment key={`bay-x-${bayIndexX}`}>
            {louverBayCentersZ.map((bayZ, bayIndexZ) => {
              const thisLouverBayWidthZ = louverBayWidthsZ[bayIndexZ] ?? louverBayWidthZ;
              const targetSpacing = 7.75 / 12; // 7.75 inches spacing for interlocking
              const louverMargin = 0.1; // Pivot is now at the edge, so we only need the clearance
              const louverArea = thisLouverBayWidthZ - (louverMargin * 2 + (8.5 / 12));
              const louverCount = Math.max(2, Math.round(louverArea / targetSpacing) + 1);
              const louverSpacing = louverCount > 1 ? louverArea / (louverCount - 1) : 0;

              return (
                <group key={`bay-z-${bayIndexZ}`}>
                  {Array.from({ length: louverCount }).map((_, i) => {
                    const z = bayZ - thisLouverBayWidthZ / 2 + louverMargin + i * louverSpacing;
                    return (
                      <a.group key={i} position={[bayX, height - 1/12, z]} rotation-x={louverRotation}>
                        {customModels?.louver ? (
                          <CustomPart url={customModels.louver} position={[0, 0, 0]} scale={[thisLouverWidth, 0.1, louverDepth]} rotation={[0, 0, 0]} color={louverColor} materialProps={louverMaterialProps} />
                        ) : (
                          <Louver
                            length={thisLouverWidth}
                            color={louverColor}
                            materialProps={louverMaterialProps}
                            position={[-thisLouverWidth / 2, 0, 0]}
                            rotation={[0, Math.PI / 2, 0]}
                          />
                        )}
                      </a.group>
                    );
                  })}
                </group>
              );
            })}
          </React.Fragment>
        );
      })}

      {/* Motorized Screens — render over the whole side unless there's
          a partial structure wall on the same side, in which case render
          only over the open portion. */}
      {accessories.has('screen_front') && (() => {
        const seg = getOpenSegmentOnSide('front');
        if (seg) return <MotorizedScreen key="sf-partial" width={seg.width} height={height} position={[seg.center, height / 2, zOffset - 0.1]} rotation={[0, 0, 0]} color={screenColor} frameColor={frameColor} dropPercentage={screenDrop} staticMode={staticMode} />;
        return screenCentersX.map((x, i) => (
          <MotorizedScreen key={`sf-${i}`} width={screenWidthsX[i] ?? screenWidthX} height={height} position={[x, height / 2, zOffset - 0.1]} rotation={[0, 0, 0]} color={screenColor} frameColor={frameColor} dropPercentage={screenDrop} staticMode={staticMode} />
        ));
      })()}
      {accessories.has('screen_back') && (() => {
        const seg = getOpenSegmentOnSide('back');
        if (seg) return <MotorizedScreen key="sb-partial" width={seg.width} height={height} position={[seg.center, height / 2, -zOffset + 0.1]} rotation={[0, 0, 0]} color={screenColor} frameColor={frameColor} dropPercentage={screenDrop} staticMode={staticMode} />;
        return screenCentersX.map((x, i) => (
          <MotorizedScreen key={`sb-${i}`} width={screenWidthsX[i] ?? screenWidthX} height={height} position={[x, height / 2, -zOffset + 0.1]} rotation={[0, 0, 0]} color={screenColor} frameColor={frameColor} dropPercentage={screenDrop} staticMode={staticMode} />
        ));
      })()}
      {accessories.has('screen_right') && (() => {
        const seg = getOpenSegmentOnSide('right');
        if (seg) return <MotorizedScreen key="sr-partial" width={seg.width} height={height} position={[xOffset - 0.1, height / 2, seg.center]} rotation={[0, Math.PI / 2, 0]} color={screenColor} frameColor={frameColor} dropPercentage={screenDrop} staticMode={staticMode} />;
        return screenCentersZ.map((z, i) => (
          <MotorizedScreen key={`sr-${i}`} width={screenWidthsZ[i] ?? screenWidthZ} height={height} position={[xOffset - 0.1, height / 2, z]} rotation={[0, Math.PI / 2, 0]} color={screenColor} frameColor={frameColor} dropPercentage={screenDrop} staticMode={staticMode} />
        ));
      })()}
      {accessories.has('screen_left') && (() => {
        const seg = getOpenSegmentOnSide('left');
        if (seg) return <MotorizedScreen key="sl-partial" width={seg.width} height={height} position={[-xOffset + 0.1, height / 2, seg.center]} rotation={[0, Math.PI / 2, 0]} color={screenColor} frameColor={frameColor} dropPercentage={screenDrop} staticMode={staticMode} />;
        return screenCentersZ.map((z, i) => (
          <MotorizedScreen key={`sl-${i}`} width={screenWidthsZ[i] ?? screenWidthZ} height={height} position={[-xOffset + 0.1, height / 2, z]} rotation={[0, Math.PI / 2, 0]} color={screenColor} frameColor={frameColor} dropPercentage={screenDrop} staticMode={staticMode} />
        ));
      })()}

      {/* Guillotine Windows */}
      {accessories.has('guillotine_front') && screenCentersX.map((x, i) => (
        <GuillotineWindow key={`gf-${i}`} width={screenWidthX} height={height} position={[x, height / 2, zOffset - 0.1]} rotation={[0, 0, 0]} color={screenColor} frameColor={frameColor} openPercentage={guillotineOpen} staticMode={staticMode} />
      ))}

      {/* Walls — Privacy (stop at beam) + Structure (extend 2' above). Corners
          join cleanly: front/back walls span full width, left/right walls are
          shortened to fit between them. */}
      {(() => {
        const privacyHeight = height;           // meets bottom of gutter beam
        const structureHeight = height + 2;     // extends 2' above pergola

        // Gather which sides have any wall (privacy OR structure) for corner math
        const structureSides = new Set<string>();
        if (houseWalls) houseWalls.forEach(s => structureSides.add(s));
        if (houseWall && houseWall !== 'none') structureSides.add(houseWall);

        const hasWallOn = (side: string) => accessories.has(`wall_${side}`) || structureSides.has(side);
        const CORNER_INSET = 0.25; // ft — trim at corners so walls meet flush

        const frontInset = hasWallOn('front') ? CORNER_INSET : 0;
        const backInset = hasWallOn('back') ? CORNER_INSET : 0;
        const lrLengthDelta = frontInset + backInset;
        const lrCenterShift = (backInset - frontInset) / 2;

        // Walls span post-center-to-post-center so they visually extend
        // through the posts with no gap. Bay span includes one postSize extra
        // (half a post at each end of the bay).
        const frontBackBayWidth = screenWidthX + postSize;
        const leftRightBayWidth = screenWidthZ + postSize;

        return (
          <>
            {/* Front/back privacy walls — span post-to-post (or just the
                open portion when the side has a partial structure wall) */}
            {accessories.has('wall_front') && (() => {
              const seg = getOpenSegmentOnSide('front');
              if (seg) return <PrivacyWall key="wf-partial" width={seg.width} height={privacyHeight} position={[seg.center, privacyHeight / 2, zOffset - 0.2]} rotation={[0, 0, 0]} color={wallColor} />;
              return screenCentersX.map((x, i) => (
                <PrivacyWall key={`wf-${i}`} width={frontBackBayWidth} height={privacyHeight} position={[x, privacyHeight / 2, zOffset - 0.2]} rotation={[0, 0, 0]} color={wallColor} />
              ));
            })()}
            {accessories.has('wall_back') && (() => {
              const seg = getOpenSegmentOnSide('back');
              if (seg) return <PrivacyWall key="wb-partial" width={seg.width} height={privacyHeight} position={[seg.center, privacyHeight / 2, -zOffset + 0.2]} rotation={[0, 0, 0]} color={wallColor} />;
              return screenCentersX.map((x, i) => (
                <PrivacyWall key={`wb-${i}`} width={frontBackBayWidth} height={privacyHeight} position={[x, privacyHeight / 2, -zOffset + 0.2]} rotation={[0, 0, 0]} color={wallColor} />
              ));
            })()}

            {/* Left/right privacy walls — one continuous panel spanning all bays,
                post-to-post, shortened at corners where another wall exists */}
            {accessories.has('wall_right') && (() => {
              const seg = getOpenSegmentOnSide('right');
              if (seg) return <PrivacyWall key="wr-partial" width={seg.width} height={privacyHeight} position={[xOffset - 0.2, privacyHeight / 2, seg.center]} rotation={[0, Math.PI / 2, 0]} color={wallColor} />;
              const fullSpan = leftRightBayWidth * screenCentersZ.length;
              const adjustedWidth = Math.max(0.5, fullSpan - lrLengthDelta);
              const adjustedZ = (screenCentersZ.reduce((s, c) => s + c, 0) / Math.max(1, screenCentersZ.length)) + lrCenterShift;
              return <PrivacyWall key="wr-joined" width={adjustedWidth} height={privacyHeight} position={[xOffset - 0.2, privacyHeight / 2, adjustedZ]} rotation={[0, Math.PI / 2, 0]} color={wallColor} />;
            })()}
            {accessories.has('wall_left') && (() => {
              const seg = getOpenSegmentOnSide('left');
              if (seg) return <PrivacyWall key="wl-partial" width={seg.width} height={privacyHeight} position={[-xOffset + 0.2, privacyHeight / 2, seg.center]} rotation={[0, Math.PI / 2, 0]} color={wallColor} />;
              const fullSpan = leftRightBayWidth * screenCentersZ.length;
              const adjustedWidth = Math.max(0.5, fullSpan - lrLengthDelta);
              const adjustedZ = (screenCentersZ.reduce((s, c) => s + c, 0) / Math.max(1, screenCentersZ.length)) + lrCenterShift;
              return <PrivacyWall key="wl-joined" width={adjustedWidth} height={privacyHeight} position={[-xOffset + 0.2, privacyHeight / 2, adjustedZ]} rotation={[0, Math.PI / 2, 0]} color={wallColor} />;
            })()}

            {/* Structure walls — 2' above pergola.
                Outside-corner join: each wall extends past the pergola edge
                by the full wall thickness on any end that meets another
                structure wall, so the corner fully overlaps and each wall
                terminates at the outer face of its perpendicular neighbour.
                If a side has a partial-length structure wall, the wall is
                rendered only over the covered portion and anchored per
                houseWallAnchors[side] (start / center / end). */}
            {Array.from(structureSides).map(side => {
              const EXT = 10;              // ft past pergola if no intersection
              const CORNER_EXT = 1;        // matches HouseWall backing thickness (1ft)

              const isSide = side === 'left' || side === 'right';
              const perpEnd1 = isSide ? 'back' : 'left';   // -Z or -X end
              const perpEnd2 = isSide ? 'front' : 'right'; // +Z or +X end
              const baseDim = isSide ? depth : width;

              // Partial-length support: figure out which portion of the
              // side is covered by structure wall. Coordinates run
              // -baseDim/2 .. +baseDim/2 along the side axis.
              const partialLen = houseWallLengths?.[side as 'front'|'back'|'left'|'right'];
              const isPartial = typeof partialLen === 'number' && partialLen < baseDim;
              const anchor = houseWallAnchors?.[side as 'front'|'back'|'left'|'right'] ?? 'start';

              let coveredStart: number, coveredEnd: number;
              if (isPartial) {
                if (anchor === 'start') {
                  coveredStart = -baseDim / 2;
                  coveredEnd = -baseDim / 2 + (partialLen as number);
                } else if (anchor === 'end') {
                  coveredEnd = baseDim / 2;
                  coveredStart = baseDim / 2 - (partialLen as number);
                } else { // center
                  coveredStart = -(partialLen as number) / 2;
                  coveredEnd = (partialLen as number) / 2;
                }
              } else {
                coveredStart = -baseDim / 2;
                coveredEnd = baseDim / 2;
              }

              const touchesEnd1 = Math.abs(coveredStart - (-baseDim / 2)) < 0.01;
              const touchesEnd2 = Math.abs(coveredEnd - (baseDim / 2)) < 0.01;
              const end1Intersects = touchesEnd1 && structureSides.has(perpEnd1);
              const end2Intersects = touchesEnd2 && structureSides.has(perpEnd2);

              // Per-end extension choice: default true (extend past the
              // pergola), false means terminate flush at the pergola edge.
              // 'start' maps to end1, 'end' maps to end2.
              const extChoice = houseWallExtensions?.[side as 'front'|'back'|'left'|'right'];
              const wantExtStart = extChoice?.start !== false;
              const wantExtEnd = extChoice?.end !== false;

              // Resolve each end's position. If it doesn't touch the edge,
              // it terminates at the covered range. If it does touch, the
              // customer's extension toggle chooses between flush and
              // extend-past.
              const end1 = touchesEnd1
                ? (end1Intersects
                    ? coveredStart - CORNER_EXT
                    : (wantExtStart ? coveredStart - EXT : coveredStart))
                : coveredStart;
              const end2 = touchesEnd2
                ? (end2Intersects
                    ? coveredEnd + CORNER_EXT
                    : (wantExtEnd ? coveredEnd + EXT : coveredEnd))
                : coveredEnd;
              const wallLength = end2 - end1;
              const wallCenter = (end1 + end2) / 2;

              let posX: number, posZ: number, rotY: number;
              if (isSide) {
                posX = side === 'right' ? width / 2 : -width / 2;
                posZ = wallCenter;
                rotY = side === 'right' ? -Math.PI / 2 : Math.PI / 2;
              } else {
                posX = wallCenter;
                posZ = side === 'front' ? depth / 2 : -depth / 2;
                rotY = side === 'front' ? Math.PI : 0;
              }

              return (
                <HouseWall
                  key={`structure-${side}`}
                  width={wallLength}
                  height={structureHeight}
                  position={[posX, structureHeight / 2, posZ]}
                  rotation={[0, rotY, 0]}
                  color={houseWallColor}
                />
              );
            })}
          </>
        );
      })()}
    </group>
  );
};

export default function PergolaVisualizer(props: PergolaVisualizerProps) {
  const [view, setView] = useState(props.view || 'perspective');
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const controlsRef = useRef<any>(null);

  // Sync view state with props
  useEffect(() => {
    if (props.view && props.view !== view) {
      setView(props.view);
    }
  }, [props.view]);

  const handleViewChange = (newView: string) => {
    if (props.onViewChange) {
      props.onViewChange(newView);
    } else {
      setView(newView);
    }
    setIsViewMenuOpen(false);
  };

  useEffect(() => {
    if (!controlsRef.current) return;
    
    const centerY = 0; // The pergola is centered at 0 due to the group offset [0, -height/2, 0]
    
    // Use a small delay to ensure the camera has swapped before positioning
    const timer = setTimeout(() => {
      const dist = Math.max(30, props.width * 1.2, props.depth * 1.2);
      if (view === 'top') {
        controlsRef.current.setLookAt(0, dist, 0, 0, 0, 0, true);
      } else if (view === 'front') {
        controlsRef.current.setLookAt(0, centerY, dist, 0, centerY, 0, true);
      } else if (view === 'side') {
        controlsRef.current.setLookAt(dist, centerY, 0, 0, centerY, 0, true);
      } else if (view === 'perspective') {
        // Front view in perspective - higher angle to see louvers
        controlsRef.current.setLookAt(props.width * 1.0, centerY + props.height * 2.0, props.depth * 1.5, 0, centerY, 0, true);
      }
    }, 50);
    
    return () => clearTimeout(timer);
  }, [view, props.height, props.width, props.depth]);

  return (
    <div className="w-full h-full bg-[#f1f5f9] relative cursor-move">
      {/* View toggles hidden — live configurator shows 3D perspective only.
          All 4 views still render in the PDF via the `view` prop. */}

      {/* Loading Overlay */}
      {!isCanvasReady && !props.staticMode && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#f1f5f9]">
          <img src="/logo.png" alt="Eclipse Pergola" className="h-8 mb-4 opacity-60" />
          <div className="w-8 h-8 border-2 border-luxury-gold/30 border-t-luxury-gold rounded-full animate-spin" />
          <p className="mt-3 text-xs text-luxury-black/40 uppercase tracking-widest">Loading 3D Preview</p>
        </div>
      )}

      <ErrorBoundary>
        <Canvas shadows gl={{ preserveDrawingBuffer: true, antialias: true, powerPreference: 'high-performance' }} dpr={[1, 2]} onCreated={() => setIsCanvasReady(true)}>
          {view === 'perspective' ? (
            <PerspectiveCamera makeDefault position={[props.width * 1.0, props.height * 2.0, props.depth * 1.5]} fov={50} onUpdate={c => c.lookAt(0, 0, 0)} />
          ) : (
            <OrthographicCamera 
              makeDefault 
              position={
                view === 'top' ? [0, Math.max(45, props.width * 1.5, props.depth * 1.5), 0] : 
                view === 'front' ? [0, 0, Math.max(45, props.width * 1.5, props.depth * 1.5)] : 
                [Math.max(45, props.width * 1.5, props.depth * 1.5), 0, 0]
              } 
              zoom={300 / Math.max(props.width, props.depth)} 
              onUpdate={c => c.lookAt(0, 0, 0)}
            />
          )}
          {view === 'perspective' && <Sky sunPosition={[10, 20, 10]} turbidity={0.3} rayleigh={0.5} />}
          <ambientLight intensity={view === 'perspective' ? 0.4 : 0.8} />
          <directionalLight 
            position={[10, 20, 10]} 
            intensity={view === 'perspective' ? 2 : 1} 
            castShadow={view === 'perspective'} 
            shadow-mapSize={[2048, 2048]} 
            shadow-camera-near={0.5}
            shadow-camera-far={50}
            shadow-camera-left={-15}
            shadow-camera-right={15}
            shadow-camera-top={15}
            shadow-camera-bottom={-15}
            shadow-bias={-0.0001}
          />
          {!props.staticMode ? (
            <Environment preset="city" />
          ) : (
            <ambientLight intensity={0.5} />
          )}
          <PergolaModel {...props} />
          {view === 'perspective' && (
            <ContactShadows position={[0, -props.height / 2, 0]} opacity={0.6} scale={40} blur={2.5} far={10} resolution={512} color="#1e293b" />
          )}
          
          {/* Ground Plane */}
          <mesh position={[0, -props.height / 2 - 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[100, 100]} />
            <meshStandardMaterial color="#737373" roughness={1} metalness={0} />
          </mesh>

          {!props.staticMode && (
            <CameraControls 
              ref={controlsRef}
              makeDefault
              minPolarAngle={view === 'perspective' ? 0 : (view === 'top' ? 0 : Math.PI / 2)}
              maxPolarAngle={view === 'perspective' ? Math.PI / 2 - 0.05 : (view === 'top' ? 0 : Math.PI / 2)}
              minAzimuthAngle={view === 'perspective' ? -Infinity : (view === 'side' ? Math.PI / 2 : 0)}
              maxAzimuthAngle={view === 'perspective' ? Infinity : (view === 'side' ? Math.PI / 2 : 0)}
              minDistance={10}
              maxDistance={Math.max(150, props.width * 2, props.depth * 2)}
            />
          )}
        </Canvas>
      </ErrorBoundary>
      {!props.staticMode && (
        <div className="absolute bottom-4 right-4 bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs font-medium text-[#475569] shadow-sm pointer-events-none">
          {'ontouchstart' in globalThis || navigator.maxTouchPoints > 0
            ? 'Swipe to rotate • Pinch to zoom'
            : 'Drag to rotate • Scroll to zoom'}
        </div>
      )}
    </div>
  );
}
