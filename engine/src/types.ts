/**
 * With Fire — core type definitions.
 *
 * The data model is deliberately flat and serializable: no class
 * instances, no functions on state. This makes the engine safe to
 * snapshot, replay, send over a wire, or store in any backend.
 */

export type CardKind = "flower" | "fire";

/** A player's identity + their full state. `id` is stable across rounds. */
export interface Player {
  id: string;
  name: string;
  /** Seat index 0..N-1. Determines turn order; never changes mid-game. */
  seat: number;
  /** True for AI opponents (solo mode); false for humans (pass-and-play or solo). */
  isAI: boolean;
  /** AI personality (only meaningful when isAI). */
  persona?: AIPersona;

  /** Cards the player still owns (decrements only when they get burned). */
  ownedFlower: number;
  ownedFire: number;

  /** Un-placed cards still in this player's hand, this round. */
  hand: { flower: number; fire: number };

  /** Cards placed face down on the table, this round, in placement order.
   *  placed[0] is the first card down; placed[length-1] is most recent (top). */
  placed: { kind: CardKind }[];

  /** Burn Marks (points). First to 2 wins. */
  points: number;

  /** Once true, this player is out of the game (ran out of owned cards). */
  eliminated: boolean;
}

/** Active Challenge (claim) state. */
export interface Challenge {
  /** Player id who made or last raised this Challenge. */
  by: string;
  /** Number of cards they claim they can reveal without hitting Fire. */
  n: number;
}

/** Per-reveal record of a single card being turned face up. */
export interface RevealedCard {
  /** Whose stack the card came from. */
  id: string;
  /** Index into that player's `placed` array. */
  idx: number;
  /** What the card was. */
  kind: CardKind;
}

/** State of an in-progress Reveal phase. */
export interface RevealState {
  /** The Challenger — the one revealing cards. */
  darer: string;
  /** Target number of safe reveals. */
  target: number;
  /** Cards revealed so far, in reveal order. */
  flipped: RevealedCard[];
  /** True once reveal is complete (either target met or Fire hit). */
  done: boolean;
  /** True if a Fire was revealed (i.e. Burned). */
  burned: boolean;
}

/** Round-scoped state. Reset at the start of each round. */
export interface Round {
  /** Player id who led this round. */
  starter: string;
  /** Player id whose turn it currently is. */
  current: string;
  /** Active Challenge, or null if no one has challenged yet this round. */
  challenge: Challenge | null;
  /** Player ids who have Stepped Back from the current Challenge. */
  steppedBack: string[];
  /** True once every active player has placed at least one opening card. */
  initialDone: boolean;
  /** Reveal state, set when a Challenge resolves into a reveal. */
  reveal: RevealState | null;

  /** Set once the engine has applied the post-reveal consequences. */
  resolved: boolean;
  /** If set, this player has won the game. */
  outcomeWin: string | null;
  /** Who should lead the next round (if the game continues). */
  outcomeNext: string | null;
  /** When a Burn occurred, what card was discarded (HIDDEN from UI for opponents). */
  burnedCard: { kind: CardKind } | null;
  /** Player id who got burned and discarded. */
  burnedBy: string | null;

  /** Human-readable log of events for the round, oldest first. */
  log: string[];
}

/** Top-level game state. */
export interface GameState {
  players: Player[];
  round: Round | null;
  /** "playing" while the game is in progress; "over" once won. */
  phase: "playing" | "over";
  /** Set on game end. */
  winner: string | null;
}

/** AI behavior parameters. */
export interface AIPersona {
  name: string;
  /** Short flavor descriptor for UI (e.g. "the steady hand"). */
  trait: string;
  /** 0..1 — probability of placing a Fire rather than a Flower when it can choose. */
  bluffChance: number;
  /** 0..1 — how greedily it Raises beyond what it estimates is safe. */
  challengeGreed: number;
  /** 0..1 — how reluctant it is to Step Back when facing a Challenge. */
  nerve: number;
}
