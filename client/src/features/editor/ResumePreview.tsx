import { Fragment, createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { FONTS, getTemplate } from '../../lib/templates';
import { PAGE_SIZES, pageDims } from './pageSize';
import { displayUrl, formatMonth, formatRange, normalizeUrl } from '../../lib/validation';
import {
  SECTION_LABELS,
  sectionHasContent,
  type Bullet,
  type ResumeContent,
  type ResumeStyle,
  type SectionConfig,
  type TemplateId,
} from '../../types/resume';

/** A4 size, kept for thumbnails. Real pages use `pageDims(style.pageSize)`. */
export const PAGE_W = PAGE_SIZES.a4.w;
export const PAGE_H = PAGE_SIZES.a4.h;

/** Sections that move into the sidebar when a template is set to two columns. */
const SIDEBAR_TYPES = ['skills', 'languages', 'certifications', 'awards'];
const TEXT = '#111827';

/** Space (px) to insert before a block so it starts on the next page. Filled in by the pagination step. */
const ShiftContext = createContext<Record<string, number>>({});

type Kind = 'entry' | 'heading' | 'head' | 'atom';

/**
 * A block the paginator can measure and move. Presentation rules (break-inside) are included
 * so a print renderer honours the same intent.
 */
function Unit({
  id,
  kind,
  label,
  as = 'div',
  style,
  children,
}: {
  id: string;
  kind: Kind;
  label?: string;
  as?: 'div' | 'li';
  style?: CSSProperties;
  children: ReactNode;
}) {
  const shift = useContext(ShiftContext)[id] ?? 0;
  const keep: CSSProperties = {
    breakInside: 'avoid',
    ...(kind === 'heading' || kind === 'head' ? { breakAfter: 'avoid' } : {}),
    ...style,
  };
  const props = { 'data-pg': kind, 'data-pg-id': id, 'data-pg-label': label, style: keep };
  const spacer =
    shift > 0 ? (
      as === 'li' ? (
        <li aria-hidden="true" data-spacer style={{ height: shift, listStyle: 'none' }} />
      ) : (
        <div aria-hidden="true" data-spacer style={{ height: shift }} />
      )
    ) : null;
  return (
    <>
      {spacer}
      {as === 'li' ? <li {...props}>{children}</li> : <div {...props}>{children}</div>}
    </>
  );
}

function Heading({ s, children }: { s: ResumeStyle; children: ReactNode }) {
  const m: CSSProperties = { margin: '0 0 8px', fontWeight: 700, fontSize: s.fontSize };
  switch (s.headingStyle) {
    case 'underline':
      return (
        <h2
          style={{
            ...m,
            fontSize: s.fontSize - 1.5,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: s.accent,
            borderBottom: `1px solid ${s.accent}`,
            paddingBottom: 3,
          }}
        >
          {children}
        </h2>
      );
    case 'caps':
      return (
        <h2
          style={{
            ...m,
            fontSize: s.fontSize - 1.5,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: s.accent,
          }}
        >
          {children}
        </h2>
      );
    case 'accent-bar':
      return (
        <h2 style={{ ...m, fontSize: s.fontSize + 1.5, color: s.accent }}>
          {children}
          <span
            style={{ display: 'block', width: 24, height: 3, background: s.accent, marginTop: 3 }}
          />
        </h2>
      );
    case 'plain':
      return (
        <h2
          style={{
            ...m,
            fontSize: s.fontSize - 1,
            fontWeight: 600,
            letterSpacing: '0.04em',
            color: s.accent,
          }}
        >
          {children}
        </h2>
      );
    case 'band':
      return (
        <h2
          style={{
            ...m,
            color: s.accent,
            background: `${s.accent}1A`,
            padding: '3px 8px',
            marginBottom: 6,
          }}
        >
          {children}
        </h2>
      );
  }
}

function dividerCss(s: ResumeStyle): CSSProperties | null {
  switch (s.dividerStyle) {
    case 'thin':
      return { borderTop: '1px solid #d1d5db' };
    case 'dotted':
      return { borderTop: '1px dotted #9ca3af' };
    case 'thick':
      return { borderTop: `2px solid ${s.accent}` };
    case 'accent':
      return { borderTop: `1px solid ${s.accent}` };
    default:
      return null;
  }
}

/** Heading plus the divider above it. The divider is dropped when the heading starts a page. */
function HeadingUnit({
  id,
  s,
  first,
  children,
}: {
  id: string;
  s: ResumeStyle;
  first: boolean;
  children: ReactNode;
}) {
  const shift = useContext(ShiftContext)[id] ?? 0;
  const line = !first && shift === 0 ? dividerCss(s) : null;
  return (
    <Unit id={id} kind="heading">
      {line && <div aria-hidden="true" style={{ ...line, marginBottom: s.sectionSpacing / 2 }} />}
      <Heading s={s}>{children}</Heading>
    </Unit>
  );
}

function Row({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div
      style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>{left}</div>
      {right ? (
        <div style={{ flexShrink: 0, whiteSpace: 'nowrap', fontSize: '0.92em', opacity: 0.8 }}>
          {right}
        </div>
      ) : null}
    </div>
  );
}

function Bullets({ idBase, items }: { idBase: string; items: Bullet[] }) {
  const shown = items.filter((b) => b.text.trim());
  if (!shown.length) return null;
  return (
    <ul style={{ margin: '3px 0 0', paddingLeft: 18, listStyle: 'disc' }}>
      {shown.map((b) => (
        <Unit key={b.id} as="li" id={`${idBase}-b-${b.id}`} kind="atom" style={{ marginTop: 2 }}>
          {b.text}
        </Unit>
      ))}
    </ul>
  );
}

const Muted = ({ children }: { children: ReactNode }) => (
  <div style={{ opacity: 0.75, fontStyle: 'italic' }}>{children}</div>
);

interface Props {
  content: ResumeContent;
  templateId: TemplateId;
  style: ResumeStyle;
  /** Page-break spacers from the paginator. Omit for an unpaginated measurement copy. */
  shifts?: Record<string, number>;
}

export function ResumePreview({ content: c, templateId, style: s, shifts }: Props) {
  const t = getTemplate(templateId);
  const p = c.personal;
  const gap = s.sectionSpacing;

  const contact: ReactNode[] = [];
  if (p.show.email && p.email.trim()) contact.push(p.email.trim());
  if (p.show.phone && p.phone.trim()) contact.push(p.phone.trim());
  if (p.show.location && p.location.trim()) contact.push(p.location.trim());
  p.links
    .filter((l) => l.visible && l.url.trim())
    .forEach((l) =>
      contact.push(
        <a
          key={l.id}
          href={normalizeUrl(l.url)}
          target="_blank"
          rel="noreferrer noopener"
          style={{ color: 'inherit' }}
        >
          {l.label.trim() || displayUrl(l.url)}
        </a>,
      ),
    );

  const sections = c.sections.filter((x) => x.visible && sectionHasContent(c, x));
  const side = sections.filter((x) => SIDEBAR_TYPES.includes(x.type));
  const main = sections.filter((x) => !SIDEBAR_TYPES.includes(x.type));
  const twoCol = s.layout === 'two-column' && side.length > 0 && main.length > 0;
  const isBlank = !p.fullName.trim() && !p.title.trim() && !contact.length && !sections.length;

  const titleFor = (sec: SectionConfig) => {
    const custom = sec.title?.trim();
    if (sec.type === 'custom')
      return c.custom.find((x) => x.id === sec.id)?.title.trim() || 'Custom section';
    return custom || SECTION_LABELS[sec.type];
  };

  const renderSection = (sec: SectionConfig): ReactNode => {
    switch (sec.type) {
      case 'summary':
        return (
          <Unit id="summary-p" kind="atom">
            <p style={{ margin: 0 }}>{c.summary}</p>
          </Unit>
        );
      case 'experience':
        return c.experience
          .filter((e) => e.company.trim() || e.role.trim())
          .map((e) => (
            <Unit
              key={e.id}
              id={`exp-${e.id}`}
              kind="entry"
              label={[e.role, e.company].filter(Boolean).join(' at ')}
              style={{ marginBottom: 10 }}
            >
              <Unit id={`exp-${e.id}-h`} kind="head">
                <Row
                  left={
                    <>
                      <b>{e.role}</b>
                      {e.role && e.company ? ', ' : ''}
                      {e.company}
                    </>
                  }
                  right={formatRange(e.startDate, e.endDate, e.current)}
                />
                {e.location.trim() && <Muted>{e.location}</Muted>}
              </Unit>
              <Bullets idBase={`exp-${e.id}`} items={e.bullets} />
            </Unit>
          ));
      case 'education':
        return c.education
          .filter((e) => e.institution.trim() || e.degree.trim())
          .map((e) => (
            <Unit
              key={e.id}
              id={`edu-${e.id}`}
              kind="entry"
              label={[e.degree, e.institution].filter(Boolean).join(', ')}
              style={{ marginBottom: 10 }}
            >
              <Unit id={`edu-${e.id}-h`} kind="head">
                <Row
                  left={<b>{e.institution}</b>}
                  right={formatRange(e.startDate, e.endDate, false)}
                />
                <div>
                  {[e.degree, e.field].filter((x) => x.trim()).join(', ')}
                  {e.grade.trim() ? ` — ${e.grade}` : ''}
                </div>
              </Unit>
              {e.description.trim() && (
                <Unit id={`edu-${e.id}-d`} kind="atom" style={{ marginTop: 2 }}>
                  {e.description}
                </Unit>
              )}
              <Bullets idBase={`edu-${e.id}`} items={e.achievements} />
            </Unit>
          ));
      case 'skills': {
        const groups = [
          ['Technical', c.skills.filter((x) => x.kind === 'technical' && x.name.trim())],
          ['Soft skills', c.skills.filter((x) => x.kind === 'soft' && x.name.trim())],
        ] as const;
        return groups
          .filter(([, list]) => list.length)
          .map(([label, list]) => (
            <Unit key={label} id={`skills-${label}`} kind="atom" style={{ marginBottom: 3 }}>
              <b>{label}:</b> {list.map((x) => x.name.trim()).join(', ')}
            </Unit>
          ));
      }
      case 'projects':
        return c.projects
          .filter((x) => x.name.trim())
          .map((x) => (
            <Unit
              key={x.id}
              id={`proj-${x.id}`}
              kind="entry"
              label={x.name}
              style={{ marginBottom: 8 }}
            >
              <Row left={<b>{x.name}</b>} right={x.link.trim() ? displayUrl(x.link) : undefined} />
              {x.technologies.length > 0 && <Muted>{x.technologies.join(', ')}</Muted>}
              {x.description.trim() && <div>{x.description}</div>}
            </Unit>
          ));
      case 'certifications':
        return c.certifications
          .filter((x) => x.name.trim())
          .map((x) => (
            <Unit
              key={x.id}
              id={`cert-${x.id}`}
              kind="entry"
              label={x.name}
              style={{ marginBottom: 3 }}
            >
              <Row
                left={
                  <>
                    <b>{x.name}</b>
                    {x.issuer.trim() ? `, ${x.issuer}` : ''}
                  </>
                }
                right={formatMonth(x.date)}
              />
            </Unit>
          ));
      case 'awards':
        return c.awards
          .filter((x) => x.title.trim())
          .map((x) => (
            <Unit
              key={x.id}
              id={`award-${x.id}`}
              kind="entry"
              label={x.title}
              style={{ marginBottom: 4 }}
            >
              <Row
                left={
                  <>
                    <b>{x.title}</b>
                    {x.issuer.trim() ? `, ${x.issuer}` : ''}
                  </>
                }
                right={formatMonth(x.date)}
              />
              {x.description.trim() && <div>{x.description}</div>}
            </Unit>
          ));
      case 'languages':
        return (
          <Unit id="languages-p" kind="atom">
            {c.languages
              .filter((x) => x.name.trim())
              .map((x) => (x.level.trim() ? `${x.name} (${x.level})` : x.name))
              .join(', ')}
          </Unit>
        );
      case 'custom':
        return c.custom
          .find((x) => x.id === sec.id)
          ?.items.filter((i) => i.heading.trim() || i.description.trim())
          .map((i) => (
            <Unit
              key={i.id}
              id={`custom-${i.id}`}
              kind="entry"
              label={i.heading || 'Entry'}
              style={{ marginBottom: 6 }}
            >
              {i.heading.trim() && <b>{i.heading}</b>}
              {i.description.trim() && <div>{i.description}</div>}
            </Unit>
          ));
    }
  };

  const column = (list: SectionConfig[], name: string) =>
    list.map((sec, i) => (
      <section key={sec.id} style={{ marginBottom: gap }}>
        <HeadingUnit id={`${name}-${sec.id}-h`} s={s} first={i === 0}>
          {titleFor(sec)}
        </HeadingUnit>
        {renderSection(sec)}
      </section>
    ));

  return (
    <ShiftContext.Provider value={shifts ?? {}}>
      <div
        data-resume-root
        style={{
          width: pageDims(s.pageSize).w,
          boxSizing: 'border-box',
          padding: s.margin,
          fontFamily: FONTS[s.fontFamily].stack,
          fontSize: s.fontSize,
          lineHeight: s.lineHeight,
          color: TEXT,
          background: '#fff',
          overflowWrap: 'anywhere',
        }}
      >
        <header style={{ textAlign: t.headerAlign, marginBottom: gap }}>
          <h1
            style={{
              margin: 0,
              fontSize: s.fontSize * 2.2,
              lineHeight: 1.15,
              fontWeight: 700,
              color: t.nameAccent ? s.accent : TEXT,
            }}
          >
            {p.fullName.trim() || <span style={{ color: '#9ca3af' }}>Your name</span>}
          </h1>
          {p.title.trim() && (
            <div style={{ fontSize: s.fontSize + 2, marginTop: 2, opacity: 0.85 }}>{p.title}</div>
          )}
          {contact.length > 0 && (
            <div style={{ marginTop: 6, fontSize: s.fontSize - 1 }}>
              {contact.map((n, i) => (
                <Fragment key={i}>
                  {i > 0 && <span style={{ margin: '0 8px', opacity: 0.4 }}>|</span>}
                  {n}
                </Fragment>
              ))}
            </div>
          )}
        </header>

        {isBlank && (
          <p style={{ color: '#9ca3af', textAlign: t.headerAlign }}>
            Start filling in the form and your resume appears here.
          </p>
        )}

        {twoCol ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) 230px',
              columnGap: 28,
              alignItems: 'start',
            }}
          >
            <div data-col="main" style={{ minWidth: 0 }}>
              {column(main, 'main')}
            </div>
            <div
              data-col="side"
              style={{ minWidth: 0, borderLeft: '1px solid #e5e7eb', paddingLeft: 20 }}
            >
              {column(side, 'side')}
            </div>
          </div>
        ) : (
          <div data-col="main">{column(sections, 'main')}</div>
        )}
      </div>
    </ShiftContext.Provider>
  );
}
