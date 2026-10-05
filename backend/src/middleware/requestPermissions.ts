import type { NextFunction, Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';

export interface PermissionUser {
  id?: string;
  role: string;
  permissions: string[];
  isActive: boolean;
}

type UserDatabase = Pick<PrismaClient, 'user'>;
type UserSnapshot = { attachedUser: Request['user']; user: PermissionUser };
const authenticatedUsers = new WeakMap<Request, UserSnapshot>();

/** Only authentication can establish a trusted, current snapshot for this request. */
export function rememberAuthenticatedUser(req: Request): void {
  if (!req.user) return;
  authenticatedUsers.set(req, {
    attachedUser: req.user,
    user: { ...req.user, permissions: [...(req.user.permissions || [])], isActive: true },
  });
}

export function hasAnyPermission(permissions: readonly string[], keys: readonly string[]): boolean {
  return permissions.includes('*') || keys.some(key => (
    permissions.includes(key) || permissions.includes(key.split('.')[0])
  ));
}

export async function currentPermissionUser(req: Request, db: UserDatabase): Promise<PermissionUser | null> {
  if (!req.user) return null;
  const snapshot = authenticatedUsers.get(req);
  if (snapshot && snapshot.attachedUser === req.user && snapshot.user.id === req.user.id) {
    return snapshot.user;
  }
  const user = await db.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, role: true, permissions: true, isActive: true },
  });
  return user ? { ...user, permissions: user.permissions || [] } : null;
}

export async function requestHasAnyPermission(
  req: Request, db: UserDatabase, keys: readonly string[],
): Promise<boolean> {
  if (!req.user) return false;
  // Preserve the owner shortcut used by these routers. authenticate checks account activity first.
  if (req.user.role === 'owner') return true;
  const user = await currentPermissionUser(req, db);
  return !!user?.isActive && hasAnyPermission(user.permissions, keys);
}

interface PermissionGuardOptions {
  responseKey?: 'error' | 'detail';
  onError?: (error: unknown) => void;
}

export function createPermissionGuard(
  dbAccessor: () => UserDatabase, keys: readonly string[], options: PermissionGuardOptions = {},
) {
  const responseKey = options.responseKey || 'error';
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ [responseKey]: 'Unauthorized' });
    try {
      if (!await requestHasAnyPermission(req, dbAccessor(), keys)) {
        return res.status(403).json({ [responseKey]: 'Forbidden' });
      }
      return next();
    } catch (error) {
      options.onError?.(error);
      return res.status(500).json({ [responseKey]: 'Permission check failed' });
    }
  };
}
