// MongoDB: oyuncu adları ve biten oyunların sonuçları.
// MONGODB_URI yoksa ya da bağlanılamazsa oyun veritabanısız çalışmaya devam eder.
import { MongoClient, type Db } from 'mongodb';
import type { HandResult, Settings } from '../shared/types';

let db: Db | null = null;

export async function connectDb(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('[db] MONGODB_URI tanımlı değil, veritabanısız çalışılıyor.');
    return;
  }
  try {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    db = client.db(process.env.MONGODB_DB || 'yuzbir');
    await db.collection('players').createIndex({ playerId: 1 }, { unique: true });
    await db.collection('games').createIndex({ finishedAt: -1 });
    console.log('[db] MongoDB bağlantısı kuruldu.');
  } catch (err) {
    db = null;
    console.error('[db] MongoDB bağlantısı kurulamadı, veritabanısız devam ediliyor:', (err as Error).message);
  }
}

export function dbReady() {
  return db !== null;
}

export async function savePlayer(playerId: string, name: string) {
  if (!db) return;
  try {
    await db.collection('players').updateOne(
      { playerId },
      { $set: { name, lastSeenAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    );
  } catch (err) {
    console.error('[db] oyuncu kaydedilemedi:', (err as Error).message);
  }
}

export interface SavedGame {
  tableId: string;
  tableName: string;
  settings: Settings;
  players: { seat: number; name: string; playerId: string | null; isBot: boolean }[];
  history: HandResult[];
  totals: number[];
  finishedAt: Date;
}

export async function saveGame(game: SavedGame) {
  if (!db) return;
  try {
    await db.collection('games').insertOne(game);
  } catch (err) {
    console.error('[db] oyun kaydedilemedi:', (err as Error).message);
  }
}

export async function recentGames(playerId: string, limit = 10) {
  if (!db) return [];
  return db
    .collection('games')
    .find({ 'players.playerId': playerId }, { projection: { _id: 0 } })
    .sort({ finishedAt: -1 })
    .limit(limit)
    .toArray();
}
