/**
 * Outdoor wet bulb globe temperature from standard weather data, after
 * Liljegren JC, Carhart RA, Lawday P, Tschopp S, Sharp R. Modeling the wet
 * bulb globe temperature using standard meteorological measurements.
 * J Occup Environ Hyg. 2008;5(10):645-55.
 *
 * TypeScript port of WBGT version 1.1 (calc_wbgt, Tglobe, Twb and helpers),
 * made by Raffa Gamadan Rifandi in 2026. The equations, constants, iteration
 * scheme and convergence rule are unchanged. The changes: the port runs in
 * double precision, takes the sun position from solar.ts, and adds a
 * bracketed fallback solver for inputs where the fixed-point iteration does
 * not settle within 50 steps.
 *
 * The original program, and so this file, are covered by its licence:
 *
 *              Copyright (c) 2008, UChicago Argonne, LLC
 *                      All Rights Reserved
 *
 *                       WBGT, Version 1.1
 *
 *                      James C. Liljegren
 *           Decision & Information Sciences Division
 *
 *                     OPEN SOURCE LICENSE
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer. Software changes,
 *    modifications, or derivative works, should be noted with comments and
 *    the author and organization's name.
 *
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * 3. Neither the names of UChicago Argonne, LLC or the Department of Energy
 *    nor the names of its contributors may be used to endorse or promote
 *    products derived from this software without specific prior written
 *    permission.
 *
 * 4. The software and the end-user documentation included with the
 *    redistribution, if any, must include the following acknowledgment:
 *
 *    "This product includes software produced by UChicago Argonne, LLC
 *    under Contract No. DE-AC02-06CH11357 with the Department of Energy."
 *
 * DISCLAIMER
 *
 * THE SOFTWARE IS SUPPLIED "AS IS" WITHOUT WARRANTY OF ANY KIND.
 *
 * NEITHER THE UNITED STATES GOVERNMENT, NOR THE UNITED STATES DEPARTMENT OF
 * ENERGY, NOR UCHICAGO ARGONNE, LLC, NOR ANY OF THEIR EMPLOYEES, MAKES ANY
 * WARRANTY, EXPRESS OR IMPLIED, OR ASSUMES ANY LEGAL LIABILITY OR
 * RESPONSIBILITY FOR THE ACCURACY, COMPLETENESS, OR USEFULNESS OF ANY
 * INFORMATION, DATA, APPARATUS, PRODUCT, OR PROCESS DISCLOSED, OR REPRESENTS
 * THAT ITS USE WOULD NOT INFRINGE PRIVATELY OWNED RIGHTS.
 */

import { SOLAR_CONSTANT, apparentCosZenith, referenceSunPosition } from './solar';

// Physical constants (SI unless noted), as in the reference code.
const STEFAN_BOLTZMANN = 5.6696e-8;
const CP = 1003.5; // J/(kg K)
const M_AIR = 28.97;
const M_H2O = 18.015;
const RATIO = (CP * M_AIR) / M_H2O;
const R_GAS = 8314.34;
const R_AIR = R_GAS / M_AIR;
const PRANDTL = CP / (CP + 1.25 * R_AIR);

// Wick (natural wet bulb) and globe properties.
const EMIS_WICK = 0.95;
const ALB_WICK = 0.4;
const D_WICK = 0.007; // m
const L_WICK = 0.0254; // m
const EMIS_GLOBE = 0.95;
const ALB_GLOBE = 0.05;
const D_GLOBE = 0.0508; // m, a 2-inch globe

// Ground.
const EMIS_SFC = 0.999;
const ALB_SFC = 0.45;

// Limits.
const CZA_MIN = 0.00873;
const NORMSOLAR_MAX = 0.85;
const REF_HEIGHT = 2;
const MIN_SPEED = 0.13;
const CONVERGENCE = 0.02;
const MAX_ITER = 50;

/** Saturation vapour pressure over liquid water, hPa (Buck 1981), with the 1.004 moist-air factor. */
export function saturationVapourPressure(tempK: number): number {
  const y = (tempK - 273.15) / (tempK - 32.18);
  return 1.004 * (6.1121 * Math.exp(17.502 * y));
}

/** Dew point in kelvin from vapour pressure in hPa (inverse of the formula above). */
export function dewPointFromVapourPressure(e: number): number {
  const z = Math.log(e / (6.1121 * 1.004));
  return 273.15 + (240.97 * z) / (17.502 - z);
}

