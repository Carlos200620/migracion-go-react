import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController,provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AdminPage } from './admin';
import { AuthService } from './auth.service';

describe('Panel administrativo',()=>{
 let http:HttpTestingController;
 beforeEach(()=>{
  TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting(),provideRouter([
   {path:'administracion',component:AdminPage,data:{mode:'summary'}},
   {path:'administracion/proyectos',component:AdminPage,data:{mode:'list'}},
   {path:'administracion/proyectos/:id',component:AdminPage,data:{mode:'review'}},
   {path:'administracion/categorias',component:AdminPage,data:{mode:'categories'}}
  ])]});http=TestBed.inject(HttpTestingController);TestBed.inject(AuthService).user.set({id:1,fullName:'Admin Prueba',email:'admin@example.test',role:'admin'});
 });
 afterEach(()=>http.verify());
 it('muestra las cifras de la API y solo pendientes en el resumen',async()=>{
  const harness=await RouterTestingHarness.create();const page=await harness.navigateByUrl('/administracion',AdminPage);
  http.expectOne('/api/admin/summary').flush({pending:1,observed:2,approved:3});http.expectOne('/api/admin/projects').flush([{id:1,title:'Pendiente de prueba',status:'pending',createdAt:'2026-10-15T12:00:00Z'},{id:2,title:'Aprobado de prueba',status:'approved',createdAt:'2026-10-15T12:00:00Z'}]);harness.detectChanges();
  expect(page.counts().approved).toBe(3);expect(page.pending().length).toBe(1);expect(harness.routeNativeElement?.textContent).toContain('Pendiente de prueba');expect(harness.routeNativeElement?.textContent).not.toContain('Aprobado de prueba');
 });
 it('exige observaciones para devolver y envía la versión del proyecto',async()=>{
  const harness=await RouterTestingHarness.create();const page=await harness.navigateByUrl('/administracion/proyectos/1',AdminPage);
  http.expectOne('/api/admin/projects/1').flush({id:1,title:'Proyecto',status:'pending',version:'v1',observations:'',documentName:'archivo.pdf'});http.expectOne('/api/admin/projects/1/history').flush([]);harness.detectChanges();
  const dialog=harness.routeNativeElement!.querySelector('dialog')!;dialog.showModal=vi.fn(()=>dialog.setAttribute('open',''));dialog.close=vi.fn(()=>dialog.removeAttribute('open'));
  page.confirm('observed');expect(page.error()).toContain('observaciones');http.expectNone('/api/admin/projects/1/review');
  page.observations='Ampliar objetivos';page.confirm('observed');expect(dialog.open).toBe(true);page.review();
  const request=http.expectOne('/api/admin/projects/1/review');expect(request.request.body).toEqual({decision:'observed',observations:'Ampliar objetivos',version:'v1'});request.flush({message:'El proyecto cambió'},{status:409,statusText:'Conflict'});harness.detectChanges();
  expect(page.error()).toContain('El proyecto cambió');expect(page.busy()).toBe(false);
 });
 it('muestra conteos de categorías y cambia solo el estado desde la tabla',async()=>{
  const harness=await RouterTestingHarness.create();const page=await harness.navigateByUrl('/administracion/categorias',AdminPage);
  const category={id:1,name:'Software',description:'Aplicaciones',active:true,projectCount:4};
  http.expectOne('/api/admin/categories').flush([category]);harness.detectChanges();
  const row=harness.routeNativeElement!.querySelector('tbody tr')!;
  expect(row.textContent).toContain('4');expect(row.textContent).toContain('Desactivar');
  expect(harness.routeNativeElement!.querySelector('dialog')!.open).toBe(false);
  page.toggleCategory(category);const request=http.expectOne('/api/admin/categories/1/status');expect(request.request.method).toBe('PATCH');expect(request.request.body).toEqual({active:false});request.flush({...category,active:false});
  http.expectOne('/api/admin/categories').flush([{...category,active:false}]);harness.detectChanges();
  expect(harness.routeNativeElement!.querySelector('tbody tr')!.textContent).toContain('Inactiva');
  expect(harness.routeNativeElement!.querySelector('button[aria-label="Activar Software"]')).not.toBeNull();
 });
 it('abre edición en modal y conserva datos si el servidor rechaza el nombre',async()=>{
  const harness=await RouterTestingHarness.create();const page=await harness.navigateByUrl('/administracion/categorias',AdminPage);
  const category={id:1,name:'Software',description:'Aplicaciones',active:true,projectCount:4};http.expectOne('/api/admin/categories').flush([category]);harness.detectChanges();
  const dialog=harness.routeNativeElement!.querySelector('dialog')!;dialog.showModal=vi.fn(()=>dialog.setAttribute('open',''));dialog.close=vi.fn(()=>dialog.removeAttribute('open'));
  harness.routeNativeElement!.querySelector<HTMLButtonElement>('button[aria-label="Editar Software"]')!.click();harness.detectChanges();expect(dialog.open).toBe(true);expect(page.categoryName).toBe('Software');
  page.saveCategory({invalid:false} as import('@angular/forms').NgForm);
  http.expectOne('/api/admin/categories/1').flush({message:'Ya existe una categoría con ese nombre.'},{status:409,statusText:'Conflict'});harness.detectChanges();
  expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('Ya existe');expect(dialog.open).toBe(true);expect(page.categoryName).toBe('Software');
 });
 it('muestra Retirar al publicarse y Restaurar después de retirarlo',async()=>{
  const harness=await RouterTestingHarness.create();const page=await harness.navigateByUrl('/administracion/proyectos',AdminPage);
  const project={id:1,title:'Informe',status:'approved' as const,version:'v1',category:'Software',studentName:'Autor',createdAt:'2026-10-15T12:00:00Z'};
  http.expectOne('/api/admin/projects').flush([project]);harness.detectChanges();
  const row=harness.routeNativeElement!.querySelector('tbody tr')!;
  expect(row.textContent).toContain('Retirar');expect(row.textContent).not.toContain('Restaurar');expect(row.textContent).toContain('Eliminar');
  const dialog=harness.routeNativeElement!.querySelector<HTMLDialogElement>('dialog[aria-labelledby="action-title"]')!;dialog.showModal=vi.fn(()=>dialog.setAttribute('open',''));dialog.close=vi.fn(()=>dialog.removeAttribute('open'));
  Array.from(row.querySelectorAll('button')).find(b=>b.textContent==='Retirar')!.click();harness.detectChanges();
  page.reason='Publicado por error';page.submitAction();const request=http.expectOne('/api/admin/projects/1/lifecycle');expect(request.request.body).toEqual({action:'withdraw',reason:'Publicado por error',version:'v1'});
  request.flush({message:'Proyecto retirado.'});http.expectOne('/api/admin/projects').flush([{...project,status:'withdrawn',version:'v2'}]);harness.detectChanges();
  const updated=harness.routeNativeElement!.querySelector('tbody tr')!;expect(updated.textContent).toContain('Restaurar');expect(Array.from(updated.querySelectorAll('button')).some(b=>b.textContent==='Retirar')).toBe(false);
 });
 it('exige motivo y título exacto antes de solicitar Eliminar',async()=>{
  const harness=await RouterTestingHarness.create();const page=await harness.navigateByUrl('/administracion/proyectos',AdminPage);
  http.expectOne('/api/admin/projects').flush([{id:1,title:'Informe',status:'approved',version:'v1',category:'Software',createdAt:'2026-10-15T12:00:00Z'}]);harness.detectChanges();
  const dialog=harness.routeNativeElement!.querySelector<HTMLDialogElement>('dialog[aria-labelledby="action-title"]')!;dialog.showModal=vi.fn(()=>dialog.setAttribute('open',''));dialog.close=vi.fn(()=>dialog.removeAttribute('open'));
  Array.from(harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('tbody button')).find(b=>b.textContent==='Eliminar')!.click();harness.detectChanges();
  page.submitAction();expect(page.actionError()).toContain('motivo');http.expectNone('/api/admin/projects/1/lifecycle');
  page.reason='Duplicado';page.deleteConfirmation='Otro título';page.submitAction();expect(page.actionError()).toContain('título');http.expectNone('/api/admin/projects/1/lifecycle');
  page.deleteConfirmation='Informe';page.submitAction();const request=http.expectOne('/api/admin/projects/1/lifecycle');expect(request.request.body).toEqual({action:'delete',reason:'Duplicado',version:'v1',confirmation:'Informe'});
  request.flush({message:'El proyecto cambió.'},{status:409,statusText:'Conflict'});harness.detectChanges();expect(dialog.open).toBe(true);expect(page.actionError()).toContain('cambió');
 });
});





