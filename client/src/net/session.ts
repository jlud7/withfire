/**
 * Session layer. The UI talks to a GameSession and never cares whether
 * the table is online (WebSocket to the server) or local (solo vs AI,
 * engine running right here in the browser). Both produce the same
 * redacted GameView, so every screen renders identically.
 */

import {
  type GameState, type Player,
  newGame, beginRound, makePlayer, place, challenge, stepBack,
  revealCard, resolveRound, nextRound, nextOwnRevealIndex,
  nextRevealIndex, getPlayer,
  PERSONAS, chooseAction, chooseRevealTarget,
} from "withfire-engine";
import {
  type ClientMsg, type ServerMsg, type GameAction, type GameView, type RoomView,
  redactGame,
} from "withfire-shared";

export interface SessionState {
  mode: "online" | "solo";
  status: "connecting" | "lobby" | "game" | "closed";
  code: string | null;
  you: string | null;
  room: RoomView | null;
  view: GameView | null;
  /** Transient error message; bump `errorAt` to retrigger the toast. */
  error: string | null;
  errorAt: number;
  /** True while the socket is down and we're trying to get back in. */
  reconnecting: boolean;
}

export interface GameSession {
  readonly state: SessionState;
  subscribe(fn: () => void): () => void;
  act(a: GameAction): void;
  addBot(): void;
  removePlayer(id: string): void;
  start(): void;
  backToLobby(): void;
  leave(): void;
}

/**
 * Where the game server lives. Normally the same host that served the
 * page (the Node server serves both). A static deployment (e.g. GitHub
 * Pages) has no server — set VITE_WS_URL at build time to point at one
 * hosted elsewhere, e.g. wss://withfire.onrender.com/ws.
 */
export function gameServerUrl(): string {
  const override = import.meta.env.VITE_WS_URL as string | undefined;
  if (override) return override;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
}

/** True when online play can work from this deployment. */
export function onlineAvailable(): boolean {
  if (import.meta.env.VITE_WS_URL) return true;
  // GitHub Pages (and similar static hosts) can't run the WebSocket server.
  return !location.hostname.endsWith(".github.io");
}

const REJOIN_KEY = "withfire:rejoin";