/** Dynamic viscosity of air, kg/(m s). Bird, Stewart & Lightfoot. */
function viscosity(tempK: number): number {
  const sigma = 3.617;
  const epsKappa = 97.0;
  const tr = tempK / epsKappa;
  const omega = ((tr - 2.9) / 0.4) * -0.034 + 1.048;
  return (2.6693e-6 * Math.sqrt(M_AIR * tempK)) / (sigma * sigma * omega);
}

/** Thermal conductivity of air, W/(m K). */
function thermalConductivity(tempK: number): number {
  return (CP + 1.25 * R_AIR) * viscosity(tempK);
}

/** Diffusivity of water vapour in air, m²/s. */
function diffusivity(tempK: number, pressureHpa: number): number {
  const pcritAir = 36.4;
  const pcritH2o = 218;
  const tcritAir = 132;
  const tcritH2o = 647.3;
  const a = 3.64e-4;
  const b = 2.334;
  const pcrit13 = Math.pow(pcritAir * pcritH2o, 1 / 3);
  const tcrit512 = Math.pow(tcritAir * tcritH2o, 5 / 12);
  const tcrit12 = Math.sqrt(tcritAir * tcritH2o);
  const mmix = Math.sqrt(1 / M_AIR + 1 / M_H2O);
  const patm = pressureHpa / 1013.25;
  return ((a * Math.pow(tempK / tcrit12, b) * pcrit13 * tcrit512 * mmix) / patm) * 1e-4;
}

/** Heat of evaporation, J/kg (linear fit valid for 283 to 313 K). */
function heatOfEvaporation(tempK: number): number {
  return ((313.15 - tempK) / 30) * -71100 + 2.4073e6;
}

/** Clear-sky atmospheric emissivity (Oke). */
function atmosphericEmissivity(tempK: number, rh: number): number {
  const e = rh * saturationVapourPressure(tempK);
  return 0.575 * Math.pow(e, 0.143);
}

/** Convective heat transfer coefficient for a sphere, W/(m² K). */
function hSphere(diameter: number, tempK: number, pressureHpa: number, speed: number): number {
  const density = (pressureHpa * 100) / (R_AIR * tempK);
  const re = (Math.max(speed, MIN_SPEED) * density * diameter) / viscosity(tempK);
  const nu = 2.0 + 0.6 * Math.sqrt(re) * Math.pow(PRANDTL, 0.3333);
  return (nu * thermalConductivity(tempK)) / diameter;
}

/** Convective heat transfer coefficient for a cylinder in cross flow, W/(m² K). Bedingfield & Drew. */
function hCylinder(diameter: number, tempK: number, pressureHpa: number, speed: number): number {
  const a = 0.56;
  const b = 0.281;
  const c = 0.4;
  const density = (pressureHpa * 100) / (R_AIR * tempK);
  const re = (Math.max(speed, MIN_SPEED) * density * diameter) / viscosity(tempK);
  const nu = b * Math.pow(re, 1 - c) * Math.pow(PRANDTL, 1 - a);
  return (nu * thermalConductivity(tempK)) / diameter;
}

/** Brent's method on [a, b] with f(a) and f(b) already known and of opposite sign. */
function brent(
  f: (x: number) => number,
  lo: number,
  hi: number,
  fLo: number,
  fHi: number,
  tol: number,
  maxIter = 100,
): number {
  let a = lo;
  let b = hi;
  let fa = fLo;
  let fb = fHi;
  if (!(fa * fb <= 0)) return Number.NaN; // also rejects NaN
  if (Math.abs(fa) < Math.abs(fb)) {
    [a, b] = [b, a];
    [fa, fb] = [fb, fa];
  }
  let c = a;
  let fc = fa;
  let d = b - a;
  let mflag = true;
  for (let i = 0; i < maxIter; i++) {
    if (fb === 0 || Math.abs(b - a) < tol) return b;
    let s: number;
    if (fa !== fc && fb !== fc) {
      s =
        (a * fb * fc) / ((fa - fb) * (fa - fc)) +
        (b * fa * fc) / ((fb - fa) * (fb - fc)) +
        (c * fa * fb) / ((fc - fa) * (fc - fb));
    } else {
      s = b - (fb * (b - a)) / (fb - fa);
    }
    const q = (3 * a + b) / 4;
    const outside = !(s > Math.min(q, b) && s < Math.max(q, b));
    if (
      outside ||
      (mflag && Math.abs(s - b) >= Math.abs(b - c) / 2) ||
      (!mflag && Math.abs(s - b) >= Math.abs(c - d) / 2) ||
      (mflag && Math.abs(b - c) < tol) ||
      (!mflag && Math.abs(c - d) < tol)
    ) {
      s = (a + b) / 2;
      mflag = true;
    } else {
      mflag = false;
    }
    const fs = f(s);
    d = c;
    c = b;
    fc = fb;
    if (fa * fs < 0) {
      b = s;
      fb = fs;
    } else {
      a = s;
      fa = fs;
    }
    if (Math.abs(fa) < Math.abs(fb)) {
      [a, b] = [b, a];
      [fa, fb] = [fb, fa];
    }
  }
  return b;
}

