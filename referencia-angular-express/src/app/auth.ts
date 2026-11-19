import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
@Component({selector:'app-auth', imports:[FormsModule,RouterLink], templateUrl:'./auth.html', styleUrl:'./auth.css'})
export class AuthPage {
 readonly auth = inject(AuthService);
 private readonly router = inject(Router);
 readonly register = inject(ActivatedRoute).snapshot.data['register'] === true;
 fullName = ''; email = ''; password = ''; confirmation = '';
 readonly busy = signal(false); readonly error = signal(''); readonly success = signal('');
 submit(form: NgForm) {
  this.error.set(''); this.success.set('');
  if (form.invalid) { form.control.markAllAsTouched(); this.error.set('Completa correctamente los campos obligatorios.'); return; }
  if (this.register && this.password !== this.confirmation) { this.error.set('Las contraseñas no coinciden.'); return; }
  this.busy.set(true);
  const request = this.register ? this.auth.register(this.fullName, this.email, this.password) : this.auth.login(this.email, this.password);
  request.subscribe({ next: () => {
   this.busy.set(false); this.password=''; this.confirmation='';
   if (this.register) { this.success.set('Cuenta creada correctamente. Ya puedes iniciar sesión.'); }
   else void this.router.navigateByUrl(this.auth.user()?.role === 'student' ? '/mis-proyectos' : '/administracion');
  }, error: error => { this.busy.set(false); this.error.set(error.error?.message ?? 'No se pudo conectar con el servidor. Inténtalo nuevamente.'); } });
 }
}


