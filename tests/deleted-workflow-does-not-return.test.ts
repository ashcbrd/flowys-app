import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Deleting a workflow left its id in the URL, and the canvas came back on reload.
 *
 * The delete itself was never the problem: the row really is removed from the
 * database. Everything that resurrected it lived in the browser.
 *
 * Three defects, all reproduced below:
 *
 * 1. `hydrateFromStorage` announced `isHydrated: true` on its first line and
 *    then awaited a fetch. The editor waits on that flag before loading the
 *    workflow named in the URL, so both ran at once and the later `set()` won
 *    arbitrarily.
 * 2. A failed load left `currentWorkflowId` and the draft on disk, so the next
 *    reload restored the canvas of a workflow that no longer exists.
 * 3. Nothing recorded that an id had been deleted, so a draft saved after the
 *    delete was still hydrated against the dead id.
 */

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  key(i: number) {
    return Array.from(this.map.keys())[i] ?? null;
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
}

vi.stubGlobal("localStorage", new MemoryStorage());

const getWorkflow = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    workflows: {
      get: (id: string) => getWorkflow(id),
    },
  },
}));

const { useWorkflowStore } = await import("@/store/workflow");

const DELETED_ID = "b63b2ced-c703-476b-8c38-046599f60fba";

const node = (id: string) => ({
  id,
  type: "logic",
  position: { x: 0, y: 0 },
  data: { label: "Step", config: {} },
});

function reset() {
  localStorage.clear();
  getWorkflow.mockReset();
  useWorkflowStore.setState({
    nodes: [],
    edges: [],
    workflow: null,
    currentWorkflowId: null,
    draftWorkflow: null,
    workflowStatus: "draft",
    isHydrated: false,
    history: [],
    historyIndex: -1,
  });
}

describe("a deleted workflow does not come back", () => {
  beforeEach(reset);

  it("clears the canvas and the stored id when the open workflow is deleted", () => {
    useWorkflowStore.setState({
      currentWorkflowId: DELETED_ID,
      nodes: [node("n1")] as never,
      workflowStatus: "saved",
    });

    useWorkflowStore.getState().forgetWorkflows([DELETED_ID]);

    const state = useWorkflowStore.getState();
    expect(state.currentWorkflowId).toBeNull();
    expect(state.nodes).toEqual([]);
    expect(state.draftWorkflow).toBeNull();
  });

  it("leaves a different open workflow alone", () => {
    useWorkflowStore.setState({
      currentWorkflowId: "other",
      nodes: [node("n1")] as never,
    });

    useWorkflowStore.getState().forgetWorkflows([DELETED_ID]);

    expect(useWorkflowStore.getState().currentWorkflowId).toBe("other");
    expect(useWorkflowStore.getState().nodes).toHaveLength(1);
  });

  // Defect 1
  it("is not hydrated until hydration has actually finished", async () => {
    useWorkflowStore.setState({ currentWorkflowId: DELETED_ID });

    let release!: () => void;
    getWorkflow.mockImplementation(
      () => new Promise((_, reject) => (release = () => reject(new Error("Workflow not found"))))
    );

    const pending = useWorkflowStore.getState().hydrateFromStorage();

    // The editor gates its own URL load on this flag. If it flips before the
    // fetch resolves, both run at once and the last write wins by luck.
    expect(useWorkflowStore.getState().isHydrated).toBe(false);

    release();
    await pending;

    expect(useWorkflowStore.getState().isHydrated).toBe(true);
  });

  // Defect 2
  it("forgets a workflow that no longer exists on the server", async () => {
    useWorkflowStore.setState({
      currentWorkflowId: DELETED_ID,
      draftWorkflow: { nodes: [node("ghost")] as never, edges: [], lastModified: "x" },
    });
    getWorkflow.mockRejectedValue(new Error("Workflow not found"));

    await useWorkflowStore.getState().hydrateFromStorage();

    const state = useWorkflowStore.getState();
    expect(state.currentWorkflowId).toBeNull();
    expect(state.draftWorkflow).toBeNull();
    expect(state.nodes).toEqual([]);
  });

  // Defect 3: the sequence from the bug report.
  it("does not restore a draft saved after the workflow was deleted", async () => {
    // Open a saved workflow, delete it, then keep editing on the dead URL.
    useWorkflowStore.setState({ currentWorkflowId: DELETED_ID, workflowStatus: "saved" });
    useWorkflowStore.getState().forgetWorkflows([DELETED_ID]);

    useWorkflowStore.setState({ nodes: [node("typed-after-delete")] as never });
    useWorkflowStore.getState().saveDraft();
    expect(useWorkflowStore.getState().draftWorkflow).not.toBeNull();

    // Reload the page, still sitting on /workflow/<deleted id>.
    useWorkflowStore.setState({ isHydrated: false, nodes: [], edges: [] });
    getWorkflow.mockRejectedValue(new Error("Workflow not found"));

    await useWorkflowStore.getState().hydrateFromStorage();
    await useWorkflowStore.getState().openWorkflowFromUrl(DELETED_ID);

    const state = useWorkflowStore.getState();
    expect(state.nodes).toEqual([]);
    expect(state.currentWorkflowId).toBeNull();
  });

  it("still opens a workflow that does exist", async () => {
    getWorkflow.mockResolvedValue({
      id: "alive",
      name: "Alive",
      nodes: [node("n1")],
      edges: [],
    });

    await useWorkflowStore.getState().openWorkflowFromUrl("alive");

    const state = useWorkflowStore.getState();
    expect(state.currentWorkflowId).toBe("alive");
    expect(state.nodes).toHaveLength(1);
    expect(state.workflowStatus).toBe("saved");
  });

  it("reports whether the url workflow could be opened, so the caller can redirect", async () => {
    getWorkflow.mockRejectedValue(new Error("Workflow not found"));
    await expect(
      useWorkflowStore.getState().openWorkflowFromUrl(DELETED_ID)
    ).resolves.toBe(false);

    getWorkflow.mockResolvedValue({ id: "alive", name: "A", nodes: [], edges: [] });
    await expect(useWorkflowStore.getState().openWorkflowFromUrl("alive")).resolves.toBe(true);
  });
});
