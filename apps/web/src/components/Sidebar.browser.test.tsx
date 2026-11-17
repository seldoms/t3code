import appCss from "../index.css?inline";
import type { EnvironmentServerConfig } from "@t3tools/client-runtime/connection";
import * as shelfHooks from "../state/olderSettledShelf";
import { createWorkspaceFocusController, workspaceAreaProps } from "../lib/workspaceFocus";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import {
  DEFAULT_CLIENT_SETTINGS,
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type AgentSessionListEntry,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { isMacPlatform } from "@t3tools/shared/keybindings";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { act, fakeTimers, render } from "../../test/render";
import { openCommandPalette } from "../commandPaletteBus";
import { makeThreadFixture } from "../test-fixtures";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { useNowMinute } from "../hooks/useNowMinute";
import { __setClientSettingsForTests, getClientSettings } from "../hooks/useSettings";
import { useThreadRouteTarget } from "../hooks/useThreadRouteTarget";
import { useProjects, useServerConfigs, useQuietThreadShells } from "../state/entities";
import { readEnvironmentScope, useEnvironmentScope } from "../state/session";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import { useTerminalUiStateStore } from "../terminalUiStateStore";
import type { Project } from "../types";
import Sidebar from "./Sidebar";
import { useSidebarHostFilter } from "../sidebarHostFilter";
import { useUiStateStore } from "../uiStateStore";
import { THREAD_JUMP_HINT_SHOW_DELAY_MS } from "./Sidebar.logic";
import { SortableThreadRow } from "./sidebar/SidebarThreadRow";
import { SidebarProvider } from "./ui/sidebar";

vi.mock(import("../state/olderSettledShelf"), async (original) => {
  const actual = await original();
  return { ...actual, useOlderSettledShelf: vi.fn(actual.useOlderSettledShelf) };
});
vi.mock("../state/entities", { spy: true });
vi.mock("../hooks/useHandleNewThread", { spy: true });
vi.mock("../hooks/useNowMinute", { spy: true });
vi.mock("../hooks/useThreadRouteTarget", { spy: true });
vi.mock("./sidebar/SidebarThreadRow", { spy: true });
vi.mock("../state/session", { spy: true });
vi.mock("../state/use-orchestration-command", { spy: true });
vi.mock(import("../state/server"), async (original) => {
  const { Atom } = await import("effect/reactivity");
  const { compileResolvedKeybindingsConfig } = await import("@t3tools/shared/keybindings");
  // The desktop defaults: holding Mod alone already matches a thread jump.
  const keybindings = compileResolvedKeybindingsConfig([
    { key: "mod+1", command: "thread.jump.1" },
    { key: "mod+2", command: "thread.jump.2" },
  ]);
  return { ...(await original()), primaryServerKeybindingsAtom: Atom.make(keybindings) };
});
vi.mock("../commandPaletteBus", () => ({
  openCommandPalette: vi.fn(),
  isCommandPaletteOpen: () => false,
}));
vi.mock("./sidebar/SidebarChrome", () => ({
  SidebarChromeHeader: () => null,
  SidebarChromeFooter: () => null,
}));

// The CLI session list is a remote query; tests drive it with a fixed atom value.
const cliSessionListMock = vi.hoisted(() => ({
  sessions: [] as AgentSessionListEntry[],
}));
vi.mock(import("../state/agentSessions"), async (original) => {
  const { AsyncResult, Atom } = await import("effect/reactivity");
  return {
    ...(await original()),
    agentSessionList: () =>
      Atom.make(AsyncResult.success({ sessions: cliSessionListMock.sessions })),
  };
});

function project(id: string): Project {
  return {
    id: ProjectId.make(id),
    environmentId: EnvironmentId.make("local"),
    title: id,
    workspaceRoot: `/projects/${id}`,
    repositoryIdentity: null,
    defaultModelSelection: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    scripts: [],
  };
}

describe("sidebar header new thread", () => {
  it.each([
    { mode: "normal", count: 2, shift: false, picker: true },
    { mode: "boring", count: 2, shift: false, picker: true },
    { mode: "boring", count: 2, shift: true, picker: false },
    { mode: "boring", count: 1, shift: false, picker: false },
  ] as const)("$mode sidebar, $count projects, shift=$shift: picker=$picker", async (scenario) => {
    using stack = new DisposableStack();
    const previousSettings = getClientSettings();
    stack.defer(() => __setClientSettingsForTests(previousSettings));
    __setClientSettingsForTests({
      ...DEFAULT_CLIENT_SETTINGS,
      boringSidebarEnabled: scenario.mode === "boring",
      sidebarDisplayMode: scenario.mode === "boring" ? "project-threads" : "threads",
    });
    const projects = [project("active"), project("idle")].slice(0, scenario.count);
    const currentProjectRef = {
      environmentId: projects[0]!.environmentId,
      projectId: projects[0]!.id,
    };
    const startThread = vi.fn().mockResolvedValue(null);
    vi.mocked(useProjects).mockReturnValue(projects);
    vi.mocked(useHandleNewThread).mockReturnValue({
      activeDraftThread: null,
      activeThread: null,
      defaultProjectRef: currentProjectRef,
      defaultProjectFallbackReady: true,
      handleNewThread: startThread,
      routeDraftId: null,
      routeThreadRef: null,
    });
    vi.mocked(openCommandPalette).mockClear();
    await using screen = await render(
      <SidebarProvider>
        <Sidebar routeReveal={{ observedKey: null, pendingKey: null }} />
      </SidebarProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "New thread", exact: true }), {
      modifiers: scenario.shift ? ["Shift"] : [],
    });

    if (scenario.picker) {
      expect(openCommandPalette).toHaveBeenCalledExactlyOnceWith({ open: "new-thread-in" });
      expect(startThread).not.toHaveBeenCalled();
    } else {
      expect(openCommandPalette).not.toHaveBeenCalled();
      expect(startThread).toHaveBeenCalledExactlyOnceWith(currentProjectRef);
    }
  });
});

