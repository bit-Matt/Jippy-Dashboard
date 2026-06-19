Write-Host ""
Write-Host "       ___                      ______            _____                        __            "
Write-Host "      / (_)___  ____  __  __   / ____/___  ____  / __(_)___ ___  ___________ _/ /_____  _____"
Write-Host " __  / / / __ \/ __ \/ / / /  / /   / __ \/ __ \/ /_/ / __ `/ / / / ___/ __ `/ __/ __ \/ ___/"
Write-Host "/ /_/ / / /_/ / /_/ / /_/ /  / /___/ /_/ / / / / __/ / /_/ / /_/ / /  / /_/ / /_/ /_/ / /    "
Write-Host "\____/_/ .___/ .___/\__, /   \____/\____/_/ /_/_/ /_/\__, /\__,_/_/   \__,_/\__/\____/_/     "
Write-Host "      /_/   /_/    /____/                           /____/                                   "
Write-Host ""

###############################################################################
# Flags
###############################################################################
$IsProduction = (Test-Path -Path Env:NODE_ENV) -and ($env:NODE_ENV -eq "production")

###############################################################################
# Load existing .env variables for re-runs
###############################################################################
$envFilePath = Join-Path $PSScriptRoot ".env"

# Initialize an empty hashtable to hold our records
$envHash = @{}

if (Test-Path $envFilePath) {
    Write-Host "Found .env file. Building configuration record..." -ForegroundColor Cyan

    Get-Content $envFilePath | Where-Object {
        $_.Trim() -match '=' -and $_.Trim() -notmatch '^#'
    } | ForEach-Object {
        $name, $value = $_.Split('=', 2)

        $name = $name.Trim()
        $value = $value.Trim()

        if ($value -match '^"(.*)"$' -or $value -match "^'(.*)'$") {
            $value = $Matches[1]
        }

        # Add the key-value pair to our hashtable instead of the system environment
        $envHash[$name] = $value
    }

    Write-Host "Configuration record built successfully." -ForegroundColor Green
} else {
    Write-Host ".env file not found at $envFilePath. Using default/empty configuration." -ForegroundColor Yellow
}

###############################################################################
# Utilities
###############################################################################
function New-SecurePassword {
  param (
    [int]$Length = 16,
    [string]$AdditionalCharacters = ""
  )

  $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~"
  $bytes = New-Object Byte[] $Length

  # Generate cryptographically secure random bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)

  $password = ""
  foreach ($byte in $bytes) {
      # Convert the random byte to an index in our character string
      $password += $chars[$byte % $chars.Length]
  }

  $rng.Dispose()
  return $password
}

function Get-AvailablePort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $port = $listener.LocalEndpoint.Port
    $listener.Stop()

    return $port
}

function Get-RemoteItem {
  param (
    [string]$SavePath,
    [string]$DownloadUrl
  )

  if (Test-Path -Path $SavePath -PathType Leaf) {
    return
  }

  curl -L -o $SavePath "$DownloadUrl"
}

function Invoke-7z {
  param(
    [string]$Path,
    [string]$Output,
    [bool]$ExtractFilesOnly = $false,
    [bool]$Overwrite = $false
  )

  # Delete when overwrite is specified
  if ($Overwrite -and (Test-Path -Path $Output -PathType Container)) {
    Remove-Item -Path $Output -Recurse -Force
  }

  if ($ExtractFilesOnly) {
    7z e $Path -o"$Output" -y
    return
  }

  7z x $Path -o"$Output"
}

###############################################################################
# Dependency Check
###############################################################################

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host ""
  Write-Host "No npm found. Are you sure you installed Node.js?" -ForegroundColor Yellow
  Write-Host ""
  exit 1
}

# Check if docker exists or not
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host ""
  Write-Host "No docker found. Are you sure it's installed?" -ForegroundColor Yellow
  Write-Host ""
  exit 1
}

# Check if docker is running
docker info *> $null
if (-not ($LASTEXITCODE -eq 0)) {
  Write-Host ""
  Write-Host "Docker is not running. Start Docker first and try again." -ForegroundColor Yellow
  Write-Host ""
  exit 1
}

