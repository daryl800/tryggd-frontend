import { Platform } from 'react-native';

export function iosFontSize(size: number) {
  if (Platform.OS !== 'ios') {
    return size;
  }

  return size >= 24 ? size + 3 : size + 2;
}
