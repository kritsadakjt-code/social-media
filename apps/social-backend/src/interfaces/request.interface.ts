import { Request } from 'express';

export interface AuthUserPayload {
  userId: string;
  username: string;
  role: string;
}

export interface RequestWithUser extends Request {
  user: AuthUserPayload;
}
