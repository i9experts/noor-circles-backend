import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Error as MongooseError } from 'mongoose';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx      = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request  = ctx.getRequest<Request>();

    let status  = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, unknown>;
        if (Array.isArray(resObj['message'])) {
          message = 'Validation failed';
          errors  = resObj['message'];
        } else {
          message = (resObj['message'] as string) || message;
        }
      }
    } else if (exception instanceof MongooseError.CastError) {
      // Thrown when a route/query param (e.g. an :id) isn't a valid
      // ObjectId shape. Previously fell through to a raw 500 on every
      // :id route across every controller — this is the single choke
      // point that catches it everywhere at once instead of patching
      // each handler individually.
      status  = HttpStatus.BAD_REQUEST;
      message = `Invalid ${exception.path === '_id' ? 'id' : exception.path} format.`;
    } else if (exception instanceof MongooseError.ValidationError) {
      status  = HttpStatus.BAD_REQUEST;
      message = 'Validation failed';
      errors  = Object.values(exception.errors).map((e) => e.message);
    } else if (
      exception &&
      typeof exception === 'object' &&
      'code' in exception &&
      (exception as { code?: number }).code === 11000
    ) {
      // Mongo duplicate-key error, e.g. a unique index violated by a
      // race condition that slipped past an app-level pre-check.
      status  = HttpStatus.CONFLICT;
      message = 'A record with this value already exists.';
    } else {
      this.logger.error('Unhandled exception', exception);
    }

    response.status(status).json({
      success   : false,
      statusCode: status,
      message,
      ...(errors ? { errors } : {}),
      path     : request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
