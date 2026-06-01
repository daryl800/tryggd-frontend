import { supabase } from '../supabase';

type CheckinLocationPayload = {
  location_latitude: number;
  location_longitude: number;
  location_accuracy_meters: number | null;
};

async function hasAnyLocationRecipients(userId: string) {
  const { data, error } = await supabase
    .from('contacts')
    .select('id')
    .eq('owner_user_id', userId)
    .eq('location_sharing_enabled', true)
    .limit(1);

  if (error) {
    console.error('Failed to check location-sharing recipients:', error);
    return false;
  }

  console.log('📍 Location-sharing recipients found:', data?.length ?? 0);
  return (data?.length ?? 0) > 0;
}

export async function getOptionalCheckinLocation(
  userId: string,
  canShareLocation: boolean
): Promise<CheckinLocationPayload | null> {
  if (!canShareLocation) {
    console.log('📍 Skipping location capture because Tryggd Plus is not enabled');
    return null;
  }

  const hasRecipients = await hasAnyLocationRecipients(userId);
  if (!hasRecipients) {
    console.log('📍 Skipping location capture because no contacts have location sharing enabled');
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
    const location = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy?.Balanced ?? 3,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);

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
