import { describe, expect, it } from 'vitest';

import type { UserId } from '@/shared/kernel/ids';

import { Announcement } from '../announcement';

const AUTHOR = 'op_1' as UserId;
const NOW = new Date('2026-09-14T12:00:00Z');
const LATER = new Date('2026-09-20T09:00:00Z');

function draft(overrides: Partial<Parameters<typeof Announcement.draft>[0]> = {}) {
  return Announcement.draft({
    id: 'ann_1',
    title: 'Scheduled maintenance',
    body: 'Validator rotation on three networks.',
    surface: 'banner',
    tone: 'warning',
    authorId: AUTHOR,
    now: NOW,
    ...overrides,
  });
}

/**
 * These are the whole scheduling mechanism.
 *
 * There is no cron in this system, so `isLiveAt` is the only thing that decides
 * whether a customer sees a notice. Every case below is one an operator hits in
 * ordinary use, and each would be a silent failure — a notice that never appeared,
 * or one that would not come down.
 */
describe('visibility', () => {
  it('keeps a draft invisible', () => {
    expect(draft().isLiveAt(NOW)).toBe(false);
  });

  it('shows a published notice immediately', () => {
    const announcement = draft();
    announcement.publish(NOW);
    expect(announcement.isLiveAt(NOW)).toBe(true);
  });

  it('holds a scheduled notice until its moment, then shows it with no job running', () => {
    const announcement = draft();
    announcement.schedule(LATER, NOW);

    expect(announcement.isLiveAt(NOW)).toBe(false);
    expect(announcement.isLiveAt(new Date(LATER.getTime() - 1))).toBe(false);
    // The moment arrives and nothing had to fire. This is the design.
    expect(announcement.isLiveAt(LATER)).toBe(true);
    expect(announcement.isLiveAt(new Date(LATER.getTime() + 86_400_000))).toBe(true);
  });

  it('takes a notice down at its expiry without anything running', () => {
    // The failure this prevents: "maintenance on 11 September" still across the
    // top of the site in November because nobody remembered to remove it.
    const expiresAt = new Date('2026-09-15T00:00:00Z');
    const announcement = draft({ expiresAt });
    announcement.publish(NOW);

    expect(announcement.isLiveAt(NOW)).toBe(true);
    expect(announcement.isLiveAt(new Date(expiresAt.getTime() - 1))).toBe(true);
    expect(announcement.isLiveAt(expiresAt)).toBe(false);
  });

  it('clears the publication time when taken down', () => {
    // Leaving it set would make an unpublished notice indistinguishable from a
    // scheduled one, and the next read would put it straight back up.
    const announcement = draft();
    announcement.publish(NOW);
    announcement.unpublish(NOW);

    expect(announcement.snapshot().publishAt).toBeNull();
    expect(announcement.isLiveAt(new Date(NOW.getTime() + 86_400_000))).toBe(false);
  });

  it('keeps an archived notice off every surface', () => {
    const announcement = draft();
    announcement.publish(NOW);
    announcement.archive(NOW);
    expect(announcement.isLiveAt(NOW)).toBe(false);
  });
});

describe('the rules that stop a mistake reaching the site', () => {
  it('refuses a scheduled time in the past', () => {
    // Treating it as "now" would put a mistyped date straight onto the banner,
    // and the operator would find out by seeing it there.
    expect(() => draft().schedule(new Date('2026-09-13T00:00:00Z'), NOW)).toThrow(RangeError);
    expect(() => draft().schedule(NOW, NOW)).toThrow(RangeError);
  });

  it('refuses an expiry that precedes the appearance', () => {
    const announcement = draft({ expiresAt: new Date('2026-09-16T00:00:00Z') });
    expect(() => announcement.schedule(LATER, NOW)).toThrow(RangeError);
  });

  it('refuses an expiry already in the past', () => {
    expect(() => draft({ expiresAt: new Date('2026-09-01T00:00:00Z') })).toThrow(RangeError);
  });

  it('requires a title and a body', () => {
    expect(() => draft({ title: '   ' })).toThrow(RangeError);
    expect(() => draft({ body: '' })).toThrow(RangeError);
    expect(() => draft({ title: 'x'.repeat(200) })).toThrow(RangeError);
  });

  it('refuses to move an archived notice', () => {
    const announcement = draft();
    announcement.archive(NOW);
    expect(() => announcement.publish(NOW)).toThrow(/archived/);
    expect(() => announcement.edit({ title: 'New', now: NOW })).toThrow(/archived/);
  });
});