if (-not (Get-Command 7z -ErrorAction SilentlyContinue)) {
  Write-Host -ForegroundColor Yellow ""
  Write-Host -ForegroundColor Yellow "No 7z executable found. Install 7-Zip from here:"
  Write-Host -ForegroundColor Yellow "  https://www.7-zip.org/"
  Write-Host -ForegroundColor Yellow ""
  Write-Host -ForegroundColor Yellow "Then, add the installation path (where the 7z.exe lives) to PATH and try again."
  Write-Host -ForegroundColor Yellow ""
  exit 1
}

if (-not (Get-Command curl -ErrorAction SilentlyContinue)) {
  Write-Host -ForegroundColor Yellow ""
  Write-Host -ForegroundColor Yellow "No curl executable found. Install curl from here:"
  Write-Host -ForegroundColor Yellow "  https://curl.se/download.html#Win64"
  Write-Host -ForegroundColor Yellow "Then, add the installation path (where the curl.exe lives) to PATH and try again."
  Write-Host -ForegroundColor Yellow ""
  exit 1
}

###############################################################################
# Main Setup
###############################################################################

# Ask for Sentry Token
$Sentry_Token       = $envHash.SENTRY_AUTH_TOKEN ? $envHash.SENTRY_AUTH_TOKEN : (Read-Host -Prompt "Your Sentry Auth Token")
if (-not $Sentry_Token) {
  Write-Host "Empty Sentry Token." -ForegroundColor Yellow
  exit 1
}

# Resend configuration
$Resend_Token       = $envHash.RESEND_API_KEY ? $envHash.RESEND_API_KEY : (Read-Host -Prompt "Your Resend API Key")
if (-not $Resend_Token) {
  Write-Host "Empty Resend API Key." -ForegroundColor Yellow
  exit 1
}

$Resend_Address     = $envHash.RESEND_FROM_ADDRESS ? $envHash.RESEND_FROM_ADDRESS : (Read-Host -Prompt "Your Resend From Address Domain")
if (-not $Resend_Address) {
  Write-Host "Empty Resend Address Domain." -ForegroundColor Yellow
  exit 1
}

$Cloudflare_Token   = "IS_DEV_NOT_SET"
if ($IsProduction) {
  $Cloudflare_Token = $envHash.DOCKER_CLOUDFLARED_TOKEN ? $envHash.DOCKER_CLOUDFLARED_TOKEN : (Read-Host -Prompt "Your cloudflared token")
  if (-not $Cloudflare_Token) {
    Write-Host "Empty cloudflared token." -ForegroundColor Yellow
  }
}

$Cloudflare_Turnstile_Private_Key = $envHash.CLOUDFLARE_TURNSTILE_SECRET_KEY ? $envHash.CLOUDFLARE_TURNSTILE_SECRET_KEY : (Read-Host -Prompt "Your Cloudflare Turnsstile Secret Key")
if (-not $Cloudflare_Turnstile_Private_Key) {
  Write-Host "Empty Cloudflare Turnstile Private Key" -ForegroundColor Yellow
  exit 1
}

$Cloudflare_Turnstile_Public_Key = $envHash.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? $envHash.NEXT_PUBLIC_TURNSTILE_SITE_KEY : (Read-Host -Prompt "Your Cloudflare Turnstile Public Key")
if (-not $Cloudflare_Turnstile_Public_Key) {
  Write-Host "Empty Cloudflare Turnstile Public Key" -ForegroundColor Yellow
  exit 1
}

# BetterAuth Configuration
$Better_Auth_Secret = New-SecurePassword -Length 32 -AdditionalCharacters "!#%&()*+,/:;<=>?@[]^`{|}"
$Better_Auth_URL    = $envHash.BETTER_AUTH_URL ? $envHash.BETTER_AUTH_URL : (Read-Host -Prompt "Deployment Host (Default: http://localhost:6769)")
if (-not ($Better_Auth_URL)) {
  $Better_Auth_URL  = "http://localhost:6769"
}

