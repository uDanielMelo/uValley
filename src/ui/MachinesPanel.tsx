import { useGameStore } from '../store/gameStore';
import { MachineShop } from './MachineShop';
import { Panel } from './primitives';

/** The machine dealer in town: tractor and harvester to buy or rent. */
export function MachinesPanel() {
  const close = useGameStore((s) => s.closePanel);
  return (
    <Panel title="🚜 Revenda de máquinas" onClose={close}>
      <MachineShop />
    </Panel>
  );
}
