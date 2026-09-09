import { ArrowRight, Blocks, Fingerprint, Globe, KeyRound, RefreshCcw, ShieldCheck } from 'lucide-react';
import { PageHero } from '../_components/sections/page-hero';
import { CtaBand } from '../_components/sections/cta-band';
import { FeatureRows, type FeatureRow } from '../_components/sections/feature-rows';
import { Section, SectionHeading } from '@/shared/ui/primitives/section';
import { Card } from '@/shared/ui/primitives/card';
import { InteractiveCard } from '@/shared/ui/primitives/interactive-card';
import { ButtonLink } from '@/shared/ui/primitives/button-link';
import { DisclosureList } from '@/shared/ui/primitives/disclosure';
import { Reveal, StaggerGroup, StaggerItem } from '@/shared/ui/motion/reveal';
import { PhoneMock } from '@/shared/ui/visuals/phone-mock';
import type { Metadata } from 'next';

import { getMarkets } from '@/server/market-data';

import { AppStoreBadges } from '@/shared/ui/visuals/app-store-badges';

const NETWORKS = ['Ethereum', 'Bitcoin', 'Solana', 'Base', 'Arbitrum', 'Optimism', 'Polygon', 'Avalanche', 'Cosmos', 'Sui', 'Aptos', 'Near', 'Injective', 'Celestia', 'Starknet', 'zkSync'];

const WALLET_FAQ = [
  { question: 'What is MPC and why does it matter?', answer: 'Multi-party computation splits your private key into shards that never come together. Signing happens collaboratively between shards, so a complete key never exists on any device, server, or piece of paper. There is no seed phrase to photograph, lose, or have phished out of you.' },
  { question: 'What happens if I lose my phone?', answer: 'Your device shard is gone, but the other two are not. Install the app on a new device, authenticate, and your recovery shard plus your cloud shard reconstitute signing capability. Novex still never holds a quorum.' },
  { question: 'Can Novex freeze my wallet?', answer: 'No. Novex Wallet is non-custodial. We cannot move, freeze, or claw back assets held in it — including if a court orders us to. Assets in your exchange account are a different matter and are subject to the terms of service.' },
  { question: 'Does it cost anything?', answer: 'The wallet is free. On-chain transactions carry the network fee at cost with nothing added. Moving between your exchange account and your wallet is free and instant.' },
];

// Must be a literal: Next reads segment config statically, so an imported
// constant cannot be resolved. See app/_lib/revalidate.ts for the rationale.
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Novex Wallet',
  description:
    'Self-custody with MPC key shards, no seed phrase, and one-tap transfers to your exchange account.',
};

export default async function WalletPage() {
  const markets = await getMarkets({ limit: 5 });


  const rows: FeatureRow[] = [
    {
      eyebrow: 'Key management',
      title: 'A wallet with no seed phrase to lose',
      body: 'Threshold MPC splits signing authority across your device secure enclave, an encrypted cloud shard, and a recovery shard you assign. A complete private key is never assembled — not on your phone, not on our servers, not anywhere.',
      bullets: [
        'Two of three shards sign; Novex never holds a quorum',
        'Recovery through a trusted contact or your own hardware key',
        'Every signature requires biometric approval on your device',
      ],
      icon: KeyRound,
      visual: <PhoneMock holdings={markets} />,
    },
    {
      eyebrow: 'Interoperability',
      title: 'One wallet, thirty-two networks',
      body: 'Bitcoin, every major EVM chain, Solana, the Cosmos ecosystem and the newer move-based chains — with a single address book and a unified transaction history that reads like a bank statement.',
      bullets: [
        'WalletConnect v2 and EIP-6963 for any dapp',
        'Human-readable transaction simulation before you sign',
        'Automatic scam-token filtering with a manual override',
      ],
      icon: Blocks,
      visual: (
        <Card className="p-8">
          <p className="eyebrow mb-6">Supported networks</p>
          <div className="flex flex-wrap gap-2">
            {NETWORKS.map((network) => (
              <span
                key={network}
                className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-fg-muted transition-colors hover:border-brand-soft/50 hover:text-fg"
              >
                {network}
              </span>
            ))}
            <span className="rounded-full border border-brand-soft/40 bg-brand/12 px-3 py-1.5 text-xs text-brand-soft">
              +16 more
            </span>
          </div>
          <p className="mt-7 border-t border-line pt-5 text-xs leading-relaxed text-fg-subtle">
            New networks ship behind a feature flag and go generally available only after an
            external audit of the signing path.
          </p>
        </Card>
      ),
    },
  ];

  return (
    <>
      <PageHero
        eyebrow="Novex Wallet"
        title={
          <>
            Your keys.
            <br />
            <span className="text-aurora">Without the ceremony.</span>
          </>
        }
        body="Self-custody that does not require you to write twelve words on a piece of card and hope. MPC key shards, biometric signing, and one tap back to your exchange account."
        align="left"
        actions={
          <>
            <ButtonLink href="/app" size="lg" sheen>
              Download the wallet
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ButtonLink>
            <ButtonLink href="/security" variant="outline" size="lg">
              How the keys work
            </ButtonLink>
          </>
        }
        aside={<PhoneMock holdings={markets} />}
      />

      <Section>
        <div className="shell">
          <SectionHeading
            eyebrow="Why self-custody"
            title="Custody is a spectrum, not a switch"
            body="Keep trading balances on the exchange where execution is fast, and move long-term holdings to a wallet only you can sign from. Both live in the same app."
          />
          <StaggerGroup className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: ShieldCheck, title: 'Non-custodial', body: 'Novex cannot move, freeze or recover your assets. That is the point.' },
              { icon: Fingerprint, title: 'Biometric signing', body: 'Face ID or fingerprint on every transaction, with simulation shown first.' },
              { icon: RefreshCcw, title: 'Free internal transfers', body: 'Move between exchange and wallet instantly, at no cost, any number of times.' },
              { icon: Globe, title: '32 networks', body: 'One address book, one history, every chain that matters.' },
            ].map((item) => (
              <StaggerItem key={item.title}>
                <InteractiveCard className="h-full p-6">
                  <item.icon className="size-6 text-brand-soft" />
                  <h3 className="mt-5 font-display text-base font-semibold text-fg">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{item.body}</p>
                </InteractiveCard>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </Section>

      <Section tone="sunken">
        <div className="shell">
          <FeatureRows rows={rows} />
        </div>
      </Section>

      <Section>
        <div className="shell grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
          <SectionHeading
            align="left"
            eyebrow="Questions"
            title="What people ask before switching"
            className="lg:sticky lg:top-28 lg:self-start"
          >
            <AppStoreBadges />
          </SectionHeading>
          <Reveal delay={0.1}>
            <DisclosureList items={WALLET_FAQ} />
          </Reveal>
        </div>
      </Section>

      <CtaBand
        title="Take custody in about a minute."
        body="Create a wallet from inside the Novex app — no new account, no seed phrase, no ceremony."
        primary={{ label: 'Get the app', href: '/app' }}
        secondary={{ label: 'Read the security model', href: '/security' }}
      />
    </>
  );
}
