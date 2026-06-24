type CheckinLocationPayload = {
  location_latitude: number;
  location_longitude: number;
  location_accuracy_meters: number | null;
};

export async function getOptionalCheckinLocation(
  userId: string,
  canShareLocation: boolean
): Promise<CheckinLocationPayload | null> {
  if (!canShareLocation) {
    console.log('📍 Skipping location capture because Tryggd Plus is not enabled');
    return null;
  }

  let locationModule: any;
  try {
    locationModule = await import('expo-location');
  } catch (error) {
    console.warn('Expo Location native module is unavailable; continuing without shared location', error);
    return null;
  }

  const Location = locationModule?.default ?? locationModule;
  if (
    !Location ||
    typeof Location.getForegroundPermissionsAsync !== 'function' ||
    typeof Location.requestForegroundPermissionsAsync !== 'function' ||
    typeof Location.getCurrentPositionAsync !== 'function'
  ) {
    console.warn('Expo Location module is present but incomplete; continuing without shared location');
    return null;
  }

  const existingPermission = await Location.getForegroundPermissionsAsync();
  let finalStatus = existingPermission.status;
  console.log('📍 Existing location permission status:', finalStatus);

  if (finalStatus !== 'granted') {
    const requestedPermission = await Location.requestForegroundPermissionsAsync();
    finalStatus = requestedPermission.status;
    console.log('📍 Requested location permission status:', finalStatus);
  }

  if (finalStatus !== 'granted') {
    console.log('Location permission not granted; continuing without shared location');
    return null;
  }

  try {
    // Try last-known position first (instant, no GPS warm-up needed)
    let location: any = null;
    if (typeof Location.getLastKnownPositionAsync === 'function') {
      try {
        const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 });
        if (last?.coords?.latitude != null) {
          location = last;
          console.log('📍 Using last-known position for check-in');
        }
      } catch {}
    }

    // Fall back to fresh fix with 8s timeout
    if (!location) {
      location = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy?.Balanced ?? 3,
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
      ]);
    }

    if (!location) {
      console.log('Location lookup timed out; continuing without shared location');
      return null;
    }

    console.log('📍 Captured check-in location:', {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy ?? null,
    });

    return {
      location_latitude: location.coords.latitude,
      location_longitude: location.coords.longitude,
      location_accuracy_meters: location.coords.accuracy ?? null,
    };
  } catch (error) {
    console.error('Failed to get current location for check-in:', error);
    return null;
  }
}
