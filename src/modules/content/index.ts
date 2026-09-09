/**
 * Public barrel for the content context.
 *
 * Reads are exposed as functions rather than as raw arrays. That is not
 * ceremony: a function is the seam that lets the backing store change — to a
 * CMS, to the filesystem, to a database — without any page learning about it.
 * Exporting the arrays directly would make the in-memory representation part of
 * the contract.
 */

import type { BlogPost, PressItem, Role, Track } from './domain/types';
import { BRAND, TRUST_STATS } from './infrastructure/brand';
import {
  BLOG_POSTS,
  LEARN_TRACKS,
  PRESS_ITEMS,
  ROLES,
} from './infrastructure/editorial';

export type {
  Brand,
  BlogCategory,
  BlogPost,
  Lesson,
  LessonLevel,
  PressItem,
  Role,
  Track,
  TrustStat,
} from './domain/types';

export { BRAND, TRUST_STATS };

/** Posts newest first — the order every listing surface wants. */
export function listBlogPosts(): readonly BlogPost[] {
  return [...BLOG_POSTS].sort((a, b) => b.date.localeCompare(a.date));
}

export function getBlogPost(slug: string): BlogPost | null {
  return BLOG_POSTS.find((post) => post.slug === slug) ?? null;
}

export function listBlogSlugs(): string[] {
  return BLOG_POSTS.map((post) => post.slug);
}

export function getFeaturedPost(): BlogPost | null {
  return BLOG_POSTS.find((post) => post.featured) ?? BLOG_POSTS[0] ?? null;
}

export function listRoles(): readonly Role[] {
  return ROLES;
}

/** Distinct teams, in first-appearance order, for the careers filter. */
export function listRoleTeams(): string[] {
  return [...new Set(ROLES.map((role) => role.team))];
}

export function listLearnTracks(): readonly Track[] {
  return LEARN_TRACKS;
}

export function listPressItems(): readonly PressItem[] {
  return [...PRESS_ITEMS].sort((a, b) => b.date.localeCompare(a.date));
}
