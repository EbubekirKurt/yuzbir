import { io } from 'socket.io-client';
import type { GameAction } from '../shared/types';

export const socket = io({ autoConnect: true });

function makeId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // tarayıcı depolaması kapalıysa yok say
  }
}

let playerId = read('yuzbir.playerId');
if (!playerId) {
  playerId = makeId();
  write('yuzbir.playerId', playerId);
}
export const PLAYER_ID = playerId;

export function savedName(): string {
  return read('yuzbir.name') ?? '';
}

export function saveName(name: string) {
  write('yuzbir.name', name);
}

export function sendAction(action: GameAction) {
  socket.emit('game:action', action);
}
