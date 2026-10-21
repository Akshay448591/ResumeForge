import { Fragment } from 'react';

/** Show text with the keyword marked, so people can see where it appears. */
export function Highlight({ text, term }: { text: string; term: string }) {
  const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!escaped) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i % 2 === 1 ? <mark className="rounded bg-mark px-0.5">{p}</mark> : p}
        </Fragment>
      ))}
    </>
  );
}
