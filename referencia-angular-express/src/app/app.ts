import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './auth.service';
@Component({selector:'app-root',imports:[RouterOutlet,RouterLink,RouterLinkActive],templateUrl:'./app.html',styleUrl:'./app.css'})
export class App {
 readonly year=new Date().getFullYear();
 readonly router=inject(Router); readonly auth=inject(AuthService);
 constructor(){this.auth.refresh().subscribe();}
 get isAuth(){return this.router.url.startsWith('/iniciar-sesion') || this.router.url.startsWith('/crear-cuenta') || this.router.url.startsWith('/mis-proyectos') || this.router.url.startsWith('/administracion');}
}




