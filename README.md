# Miami Art Week 2026

A one page guide to Miami Art Week 2026: art fairs, free exhibits, parties, wellness events and dining, with search, filters and a Google map.

## How it works

- The event list loads live from the Google Sheet each time the page opens. Edit the sheet and the site updates on the next refresh. No rebuild needed.
- The sheet must stay shared as "Anyone with the link can view".
- Tapping an event shows it on a Google map with directions. No API key is used.
- Visitors can heart events to build "My picks" and open them as a route in Google Maps. Picks are saved in their own browser.

## The all events map

The Map view pins every event at once. Pin positions are stored in `coords.json`. To fill or refresh it (for example after adding events to the sheet), open `setup.html` on the live site, tap Start, wait for it to finish, and save the result into `coords.json`. Until that file has data, the Map view stays hidden and the site works as a list.

## Files

- `index.html` page structure
- `styles.css` design
- `setup.html` one time address lookup for the map
- `coords.json` saved pin positions
- `vendor/` map library (Leaflet)
- `app.js` loads the sheet, filters, map. The sheet ID and tab names are at the top in `CONFIG`.

## Publish with GitHub Pages

Settings > Pages > Source: Deploy from a branch > Branch: `main`, folder `/ (root)` > Save.

Event list curated by @ReginaGmiami.
