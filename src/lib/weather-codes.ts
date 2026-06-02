/**
 * WMO weather interpretation codes (as used by Open-Meteo) →
 * a human label + a lucide-react icon name.
 *
 * The icon name is a key into lucide-react's exports, e.g.
 *   import { icons } from "lucide-react";
 *   const Icon = icons[weatherCodeInfo(code).icon];
 *
 * Reference: https://open-meteo.com/en/docs (WMO Weather interpretation codes)
 */

export interface WeatherCodeInfo {
  label: string;
  /** A lucide-react icon component name. */
  icon: string;
}

const FALLBACK: WeatherCodeInfo = { label: "Unknown", icon: "CloudOff" };

const WEATHER_CODES: Record<number, WeatherCodeInfo> = {
  0: { label: "Clear sky", icon: "Sun" },
  1: { label: "Mainly clear", icon: "Sun" },
  2: { label: "Partly cloudy", icon: "CloudSun" },
  3: { label: "Overcast", icon: "Cloud" },
  45: { label: "Fog", icon: "CloudFog" },
  48: { label: "Depositing rime fog", icon: "CloudFog" },
  51: { label: "Light drizzle", icon: "CloudDrizzle" },
  53: { label: "Moderate drizzle", icon: "CloudDrizzle" },
  55: { label: "Dense drizzle", icon: "CloudDrizzle" },
  56: { label: "Light freezing drizzle", icon: "CloudDrizzle" },
  57: { label: "Dense freezing drizzle", icon: "CloudDrizzle" },
  61: { label: "Slight rain", icon: "CloudRain" },
  63: { label: "Moderate rain", icon: "CloudRain" },
  65: { label: "Heavy rain", icon: "CloudRainWind" },
  66: { label: "Light freezing rain", icon: "CloudRain" },
  67: { label: "Heavy freezing rain", icon: "CloudRainWind" },
  71: { label: "Slight snowfall", icon: "CloudSnow" },
  73: { label: "Moderate snowfall", icon: "CloudSnow" },
  75: { label: "Heavy snowfall", icon: "CloudSnow" },
  77: { label: "Snow grains", icon: "Snowflake" },
  80: { label: "Slight rain showers", icon: "CloudRain" },
  81: { label: "Moderate rain showers", icon: "CloudRain" },
  82: { label: "Violent rain showers", icon: "CloudRainWind" },
  85: { label: "Slight snow showers", icon: "CloudSnow" },
  86: { label: "Heavy snow showers", icon: "CloudSnow" },
  95: { label: "Thunderstorm", icon: "CloudLightning" },
  96: { label: "Thunderstorm with slight hail", icon: "CloudLightning" },
  99: { label: "Thunderstorm with heavy hail", icon: "CloudLightning" },
};

/** Map a WMO weather code to its label + lucide icon name. */
export function weatherCodeInfo(code: number): WeatherCodeInfo {
  return WEATHER_CODES[code] ?? FALLBACK;
}
