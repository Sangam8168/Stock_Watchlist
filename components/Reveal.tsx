'use client';

import { cn } from '@/lib/utils';
import { useInView } from '@/hooks/useInView';

/** Fade + slide-up a block when it scrolls into view. `delay` in ms for staggering. */
export default function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={cn('reveal', inView && 'reveal-in', className)}
      style={{ transitionDelay: inView ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  );
}
