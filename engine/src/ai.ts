/**
 * With Fire — AI move selection.
 *
 * The AI is intentionally simple. Each persona has three knobs
 * (bluffChance, challengeGreed, nerve) that produce noticeably
 * different play. The brain does NOT do deep search or Bayesian
 * card-counting; it makes locally reasonable choices weighted by
 * personality.
 *
 * Every function here is pure: given a state and an RNG, it returns
 * an action to take. The host applies that action through the engine.
 *
 * Use chooseAction() during the betting/placing phase, and
 * chooseRevealTarget() during the Reveal phase once the Challenger's
 * own stack is clear.
 */

import type { GameState, Player, CardKind } from "./types";
import {
  activePlayers, totalOnTable, nextRevealIndex, getPlayer,
} from "./engine";

/** Discriminated union of moves the AI may emit. */
export type AIAction =
  | { type: "place"; kind: CardKind }
  | { type: "challenge"; n: number }
  | { type: "stepBack" };

/** Pick a random element. */
function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

/**
 * AI's rough estimate of how many cards it could safely reveal:
 * its own flowers face-down plus a heuristic guess (70%) of
 * opponents' face-down cards being flowers. Not Bayesian — just
 * a reasonable prior.
 */
function estimateSafeReveal(s: GameState, me: Player): number {
  const myFlowersDown = me.placed.filter((c) => c.kind === "flower").length;
  const others = activePlayers(s).filter((p) => p.id !== me.id);
  let oppFlowerGuess = 0;
  for (const o of others) oppFlowerGuess += Math.floor(o.placed.length * 0.7);
  return myFlowersDown + oppFlowerGuess;
}

/**
 * Choose what an AI player should do on their turn (place / challenge /
 * step back). Caller passes the AI's own id; this function ignores
 * whose turn the engine thinks it is.
 */
export function chooseAction(s: GameState, aiId: string, rand: () => number = Math.random): AIAction {
  const me = getPlayer(s, aiId);
  const persona = me.persona ?? {
    name: "default", trait: "", bluffChance: 0.3, challengeGreed: 0.4, nerve: 0.55,
  };
  const r = s.round;
  if (!r) return { type: "place", kind: "flower" }; // shouldn't happen

  const total = totalOnTable(s);

  // -- Facing an active Challenge: raise or step back --
  if (r.challenge) {
    const dareN = r.challenge.n;
    const myFireDown = me.placed.filter((c) => c.kind === "fire").length;
    const headroom = total - dareN;
    // Nerve scales the temptation to raise. If we have our Fire face-down,
    // raising is much scarier — temper nerve heavily in that case.
    const wantRaise =
      headroom >= 1 &&
      rand() < persona.nerve * (myFireDown === 0 ? 1 : 0.4);
    if (wantRaise) return { type: "challenge", n: Math.min(total, dareN + 1) };
    return { type: "stepBack" };
  }

  // -- No Challenge yet: must place at least one card on opening go-around --
  const canPlace = me.hand.flower > 0 || me.hand.fire > 0;
  if (!r.initialDone) return placeChoice(me, persona, rand);

  // -- Initial done: weigh placing more vs. opening a Challenge --
  const safe = estimateSafeReveal(s, me);
  const wantChallenge =
    safe >= 1 &&
    (!canPlace || rand() < 0.45 + persona.challengeGreed * 0.3);

  if (wantChallenge) {
    const greedy = safe + (rand() < persona.challengeGreed ? 1 : 0);
    return { type: "challenge", n: Math.min(total, Math.max(1, greedy)) };
  }
  if (canPlace) return placeChoice(me, persona, rand);

  // Nothing else to do — open a Challenge of 1.
  return { type: "challenge", n: Math.max(1, Math.min(total, safe || 1)) };
}

/** Decide whether to place a Flower or a Fire from hand. */
function placeChoice(
  me: Player,
  persona: { bluffChance: number },
  rand: () => number
): AIAction {
  const canFire = me.hand.fire > 0;
  const canFlower = me.hand.flower > 0;
  let kind: CardKind = "flower";
  if (canFire && rand() < persona.bluffChance) kind = "fire";
  if (kind === "fire" && !canFire) kind = "flower";
  if (kind === "flower" && !canFlower) kind = "fire";
  return { type: "place", kind };
}

/**
 * During the Reveal phase, after the AI Challenger has cleared its
 * own stack, choose which opponent's top card to reveal next. Returns
 * `{ id, idx }` of the target, or null if no opponent has cards left
 * (shouldn't happen if the round is consistent).
 *
 * Current behavior: uniformly random across opponents who still have
 * un-revealed cards. A more advanced AI could prefer opponents who
 * placed late (fresher = more bluff candidates) — left as a hook.
 */
export function chooseRevealTarget(
  s: GameState,
  rand: () => number = Math.random
): { id: string; idx: number } | null {
  const r = s.round;
  if (!r?.reveal || r.reveal.done) return null;
  const rv = r.reveal;
  const candidates: { id: string; idx: number }[] = [];
  for (const o of activePlayers(s)) {
    if (o.id === rv.darer) continue;
    const idx = nextRevealIndex(o, rv.flipped);
    if (idx >= 0) candidates.push({ id: o.id, idx });
  }
  if (candidates.length === 0) return null;
  return pick(candidates, rand);
}
