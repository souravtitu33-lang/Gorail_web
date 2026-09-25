# GoRail Web — Railway Operations & Management

This website is a browser-based implementation of the main logic and screens found in the supplied GoRail Android APK.

## Included logic
- Passenger login/register
- Passenger dashboard
- Train enquiry/search
- Class-wise seat availability
- Fare enquiry
- Passenger details + booking flow
- PNR generation and PNR status
- Ticket view + QR code
- Ticket cancellation/refund state
- Live train status
- Station information
- Route/operational information
- Special trains
- Coach/platform/emergency-oriented tools
- Food ordering
- Complaints and admin complaint resolution
- Notifications and railway broadcast notices
- Passenger profile
- Admin dashboard
- Admin train add/edit/delete
- Browser localStorage persistence

## Demo accounts
Passenger:
- Email: passenger@gorail.app
- Password: 123456

Admin:
- Email: admin@gorail.app
- Password: admin123

## Run
1. Extract the ZIP.
2. Open `index.html` in a modern browser.
3. Internet is only needed for the optional QR-code CDN. The rest is client-side.

## Important
The APK uses Firebase/Firestore. This web version intentionally keeps data in browser localStorage so it can run immediately without exposing or guessing the original Firebase credentials. For production, connect the same entities (`users`, `trains`, `bookings`, `complaints`, `notifications`, etc.) to your Firebase project or a GoRail backend.

## Live data (new)
There is no official public IRCTC API. This build adds two real, working tiers of live data on top of the original demo:

1. **Free, no key needed** — real-time weather at every station (Open-Meteo). This works immediately on the Live Status and Station Info pages.
2. **Optional, key required** — real Indian Railways data (live running status, PNR status, seat availability, fare) via the `irctc1` API on RapidAPI, the provider most open-source Indian-Railways tools use. Click the ⚙️ gear icon in the top bar, paste a personal RapidAPI key, and Save. The **LIVE DATA / DEMO DATA** badge in the top bar (and on each relevant page) always tells you which mode you're in. Without a key the app runs exactly as before, on demo data — nothing breaks.

Get a free-tier key at rapidapi.com by searching "irctc1". Third-party API paths occasionally change on the provider's side; if a call fails, GoRail shows the error and falls back to demo data instead of breaking.

## Other upgrades in this build
- Live IST tatkal-booking countdown on the dashboard (real clock, no key needed)
- Dark mode toggle (persisted)
- Toast notifications instead of blocking `alert()` popups
- Visual coach/seat map on Seat Availability
- Native station-name autocomplete on Train Enquiry
- Print / Save-as-PDF button on the ticket confirmation
- `api.js` is a self-contained live-data module — swap in a different provider by editing the endpoint paths in one place
