import { LegalDocument, type LegalSection } from './LegalDocument';
import { useSeo } from '@/lib/seo';

const SECTIONS: LegalSection[] = [
  {
    id: 'what',
    heading: 'What cookies we set',
    body: (
      <>
        <p>
          A cookie is a small file stored by your browser. We use them, plus a small amount of local
          storage, in four categories.
        </p>
        <ul>
          <li><strong>Strictly necessary</strong> — session authentication, CSRF protection, load balancing and fraud signals. These cannot be switched off without breaking the site.</li>
          <li><strong>Preferences</strong> — your theme choice, language, and the market list layout you last used.</li>
          <li><strong>Analytics</strong> — aggregate page and feature usage, collected only with your consent.</li>
          <li><strong>Marketing</strong> — attribution for referral and affiliate links, collected only with your consent.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'table',
    heading: 'The specific cookies',
    body: (
      <>
        <ul>
          <li><strong>novex.sid</strong> — session identifier. Strictly necessary. Expires when you sign out.</li>
          <li><strong>novex.csrf</strong> — cross-site request forgery token. Strictly necessary. Session.</li>
          <li><strong>novex.theme</strong> — dark or light preference. Preferences. One year.</li>
          <li><strong>novex.ref</strong> — affiliate attribution. Marketing. Ninety days.</li>
          <li><strong>novex.aid</strong> — anonymous analytics identifier. Analytics. Thirteen months.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'control',
    heading: 'How to control them',
    body: (
      <>
        <p>
          Analytics and marketing cookies are off until you opt in, and you can change your choice at
          any time from the cookie banner or from account settings. Withdrawing consent takes effect
          immediately and existing cookies in those categories are deleted.
        </p>
        <p>
          Your browser can also block or delete cookies. Blocking strictly necessary cookies will
          prevent you from signing in.
        </p>
      </>
    ),
  },
  {
    id: 'third-party',
    heading: 'Third parties',
    body: (
      <>
        <p>
          We self-host our analytics and our fonts. We do not embed third-party advertising pixels,
          social media trackers, or session-replay tools on any page of this site.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    heading: 'Changes to this policy',
    body: (
      <>
        <p>
          If we add a cookie in a new category we will ask for consent again before setting it. This
          page is versioned and the change history is available on request.
        </p>
      </>
    ),
  },
];

export default function CookiesPage() {
  useSeo({
    title: 'Cookie policy',
    description: 'Every cookie Novex sets, what it does, how long it lasts, and how to turn the optional ones off.',
  });

  return (
    <LegalDocument
      title="Cookie policy"
      updated="12 August 2026"
      summary="Every cookie we set, named individually, with its purpose and lifetime. Analytics and marketing are off until you say otherwise."
      sections={SECTIONS}
    />
  );
}
