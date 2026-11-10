import {
  breadcrumbsIntegration,
  dedupeIntegration,
  globalHandlersIntegration,
  httpContextIntegration,
  init,
  linkedErrorsIntegration,
} from "@sentry/browser";
import {
  BROWSER_SENTRY_DSN,
  scrubBreadcrumb,
  scrubEvent,
  sentryDataCollection,
} from "./sentry-scrub";

/**
 * Browser Sentry (P0-13), loaded lazily from src/instrumentation-client.ts when NEXT_PUBLIC_SENTRY_ENABLED.
 * Errors only: no tracing, replay, sessions or client reports (each would be a request per page load against
 * the tunnel's per-IP limit). Integrations listed explicitly (ENGINEERING §14, DECISIONS P0-13 Sentry): uncaught
 * errors and rejections, linked causes, dedupe, page URL/user agent (scrubbed), and breadcrumbs (no console
 * breadcrumbs: that is a separate integration we do not add). Events go to our tunnel, scrubbed here and again there, at most 10 per page load.
 */
const MAX_EVENTS_PER_PAGE = 10;

export function initBrowserSentry(): void {
  let sent = 0;
  init({
    dsn: BROWSER_SENTRY_DSN,
    tunnel: "/api/monitoring",
    defaultIntegrations: false,
    integrations: [
      globalHandlersIntegration({ onerror: true, onunhandledrejection: true }),
      linkedErrorsIntegration(),
      dedupeIntegration(),
      httpContextIntegration(),
      breadcrumbsIntegration({ dom: true, fetch: true, history: true, xhr: true, sentry: false }),
    ],
    sendClientReports: false,
    dataCollection: sentryDataCollection(),
    sampleRate: 1,
    maxBreadcrumbs: 30,
    beforeSend(event) {
      if (sent >= MAX_EVENTS_PER_PAGE) return null;
      sent++;
      return scrubEvent(event);
    },
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
  });
}
