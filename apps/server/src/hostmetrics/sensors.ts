/** 温度传感器的公共口径：本机与 SSH 远端共用，避免两处阈值/分类漂移。 */

/** 一个温度传感器读数。kind 决定告警阈值：电池和核心的量级完全不同。 */
export interface HostSensorReading {
  readonly label: string;
  readonly kind: "cpu" | "gpu" | "battery" | "board";
  readonly celsius: number;
}

/** 只接受物理上说得通的范围，挡掉驱动返回的 -273150 之类哨兵值。 */
export function saneCelsius(value: number): boolean {
  return Number.isFinite(value) && value > -20 && value < 150;
}

export function sensorKind(label: string): HostSensorReading["kind"] {
  if (/x86_pkg|coretemp|cpu|soc/i.test(label)) return "cpu";
  if (/gpu/i.test(label)) return "gpu";
  if (/batt/i.test(label)) return "battery";
  return "board";
}

export function roundCelsius(value: number): number {
  return Math.round(value * 10) / 10;
}
