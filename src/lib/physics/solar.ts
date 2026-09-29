/**
 * Sun position and the zenith-angle terms the WBGT model needs.
 *
 * The position formulas are the low-precision series from the Astronomical
 * Almanac (1990) as coded by Nels Larson (PNNL) in `solarposition()`, the
 * routine Liljegren's WBGT program ships with. Stated accuracy is 0.01 degree
 * between 1950 and 2050.
 *
 * One difference from that routine: it counts days from J2000 with
 * `365 * dy + dy / 4 (+1 after 2000)`, which is one day too high for every
 * date in a leap year after 2000 (2004, 2008, ... 2024), which moves the sun
 * by up to 0.16° of elevation on those dates. Here the day count comes
 * straight from the UTC timestamp. `referenceSunPosition()` keeps the original
 * arithmetic so the validation suite can reproduce the C output.
 */

export const SOLAR_CONSTANT = 1367; // W/m², as used by Liljegren et al. (2008)

const DEG = Math.PI / 180;
const TWO_PI = 2 * Math.PI;
const MS_PER_DAY = 86_400_000;
/** 2000-01-01T12:00:00Z in days since the Unix epoch. */
const J2000_UNIX_DAYS = 10_957.5;

export interface SunPosition {
  /** Apparent declination, radians. */
  declination: number;
  /** Local hour angle, radians in [-π, π]; negative before solar noon. */
  hourAngle: number;
  /** Geometric elevation above the horizon, degrees (no refraction). */
  elevation: number;
  /** Refraction correction for standard air, degrees. Add to `elevation` for the apparent value. */
  refraction: number;
  /** Azimuth, degrees clockwise from north. */
  azimuth: number;
  /** Earth-Sun distance, astronomical units. */
  distance: number;
}

/** Fractional part with the sign of the argument, like C's `modf`. */
function frac(x: number): number {
  return x - Math.trunc(x);
}

export function daysSinceJ2000(utcMs: number): number {
  return utcMs / MS_PER_DAY - J2000_UNIX_DAYS;
}

/**
 * Sun position the way Larson's C routine computes it from a year and a
 * fractional day of year (GMT), leap-year day count included. Only used to
 * reproduce the reference program's output.
 */
export function referenceSunPosition(
  year: number,
  dayOfYearFraction: number,
  latitude: number,
  longitude: number,
): SunPosition {
  const dayNumber = Math.trunc(dayOfYearFraction);
  const deltaYears = year - 2000;
  // C integer division truncates toward zero.
  let deltaDays = deltaYears * 365 + Math.trunc(deltaYears / 4) + dayNumber;
  if (year > 2000) deltaDays += 1;
  const dayStart = deltaDays - 1.5;
  const ut = frac(dayOfYearFraction);
  return sunPositionCore(dayStart + ut, dayStart / 36525, ut * 24, latitude, longitude);
}

/**
 * Sun position for a given number of days since J2000.0 (UT) at a site.
 * Latitude and longitude in degrees, east positive.
 */
export function sunPositionFromJ2000(days: number, latitude: number, longitude: number): SunPosition {
  // Days since J2000 at 0h UT of the same date, and UT hours into the date.
  const dayStart = Math.floor(days + 0.5) - 0.5;
  return sunPositionCore(days, dayStart / 36525, (days - dayStart) * 24, latitude, longitude);
}

function sunPositionCore(
  days: number,
  centuries0h: number,
  utHours: number,
  latitude: number,
  longitude: number,
): SunPosition {
  const meanAnomaly = frac((357.528 + 0.9856003 * days) / 360) * TWO_PI;
  const meanLongitude = frac((280.46 + 0.9856474 * days) / 360) * TWO_PI;
  const obliquity = (23.439 - 4.0e-7 * days) * DEG;
  const eclipticLongitude =
    (1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * DEG + meanLongitude;

  const distance = 1.00014 - 0.01671 * Math.cos(meanAnomaly) - 0.00014 * Math.cos(2 * meanAnomaly);

  let rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLongitude),
    Math.cos(eclipticLongitude),
  );
  if (rightAscension < 0) rightAscension += TWO_PI;
  const raHours = frac(rightAscension / TWO_PI) * 24;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));

  let gmst0h =
    24110.54841 + centuries0h * (8640184.812866 + centuries0h * (0.093104 - centuries0h * 6.2e-6));
  gmst0h = frac(gmst0h / 3600 / 24) * 24;
  if (gmst0h < 0) gmst0h += 24;

  let lmst = gmst0h + utHours * 1.00273790934 + longitude / 15;
  lmst = frac(lmst / 24) * 24;
  if (lmst < 0) lmst += 24;

  let haHours = lmst - raHours;
  if (haHours < -12) haHours += 24;
  else if (haHours > 12) haHours -= 24;
  const hourAngle = (haHours / 24) * TWO_PI;

  const lat = latitude * DEG;
  const cosDec = Math.cos(declination);
  const sinDec = Math.sin(declination);
  const cosLat = Math.cos(lat);
  const sinLat = Math.sin(lat);
  const cosHa = Math.cos(hourAngle);

  const altitude = Math.asin(sinDec * sinLat + cosDec * cosHa * cosLat);
  const cosAlt = Math.cos(altitude);
  const tanAlt = Math.abs(altitude) < 1.57079615 ? Math.tan(altitude) : 6.0e6;

  const cosAz = (sinDec * cosLat - cosDec * cosHa * sinLat) / cosAlt;
  const sinAz = -((cosDec * Math.sin(hourAngle)) / cosAlt);
  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (Math.atan2(sinAz, cosAz) < 0) azimuth = TWO_PI - azimuth;

  const elevation = altitude / DEG;

  // Refraction for 1013.25 hPa and 15 °C, smoothed crossover at 19.225°.
  let refraction = 0;
  if (!(elevation < -1 || tanAlt === 6.0e6)) {
    const pressure = 1013.25;
    const temp = 15;
    if (elevation < 19.225) {
      refraction =
        ((0.1594 + elevation * (0.0196 + 0.00002 * elevation)) * pressure) /
        ((1 + elevation * (0.505 + 0.0845 * elevation)) * (273 + temp));
    } else {
      refraction = (0.00452 * (pressure / (273 + temp))) / tanAlt;
    }
  }

  return {
    declination,
    hourAngle,
    elevation,
    refraction,
    azimuth: azimuth / DEG,
    distance,
  };
}

