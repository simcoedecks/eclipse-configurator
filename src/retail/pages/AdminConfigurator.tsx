import Home from './Home';

/**
 * Admin variant of the pergola configurator — exposes the advanced
 * controls that are hidden from the public /configurator route:
 *
 *   - Partial-length structure walls (length + anchor + end-style)
 *   - Phase 5 customer notes & change requests textarea
 *
 * Access is by URL only — no sign-in gate. Share the link internally.
 *
 * URL: /admin/configurator
 */
export default function AdminConfigurator() {
  return <Home skipIntro adminMode />;
}
