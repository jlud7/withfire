import { useEffect, useMemo, useRef, useState } from "react";
import type { GameAction, GameView, PlayerView } from "withfire-shared";
import { CardFace } from "../components/Card";

export interface GameProps {
  view: GameView;
  mode: "online" | "solo";
  code: string | null;
  isHost: boolean;
  onAct: (a: GameAction) => void;
  onBackToLobby: () => void;
  onLeave: () => void;
  onShowRules: () => void;
}

function nth(n: number) {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
}

function flamePips(points: number) {
  return (
    <span className="pips" title={`${points} / 2 Embers — two win the game`}>
      {[0, 1].map((i) => (
        <span key={i} className={`pip ${i < points ? "pip-lit" : ""}`}>🔥</span>
      ))}
    </span>
  );
}

/** A player's table presence: name, status, marks, and their stack. */
function Pod({
  p,
  view,
  isYou,
  canPick,
  onPick,
  order,
}: {
  p: PlayerView;
  view: GameView;
  isYou: boolean;
  canPick: boolean;
  onPick: () => void;
  /** 1-based position in this round's turn order (1 = leads the round). */
  order?: number;
}) {
  const r = view.round;
  const isTurn = r ? r.current === p.id && !r.reveal && !r.resolved : false;
  const isChallenger = r?.challenge?.by === p.id;
  const stepped = r?.steppedBack.includes(p.id) ?? false;
  const isDarer = r?.reveal?.darer === p.id;
  // Hold/hover your own stack to lift the cards and peek at their faces.
  const [peek, setPeek] = useState(false);
  const hasHidden = p.placed.some((s) => !s.revealed);
  // The top un-revealed card (LIFO) — the only one that can flip next.
  let topIdx = -1;
  for (let i = p.placed.length - 1; i >= 0; i--) {
    if (!p.placed[i].revealed) {
      topIdx = i;
      break;
    }
  }

  return (
    <div
      className={[
        "pod",
        isYou ? "pod-you" : "",
        isTurn ? "pod-turn" : "",
        isDarer ? "pod-darer" : "",
        p.eliminated ? "pod-out" : "",
        stepped && r?.challenge && !r.reveal ? "pod-stepped" : "",
      ].join(" ")}
    >
      <div className="pod-head">
        <span className="pod-name">
          {order !== undefined && !p.eliminated && (
            <span
              className="seat-token"
              title={order === 1 ? "Leads this round" : `Goes ${nth(order)} this round`}
            >
              {order}
            </span>
          )}
          {p.name}
          {isYou && <em> (you)</em>}
        </span>
        {flamePips(p.points)}
      </div>
      <div className="pod-sub">
        {p.eliminated ? (
          <span className="chip chip-out">ashes</span>
        ) : (
          <>
            <span className="pod-meta" title="Cards still owned">
              <span className="mini-card" aria-hidden /> {p.ownedTotal}
            </span>
            {p.isAI && <span className="chip chip-bot">{p.personaTrait ?? "AI"}</span>}
            {!p.connected && <span className="chip">offline</span>}
            {isTurn && (
              <span className="chip chip-turn">
                {isYou ? "your turn" : p.isAI ? "thinking" : "deciding"}
              </span>
            )}
            {isChallenger && !r?.reveal && <span className="chip chip-dare">dares {r?.challenge?.n}</span>}
            {isDarer && <span className="chip chip-dare">revealing</span>}
            {stepped && r?.challenge && !r?.reveal && <span className="chip">stepped back</span>}
          </>
        )}
      </div>
      <div
        className={[
          "stack",
          canPick ? "stack-pickable" : "",
          isYou && peek ? "stack-peek" : "",
        ].join(" ")}
        onPointerEnter={isYou ? (e) => e.pointerType === "mouse" && setPeek(true) : undefined}
        onPointerDown={isYou ? () => setPeek(true) : undefined}
        onPointerUp={isYou ? () => setPeek(false) : undefined}
        onPointerLeave={isYou ? () => setPeek(false) : undefined}
        onPointerCancel={isYou ? () => setPeek(false) : undefined}
      >
        {p.placed.length === 0 && <div className="stack-empty">—</div>}
        {p.placed.map((slot, idx) => {
          const pickable = canPick && idx === topIdx;
          return (
            <div key={idx} className="stack-slot">
              <CardFace
                kind={slot.kind ?? "flower"}
                flipped={slot.revealed || (isYou && peek && !!slot.kind)}
                badge={isYou && !slot.revealed && slot.kind ? slot.kind : undefined}
                size={isYou ? "md" : "sm"}
                pulse={pickable}
                onClick={pickable ? onPick : undefined}
                title={
                  isYou && !slot.revealed && slot.kind
                    ? `You placed: ${slot.kind} (only you can see this)`
                    : undefined
                }
              />
              {isYou && idx === topIdx && p.placed.length > 1 && (
                <span className="stack-top-tag">top</span>
              )}
            </div>
          );
        })}
      </div>
      {isYou && hasHidden && (
        <div className="stack-hint">
          {peek ? "🤫 only you can see these" : "hold your stack to peek · top flips first"}
        </div>
      )}
    </div>
  );
}

