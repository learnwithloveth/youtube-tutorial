import type { BlogPost, PressItem, Role, Track } from '../domain/types';
import { BRAND } from './brand';

/**
 * The editorial corpus, verbatim from the approved design.
 *
 * Held in code because it changes through review, like any other change, and
 * because a marketing page that renders from a module-level constant needs no
 * database and no network on its critical path. When this moves to a CMS it
 * becomes a fetching adapter behind the same module barrel; nothing that reads
 * it has to change.
 */

export const BLOG_POSTS: readonly BlogPost[] = [
  {
    slug: 'rebuilding-the-matching-engine-in-rust',
    title: 'What we learned rebuilding the matching engine in Rust',
    excerpt:
      'Eighteen months, one rewrite, and a 94% reduction in tail latency. The parts that worked, the parts that did not, and the benchmark we now publish every quarter.',
    category: 'Engineering',
    author: 'Priya Raman',
    role: 'Principal Engineer, Core',
    initials: 'PR',
    hue: '#10BD85',
    date: '2026-08-19',
    readingMinutes: 11,
    featured: true,
    body: [
      'The old engine was a JVM service that had grown for six years. It was correct, well-tested, and comprehensively understood by four people. It was also spending 40% of its p99 budget inside garbage collection pauses that we could shape but never eliminate.',
      'We did not rewrite it because Rust is fashionable. We rewrote it because the tail latency distribution had a shape that no amount of tuning would change, and because the shape of that distribution is the product. A trader does not experience your median. They experience the fill they did not get.',
      'The first thing we got wrong was assuming the rewrite was a performance project. It was a data-structure project. The order book is the entire system, and the JVM implementation had accreted three different indices onto the same price level because each one solved a real problem at the time. Collapsing those into a single intrusive structure did more for latency than the language change did.',
      'The second thing we got wrong was the migration plan. We intended to shadow the new engine against production for four weeks. It took five months. Every week we found another behaviour that was not in the specification because it had never been written down — self-trade prevention edge cases, the exact ordering of cancel-replace under contention, what happens to a stop order when the trigger and the limit cross in the same tick.',
      'Shadowing is the only reason this shipped without an incident. We replayed every production order against both engines and diffed the resulting book state, byte for byte, for five months. The final divergence count was eleven, all of them cases where the old engine was wrong and nobody had noticed.',
      'Today p50 order-to-ack is 0.9 ms and p99 is 3.1 ms, down from 4.2 ms and 51 ms respectively. We publish the benchmark methodology and the raw numbers quarterly, because a latency claim you cannot reproduce is marketing, not engineering.',
    ],
  },
  {
    slug: 'proof-of-reserves-is-not-an-audit',
    title: 'Proof of reserves is not an audit, and pretending otherwise is dangerous',
    excerpt:
      'A Merkle root tells you your balance was included in a total. It tells you nothing about liabilities you cannot see. Here is exactly what our attestation does and does not prove.',
    category: 'Security',
    author: 'Marcus Vogel',
    role: 'Head of Security',
    initials: 'MV',
    hue: '#16B8AC',
    date: '2026-07-30',
    readingMinutes: 8,
    body: [
      'Every exchange that publishes a Merkle root describes it as proof of reserves. Most of them are describing proof of inclusion, which is a much weaker claim, and the gap between the two is where customers get hurt.',
      'Proof of inclusion says: your balance was one of the leaves that summed to this root. That is genuinely useful. It means we cannot quietly omit you from the total, and it means you can detect it if we try.',
      'What it does not say is anything about liabilities that were never entered as leaves. An exchange that owes $10B to customers and $8B to a lender it never disclosed can publish a perfectly valid Merkle root covering only the first number.',
      'The second gap is the asset side. A signed message from an address proves control at a moment in time. It does not prove the assets were not borrowed an hour earlier and returned an hour later, which is precisely what happened in at least two well-documented cases.',
      'Our attestation closes the second gap with continuous address monitoring rather than a point-in-time signature, and closes the first with a liability attestation from an external firm covering off-balance-sheet obligations. Both are published. Neither is sufficient alone.',
      'Read our attestation and ask what it does not cover. Then ask the same question of every venue holding your assets. The answer is usually more interesting than the headline number.',
    ],
  },
  {
    slug: 'the-case-against-payment-for-order-flow',
    title: 'The case against payment for order flow, in one order book',
    excerpt:
      'We modelled the same 10,000 retail orders against an internalised venue and an open book. The difference showed up entirely in the tail — and it was larger than the fee.',
    category: 'Research',
    author: 'Amara Okonkwo',
    role: 'Head of Market Structure',
    initials: 'AO',
    hue: '#C026D3',
    date: '2026-07-08',
    readingMinutes: 9,
    body: [
      'Payment for order flow is defended on a simple claim: retail gets price improvement relative to the public quote, and the rebate funds zero-commission trading. Both halves are true and both halves are incomplete.',
      'We took 10,000 anonymised retail orders and simulated their execution twice: once against an internaliser applying typical price improvement, and once against our own open book with price-time priority.',
      'The median outcome favoured the internaliser by about 0.4 basis points. That is the part of the story that gets published.',
      'The 95th percentile favoured the open book by 14 basis points, and the 99th by 61. The reason is structural rather than adversarial: an internaliser prices against its own inventory and widens when it is uncertain, which is exactly the moment your order most needs depth.',
      'The uncomfortable conclusion for both sides is that the median trader is better off with internalisation and the trader with size or urgency is materially worse off. Averaging those two into one number for a marketing page serves nobody.',
      'We do not accept payment for order flow. We also do not claim that decision makes every fill better. It makes the bad fills less bad, which is a different and more honest thing to say.',
    ],
  },
  {
    slug: 'designing-for-the-worst-network-in-the-room',
    title: 'Designing for the worst network in the room',
    excerpt:
      `We built the ${BRAND.name} mobile app on a throttled 3G connection for a quarter. It changed the architecture, the animation budget, and what we let the interface promise.`,
    category: 'Product',
    author: 'Tolu Adeyemi',
    role: 'Design Lead, Mobile',
    initials: 'TA',
    hue: '#5FF09B',
    date: '2026-06-21',
    readingMinutes: 7,
    body: [
      'The exchange app was designed on office fibre and tested on office fibre. Then we looked at the session data and found that a quarter of our users in Paris, Jakarta and São Paulo were on connections where a single round trip could take two seconds.',
      'For one quarter, every designer and mobile engineer worked with a network conditioner pinned to 3G with 400 ms of added latency. Not for a sprint. For a quarter.',
      'Three things changed immediately. Optimistic UI went from a nice-to-have to the default, because a spinner that runs for two seconds reads as a broken app. Every screen got a meaningful skeleton derived from cached data rather than a grey rectangle. And we deleted about 40% of the animation budget, because motion that waits on a network response is worse than no motion at all.',
      'The deeper change was to what the interface was allowed to promise. A button labelled "Buy" that might not have worked yet is a lie on a slow connection. We now show the order as pending with a clear state and a real cancel affordance, rather than pretending it completed.',
      'Crash-free sessions on low-end Android went from 98.1% to 99.7%. Order abandonment on slow connections fell by a third. Neither number moved because we optimised a bundle.',
    ],
  },
  {
    slug: 'why-we-publish-our-postmortems',
    title: 'Why we publish every postmortem, including the embarrassing ones',
    excerpt:
      'Fourteen public postmortems in three years. What we gained, what it cost, and the one we nearly did not publish.',
    category: 'Company',
    author: 'Daniel Reyes',
    role: 'VP Engineering',
    initials: 'DR',
    hue: '#FBBF24',
    date: '2026-05-14',
    readingMinutes: 6,
    body: [
      'The policy is simple: any incident that degrades customer experience gets a public postmortem within five business days, whether or not funds were affected, and whether or not anyone outside noticed.',
      'The commercial argument against this is obvious. Publishing your failures hands competitors a narrative and gives journalists a headline. We have had both happen.',
      'The argument for it is that the alternative is worse in a way that compounds. An organisation that decides case by case whether to publish will always find a reason not to publish the bad one, and the internal culture adjusts accordingly. Engineers learn what gets written down and what gets quietly handled.',
      'The one we nearly did not publish was a nine-minute window where a deployment left withdrawal approvals running on a stale allow-list. No withdrawal went to a wrong address. Nothing was lost. The control that should have caught it was the one that failed, and the control that did catch it was a monitor someone had added on their own initiative eight months earlier.',
      'We published it. The internal effect was larger than the external one: three teams found the same class of stale-config risk in their own services within a fortnight.',
    ],
  },
  {
    slug: 'stablecoin-settlement-in-emerging-markets',
    title: 'What stablecoin settlement actually looks like in emerging markets',
    excerpt:
      'Corridor-level data from 14 months of flows through Paris, Nairobi, Manila and Buenos Aires — and why the remittance framing misses the point.',
    category: 'Research',
    author: 'Amara Okonkwo',
    role: 'Head of Market Structure',
    initials: 'AO',
    hue: '#C026D3',
    date: '2026-04-02',
    readingMinutes: 10,
    body: [
      'The remittance story is the one everyone tells: a worker abroad sends money home, and stablecoins cut a 6% fee to something near zero. It is true, and it is a small fraction of what we actually observe.',
      'The dominant flow in our corridor data is business-to-business working capital. An importer in Paris paying a supplier in Shenzhen is not solving a fee problem. They are solving a settlement-time problem and, more often, an access problem.',
      'Median settlement in that corridor through correspondent banking was four business days when it worked. Through USDC on a low-fee chain it is under three minutes. The fee saving is real but secondary; the working-capital saving of not having four days of inventory in transit is an order of magnitude larger.',
      'The second pattern is dollar savings rather than dollar payments. In markets with 30%+ annual currency depreciation, a stablecoin balance is a savings account, and the on-ramp fee is amortised over months rather than charged per transaction.',
      'Both patterns imply a different product than the remittance framing does. They need deep local-currency liquidity at the edges, predictable on-ramp pricing, and business account features — not a cheaper Western Union.',
    ],
  },
];

