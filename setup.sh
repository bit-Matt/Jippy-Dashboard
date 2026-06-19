#!/usr/bin/env bash

echo "Jippy Configurator"

###############################################################################
# Flags
###############################################################################
IS_PRODUCTION=false
if [[ "${NODE_ENV:-}" == "production" ]]; then
  IS_PRODUCTION=true
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

yellow() {
  printf '\033[33m%s\033[0m\n' "$1"
}

###############################################################################
# Load existing .env variables for re-runs
###############################################################################
declare -A ENV_HASH
ENV_FILE_PATH="${SCRIPT_DIR}/.env"

if [[ -f "$ENV_FILE_PATH" ]]; then
  printf '\033[36m%s\033[0m\n' "Found .env file. Building configuration record..."

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "$line" || "$line" =~ ^# ]] && continue
    [[ "$line" != *"="* ]] && continue

    name="${line%%=*}"
    value="${line#*=}"
    name="${name#"${name%%[![:space:]]*}"}"
    name="${name%"${name##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"

    if [[ "$value" =~ ^\"(.*)\"$ ]]; then
      value="${BASH_REMATCH[1]}"
    elif [[ "$value" =~ ^\'(.*)\'$ ]]; then
      value="${BASH_REMATCH[1]}"
    fi

    ENV_HASH["$name"]="$value"
  done < "$ENV_FILE_PATH"

  printf '\033[32m%s\033[0m\n' "Configuration record built successfully."
else
  yellow ".env file not found at ${ENV_FILE_PATH}. Using default/empty configuration."
fi

###############################################################################
# Utilities
###############################################################################
new_secure_password() {
  local length="${1:-16}"
  LC_ALL=C tr -dc 'a-zA-Z0-9-._~' < /dev/urandom | head -c "${length}"
}

get_available_port() {
  python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("", 0))
print(s.getsockname()[1])
s.close()
PY
}

get_remote_item() {
  local save_path="$1"
  local download_url="$2"

  if [[ -f "$save_path" ]]; then
    return
  fi

  curl -L -o "$save_path" "$download_url"
}

invoke_7z() {
  local path="$1"
  local output="$2"
  local extract_files_only="${3:-false}"
  local overwrite="${4:-false}"

  if [[ "$overwrite" == "true" && -d "$output" ]]; then
    rm -rf "$output"
  fi

  if [[ "$extract_files_only" == "true" ]]; then
    7z e "$path" "-o${output}" -y
    return
  fi

  7z x "$path" "-o${output}"
}

###############################################################################
# Dependency Check
###############################################################################
if ! command -v npm >/dev/null 2>&1; then
  echo ""
  yellow "No npm found. Are you sure you installed Node.js?"
  echo ""
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo ""
  yellow "No docker found. Are you sure it's installed?"
  echo ""
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo ""
  yellow "Docker is not running. Start Docker first and try again."
  echo ""
  exit 1
fi

if ! command -v 7z >/dev/null 2>&1; then
  echo ""
  yellow "No 7z executable found. Install p7zip and ensure 7z is in PATH."
  yellow "Example (Debian/Ubuntu): sudo apt-get install -y p7zip-full"
  echo ""
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo ""
  yellow "No curl executable found. Install curl and ensure it is in PATH."
  yellow "Example (Debian/Ubuntu): sudo apt-get install -y curl"
  echo ""
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo ""
  yellow "No python3 found. It is required to detect open ports."
  echo ""
  exit 1
fi

###############################################################################
# Main Setup
###############################################################################
if [[ -n "${ENV_HASH[SENTRY_AUTH_TOKEN]:-}" ]]; then
  SENTRY_TOKEN="${ENV_HASH[SENTRY_AUTH_TOKEN]}"
else
  read -r -p "Your Sentry Auth Token: " SENTRY_TOKEN
fi
if [[ -z "$SENTRY_TOKEN" ]]; then
  yellow "Empty Sentry Token."
  exit 1
fi

if [[ -n "${ENV_HASH[RESEND_API_KEY]:-}" ]]; then
  RESEND_TOKEN="${ENV_HASH[RESEND_API_KEY]}"
else
  read -r -p "Your Resend API Key: " RESEND_TOKEN
fi
if [[ -z "$RESEND_TOKEN" ]]; then
  yellow "Empty Resend API Key."
  exit 1
fi

if [[ -n "${ENV_HASH[RESEND_FROM_ADDRESS]:-}" ]]; then
  RESEND_ADDRESS="${ENV_HASH[RESEND_FROM_ADDRESS]}"
else
  read -r -p "Your Resend From Address Domain: " RESEND_ADDRESS
fi
if [[ -z "$RESEND_ADDRESS" ]]; then
  yellow "Empty Resend Address Domain."
  exit 1
fi

CLOUDFLARE_TOKEN="IS_DEV_NOT_SET"
if [[ "$IS_PRODUCTION" == "true" ]]; then
  if [[ -n "${ENV_HASH[DOCKER_CLOUDFLARED_TOKEN]:-}" ]]; then
    CLOUDFLARE_TOKEN="${ENV_HASH[DOCKER_CLOUDFLARED_TOKEN]}"
  else
    read -r -p "Your cloudflared token: " CLOUDFLARE_TOKEN
  fi
  if [[ -z "$CLOUDFLARE_TOKEN" ]]; then
    yellow "Empty cloudflared token."
  fi
fi

if [[ -n "${ENV_HASH[CLOUDFLARE_TURNSTILE_SECRET_KEY]:-}" ]]; then
  CLOUDFLARE_TURNSTILE_SECRET_KEY="${ENV_HASH[CLOUDFLARE_TURNSTILE_SECRET_KEY]}"
else
  read -r -p "Your Cloudflare Turnsstile Secret Key: " CLOUDFLARE_TURNSTILE_SECRET_KEY
fi
if [[ -z "$CLOUDFLARE_TURNSTILE_SECRET_KEY" ]]; then
  yellow "Empty Cloudflare Turnstile Private Key"
  exit 1
fi

if [[ -n "${ENV_HASH[NEXT_PUBLIC_TURNSTILE_SITE_KEY]:-}" ]]; then
  NEXT_PUBLIC_TURNSTILE_SITE_KEY="${ENV_HASH[NEXT_PUBLIC_TURNSTILE_SITE_KEY]}"
else
  read -r -p "Your Cloudflare Turnstile Public Key: " NEXT_PUBLIC_TURNSTILE_SITE_KEY
fi
if [[ -z "$NEXT_PUBLIC_TURNSTILE_SITE_KEY" ]]; then
  yellow "Empty Cloudflare Turnstile Public Key"
  exit 1
fi

BETTER_AUTH_SECRET="$(new_secure_password 32)"
if [[ -n "${ENV_HASH[BETTER_AUTH_URL]:-}" ]]; then
  BETTER_AUTH_URL="${ENV_HASH[BETTER_AUTH_URL]}"
else
  read -r -p "Deployment Host (Default: http://localhost:6769): " BETTER_AUTH_URL
fi
if [[ -z "$BETTER_AUTH_URL" ]]; then
  BETTER_AUTH_URL="http://localhost:6769"
fi

if [[ "$IS_PRODUCTION" == "true" ]]; then
  TILESERVER_URL=""
else
  TILESERVER_URL="http://localhost:6700"
fi

if [[ -z "$TILESERVER_URL" && "$IS_PRODUCTION" == "true" ]]; then
  read -r -p "Tileserver URL: " TILESERVER_URL
fi

if [[ "$IS_PRODUCTION" == "true" ]]; then
  NOMINATIM_URL="http://geocoder:8080"
  OSRM_DRIVING_URL="http://driving_router:5000"
  OSRM_BICYCLE_URL="http://driving_bicycle:5000"
  OSRM_FOOT_URL="http://osrm_foot:5000"
  ALGORITHM_SERV_URL="http://algorithm:8080"
else
  NOMINATIM_URL="http://localhost:6701"
  OSRM_DRIVING_URL="http://localhost:6702"
  OSRM_BICYCLE_URL="http://localhost:6703"
  OSRM_FOOT_URL="http://localhost:6704"
  ALGORITHM_SERV_URL="http://localhost:6705"
fi

REDIS_PORT="$(get_available_port)"
REDIS_CONNSTR="redis://localhost:${REDIS_PORT}"
REDIS_CONNSTR_DOTNET="redis:${REDIS_PORT}"

DATABASE_NAME="jippy"
DATABASE_HOST="localhost"
DATABASE_USERNAME="postgres"
DATABASE_PORT="$(get_available_port)"
if [[ -n "${ENV_HASH[DOCKER_POSTGRES_PASSWORD]:-}" ]]; then
  DATABASE_PASSWORD="${ENV_HASH[DOCKER_POSTGRES_PASSWORD]}"
else
  DATABASE_PASSWORD="$(new_secure_password 32)"
fi
DATABASE_CONNSTR="postgres://${DATABASE_USERNAME}:${DATABASE_PASSWORD}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}?schema=public"
DATABASE_CONNSTR_DOTNET="Host=db;Port=5432;Database=${DATABASE_NAME};Username=${DATABASE_USERNAME};Password=${DATABASE_PASSWORD}"

cat > "${SCRIPT_DIR}/.env" <<EOF
# DO NOT commit this file to your repository!

####################
# Web dashboard environment config
####################
BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET}"
BETTER_AUTH_URL="${BETTER_AUTH_URL}"
SENTRY_AUTH_TOKEN="${SENTRY_TOKEN}"
RESEND_API_KEY="${RESEND_TOKEN}"
RESEND_FROM_ADDRESS="${RESEND_ADDRESS}"
POSTGRES_URL="${DATABASE_CONNSTR}"
REDIS_URL="${REDIS_CONNSTR}"
CLOUDFLARE_TURNSTILE_SECRET_KEY="${CLOUDFLARE_TURNSTILE_SECRET_KEY}"
NEXT_PUBLIC_TURNSTILE_SITE_KEY="${NEXT_PUBLIC_TURNSTILE_SITE_KEY}"

# Proxied and accessed internally by the server
NOMINATIM_URL="${NOMINATIM_URL}"
OSRM_DRIVING_URL="${OSRM_DRIVING_URL}"
OSRM_BICYCLE_URL="${OSRM_BICYCLE_URL}"
OSRM_FOOT_URL="${OSRM_FOOT_URL}"
ALGORITHM_URL="${ALGORITHM_SERV_URL}"

# Service URLs that meant to be accessed outside
NEXT_PUBLIC_TILESERVER_URL="${TILESERVER_URL}"

####################
# For docker compose
####################
DOCKER_POSTGRES_USERNAME="${DATABASE_USERNAME}"
DOCKER_POSTGRES_PASSWORD="${DATABASE_PASSWORD}"
DOCKER_POSTGRES_DB_NAME="${DATABASE_NAME}"
DOCKER_POSTGRES_DB_PORT="${DATABASE_PORT}"
DOCKER_REDIS_PORT="${REDIS_PORT}"
DOCKER_DOTNET_POSTGRES="${DATABASE_CONNSTR_DOTNET}"
DOCKER_DOTNET_REDIS="${REDIS_CONNSTR_DOTNET}"
DOCKER_CLOUDFLARED_TOKEN="${CLOUDFLARE_TOKEN}"
EOF

echo "======================================="
echo "dotenv file is saved. We will run setup our environment now."

echo ""
echo "Downloading required files..."

ROOT_DIR="${SCRIPT_DIR}/.osm-data"
mkdir -p "$ROOT_DIR"

TILE_ROOT="${SCRIPT_DIR}/.osm-data/tileserver"
mkdir -p "$TILE_ROOT"

NE10M="${SCRIPT_DIR}/.osm-data/ne_10m_urban_areas.zip"
get_remote_item "$NE10M" "https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_urban_areas.zip"

NE10M_ICE="${SCRIPT_DIR}/.osm-data/ne_10m_antarctic_ice_shelves_polys.zip"
get_remote_item "$NE10M_ICE" "https://naciscdn.org/naturalearth/10m/physical/ne_10m_antarctic_ice_shelves_polys.zip"

NE10M_GLC="${SCRIPT_DIR}/.osm-data/ne_10m_glaciated_areas.zip"
get_remote_item "$NE10M_GLC" "https://naciscdn.org/naturalearth/10m/physical/ne_10m_glaciated_areas.zip"

COASTLINE="${SCRIPT_DIR}/.osm-data/water-polygons-split-4326.zip"
get_remote_item "$COASTLINE" "https://osmdata.openstreetmap.de/download/water-polygons-split-4326.zip"

PBF="${SCRIPT_DIR}/.osm-data/philippines-latest.osm.pbf"
get_remote_item "$PBF" "https://download.geofabrik.de/asia/philippines-latest.osm.pbf"

TILE_CONF="${SCRIPT_DIR}/.osm-data/tileserver/config-openmaptiles.json"
get_remote_item "$TILE_CONF" "https://raw.githubusercontent.com/systemed/tilemaker/refs/heads/master/resources/config-openmaptiles.json"

LUA_SCRIPT="${SCRIPT_DIR}/.osm-data/tileserver/process-openmaptiles.lua"
get_remote_item "$LUA_SCRIPT" "https://raw.githubusercontent.com/systemed/tilemaker/refs/heads/master/resources/process-openmaptiles.lua"

echo "======================================="
echo "Required files collected. Starting preprocessing..."

TILE_OUTPUT="${SCRIPT_DIR}/.osm-data/tileserver/map.mbtiles"
if [[ ! -f "$TILE_OUTPUT" ]]; then
  echo ""
  echo "Extracting files..."

  NE10M_EXTRACT_PATH="${SCRIPT_DIR}/.osm-data/tileserver/landcover/ne_10m_urban_areas"
  invoke_7z "$NE10M" "$NE10M_EXTRACT_PATH"

  NE10M_ICE_EXTRACT_PATH="${SCRIPT_DIR}/.osm-data/tileserver/landcover/ne_10m_antarctic_ice_shelves_polys"
  invoke_7z "$NE10M_ICE" "$NE10M_ICE_EXTRACT_PATH"

  NE10M_GLC_EXTRACT_PATH="${SCRIPT_DIR}/.osm-data/tileserver/landcover/ne_10m_glaciated_areas"
  invoke_7z "$NE10M_GLC" "$NE10M_GLC_EXTRACT_PATH"

  COASTLINE_EXTRACT_PATH="${SCRIPT_DIR}/.osm-data/tileserver/coastline"
  invoke_7z "$COASTLINE" "$COASTLINE_EXTRACT_PATH" true

  echo "Running tilemaker..."
  # Use -i (not -it) for non-interactive Linux deployment environments.
  docker run -i --rm \
    -w /data \
    -v "${SCRIPT_DIR}/.osm-data/tileserver:/data" \
    -v "${SCRIPT_DIR}/.osm-data/philippines-latest.osm.pbf:/data/philippines-latest.osm.pbf" \
    ghcr.io/systemed/tilemaker:master \
    --input /data/philippines-latest.osm.pbf \
    --output /data/map.mbtiles \
    --process /data/process-openmaptiles.lua \
    --config /data/config-openmaptiles.json
fi

TILESERVER_HOSTNAME="$(python3 - <<PY
from urllib.parse import urlparse
u = "${TILESERVER_URL}"
print(urlparse(u).hostname or "")
PY
)"

if [[ "$IS_PRODUCTION" == "true" && "$TILESERVER_HOSTNAME" != "localhost" && -n "$TILESERVER_HOSTNAME" ]]; then
  ALLOWED_HOSTS="localhost,${TILESERVER_HOSTNAME}"
else
  ALLOWED_HOSTS="localhost"
fi

cat > "${SCRIPT_DIR}/.osm-data/tileserver/config.json" <<EOF
{
  "options": {
    "paths": {
      "root": "/data",
      "fonts": "fonts",
      "styles": "styles",
      "sprites": "sprites",
      "mbtiles": ""
    },
    "allowedHosts": "${ALLOWED_HOSTS}"
  },
  "styles": {
    "liberty": {
      "style": "liberty.json",
      "sprite": "liberty/sprite",
      "serve_rendered": true
    },
    "positron": {
      "style": "positron.json",
      "sprite": "positron/sprite",
      "serve_rendered": true
    }
  },
  "data": {
    "philippines-map": {
      "mbtiles": "/data/map.mbtiles"
    }
  }
}
EOF

declare -A OSRM_VOLUME_PATH
declare -A OSRM_LUA_PATH
OSRM_VOLUME_PATH[Driving]="${SCRIPT_DIR}/.osm-data/osrm-driving"
OSRM_LUA_PATH[Driving]="/opt/car.lua"
OSRM_VOLUME_PATH[Bicycle]="${SCRIPT_DIR}/.osm-data/osrm-bicycle"
OSRM_LUA_PATH[Bicycle]="/opt/bicycle.lua"
OSRM_VOLUME_PATH[Foot]="${SCRIPT_DIR}/.osm-data/osrm-foot"
OSRM_LUA_PATH[Foot]="/opt/foot.lua"

for KEY in "${!OSRM_VOLUME_PATH[@]}"; do
  echo "Preparing data for ${KEY}..."

  VOLUME_PATH="${OSRM_VOLUME_PATH[$KEY]}"
  LUA_PATH="${OSRM_LUA_PATH[$KEY]}"

  if [[ -d "$VOLUME_PATH" ]]; then
    continue
  fi

  mkdir -p "$VOLUME_PATH"

  docker run -t --rm \
    -v "${VOLUME_PATH}:/data" \
    -v "${SCRIPT_DIR}/.osm-data/philippines-latest.osm.pbf:/data/philippines-latest.osm.pbf" \
    osrm/osrm-backend \
    osrm-extract -p "${LUA_PATH}" /data/philippines-latest.osm.pbf

  docker run -t --rm \
    -v "${VOLUME_PATH}:/data" \
    osrm/osrm-backend \
    osrm-partition /data/philippines-latest.osrm

  docker run -t --rm \
    -v "${VOLUME_PATH}:/data" \
    osrm/osrm-backend \
    osrm-customize /data/philippines-latest.osrm
done

echo "======================================="
echo "Pre-processing complete. Will now start docker-compose..."

docker compose up -d --wait

echo "Creating database..."
docker compose exec db psql -U "$DATABASE_USERNAME" -d postgres -c "CREATE DATABASE ${DATABASE_NAME};"

echo "Running migrations..."
npm run db:migrate

if [[ "$IS_PRODUCTION" == "true" ]]; then
  echo ""
  echo "Switching to production deployment..."

  docker compose down
  docker compose -f ./docker-compose.prod.yml up -d --wait
fi

echo ""
echo "Successfully created your local environment."
echo "You may run your db:* scripts and docker compose * commands without running the setup again."
echo ""
echo "Happy coding!"
echo ""