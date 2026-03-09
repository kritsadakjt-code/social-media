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

interface MicroserviceErrorResponse {
  status?: unknown;
  message?: unknown;
  error?: {
    status?: unknown;
    message?: unknown;
  };
}

@Catch()
export class GlobalRpcExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();

    const response = ctx.getResponse<ExpressResponse>();
    const request = ctx.getRequest<ExpressRequest>();

    // กรณี error มาจาก dto
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      let message: string = exception.message;

      if (exceptionResponse !== null && typeof exceptionResponse === 'object') {
        const resObj = exceptionResponse as Record<string, unknown>;

        if (typeof resObj.message === 'string') {
          message = resObj.message;
        } else if (Array.isArray(resObj.message) && resObj.message.length > 0) {
          message = String(resObj.message[0]);
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

    // กรณี error มาจาก service
    const isObjectError = exception !== null && typeof exception === 'object';
    const errorObj = isObjectError
      ? (exception as MicroserviceErrorResponse)
      : {};

    // chk status
    const status =
      typeof errorObj.status === 'number'
        ? errorObj.status
        : typeof errorObj.error?.status === 'number'
          ? errorObj.error?.status
          : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      typeof errorObj.message === 'string'
        ? errorObj.message
        : typeof errorObj.error?.message === 'string'
          ? errorObj.error?.message
          : 'Internal server error';

    response.status(status).json({
      success: false,
      statusCode: status,
      message: message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
