import { expect, it, vi } from "vite-plus/test";
import { render } from "../../test/render";

const language = vi.hoisted(() => ({ value: "zh", listeners: new Set<() => void>() }));
vi.mock("../hooks/useSettings", () => ({
  getClientSettings: () => ({ language: language.value }),
  subscribeClientSettings: (listener: () => void) => {
    language.listeners.add(listener);
    return () => language.listeners.delete(listener);
  },
}));
import { startZhChrome } from "./zhChrome";

it("translates settings paragraphs and tooltip explanations, excludes user content, and supports repeated language switches", async () => {
  await using screen = await render(
    <>
      <div data-settings-page-scroll>
        <p>Combine matching repositories across environments.</p>
        <input defaultValue="Combine matching repositories across environments." />
        <pre>Combine matching repositories across environments.</pre>
      </div>
      <div role="tooltip">System default follows your browser or OS language.</div>
      <div data-message-id="user">Combine matching repositories across environments.</div>
    </>,
  );
  using _stop = {
    [Symbol.dispose]: () => {
      language.value = "en";
      for (const listener of language.listeners) listener();
    },
  };
  language.value = "zh";
  startZhChrome();
  await expect
    .element(screen.getByText("将不同环境中的同一仓库合并为一个项目分组。", { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("tooltip"))
    .toHaveTextContent("选择系统默认时，跟随浏览器或操作系统语言。");
  expect((screen.container.querySelector("input") as HTMLInputElement).value).toBe(
    "Combine matching repositories across environments.",
  );
  expect(screen.container.querySelector("pre")?.textContent).toBe(
    "Combine matching repositories across environments.",
  );
  expect(screen.container.querySelector("[data-message-id]")?.textContent).toBe(
    "Combine matching repositories across environments.",
  );
  language.value = "en";
  for (const listener of language.listeners) listener();
  await expect
    .element(screen.getByRole("tooltip"))
    .toHaveTextContent("System default follows your browser or OS language.");
  language.value = "zh";
  for (const listener of language.listeners) listener();
  await expect
    .element(screen.getByRole("tooltip"))
    .toHaveTextContent("选择系统默认时，跟随浏览器或操作系统语言。");
});
