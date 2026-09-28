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

## Live data

GoRail uses RailRadar for live train running status, PNR status, seat availability and fare through a secure Vercel serverless proxy. Configure `RAILRADAR_API_KEY` in Vercel Environment Variables. Never put the key in frontend code or GitHub.

Station weather is provided by Open-Meteo and requires no API key. If a railway API request fails, the app displays an error or a clearly labelled schedule estimate where applicable.

## Other upgrades in this build
- Live IST tatkal-booking countdown on the dashboard (real clock, no key needed)
- Dark mode toggle (persisted)
- Toast notifications instead of blocking `alert()` popups
- Visual coach/seat map on Seat Availability
- Native station-name autocomplete on Train Enquiry
- Print / Save-as-PDF button on the ticket confirmation
- `api.js` is a self-contained live-data module — swap in a different provider by editing the endpoint paths in one place

## 🗺️ Live Map — complete real train routes
GoRail's timetable search and Live Map now use the **Indian-Railway-Data** open dataset as the primary source. It contains 5,208+ train records and 8,990+ station records. Each train includes its ordered route, intermediate stops, arrival/departure times, journey days, running days and total distance.

The complete train master is about 96.6 MB, so GoRail intentionally loads it on demand rather than making every page wait for a large download. After loading, the browser builds an index and caches it locally. Route coordinates are resolved from the station directory, so a train's full stop sequence can also be drawn on the map.

This is **timetable/reference data**, not live GPS. Live running status, PNR, seat availability and fare remain separate optional API features.

## Indian Railways timetable data provenance

GoRail's **All India Train Enquiry** uses the public [DataMeet railways](https://github.com/datameet/railways) dataset:
- `trains.json`: train numbers, names, source/destination, timings, distance, classes and route geometry.
- `stations.json`: station codes, names, zones/states and coordinates.
- `schedules.json`: train-by-train timetable stops, including arrival/departure times and day numbers.
- The DataMeet dataset is published under CC0/public-domain terms.

The repository also links to the official Indian Railways Passenger Reservation Enquiry pages for live operational enquiries. Timetable data is **not the same as live running status or seat availability**, so GoRail labels timetable results separately from live API results.

Official references:
- Indian Railways Train Schedule: https://www.indianrail.gov.in/enquiry/SCHEDULE/TrainSchedule.html?locale=e
- Government Open Data: https://www.data.gov.in/catalog/indian-railways-train-time-table


## Updated train-data source
GoRail now uses the **Indian-Railway-Data** public dataset as its primary train/station source, with a DataMeet fallback. The primary dataset documents **5,208+ trains** and **8,990+ stations**, including ordered route schedules, halt timings, journey days and running days, and is published under the MIT License. This is timetable/reference data, not a live GPS feed; live operational status remains separate.

Source: https://github.com/prasenjit-27/Indian-Railway-Data
