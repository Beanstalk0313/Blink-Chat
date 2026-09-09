import { useMemo, useState } from 'react';
import { submitGameMove } from '../../services/db';
import styles from './GameMessage.module.css';
const labels = { ticTacToe: 'Tic-Tac-Toe', connectFour: 'Connect Four', checkers: 'Checkers', chess: 'Chess' };
export default function GameMessage({ message, currentUid }) {
  const game = message.game || {}; const moves = Object.values(game.moves || {}); const [busy, setBusy] = useState(false);
  const size = game.type === 'connectFour' ? 42 : 9;
  const board = useMemo(() => { const next = Array(size).fill(''); moves.forEach(move => { if (Number.isInteger(move.cell) && next[move.cell] === '') next[move.cell] = move.mark || 'X'; }); return next; }, [moves, size]);
  const isPlayer = !game.opponentUid || currentUid === message.authorUid || currentUid === game.opponentUid;
  const mark = currentUid === message.authorUid ? 'X' : 'O';
  const isTurn = isPlayer && moves.length % 2 === (mark === 'X' ? 0 : 1);
  const play = async cell => { if (busy || !isTurn || board[cell] || !['ticTacToe','connectFour'].includes(game.type)) return; setBusy(true); try { await submitGameMove(message.channelId, message.id, currentUid, cell, mark); } finally { setBusy(false); } };
  return <div className={`${styles.card} ${game.type === 'connectFour' ? styles.connectFour : ''}`}><div className={styles.heading}><strong>{labels[game.type] || 'Mini game'}</strong><span>{moves.length} moves</span></div>{['ticTacToe','connectFour'].includes(game.type) && <div className={styles.board}>{board.map((cell, index) => <button type="button" key={index} disabled={Boolean(cell) || busy || !isTurn} onClick={() => play(index)}>{cell}</button>)}</div>}{game.type === 'checkers' && <div className={styles.checkerBoard}>{Array.from({ length: 64 }, (_, index) => <span key={index} className={(Math.floor(index / 8) + index) % 2 ? styles.darkSquare : styles.lightSquare}>{index < 12 ? '●' : index > 51 ? '○' : ''}</span>)}</div>}{game.type === 'chess' && <div className={styles.chessBoard}>{['♜♞♝♛♚♝♞♜','♟♟♟♟♟♟♟♟','','','','','♙♙♙♙♙♙♙♙','♖♘♗♕♔♗♘♖'].map((row, index) => <div key={index}>{Array.from({ length: 8 }, (_, cell) => <span key={cell} className={(index + cell) % 2 ? styles.darkSquare : styles.lightSquare}>{row[cell] || ''}</span>)}</div>)}</div>}<small>{['ticTacToe','connectFour'].includes(game.type) ? `You play as ${mark}. ${isTurn ? 'Your turn.' : 'Waiting for the other player.'}` : 'Shared board message — ready for future rule expansions.'}</small></div>;
}
