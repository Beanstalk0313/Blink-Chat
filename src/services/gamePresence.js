import { useEffect, useState } from 'react';
import { ref, update } from 'firebase/database';
import { db } from '../firebase/data';
import { GAME_EXECUTABLES, resolveRunningGame } from '../data/games';

// Game presence only exists in the Tauri desktop shell: the web build has no
// way to see running processes, and asks the OS nothing.
const POLL_INTERVAL_MS = 20000;

// Broadcast so the profile row and mini profiles update the moment detection
// changes, without every viewer of presence polling.
export const GAME_PRESENCE_EVENT = 'blink:game-changed';

function invokeCommand() {
  if (typeof window === 'undefined') return null;
  const invoke = window.__TAURI__?.core?.invoke;
  return typeof invoke === 'function' ? invoke : null;
}

export function isDesktopApp() {
  return invokeCommand() !== null;
}

async function readRunningProcesses() {
  const invoke = invokeCommand();
  if (!invoke) return [];
  const rows = await invoke('running_games', { known: GAME_EXECUTABLES });
  if (!Array.isArray(rows)) return [];
  return rows
    .map(row => (Array.isArray(row) ? { exe: row[0], title: row[1] } : { exe: row?.exe, title: row?.title }))
    .filter(row => row.exe);
}

export async function detectRunningGame() {
  if (!isDesktopApp()) return null;
  try {
    return resolveRunningGame(await readRunningProcesses());
  } catch (error) {
    console.warn('Game detection failed:', error);
    return null;
  }
}

// Own-device game, as detected locally. Used by the sidebar/profile row so it
// updates the instant the game starts or closes.
export function useOwnGamePresence() {
  const [game, setGame] = useState(null);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handle = event => setGame(event.detail || null);
    window.addEventListener(GAME_PRESENCE_EVENT, handle);
    return () => window.removeEventListener(GAME_PRESENCE_EVENT, handle);
  }, []);
  return game;
}

function publish(game) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(GAME_PRESENCE_EVENT, { detail: game }));
  }
}

// Polls the desktop shell and mirrors the result on presence/{uid}/game so
// friends and mini profiles can see it. `isEnabled` is read on every poll, so
// turning the setting off stops publishing without restarting anything.
export function startGamePresence(uid, isEnabled = () => true) {
  if (!db || !uid || typeof window === 'undefined' || !isDesktopApp()) return () => {};
  let disposed = false;
  let current = null;
  const presenceRef = ref(db, `presence/${uid}`);

  const setGame = (game, startedAt) => {
    current = game;
    publish(game ? { name: game.name, exe: game.exe, startedAt } : null);
    update(presenceRef, {
      game: game ? { name: game.name, exe: game.exe, startedAt, updatedAt: Date.now() } : null
    }).catch(error => console.warn('Could not publish game activity:', error));
  };

  const poll = async () => {
    if (disposed) return;
    if (!isEnabled()) {
      if (current) setGame(null, 0);
      return;
    }
    const next = await detectRunningGame();
    if (disposed) return;
    if ((next?.name || null) === (current?.name || null)) return;
    setGame(next, next ? Date.now() : 0);
  };

  poll();
  const timer = window.setInterval(poll, POLL_INTERVAL_MS);
  return () => {
    disposed = true;
    window.clearInterval(timer);
    if (current) {
      current = null;
      publish(null);
      update(presenceRef, { game: null }).catch(() => {});
    }
  };
}
