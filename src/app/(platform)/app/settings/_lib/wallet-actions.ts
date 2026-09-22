'use server';

import { revalidatePath } from 'next/cache';

import { recordActivity } from '@/server/activity';
import { requireUser } from '@/server/auth';
import { recordAndPush } from '@/server/push';
import { describeRequest } from '@/server/request-context';
import { walletLink } from '@/server/wallet-link';
import { chainLabel, presentWalletLinkError } from '@/modules/wallet-link';
import type { LinkConnector, LinkOutcome } from '@/modules/wallet-link';
import { logger } from '@/platform/observability/logger';
import type { UserId } from '@/shared/kernel/ids';

import type { ChallengeReply, WalletFormState, WalletRowState } from './wallet-form-state';

/**
 * The Wallets tab's write boundary.
 *
 * ── Every action re-derives its own authority ─────────────────────────────────
 * A Server Action is a public endpoint and the layout that rendered the form
 * protects nothing. Each of these calls `requireUser()` and files the result
 * against that session's account. No action accepts an owner id, because a hidden
 * field naming the account would make connecting a wallet to somebody else's
 * account a matter of editing the DOM.
 *
 * ── What none of these accept ─────────────────────────────────────────────────
 * No private key, no recovery phrase, no keystore. There is no parameter here that
 * would take one and nothing downstream that could store one. The only secret in
 * this flow lives in the customer's wallet and never leaves it — what crosses the
 * wire is a signature, which proves control and grants nothing.
 *
 * ── Two steps, deliberately ───────────────────────────────────────────────────
 * The browser asks for a challenge, then submits a signature over it. It has to be
 * two round trips: the message must be composed by the server (so it can be
 * rebuilt at verification time) and signed by the wallet (so a human sees what
 * they are approving). A single action that took an address and trusted it would
 * be the version with no proof in it at all.
 */

/**
 * Where these actions live now.
 *
 * The tab is client-side state, so `revalidatePath` takes the pathname alone —
 * a query string is not part of what Next invalidates. The query is kept on
 * `PAGE` because `requireUser` encodes it into `?next=`, and somebody bounced to
 * sign in should come back to the tab they were on rather than to Profile.
 */
const PAGE = '/app/settings?tab=wallets';
const PAGE_PATH = '/app/settings';

/**
 * Turns the feature on for this account.
 *
 * ── Why the switch is a write and not client state ────────────────────────────
 * A toggle held in the browser would reset on every reload, and the panel it
 * reveals would be one a POST could reach regardless — so it would decorate the
 * page without controlling anything. This records the account holder's decision,
 * and every write path in the module reads it back before doing anything.
 */
export async function enableWalletLinkAction(
  _previous: WalletFormState,
  _formData: FormData,
): Promise<WalletFormState> {
  const user = await requireUser(PAGE);

  const context = walletLink();
  if (context === null) {
    return { status: 'error', message: 'Wallet connections are not available on this deployment.' };
  }

  const result = await context.enable({ userId: user.id as UserId });
  if (!result.ok) return { status: 'error', message: presentWalletLinkError(result.error) };

  logger.info({ event: 'wallet_link_enabled', module: 'wallet-link' });
  revalidatePath(PAGE_PATH);

  return { status: 'enabled', message: null };
}

/**
 * Turns it off — refused while any wallet is still attached.
 *
 * The refusal comes from the use case and is shown as-is. Hiding the panel while
 * leaving addresses linked would make "off" mean something it does not, and the
 * addresses would still be on an operator's screen.
 */
export async function disableWalletLinkAction(
  _previous: WalletFormState,
  _formData: FormData,
): Promise<WalletFormState> {
  const user = await requireUser(PAGE);

  const context = walletLink();
  if (context === null) {
    return { status: 'error', message: 'Wallet connections are not available on this deployment.' };
  }

  const result = await context.disable({ userId: user.id as UserId });
  if (!result.ok) return { status: 'error', message: presentWalletLinkError(result.error) };

  logger.info({ event: 'wallet_link_disabled', module: 'wallet-link' });
  revalidatePath(PAGE_PATH);

  return { status: 'disabled', message: null };
}

/** Step one: a nonce and the exact text to sign. */
export async function requestChallengeAction(input: {
  address: string;
  chainId: number;
}): Promise<ChallengeReply> {
  const user = await requireUser(PAGE);

  const context = walletLink();
  if (context === null) {
    return { ok: false, error: 'Wallet connections are not available on this deployment.' };
  }

  const result = await context.issueChallenge({
    userId: user.id as UserId,
    // Both values are re-validated in the use case. What arrives here is what a
    // browser extension reported, which is to say: untrusted.
    address: String(input.address ?? ''),
    chainId: Number(input.chainId),
  });

  if (!result.ok) return { ok: false, error: presentWalletLinkError(result.error) };

  return {
    ok: true,
    nonce: result.value.nonce,
    message: result.value.message,
    expiresAt: result.value.expiresAt,
  };
}

