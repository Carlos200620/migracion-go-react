import { PublicationPage } from './publication';
import { AdminPage } from './admin';
import { StudentPage } from './student';
import { inject } from '@angular/core';
import { Routes, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from './auth.service';
import { Catalog } from './catalog';
import { AuthPage } from './auth';
import { AccountPage } from './account';
const studentGuard = () => { const router=inject(Router);return inject(AuthService).refresh().pipe(map(user=>!user?router.createUrlTree(['/iniciar-sesion']):user.role==='student'?true:router.createUrlTree(['/administracion']))); };
const adminGuard = () => { const router=inject(Router);return inject(AuthService).refresh().pipe(map(user=>!user?router.createUrlTree(['/iniciar-sesion']):user.role==='admin'?true:router.createUrlTree(['/mis-proyectos']))); };
export const routes: Routes = [
 {path:'',component:Catalog},
 {path:'catalogo',component:Catalog,data:{fullCatalog:true}},
 {path:'iniciar-sesion',component:AuthPage},
 {path:'crear-cuenta',component:AuthPage,data:{register:true}},
 {path:'mi-cuenta',component:AccountPage,canActivate:[()=>{const router=inject(Router);return inject(AuthService).refresh().pipe(map(user=>user ? true : router.createUrlTree(['/iniciar-sesion'])));} ]},
 {path:'mis-proyectos',component:StudentPage,data:{mode:'list'},canActivate:[studentGuard]},
 {path:'mis-proyectos/nuevo',component:StudentPage,data:{mode:'new'},canActivate:[studentGuard]},
 {path:'mis-proyectos/:id/editar',component:StudentPage,data:{mode:'edit'},canActivate:[studentGuard]},
 {path:'mis-proyectos/:id',component:StudentPage,data:{mode:'detail'},canActivate:[studentGuard]},
 {path:'administracion',component:AdminPage,data:{mode:'summary'},canActivate:[adminGuard]},
 {path:'administracion/proyectos',component:AdminPage,data:{mode:'list'},canActivate:[adminGuard]},
 {path:'administracion/proyectos/:id',component:AdminPage,data:{mode:'review'},canActivate:[adminGuard]},
 {path:'administracion/categorias',component:AdminPage,data:{mode:'categories'},canActivate:[adminGuard]},
 {path:'proyectos/:id',component:PublicationPage},
 {path:'**',redirectTo:''}
];





