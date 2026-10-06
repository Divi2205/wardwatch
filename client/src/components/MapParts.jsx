// =====================================================================
// Map building blocks on top of react-leaflet.
// Tiles come from OpenStreetMap: free, no API key needed.
// =====================================================================
import { forwardRef, useEffect } from 'react';
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { MAP_CENTER, MAP_ZOOM, STATUS_COLORS, STATUS_LABELS } from '../utils';

export function BaseMap({ center = MAP_CENTER, zoom = MAP_ZOOM, interactive = true, className, children }) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom={interactive}
      dragging={interactive}
      zoomControl={interactive}
      className={className}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
        maxZoom={19}
      />
      {children}
    </MapContainer>
  );
}

// Round pin coloured by status. forwardRef lets the Home page open its popup.
export const StatusPin = forwardRef(function StatusPin({ issue, big = false, children, ...rest }, ref) {
  return (
    <CircleMarker
      ref={ref}
      center={[issue.latitude, issue.longitude]}
      radius={big ? 13 : 9}
      pathOptions={{ color: '#ffffff', weight: 2, fillColor: STATUS_COLORS[issue.status], fillOpacity: 1 }}
      {...rest}
    >
      {children}
    </CircleMarker>
  );
});

// Teardrop pin used when choosing a location (pure CSS, no image files)
export const dropPinIcon = L.divIcon({
  className: 'drop-pin',
  html: '<span></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 34]
});

// Zoom the map to show every point
export function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length) map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
  }, [map, points]);
  return null;
}

// Smoothly move the map when the target changes
export function FlyTo({ target, zoom = 16 }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, zoom, { duration: 0.6 });
  }, [map, target, zoom]);
  return null;
}

// Call onPick({ lat, lng }) when the map is clicked
export function ClickToPick({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng) });
  return null;
}

export function Legend({ statuses }) {
  return (
    <div className="legend">
      {statuses.map((s) => (
        <span key={s} style={{ '--c': STATUS_COLORS[s] }}>
          <i />
          {STATUS_LABELS[s]}
        </span>
      ))}
    </div>
  );
}
