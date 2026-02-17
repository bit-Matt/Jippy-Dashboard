# Jippy Dashboard

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app) that manages Jippy Application Route Management.

## Getting Started

### Requirements

1. [Docker Engine/Desktop](https://www.docker.com/) with [`docker-compose`](https://docs.docker.com/compose/) (Optional, but recommended)
2. [Node.js 24 (LTS) or >= 25](https://nodejs.org/en) (Recommended to use LTS versions of Node.js)
3. [npm >= 11] (Bundled with Node.js)

### Environment Setup

> [!IMPORTANT]  
> Always check if you have other instances of PostgreSQL or Redis in your machine. If so, you can disable
> container creation by using `--use-own-deployments`. Ensure that your local PostgreSQL has [PostGIS](https://postgis.net/documentation/getting_started/)
> extension enabled.

1. Install required dependencies first:

   ```sh
   npm i
   ```

2. Run the automated environment setup script:

   ```sh
   npm run setup
   ```
   
   Note: You can configure only `.env` file without the automatic environment setup. To do so,
   add: `--use-own-deployments` flag on the setup script:

   ```sh
   npm run setup -- --use-own-deployments
   ```
   
   However, there will be a manual configuration to be done on your end. Follow the instructions
   in the output of the script.

3. Then run the development server:

   ```sh
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more about how this project is developed, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) – learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) – an interactive Next.js tutorial.
- [Shadcn Documentation](https://ui.shadcn.com/)
- [Drizzle ORM](https://orm.drizzle.team/docs/overview) especially [PostGIS geometry point](https://orm.drizzle.team/docs/guides/postgis-geometry-point) queries.
- [react-leaflet](https://react-leaflet.js.org/) & [Leaflet](https://leafletjs.com/)
- [OSRM (Open Source Routing Machine)](https://project-osrm.org/docs/v5.24.0/api)
- [Nominatim](https://nominatim.org/)
- The official Software Architecture Document

## Interacting with the API

### Public API Access

Public API endpoints are available at `/api/public/`. Where they don't require any authentication. However,
the data only covers the Philippines.

It has geocoding endpoints such as:

- `/api/public/osm/nominatim/search`
- `/api/public/osm/nominatim/reverse`

They support all parameters that Nominatim supports.

These have IP-based rate limitation, so please keep the requests on this public API to a minimum of 1 per
second.

### Restricted APIs

Restricted APIs are available at `/api/restricted/`. Where they require authentication or an API key to access.
API keys are generated only for the application itself. It has no rate-limits but is, however, more restrictive
than what the public API provides. This only covers the Iloilo area.

It has geocoding endpoints such as:

- `/api/restricted/osm/nominatim/search` (Only supports `q` parameter)
- `/api/restricted/osm/nominatim/reverse` (Only supports `lat` and `lon` parameters)

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
