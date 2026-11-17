// Keeps the logged-in user and token in localStorage.
const KEY = 'paanilink.session';

export function saveSession(session) {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export const getToken = () => getSession()?.token || null;
export const getUser = () => getSession()?.user || null;

export function updateUser(user) {
  const s = getSession();
  if (s) saveSession({ ...s, user });
}

export function clearSession() {
  localStorage.removeItem(KEY);
}
