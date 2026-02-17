"use client";

import { type ComponentProps, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";

import "@maplibre/maplibre-gl-leaflet";
import "leaflet-routing-machine";

import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";

const fixLeafletIcons = () => {
  // delete (L.Icon.Default.prototype)._getIconUrl;

  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  });
};

const MapCenterLogger = ({ fn }: MapCenterLoggerProps) => {
  const map = useMapEvents({
    // 'moveend' fires after the user stops dragging/zooming
    moveend: () => {
      const newCenter = map.getCenter();
      console.log("New Center:", newCenter);

      fn([newCenter.lat, newCenter.lng]);
    },
    // 'move' fires continuously while dragging (use with caution for performance)
    move: () => {
      // Optional: Update simplified state here
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
    if (!map) return;

    const routingControl = L.Routing.control({
      waypoints: waypoints.map(([lat, lng]) => L.latLng(lat, lng)),
      routeWhileDragging: true,
      lineOptions: {
        styles: [{ color, weight: 4 }],
        extendToWaypoints: true,
        missingRouteTolerance: 0,
      },
      show: false,
      addWaypoints: false,
      fitSelectedRoutes: true,
      showAlternatives: false,
    }).addTo(map);

    return () => {
      map.removeControl(routingControl);
    };
  }, [map, waypoints, color]);

  return null;
};

const DraggableMarker = ({ position, onUpdate }: DraggableMarkerProps) => {
  const [newPosition, setPosition] = useState<[number, number]>(position);

  // Ref to access the Leaflet marker instance directly
  const markerRef = useRef<L.Marker>(null);

  useEffect(() => {
    if (onUpdate) onUpdate(newPosition);
  }, [newPosition, onUpdate]);

  // Event handler for when dragging ends
  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const newPos = marker.getLatLng();
          setPosition([newPos.lat, newPos.lng]);
        }
      },
    }),
    [],
  );

  return (
    <Marker
      draggable={true}
      eventHandlers={eventHandlers}
      position={position}
      ref={markerRef}
    />
  );
};

export default function MapComponent({ editor, routing }: MapProps) {
  const [center, setCenter] = useState<[number, number]>([10.7302, 122.5591]);
  const [activePoint, setActivePoint] = useState<[number, number] | null>(null);

  useEffect(() => {
    fixLeafletIcons();
  }, []);

  useEffect(() => {
    if (editor) {
      // Set the point to the center of the map when the editor is created.
      if (editor.handleCreatePoint) {
        editor.handleCreatePoint(() => setActivePoint(center));
      }

      // When the handle add point is called, set the active point to the center of the map.
      if (editor.handleAddPoint) {
        editor.handleAddPoint(() => {
          if (activePoint) return activePoint;
          return center;
        });
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const onMarkerUpdate = (latLng: [number, number]) => {
    setActivePoint(latLng);
  };

  return (
    <MapContainer center={[10.7302, 122.5591]} zoom={13} className="h-full w-full">
      <VectorTileLayer />

      <MapCenterLogger fn={(latLng) => setCenter(latLng)} />

      {
        editor && (
          <>
            {
              activePoint && (
                <DraggableMarker position={activePoint} onUpdate={onMarkerUpdate} />
              )
            }
          </>
        )
      }

      {
        !editor && routing ? routing.map((r, i) => (
          <RoutingMachine key={i} waypoints={r.waypoints} color={r.color} />
        )) : (<></>)
      }
    </MapContainer>
  );
}

export interface RoutingMachineProps {
  waypoints: Array<[number, number]>;
  color: string;
}

export interface MapCenterLoggerProps {
  fn: (latLng: [number, number]) => void;
}

export interface DraggableMarkerProps {
  position: [number, number];
  onUpdate: (latLng: [number, number]) => void;
}

export interface EditorProps {
  color: string;
  waypoints: Array<{ sequence: number, points: [number, number] }>;

  handleCreatePoint: (fn: () => void) => void;
  handleAddPoint: (fn: () => [number, number]) => void;
}

export interface MapProps {
  editor?: EditorProps | null;

  routing?: Array<ComponentProps<typeof RoutingMachine>>;
}
