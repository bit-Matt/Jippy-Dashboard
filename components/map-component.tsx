"use client";

import { useEffect } from "react";
import { MapContainer, useMap } from "react-leaflet";
import L from "leaflet";

import "@maplibre/maplibre-gl-leaflet";
import "leaflet/dist/leaflet.css";

const VectorTileLayer = () => {
  const map = useMap();

  useEffect(() => {
    const glLayer = L.maplibreGL({
      style: "https://tiles.openfreemap.org/styles/liberty"
    });

    glLayer.addTo(map);

    return () => {
      map.removeLayer(glLayer);
    }
  }, [map]);

  return null;
}

export default function MapComponent() {
  return (
    <MapContainer center={[10.7302, 122.5591]} zoom={13} className="h-full w-full">
      <VectorTileLayer />
    </MapContainer>
  )
}
