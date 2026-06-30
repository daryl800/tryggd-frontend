import { ActionSheetIOS, Alert, Linking, Platform } from 'react-native';
import * as Localization from 'expo-localization';
import { wgs84ToGcj02, wgs84ToBd09 } from './coordinateTransform';

function isUserInChina(): boolean {
  if (Localization.region === 'CN') return true;
  const tz = Localization.timezone ?? '';
  return (
    tz === 'Asia/Shanghai' ||
    tz === 'Asia/Chongqing' ||
    tz === 'Asia/Harbin' ||
    tz === 'Asia/Urumqi' ||
    tz === 'Asia/Kashgar'
  );
}

type MapOption = { label: string; url: string };

function chinaMapOptions(wgsLat: number, wgsLng: number): MapOption[] {
  // Amap: dev=1 means pass WGS-84, Amap converts internally
  const amapUrl = Platform.OS === 'ios'
    ? `iosamap://viewMap?sourceApplication=tryggd&poiname=&lat=${wgsLat}&lon=${wgsLng}&dev=1`
    : `androidamap://viewMap?sourceApplication=tryggd&poiname=&lat=${wgsLat}&lon=${wgsLng}&dev=1`;

  const bd = wgs84ToBd09(wgsLat, wgsLng);
  const baiduUrl = `baidumap://map/marker?location=${bd.lat},${bd.lng}&title=位置&traffic=on`;

  const gcj = wgs84ToGcj02(wgsLat, wgsLng);
  const tencentUrl = `qqmap://map/marker?lat=${gcj.lat}&lon=${gcj.lng}&title=位置`;

  const googleUrl = `https://www.google.com/maps/search/?api=1&query=${wgsLat},${wgsLng}`;

  return [
    { label: '高德地图', url: amapUrl },
    { label: '百度地图', url: baiduUrl },
    { label: '腾讯地图', url: tencentUrl },
    { label: 'Google Maps', url: googleUrl },
  ];
}

function globalMapOptions(lat: number, lng: number): MapOption[] {
  const googleUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  if (Platform.OS === 'ios') {
    return [
      { label: 'Apple Maps', url: `maps://?q=${lat},${lng}` },
      { label: 'Google Maps', url: googleUrl },
    ];
  }
  // Android: Google Maps web link works universally
  return [{ label: 'Google Maps', url: googleUrl }];
}

async function openUrl(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

function showMapPicker(
  options: MapOption[],
  dialogTitle: string,
  cancelText: string
): void {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: dialogTitle,
        options: [...options.map((o) => o.label), cancelText],
        cancelButtonIndex: options.length,
      },
      (index) => {
        if (index < options.length) {
          void openUrl(options[index].url);
        }
      }
    );
  } else {
    Alert.alert(
      dialogTitle,
      undefined,
      [
        ...options.map((o) => ({
          text: o.label,
          onPress: () => void openUrl(o.url),
        })),
        { text: cancelText, style: 'cancel' as const },
      ]
    );
  }
}

export type OpenMapStrings = {
  dialogTitle: string;
  cancelText: string;
};

export async function openInMaps(
  latitude: number,
  longitude: number,
  strings: OpenMapStrings
): Promise<void> {
  const options = isUserInChina()
    ? chinaMapOptions(latitude, longitude)
    : globalMapOptions(latitude, longitude);

  // Single option (Android outside China) — open directly, no dialog
  if (options.length === 1) {
    await openUrl(options[0].url);
    return;
  }

  showMapPicker(options, strings.dialogTitle, strings.cancelText);
}
