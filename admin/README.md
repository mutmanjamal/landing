# Site studio

The admin saves edits into `.admin-data/draft`, separately from the live source and published files. Build preview reads the saved draft. Only **Publish website** builds, updates the web root, and syncs the edited content back to the source checkout.

## Controls

- English and Arabic page content and search descriptions.
- Add portfolio projects or side projects/learning entries at any time.
- Visibility, featured state, display position, technologies, role, and Markdown story.
- Optional evidence links and screenshots. Open an existing project later to attach evidence; images need an accessible description.
- CV upload and CV-link visibility; image library with protection against deleting attached images.
- Contact details, colors, skills, and section visibility.
- Forty revision checkpoints, including uploaded files. Restore affects the draft until published.
- Existing GoatCounter visitor statistics when its token is configured.

## Local review

```sh
npm ci --prefix admin
ADMIN_PREVIEW_ONLY=1 ADMIN_BASE_PATH= PORT=4350 node admin/server.js
```

Open `http://127.0.0.1:4350`. Publishing is disabled by both the interface and API in review mode. The server binds to loopback and must remain behind the existing authenticated Caddy route in production.

## Configuration

- `SITE_ROOT`: source checkout; default is the parent of `admin/`.
- `PUBLISH_DIR`: served static directory; default `/var/www/mutman.tech`.
- `ADMIN_DATA_DIR`: persistent private draft/revision storage; default `.admin-data` inside the source checkout. Do not serve this directory publicly or commit it.
- `ADMIN_BASE_PATH`: proxy prefix, default `/admin`; use an empty value for root-level local review.
- `ADMIN_PREVIEW_ONLY=1`: blocks publication for review.
- `ADMIN_BUILD_HEAP_MB`: build heap limit, default 192 MB, bounded to 128–1024 MB. Build commands time out after two minutes; a failed build does not publish.

Draft templates refresh on startup without overwriting saved content. On a first installation, content is copied from the current source checkout, including existing admin edits. Back up `.admin-data`, source content, and the web root before upgrades.

## Verification

`node admin/test.mjs` starts an isolated temporary site and checks saving, project creation, learning collections, image attachment, link preservation, visibility, preview isolation, settings, publication, deletion, revision restore, and the review publication block. It never uses the production publish directory.

## Visitors and health

Open **Visitor stats**, then enter a GoatCounter site code and a token with only **Read statistics** permission. The server verifies the token before storing it in `integrations.json` alongside the draft directory, with file mode 0600. It is never returned to the browser, copied into published files, committed, or included in content revisions. Existing `GOATCOUNTER_TOKEN` and `GOATCOUNTER_URL` environment settings remain supported when no connection file exists.

The **Website & server health** page checks the public HTTPS response and certificate expiry, server memory/swap/disk, service status, and public GitHub Actions results. Results are cached to keep overhead low. Detailed server checks run on the VM. The Website availability GitHub Actions workflow independently probes the English/Arabic pages and protected admin about every 15 minutes; schedules may be delayed and failure notifications use the owner’s GitHub Actions notification preferences. GitHub builds remain separate from Azure website publication.

`node admin/test-monitoring.mjs` tests the integration with mock provider responses and synthetic credentials. It never contacts GoatCounter or writes a real token.
