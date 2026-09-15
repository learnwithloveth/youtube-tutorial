import { PageSkeleton } from '@/shared/ui/feedback/skeleton';

/**
 * Notifications: filter pills, then one panel per day.
 *
 * The counts match the page's own grid, so the shell that appears during a
 * navigation is the shape the data lands into rather than a different one it
 * shoves aside.
 */
export default function Loading() {
  return <PageSkeleton tiles={0} panels={3} />;
}
