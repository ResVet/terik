import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useFormat, useT } from '../../i18n';
import { FOOTBALL_THRESHOLDS } from '../../lib/guidance/sport';
import { Icon } from '../components/Icon';
import { REPO_URL } from '../layout/Footer';
import { Lab } from '../method/Lab';
import { REFERENCES } from '../method/references';
import { ClothingTable, LimitFormulas, SportTable, WorkTable } from '../method/Tables';
import styles from './MethodPage.module.css';

const SECTIONS = ['wbgt', 'lab', 'advice', 'forecast', 'record', 'checks', 'limits', 'privacy', 'references'] as const;
type SectionId = (typeof SECTIONS)[number];

/** Turns "[1]" and "[9, 10]" in the copy into links to the reference list. */
function withCitations(text: string): ReactNode[] {
  return text.split(/(\[\d+(?:,\s*\d+)*\])/).map((part, i) => {
    const m = /^\[(.+)\]$/.exec(part);
    if (!m) return <Fragment key={i}>{part}</Fragment>;
    const numbers = m[1]!.split(',').map((n) => n.trim());
    return (
      <span key={i} className={styles.cite}>
        [
        {numbers.map((n, j) => (
          <Fragment key={n}>
            {j > 0 && ', '}
            <a href={`#ref-${n}`} aria-label={`Reference ${n}`}>
              {n}
            </a>
          </Fragment>
        ))}
        ]
      </span>
    );
  });
}

/** The section nearest the top of the screen, for the contents list. */
function useActiveSection(): SectionId {
  const [active, setActive] = useState<SectionId>('wbgt');
  useEffect(() => {
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = SECTIONS.find((id) => seen.get(id));
        if (first) setActive(first);
      },
      { rootMargin: '-20% 0px -65% 0px' },
    );
    for (const id of SECTIONS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);
  return active;
}

function Section({ id, title, children }: { id: SectionId; title: string; children: ReactNode }) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.h2}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function MethodPage() {
  const t = useT();
  const f = useFormat();
  const m = t.method;
  const active = useActiveSection();
  const p = (text: string, key?: string | number) => <p key={key}>{withCitations(text)}</p>;

  return (
    <div className={`wrap ${styles.page}`}>
      <header className={styles.head}>
        <p className="kicker">{m.kicker}</p>
        <h1 className={styles.title}>{m.title}</h1>
        <p className={styles.lead}>{m.lead}</p>
      </header>

      <div className={styles.layout}>
        <nav className={styles.toc} aria-label={m.onThisPage}>
          <p className={styles.tocTitle}>{m.onThisPage}</p>
          <ol>
            {SECTIONS.map((id) => (
              <li key={id}>
                <a href={`#${id}`} aria-current={active === id ? 'true' : undefined}>
                  {m.nav[id]}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className={styles.content}>
          <Section id="wbgt" title={m.wbgt.title}>
            {m.wbgt.body.map(p)}
            <div className={styles.formula} role="math" aria-label="WBGT = 0.7 Tnwb + 0.2 Tg + 0.1 Ta">
              <span>WBGT</span>
              <span className={styles.op}>=</span>
              <span>
                0.7 T<sub>nwb</sub>
              </span>
              <span className={styles.op}>+</span>
              <span>
                0.2 T<sub>g</sub>
              </span>
              <span className={styles.op}>+</span>
              <span>
                0.1 T<sub>a</sub>
              </span>
            </div>
            <ul className={styles.instruments}>
              {m.wbgt.instruments.map((item, i) => (
                <li key={item.name}>
                  <span className={styles.symbol}>
                    <span>
                      T<sub>{['nwb', 'g', 'a'][i]}</sub>
                    </span>
                    <span className={styles.weight}>{['70%', '20%', '10%'][i]}</span>
                  </span>
                  <strong>{item.name}</strong>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
            {m.wbgt.model.map(p)}
          </Section>

          <Section id="lab" title={m.lab.title}>
            {p(m.lab.intro)}
            <Lab />
          </Section>

          <Section id="advice" title={m.advice.title}>
            {p(m.advice.intro)}
            <h3 className={styles.h3}>{m.advice.workTitle}</h3>
            {p(m.advice.work[0]!)}
            <LimitFormulas />
            {p(m.advice.work[1]!)}
            <WorkTable />
            {p(m.advice.clothing)}
            <ClothingTable />
            <h3 className={styles.h3}>{m.advice.sportTitle}</h3>
            {m.advice.sport.map(p)}
            <SportTable />
            <h3 className={styles.h3}>{m.advice.footballTitle}</h3>
            {p(
              m.advice.football(
                f.tempUnit(FOOTBALL_THRESHOLDS.coolingBreaks, 0),
                f.tempUnit(FOOTBALL_THRESHOLDS.reschedule, 0),
                f.tempUnit(32, 0),
              ),
            )}
          </Section>

          <Section id="forecast" title={m.forecast.title}>
            {m.forecast.body.map(p)}
          </Section>

          <Section id="record" title={m.record.title}>
            {m.record.body.map(p)}
          </Section>

          <Section id="checks" title={m.checks.title}>
            {p(m.checks.intro)}
            <ul className={styles.checks}>
              {m.checks.items.map((item) => (
                <li key={item.figure}>
                  <span className={styles.figure}>{item.figure}</span>
                  <span>{withCitations(item.text)}</span>
                </li>
              ))}
            </ul>
            {p(m.checks.footer)}
          </Section>

          <Section id="limits" title={m.limits.title}>
            <ul className={styles.list}>
              {m.limits.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Section>

          <Section id="privacy" title={m.privacy.title}>
            {m.privacy.body.map(p)}
          </Section>

          <Section id="references" title={m.references}>
            <ol className={styles.references}>
              {REFERENCES.map((ref, i) => (
                <li key={ref.url} id={`ref-${i + 1}`}>
                  <span>{ref.text}</span>{' '}
                  <a href={ref.url} target="_blank" rel="noopener">
                    {ref.url.replace(/^https:\/\/(www\.)?/, '')}
                  </a>
                </li>
              ))}
            </ol>
            <div className={styles.code}>
              <h3 className={styles.h3}>{m.code.title}</h3>
              <p>{m.code.body}</p>
              <a href={REPO_URL} target="_blank" rel="noopener" className={styles.codeLink}>
                <Icon name="github" size={18} />
                {m.code.link}
              </a>
              <p className={styles.codeNotes}>
                <a href="/NOTICE.txt">{m.code.notice}</a>
                <a href="/third-party-licenses.txt">{m.code.libraries}</a>
              </p>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
