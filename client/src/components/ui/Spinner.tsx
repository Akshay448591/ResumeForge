export function Spinner({
  label = 'Loading',
  className = 'h-5 w-5',
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span role="status" className="inline-flex items-center">
      <svg
        className={`${className} animate-spin`}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-cobalt">
      <Spinner className="h-8 w-8" />
    </div>
  );
}
