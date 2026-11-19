import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, of, tap } from 'rxjs';
export interface Account { id: number; fullName: string; email: string; role: 'student' | 'admin'; }
@Injectable({ providedIn: 'root' })
export class AuthService {
 private readonly http = inject(HttpClient);
 readonly user = signal<Account | null>(null);
 refresh() { return this.http.get<{user: Account}>('/api/auth/me').pipe(tap(r => this.user.set(r.user)), map(r => r.user), catchError(() => { this.user.set(null); return of(null); })); }
 login(email: string, password: string) { return this.http.post<{user: Account}>('/api/auth/login', {email,password}).pipe(tap(r => this.user.set(r.user))); }
 register(fullName: string, email: string, password: string) { return this.http.post('/api/auth/register', {fullName,email,password}); }
 logout() { return this.http.post('/api/auth/logout', {}).pipe(tap(() => this.user.set(null))); }
}
