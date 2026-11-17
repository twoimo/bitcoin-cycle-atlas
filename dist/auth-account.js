/** Browser-local accounts. This does not gate static /data JSON or start Google OAuth. */
import { mountDialogViewport } from './dialog-viewport.js?v=1.29.0';

export const AUTH_ACCOUNTS_KEY = 'atlas-auth-accounts-v1';
export const AUTH_SESSION_KEY = 'atlas-auth-session-v1';
export const PBKDF2_ITERATIONS = 210000;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 12;

const messages = {
  'password-too-short': '비밀번호는 12자 이상이어야 합니다.',
  'password-too-long': '비밀번호는 200자 이하여야 합니다.',
  'password-mismatch': '비밀번호 확인이 일치하지 않습니다.',
  'email-invalid': '이메일 형식을 확인해 주세요.',
  'name-required': '표시 이름을 입력해 주세요.',
  'name-invalid': '표시 이름은 40자 이하로 입력해 주세요.',
  'email-taken': '이미 가입된 이메일입니다.',
  'invite-required': '초대 코드가 필요합니다.',
  'invite-invalid': '초대 코드를 확인해 주세요.',
  'invite-expired': '만료된 초대 코드입니다.',
  'invite-used': '이미 사용된 초대 코드입니다.',
  credentials: '이메일 또는 비밀번호가 올바르지 않습니다.',
  deleted: '탈퇴한 계정입니다.',
  rejected: '가입이 거절된 계정입니다.',
  forbidden: '관리자만 사용할 수 있습니다.',
  'last-admin': '마지막 관리자는 남깁니다.',
  missing: '승인 대기 계정을 찾지 못했습니다.',
  unauthenticated: '로그인한 뒤 탈퇴할 수 있습니다.',
  'unauthenticated-password': '로그인한 뒤 비밀번호를 바꿀 수 있습니다.',
  'password-wrong': '현재 비밀번호가 올바르지 않습니다.',
  'password-unchanged': '새 비밀번호가 현재 비밀번호와 같습니다.',
  'session-active': '로그아웃한 뒤 가입해 주세요.',
  conflict: '다른 계정 변경과 겹쳤습니다. 다시 시도해 주세요.',
  storage: '이 브라우저에서 계정 저장소를 사용할 수 없습니다.',
};

export class AuthError extends Error {
  constructor(code, message = messages[code] || '다시 시도해 주세요.') {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64ToBytes(value) {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function timingSafeEqual(left, right) {
  const length = Math.max(left?.length || 0, right?.length || 0);
  let diff = left?.length === right?.length ? 0 : 1;
  for (let index = 0; index < length; index += 1) diff |= (left?.[index] || 0) ^ (right?.[index] || 0);
  return diff === 0;
}

async function sha256Hex(value, crypto) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function deriveBits(password, salt, iterations, crypto) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

function randomId(crypto) {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(16))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken(crypto) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function memoryStorage() {
  const data = new Map();
  return {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
  };
}

function resolveStorage(storage, doc) {
  if (storage) return storage;
  try {
    const local = doc?.defaultView?.localStorage || globalThis.localStorage;
    if (local) return local;
  } catch { /* A blocked storage object cannot hold the session. */ }
  return memoryStorage();
}

function normalizeEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new AuthError('email-invalid');
  return email;
}

function normalizeName(value) {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!name) throw new AuthError('name-required');
  if ([...name].length > 40 || /[\u0000-\u001f]/.test(name)) throw new AuthError('name-invalid');
  return name;
}

function accountIsAdmin(account) {
  return account?.role === 'admin' && account?.status === 'active' && !account.deletedAt;
}

function publicAccount(record) {
  return {
    id: record.id,
    email: record.email,
    displayName: record.displayName,
    role: record.role,
    status: record.status,
  };
}

function readAccount(value) {
  const password = value?.password;
  if (!value || typeof value.id !== 'string' || typeof value.email !== 'string' || password?.algorithm !== 'PBKDF2-SHA-256') return null;
  if (typeof password.salt !== 'string' || typeof password.hash !== 'string') return null;
  const iterations = Number(password.iterations);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 2000000) return null;
  const status = ['active', 'pending', 'rejected', 'deleted'].includes(value.status) ? value.status : 'pending';
  const role = value.role === 'admin' || value.role === 'member' || value.role === 'pending' ? value.role : 'pending';
  return {
    id: value.id,
    email: value.email,
    displayName: typeof value.displayName === 'string' ? value.displayName : '',
    role,
    status,
    password: { algorithm: 'PBKDF2-SHA-256', iterations, salt: password.salt, hash: password.hash },
    sessionHash: typeof value.sessionHash === 'string' && /^[0-9a-f]{64}$/.test(value.sessionHash) ? value.sessionHash : null,
    createdAt: String(value.createdAt || ''),
    updatedAt: String(value.updatedAt || ''),
    deletedAt: typeof value.deletedAt === 'string' ? value.deletedAt : null,
    approvedBy: typeof value.approvedBy === 'string' ? value.approvedBy : null,
    approvedAt: typeof value.approvedAt === 'string' ? value.approvedAt : null,
    rejectedAt: typeof value.rejectedAt === 'string' ? value.rejectedAt : null,
    inviteId: typeof value.inviteId === 'string' ? value.inviteId : null,
  };
}

function readInvite(value) {
  if (!value || typeof value.id !== 'string' || typeof value.tokenHash !== 'string' || !/^[0-9a-f]{64}$/.test(value.tokenHash)) return null;
  return {
    id: value.id,
    tokenHash: value.tokenHash,
    issuedBy: typeof value.issuedBy === 'string' ? value.issuedBy : null,
    createdAt: String(value.createdAt || ''),
    expiresAt: String(value.expiresAt || ''),
    usedAt: typeof value.usedAt === 'string' ? value.usedAt : null,
    usedBy: typeof value.usedBy === 'string' ? value.usedBy : null,
  };
}

