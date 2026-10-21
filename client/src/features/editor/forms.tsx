import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState, type ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Checkbox, Input, Select, Textarea } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { dateRangeWarning, emailError, urlError } from '../../lib/validation';
import { BulletAssistantDialog } from '../tailor/BulletAssistantDialog';
import { useAppDispatch, useAppSelector } from '../../store';
import { editorActions } from '../../store/editorSlice';
import {
  SECTION_LABELS,
  newId,
  type Bullet,
  type ListSection,
  type ResumeContent,
  type SectionConfig,
} from '../../types/resume';

/* ---------- shared bits ---------- */

/** Input that shows advisory format feedback only after the person has left the field. */
function CheckedInput({
  validate,
  ...props
}: { validate: (v: string) => string | null } & React.ComponentProps<typeof Input>) {
  const [touched, setTouched] = useState(false);
  const message = touched ? validate(String(props.value ?? '')) : null;
  return <Input {...props} error={message} tone="warning" onBlur={() => setTouched(true)} />;
}

function BulletsEditor({
  label,
  addLabel,
  bullets,
  onChange,
  assist,
}: {
  label: string;
  addLabel: string;
  bullets: Bullet[];
  onChange: (b: Bullet[]) => void;
  /** When given, each bullet gets an "Improve wording" helper. */
  assist?: { role: string; company: string };
}) {
  const [assisting, setAssisting] = useState<Bullet | null>(null);
  const set = (id: string, text: string) =>
    onChange(bullets.map((b) => (b.id === id ? { ...b, text } : b)));
  const swap = (i: number, dir: -1 | 1) => {
    const next = [...bullets];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    onChange(next);
  };
  return (
    <fieldset className="mt-3">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <ul className="space-y-2">
        {bullets.map((b, i) => (
          <li key={b.id} className="flex items-start gap-1">
            <div className="min-w-0 flex-1">
              <Textarea
                label={`${label} ${i + 1}`}
                rows={2}
                value={b.text}
                maxLength={500}
                onChange={(e) => set(b.id, e.target.value)}
                className="[&]:resize-y"
              />
              {assist && (
                <button
                  type="button"
                  disabled={!b.text.trim()}
                  onClick={() => setAssisting(b)}
                  className="mt-1 text-xs font-medium text-cobalt underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
                >
                  Improve wording
                </button>
              )}
            </div>
            <div className="mt-6 flex shrink-0">
              <IconButton
                icon="up"
                label="Move up"
                disabled={i === 0}
                onClick={() => swap(i, -1)}
              />
              <IconButton
                icon="down"
                label="Move down"
                disabled={i === bullets.length - 1}
                onClick={() => swap(i, 1)}
              />
              <IconButton
                icon="trash"
                label="Remove"
                danger
                onClick={() => onChange(bullets.filter((x) => x.id !== b.id))}
              />
            </div>
          </li>
        ))}
      </ul>
      {bullets.length < 15 && (
        <Button
          size="sm"
          variant="secondary"
          className="mt-2"
          onClick={() => onChange([...bullets, { id: newId(), text: '' }])}
        >
          {addLabel}
        </Button>
      )}
      {assist && (
        <BulletAssistantDialog
          open={assisting !== null}
          onClose={() => setAssisting(null)}
          text={assisting?.text ?? ''}
          role={assist.role}
          company={assist.company}
          onApply={(text) => assisting && set(assisting.id, text)}
        />
      )}
    </fieldset>
  );
}

function TagsInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [text, setText] = useState(value.join(', '));
  return (
    <Input
      label={label}
      hint="Separate with commas"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(
          e.target.value
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 20),
        );
      }}
    />
  );
}