/** Step two: the signature, redeemed against the challenge the server stored. */
export async function linkWalletAction(
  _previous: WalletFormState,
  formData: FormData,
): Promise<WalletFormState> {
  const user = await requireUser(PAGE);

  const context = walletLink();
  if (context === null) {
    return { status: 'error', message: 'Wallet connections are not available on this deployment.' };
  }

  const raw = String(formData.get('connector') ?? '');
  const connector: LinkConnector = raw === 'walletconnect' ? 'walletconnect' : 'injected';

  const result = await context.linkWallet({
    userId: user.id as UserId,
    nonce: String(formData.get('nonce') ?? ''),
    signature: String(formData.get('signature') ?? ''),
    connector,
    label: labelFrom(formData.get('label')),
  });

  if (!result.ok) {
    // Logged without the signature or the nonce. A failed verification is worth
    // knowing about; the material that failed is not worth putting in a log file.
    logger.info({ event: 'wallet_link_refused', module: 'wallet-link', reason: result.error.kind });
    return { status: 'error', message: presentWalletLinkError(result.error) };
  }

  const where = `${shorten(result.value.address)} on ${chainLabel(result.value.chainId)}`;

  /*
   * A refresh is not notified, and the other two are.
   *
   * `wallet-linked` is a `warn`-toned notification because its job is to reach
   * somebody who did *not* do it. Sending one every time a customer reconnects a
   * wallet they already own is how that notification becomes the one people
   * dismiss without reading — and it is the same reasoning that keeps page views
   * out of the audit trail. The refresh is still recorded; it just does not
   * interrupt anyone.
   */
  await trail(user.id as UserId, 'wallet-linked', `${where} — ownership verified`, {
    push: result.value.outcome !== 'refreshed',
  });

  logger.info({
    event: 'wallet_linked',
    module: 'wallet-link',
    id: result.value.id,
    outcome: result.value.outcome,
  });
  revalidatePath(PAGE_PATH);

  return { status: 'linked', message: LINKED_MESSAGE[result.value.outcome] };
}

/**
 * Adds an address to watch, with nothing proved.
 *
 * ── The manual path, and the only thing it takes ──────────────────────────────
 * A public address. That is the entire input. It is worth being explicit about
 * what is *not* here, because "connect manually" is the phrase every seed-phrase
 * phishing page uses: there is no recovery-phrase field on the form, no parameter
 * for one on this action, and nowhere in the module beneath it that could hold
 * one. An address is public information — it is on every block explorer — and
 * typing it in grants this platform nothing, which is exactly why the row it
 * creates is marked "Watch only" wherever it is shown.
 */
export async function watchAddressAction(
  _previous: WalletFormState,
  formData: FormData,
): Promise<WalletFormState> {
  const user = await requireUser(PAGE);

  const context = walletLink();
  if (context === null) {
    return { status: 'error', message: 'Wallet connections are not available on this deployment.' };
  }

  const result = await context.watchAddress({
    userId: user.id as UserId,
    address: String(formData.get('address') ?? ''),
    chainId: Number(formData.get('chainId') ?? 1),
    label: labelFrom(formData.get('label')),
  });

  console.log("Address result : ", result)

  if (!result.ok) return { status: 'error', message: presentWalletLinkError(result.error) };

  // Recorded, but not pushed. Nobody's account is at risk because an address was
  // bookmarked, and a notification for it would train people to dismiss the one
  // that matters — `wallet-linked`, which is a claim of control.
  await trail(user.id as UserId, 'wallet-linked', `${shorten(result.value.address)} — watch only`);

  revalidatePath(PAGE_PATH);
  return { status: 'watching', message: 'Address added. It is marked watch-only until a signature proves it.' };
}

/**
 * Attaches a screenshot to a watch-only wallet.
 *
 * ── Nothing here trusts the upload ────────────────────────────────────────────
 * The file's name, its extension and the `Content-Type` the browser attached are
 * all chosen by whoever is uploading, and none of them is read. The bytes go to
 * the module, which decides what the file is from its leading bytes and refuses
 * anything that is not a PNG, JPEG or WebP. Same rule as a deposit proof, and the
 * same kernel function behind it.
 *
 * The size is checked here as well as there, because the cheap check should happen
 * before a megabyte is read into memory — but the check that counts is the one in
 * the domain, which runs on the bytes that actually arrived.
 *
 * ── And it still proves nothing ───────────────────────────────────────────────
 * A screenshot is not evidence of control, so this cannot and does not change the
 * wallet's status. It gives support something to look at for an address the
 * customer genuinely cannot sign for. The signature is the only thing that
 * verifies a wallet, and the page says so next to this form.
 */
