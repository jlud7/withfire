import { useState } from "react";
import { CardFace } from "../components/Card";

export interface HomeProps {
  initialName: string;
  initialCode: string;
  onCreate: (name: string) => void;
  onJoin: (name: string, code: string) => void;
  onSolo: (name: string, bots: number) => void;
  onShowRules: () => void;
}

export function Home({ initialName, initialCode, onCreate, onJoin, onSolo, onShowRules }: HomeProps) {
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState(initialCode);
  const [panel, setPanel] = useState<"main" | "join" | "solo">(initialCode ? "join" : "main");
  const [bots, setBots] = useState(2);

  const named = name.trim().length > 0;

  return (
    <div className="home">
      <div className="home-hero">
        <div className="home-cards">
          <CardFace kind="flower" flipped size="md" />
          <CardFace kind="back" size="md" />
          <CardFace kind="fire" flipped size="md" />
        </div>
        <h1 className="title">
          <span className="title-with">With</span>
          <span className="title-fire">Fire</span>
        </h1>
        <p className="tagline">Flowers hide a flame. How far will you dare?</p>
      </div>

      <div className="home-panel">
        <label className="field">
          <span>Your name</span>
          <input
            value={name}
            maxLength={18}
            placeholder="e.g. Ember"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && panel === "join" && named && code.trim()) {
                onJoin(name.trim(), code.trim());
              }
            }}
            autoFocus
          />
        </label>

        {panel === "main" && (
          <div className="home-actions">
            <button className="btn btn-primary" disabled={!named} onClick={() => onCreate(name.trim())}>
              Create a room
            </button>
            <button className="btn" disabled={!named} onClick={() => setPanel("join")}>
              Join with a key
            </button>
            <button className="btn" disabled={!named} onClick={() => setPanel("solo")}>
              Play solo vs AI
            </button>
            <button className="btn-ghost rules-link" onClick={onShowRules}>
              How to play
            </button>
          </div>
        )}

        {panel === "join" && (
          <div className="home-actions">
            <label className="field">
              <span>Room key</span>
              <input
                className="code-input"
                value={code}
                maxLength={5}
                placeholder="ABCDE"
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && named && code.trim()) onJoin(name.trim(), code.trim());
                }}
              />
            </label>
            <button
              className="btn btn-primary"
              disabled={!named || code.trim().length < 4}
              onClick={() => onJoin(name.trim(), code.trim())}
            >
              Join room
            </button>
            <button className="btn-ghost" onClick={() => setPanel("main")}>← Back</button>
          </div>
        )}

        {panel === "solo" && (
          <div className="home-actions">
            <div className="field">
              <span>Opponents</span>
              <div className="seg">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    className={`seg-btn ${bots === n ? "is-on" : ""}`}
                    onClick={() => setBots(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn btn-primary" disabled={!named} onClick={() => onSolo(name.trim(), bots)}>
              Light it up
            </button>
            <button className="btn-ghost" onClick={() => setPanel("main")}>← Back</button>
          </div>
        )}
      </div>

      <footer className="home-foot">2–5 players · a Skull-family bluffing game</footer>
    </div>
  );
}
