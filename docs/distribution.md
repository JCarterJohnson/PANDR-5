# Distribution without a paid domain

## Available route

GitHub Releases hosts downloadable desktop files. A public repository can use standard GitHub-hosted Actions runners without metered private-repository minutes. The native workflow builds Windows x64 (installer and portable), Linux x64 (AppImage), and macOS Apple Silicon and Intel (DMG and ZIP).

GitHub Pages supplies an HTTPS `github.io` address and serves the small installable web app. Its deployment deliberately disables cloud login: GitHub's Pages policy says Pages should not be used for sensitive transactions such as sending passwords. Local training and export remain available. No purchased domain is needed.

The account-enabled web app is [pandr-5.vercel.app](https://pandr-5.vercel.app/), hosted in the owner's Vercel Hobby account. Vercel builds the GitHub repository with Vite (`npm run build`, output `dist`, repository root `./`). No purchased domain is required. Hobby is intended for personal, noncommercial use and has finite quotas. The dedicated Supabase project is on the Free plan. Neither service has been upgraded to a paid plan for this project.

Public client configuration is included in source. `VITE_ENABLE_CLOUD_SYNC=true` enables account controls; the Pages workflow explicitly sets it to `false`. Never publish Google client secrets or Supabase service keys. See [accounts](accounts.md) for redirect and native sign-in details.

## Public build workflows

- `ci.yml`: unit tests and production build on pushes and pull requests.
- `pages.yml`: manual local-only Pages deployment. Enable Pages with GitHub Actions as the source.
- `desktop.yml`: tags matching `v*` or manual invocation build all desktop packages. Tag builds publish a preview release; manual builds keep artifacts for 30 days.

Actions are pinned to immutable revisions. Updating dependencies or action revisions requires another verification pass.

## Installation

- **macOS:** download the DMG, or unzip and move PANDR-5.app to Applications. Unsigned builds lack Apple notarization and can be blocked by Gatekeeper. Use Apple’s documented per-app review controls only after verifying the source; do not disable Gatekeeper globally. Paid Apple signing is not included.
- **Windows:** run the installer or portable executable. Without a paid signing certificate, SmartScreen may show an unfamiliar-app warning. Download only from the project’s release page.
- **Linux:** make the AppImage executable and launch it. Some distributions need FUSE support.
- **Chrome / Edge desktop or Android:** open the HTTPS app once, then use the browser’s Install option. Reload once after the initial load before testing offline use.
- **iPhone / iPad:** open the HTTPS app in Safari and use Share → Add to Home Screen. No App Store listing or Apple developer membership is required for a PWA.

Updates to the web app wait for an explicit action, and are not offered during an active workout. Native downloads require a manual replacement; no updater downloads or executes remote code.

## Free does not mean unlimited

Verified September 15, 2026:

- [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits): static hosting limitations and policy, including sensitive transactions.
- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions): standard hosted runners for public repositories are free.
- [GitHub releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases): downloadable release assets.
- [Supabase pricing](https://supabase.com/pricing): Free includes 500 MB database storage, 50,000 monthly active users, and 5 GB egress; inactivity can pause a free project after one week. Automatic managed backups are not included in Free.
- [Vercel Hobby](https://vercel.com/docs/plans/hobby): free personal, noncommercial hosting with usage limits.

No free tier guarantees years of unattended service for an unlimited audience. Keep user exports, monitor quotas, and do not silently turn on paid upgrades.
