import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { RootLayout } from "./RootLayout.tsx";
import { Home } from "./pages/Home.tsx";
import { Docs } from "./pages/Docs.tsx";
import { Squiggles } from "./pages/Squiggles.tsx";

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Home,
});

const docsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/docs",
  component: Docs,
});

const squigglesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/squiggles",
  component: Squiggles,
});

// Catch-all: unknown paths redirect home (beforeLoad throws, so no 404 flashes).
const catchAllRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$",
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  docsRoute,
  squigglesRoute,
  catchAllRoute,
]);

// Page cross-fade lives in React (PageFade.tsx), not the View Transitions API, so
// the shell never gets snapshot-animated and the dock can't flicker.
export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
