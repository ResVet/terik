import { expose, transfer } from 'comlink';
import { analyseClimate, type AnalysisOptions, type ClimateAnalysis, type ClimateYear } from '../lib/climate/analysis';
import { computeWbgt } from '../lib/physics/liljegren';
import { computeSeries, pressureFromElevation } from '../lib/physics/series';
import { intervalGeometry } from '../lib/physics/solar';
import type { Ensemble, Forecast, Grid, HourlyWeather } from '../data/openMeteo';

export interface ComputedHourly {
  time: Float64Array;
  wbgt: Float32Array;
  shade: Float32Array;
  globe: Float32Array;
  naturalWetBulb: Float32Array;
  wind2m: Float32Array;
  airTemperature: Float32Array;
  relativeHumidity: Float32Array;
  windSpeed: Float32Array;
  solar: Float32Array;
}

export interface ComputedNow {
  time: number;
  wbgt: number;
  shade: number;
  globe: number;
  naturalWetBulb: number;
  wind2m: number;
  airTemperature: number;
  relativeHumidity: number;
  windSpeed: number;
  solar: number;
}

export interface ComputedForecast {
  hourly: ComputedHourly;
  now: ComputedNow;
}

const HOUR = 3_600_000;

function computeForecast(forecast: Forecast, urban: boolean): ComputedForecast {
  const { grid, hourly, current } = forecast;
  const site = { latitude: grid.latitude, longitude: grid.longitude, elevation: grid.elevation, urban };
  const series = computeSeries(hourly, site, { intervalMs: HOUR, detail: true });

  const interval = Math.max(60, current.intervalSeconds) * 1000;
  const geometry = intervalGeometry(current.time, interval, grid.latitude, grid.longitude);
  const pressure = Number.isFinite(current.pressure) ? current.pressure : pressureFromElevation(grid.elevation);
  const sun = computeWbgt({
    airTemperature: current.airTemperature,
    relativeHumidity: current.relativeHumidity,
    pressure,
    windSpeed: current.windSpeed,
    solar: current.solar,
    cosZenith: geometry.cosZenith,
    toaIrradiance: geometry.toaIrradiance,
    urban,
  });
  const shade = Number.isFinite(sun.wind2m)
    ? computeWbgt({
        airTemperature: current.airTemperature,
        relativeHumidity: current.relativeHumidity,
        pressure,
        windSpeed: sun.wind2m,
        windHeight: 2,
        solar: 0,
        cosZenith: geometry.cosZenith,
        toaIrradiance: geometry.toaIrradiance,
        urban,
      }).wbgt
    : Number.NaN;

  const result: ComputedForecast = {
    hourly: {
      time: hourly.time,
      wbgt: series.wbgt,
      shade: series.shade!,
      globe: series.globe!,
      naturalWetBulb: series.naturalWetBulb!,
      wind2m: series.wind2m!,
      airTemperature: hourly.airTemperature,
      relativeHumidity: hourly.relativeHumidity,
      windSpeed: hourly.windSpeed,
      solar: hourly.solar,
    },
    now: {
      time: current.time,
      wbgt: sun.wbgt,
      shade,
      globe: sun.globe,
      naturalWetBulb: sun.naturalWetBulb,
      wind2m: sun.wind2m,
      airTemperature: current.airTemperature,
      relativeHumidity: current.relativeHumidity,
      windSpeed: current.windSpeed,
      solar: current.solar,
    },
  };
  return result;
}

export interface EnsembleWbgt {
  time: Float64Array;
  /** Member-major matrix: member m, hour i at m * hours + i. */
  values: Float32Array;
  members: number;
  hours: number;
}

function computeEnsemble(ensemble: Ensemble, grid: Grid, urban: boolean): EnsembleWbgt {
  const site = { latitude: grid.latitude, longitude: grid.longitude, elevation: grid.elevation, urban };
  const hours = ensemble.time.length;
  const values = new Float32Array(ensemble.members.length * hours);
  ensemble.members.forEach((member, m) => {
    const series = computeSeries({ ...member, time: ensemble.time }, site, { intervalMs: HOUR });
    values.set(series.wbgt, m * hours);
  });
  return { time: ensemble.time, values, members: ensemble.members.length, hours };
}

function computeClimateChunk(weather: HourlyWeather, grid: Grid, urban: boolean): Float32Array {
  const site = { latitude: grid.latitude, longitude: grid.longitude, elevation: grid.elevation, urban };
  return computeSeries(weather, site, { intervalMs: HOUR }).wbgt;
}

const api = {
  forecast(forecast: Forecast, urban: boolean): ComputedForecast {
    const out = computeForecast(forecast, urban);
    const h = out.hourly;
    return transfer(out, [h.wbgt.buffer, h.shade.buffer, h.globe.buffer, h.naturalWetBulb.buffer, h.wind2m.buffer]);
  },
  ensemble(ensemble: Ensemble, grid: Grid, urban: boolean): EnsembleWbgt {
    const out = computeEnsemble(ensemble, grid, urban);
    return transfer(out, [out.values.buffer]);
  },
  climateChunk(weather: HourlyWeather, grid: Grid, urban: boolean): Float32Array {
    const out = computeClimateChunk(weather, grid, urban);
    return transfer(out, [out.buffer]);
  },
  analyse(complete: ClimateYear[], partial: ClimateYear | null, options: AnalysisOptions): ClimateAnalysis {
    return analyseClimate(complete, partial, options);
  },
};

export type ComputeApi = typeof api;

expose(api);
