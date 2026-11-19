import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from './auth.service';
interface Project { id:number;title:string;summary:string;objectives:string;authors:string;year:number;categoryId:number;category:string;status:'pending'|'observed'|'approved'|'withdrawn';observations:string;withdrawalReason?:string;createdAt:string;updatedAt:string;documentName:string|null; }
interface Category { id:number;name:string; }
@Component({selector:'app-student',imports:[FormsModule,DatePipe,RouterLink,RouterLinkActive],templateUrl:'./student.html',styleUrl:'./student.css'})
export class StudentPage {
 readonly auth=inject(AuthService);private readonly http=inject(HttpClient);private readonly router=inject(Router);private readonly route=inject(ActivatedRoute);
 readonly mode=this.route.snapshot.data['mode'] as 'list'|'new'|'detail'|'edit';
 readonly id=Number(this.route.snapshot.paramMap.get('id'));
 readonly projects=signal<Project[]>([]);readonly project=signal<Project|null>(null);readonly categories=signal<Category[]>([]);
 readonly loading=signal(true);readonly busy=signal(false);readonly error=signal('');readonly categoryError=signal('');readonly fileError=signal('');
 readonly status=signal('');readonly saved=this.route.snapshot.queryParamMap.get('enviado')==='1';
 readonly filtered=computed(()=>this.projects().filter(p=>!this.status()||p.status===this.status()));
 readonly initials=computed(()=>this.auth.user()?.fullName.trim().split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase()??'');
 readonly labels={pending:'Pendiente de revisión',observed:'Observado',approved:'Aprobado',withdrawn:'Retirado'};
 title='';summary='';objectives='';authors=this.auth.user()?.fullName??'';year=new Date().getFullYear();categoryId='';file:File|null=null;
 constructor(){this.load();}
 load(){
  this.loading.set(true);this.error.set('');
  if(this.mode==='list')this.http.get<Project[]>('/api/student/projects').subscribe({next:p=>{this.projects.set(p);this.loading.set(false);},error:e=>this.fail(e)});
  else {
   if(this.mode==='new'||this.mode==='edit')this.loadCategories();
   if(this.mode==='new'){this.loading.set(false);return;}
   this.http.get<Project>(`/api/student/projects/${this.id}`).subscribe({next:p=>{
    this.project.set(p);this.title=p.title;this.summary=p.summary;this.objectives=p.objectives;this.authors=p.authors;this.year=p.year;this.categoryId=String(p.categoryId);this.loading.set(false);
   },error:e=>this.fail(e)});
  }
 }
 loadCategories(){this.categoryError.set('');this.http.get<Category[]>('/api/categories').subscribe({next:c=>this.categories.set(c),error:()=>this.categoryError.set('No se pudieron cargar las categorías. Reintenta antes de enviar.')});}
 private fail(error:HttpErrorResponse){this.loading.set(false);this.busy.set(false);if(error.status===401){this.auth.user.set(null);void this.router.navigateByUrl('/iniciar-sesion');return;}this.error.set(error.error?.message??'No se pudo conectar con el servidor. Inténtalo nuevamente.');}
 choose(file:File|null){this.fileError.set('');this.file=null;if(!file)return;if(!/\.pdf$/i.test(file.name)||file.size===0||file.size>10485760){this.fileError.set('Selecciona un PDF de hasta 10 MB.');return;}this.file=file;}
 picked(event:Event){const input=event.target as HTMLInputElement;this.choose(input.files?.[0]??null);input.value='';}
 drop(event:DragEvent){event.preventDefault();if(event.dataTransfer?.files.length!==1){this.choose(null);this.fileError.set('Selecciona un solo documento PDF.');return;}this.choose(event.dataTransfer.files[0]??null);}
 submit(form:NgForm){
  this.error.set('');if(this.busy())return;
  if(form.invalid||!this.title.trim()||!this.summary.trim()||!this.objectives.trim()||!this.authors.trim()){form.control.markAllAsTouched();this.error.set('Completa los campos obligatorios y revisa los límites indicados.');return;}
  if(this.fileError()||(this.mode==='new'&&!this.file)){this.fileError.set('Adjunta un PDF válido de hasta 10 MB.');return;}
  if(!this.categories().some(c=>String(c.id)===String(this.categoryId))){this.error.set('Selecciona una categoría activa.');return;}
  const data=new FormData();for(const [key,value] of Object.entries({title:this.title,summary:this.summary,objectives:this.objectives,authors:this.authors,year:this.year,categoryId:this.categoryId}))data.append(key,String(value));
  if(this.file)data.append('document',this.file);
  this.busy.set(true);
  const request=this.mode==='edit'?this.http.put(`/api/student/projects/${this.id}`,data):this.http.post('/api/student/projects',data);
  request.subscribe({next:()=>void this.router.navigate(['/mis-proyectos'],{queryParams:{enviado:'1'}}),error:e=>this.fail(e)});
 }
 logout(){if(this.busy())return;this.busy.set(true);this.auth.logout().subscribe({next:()=>void this.router.navigateByUrl('/iniciar-sesion'),error:e=>this.fail(e)});}
}


