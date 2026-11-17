import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {
  AUTH_ACCOUNTS_KEY, AUTH_SESSION_KEY, INVITE_TTL_MS, MIN_PASSWORD_LENGTH, PBKDF2_ITERATIONS,
  createAuthAccount, mountAuthAccount,
} from '../dist/auth-account.js';

const PASS = 'correct-horse-battery';
const adminInput = {email: 'Admin@Example.com', displayName: '관리자', password: PASS, confirmPassword: PASS};

function memory() {
  const data = new Map();
  return {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(String(key), String(value)),
    removeItem: key => data.delete(key),
  };
}
function accounts(storage) {
  return JSON.parse(storage.getItem(AUTH_ACCOUNTS_KEY));
}
async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function dispatch(window, target, type, name) {
  const event = new window.Event(type, {bubbles: true, cancelable: true});
  if (name) Object.defineProperty(event, 'key', {value: name});
  target.dispatchEvent(event);
}
function page(html) {
  const {document, window} = parseHTML(`<html><head></head><body>${html}</body></html>`);
  const focus = {current: null};
  const create = document.createElement.bind(document);
  document.createElement = (tag, options) => {
    const node = create(tag, options);
    node.focus = () => { focus.current = node; };
    if (String(tag).toLowerCase() === 'dialog') {
      node.showModal = () => { node.open = true; node.setAttribute('open', ''); };
      node.close = () => {
        if (!node.open && !node.hasAttribute('open')) return;
        node.open = false;
        node.removeAttribute('open');
        node.dispatchEvent(new window.Event('close'));
      };
    }
    return node;
  };
  return {document, window, focus};
}
function visibleLabels(root) {
  return [...root.querySelectorAll('button')].filter(button => !button.hidden).map(button => button.textContent);
}

test('the first account becomes admin without an invite and only a password hash is stored', async () => {
  const storage = memory();
  const auth = createAuthAccount({storage, iterations: 1000});
  const account = await auth.signup(adminInput);
  assert.equal(account.role, 'admin');
  assert.equal(account.status, 'active');
  assert.equal(account.email, 'admin@example.com');
  assert.equal(account.displayName, '관리자');
  const saved = accounts(storage).accounts[0];
  const raw = storage.getItem(AUTH_ACCOUNTS_KEY);
  assert.equal(raw.includes(PASS), false);
  assert.equal(saved.password.algorithm, 'PBKDF2-SHA-256');
  assert.equal(saved.password.iterations, 1000);
  assert.notEqual(saved.password.hash, PASS);
  assert.notEqual(saved.password.salt, saved.password.hash);
  const token = storage.getItem(AUTH_SESSION_KEY);
  assert.equal(typeof token, 'string');
  assert.equal(token.length > 20, true);
  assert.equal(raw.includes(token), false);
  assert.equal(saved.sessionHash, await sha256(token));
  assert.equal(auth.isAdmin(), true);
});

test('production hashes use PBKDF2-SHA-256 with the published iteration count', async () => {
  const storage = memory();
  const auth = createAuthAccount({storage});
  await auth.signup(adminInput);
  assert.equal(accounts(storage).accounts[0].password.iterations, PBKDF2_ITERATIONS);
  assert.equal(PBKDF2_ITERATIONS >= 210000, true);
  assert.equal(MIN_PASSWORD_LENGTH, 12);
});

