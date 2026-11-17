import { describe, expect, it } from "vite-plus/test";
import { hostRates, type HostMetricsSnapshot } from "./useHostMetrics";

const snapshot = (overrides: Partial<HostMetricsSnapshot>): HostMetricsSnapshot =>
  ({ host: "Mac", receivedAt: 1000, ...overrides }) as HostMetricsSnapshot;

describe("hostRates", () => {
  it("derives byte rates from consecutive totals and rejects resets or gaps", () => {
    const previous = snapshot({
      receivedAt: 0,
      netRxTotal: 1000,
      netTxTotal: 2000,
      diskReadTotal: 5000,
      diskWriteTotal: 7000,
    });
    const rates = hostRates(previous, snapshot({ receivedAt: 2000, netRxTotal: 3000 }));
    expect(rates).toEqual({ netRx: 1000, netTx: null, diskRead: null, diskWrite: null });
    // 计数器清零（重启）不能算出负速率。
    expect(
      hostRates(
        snapshot({ receivedAt: 0, netRxTotal: 9000 }),
        snapshot({ receivedAt: 1000, netRxTotal: 1 }),
      )?.netRx,
    ).toBeNull();
    expect(hostRates(null, snapshot({ receivedAt: 1000, netRxTotal: 5 }))).toBeNull();
  });
});
