import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
@Component({selector:'app-account',imports:[RouterLink],template:`<main class="account"><p class="eyebrow">TU ESPACIO ACADÉMICO</p><h1>Hola, {{ auth.user()?.fullName }}</h1><p>{{ auth.user()?.email }}</p><p>Perfil: {{ auth.user()?.role === 'admin' ? 'Administrador' : 'Estudiante' }}</p><div class="account-note">Tu sesión está activa. Ya puedes consultar tus envíos en Mis proyectos.</div>@if(error()){<p role="alert">{{ error() }}</p>}<a routerLink="/mis-proyectos">Ir a Mis proyectos →</a><br><br><button (click)="logout()" [disabled]="busy()">Cerrar sesión</button></main>`})
export class AccountPage {
 readonly auth=inject(AuthService); private readonly router=inject(Router);
 readonly busy=signal(false); readonly error=signal('');
 logout(){this.busy.set(true);this.auth.logout().subscribe({next:()=>void this.router.navigateByUrl('/iniciar-sesion'),error:()=>{this.busy.set(false);this.error.set('No se pudo cerrar la sesión. Inténtalo nuevamente.');}});}
}

