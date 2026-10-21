export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
        <rect x="4" y="2" width="16" height="20" rx="3" fill="#2F55D4" />
        <rect x="7" y="7" width="10" height="2" rx="1" fill="#fff" />
        <rect x="7" y="11" width="7" height="2" rx="1" fill="#fff" opacity=".7" />
        <rect x="7" y="16" width="10" height="3" rx="1" fill="#FFE45C" />
      </svg>
      ResumeForge
    </span>
  );
}
