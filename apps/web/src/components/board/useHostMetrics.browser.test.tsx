import { StrictMode } from "react";
import { expect, it, vi } from "vite-plus/test";
import { act, fakeTimers, render } from "../../../test/render";
import { primaryRawFetch } from "../../environments/primary/rawFetch";
import { useHostMetrics } from "./useHostMetrics";

vi.mock("../../environments/primary/rawFetch", () => ({ primaryRawFetch: vi.fn() }));

function Snapshot() {
  const snapshot = useHostMetrics();
  return <output>{JSON.stringify(snapshot)}</output>;
}

it("retains a failed refresh as an old snapshot, recovers on the next poll and stops on unmount in StrictMode", async () => {
  const request = vi.mocked(primaryRawFetch);
  request.mockReset();
  request.mockImplementation(async () =>
    Response.json({ host: "remote", cpu: 10, sampledAt: 1000 }),
  );
  using _timers = fakeTimers();
  await using screen = await render(
    <StrictMode>
      <Snapshot />
    </StrictMode>,
  );
  await vi.waitFor(() => expect(screen.container.textContent).toContain('"cpu":10'));
  request.mockResolvedValue(new Response(null, { status: 503 }));
  await act(() => vi.advanceTimersByTimeAsync(2000));
  await vi.waitFor(() => expect(screen.container.textContent).toContain("refresh-failed"));
  expect(screen.container.textContent).toContain('"sampledAt":1000');
  request.mockImplementation(async () =>
    Response.json({ host: "remote", cpu: 40, sampledAt: 11000 }),
  );
  await act(() => vi.advanceTimersByTimeAsync(2000));
  await vi.waitFor(() => expect(screen.container.textContent).toContain('"cpu":40'));
  expect(screen.container.textContent).not.toContain("refresh-failed");
  await screen.unmount();
  const calls = request.mock.calls.length;
  await act(() => vi.advanceTimersByTimeAsync(10000));
  expect(request).toHaveBeenCalledTimes(calls);
});

it("shares one poll and one history across every consumer", async () => {
  const request = vi.mocked(primaryRawFetch);
  request.mockReset();
  request.mockImplementation(async () => Response.json({ host: "mac", cpu: 20, sampledAt: 1000 }));
  using _timers = fakeTimers();
  await using screen = await render(
    <>
      <Snapshot />
      <Snapshot />
      <Snapshot />
    </>,
  );
  await vi.waitFor(() => expect(screen.container.textContent).toContain('"cpu":20'));
  const before = request.mock.calls.length;
  await act(() => vi.advanceTimersByTimeAsync(2000));
  // 三个界面共用一条 2s 链：以前是各起一条，开四个界面就四倍请求和四倍重渲染。
  expect(request.mock.calls.length - before).toBe(1);
  await screen.unmount();
  const afterUnmount = request.mock.calls.length;
  await act(() => vi.advanceTimersByTimeAsync(10000));
  expect(request.mock.calls.length).toBe(afterUnmount);
});
