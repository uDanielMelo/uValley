import { Canvas } from '@react-three/fiber';
import { PCFShadowMap } from 'three';
import { Animals } from './Animals';
import { CameraRig } from './CameraRig';
import { CropLayer } from './CropLayer';
import { DayNightLight } from './DayNightLight';
import { Environment } from './Environment';
import { Fences } from './Fences';
import { GameLoop } from './GameLoop';
import { GrassLayer } from './GrassLayer';
import { PostFx } from './PostFx';
import { Sky } from './Sky';
import { SoilLayer } from './SoilLayer';
import { Structures } from './Structures';
import { TaskMarkers } from './TaskMarkers';
import { TileHighlight } from './TileHighlight';
import { TileLayer } from './TileLayer';
import { WindClock } from './wind';
import { Workers } from './Workers';

/** The 3D scene. Static composition: HUD state changes never re-render this component. */
export function GameCanvas() {
  return (
    <Canvas
      shadows={{ type: PCFShadowMap }}
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      className="absolute inset-0"
    >
      <GameLoop />
      <WindClock />
      <CameraRig />
      <Sky />
      <DayNightLight />
      <Environment />
      <TileLayer />
      <SoilLayer />
      <GrassLayer />
      <TileHighlight />
      <TaskMarkers />
      <Fences />
      <CropLayer />
      <Structures />
      <Workers />
      <Animals />
      <PostFx />
    </Canvas>
  );
}
