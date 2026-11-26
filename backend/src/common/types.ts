import type { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  fullName: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  name: string;
}