test('later signups need a one-time invite, and pending accounts cannot administer', async () => {
  const storage = memory();
  const start = new Date('2026-11-17T00:00:00.000Z');
  let clock = start;
  const auth = createAuthAccount({storage, iterations: 1000, now: () => new Date(clock)});
  await auth.signup(adminInput);
  await assert.rejects(() => auth.signup({email: 'next@example.com', displayName: '다음', password: PASS, confirmPassword: PASS}), error => error.code === 'session-active');
  const invite = await auth.createInvite();
  const raw = storage.getItem(AUTH_ACCOUNTS_KEY);
  assert.equal(raw.includes(invite.code), false);
  assert.equal(accounts(storage).invites[0].tokenHash, await sha256(invite.code));
  assert.equal(Date.parse(invite.expiresAt) - start.getTime(), INVITE_TTL_MS);
  await auth.logout();
  assert.equal(storage.getItem(AUTH_SESSION_KEY), null);
  await assert.rejects(() => auth.signup({email: 'next@example.com', displayName: '다음', password: PASS, confirmPassword: PASS}), error => error.code === 'invite-required');
  await assert.rejects(() => auth.signup({email: 'next@example.com', displayName: '다음', password: PASS, confirmPassword: PASS, inviteCode: 'missing-code'}), error => error.code === 'invite-invalid');
  clock = new Date(start.getTime() + INVITE_TTL_MS);
  await assert.rejects(() => auth.signup({email: 'next@example.com', displayName: '다음', password: PASS, confirmPassword: PASS, inviteCode: invite.code}), error => error.code === 'invite-expired');
  clock = new Date(start.getTime() + INVITE_TTL_MS - 1);
  const pending = await auth.signup({email: 'Next@Example.com', displayName: '<대기자>', password: PASS, confirmPassword: PASS, inviteCode: invite.code});
  assert.equal(pending.role, 'pending');
  assert.equal(pending.status, 'pending');
  assert.equal(pending.displayName, '<대기자>');
  assert.equal(auth.isAdmin(), false);
  await assert.rejects(() => auth.createInvite(), error => error.code === 'forbidden');
  await assert.rejects(() => auth.approve(pending.id), error => error.code === 'forbidden');
  await auth.logout();
  await assert.rejects(() => auth.signup({email: 'third@example.com', displayName: '셋', password: PASS, confirmPassword: PASS, inviteCode: invite.code}), error => error.code === 'invite-used');
  await assert.rejects(() => auth.login({email: 'next@example.com', password: 'wrong-password-value'}), error => error.code === 'credentials');
  const loggedIn = await auth.login({email: 'next@example.com', password: PASS});
  assert.equal(loggedIn.status, 'pending');
  await auth.logout();
  await auth.login(adminInput);
  await auth.approve(pending.id);
  await auth.logout();
  const member = await auth.login({email: 'next@example.com', password: PASS});
  assert.equal(member.role, 'member');
  assert.equal(member.status, 'active');
  assert.equal(auth.isAdmin(), false);
  await auth.logout();
  await auth.login(adminInput);
  const second = await auth.createInvite();
  await auth.logout();
  const other = await auth.signup({email: 'other@example.com', displayName: '다른', password: PASS, confirmPassword: PASS, inviteCode: second.code});
  await auth.logout();
  await auth.login(adminInput);
  await auth.reject(other.id);
  await auth.logout();
  await assert.rejects(() => auth.login({email: 'other@example.com', password: PASS}), error => error.code === 'rejected');
});

test('logout clears the session and deletion rejects a later login', async () => {
  const storage = memory();
  const auth = createAuthAccount({storage, iterations: 1000});
  await auth.signup(adminInput);
  await assert.rejects(() => auth.deleteAccount({password: 'not-the-password'}), error => error.code === 'credentials');
  assert.equal(auth.current().role, 'admin');
  await auth.deleteAccount({password: PASS});
  assert.equal(auth.current(), null);
  assert.equal(storage.getItem(AUTH_SESSION_KEY), null);
  const saved = accounts(storage).accounts[0];
  assert.equal(typeof saved.deletedAt, 'string');
  assert.equal(saved.status, 'deleted');
  assert.equal(saved.sessionHash, null);
  assert.equal(storage.getItem(AUTH_ACCOUNTS_KEY).includes(PASS), false);
  await assert.rejects(() => auth.login(adminInput), error => error.code === 'deleted');
  const replacement = await auth.signup({email: 'new@example.com', displayName: '새 관리자', password: PASS, confirmPassword: PASS});
  assert.equal(replacement.role, 'admin');
  await auth.logout();
  await assert.rejects(() => auth.signup({email: 'short@example.com', displayName: '짧음', password: 'short-pass', confirmPassword: 'short-pass'}), error => error.code === 'password-too-short');
});

