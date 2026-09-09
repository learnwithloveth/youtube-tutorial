/**
 * Content types.
 *
 * A supporting context, not a core one: there are no invariants to protect here
 * beyond "a slug identifies at most one post", so there are no entities with
 * private constructors. Modelling editorial copy as rich domain objects would be
 * ceremony without benefit.
 *
 * What the module does keep is a boundary. Pages import from
 * `@/modules/content` and get these read-only shapes, so the day this content
 * moves to a CMS the change is one adapter behind the same barrel — not an edit
 * to twenty-five pages.
 */

export interface Brand {
  readonly name: string;
  readonly wordmark: string;
  readonly domain: string;
  readonly tagline: string;
  readonly description: string;
  readonly founded: number;
  readonly hq: string;
  readonly support: string;
  readonly press: string;
  readonly social: {
    readonly x: string;
    readonly github: string;
    readonly linkedin: string;
    readonly youtube: string;
  };
}

export interface TrustStat {
  readonly label: string;
  readonly value: number;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly compact?: boolean;
  readonly decimals?: number;
}

export type BlogCategory = 'Research' | 'Engineering' | 'Product' | 'Company' | 'Security';

export interface BlogPost {
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string;
  readonly category: BlogCategory;
  readonly author: string;
  readonly role: string;
  readonly initials: string;
  readonly hue: string;
  /** ISO-8601 date. */
  readonly date: string;
  readonly readingMinutes: number;
  readonly featured?: boolean;
  readonly body: readonly string[];
}

export interface Role {
  readonly title: string;
  readonly team: string;
  readonly location: string;
  readonly type: 'Full-time' | 'Contract';
  readonly level: string;
}

export type LessonLevel = 'Beginner' | 'Intermediate' | 'Advanced';

export interface Lesson {
  readonly title: string;
  readonly minutes: number;
  readonly level: LessonLevel;
  readonly summary: string;
}

export interface Track {
  readonly name: string;
  readonly description: string;
  readonly lessons: readonly Lesson[];
}

export interface PressItem {
  readonly date: string;
  readonly outlet: string;
  readonly headline: string;
  readonly href: string;
}
