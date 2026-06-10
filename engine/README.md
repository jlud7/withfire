# With Fire — Engine

The rules engine, AI, and type definitions for **With Fire**, a bluffing card game (Skull-family) for 2–5 players. This package is **UI-agnostic**: it has no React, no DOM, no timers, no randomness it didn't accept as an argument. Wrap it in whatever UI you like.

The intent is that you (or Claude Code) build the UI separately and lean on this engine for every rule decision. If a question of game logic comes up, the answer lives here.

## Project layout

```
src/
  types.ts        canonical data shapes (GameState, Player, Round, ...)
  engine.ts       pure rules: place, challenge, raise, stepBack, revealCard,
                  resolveRound, nextRound, plus derivation helpers
  ai.ts           pure AI: chooseAction (turn) and chooseRevealTarget (reveal)
  personas.ts     the four AI archetypes (Sable, Cinder, Pyre, Ash)
  index.ts        re-exports
  __tests__/
    smoke.test.ts  runs a full game through the engine; good sanity check
```

## Quick start

```bash
npm install
npx tsc --noEmit          # typecheck
npx tsx src/__tests__/smoke.test.ts   # run the smoke test
```

## Consumer model

The host (UI) holds the `GameState` in its own store and calls engine functions to advance it. Every engine function is **pure**: it takes state, returns new state. Nothing mutates in place.

```ts
import {
  newGame, beginRound, makePlayer, place, challenge, stepBack,
  revealCard, resolveRound, nextRound, nextOwnRevealIndex,
  PERSONAS, chooseAction, chooseRevealTarget,
} from "withfire-engine";

const alice = makePlayer({ id: "a", name: "Alice", seat: 0, isAI: false });
const bob   = makePlayer({ id: "b", name: "Bob",   seat: 1, isAI: true,
                           persona: PERSONAS[2] });

let state = newGame([alice, bob]);
state = beginRound(state, "a");

state = place(state, "a", "flower");
state = place(state, "b", "flower");
state = challenge(state, "a", 2);
// ... etc
```

If a call is illegal (wrong turn, wrong card, missing prerequisite), the engine returns the input state unchanged. You can compare references to detect rejection if you want, but in practice UIs validate before calling.

## Driving a turn — the canonical loop

A round, from start to settled:

1. **Open the round** with `beginRound(state, starterId)`.
2. **Player turns** until everyone has placed at least one card (`state.round.initialDone === true`). Each turn either `place(state, id, kind)` or, once `initialDone`, `challenge(state, id, n)`.
3. **Once a challenge exists**, players call `challenge(state, id, n)` to raise, or `stepBack(state, id)` to fold. When only the Challenger remains, the engine automatically transitions to the reveal phase (`state.round.reveal !== null`).
4. **Special case**: if a challenge is made at `n === totalOnTable(state)`, there's no room to raise. The engine resolves it immediately into a reveal — no betting round at all.
5. **Reveal phase**: the Challenger's own cards must be revealed first, LIFO. Use `nextOwnRevealIndex(state)` to get the next own-stack index; the host typically calls `revealCard` on a paced timer (e.g. ~650ms between cards) to auto-flip the Challenger's own stack. Once that returns `null`, the Challenger picks opponent cards one at a time via `revealCard(state, targetId, idx)`. The engine enforces that you can only flip the top un-revealed card of any one stack, but lets you switch freely between opponents.
6. **Reveal completes** when `state.round.reveal.done === true` (target met or Fire hit). Call `resolveRound(state)` to apply consequences (Burn Mark, possible random discard, possible win).
7. **If `state.phase === "playing"`**, call `nextRound(state)` to begin the next round; otherwise read `state.winner`.

## Critical invariants

These are easy to get wrong in UI code; trust the engine, don't reinvent them.

- **Cards return to hand at round start.** Nothing is "collected." Winning awards a Burn Mark, nothing else.
- **The only permanent card movement is losing.** A failed challenge discards exactly one of the Challenger's owned cards, chosen at random by the engine.
- **The discarded card's type is private.** The engine records `state.round.burnedCard.kind` for its own bookkeeping, but **the UI must never display this to other players.** Log lines from the engine are already type-safe (they say "discards a card, face down" without naming it). If your UI exposes any per-player "owns X flowers, Y fires" breakdown for *opponents*, you've leaked the same information through the back door — show a total count only.
- **Flip order is LIFO per stack; targeting between stacks is free.** Within one player's stack you take the top card. Between opponents the Challenger picks freely each tap. Do **not** force clockwise or "drain one opponent first" rules — those are not in this game.
- **Own cards reveal first, always.** No tapping opponents until own stack is clear. The engine enforces this; the UI should reflect it by auto-flipping own cards on a paced timer.

## AI integration

For an AI player, on their turn:

```ts
const action = chooseAction(state, aiId);
if (action.type === "place")    state = place(state, aiId, action.kind);
if (action.type === "challenge")state = challenge(state, aiId, action.n);
if (action.type === "stepBack") state = stepBack(state, aiId);
```

During a Reveal where the AI is the Challenger:

```ts
// 1. While their own stack has cards left, auto-flip via the engine helper.
const ownIdx = nextOwnRevealIndex(state);
if (ownIdx !== null) state = revealCard(state, aiId, ownIdx);

// 2. Otherwise pick an opponent and flip their top card.
else {
  const target = chooseRevealTarget(state);
  if (target) state = revealCard(state, target.id, target.idx);
}
```

The host should put a small delay (about 1 second) between AI actions so the human can follow what's happening; the engine itself has no notion of time.

## RNG

`resolveRound` accepts an optional RNG: `resolveRound(state, rand)` where `rand: () => number` returns `[0, 1)`. Default is `Math.random`. For deterministic tests, pass a seeded generator. The smoke test shows a simple LCG.

## What's NOT here

- **No UI.** Build that separately; the design spec covers the look and feel.
- **No persistence.** State is a plain object — serialize to JSON if you want to save.
- **No networking.** This is a single-device engine. If you ever add multiplayer, the engine is already pure: send actions over a wire, replay them on each client, and you have lockstep multiplayer for free. But that's a separate project.
- **No analytics, no telemetry.** Add at the host layer if you want it.

## License

Yours.
