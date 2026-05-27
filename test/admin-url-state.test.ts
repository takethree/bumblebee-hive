import { readFile } from "node:fs/promises";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

class FakeElement {
  checked = false;
  dataset: Record<string, string> = {};
  hidden = false;
  innerHTML = "";
  textContent = "";
  value = "";
  listeners = new Map<string, EventListener>();
  options: Array<{ value: string }> = [];

  constructor(readonly id: string) {}

  addEventListener(type: string, listener: EventListener): void {
    this.listeners.set(type, listener);
  }

  closest(): null {
    return null;
  }
}

class FakeLocalStorage {
  values = new Map<string, string>([["hive.inventory.view", "observations"]]);

  getItem(key: string): string | null {
    return this.values.get(key) || null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function makeHarness(initialURL: string): {
  context: Record<string, unknown>;
  elements: Map<string, FakeElement>;
  packageViewInputs: FakeElement[];
  listeners: Map<string, EventListener>;
  pushes: string[];
  replaces: string[];
} {
  const elements = new Map<string, FakeElement>();
  const element = (id: string): FakeElement => {
    let found = elements.get(id);
    if (!found) {
      found = new FakeElement(id);
      elements.set(id, found);
    }
    return found;
  };
  element("device-status").value = "active";
  element("device-status").options = [{ value: "active" }, { value: "disabled" }, { value: "all" }];
  element("run-status").value = "";
  element("run-status").options = [{ value: "" }, { value: "complete" }, { value: "partial" }, { value: "error" }];
  for (const id of ["device-page-size", "run-page-size", "inventory-page-size", "detail-inventory-page-size"]) {
    element(id).value = "10";
    element(id).options = [{ value: "10" }, { value: "25" }, { value: "50" }, { value: "100" }];
  }
  const packageViewInputs = ["package", "summary", "observations"].map((value) => {
    const input = new FakeElement(`package-view-${value}`);
    input.value = value;
    return input;
  });
  const listeners = new Map<string, EventListener>();
  const pushes: string[] = [];
  const replaces: string[] = [];
  const location = new URL(initialURL);
  const setLocation = (next: string): void => {
    const url = new URL(next, location.href);
    location.href = url.href;
    location.pathname = url.pathname;
    location.search = url.search;
  };
  const fetchLog: string[] = [];

  const context: Record<string, unknown> = {
    URL,
    URLSearchParams,
    clearInterval,
    console,
    fetch: async (path: string) => {
      fetchLog.push(path);
      const pathname = String(path);
      const requestURL = new URL(pathname, "https://hive.example.test");
      const limit = Number.parseInt(requestURL.searchParams.get("limit") || "10", 10);
      const offset = Number.parseInt(requestURL.searchParams.get("offset") || "0", 10);
      const page = Math.floor(offset / limit) + 1;
      const pageMeta = { limit, offset, total: 100, page, page_count: Math.ceil(100 / limit), has_more: offset + limit < 100 };
      return {
        ok: true,
        json: async () => {
          if (pathname.includes("/overview")) {
            return { devices: { total: 1, active: 1, disabled: 0 }, runs: { total: 1, complete: 1, latest_received_at: null }, batches: { total: 1, records: 1 } };
          }
          if (pathname.includes("/health")) {
            return { counts: { healthy: 0, stale: 0, attention: 0, unknown: 0 }, config: { profile: "baseline", expected_cadence_hours: 6, stale_hours: 24, weekend_grace_hours: 48 }, devices: [] };
          }
          if (pathname.includes("/runs")) {
            return { runs: [], ...pageMeta };
          }
          if (pathname.includes("/packages/detail")) {
            return {
              package: {
                normalized_name: requestURL.searchParams.get("name"),
                ecosystem: requestURL.searchParams.get("ecosystem"),
                profiles: ["baseline"],
                version_count: 1,
                device_count: 1,
                total_occurrence_count: 1,
                package_managers: ["npm"],
                source_types: ["package-lock"],
                root_kinds: ["project_root"],
                direct_dependency_present: true,
                has_lifecycle_scripts: false,
                latest_observed_at: null
              },
              versions: [],
              devices: [],
              observation_count: 1,
              truncated: false
            };
          }
          if (pathname.includes("/packages")) {
            return { packages: [], ...pageMeta };
          }
          if (pathname.match(/\/devices\/[^/]+$/)) {
            const deviceID = decodeURIComponent(pathname.split("/").at(-1) || "");
            return { device: { device_id: deviceID, status: "active", run_count: 1, batch_count: 1, record_count: 1 }, lifecycle_events: [], recent_runs: [] };
          }
          if (pathname.includes("/devices")) {
            return { devices: [], ...pageMeta };
          }
          return {};
        }
      };
    },
    localStorage: new FakeLocalStorage(),
    setInterval,
    __hiveAdminTesting: true
  };
  context.window = {
    addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
    history: {
      pushState: (_state: unknown, _title: string, next: string) => {
        pushes.push(next);
        setLocation(next);
      },
      replaceState: (_state: unknown, _title: string, next: string) => {
        replaces.push(next);
        setLocation(next);
      }
    },
    location
  };
  context.document = {
    querySelector: (selector: string) => {
      if (!selector.startsWith("#")) {
        return new FakeElement(selector);
      }
      return element(selector.slice(1));
    },
    querySelectorAll: (selector: string) => selector === 'input[name="package-view"]' ? packageViewInputs : []
  };
  context.globalThis = context;
  context.__fetchLog = fetchLog;
  return { context, elements, packageViewInputs, listeners, pushes, replaces };
}

async function loadAdminApp(harness: ReturnType<typeof makeHarness>): Promise<Record<string, (...args: unknown[]) => unknown>> {
  const source = await readFile(join("public", "admin", "app.js"), "utf8");
  vm.runInNewContext(source, harness.context, { filename: "public/admin/app.js" });
  await Promise.resolve();
  await Promise.resolve();
  return harness.context.__hiveAdminTest as Record<string, (...args: unknown[]) => unknown>;
}

describe("admin URL state", () => {
  it("hydrates device and filters from path plus query parameters", async () => {
    const harness = makeHarness("https://hive.example.test/admin/devices/device-1?device_status=all&inventory_view=summary&package_query=left&ecosystem=npm&profile=baseline&selected_package=left-pad&selected_ecosystem=npm&selected_profile=baseline&selected_device=device-1&run_status=complete&run_profile=project");
    const admin = await loadAdminApp(harness);

    expect(harness.elements.get("device-status")?.value).toBe("all");
    expect(harness.elements.get("package-query")?.value).toBe("left");
    expect(harness.elements.get("package-ecosystem")?.value).toBe("npm");
    expect(harness.elements.get("package-profile")?.value).toBe("baseline");
    expect(harness.elements.get("run-status")?.value).toBe("complete");
    expect(harness.elements.get("run-profile")?.value).toBe("project");
    expect(harness.packageViewInputs.find((input) => input.value === "summary")?.checked).toBe(true);
    expect(admin.currentAdminPath()).toBe("/admin/devices/device-1?device_status=all&inventory_view=summary&package_query=left&ecosystem=npm&profile=baseline&selected_package=left-pad&selected_ecosystem=npm&selected_profile=baseline&selected_device=device-1&run_status=complete&run_profile=project");
  });

  it("pushes device paths, clears to dashboard, and restores Back/Forward state", async () => {
    const harness = makeHarness("https://hive.example.test/admin/?inventory_view=package");
    const admin = await loadAdminApp(harness);

    await admin.selectDevice("device:2");
    expect(harness.pushes.at(-1)).toBe("/admin/devices/device%3A2?inventory_view=package");

    harness.elements.get("package-query")!.value = "needle";
    admin.syncUrlState("replace");
    expect(harness.replaces.at(-1)).toBe("/admin/devices/device%3A2?inventory_view=package&package_query=needle");

    const location = (harness.context.window as { location: URL }).location;
    location.href = "https://hive.example.test/admin/devices/device-3?inventory_view=observations&run_status=error";
    location.pathname = "/admin/devices/device-3";
    location.search = "?inventory_view=observations&run_status=error";
    await admin.restoreFromLocation();

    expect(admin.currentAdminPath()).toBe("/admin/devices/device-3?inventory_view=observations&run_status=error");
    expect(harness.packageViewInputs.find((input) => input.value === "observations")?.checked).toBe(true);
    expect(harness.listeners.has("popstate")).toBe(true);
  });

  it("hydrates pagination params and pushes page changes into the URL", async () => {
    const harness = makeHarness("https://hive.example.test/admin/devices/device-1?page_size=25&inventory_view=package&device_page=2&inventory_page=3&run_page=4&detail_inventory_page=5");
    const admin = await loadAdminApp(harness);

    expect(harness.elements.get("device-page-size")?.value).toBe("25");
    expect(harness.elements.get("run-page-size")?.value).toBe("25");
    expect(harness.elements.get("inventory-page-size")?.value).toBe("25");
    expect(harness.elements.get("detail-inventory-page-size")?.value).toBe("25");
    expect(admin.currentAdminPath()).toBe("/admin/devices/device-1?device_page_size=25&device_page=2&inventory_view=package&inventory_page_size=25&inventory_page=3&run_page_size=25&run_page=4&detail_inventory_page_size=25&detail_inventory_page=5");

    await admin.setPage("inventoryPage", 6, async () => undefined);
    expect(harness.pushes.at(-1)).toBe("/admin/devices/device-1?device_page_size=25&device_page=2&inventory_view=package&inventory_page_size=25&inventory_page=6&run_page_size=25&run_page=4&detail_inventory_page_size=25&detail_inventory_page=5");
  });

  it("resets relevant page state when filters change", async () => {
    const harness = makeHarness("https://hive.example.test/admin/?inventory_view=summary&inventory_page=4&run_page=3&device_page=2");
    const admin = await loadAdminApp(harness);

    harness.elements.get("package-query")!.value = "needle";
    harness.elements.get("package-query")!.listeners.get("input")?.({} as Event);
    expect(admin.currentAdminPath()).toBe("/admin/?device_page=2&inventory_view=summary&package_query=needle&run_page=3");

    harness.elements.get("run-status")!.value = "complete";
    harness.elements.get("run-status")!.listeners.get("change")?.({} as Event);
    expect(admin.currentAdminPath()).toBe("/admin/?device_page=2&inventory_view=summary&package_query=needle&run_status=complete");
  });

  it("defaults to ten rows and resets only the target list when page size changes", async () => {
    const harness = makeHarness("https://hive.example.test/admin/?inventory_view=package&device_page=3&inventory_page=4&run_page=5");
    const admin = await loadAdminApp(harness);

    expect(admin.currentAdminPath()).toBe("/admin/?device_page=3&inventory_view=package&inventory_page=4&run_page=5");

    harness.elements.get("inventory-page-size")!.value = "50";
    await harness.elements.get("inventory-page-size")!.listeners.get("change")?.({} as Event);

    expect(admin.currentAdminPath()).toBe("/admin/?device_page=3&inventory_view=package&inventory_page_size=50&run_page=5");
    expect(harness.replaces.at(-1)).toBe("/admin/?device_page=3&inventory_view=package&inventory_page_size=50&run_page=5");
    expect((admin as unknown as { state: { inventoryPageSize: number; inventoryPage: number; runPage: number } }).state.inventoryPageSize).toBe(50);
    expect((admin as unknown as { state: { inventoryPageSize: number; inventoryPage: number; runPage: number } }).state.inventoryPage).toBe(1);
    expect((admin as unknown as { state: { inventoryPageSize: number; inventoryPage: number; runPage: number } }).state.runPage).toBe(5);
  });

  it("pushes and clears selected package detail state", async () => {
    const harness = makeHarness("https://hive.example.test/admin/?inventory_view=package");
    const admin = await loadAdminApp(harness);

    await admin.selectPackage({
      normalized_name: "left-pad",
      ecosystem: "npm",
      profile: "baseline",
      device_id: "device:2"
    });

    expect(harness.pushes.at(-1)).toBe("/admin/?inventory_view=package&selected_package=left-pad&selected_ecosystem=npm&selected_profile=baseline");
    expect(harness.elements.get("package-detail")?.hidden).toBe(false);

    admin.clearPackageSelection("push");
    expect(harness.pushes.at(-1)).toBe("/admin/?inventory_view=package");
    expect(harness.elements.get("package-detail")?.hidden).toBe(true);
  });
});
