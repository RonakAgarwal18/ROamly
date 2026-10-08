import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { StorageNotFoundError } from '../storage/storage.types';

export const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * In-flight fetches, module-scoped on purpose.
 *
 * This is the stampede guard: ten tiles asking for the same uncached asset must
 * share one upstream fetch. The sweep cron injects the container singleton now
 * (RoamlyPhotoCacheJob), but the module scope keeps the guard whole even if a
 * second instance of this service ever exists again — a per-instance Map would
 * hand each of them a private one and the guard would be silently gone. Same
 * reasoning as oauth/oauth.pending-codes.ts and the notification channel
 * registry.
 */
const inFlight = new Map<string, Promise<Buffer | null>>();

/** Storage name (category 'photos-roamly') for a cache key. */
function objectName(key: string): string {
  return `${key}.bin`;
}

/** Storage + metadata cache for provider thumbnails and originals. */
@Injectable()
export class RoamlyPhotoCacheService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
  ) {}

  cacheKey(provider: string, assetId: string, kind: string, ownerId: number): string {
    return crypto.createHash('sha1').update(`${provider}:${assetId}:${kind}:${ownerId}`).digest('hex');
  }

  async getFresh(key: string): Promise<{ contentType: string } | null> {
    const row = this.db.get<{ content_type: string; fetched_at: number }>(
      'SELECT content_type, fetched_at FROM roamly_photo_cache_meta WHERE cache_key = ?', key,
    );

    if (!row) return null;

    if (Date.now() - row.fetched_at >= CACHE_TTL) {
      this.db.run('DELETE FROM roamly_photo_cache_meta WHERE cache_key = ?', key);
      return null;
    }

    if (!(await this.storage.exists('photos-roamly', objectName(key)))) {
      this.db.run('DELETE FROM roamly_photo_cache_meta WHERE cache_key = ?', key);
      return null;
    }

    return { contentType: row.content_type };
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    await this.storage.put('photos-roamly', objectName(key), Readable.from(bytes));

    this.db.run(
      'INSERT OR REPLACE INTO roamly_photo_cache_meta (cache_key, content_type, fetched_at) VALUES (?, ?, ?)',
      key, contentType, Date.now(),
    );
  }

  async serveFresh(res: Response, key: string): Promise<boolean> {
    const entry = await this.getFresh(key);
    if (!entry) return false;

    res.set('Content-Type', entry.contentType);
    res.set('Cache-Control', 'public, max-age=3600');
    try {
      // send() keeps a pre-set Content-Type, so entry.contentType survives the
      // .bin extension.
      await this.storage.sendToResponse('photos-roamly', objectName(key), res);
    } catch (err) {
      // getFresh→send delete race: fall back like a cache miss.
      if (err instanceof StorageNotFoundError && !res.headersSent) return false;
      throw err;
    }
    return true;
  }

  getInFlight(key: string): Promise<Buffer | null> | undefined {
    return inFlight.get(key);
  }

  setInFlight(key: string, promise: Promise<Buffer | null>): void {
    inFlight.set(key, promise);
    promise.finally(() => inFlight.delete(key));
  }

  async sweepExpired(): Promise<void> {
    const cutoff = Date.now() - CACHE_TTL * 2;
    const stale = this.db.all<{ cache_key: string }>(
      'SELECT cache_key FROM roamly_photo_cache_meta WHERE fetched_at < ?', cutoff,
    );

    for (const row of stale) {
      this.db.run('DELETE FROM roamly_photo_cache_meta WHERE cache_key = ?', row.cache_key);
      await this.storage.delete('photos-roamly', objectName(row.cache_key));
    }

    // Pass 2 (fix #4, spec rev 3.2): getFresh's expiry path deletes the meta
    // row but never the object — reclaim row-less .bin objects past the same
    // cutoff. The mtime guard spares an in-flight put (object lands before its
    // row); nested keys are skipped because the old readdir-free sweep could
    // never touch them either.
    for await (const stat of this.storage.list('photos-roamly')) {
      if (stat.key.includes('/') || !stat.key.endsWith('.bin') || stat.mtimeMs >= cutoff) continue;
      const key = stat.key.slice(0, -'.bin'.length);
      const row = this.db.get('SELECT 1 FROM roamly_photo_cache_meta WHERE cache_key = ?', key);
      if (!row) {
        await this.storage.delete('photos-roamly', stat.key).catch(() => { /* race */ });
      }
    }
  }
}