export function saveRejoin(code: string, token: string, name: string) {
  sessionStorage.setItem(REJOIN_KEY, JSON.stringify({ code, token, name }));
}
export function loadRejoin(): { code: string; token: string; name: string } | null {
  try {
    const raw = sessionStorage.getItem(REJOIN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function clearRejoin() {
  sessionStorage.removeItem(REJOIN_KEY);
}

abstract class BaseSession implements GameSession {
  state: SessionState;
  private listeners = new Set<() => void>();

  constructor(mode: "online" | "solo") {
    this.state = {
      mode,
      status: "connecting",
      code: null,
      you: null,
      room: null,
      view: null,
      error: null,
      errorAt: 0,
      reconnecting: false,
    };
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  protected update(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  protected showError(msg: string) {
    this.update({ error: msg, errorAt: Date.now() });
  }

  abstract act(a: GameAction): void;
  abstract addBot(): void;
  abstract removePlayer(id: string): void;
  abstract start(): void;
  abstract backToLobby(): void;
  abstract leave(): void;
}

// ---- online ------------------------------------------------------------

type Intent =
  | { t: "create"; name: string }
  | { t: "join"; code: string; name: string }
  | { t: "rejoin"; code: string; token: string; name: string };

export class OnlineSession extends BaseSession {
  private ws: WebSocket | null = null;
  private intent: Intent;
  private closedByUs = false;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(intent: Intent) {
    super("online");
    this.intent = intent;
    this.connect();
  }

  private wsUrl(): string {
    return gameServerUrl();
  }

  private connect() {
    const ws = new WebSocket(this.wsUrl());
    this.ws = ws;

    ws.onopen = () => {
      this.retries = 0;
      this.send(
        this.intent.t === "rejoin"
          ? { t: "rejoin", code: this.intent.code, token: this.intent.token }
          : this.intent.t === "create"
            ? { t: "create", name: this.intent.name }
            : { t: "join", code: this.intent.code, name: this.intent.name }
      );
    };

    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.handle(msg);
    };

    ws.onclose = () => {
      if (this.closedByUs) return;
      this.ws = null;
      // If we ever got a seat, try to win it back; otherwise give up.
      if (this.state.you && this.state.code) {
        this.scheduleReconnect();
      } else {
        this.showError("Connection lost.");
        this.update({ status: "closed" });
      }
    };
  }

  private scheduleReconnect() {
    if (this.retries >= 6) {
      this.update({ status: "closed", reconnecting: false });
      this.showError("Couldn't reconnect to the room.");
      return;
    }
    const token = loadRejoin();
    if (!this.state.code || !token) {
      this.update({ status: "closed", reconnecting: false });
      return;
    }
    this.intent = { t: "rejoin", code: token.code, token: token.token, name: token.name };
    this.update({ reconnecting: true });
    const delay = Math.min(8000, 500 * 2 ** this.retries++);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  private handle(msg: ServerMsg) {
    switch (msg.t) {
      case "joined":
        saveRejoin(msg.code, msg.token, this.intent.name);
        this.update({ code: msg.code, you: msg.you, reconnecting: false });
        break;
      case "room": {
        const status = msg.room.started ? "game" : "lobby";
        this.update({
          room: msg.room,
          status,
          view: msg.room.started ? this.state.view : null,
        });
        break;
      }
      case "state":
        this.update({ view: msg.view, status: "game" });
        break;
      case "error":
        // A failed rejoin means the seat is gone — stop trying.
        if (this.intent.t === "rejoin") {
          clearRejoin();
          this.closedByUs = true;
          this.ws?.close();
          this.update({ status: "closed", reconnecting: false });
        }
        this.showError(msg.msg);
        break;
      case "left":
        this.update({ status: "closed" });
        break;
      case "pong":
        break;
    }
  }

  private send(msg: ClientMsg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  act(a: GameAction) {
    this.send({ t: "action", a });
  }
  addBot() {
    this.send({ t: "addBot" });
  }
  removePlayer(id: string) {
    this.send({ t: "removePlayer", id });
  }
  start() {
    this.send({ t: "start" });
  }
  backToLobby() {
    this.send({ t: "backToLobby" });
  }
  leave() {
    this.closedByUs = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    clearRejoin();
    this.send({ t: "leave" });
    this.ws?.close();
    this.update({ status: "closed" });
  }
}

// ---- solo (local vs AI) --------------------------------------------------
//
// Mirrors the server's pacing so solo feels identical to online play.

const AI_TURN_DELAY = 1100;
const OWN_REVEAL_DELAY = 700;
const AI_PICK_DELAY = 1200;
const RESOLVE_DELAY = 1600;
const NEXT_ROUND_DELAY = 5000;

export class SoloSession extends BaseSession {
  private game: GameState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly youId = "you";
  private botCount: number;
  private name: string;

  constructor(name: string, botCount: number) {
    super("solo");
    this.name = name || "You";
    this.botCount = Math.max(1, Math.min(4, botCount));
    this.game = this.freshGame();
    this.update({ status: "game", you: this.youId, view: this.viewNow() });
    this.pump();
  }

  private freshGame(): GameState {
    const personas = [...PERSONAS].sort(() => Math.random() - 0.5).slice(0, this.botCount);
    const players: Player[] = [
      makePlayer({ id: this.youId, name: this.name, seat: 0, isAI: false }),
      ...personas.map((p, i) =>
        makePlayer({ id: `bot-${i}`, name: p.name, seat: i + 1, isAI: true, persona: p })
      ),
    ];
    let g = newGame(players);
    const starter = players[Math.floor(Math.random() * players.length)].id;
    return beginRound(g, starter);
  }

  private viewNow(): GameView {
    return redactGame(this.game, this.youId);
  }

  private commit(next: GameState) {
    if (next === this.game) return false;
    this.game = next;
    this.update({ view: this.viewNow() });
    return true;
  }

  act(a: GameAction) {
    const g = this.game;
    let next = g;
    if (a.k === "place") next = place(g, this.youId, a.kind);
    else if (a.k === "challenge") next = challenge(g, this.youId, a.n);
    else if (a.k === "stepBack") next = stepBack(g, this.youId);
    else if (a.k === "reveal") {
      const rv = g.round?.reveal;
      if (rv && !rv.done && rv.darer === this.youId) {
        const target = getPlayer(g, a.targetId);
        const idx = nextRevealIndex(target, rv.flipped);
        if (idx >= 0) next = revealCard(g, a.targetId, idx);
      }
    }
    if (!this.commit(next)) {
      this.showError("That move isn't allowed right now.");
      return;
    }
    this.pump();
  }

  private pump() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const g = this.game;
    if (g.phase === "over") return;
    const r = g.round;
    if (!r) return;

    const schedule = (ms: number, fn: () => void) => {
      this.timer = setTimeout(() => {
        this.timer = null;
        fn();
      }, ms);
    };

    if (r.resolved) {
      schedule(NEXT_ROUND_DELAY, () => {
        this.commit(nextRound(this.game));
        this.pump();
      });
      return;
    }
    if (r.reveal?.done) {
      schedule(RESOLVE_DELAY, () => {
        this.commit(resolveRound(this.game));
        this.pump();
      });
      return;
    }
    if (r.reveal) {
      const ownIdx = nextOwnRevealIndex(g);
      if (ownIdx !== null) {
        schedule(OWN_REVEAL_DELAY, () => {
          const idx = nextOwnRevealIndex(this.game);
          if (idx !== null) {
            this.commit(revealCard(this.game, this.game.round!.reveal!.darer, idx));
          }
          this.pump();
        });
        return;
      }
      if (r.reveal.darer !== this.youId) {
        schedule(AI_PICK_DELAY, () => {
          const t = chooseRevealTarget(this.game);
          if (t) this.commit(revealCard(this.game, t.id, t.idx));
          this.pump();
        });
      }
      return;
    }
    if (r.current === this.youId) return;
    schedule(AI_TURN_DELAY, () => {
      const cur = this.game;
      const rr = cur.round;
      if (!rr || rr.reveal || rr.current === this.youId) {
        this.pump();
        return;
      }
      const id = rr.current;
      const move = chooseAction(cur, id);
      let next = cur;
      if (move.type === "place") next = place(cur, id, move.kind);
      else if (move.type === "challenge") next = challenge(cur, id, move.n);
      else if (move.type === "stepBack") next = stepBack(cur, id);
      if (next === cur) {
        const me = getPlayer(cur, id);
        if (!rr.challenge && (me.hand.flower > 0 || me.hand.fire > 0)) {
          next = place(cur, id, me.hand.flower > 0 ? "flower" : "fire");
        }
        if (next === cur && rr.challenge) next = stepBack(cur, id);
        if (next === cur) next = challenge(cur, id, (rr.challenge?.n ?? 0) + 1);
      }
      this.commit(next);
      this.pump();
    });
  }

  addBot() {}
  removePlayer() {}
  start() {}

  /** In solo, "back to lobby" deals a fresh game with new opponents. */
  backToLobby() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.game = this.freshGame();
    this.update({ view: this.viewNow(), status: "game" });
    this.pump();
  }

  leave() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.update({ status: "closed" });
  }
}
