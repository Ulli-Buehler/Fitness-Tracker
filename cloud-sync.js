/* Optionale Fitness-Cloud: erst aktiv nach Eintragen der öffentlichen Projektwerte. */
(()=>{
 const conf=window.FITNESS_SUPABASE||{};
 if(!conf.url||!conf.publishableKey)return;
 const api=window.supabase;
 if(!api?.createClient){console.error('Supabase JS nicht geladen');return}
 const client=api.createClient(conf.url,conf.publishableKey);
 const $=id=>document.getElementById(id);
 const panel=$('cloudPanel'),status=$('cloudStatus'),account=$('cloudAccount');
 if(!panel)return;
 panel.hidden=false;
 let user=null,ready=false,saving=false,queued=false,retryTimer=null,activeToken=0;
 const localKey=id=>'fitness-cloud-'+id;
 const dirtyKey=id=>'fitness-cloud-pending-'+id;
 const lastSyncKey=id=>'fitness-cloud-last-sync-'+id;
 const localData=id=>{try{const d=JSON.parse(localStorage.getItem(localKey(id)));return d&&Array.isArray(d.history)&&Array.isArray(d.exercises)?d:null}catch{return null}};
 const hasPending=id=>localStorage.getItem(dirtyKey(id))==='1';
 function message(s){status.textContent=s}
 function display(){
  $('cloudLogin').hidden=!!user;$('cloudLoggedIn').hidden=!user;
  if(user)account.textContent=user.email||'Angemeldet';
  window.fitnessAccountRefresh?.();
 }
 function queueSave(){
  if(!user)return;
  try{localStorage.setItem(dirtyKey(user.id),'1')}catch{}
  queued=true;
  message(navigator.onLine?'Änderung gespeichert · Cloud wird aktualisiert …':'Offline · später synchronisieren');
  clearTimeout(retryTimer);retryTimer=setTimeout(flush,1200);
 }
 async function flush(){
  if(!user||!ready||saving||!hasPending(user.id)||!navigator.onLine)return;
  const id=user.id,token=activeToken;
  saving=true;queued=false;
  const snapshot=localData(id)||window.fitnessCloudExport();
  const serialized=JSON.stringify(snapshot);
  message('Online-Sicherung läuft …');
  try{
   const {error}=await client.from('fitness_profiles').upsert({user_id:id,payload:snapshot,updated_at:new Date().toISOString()},{onConflict:'user_id'});
   if(error)throw error;
   if(token!==activeToken||user?.id!==id)return;
   const current=localData(id)||window.fitnessCloudExport();
   if(JSON.stringify(current)===serialized&&!queued){
    localStorage.removeItem(dirtyKey(id));
    localStorage.setItem(lastSyncKey(id),new Date().toISOString());
    message('Online gesichert ✓');
   }else{
    message('Weitere Änderungen werden übertragen …');
    clearTimeout(retryTimer);retryTimer=setTimeout(flush,500);
   }
  }catch(e){
   if(token===activeToken)message('Lokal gespeichert · Cloud noch nicht erreichbar');
  }finally{saving=false}
 }
 window.fitnessCloud={scheduleSave:queueSave,isLoggedIn:()=>!!user,refreshSession:async()=>{await connect();return !!user}};
 async function hydrate(){
  if(!user)return;
  const id=user.id,token=activeToken;
  ready=false;message('Trainingsdaten werden abgeglichen …');
  const cached=localData(id);
  // Lokale, noch nicht übertragene Änderungen haben Vorrang.
  if(cached&&hasPending(id)){
   window.fitnessCloudApply(cached,id);
   ready=true;message('Lokale Änderungen warten auf Online-Sicherung');
   flush();return;
  }
  try{
   const {data:row,error}=await client.from('fitness_profiles').select('payload').eq('user_id',id).maybeSingle();
   if(error)throw error;
   if(token!==activeToken||user?.id!==id)return;
   if(row?.payload&&Array.isArray(row.payload.exercises)&&Array.isArray(row.payload.history)){
    window.fitnessCloudApply(row.payload,id);
    ready=true;message('Online gesichert ✓');return;
   }
   if(row?.payload)throw Error('Ungültige Cloud-Daten');
   const existing=cached||window.fitnessCloudExport();
   const transfer=confirm('Dieses Konto hat noch keine Online-Daten. Die aktuellen Trainingsdaten jetzt übernehmen?');
   if(!transfer){
    window.fitnessCloudApply({exercises:[],history:[],session:null,historyLimit:5},id);
    ready=true;message('Neues Konto ohne Trainingsdaten');return;
   }
   window.fitnessCloudApply(existing,id);
   ready=true;queueSave();
  }catch(e){
   // Auch wenn das Netz ausfällt, bleibt der lokale Kontostand nutzbar.
   if(token!==activeToken)return;
   if(cached){window.fitnessCloudApply(cached,id);ready=true;message('Offline · lokaler Stand verfügbar');}
   else{ready=false;message('Cloud nicht erreichbar · vorhandene lokale Daten bleiben erhalten');}
  }
 }
 async function connect(){
  const {data:{session},error}=await client.auth.getSession();
  if(error)throw error;
  const next=session?.user||null;
  if(next?.id!==user?.id){
   activeToken++;clearTimeout(retryTimer);
   user=next;ready=false;display();
   if(user)await hydrate();
   else{window.fitnessCloudLocal();message('Nur lokal gespeichert')}
  }else if(user&&ready&&hasPending(user.id))flush();
 }
 window.addEventListener('online',()=>{if(user){if(!ready)hydrate();else flush()}});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&user){if(!ready)hydrate();else flush()}});
 window.addEventListener('pageshow',()=>{if(user&&ready)flush()});
 setInterval(()=>{if(user&&ready)flush()},30000);
 $('cloudSignUp').onclick=async()=>{
  const email=$('cloudEmail').value.trim(),password=$('cloudPassword').value;
  if(!email||password.length<8)return message('E-Mail und Passwort mit mindestens 8 Zeichen eingeben.');
  message('Registrierung läuft …');
  const {error}=await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});
  message(error?'Fehler: '+error.message:'Registrierung gesendet. Bitte E-Mail bestätigen und anschließend anmelden.');
 };
 $('cloudLogin').onsubmit=async event=>{event.preventDefault();
  const email=$('cloudEmail').value.trim(),password=$('cloudPassword').value;
  if(!email||!password){message('Bitte E-Mail und Passwort eingeben.');return;}
  message('Anmeldung läuft …');
  const {error}=await client.auth.signInWithPassword({email,password});
  if(error)message('Anmeldung fehlgeschlagen: '+(error.message==='missing email or phone'?'Bitte E-Mail-Adresse erneut prüfen.':error.message));
  else await connect();
 };
 $('cloudSignOut').onclick=async()=>{
  await client.auth.signOut();activeToken++;user=null;ready=false;window.fitnessCloudLocal();display();
  message('Von der Cloud abgemeldet. Lokale Trainingsdaten bleiben erhalten.');
 };
 client.auth.onAuthStateChange(()=>{setTimeout(()=>connect().catch(e=>message(e.message)),0)});
 display();connect().catch(e=>message('Cloud-Fehler: '+e.message));
})();