test('the toolbar shows Korean account actions and keeps them on the visible top row', async () => {
  const storage = memory();
  const {document, window, focus} = page(`
    <header class="atlas-dashboard-header" hidden><h1 class="atlas-shell-heading">차트</h1></header>
    <header class="atlas-canvas-heading"><button id="atlas-display-options">설정</button></header>
  `);
  document.body.dataset.shell = 'chart';
  const ui = mountAuthAccount(document, {storage, iterations: 1000});
  await ui.settled();
  const heading = document.querySelector('.atlas-canvas-heading');
  assert.equal(heading.lastElementChild, ui.root);
  assert.equal(ui.root.previousElementSibling.id, 'atlas-display-options');
  const account = ui.root.querySelector('[data-auth-action="account"]');
  assert.equal(account.getAttribute('aria-label'), '계정');
  assert.equal(account.querySelector('.auth-account-mark svg') instanceof window.SVGElement, true);
  assert.equal(account.querySelector('.auth-account-label'), null);
  assert.equal(document.querySelector('link[data-auth-account-style]').href.endsWith('auth-account.css?v=1.10'), true);
  account.click();
  const dialog = document.querySelector('#auth-account-gate');
  assert.equal(dialog.open, true);
  assert.equal(dialog.querySelector('.auth-account-close').textContent, '닫기');
  dialog.querySelector('#auth-signup-tab').click();
  assert.equal(dialog.querySelector('#auth-signup-panel').hidden, false);
  dialog.querySelector('#auth-signup-email').value = 'Admin@Example.com';
  dialog.querySelector('#auth-signup-name').value = '관리자';
  dialog.querySelector('#auth-signup-password').value = PASS;
  dialog.querySelector('#auth-signup-confirm').value = PASS;
  dispatch(window, dialog.querySelector('#auth-signup-dialog-form'), 'submit');
  await ui.settled();
  assert.equal(dialog.open, false);
  const signedIn = ui.root.querySelector('[data-auth-action="menu"]');
  assert.equal(signedIn.querySelector('.auth-account-label').textContent, '관리자');
  assert.equal(signedIn.querySelector('.auth-account-mark').textContent, '관');
  assert.equal(signedIn.getAttribute('aria-label'), '관리자 프로필');
  assert.equal(signedIn.textContent.includes('<'), false);
  ui.root.querySelector('[data-auth-action="menu"]').click();
  document.querySelector('#auth-account-menu [data-auth-action="logout"]').click();
  await ui.settled();
  assert.equal(storage.getItem(AUTH_SESSION_KEY), null);
  assert.equal(focus.current, ui.root.querySelector('[data-auth-action="account"]'));
  const login = ui.root.querySelector('[data-auth-action="account"]');
  login.click();
  const loginDialog = document.querySelector('#auth-account-gate');
  loginDialog.querySelector('#auth-login-tab').click();
  loginDialog.querySelector('#auth-login-email').value = 'admin@example.com';
  loginDialog.querySelector('#auth-login-password').value = 'wrong-password-value';
  dispatch(window, loginDialog.querySelector('#auth-login-dialog-form'), 'submit');
  await ui.settled();
  assert.equal(loginDialog.querySelector('#auth-login-panel [data-auth-error]').textContent, '이메일 또는 비밀번호가 올바르지 않습니다.');
  const reveal = loginDialog.querySelector('[aria-controls="auth-login-password"]');
  reveal.click();
  assert.equal(loginDialog.querySelector('#auth-login-password').type, 'text');
  assert.equal(reveal.getAttribute('aria-pressed'), 'true');
  reveal.click();
  assert.equal(loginDialog.querySelector('#auth-login-password').type, 'password');
  dispatch(window, loginDialog, 'keydown', 'Escape');
  assert.equal(loginDialog.open, false);
  assert.equal(focus.current, login);
  document.body.dataset.shell = 'dashboard';
  document.querySelector('.atlas-dashboard-header').hidden = false;
  const section = document.createElement('section');
  section.hidden = true;
  section.append(heading);
  document.body.append(section);
  ui.place();
  assert.equal(ui.root.parentElement.className, 'atlas-dashboard-header');
  assert.equal(document.querySelector('.atlas-dashboard-header').lastElementChild, ui.root);
});

