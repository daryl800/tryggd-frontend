import { ActionSheetIOS, Alert, Linking, Platform } from 'react-native';
import * as Localization from 'expo-localization';
import { wgs84ToGcj02, wgs84ToBd09 } from './coordinateTransform';

// ─── China detection ──────────────────────────────────────────────────────────

function isUserInChina(): boolean {
  if (Localization.region === 'CN') return true;
  // Secondary check: device timezone is a China timezone
  const tz = Localization.timezone ?? '';
  return (
    tz === 'Asia/Shanghai' ||
    tz === 'Asia/Chongqing' ||
    tz === 'Asia/Harbin' ||
    tz === 'Asia/Urumqi' ||
    tz === 'Asia/Kashgar'
  );
}

// ─── China map apps ───────────────────────────────────────────────────────────

type ChinaMapApp = {
  name: string;
  canOpen: () => Promise<boolean>;
  open: (lat: number, lng: number) => Promise<void>;
};

function chinaMapApps(wgsLat: number, wgsLng: number): ChinaMapApp[] {
  // Amap accepts dev=1 (WGS-84) and converts internally — no transform needed
  const amapSchemeCheck = Platform.OS === 'ios' ? 'iosamap://' : 'androidamap://';
  const amapUrl =
    Platform.OS === 'ios'
      ? `iosamap://viewMap?sourceApplication=tryggd&poiname=&lat=${wgsLat}&lon=${wgsLng}&dev=1`
      : `androidamap://viewMap?sourceApplication=tryggd&poiname=&lat=${wgsLat}&lon=${wgsLng}&dev=1`;

  // Baidu uses BD-09
  const bd = wgs84ToBd09(wgsLat, wgsLng);
  const baiduUrl = `baidumap://map/marker?location=${bd.lat},${bd.lng}&title=位置&traffic=on`;

  // Tencent uses GCJ-02
  const gcj = wgs84ToGcj02(wgsLat, wgsLng);
  const tencentUrl = `qqmap://map/marker?lat=${gcj.lat}&lon=${gcj.lng}&title=位置`;

  // Google Maps as a universal fallback (no coordinate transform — Google handles it)
  const googleUrl = `https://www.google.com/maps/search/?api=1&query=${wgsLat},${wgsLng}`;

  return [
    {
      name: '高德地图',
      canOpen: () => Linking.canOpenURL(amapSchemeCheck),
      open: () => Linking.openURL(amapUrl),
    },
    {
      name: '百度地图',
      canOpen: () => Linking.canOpenURL('baidumap://'),
      open: () => Linking.openURL(baiduUrl),
    },
    {
      name: '腾讯地图',
      canOpen: () => Linking.canOpenURL('qqmap://'),
      open: () => Linking.openURL(tencentUrl),
    },
    {
      name: 'Google Maps',
      canOpen: async () => true, // universal link, always works
      open: () => Linking.openURL(googleUrl),
    },
  ];
}

async function openChinaMap(
  lat: number,
  lng: number,
  strings: { title: string; cancel: string }
): Promise<void> {
  const apps = chinaMapApps(lat, lng);
  const available = (
    await Promise.all(apps.map(async (a) => ({ app: a, ok: await a.canOpen() })))
  )
    .filter((x) => x.ok)
    .map((x) => x.app);

  if (available.length === 0) {
    await Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    );
    return;
  }

  if (available.length === 1) {
    await available[0].open(lat, lng);
    return;
  }

  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: strings.title,
        options: [...available.map((a) => a.name), strings.cancel],
        cancelButtonIndex: available.length,
      },
      (index) => {
        if (index < available.length) {
          void available[index].open(lat, lng);
        }
      }
    );
  } else {
    Alert.alert(
      strings.title,
      undefined,
      [
        ...available.map((a) => ({
          text: a.name,
          onPress: () => void a.open(lat, lng),
        })),
        { text: strings.cancel, style: 'cancel' as const },
      ]
    );
  }
}

// ─── Global map (react-native-map-link) ──────────────────────────────────────

async function openGlobalMap(lat: number, lng: number, title?: string): Promise<void> {
  const { showLocation } = await import('react-native-map-link');
  await showLocation({ latitude: lat, longitude: lng, title: title ?? '' });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type OpenMapStrings = {
  dialogTitle: string;    // e.g. "Open in Maps"
  cancelText: string;     // e.g. "Cancel"
};

/**
 * Open coordinates in the user's preferred map app.
 * Shows Chinese map apps (Amap, Baidu, Tencent) for users in China,
 * and the globally installed apps (via react-native-map-link) elsewhere.
 */
export async function openInMaps(
  latitude: number,
  longitude: number,
  strings: OpenMapStrings,
  title?: string
): Promise<void> {
  if (isUserInChina()) {
    await openChinaMap(latitude, longitude, {
      title: strings.dialogTitle,
      cancel: strings.cancelText,
    });
  } else {
    await openGlobalMap(latitude, longitude, title);
  }
}