/**
 * Solve T = g(T) with the reference scheme: relaxed fixed-point iteration,
 * stopping when |g(T) - T| < 0.02 K, at most 50 steps. Returns g(T) at the
 * last step, as the C code does, or NaN when it never settles.
 */
function referenceSolve(g: (t: number) => number, first: number): number {
  let prev = first;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    const next = g(prev);
    if (Math.abs(next - prev) < CONVERGENCE) return next;
    prev = 0.9 * prev + 0.1 * next;
  }
  return Number.NaN;
}

/**
 * Root of F(T) = T - g(T) to 1e-4 K. For both the globe and the wick g falls
 * as T rises, so F is increasing and the root is unique. The search brackets
 * the root outward from a guess, then runs Brent's method: about eight
 * evaluations where the relaxed iteration needs thirty to fifty, and it
 * lands on the root instead of stopping up to 0.02 K short of it. If no
 * bracket is found inside [lo, hi], the reference iteration is the fallback.
 */
function solve(g: (t: number) => number, guess: number, lo: number, hi: number): number {
  const f = (t: number) => t - g(t);
  let step = 1.5;
  let a = Math.max(lo, guess - step);
  let b = Math.min(hi, guess + step);
  let fa = f(a);
  let fb = f(b);
  while (fa > 0 && a > lo) {
    b = a;
    fb = fa;
    step *= 3;
    a = Math.max(lo, a - step);
    fa = f(a);
  }
  while (fb < 0 && b < hi) {
    a = b;
    fa = fb;
    step *= 3;
    b = Math.min(hi, b + step);
    fb = f(b);
  }
  const root = brent(f, a, b, fa, fb, 1e-4);
  return Number.isFinite(root) ? root : referenceSolve(g, guess);
}

/** Stull (2011) psychrometric wet bulb, °C, used only as a starting guess. */
function stullWetBulb(tempC: number, rhPercent: number): number {
  return (
    tempC * Math.atan(0.151977 * Math.sqrt(rhPercent + 8.313659)) +
    Math.atan(tempC + rhPercent) -
    Math.atan(rhPercent - 1.676331) +
    0.00391838 * Math.pow(rhPercent, 1.5) * Math.atan(0.023101 * rhPercent) -
    4.686035
  );
}

interface Radiation {
  solar: number;
  directFraction: number;
  cosZenith: number;
}

// Terms that do not depend on temperature, hoisted out of the solver loops.
// They are the same expressions as viscosity/thermalConductivity/diffusivity above.
const CONDUCTIVITY_PER_VISCOSITY = CP + 1.25 * R_AIR;
const PRANDTL_SPHERE = Math.pow(PRANDTL, 0.3333);
const PRANDTL_CYLINDER = Math.pow(PRANDTL, 1 - 0.56);
const DIFFUSIVITY_TCRIT = Math.sqrt(132 * 647.3);
const DIFFUSIVITY_SCALE =
  3.64e-4 *
  Math.pow(36.4 * 218, 1 / 3) *
  Math.pow(132 * 647.3, 5 / 12) *
  Math.sqrt(1 / M_AIR + 1 / M_H2O) *
  1013.25 *
  1e-4;

