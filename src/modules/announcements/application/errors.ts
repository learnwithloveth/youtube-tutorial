/**
 * The announcements module's error catalogue.
 *
 * Tagged union rather than message strings, so a `switch` over `kind` can be
 * checked for exhaustiveness. No `server-only`: the console's composer renders
 * these messages, so the presenter has to be reachable from a Client Component.
 */

export type AnnouncementError =
  | { readonly kind: 'not-found' }
  | { readonly kind: 'title-required' }
  | { readonly kind: 'body-required'; readonly maximum: number }
  | { readonly kind: 'surface-invalid' }
  | { readonly kind: 'schedule-in-past' }
  | { readonly kind: 'expiry-in-past' }
  | { readonly kind: 'expiry-before-publication' }
  | { readonly kind: 'archived' }
  | { readonly kind: 'unavailable' };

export const AnnouncementErrors = {
  notFound: (): AnnouncementError => ({ kind: 'not-found' }),
  titleRequired: (): AnnouncementError => ({ kind: 'title-required' }),
  bodyRequired: (maximum: number): AnnouncementError => ({ kind: 'body-required', maximum }),
  surfaceInvalid: (): AnnouncementError => ({ kind: 'surface-invalid' }),
  scheduleInPast: (): AnnouncementError => ({ kind: 'schedule-in-past' }),
  expiryInPast: (): AnnouncementError => ({ kind: 'expiry-in-past' }),
  expiryBeforePublication: (): AnnouncementError => ({ kind: 'expiry-before-publication' }),
  archived: (): AnnouncementError => ({ kind: 'archived' }),
  unavailable: (): AnnouncementError => ({ kind: 'unavailable' }),
} as const;

export function presentAnnouncementError(error: AnnouncementError): string {
  switch (error.kind) {
    case 'not-found':
      return 'That announcement no longer exists.';
    case 'title-required':
      return 'Give it a title. It is the part most people read.';
    case 'body-required':
      return `Write a body, up to ${error.maximum} characters.`;
    case 'surface-invalid':
      return 'Choose where this appears.';
    case 'schedule-in-past':
      // Says what happened rather than "invalid": somebody who mistyped a date
      // needs to know the time was read as already gone.
      return 'That time has passed. Pick a future one, or publish it now.';
    case 'expiry-in-past':
      return 'That expiry has already passed.';
    case 'expiry-before-publication':
      return 'It would expire before it appeared. Move one of the two.';
    case 'archived':
      return 'This announcement is archived and cannot be changed.';
    case 'unavailable':
      return 'Announcements are not available on this deployment.';
  }
}
