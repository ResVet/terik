import { computeWbgt } from './liljegren';
import { instantGeometry, intervalGeometry } from './solar';

/** Surface pressure (hPa) from elevation (m) in the standard atmosphere. */
export function pressureFromElevation(elevation: number): number {
  return 1013.25 * Math.pow(1 - 2.25577e-5 * Math.max(-400, elevation), 5.25588);
}

export interface WeatherSeries {
  /** Unix time in ms. For averaged radiation this is the END of each interval. */
  time: ArrayLike<number>;
  /** °C at 2 m. */
  airTemperature: ArrayLike<number>;
  /** % at 2 m. */
  relativeHumidity: ArrayLike<number>;
  /** m/s at 10 m. */
  windSpeed: ArrayLike<number>;
  /** Global horizontal irradiance, W/m². */
  solar: ArrayLike<number>;
  /** Surface pressure, hPa. Estimated from elevation when missing. */
  pressure?: ArrayLike<number> | undefined;
}

export interface Site {
  latitude: number;
  longitude: number;
  elevation: number;
  /** Built-up surroundings (shelter lowers the 2 m wind). */
  urban: boolean;
}

export interface SeriesOptions {
  /**
   * Length of the averaging interval that ends at each timestamp, in ms.
   * 0 means the irradiance is instantaneous.
   */
  intervalMs: number;
  /** Also compute the shade value and the components. */
  detail?: boolean;
}

export interface WbgtSeries {
  wbgt: Float32Array;
  /** Present when `detail` is set. */
  shade?: Float32Array;
  globe?: Float32Array;
  naturalWetBulb?: Float32Array;
  wind2m?: Float32Array;
}

/**
 * WBGT for every step of a weather series. Missing inputs give NaN for that
 * step only. The shade value keeps the sunlit 2 m wind: shade changes what
 * the globe and wick see, not how stable the air is.
 */
export function computeSeries(weather: WeatherSeries, site: Site, options: SeriesOptions): WbgtSeries {
  const n = weather.time.length;
  const wbgt = new Float32Array(n);
  const detail = options.detail === true;
  const shade = detail ? new Float32Array(n) : undefined;
  const globe = detail ? new Float32Array(n) : undefined;
  const naturalWetBulb = detail ? new Float32Array(n) : undefined;
  const wind2m = detail ? new Float32Array(n) : undefined;
  const fallbackPressure = pressureFromElevation(site.elevation);

  for (let i = 0; i < n; i++) {
    const t = weather.time[i]!;
    const geometry =
      options.intervalMs > 0
        ? intervalGeometry(t, options.intervalMs, site.latitude, site.longitude)
        : instantGeometry(t, site.latitude, site.longitude);
    const p = weather.pressure?.[i];
    const pressure = p !== undefined && Number.isFinite(p) ? p : fallbackPressure;
    const airTemperature = weather.airTemperature[i]!;
    const relativeHumidity = weather.relativeHumidity[i]!;
    const sun = computeWbgt({
      airTemperature,
      relativeHumidity,
      pressure,
      windSpeed: weather.windSpeed[i]!,
      windHeight: 10,
      solar: weather.solar[i]!,
      cosZenith: geometry.cosZenith,
      toaIrradiance: geometry.toaIrradiance,
      urban: site.urban,
    });
    wbgt[i] = sun.wbgt;
    if (detail) {
      globe![i] = sun.globe;
      naturalWetBulb![i] = sun.naturalWetBulb;
      wind2m![i] = sun.wind2m;
      shade![i] = Number.isFinite(sun.wind2m)
        ? computeWbgt({
            airTemperature,
            relativeHumidity,
            pressure,
            windSpeed: sun.wind2m,
            windHeight: 2,
            solar: 0,
            cosZenith: geometry.cosZenith,
            toaIrradiance: geometry.toaIrradiance,
            urban: site.urban,
          }).wbgt
        : Number.NaN;
    }
  }
  const out: WbgtSeries = { wbgt };
  if (detail) Object.assign(out, { shade, globe, naturalWetBulb, wind2m });
  return out;
}
