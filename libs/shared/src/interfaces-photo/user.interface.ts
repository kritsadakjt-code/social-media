import { Observable } from 'rxjs';
import { RegisterDto } from '../dto/users/register.dto';
import { LoginDto } from '../dto/users/login.dto';

export interface UserResponse {
  id: string;
  username: string;
  email: string;
  role: string;
  bio: string;
  avatarUrl: string;
}

export interface LoginResponse {
  accessToken: string;
  user: UserResponse;
}

export interface UserGrpcService {
  register(data: RegisterDto): Observable<UserResponse>;
  login(data: LoginDto): Observable<LoginResponse>;
  getUser(data: { id: string }): Observable<UserResponse>;
  updateUser(data: {
    id: string;
    bio?: string;
    avatarUrl?: string;
  }): Observable<UserResponse>;
  deleteUser(data: { id: string }): Observable<{ success: boolean }>;
}
