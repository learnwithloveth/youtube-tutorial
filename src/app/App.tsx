import { Suspense } from 'react';
import { BrowserRouter, HashRouter, useRoutes } from 'react-router-dom';
import { ThemeProvider } from './providers/ThemeProvider';
import { ScrollToTop } from './ScrollToTop';
import { RouteFallback } from './RouteFallback';
import { ErrorBoundary } from './ErrorBoundary';
import { routes } from './router';

function Routes() {
  return useRoutes(routes);
}

/**
 * The site normally uses the History API. The single-file bundle is served from
 * arbitrary static hosts with no rewrite rule, so it falls back to hash routing
 * — selected at build time, so the unused router is tree-shaken out.
 */
const Router = import.meta.env.VITE_ROUTER === 'hash' ? HashRouter : BrowserRouter;

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <Router>
          <ScrollToTop />
          <Suspense fallback={<RouteFallback />}>
            <Routes />
          </Suspense>
        </Router>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