export const ROLES: readonly Role[] = [
  { title: 'Staff Engineer, Matching Core', team: 'Engineering', location: 'Zurich / Remote (CET ±3)', type: 'Full-time', level: 'Staff' },
  { title: 'Senior Engineer, Wallet Infrastructure', team: 'Engineering', location: 'Remote (global)', type: 'Full-time', level: 'Senior' },
  { title: 'Site Reliability Engineer', team: 'Engineering', location: 'Singapore', type: 'Full-time', level: 'Mid–Senior' },
  { title: 'iOS Engineer', team: 'Engineering', location: 'Remote (global)', type: 'Full-time', level: 'Senior' },
  { title: 'Security Engineer, Detection', team: 'Security', location: 'Zurich', type: 'Full-time', level: 'Senior' },
  { title: 'Threat Intelligence Analyst', team: 'Security', location: 'Remote (Americas)', type: 'Full-time', level: 'Mid' },
  { title: 'Product Designer, Trading', team: 'Design', location: 'Paris / Remote', type: 'Full-time', level: 'Senior' },
  { title: 'Design Systems Engineer', team: 'Design', location: 'Remote (global)', type: 'Full-time', level: 'Mid–Senior' },
  { title: 'Quantitative Researcher, Market Structure', team: 'Research', location: 'Singapore / London', type: 'Full-time', level: 'Senior' },
  { title: 'Compliance Manager, EEA', team: 'Legal & Compliance', location: 'Zurich', type: 'Full-time', level: 'Manager' },
  { title: 'Institutional Sales, APAC', team: 'Commercial', location: 'Singapore', type: 'Full-time', level: 'Senior' },
  { title: 'Support Specialist (Portuguese)', team: 'Customer Operations', location: 'Remote (Brazil)', type: 'Full-time', level: 'Mid' },
];

