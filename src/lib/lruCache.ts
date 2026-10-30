/**
 * LRU cache with both an entry cap and an optional weight (byte / row) budget.
 *
 * A plain entry cap is not enough for cached objects whose size varies by orders
 * of magnitude: 20 cached file patches can be 20 KB or 60 MB. `weigh` lets the
 * caller express the real cost, so the cache keeps its promise under load.
 */
export interface LRUCacheOptions<V> {
  /** Approximate cost of one value; used together with `maxWeight`. */
  weigh?: (value: V) => number;
  /** Hard cap on the summed weight of all entries. */
  maxWeight?: number;
}

export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;
  private maxWeight: number | null;
  private weigh: ((value: V) => number) | null;
  private totalWeight = 0;

  constructor(maxSize: number, options: LRUCacheOptions<V> = {}) {
    this.maxSize = maxSize;
    this.weigh = options.weigh ?? null;
    this.maxWeight = this.weigh && options.maxWeight ? options.maxWeight : null;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    const existing = this.cache.get(key);
    if (existing !== undefined) {
      this.totalWeight -= this.weightOf(existing);
      this.cache.delete(key);
    }

    this.cache.set(key, value);
    this.totalWeight += this.weightOf(value);

    while (this.cache.size > this.maxSize) this.evictOldest();
    // Keep at least one entry so a single oversized value is still served once.
    while (this.maxWeight !== null && this.totalWeight > this.maxWeight && this.cache.size > 1) {
      this.evictOldest();
    }
  }

  delete(key: K): void {
    const existing = this.cache.get(key);
    if (existing === undefined) return;
    this.totalWeight -= this.weightOf(existing);
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.totalWeight = 0;
  }

  /** Cached keys, oldest first — used to drop every entry of one commit. */
  keys(): K[] {
    return [...this.cache.keys()];
  }

  get size(): number {
    return this.cache.size;
  }

  /** Summed weight of the cached values (0 when no `weigh` was given). */
  get weight(): number {
    return this.totalWeight;
  }

  private weightOf(value: V): number {
    return this.weigh ? this.weigh(value) : 0;
  }

  private evictOldest(): void {
    const firstKey = this.cache.keys().next().value;
    if (firstKey === undefined) return;
    this.delete(firstKey);
  }
}