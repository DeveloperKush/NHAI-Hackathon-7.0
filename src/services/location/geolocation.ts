import * as Location from 'expo-location';

export interface GpsCoords {
  latitude: number;
  longitude: number;
}

/**
 * Requests foreground location permission and returns the current GPS coordinates.
 * Returns null if permission is denied or location lookup fails.
 * Uses Balanced accuracy to keep the pipeline fast (< 1 s budget).
 */
export async function getCurrentLocation(): Promise<GpsCoords | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.warn('Location permission not granted.');
      return null;
    }
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  } catch (err) {
    console.warn('Failed to get current location:', err);
    return null;
  }
}

/**
 * Checks whether location permission has already been granted without
 * triggering the system permission prompt.
 */
export async function hasLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}
