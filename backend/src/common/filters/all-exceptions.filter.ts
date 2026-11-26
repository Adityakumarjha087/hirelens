import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
  path: string;
  requestId?: string;
  timestamp: string;
}

/** Normalises every error into one JSON shape and never leaks internals for 5xx. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();
    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') message = body;
      else {
        const b = body as { message?: string | string[]; details?: unknown };
        if (Array.isArray(b.message)) {
          message = 'Validation failed';
          details = b.message;
        } else {
          message = b.message ?? exception.message;
          details = b.details;
        }
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        message = 'Resource already exists';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'Resource not found';
      }
    }

    if (status >= 500) {
      this.logger.error(
        { err: exception, path: req.url, requestId: req.id },
        exception instanceof Error ? exception.message : 'Unhandled error',
      );
    }
    const payload: ErrorBody = {
      statusCode: status,
      error: (HttpStatus as Record<number, string>)[status] ?? 'Error',
      message,
      path: req.url,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    };
    if (details !== undefined) payload.details = details;
    res.status(status).json(payload);
  }
}
