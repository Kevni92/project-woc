import definition from '../../../content/breakwater.visual.json';
import coastal from '../../../content/themes/coastal.json';
import { city } from './city-data';
import { parseTheme, parseVisuals } from './visual-data';

export function loadBreakwaterStyle() {
  const theme = parseTheme(coastal);
  return { theme, visuals: parseVisuals(definition, city, theme) };
}