export const LEARN_TRACKS: readonly Track[] = [
  {
    name: 'Foundations',
    description: 'Everything you need before your first trade — and a few things most guides skip.',
    lessons: [
      { title: 'What a blockchain actually is', minutes: 8, level: 'Beginner', summary: 'A ledger, a consensus rule, and why the combination is interesting.' },
      { title: 'Custody: who holds what', minutes: 7, level: 'Beginner', summary: 'Exchange balances versus self-custody, and when each is the right answer.' },
      { title: 'Reading a price chart honestly', minutes: 11, level: 'Beginner', summary: 'What candles show, what they hide, and why timeframe is a choice about you.' },
      { title: 'The four ways people lose money', minutes: 9, level: 'Beginner', summary: 'Fees, spread, leverage and phishing — ranked by how much they actually cost.' },
    ],
  },
  {
    name: 'Trading mechanics',
    description: 'How orders, books and fills really work, without the trading-guru framing.',
    lessons: [
      { title: 'Order types and when each is wrong', minutes: 12, level: 'Intermediate', summary: 'Market, limit, stop, trailing — and the failure mode of each.' },
      { title: 'Slippage, spread and market impact', minutes: 10, level: 'Intermediate', summary: 'Why your fill differs from the price you saw, decomposed into three causes.' },
      { title: 'Maker versus taker', minutes: 8, level: 'Intermediate', summary: 'Adding versus removing liquidity, and how rebates change the maths.' },
      { title: 'Dollar-cost averaging, examined', minutes: 9, level: 'Intermediate', summary: 'What the research actually supports, and what it does not.' },
    ],
  },
  {
    name: 'Beyond spot',
    description: 'Staking, on-chain mechanics and the risks that only show up at the edges.',
    lessons: [
      { title: 'How staking rewards are produced', minutes: 11, level: 'Advanced', summary: 'Issuance, validators, slashing and why the APY number moves.' },
      { title: 'Bridges and why they get exploited', minutes: 14, level: 'Advanced', summary: 'The trust assumptions behind moving assets between chains.' },
      { title: 'Stablecoins: three designs, three risks', minutes: 12, level: 'Advanced', summary: 'Fiat-backed, over-collateralised and algorithmic, and how each fails.' },
      { title: 'Reading a proof-of-reserves attestation', minutes: 10, level: 'Advanced', summary: 'What a Merkle root proves, and the two gaps it leaves open.' },
    ],
  },
];

export const PRESS_ITEMS: readonly PressItem[] = [
  { date: '2026-08-24', outlet: 'Financial Times', headline: `${BRAND.name} opens Paris engineering hub as African volumes triple`, href: '#' },
  { date: '2026-07-11', outlet: 'Bloomberg', headline: 'Exchange publishes third-party liability attestation, raising the bar on reserves', href: '#' },
  { date: '2026-06-02', outlet: 'The Block', headline: `${BRAND.name} matching engine benchmark: 1.4M orders per second, independently replicated`, href: '#' },
  { date: '2026-04-18', outlet: 'CoinDesk', headline: `MiCA authorisation granted; ${BRAND.name} passports into 27 EEA markets`, href: '#' },
  { date: '2026-02-27', outlet: 'Reuters', headline: `${BRAND.name} declines payment for order flow as US venues expand the practice`, href: '#' },
  { date: '2026-01-15', outlet: 'TechCrunch', headline: `${BRAND.name} Wallet ships MPC self-custody with no seed phrase`, href: '#' },
];
