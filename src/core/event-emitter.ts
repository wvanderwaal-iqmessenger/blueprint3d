/**
 * Simple event emitter replacing jQuery's $.Callbacks().
 * Maintains the same API: add(), remove(), fire().
 */
export class EventEmitter<T extends (...args: any[]) => void = () => void> {
  private listeners: T[] = [];

  /** Add a callback. */
  add(fn: T): void {
    if (!this.listeners.includes(fn)) {
      this.listeners.push(fn);
    }
  }

  /** Remove a callback. */
  remove(fn: T): void {
    const idx = this.listeners.indexOf(fn);
    if (idx !== -1) {
      this.listeners.splice(idx, 1);
    }
  }

  /** Fire all callbacks with the given arguments. */
  fire(...args: Parameters<T>): void {
    // Slice to allow safe removal during iteration
    this.listeners.slice().forEach(fn => fn(...args));
  }

  /** Remove all callbacks. */
  clear(): void {
    this.listeners = [];
  }
}