test('a pending account menu says 승인 대기 and an admin can approve from the same menu', async () => {
  const storage = memory();
  const auth = createAuthAccount({storage, iterations: 1000});
  await auth.signup(adminInput);
  const invite = await auth.createInvite();
  await auth.logout();
  await auth.signup({email: 'next@example.com', displayName: '대기자', password: PASS, confirmPassword: PASS, inviteCode: invite.code});
  const {document} = page('<header class="atlas-dashboard-header"><h1>자료</h1></header>');
  document.body.dataset.shell = 'dashboard';
  const ui = mountAuthAccount(document, {auth});
  await ui.settled();
  assert.equal(document.querySelector('.atlas-dashboard-header').lastElementChild, ui.root);
  assert.equal(ui.root.querySelector('.auth-account-status').textContent, '승인 대기');
  ui.root.querySelector('[data-auth-action="menu"]').click();
  const menu = document.querySelector('#auth-account-menu');
  assert.equal(menu.querySelector('[data-auth-pending]').textContent, '승인 대기');
  assert.equal(menu.querySelector('[data-auth-role]').textContent, '대기');
  assert.equal(menu.querySelector('[data-auth-state]').textContent, '승인 대기');
  assert.equal(menu.querySelector('[data-auth-users]').hidden, true);
  menu.querySelector('.auth-account-close').click();
  await auth.logout();
  await auth.login(adminInput);
  await ui.settled();
  ui.root.querySelector('[data-auth-action="menu"]').click();
  const adminMenu = document.querySelector('#auth-account-menu');
  assert.equal(adminMenu.querySelector('h2').textContent, '프로필');
  assert.equal(adminMenu.querySelector('[data-auth-name]').textContent, '관리자');
  assert.equal(adminMenu.querySelector('[data-auth-email]').textContent, 'admin@example.com');
  assert.equal(adminMenu.querySelector('[data-auth-role]').textContent, '관리자');
  assert.equal(adminMenu.querySelector('[data-auth-state]').textContent, '활성');
  assert.equal(adminMenu.querySelector('[data-auth-pending]').hidden, true);
  adminMenu.querySelector('[data-auth-users]').click();
  const users = document.querySelector('#auth-users-dialog');
  assert.equal(users.open, true);
  assert.equal(users.querySelector('h2').textContent, '사용자');
  assert.equal(users.querySelector('.auth-account-users').textContent.includes('대기자'), true);
  users.querySelector('[data-auth-invite]').click();
  await ui.settled();
  const code = users.querySelector('[data-auth-code]').value;
  assert.equal(code.length > 20, true);
  assert.equal(storage.getItem(AUTH_ACCOUNTS_KEY).includes(code), false);
  const pendingId = auth.snapshot().pending[0].id;
  users.querySelector(`[data-auth-decision="approve"][data-auth-user="${pendingId}"]`).click();
  await ui.settled();
  assert.equal(auth.snapshot().pending.length, 0);
  assert.equal(accounts(storage).accounts.find(account => account.id === pendingId).role, 'member');
});

