import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

interface WsJwtPayload {
  sub: string;
  username: string;
  role: string;
  iat?: number;
  exp?: number;
}

interface ClientSocketData {
  userId: string;
  username: string;
  role: string;
}

type AuthenticatedSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  ClientSocketData
>;

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: Socket = context
        .switchToWs()
        .getClient<AuthenticatedSocket>();

      const auth = client.handshake.auth as Record<string, unknown>;
      const headers = client.handshake.headers as Record<string, unknown>;

      let token: string | undefined;

      if (typeof auth?.token === 'string') {
        token = auth.token;
      } else if (typeof headers?.authorization === 'string') {
        token = headers.authorization.split(' ')[1];
      }

      if (!token) {
        // Log เก็บไว้ดูว่ามีใครพยายามยิง Socket มาแบบไม่มี Token
        this.logger.warn(
          `Connection attempt without token from socket: ${client.id}`,
        );
        throw new WsException('Unauthorized: Missing token');
      }

      const payload: WsJwtPayload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      client.data = {
        userId: payload.sub,
        username: payload.username,
        role: payload.role,
      };

      return true;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`WebSocket Auth Failed: ${error.message}`);
      } else {
        this.logger.error(`WebSocket Auth Failed with unknown error`, error);
      }

      throw new WsException('Unauthorized: Invalid or expired token');
    }
  }
}
