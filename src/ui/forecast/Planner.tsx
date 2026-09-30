import { useId, useMemo, useState } from 'react';
import { useFormat, useT } from '../../i18n';
import { assess } from '../../lib/guidance/profiles';
import { buildCalendar } from '../../lib/planner/ics';
import { bestPerDay, bestWindows, rankWindows, type ActivityWindow } from '../../lib/planner/windows';
import { localDateKey, localMinutes } from '../../lib/time/zone';
import { useStore } from '../../state/store';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { LevelBadge, levelColor } from '../components/Level';
import { downloadText, slug } from '../download';
import { adviceFor } from './advice';
import type { Week } from './model';
import styles from './Planner.module.css';

interface Props {
  week: Week;
  timeZone: string;
  placeName: string;
  now: number;
}

const DURATIONS = [1, 2, 3, 4, 6, 8];
const HOURS = Array.from({ length: 25 }, (_, h) => h);

export function Planner({ week, timeZone, placeName, now }: Props) {
  const t = useT();
  const f = useFormat();
  const settings = useStore((s) => s.settings);
  const [duration, setDuration] = useState(2);
  const [earliest, setEarliest] = useState(6);
  const [latest, setLatest] = useState(20);
  const durationId = useId();
  const fromId = useId();
  const toId = useId();

  const ranked = useMemo(() => {
    const time = week.hours.map((h) => h.time);
    const wbgt = week.hours.map((h) => h.wbgt);
    const worse = week.members ? week.hours.map((h) => h.worseChance) : undefined;
    return rankWindows(
      { time, wbgt, worseChance: worse },
      {
        durationMinutes: duration * 60,
        earliest: earliest * 60,
        latest: latest * 60,
        notBefore: now - 5 * 60_000,
        settings,
        localMinutes: (ms) => localMinutes(ms, timeZone),
        localDay: (ms) => localDateKey(ms, timeZone),
      },
    );
  }, [week, duration, earliest, latest, now, settings, timeZone]);

  const top = bestWindows(ranked, 3);
  const perDay = bestPerDay(ranked);
  const profileName = t.profiles.name[settings.profile];

  const range = (w: ActivityWindow) => t.planner.range(f.time(w.start, timeZone), f.time(w.end, timeZone));
  const rangeLabel = (w: ActivityWindow) => `${f.time(w.start, timeZone)}-${f.time(w.end, timeZone)}`;

  const eventFor = (w: ActivityWindow) => {
    const { level, workMinutes } = assess(w.peakWbgt, settings);
    return {
      uid: `${w.start}-${settings.profile}@terik`,
      start: w.start,
      end: w.end,
      summary: `${t.planner.eventTitle(profileName)} · ${placeName}`,
      description: t.planner.eventText(
        f.temp(w.peakWbgt),
        `${t.levels.level(level)} ${t.levels.name[level]}`,
        adviceFor(t, settings.profile, level, workMinutes),
      ),
      location: placeName,
      url: window.location.href,
    };
  };

  const exportWindows = (windows: ActivityWindow[]) => {
    if (!windows.length) return;
    const ics = buildCalendar(windows.map(eventFor));
    const day = localDateKey(windows[0]!.start, timeZone);
    downloadText(`terik-${slug(placeName)}-${day}.ics`, ics, 'text/calendar');
  };

  const changeEarliest = (v: number) => {
    setEarliest(v);
    if (latest - v < duration) setLatest(Math.min(24, v + duration));
  };

  return (
    <Card id="planner" title={t.planner.title} subtitle={t.planner.subtitle}>
      <div className={styles.controls}>
        <div className={styles.field}>
          <label htmlFor={durationId}>{t.planner.duration}</label>
          <select id={durationId} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {t.planner.hours(d)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={fromId}>{t.planner.between}</label>
          <div className={styles.rangeRow}>
            <select id={fromId} value={earliest} onChange={(e) => changeEarliest(Number(e.target.value))}>
              {HOURS.slice(0, 24).map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
            <label htmlFor={toId} className={styles.and}>
              {t.planner.and}
            </label>
            <select id={toId} value={latest} onChange={(e) => setLatest(Number(e.target.value))}>
              {HOURS.slice(1).map((h) => (
                <option key={h} value={h} disabled={h <= earliest}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {top.length === 0 ? (
        <p className={styles.empty}>{t.planner.none}</p>
      ) : (
        <>
          <ol className={styles.top}>
            {top.map((w, i) => (
              <li key={w.start} className={styles.window}>
                <div className={styles.windowHead}>
                  <span className={styles.rank}>{t.planner.rank(i)}</span>
                  <button
                    type="button"
                    className={styles.add}
                    onClick={() => exportWindows([w])}
                    aria-label={`${t.planner.calendar}: ${f.dayLabel(w.start, timeZone, now)} ${range(w)}`}
                  >
                    <Icon name="calendar" size={16} />
                    <span>{t.planner.calendarOne}</span>
                  </button>
                </div>
                <p className={styles.when}>
                  <span className={styles.day}>{f.dayLabel(w.start, timeZone, now)}</span>
                  <span className={styles.time}>{rangeLabel(w)}</span>
                </p>
                <div className={styles.facts}>
                  <LevelBadge level={w.peakLevel} size="s" />
                  <span className={styles.peak}>{t.planner.peak(f.temp(w.peakWbgt))}</span>
                </div>
                {w.worseChance !== null && (
                  <p className={styles.chance}>
                    {w.worseChance >= 0.05 ? t.planner.worse(Math.round(w.worseChance * 100)) : t.planner.sure}
                  </p>
                )}
              </li>
            ))}
          </ol>
          <button type="button" className={styles.exportAll} onClick={() => exportWindows(top)}>
            <Icon name="download" size={16} />
            {t.planner.calendar}
          </button>

          <h3 className={styles.perDayTitle}>{t.planner.perDay}</h3>
          <ul className={styles.perDay}>
            {perDay.map((w) => (
              <li key={w.day}>
                <span className={styles.perDayName}>{f.dayLabel(w.start, timeZone, now)}</span>
                <span className={styles.perDayTime}>{rangeLabel(w)}</span>
                <span className={styles.perDayBar} aria-hidden="true">
                  <span
                    style={{
                      background: levelColor(w.peakLevel),
                      left: `${((localMinutes(w.start, timeZone) / 60 - earliest) / (latest - earliest)) * 100}%`,
                      width: `${(duration / (latest - earliest)) * 100}%`,
                    }}
                  />
                </span>
                <span className={styles.perDayLevel}>
                  <LevelBadge level={w.peakLevel} size="s" />
                </span>
                <span className={styles.perDayPeak}>{f.temp(w.peakWbgt)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
