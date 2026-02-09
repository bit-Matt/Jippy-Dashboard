# Jippy Dashboard

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app) that manages Jippy Application Route Management.

## Getting Started

### Requirements

1. [Docker Engine/Desktop](https://www.docker.com/) with [`docker-compose`](https://docs.docker.com/compose/)
2. [Node.js 24 (LTS) or >= 25](https://nodejs.org/en) (Recommended to use LTS versions of Node.js)
3. [npm >= 11] (Bundled with Node.js)

### Environment Setup

> [!IMPORTANT]  
> Always check if you have other instances of PostgreSQL or Redis in your machine. If so, you can disable
> container creation by using `--skip-container-build`. Ensure that your local PostgreSQL has [PostGIS](https://postgis.net/documentation/getting_started/)
> extension enabled.

1. Install required dependencies first:

   ```sh
   npm i
   ```

2. Run the automated environment setup script:

   ```sh
   npm run env:generate
   ```

   If you want redis to be enabled, you can add `--enable-redis` flag. (Note you need `--` before `--enable-redis` to pass it on the script
   otherwise npm will think that you are passing arguments to npm cli).

3. Then run the development server:

   ```sh
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more about how this project is developed, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [OpenStreetMaps API Documentation](https://www.openstreetmap.org/help)
- [ShadCn Documentation](https://ui.shadcn.com/)
- [Drizzle ORM](https://orm.drizzle.team/docs/overview) especially [PostGIS geometry point](https://orm.drizzle.team/docs/guides/postgis-geometry-point) queries.
- The official Software Architecture Document

## Interacting with the API

To interact with the API, You can access `/api/v1/routes` to fetch route data. No APIs are exposed for write operations.

Fetching route data requires an token. Developers can create a API token that should be declared in the header at
each request:

```
Authentication: Bearer GENERATED-API-KEY
```

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
