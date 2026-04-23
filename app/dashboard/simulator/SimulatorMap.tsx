"use client";

import { useEffect } from "react";
import { MapContainer, Marker, Polyline, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";

import "@maplibre/maplibre-gl-leaflet";
import "leaflet.vectorgrid";

import "leaflet/dist/leaflet.css";

import type { NavigateRouteLeg } from "@/contracts/responses";
import { decodePolyline } from "@/lib/routing/polyline";

const fixLeafletIcons = () => {
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  });
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const VectorTileLayer = () => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const glLayer = L.maplibreGL({
      style: "/tileserver/liberty.json",
    });

    glLayer.addTo(map);

    return () => {
      map.removeLayer(glLayer);
    };
  }, [map]);

  return null;
};

interface MapClickHandlerProps {
  pickingMode: "start" | "end" | null;
  onMapClick: (lat: number, lng: number) => void;
}

const MapClickHandler = ({ pickingMode, onMapClick }: MapClickHandlerProps) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const container = map.getContainer();
    if (pickingMode) {
      container.style.cursor = "crosshair";
    } else {
      container.style.cursor = "";
    }
  }, [map, pickingMode]);

  useMapEvents({
    click: (e) => {
      if (!pickingMode) return;
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });

  return null;
};

interface FitBoundsOnResultProps {
  bbox: [number, number, number, number] | null;
}

const FitBoundsOnResult = ({ bbox }: FitBoundsOnResultProps) => {
  const map = useMap();

  useEffect(() => {
    if (!bbox || !map) return;
    const [minLng, minLat, maxLng, maxLat] = bbox;
    map.fitBounds(
      [[minLat, minLng], [maxLat, maxLng]],
      { padding: [40, 40], animate: true, maxZoom: 16 },
    );
  }, [map, bbox]);

  return null;
};

const InitMap = () => {
  useEffect(() => {
    fixLeafletIcons();
  }, []);
  return null;
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const LEG_FALLBACK_COLOR = "#6B7280";

export interface SimulatorMapProps {
  startPoint: [number, number] | null;
  endPoint: [number, number] | null;
  legs: NavigateRouteLeg[];
  globalBbox: [number, number, number, number] | null;
  pickingMode: "start" | "end" | null;
  onMapClick: (lat: number, lng: number) => void;
}

export default function SimulatorMap({
  startPoint,
  endPoint,
  legs,
  globalBbox,
  pickingMode,
  onMapClick,
}: SimulatorMapProps) {
  return (
    <MapContainer center={[10.7302, 122.5591]} zoom={13} className="h-full w-full">
      <InitMap />
      <VectorTileLayer />
      <MapClickHandler pickingMode={pickingMode} onMapClick={onMapClick} />
      <FitBoundsOnResult bbox={globalBbox} />

      {startPoint && <Marker position={startPoint} />}
      {endPoint && <Marker position={endPoint} />}

      {legs.map((leg, i) => {
        const coords = decodePolyline(leg.polyline);
        if (coords.length < 2) return null;
        return (
          <Polyline
            key={i}
            positions={coords}
            pathOptions={{ color: leg.color ?? LEG_FALLBACK_COLOR, weight: 5, opacity: 0.85 }}
          />
        );
      })}
    </MapContainer>
  );
}
