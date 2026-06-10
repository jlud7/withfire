/**
 * With Fire — pure rules engine.
 *
 * Every function in this module either:
 *   (a) derives a value from existing state (no mutation), or
 *   (b) takes a state + an action and returns a NEW state.
 *
 * Nothing here calls into UI, network, timers, or randomness besides
 * `discardRandomOwnedCard`, which takes an explicit RNG. Tests can
 * inject a deterministic RNG.
 *
 * The flow of a round is:
 *   1. beginRound()
 *   2. place() or challenge() — repeats until a Challenge is resolved
 *   3. raise() / stepBack() — repeats until only the Challenger is left
 *   4. revealNext() — repeats until target reached or Fire hit
 *   5. resolveRound() — applies consequences (score / discard / win)
 *
 * The host (UI or tests) drives these calls. The engine never assumes
 * a turn schedule; it only enforces rules.
 */

import type {
  CardKind, Player, GameState, Round, RevealState,
  AIPersona,
} from "./types";

// ---- pure helpers ---------------------------------------------------

/** Active players, sorted by seat. Eliminated players are filtered out. */
export function activePlayers(s: GameState): Player[] {
  return s.players
    .filter((p) => !p.eliminated)
    .sort((a, b) => a.seat - b.seat);
}

/** Find a player by id. Throws if missing — engine state should never reference an unknown id. */
export function getPlayer(s: GameState, id: string): Player {
  const p = s.players.find((x) => x.id === id);
  if (!p) throw new Error(`unknown player id: ${id}`);
  return p;
}

/** Total cards face-down on the table, summed across active players. */
export function totalOnTable(s: GameState): number {
  return activePlayers(s).reduce((sum, p) => sum + p.placed.length, 0);
}

/**
 * Returns the index of the next card to reveal on the given player's
 * stack, given the cards already revealed this Reveal phase. This is
 * always the top (most recently placed) un-revealed card — i.e. LIFO.
 * Returns -1 if the stack is fully revealed.
 */
export function nextRevealIndex(p: Player, alreadyRevealed: RevealState["flipped"]): number {
  for (let i = p.placed.length - 1; i >= 0; i--) {
    if (!alreadyRevealed.some((f) => f.id === p.id && f.idx === i)) return i;
  }
  return -1;
}

/** Whose turn is next, going around the table, optionally skipping a list of ids. */
export function nextPlayerId(s: GameState, fromId: string, skip: string[] = []): string {
  const a = activePlayers(s);
  const idx = a.findIndex((p) => p.id === fromId);
  if (idx < 0) return fromId;
  for (let i = 1; i <= a.length; i++) {
    const cand = a[(idx + i) % a.length];
    if (!skip.includes(cand.id)) return cand.id;
  }
  return fromId;
}

// ---- factories ------------------------------------------------------

/** Build a fresh player at game start. Each player begins with 3 Flowers + 1 Fire. */
export function makePlayer(args: {
  id: string;
  name: string;
  seat: number;
  isAI: boolean;
  persona?: AIPersona;
}): Player {
  return {
    id: args.id,
    name: args.name,
    seat: args.seat,
    isAI: args.isAI,
    persona: args.persona,
    ownedFlower: 3,
    ownedFire: 1,
    hand: { flower: 3, fire: 1 },
    placed: [],
    points: 0,
    eliminated: false,
  };
}

/** Construct the initial game state from a set of players. */
export function newGame(players: Player[]): GameState {
  return {
    players,
    round: null,
    phase: "playing",
    winner: null,
  };
}

// ---- round lifecycle ------------------------------------------------

/**
 * Begin a new round. Resets each active player's hand to their owned
 * counts and clears placed cards. The given starterId leads.
 *
 * IMPORTANT: all placed cards return to their owner's hand at round
 * start. The game never "collects" cards — winning only awards an
 * Ember; losing only discards one owned card. This is canonical
 * Skull rules.
 */
