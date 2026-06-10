/**
 * With Fire engine — public API.
 *
 * The intended consumption model:
 *
 *   import { newGame, beginRound, place, challenge, stepBack,
 *            revealCard, resolveRound, nextRound,
 *            makePlayer, PERSONAS,
 *            chooseAction, chooseRevealTarget } from "withfire-engine";
 *
 * Build state by composing pure functions. The host (UI / app) holds
 * the GameState in its own store (React state, Redux, Zustand, etc.)
 * and re-renders when state changes.
 */

export * from "./types";
export * from "./engine";
export * from "./personas";
export * from "./ai";
