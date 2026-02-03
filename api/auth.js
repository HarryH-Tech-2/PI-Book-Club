const JSONBIN_ID = '6980cc83d0ea881f409b6c12';
const JSONBIN_KEY = process.env.JSONBIN_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'pi-reading-club-secret-key-change-in-production';

// Simple JWT implementation (no external deps needed for Vercel)
function base64url(str) {
  return Buffer.from(str).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function createToken(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify({ ...payload, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })); // 7 days
  const crypto = require('crypto');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  try {
    const [header, body, signature] = token.split('.');
    const crypto = require('crypto');
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (signature !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// Simple password hashing (using crypto instead of bcrypt for serverless)
function hashPassword(password) {
  const crypto = require('crypto');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const crypto = require('crypto');
  const [salt, hash] = stored.split(':');
  const testHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return hash === testHash;
}

async function getData() {
  const response = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}/latest`, {
    headers: { 'X-Access-Key': JSONBIN_KEY }
  });
  const data = await response.json();
  return data.record || {};
}

async function saveData(data) {
  await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Access-Key': JSONBIN_KEY
    },
    body: JSON.stringify(data)
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action } = req.query;

  // Verify token endpoint
  if (req.method === 'GET' && action === 'verify') {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    return res.status(200).json({ user: { id: payload.id, email: payload.email, name: payload.name } });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = await getData();
    const users = data.users || [];

    // Register
    if (action === 'register') {
      const { email, password, name } = req.body;

      if (!email || !password || !name) {
        return res.status(400).json({ error: 'Email, password, and name are required' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      const emailLower = email.toLowerCase().trim();
      if (users.find(u => u.email === emailLower)) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      const newUser = {
        id: 'u' + Date.now(),
        email: emailLower,
        name: name.trim(),
        password: hashPassword(password),
        createdAt: new Date().toISOString()
      };

      users.push(newUser);
      await saveData({ ...data, users });

      const token = createToken({ id: newUser.id, email: newUser.email, name: newUser.name });
      return res.status(201).json({
        token,
        user: { id: newUser.id, email: newUser.email, name: newUser.name }
      });
    }

    // Login
    if (action === 'login') {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const emailLower = email.toLowerCase().trim();
      const user = users.find(u => u.email === emailLower);

      if (!user || !verifyPassword(password, user.password)) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = createToken({ id: user.id, email: user.email, name: user.name });
      return res.status(200).json({
        token,
        user: { id: user.id, email: user.email, name: user.name }
      });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (e) {
    console.error('Auth error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