test('password change keeps this session, rejects the old password, and stays on the account menu', async () => {
  const storage = memory();
  const next = 'correct-horse-battery-2';
  const {document, window} = page('<header class="atlas-canvas-heading"><button id="atlas-display-options">설정</button></header>');
  document.body.dataset.shell = 'chart';
  const ui = mountAuthAccount(document, {storage, iterations: 1000});
  await ui.settled();
  ui.root.querySelector('[data-auth-action="account"]').click();
  const gate = document.querySelector('#auth-account-gate');
  gate.querySelector('#auth-signup-tab').click();
  gate.querySelector('#auth-signup-email').value = adminInput.email;
  gate.querySelector('#auth-signup-name').value = adminInput.displayName;
  gate.querySelector('#auth-signup-password').value = PASS;
  gate.querySelector('#auth-signup-confirm').value = PASS;
  dispatch(window, gate.querySelector('#auth-signup-dialog-form'), 'submit');
  await ui.settled();
  const before = storage.getItem(AUTH_SESSION_KEY);
  ui.root.querySelector('[data-auth-action="menu"]').click();
  const menu = document.querySelector('#auth-account-menu');
  const form = menu.querySelector('#auth-password-form');
  form.querySelector('#auth-password-current').value = 'wrong-password-value';
  form.querySelector('#auth-password-next').value = next;
  form.querySelector('#auth-password-confirm').value = next;
  dispatch(window, form, 'submit');
  await ui.settled();
  assert.equal(form.querySelector('#auth-password-current-error').textContent, '현재 비밀번호가 올바르지 않습니다.');
  assert.equal(form.querySelector('#auth-password-current').getAttribute('aria-invalid'), 'true');
  assert.equal(storage.getItem(AUTH_SESSION_KEY), before);
  form.querySelector('#auth-password-current').value = PASS;
  form.querySelector('#auth-password-confirm').value = 'not-the-same-password';
  dispatch(window, form, 'submit');
  await ui.settled();
  assert.equal(form.querySelector('#auth-password-confirm-error').textContent, '비밀번호 확인이 일치하지 않습니다.');
  form.querySelector('#auth-password-confirm').value = next;
  dispatch(window, form, 'submit');
  await ui.settled();
  const after = storage.getItem(AUTH_SESSION_KEY);
  assert.equal(menu.open, true);
  assert.equal(form.querySelector('[data-auth-note]').textContent, '비밀번호를 바꿨습니다.');
  assert.notEqual(after, before);
  assert.equal(accounts(storage).accounts[0].sessionHash, await sha256(after));
  assert.equal(storage.getItem(AUTH_ACCOUNTS_KEY).includes(next), false);
  menu.querySelector('[data-auth-action="logout"]').click();
  await ui.settled();
  await assert.rejects(() => ui.auth.login({email: adminInput.email, password: PASS}), error => error.code === 'credentials');
  const loggedIn = await ui.auth.login({email: adminInput.email, password: next});
  assert.equal(loggedIn.role, 'admin');
});

test('a login that overlaps deletion cannot restore the deleted account', async () => {
  const storage = memory();
  const auth = createAuthAccount({storage, iterations: 1000});
  await auth.signup(adminInput);
  await auth.logout();
  let intercept = false;
  const subtle = crypto.subtle;
  const wrapped = {
    randomUUID: crypto.randomUUID?.bind(crypto),
    getRandomValues: values => crypto.getRandomValues(values),
    subtle: {
      digest: (...args) => subtle.digest(...args),
      importKey: (...args) => subtle.importKey(...args),
      deriveBits: async (...args) => {
        const bits = await subtle.deriveBits(...args);
        if (!intercept) return bits;
        intercept = false;
        const saved = accounts(storage);
        saved.accounts[0].status = 'deleted';
        saved.accounts[0].deletedAt = '2026-11-17T00:00:00.000Z';
        saved.accounts[0].sessionHash = null;
        storage.setItem(AUTH_ACCOUNTS_KEY, JSON.stringify(saved));
        storage.removeItem(AUTH_SESSION_KEY);
        return bits;
      },
    },
  };
  const reader = createAuthAccount({storage, crypto: wrapped, iterations: 1000});
  intercept = true;
  await assert.rejects(() => reader.login(adminInput), error => error.code === 'deleted');
  assert.equal(accounts(storage).accounts[0].status, 'deleted');
  assert.equal(typeof accounts(storage).accounts[0].deletedAt, 'string');
  assert.equal(storage.getItem(AUTH_SESSION_KEY), null);
  assert.equal(reader.current(), null);
});