function threadShell(projectId: ProjectId, index: number): EnvironmentThreadShell {
  return makeThreadFixture({
    environmentId: EnvironmentId.make("local"),
    id: ThreadId.make(`thread-${index}`),
    projectId,
    title: `Thread ${index}`,
  });
}

describe("sidebar render isolation", () => {
  // regression: #33100 Cmd+J re-rendered every sidebar row, which took hundreds of ms with many threads
  it("does not re-render thread rows when a quick Mod shortcut opens and focuses the terminal", async () => {
    using stack = new DisposableStack();
    const activeProject = project("active");
    const threads = Array.from({ length: 5 }, (_, index) => threadShell(activeProject.id, index));
    const routeThreadRef: ScopedThreadRef = {
      environmentId: activeProject.environmentId,
      threadId: threads[0]!.id,
    };
    threads.unshift(threadShell(activeProject.id, 100));
    // A real wall-clock minute tick mid-test re-renders every row and reads as a leak.
    vi.mocked(useNowMinute).mockReturnValue("2026-01-01T00:00");
    vi.mocked(useProjects).mockReturnValue([activeProject]);
    vi.mocked(useQuietThreadShells).mockReturnValue(threads);
    vi.mocked(useThreadRouteTarget).mockReturnValue({ kind: "server", threadRef: routeThreadRef });
    vi.mocked(useHandleNewThread).mockReturnValue({
      activeDraftThread: null,
      activeThread: null,
      defaultProjectRef: {
        environmentId: activeProject.environmentId,
        projectId: activeProject.id,
      },
      defaultProjectFallbackReady: true,
      handleNewThread: vi.fn().mockResolvedValue(null),
      routeDraftId: null,
      routeThreadRef,
    });
    const terminal = document.createElement("div");
    terminal.dataset.terminalOwner = "drawer";
    const terminalInput = document.createElement("textarea");
    terminal.append(terminalInput);
    document.body.append(terminal);
    stack.defer(() => terminal.remove());
    stack.defer(() => useTerminalUiStateStore.getState().setTerminalOpen(routeThreadRef, false));
    await using screen = await render(
      <SidebarProvider>
        <Sidebar routeReveal={{ observedKey: null, pendingKey: null }} />
      </SidebarProvider>,
    );
    await expect.element(screen.getByText("Thread 4").first()).toBeInTheDocument();
    const rowRenders = () => vi.mocked(SortableThreadRow).mock.calls.length;

    using _timers = fakeTimers();
    const modifier = isMacPlatform(navigator.platform) ? "Meta" : "Control";
    const beforeShortcut = rowRenders();
    await userEvent.keyboard(`{${modifier}>}`);
    await act(() => useTerminalUiStateStore.getState().setTerminalOpen(routeThreadRef, true));
    await act(() => terminalInput.focus());
    await userEvent.keyboard(`{/${modifier}}`);
    await act(() => terminalInput.blur());
    expect(
      rowRenders() - beforeShortcut,
      "thread rows re-rendered while opening the terminal with a quick Mod shortcut",
    ).toBe(0);

    const jumpLabelsSince = (start: number) =>
      vi
        .mocked(SortableThreadRow)
        .mock.calls.slice(start)
        .map(([props]) => props.jumpLabel)
        .filter((label) => label !== null);
    const beforeHold = rowRenders();
    await userEvent.keyboard(`{${modifier}>}`);
    await act(() => vi.advanceTimersByTime(THREAD_JUMP_HINT_SHOW_DELAY_MS));
    expect(jumpLabelsSince(beforeHold), "holding Mod showed no jump hints").toHaveLength(2);
    const beforeRelease = rowRenders();
    await userEvent.keyboard(`{/${modifier}}`);
    expect(rowRenders()).toBeGreaterThan(beforeRelease);
    expect(jumpLabelsSince(beforeRelease)).toEqual([]);
  });
});

