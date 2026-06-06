import { Suspense, lazy } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { RootLayout } from "./RootLayout.tsx";
import { Home } from "./pages/Home.tsx";
import { Docs } from "./pages/Docs.tsx";

// Secondary pages, lazy so the perfect-freehand / playground deps they pull in stay out of the
// eager home bundle.
const Squiggles = lazy(() =>
  import("./pages/Squiggles.tsx").then((m) => ({ default: m.Squiggles })),
);
const QuoteReview = lazy(() =>
  import("./pages/QuoteReview.tsx").then((m) => ({ default: m.QuoteReview })),
);

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
  component: () => (
    <Suspense fallback={null}>
      <Squiggles />
    </Suspense>
  ),
});

const quoteReviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/quotes",
  component: () => (
    <Suspense fallback={null}>
      <QuoteReview />
    </Suspense>
  ),
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
  quoteReviewRoute,
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
