# Jippy Dashboard

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app) that manages Jippy Application Route Management.

## Getting Started

### System Requirements

* **CPU**: 8-core processor or higher.
* **Memory**:
    * **Minimum**: 8GB RAM.
    * **Recommended**: 16GB RAM.
* **Storage**: 20GB+ available space. High-speed storage (NVMe or SSD) is strongly recommended for optimal tile serving and routing performance.

### Requirements

1. [Docker Engine/Desktop](https://www.docker.com/) with [`docker-compose`](https://docs.docker.com/compose/)
2. [Node.js 24 (LTS) or >= 25](https://nodejs.org/en) (Recommended to use LTS versions of Node.js)
3. [npm >= 11] (Bundled with Node.js)

### Recommended IDEs for Development:

- Visual Studio Code with following extensions:
   - [C# Dev Kit (For `JippyServices.Algorithm` project)](https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.csdevkit)
   - [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
   - [Container Tools (Optional)](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-containers)
   - [Docker (Optional)](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-docker)
- [WebStorm (Free for non-commercial use)](https://www.jetbrains.com/webstorm/) & [Rider (Free for non-commercial use)](https://www.jetbrains.com/rider/)

### Environment Setup

1. Install required dependencies first:

   ```sh
   npm i
   ```

2. Run the automated environment setup script:

   ```sh
   npm run setup
   ```

3. Create your tileserver configurations:

   ```sh
   npm run setup:tileserver-style
   ```

4. Then run the development server:

   ```sh
   npm run dev
   ```

5. Register your one and only root account:

   ```sh
   npm run setup:admin
   ```

6. (Optional & Recommended) Seed the routes provided:

   ```sh
   npm run db:seed:clean
   ```

   Or if you prefer to clean everything by yourself, use:

   ```sh
   npm run db:seed:raw
   ```

Open [http://localhost:6769](http://localhost:6769) with your browser to see the result.

## Learn More

To learn more about how this project is developed, take a look at the following resources:

### Core Framework & UI:

- [Next.js Documentation](https://nextjs.org/docs) – learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) – an interactive Next.js tutorial.
- [Shadcn Documentation](https://ui.shadcn.com/)
- [react-leaflet](https://react-leaflet.js.org/) & [Leaflet](https://leafletjs.com/)

### Databases & Caching:
- [Drizzle ORM](https://orm.drizzle.team/docs/overview) especially [PostGIS geometry point](https://orm.drizzle.team/docs/guides/postgis-geometry-point) queries.
- [Redis](https://redis.io/docs/latest/develop/clients/nodejs/)
- [`IMemoryCache`](https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.caching.memory.imemorycache)

### Geospatial & Routing Engines:

- [Valhalla](https://valhalla.github.io/valhalla/) - The primary engine used for vehicle routing.
- [Nominatim](https://nominatim.org/) - Geocoding service for address and location lookups.
- [GraphHopper](https://www.graphhopper.com/) - Specialized routing engine for pedestrian and walking paths.

### Map Serving & Data Processing
- [mapserver/tileserver-gl](https://github.com/maptiler/tileserver-gl) - Our vector and raster tile server.
- [systemed/tilemaker](https://github.com/systemed/tilemaker) - Tool for creating vector tiles directly from OSM data without a database.

## API Reference

The public API is accessible without authentication. To ensure service stability, an aggressive rate limit of 1 requests per second (10 requests per 10 seconds) per IP address is enforced on the public deployment.

### GET `/api/public/all`

Fetches a comprehensive dataset of all registered Routes, Regions, Tricycle stations, and current Road Closures.

### POST `/api/public/navigate/v1`

Generates step-by-step navigation instructions between two points.

#### Request Body:

The payload must be a JSON object containing `start` and `end` coordinates as [latitude, longitude] tuples.

```json
{
   "start": [0, 0],
   "end": [1, 1]
}
```

### POST `/api/public/navigate/v2`

An optimized navigation endpoint utilizing the rewritten [`JippyServices.Algorithm`](services/JippyServices/JippyServices.Algorithm).

> [!NOTE]
> While the input schema remains identical to `v1`, this version may yield different routing results or improved transfer logic (e.g., between Jeepneys and Tricycles) compared to the legacy engine.