describe("sidebar thread rename", () => {
  // regression: #35151 an untouched rename wrote back the title it opened with over a newer one
  it.each(["{Enter}", "{Tab}"])(
    "ending an untouched rename with %s keeps a title that arrived while it was open",
    async (finish) => {
      const activeProject = project("active");
      const routeThreadRef: ScopedThreadRef = {
        environmentId: activeProject.environmentId,
        threadId: ThreadId.make("thread-0"),
      };
      const shellTitled = (title: string) => ({ ...threadShell(activeProject.id, 0), title });
      const updateMetadata = vi.fn().mockResolvedValue({ _tag: "Success" });
      vi.mocked(useOrchestrationCommand).mockReturnValue(updateMetadata);
      vi.mocked(readEnvironmentScope).mockReturnValue(true);
      vi.mocked(useEnvironmentScope).mockReturnValue(true);
      vi.mocked(useProjects).mockReturnValue([activeProject]);
      vi.mocked(useQuietThreadShells).mockReturnValue([shellTitled("Fix the login redirect")]);
      vi.mocked(useThreadRouteTarget).mockReturnValue({
        kind: "server",
        threadRef: routeThreadRef,
      });
      vi.mocked(useHandleNewThread).mockReturnValue({
        activeDraftThread: null,
        activeThread: null,
        defaultProjectRef: {
          environmentId: activeProject.environmentId,
          projectId: activeProject.id,
        },
        defaultProjectFallbackReady: true,
        handleNewThread: vi.fn().mockResolvedValue(null),
        routeDraftId: null,
        routeThreadRef,
      });
      const tree = () => (
        <SidebarProvider>
          <Sidebar routeReveal={{ observedKey: null, pendingKey: null }} />
        </SidebarProvider>
      );
      await using screen = await render(tree());
      await userEvent.dblClick(screen.getByText("Fix the login redirect").first());
      const input = screen.getByRole("textbox", { name: "Thread title" });
      await expect.element(input).toHaveValue("Fix the login redirect");

      vi.mocked(useQuietThreadShells).mockReturnValue([shellTitled("Generated title")]);
      await screen.rerender(tree());
      await userEvent.keyboard(finish);

      await expect.element(input).not.toBeInTheDocument();
      expect(updateMetadata).not.toHaveBeenCalled();
    },
  );
});

