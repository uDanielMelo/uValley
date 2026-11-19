/** Animal health and predators. All balancing for diseases, medicine and attacks lives here. */

import type { AnimalId, LifeStage } from './animals';

// ---------- medicine ----------

export const MEDICINE_IDS = ['dewormer', 'antibiotic'] as const;
export type MedicineId = (typeof MEDICINE_IDS)[number];

export interface MedicineDef {
  id: MedicineId;
  label: string;
  icon: string;
  price: number;
  /** What it treats (pt-BR). */
  note: string;
}

export const MEDICINES: Record<MedicineId, MedicineDef> = {
  dewormer: { id: 'dewormer', label: 'Vermífugo', icon: '💊', price: 40, note: 'Trata verminose.' },
  antibiotic: { id: 'antibiotic', label: 'Antibiótico', icon: '💉', price: 90, note: 'Trata gripe, infecção e ferimento.' },
};

// ---------- diseases ----------

export const DISEASE_IDS = ['worms', 'flu', 'infection', 'wound'] as const;
export type DiseaseId = (typeof DISEASE_IDS)[number];

export interface DiseaseDef {
  id: DiseaseId;
  label: string;
  icon: string;
  /** Multiplies production (and draft help) once the symptoms show. */
  production: number;
  /** Multiplies the walking speed once the symptoms show. */
  moveSpeed: number;
  /** Real hours (at 1×) before the symptoms show; the farm notices it then (earlier with a skilled hand). */
  incubationRealHours: number;
  /** Real hours with symptoms before it kills an untreated animal (null: never kills). */
  fatalAfterRealHours: number | null;
  medicine: MedicineId;
  /** Share of the random sicknesses that are this one (0: only caused by other things). */
  weight: number;
  /** Chance per real hour that each healthy shelter mate catches it (0: not contagious). */
  spreadPerRealHour: number;
  /** What it does (pt-BR). */
  note: string;
}

export const DISEASES: Record<DiseaseId, DiseaseDef> = {
  worms: {
    id: 'worms',
    label: 'Verminose',
    icon: '🪱',
    production: 0.5,
    moveSpeed: 0.85,
    incubationRealHours: 4,
    fatalAfterRealHours: null,
    medicine: 'dewormer',
    weight: 0.5,
    spreadPerRealHour: 0,
    note: 'Produz metade até ser tratada.',
  },
  flu: {
    id: 'flu',
    label: 'Gripe',
    icon: '🤧',
    production: 0,
    moveSpeed: 0.7,
    incubationRealHours: 2,
    fatalAfterRealHours: 12,
    medicine: 'antibiotic',
    weight: 0.3,
    spreadPerRealHour: 0.2,
    note: 'Não produz e passa para os outros do abrigo.',
  },
  infection: {
    id: 'infection',
    label: 'Infecção',
    icon: '🦠',
    production: 0,
    moveSpeed: 0.6,
    incubationRealHours: 1,
    fatalAfterRealHours: 6,
    medicine: 'antibiotic',
    weight: 0.2,
    spreadPerRealHour: 0,
    note: 'Grave: não produz e mata rápido.',
  },
  wound: {
    id: 'wound',
    label: 'Ferimento',
    icon: '🩹',
    production: 0,
    moveSpeed: 0.6,
    incubationRealHours: 0,
    fatalAfterRealHours: 12,
    medicine: 'antibiotic',
    weight: 0,
    spreadPerRealHour: 0,
    note: 'Ataque de predador: não produz até ser tratado.',
  },
};

/**
 * Chance of getting sick. The base is per real hour (at 1×) for a fed adult alone in a basic
 * shelter (about once in a whole life); the factors multiply it.
 */
export const DISEASE_RISK = {
  basePerRealHour: 1 / 96,
  /** Comfort of the basic shelter: the factor is (1 − comfort) / (1 − this), less in better shelters. */
  referenceComfort: 0.4,
  /** Extra risk per other animal in the same shelter. */
  perShelterMate: 0.04,
  /** Unfed animals. */
  hungry: 2,
  stage: { baby: 1.5, young: 1, adult: 1, old: 2 } satisfies Record<LifeStage, number>,
  /** Out of the shelter while the others sleep. */
  outsideAtNight: 1.5,
  /** A carcass by the shelter: more risk, and most of it is infection. */
  carcass: 2,
  carcassInfectionWeight: 3,
} as const;

/** With someone on the crew who has the animals skill, a sickness is noticed after this share of the incubation. */
export const EARLY_NOTICE = 0.5;
/** A sick animal (noticed) sells for this share of its price. */
export const SICK_RESALE = 0.5;
/** Work minutes (at speed 1) to medicate an animal. */
export const MEDICATE_MINUTES = 15;
/** Work minutes (at speed 1) to take a carcass away. */
export const CARCASS_MINUTES = 20;

// ---------- predators ----------

export const PREDATOR_IDS = ['fox', 'wildDog', 'puma'] as const;
export type PredatorId = (typeof PREDATOR_IDS)[number];

export interface PredatorDef {
  id: PredatorId;
  label: string;
  /** Body color and size (relative to the fox) of the figure seen running away. */
  color: string;
  scale: number;
}

export const PREDATORS: Record<PredatorId, PredatorDef> = {
  fox: { id: 'fox', label: 'Raposa', color: '#c8692e', scale: 1 },
  wildDog: { id: 'wildDog', label: 'Cachorro-do-mato', color: '#6e5a45', scale: 1.15 },
  puma: { id: 'puma', label: 'Onça-parda', color: '#b58a5a', scale: 1.7 },
};

/**
 * Night attacks. Every game hour, each shelter rolls once: the chance is `perHour` × the hour's
 * activity × the sum of its animals' exposure (so more animals draw more attacks). An animal
 * asleep inside is exposed (1 − shelter safety), one out of the shelter fully; babies count
 * double and large animals half. The victim is drawn by exposure too: small animals and babies
 * are eaten (the carcass stays on the ground), large ones are wounded (a wounded one attacked
 * again is killed).
 */
export const PREDATOR_RISK = {
  perHour: 0.0009,
  /** Activity by hour of the day (absent: none). */
  activity: { 19: 0.5, 20: 0.5, 21: 1, 22: 1, 23: 1, 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 0.5 } as Partial<Record<number, number>>,
  outside: 1,
  baby: 2,
  large: 0.5,
} as const;

/** Who hunts each species. */
export const SPECIES_PREDATOR: Record<AnimalId, PredatorId> = {
  chicken: 'fox',
  duck: 'fox',
  sheep: 'wildDog',
  goat: 'wildDog',
  pig: 'wildDog',
  cow: 'puma',
  ox: 'puma',
  horse: 'puma',
};

/** Large animals survive an attack wounded (their babies don't). */
export const LARGE_ANIMALS: readonly AnimalId[] = ['pig', 'cow', 'ox', 'horse'];

/** Real seconds the predator is seen running off after an attack. */
export const PREDATOR_FLEE_SECONDS = 8;
