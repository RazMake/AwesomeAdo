# store-assets

This folder holds the marketplace listing assets required by the Chrome Web Store and Microsoft
Edge Add-ons store. An official release attaches these files to the GitHub release, but the Chrome
and Edge store APIs only update an existing listing — the developer must manually create each
initial store item before any automated publication can succeed.

## Developer-provided inputs

Before the first automated release, create the initial store listing for each store manually, then
populate this folder with the listing source material:

| Asset                           | Description                                                                |
| ------------------------------- | -------------------------------------------------------------------------- |
| `description.txt`               | Short description; keep it consistent with the manifest description        |
| `detailed-description.txt`      | Full detailed description; Edge requires 250-10,000 characters             |
| `privacy-policy-url.txt`        | Public URL to the hosted privacy policy (one line)                         |
| `support-url.txt`               | URL to the support page or issue tracker (one line)                        |
| `category.txt`                  | Store category (for example, `Developer Tools`)                            |
| `language.txt`                  | Primary language code (for example, `en-US`)                               |
| `single-purpose.txt`            | Narrow purpose statement used by both stores' privacy forms                |
| `permission-justifications.txt` | Justification for each permission and requested host                       |
| `data-use.txt`                  | Source for the stores' data-use disclosures and limited-use certifications |
| `certification-notes.txt`       | Reviewer setup and test instructions, with no credentials committed here   |
| `icon-128.png`                  | Store icon, at least 128×128 pixels                                        |
| `screenshot-1.png`              | Chrome requires at least one 1280×800 screenshot                           |
| `promotional-tile-440x280.png`  | Chrome-required small promotional tile; optional for Edge                  |
| `promotional-tile-1400x560.png` | Optional Chrome marquee / Edge large promotional tile                      |

Screenshots must show the extension in action. Edge also accepts 640×480 screenshots and allows up
to six; Chrome allows up to five at 1280×800. PNG is the shared format used here.

The privacy forms are completed in each store dashboard. They require the single purpose,
justifications for `storage`, `webNavigation`, `scripting`, and the Azure DevOps host access, a
remote-code declaration, accurate data-use disclosures, and a public privacy policy URL. AwesomeADO
does not load remotely hosted executable code, so the remote-code answer is **No**.

## Current submission status

- The listing, privacy, disclosure, and certification text sources are present in this folder.
- The public privacy policy is `PrivacyPolicy.md` at the repository root. Its URL becomes usable after
  that file is pushed to the public `main` branch.
- The listing icon is present and matches the packaged 128x128 extension icon.
- Screenshots and promotional tiles are not present here yet.
- Edge permits omitting screenshots and promotional tiles. Chrome requires at least one 1280x800
  screenshot and a 440x280 small promotional tile, so a Chrome submission remains blocked until
  those two assets are supplied.

## Chrome Web Store

- Create the initial listing at https://chrome.google.com/webstore/devconsole
- The automated release uses `chrome-webstore-upload-cli` v4 to update an existing listing.
- Required secrets in the `browser-extension-stores` environment:
  `CHROME_EXTENSION_ID`, `CHROME_PUBLISHER_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`,
  `CHROME_REFRESH_TOKEN`.

## Microsoft Edge Add-ons store

- Create the initial listing at https://partner.microsoft.com/dashboard/microsoftedge
- The automated release uses the Edge Add-ons API v1.1 via `scripts/publish-edge.mjs`.
- Required secrets in the `browser-extension-stores` environment:
  `EDGE_PRODUCT_ID`, `EDGE_CLIENT_ID`, `EDGE_API_KEY`.

## Store credentials

Store credentials are optional — CI/CD skips store publication steps until all required
credentials for a store are present. See `.github/workflows/release.yml` for the full credential
gate logic. The automated Chrome submission uses `chrome-webstore-upload` (no separate publish
step); if upload succeeds but Chrome's review fails, correct the issue and submit the existing
draft from the Chrome dashboard rather than re-uploading.

## Notes

- The package includes 16, 32, 48, and 128-pixel extension icons under `src/icons/`; copy the
  128-pixel PNG here as `icon-128.png` for the listing.
- Store assets live in this folder but are **not** bundled into the extension ZIP. They are
  attached to the official GitHub release for custody and reference. The current store automation
  submits only the validated ZIP; listing text and images are maintained in the store dashboards.