describe("project tree and host scope", () => {
  it("nests all thread states under their project and applies an exclusive host filter", async () => {
    await page.viewport(1280, 800);
    using stack = new DisposableStack();
    const style = document.createElement("style");
    style.textContent = appCss;
    document.head.append(style);
    stack.defer(() => style.remove());
    const settings = getClientSettings();
    const filter = useSidebarHostFilter.getState();
    const ui = useUiStateStore.getState();
    stack.defer(() => __setClientSettingsForTests(settings));
    stack.defer(() => useSidebarHostFilter.setState(filter, true));
    stack.defer(() => useUiStateStore.setState(ui, true));
    __setClientSettingsForTests({
      ...DEFAULT_CLIENT_SETTINGS,
      sidebarDisplayMode: "project-threads",
    });
    useSidebarHostFilter.getState().select(null);
    useUiStateStore.setState({ projectExpandedById: {}, sidebarProjectScopeKeys: [] });
    const local = project("Mac Project");
    const remote = {
      ...project("VPS Project"),
      environmentId: EnvironmentId.make("vps"),
      workspaceRoot: "/vps/project",
    };
    const threads = [
      makeThreadFixture({
        environmentId: local.environmentId,
        projectId: local.id,
        id: ThreadId.make("local-tree"),
        title: "Mac conversation",
      }),
      makeThreadFixture({
        environmentId: remote.environmentId,
        projectId: remote.id,
        id: ThreadId.make("remote-tree"),
        title: "VPS conversation",
      }),
      makeThreadFixture({
        environmentId: remote.environmentId,
        projectId: remote.id,
        id: ThreadId.make("pinned-tree"),
        title: "Pinned VPS conversation",
        pinnedAt: "2026-01-01T00:00:00.000Z",
      }),
      makeThreadFixture({
        environmentId: remote.environmentId,
        projectId: remote.id,
        id: ThreadId.make("settled-tree"),
        title: "Settled VPS conversation",
        settledOverride: "settled",
        settledAt: "2026-01-01T00:00:00.000Z",
      }),
    ];
    vi.mocked(useProjects).mockReturnValue([local, remote]);
    vi.mocked(useQuietThreadShells).mockReturnValue(threads);
    vi.mocked(useNowMinute).mockReturnValue("2026-01-01T00:00");
    vi.mocked(useThreadRouteTarget).mockReturnValue(null);
    vi.mocked(useServerConfigs).mockReturnValue(
      new Map(
        [local, remote].map((entry) => [
          entry.environmentId,
          {
            environment: { capabilities: {} },
            settings: {},
            scratchWorkspaceRoot: null,
            shellThreadFamilies: false,
          } as unknown as EnvironmentServerConfig,
        ]),
      ),
    );
    vi.mocked(useHandleNewThread).mockReturnValue({
      activeDraftThread: null,
      activeThread: null,
      defaultProjectRef: { environmentId: remote.environmentId, projectId: remote.id },
      defaultProjectFallbackReady: true,
      handleNewThread: vi.fn().mockResolvedValue(null),
      routeDraftId: null,
      routeThreadRef: null,
    });
    await using screen = await render(
      <SidebarProvider>
        <Sidebar routeReveal={{ observedKey: null, pendingKey: null }} />
      </SidebarProvider>,
    );
    await expect.element(screen.getByText("Mac conversation", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("VPS conversation", { exact: true })).toBeVisible();
    await expect
      .element(screen.getByText("Pinned VPS conversation", { exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByText("Settled VPS conversation", { exact: true }))
      .toBeVisible();
    await act(() =>
      useSidebarHostFilter
        .getState()
        .select({ key: "vps", environmentId: remote.environmentId, name: "VPS" }),
    );
    await expect
      .element(screen.getByText("Mac conversation", { exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Mac Project", exact: true }))
      .not.toBeInTheDocument();
    const folder = screen.getByRole("button", { name: /^VPS Project/ });
    await act(() => (folder.element() as HTMLButtonElement).click());
    await expect.element(folder).toHaveAttribute("aria-expanded", "false");
    for (const title of ["VPS conversation", "Pinned VPS conversation", "Settled VPS conversation"])
      await expect.element(screen.getByText(title, { exact: true })).not.toBeInTheDocument();
    await act(() => (folder.element() as HTMLButtonElement).click());
    await expect
      .element(screen.getByText("Pinned VPS conversation", { exact: true }))
      .toBeVisible();
    await act(() =>
      useSidebarHostFilter
        .getState()
        .select({ key: "vps", environmentId: remote.environmentId, name: "VPS" }),
    );
    await expect.element(screen.getByText("Mac conversation", { exact: true })).toBeVisible();
  });
});

describe("sidebar settled pagination", () => {
  it("keeps the viewport in place when showing more settled threads", async () => {
    using stack = new DisposableStack();
    const previousSettings = getClientSettings();
    stack.defer(() => __setClientSettingsForTests(previousSettings));
    __setClientSettingsForTests({ ...DEFAULT_CLIENT_SETTINGS, sidebarDisplayMode: "threads" });
    const style = document.createElement("style");
    style.textContent = appCss;
    document.head.append(style);
    stack.defer(() => style.remove());
    const focusController = createWorkspaceFocusController(document);
    stack.defer(() => focusController.dispose());
    let loading = false;
    const originalShelf = vi.mocked(shelfHooks.useOlderSettledShelf).getMockImplementation()!;
    using _shelf = vi.spyOn(shelfHooks, "useOlderSettledShelf").mockImplementation((input) => ({
      ...originalShelf(input),
      loading,
      retry: () => {
        loading = true;
      },
    }));
    const activeProject = project("active");
    const threads = Array.from({ length: 70 }, (_, index) =>
      makeThreadFixture({
        environmentId: activeProject.environmentId,
        projectId: activeProject.id,
        id: ThreadId.make(`settled-${index}`),
        title: `Settled thread ${index}`,
        settledOverride: "settled",
        settledAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    threads.unshift(threadShell(activeProject.id, 100));
    vi.mocked(useProjects).mockReturnValue([activeProject]);
    vi.mocked(useQuietThreadShells).mockReturnValue(threads);
    vi.mocked(useThreadRouteTarget).mockReturnValue({
      kind: "server",
      threadRef: { environmentId: activeProject.environmentId, threadId: threads[0]!.id },
    });
    vi.mocked(useHandleNewThread).mockReturnValue({
      activeDraftThread: null,
      activeThread: null,
      defaultProjectRef: {
        environmentId: activeProject.environmentId,
        projectId: activeProject.id,
      },
      defaultProjectFallbackReady: true,
      handleNewThread: vi.fn().mockResolvedValue(null),
      routeDraftId: null,
      routeThreadRef: { environmentId: activeProject.environmentId, threadId: threads[0]!.id },
    });
    vi.mocked(useServerConfigs).mockReturnValue(
      new Map([
        [
          activeProject.environmentId,
          {
            scratchWorkspaceRoot: null,
            shellThreadFamilies: false,
          } as unknown as EnvironmentServerConfig,
        ],
      ]),
    );
    await using screen = await render(
      <SidebarProvider
        {...workspaceAreaProps("sidebar", 0, "Threads")}
        style={{ height: 400, minHeight: 400 }}
      >
        <Sidebar routeReveal={{ observedKey: null, pendingKey: null }} />
      </SidebarProvider>,
    );
    const shelf = screen.container.querySelector<HTMLElement>(
      '[data-sidebar-row="shelf:settled"]',
    )!;
    if (shelf.getAttribute("aria-expanded") === "false") await act(() => shelf.click());
    const more = screen.getByRole("button", { name: "Show 25 more", exact: true });
    await expect.element(more).toBeInTheDocument();
    const moreButton = more.element() as HTMLButtonElement;
    const viewport = moreButton.closest<HTMLElement>('[data-slot="scroll-area-viewport"]')!;
    viewport.style.height = "300px";
    viewport.style.maxHeight = "300px";
    moreButton.scrollIntoView({ block: "nearest" });
    const before = viewport.scrollTop;
    expect(before).toBeGreaterThan(0);
    moreButton.focus({ preventScroll: true });
    await act(() => moreButton.click());
    await expect
      .element(screen.getByRole("button", { name: "Loading", exact: true }))
      .toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Loading", exact: true }))
      .toHaveFocus();
    expect(viewport.scrollTop).toBe(before);
    const loadedRows = screen.container.querySelectorAll("[data-thread-item]").length;
    await act(() => moreButton.click());
    expect(screen.container.querySelectorAll("[data-thread-item]")).toHaveLength(loadedRows);
  });
});

function cliSession(overrides: Partial<AgentSessionListEntry>): AgentSessionListEntry {
  return {
    source: "codex",
    providerInstanceId: ProviderInstanceId.make("codex"),
    providerSessionId: "cli-session-1",
    title: null,
    model: null,
    lastActiveAtMs: 0,
    filePath: null,
    imported: false,
    importable: true,
    ...overrides,
  };
}

async function renderProjectCliSessions(
  stack: DisposableStack,
  sessions: readonly AgentSessionListEntry[],
) {
  const settings = getClientSettings();
  const uiState = useUiStateStore.getState();
  const hostFilter = useSidebarHostFilter.getState();
  stack.defer(() => __setClientSettingsForTests(settings));
  stack.defer(() => useUiStateStore.setState(uiState, true));
  stack.defer(() => useSidebarHostFilter.setState(hostFilter, true));
  stack.defer(() => {
    cliSessionListMock.sessions = [];
  });
  cliSessionListMock.sessions = [...sessions];
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    sidebarDisplayMode: "project-threads",
  });
  useSidebarHostFilter.getState().select(null);
  useUiStateStore.setState({ projectExpandedById: {}, sidebarProjectScopeKeys: [] });
  const activeProject = project("cli-sessions");
  vi.mocked(useProjects).mockReturnValue([activeProject]);
  vi.mocked(useQuietThreadShells).mockReturnValue([]);
  vi.mocked(useNowMinute).mockReturnValue("2026-01-01T00:00");
  vi.mocked(useThreadRouteTarget).mockReturnValue(null);
  vi.mocked(useServerConfigs).mockReturnValue(
    new Map([
      [
        activeProject.environmentId,
        {
          environment: { capabilities: {} },
          settings: {},
          scratchWorkspaceRoot: null,
          shellThreadFamilies: false,
        } as unknown as EnvironmentServerConfig,
      ],
    ]),
  );
  vi.mocked(useEnvironmentScope).mockReturnValue(true);
  vi.mocked(readEnvironmentScope).mockReturnValue(true);
  vi.mocked(useHandleNewThread).mockReturnValue({
    activeDraftThread: null,
    activeThread: null,
    defaultProjectRef: {
      environmentId: activeProject.environmentId,
      projectId: activeProject.id,
    },
    defaultProjectFallbackReady: true,
    handleNewThread: vi.fn().mockResolvedValue(null),
    routeDraftId: null,
    routeThreadRef: null,
  });
  return render(
    <SidebarProvider>
      <Sidebar routeReveal={{ observedKey: null, pendingKey: null }} />
    </SidebarProvider>,
  );
}

const cliSessionRows = (container: HTMLElement) =>
  Array.from(
    container.querySelectorAll<HTMLElement>('[data-testid="sidebar-project-session-row"]'),
  );

describe("project cli sessions", () => {
  it("renders one collapsed line until the section is opened", async () => {
    using stack = new DisposableStack();
    await using screen = await renderProjectCliSessions(stack, [
      cliSession({ providerSessionId: "a", title: "First session" }),
    ]);
    const toggle = screen.getByTestId("sidebar-project-sessions-toggle");
    await expect.element(toggle).toHaveAttribute("aria-expanded", "false");
    await expect.element(toggle).toHaveTextContent("CLI 会话 (1)");
    expect(cliSessionRows(screen.container)).toHaveLength(0);

    await userEvent.click(toggle);
    await expect.element(toggle).toHaveAttribute("aria-expanded", "true");
    expect(cliSessionRows(screen.container)).toHaveLength(1);
  });

  it("orders rows by last activity, newest first", async () => {
    using stack = new DisposableStack();
    await using screen = await renderProjectCliSessions(stack, [
      cliSession({
        providerSessionId: "oldest",
        title: "Oldest session",
        lastActiveAtMs: Date.parse("2026-01-01T00:00:10.000Z"),
      }),
      cliSession({
        providerSessionId: "newest",
        title: "Newest session",
        lastActiveAtMs: Date.parse("2026-01-01T00:00:30.000Z"),
      }),
      cliSession({
        providerSessionId: "middle",
        title: "Middle session",
        source: "cursor",
        providerInstanceId: ProviderInstanceId.make("cursor"),
        lastActiveAtMs: Date.parse("2026-01-01T00:00:20.000Z"),
      }),
    ]);
    await userEvent.click(screen.getByTestId("sidebar-project-sessions-toggle"));
    await expect.element(screen.getByText("Newest session", { exact: true })).toBeVisible();
    expect(cliSessionRows(screen.container).map((row) => row.getAttribute("aria-label"))).toEqual([
      "Codex: Newest session",
      "Cursor: Middle session",
      "Codex: Oldest session",
    ]);
  });

  it("disables a source without a driver and keeps importable rows clickable", async () => {
    using stack = new DisposableStack();
    await using screen = await renderProjectCliSessions(stack, [
      cliSession({
        providerSessionId: "qwen",
        title: "Qwen history",
        source: "qwenCode",
        providerInstanceId: ProviderInstanceId.make("qwenCode"),
        importable: false,
        lastActiveAtMs: Date.parse("2026-01-01T00:00:20.000Z"),
      }),
      cliSession({
        providerSessionId: "codex",
        title: "Codex history",
        lastActiveAtMs: Date.parse("2026-01-01T00:00:10.000Z"),
      }),
    ]);
    await userEvent.click(screen.getByTestId("sidebar-project-sessions-toggle"));
    const qwenRow = screen.getByRole("button", { name: "Qwen Code: Qwen history" });
    await expect.element(qwenRow).toBeDisabled();
    await expect.element(screen.getByText("仅历史", { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Codex: Codex history" }))
      .toBeEnabled();
  });
});
