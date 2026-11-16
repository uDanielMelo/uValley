import { CROPS, CROP_STAGE_COUNT } from '../data/crops';
import type { TileCrop } from './types';

export const growthMinutesNeeded = (crop: TileCrop): number => CROPS[crop.cropId].growthHours * 60;

/** Growth progress in [0, 1]. */
export const growthProgress = (crop: TileCrop): number =>
  Math.min(1, crop.growthMinutes / growthMinutesNeeded(crop));

export const isMature = (crop: TileCrop): boolean => growthProgress(crop) >= 1;

/** Visual stage index in [0, CROP_STAGE_COUNT - 1]. The last stage is the mature one. */
export const cropStage = (crop: TileCrop): number => {
  const progress = growthProgress(crop);
  const thresholds = CROPS[crop.cropId].stageThresholds;
  let stage = 0;
  for (let i = 0; i < CROP_STAGE_COUNT; i++) {
    const threshold = thresholds[i];
    if (threshold !== undefined && progress >= threshold) stage = i;
  }
  return stage;
};