export function beginRound(s: GameState, starterId: string): GameState {
  const players = s.players.map((p) => {
    if (p.eliminated) return p;
    return {
      ...p,
      hand: { flower: p.ownedFlower, fire: p.ownedFire },
      placed: [],
    };
  });
  const starterName = players.find((p) => p.id === starterId)?.name ?? "?";
  const round: Round = {
    starter: starterId,
    current: starterId,
    challenge: null,
    steppedBack: [],
    initialDone: false,
    reveal: null,
    resolved: false,
    outcomeWin: null,
    outcomeNext: null,
    burnedCard: null,
    burnedBy: null,
    log: [`A new round begins. ${starterName} leads.`],
  };
  return { ...s, players, round };
}

// ---- actions: place a card ------------------------------------------

/**
 * Place a card from `playerId`'s hand onto their own stack.
 * Validates:
 *   - it's a round in progress
 *   - it's the player's turn
 *   - no Reveal is in progress
 *   - they have that kind of card in hand
 *   - no active Challenge (you can't place once Challenges have begun;
 *     once a Challenge exists, you must Raise or Step Back).
 *
 * Returns the new state, or the original state if the action is illegal.
 */
export function place(s: GameState, playerId: string, kind: CardKind): GameState {
  if (!s.round || s.phase !== "playing") return s;
  const r = s.round;
  if (r.reveal) return s;
  if (r.current !== playerId) return s;
  if (r.challenge) return s;
  const p = getPlayer(s, playerId);
  if (p.hand[kind] <= 0) return s;

  const updatedPlayers = s.players.map((q) =>
    q.id !== playerId
      ? q
      : {
          ...q,
          hand: { ...q.hand, [kind]: q.hand[kind] - 1 },
          placed: [...q.placed, { kind }],
        }
  );

  // Advance turn around the active circle.
  const nextId = nextPlayerId({ ...s, players: updatedPlayers }, playerId);

  // Check if this completes the opening go-around.
  const everyoneOpened = activePlayers({ ...s, players: updatedPlayers })
    .every((q) => q.placed.length >= 1);
  const newLog = [...r.log, `${p.name} places a card.`];
  if (!r.initialDone && everyoneOpened) {
    newLog.push("All opening cards placed. Challenges may begin.");
  }

  return {
    ...s,
    players: updatedPlayers,
    round: {
      ...r,
      current: nextId,
      initialDone: r.initialDone || everyoneOpened,
      log: newLog,
    },
  };
}

// ---- actions: make a Challenge --------------------------------------

/**
 * Make a Challenge: claim you can reveal `n` cards without hitting Fire.
 * Validates:
 *   - round in progress, no reveal, player's turn
 *   - opening go-around is complete
 *   - n is in [1, totalOnTable]
 *
 * SPECIAL CASE: if the Challenge equals the total cards on the table,
 * nobody can Raise further. The Challenge resolves immediately into
 * a Reveal phase, skipping the betting round.
 */
export function challenge(s: GameState, playerId: string, nRaw: number): GameState {
  if (!s.round || s.phase !== "playing") return s;
  const r = s.round;
  if (r.reveal) return s;
  if (r.current !== playerId) return s;
  if (!r.initialDone) return s;

  const total = totalOnTable(s);
  if (total < 1) return s;
  const minN = (r.challenge?.n ?? 0) + 1;
  if (nRaw < minN) return s;
  const n = Math.min(nRaw, total);

  const p = getPlayer(s, playerId);
  const log = [...r.log, `${p.name} challenges ${n}.`];

  // If the Challenge sits at the cap, no Raise is possible. Resolve.
  const canAnyoneRaise = n < total && activePlayers(s).length > 1;
  if (!canAnyoneRaise) {
    log.push(`No cards left to raise — ${p.name} must reveal ${n}.`);
    return {
      ...s,
      round: {
        ...r,
        challenge: { by: playerId, n },
        steppedBack: activePlayers(s).filter((q) => q.id !== playerId).map((q) => q.id),
        current: playerId,
        reveal: { darer: playerId, target: n, flipped: [], done: false, burned: false },
        log,
      },
    };
  }

  // Otherwise this is a new (or raised) bet; the floor reopens for everyone else.
  return {
    ...s,
    round: {
      ...r,
      challenge: { by: playerId, n },
      steppedBack: [],
      current: nextPlayerId(s, playerId),
      log,
    },
  };
}

