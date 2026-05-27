type AnalyticsPayload = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

export function trackEvent(event: string, payload: AnalyticsPayload = {}) {
  if (typeof window === "undefined") return;
  const entry = { event, ...payload, at: new Date().toISOString() };
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(entry);
  try {
    const existing = JSON.parse(window.localStorage.getItem("insurance_analytics_events") ?? "[]") as Array<Record<string, unknown>>;
    window.localStorage.setItem("insurance_analytics_events", JSON.stringify([...existing.slice(-49), entry]));
  } catch {
    // Analytics must never break the user experience.
  }
}
