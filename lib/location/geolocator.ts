import * as Location from 'expo-location';

export type Coordinates = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
};

const TIMEOUT_MS = 10_000;

export async function getCurrentCoordinates(): Promise<Coordinates> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('location_permission_denied');
  }

  const position = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy?.Balanced ?? 3 }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('location_timeout')), TIMEOUT_MS)
    ),
  ]);

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy ?? null,
  };
}