test('deleting the last admin promotes the oldest active member', async () => {
  const storage = memory();
  const start = new Date('2026-11-17T00:00:00.000Z');
  let clock = start.getTime();
  const auth = createAuthAccount({storage, iterations: 1000, now: () => new Date(clock)});
  await auth.signup(adminInput);
  const invite = await auth.createInvite();
  await auth.logout();
  clock += 1000;
  await auth.signup({email: 'older@example.com', displayName: '이전', password: PASS, confirmPassword: PASS, inviteCode: invite.code});
  await auth.logout();
  await auth.login(adminInput);
  const newer = await auth.createInvite();
  await auth.logout();
  clock += 1000;
  await auth.signup({email: 'newer@example.com', displayName: '이후', password: PASS, confirmPassword: PASS, inviteCode: newer.code});
  await auth.logout();
  await auth.login(adminInput);
  await auth.approve(accounts(storage).accounts.find(account => account.email === 'older@example.com').id);
  await auth.approve(accounts(storage).accounts.find(account => account.email === 'newer@example.com').id);
  await auth.deleteAccount({password: PASS});
  const saved = accounts(storage).accounts;
  assert.equal(saved.find(account => account.email === 'admin@example.com').status, 'deleted');
  assert.equal(saved.find(account => account.email === 'older@example.com').role, 'admin');
  assert.equal(saved.find(account => account.email === 'newer@example.com').role, 'member');
  await assert.rejects(() => auth.signup({email: 'stranger@example.com', displayName: '외부', password: PASS, confirmPassword: PASS}), error => error.code === 'invite-required');
});

test('deleting the last admin activates the oldest pending account instead of a later signup', async () => {
  const storage = memory();
  const start = new Date('2026-11-17T00:00:00.000Z');
  let clock = start.getTime();
  const auth = createAuthAccount({storage, iterations: 1000, now: () => new Date(clock)});
  await auth.signup(adminInput);
  const invite = await auth.createInvite();
  await auth.logout();
  clock += 1000;
  await auth.signup({email: 'older@example.com', displayName: '이전', password: PASS, confirmPassword: PASS, inviteCode: invite.code});
  await auth.logout();
  await auth.login(adminInput);
  const newer = await auth.createInvite();
  await auth.logout();
  clock += 1000;
  await auth.signup({email: 'newer@example.com', displayName: '이후', password: PASS, confirmPassword: PASS, inviteCode: newer.code});
  await auth.logout();
  await auth.login(adminInput);
  await auth.deleteAccount({password: PASS});
  const saved = accounts(storage).accounts;
  assert.equal(saved.find(account => account.email === 'older@example.com').role, 'admin');
  assert.equal(saved.find(account => account.email === 'older@example.com').status, 'active');
  assert.equal(saved.find(account => account.email === 'newer@example.com').status, 'pending');
  await assert.rejects(() => auth.signup({email: 'stranger@example.com', displayName: '외부', password: PASS, confirmPassword: PASS}), error => error.code === 'invite-required');
  const successor = await auth.login({email: 'older@example.com', password: PASS});
  assert.equal(successor.role, 'admin');
});

