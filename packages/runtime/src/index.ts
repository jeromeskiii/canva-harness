// @canva-harness/runtime
export interface Disposable {
  dispose(): void | Promise<void>;
}

export class DisposableCollection implements Disposable {
  private readonly items: Disposable[] = [];

  push(...items: (Disposable | (() => void | Promise<void>))[]): void {
    for (const item of items) {
      if (typeof item === "function") {
        this.items.push({ dispose: item });
      } else {
        this.items.push(item);
      }
    }
  }

  async dispose(): Promise<void> {
    // Unwind in LIFO order
    while (this.items.length > 0) {
      const item = this.items.pop();
      if (item) {
        await item.dispose();
      }
    }
  }
}

export interface ServiceKey<T> {
  readonly name: string;
  readonly description?: string;
}

export function createServiceKey<T>(name: string, description?: string): ServiceKey<T> {
  return { name, description };
}

export class ServiceRegistry {
  private readonly services = new Map<string, unknown>();
  private readonly disposers = new Map<string, () => void>();

  register<T>(key: ServiceKey<T>, provider: T): Disposable {
    if (this.services.has(key.name)) {
      throw new Error(`Service already registered: ${key.name}`);
    }
    this.services.set(key.name, provider);
    const disposer = () => {
      this.services.delete(key.name);
      this.disposers.delete(key.name);
    };
    this.disposers.set(key.name, disposer);
    return { dispose: disposer };
  }

  get<T>(key: ServiceKey<T>): T {
    const service = this.services.get(key.name);
    if (!service) {
      throw new Error(`Service not found: ${key.name}`);
    }
    return service as T;
  }

  has<T>(key: ServiceKey<T>): boolean {
    return this.services.has(key.name);
  }

  list(): readonly string[] {
    return Array.from(this.services.keys());
  }
}

export type EventHandler<T = unknown> = (payload: T) => void | Promise<void>;

export class EventBus {
  private readonly listeners = new Map<string, Set<EventHandler<any>>>();

  on<T>(event: string, handler: EventHandler<T>): Disposable {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);

    return {
      dispose: () => {
        set?.delete(handler);
        if (set?.size === 0) {
          this.listeners.delete(event);
        }
      },
    };
  }

  async emit<T>(event: string, payload: T): Promise<void> {
    const set = this.listeners.get(event);
    if (set) {
      for (const handler of Array.from(set)) {
        await handler(payload);
      }
    }

    const wildcard = this.listeners.get("*");
    if (wildcard) {
      for (const handler of Array.from(wildcard)) {
        await handler({ event, payload });
      }
    }
  }
}

export interface PluginManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly dependencies?: readonly string[];
}

export interface HarnessContext {
  readonly services: ServiceRegistry;
  readonly events: EventBus;
  readonly disposables: DisposableCollection;
  readonly provenance: ProvenanceTracker;
}

export interface HarnessPlugin {
  readonly manifest: PluginManifest;
  setup(ctx: HarnessContext): void | Promise<void>;
}

export class ProvenanceTracker {
  private readonly records: { capability: string; pluginId: string; timestamp: number }[] = [];

  record(capability: string, pluginId: string): void {
    this.records.push({ capability, pluginId, timestamp: Date.now() });
  }

  getProvenance(capability: string): string | undefined {
    return this.records.find((r) => r.capability === capability)?.pluginId;
  }

  all(): readonly { capability: string; pluginId: string; timestamp: number }[] {
    return [...this.records];
  }
}

export class PluginManager {
  private readonly loaded = new Map<string, HarnessPlugin>();
  private readonly pluginDisposers = new Map<string, DisposableCollection>();

  constructor(private readonly ctx: HarnessContext) {}

  async load(plugin: HarnessPlugin): Promise<void> {
    const id = plugin.manifest.id;
    if (this.loaded.has(id)) {
      throw new Error(`Plugin already loaded: ${id}`);
    }

    // Verify dependencies
    if (plugin.manifest.dependencies) {
      for (const dep of plugin.manifest.dependencies) {
        if (!this.loaded.has(dep)) {
          throw new Error(`Missing dependency for ${id}: ${dep}`);
        }
      }
    }

    const disposables = new DisposableCollection();
    this.pluginDisposers.set(id, disposables);

    // Provide a scoped context tracking disposables
    const scopedCtx: HarnessContext = {
      services: this.ctx.services,
      events: this.ctx.events,
      disposables,
      provenance: this.ctx.provenance,
    };

    await plugin.setup(scopedCtx);
    this.loaded.set(id, plugin);
    this.ctx.provenance.record(id, id);
    await this.ctx.events.emit("plugin.loaded", { id, name: plugin.manifest.name });
  }

  async unload(pluginId: string): Promise<void> {
    if (!this.loaded.has(pluginId)) {
      throw new Error(`Plugin not loaded: ${pluginId}`);
    }
    await this.unloadRecursive(pluginId);
  }

  /**
   * Recursively unload every loaded plugin that declares `pluginId` as a
   * dependency before unloading `pluginId` itself, so dependents are torn
   * down ahead of their dependencies. Each unload emits `plugin.unloaded`
   * so observers see the cascade in event order.
   */
  private async unloadRecursive(pluginId: string): Promise<void> {
    const dependents: string[] = [];
    for (const [id, other] of this.loaded) {
      if (id === pluginId) continue;
      if (other.manifest.dependencies?.includes(pluginId)) {
        dependents.push(id);
      }
    }
    for (const dep of dependents) {
      await this.unloadRecursive(dep);
    }

    const disposables = this.pluginDisposers.get(pluginId);
    if (disposables) {
      await disposables.dispose();
      this.pluginDisposers.delete(pluginId);
    }
    this.loaded.delete(pluginId);
    await this.ctx.events.emit("plugin.unloaded", { id: pluginId });
  }

  list(): readonly PluginManifest[] {
    return Array.from(this.loaded.values()).map((p) => p.manifest);
  }
}

export function createHarnessContext(): HarnessContext {
  return {
    services: new ServiceRegistry(),
    events: new EventBus(),
    disposables: new DisposableCollection(),
    provenance: new ProvenanceTracker(),
  };
}
