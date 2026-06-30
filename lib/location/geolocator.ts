import { Platform } from 'react-native';

export type Coordinates = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
};

const TIMEOUT_MS = 10_000;

/**
 * Get the user's current coordinates.
 *
 * On Android: uses react-native-nitro-geolocation with locationProvider "auto",
 * which tries the fused/GMS provider first and falls back to the native Android
 * LocationManager automatically — meaning it works in China where GMS is absent.
 *
 * On iOS: uses expo-location (CoreLocation, works everywhere).
 */
export async function getCurrentCoordinates(): Promise<Coordinates> {
  if (Platform.OS === 'android') {
    return getCoordinatesNitro();
  }
  return getCoordinatesExpo();
}

async function getCoordinatesNitro(): Promise<Coordinates> {
  const {
    setConfiguration,
    requestPermission,
    getCurrentPosition,
  } = await import('react-native-nitro-geolocation');

  setConfiguration({
    authorizationLevel: 'whenInUse',
    locationProvider: 'auto', // GMS if available, native LocationManager otherwise (China)
  });

  const status = await requestPermission();
  if (status !== 'granted') {
    throw new Error('location_permission_denied');
  }

  const position = await Promise.race([
    getCurrentPosition({ accuracy: { android: 'balanced' }, timeout: TIMEOUT_MS }),
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

async function getCoordinatesExpo(): Promise<Coordinates> {
  const Location = await import('expo-location');

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
