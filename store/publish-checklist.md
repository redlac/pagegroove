# PageGroove Publish Checklist

## Done locally

- Manifest prepared for MV3
- Icons referenced in manifest
- Privacy policy drafted
- Listing copy drafted
- Store preview pages prepared for screenshots

## Before uploading

1. Replace the contact line in `docs/privacy-policy.html` with your real support email or website.
2. Push this project to a GitHub repository.
3. In GitHub, open `Settings` -> `Pages`, choose `Deploy from a branch`, then select your default branch and the `/docs` folder.
4. Wait for GitHub Pages to publish the site, then use the published `privacy-policy.html` URL in the Chrome Web Store listing.
5. Review the listing copy in `store/listing.md`.
6. Generate the screenshots and confirm they match the real extension UI.
7. Upload the zip from `dist/` in the Chrome Developer Dashboard.

## Chrome Web Store form guidance

- Category: Fun
- Language: English
- Single purpose: deterministic page-to-music generation
- Privacy:
  - Handles website content/resources: yes
  - Handles web browsing activity: yes
  - Data sold: no
  - Data transferred to third parties: no
  - Used only for the user-facing feature: yes

## Suggested reviewer note

PageGroove reads structural information from the active page and converts it into a deterministic audio loop locally in the browser. It does not send browsing data or page content to remote servers.
