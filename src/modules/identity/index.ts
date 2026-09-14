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
export type { ListUsersOptions, UserListDto } from './application/queries/list-users';
export type { IdentityError } from './application/errors';
export { presentIdentityError } from './application/errors';

export { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from './domain/password';
export type { VerificationPurpose } from './domain/verification-token';
export { TOKEN_LIFETIME_MS } from './domain/verification-token';
