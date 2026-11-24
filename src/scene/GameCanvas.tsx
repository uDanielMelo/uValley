import { Canvas } from '@react-three/fiber';
import { PCFShadowMap } from 'three';
import { Animals } from './Animals';
import { Carcasses } from './Carcasses';
import { Blueprint } from './Blueprint';
import { BuildGhost } from './BuildGhost';
import { CameraRig } from './CameraRig';
import { Cars } from './Car';
import { Machines } from './Machines';
import { Predators } from './Predators';
import { Rain } from './Rain';
import { CropLayer } from './CropLayer';
import { DayNightLight } from './DayNightLight';
import { Environment } from './Environment';
import { Fences } from './Fences';
import { FenceLayer } from './FenceLayer';
import { GameLoop } from './GameLoop';
import { GrassLayer } from './GrassLayer';
import { PostFx } from './PostFx';
import { RoadLayer } from './RoadLayer';
import { Sky } from './Sky';
import { SoilLayer } from './SoilLayer';
import { Structures } from './Structures';
import { TaskMarkers } from './TaskMarkers';
import { TileHighlight } from './TileHighlight';
import { TileLayer } from './TileLayer';
import { WindClock } from './wind';
import { Workers } from './Workers';
import { WorldSwitch } from './WorldSwitch';

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
      <WorldSwitch>
        <Environment />
        <TileLayer />
        <RoadLayer />
        <SoilLayer />
        <GrassLayer />
        <TileHighlight />
        <Blueprint />
        <BuildGhost />
        <TaskMarkers />
        <Fences />
        <FenceLayer />
        <CropLayer />
        <Structures />
        <Workers />
        <Machines />
        <Animals />
        <Carcasses />
        <Predators />
        <Cars />
      </WorldSwitch>
      <Rain />
      <PostFx />
    </Canvas>
  );
}
