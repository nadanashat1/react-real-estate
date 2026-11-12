import { useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
function ClickPoint({
  onPick,
}: {
  onPick?: (point: [number, number]) => void;
}) {
  useMapEvents({
    click: (e) =>
      onPick?.([
        Number(e.latlng.lat.toFixed(6)),
        Number(e.latlng.lng.toFixed(6)),
      ]),
  });
  return null;
}
export default function PropertyMap({
  point,
  onPick,
}: {
  point: [number, number] | null;
  onPick?: (point: [number, number]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="map-section">
      {!open ? (
        <button
          type="button"
          className="outline-button"
          onClick={() => setOpen(true)}
        >
          {onPick ? "Choose location on map" : "Show property map"}
        </button>
      ) : (
        <MapContainer
          center={point || [40, -100]}
          zoom={point ? 13 : 3}
          scrollWheelZoom={false}
          style={{ height: 300, width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickPoint onPick={onPick} />
          {point && (
            <CircleMarker
              center={point}
              radius={9}
              pathOptions={{
                color: "#f2492f",
                fillColor: "#232323",
                fillOpacity: 1,
              }}
            />
          )}
        </MapContainer>
      )}
      <small>
        {onPick
          ? "Click the map to set a pin. Use fictional locations in this preview."
          : "Location pin supplied by the listing owner."}{" "}
        Map tiles load from OpenStreetMap only when you open the map.
      </small>
      {point && (
        <p className="map-coordinates">
          Pin: {point[0]}, {point[1]}
        </p>
      )}
    </div>
  );
}
