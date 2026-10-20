# Real Estate App

A real estate platform built with React and TypeScript. Users can browse homes for sale or rent, view details on a map, list their own properties, chat with owners, and schedule viewing meetings.

## Features

- Home listings with search and detail pages (rent and sale)
- Create, edit, and manage your own property listings
- User accounts with sign up and sign in
- Real-time-style chat between users
- Meeting scheduler for property viewings
- Interactive maps with Leaflet
- Data fetching and caching with TanStack Query, forms with validation, toast notifications
- SCSS modules and Radix UI primitives

## Tech stack

- React, TypeScript, Vite
- TanStack Query, Axios, React Router
- Leaflet maps
- Radix UI, SCSS, Luxon
- REST API backend (see `src/api/`)

## Getting started

```bash
npm install
npm run dev
```

The app expects a backend API; configure its URL in `src/api/`.
