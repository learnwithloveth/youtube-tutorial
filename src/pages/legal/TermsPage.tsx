import { LegalDocument, type LegalSection } from './LegalDocument';
import { useSeo } from '@/lib/seo';

const SECTIONS: LegalSection[] = [
  {
    id: 'agreement',
    heading: 'The agreement',
    body: (
      <>
        <p>
          These terms form a binding agreement between you and Novex Technologies AG, a company
          registered in Zurich, Switzerland. By opening an account, accessing the platform, or
          placing an order you accept them in full.
        </p>
        <p>
          Where a service is provided by a Novex group entity in your jurisdiction, that entity's
          supplementary terms apply alongside these and prevail in the event of a conflict.
        </p>
      </>
    ),
  },
  {
    id: 'eligibility',
    heading: 'Eligibility and account opening',
    body: (
      <>
        <p>To open an account you must:</p>
        <ul>
          <li>Be at least 18 years old, or the age of majority where you live if that is higher.</li>
          <li>Be resident in a jurisdiction where we are authorised to offer the relevant service.</li>
          <li>Not appear on any applicable sanctions list, and not act on behalf of anyone who does.</li>
          <li>Complete identity verification to the standard required by our regulators.</li>
        </ul>
        <p>
          We may decline an application, or close an existing account on reasonable notice, without
          being required to give reasons where doing so would prejudice a regulatory obligation.
        </p>
      </>
    ),
  },
  {
    id: 'services',
    heading: 'Trading services',
    body: (
      <>
        <p>
          Novex operates a matching venue for digital assets. We act as an execution venue, not as
          your adviser, and we do not act as principal against your order flow.
        </p>
        <p>
          Orders are matched on strict price-time priority. We do not internalise order flow, accept
          payment for order flow, or operate a proprietary trading desk that competes with customers.
        </p>
        <p>
          <strong>Nothing on the platform is investment advice.</strong> Prices, research and
          educational material are provided for information only.
        </p>
      </>
    ),
  },
  {
    id: 'custody',
    heading: 'Custody of your assets',
    body: (
      <>
        <p>
          Digital assets credited to your account are held by us on your behalf, segregated from our
          own assets, and are not used to fund our operations, lent, or rehypothecated.
        </p>
        <p>
          Fiat balances are held in client money accounts at tier-1 banks, titled to customers and
          held off the Novex balance sheet.
        </p>
        <p>
          Assets held in Novex Wallet are in your own custody. We cannot move, freeze or recover
          them, and the provisions of this section do not apply to them.
        </p>
      </>
    ),
  },
  {
    id: 'fees',
    heading: 'Fees',
    body: (
      <>
        <p>
          Fees are published in full on our fees page and form part of these terms. We give at least
          30 days' notice of any increase, published on that page and sent to your registered email.
        </p>
        <p>
          Network fees on withdrawals are passed through at cost. We do not add a margin to them or
          round them up.
        </p>
      </>
    ),
  },
  {
    id: 'risk',
    heading: 'Risk disclosure',
    body: (
      <>
        <p>
          Digital assets are volatile. Their value can fall as well as rise and you may get back less
          than you put in. Past performance is not a guide to future performance.
        </p>
        <ul>
          <li>Markets can gap, and a stop order may execute materially away from its trigger.</li>
          <li>Staking rewards are variable, not guaranteed, and subject to protocol slashing risk.</li>
          <li>On-chain transactions are irreversible once broadcast.</li>
          <li>Digital assets are generally not covered by deposit-guarantee schemes.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'conduct',
    heading: 'Prohibited conduct',
    body: (
      <>
        <p>You must not use the platform to:</p>
        <ul>
          <li>Manipulate a market, including spoofing, layering, wash trading or ramping.</li>
          <li>Launder proceeds of crime or finance terrorism.</li>
          <li>Circumvent sanctions, jurisdictional restrictions or account limits.</li>
          <li>Access the API in a way that degrades service for others, including exceeding published rate limits after warning.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'liability',
    heading: 'Liability',
    body: (
      <>
        <p>
          Nothing in these terms excludes liability for fraud, for death or personal injury caused by
          negligence, or for any liability that cannot lawfully be excluded.
        </p>
        <p>
          Subject to that, our aggregate liability arising from your use of the platform in any
          twelve-month period is limited to the greater of the fees you paid us in that period and
          one thousand Swiss francs.
        </p>
      </>
    ),
  },
  {
    id: 'termination',
    heading: 'Suspension and termination',
    body: (
      <>
        <p>
          You may close your account at any time once open positions are settled and balances
          withdrawn. We may suspend an account immediately where we reasonably suspect fraud, market
          abuse, or a legal obligation requires it, and will tell you as soon as we are permitted to.
        </p>
      </>
    ),
  },
  {
    id: 'law',
    heading: 'Governing law',
    body: (
      <>
        <p>
          These terms are governed by Swiss law. Disputes are subject to the exclusive jurisdiction
          of the courts of Zurich, except where mandatory consumer protection law in your country of
          residence gives you the right to bring proceedings locally.
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  useSeo({
    title: 'Terms of service',
    description: 'The agreement between you and Novex Technologies AG covering trading, custody, fees and liability.',
  });

  return (
    <LegalDocument
      title="Terms of service"
      updated="12 August 2026"
      summary="The agreement that governs your Novex account. Written to be read, with the parts that matter most to you near the top."
      sections={SECTIONS}
    />
  );
}
