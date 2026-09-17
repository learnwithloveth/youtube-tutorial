import { BRAND } from '@/modules/content';
import { Section, SectionHeading } from '@/shared/ui/primitives/section';
import { DisclosureList, type DisclosureItem } from '@/shared/ui/primitives/disclosure';
import { Reveal } from '@/shared/ui/motion/reveal';

export const HOME_FAQ: DisclosureItem[] = [
  {
    question: `How does ${BRAND.name} prove it holds my assets?`,
    answer:
      'Every 24 hours we publish a Merkle root of all customer balances alongside signed attestations of on-chain reserve addresses. Your account page gives you your own leaf and the sibling hashes, so you can verify your balance is inside the published root without trusting us or an auditor.',
  },
  {
    question: 'What does it actually cost to trade?',
    answer:
      'Spot trading starts at 0.10% taker and 0.02% maker, falling to 0.03% / −0.005% at the top volume tier. New accounts trade the top 20 pairs commission-free for 30 days. Deposits over local rails are free; card funding carries the network fee at cost.',
  },
  {
    question: `Is ${BRAND.name} regulated?`,
    answer:
      `${BRAND.name} operates under 14 licences including MiCA authorisation in the EEA, a Major Payment Institution licence in Singapore, and FinCEN MSB registration in the United States. Product availability varies by jurisdiction and is shown at signup.`,
  },
  {
    question: 'Can I hold my own keys?',
    answer:
      `Yes. ${BRAND.name} Wallet is fully self-custodial and uses MPC key shards split across three regions — we never hold or assemble a complete private key. You can move between the exchange account and the wallet in one tap with no withdrawal fee.`,
  },
  {
    question: 'What happens if the exchange is compromised?',
    answer:
      'Ninety-eight percent of assets sit in HSM-backed cold storage requiring geographically separated quorum approval. The remaining hot float is covered by a $250M insurance fund plus a crime policy underwritten by a syndicate of A-rated insurers.',
  },
  {
    question: 'How fast are withdrawals?',
    answer:
      'On-chain withdrawals are broadcast within 30 seconds for 96% of requests. Fiat withdrawals over instant rails (FPS, SEPA Instant, PIX, NIP) typically land in under two minutes; SWIFT takes one to three business days.',
  },
];

export function FaqSection({
  items = HOME_FAQ,
  eyebrow = 'Questions',
  title = 'The things people actually ask',
}: {
  items?: DisclosureItem[];
  eyebrow?: string;
  title?: string;
}) {
  return (
    <Section>
      <div className="shell grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
        <SectionHeading
          align="left"
          eyebrow={eyebrow}
          title={title}
          body="Still stuck? Our support team replies in a median of 90 seconds, 24 hours a day."
          className="lg:sticky lg:top-28 lg:self-start"
        />
        <Reveal delay={0.1}>
          <DisclosureList items={items} />
        </Reveal>
      </div>
    </Section>
  );
}
