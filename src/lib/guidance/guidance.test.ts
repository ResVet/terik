import { describe, expect, it } from 'vitest';
import { allowedMetabolicRate, wbgtLimit, workFraction, workMinutesPerHour } from './niosh';
import { assess, levelThresholds, type ProfileSettings } from './profiles';
import { regionFromClimate, regionFromLocation } from './sport';

const moderate: ProfileSettings = { profile: 'moderate', acclimatised: true, clothing: 'workClothes', region: 3 };

describe('NIOSH limits', () => {
  it('matches the published continuous-work limits (Oregon OSHA table, °C)', () => {
    // Acclimatised: light 30, moderate 28, heavy 26, very heavy 25
    expect(wbgtLimit(180, true)).toBeCloseTo(30.76, 2);
    expect(wbgtLimit(300, true)).toBeCloseTo(28.21, 2);
    expect(wbgtLimit(415, true)).toBeCloseTo(26.59, 2);
    expect(wbgtLimit(520, true)).toBeCloseTo(25.47, 2);
    // Unacclimatised: light 28, moderate 25, heavy 23, very heavy 21.6
    expect(wbgtLimit(180, false)).toBeCloseTo(28.1, 1);
    expect(wbgtLimit(300, false)).toBeCloseTo(24.97, 2);
    expect(wbgtLimit(415, false)).toBeCloseTo(22.99, 2);
  });

  it('reproduces the ACGIH work/rest table for moderate work within its 0.5 °C rounding', () => {
    // Table: 75-100% work 28.0, 50-75% 29.0, 25-50% 30.0, 0-25% 31.5
    const [l2, l3, l4, l5] = levelThresholds(moderate);
    expect(Math.abs(l2 - 28.0)).toBeLessThan(0.5);
    expect(Math.abs(l3 - 29.0)).toBeLessThan(0.5);
    expect(Math.abs(l4 - 30.0)).toBeLessThan(0.5);
    expect(Math.abs(l5 - 31.5)).toBeLessThan(0.5);
  });

  it('inverts the limit equation', () => {
    for (const m of [150, 250, 400]) {
      expect(allowedMetabolicRate(wbgtLimit(m, true), true)).toBeCloseTo(m, 8);
      expect(allowedMetabolicRate(wbgtLimit(m, false), false)).toBeCloseTo(m, 8);
    }
  });

  it('allows full work below the limit and none when resting already exceeds it', () => {
    expect(workFraction(25, 'moderate', true)).toBe(1);
    expect(workFraction(34, 'moderate', true)).toBe(0);
    const mid = workFraction(29.5, 'moderate', true);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('rounds work minutes down to 5-minute steps', () => {
    expect(workMinutesPerHour(1)).toBe(60);
    expect(workMinutesPerHour(0.749)).toBe(40);
    expect(workMinutesPerHour(0.75)).toBe(45);
    expect(workMinutesPerHour(0.08)).toBe(0);
  });
});

describe('assess', () => {
  it('agrees with the level thresholds for every profile', () => {
    const variants: ProfileSettings[] = [
      moderate,
      { ...moderate, profile: 'light', acclimatised: false },
      { ...moderate, profile: 'heavy', clothing: 'doubleLayer' },
      { ...moderate, profile: 'veryHeavy' },
      { ...moderate, profile: 'sport', region: 1 },
      { ...moderate, profile: 'sport', region: 3 },
      { ...moderate, profile: 'football' },
    ];
    for (const settings of variants) {
      const bounds = levelThresholds(settings);
      for (let w = 18; w <= 38; w += 0.013) {
        const { level } = assess(w, settings);
        const expected = 1 + bounds.filter((b) => (settings.profile === 'sport' || settings.profile === 'football' ? w >= b : w > b)).length;
        expect(level).toBe(expected);
      }
    }
  });

  it('adds the clothing adjustment for work profiles only', () => {
    expect(assess(28, { ...moderate, clothing: 'vapourBarrier' }).effectiveWbgt).toBe(39);
    expect(assess(28, { ...moderate, profile: 'sport', clothing: 'vapourBarrier' }).effectiveWbgt).toBe(28);
  });

  it('maps football to breaks between 28 and 32 °C and rescheduling above', () => {
    const football: ProfileSettings = { ...moderate, profile: 'football' };
    expect(assess(27.9, football).level).toBe(1);
    expect(assess(28, football).level).toBe(3);
    expect(assess(31.9, football).level).toBe(3);
    expect(assess(32, football).level).toBe(5);
  });
});

describe('sport regions', () => {
  it('classifies from the 90th percentile of warm-season daily maximum WBGT', () => {
    expect(regionFromClimate(29.5)).toBe(1);
    expect(regionFromClimate(30.0)).toBe(1);
    expect(regionFromClimate(31)).toBe(2);
    expect(regionFromClimate(32.3)).toBe(3);
  });
  it('guesses from latitude and elevation', () => {
    expect(regionFromLocation(-2.99, 10)).toBe(3); // Palembang
    expect(regionFromLocation(-6.9, 768)).toBe(2); // Bandung
    expect(regionFromLocation(51.5, 20)).toBe(1); // London
  });
});
