import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Request, Response } from "express";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger=new Logger(ApiExceptionFilter.name);
  catch(exception:unknown,host:ArgumentsHost):void {
    const context=host.switchToHttp(); const request=context.getRequest<Request & {requestId?:string}>(); const response=context.getResponse<Response>();
    const status=exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw=exception instanceof HttpException ? exception.getResponse() : null;
    const object=typeof raw === "object" && raw !== null ? raw as Record<string,unknown> : {};
    const message=typeof raw === "string" ? raw : Array.isArray(object.message) ? object.message.join(", ") : typeof object.message === "string" ? object.message : status===500 ? "An unexpected error occurred" : "Request failed";
    const code=typeof object.code === "string" ? object.code : status===500 ? "INTERNAL_ERROR" : `HTTP_${status}`;
    if(status>=500) this.logger.error(`${request.method} ${request.originalUrl} status=${status} requestId=${request.requestId ?? "unknown"}`,exception instanceof Error ? exception.stack : undefined);
    response.status(status).json({code,message,details:object.details ?? null,requestId:request.requestId ?? null});
  }
}