/** Wrapper for one repeatable entry (a job, a degree, a project...). */
function Entry({
  section,
  id,
  index,
  count,
  title,
  children,
}: {
  section: ListSection;
  id: string;
  index: number;
  count: number;
  title: string;
  children: ReactNode;
}) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(true);
  return (
    <li className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center gap-1 border-b border-slate-100 px-2 py-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex-1 truncate rounded px-2 py-1 text-left text-sm font-medium hover:bg-slate-50"
        >
          {title || 'Untitled entry'}
        </button>
        <IconButton
          icon="up"
          label="Move up"
          disabled={index === 0}
          onClick={() => dispatch(editorActions.moveItem({ section, id, dir: -1 }))}
        />
        <IconButton
          icon="down"
          label="Move down"
          disabled={index === count - 1}
          onClick={() => dispatch(editorActions.moveItem({ section, id, dir: 1 }))}
        />
        <IconButton
          icon="copy"
          label="Duplicate"
          onClick={() => dispatch(editorActions.duplicateItem({ section, id }))}
        />
        <IconButton
          icon="trash"
          label="Remove"
          danger
          onClick={() => dispatch(editorActions.removeItem({ section, id }))}
        />
      </div>
      {open && <div className="space-y-3 p-3">{children}</div>}
    </li>
  );
}

const Grid = ({ children }: { children: ReactNode }) => (
  <div className="grid gap-3 sm:grid-cols-2">{children}</div>
);

/* ---------- personal ---------- */

export function PersonalForm() {
  const dispatch = useAppDispatch();
  const p = useAppSelector((s) => s.editor.content?.personal);
  if (!p) return null;
  const set =
    (field: 'fullName' | 'title' | 'email' | 'phone' | 'location') =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      dispatch(editorActions.setPersonal({ field, value: e.target.value }));
  const show = (field: 'email' | 'phone' | 'location') => (
    <Checkbox
      label="Show on resume"
      checked={p.show[field]}
      onChange={() => dispatch(editorActions.toggleShow(field))}
    />
  );
  return (
    <div className="space-y-3">
      <Grid>
        <Input
          label="Full name"
          value={p.fullName}
          onChange={set('fullName')}
          autoComplete="name"
          maxLength={120}
        />
        <Input
          label="Professional title"
          value={p.title}
          onChange={set('title')}
          maxLength={120}
          placeholder="e.g. Frontend Engineer"
        />
        <CheckedInput
          label="Email"
          type="email"
          value={p.email}
          onChange={set('email')}
          validate={emailError}
          footer={show('email')}
          autoComplete="email"
        />
        <Input
          label="Phone"
          type="tel"
          value={p.phone}
          onChange={set('phone')}
          footer={show('phone')}
          autoComplete="tel"
          maxLength={40}
        />
      </Grid>
      <Input
        label="Location"
        value={p.location}
        onChange={set('location')}
        footer={show('location')}
        placeholder="City, Country"
        maxLength={120}
      />

      <fieldset>
        <legend className="mb-1 text-sm font-medium">Links</legend>
        <ul className="space-y-3">
          {p.links.map((l) => (
            <li key={l.id} className="rounded-lg border border-slate-200 p-3">
              <Grid>
                <Input
                  label="Label"
                  value={l.label}
                  maxLength={60}
                  onChange={(e) =>
                    dispatch(
                      editorActions.updateLink({ id: l.id, patch: { label: e.target.value } }),
                    )
                  }
                />
                <CheckedInput
                  label="Web address"
                  value={l.url}
                  validate={urlError}
                  onChange={(e) =>
                    dispatch(editorActions.updateLink({ id: l.id, patch: { url: e.target.value } }))
                  }
                  placeholder="github.com/you"
                />
              </Grid>
              <div className="mt-2 flex items-center justify-between">
                <Checkbox
                  label="Show on resume"
                  checked={l.visible}
                  onChange={() =>
                    dispatch(editorActions.updateLink({ id: l.id, patch: { visible: !l.visible } }))
                  }
                />
                <IconButton
                  icon="trash"
                  label="Remove link"
                  danger
                  onClick={() => dispatch(editorActions.removeLink(l.id))}
                />
              </div>
            </li>
          ))}
        </ul>
        {p.links.length < 10 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {['LinkedIn', 'GitHub', 'Portfolio', 'Other'].map((name) => (
              <Button
                key={name}
                size="sm"
                variant="secondary"
                onClick={() => dispatch(editorActions.addLink(name === 'Other' ? undefined : name))}
              >
                <span aria-hidden="true">+</span> {name}
              </Button>
            ))}
          </div>
        )}
      </fieldset>
    </div>
  );
}

