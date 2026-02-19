"use client";

import { type ComponentProps, useEffect } from "react";
import { MapContainer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";

import "@maplibre/maplibre-gl-leaflet";
import "leaflet-routing-machine";
import "lrm-mapzen";

import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";

import { useRouteEditor } from "@/contexts/RouteEditorContext";

const fixLeafletIcons = () => {
  // delete (L.Icon.Default.prototype)._getIconUrl;

  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  });
};

const MapClickHandler = () => {
  const { isCreating, addWaypoint } = useRouteEditor();

  useMapEvents({
    click: (e) => {
      if (isCreating) {
        addWaypoint(e.latlng.lat, e.latlng.lng);
      }
    },
  });

  return null;
};

const VectorTileLayer = () => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const glLayer = L.maplibreGL({
      style: "https://api.maptiler.com/maps/openstreetmap/style.json?key=mNI9bvVhZy4T5HcVvqIr",
    });

    glLayer.addTo(map);

    return () => {
      map.removeLayer(glLayer);
    };
  }, [map]);

  return null;
};

const RoutingMachine = ({ waypoints, color }: RoutingMachineProps) => {
  const map = useMap();

  useEffect(() => {
    if (!map || waypoints.length < 2) return;

    const serviceUrl = new URL("/api/restricted/osm/valhalla/route", window.location.origin);

    // Create Valhalla router instance
    const mapzenRouter = L.Routing.mapzen("valhalla-", {
      costing: "auto",
      serviceUrl: serviceUrl.toString() + "?",
    });

    const routingControl = L.Routing.control({
      router: mapzenRouter,
      formatter: new L.Routing.mapzenFormatter(),
      waypoints: waypoints.map(([lat, lng]) => L.latLng(lat, lng)),
      routeWhileDragging: true,
      // @ts-expect-error - createMarker is required but we don't need it since we're using custom markers
      createMarker: () => null,
      lineOptions: {
        styles: [{ color, weight: 4 }],
        extendToWaypoints: true,
        missingRouteTolerance: 0,
      },
      show: false,
      addWaypoints: false,
      fitSelectedRoutes: false,
      showAlternatives: false,
    }).addTo(map);

    return () => {
      map.removeControl(routingControl);
    };
  }, [map, waypoints, color]);

  return null;
};

const WaypointMarkers = () => {
  const {
    waypoints,
    activePointIndex,
    updateWaypoint,
  } = useRouteEditor();

  return (
    <>
      {waypoints.map((waypoint) => {
        const isDraggable = waypoint.id === activePointIndex;

        return (
          <Marker
            key={waypoint.id}
            position={[waypoint.lat, waypoint.lng]}
            draggable={isDraggable}
            eventHandlers={{
              drag: (event) => {
                const marker = event.target as L.Marker;
                const { lat, lng } = marker.getLatLng();
                updateWaypoint(waypoint.id, lat, lng);
              },
              dragend: (event) => {
                const marker = event.target as L.Marker;
                const { lat, lng } = marker.getLatLng();
                updateWaypoint(waypoint.id, lat, lng);
              },
            }}
          />
        );
      })}
    </>
  );
};

export default function MapComponent({ routing }: MapProps) {
  const { isCreating, waypoints, selectedColor } = useRouteEditor();

  useEffect(() => {
    fixLeafletIcons();
  }, []);

  return (
    <MapContainer center={[10.7302, 122.5591]} zoom={13} className="h-full w-full">
      <VectorTileLayer />
      <MapClickHandler />
      {isCreating && <WaypointMarkers />}

      {isCreating && waypoints.length >= 2 && (
        <RoutingMachine
          waypoints={waypoints.map(wp => [wp.lat, wp.lng])}
          color={selectedColor}
        />
      )}

      {routing && !isCreating
        ? routing.map((r, i) => (
          <RoutingMachine key={i} waypoints={r.waypoints} color={r.color} />
        ))
        : null}
    </MapContainer>
  );
}

export interface RoutingMachineProps {
  waypoints: Array<[number, number]>;
  color: string;
}

export interface MapProps {
  routing?: Array<ComponentProps<typeof RoutingMachine>>;
}
