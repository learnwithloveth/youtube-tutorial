import type { Metadata } from 'next';
import { LegalDocument, type LegalSection } from '../_components/legal-document';
import { BRAND } from '@/modules/content';

const SECTIONS: LegalSection[] = [
  {
    id: 'who',
    heading: 'Who we are',
    body: (
      <>
        <p>
          {BRAND.name} Technologies AG, Bahnhofstrasse 42, 8001 Zurich, is the controller of the personal
          data described here. Our Data Protection Officer can be reached at{' '}
          <a href="mailto:dpo@novex.io">dpo@novex.io</a>.
        </p>
      </>
    ),
  },
  {
    id: 'collect',
    heading: 'What we collect',
    body: (
      <>
        <p>We collect only what a regulated exchange needs to operate:</p>
        <ul>
          <li><strong>Identity data</strong> — name, date of birth, address, and the identity document and selfie you submit for verification.</li>
          <li><strong>Financial data</strong> — balances, orders, fills, transfers and the bank or card details used to fund your account.</li>
          <li><strong>Technical data</strong> — IP address, device fingerprint, browser and app version, and session logs used for security and fraud detection.</li>
          <li><strong>Communications</strong> — support conversations, including chat transcripts and call recordings where local law permits.</li>
        </ul>
        <p>
          We do not buy personal data from brokers, and we do not sell yours. We do not run behavioural
          advertising on our own properties.
        </p>
      </>
    ),
  },
  {
    id: 'why',
    heading: 'Why we process it',
    body: (
      <>
        <ul>
          <li><strong>To perform our contract with you</strong> — operating your account, executing orders, moving money.</li>
          <li><strong>To comply with legal obligations</strong> — anti-money-laundering checks, sanctions screening, Travel Rule transfers, tax reporting.</li>
          <li><strong>For our legitimate interests</strong> — fraud prevention, security monitoring, and improving the product, balanced against your rights.</li>
          <li><strong>With your consent</strong> — marketing email and optional analytics, which you can withdraw at any time.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'sharing',
    heading: 'Who we share it with',
    body: (
      <>
        <p>
          Identity verification providers, blockchain analytics providers, banking partners, cloud
          infrastructure providers, and regulators or law enforcement where legally compelled.
        </p>
        <p>
          Every processor is bound by a written agreement, assessed before onboarding, and reassessed
          annually. The current list of sub-processors is published and versioned.
        </p>
      </>
    ),
  },
  {
    id: 'transfers',
    heading: 'International transfers',
    body: (
      <>
        <p>
          Data may be processed in Switzerland, the EEA, Singapore and the United States. Transfers
          outside the EEA rely on adequacy decisions where they exist, and on Standard Contractual
          Clauses with a transfer impact assessment where they do not.
        </p>
      </>
    ),
  },
  {
    id: 'retention',
    heading: 'How long we keep it',
    body: (
      <>
        <ul>
          <li>Identity documents: 90 days after a verification decision, unless retention is legally required.</li>
          <li>Transaction records: ten years from account closure, as required by financial regulation.</li>
          <li>Support conversations: three years.</li>
          <li>Security logs: eighteen months.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'rights',
    heading: 'Your rights',
    body: (
      <>
        <p>
          Depending on where you live you may have the right to access, correct, delete, restrict or
          port your data, and to object to processing based on legitimate interests. Email{' '}
          <a href="mailto:privacy@novex.io">privacy@novex.io</a> and we will respond within 30 days.
        </p>
        <p>
          Some rights are limited by our regulatory obligations — we generally cannot delete
          transaction records we are required to retain, even at your request.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    heading: 'How we protect it',
    body: (
      <>
        <p>
          Encryption in transit and at rest, no standing production access, dual approval for
          privileged actions, and continuous monitoring. Our security model is described in more
          detail on the security page.
        </p>
      </>
    ),
  },
];

export const metadata: Metadata = {
  title: 'Privacy policy',
  description:
    `What data ${BRAND.name} collects, why, and the control you have over it.`,
};

export default function PrivacyPage() {

  return (
    <LegalDocument
      title="Privacy policy"
      updated="12 August 2026"
      summary="What we collect, why we collect it, who sees it and how long we keep it — in plain language, with the legal bases named."
      sections={SECTIONS}
    />
  );
}
