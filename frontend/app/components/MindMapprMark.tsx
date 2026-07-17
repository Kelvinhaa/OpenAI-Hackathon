export function MindMapprMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M9 6 L5 17 M9 6 L19 13" stroke="var(--brand)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="9" cy="6" r="2.6" fill="none" stroke="var(--brand)" strokeWidth="1.7" />
      <circle cx="5" cy="17" r="2.1" fill="var(--brand)" />
      <circle cx="19" cy="13" r="2.4" fill="var(--brand)" />
    </svg>
  );
}
