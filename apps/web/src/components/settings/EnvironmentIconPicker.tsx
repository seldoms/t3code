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
  useEnvironmentColors,
  useIsLocalEnvironment,
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
 * 机器标识色子菜单：本地固定绿色（禁改），远程机器从调色板里挑，
 * 已被别的机器占用的颜色禁选，避免两台机器同色分不清。
 */
export function EnvironmentColorMenu({
  environmentId,
  serverConfig,
}: {
  readonly environmentId: EnvironmentId;
  readonly serverConfig: EnvironmentMenuConfig | null;
}) {
  const isLocal = useIsLocalEnvironment(environmentId);
  const colors = useEnvironmentColors();
  const takenColors = new Set(
    [...colors.entries()].filter(([id]) => id !== environmentId).map(([, color]) => color),
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
        <EnvironmentColorDot color={current ?? (isLocal ? "green" : "gray")} />
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
          value={current ?? ""}
          onValueChange={(next) => {
            if (
              lock !== null ||
              isLocal ||
              next === "green" ||
              takenColors.has(next as EnvironmentColorKind) ||
              !isEnvironmentColorKind(next)
            )
              return;
            updateSettings({ environmentColor: next });
          }}
        >
          {ENVIRONMENT_COLOR_KINDS.map((kind) => {
            const isTaken = takenColors.has(kind) && kind !== current;
            const reserved = isLocal || kind === "green";
            return (
              <MenuRadioItem
                key={kind}
                value={kind}
                disabled={lock !== null || isTaken || reserved}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <EnvironmentColorDot color={kind} className="size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{ENVIRONMENT_COLOR_LABELS[kind]}</span>
                  {kind === "green" ? (
                    <span className="shrink-0 text-xs text-muted-foreground">本地</span>
                  ) : null}
                  {isTaken && !reserved ? (
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
