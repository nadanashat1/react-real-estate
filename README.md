# Real Estate | Property Explorer

A full-stack portfolio demo for exploring homes, managing listings, and arranging fictional viewings. The interface uses a charcoal, chalk and vermilion palette with a full-image property explorer, responsive layouts and a working database-backed flow.

> This is a fictional portfolio project, not a real estate service. Prices, listings, conversations and viewing confirmations are for testing only. No real bookings, payments, emails or SMS are sent.

[Open the live demo](https://react-real-estate-omega.vercel.app/)

## Features

- Explore properties for sale or rent, move between featured homes and filter by location, type, bedrooms and budget.
- Create buyer or seller accounts, sign in securely and save favorite properties.
- Create, edit and delete seller-owned listings, with server-side role and ownership checks.
- Upload JPEG photos with size/dimension validation and metadata removal. Uploaded images persist in the database.
- Choose and view map pins using Leaflet and OpenStreetMap. Maps load only when opened.
- Exchange private inquiries and replies between test accounts.
- Request, confirm, cancel and reschedule viewings in a day, week or month calendar. Changing a time requires a new confirmation.
- Receive conversation and viewing updates without reloading. Updates can take about five seconds across app instances.

## Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React, TypeScript, Vite, React Router |
| Interface | CSS, Lucide icons, Leaflet |
| Backend | Node.js HTTP API |
| Database | SQLite locally; PostgreSQL on Neon for the hosted demo |
| Hosting | Vercel Hobby with a server-only Node function |
| Checks | API integration tests, Playwright browser flows, TypeScript and formatting checks |

## Run locally

Requires Node.js 22.13 or later.

```sh
npm install
npm run build
npm start
```

Open the local address printed by the server. Local records and uploaded image bytes are stored in `data/estate.sqlite`.

For hot-reload development, run `npm run dev:api` and `npm run dev` in separate terminals.

## Configuration

Local mode needs no credentials. For a hosted setup, set `DATABASE_URL` only in the private server environment, with the exact HTTPS production URL in `APP_ORIGIN` and `NODE_ENV=production`. Never put database credentials in frontend `VITE_*` variables or commit `.env` files.

The Vercel configuration serves the frontend and sample images as static assets, with API requests and uploaded images handled by the Node function. The inbox and viewing calendar refresh with short requests about every five seconds while visible. This keeps updates working across separate serverless instances without relying on a long-lived connection.

## Checks

```sh
npm run lint
npm run typecheck
npm run test:api
TEST_POSTGRES=1 npm run test:api
npm run test:ui
TEST_SECOND_INSTANCE=1 npm run test:ui
npm run test:vercel
npm audit
```

Browser tests require Chrome. Set `CHROME_BIN` if it is not installed at `/usr/bin/google-chrome`.

The app has also been privately tested against the actual Neon database, including two separate app instances, photo uploads, map pins, saved homes, private replies and viewing changes. The deployed Vercel URL also passed the full browser flow, including recipient replies and viewing changes without reloading.

## Demo limits

Use fictional details and a test-only password. Email verification and password recovery are unavailable and visibly disclosed in the sign-in interface.

The demo includes database-backed authentication/write limits, content and image caps, bounded refresh requests, request timeouts, HTTP-only session cookies, hashed passwords and server-side permission checks. These are safeguards for a low-traffic portfolio demo, not a production security audit. Free hosting/database quotas can pause the demo.

## License and credits

The project builds on the original [React Real Estate repository](https://github.com/nadanashat1/react-real-estate). The inherited GPLv3 license and source history are retained. This redevelopment does not imply that one portfolio owner authored all inherited code.

The property-explorer interface, Node backend and database flows were redeveloped for this portfolio demo. See `ATTRIBUTION.md` for change notes and the limits of the available contributor metadata.

All active sample images were replaced with individually checked images offered under the Unsplash License. Their source pages and license notes are listed in `ATTRIBUTION.md` and the app's credits page. Map data is credited to OpenStreetMap contributors.
