import type { Dictionary } from '../../i18n/en';
import { isWorkProfile, type Level, type ProfileId } from '../../lib/guidance/profiles';

/** One sentence of advice for a level, in the terms of the chosen profile. */
export function adviceFor(t: Dictionary, profile: ProfileId, level: Level, workMinutes: number | null): string {
  if (isWorkProfile(profile)) {
    const work = workMinutes ?? 60;
    if (level === 1 || work >= 60) return t.advice.workNone;
    if (work <= 0) return t.advice.workStop;
    if (level === 5) return t.advice.workLittle(work);
    return t.advice.workCycle(work, 60 - work);
  }
  if (profile === 'football') return t.advice.football[level];
  return t.advice.sport[level];
}

/** Short work/rest cell text for tables. */
export function workRestLabel(t: Dictionary, profile: ProfileId, level: Level, workMinutes: number | null): string {
  if (!isWorkProfile(profile)) return t.levels.name[level];
  const work = workMinutes ?? 60;
  if (work >= 60) return t.table.noLimit;
  if (work <= 0) return t.table.stop;
  return t.table.minutes(work);
}
