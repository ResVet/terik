/*
 * Batch driver for Liljegren's WBGT v1.1 C program, used to produce the
 * reference values in src/lib/physics/__fixtures__. It is compiled against
 * the original wbgt.c (downloaded by generate.py, not redistributed here).
 *
 * Input, one case per line:
 *   year dayOfYear hour minute gmt avg lat lon solar pres Tair RH speed zspeed dT urban
 * Output, one line per case:
 *   status est_speed Tg Tnwb Tpsy Twbg
 */
#include <stdio.h>
#include <math.h>

#ifndef REAL
#define REAL double
#endif

int calc_wbgt();

int main(void) {
  char line[2048];
  while (fgets(line, sizeof line, stdin)) {
    int year, doy, hour, minute, gmt, avg, urban;
    double lat, lon, solar, pres, tair, rh, speed, zspeed, dT;
    if (sscanf(line, "%d %d %d %d %d %d %lf %lf %lf %lf %lf %lf %lf %lf %lf %d", &year, &doy, &hour,
               &minute, &gmt, &avg, &lat, &lon, &solar, &pres, &tair, &rh, &speed, &zspeed, &dT,
               &urban) != 16)
      continue;
    /* The original leaves est_speed unwritten when the wind is already at 2 m. */
    REAL est = speed, tg = 0, tnwb = 0, tpsy = 0, twbg = 0;
    int status = calc_wbgt(year, 0, doy, hour, minute, gmt, avg, (REAL)lat, (REAL)lon, (REAL)solar,
                           (REAL)pres, (REAL)tair, (REAL)rh, (REAL)speed, (REAL)zspeed, (REAL)dT,
                           urban, &est, &tg, &tnwb, &tpsy, &twbg);
    printf("%d %.12f %.12f %.12f %.12f %.12f\n", status, (double)est, (double)tg, (double)tnwb,
           (double)tpsy, (double)twbg);
  }
  return 0;
}
