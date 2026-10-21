import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { newId } from '../../types/resume';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  IMPORTANCE,
  type Category,
  type Importance,
  type Keyword,
} from '../../types/tailor';

const field = 'rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm focus:border-cobalt';

/** Every extracted keyword can be kept, edited, re-categorised or removed. The AI's list is a draft, not the answer. */
export function KeywordReview({
  keywords,
  onChange,
}: {
  keywords: Keyword[];
  onChange: (k: Keyword[]) => void;
}) {
  const [term, setTerm] = useState('');
  const [category, setCategory] = useState<Category>('skill');
  const patch = (id: string, p: Partial<Keyword>) =>
    onChange(keywords.map((k) => (k.id === id ? { ...k, ...p } : k)));

  const add = () => {
    const t = term.trim();
    if (!t) return;
    onChange([
      ...keywords,
      { id: newId(), term: t, category, importance: 'required', quote: '', included: true },
    ]);
    setTerm('');
  };

  return (
    <div className="space-y-5">
      {CATEGORIES.map((cat) => {
        const group = keywords.filter((k) => k.category === cat);
        if (!group.length) return null;
        return (
          <section key={cat} aria-label={CATEGORY_LABELS[cat]}>
            <h4 className="mb-1.5 text-sm font-semibold">
              {CATEGORY_LABELS[cat]}{' '}
              <span className="font-normal text-slate-600">
                ({group.filter((k) => k.included).length} of {group.length} included)
              </span>
            </h4>
            <ul className="space-y-2">
              {group.map((k) => (
                <li
                  key={k.id}
                  className={`rounded-lg border p-2 ${k.included ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      checked={k.included}
                      onChange={() => patch(k.id, { included: !k.included })}
                      aria-label={`Include “${k.term}”`}
                      className="h-4 w-4 accent-[#2F55D4]"
                    />
                    <input
                      aria-label="Keyword"
                      value={k.term}
                      maxLength={160}
                      onChange={(e) => patch(k.id, { term: e.target.value })}
                      className={`${field} min-w-[9rem] flex-1`}
                    />
                    <select
                      aria-label={`Importance of ${k.term}`}
                      value={k.importance}
                      onChange={(e) => patch(k.id, { importance: e.target.value as Importance })}
                      className={field}
                    >
                      {IMPORTANCE.map((i) => (
                        <option key={i} value={i}>
                          {i[0].toUpperCase() + i.slice(1)}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`Category of ${k.term}`}
                      value={k.category}
                      onChange={(e) => patch(k.id, { category: e.target.value as Category })}
                      className={field}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </select>
                    <IconButton
                      icon="trash"
                      label={`Remove “${k.term}”`}
                      danger
                      onClick={() => onChange(keywords.filter((x) => x.id !== k.id))}
                    />
                  </div>
                  <p className="mt-1 pl-6 text-xs text-slate-600">
                    {k.quote ? (
                      <>
                        From the job description: <q className="italic">{k.quote}</q>
                      </>
                    ) : (
                      <span className="text-amber-800">
                        No matching line was found in the job description. Check this one is really
                        asked for.
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <form
        className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-slate-200 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label className="flex-1 text-sm">
          <span className="mb-1 block font-medium">Add something we missed</span>
          <input
            value={term}
            maxLength={160}
            onChange={(e) => setTerm(e.target.value)}
            className={`${field} w-full`}
            placeholder="For example: GraphQL"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className={field}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary" disabled={!term.trim()}>
          Add
        </Button>
      </form>
    </div>
  );
}