# Service URLs
$Tileserver_URL     = $IsProduction ? "" : "http://localhost:6700"
if (($Tileserver_URL -eq "http://localhost:6700") -and ($IsProduction)) {
  $Tileserver_URL   = Read-Host -Prompt "Tileserver URL"
}

$Nominatim_URL      = $IsProduction ? "http://geocoder:8080"        : "http://localhost:6701"
$OSRM_Driving_URL   = $IsProduction ? "http://driving_router:5000"  : "http://localhost:6702"
$OSRM_Bicycle_URL   = $IsProduction ? "http://driving_bicycle:5000" : "http://localhost:6703"
$OSRM_Foot_URL      = $IsProduction ? "http://osrm_foot:5000"       : "http://localhost:6704"
$Algorithm_Serv_URL = $IsProduction ? "http://algorithm:8080"       : "http://localhost:6705"

# Database Configuration
$Redis_Port             = Get-AvailablePort
$Redis_ConnStr          = "redis://localhost`:$Redis_Port"
$Redis_ConnStrDotnet    = "redis`:$Redis_Port"

$Database_Name          = "jippy"
$Database_Host          = "localhost"
$Database_Username      = "postgres"
$Database_Port          = Get-AvailablePort
$Database_Password      = $envHash.DOCKER_POSTGRES_PASSWORD ? $envHash.DOCKER_POSTGRES_PASSWORD : (New-SecurePassword -Length 32)
$Database_ConnStr       = "postgres://$Database_Username`:$Database_password@$Database_Host`:$Database_Port/$Database_Name`?schema=public"
$Database_ConnStrDotnet = "Host=db;Port=5432;Database=$Database_Name;Username=$Database_Username;Password=$Database_Password"

# Create a dotenv file
$DotEnv_Contents = @"
# DO NOT commit this file to your repository!

####################
# Web dashboard environment config
####################
BETTER_AUTH_SECRET=`"$Better_Auth_Secret`"
BETTER_AUTH_URL=`"$Better_Auth_URL`"
SENTRY_AUTH_TOKEN=`"$Sentry_Token`"
RESEND_API_KEY=`"$Resend_Token`"
RESEND_FROM_ADDRESS=`"$Resend_Address`"
POSTGRES_URL=`"$Database_ConnStr`"
REDIS_URL=`"$Redis_ConnStr`"
CLOUDFLARE_TURNSTILE_SECRET_KEY=`"$Cloudflare_Turnstile_Private_Key`"
NEXT_PUBLIC_TURNSTILE_SITE_KEY=`"$Cloudflare_Turnstile_Public_Key`"

# Proxied and accessed internally by the server
NOMINATIM_URL=`"$Nominatim_URL`"
OSRM_DRIVING_URL=`"$OSRM_Driving_URL`"
OSRM_BICYCLE_URL=`"$OSRM_Bicycle_URL`"
OSRM_FOOT_URL=`"$OSRM_Foot_URL`"
ALGORITHM_URL=`"$Algorithm_Serv_URL`"

# Service URLs that meant to be accessed outside
NEXT_PUBLIC_TILESERVER_URL=`"$Tileserver_URL`"

####################
# For docker compose
####################
DOCKER_POSTGRES_USERNAME=`"$Database_Username`"
DOCKER_POSTGRES_PASSWORD=`"$Database_Password`"
DOCKER_POSTGRES_DB_NAME=`"$Database_Name`"
DOCKER_POSTGRES_DB_PORT=`"$Database_Port`"
DOCKER_REDIS_PORT=`"$Redis_Port`"
DOCKER_DOTNET_POSTGRES=`"$Database_ConnStrDotnet`"
DOCKER_DOTNET_REDIS=`"$Redis_ConnStrDotnet`"
DOCKER_CLOUDFLARED_TOKEN=`"$Cloudflare_Token`"
"@

Set-Content -Path .env -Value $DotEnv_Contents
Write-Host "======================================="
Write-Host "dotenv file is saved. We will run setup our environment now."

# Setup
Write-Host ""
Write-Host "Downloading required files..."

$root      = Join-Path -Path $PSScriptRoot -ChildPath ".osm-data"
if (-not (Test-Path -Path $root -PathType Container)) {
  New-Item -ItemType Directory $root
}

