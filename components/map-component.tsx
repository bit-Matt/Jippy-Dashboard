"use client";

import { type ComponentProps, useEffect } from "react";
import { MapContainer, useMap } from "react-leaflet";
import L from "leaflet";

import "@maplibre/maplibre-gl-leaflet";
import "leaflet-routing-machine";

import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";

const fixLeafletIcons = () => {
  delete (L.Icon.Default.prototype as any)._getIconUrl;

  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  });
};

const VectorTileLayer = () => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const glLayer = L.maplibreGL({
      style: "https://api.maptiler.com/maps/openstreetmap/style.json?key=mNI9bvVhZy4T5HcVvqIr"
    });

    glLayer.addTo(map);

    return () => {
      map.removeLayer(glLayer);
    }
  }, [map]);

  return null;
}

const RoutingMachine = ({ waypoints }: RoutingMachineProps) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const routingControl = L.Routing.control({
      waypoints: waypoints.map(([lat, lng]) => L.latLng(lat, lng)),
      routeWhileDragging: true,
      lineOptions: {
        styles: [{ color: "#6FA1EC", weight: 4 }],
        extendToWaypoints: true,
        missingRouteTolerance: 0
      },
      show: false,
      addWaypoints: false,
      fitSelectedRoutes: true,
      showAlternatives: false
    }).addTo(map);

    return () => {
      map.removeControl(routingControl);
    };
  }, [map, waypoints]);

  return null;
};

export default function MapComponent({ routing }: MapProps) {
  useEffect(() => {
    fixLeafletIcons();
  }, []);

  return (
    <MapContainer center={[10.7302, 122.5591]} zoom={13} className="h-full w-full">
      <VectorTileLayer />

      {
        routing && (
          <RoutingMachine waypoints={routing.waypoints} />
        )
      }
    </MapContainer>
  )
}

export interface RoutingMachineProps {
  waypoints: Array<[number, number]>
}

export interface MapProps {
  routing?: ComponentProps<typeof RoutingMachine>
}
