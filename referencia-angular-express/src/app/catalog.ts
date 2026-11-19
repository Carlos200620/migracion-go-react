import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';

interface Project { id: number; title: string; category: string; authors: string; year: number; summary: string; }
@Component({ selector: 'app-catalog', imports:[RouterLink], templateUrl: './catalog.html', styleUrls: ['./catalog.css','./catalog-hero.css','./catalog-cards.css'] })
export class Catalog {
  readonly fullCatalog = inject(ActivatedRoute).snapshot.data['fullCatalog'] === true;
  readonly query = signal(inject(ActivatedRoute).snapshot.queryParamMap.get('q') ?? '');
  readonly year = signal('');
  readonly categories = computed(() => [...new Set(this.projects().map(p => p.category))].sort((a,b) => a.localeCompare(b, 'es')));
  readonly years = computed(() => [...new Set(this.projects().map(p => p.year))].sort((a,b) => b-a));
  clearFilters() { this.query.set(''); this.category.set('Todas'); this.year.set(''); }
  readonly category = signal(inject(ActivatedRoute).snapshot.queryParamMap.get('categoria') ?? 'Todas');
  private readonly router=inject(Router);
  searchCatalog(){void this.router.navigate(['/catalogo'],{queryParams:this.query().trim()?{q:this.query().trim()}:{}});}
  tone(value:string){return Array.from(value).reduce((sum,c)=>sum+c.charCodeAt(0),0)%4;}

  readonly projects = signal<Project[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  private readonly http = inject(HttpClient);
  constructor() { this.loadProjects(); }
  loadProjects() {
    this.loading.set(true);
    this.error.set('');
    this.http.get<Project[]>('/api/projects').subscribe({
      next: projects => { this.projects.set(projects); this.loading.set(false); },
      error: () => { this.error.set('No se pudo cargar el catálogo. Comprueba que la API y PostgreSQL estén disponibles.'); this.loading.set(false); }
    });
  }
  readonly filtered = computed(() => {
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const query = normalize(this.query().trim());
    return this.projects().filter(p => (this.category() === 'Todas' || p.category === this.category()) && (!this.year() || String(p.year) === this.year()) && normalize(`${p.title} ${p.authors} ${p.summary}`).includes(query));
  });
}






