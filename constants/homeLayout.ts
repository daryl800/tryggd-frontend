export type HomeStyle = 'simple' | 'detailed';
export type HomeLayout = 'free' | 'plus-simple' | 'plus-detailed';

export const HOME_STYLE_STORAGE_KEY = '@settings_home_style';
export const DEFAULT_HOME_STYLE: HomeStyle = 'simple';

export const isHomeStyle = (value: unknown): value is HomeStyle =>
  value === 'simple' || value === 'detailed';

export const getHomeLayout = (isPlus: boolean, homeStyle: HomeStyle): HomeLayout => {
  if (!isPlus) return 'free';
  return homeStyle === 'detailed' ? 'plus-detailed' : 'plus-simple';
};
