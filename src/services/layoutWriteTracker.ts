/** What a read saw of the write counts when it started; see `LayoutWriteTracker`. */
export type LayoutReadToken = ReadonlyMap<string, number>;

/**
 * Counts layout-changing writes per document (list or show). A read takes a token before it
 * starts and only saves the layout it loaded if no write to that same document happened while
 * it was in flight, so a slow read can't replace a newer layout, and writes to other documents
 * don't stop it from saving one.
 */
export class LayoutWriteTracker {
  private readonly counts = new Map<string, number>();

  startRead(): LayoutReadToken {
    return new Map(this.counts);
  }

  recordWrite(key: string): void {
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }

  isCurrent(key: string, token: LayoutReadToken): boolean {
    return (this.counts.get(key) ?? 0) === (token.get(key) ?? 0);
  }
}
