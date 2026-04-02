# PageGroove Listing Copy

## Store title

PageGroove

## Summary

PageGroove turns the structure of the current web page into a deterministic synth loop.

## Short description

Generate a unique synth groove for every page you browse.

## Detailed description

PageGroove creates a soundtrack from the structure of the page you are viewing.

Every supported page maps to a repeatable loop based on signals like headings, links, images, DOM depth, and document size. The same page will always generate the same musical identity unless you change the settings.

What you can do:

- Play or stop a groove for the current page
- Adjust volume, tempo, density, mood, and root note
- Switch between simple controls and advanced mode
- Hear a different loop as you move between different sites

How it works:

- The extension reads structural page metrics from the current tab
- Those metrics are converted into a deterministic music pattern
- Audio is generated locally in your browser with the Web Audio API

Privacy:

- PageGroove runs locally on-device
- It does not send page content, browsing activity, or audio data to a remote server
- It does not include ads, analytics, or third-party tracking

## Single purpose statement

PageGroove reads the current page structure and turns it into a local synth loop for the user to hear while browsing.

## Permission justifications

### Host permissions: `<all_urls>`

Needed so the extension can read page structure on supported sites and generate a groove for the current page.

### `tabs`

Needed to identify the active tab, track tab changes, and keep playback synced with the page the user is currently browsing.

### `storage`

Needed to save playback settings like volume, tempo, density, mood, root note, and whether playback is enabled.

### `offscreen`

Needed to run the offscreen audio engine so playback can continue while browsing.

### `scripting`

Needed for content-script fallback injection on pages that load late or update dynamically.

## Privacy form answers

These are the safe answers based on the current implementation:

- Personal or sensitive user data: Yes
- Types involved: Website content and resources, web browsing activity
- Data sold: No
- Data transferred to third parties: No
- Data used for advertising: No
- Data used for creditworthiness or lending: No
- Data collected only for the user-facing feature: Yes
- Data handled locally only: Yes

## Reviewer notes

- The extension processes page structure locally to generate deterministic audio.
- No remote servers are contacted by the extension code.
- No analytics, ads, or account systems are included.