$tile_root = Join-Path -Path $PSScriptRoot -ChildPath ".\.osm-data\tileserver"
if (-not (Test-Path -Path $tile_root -PathType Container)) {
  New-Item -ItemType Directory $tile_root
}

$ne10m     = Join-Path -Path $PSScriptRoot -ChildPath ".osm-data\ne_10m_urban_areas.zip"
Get-RemoteItem -SavePath $ne10m -DownloadUrl "https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_urban_areas.zip"

$ne10m_ice = Join-Path -Path $PSScriptRoot -ChildPath ".osm-data\ne_10m_antarctic_ice_shelves_polys.zip"
Get-RemoteItem -SavePath $ne10m_ice -DownloadUrl "https://naciscdn.org/naturalearth/10m/physical/ne_10m_antarctic_ice_shelves_polys.zip"

$ne10m_glc = Join-Path -Path $PSScriptRoot -ChildPath ".osm-data\ne_10m_glaciated_areas.zip"
Get-RemoteItem -SavePath $ne10m_glc -DownloadUrl "https://naciscdn.org/naturalearth/10m/physical/ne_10m_glaciated_areas.zip"

$coastline = Join-Path -Path $PSScriptRoot -ChildPath ".osm-data\water-polygons-split-4326.zip"
Get-RemoteItem -SavePath $coastline -DownloadUrl "https://osmdata.openstreetmap.de/download/water-polygons-split-4326.zip"

$pbf       = Join-Path -Path $PSScriptRoot -ChildPath ".osm-data\philippines-latest.osm.pbf"
Get-RemoteItem -SavePath $pbf -DownloadUrl "https://download.geofabrik.de/asia/philippines-latest.osm.pbf"

$tileConf  = Join-Path -Path $PSScriptRoot -ChildPath ".osm-data\tileserver\config-openmaptiles.json"
Get-RemoteItem -SavePath $tileConf -DownloadUrl "https://raw.githubusercontent.com/systemed/tilemaker/refs/heads/master/resources/config-openmaptiles.json"

$luaScript = Join-Path -Path $PSScriptRoot -ChildPath ".osm-data\tileserver\process-openmaptiles.lua"
Get-RemoteItem -SavePath $luaScript -DownloadUrl "https://raw.githubusercontent.com/systemed/tilemaker/refs/heads/master/resources/process-openmaptiles.lua"

Write-Host "======================================="
Write-Host "Required files collected. Starting preprocessing..."

# Tilemaker
if (-not (Test-Path -Path $tile_root -PathType Container)) {
  Write-Host ""
  Write-Host "Extracting files..."

  $ne10m_Extract_Path = Join-Path -Path $PSScriptRoot -ChildPath ".osm-data\tileserver\landcover\ne_10m_urban_areas"
  Invoke-7z -Path $ne10m -Output $ne10m_Extract_Path

  $ne10m_Ice_Extract_Path = Join-Path -Path $PSScriptRoot -ChildPath ".osm-data\tileserver\landcover\ne_10m_antarctic_ice_shelves_polys"
  Invoke-7z -Path $ne10m_ice -Output $ne10m_Ice_Extract_Path

  $ne10m_Glaciated_Extract_Path = Join-Path -Path $PSScriptRoot -ChildPath ".osm-data\tileserver\landcover\ne_10m_glaciated_areas"
  Invoke-7z -Path $ne10m_glc -Output $ne10m_Glaciated_Extract_Path

  $coastline_Extract_Path = Join-Path -Path $PSScriptRoot -ChildPath ".osm-data\tileserver\coastline"
  Invoke-7z -Path $coasline -Output $coastline_Extract_Path -ExtractFilesOnly $true

  Write-Host "Running tilemaker..."
  $tilemaker_args = @(
    "run",
    "-it", "--rm",
    "-w", "/data",
    "-v", "./.osm-data/tileserver:/data",
    "-v", "./.osm-data/philippines-latest.osm.pbf:/data/philippines-latest.osm.pbf",
    "ghcr.io/systemed/tilemaker:master",
    "--input", "/data/philippines-latest.osm.pbf",
    "--output", "/data/map.mbtiles",
    "--process", "/data/process-openmaptiles.lua",
    "--config", "/data/config-openmaptiles.json"
  )
  & docker $tilemaker_args
}

