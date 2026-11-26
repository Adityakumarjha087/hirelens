import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { toPublicUser, type PublicUser } from '../auth/auth.service';
import type { Paginated } from '../common/dto/pagination.dto';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import type { ListUsersQueryDto, UpdateUserDto } from './dto/users.dto';

export type AdminUserView = PublicUser & { isActive: boolean };

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListUsersQueryDto): Promise<Paginated<AdminUserView>> {
    const where: Prisma.UserWhereInput = {
      ...(q.role ? { role: q.role } : {}),
      ...(q.q
        ? {
            OR: [
              { email: { contains: q.q, mode: 'insensitive' } },
              { fullName: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items: items.map((u) => ({ ...toPublicUser(u), isActive: u.isActive })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto): Promise<AdminUserView> {
    if (id === actor.id && (dto.role !== undefined || dto.isActive === false)) {
      throw new BadRequestException('Admins cannot change their own role or deactivate themselves');
    }
    const exists = await this.prisma.user.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('User not found');
    const user = await this.prisma.user.update({ where: { id }, data: dto });
    if (dto.isActive === false || dto.role) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { ...toPublicUser(user), isActive: user.isActive };
  }
}
