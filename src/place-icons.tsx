import { BedDouble, Bike, Building2, Bus, Coffee, Cross, Dumbbell, GraduationCap, Landmark, MapPin, ShoppingBag, TrainFront, Trees } from 'lucide-react';

export const placeIcons = {
  park: [Trees, '#16a34a'], sport: [Dumbbell, '#0369a1'], museum: [Landmark, '#9333ea'], culture: [Landmark, '#9333ea'],
  tram_stop: [TrainFront, '#4c1d95'], bus_stop: [Bus, '#3b4d61'], transit_stop: [TrainFront, '#4c1d95'],
  bike_rental: [Bike, '#059669'], food: [Coffee, '#ea580c'], shop: [ShoppingBag, '#2563eb'],
  health: [Cross, '#ef4444'], education: [GraduationCap, '#475569'], transport: [Bus, '#3b4d61'],
  services: [ShoppingBag, '#2563eb'], building: [Building2, '#475569'], lodging: [BedDouble, '#ec4899'],
  place: [MapPin, '#475569'],
} as const;

export function placeAppearance(kind?: string) {
  return placeIcons[kind as keyof typeof placeIcons] ?? placeIcons.place;
}

export function PlaceIcon({ kind, size = 18 }: { kind?: string; size?: number }) {
  if (kind === 'transit_stop') return <span className="combined-transit-icon" aria-hidden="true">
    <TrainFront size={size * .78} /><Bus size={size * .78} />
  </span>;
  const [Icon] = placeAppearance(kind);
  return <Icon size={size} aria-hidden="true" />;
}
