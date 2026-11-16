import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/**
 * 项目板的手动阶段覆盖。
 *
 * 看板的列默认由会话状态推导，这张列存的是用户拖拽后的显式选择：
 * 只要非空，就盖过推导值。存服务端而不是浏览器，多设备才看到同一块板。
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_projects)
  `;
  if (!columns.some((column) => column.name === "board_stage")) {
    yield* sql`
      ALTER TABLE projection_projects
      ADD COLUMN board_stage TEXT
    `;
  }
});
