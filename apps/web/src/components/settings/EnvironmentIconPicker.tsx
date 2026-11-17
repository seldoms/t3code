import {
  AuthSettingsWriteScope,
  ENVIRONMENT_COLOR_KINDS,
  ENVIRONMENT_MACHINE_KINDS,
  isEnvironmentColorKind,
  isEnvironmentMachineKind,
  resolveEnvironmentMachineKind,
  type EnvironmentColorKind,
  type EnvironmentId,
  type ServerConfig,
  type ServerSettings,
} from "@t3tools/contracts";

import {
  ENVIRONMENT_COLOR_LABELS,
  useEnvironmentColorChoices,
  useEnvironmentColors,
} from "../../environmentColors";
import { useUpdateEnvironmentSettings } from "../../hooks/useSettings";
import { useEnvironmentScope } from "../../state/session";
import { EnvironmentColorDot } from "../EnvironmentColorDot";
import { ENVIRONMENT_MACHINE_KIND_LABELS, EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import {
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
} from "../ui/menu";

/** 菜单只需要 environment 和 settings，两个配置类型都长这样。 */
interface EnvironmentMenuConfig {
  readonly environment: ServerConfig["environment"];
  readonly settings?: ServerSettings | null;
}

export function resolveEnvironmentIconPickerLock(input: {
  readonly serverConfig: EnvironmentMenuConfig | null;
  readonly operateAccess: "granted" | "denied" | "pending";
}): string | null {
  if (input.serverConfig === null) {
    return "Connect to this environment to change its icon.";
  }
  if (input.operateAccess !== "granted") {
    return "Your session on this environment cannot change its settings.";
  }
  return null;
}

export function EnvironmentIconMenu({
  environmentId,
  serverConfig,
}: {
  readonly environmentId: EnvironmentId;
  readonly serverConfig: EnvironmentMenuConfig | null;
}) {
  const updateSettings = useUpdateEnvironmentSettings(environmentId);
  const operateAccess = useEnvironmentScope(environmentId, AuthSettingsWriteScope)
    ? "granted"
    : "denied";
  const lock = resolveEnvironmentIconPickerLock({ serverConfig, operateAccess });
  const detected = serverConfig?.environment.platform.machine ?? "server";
  const resolved = resolveEnvironmentMachineKind(serverConfig);

  return (
    <MenuSub>
      <MenuSubTrigger>
        <EnvironmentMachineIcon kind={resolved} />
        图标
      </MenuSubTrigger>
      <MenuSubPopup>
        {lock !== null ? (
          <>
            <MenuItem disabled className="whitespace-normal">
              {lock}
            </MenuItem>
            <MenuSeparator />
          </>
        ) : null}
        <MenuRadioGroup
          value={resolved}
          onValueChange={(next) => {
            if (lock !== null || !isEnvironmentMachineKind(next)) return;
            updateSettings({ environmentIcon: next === detected ? null : next });
          }}
        >
          {ENVIRONMENT_MACHINE_KINDS.map((kind) => (
            <MenuRadioItem key={kind} value={kind} disabled={lock !== null}>
              <span className="flex min-w-0 items-center gap-2">
                <EnvironmentMachineIcon kind={kind} className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {ENVIRONMENT_MACHINE_KIND_LABELS[kind]}
                </span>
                {kind === detected ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {serverConfig?.environment.platform.machine ? "detected" : "default"}
                  </span>
                ) : null}
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuSubPopup>
    </MenuSub>
  );
}

/**
 * 机器标识色子菜单：本机和远程一样能挑素色。
 * 只有别的机器「显式选过」的颜色才禁选；自动分配的颜色会让位给用户的选择。
 */
export function EnvironmentColorMenu({
  environmentId,
  serverConfig,
}: {
  readonly environmentId: EnvironmentId;
  readonly serverConfig: EnvironmentMenuConfig | null;
}) {
  const colors = useEnvironmentColors();
  const choices = useEnvironmentColorChoices();
  const takenColors = new Set(
    [...choices.entries()]
      .filter(([id, color]) => id !== environmentId && color !== null)
      .map(([, color]) => color),
  );
  const updateSettings = useUpdateEnvironmentSettings(environmentId);
  const operateAccess = useEnvironmentScope(environmentId, AuthSettingsWriteScope)
    ? "granted"
    : "denied";
  const lock = resolveEnvironmentIconPickerLock({ serverConfig, operateAccess });
  const current = colors.get(environmentId) ?? "gray";

  return (
    <MenuSub>
      <MenuSubTrigger>
        <EnvironmentColorDot color={current} />
        颜色
      </MenuSubTrigger>
      <MenuSubPopup>
        {lock !== null ? (
          <>
            <MenuItem disabled className="whitespace-normal">
              {lock}
            </MenuItem>
            <MenuSeparator />
          </>
        ) : null}
        <MenuRadioGroup
          value={current}
          onValueChange={(next) => {
            if (
              lock !== null ||
              takenColors.has(next as EnvironmentColorKind) ||
              !isEnvironmentColorKind(next)
            )
              return;
            updateSettings({ environmentColor: next });
          }}
        >
          {ENVIRONMENT_COLOR_KINDS.map((kind) => {
            const isTaken = takenColors.has(kind) && kind !== current;
            return (
              <MenuRadioItem key={kind} value={kind} disabled={lock !== null || isTaken}>
                <span className="flex min-w-0 items-center gap-2">
                  <EnvironmentColorDot color={kind} className="size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{ENVIRONMENT_COLOR_LABELS[kind]}</span>
                  {isTaken ? (
                    <span className="shrink-0 text-xs text-muted-foreground">已被占用</span>
                  ) : null}
                </span>
              </MenuRadioItem>
            );
          })}
        </MenuRadioGroup>
      </MenuSubPopup>
    </MenuSub>
  );
}
