import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
} from "@tanstack/react-router";
import { RootLayout } from "./RootLayout.tsx";
import { Home } from "./pages/Home.tsx";

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

// Lazy-loaded: "/" renders a blank shell (ruled paper + Dock), so the heavy
// playground (12 sections + its playground-only deps: @highlighters/react,
// @numeric-text, @lisse/react) is fetched only on navigation here — never in
// the initial bundle. The persistent RootLayout shell stays mounted during the
// fetch, so a cold /playground load shows the same blank shell, then the
// existing Stagger cascade plays exactly as before.
const playgroundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/playground",
  component: lazyRouteComponent(
    () => import("./pages/Playground.tsx"),
    "Playground",
  ),
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
