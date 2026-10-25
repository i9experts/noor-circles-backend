import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { SSE_METADATA } from '@nestjs/common/constants';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: true;
  message: string;
  data: T;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    // Server-sent events are written one by one by Nest; wrapping each in
    // { success, data } broke the client's `data.type` checks (BUG-43).
    if (Reflect.getMetadata(SSE_METADATA, ctx.getHandler())) return next.handle();
    return next.handle().pipe(
      map((body) => {
        // If the handler already returned { success, message, data }, pass through
        if (body && typeof body === 'object' && 'success' in body) return body;

        // If handler returned { message, ...rest }, wrap it
        if (body && typeof body === 'object' && 'message' in body) {
          const { message, ...data } = body;
          return {
            success: true as const,
            message: message as string,
            data: Object.keys(data).length > 0 ? data : null,
          };
        }

        // Generic wrap
        return { success: true as const, message: 'OK', data: body ?? null };
      }),
    );
  }
}
