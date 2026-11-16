import { readDesktopPrimaryBearerToken } from "./desktopAuth";
import { resolvePrimaryEnvironmentHttpUrl } from "./target";

function isSameOriginBrowserPrimary(): boolean {
  if (
    typeof window === "undefined" ||
    window.desktopBridge !== undefined ||
    !window.location.origin.startsWith("http")
  ) {
    return false;
  }
  return new URL(resolvePrimaryEnvironmentHttpUrl("/")).origin === window.location.origin;
}

/**
 * 原始 HTTP 接口（看板/指标/容器）的认证请求，规则与 httpLayer 一致：
 * 同源浏览器带 cookie，桌面端带 bearer。这些接口已挂环境鉴权，不能再匿名读。
 */
export async function primaryRawFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const auth: RequestInit = isSameOriginBrowserPrimary()
    ? { credentials: "include" }
    : await (async () => {
        const token = await readDesktopPrimaryBearerToken();
        return {
          credentials: "omit" as const,
          ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
        };
      })();
  return fetch(url, {
    ...init,
    ...auth,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      ...(auth.headers as Record<string, string> | undefined),
    },
  });
}