// ---- actions: Raise -------------------------------------------------

/** Raise is just challenge() with the validation that there is already one. */
export function raise(s: GameState, playerId: string, n: number): GameState {
  if (!s.round?.challenge) return s;
  return challenge(s, playerId, n);
}

// ---- actions: Step Back --------------------------------------------

/**
 * Step Back from the current Challenge. If this leaves only the
 * Challenger remaining, the round transitions into the Reveal phase.
 */
export function stepBack(s: GameState, playerId: string): GameState {
  if (!s.round || s.phase !== "playing") return s;
  const r = s.round;
  if (r.reveal) return s;
  if (!r.challenge) return s;
  if (r.current !== playerId) return s;
  if (playerId === r.challenge.by) return s; // can't step back from your own Challenge

  const stepped = r.steppedBack.includes(playerId)
    ? r.steppedBack
    : [...r.steppedBack, playerId];

  const a = activePlayers(s);
  const stillIn = a.filter((q) => !stepped.includes(q.id));
  const log = [...r.log, `${getPlayer(s, playerId).name} steps back.`];

  if (stillIn.length <= 1) {
    log.push(`${getPlayer(s, r.challenge.by).name} must reveal ${r.challenge.n}.`);
    return {
      ...s,
      round: {
        ...r,
        steppedBack: stepped,
        current: r.challenge.by,
        reveal: {
          darer: r.challenge.by,
          target: r.challenge.n,
          flipped: [],
          done: false,
          burned: false,
        },
        log,
      },
    };
  }
  return {
    ...s,
    round: {
      ...r,
      steppedBack: stepped,
      current: nextPlayerId(s, playerId, stepped),
      log,
    },
  };
}

// ---- actions: Reveal a card -----------------------------------------

/**
 * Reveal one card during the Reveal phase.
 *
 * Targeting rules (canonical Skull):
 *   - The Challenger must reveal ALL of their own placed cards before
 *     touching any opponent's. Order within own stack: LIFO (top first).
 *   - Once own stack is clear, the Challenger may freely choose which
 *     opponent to reveal from. Each tap reveals the TOP card of the
 *     chosen opponent's stack. They are NOT forced to drain one
 *     opponent before moving to another.
 *
 * Returns the original state if the move is illegal (wrong target,
 * wrong card index, reveal complete, etc.).
 */
export function revealCard(s: GameState, targetId: string, idx: number): GameState {
  if (!s.round?.reveal || s.round.reveal.done) return s;
  const r = s.round;
  const rv = r.reveal!;

  const darer = getPlayer(s, rv.darer);
  const ownLeft = darer.placed.length - rv.flipped.filter((f) => f.id === rv.darer).length;
  // Must clear own stack first.
  if (targetId !== rv.darer && ownLeft > 0) return s;

  const target = getPlayer(s, targetId);
  // Must reveal the top (LIFO) un-flipped card on the chosen stack.
  const expectedIdx = nextRevealIndex(target, rv.flipped);
  if (idx !== expectedIdx) return s;

  const card = target.placed[idx];
  if (!card) return s;

  const flipped = [...rv.flipped, { id: targetId, idx, kind: card.kind }];
  const burned = card.kind === "fire";
  const done = burned || flipped.length >= rv.target;

  return {
    ...s,
    round: {
      ...r,
      reveal: { ...rv, flipped, burned, done },
      log: [
        ...r.log,
        `${darer.name} reveals ${target.name}'s card — ${burned ? "FIRE!" : "a flower."}`,
      ],
    },
  };
}

/**
 * Helper for hosts that want to drive the Challenger's own-stack
 * auto-reveal: returns the next card the Challenger should reveal
 * from their own stack, or null if their own stack is complete.
 *
 * Hosts typically call this on a timer (e.g. 650ms between cards)
 * to give a paced auto-reveal of own cards, then hand control back
 * to the player for picking opponents.
 */
