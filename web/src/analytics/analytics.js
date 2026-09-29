// ---------------------------------------------------------------------------
//  A thin PostHog wrapper. The rest of the app only ever calls
//  `track(event, props)` — this is the one file that knows whether
//  PostHog is configured, still loading its script, or switched off.
//
//  Wiring it up: create a project at posthog.com, paste its Project API key
//  into `CONFIG.posthog.apiKey` (config.js) and set `CONFIG.posthog.enabled`
//  to true. Left off (the default), `initAnalytics()` never loads anything
//  and every `track()` call below — from every file that calls it — is a
//  silent no-op, so none of those call sites need their own on/off check.
//
//  This loads PostHog's own hosted loader script (the "array.js" it serves
//  from `apiHost`, its standard lightweight web snippet) rather than
//  bundling the library — this site ships as plain, unbundled ES modules
//  (see TESTING.md), so there's nothing to bundle it into. `track()` is
//  safe to call before the script has finished loading: events queue up
//  and flush once PostHog is ready.
// ---------------------------------------------------------------------------
import { CONFIG } from '../config/config.js';

const PH = CONFIG.posthog ?? {};

let ph = null;         // the real posthog-js client, once its script has loaded
let started = false;   // initAnalytics() has run (and was actually enabled)
const queue = [];       // [event, props] pairs tracked before ph was ready

function boot() {
  const host = PH.apiHost ?? 'https://us.i.posthog.com';
  const s = document.createElement('script');
  s.async = true;
  s.src = `${host.replace('.i.posthog.com', '-assets.i.posthog.com')}/static/array.js`;
  s.onload = () => {
    if (!window.posthog) return;   // script loaded but didn't define itself — skip quietly
    window.posthog.init(PH.apiKey, {
      api_host: host,
      person_profiles: 'identified_only',   // don't create a person until identify() is called
    });
    ph = window.posthog;
    for (const [event, props] of queue.splice(0)) ph.capture(event, props);
  };
  s.onerror = () => { queue.length = 0; };   // offline / blocked — drop the queue, stay a no-op
  document.head.appendChild(s);
}

/**
 * Call once, early in main.js, after CONFIG is available. A no-op unless
 * both `CONFIG.posthog.enabled` and `.apiKey` are set — see the header.
 */
export function initAnalytics() {
  if (started || !PH.enabled || !PH.apiKey) return;
  started = true;
  boot();
}

/**
 * Track one interaction. Safe to call from anywhere in the app, at any
 * time — before initAnalytics() has run, before PostHog's script has
 * finished loading, or with analytics turned off entirely (in which case
 * this is simply dropped). `props` is a plain object of extra fields.
 */
export function track(event, props) {
  if (!PH.enabled || !PH.apiKey) return;
  if (ph) ph.capture(event, props);
  else queue.push([event, props]);
}
