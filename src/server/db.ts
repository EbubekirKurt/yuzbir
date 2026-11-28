// MongoDB bağlantısı ve biten oyunların kaydı.
import { MongoClient, type Db, type ObjectId } from 'mongodb';
import type { HandResult, Settings } from '../shared/types';

let db: Db | null = null;

export async function connectDb(): Promise<Db | null> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('[db] MONGODB_URI tanımlı değil, veritabanısız çalışılıyor.');
    return null;
  }
  try {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    db = client.db(process.env.MONGODB_DB || 'yuzbir');
    await db.collection('games').createIndex({ finishedAt: -1 });
    await db.collection('games').createIndex({ 'players.playerId': 1 });
    await db.collection('games').createIndex({ discordPostedAt: 1, finishedAt: 1 });
    console.log('[db] MongoDB bağlantısı kuruldu.');
  } catch (err) {
    db = null;
    console.error('[db] MongoDB bağlantısı kurulamadı:', (err as Error).message);
  }
  return db;
}

export function dbReady() {
  return db !== null;
}

export interface SavedGame {
  tableId: string;
  tableName: string;
  settings: Settings;
  players: { seat: number; name: string; playerId: string | null; isBot: boolean }[];
  history: HandResult[];
  totals: number[];
  startedAt: Date | null;
  finishedAt: Date;
  /** Discord'a gönderildiği an; gönderilmediyse null (kuyrukta). */
  discordPostedAt: Date | null;
  discordAttempts: number;
  discordLastError?: string;
}

/** Oyunu kaydeder; kayıt id'sini döner (veritabanı yoksa null). */
export async function saveGame(game: SavedGame): Promise<ObjectId | null> {
  if (!db) return null;
  try {
    const res = await db.collection('games').insertOne(game);
    return res.insertedId;
  } catch (err) {
    console.error('[db] oyun kaydedilemedi:', (err as Error).message);
    return null;
  }
}

const MAX_DISCORD_ATTEMPTS = 20;

/** Discord'a henüz gönderilmemiş, son 24 saatte biten oyunlar (eskiden yeniye). */
export async function pendingDiscordGames(limit = 10) {
  if (!db) return [];
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return db
    .collection<SavedGame>('games')
    .find({
      discordPostedAt: { $in: [null] }, // alanı olmayan eski kayıtlar da dahil
      finishedAt: { $gte: since },
      $or: [{ discordAttempts: { $exists: false } }, { discordAttempts: { $lt: MAX_DISCORD_ATTEMPTS } }],
    })
    .sort({ finishedAt: 1 })
    .limit(limit)
    .toArray();
}

export async function markDiscordResult(id: ObjectId, ok: boolean, error?: string) {
  if (!db) return;
  try {
    await db
      .collection('games')
      .updateOne(
        { _id: id },
        ok
          ? { $set: { discordPostedAt: new Date() }, $unset: { discordLastError: '' } }
          : { $inc: { discordAttempts: 1 }, $set: { discordLastError: error ?? 'bilinmeyen hata' } },
      );
  } catch (err) {
    console.error('[db] Discord durumu kaydedilemedi:', (err as Error).message);
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
