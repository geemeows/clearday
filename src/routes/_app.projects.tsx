import { createFileRoute } from "@tanstack/react-router";
import { ProjectsPage } from "#/features/projects/components/ProjectsPage";

export const Route = createFileRoute("/_app/projects")({
  component: ProjectsPageRoute,
});

export function ProjectsPageRoute() {
  return (
    <main
      style={{
        flex: 1,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <ProjectsPage />
    </main>
  );
}
