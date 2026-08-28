export type BucketOptions = {
  capacity: number;
  refillPerSecond: number;
};

/**
 * One per connection. Stroke traffic is bursty by nature, so the bucket has to
 * tolerate a burst while still capping the sustained rate.
 */
export class TokenBucket {
  #tokens: number;
  #lastRefill = 0;
  readonly #capacity: number;
  readonly #refillPerMs: number;

  constructor({ capacity, refillPerSecond }: BucketOptions) {
    this.#capacity = capacity;
    this.#tokens = capacity;
    this.#refillPerMs = refillPerSecond / 1000;
  }

  take(now: number, cost = 1): boolean {
    // a backwards clock must not mint tokens
    const elapsed = Math.max(0, now - this.#lastRefill);
    this.#lastRefill = now;
    this.#tokens = Math.min(this.#capacity, this.#tokens + elapsed * this.#refillPerMs);
    if (this.#tokens < cost) return false;
    this.#tokens -= cost;
    return true;
  }
}
