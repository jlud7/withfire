/**
 * Smoke test: drive a full round through the engine and verify the
 * critical rules. Run with `npx tsx src/__tests__/smoke.test.ts` or
 * any TS-aware test runner. Asserts via plain throws for portability.
 */

import {
  newGame, beginRound, makePlayer, place, challenge, stepBack,
  revealCard, resolveRound, nextOwnRevealIndex, totalOnTable,
  activePlayers,
} from "../engine";
import { chooseAction } from "../ai";
import { PERSONAS } from "../personas";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error("ASSERT: " + msg);
}

// Deterministic RNG for reproducible tests.
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function runSmokeTest() {
  // Two-player game: Alice (human) vs Bob (AI with Pyre persona).
  const alice = makePlayer({ id: "a", name: "Alice", seat: 0, isAI: false });
  const bob = makePlayer({ id: "b", name: "Bob", seat: 1, isAI: true, persona: PERSONAS[2] });
  let s = newGame([alice, bob]);
  s = beginRound(s, "a");

  // Opening go-around: each places one flower.
  s = place(s, "a", "flower");
  assert(s.round!.current === "b", "turn should advance to Bob after Alice places");
  s = place(s, "b", "flower");
  assert(s.round!.initialDone, "opening go-around should be complete");
  assert(totalOnTable(s) === 2, "two cards on the table");

  // Alice challenges 2 — equals total, so the challenge resolves immediately.
  s = challenge(s, "a", 2);
  assert(s.round!.reveal !== null, "challenge at cap should resolve immediately");
  assert(s.round!.reveal!.target === 2, "reveal target should be 2");

  // Drive the own-stack auto-reveal manually.
  const ownIdx = nextOwnRevealIndex(s);
  assert(ownIdx === 0, "Alice's only placed card has index 0");
  s = revealCard(s, "a", ownIdx!);
  assert(s.round!.reveal!.flipped.length === 1, "one card flipped");
  assert(!s.round!.reveal!.done, "reveal not done yet — still need one more");

  // Now flip Bob's card. Should be his top (idx 0 since he only placed one).
  s = revealCard(s, "b", 0);
  assert(s.round!.reveal!.done, "reveal complete");
  assert(!s.round!.reveal!.burned, "both were flowers — survived");

  // Resolve: Alice gets a Burn Mark.
  s = resolveRound(s, seeded(1));
  assert(s.players[0].points === 1, "Alice should have 1 burn mark");
  assert(s.players[1].points === 0, "Bob untouched");

  // ---- Round 2: Alice places a fire, sets a trap ----
  s = beginRound(s, "a");
  s = place(s, "a", "fire");
  s = place(s, "b", "flower");
  // Alice challenges 1 — equals... wait, total is 2. So 1 is below cap → betting opens.
  s = challenge(s, "a", 1);
  assert(s.round!.reveal === null, "challenge below cap should NOT resolve immediately");
  assert(s.round!.current === "b", "turn passes to Bob to raise or step back");

  // Bob steps back → Alice must reveal 1.
  s = stepBack(s, "b");
  assert(s.round?.reveal != null, "with everyone else stepped back, reveal begins");
  // Alice's own stack first. Her card at idx 0 is FIRE.
  s = revealCard(s, "a", 0);
  const rv = s.round?.reveal;
  assert(rv != null, "reveal should still be present");
  assert(rv.done, "burned — reveal ends immediately");
  assert(rv.burned, "burned flag set");

  s = resolveRound(s, seeded(42));
  assert(s.players[0].points === 1, "Alice's burn mark from round 1 is unchanged");
  // She lost one of (3 flower + 1 fire) randomly. Total owned dropped by 1.
  const aliceOwned = s.players[0].ownedFlower + s.players[0].ownedFire;
  assert(aliceOwned === 3, "Alice now owns 3 cards");
  // Critical privacy invariant: burnedCard is recorded internally, but the
  // log line must NOT name the kind.
  const lastLog = s.round!.log[s.round!.log.length - 1] || "";
  // Don't check the burn line specifically (it may be followed by other lines);
  // scan all logs for type leakage.
  for (const line of s.round!.log) {
    assert(
      !/loses a (fire|flower)/i.test(line),
      `log must not name discarded card type: "${line}"`
    );
  }

  // ---- AI smoke: ask Bob what he'd do, just to be sure it returns something legal ----
  s = beginRound(s, "b");
  const move = chooseAction(s, "b", seeded(7));
  assert(
    move.type === "place" || move.type === "challenge" || move.type === "stepBack",
    "AI move should be one of the three action types"
  );

  console.log("smoke test passed");
}

runSmokeTest();
