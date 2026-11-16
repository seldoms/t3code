import { EnvironmentId } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";
import { matchesSidebarHost, useSidebarHostFilter } from "./sidebarHostFilter";

it("uses exclusive host selection, deselection restores all, and unresolved SSH hosts do not expose other environments", () => {
  const old = useSidebarHostFilter.getState();
  using _restore = { [Symbol.dispose]: () => useSidebarHostFilter.setState(old, true) };
  const local = EnvironmentId.make("local");
  const remote = EnvironmentId.make("remote");
  const select = old.select;
  select(null);
  expect(matchesSidebarHost(local, useSidebarHostFilter.getState().selected)).toBe(true);
  expect(matchesSidebarHost(remote, useSidebarHostFilter.getState().selected)).toBe(true);
  select({ key: "remote", environmentId: remote, name: "VPS" });
  expect(matchesSidebarHost(local, useSidebarHostFilter.getState().selected)).toBe(false);
  expect(matchesSidebarHost(remote, useSidebarHostFilter.getState().selected)).toBe(true);
  select({ key: "local", environmentId: local, name: "Mac" });
  expect(matchesSidebarHost(remote, useSidebarHostFilter.getState().selected)).toBe(false);
  select({ key: "local", environmentId: local, name: "Mac" });
  expect(useSidebarHostFilter.getState().selected).toBeNull();
  select({ key: "unregistered", environmentId: null, name: "SSH only" });
  expect(matchesSidebarHost(local, useSidebarHostFilter.getState().selected)).toBe(false);
  expect(matchesSidebarHost(remote, useSidebarHostFilter.getState().selected)).toBe(false);
});
