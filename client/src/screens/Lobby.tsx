import { useState } from "react";
import type { RoomView } from "withfire-shared";
import { MIN_PLAYERS } from "withfire-shared";

export interface LobbyProps {
  room: RoomView;
  you: string;
  onAddBot: () => void;
  onRemove: (id: string) => void;
  onStart: () => void;
  onLeave: () => void;
  onShowRules: () => void;
}

export function Lobby({ room, you, onAddBot, onRemove, onStart, onLeave, onShowRules }: LobbyProps) {
  const [copied, setCopied] = useState<"key" | "link" | null>(null);
  const isHost = room.hostId === you;
  const canStart = room.players.length >= MIN_PLAYERS;
  const full = room.players.length >= room.maxPlayers;

  const copy = async (what: "key" | "link") => {
    const text = what === "key" ? room.code : `${location.origin}/?room=${room.code}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard unavailable; the key is on screen anyway */
    }
  };

  return (
    <div className="lobby">
      <h2 className="lobby-head">Gather at the fire</h2>

      <div className="room-key-card">
        <span className="room-key-label">Room key</span>
        <div className="room-key">{room.code}</div>
        <div className="room-key-actions">
          <button className="btn btn-small" onClick={() => copy("key")}>
            {copied === "key" ? "Copied ✓" : "Copy key"}
          </button>
          <button className="btn btn-small" onClick={() => copy("link")}>
            {copied === "link" ? "Copied ✓" : "Copy invite link"}
          </button>
        </div>
        <p className="room-key-hint">Friends join from the home screen with this key.</p>
      </div>

      <ul className="lobby-players">
        {room.players.map((p, i) => (
          <li key={p.id} className={`lobby-player ${!p.connected ? "is-off" : ""}`}>
            <span className="lobby-seat">{i + 1}</span>
            <span className="lobby-name">
              {p.name}
              {p.id === you && <em> (you)</em>}
              {p.isAI && <span className="chip chip-bot">AI · {p.personaTrait}</span>}
              {p.id === room.hostId && <span className="chip chip-host">host</span>}
              {!p.connected && !p.isAI && <span className="chip">offline</span>}
            </span>
            {isHost && p.id !== you && (
              <button className="btn-ghost lobby-kick" onClick={() => onRemove(p.id)} title="Remove">
                ✕
              </button>
            )}
          </li>
        ))}
        {Array.from({ length: room.maxPlayers - room.players.length }).map((_, i) => (
          <li key={`empty-${i}`} className="lobby-player lobby-empty">
            <span className="lobby-seat">{room.players.length + i + 1}</span>
            <span className="lobby-name">waiting…</span>
          </li>
        ))}
      </ul>

      <div className="lobby-actions">
        {isHost && (
          <>
            <button className="btn" onClick={onAddBot} disabled={full}>
              + Add AI player
            </button>
            <button className="btn btn-primary" onClick={onStart} disabled={!canStart}>
              {canStart ? "Start the game" : `Need ${MIN_PLAYERS}+ players`}
            </button>
          </>
        )}
        {!isHost && <p className="lobby-wait">Waiting for the host to start…</p>}
        <div className="lobby-foot">
          <button className="btn-ghost" onClick={onShowRules}>How to play</button>
          <button className="btn-ghost" onClick={onLeave}>Leave room</button>
        </div>
      </div>
    </div>
  );
}
