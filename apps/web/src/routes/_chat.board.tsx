import { createFileRoute } from "@tanstack/react-router";

import { BoardPage } from "../components/board/BoardPage";

export const Route = createFileRoute("/_chat/board")({
  component: BoardPage,
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.dir === "string" ? { dir: search.dir } : {}),
    ...(typeof search.env === "string" ? { env: search.env } : {}),
    ...(typeof search.card === "string" ? { card: search.card } : {}),
    ...(typeof search.machine === "string" ? { machine: search.machine } : {}),
  }),
});
