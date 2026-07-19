# store-assets

This folder holds the marketplace listing assets required by the Chrome Web Store and Microsoft
Edge Add-ons store. An official release attaches these files to the GitHub release, but the Chrome
and Edge store APIs only update an existing listing — the developer must manually create each
initial store item before any automated publication can succeed.

## Developer-provided inputs

Before the first automated release, create the initial store listing for each store manually, then
populate this folder with:

| Asset                          | Description                                                                |
| ------------------------------ | -------------------------------------------------------------------------- |
| `description.txt`              | Store listing description (up to 132 characters for the short description) |
| `detailed-description.txt`     | Full detailed description in plain text or HTML                            |
| `privacy-policy-url.txt`       | URL to the hosted privacy policy (one line)                                |
| `support-url.txt`              | URL to the support page or issue tracker (one line)                        |
| `category.txt`                 | Store category (e.g., `Developer Tools`)                                   |
| `language.txt`                 | Primary language code (e.g., `en-US`)                                      |
| `screenshot-1.png`             | At minimum one 1280×800 or 640×400 screenshot                              |
| `promotional-tile-440x280.png` | Optional small promotional tile (440×280 pixels)                           |
| `promotional-tile-920x680.png` | Optional large promotional tile (920×680 pixels)                           |

Screenshots must show the extension in action. All images must be PNG format.

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

- Phase 1 ships without extension icons. The browser shows a default icon. Adding icons is a
  developer task for a future version.
- Store assets live in this folder but are **not** bundled into the extension ZIP. They are
  uploaded separately via the store APIs during `publish_stores`.
