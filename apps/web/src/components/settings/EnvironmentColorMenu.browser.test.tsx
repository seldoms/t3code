import { EnvironmentId, type ServerConfig } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { EnvironmentColorMenu } from "./EnvironmentIconPicker";
import { Menu, MenuPopup, MenuTrigger } from "../ui/menu";

const writes = vi.hoisted(() => ({ patch: null as unknown }));
const catalog = vi.hoisted(() => ({ entries: [] as unknown[] }));

vi.mock("../../hooks/useSettings", () => ({
  useUpdateEnvironmentSettings: () => (patch: unknown) => {
    writes.patch = patch;
  },
}));
vi.mock("../../state/session", () => ({ useEnvironmentScope: () => true }));
vi.mock("../../state/environments", () => ({
  useEnvironments: () => ({ environments: catalog.entries }),
}));

const localId = EnvironmentId.make("env-local");
const remoteId = EnvironmentId.make("env-remote");

function entry(environmentId: EnvironmentId, environmentColor: string | null) {
  return {
    environmentId,
    serverConfig: {
      environment: { label: environmentId },
      settings: { environmentColor },
    },
  };
}

const serverConfig = { environment: { label: "local" } } as unknown as ServerConfig;

it("lets the local machine pick a colour and never offers a status colour", async () => {
  catalog.entries = [entry(localId, null), entry(remoteId, "steel")];
  writes.patch = null;
  await using screen = await render(
    <Menu open>
      <MenuTrigger>机器</MenuTrigger>
      <MenuPopup>
        <EnvironmentColorMenu environmentId={localId} serverConfig={serverConfig} />
      </MenuPopup>
    </Menu>,
  );
  await userEvent.hover(screen.getByRole("menuitem", { name: /颜色/ }));
  await vi.waitFor(() => expect(screen.getByRole("menuitemradio").all().length).toBe(8));
  const choices = screen.getByRole("menuitemradio").all();
  expect(choices.length).toBe(8);
  for (const choice of choices) {
    expect(["绿色", "红色", "黄色"]).not.toContain(choice.element().textContent);
  }
  // 别的机器显式选过的钢青禁选，其余都能点，本机不再被钉死。
  expect(screen.getByRole("menuitemradio", { name: /钢青/ }).element()).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await userEvent.click(screen.getByRole("menuitemradio", { name: /陶土/ }));
  expect(writes.patch).toEqual({ environmentColor: "clay" });
});
