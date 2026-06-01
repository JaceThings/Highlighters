import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { RootLayout } from "./RootLayout.tsx";
import { Home } from "./pages/Home.tsx";
import { Playground } from "./pages/Playground.tsx";

// CODE-BASED routing (no file-based router plugin). The root route renders the
// persistent app shell (RootLayout) whose <Outlet/> hosts the matched page.
const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Home,
});

const playgroundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/playground",
  component: Playground,
});

// Catch-all: unknown paths redirect home, mirroring the old
// <Route path="*" element={<Navigate to="/" replace />} />. beforeLoad throws
// before the (never-rendered) component, so it never flashes a 404.
const catchAllRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$",
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  playgroundRoute,
  catchAllRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
