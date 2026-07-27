import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * A step the user deleted used to come back on the next reload.
 *
 * The canvas autosaves a draft to localStorage on every structural change, but
 * the save was one-way: it wrote when there were steps and did nothing when
 * there were none. Deleting the last step therefore left the previous draft on
 * disk, and the next hydrate restored it.
 */

// The canvas store persists through zustand's `persist` middleware, which wants
// a real Storage. `environment: "node"` has none, so stand one up.
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

// Nothing here should reach the network. Any call that does is a test bug.
vi.mock("@/lib/api", () => ({
  api: {
    workflows: {
      get: vi.fn(async () => {
        throw new Error("api.workflows.get should not be called in this test");
      }),
    },
  },
}));

const { useWorkflowStore } = await import("@/store/workflow");

const STORAGE_KEY = "flowys-workflow-storage";

/** What actually survives a reload: the persisted slice on disk. */
function persistedDraft() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return JSON.parse(raw).state?.draftWorkflow ?? null;
}

describe("draft autosave", () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkflowStore.getState().newWorkflow();
    useWorkflowStore.setState({ isHydrated: false });
  });

  it("records a draft when a step is added to an unsaved canvas", () => {
    useWorkflowStore.getState().addNode("logic", { x: 0, y: 0 });

    expect(useWorkflowStore.getState().nodes).toHaveLength(1);
    expect(persistedDraft()?.nodes ?? []).toHaveLength(1);
  });

  it("clears the stored draft when the last step is deleted", () => {
    const store = useWorkflowStore.getState();
    store.addNode("logic", { x: 0, y: 0 });
    const [node] = useWorkflowStore.getState().nodes;

    useWorkflowStore
      .getState()
      .onNodesChange([{ type: "remove", id: node.id }]);

    expect(useWorkflowStore.getState().nodes).toHaveLength(0);
    expect(persistedDraft()?.nodes ?? []).toHaveLength(0);
  });

  it("clears the stored draft when the canvas is cleared", () => {
    useWorkflowStore.getState().addNode("logic", { x: 0, y: 0 });

    useWorkflowStore.getState().clearCanvas();

    expect(useWorkflowStore.getState().nodes).toHaveLength(0);
    expect(persistedDraft()?.nodes ?? []).toHaveLength(0);
  });

  it("clears the stored draft when the only step is undone", () => {
    useWorkflowStore.getState().addNode("logic", { x: 0, y: 0 });

    useWorkflowStore.getState().undo();

    expect(useWorkflowStore.getState().nodes).toHaveLength(0);
    expect(persistedDraft()?.nodes ?? []).toHaveLength(0);
  });

  it("restores the stored draft when an undone step is redone", () => {
    useWorkflowStore.getState().addNode("logic", { x: 0, y: 0 });
    useWorkflowStore.getState().undo();

    useWorkflowStore.getState().redo();

    expect(useWorkflowStore.getState().nodes).toHaveLength(1);
    expect(persistedDraft()?.nodes ?? []).toHaveLength(1);
  });

  it("does not restore a deleted step on the next hydrate", async () => {
    // Session one: add a step, then delete it. The canvas is empty.
    useWorkflowStore.getState().addNode("logic", { x: 0, y: 0 });
    const [node] = useWorkflowStore.getState().nodes;
    useWorkflowStore
      .getState()
      .onNodesChange([{ type: "remove", id: node.id }]);

    // Session two: a reload rebuilds state from what is on disk.
    const carried = persistedDraft();
    useWorkflowStore.setState({
      nodes: [],
      edges: [],
      workflow: null,
      currentWorkflowId: null,
      draftWorkflow: carried,
      isHydrated: false,
    });

    await useWorkflowStore.getState().hydrateFromStorage();

    expect(useWorkflowStore.getState().nodes).toHaveLength(0);
  });
});
