/**
 * A Room owns one table: its lobby, its (server-authoritative) engine
 * state, and the automation that paces AI turns, the Challenger's
 * own-stack auto-reveal, round resolution, and round advancement.
 *
 * All hidden information lives only here. Clients receive redacted
 * views (see withfire-shared).
 */

import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import {
  type GameState, type Player, type AIPersona,
  newGame, beginRound, makePlayer, place, challenge, stepBack,
  revealCard, resolveRound, nextRound, nextOwnRevealIndex,
  nextRevealIndex, getPlayer, activePlayers,
  PERSONAS, chooseAction, chooseRevealTarget,
} from "withfire-engine";
import {
  type ServerMsg, type GameAction, type RoomView,
  redactGame, MAX_PLAYERS, MIN_PLAYERS,
} from "withfire-shared";

// Pacing (ms). Tuned so humans can follow what's happening.
const AI_TURN_DELAY = 1100;
const OWN_REVEAL_DELAY = 700;
const AI_PICK_DELAY = 1200;
const RESOLVE_DELAY = 1600;
const NEXT_ROUND_DELAY = 5000;
const AUTOPILOT_DELAY = 30_000; // disconnected human's turn → AI takes over

interface Seat {
  id: string;
  name: string;
  isAI: boolean;
  persona?: AIPersona;
  token: string; // rejoin secret (unused for bots)
  ws: WebSocket | null;
}

export class Room {
  readonly code: string;
  hostId: string;
  seats: Seat[] = [];
  game: GameState | null = null;
  lastActivity = Date.now();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(code: string) {
    this.code = code;
    this.hostId = "";
  }

  get started(): boolean {
    return this.game !== null;
  }

  get isEmpty(): boolean {
    return !this.seats.some((s) => !s.isAI && s.ws);
  }

  touch() {
    this.lastActivity = Date.now();
  }

