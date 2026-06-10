/**
 * With Fire — shared wire protocol and redacted views.
 *
 * The server is authoritative: it holds the true GameState and sends
 * each player a REDACTED view. Redaction enforces the engine's privacy
 * invariants at the protocol layer, so a malicious client can never
 * learn another player's face-down cards, hand composition, owned-pool
 * composition, or what card a burned player discarded.
 *
 * The solo (vs-AI) mode in the client uses the same redaction so the
 * UI renders identical data either way.
 */

import type { CardKind, GameState, Challenge } from "withfire-engine";

// ---- redacted views --------------------------------------------------

/** One face-down slot on the table. `kind` is present only if the card
 *  has been revealed this round, or if it belongs to the viewer. */
export interface CardSlot {
  revealed: boolean;
  kind: CardKind | null;
}

export interface PlayerView {
  id: string;
  name: string;
  seat: number;
  isAI: boolean;
  personaName?: string;
  personaTrait?: string;
  connected: boolean;
  /** Total owned cards (flowers + fires). Composition is private. */
  ownedTotal: number;
  /** Own composition — present only on the viewer's own entry. */
  owned?: { flower: number; fire: number };
  /** Own remaining hand — present only on the viewer's own entry. */
  hand?: { flower: number; fire: number };
  /** Cards left in hand this round (public count). */
  handCount: number;
  placed: CardSlot[];
  points: number;
  eliminated: boolean;
}

export interface RevealView {
  darer: string;
  target: number;
  flippedCount: number;
  done: boolean;
  burned: boolean;
}

export interface RoundView {
  starter: string;
  current: string;
  challenge: Challenge | null;
  steppedBack: string[];
  initialDone: boolean;
  reveal: RevealView | null;
  resolved: boolean;
  outcomeWin: string | null;
  /** Present only on the burned viewer's own view. */
  yourBurnedCard?: CardKind;
  burnedBy: string | null;
  log: string[];
}

export interface GameView {
  you: string;
  players: PlayerView[];
  round: RoundView | null;
  phase: "playing" | "over";
  winner: string | null;
}

/** Produce the view of `state` that `viewerId` is allowed to see. */
export function redactGame(state: GameState, viewerId: string, connected?: (id: string) => boolean): GameView {
  const r = state.round;
  const flippedFor = (pid: string, idx: number): CardKind | null => {
    const f = r?.reveal?.flipped.find((x) => x.id === pid && x.idx === idx);
    return f ? f.kind : null;
  };
  return {
    you: viewerId,
    players: state.players.map((p) => {
      const self = p.id === viewerId;
      return {
        id: p.id,
        name: p.name,
        seat: p.seat,
        isAI: p.isAI,
        personaName: p.persona?.name,
        personaTrait: p.persona?.trait,
        connected: p.isAI ? true : connected ? connected(p.id) : true,
        ownedTotal: p.ownedFlower + p.ownedFire,
        owned: self ? { flower: p.ownedFlower, fire: p.ownedFire } : undefined,
        hand: self ? { ...p.hand } : undefined,
        handCount: p.hand.flower + p.hand.fire,
        placed: p.placed.map((c, idx) => {
          const revealedKind = flippedFor(p.id, idx);
          if (revealedKind) return { revealed: true, kind: revealedKind };
          return { revealed: false, kind: self ? c.kind : null };
        }),
        points: p.points,
        eliminated: p.eliminated,
      };
    }),
    round: r
      ? {
          starter: r.starter,
          current: r.current,
          challenge: r.challenge,
          steppedBack: r.steppedBack,
          initialDone: r.initialDone,
          reveal: r.reveal
            ? {
                darer: r.reveal.darer,
                target: r.reveal.target,
                flippedCount: r.reveal.flipped.length,
                done: r.reveal.done,
                burned: r.reveal.burned,
              }
            : null,
          resolved: r.resolved,
          outcomeWin: r.outcomeWin,
          yourBurnedCard:
            r.burnedBy === viewerId && r.burnedCard ? r.burnedCard.kind : undefined,
          burnedBy: r.burnedBy,
          log: r.log,
        }
      : null,
    phase: state.phase,
    winner: state.winner,
  };
}

// ---- lobby -----------------------------------------------------------

export interface LobbyPlayer {
  id: string;
  name: string;
  isAI: boolean;
  personaName?: string;
  personaTrait?: string;
  connected: boolean;
}

export interface RoomView {
  code: string;
  hostId: string;
  started: boolean;
  players: LobbyPlayer[];
  maxPlayers: number;
}

// ---- actions ---------------------------------------------------------

export type GameAction =
  | { k: "place"; kind: CardKind }
  | { k: "challenge"; n: number }
  | { k: "stepBack" }
  /** Reveal the top un-flipped card of `targetId`'s stack. The server
   *  computes the exact index; clients never pick indices directly. */
  | { k: "reveal"; targetId: string };

// ---- client → server -------------------------------------------------

export type ClientMsg =
  | { t: "create"; name: string }
  | { t: "join"; code: string; name: string }
  | { t: "rejoin"; code: string; token: string }
  | { t: "leave" }
  | { t: "addBot" }
  | { t: "removePlayer"; id: string }
  | { t: "start" }
  | { t: "action"; a: GameAction }
  | { t: "backToLobby" }
  | { t: "ping" };

// ---- server → client -------------------------------------------------

export type ServerMsg =
  | { t: "joined"; code: string; you: string; token: string }
  | { t: "room"; room: RoomView }
  | { t: "state"; view: GameView }
  | { t: "left" }
  | { t: "error"; msg: string }
  | { t: "pong" };

export const ROOM_CODE_LENGTH = 5;
export const MAX_PLAYERS = 5;
export const MIN_PLAYERS = 2;

/** Characters used in room codes — no 0/O/1/I ambiguity. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