export function createAuthAccount({ storage, crypto = globalThis.crypto, now = () => new Date(), iterations = PBKDF2_ITERATIONS, inviteTtlMs = INVITE_TTL_MS } = {}) {
  if (!crypto?.subtle) throw new TypeError('WebCrypto is required');
  const store = storage || resolveStorage();
  let current = null;
  let tail = Promise.resolve();
  function withLock(work) {
    const locks = globalThis.navigator?.locks;
    if (typeof locks?.request === 'function') return locks.request('atlas-auth-accounts-v1', () => work());
    const run = tail.then(() => work(), () => work());
    tail = run.then(() => undefined, () => undefined);
    return run;
  }
  const nowIso = () => now().toISOString();
  const safeGet = key => { try { return store.getItem(key); } catch { return null; } };
  const safeRemove = key => { try { store.removeItem(key); } catch { /* The token is already unusable if removal fails. */ } };
  function readRaw() {
    try { return store.getItem(AUTH_ACCOUNTS_KEY); }
    catch { throw new AuthError('storage'); }
  }
  function parseStored(raw) {
    if (!raw) return { version: 1, accounts: [], invites: [] };
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1) return { version: 1, accounts: [], invites: [] };
      return {
        version: 1,
        accounts: Array.isArray(parsed.accounts) ? parsed.accounts.map(readAccount).filter(Boolean) : [],
        invites: Array.isArray(parsed.invites) ? parsed.invites.map(readInvite).filter(Boolean) : [],
      };
    } catch {
      return { version: 1, accounts: [], invites: [] };
    }
  }
  function readStore() {
    return parseStored(readRaw());
  }
  function commitSync(mutate) {
    const raw = readRaw();
    const data = parseStored(raw);
    const result = mutate(data) || {};
    if (result.skipWrite) {
      if (result.clearToken) safeRemove(AUTH_SESSION_KEY);
      if (Object.hasOwn(result, 'account')) current = result.account;
      return result.value;
    }
    if (readRaw() !== raw) throw new AuthError('conflict');
    writeStore(data);
    if (result.token) {
      try { store.setItem(AUTH_SESSION_KEY, result.token); }
      catch {
        try {
          if (raw == null) store.removeItem(AUTH_ACCOUNTS_KEY);
          else store.setItem(AUTH_ACCOUNTS_KEY, raw);
        } catch { /* The token was not stored. The next login replaces the hash. */ }
        throw new AuthError('storage');
      }
    } else if (result.clearToken) safeRemove(AUTH_SESSION_KEY);
    if (Object.hasOwn(result, 'account')) current = result.account;
    return result.value;
  }
  function writeStore(next) {
    try { store.setItem(AUTH_ACCOUNTS_KEY, JSON.stringify(next)); }
    catch { throw new AuthError('storage'); }
  }
  function hasActiveAdmin(data = readStore()) {
    return data.accounts.some(account => accountIsAdmin(account));
  }
  async function verifyPassword(password, record) {
    const rounds = record && Number.isInteger(record.iterations) && record.iterations >= 1 && record.iterations <= 2000000 ? record.iterations : iterations;
    let salt;
    try { salt = record ? base64ToBytes(record.salt) : crypto.getRandomValues(new Uint8Array(16)); }
    catch { salt = crypto.getRandomValues(new Uint8Array(16)); }
    if (!salt?.byteLength) salt = crypto.getRandomValues(new Uint8Array(16));
    const actual = await deriveBits(password, salt, rounds, crypto);
    let expected;
    try { expected = record ? base64ToBytes(record.hash) : new Uint8Array(actual.length); }
    catch { expected = new Uint8Array(actual.length); }
    return timingSafeEqual(actual, expected);
  }
  async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const bits = await deriveBits(password, salt, iterations, crypto);
    return { algorithm: 'PBKDF2-SHA-256', iterations, salt: bytesToBase64(salt), hash: bytesToBase64(bits) };
  }
  function liveAccount(data, sessionHash) {
    if (!sessionHash) return null;
    const record = data.accounts.find(account => account.sessionHash === sessionHash);
    if (!record || record.deletedAt || record.status === 'deleted' || record.status === 'rejected') return null;
    return record;
  }
  async function preparedSession() {
    const previousToken = safeGet(AUTH_SESSION_KEY);
    const previousHash = previousToken ? await sha256Hex(String(previousToken), crypto) : null;
    const token = randomToken(crypto);
    const hash = await sha256Hex(token, crypto);
    return { previousHash, token, hash };
  }
  function attachSession(data, account, prepared) {
    if (prepared.previousHash) {
      for (const item of data.accounts) {
        if (item !== account && item.sessionHash === prepared.previousHash) item.sessionHash = null;
      }
    }
    account.sessionHash = prepared.hash;
    account.updatedAt = nowIso();
  }
  function claimInvite(data, inviteHash) {
    if (!hasActiveAdmin(data)) return null;
    if (!inviteHash) throw new AuthError('invite-required');
    const invite = data.invites.find(item => item.tokenHash === inviteHash);
    if (!invite) throw new AuthError('invite-invalid');
    if (invite.usedAt) throw new AuthError('invite-used');
    const expires = Date.parse(invite.expiresAt);
    if (!Number.isFinite(expires) || expires <= now().getTime()) throw new AuthError('invite-expired');
    return invite;
  }
  async function restore() {
    try {
      const token = safeGet(AUTH_SESSION_KEY);
      if (!token) { current = null; return null; }
      const hash = await sha256Hex(String(token), crypto);
      const record = readStore().accounts.find(account => account.sessionHash === hash);
      if (!record || record.deletedAt || record.status === 'deleted' || record.status === 'rejected') {
        safeRemove(AUTH_SESSION_KEY);
        current = null;
        return null;
      }
      current = publicAccount(record);
      return current;
    } catch {
      current = null;
      return null;
    }
  }
  async function signup(input = {}) {
    const email = normalizeEmail(input.email);
    const displayName = normalizeName(input.displayName);
    const password = String(input.password ?? '');
    if (input.confirmPassword !== undefined && input.confirmPassword !== password) throw new AuthError('password-mismatch');
    if (password.length < MIN_PASSWORD_LENGTH) throw new AuthError('password-too-short');
    if (password.length > 200) throw new AuthError('password-too-long');
    const token = safeGet(AUTH_SESSION_KEY);
    if (token && liveAccount(readStore(), await sha256Hex(String(token), crypto))) throw new AuthError('session-active');
    const passwordRecord = await hashPassword(password);
    const inviteText = String(input.inviteCode ?? '').trim();
    const inviteHash = inviteText ? await sha256Hex(inviteText, crypto) : '';
    return withLock(async () => {
      const prepared = await preparedSession();
      const stamp = nowIso();
      return commitSync(data => {
        if (liveAccount(data, prepared.previousHash)) throw new AuthError('session-active');
        if (data.accounts.some(account => account.email === email && !account.deletedAt)) throw new AuthError('email-taken');
        const invite = claimInvite(data, inviteHash);
        const adminExists = hasActiveAdmin(data);
        const account = {
          id: randomId(crypto), email, displayName,
          role: adminExists ? 'pending' : 'admin',
          status: adminExists ? 'pending' : 'active',
          password: passwordRecord,
          sessionHash: null, createdAt: stamp, updatedAt: stamp, deletedAt: null,
          approvedBy: null, approvedAt: null, rejectedAt: null, inviteId: null,
        };
        if (invite) {
          invite.usedAt = stamp;
          invite.usedBy = account.id;
          account.inviteId = invite.id;
        }
        data.accounts.push(account);
        attachSession(data, account, prepared);
        const session = publicAccount(account);
        return { token: prepared.token, account: session, value: session };
      });
    });
  }
  async function login(input = {}) {
    const password = String(input.password ?? '');
    let email = '';
    try { email = normalizeEmail(input.email); }
    catch {
      await verifyPassword(password, null);
      throw new AuthError('credentials');
    }
    return withLock(async () => {
      const seen = readStore();
      const record = seen.accounts.find(account => account.email === email && !account.deletedAt);
      const deleted = [...seen.accounts].reverse().find(account => account.email === email && account.deletedAt);
      const matches = await verifyPassword(password, (record || deleted)?.password);
      const prepared = matches ? await preparedSession() : null;
      return commitSync(data => {
        const fresh = data.accounts.find(account => account.email === email && !account.deletedAt);
        const freshDeleted = [...data.accounts].reverse().find(account => account.email === email && account.deletedAt);
        if (record && fresh && fresh.password.hash !== record.password.hash) throw new AuthError('conflict');
        if (!fresh || !matches) {
          if (!fresh && freshDeleted && matches && (!deleted || freshDeleted.password.hash === deleted.password.hash)) throw new AuthError('deleted');
          throw new AuthError('credentials');
        }
        if (fresh.status === 'rejected') throw new AuthError('rejected');
        if (fresh.deletedAt || fresh.status === 'deleted') throw new AuthError('deleted');
        attachSession(data, fresh, prepared);
        const session = publicAccount(fresh);
        return { token: prepared.token, account: session, value: session };
      });
    });
  }
  async function logout() {
    return withLock(async () => {
      const token = safeGet(AUTH_SESSION_KEY);
      if (!token) {
        current = null;
        return;
      }
      const hash = await sha256Hex(String(token), crypto);
      commitSync(data => {
        const account = data.accounts.find(item => item.sessionHash === hash);
        if (!account) return { skipWrite: true, clearToken: true, account: null };
        account.sessionHash = null;
        account.updatedAt = nowIso();
        return { clearToken: true, account: null };
      });
    });
  }
  async function deleteAccount(input = {}) {
    return withLock(async () => {
      const token = safeGet(AUTH_SESSION_KEY);
      if (!token) throw new AuthError('unauthenticated');
      const sessionHash = await sha256Hex(String(token), crypto);
      const record = liveAccount(readStore(), sessionHash);
      if (!record) throw new AuthError('deleted');
      if (!await verifyPassword(String(input.password ?? ''), record.password)) throw new AuthError('credentials');
      const stamp = nowIso();
      commitSync(data => {
        const fresh = data.accounts.find(account => account.id === record.id && !account.deletedAt);
        if (!fresh || fresh.password.hash !== record.password.hash) throw new AuthError(fresh ? 'conflict' : 'deleted');
        const wasAdmin = accountIsAdmin(fresh);
        fresh.deletedAt = stamp;
        fresh.status = 'deleted';
        fresh.sessionHash = null;
        fresh.updatedAt = stamp;
        if (wasAdmin && !data.accounts.some(accountIsAdmin)) {
          const rank = account => account.status === 'active' && account.role === 'member' ? 0 : account.status === 'pending' ? 1 : 2;
          const successor = data.accounts
            .filter(account => account.id !== fresh.id && !account.deletedAt && rank(account) < 2)
            .sort((left, right) => rank(left) - rank(right) || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))[0];
          if (successor) {
            successor.role = 'admin';
            successor.status = 'active';
            if (!successor.approvedAt) {
              successor.approvedBy = fresh.id;
              successor.approvedAt = stamp;
            }
            successor.updatedAt = stamp;
          }
        }
        return { clearToken: true, account: null };
      });
    });
  }
  async function changePassword(input = {}) {
    const currentPassword = String(input.currentPassword ?? '');
    const password = String(input.newPassword ?? '');
    if (input.confirmPassword !== password) throw new AuthError('password-mismatch');
    if (password.length < MIN_PASSWORD_LENGTH) throw new AuthError('password-too-short');
    if (password.length > 200) throw new AuthError('password-too-long');
    if (password === currentPassword) throw new AuthError('password-unchanged');
    return withLock(async () => {
      const token = safeGet(AUTH_SESSION_KEY);
      if (!token) throw new AuthError('unauthenticated-password');
      const sessionHash = await sha256Hex(String(token), crypto);
      const record = liveAccount(readStore(), sessionHash);
      if (!record) throw new AuthError('unauthenticated-password');
      if (!await verifyPassword(currentPassword, record.password)) throw new AuthError('password-wrong');
      const passwordRecord = await hashPassword(password);
      const prepared = await preparedSession();
      return commitSync(data => {
        const fresh = data.accounts.find(account => account.id === record.id && !account.deletedAt);
        if (!fresh || fresh.status === 'rejected' || fresh.status === 'deleted') throw new AuthError('deleted');
        if (fresh.password.hash !== record.password.hash || fresh.sessionHash !== record.sessionHash) throw new AuthError('conflict');
        fresh.password = passwordRecord;
        attachSession(data, fresh, prepared);
        const session = publicAccount(fresh);
        return { token: prepared.token, account: session, value: session };
      });
    });
  }
  async function createInvite() {
    return withLock(async () => {
      const token = safeGet(AUTH_SESSION_KEY);
      if (!token) throw new AuthError('forbidden');
      const sessionHash = await sha256Hex(String(token), crypto);
      const code = randomToken(crypto);
      const tokenHash = await sha256Hex(code, crypto);
      const stamp = now();
      return commitSync(data => {
        const admin = liveAccount(data, sessionHash);
        if (!accountIsAdmin(admin)) throw new AuthError('forbidden');
        const invite = {
          id: randomId(crypto),
          tokenHash,
          issuedBy: admin.id,
          createdAt: stamp.toISOString(),
          expiresAt: new Date(stamp.getTime() + inviteTtlMs).toISOString(),
          usedAt: null,
          usedBy: null,
        };
        data.invites.push(invite);
        const session = publicAccount(admin);
        return { account: session, value: { id: invite.id, code, expiresAt: invite.expiresAt } };
      });
    });
  }
  async function createUser(input = {}) {
    const email = normalizeEmail(input.email);
    const displayName = normalizeName(input.displayName);
    const password = String(input.password ?? '');
    if (input.confirmPassword !== password) throw new AuthError('password-mismatch');
    if (password.length < MIN_PASSWORD_LENGTH) throw new AuthError('password-too-short');
    if (password.length > 200) throw new AuthError('password-too-long');
    const role = input.role === 'admin' ? 'admin' : 'member';
    return withLock(async () => {
      const token = safeGet(AUTH_SESSION_KEY);
      if (!token) throw new AuthError('forbidden');
      const sessionHash = await sha256Hex(String(token), crypto);
      const passwordRecord = await hashPassword(password);
      const stamp = nowIso();
      return commitSync(data => {
        const admin = liveAccount(data, sessionHash);
        if (!accountIsAdmin(admin)) throw new AuthError('forbidden');
        if (data.accounts.some(account => account.email === email && !account.deletedAt)) throw new AuthError('email-taken');
        const record = {
          id: randomId(crypto),
          email,
          displayName,
          role,
          status: 'active',
          password: passwordRecord,
          sessionHash: null,
          createdAt: stamp,
          updatedAt: stamp,
          deletedAt: null,
          approvedBy: admin.id,
          approvedAt: stamp,
          rejectedAt: null,
          inviteId: null,
        };
        data.accounts.push(record);
        return { account: publicAccount(admin), value: publicAccount(record) };
      });
    });
  }
  async function updateUser(userId, input = {}) {
    const id = String(userId || '');
    const hasName = Object.hasOwn(input, 'displayName');
    const displayName = hasName ? normalizeName(input.displayName) : '';
    const role = input.role === 'admin' || input.role === 'member' ? input.role : '';
    const nextPassword = input.password ? String(input.password) : '';
    if (nextPassword && input.confirmPassword !== nextPassword) throw new AuthError('password-mismatch');
    if (nextPassword && nextPassword.length < MIN_PASSWORD_LENGTH) throw new AuthError('password-too-short');
    if (nextPassword.length > 200) throw new AuthError('password-too-long');
    if (!hasName && !role && !nextPassword) throw new AuthError('missing');
    return withLock(async () => {
      const token = safeGet(AUTH_SESSION_KEY);
      if (!token) throw new AuthError('forbidden');
      const sessionHash = await sha256Hex(String(token), crypto);
      const passwordRecord = nextPassword ? await hashPassword(nextPassword) : null;
      const stamp = nowIso();
      return commitSync(data => {
        const admin = liveAccount(data, sessionHash);
        if (!accountIsAdmin(admin)) throw new AuthError('forbidden');
        const target = data.accounts.find(account => account.id === id && !account.deletedAt && account.status !== 'deleted' && account.status !== 'rejected');
        if (!target) throw new AuthError('missing');
        if (passwordRecord && target.id === admin.id) throw new AuthError('forbidden');
        if (role && target.status !== 'active') throw new AuthError('forbidden');
        if (role === 'member' && accountIsAdmin(target) && data.accounts.filter(accountIsAdmin).length < 2) throw new AuthError('last-admin');
        if (hasName) target.displayName = displayName;
        if (role) target.role = role;
        if (passwordRecord) {
          target.password = passwordRecord;
          target.sessionHash = null;
        }
        target.updatedAt = stamp;
        const session = publicAccount(target.id === admin.id ? target : admin);
        return { account: session, value: publicAccount(target) };
      });
    });
  }
  async function removeUser(userId) {
    const id = String(userId || '');
    return withLock(async () => {
      const token = safeGet(AUTH_SESSION_KEY);
      if (!token) throw new AuthError('forbidden');
      const sessionHash = await sha256Hex(String(token), crypto);
      const stamp = nowIso();
      return commitSync(data => {
        const admin = liveAccount(data, sessionHash);
        if (!accountIsAdmin(admin)) throw new AuthError('forbidden');
        const target = data.accounts.find(account => account.id === id && !account.deletedAt && account.status !== 'deleted');
        if (!target) throw new AuthError('missing');
        if (target.id === admin.id) throw new AuthError('forbidden');
        if (accountIsAdmin(target) && data.accounts.filter(accountIsAdmin).length < 2) throw new AuthError('last-admin');
        target.deletedAt = stamp;
        target.status = 'deleted';
        target.sessionHash = null;
        target.updatedAt = stamp;
        return { account: publicAccount(admin), value: publicAccount(target) };
      });
    });
  }
  async function decide(userId, status) {
    return withLock(async () => {
      const token = safeGet(AUTH_SESSION_KEY);
      if (!token) throw new AuthError('forbidden');
      const sessionHash = await sha256Hex(String(token), crypto);
      const stamp = nowIso();
      return commitSync(data => {
        const admin = liveAccount(data, sessionHash);
        if (!accountIsAdmin(admin)) throw new AuthError('forbidden');
        const target = data.accounts.find(account => account.id === userId && !account.deletedAt);
        if (!target || target.status !== 'pending') throw new AuthError('missing');
        if (status === 'active') {
          target.role = 'member';
          target.status = 'active';
          target.approvedBy = admin.id;
          target.approvedAt = stamp;
        } else {
          target.status = 'rejected';
          target.rejectedAt = stamp;
          target.sessionHash = null;
        }
        target.updatedAt = stamp;
        return { account: publicAccount(admin), value: publicAccount(target) };
      });
    });
  }
  function snapshot() {
    const account = current ? { ...current } : null;
    if (!accountIsAdmin(account)) return { account, pending: [], unusedInvites: 0, directory: [] };
    const data = readStore();
    const at = now().getTime();
    const visible = data.accounts
      .filter(item => !item.deletedAt && item.status !== 'deleted')
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.email.localeCompare(right.email));
    return {
      account,
      pending: visible.filter(item => item.status === 'pending').map(publicAccount),
      directory: visible.map(publicAccount),
      unusedInvites: data.invites.filter(item => !item.usedAt && Date.parse(item.expiresAt) > at).length,
    };
  }
  return {
    signup, login, logout, deleteAccount, changePassword, createInvite, createUser, updateUser, removeUser,
    approve: userId => decide(userId, 'active'),
    reject: userId => decide(userId, 'rejected'),
    restore,
    current: () => current ? { ...current } : null,
    isAdmin: () => accountIsAdmin(current),
    hasActiveAdmin: () => hasActiveAdmin(),
    snapshot,
  };
}

