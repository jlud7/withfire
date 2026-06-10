import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Embers } from "./components/Embers";
import { Rules } from "./components/Rules";
import { Home } from "./screens/Home";
import { Lobby } from "./screens/Lobby";
import { Game } from "./screens/Game";
import {
  type GameSession, OnlineSession, SoloSession, loadRejoin, clearRejoin,
} from "./net/session";

const NAME_KEY = "withfire:name";

export function App() {
  const [session, setSession] = useState<GameSession | null>(() => {
    // Resume a live seat after a refresh.
    const r = loadRejoin();
    return r ? new OnlineSession({ t: "rejoin", ...r }) : null;
  });
  const [showRules, setShowRules] = useState(false);

  const subscribe = useCallback(
    (fn: () => void) => (session ? session.subscribe(fn) : () => {}),
    [session]
  );
  const state = useSyncExternalStore(subscribe, () =>
    session ? session.state : null
  );

  // Drop the session object once it reports closed.
  useEffect(() => {
    if (state?.status === "closed") {
      setSession(null);
      clearRejoin();
    }
  }, [state?.status]);

  // Transient error toast.
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!state?.error || !state.errorAt) return;
    setToast(state.error);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, [state?.error, state?.errorAt]);

  const initialName = localStorage.getItem(NAME_KEY) ?? "";
  const urlCode = new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "";

  const begin = (name: string, make: () => GameSession) => {
    localStorage.setItem(NAME_KEY, name);
    setSession(make());
    // Clean the invite param so refresh doesn't re-prompt joining.
    if (urlCode) history.replaceState(null, "", location.pathname);
  };

  const leave = () => {
    session?.leave();
    setSession(null);
    clearRejoin();
  };

  let screen: JSX.Element;
  if (!session || !state || state.status === "closed") {
    screen = (
      <Home
        initialName={initialName}
        initialCode={urlCode}
        onCreate={(name) => begin(name, () => new OnlineSession({ t: "create", name }))}
        onJoin={(name, code) => begin(name, () => new OnlineSession({ t: "join", code, name }))}
        onSolo={(name, bots) => begin(name, () => new SoloSession(name, bots))}
        onShowRules={() => setShowRules(true)}
      />
    );
  } else if (state.status === "connecting") {
    screen = (
      <div className="centered">
        <div className="loading-flame">🔥</div>
        <p>Joining the fire…</p>
        <button className="btn-ghost" onClick={leave}>Cancel</button>
      </div>
    );
  } else if (state.status === "lobby" && state.room && state.you) {
    screen = (
      <Lobby
        room={state.room}
        you={state.you}
        onAddBot={() => session.addBot()}
        onRemove={(id) => session.removePlayer(id)}
        onStart={() => session.start()}
        onLeave={leave}
        onShowRules={() => setShowRules(true)}
      />
    );
  } else if (state.status === "game" && state.view) {
    screen = (
      <Game
        view={state.view}
        mode={state.mode}
        code={state.code}
        isHost={state.mode === "solo" || state.room?.hostId === state.you}
        onAct={(a) => session.act(a)}
        onBackToLobby={() => session.backToLobby()}
        onLeave={leave}
        onShowRules={() => setShowRules(true)}
      />
    );
  } else {
    screen = (
      <div className="centered">
        <div className="loading-flame">🔥</div>
        <p>Setting the table…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <Embers />
      {screen}
      {state?.reconnecting && (
        <div className="reconnect-banner">Connection lost — rejoining the room…</div>
      )}
      {toast && <div className="toast">{toast}</div>}
      {showRules && <Rules onClose={() => setShowRules(false)} />}
    </div>
  );
}
