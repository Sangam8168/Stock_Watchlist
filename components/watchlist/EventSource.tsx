import { ExternalLink } from 'lucide-react';

/**
 * The evidence behind a claim the engine made.
 *
 * "NVDA broke your invalidation level, likely related to <headline>" is an
 * assertion the user has to take on trust unless they can open the thing it is
 * pointing at. Rendered only when the detector actually found fresh coverage —
 * an absent source means no link is drawn, never a dead one.
 */
export default function EventSource({ data }: { data: Record<string, unknown> }) {
  const title = typeof data.sourceTitle === 'string' ? data.sourceTitle : null;
  const url = typeof data.sourceUrl === 'string' ? data.sourceUrl : null;
  if (!title) return null;

  if (!url) {
    return <span className="mt-1 block truncate text-[11px] text-gray-600">Source: {title}</span>;
  }
  return (
    <a
      href={url}
      target="_blank"
      // noreferrer as well as noopener: the target page should not be handed
      // this app's URL, and neither should it get a window handle back.
      rel="noopener noreferrer nofollow"
      onClick={(e) => e.stopPropagation()}
      className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-[11px] text-gray-600 underline-offset-2 hover:text-yellow-500 hover:underline"
    >
      <ExternalLink className="h-3 w-3 shrink-0" />
      <span className="truncate">{title}</span>
    </a>
  );
}
