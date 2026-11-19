import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { NgForm } from '@angular/forms';
import { StudentPage } from './student';
import { AuthService } from './auth.service';

describe('Área estudiantil',()=>{
 let http:HttpTestingController;
 beforeEach(()=>{
  TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting(),provideRouter([
   {path:'mis-proyectos',component:StudentPage,data:{mode:'list'}},
   {path:'mis-proyectos/nuevo',component:StudentPage,data:{mode:'new'}}
  ])]});
  http=TestBed.inject(HttpTestingController);
  TestBed.inject(AuthService).user.set({id:1,fullName:'Estudiante Prueba',email:'prueba@example.test',role:'student'});
 });
 afterEach(()=>http.verify());
 it('muestra los envíos de la API y filtra por estado',async()=>{
  const harness=await RouterTestingHarness.create();const page=await harness.navigateByUrl('/mis-proyectos',StudentPage);
  http.expectOne('/api/student/projects').flush([
   {id:1,title:'Proyecto pendiente',category:'Software',status:'pending',createdAt:'2026-10-15T12:00:00Z'},
   {id:2,title:'Proyecto observado',category:'Educación',status:'observed',createdAt:'2026-10-15T12:00:00Z'}
  ]);
  page.status.set('observed');harness.detectChanges();
  expect(page.filtered().length).toBe(1);
  expect(harness.routeNativeElement?.textContent).toContain('Proyecto observado');
  expect(harness.routeNativeElement?.textContent).not.toContain('Proyecto pendiente');
  expect(harness.routeNativeElement?.textContent).toContain('Editar y reenviar');
 });
 it('muestra error de carga y permite reintentar',async()=>{
  const harness=await RouterTestingHarness.create();const page=await harness.navigateByUrl('/mis-proyectos',StudentPage);
  http.expectOne('/api/student/projects').flush({message:'Sin conexión'},{status:503,statusText:'Unavailable'});harness.detectChanges();
  expect(harness.routeNativeElement?.querySelector('[role="alert"]')?.textContent).toContain('Sin conexión');
  page.load();http.expectOne('/api/student/projects').flush([]);harness.detectChanges();
  expect(harness.routeNativeElement?.textContent).toContain('Aún no has registrado proyectos');
 });
 it('exige PDF antes de enviar un proyecto nuevo',async()=>{
  const harness=await RouterTestingHarness.create();const page=await harness.navigateByUrl('/mis-proyectos/nuevo',StudentPage);
  http.expectOne('/api/categories').flush([{id:1,name:'Software'}]);
  page.title='Proyecto';page.summary='Resumen';page.objectives='Objetivos';page.categoryId='1';
  page.submit({invalid:false} as NgForm);
  expect(page.fileError()).toContain('Adjunta un PDF');
  http.expectNone('/api/student/projects');
  page.choose(new File(['fake'],'documento.txt',{type:'text/plain'}));
  expect(page.file).toBeNull();expect(page.fileError()).toContain('PDF');
 });
});
