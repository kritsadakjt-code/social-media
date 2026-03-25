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
interface UserGrpcService {
  register(data: RegisterDto): Observable<UserResponse>;
  login(data: LoginDto): Observable<LoginResponse>;
}
