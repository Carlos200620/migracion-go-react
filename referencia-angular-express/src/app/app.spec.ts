import { RouterTestingHarness } from '@angular/router/testing';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Catalog } from './catalog';
import { provideRouter } from '@angular/router';

describe('Catálogo conectado a la API', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Catalog], providers: [provideRouter([{path:'catalogo',component:Catalog,data:{fullCatalog:true}}]), provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('carga proyectos y busca sin distinguir acentos', () => {
    const fixture = TestBed.createComponent(Catalog);
    http.expectOne('/api/projects').flush([
      { id: 1, title: 'Educación digital', category: 'Educación', authors: 'Ana', year: 2026, summary: 'Recursos educativos' },
      { id: 2, title: 'Biblioteca', category: 'Software', authors: 'Luis', year: 2026, summary: 'Préstamos' }
    ]);
    fixture.componentInstance.query.set('educacion');
    expect(fixture.componentInstance.filtered().length).toBe(1);
    fixture.componentInstance.category.set('Software');
    expect(fixture.componentInstance.filtered().length).toBe(0);
  });
  it('muestra un error y permite reintentar sin presentar un catálogo vacío', () => {
    const fixture = TestBed.createComponent(Catalog);
    http.expectOne('/api/projects').flush({}, { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('No se pudo cargar');
    fixture.componentInstance.loadProjects();
    http.expectOne('/api/projects').flush([]);
    fixture.detectChanges();
    expect(fixture.componentInstance.error()).toBe('');
    expect(fixture.nativeElement.textContent).toContain('No hay proyectos publicados');
  });
  it('combina búsqueda, categoría y año, y permite limpiar filtros en el catálogo independiente',async()=>{
    const harness=await RouterTestingHarness.create();const page=await harness.navigateByUrl('/catalogo',Catalog);
    http.expectOne('/api/projects').flush([
      {id:1,title:'Átomos',category:'Fisica',authors:'Carlos',year:2026,summary:'Estudio de materia'},
      {id:2,title:'Átomos antiguos',category:'Fisica',authors:'Ana',year:2025,summary:'Estudio histórico'},
      {id:3,title:'Biblioteca',category:'Software',authors:'Luis',year:2026,summary:'Aplicación'}
    ]);
    expect(page.fullCatalog).toBe(true);expect(page.categories()).toContain('Fisica');expect(page.years()).toEqual([2026,2025]);
    page.query.set('atomos');page.category.set('Fisica');page.year.set('2026');harness.detectChanges();
    expect(page.filtered().map(p=>p.id)).toEqual([1]);expect(harness.routeNativeElement?.textContent).toContain('1 proyecto encontrado');
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('button.clear')!.click();harness.detectChanges();
    expect(page.query()).toBe('');expect(page.category()).toBe('Todas');expect(page.year()).toBe('');expect(page.filtered().length).toBe(3);
    expect(harness.routeNativeElement!.querySelector('.hero')).toBeNull();
  });
  it('recibe la búsqueda y categoría desde los enlaces de inicio',async()=>{
    const harness=await RouterTestingHarness.create();const page=await harness.navigateByUrl('/catalogo?q=atomos&categoria=Fisica',Catalog);
    http.expectOne('/api/projects').flush([
      {id:1,title:'Átomos',category:'Fisica',authors:'Carlos',year:2026,summary:'Materia'},
      {id:2,title:'Biblioteca',category:'Software',authors:'Luis',year:2026,summary:'Aplicación'}
    ]);harness.detectChanges();
    expect(page.query()).toBe('atomos');expect(page.category()).toBe('Fisica');expect(page.filtered().map(p=>p.id)).toEqual([1]);
    expect(harness.routeNativeElement?.querySelector('a[aria-label="Ver proyecto: Átomos"]')?.getAttribute('href')).toBe('/proyectos/1');
  });
});



