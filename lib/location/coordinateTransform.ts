// WGS-84 (GPS) → GCJ-02 (Amap/Tencent) → BD-09 (Baidu) coordinate transforms.
// Algorithms based on the publicly documented offsets used by Chinese mapping services.

const SEMI_MAJOR_AXIS = 6378245.0;
const EE = 0.00669342162296594323; // eccentricity squared

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
  return ret;
}

/** WGS-84 → GCJ-02 (used by Amap/高德 and Tencent Maps) */
export function wgs84ToGcj02(lat: number, lng: number): { lat: number; lng: number } {
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((SEMI_MAJOR_AXIS * (1 - EE)) / (magic * sqrtMagic)) * Math.PI);
  dLng = (dLng * 180.0) / ((SEMI_MAJOR_AXIS / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return { lat: lat + dLat, lng: lng + dLng };
}

/** GCJ-02 → BD-09 (used by Baidu Maps) */
export function gcj02ToBd09(lat: number, lng: number): { lat: number; lng: number } {
  const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin((lat * Math.PI * 3000) / 180);
  const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos((lng * Math.PI * 3000) / 180);
  return {
    lat: z * Math.sin(theta) + 0.006,
    lng: z * Math.cos(theta) + 0.0065,
  };
}

/** WGS-84 → BD-09 */
export function wgs84ToBd09(lat: number, lng: number): { lat: number; lng: number } {
  const gcj = wgs84ToGcj02(lat, lng);
  return gcj02ToBd09(gcj.lat, gcj.lng);
}
