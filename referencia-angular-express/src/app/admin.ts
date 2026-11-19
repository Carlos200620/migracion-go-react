import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from './auth.service';
interface ReviewProject {id:number;title:string;summary:string;objectives:string;authors:string;year:number;category:string;studentName:string;status:'pending'|'observed'|'approved'|'withdrawn';observations:string;withdrawalReason?:string;createdAt:string;updatedAt:string;documentName:string|null;version:string;}
interface Category {id:number;name:string;description:string;active:boolean;projectCount:number;}
@Component({selector:'app-admin',imports:[FormsModule,DatePipe,RouterLink,RouterLinkActive],templateUrl:'./admin.html',styleUrls:['./student.css','./admin.css']})
export class AdminPage {
 readonly auth=inject(AuthService);private readonly http=inject(HttpClient);private readonly router=inject(Router);private readonly route=inject(ActivatedRoute);
 readonly mode=this.route.snapshot.data['mode'] as 'summary'|'list'|'review'|'categories';readonly id=Number(this.route.snapshot.paramMap.get('id'));
 readonly counts=signal({pending:0,observed:0,approved:0});readonly projects=signal<ReviewProject[]>([]);readonly project=signal<ReviewProject|null>(null);readonly categories=signal<Category[]>([]);
 readonly loaded=signal(false);readonly loading=signal(true);readonly busy=signal(false);readonly error=signal('');readonly success=signal('');readonly status=signal('');readonly category=signal('');readonly query=signal('');readonly from=signal('');readonly to=signal('');
 readonly initials=computed(()=>this.auth.user()?.fullName.trim().split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase()??'');
 readonly labels={pending:'Pendiente de revisión',observed:'Observado',approved:'Aprobado',withdrawn:'Retirado'};
 readonly pending=computed(()=>this.projects().filter(p=>p.status==='pending').slice(0,8));
 readonly categoryNames=computed(()=>[...new Set(this.projects().map(p=>p.category))].sort());
 readonly filtered=computed(()=>this.projects().filter(p=>{
  const day=new Date(p.createdAt);const date=`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
  const normalize=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return(!this.status()||p.status===this.status())&&(!this.category()||p.category===this.category())&&normalize(`${p.title} ${p.studentName}`).includes(normalize(this.query().trim()))&&(!this.from()||date>=this.from())&&(!this.to()||date<=this.to());
 }));
 readonly actionTarget=signal<ReviewProject|null>(null);readonly lifecycleAction=signal<'withdraw'|'restore'|'delete'>('withdraw');readonly actionError=signal('');
 readonly history=signal<{id:number;action:'withdraw'|'restore'|'delete';actorName:string;reason:string;createdAt:string}[]>([]);readonly historyError=signal('');
 readonly actionLabels={withdraw:'Retirar',restore:'Restaurar',delete:'Eliminar'};
 reason='';deleteConfirmation='';
 @ViewChild('actionDialog') actionDialog?:ElementRef<HTMLDialogElement>;
 readonly categoryError=signal('');
 observations='';decision:'approved'|'observed'='approved';categoryId:number|null=null;categoryName='';description='';active=true;
 @ViewChild('categoryDialog') categoryDialog?:ElementRef<HTMLDialogElement>;
 @ViewChild('categoryForm') categoryForm?:NgForm;
 @ViewChild('reviewDialog') reviewDialog?:ElementRef<HTMLDialogElement>;
 constructor(){if(this.route.snapshot.queryParamMap.get('eliminado')==='1')this.success.set(this.route.snapshot.queryParamMap.get('limpieza')==='1'?'Proyecto eliminado. La eliminación del PDF se reintentará automáticamente.':'Proyecto eliminado.');this.load();}
 load(){this.loading.set(true);this.error.set('');
  if(this.mode==='summary')forkJoin({counts:this.http.get<{pending:number;observed:number;approved:number}>('/api/admin/summary'),projects:this.http.get<ReviewProject[]>('/api/admin/projects')}).subscribe({next:r=>{this.counts.set(r.counts);this.projects.set(r.projects);this.loaded.set(true);this.loading.set(false);},error:e=>this.fail(e)});
  if(this.mode==='list')this.http.get<ReviewProject[]>('/api/admin/projects').subscribe({next:p=>{this.projects.set(p);this.loaded.set(true);this.loading.set(false);},error:e=>this.fail(e)});
  if(this.mode==='review')this.http.get<ReviewProject>(`/api/admin/projects/${this.id}`).subscribe({next:p=>{this.project.set(p);this.loadHistory(p.id);this.observations=p.observations;this.loaded.set(true);this.loading.set(false);},error:e=>this.fail(e)});
  if(this.mode==='categories')this.http.get<Category[]>('/api/admin/categories').subscribe({next:c=>{this.categories.set(c);this.loaded.set(true);this.loading.set(false);},error:e=>this.fail(e)});
 }
 private fail(error:HttpErrorResponse){this.loading.set(false);this.busy.set(false);if(error.status===401){this.auth.user.set(null);void this.router.navigateByUrl('/iniciar-sesion');return;}this.error.set(error.error?.message??'No se pudo conectar con el servidor. Inténtalo nuevamente.');}
 confirm(decision:'approved'|'observed'){
  this.error.set('');this.success.set('');if(this.busy()||this.project()?.status!=='pending')return;
  if(this.observations.length>5000){this.error.set('Las observaciones no deben superar los 5000 caracteres.');return;}
  if(decision==='observed'&&!this.observations.trim()){this.error.set('Escribe las observaciones antes de devolver el proyecto.');return;}
  this.decision=decision;this.reviewDialog?.nativeElement.showModal();
 }
 review(){if(this.busy())return;this.busy.set(true);this.error.set('');this.http.post<{message:string}>(`/api/admin/projects/${this.id}/review`,{decision:this.decision,observations:this.observations,version:this.project()?.version}).subscribe({next:r=>{this.busy.set(false);this.reviewDialog?.nativeElement.close();this.success.set(r.message);this.load();},error:e=>{this.reviewDialog?.nativeElement.close();this.fail(e);}});}
 newCategory(){
  if(this.busy())return;this.categoryForm?.resetForm({name:'',description:'',active:true});this.clearCategory();this.error.set('');this.success.set('');this.categoryDialog?.nativeElement.showModal();
 }
 editCategory(c:Category){
  if(this.busy())return;this.categoryForm?.resetForm({name:c.name,description:c.description,active:c.active});
  this.categoryId=c.id;this.categoryName=c.name;this.description=c.description;this.active=c.active;this.categoryError.set('');this.error.set('');this.success.set('');this.categoryDialog?.nativeElement.showModal();
 }
 clearCategory(){this.categoryId=null;this.categoryName='';this.description='';this.active=true;this.categoryError.set('');}
 saveCategory(form:NgForm){
  this.categoryError.set('');if(this.busy())return;
  if(form.invalid||!this.categoryName.trim()){form.control.markAllAsTouched();this.categoryError.set('Escribe un nombre de hasta 100 caracteres y una descripción de hasta 1000.');return;}
  this.busy.set(true);const data={name:this.categoryName,description:this.description,active:this.active};const request=this.categoryId===null?this.http.post('/api/admin/categories',data):this.http.put(`/api/admin/categories/${this.categoryId}`,data);
  request.subscribe({next:()=>{this.busy.set(false);this.categoryDialog?.nativeElement.close();this.success.set('Categoría guardada correctamente.');this.clearCategory();this.load();},error:e=>{this.busy.set(false);if(e.status===401){this.fail(e);return;}this.categoryError.set(e.error?.message??'No se pudo guardar la categoría. Inténtalo nuevamente.');}});
 }
 toggleCategory(c:Category){
  if(this.busy())return;this.busy.set(true);this.error.set('');this.success.set('');
  this.http.patch(`/api/admin/categories/${c.id}/status`,{active:!c.active}).subscribe({next:()=>{this.busy.set(false);this.success.set(c.active?'Categoría desactivada. Los proyectos asociados se conservan.':'Categoría activada.');this.load();},error:e=>this.fail(e)});
 }
 loadHistory(id:number){this.historyError.set('');this.http.get<{id:number;action:'withdraw'|'restore'|'delete';actorName:string;reason:string;createdAt:string}[]>(`/api/admin/projects/${id}/history`).subscribe({next:h=>this.history.set(h),error:()=>this.historyError.set('No se pudo cargar el historial de acciones.')});}
 openAction(p:ReviewProject,action:'withdraw'|'restore'|'delete'){
  if(this.busy())return;this.actionTarget.set(p);this.lifecycleAction.set(action);this.reason='';this.deleteConfirmation='';this.actionError.set('');this.success.set('');this.error.set('');this.actionDialog?.nativeElement.showModal();
 }
 submitAction(){
  const p=this.actionTarget();if(!p||this.busy())return;this.actionError.set('');
  if(!this.reason.trim()||this.reason.trim().length>1000){this.actionError.set('Escribe el motivo de la acción (hasta 1000 caracteres).');return;}
  if(this.lifecycleAction()==='delete'&&this.deleteConfirmation!==p.title){this.actionError.set('Escribe exactamente el título para confirmar la eliminación.');return;}
  const action=this.lifecycleAction();this.busy.set(true);
  this.http.post<{message:string;cleanupPending?:boolean}>(`/api/admin/projects/${p.id}/lifecycle`,{action,reason:this.reason.trim(),version:p.version,...(action==='delete'?{confirmation:this.deleteConfirmation}:{})}).subscribe({
   next:r=>{this.busy.set(false);this.actionDialog?.nativeElement.close();if(action==='delete'&&this.mode==='review'){void this.router.navigate(['/administracion/proyectos'],{queryParams:{eliminado:'1',limpieza:r.cleanupPending?'1':undefined}});}else{this.success.set(r.message);this.load();}},
   error:e=>{this.busy.set(false);if(e.status===401){this.actionDialog?.nativeElement.close();this.fail(e);return;}this.actionError.set(e.error?.message??'No se pudo completar la acción. Inténtalo nuevamente.');}
  });
 }
 logout(){if(this.busy())return;this.busy.set(true);this.auth.logout().subscribe({next:()=>void this.router.navigateByUrl('/iniciar-sesion'),error:e=>this.fail(e)});}
}