/* ---------- summary ---------- */

const EXAMPLES = [
  'Backend engineer with five years of experience building payment APIs in Node.js. I reduced checkout failures by 30% at my last company and enjoy mentoring junior developers. Looking for a senior role on a product-focused team.',
  'Recent marketing graduate with internship experience in email and social campaigns. Comfortable with analytics tools and quick to learn new ones. Eager to join a small team where I can own a channel.',
  'Operations manager with eight years in logistics, leading teams of up to 40. Known for cutting delivery times and building clear processes. Seeking a regional operations leadership role.',
];

export function SummaryForm() {
  const dispatch = useAppDispatch();
  const summary = useAppSelector((s) => s.editor.content?.summary ?? '');
  const words = summary.trim() ? summary.trim().split(/\s+/).length : 0;
  const advice =
    summary.trim().length === 0
      ? 'Write 2–4 sentences: who you are, what you do best, and what you want next.'
      : summary.trim().length < 50
        ? 'A little short. Add your strongest skill or one result.'
        : summary.length > 600
          ? 'Getting long. Most readers skim, so trim to 2–4 sentences.'
          : 'Good length.';
  return (
    <div className="space-y-3">
      <Textarea
        label="Summary"
        rows={5}
        maxLength={1500}
        value={summary}
        onChange={(e) => dispatch(editorActions.setSummary(e.target.value))}
        hint={advice}
        footer={`${words} words, ${summary.length}/1500 characters`}
      />
      <details className="rounded-lg border border-slate-200 p-3 text-sm">
        <summary className="cursor-pointer font-medium">See examples</summary>
        <ul className="mt-3 space-y-3">
          {EXAMPLES.map((ex) => (
            <li key={ex}>
              <p className="text-slate-700">{ex}</p>
              <Button
                size="sm"
                variant="secondary"
                className="mt-1"
                onClick={() => dispatch(editorActions.setSummary(ex))}
              >
                {summary.trim() ? 'Replace my text with this' : 'Use this as a starting point'}
              </Button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-600">
          Examples are only a starting point. You can edit every word.
        </p>
      </details>
    </div>
  );
}

/* ---------- list sections ---------- */

function useList<K extends ListSection>(section: K): ResumeContent[K] {
  return useAppSelector((s) => (s.editor.content as ResumeContent)[section]);
}

function ListShell({
  section,
  addLabel,
  children,
}: {
  section: ListSection;
  addLabel: string;
  children: ReactNode;
}) {
  const dispatch = useAppDispatch();
  return (
    <div>
      <ul className="space-y-3">{children}</ul>
      <Button
        size="sm"
        variant="secondary"
        className="mt-3"
        onClick={() => dispatch(editorActions.addItem(section))}
      >
        <span aria-hidden="true">+</span> {addLabel}
      </Button>
    </div>
  );
}

function useUpdate(section: ListSection) {
  const dispatch = useAppDispatch();
  return (id: string, patch: object) => dispatch(editorActions.updateItem({ section, id, patch }));
}

function ExperienceForm() {
  const items = useList('experience');
  const update = useUpdate('experience');
  return (
    <ListShell section="experience" addLabel="Add position">
      {items.map((e, i) => (
        <Entry
          key={e.id}
          section="experience"
          id={e.id}
          index={i}
          count={items.length}
          title={[e.role, e.company].filter(Boolean).join(' at ')}
        >
          <Grid>
            <Input
              label="Role"
              value={e.role}
              onChange={(ev) => update(e.id, { role: ev.target.value })}
              maxLength={120}
            />
            <Input
              label="Company"
              value={e.company}
              onChange={(ev) => update(e.id, { company: ev.target.value })}
              maxLength={120}
            />
          </Grid>
          <Input
            label="Location"
            value={e.location}
            onChange={(ev) => update(e.id, { location: ev.target.value })}
            maxLength={120}
          />
          <Grid>
            <Input
              label="Start date"
              type="month"
              placeholder="YYYY-MM"
              value={e.startDate}
              onChange={(ev) => update(e.id, { startDate: ev.target.value })}
            />
            {e.current ? (
              <Input label="End date" value="Present" disabled readOnly />
            ) : (
              <Input
                label="End date"
                type="month"
                placeholder="YYYY-MM"
                value={e.endDate}
                onChange={(ev) => update(e.id, { endDate: ev.target.value })}
                error={dateRangeWarning(e.startDate, e.endDate, e.current)}
                tone="warning"
              />
            )}
          </Grid>
          <Checkbox
            label="I currently work here"
            checked={e.current}
            onChange={() => update(e.id, { current: !e.current, endDate: '' })}
          />
          {e.current && dateRangeWarning(e.startDate, '', true) && (
            <p className="text-xs text-amber-700">{dateRangeWarning(e.startDate, '', true)}</p>
          )}
          <BulletsEditor
            label="Achievement"
            addLabel="Add achievement"
            assist={{ role: e.role, company: e.company }}
            bullets={e.bullets}
            onChange={(bullets) => update(e.id, { bullets })}
          />
        </Entry>
      ))}
    </ListShell>
  );
}

function EducationForm() {
  const items = useList('education');
  const update = useUpdate('education');
  return (
    <ListShell section="education" addLabel="Add qualification">
      {items.map((e, i) => (
        <Entry
          key={e.id}
          section="education"
          id={e.id}
          index={i}
          count={items.length}
          title={[e.degree, e.institution].filter(Boolean).join(', ')}
        >
          <Input
            label="Institution"
            value={e.institution}
            onChange={(ev) => update(e.id, { institution: ev.target.value })}
            maxLength={120}
          />
          <Grid>
            <Input
              label="Degree"
              value={e.degree}
              onChange={(ev) => update(e.id, { degree: ev.target.value })}
              maxLength={120}
            />
            <Input
              label="Field of study"
              value={e.field}
              onChange={(ev) => update(e.id, { field: ev.target.value })}
              maxLength={120}
            />
            <Input
              label="Start date"
              type="month"
              placeholder="YYYY-MM"
              value={e.startDate}
              onChange={(ev) => update(e.id, { startDate: ev.target.value })}
            />
            <Input
              label="End date (or expected)"
              type="month"
              placeholder="YYYY-MM"
              value={e.endDate}
              onChange={(ev) => update(e.id, { endDate: ev.target.value })}
              error={
                e.endDate && e.startDate && e.endDate < e.startDate
                  ? 'The end date is before the start date.'
                  : null
              }
              tone="warning"
            />
          </Grid>
          <Input
            label="Grade (optional)"
            value={e.grade}
            onChange={(ev) => update(e.id, { grade: ev.target.value })}
            maxLength={60}
            placeholder="e.g. 3.8 GPA, First Class"
          />
          <Textarea
            label="Description (optional)"
            rows={2}
            value={e.description}
            maxLength={1000}
            onChange={(ev) => update(e.id, { description: ev.target.value })}
          />
          <BulletsEditor
            label="Achievement"
            addLabel="Add achievement"
            bullets={e.achievements}
            onChange={(achievements) => update(e.id, { achievements })}
          />
        </Entry>
      ))}
    </ListShell>
  );
}

function SkillsForm() {
  const dispatch = useAppDispatch();
  const items = useList('skills');
  const update = useUpdate('skills');
  return (
    <ListShell section="skills" addLabel="Add skill">
      {items.map((s, i) => (
        <li key={s.id} className="flex items-end gap-1">
          <div className="flex-1">
            <Input
              label={`Skill ${i + 1}`}
              value={s.name}
              maxLength={80}
              onChange={(e) => update(s.id, { name: e.target.value })}
            />
          </div>
          <div className="w-32 shrink-0">
            <Select
              label="Type"
              value={s.kind}
              onChange={(e) => update(s.id, { kind: e.target.value })}
            >
              <option value="technical">Technical</option>
              <option value="soft">Soft skill</option>
            </Select>
          </div>
          <IconButton
            icon="up"
            label="Move up"
            disabled={i === 0}
            onClick={() =>
              dispatch(editorActions.moveItem({ section: 'skills', id: s.id, dir: -1 }))
            }
          />
          <IconButton
            icon="down"
            label="Move down"
            disabled={i === items.length - 1}
            onClick={() =>
              dispatch(editorActions.moveItem({ section: 'skills', id: s.id, dir: 1 }))
            }
          />
          <IconButton
            icon="trash"
            label="Remove"
            danger
            onClick={() => dispatch(editorActions.removeItem({ section: 'skills', id: s.id }))}
          />
        </li>
      ))}
    </ListShell>
  );
}

function ProjectsForm() {
  const items = useList('projects');
  const update = useUpdate('projects');
  return (
    <ListShell section="projects" addLabel="Add project">
      {items.map((x, i) => (
        <Entry
          key={x.id}
          section="projects"
          id={x.id}
          index={i}
          count={items.length}
          title={x.name}
        >
          <Grid>
            <Input
              label="Project name"
              value={x.name}
              maxLength={120}
              onChange={(e) => update(x.id, { name: e.target.value })}
            />
            <CheckedInput
              label="Link"
              value={x.link}
              validate={urlError}
              onChange={(e) => update(x.id, { link: e.target.value })}
              placeholder="github.com/you/project"
            />
          </Grid>
          <TagsInput
            label="Technologies"
            value={x.technologies}
            onChange={(technologies) => update(x.id, { technologies })}
          />
          <Textarea
            label="Description"
            rows={3}
            maxLength={1000}
            value={x.description}
            onChange={(e) => update(x.id, { description: e.target.value })}
          />
        </Entry>
      ))}
    </ListShell>
  );
}

function CertificationsForm() {
  const items = useList('certifications');
  const update = useUpdate('certifications');
  return (
    <ListShell section="certifications" addLabel="Add certification">
      {items.map((x, i) => (
        <Entry
          key={x.id}
          section="certifications"
          id={x.id}
          index={i}
          count={items.length}
          title={x.name}
        >
          <Grid>
            <Input
              label="Certification"
              value={x.name}
              maxLength={120}
              onChange={(e) => update(x.id, { name: e.target.value })}
            />
            <Input
              label="Issuer"
              value={x.issuer}
              maxLength={120}
              onChange={(e) => update(x.id, { issuer: e.target.value })}
            />
            <Input
              label="Date"
              type="month"
              placeholder="YYYY-MM"
              value={x.date}
              onChange={(e) => update(x.id, { date: e.target.value })}
            />
            <CheckedInput
              label="Link (optional)"
              value={x.link}
              validate={urlError}
              onChange={(e) => update(x.id, { link: e.target.value })}
            />
          </Grid>
        </Entry>
      ))}
    </ListShell>
  );
}

function AwardsForm() {
  const items = useList('awards');
  const update = useUpdate('awards');
  return (
    <ListShell section="awards" addLabel="Add award">
      {items.map((x, i) => (
        <Entry key={x.id} section="awards" id={x.id} index={i} count={items.length} title={x.title}>
          <Grid>
            <Input
              label="Award"
              value={x.title}
              maxLength={120}
              onChange={(e) => update(x.id, { title: e.target.value })}
            />
            <Input
              label="Issuer"
              value={x.issuer}
              maxLength={120}
              onChange={(e) => update(x.id, { issuer: e.target.value })}
            />
            <Input
              label="Date"
              type="month"
              placeholder="YYYY-MM"
              value={x.date}
              onChange={(e) => update(x.id, { date: e.target.value })}
            />
          </Grid>
          <Textarea
            label="Description (optional)"
            rows={2}
            maxLength={500}
            value={x.description}
            onChange={(e) => update(x.id, { description: e.target.value })}
          />
        </Entry>
      ))}
    </ListShell>
  );
}

const LEVELS = ['Native', 'Fluent', 'Professional', 'Conversational', 'Basic'];

function LanguagesForm() {
  const dispatch = useAppDispatch();
  const items = useList('languages');
  const update = useUpdate('languages');
  return (
    <ListShell section="languages" addLabel="Add language">
      {items.map((x, i) => (
        <li key={x.id} className="flex items-end gap-1">
          <div className="flex-1">
            <Input
              label={`Language ${i + 1}`}
              value={x.name}
              maxLength={60}
              onChange={(e) => update(x.id, { name: e.target.value })}
            />
          </div>
          <div className="w-40 shrink-0">
            <Select
              label="Level"
              value={x.level}
              onChange={(e) => update(x.id, { level: e.target.value })}
            >
              <option value="">Not specified</option>
              {LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </Select>
          </div>
          <IconButton
            icon="up"
            label="Move up"
            disabled={i === 0}
            onClick={() =>
              dispatch(editorActions.moveItem({ section: 'languages', id: x.id, dir: -1 }))
            }
          />
          <IconButton
            icon="down"
            label="Move down"
            disabled={i === items.length - 1}
            onClick={() =>
              dispatch(editorActions.moveItem({ section: 'languages', id: x.id, dir: 1 }))
            }
          />
          <IconButton
            icon="trash"
            label="Remove"
            danger
            onClick={() => dispatch(editorActions.removeItem({ section: 'languages', id: x.id }))}
          />
        </li>
      ))}
    </ListShell>
  );
}

function CustomForm({ sectionId }: { sectionId: string }) {
  const dispatch = useAppDispatch();
  const sec = useAppSelector((s) => s.editor.content?.custom.find((c) => c.id === sectionId));
  if (!sec) return null;
  return (
    <div className="space-y-3">
      <Input
        label="Section title"
        value={sec.title}
        maxLength={80}
        hint="For example: Publications, Volunteering, Extracurricular"
        onChange={(e) =>
          dispatch(editorActions.updateCustomSection({ id: sectionId, title: e.target.value }))
        }
      />
      <ul className="space-y-3">
        {sec.items.map((it, i) => (
          <li key={it.id} className="rounded-lg border border-slate-200 p-3">
            <Input
              label={`Heading ${i + 1}`}
              value={it.heading}
              maxLength={120}
              onChange={(e) =>
                dispatch(
                  editorActions.updateCustomItem({
                    sectionId,
                    id: it.id,
                    patch: { heading: e.target.value },
                  }),
                )
              }
            />
            <div className="mt-3">
              <Textarea
                label="Description"
                rows={2}
                maxLength={1000}
                value={it.description}
                onChange={(e) =>
                  dispatch(
                    editorActions.updateCustomItem({
                      sectionId,
                      id: it.id,
                      patch: { description: e.target.value },
                    }),
                  )
                }
              />
            </div>
            <div className="mt-2 flex justify-end">
              <IconButton
                icon="trash"
                label="Remove entry"
                danger
                onClick={() => dispatch(editorActions.removeCustomItem({ sectionId, id: it.id }))}
              />
            </div>
          </li>
        ))}
      </ul>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => dispatch(editorActions.addCustomItem(sectionId))}
      >
        <span aria-hidden="true">+</span> Add entry
      </Button>
    </div>
  );
}

/* ---------- section card (drag to reorder, visibility, heading, collapse) ---------- */

function GripIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      {[9, 15].flatMap((x) =>
        [6, 12, 18].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />),
      )}
    </svg>
  );
}

