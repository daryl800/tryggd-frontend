export type HomeStyle = 'simple' | 'enhanced';
export type HomeLayout = 'free' | 'plus-simple' | 'plus-enhanced';

export const HOME_STYLE_STORAGE_KEY = '@settings_home_style';
export const DEFAULT_HOME_STYLE: HomeStyle = 'simple';

export const isHomeStyle = (value: unknown): value is HomeStyle =>
  value === 'simple' || value === 'enhanced';

export const getHomeLayout = (isPlus: boolean, homeStyle: HomeStyle): HomeLayout => {
  if (!isPlus) return 'free';
  return homeStyle === 'enhanced' ? 'plus-enhanced' : 'plus-simple';
};
