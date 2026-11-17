import { PROP_SIZES, meters } from '../../data/scale';

const WOOD = '#9c6b3c';
/** Top of the lid in model units; the model is fitted to PROP_SIZES.shippingBinHeight. */
const MODEL_HEIGHT = 0.6;
const SCALE = meters(PROP_SIZES.shippingBinHeight) / MODEL_HEIGHT;
const WOOD_DARK = '#7a5230';
const SIGN = '#f2d84b';

/** Wooden shipping bin (1x1). Origin = tile center, y = 0 on the ground. */
export function ShippingBin() {
  return (
    <group scale={SCALE}>
      <mesh position={[0, 0.27, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.5, 0.62]} />
        <meshStandardMaterial color={WOOD} flatShading />
      </mesh>
      <mesh position={[0, 0.55, -0.06]} rotation={[-0.35, 0, 0]} castShadow>
        <boxGeometry args={[0.84, 0.06, 0.66]} />
        <meshStandardMaterial color={WOOD_DARK} flatShading />
      </mesh>
      <mesh position={[0, 0.3, 0.32]}>
        <boxGeometry args={[0.36, 0.18, 0.02]} />
        <meshStandardMaterial color={SIGN} flatShading />
      </mesh>
    </group>
  );
}
