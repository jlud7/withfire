export function Rules({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>How to play</h2>
          <button className="btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="rules-body">
          <p className="rules-lede">
            A game of nerve and bluff. Every card is a <strong>Flower</strong> — except the
            one <strong>Fire</strong> in each player's hand.
          </p>
          <ol>
            <li>
              <strong>Place.</strong> Everyone secretly places a card face-down. On your
              later turns, keep placing — or make a <em>Challenge</em>.
            </li>
            <li>
              <strong>Challenge.</strong> Claim you can flip that many cards without
              hitting Fire. Others must <em>raise</em> your number or <em>step back</em>.
            </li>
            <li>
              <strong>Reveal.</strong> The last one standing flips cards — always their own
              stack first, then any opponents' top cards, until they hit the target… or a Fire.
            </li>
            <li>
              <strong>Win or burn.</strong> Survive and you earn a Burn Mark —{" "}
              <strong>two Burn Marks wins the game</strong>. Hit Fire and you lose one of
              your four cards at random, face down. Run out of cards and you're out.
            </li>
          </ol>
          <p className="rules-tip">
            The art of it: sometimes you place your Fire and dare anyway — and flip your own
            Flower off the top of it. Sometimes the bravest number is a small one.
          </p>
        </div>
      </div>
    </div>
  );
}
