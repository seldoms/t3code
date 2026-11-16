import type { EnvironmentColorKind } from "@t3tools/contracts";

import { ENVIRONMENT_COLOR_DOT_CLASS } from "../environmentColors";
import { cn } from "~/lib/utils";

/**
 * 机器标识色点：显示项目/会话时放在名字前面代替主机名。
 * gray 是「远程机器还没挑颜色」的回退，不参与设置里的调色板。
 */
export function EnvironmentColorDot({
  color,
  className,
}: {
  readonly color: EnvironmentColorKind | "gray";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        color === "gray" ? "bg-muted-foreground/40" : ENVIRONMENT_COLOR_DOT_CLASS[color],
        className,
      )}
    />
  );
}
