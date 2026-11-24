# Miami Art Week 2026

A one page guide to Miami Art Week 2026: art fairs, free exhibits, parties, wellness events and dining, with search, filters and a Google map.

## How it works

- The event list loads live from the Google Sheet each time the page opens. Edit the sheet and the site updates on the next refresh. No rebuild needed.
- The sheet must stay shared as "Anyone with the link can view".
- Tapping an event shows it on a Google map with directions. No API key is used.
- Visitors can heart events to build "My picks" and open them as a route in Google Maps. Picks are saved in their own browser.

## Files

- `index.html` page structure
- `styles.css` design
- `app.js` loads the sheet, filters, map. The sheet ID and tab names are at the top in `CONFIG`.

## Publish with GitHub Pages

Settings > Pages > Source: Deploy from a branch > Branch: `main`, folder `/ (root)` > Save.

Event list curated by @ReginaGmiami.
