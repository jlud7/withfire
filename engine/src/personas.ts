import type { AIPersona } from "./types";

/**
 * The four AI archetypes. Each plays distinctly enough that you can
 * feel the difference within a round or two. The numbers are tuned
 * for a 2–5 player table; if you change them, expect the game's
 * difficulty curve to shift.
 *
 * On solo-mode setup the persona pool is shuffled and the first N
 * are assigned to the AI seats. Each game is therefore a different
 * mix.
 */
export const PERSONAS: AIPersona[] = [
  {
    name: "Sable",
    trait: "the cautious one",
    bluffChance: 0.12,
    challengeGreed: 0.0,
    nerve: 0.25,
  },
  {
    name: "Cinder",
    trait: "the steady hand",
    bluffChance: 0.3,
    challengeGreed: 0.4,
    nerve: 0.55,
  },
  {
    name: "Pyre",
    trait: "the reckless one",
    bluffChance: 0.55,
    challengeGreed: 1.0,
    nerve: 0.85,
  },
  {
    name: "Ash",
    trait: "the trickster",
    bluffChance: 0.42,
    challengeGreed: 0.7,
    nerve: 0.6,
  },
];
