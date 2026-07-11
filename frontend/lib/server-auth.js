import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getSupabaseAdmin } from '@/lib/supabase';

const PASSWORD_HASH_PREFIX = 'scrypt';
export const USER_ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  TEAM_MEMBER: 'team_member'
};

export function normalizeRole(role) {
  return Object.values(USER_ROLES).includes(role) ? role : USER_ROLES.TEAM_MEMBER;
}

export function isPrivilegedRole(role) {
  return [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN].includes(normalizeRole(role));
}

export function isSuperAdminRole(role) {
  return normalizeRole(role) === USER_ROLES.SUPER_ADMIN;
}

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'your-secret-key-change-in-production') {
    throw new Error('JWT_SECRET must be set to a strong secret');
  }
  return secret;
}

export function signToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: normalizeRole(user.role) },
    getJwtSecret(),
    { expiresIn: '7d' }
  );
}

export function getAuthFromRequest(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, getJwtSecret());
    if (!decoded.userId) return null;
    return {
      userId: decoded.userId,
      email: decoded.email || null,
      role: normalizeRole(decoded.role)
    };
  } catch {
    return null;
  }
}

export function getUserIdFromRequest(request) {
  return getAuthFromRequest(request)?.userId || null;
}

export async function getUserAccessFromRequest(request) {
  const auth = getAuthFromRequest(request);
  if (!auth) return null;

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, email, role')
      .eq('id', auth.userId)
      .single();

    if (!user) return auth;

    return {
      ...auth,
      email: user.email || auth.email,
      role: normalizeRole(user.role)
    };
  } catch {
    return auth;
  }
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${PASSWORD_HASH_PREFIX}$${salt}$${hash}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash) return { valid: false, needsRehash: false };

  if (storedHash.startsWith(`${PASSWORD_HASH_PREFIX}$`)) {
    const [, salt, hash] = storedHash.split('$');
    if (!salt || !hash) return { valid: false, needsRehash: false };

    const computed = crypto.scryptSync(password, salt, 64);
    const stored = Buffer.from(hash, 'hex');
    if (stored.length !== computed.length) return { valid: false, needsRehash: false };

    return {
      valid: crypto.timingSafeEqual(stored, computed),
      needsRehash: false
    };
  }

  // Legacy migration path for the old sha256(password + JWT_SECRET) format.
  const legacyHash = crypto
    .createHash('sha256')
    .update(password + getJwtSecret())
    .digest('hex');

  if (legacyHash.length !== storedHash.length) {
    return { valid: false, needsRehash: false };
  }

  return {
    valid: crypto.timingSafeEqual(Buffer.from(legacyHash), Buffer.from(storedHash)),
    needsRehash: true
  };
}