export function sunPosition(utcMs: number, latitude: number, longitude: number): SunPosition {
  return sunPositionFromJ2000(daysSinceJ2000(utcMs), latitude, longitude);
}

/** Cosine of the zenith angle, including refraction, the way Liljegren's code derives it. */
export function apparentCosZenith(position: SunPosition): number {
  return Math.cos((90 - (position.elevation + position.refraction)) * DEG);
}

export interface IntervalGeometry {
  /** Mean cosine of the zenith angle over the sunlit part of the interval (0 if the sun never rises). */
  cosZenith: number;
  /** Fraction of the interval with the sun above the horizon. */
  sunlitFraction: number;
  /** Mean top-of-atmosphere irradiance on a horizontal surface over the whole interval, W/m². */
  toaIrradiance: number;
  /** Earth-Sun distance at the interval midpoint, AU. */
  distance: number;
}

/**
 * Zenith geometry for irradiance that is averaged over an interval ending at
 * `endMs` (Open-Meteo and ERA5 report the mean of the preceding hour).
 *
 * Following Hogan & Hirahara (2016), the beam geometry uses the mean cosine
 * over the sunlit part of the interval. Without this, the first and last
 * hours of daylight get either a zero or a badly misplaced sun angle.
 * Declination and hour angle come from the interval midpoint; the hour angle
 * is integrated analytically at 15° per hour.
 */
export function intervalGeometry(
  endMs: number,
  durationMs: number,
  latitude: number,
  longitude: number,
): IntervalGeometry {
  const midMs = endMs - durationMs / 2;
  const sun = sunPosition(midMs, latitude, longitude);
  const halfWidth = (durationMs / MS_PER_DAY) * Math.PI; // radians of hour angle

  const lat = latitude * DEG;
  const a = Math.sin(lat) * Math.sin(sun.declination);
  const b = Math.cos(lat) * Math.cos(sun.declination);

  let sunriseAngle: number; // sunlit while |h| < sunriseAngle
  if (b <= 1e-12) {
    sunriseAngle = a > 0 ? Math.PI : 0;
  } else {
    const c = -a / b;
    sunriseAngle = c <= -1 ? Math.PI : c >= 1 ? 0 : Math.acos(c);
  }

  let integral = 0;
  let sunlit = 0;
  const accumulate = (from: number, to: number) => {
    const lo = Math.max(from, -sunriseAngle);
    const hi = Math.min(to, sunriseAngle);
    if (hi > lo) {
      integral += a * (hi - lo) + b * (Math.sin(hi) - Math.sin(lo));
      sunlit += hi - lo;
    }
  };

  let start = sun.hourAngle - halfWidth;
  if (start < -Math.PI) start += TWO_PI;
  const end = start + 2 * halfWidth;
  if (end <= Math.PI) {
    accumulate(start, end);
  } else {
    accumulate(start, Math.PI);
    accumulate(-Math.PI, end - TWO_PI);
  }

  const width = 2 * halfWidth;
  const cosZenith = sunlit > 0 ? Math.max(0, integral / sunlit) : 0;
  const sunlitFraction = width > 0 ? Math.min(1, sunlit / width) : 0;
  const toaIrradiance =
    (SOLAR_CONSTANT / (sun.distance * sun.distance)) * cosZenith * sunlitFraction;

  return { cosZenith, sunlitFraction, toaIrradiance, distance: sun.distance };
}

/** Zenith geometry for an instantaneous irradiance value. */
export function instantGeometry(utcMs: number, latitude: number, longitude: number): IntervalGeometry {
  const sun = sunPosition(utcMs, latitude, longitude);
  const cz = apparentCosZenith(sun);
  const cosZenith = Math.max(0, cz);
  return {
    cosZenith,
    sunlitFraction: cz > 0 ? 1 : 0,
    toaIrradiance: (SOLAR_CONSTANT / (sun.distance * sun.distance)) * cosZenith,
    distance: sun.distance,
  };
}
