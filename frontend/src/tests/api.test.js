import {describe,it,expect,vi} from 'vitest';
import {api} from '../services/api';
const json=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
const proxyError=()=>({ok:false,status:500,json:async()=>{throw new SyntaxError('Empty response');}});
describe('Conexión con la API durante el arranque',()=>{
 it('recupera una consulta cuando Go termina de arrancar',async()=>{const fetch=vi.fn().mockResolvedValueOnce(proxyError()).mockResolvedValue(json({items:[],total:0}));vi.stubGlobal('fetch',fetch);expect(await api('/projects')).toEqual({items:[],total:0});expect(fetch).toHaveBeenCalledTimes(2);});
 it('explica que hay que iniciar Go si el proxy sigue sin conexión',async()=>{const fetch=vi.fn().mockResolvedValue(proxyError());vi.stubGlobal('fetch',fetch);await expect(api('/projects')).rejects.toThrow('backend esté activo en el puerto 3000');expect(fetch).toHaveBeenCalledTimes(3);});
 it('no repite acciones que modifican datos',async()=>{const fetch=vi.fn().mockResolvedValue(proxyError());vi.stubGlobal('fetch',fetch);await expect(api('/student/projects',{method:'POST',body:{title:'Proyecto'}})).rejects.toThrow('API de Go');expect(fetch).toHaveBeenCalledTimes(1);});
 it('conserva el mensaje JSON del backend sin repetir validaciones fallidas',async()=>{const fetch=vi.fn().mockResolvedValue(json({message:'Selecciona una categoría activa.'},400));vi.stubGlobal('fetch',fetch);await expect(api('/student/projects',{method:'POST',body:{}})).rejects.toThrow('Selecciona una categoría activa.');expect(fetch).toHaveBeenCalledTimes(1);});
 it('rechaza HTML servido como éxito en lugar de tratarlo como datos',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>{throw new SyntaxError('HTML');}}));await expect(api('/projects')).rejects.toThrow('respuesta inesperada');});
 it('cancela el reintento cuando el usuario cambia de página',async()=>{const controller=new AbortController();const fetch=vi.fn().mockResolvedValue(proxyError());vi.stubGlobal('fetch',fetch);const request=api('/projects',{signal:controller.signal});await new Promise(resolve=>setTimeout(resolve,0));controller.abort();await expect(request).rejects.toMatchObject({name:'AbortError'});expect(fetch).toHaveBeenCalledTimes(1);});
});
