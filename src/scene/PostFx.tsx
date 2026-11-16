import { useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, N8AO, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';

/**
 * Post-processing for the "diorama" look: ambient occlusion for contact shadows,
 * soft bloom for lit windows, ACES tone mapping and a light vignette.
 * Low quality skips it all (the renderer's own ACES tone mapping still applies) and uses 1× pixels.
 */
export function PostFx() {
  const graphics = useGameStore((s) => s.settings.graphics);
  const setDpr = useThree((s) => s.setDpr);

  useEffect(() => {
    setDpr(graphics === 'high' ? Math.min(window.devicePixelRatio, 2) : 1);
  }, [graphics, setDpr]);

  if (graphics === 'low') return null;
  return (
    <EffectComposer multisampling={4}>
      <N8AO aoRadius={1.2} distanceFalloff={0.6} intensity={2.2} quality="medium" halfRes color="#1c2a12" />
      <Bloom luminanceThreshold={1.1} luminanceSmoothing={0.2} intensity={0.55} mipmapBlur />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.3} darkness={0.45} />
    </EffectComposer>
  );
}
