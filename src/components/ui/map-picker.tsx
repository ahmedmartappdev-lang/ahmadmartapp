import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MapPin, Navigation, Loader2, AlertTriangle } from 'lucide-react';

declare global {
  interface Window {
    google: any;
    initGoogleMaps?: () => void;
  }
}

export interface MapPickerResult {
  latitude: number;
  longitude: number;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  landmark?: string;
}

interface MapPickerProps {
  onLocationSelect: (result: MapPickerResult) => void;
  onServiceabilityChange?: (serviceable: boolean) => void;
  checkServiceability?: (lat: number, lng: number) => boolean;
  initialLat?: number | null;
  initialLng?: number | null;
  height?: string;
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

let googleMapsLoaded = false;
let googleMapsLoading = false;
const loadCallbacks: (() => void)[] = [];

function loadGoogleMaps(): Promise<void> {
  return new Promise((resolve) => {
    if (googleMapsLoaded && window.google?.maps) {
      resolve();
      return;
    }
    loadCallbacks.push(resolve);
    if (googleMapsLoading) return;
    googleMapsLoading = true;

    window.initGoogleMaps = () => {
      googleMapsLoaded = true;
      googleMapsLoading = false;
      loadCallbacks.forEach((cb) => cb());
      loadCallbacks.length = 0;
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&callback=initGoogleMaps`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  });
}

function parseAddressComponents(components: any[]): Partial<MapPickerResult> {
  const result: Partial<MapPickerResult> = {};
  const streetNumber = components.find((c: any) => c.types.includes('street_number'))?.long_name || '';
  const route = components.find((c: any) => c.types.includes('route'))?.long_name || '';
  const sublocality2 = components.find((c: any) => c.types.includes('sublocality_level_2'))?.long_name || '';
  const sublocality1 = components.find((c: any) => c.types.includes('sublocality_level_1'))?.long_name || '';
  const locality = components.find((c: any) => c.types.includes('locality'))?.long_name || '';
  const state = components.find((c: any) => c.types.includes('administrative_area_level_1'))?.long_name || '';
  const pincode = components.find((c: any) => c.types.includes('postal_code'))?.long_name || '';
  const premise = components.find((c: any) => c.types.includes('premise'))?.long_name || '';

  result.address_line1 = [premise, streetNumber, route].filter(Boolean).join(', ') || sublocality2 || '';
  result.address_line2 = [sublocality2, sublocality1].filter(Boolean).join(', ') || '';
  result.city = locality;
  result.state = state;
  result.pincode = pincode;

  return result;
}

export const MapPicker: React.FC<MapPickerProps> = ({
  onLocationSelect,
  onServiceabilityChange,
  checkServiceability,
  initialLat,
  initialLng,
  height = '250px',
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [notServiceable, setNotServiceable] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(
    initialLat && initialLng ? { lat: initialLat, lng: initialLng } : null
  );

  const checkAndNotify = useCallback(
    (lat: number, lng: number) => {
      if (checkServiceability) {
        const ok = checkServiceability(lat, lng);
        setNotServiceable(!ok);
        onServiceabilityChange?.(!ok ? false : true);
      }
    },
    [checkServiceability, onServiceabilityChange]
  );

  const reverseGeocode = useCallback(
    (lat: number, lng: number) => {
      checkAndNotify(lat, lng);
      if (!window.google?.maps) return;
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
        if (status === 'OK' && results[0]) {
          const parsed = parseAddressComponents(results[0].address_components);
          onLocationSelect({ latitude: lat, longitude: lng, ...parsed });
        } else {
          onLocationSelect({ latitude: lat, longitude: lng });
        }
      });
    },
    [onLocationSelect, checkAndNotify]
  );

  const placeMarker = useCallback(
    (lat: number, lng: number, panTo = true) => {
      if (!mapInstanceRef.current) return;
      const pos = { lat, lng };
      setSelectedCoords(pos);
      if (markerRef.current) {
        markerRef.current.setPosition(pos);
      } else {
        markerRef.current = new window.google.maps.Marker({
          position: pos,
          map: mapInstanceRef.current,
          draggable: true,
          animation: window.google.maps.Animation.DROP,
        });
        markerRef.current.addListener('dragend', () => {
          const p = markerRef.current.getPosition();
          const newLat = p.lat();
          const newLng = p.lng();
          setSelectedCoords({ lat: newLat, lng: newLng });
          reverseGeocode(newLat, newLng);
        });
      }
      if (panTo) mapInstanceRef.current.panTo(pos);
      reverseGeocode(lat, lng);
    },
    [reverseGeocode]
  );

  useEffect(() => {
    let mounted = true;
    loadGoogleMaps().then(() => {
      if (!mounted || !mapRef.current) return;
      const defaultCenter = { lat: initialLat || 28.4595, lng: initialLng || 77.0266 }; // Greater Noida default
      const map = new window.google.maps.Map(mapRef.current, {
        center: defaultCenter,
        zoom: 15,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl: true,
        styles: [
          { featureType: 'poi', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit', stylers: [{ visibility: 'off' }] },
        ],
      });
      mapInstanceRef.current = map;

      // Click to place marker
      map.addListener('click', (e: any) => {
        placeMarker(e.latLng.lat(), e.latLng.lng(), false);
      });

      // Autocomplete search
      if (searchInputRef.current) {
        const autocomplete = new window.google.maps.places.Autocomplete(searchInputRef.current, {
          componentRestrictions: { country: 'in' },
          fields: ['geometry', 'address_components', 'formatted_address'],
        });
        autocomplete.bindTo('bounds', map);
        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          if (place.geometry?.location) {
            const lat = place.geometry.location.lat();
            const lng = place.geometry.location.lng();
            map.setZoom(17);
            placeMarker(lat, lng);
          }
        });
      }

      // Place initial marker if coords provided
      if (initialLat && initialLng) {
        placeMarker(initialLat, initialLng);
      }

      setIsLoading(false);
    });
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        placeMarker(pos.coords.latitude, pos.coords.longitude);
        mapInstanceRef.current?.setZoom(17);
        setGpsLoading(false);
      },
      () => {
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="Search for a location..."
            className="pl-9"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleUseMyLocation}
          disabled={gpsLoading}
          className="shrink-0"
        >
          {gpsLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Navigation className="w-4 h-4" />
          )}
          <span className="ml-1 hidden sm:inline">My Location</span>
        </Button>
      </div>

      <div className="relative rounded-lg overflow-hidden border border-border">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/80">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <div ref={mapRef} style={{ width: '100%', height }} />
      </div>

      {notServiceable && selectedCoords && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          This area is not serviceable. Please select a location within our delivery zone.
        </div>
      )}

      {selectedCoords && !notServiceable && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          {selectedCoords.lat.toFixed(6)}, {selectedCoords.lng.toFixed(6)}
        </p>
      )}
    </div>
  );
};