# Create configuration
$tileserver_hostname = ([System.Uri]$Tileserver_URL).Host
$tileserver_config = @{
  options = @{
    paths = @{
      root = "/data"
      fonts = "fonts"
      styles = "styles"
      sprites = "sprites"
      mbtiles = ""
    }
    allowedHosts = ($IsProduction -and (-not ($tileserver_hostname -eq "localhost"))) ? "localhost,$tileserver_hostname" : "localhost"
  }
  styles = @{
    "liberty" = @{
      style = "liberty.json"
      sprite = "liberty/sprite"
      serve_rendered = $true
    }
    "positron" = @{
      style = "positron.json"
      sprite = "positron/sprite"
      serve_rendered = $true
    }
  }
  data = @{
    "philippines-map" = @{
      mbtiles = "/data/map.mbtiles"
    }
  }
}

$tile_config = $tileserver_config | ConvertTo-Json -Depth 3
Set-Content -Path ".\.osm-data\tileserver\config.json" -Value $tile_config

# OSRM Preprocessing
$osrm_configs = @{
  Driving = @{
    VolumePath = Join-Path -Path $PSScriptRoot ".osm-data\osrm-driving"
    LuaPath = "/opt/car.lua"
  }
  Bicycle = @{
    VolumePath = Join-Path -Path $PSScriptRoot ".osm-data\osrm-bicycle"
    LuaPath = "/opt/bicycle.lua"
  }
  Foot = @{
    VolumePath = Join-Path -Path $PSScriptRoot ".osm-data\osrm-foot"
    LuaPath = "/opt/foot.lua"
  }
}

foreach ($Pair in $osrm_configs.GetEnumerator()) {
  Write-Host "Preparing data for $($Pair.Key)..."
  if (Test-Path -Path $Pair.Value.VolumePath -PathType Container) {
    continue
  }

  $osrm_extract_args = @(
    "run",
    "-t", "--rm",
    "-v", "$($Pair.Value.VolumePath):/data"
    "-v", "./.osm-data/philippines-latest.osm.pbf:/data/philippines-latest.osm.pbf"
    "osrm/osrm-backend",
    "osrm-extract",
    "-p", "$($Pair.Value.LuaPath)",
    "/data/philippines-latest.osm.pbf"
  )
  & docker $osrm_extract_args

  $osrm_partition_args = @(
    "run",
    "-t", "--rm",
    "-v", "$($Pair.Value.VolumePath):/data",
    "osrm/osrm-backend",
    "osrm-partition",
    "/data/philippines-latest.osrm"
  )
  & docker $osrm_partition_args

  $osrm_customize_args = @(
    "run",
    "-t", "--rm",
    "-v", "$($Pair.Value.VolumePath):/data",
    "osrm/osrm-backend",
    "osrm-customize",
    "/data/philippines-latest.osrm"
  )
  & docker $osrm_customize_args
}

Write-Host "======================================="
Write-Host "Pre-processing complete. Will now start docker-compose..."

$Compose_Args = @("compose", "up", "-d", "--wait")
& docker $Compose_Args

Write-Host "Creating database..."
$Db_Create_Args = @(
  "compose",
  "exec",
  "db",
  "psql", "-U", "$Database_Username", "-d", "postgres", "-c", "CREATE DATABASE $Database_Name;"
)
& docker $Db_Create_Args

Write-Host "Running migrations..."
npm.cmd run db:migrate

# Note: All data is stored locally on disk. We can down the development setup and replace it with
# production one after everything is configured.
if ($IsProduction) {
  Write-Host ""
  Write-Host "Switching to production deployment..."

  # Down the container
  & docker compose down

  # Spin up the production-level compose file
  & docker compose up -f .\docker-compose.prod.yml -d --wait
}

Write-Host ""
Write-Host "Successfully created your local environment."
Write-Host "You may run your db:* scripts and docker compose * commands without running the setup again."
Write-Host ""
Write-Host "Happy coding!"
Write-Host ""