export function Game({ view, mode, code, isHost, onAct, onBackToLobby, onLeave, onShowRules }: GameProps) {
  const r = view.round;
  const me = view.players.find((p) => p.id === view.you)!;
  const byId = useMemo(() => new Map(view.players.map((p) => [p.id, p])), [view.players]);
  const nameOf = (id: string | null | undefined) => (id ? byId.get(id)?.name ?? "?" : "?");

  const seated = useMemo(() => {
    const sorted = [...view.players].sort((a, b) => a.seat - b.seat);
    const myIdx = sorted.findIndex((p) => p.id === view.you);
    // Rotate so opponents read left→right in turn order after you.
    return [...sorted.slice(myIdx + 1), ...sorted.slice(0, myIdx)];
  }, [view.players, view.you]);

  // This round's turn order: 1 = the round's leader, counting around the
  // table through the still-active players.
  const orderOf = useMemo(() => {
    const m = new Map<string, number>();
    if (!r) return m;
    const active = [...view.players]
      .sort((a, b) => a.seat - b.seat)
      .filter((p) => !p.eliminated);
    const si = active.findIndex((p) => p.id === r.starter);
    if (si < 0) return m;
    active.forEach((p, i) => m.set(p.id, ((i - si + active.length) % active.length) + 1));
    return m;
  }, [view.players, r?.starter]);

  const totalOnTable = view.players.reduce((s, p) => s + p.placed.length, 0);
  const ch = r?.challenge ?? null;
  const rv = r?.reveal ?? null;
  const myTurn = !!r && r.current === view.you && !rv && !r.resolved && view.phase === "playing";
  const canPlace = myTurn && !ch && !me.eliminated;
  const minN = ch ? ch.n + 1 : 1;
  const maxN = totalOnTable;
  const canChallenge = myTurn && (r?.initialDone ?? false) && maxN >= minN;
  const canStepBack = myTurn && !!ch && ch.by !== view.you;

  const [n, setN] = useState(minN);
  useEffect(() => {
    setN((v) => Math.max(minN, Math.min(maxN || minN, v)));
  }, [minN, maxN]);

  const [showLog, setShowLog] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [r?.log.length, showLog]);

  // Shake the stage when somebody hits Fire.
  const [shake, setShake] = useState(false);
  const prevBurn = useRef(false);
  useEffect(() => {
    const burned = !!rv?.burned;
    if (burned && !prevBurn.current) {
      setShake(true);
      const t = setTimeout(() => setShake(false), 700);
      return () => clearTimeout(t);
    }
    prevBurn.current = burned;
  }, [rv?.burned]);

  // Reveal picking: I'm the darer, my own stack is clear, reveal not done.
  const myOwnLeft = rv && rv.darer === view.you ? me.placed.filter((s) => !s.revealed).length : 0;
  const iPick = !!rv && rv.darer === view.you && !rv.done && myOwnLeft === 0;

  const lastLog = r?.log[r.log.length - 1] ?? "";

  // ---- stage banner ----------------------------------------------------
  let stage: JSX.Element;
  if (view.phase === "over") {
    stage = <div className="stage-title">🔥 {nameOf(view.winner)} wins With Fire</div>;
  } else if (r?.resolved) {
    const burned = r.burnedBy;
    stage = (
      <div className="stage-col">
        <div className="stage-title">
          {burned
            ? `${nameOf(burned)} got burned`
            : `${nameOf(rv?.darer)} claims an Ember! 🔥`}
        </div>
        {r.yourBurnedCard && (
          <div className="stage-note stage-private">
            You lost a {r.yourBurnedCard === "fire" ? "Fire 🔥" : "Flower 🌸"} — only you know.
          </div>
        )}
        <div className="stage-note">Next round is being dealt…</div>
      </div>
    );
  } else if (rv) {
    stage = (
      <div className="stage-col">
        <div className="stage-title">
          {rv.done
            ? rv.burned
              ? "🔥 FIRE!"
              : "🌸 Safe — dare complete!"
            : `${nameOf(rv.darer)} reveals…`}
        </div>
        <div className="reveal-pips" title={`${rv.flippedCount} of ${rv.target} flipped`}>
          {Array.from({ length: rv.target }).map((_, i) => (
            <span key={i} className={`rpip ${i < rv.flippedCount ? "rpip-lit" : ""}`}>
              {rv.done && rv.burned && i === rv.flippedCount - 1 ? "🔥" : "🌸"}
            </span>
          ))}
        </div>
        {!rv.done && (
          <div className="stage-note">
            {rv.darer === view.you
              ? myOwnLeft > 0
                ? "Your own cards flip first…"
                : "Pick the top card of any opponent's stack."
              : `${nameOf(rv.darer)} is flipping cards…`}
          </div>
        )}
      </div>
    );
  } else if (ch) {
    stage = (
      <div className="stage-col">
        <div className="stage-title">
          {nameOf(ch.by)} dares <span className="dare-n">{ch.n}</span>
        </div>
        <div className="stage-note">
          {myTurn ? "Raise the dare — or step back." : `Waiting on ${nameOf(r?.current)}…`}
        </div>
      </div>
    );
  } else {
    stage = (
      <div className="stage-col">
        <div className="stage-title stage-quiet">
          {r?.initialDone ? "Cards are down" : "Opening round"}
        </div>
        <div className="stage-note">
          {myTurn
            ? r?.initialDone
              ? "Place another card, or open a dare."
              : "Place your first card, face down."
            : `Waiting on ${nameOf(r?.current)}…`}
        </div>
        {totalOnTable > 0 && (
          <div className="stage-count">
            {totalOnTable} {totalOnTable === 1 ? "card" : "cards"} on the table
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="game">
      <header className="game-bar">
        <div className="game-bar-left">
          {mode === "online" && code ? (
            <span className="chip chip-code" title="Room key">{code}</span>
          ) : (
            <span className="chip">solo</span>
          )}
        </div>
        <div className="game-bar-right">
          <button className="btn-ghost" onClick={() => setShowLog((v) => !v)}>
            {showLog ? "Hide log" : "Log"}
          </button>
          <button className="btn-ghost" onClick={onShowRules}>Rules</button>
          <button className="btn-ghost" onClick={onLeave}>Leave</button>
        </div>
      </header>

      <main className={`table ${shake ? "is-shake" : ""}`}>
        <div className="opponents">
          {seated.map((p) => (
            <Pod
              key={p.id}
              p={p}
              view={view}
              isYou={false}
              canPick={iPick && !p.eliminated && p.placed.some((s) => !s.revealed)}
              onPick={() => onAct({ k: "reveal", targetId: p.id })}
              order={orderOf.get(p.id)}
            />
          ))}
        </div>

        <div className="stage">{stage}</div>
        <div className="ticker" key={r?.log.length}>{lastLog}</div>

        <div className="you-zone">
          <Pod p={me} view={view} isYou canPick={false} onPick={() => {}} order={orderOf.get(me.id)} />

          {!me.eliminated && view.phase === "playing" && (
            <div className="controls">
              {canPlace && me.hand && (
                <div className="hand">
                  <span className="controls-label">Your hand — tap to place</span>
                  <div className="hand-cards">
                    {me.hand.flower > 0 && (
                      <div className="hand-slot">
                        <CardFace
                          kind="flower"
                          flipped
                          size="lg"
                          onClick={() => onAct({ k: "place", kind: "flower" })}
                        />
                        <span className="hand-count">× {me.hand.flower}</span>
                      </div>
                    )}
                    {me.hand.fire > 0 && (
                      <div className="hand-slot">
                        <CardFace
                          kind="fire"
                          flipped
                          size="lg"
                          onClick={() => onAct({ k: "place", kind: "fire" })}
                        />
                        <span className="hand-count">× {me.hand.fire}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {(canChallenge || canStepBack) && (
                <div className="dare-controls">
                  {canChallenge && (
                    <div className="dare-row">
                      <button
                        className="btn btn-round"
                        onClick={() => setN((v) => Math.max(minN, v - 1))}
                        disabled={n <= minN}
                      >
                        −
                      </button>
                      <div className="dare-display">
                        <span className="dare-big">{n}</span>
                        <span className="dare-of">of {maxN}</span>
                      </div>
                      <button
                        className="btn btn-round"
                        onClick={() => setN((v) => Math.min(maxN, v + 1))}
                        disabled={n >= maxN}
                      >
                        +
                      </button>
                      <button className="btn btn-fire" onClick={() => onAct({ k: "challenge", n })}>
                        {ch ? `Raise to ${n}` : `Dare ${n}`}
                      </button>
                    </div>
                  )}
                  {canStepBack && (
                    <button className="btn" onClick={() => onAct({ k: "stepBack" })}>
                      Step back
                    </button>
                  )}
                </div>
              )}

              {!myTurn && !iPick && !r?.resolved && !rv?.done && (
                <div className="controls-idle">
                  {rv ? "" : `Waiting on ${nameOf(r?.current)}…`}
                </div>
              )}
            </div>
          )}
          {me.eliminated && view.phase === "playing" && (
            <div className="controls-idle">You're out of cards — spectating the blaze.</div>
          )}
        </div>
      </main>

      {showLog && (
        <div className="log" ref={logRef}>
          {r?.log.map((line, i) => (
            <div key={i} className="log-line">{line}</div>
          ))}
        </div>
      )}

      {view.phase === "over" && (
        <div className="modal-backdrop">
          <div className="modal winner-modal">
            <div className="winner-flame">🔥</div>
            <h2>{nameOf(view.winner)} wins</h2>
            <p className="winner-sub">
              {view.winner === view.you ? "You played with fire — and won." : "The fire chose another."}
            </p>
            <ul className="winner-scores">
              {[...view.players]
                .sort((a, b) => b.points - a.points)
                .map((p) => (
                  <li key={p.id}>
                    <span>{p.name}{p.id === view.you ? " (you)" : ""}</span>
                    {flamePips(p.points)}
                  </li>
                ))}
            </ul>
            {mode === "solo" ? (
              <button className="btn btn-primary" onClick={onBackToLobby}>Play again</button>
            ) : isHost ? (
              <button className="btn btn-primary" onClick={onBackToLobby}>Back to lobby</button>
            ) : (
              <p className="lobby-wait">Waiting for the host…</p>
            )}
            <button className="btn-ghost" onClick={onLeave}>Leave</button>
          </div>
        </div>
      )}
    </div>
  );
}