  destroy() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const s of this.seats) s.ws?.close();
  }

  // ---- lobby ---------------------------------------------------------

  addHuman(name: string, ws: WebSocket): Seat | string {
    if (this.started) return "Game already in progress — ask for a rematch lobby.";
    if (this.seats.length >= MAX_PLAYERS) return "Room is full.";
    const seat: Seat = {
      id: randomUUID(),
      name: cleanName(name, this.seats),
      isAI: false,
      token: randomUUID(),
      ws,
    };
    this.seats.push(seat);
    if (!this.hostId) this.hostId = seat.id;
    this.touch();
    return seat;
  }

  addBot(byId: string): string | null {
    if (byId !== this.hostId) return "Only the host can add bots.";
    if (this.started) return "Game already in progress.";
    if (this.seats.length >= MAX_PLAYERS) return "Room is full.";
    const used = new Set(this.seats.map((s) => s.persona?.name));
    const persona = PERSONAS.find((p) => !used.has(p.name)) ?? PERSONAS[0];
    this.seats.push({
      id: randomUUID(),
      name: persona.name,
      isAI: true,
      persona,
      token: "",
      ws: null,
    });
    this.touch();
    return null;
  }

  removePlayer(byId: string, targetId: string): string | null {
    if (this.started) return "Cannot remove players mid-game.";
    if (byId !== this.hostId && byId !== targetId) return "Only the host can remove players.";
    const seat = this.seats.find((s) => s.id === targetId);
    if (!seat) return null;
    seat.ws?.close();
    this.seats = this.seats.filter((s) => s.id !== targetId);
    if (this.hostId === targetId) {
      this.hostId = this.seats.find((s) => !s.isAI)?.id ?? "";
    }
    this.touch();
    return null;
  }

  rejoin(token: string, ws: WebSocket): Seat | string {
    const seat = this.seats.find((s) => !s.isAI && s.token === token);
    if (!seat) return "Seat not found — the room may have moved on.";
    seat.ws?.close();
    seat.ws = ws;
    this.touch();
    return seat;
  }

  disconnect(ws: WebSocket) {
    const seat = this.seats.find((s) => s.ws === ws);
    if (!seat) return;
    seat.ws = null;
    if (!this.started) {
      // In the lobby a dropped player just leaves; they can re-join by code.
      this.seats = this.seats.filter((s) => s.id !== seat.id);
      if (this.hostId === seat.id) {
        this.hostId = this.seats.find((s) => !s.isAI)?.id ?? "";
      }
    }
    this.broadcast();
    this.pump();
  }

  // ---- game lifecycle --------------------------------------------------

  start(byId: string): string | null {
    if (byId !== this.hostId) return "Only the host can start the game.";
    if (this.started) return "Game already started.";
    if (this.seats.length < MIN_PLAYERS) return `Need at least ${MIN_PLAYERS} players.`;
    const players: Player[] = this.seats.map((s, i) =>
      makePlayer({ id: s.id, name: s.name, seat: i, isAI: s.isAI, persona: s.persona })
    );
    let g = newGame(players);
    const starter = players[Math.floor(Math.random() * players.length)].id;
    g = beginRound(g, starter);
    this.game = g;
    this.touch();
    this.broadcast();
    this.pump();
    return null;
  }

  backToLobby(byId: string): string | null {
    if (byId !== this.hostId) return "Only the host can end the game.";
    if (!this.started) return null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.game = null;
    // Drop seats of players who disconnected mid-game.
    this.seats = this.seats.filter((s) => s.isAI || s.ws);
    if (!this.seats.some((s) => s.id === this.hostId)) {
      this.hostId = this.seats.find((s) => !s.isAI)?.id ?? "";
    }
    this.touch();
    this.broadcast();
    return null;
  }

  // ---- player actions --------------------------------------------------

  action(playerId: string, a: GameAction): string | null {
    const g = this.game;
    if (!g) return "No game in progress.";
    const before = g;
    let after = before;

    if (a.k === "place") after = place(before, playerId, a.kind);
    else if (a.k === "challenge") after = challenge(before, playerId, a.n);
    else if (a.k === "stepBack") after = stepBack(before, playerId);
    else if (a.k === "reveal") {
      const rv = before.round?.reveal;
      if (!rv || rv.done || rv.darer !== playerId) return "Not your reveal.";
      const target = getPlayer(before, a.targetId);
      const idx = nextRevealIndex(target, rv.flipped);
      if (idx < 0) return "Nothing left to reveal there.";
      after = revealCard(before, a.targetId, idx);
    }

    if (after === before) return "That move isn't allowed right now.";
    this.game = after;
    this.touch();
    this.broadcast();
    this.pump();
    return null;
  }

  // ---- automation -------------------------------------------------------
  //
  // pump() inspects the current state and schedules exactly one pending
  // piece of automatic work: an AI turn, an own-stack auto-flip, an AI
  // reveal pick, round resolution, the next round, or an autopilot move
  // for a long-disconnected human. Rescheduled after every state change.

  pump() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const g = this.game;
    if (!g || g.phase === "over") return;
    const r = g.round;
    if (!r) return;

    const schedule = (ms: number, fn: () => void) => {
      this.timer = setTimeout(() => {
        this.timer = null;
        try {
          fn();
        } catch (err) {
          console.error(`[room ${this.code}] automation error:`, err);
        }
      }, ms);
    };

    // Resolved round → begin the next one after a reading pause.
    if (r.resolved) {
      schedule(NEXT_ROUND_DELAY, () => {
        if (!this.game?.round?.resolved) return;
        this.game = nextRound(this.game);
        this.broadcast();
        this.pump();
      });
      return;
    }

    // Reveal finished → apply consequences after a beat.
    if (r.reveal?.done) {
      schedule(RESOLVE_DELAY, () => {
        if (!this.game?.round?.reveal?.done || this.game.round.resolved) return;
        this.game = resolveRound(this.game);
        this.broadcast();
        this.pump();
      });
      return;
    }

    // Reveal in progress.
    if (r.reveal) {
      const rv = r.reveal;
      const ownIdx = nextOwnRevealIndex(g);
      if (ownIdx !== null) {
        // Own cards always auto-flip, human or AI — the rules demand it.
        schedule(OWN_REVEAL_DELAY, () => {
          const cur = this.game;
          const idx = cur ? nextOwnRevealIndex(cur) : null;
          if (cur && idx !== null) {
            this.game = revealCard(cur, cur.round!.reveal!.darer, idx);
            this.broadcast();
          }
          this.pump();
        });
        return;
      }
      const darerSeat = this.seats.find((s) => s.id === rv.darer);
      const auto = darerSeat?.isAI || !darerSeat?.ws;
      if (auto) {
        schedule(darerSeat?.isAI ? AI_PICK_DELAY : AUTOPILOT_DELAY, () => {
          const cur = this.game;
          const t = cur ? chooseRevealTarget(cur) : null;
          if (cur && t) {
            this.game = revealCard(cur, t.id, t.idx);
            this.broadcast();
          }
          this.pump();
        });
      }
      return; // connected human darer: wait for their reveal action
    }

    // Betting / placing: act for AI seats and abandoned humans.
    const seat = this.seats.find((s) => s.id === r.current);
    if (!seat) return;
    const auto = seat.isAI || !seat.ws;
    if (!auto) return;
    schedule(seat.isAI ? AI_TURN_DELAY : AUTOPILOT_DELAY, () => {
      const cur = this.game;
      const rr = cur?.round;
      if (!cur || !rr || rr.reveal || rr.current !== seat.id) {
        this.pump();
        return;
      }
      const move = chooseAction(cur, seat.id);
      let next = cur;
      if (move.type === "place") next = place(cur, seat.id, move.kind);
      else if (move.type === "challenge") next = challenge(cur, seat.id, move.n);
      else if (move.type === "stepBack") next = stepBack(cur, seat.id);
      // Defensive: if the AI somehow chose an illegal move, fall back so
      // the game can never deadlock on a bot's turn.
      if (next === cur) {
        const me = getPlayer(cur, seat.id);
        if (!rr.challenge && (me.hand.flower > 0 || me.hand.fire > 0)) {
          next = place(cur, seat.id, me.hand.flower > 0 ? "flower" : "fire");
        }
        if (next === cur && !rr.challenge && rr.initialDone) {
          next = challenge(cur, seat.id, (rr.challenge ?? { n: 0 }).n + 1);
        }
        if (next === cur && rr.challenge) next = stepBack(cur, seat.id);
        if (next === cur && rr.challenge) next = challenge(cur, seat.id, rr.challenge.n + 1);
      }
      this.game = next;
      this.broadcast();
      this.pump();
    });
  }

  // ---- views ------------------------------------------------------------

  roomView(): RoomView {
    return {
      code: this.code,
      hostId: this.hostId,
      started: this.started,
      maxPlayers: MAX_PLAYERS,
      players: this.seats.map((s) => ({
        id: s.id,
        name: s.name,
        isAI: s.isAI,
        personaName: s.persona?.name,
        personaTrait: s.persona?.trait,
        connected: s.isAI || !!s.ws,
      })),
    };
  }

  send(seat: Seat, msg: ServerMsg) {
    if (seat.ws && seat.ws.readyState === seat.ws.OPEN) {
      seat.ws.send(JSON.stringify(msg));
    }
  }

  broadcast() {
    const room = this.roomView();
    for (const seat of this.seats) {
      if (seat.isAI) continue;
      this.send(seat, { t: "room", room });
      if (this.game) {
        const connected = (id: string) => {
          const s = this.seats.find((x) => x.id === id);
          return !!s && (s.isAI || !!s.ws);
        };
        this.send(seat, { t: "state", view: redactGame(this.game, seat.id, connected) });
      }
    }
  }
}

function cleanName(raw: string, existing: Seat[]): string {
  let name = raw.trim().slice(0, 18) || "Player";
  const taken = new Set(existing.map((s) => s.name.toLowerCase()));
  let candidate = name;
  let n = 2;
  while (taken.has(candidate.toLowerCase())) candidate = `${name} ${n++}`;
  return candidate;
}
