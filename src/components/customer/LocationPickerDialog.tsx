import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MapPicker, type MapPickerResult } from '@/components/ui/map-picker';
import { Button } from '@/components/ui/button';
import { MapPin, Navigation, Loader2 } from 'lucide-react';
import { useServiceAreas } from '@/hooks/useServiceAreas';

interface LocationPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLocationConfirm: (lat: number, lng: number) => void;
  currentLat?: number | null;
  currentLng?: number | null;
}

export const LocationPickerDialog: React.FC<LocationPickerDialogProps> = ({
  open,
  onOpenChange,
  onLocationConfirm,
  currentLat,
  currentLng,
}) => {
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isServiceable, setIsServiceable] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const { isLocationServiceable } = useServiceAreas();

  const handleLocationSelect = (result: MapPickerResult) => {
    setSelectedLocation({ lat: result.latitude, lng: result.longitude });
  };

  const handleConfirm = async () => {
    if (!selectedLocation) return;
    setConfirming(true);
    await onLocationConfirm(selectedLocation.lat, selectedLocation.lng);
    setConfirming(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            Choose Delivery Location
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Search for your area or tap on the map to set your delivery location.
          </p>

          <MapPicker
            onLocationSelect={handleLocationSelect}
            onServiceabilityChange={(ok) => setIsServiceable(ok)}
            checkServiceability={isLocationServiceable}
            initialLat={currentLat}
            initialLng={currentLng}
            height="280px"
          />

          <Button
            onClick={handleConfirm}
            disabled={!selectedLocation || !isServiceable || confirming}
            className="w-full"
          >
            {confirming ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Navigation className="w-4 h-4 mr-2" />
            )}
            {!isServiceable ? 'Area Not Serviceable' : 'Confirm Location'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