export function nextOwnRevealIndex(s: GameState): number | null {
  const r = s.round;
  if (!r?.reveal || r.reveal.done) return null;
  const darer = getPlayer(s, r.reveal.darer);
  const idx = nextRevealIndex(darer, r.reveal.flipped);
  return idx === -1 ? null : idx;
}

// ---- round resolution -----------------------------------------------

/** Pick a random card from a player's owned pool, weighted by counts. */
function discardRandomOwnedCard(
  flower: number,
  fire: number,
  rand: () => number
): CardKind | null {
  const total = flower + fire;
  if (total <= 0) return null;
  const roll = rand() * total;
  return roll < flower ? "flower" : "fire";
}

/**
 * Apply the consequences of a completed Reveal. Should be called once
 * the host has detected `round.reveal.done === true`. Idempotent:
 * if already resolved, returns state unchanged.
 *
 * Consequences:
 *   - Survived → Challenger claims 1 Ember. If they hit 2, they win.
 *   - Burned → Challenger discards 1 randomly chosen owned card.
 *             The card type is recorded in `round.burnedCard` for
 *             internal use, but UI MUST NOT display this to other
 *             players. If the Challenger runs out of cards entirely,
 *             they are eliminated.
 *   - If only one player remains active, that player wins.
 *
 * `rand` defaults to Math.random; pass a seeded RNG for tests.
 */
export function resolveRound(s: GameState, rand: () => number = Math.random): GameState {
  if (!s.round?.reveal?.done) return s;
  if (s.round.resolved) return s;
  const r = s.round;
  const rv = r.reveal!;

  const players = s.players.map((p) => ({ ...p }));
  const darer = players.find((p) => p.id === rv.darer)!;

  let outcomeWin: string | null = null;
  let burnedCard: { kind: CardKind } | null = null;
  const log = [...r.log];

  if (!rv.burned) {
    darer.points += 1;
    log.push(`${darer.name} claims an Ember! (${darer.points}/2)`);
    if (darer.points >= 2) outcomeWin = darer.id;
  } else {
    const lost = discardRandomOwnedCard(darer.ownedFlower, darer.ownedFire, rand);
    if (lost) {
      burnedCard = { kind: lost };
      if (lost === "flower") darer.ownedFlower -= 1;
      else darer.ownedFire -= 1;
    }
    // Critical: log line does NOT name the card type. Only the
    // burned player should ever know what they lost.
    log.push(
      burnedCard
        ? `${darer.name} got burned — discards a card, face down.`
        : `${darer.name} got burned.`
    );
    if (darer.ownedFlower + darer.ownedFire <= 0) {
      darer.eliminated = true;
      log.push(`${darer.name} is out of cards — reduced to ashes.`);
    }
  }

  const survivors = players.filter((p) => !p.eliminated);
  if (!outcomeWin && survivors.length === 1) outcomeWin = survivors[0].id;

  const outcomeNext = darer.eliminated ? survivors[0]?.id ?? null : darer.id;
  if (outcomeWin) log.push(`${players.find((p) => p.id === outcomeWin)!.name} wins With Fire.`);

  return {
    ...s,
    players,
    phase: outcomeWin ? "over" : s.phase,
    winner: outcomeWin ?? s.winner,
    round: {
      ...r,
      resolved: true,
      outcomeWin,
      outcomeNext,
      burnedCard,
      burnedBy: rv.darer,
      log,
    },
  };
}

/**
 * Begin the next round after a resolved one. Convenience helper:
 * pulls outcomeNext, validates it, and seeds the next round.
 */
export function nextRound(s: GameState): GameState {
  if (!s.round?.resolved || s.phase === "over") return s;
  const a = activePlayers(s);
  if (a.length < 2) return s;
  let starter = s.round.outcomeNext;
  if (!starter || !a.some((p) => p.id === starter)) starter = a[0].id;
  return beginRound(s, starter);
}
