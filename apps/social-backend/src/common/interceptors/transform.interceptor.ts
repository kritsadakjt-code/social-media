import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import {
  Response as ExpressResponse,
  Request as ExpressRequest,
} from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface StandardResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
  path: string;
  timestamp: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  StandardResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ):
    | Observable<StandardResponse<T>>
    | Promise<Observable<StandardResponse<T>>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse<ExpressResponse>();
    const request = ctx.getRequest<ExpressRequest>();

    return next.handle().pipe(
      map((payload: unknown): StandardResponse<T> => {
        const isObject = payload !== null && typeof payload === 'object';
        const resObj = isObject ? (payload as Record<string, unknown>) : {};

        return {
          success: response.statusCode >= 200 && response.statusCode < 300,
          statusCode: response.statusCode,
          message:
            typeof resObj.message === 'string' ? resObj.message : 'Success',
          data: (resObj.data !== undefined ? resObj.data : payload) as T,
          path: request.url,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