/** Globe temperature in kelvin (production solver). */
function globeTemperature(tairK: number, rh: number, pressure: number, speed: number, rad: Radiation): number {
  const tsfc = tairK;
  const longwave = 0.5 * (atmosphericEmissivity(tairK, rh) * tairK ** 4 + EMIS_SFC * tsfc ** 4);
  // With no direct beam the geometric term is skipped rather than
  // multiplying zero by 1/(2 cos z), which is infinite when the sun sits on the horizon.
  const beam = rad.directFraction > 0 ? rad.directFraction * (1 / (2 * rad.cosZenith) - 1) : 0;
  const shortwave = (rad.solar / (2 * STEFAN_BOLTZMANN * EMIS_GLOBE)) * (1 - ALB_GLOBE) * (beam + 1 + ALB_SFC);
  const windTerm = Math.max(speed, MIN_SPEED) * D_GLOBE * ((pressure * 100) / R_AIR);
  const convection = (tref: number) => {
    const mu = viscosity(tref);
    const re = windTerm / (tref * mu);
    const h = ((2.0 + 0.6 * Math.sqrt(re) * PRANDTL_SPHERE) * CONDUCTIVITY_PER_VISCOSITY * mu) / D_GLOBE;
    return h / (STEFAN_BOLTZMANN * EMIS_GLOBE);
  };
  const g = (tg: number) => {
    const inner = longwave - convection(0.5 * (tg + tairK)) * (tg - tairK) + shortwave;
    // Far above the root the convective loss exceeds every gain; clamp so the
    // bracket stays finite. At the root itself inner is always positive.
    return Math.pow(Math.max(inner, 0), 0.25);
  };
  // Linearise T^4 about the air temperature for a starting point.
  const guess = tairK + (longwave + shortwave - tairK ** 4) / (4 * tairK ** 3 + convection(tairK));
  return solve(g, guess, tairK - 40, tairK + 90);
}

/** Natural (radiative = true) or psychrometric wet bulb temperature in kelvin (production solver). */
function wetBulbTemperature(
  tairK: number,
  rh: number,
  pressure: number,
  speed: number,
  rad: Radiation,
  radiative: boolean,
): number {
  const tsfc = tairK;
  const eair = rh * saturationVapourPressure(tairK);
  const tdew = dewPointFromVapourPressure(eair);
  const sza = Math.acos(Math.max(-1, Math.min(1, rad.cosZenith)));
  const skyAndGround = 0.5 * (atmosphericEmissivity(tairK, rh) * tairK ** 4 + EMIS_SFC * tsfc ** 4);
  const beamGeometry =
    rad.directFraction > 0 ? rad.directFraction * (Math.tan(sza) / Math.PI + 0.25 * (D_WICK / L_WICK)) : 0;
  const shortwave =
    (1 - ALB_WICK) * rad.solar * ((1 - rad.directFraction) * (1 + 0.25 * (D_WICK / L_WICK)) + beamGeometry + ALB_SFC);
  const densityTimesT = (pressure * 100) / R_AIR;
  const windTerm = Math.max(speed, MIN_SPEED) * D_WICK * densityTimesT;

  const g = (twb: number) => {
    const tref = 0.5 * (twb + tairK);
    const mu = viscosity(tref);
    const density = densityTimesT / tref;
    const re = windTerm / (tref * mu);
    const h = (0.281 * Math.pow(re, 0.6) * PRANDTL_CYLINDER * CONDUCTIVITY_PER_VISCOSITY * mu) / D_WICK;
    const fatm = STEFAN_BOLTZMANN * EMIS_WICK * (skyAndGround - twb ** 4) + shortwave;
    const ewick = saturationVapourPressure(twb);
    const diff = (DIFFUSIVITY_SCALE * Math.pow(tref / DIFFUSIVITY_TCRIT, 2.334)) / pressure;
    const schmidt = mu / (density * diff);
    const evaporative =
      (heatOfEvaporation(tref) / RATIO) * ((ewick - eair) / (pressure - ewick)) * Math.pow(PRANDTL / schmidt, 0.56);
    return tairK - evaporative + (radiative ? fatm / h : 0);
  };
  // Keep the bracket below the local boiling point, where the wick vapour
  // pressure would reach the air pressure and the expression breaks down.
  const boilingK = dewPointFromVapourPressure(0.9 * pressure);
  const hi = Math.min(tairK + 40, boilingK);
  const lo = Math.min(tdew, hi) - 40;
  const psychro = stullWetBulb(tairK - 273.15, rh * 100) + 273.15;
  const guess = Math.min(Math.max(Number.isFinite(psychro) ? psychro : tdew, lo), hi);
  return solve(g, guess, lo, hi);
}

