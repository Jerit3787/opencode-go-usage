# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Removed the incorrect `$60`/`$240` plan-pool explanation. Go usage limits are per model; the plan price is not a usage allowance.

### Fixed

- The usage projection now uses the server's monthly meter as the current percentage instead of dividing Console cost by a plan price, so its forecast and 100% crossing match the authoritative meter.
- The Console model breakdown now uses calendar date ranges because the Console API's `since` query returns only a recent window.

## [0.1.1] - 2026-11-08

### Added

- A marker and date label on the usage projection where the forecast crosses the 100% monthly limit.

## [0.1.0] - 2026-11-06

Initial public release.

### Added

- Composer pill ring that reports the tightest of the 5-hour, weekly, and monthly Go limits, with a popover showing each meter and reset time.
- Native-style **Go usage** Settings page with aggregate meters, manual refresh, and Console links. The page title and navigation follow the detected plan.
- Go credential resolution and typed IPC between the plugin window and the Electron main process, with main-process caching and stale/error states.
- Per-model usage analytics: Console cost, monthly limit, contribution, requests, tokens, average cost per 1M tokens, and average cost per request.
- **Go**, **Go Plus**, and **Go Teams** support with plan-specific per-model limits and automatic detection from the latest paid Console invoice. The `plan` option and allowance overrides are available when billing data is unavailable.
- Console integration: `/api/experimental/usage/limits` for aggregates, `/api/usage/models` for the model breakdown, `/api/billing/credit-invoices` for plan detection, and `/api/activity/go` for the projection.
- Usage projection card with cumulative monthly usage, a linear month-end forecast, the 100% limit line, renewal date, on-pace date, and daily average.
- Desktop Console fallback for remote/SSH servers, labelled `via this desktop`.
- Explicit difference between calculated monthly usage and the server monthly meter.
- README screenshots for the composer popover and Settings page.

### Changed

- Aggregates prefer the signed-in Console limits endpoint and fall back to the Go API key usage endpoint.
- Console model costs use the exact current Go period (`since=<monthly reset minus one month>`), with 30-day and `from`/`to` fallbacks.
- Settings uses the native header and body classes so it matches built-in Settings pages.
- Plan names are shown consistently in the pill, popover, Settings header, navigation, and command label.
- Calculated usage is shown alongside the server meter instead of being calibrated to force a match.

### Fixed

- Hardened Go usage request errors and added caching and freshness handling.
- Correctly prefer the desktop Console account for remote servers without Console sign-in.
- Warn when the running plugin server is stale rather than silently showing old data.
- Removed the duplicate **Open built-in Usage** button.

[0.1.0]: https://github.com/Jerit3787/opencode-go-usage/releases/tag/v0.1.0
[0.1.1]: https://github.com/Jerit3787/opencode-go-usage/compare/v0.1.0...v0.1.1
[Unreleased]: https://github.com/Jerit3787/opencode-go-usage/compare/v0.1.1...HEAD
