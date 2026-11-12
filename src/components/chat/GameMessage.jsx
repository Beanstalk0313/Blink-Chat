import { useMemo, useState } from 'react';
import { acceptGameChallenge, declineGameChallenge, submitGameMove } from '../../services/db';
import styles from './GameMessage.module.css';

const labels = { ticTacToe: 'Tic-Tac-Toe', connectFour: 'Connect Four', checkers: 'Checkers', chess: 'Chess' };

// Winning lines for the two rule-complete games.
const WIN_LINES = {
  ticTacToe: [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ],
  connectFour: (() => {
    const lines = [];
    // Horizontal
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 4; col += 1) lines.push([row * 7 + col, row * 7 + col + 1, row * 7 + col + 2, row * 7 + col + 3]);
    }
    // Vertical
    for (let col = 0; col < 7; col += 1) {
      for (let row = 0; row < 3; row += 1) lines.push([row * 7 + col, (row + 1) * 7 + col, (row + 2) * 7 + col, (row + 3) * 7 + col]);
    }
    // Diagonals (both directions)
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 4; col += 1) lines.push([row * 7 + col, (row + 1) * 7 + col + 1, (row + 2) * 7 + col + 2, (row + 3) * 7 + col + 3]);
      for (let col = 3; col < 7; col += 1) lines.push([row * 7 + col, (row + 1) * 7 + col - 1, (row + 2) * 7 + col - 2, (row + 3) * 7 + col - 3]);
    }
    return lines;
  })()
};

function findWinner(board, type) {
  const lines = WIN_LINES[type];
  if (!lines) return null;
  for (const line of lines) {
    const first = board[line[0]];
    if (first && line.every(index => board[index] === first)) return first;
  }
  return null;
}

export default function GameMessage({ message, currentUid }) {
  const game = message.game || {};
  const type = game.type;
  const label = labels[type] || 'Mini game';
  const [busy, setBusy] = useState(false);

  const size = type === 'connectFour' ? 42 : 9;
  const moves = Object.values(game.moves || {});
  const board = useMemo(() => {
    const next = Array(size).fill('');
    moves.forEach(move => {
      if (Number.isInteger(move.cell) && next[move.cell] === '') next[move.cell] = move.mark || 'X';
    });
    return next;
  }, [moves, size]);

  const authorUid = message.authorUid;
  const opponentUid = game.opponentUid;
  const isAuthor = Boolean(authorUid) && currentUid === authorUid;
  const isOpponent = Boolean(opponentUid) && currentUid === opponentUid;
  // Legacy games without an opponent are open to everyone; challenged games
  // are only playable by the two players (bug: bystanders must not see a turn).
  const isPlayer = isAuthor || isOpponent || !opponentUid;
  const mark = isAuthor ? 'X' : 'O';

  const winner = findWinner(board, type);
  const isDraw = Boolean(['ticTacToe', 'connectFour'].includes(type)) && !winner && moves.length >= size;
  const finished = Boolean(winner || isDraw);

  const status = game.status || 'active';
  const isTurn = isPlayer && status === 'active' && !finished && moves.length % 2 === (mark === 'X' ? 0 : 1);

  const play = async cell => {
    if (busy || !isTurn || board[cell] || !['ticTacToe', 'connectFour'].includes(type)) return;
    setBusy(true);
    try { await submitGameMove(message.channelId, message.id, currentUid, cell, mark); } finally { setBusy(false); }
  };

  const accept = async () => {
    if (busy || !isOpponent) return;
    setBusy(true);
    try { await acceptGameChallenge(message.channelId, message.id); } finally { setBusy(false); }
  };

  const decline = async () => {
    if (busy || !isOpponent) return;
    setBusy(true);
    try { await declineGameChallenge(message.channelId, message.id); } finally { setBusy(false); }
  };

  // Pending challenge: no board yet — show the challenge with Accept/Decline.
  if (status === 'pending') {
    const challenger = game.authorName || 'Someone';
    const opponentName = game.opponentName || 'the other player';
    return (
      <div className={`${styles.card} ${styles.challengeCard}`}>
        <strong className={styles.challengeTitle}>{label}</strong>
        {isOpponent ? (
          <>
            <p className={styles.challengeText}>{challenger} has challenged you to {label}.</p>
            <div className={styles.challengeActions}>
              <button type="button" className={styles.acceptBtn} disabled={busy} onClick={accept}>Accept</button>
              <button type="button" className={styles.declineBtn} disabled={busy} onClick={decline}>Decline</button>
            </div>
          </>
        ) : isAuthor ? (
          <p className={styles.challengeText}>Waiting for {opponentName} to accept your challenge…</p>
        ) : (
          <p className={styles.challengeText}>{challenger} challenged {opponentName} to {label}.</p>
        )}
      </div>
    );
  }

  if (status === 'declined') {
    const challenger = game.authorName || 'Someone';
    const decliner = game.opponentName || 'The other player';
    return (
      <div className={`${styles.card} ${styles.challengeCard}`}>
        <strong className={styles.challengeTitle}>{label}</strong>
        <p className={styles.challengeText}>{decliner} declined {challenger}'s challenge to {label}.</p>
      </div>
    );
  }

  let footer;
  if (finished) {
    footer = winner ? (winner === mark ? 'Game over — you win! 🎉' : 'Game over — you lose.') : 'Game over — draw.';
  } else if (!isPlayer) {
    footer = `Watch ${game.authorName || 'the challenger'} vs ${game.opponentName || 'their opponent'}.`;
  } else {
    footer = `You play as ${mark}. ${isTurn ? 'Your turn.' : 'Waiting for the other player.'}`;
  }

  return (
    <div className={`${styles.card} ${type === 'connectFour' ? styles.connectFour : ''}`}>
      <div className={styles.heading}>
        <strong>{label}</strong>
        <span>{moves.length} moves</span>
      </div>
      {['ticTacToe', 'connectFour'].includes(type) && (
        <div className={styles.board}>
          {board.map((cell, index) => (
            <button type="button" key={index} disabled={Boolean(cell) || busy || !isTurn} onClick={() => play(index)}>{cell}</button>
          ))}
        </div>
      )}
      {type === 'checkers' && (
        <div className={styles.checkerBoard}>
          {Array.from({ length: 64 }, (_, index) => (
            <span key={index} className={(Math.floor(index / 8) + index) % 2 ? styles.darkSquare : styles.lightSquare}>{index < 12 ? '●' : index > 51 ? '○' : ''}</span>
          ))}
        </div>
      )}
      {type === 'chess' && (
        <div className={styles.chessBoard}>
          {['♜♞♝♛♚♝♞♜', '♟♟♟♟♟♟♟♟', '', '', '', '', '♙♙♙♙♙♙♙♙', '♖♘♗♕♔♗♘♖'].map((row, index) => (
            <div key={index}>{Array.from({ length: 8 }, (_, cell) => (
              <span key={cell} className={(index + cell) % 2 ? styles.darkSquare : styles.lightSquare}>{row[cell] || ''}</span>
            ))}</div>
          ))}
        </div>
      )}
      <small>{footer}</small>
    </div>
  );
}