# With Fire 🔥

A bluffing card game of flowers and flames (Skull-family, 2–5 players) — playable in the
browser with **real online multiplayer** (room keys) or **solo against AI**.

Every card you place is a Flower… except the one Fire in your hand. Dare to flip cards
without hitting Fire and you earn a Burn Mark — two Burn Marks wins. Flip a Fire and you
lose one of your own cards, face down, forever.

## Play it

```bash
npm install
npm run build     # builds the web client
npm start         # serves game + websocket on http://localhost:3001
```

Open `http://localhost:3001`:

- **Create a room** → share the 5-letter room key (or the invite link) with friends.
- **Join with a key** → enter a friend's key.
- **Play solo vs AI** → 1–4 AI opponents (Sable, Cinder, Pyre, Ash), no server round-trips.
- The host can **add AI players** to an online room to fill empty seats.

## Project layout

```
engine/   pure rules engine + AI (no UI, no network, no timers) — see engine/README.md
shared/   wire protocol + per-player state redaction (server & solo mode share it)
server/   authoritative Node server: rooms, WebSockets, AI pacing, reconnection
client/   React + Vite web client (the pretty part)
```

### How multiplayer works

The server is authoritative. It holds the only true `GameState` and sends each player a
**redacted view**: you never receive other players' face-down card kinds, hand
composition, owned-pool composition, or what card a burned player discarded — so a
modified client can't cheat. Clients send intents (`place`, `challenge`, `stepBack`,
`reveal`) and the engine validates every move.

Quality-of-life built in:

- **Reconnection** — refresh or drop and you're put back in your seat (token-based).
- **Autopilot** — if someone disappears mid-game, the AI takes their turn after 30s so
  the table never deadlocks.
- **Room cleanup** — abandoned rooms expire after 15 minutes.
- **Case-insensitive room keys** with no ambiguous characters (no 0/O or 1/I).

## Development

```bash
npm run dev          # server on :3001 + Vite dev server on :5173 (proxies /ws)
npm run typecheck    # typecheck all workspaces
npm test             # engine smoke test
```

## Deploying

Any Node ≥ 18 host works (Render, Railway, Fly.io, a VPS). One service, no database:

- **Build command:** `npm install && npm run build`
- **Start command:** `npm start`
- The server reads `PORT` from the environment and serves both the client and the
  WebSocket endpoint (`/ws`) on the same port, so WebSockets work behind any standard
  HTTPS proxy.

## Rules in one breath

Place a card face down each turn (or keep placing on later turns). At any point after the
opening go-around, **challenge**: claim you can flip N cards without hitting Fire. Others
must raise your number or step back. Last claimant flips — **their own stack first**, then
any opponents' top cards. Survive: Burn Mark (2 wins). Hit Fire: lose one of your four
cards at random. Lose all four and you're ash.
