import { describe, expect, it } from "vitest";
import {
  createHarnessContext,
  createServiceKey,
  DisposableCollection,
  HarnessPlugin,
  PluginManager,
} from "../src/index.js";

describe("Canva Harness Runtime Core", () => {
  it("registers and retrieves services with disposables", () => {
    const ctx = createHarnessContext();
    const testKey = createServiceKey<string>("test.service");

    const disposable = ctx.services.register(testKey, "hello-canva");
    expect(ctx.services.get(testKey)).toBe("hello-canva");

    disposable.dispose();
    expect(() => ctx.services.get(testKey)).toThrow("Service not found");
  });

  it("unwinds disposables in LIFO order", async () => {
    const log: number[] = [];
    const collection = new DisposableCollection();

    collection.push(() => {
      log.push(1);
    });
    collection.push(() => {
      log.push(2);
    });
    collection.push(() => {
      log.push(3);
    });

    await collection.dispose();
    expect(log).toEqual([3, 2, 1]);
  });

  it("loads, tracks provenance, and unloads plugins reversibly", async () => {
    const ctx = createHarnessContext();
    const pm = new PluginManager(ctx);

    const testKey = createServiceKey<{ inspect: () => string }>("canva.inspect");

    const plugin: HarnessPlugin = {
      manifest: {
        id: "canva-inspector-plugin",
        name: "Canva Inspector",
        version: "1.0.0",
      },
      setup: (c) => {
        const d = c.services.register(testKey, { inspect: () => "inspection-result" });
        c.disposables.push(d);
      },
    };

    await pm.load(plugin);
    expect(ctx.services.get(testKey).inspect()).toBe("inspection-result");
    expect(ctx.provenance.getProvenance("canva-inspector-plugin")).toBe("canva-inspector-plugin");

    await pm.unload("canva-inspector-plugin");
    expect(() => ctx.services.get(testKey)).toThrow("Service not found");
  });

  it("unloads dependents before the plugin they depend on (LIFO across dep chain)", async () => {
    const ctx = createHarnessContext();
    const pm = new PluginManager(ctx);

    const order: string[] = [];
    ctx.events.on("plugin.unloaded", (p: { id: string }) => {
      order.push(p.id);
    });

    const a: HarnessPlugin = {
      manifest: { id: "a", name: "A", version: "1.0.0" },
      setup: () => {},
    };
    const b: HarnessPlugin = {
      manifest: { id: "b", name: "B", version: "1.0.0", dependencies: ["a"] },
      setup: () => {},
    };
    const c: HarnessPlugin = {
      manifest: { id: "c", name: "C", version: "1.0.0", dependencies: ["b"] },
      setup: () => {},
    };

    await pm.load(a);
    await pm.load(b);
    await pm.load(c);

    await pm.unload("a");
    expect(order).toEqual(["c", "b", "a"]);
  });

  it("PluginManager.unload throws for unknown plugins", async () => {
    const ctx = createHarnessContext();
    const pm = new PluginManager(ctx);
    await expect(pm.unload("not-loaded")).rejects.toThrow("Plugin not loaded: not-loaded");
  });
});