/**
 * Pasquill stability class (1 to 6) from solar radiation and wind in the day,
 * or wind and the vertical temperature gradient at night. EPA-454/5-99-005, 6.2.5.
 */
export function stabilityClass(daytime: boolean, speed: number, solar: number, deltaT: number): number {
  const table = [
    [1, 1, 2, 4, 0, 5, 6, 0],
    [1, 2, 3, 4, 0, 5, 6, 0],
    [2, 2, 3, 4, 0, 4, 4, 0],
    [3, 3, 4, 4, 0, 0, 0, 0],
    [3, 4, 4, 4, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ];
  let i: number;
  let j: number;
  if (daytime) {
    j = solar >= 925 ? 0 : solar >= 675 ? 1 : solar >= 175 ? 2 : 3;
    i = speed >= 6 ? 4 : speed >= 5 ? 3 : speed >= 3 ? 2 : speed >= 2 ? 1 : 0;
  } else {
    j = deltaT >= 0 ? 6 : 5;
    i = speed >= 2.5 ? 2 : speed >= 2 ? 1 : 0;
  }
  return table[i]![j]!;
}

/** Power-law estimate of the 2 m wind from a wind measured at `height`. */
export function windAtTwoMetres(speed: number, height: number, stability: number, urban: boolean): number {
  const urbanExp = [0.15, 0.15, 0.2, 0.25, 0.3, 0.3];
  const ruralExp = [0.07, 0.07, 0.1, 0.15, 0.35, 0.55];
  const exponent = (urban ? urbanExp : ruralExp)[stability - 1]!;
  return Math.max(speed * Math.pow(REF_HEIGHT / height, exponent), MIN_SPEED);
}

/**
 * Split the global irradiance into a direct-beam fraction from its ratio to
 * the top-of-atmosphere value, and cap that ratio at 0.85 as the model does.
 */
export function partitionSolar(
  solar: number,
  toaIrradiance: number,
  cosZenith: number,
): { solar: number; directFraction: number } {
  const toa = cosZenith < CZA_MIN ? 0 : toaIrradiance;
  if (toa <= 0) return { solar: Math.max(0, solar), directFraction: 0 };
  const norm = Math.min(Math.max(0, solar) / toa, NORMSOLAR_MAX);
  const adjusted = norm * toa;
  if (norm <= 0) return { solar: adjusted, directFraction: 0 };
  const fdir = Math.exp(3 - 1.34 * norm - 1.65 / norm);
  return { solar: adjusted, directFraction: Math.max(0, Math.min(fdir, 0.9)) };
}

export interface WbgtInput {
  /** Air temperature at 2 m, °C. */
  airTemperature: number;
  /** Relative humidity, percent. */
  relativeHumidity: number;
  /** Surface (station) pressure, hPa. */
  pressure: number;
  /** Wind speed, m/s, measured at `windHeight`. */
  windSpeed: number;
  /** Height of the wind measurement, m. Default 10. */
  windHeight?: number;
  /** Global horizontal irradiance, W/m². Zero in shade. */
  solar: number;
  /** Cosine of the solar zenith angle for the beam geometry. */
  cosZenith: number;
  /** Top-of-atmosphere horizontal irradiance for the same period, W/m². */
  toaIrradiance: number;
  /** Urban wind-profile exponents (more sheltering, higher WBGT). Default true. */
  urban?: boolean;
  /** Upper minus lower air temperature, used only at night. Default +1, a surface inversion. */
  deltaT?: number;
}

export interface WbgtResult {
  /** Outdoor WBGT, °C: 0.7 Tnwb + 0.2 Tg + 0.1 Ta. */
  wbgt: number;
  /** Black globe temperature, °C. */
  globe: number;
  /** Natural wet bulb temperature, °C. */
  naturalWetBulb: number;
  /** Estimated wind speed at 2 m, m/s. */
  wind2m: number;
  /** Irradiance after the clearness cap, W/m². */
  solar: number;
  /** Fraction of `solar` in the direct beam. */
  directFraction: number;
}

/** WBGT and its components for one set of conditions. Returns NaN fields when an input is missing. */
export function computeWbgt(input: WbgtInput): WbgtResult {
  const {
    airTemperature,
    relativeHumidity,
    pressure,
    windSpeed,
    windHeight = 10,
    solar,
    cosZenith,
    toaIrradiance,
    urban = true,
    deltaT = 1,
  } = input;

  const nan: WbgtResult = {
    wbgt: Number.NaN,
    globe: Number.NaN,
    naturalWetBulb: Number.NaN,
    wind2m: Number.NaN,
    solar: Number.NaN,
    directFraction: Number.NaN,
  };
  if (
    !Number.isFinite(airTemperature) ||
    !Number.isFinite(relativeHumidity) ||
    !Number.isFinite(pressure) ||
    !Number.isFinite(windSpeed) ||
    !Number.isFinite(solar) ||
    !Number.isFinite(cosZenith) ||
    !Number.isFinite(toaIrradiance)
  ) {
    return nan;
  }

  // Humidity of exactly 0 has no dew point; 0.5% is drier than any real air.
  const rh = Math.min(100, Math.max(0.5, relativeHumidity)) / 100;
  const radiation = partitionSolar(solar, toaIrradiance, cosZenith);

  let speed = Math.max(0, windSpeed);
  if (windHeight !== REF_HEIGHT) {
    const stability = stabilityClass(cosZenith > 0, speed, radiation.solar, deltaT);
    speed = windAtTwoMetres(speed, windHeight, stability, urban);
  }

  const tk = airTemperature + 273.15;
  const rad: Radiation = { ...radiation, cosZenith };
  const tg = globeTemperature(tk, rh, pressure, speed, rad);
  const tnwb = wetBulbTemperature(tk, rh, pressure, speed, rad, true);
  if (!Number.isFinite(tg) || !Number.isFinite(tnwb)) return nan;

  const globe = tg - 273.15;
  const naturalWetBulb = tnwb - 273.15;
  return {
    wbgt: 0.1 * airTemperature + 0.2 * globe + 0.7 * naturalWetBulb,
    globe,
    naturalWetBulb,
    wind2m: speed,
    solar: radiation.solar,
    directFraction: radiation.directFraction,
  };
}

/** Psychrometric (aspirated) wet bulb temperature, °C. */
export function psychrometricWetBulb(airTemperature: number, relativeHumidity: number, pressure: number): number {
  const rh = Math.min(100, Math.max(0.5, relativeHumidity)) / 100;
  const tk = airTemperature + 273.15;
  const t = wetBulbTemperature(tk, rh, pressure, 3, { solar: 0, directFraction: 0, cosZenith: 0 }, false);
  return t - 273.15;
}

export interface ReferenceInput {
  year: number;
  /** Day of year, 1 to 366 (the C code's month = 0 form). */
  dayOfYear: number;
  /** Hour in local standard time. */
  hour: number;
  minute: number;
  /** Local standard time minus GMT, hours. */
  gmtOffset: number;
  /** Averaging period of the inputs, minutes. */
  averagingMinutes: number;
  latitude: number;
  longitude: number;
  solar: number;
  pressure: number;
  airTemperature: number;
  relativeHumidity: number;
  windSpeed: number;
  windHeight: number;
  deltaT: number;
  urban: boolean;
}

export interface ReferenceResult {
  status: 0 | -1;
  wind2m: number;
  globe: number;
  naturalWetBulb: number;
  psychrometricWetBulb: number;
  wbgt: number;
}

/**
 * `calc_wbgt()` reproduced step for step, including its solar-position day
 * count, instantaneous zenith angle at the middle of the averaging period and
 * pure fixed-point solver. Used for validation against the C program; the app
 * itself calls `computeWbgt()`.
 */
export function calcWbgtReference(input: ReferenceInput): ReferenceResult {
  const hourGmt = input.hour - input.gmtOffset + (input.minute - 0.5 * input.averagingMinutes) / 60;
  const dday = input.dayOfYear + hourGmt / 24;
  const sun = referenceSunPosition(input.year, dday, input.latitude, input.longitude);
  const cza = apparentCosZenith(sun);

  let solar = input.solar;
  let fdir = 0;
  let toa = (SOLAR_CONSTANT * Math.max(0, cza)) / (sun.distance * sun.distance);
  if (cza < CZA_MIN) toa = 0;
  if (toa > 0) {
    const norm = Math.min(solar / toa, NORMSOLAR_MAX);
    solar = norm * toa;
    if (norm > 0) {
      fdir = Math.max(Math.min(Math.exp(3 - 1.34 * norm - 1.65 / norm), 0.9), 0);
    }
  }

  let speed = input.windSpeed;
  if (input.windHeight !== REF_HEIGHT) {
    const stability = stabilityClass(cza > 0, speed, solar, input.deltaT);
    speed = windAtTwoMetres(speed, input.windHeight, stability, input.urban);
  }

  const tk = input.airTemperature + 273.15;
  const rh = 0.01 * input.relativeHumidity;
  const rad: Radiation = { solar, directFraction: fdir, cosZenith: cza };
  const tg = referenceGlobe(tk, rh, input.pressure, speed, rad);
  const tnwb = referenceWetBulb(tk, rh, input.pressure, speed, rad, 1);
  const tpsy = referenceWetBulb(tk, rh, input.pressure, speed, rad, 0);
  const failed = !Number.isFinite(tg) || !Number.isFinite(tnwb);
  const globe = Number.isFinite(tg) ? tg - 273.15 : -9999;
  const naturalWetBulb = Number.isFinite(tnwb) ? tnwb - 273.15 : -9999;
  return {
    status: failed ? -1 : 0,
    wind2m: speed,
    globe,
    naturalWetBulb,
    psychrometricWetBulb: Number.isFinite(tpsy) ? tpsy - 273.15 : -9999,
    wbgt: failed ? -9999 : 0.1 * input.airTemperature + 0.2 * globe + 0.7 * naturalWetBulb,
  };
}

// The reference versions keep the original expression order (including the
// unguarded 1/(2 cos z) term) so the floating-point results line up.
function referenceGlobe(tairK: number, rh: number, pressure: number, speed: number, rad: Radiation): number {
  const tsfc = tairK;
  const g = (prev: number) => {
    const tref = 0.5 * (prev + tairK);
    const h = hSphere(D_GLOBE, tref, pressure, speed);
    return Math.pow(
      0.5 * (atmosphericEmissivity(tairK, rh) * Math.pow(tairK, 4) + EMIS_SFC * Math.pow(tsfc, 4)) -
        (h / (STEFAN_BOLTZMANN * EMIS_GLOBE)) * (prev - tairK) +
        (rad.solar / (2 * STEFAN_BOLTZMANN * EMIS_GLOBE)) *
          (1 - ALB_GLOBE) *
          (rad.directFraction * (1 / (2 * rad.cosZenith) - 1) + 1 + ALB_SFC),
      0.25,
    );
  };
  return referenceSolve(g, tairK);
}

function referenceWetBulb(
  tairK: number,
  rh: number,
  pressure: number,
  speed: number,
  rad: Radiation,
  radiative: 0 | 1,
): number {
  const a = 0.56;
  const tsfc = tairK;
  const sza = Math.acos(rad.cosZenith);
  const eair = rh * saturationVapourPressure(tairK);
  const tdew = dewPointFromVapourPressure(eair);
  const g = (prev: number) => {
    const tref = 0.5 * (prev + tairK);
    const h = hCylinder(D_WICK, tref, pressure, speed);
    const fatm =
      STEFAN_BOLTZMANN *
        EMIS_WICK *
        (0.5 * (atmosphericEmissivity(tairK, rh) * Math.pow(tairK, 4) + EMIS_SFC * Math.pow(tsfc, 4)) -
          Math.pow(prev, 4)) +
      (1 - ALB_WICK) *
        rad.solar *
        ((1 - rad.directFraction) * (1 + (0.25 * D_WICK) / L_WICK) +
          rad.directFraction * (Math.tan(sza) / Math.PI + (0.25 * D_WICK) / L_WICK) +
          ALB_SFC);
    const ewick = saturationVapourPressure(prev);
    const density = (pressure * 100) / (R_AIR * tref);
    const sc = viscosity(tref) / (density * diffusivity(tref, pressure));
    return (
      tairK -
      (((heatOfEvaporation(tref) / RATIO) * (ewick - eair)) / (pressure - ewick)) * Math.pow(PRANDTL / sc, a) +
      (fatm / h) * radiative
    );
  };
  return referenceSolve(g, tdew);
}
