/**
 * Persistence backends. The app only talks to this tiny async key/value
 * interface, so swapping localStorage for a real database (IndexedDB, a REST
 * API, Supabase, …) means implementing three methods.
 */
export interface PersistenceBackend {
  load<T>(key: string): Promise<T | undefined>
  save<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
}

/** Browser localStorage, namespaced by a prefix. */
export class LocalStorageBackend implements PersistenceBackend {
  private readonly prefix: string
  constructor(prefix = 'quantoa:') {
    this.prefix = prefix
  }

  async load<T>(key: string): Promise<T | undefined> {
    try {
      const raw = localStorage.getItem(this.prefix + key)
      return raw === null ? undefined : (JSON.parse(raw) as T)
    } catch {
      return undefined
    }
  }

  async save<T>(key: string, value: T): Promise<void> {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value))
    } catch (e) {
      // Quota exceeded or storage disabled: keep running in memory.
      console.warn('QuantOA: could not persist', key, e)
    }
  }

  async remove(key: string): Promise<void> {
    try {
      localStorage.removeItem(this.prefix + key)
    } catch {
      /* ignore */
    }
  }
}

/** In-memory backend for tests and private browsing fallbacks. */
export class MemoryBackend implements PersistenceBackend {
  readonly data = new Map<string, string>()
  async load<T>(key: string): Promise<T | undefined> {
    const raw = this.data.get(key)
    return raw === undefined ? undefined : (JSON.parse(raw) as T)
  }
  async save<T>(key: string, value: T): Promise<void> {
    this.data.set(key, JSON.stringify(value))
  }
  async remove(key: string): Promise<void> {
    this.data.delete(key)
  }
}
