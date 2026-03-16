# Jippy Dashboard

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app) that manages Jippy Application Route Management.

## Getting Started

### Requirements

1. [Docker Engine/Desktop](https://www.docker.com/) with [`docker-compose`](https://docs.docker.com/compose/)
2. [Node.js 24 (LTS) or >= 25](https://nodejs.org/en) (Recommended to use LTS versions of Node.js)
3. [npm >= 11] (Bundled with Node.js)

### Environment Setup

1. Install required dependencies first:

   ```sh
   npm i
   ```

2. Run the automated environment setup script:

   ```sh
   npm run setup
   ```

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
- [Valhalla](https://valhalla.github.io/valhalla/)
- [Nominatim](https://nominatim.org/)
- [mapserver/tileserver-gl](https://github.com/maptiler/tileserver-gl)
- [systemed/tilemaker](https://github.com/systemed/tilemaker)
- The official Software Architecture Document

## Interacting with the API


### Route Information API

All route information can be fetched via `/api/public/all`.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
