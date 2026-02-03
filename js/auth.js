// ── PI Reading Club Authentication Module ──

const AUTH_TOKEN_KEY = 'pi-reading-club-token';
const AUTH_USER_KEY = 'pi-reading-club-user';

// Get current user from localStorage
function getCurrentUser() {
  const userStr = localStorage.getItem(AUTH_USER_KEY);
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

// Get auth token
function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

// Check if user is logged in
function isLoggedIn() {
  return !!getAuthToken() && !!getCurrentUser();
}

// Save auth data
function saveAuth(token, user) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

// Clear auth data (logout)
function clearAuth() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

// Verify token with server
async function verifyToken() {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const res = await fetch('/api/auth?action=verify', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      clearAuth();
      return null;
    }
    const data = await res.json();
    // Update cached user data
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
    return data.user;
  } catch {
    return getCurrentUser(); // Fallback to cached if server unavailable
  }
}

// Register new user
async function register(email, password, name) {
  const res = await fetch('/api/auth?action=register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Registration failed');
  }
  saveAuth(data.token, data.user);
  return data.user;
}

// Login user
async function login(email, password) {
  const res = await fetch('/api/auth?action=login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Login failed');
  }
  saveAuth(data.token, data.user);
  return data.user;
}

// Logout user
function logout() {
  clearAuth();
  window.location.href = '/';
}

// Update nav UI based on auth state
function updateNavAuth() {
  const navLinks = document.querySelector('.nav-links');
  if (!navLinks) return;

  // Remove existing auth elements
  const existingAuth = navLinks.querySelector('.nav-auth');
  if (existingAuth) existingAuth.remove();

  const user = getCurrentUser();
  const authHtml = document.createElement('li');
  authHtml.className = 'nav-auth';

  if (user) {
    authHtml.innerHTML = `
      <span style="color: var(--gray-600); font-size: 0.9rem; margin-right: 0.5rem;">
        Hi, <strong style="color: var(--green-700);">${escapeHtml(user.name)}</strong>
      </span>
      <a href="#" onclick="logout(); return false;" style="color: var(--gray-500);">Logout</a>
    `;
  } else {
    authHtml.innerHTML = `
      <a href="login.html" style="color: var(--green-600); font-weight: 600;">Login</a>
    `;
  }
  navLinks.appendChild(authHtml);
}

// Escape HTML helper
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize auth on page load
document.addEventListener('DOMContentLoaded', () => {
  updateNavAuth();
});
