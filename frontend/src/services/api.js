const unavailableMessage = 'No se pudo conectar con la API de Go. Comprueba que el backend esté activo en el puerto 3000 y pulsa Reintentar.';
function pause(milliseconds, signal) {
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(new DOMException('Solicitud cancelada','AbortError'));return;}
  const abort=()=>{clearTimeout(timer);reject(new DOMException('Solicitud cancelada','AbortError'));};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},milliseconds);
  signal?.addEventListener('abort',abort,{once:true});
 });
}
export async function api(path, options={}) {
 const isForm=options.body instanceof FormData,method=(options.method||'GET').toUpperCase(),canRetry=method==='GET'||method==='HEAD';
 const request={credentials:'same-origin',...options,headers:{...(!isForm&&options.body?{'Content-Type':'application/json'}:{}),...options.headers},body:options.body&&!isForm&&typeof options.body!=='string'?JSON.stringify(options.body):options.body};
 for(let attempt=0;;attempt++){
  let response;
  try{response=await fetch('/api'+path,request);}catch(cause){if(cause.name==='AbortError')throw cause;if(canRetry&&attempt<2){await pause(300*(attempt+1),options.signal);continue;}const error=new Error(unavailableMessage,{cause});error.status=0;throw error;}
  let data,validJSON=true;try{data=await response.json();}catch{validJSON=false;}
  if(validJSON&&response.ok)return data;
  // Vite returns an empty 500 response when its proxy cannot reach Go during startup.
  const temporary=[502,503,504].includes(response.status)||(!validJSON&&response.status>=500);
  if(canRetry&&temporary&&attempt<2){await pause(300*(attempt+1),options.signal);continue;}
  const message=validJSON&&typeof data?.message==='string'?data.message:temporary?unavailableMessage:'La API devolvió una respuesta inesperada. Comprueba que estés ejecutando el backend Go de este proyecto.';
  const error=new Error(message);error.status=response.status;throw error;
 }
}