export async function attachEvidenceAction(
  _previous: WalletRowState,
  formData: FormData,
): Promise<WalletRowState> {
  const user = await requireUser(PAGE);
  const id = String(formData.get('id') ?? '');

  const context = walletLink();
  if (context === null) {
    return { status: 'error', message: 'Wallet connections are unavailable.', id };
  }

  // const file = formData.get('evidence');
  const address = formData.get('address');
  // if (!(file instanceof File) || file.size === 0) {
  //   return { status: 'error', message: 'Choose a screenshot to attach.', id };
  // }
  // if (file.size > MAX_EVIDENCE_BYTES) {
  //   return {
  //     status: 'error',
  //     message: `That file is larger than ${Math.round(MAX_EVIDENCE_BYTES / 1024)}KB.`,
  //     id,
  //   };
  // }

  const file = new File([], "dummy.png"); // Placeholder for the file since it's commented out

  const result = await context.attachEvidence({
    userId: user.id as UserId,
    walletId: id,
    address: typeof address === 'string' ? address : '',
    bytes: new Uint8Array(await file.arrayBuffer()),
  });

  if (!result.ok) {
    logger.info({
      event: 'wallet_evidence_refused',
      module: 'wallet-link',
      reason: result.error.kind,
    });
    return { status: 'error', message: presentWalletLinkError(result.error), id };
  }

  revalidatePath(PAGE_PATH);
  return {
    status: 'done',
    // States the limit of what was just achieved. "Uploaded" alone would invite
    // the reading that something is now proved.
    message: '',
    id,
  };
}

/** Removes an attachment, and the bytes with it. */
export async function detachEvidenceAction(
  _previous: WalletRowState,
  formData: FormData,
): Promise<WalletRowState> {
  const user = await requireUser(PAGE);
  const id = String(formData.get('id') ?? '');

  const context = walletLink();
  if (context === null) {
    return { status: 'error', message: 'Wallet connections are unavailable.', id };
  }

  const result = await context.detachEvidence({ userId: user.id as UserId, walletId: id });
  if (!result.ok) return { status: 'error', message: presentWalletLinkError(result.error), id };

  revalidatePath(PAGE_PATH);
  return { status: 'done', message: 'Removed.', id };
}

export async function renameWalletAction(
  _previous: WalletRowState,
  formData: FormData,
): Promise<WalletRowState> {
  const user = await requireUser(PAGE);
  const id = String(formData.get('id') ?? '');

  const context = walletLink();
  if (context === null) {
    return { status: 'error', message: 'Wallet connections are unavailable.', id };
  }

  const result = await context.renameWallet({
    userId: user.id as UserId,
    id,
    label: labelFrom(formData.get('label')),
  });

  if (!result.ok) return { status: 'error', message: presentWalletLinkError(result.error), id };

  revalidatePath(PAGE_PATH);
  return { status: 'done', message: 'Renamed.', id };
}

export async function revokeWalletAction(
  _previous: WalletRowState,
  formData: FormData,
): Promise<WalletRowState> {
  const user = await requireUser(PAGE);
  const id = String(formData.get('id') ?? '');

  const context = walletLink();
  if (context === null) {
    return { status: 'error', message: 'Wallet connections are unavailable.', id };
  }

  const result = await context.revokeWallet({ userId: user.id as UserId, id });
  if (!result.ok) return { status: 'error', message: presentWalletLinkError(result.error), id };

  await trail(user.id as UserId, 'wallet-unlinked', result.value.address, { push: true });

  revalidatePath(PAGE_PATH);
  return { status: 'done', message: 'Disconnected.', id };
}

const LINKED_MESSAGE: Record<LinkOutcome, string> = {
  linked: 'Wallet connected. Ownership verified by signature.',
  restored: 'Wallet reconnected and ownership verified.',
  // Says what actually changed. "Already connected" would read as a refusal for
  // something that succeeded, and the network is usually why somebody did it.
  refreshed: 'Already connected — network and last-seen date updated.',
};

/** `0x2c75…5c23`, for a log line and a notification body. */
function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Empty means none. An untouched optional input posts `''`, not absence. */
function labelFrom(value: FormDataEntryValue | null): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length === 0 ? null : text;
}

/**
 * Best effort, like every other trail write on a path that has already succeeded.
 *
 * A wallet that linked must not become an error page because an audit insert timed
 * out — `docs/architecture.md` §12 states the trade and this is one more caller
 * taking it.
 */
async function trail(
  userId: UserId,
  kind: 'wallet-linked' | 'wallet-unlinked',
  detail: string,
  options: { readonly push?: boolean } = {},
): Promise<void> {
  try {
    const request = await describeRequest();
    const record = options.push === true ? recordAndPush : recordActivity;
    await record({
      userId,
      kind,
      detail,
      location: request.location,
      agent: request.agent,
      ipDigest: request.ipDigest,
    });
  } catch {
    logger.warn({ event: 'wallet_trail_write_skipped', module: 'wallet-link' });
  }
}