test('an admin creates, updates, and removes another account without replacing the admin session', async () => {
  const storage = memory();
  const next = 'correct-horse-battery-2';
  const {document, window} = page('<header class="atlas-canvas-heading"></header>');
  document.body.dataset.shell = 'chart';
  const ui = mountAuthAccount(document, {storage, iterations: 1000});
  await ui.settled();
  ui.root.querySelector('[data-auth-action="account"]').click();
  const gate = document.querySelector('#auth-account-gate');
  gate.querySelector('#auth-signup-tab').click();
  gate.querySelector('#auth-signup-email').value = adminInput.email;
  gate.querySelector('#auth-signup-name').value = adminInput.displayName;
  gate.querySelector('#auth-signup-password').value = PASS;
  gate.querySelector('#auth-signup-confirm').value = PASS;
  dispatch(window, gate.querySelector('#auth-signup-dialog-form'), 'submit');
  await ui.settled();
  const token = storage.getItem(AUTH_SESSION_KEY);
  const auth = ui.auth;
  const created = await auth.createUser({email: 'member@example.com', displayName: '회원', password: PASS, confirmPassword: PASS, role: 'member'});
  assert.equal(created.role, 'member');
  assert.equal(created.status, 'active');
  assert.equal(storage.getItem(AUTH_SESSION_KEY), token);
  assert.equal(storage.getItem(AUTH_ACCOUNTS_KEY).includes(PASS), false);
  await assert.rejects(() => auth.updateUser(auth.current().id, {role: 'member'}), error => error.code === 'last-admin');
  await assert.rejects(() => auth.removeUser(auth.current().id), error => error.code === 'forbidden');
  ui.root.querySelector('[data-auth-action="menu"]').click();
  document.querySelector('[data-auth-users]').click();
  const users = document.querySelector('#auth-users-dialog');
  assert.equal(users.querySelector('h2').textContent, '사용자');
  assert.equal(users.querySelector('.auth-account-users').textContent.includes('본인'), true);
  const edit = [...users.querySelectorAll('[data-auth-edit]')].find(button => button.dataset.authEdit === created.id);
  edit.click();
  users.querySelector('#auth-user-edit-name').value = '회원 둘';
  for (const option of users.querySelector('#auth-user-edit-role').options) option.selected = option.value === 'admin';
  users.querySelector('#auth-user-edit-password').value = next;
  users.querySelector('#auth-user-edit-confirm').value = next;
  dispatch(window, users.querySelector('#auth-user-edit'), 'submit');
  await ui.settled();
  assert.equal(storage.getItem(AUTH_SESSION_KEY), token);
  const saved = accounts(storage).accounts.find(account => account.id === created.id);
  assert.equal(saved.displayName, '회원 둘');
  assert.equal(saved.role, 'admin');
  assert.equal(saved.sessionHash, null);
  users.querySelector('[data-auth-initial]').click();
  users.querySelector('#auth-user-email').value = 'third@example.com';
  users.querySelector('#auth-user-name').value = '셋째';
  users.querySelector('#auth-user-password').value = PASS;
  users.querySelector('#auth-user-confirm').value = 'different-password';
  dispatch(window, users.querySelector('#auth-user-create'), 'submit');
  await ui.settled();
  assert.equal(users.querySelector('#auth-user-confirm-error').textContent, '비밀번호 확인이 일치하지 않습니다.');
  users.querySelector('#auth-user-confirm').value = PASS;
  dispatch(window, users.querySelector('#auth-user-create'), 'submit');
  await ui.settled();
  const third = auth.snapshot().directory.find(account => account.email === 'third@example.com');
  users.querySelector(`[data-auth-remove="${third.id}"]`).click();
  users.querySelector('#auth-user-remove .auth-account-danger').click();
  await ui.settled();
  assert.equal(auth.snapshot().directory.some(account => account.email === 'third@example.com'), false);
  await auth.logout();
  await assert.rejects(() => auth.login({email: 'third@example.com', password: PASS}), error => error.code === 'deleted');
  await assert.rejects(() => auth.login({email: 'member@example.com', password: PASS}), error => error.code === 'credentials');
  const member = await auth.login({email: 'member@example.com', password: next});
  assert.equal(member.role, 'admin');
  assert.equal(member.displayName, '회원 둘');
  const original = accounts(storage).accounts.find(account => account.email === 'admin@example.com');
  await auth.updateUser(original.id, {role: 'member'});
  await auth.deleteAccount({password: next});
  assert.equal(accounts(storage).accounts.find(account => account.id === original.id).role, 'admin');
  assert.equal(accounts(storage).accounts.find(account => account.email === 'member@example.com').status, 'deleted');
});

