import { useState, useEffect, useCallback } from 'react';
import { useServiceAreas } from '@/hooks/useServiceAreas';

interface UserLocation {
  lat: number;
  lng: number;
  city: string;
  state: string;
  fullAddress: string;
}

const STORAGE_KEY = 'user-selected-location';

function getSavedLocation(): UserLocation | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

export function useUserLocation() {
  const [location, setLocation] = useState<UserLocation | null>(getSavedLocation);
  const [isLoading, setIsLoading] = useState(!getSavedLocation());
  const [isServiceable, setIsServiceable] = useState(true);
  const { isLocationServiceable, serviceAreas, isLoading: areasLoading } = useServiceAreas();

  // Check serviceability whenever location or areas change
  useEffect(() => {
    if (location && !areasLoading) {
      setIsServiceable(isLocationServiceable(location.lat, location.lng));
    }
  }, [location, serviceAreas, areasLoading, isLocationServiceable]);

  const saveLocation = useCallback((loc: UserLocation) => {
    setLocation(loc);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
  }, []);

  const reverseGeocodeNominatim = useCallback(async (lat: number, lng: number): Promise<UserLocation> => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`, {
        headers: { 'Accept-Language': 'en' },
      });
      const data = await res.json();
      const addr = data.address || {};
      const city = addr.city || addr.town || addr.village || addr.county || '';
      const state = addr.state || '';
      const locality = addr.suburb || addr.neighbourhood || '';
      const parts = [locality, city, state].filter(Boolean);
      return {
        lat, lng,
        city: city || 'Unknown',
        state,
        fullAddress: parts.join(', ') || data.display_name || 'Unknown location',
      };
    } catch {
      return { lat, lng, city: 'Unknown', state: '', fullAddress: 'Unknown location' };
    }
  }, []);

  const reverseGeocode = useCallback(async (lat: number, lng: number): Promise<UserLocation> => {
    // Try Google Maps first
    if (window.google?.maps) {
      return new Promise((resolve) => {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
          if (status === 'OK' && results[0]) {
            const components = results[0].address_components;
            const city = components.find((c: any) => c.types.includes('locality'))?.long_name || '';
            const state = components.find((c: any) => c.types.includes('administrative_area_level_1'))?.long_name || '';
            const suburb = components.find((c: any) => c.types.includes('sublocality_level_1'))?.long_name || '';
            const parts = [suburb, city, state].filter(Boolean);
            resolve({
              lat, lng,
              city: city || 'Unknown',
              state,
              fullAddress: parts.join(', ') || results[0].formatted_address || 'Unknown location',
            });
          } else {
            // Fallback to Nominatim
            resolve(reverseGeocodeNominatim(lat, lng));
          }
        });
      });
    }
    // Fallback to free Nominatim API
    return reverseGeocodeNominatim(lat, lng);
  }, [reverseGeocodeNominatim]);

  // Auto-detect on first load if no saved location
  useEffect(() => {
    if (getSavedLocation()) {
      setIsLoading(false);
      return;
    }
    if (!navigator.geolocation) {
      setIsLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const loc = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        saveLocation(loc);
        setIsLoading(false);
      },
      () => {
        setIsLoading(false);
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }, [reverseGeocode, saveLocation]);

  const updateLocation = useCallback(async (lat: number, lng: number) => {
    const loc = await reverseGeocode(lat, lng);
    saveLocation(loc);
  }, [reverseGeocode, saveLocation]);

  return { location, isLoading, isServiceable, updateLocation };
}
