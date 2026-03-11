import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  Response as ExpressResponse,
  Request as ExpressRequest,
} from 'express';
import { status as grpcStatus } from '@grpc/grpc-js';

// map status code grpc -> http
const grpcToHttpStatus: Record<number, number> = {
  [grpcStatus.OK]: HttpStatus.OK,
  [grpcStatus.INVALID_ARGUMENT]: HttpStatus.BAD_REQUEST, // 400
  [grpcStatus.UNAUTHENTICATED]: HttpStatus.UNAUTHORIZED, // 401
  [grpcStatus.PERMISSION_DENIED]: HttpStatus.FORBIDDEN, // 403
  [grpcStatus.NOT_FOUND]: HttpStatus.NOT_FOUND, // 404
  [grpcStatus.ALREADY_EXISTS]: HttpStatus.CONFLICT, // 409
  [grpcStatus.INTERNAL]: HttpStatus.INTERNAL_SERVER_ERROR, // 500
};
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

@Catch()
export class GlobalRpcExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<ExpressResponse>();
    const request = ctx.getRequest<ExpressRequest>();

    // กรณีมาจาก dto
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      let message = exception.message;

      // ใช้ Type Guard เช็คความปลอดภัยก่อนเข้าถึง Property
      if (isRecord(exceptionResponse)) {
        if (typeof exceptionResponse.message === 'string') {
          message = exceptionResponse.message;
        } else if (
          Array.isArray(exceptionResponse.message) &&
          exceptionResponse.message.length > 0 &&
          typeof exceptionResponse.message[0] === 'string'
        ) {
          message = exceptionResponse.message[0];
        }
      }

      return response.status(status).json({
        success: false,
        statusCode: status,
        message: message,
        timestamp: new Date().toISOString(),
        path: request.url,
      });
    }

    // กรณี error มาจาก Service หรือ Microservice
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (isRecord(exception)) {
      if (
        typeof exception.code === 'number' &&
        grpcToHttpStatus[exception.code]
      ) {
        status = grpcToHttpStatus[exception.code];
        message =
          typeof exception.details === 'string'
            ? exception.details
            : 'gRPC Error';
      }
      // กรณี Error จาก RabbitMQ หรือเป็น Object
      else {
        // จัดการเรื่อง Status
        if (typeof exception.status === 'number') {
          status = exception.status;
        } else if (
          isRecord(exception.error) &&
          typeof exception.error.status === 'number'
        ) {
          status = exception.error.status;
        }

        // จัดการเรื่อง Message
        if (typeof exception.message === 'string') {
          message = exception.message;
        } else if (
          isRecord(exception.error) &&
          typeof exception.error.message === 'string'
        ) {
          message = exception.error.message;
        }
      }
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message: message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