export function SectionCard({
  section,
  index,
  count,
}: {
  section: SectionConfig;
  index: number;
  count: number;
}) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(section.type === 'summary');
  const [confirm, setConfirm] = useState(false);
  const customTitle = useAppSelector(
    (s) => s.editor.content?.custom.find((c) => c.id === section.id)?.title,
  );
  const defaultTitle =
    section.type === 'custom' ? customTitle || 'Custom section' : SECTION_LABELS[section.type];
  const title = section.type === 'custom' ? defaultTitle : section.title?.trim() || defaultTitle;

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const body = (() => {
    switch (section.type) {
      case 'summary':
        return <SummaryForm />;
      case 'experience':
        return <ExperienceForm />;
      case 'education':
        return <EducationForm />;
      case 'skills':
        return <SkillsForm />;
      case 'projects':
        return <ProjectsForm />;
      case 'certifications':
        return <CertificationsForm />;
      case 'awards':
        return <AwardsForm />;
      case 'languages':
        return <LanguagesForm />;
      case 'custom':
        return <CustomForm sectionId={section.id} />;
    }
  })();

  return (
    <section
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 20 : undefined,
        opacity: isDragging ? 0.9 : 1,
      }}
      className={`rounded-xl border bg-white ${isDragging ? 'border-cobalt shadow-lg' : 'border-slate-200'} ${
        section.visible ? '' : 'bg-slate-50'
      }`}
    >
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${title}. Press space to pick up, arrow keys to move, space to drop.`}
          title="Drag to reorder"
          className="flex h-8 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded text-slate-500 hover:bg-slate-100 active:cursor-grabbing"
        >
          <GripIcon />
        </button>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-2 truncate rounded px-2 py-1.5 text-left font-semibold hover:bg-slate-50"
        >
          <span
            className={`text-slate-500 transition-transform ${open ? 'rotate-90' : ''}`}
            aria-hidden="true"
          >
            ›
          </span>
          <span className={section.visible ? '' : 'text-slate-500'}>{title}</span>
          {!section.visible && (
            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-700">
              Hidden
            </span>
          )}
        </button>
        <IconButton
          icon={section.visible ? 'eye' : 'eyeOff'}
          label={section.visible ? 'Hide from resume' : 'Show on resume'}
          aria-pressed={section.visible}
          onClick={() => dispatch(editorActions.toggleSection(section.id))}
        />
        <IconButton
          icon="up"
          label="Move section up"
          disabled={index === 0}
          onClick={() => dispatch(editorActions.moveSection({ id: section.id, dir: -1 }))}
        />
        <IconButton
          icon="down"
          label="Move section down"
          disabled={index === count - 1}
          onClick={() => dispatch(editorActions.moveSection({ id: section.id, dir: 1 }))}
        />
        {section.type === 'custom' && (
          <IconButton icon="trash" label="Delete section" danger onClick={() => setConfirm(true)} />
        )}
      </div>
      {open && (
        <div className="space-y-4 border-t border-slate-100 p-4">
          {section.type !== 'custom' && (
            <Input
              label="Section heading"
              value={section.title ?? ''}
              maxLength={80}
              placeholder={defaultTitle}
              hint={`Shown on the resume. Leave blank to use “${defaultTitle}”.`}
              onChange={(e) =>
                dispatch(editorActions.setSectionTitle({ id: section.id, title: e.target.value }))
              }
            />
          )}
          {body}
        </div>
      )}
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete this section?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                dispatch(editorActions.removeCustomSection(section.id));
                setConfirm(false);
              }}
            >
              Delete section
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          “{title}” and everything in it will be removed from this resume.
        </p>
      </Dialog>
    </section>
  );
}

/** All sections in order, reorderable by dragging or with the keyboard. */
export function SectionList() {
  const dispatch = useAppDispatch();
  const content = useAppSelector((s) => s.editor.content);
  const sections = content?.sections ?? [];
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const nameOf = (id: UniqueIdentifier) => {
    const sec = sections.find((x) => x.id === id);
    if (!sec) return 'section';
    if (sec.type === 'custom')
      return content?.custom.find((c) => c.id === id)?.title || 'Custom section';
    return sec.title?.trim() || SECTION_LABELS[sec.type];
  };
  const position = (id: UniqueIdentifier) =>
    `position ${sections.findIndex((x) => x.id === id) + 1} of ${sections.length}`;

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${nameOf(active.id)} is now at ${position(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} was dropped at ${position(over.id)}.`
        : `${nameOf(active.id)} was dropped.`,
    onDragCancel: ({ active }) => `Reordering ${nameOf(active.id)} was cancelled.`,
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'To pick up a section, press space. Use the arrow keys to move it, then press space again to drop it.',
        },
      }}
      onDragEnd={({ active, over }) => {
        if (over && active.id !== over.id) {
          dispatch(
            editorActions.reorderSections({ activeId: String(active.id), overId: String(over.id) }),
          );
        }
      }}
    >
      <SortableContext items={sections.map((x) => x.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {sections.map((sec, i) => (
            <SectionCard key={sec.id} section={sec} index={i} count={sections.length} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
