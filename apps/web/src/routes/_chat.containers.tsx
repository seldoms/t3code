import { createFileRoute } from "@tanstack/react-router";

import { ContainersPage } from "../components/containers/ContainersPage";

export const Route = createFileRoute("/_chat/containers")({
  component: ContainersPage,
});