function messageOf(error) {
  return error instanceof AuthError ? error.message : '다시 시도해 주세요.';
}

function focusNode(node) {
  if (typeof node?.focus === 'function') node.focus({ preventScroll: true });
}

function selectValue(select, value) {
  for (const option of select.options) option.selected = option.value === value;
}

function selectedValue(select) {
  return [...select.options].find(option => option.selected)?.value || 'member';
}

export function authAccountTarget(doc) {
  const heading = doc.querySelector('.atlas-canvas-heading');
  const header = doc.querySelector('.atlas-dashboard-header');
  const shell = doc.body?.dataset?.shell;
  const headingHidden = !heading || heading.hidden || Boolean(heading.closest('[hidden]'));
  if (shell !== 'dashboard' && heading && !headingHidden) return heading;
  if (header && !header.hidden) return header;
  if (heading && !headingHidden) return heading;
  if (header) return header;
  return doc.body || null;
}

export function mountAuthAccount(doc = globalThis.document, options = {}) {
  if (!doc?.createElement) throw new TypeError('document is required');
  const existing = doc.querySelector('[data-auth-account]');
  if (existing?.authAccountController && !options.auth && !options.storage) {
    existing.authAccountController.place();
    return existing.authAccountController;
  }
  const auth = options.auth || createAuthAccount({ storage: options.storage, crypto: options.crypto, now: options.now, iterations: options.iterations, inviteTtlMs: options.inviteTtlMs });
  const openers = new WeakMap();
  const viewports = [];
  let pending = Promise.resolve();
  let observer = null;
  let observed = null;
  let placing = false;
  const track = promise => { pending = Promise.resolve(promise); return pending; };
  const head = doc.head || doc.querySelector('head');
  if (head && !head.querySelector('link[data-auth-account-style]')) {
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.dataset.authAccountStyle = 'auth-account';
    link.href = new URL('./auth-account.css?v=1.7', import.meta.url).href;
    head.append(link);
  }
  const root = doc.createElement('div');
  root.className = 'auth-account';
  root.dataset.authAccount = 'account';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', '계정');
  const status = doc.createElement('span');
  status.className = 'auth-account-status';
  status.id = 'auth-account-status';
  status.hidden = true;

  function place() {
    const target = authAccountTarget(doc);
    if (!target) return;
    placing = true;
    if (root.parentElement !== target || target.lastElementChild !== root) target.append(root);
    placing = false;
    if (observed === target) return;
    observer?.disconnect();
    observed = target;
    const Observer = doc.defaultView?.MutationObserver || globalThis.MutationObserver;
    if (!Observer) return;
    observer = new Observer(() => {
      if (placing || root.parentElement !== target || target.lastElementChild === root) return;
      placing = true;
      target.append(root);
      placing = false;
    });
    observer.observe(target, { childList: true });
  }

  function actionButton(action, label) {
    let button = root.querySelector(`[data-auth-action="${action}"]`);
    if (!button) {
      button = doc.createElement('button');
      button.type = 'button';
      button.dataset.authAction = action;
      button.addEventListener('click', () => onAction(action, button));
      root.append(button);
    }
    if (label !== undefined) button.textContent = label;
    button.hidden = false;
    return button;
  }
  function focusAction(action) {
    const button = root.querySelector(`[data-auth-action="${action}"]`);
    if (button && !button.hidden) focusNode(button);
  }
  function render() {
    const account = auth.current();
    const visible = [];
    if (!account) {
      const accountButton = actionButton('account', '계정');
      accountButton.setAttribute('aria-haspopup', 'dialog');
      accountButton.setAttribute('aria-controls', 'auth-account-gate');
      visible.push(accountButton);
      status.hidden = true;
    } else {
      const menu = actionButton('menu');
      menu.classList.add('auth-account-name');
      const mark = doc.createElement('span');
      mark.className = 'auth-account-mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = ([...account.displayName.trim()][0] || '·').toUpperCase();
      const name = doc.createElement('span');
      name.className = 'auth-account-label';
      name.textContent = account.displayName;
      menu.replaceChildren(mark, name);
      menu.title = account.email;
      menu.setAttribute('aria-label', `${account.displayName} 프로필`);
      menu.setAttribute('aria-haspopup', 'dialog');
      menu.setAttribute('aria-controls', 'auth-account-menu');
      visible.push(menu);
      if (account.status === 'pending') {
        status.textContent = '승인 대기';
        status.hidden = false;
        menu.setAttribute('aria-describedby', status.id);
        visible.push(status);
      } else {
        status.hidden = true;
        status.textContent = '';
        menu.removeAttribute('aria-describedby');
      }
    }
    for (const node of root.querySelectorAll('[data-auth-action]')) if (!visible.includes(node)) node.hidden = true;
    for (const node of visible) root.append(node);
    if (menuDialog?.open || menuDialog?.hasAttribute('open')) renderMenu();
    if (usersDialog?.open || usersDialog?.hasAttribute('open')) renderUsers();
  }

  function dialogShell(id, title) {
    const dialog = doc.createElement('dialog');
    dialog.id = id;
    dialog.className = 'auth-account-dialog';
    dialog.setAttribute('aria-labelledby', `${id}-title`);
    const header = doc.createElement('header');
    const heading = doc.createElement('h2');
    heading.id = `${id}-title`;
    heading.textContent = title;
    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'auth-account-close';
    close.textContent = '닫기';
    close.setAttribute('aria-label', '닫기');
    close.addEventListener('click', () => closeDialog(dialog));
    header.append(heading, close);
    dialog.append(header);
    dialog.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); closeDialog(dialog); return; }
      if (event.key !== 'Tab') return;
      const nodes = [...dialog.querySelectorAll('button,input,select,textarea')].filter(node => !node.disabled && !node.hidden && !node.closest('[hidden]'));
      const first = nodes[0];
      const last = nodes.at(-1);
      if (!first || !last) return;
      const active = doc.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) { event.preventDefault(); focusNode(last); }
      else if (!event.shiftKey && (active === last || !dialog.contains(active))) { event.preventDefault(); focusNode(first); }
    });
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(dialog); });
    dialog.addEventListener('close', () => {
      for (const input of dialog.querySelectorAll('input')) {
        if (input.type !== 'hidden') input.value = '';
        if (input.dataset.authSecret === 'password') input.type = 'password';
        input.removeAttribute('aria-invalid');
      }
      for (const button of dialog.querySelectorAll('.auth-account-reveal')) {
        const label = button.getAttribute('aria-label')?.replace(/ (?:숨기기|표시)$/, '') || '비밀번호';
        button.textContent = '표시';
        button.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-label', `${label} 표시`);
      }
      for (const node of dialog.querySelectorAll('[data-auth-error], [data-auth-note], [data-auth-field-error]')) node.textContent = '';
      const block = dialog.querySelector('[data-auth-code-block]');
      if (block) block.hidden = true;
      const opener = openers.get(dialog);
      const usable = opener?.isConnected && !opener.hidden;
      focusNode(usable ? opener : root.querySelector('[data-auth-action="menu"]:not([hidden]), [data-auth-action="account"]:not([hidden])'));
    });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog);
    });
    doc.body.append(dialog);
    try { viewports.push(mountDialogViewport(dialog)); } catch { /* The viewport hook is optional. */ }
    return dialog;
  }
  function closeDialog(dialog) {
    if (!dialog.open && !dialog.hasAttribute('open')) return;
    if (typeof dialog.close === 'function') {
      try { dialog.close(); return; } catch { /* showModal was not used. */ }
    }
    dialog.removeAttribute('open');
    dialog.dispatchEvent(new Event('close'));
  }
  function openDialog(dialog, opener) {
    for (const other of doc.querySelectorAll('dialog.auth-account-dialog')) {
      if (other !== dialog) closeDialog(other);
    }
    openers.set(dialog, opener || null);
    for (const node of dialog.querySelectorAll('[data-auth-error], [data-auth-field-error]')) node.textContent = '';
    for (const input of dialog.querySelectorAll('input')) input.removeAttribute('aria-invalid');
    if (!(dialog.open || dialog.hasAttribute('open'))) {
      if (typeof dialog.showModal === 'function') {
        try { dialog.showModal(); } catch { dialog.setAttribute('open', ''); }
      } else dialog.setAttribute('open', '');
    }
    const preferred = [...dialog.querySelectorAll('[data-auth-initial]')].find(node => !node.disabled && !node.hidden && !node.closest('[hidden]'));
    const fallback = [...dialog.querySelectorAll('button,input')].find(node => !node.disabled && !node.hidden && !node.closest('[hidden]'));
    focusNode(preferred || fallback);
  }
  function field(form, { id, label, type, autocomplete, initial = false, hint = '' }) {
    const wrap = doc.createElement('div');
    wrap.className = 'auth-account-field';
    const text = doc.createElement('label');
    text.htmlFor = id;
    text.textContent = label;
    if (hint) {
      const hintText = doc.createElement('span');
      hintText.className = 'auth-account-hint';
      hintText.textContent = hint;
      text.append(' ', hintText);
    }
    const input = doc.createElement('input');
    input.id = id;
    input.name = id;
    input.type = type;
    input.autocomplete = autocomplete;
    input.spellcheck = false;
    if (type === 'email') input.inputMode = 'email';
    if (type === 'password') input.dataset.authSecret = 'password';
    if (initial) input.dataset.authInitial = '';
    const error = doc.createElement('p');
    error.id = `${id}-error`;
    error.className = 'auth-account-field-error';
    error.dataset.authFieldError = id;
    error.setAttribute('role', 'alert');
    input.setAttribute('aria-describedby', error.id);
    if (type === 'password') {
      const entry = doc.createElement('div');
      entry.className = 'auth-account-entry';
      const reveal = doc.createElement('button');
      reveal.type = 'button';
      reveal.className = 'auth-account-reveal';
      reveal.textContent = '표시';
      reveal.setAttribute('aria-pressed', 'false');
      reveal.setAttribute('aria-controls', id);
      reveal.setAttribute('aria-label', `${label} 표시`);
      reveal.addEventListener('click', () => {
        const shown = input.type === 'password';
        input.type = shown ? 'text' : 'password';
        reveal.textContent = shown ? '숨김' : '표시';
        reveal.setAttribute('aria-pressed', String(shown));
        reveal.setAttribute('aria-label', shown ? `${label} 숨기기` : `${label} 표시`);
      });
      entry.append(input, reveal);
      wrap.append(text, entry, error);
    } else wrap.append(text, input, error);
    form.append(wrap);
    return input;
  }
  function clearFormErrors(form, summary) {
    if (summary) summary.textContent = '';
    for (const node of form.querySelectorAll('[data-auth-field-error]')) node.textContent = '';
    for (const input of form.querySelectorAll('input')) input.removeAttribute('aria-invalid');
  }
  function showFormError(form, summary, fields, error) {
    clearFormErrors(form, summary);
    const text = messageOf(error);
    const input = fields?.[error?.code];
    const node = input ? form.querySelector(`#${input.id}-error`) : null;
    if (input && node) {
      input.closest('.auth-account-field').hidden = false;
      node.textContent = text;
      input.setAttribute('aria-invalid', 'true');
      return;
    }
    summary.textContent = text;
  }
  function watchSubmit(submit, work) {
    track((async () => {
      if (!submit.dataset.authLabel) submit.dataset.authLabel = submit.textContent;
      submit.disabled = true;
      submit.textContent = '확인 중';
      submit.setAttribute('aria-busy', 'true');
      try { await work(); }
      finally {
        submit.disabled = false;
        submit.textContent = submit.dataset.authLabel;
        submit.removeAttribute('aria-busy');
      }
    })());
  }
  function errorLine(parent) {
    const node = doc.createElement('p');
    node.dataset.authError = 'error';
    node.setAttribute('role', 'alert');
    parent.append(node);
    return node;
  }
  function formDialog(id, title, submitLabel) {
    const dialog = dialogShell(id, title);
    const form = doc.createElement('form');
    form.id = `${id}-form`;
    form.noValidate = true;
    dialog.append(form);
    const submit = doc.createElement('button');
    submit.type = 'submit';
    submit.className = 'auth-account-submit';
    submit.textContent = submitLabel;
    return { dialog, form, submit };
  }

  const login = formDialog('auth-login-dialog', '로그인', '로그인');
  const loginEmail = field(login.form, { id: 'auth-login-email', label: '이메일', type: 'email', autocomplete: 'username', initial: true });
  const loginPassword = field(login.form, { id: 'auth-login-password', label: '비밀번호', type: 'password', autocomplete: 'current-password' });
  const loginError = errorLine(login.form);
  const loginActions = doc.createElement('div');
  loginActions.className = 'auth-account-actions';
  loginActions.append(login.submit);
  login.form.append(loginActions);
  login.form.addEventListener('submit', event => {
    event.preventDefault();
    clearFormErrors(login.form, loginError);
    watchSubmit(login.submit, async () => {
      try {
        await auth.login({ email: loginEmail.value, password: loginPassword.value });
        render();
        closeDialog(login.form.closest('dialog'));
      } catch (error) { showFormError(login.form, loginError, { 'email-invalid': loginEmail }, error); }
    });
  });

  const signup = formDialog('auth-signup-dialog', '회원가입', '회원가입');
  const signupEmail = field(signup.form, { id: 'auth-signup-email', label: '이메일', type: 'email', autocomplete: 'username', initial: true });
  const signupName = field(signup.form, { id: 'auth-signup-name', label: '표시 이름', type: 'text', autocomplete: 'nickname' });
  const signupPassword = field(signup.form, { id: 'auth-signup-password', label: '비밀번호', type: 'password', autocomplete: 'new-password', hint: '12자 이상' });
  const signupConfirm = field(signup.form, { id: 'auth-signup-confirm', label: '비밀번호 확인', type: 'password', autocomplete: 'new-password' });
  const signupInvite = field(signup.form, { id: 'auth-signup-invite', label: '초대 코드', type: 'text', autocomplete: 'off' });
  const signupError = errorLine(signup.form);
  const signupActions = doc.createElement('div');
  signupActions.className = 'auth-account-actions';
  signupActions.append(signup.submit);
  signup.form.append(signupActions);
  signup.form.addEventListener('submit', event => {
    event.preventDefault();
    clearFormErrors(signup.form, signupError);
    watchSubmit(signup.submit, async () => {
      try {
        await auth.signup({
          email: signupEmail.value,
          displayName: signupName.value,
          password: signupPassword.value,
          confirmPassword: signupConfirm.value,
          inviteCode: signupInvite.value,
        });
        render();
        closeDialog(signup.form.closest('dialog'));
      } catch (error) {
        showFormError(signup.form, signupError, {
          'email-invalid': signupEmail,
          'email-taken': signupEmail,
          'name-required': signupName,
          'name-invalid': signupName,
          'password-too-short': signupPassword,
          'password-too-long': signupPassword,
          'password-mismatch': signupConfirm,
          'invite-required': signupInvite,
          'invite-invalid': signupInvite,
          'invite-expired': signupInvite,
          'invite-used': signupInvite,
        }, error);
      }
    });
  });

  const gate = dialogShell('auth-account-gate', '계정');
  const tabs = doc.createElement('div');
  tabs.className = 'auth-account-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', '로그인 또는 회원가입');
  const loginPanel = doc.createElement('div');
  loginPanel.id = 'auth-login-panel';
  loginPanel.setAttribute('role', 'tabpanel');
  const signupPanel = doc.createElement('div');
  signupPanel.id = 'auth-signup-panel';
  signupPanel.setAttribute('role', 'tabpanel');
  loginPanel.append(login.form);
  signupPanel.append(signup.form);
  function gateTab(id, label, panel, mode) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.id = id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', panel.id);
    button.textContent = label;
    panel.setAttribute('aria-labelledby', id);
    button.addEventListener('click', () => selectGate(mode));
    return button;
  }
  const loginTab = gateTab('auth-login-tab', '로그인', loginPanel, 'login');
  const signupTab = gateTab('auth-signup-tab', '회원가입', signupPanel, 'signup');
  tabs.append(loginTab, signupTab);
  gate.append(tabs, loginPanel, signupPanel);
  login.dialog.remove();
  signup.dialog.remove();
  function selectGate(mode) {
    const signupMode = mode === 'signup';
    loginPanel.hidden = signupMode;
    signupPanel.hidden = !signupMode;
    loginTab.setAttribute('aria-selected', String(!signupMode));
    signupTab.setAttribute('aria-selected', String(signupMode));
    loginTab.tabIndex = signupMode ? -1 : 0;
    signupTab.tabIndex = signupMode ? 0 : -1;
    if (!signupMode) return;
    let required = true;
    try { required = auth.hasActiveAdmin(); } catch { required = true; }
    signupInvite.required = required;
    signupInvite.setAttribute('aria-required', String(required));
    signupInvite.closest('.auth-account-field').hidden = !required;
  }
  selectGate('login');
  tabs.addEventListener('keydown', event => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const mode = event.key === 'ArrowRight' ? 'signup' : 'login';
    if ((mode === 'signup') === signupPanel.hidden) {
      event.preventDefault();
      selectGate(mode);
      (mode === 'signup' ? signupTab : loginTab).focus();
    }
  });

  const deletion = formDialog('auth-delete-dialog', '회원탈퇴', '회원탈퇴');
  deletion.submit.classList.add('auth-account-danger');
  const deleteConsequence = doc.createElement('p');
  deleteConsequence.className = 'auth-account-consequence';
  deleteConsequence.textContent = '탈퇴하면 로그아웃됩니다.';
  deletion.form.append(deleteConsequence);
  const deletePassword = field(deletion.form, { id: 'auth-delete-password', label: '비밀번호 확인', type: 'password', autocomplete: 'current-password', initial: true });
  const deleteError = errorLine(deletion.form);
  const deleteActions = doc.createElement('div');
  deleteActions.className = 'auth-account-actions';
  deleteActions.append(deletion.submit);
  deletion.form.append(deleteActions);
  deletion.form.addEventListener('submit', event => {
    event.preventDefault();
    clearFormErrors(deletion.form, deleteError);
    watchSubmit(deletion.submit, async () => {
      try {
        await auth.deleteAccount({ password: deletePassword.value });
        render();
        closeDialog(deletion.dialog);
      } catch (error) { showFormError(deletion.form, deleteError, { credentials: deletePassword }, error); }
    });
  });

  const menuDialog = dialogShell('auth-account-menu', '프로필');
  const menuPanel = doc.createElement('div');
  menuPanel.className = 'auth-account-panel';
  const profile = doc.createElement('section');
  profile.className = 'auth-account-profile';
  profile.setAttribute('aria-label', '프로필');
  const nameValue = doc.createElement('p');
  nameValue.className = 'auth-account-profile-name';
  nameValue.dataset.authName = 'name';
  const emailValue = doc.createElement('p');
  emailValue.className = 'auth-account-profile-mail';
  emailValue.dataset.authEmail = 'email';
  const facts = doc.createElement('dl');
  const roleRow = doc.createElement('div');
  const roleTerm = doc.createElement('dt');
  roleTerm.textContent = '권한';
  const roleValue = doc.createElement('dd');
  roleValue.dataset.authRole = 'role';
  roleRow.append(roleTerm, roleValue);
  const stateRow = doc.createElement('div');
  const stateTerm = doc.createElement('dt');
  stateTerm.textContent = '상태';
  const stateValue = doc.createElement('dd');
  stateValue.dataset.authState = 'state';
  stateRow.append(stateTerm, stateValue);
  facts.append(roleRow, stateRow);
  const menuPending = doc.createElement('p');
  menuPending.dataset.authPending = 'pending';
  menuPending.textContent = '승인 대기';
  menuPending.hidden = true;
  profile.append(nameValue, emailValue, facts, menuPending);
  const passwordForm = doc.createElement('form');
  passwordForm.id = 'auth-password-form';
  passwordForm.noValidate = true;
  const passwordTitle = doc.createElement('h3');
  passwordTitle.textContent = '비밀번호';
  const currentPassword = field(passwordForm, { id: 'auth-password-current', label: '현재 비밀번호', type: 'password', autocomplete: 'current-password' });
  const nextPassword = field(passwordForm, { id: 'auth-password-next', label: '새 비밀번호', type: 'password', autocomplete: 'new-password', hint: '12자 이상' });
  const confirmPassword = field(passwordForm, { id: 'auth-password-confirm', label: '새 비밀번호 확인', type: 'password', autocomplete: 'new-password' });
  const passwordError = errorLine(passwordForm);
  const passwordNote = doc.createElement('p');
  passwordNote.dataset.authNote = 'password';
  passwordNote.setAttribute('role', 'status');
  const passwordSubmit = doc.createElement('button');
  passwordSubmit.type = 'submit';
  passwordSubmit.className = 'auth-account-submit';
  passwordSubmit.textContent = '비밀번호 변경';
  const passwordActions = doc.createElement('div');
  passwordActions.className = 'auth-account-actions';
  passwordActions.append(passwordSubmit);
  passwordForm.prepend(passwordTitle);
  passwordForm.append(passwordNote, passwordActions);
  passwordForm.addEventListener('submit', event => {
    event.preventDefault();
    clearFormErrors(passwordForm, passwordError);
    passwordNote.textContent = '';
    watchSubmit(passwordSubmit, async () => {
      try {
        await auth.changePassword({
          currentPassword: currentPassword.value,
          newPassword: nextPassword.value,
          confirmPassword: confirmPassword.value,
        });
        currentPassword.value = '';
        nextPassword.value = '';
        confirmPassword.value = '';
        for (const input of passwordForm.querySelectorAll('input[data-auth-secret]')) input.type = 'password';
        for (const button of passwordForm.querySelectorAll('.auth-account-reveal')) {
          const label = button.getAttribute('aria-label')?.replace(/ (?:숨기기|표시)$/, '') || '비밀번호';
          button.textContent = '표시';
          button.setAttribute('aria-pressed', 'false');
          button.setAttribute('aria-label', `${label} 표시`);
        }
        passwordNote.textContent = '비밀번호를 바꿨습니다.';
        render();
      } catch (error) {
        passwordNote.textContent = '';
        showFormError(passwordForm, passwordError, {
          'password-wrong': currentPassword,
          'password-too-short': nextPassword,
          'password-too-long': nextPassword,
          'password-unchanged': nextPassword,
          'password-mismatch': confirmPassword,
        }, error);
      }
    });
  });
  const sessionError = errorLine(doc.createElement('div'));
  menuPanel.append(profile, passwordForm, sessionError);
  const menuActions = doc.createElement('div');
  menuActions.className = 'auth-account-menu-actions';
  const usersButton = doc.createElement('button');
  usersButton.type = 'button';
  usersButton.dataset.authUsers = 'users';
  usersButton.textContent = '사용자';
  usersButton.hidden = true;
  const menuLogout = doc.createElement('button');
  menuLogout.type = 'button';
  menuLogout.dataset.authAction = 'logout';
  menuLogout.textContent = '로그아웃';
  menuLogout.addEventListener('click', () => onAction('logout', menuLogout));
  const menuDelete = doc.createElement('button');
  menuDelete.type = 'button';
  menuDelete.dataset.authAction = 'delete';
  menuDelete.className = 'auth-account-danger';
  menuDelete.textContent = '회원탈퇴';
  menuDelete.setAttribute('aria-haspopup', 'dialog');
  menuDelete.addEventListener('click', () => onAction('delete', menuDelete));
  menuActions.append(usersButton, menuLogout, menuDelete);
  menuDialog.append(menuPanel, menuActions);
  function renderMenu() {
    const account = auth.snapshot().account;
    nameValue.textContent = account?.displayName || '';
    emailValue.textContent = account?.email || '';
    roleValue.textContent = account?.role === 'admin' ? '관리자' : account?.role === 'member' ? '회원' : account?.role === 'pending' ? '대기' : '';
    stateValue.textContent = account?.status === 'active' ? '활성' : account?.status === 'pending' ? '승인 대기' : '';
    menuPending.hidden = account?.status !== 'pending';
    usersButton.hidden = !auth.isAdmin();
  }

  const usersDialog = dialogShell('auth-users-dialog', '사용자');
  const usersPanel = doc.createElement('div');
  usersPanel.className = 'auth-account-panel';
  const userbar = doc.createElement('div');
  userbar.className = 'auth-account-userbar';
  const addButton = doc.createElement('button');
  addButton.type = 'button';
  addButton.dataset.authInitial = '';
  addButton.textContent = '추가';
  const inviteButton = doc.createElement('button');
  inviteButton.type = 'button';
  inviteButton.dataset.authInvite = 'invite';
  inviteButton.textContent = '초대 코드';
  const inviteCount = doc.createElement('p');
  inviteCount.hidden = true;
  userbar.append(addButton, inviteButton, inviteCount);
  const codeBlock = doc.createElement('div');
  codeBlock.dataset.authCodeBlock = 'code';
  codeBlock.hidden = true;
  const codeLabel = doc.createElement('label');
  const codeText = doc.createElement('span');
  codeText.textContent = '초대 코드';
  const codeInput = doc.createElement('input');
  codeInput.readOnly = true;
  codeInput.className = 'auth-account-code';
  codeInput.dataset.authCode = 'code';
  codeInput.setAttribute('aria-label', '초대 코드');
  codeInput.spellcheck = false;
  codeLabel.append(codeText, codeInput);
  const codeNote = doc.createElement('p');
  codeNote.textContent = '이 창을 닫으면 다시 표시되지 않습니다.';
  codeBlock.append(codeLabel, codeNote);
  const createForm = doc.createElement('form');
  createForm.id = 'auth-user-create';
  createForm.noValidate = true;
  createForm.hidden = true;
  const createEmail = field(createForm, { id: 'auth-user-email', label: '이메일', type: 'email', autocomplete: 'off' });
  const createName = field(createForm, { id: 'auth-user-name', label: '표시 이름', type: 'text', autocomplete: 'off' });
  const createPassword = field(createForm, { id: 'auth-user-password', label: '비밀번호', type: 'password', autocomplete: 'new-password', hint: '12자 이상' });
  const createConfirm = field(createForm, { id: 'auth-user-confirm', label: '비밀번호 확인', type: 'password', autocomplete: 'new-password' });
  const createRoleWrap = doc.createElement('div');
  createRoleWrap.className = 'auth-account-field';
  const createRoleLabel = doc.createElement('label');
  createRoleLabel.htmlFor = 'auth-user-role';
  createRoleLabel.textContent = '권한';
  const createRole = doc.createElement('select');
  createRole.id = 'auth-user-role';
  for (const [value, text] of [['member', '회원'], ['admin', '관리자']]) {
    const option = doc.createElement('option');
    option.value = value;
    option.textContent = text;
    createRole.append(option);
  }
  createRoleWrap.append(createRoleLabel, createRole);
  const createError = errorLine(createForm);
  const createActions = doc.createElement('div');
  createActions.className = 'auth-account-actions';
  const createSubmit = doc.createElement('button');
  createSubmit.type = 'submit';
  createSubmit.className = 'auth-account-submit';
  createSubmit.textContent = '추가';
  const createCancel = doc.createElement('button');
  createCancel.type = 'button';
  createCancel.textContent = '취소';
  createActions.append(createCancel, createSubmit);
  createName.closest('.auth-account-field').after(createRoleWrap);
  createForm.append(createError, createActions);
  const editForm = doc.createElement('form');
  editForm.id = 'auth-user-edit';
  editForm.noValidate = true;
  editForm.hidden = true;
  const editSubject = doc.createElement('p');
  editSubject.className = 'auth-account-user-mail';
  const editName = field(editForm, { id: 'auth-user-edit-name', label: '표시 이름', type: 'text', autocomplete: 'off' });
  const editRoleWrap = doc.createElement('div');
  editRoleWrap.className = 'auth-account-field';
  const editRoleLabel = doc.createElement('label');
  editRoleLabel.htmlFor = 'auth-user-edit-role';
  editRoleLabel.textContent = '권한';
  const editRole = doc.createElement('select');
  editRole.id = 'auth-user-edit-role';
  for (const [value, text] of [['member', '회원'], ['admin', '관리자']]) {
    const option = doc.createElement('option');
    option.value = value;
    option.textContent = text;
    editRole.append(option);
  }
  editRoleWrap.append(editRoleLabel, editRole);
  const editPassword = field(editForm, { id: 'auth-user-edit-password', label: '새 비밀번호', type: 'password', autocomplete: 'new-password', hint: '12자 이상' });
  const editConfirm = field(editForm, { id: 'auth-user-edit-confirm', label: '새 비밀번호 확인', type: 'password', autocomplete: 'new-password' });
  const editError = errorLine(editForm);
  const editActions = doc.createElement('div');
  editActions.className = 'auth-account-actions';
  const editSubmit = doc.createElement('button');
  editSubmit.type = 'submit';
  editSubmit.className = 'auth-account-submit';
  editSubmit.textContent = '저장';
  const editCancel = doc.createElement('button');
  editCancel.type = 'button';
  editCancel.textContent = '취소';
  editActions.append(editCancel, editSubmit);
  editName.closest('.auth-account-field').after(editRoleWrap);
  editForm.prepend(editSubject);
  editForm.append(editError, editActions);
  const removePanel = doc.createElement('div');
  removePanel.id = 'auth-user-remove';
  removePanel.hidden = true;
  const removeText = doc.createElement('p');
  removeText.className = 'auth-account-consequence';
  const removeActions = doc.createElement('div');
  removeActions.className = 'auth-account-actions';
  const removeConfirm = doc.createElement('button');
  removeConfirm.type = 'button';
  removeConfirm.className = 'auth-account-danger';
  removeConfirm.textContent = '탈퇴';
  const removeCancel = doc.createElement('button');
  removeCancel.type = 'button';
  removeCancel.textContent = '취소';
  removeActions.append(removeCancel, removeConfirm);
  removePanel.append(removeText, removeActions);
  const userList = doc.createElement('ul');
  userList.className = 'auth-account-users';
  userList.setAttribute('aria-label', '사용자');
  const usersError = errorLine(usersPanel);
  usersPanel.append(userbar, codeBlock, createForm, editForm, removePanel, userList, usersError);
  usersDialog.append(usersPanel);
  let userMode = 'list';
  let userTarget = '';
  function resetUserEditor() {
    userMode = 'list';
    userTarget = '';
    createForm.hidden = true;
    editForm.hidden = true;
    removePanel.hidden = true;
    usersError.textContent = '';
  }
  function accountMeta(account, selfId) {
    const roleText = account.role === 'admin' ? '관리자' : account.role === 'member' ? '회원' : '대기';
    const stateText = account.status === 'active' ? '활성' : account.status === 'pending' ? '승인 대기' : account.status === 'rejected' ? '거절' : '';
    return [roleText, stateText, account.id === selfId ? '본인' : ''].filter(Boolean).join(' · ');
  }
  function renderUsers() {
    const state = auth.snapshot();
    const selfId = state.account?.id || '';
    inviteCount.hidden = state.unusedInvites < 1;
    inviteCount.textContent = `미사용 초대 ${state.unusedInvites}개`;
    createForm.hidden = userMode !== 'create';
    editForm.hidden = userMode !== 'edit';
    removePanel.hidden = userMode !== 'remove';
    userList.replaceChildren();
    for (const account of state.directory) {
      const item = doc.createElement('li');
      const mark = doc.createElement('span');
      mark.className = 'auth-account-mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = ([...account.displayName.trim()][0] || '·').toUpperCase();
      const main = doc.createElement('div');
      main.className = 'auth-account-user-main';
      const name = doc.createElement('span');
      name.className = 'auth-account-user-name';
      name.textContent = account.displayName;
      const mail = doc.createElement('span');
      mail.className = 'auth-account-user-mail';
      mail.textContent = account.email;
      const meta = doc.createElement('span');
      meta.className = 'auth-account-user-meta';
      meta.textContent = accountMeta(account, selfId);
      main.append(name, mail, meta);
      const actions = doc.createElement('div');
      actions.className = 'auth-account-user-actions';
      if (account.status === 'pending') {
        for (const [text, decision] of [['승인', 'approve'], ['거절', 'reject']]) {
          const button = doc.createElement('button');
          button.type = 'button';
          button.textContent = text;
          button.dataset.authUser = account.id;
          button.dataset.authDecision = decision;
          actions.append(button);
        }
      }
      if (account.status === 'active' || account.status === 'pending') {
        const edit = doc.createElement('button');
        edit.type = 'button';
        edit.textContent = '수정';
        edit.dataset.authEdit = account.id;
        actions.append(edit);
      }
      if (account.id !== selfId) {
        const remove = doc.createElement('button');
        remove.type = 'button';
        remove.className = 'auth-account-danger';
        remove.textContent = '탈퇴';
        remove.dataset.authRemove = account.id;
        actions.append(remove);
      }
      item.append(mark, main, actions);
      userList.append(item);
    }
  }
  usersButton.addEventListener('click', () => {
    resetUserEditor();
    renderUsers();
    openDialog(usersDialog, root.querySelector('[data-auth-action="menu"]'));
  });
  addButton.addEventListener('click', () => {
    userMode = 'create';
    userTarget = '';
    editForm.hidden = true;
    removePanel.hidden = true;
    createForm.hidden = false;
    clearFormErrors(createForm, createError);
    focusNode(createEmail);
  });
  createCancel.addEventListener('click', () => { resetUserEditor(); renderUsers(); });
  editCancel.addEventListener('click', () => { resetUserEditor(); renderUsers(); });
  removeCancel.addEventListener('click', () => { resetUserEditor(); renderUsers(); });
  createForm.addEventListener('submit', event => {
    event.preventDefault();
    clearFormErrors(createForm, createError);
    watchSubmit(createSubmit, async () => {
      try {
        await auth.createUser({
          email: createEmail.value,
          displayName: createName.value,
          password: createPassword.value,
          confirmPassword: createConfirm.value,
          role: selectedValue(createRole),
        });
        createEmail.value = '';
        createName.value = '';
        createPassword.value = '';
        createConfirm.value = '';
        selectValue(createRole, 'member');
        resetUserEditor();
        renderUsers();
        render();
      } catch (error) {
        showFormError(createForm, createError, {
          'email-invalid': createEmail,
          'email-taken': createEmail,
          'name-required': createName,
          'name-invalid': createName,
          'password-too-short': createPassword,
          'password-too-long': createPassword,
          'password-mismatch': createConfirm,
        }, error);
      }
    });
  });
  editForm.addEventListener('submit', event => {
    event.preventDefault();
    clearFormErrors(editForm, editError);
    watchSubmit(editSubmit, async () => {
      const input = { displayName: editName.value };
      if (!editRoleWrap.hidden) input.role = selectedValue(editRole);
      if (!editPassword.closest('.auth-account-field').hidden && editPassword.value) {
        input.password = editPassword.value;
        input.confirmPassword = editConfirm.value;
      }
      try {
        await auth.updateUser(userTarget, input);
        resetUserEditor();
        if (!auth.isAdmin()) closeDialog(usersDialog);
        renderUsers();
        render();
      } catch (error) {
        showFormError(editForm, editError, {
          'name-required': editName,
          'name-invalid': editName,
          'password-too-short': editPassword,
          'password-too-long': editPassword,
          'password-mismatch': editConfirm,
        }, error);
      }
    });
  });
  userList.addEventListener('click', event => {
    const button = event.target.closest?.('button');
    if (!button || !userList.contains(button)) return;
    if (button.dataset.authEdit) {
      const account = auth.snapshot().directory.find(item => item.id === button.dataset.authEdit);
      if (!account) return;
      userMode = 'edit';
      userTarget = account.id;
      editSubject.textContent = account.email;
      editName.value = account.displayName;
      selectValue(editRole, account.role === 'admin' ? 'admin' : 'member');
      editRoleWrap.hidden = account.status !== 'active';
      const own = account.id === auth.current()?.id;
      editPassword.closest('.auth-account-field').hidden = own;
      editConfirm.closest('.auth-account-field').hidden = own;
      editPassword.value = '';
      editConfirm.value = '';
      clearFormErrors(editForm, editError);
      renderUsers();
      focusNode(editName);
      return;
    }
    if (button.dataset.authRemove) {
      const account = auth.snapshot().directory.find(item => item.id === button.dataset.authRemove);
      if (!account) return;
      userMode = 'remove';
      userTarget = account.id;
      removeText.textContent = `${account.displayName} 계정을 탈퇴시킵니다.`;
      renderUsers();
      focusNode(removeConfirm);
      return;
    }
    if (!button.dataset.authDecision) return;
    track((async () => {
      try {
        if (button.dataset.authDecision === 'approve') await auth.approve(button.dataset.authUser);
        else await auth.reject(button.dataset.authUser);
        usersError.textContent = '';
        renderUsers();
        render();
      } catch (error) { usersError.textContent = messageOf(error); }
    })());
  });
  removeConfirm.addEventListener('click', () => {
    track((async () => {
      removeConfirm.disabled = true;
      try {
        await auth.removeUser(userTarget);
        resetUserEditor();
        usersError.textContent = '';
        renderUsers();
        render();
      } catch (error) { usersError.textContent = messageOf(error); }
      finally { removeConfirm.disabled = false; }
    })());
  });
  inviteButton.addEventListener('click', () => {
    track((async () => {
      inviteButton.disabled = true;
      try {
        const created = await auth.createInvite();
        codeInput.value = created.code;
        codeBlock.hidden = false;
        usersError.textContent = '';
        renderUsers();
        focusNode(codeInput);
        codeInput.select?.();
      } catch (error) { usersError.textContent = messageOf(error); }
      finally { inviteButton.disabled = false; }
    })());
  });

  function onAction(action, opener) {
    if (action === 'account' || action === 'login') { selectGate('login'); openDialog(gate, opener); }
    else if (action === 'signup') { selectGate('signup'); openDialog(gate, opener); }
    else if (action === 'delete') openDialog(deletion.dialog, opener);
    else if (action === 'menu') { renderMenu(); openDialog(menuDialog, opener); }
    else if (action === 'logout') track(auth.logout().then(() => { closeDialog(menuDialog); render(); focusAction('account'); }).catch(error => { sessionError.textContent = messageOf(error); }));
  }

  const onStorage = event => {
    if (event.key && event.key !== AUTH_ACCOUNTS_KEY && event.key !== AUTH_SESSION_KEY) return;
    track(auth.restore().then(render));
  };
  doc.defaultView?.addEventListener?.('storage', onStorage);
  place();
  track(auth.restore().then(render));
  const controller = {
    root,
    auth,
    place,
    settled: () => pending,
    destroy() {
      observer?.disconnect();
      doc.defaultView?.removeEventListener?.('storage', onStorage);
      for (const viewport of viewports) viewport.destroy?.();
      for (const dialog of doc.querySelectorAll('dialog.auth-account-dialog')) dialog.remove();
      root.remove();
    },
  };
  root.authAccountController = controller;
  return controller;
}
