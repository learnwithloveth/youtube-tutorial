/**
 * identity — public API, safe to import anywhere.
 *
 * Split by environment, like `market-data`: this barrel carries only types,
 * error presentation and policy constants, all of which the sign-up and reset
 * forms need in the browser. Composition lives in `./server`, which is
 * `server-only` — see that file for why the split has to exist rather than
 * being a matter of taste.
 *
 * Note what is absent: no `User` entity, no `Session`, no `PasswordHash`, no
 * Drizzle schema, no repository. Consumers get DTOs and function signatures.
 * That restraint is what makes the module extractable — swap the barrel for an
 * HTTP client and no caller changes.
 */

export type { CurrentUserDto, SessionDto, UserSummaryDto } from './application/dto';
export type { UserRole, UserStatus } from './domain/user';
export {
  displayNameFor,
  initialsFor,
  HANDLE_PATTERN,
  MAX_DISPLAY_NAME,
  MAX_PERSON_NAME,
} from './domain/profile';
export type { ListUsersOptions, UserListDto } from './application/queries/list-users';
export type {
  AdministratorDto,
  AdministratorsDto,
} from './application/queries/list-administrators';
export type { SessionSummaryDto } from './application/queries/list-sessions';
export type { IdentityError } from './application/errors';
export { presentIdentityError } from './application/errors';

export { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from './domain/password';

/* The account number's shape and its display grouping — needed by every surface
   that prints one: the customer's dashboard, the console's account list, the
   demo-funds form. The class itself stays inside the module, because nothing
   above this boundary constructs an account number; it only renders one. */
export { ACCOUNT_NUMBER_LENGTH, formatAccountNumber } from './domain/account-number';

export type { VerificationPurpose } from './domain/verification-token';
export { TOKEN_LIFETIME_MS } from './domain/verification-token';

/*
 * Identity verification — the types and the policy the customer-facing form needs.
 *
 * The *queries* are not here: they log, and the logger is `server-only`. Same trap
 * `ledger`, `presence` and `activity` all document. They live in `./server`.
 */
export type {
  IdentityDocumentType,
  VerificationStatus,
} from './domain/identity-verification';
export {
  DOCUMENT_TYPES,
  isDocumentType,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_NUMBER,
  MAX_FULL_NAME,
  MINIMUM_AGE_YEARS,
} from './domain/identity-verification';
export type {
  VerificationQueueDto,
  VerificationSummaryDto,
} from './application/queries/verification-queue';
export type { VerificationStandingDto } from './application/queries/verification-standing';

/* Sign-in methods — what the security page shows and offers. */
export type { AuthProvider } from './domain/connected-account';
export { PROVIDER_LABELS } from './domain/connected-account';
export type {
  ConnectedAccountDto,
  SignInMethodsDto,
} from './application/queries/sign-in-methods';