test('logout keeps the current session when the account record cannot be saved', async () => {
  const storage = memory();
  const auth = createAuthAccount({storage, iterations: 1000});
  await auth.signup(adminInput);
  const token = storage.getItem(AUTH_SESSION_KEY);
  const setItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    if (key === AUTH_ACCOUNTS_KEY) throw new Error('full');
    setItem(key, value);
  };
  await assert.rejects(() => auth.logout(), error => error.code === 'storage');
  assert.equal(storage.getItem(AUTH_SESSION_KEY), token);
  assert.equal(auth.current().role, 'admin');
  storage.setItem = setItem;
  const revived = createAuthAccount({storage, iterations: 1000});
  assert.equal((await revived.restore()).role, 'admin');
});

test('narrow screens keep a 44px target and desktop controls stay compact', () => {
  const css = readFileSync(new URL('../dist/auth-account.css', import.meta.url), 'utf8');
  const {document} = parseHTML('<html><head></head><body></body></html>');
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
  const desktop = [...style.sheet.cssRules].find(rule => rule.selectorText === '.auth-account button');
  assert.equal(desktop.style.getPropertyValue('min-height'), '28px');
  const mobile = [...style.sheet.cssRules].filter(rule => rule.type === 4 && rule.media.mediaText.includes('max-width:620px')).flatMap(rule => [...rule.cssRules]);
  const target = mobile.find(rule => rule.selectorText === '.auth-account button, .auth-account-name');
  assert.equal(target.style.getPropertyValue('min-height'), '44px');
  assert.equal(target.style.getPropertyValue('min-width'), '44px');
  assert.equal(css.includes('backdrop-filter'), false);
  assert.equal(css.includes('filter: blur'), false);
});

test('chart chrome and the shell mount the same account control without pretending to lock data', () => {
  const chrome = readFileSync(new URL('../dist/workbench-chrome.js', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('../dist/atlas-shell.js', import.meta.url), 'utf8');
  const center = readFileSync(new URL('../dist/center-workbench.js', import.meta.url), 'utf8');
  const module = readFileSync(new URL('../dist/auth-account.js', import.meta.url), 'utf8');
  const appended = chrome.indexOf('heading.append(symbol,frequency');
  const mounted = chrome.indexOf('mountAuthAccount(document)');
  assert.equal(appended > -1 && mounted > appended, true);
  assert.match(shell, /atlas-canvas-heading/);
  assert.match(shell, /mountAuthAccount\(document\)/);
  assert.match(center, /:not\(\[data-auth-action\]\)/);
  assert.match(center, /\.auth-account/);
  assert.equal(module.includes('accounts.google.com'), true);
  assert.equal(module.includes('id_token=${'), false);
  assert.match(module, /method: 'POST'/);
  assert.match(module, /referrerPolicy: 'no-referrer'/);
  assert.match(module, /Static \/data JSON stays public/);
  assert.equal(module.includes('backdrop-filter'), false);
  assert.equal(module.includes("filter: 'blur") || module.includes('filter: blur'), false);
});

test('extra heading siblings stay behind the account control', async () => {
  const {document} = page('<header class="atlas-canvas-heading"><button id="atlas-display-options">설정</button></header>');
  document.body.dataset.shell = 'chart';
  const ui = mountAuthAccount(document, {storage: memory(), iterations: 1000});
  await ui.settled();
  const heading = document.querySelector('.atlas-canvas-heading');
  const extra = document.createElement('button');
  extra.className = 'mobile-workbench-button';
  heading.append(extra);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(heading.lastElementChild, ui.root);
});
