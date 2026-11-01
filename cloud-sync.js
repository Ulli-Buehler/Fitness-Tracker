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
 let user=null,ready=false,pending=null,saving=false,dirty=false,revision=0;
 function message(s){status.textContent=s}
 function display(){
  $('cloudLogin').hidden=!!user;
  $('cloudLoggedIn').hidden=!user;
  if(user)account.textContent=user.email||'Angemeldet';
 }
 async function hydrate(){
  if(!user)return;
  ready=false;
  message('Lade sichere Trainingsdaten …');
  try{
   const {data:row,error}=await client.from('fitness_profiles').select('payload').eq('user_id',user.id).maybeSingle();
   if(error)throw error;
   if(row?.payload){
    if(!row.payload.exercises||!Array.isArray(row.payload.history))throw Error('Ungültige Cloud-Daten');
    // Die Cloud gilt bei Kontoanmeldung als Quelle; vorherigen lokalen Stand sichern.
    window.fitnessCloudApply(row.payload,user.id);
    message('Cloud-Daten geladen ✓');
   }else{
    const send=confirm('Noch keine Cloud-Daten vorhanden. Vorhandene lokale Trainingsdaten in dieses Konto übernehmen?');
    if(send){
     const payload=window.fitnessCloudExport();
     const {error:upError}=await client.from('fitness_profiles').upsert({user_id:user.id,payload,updated_at:new Date().toISOString()},{onConflict:'user_id'});
     if(upError)throw upError;
     window.fitnessCloudApply(payload,user.id);message('Lokale Trainingsdaten erstmals gesichert ✓');
    }else{
     // Keine implizite Übernahme anderer lokaler Trainingsdaten.
     window.fitnessCloudApply({exercises:[],history:[],session:null,historyLimit:5},user.id);
     message('Neues leeres Profil erstellt');
    }
   }
   ready=true;
  }catch(e){message('Cloud konnte nicht geladen werden: '+e.message);ready=false}
 }
 async function flush(){
  if(!user||!ready||saving||!navigator.onLine)return;
  saving=true;dirty=false;const stamp=revision;
  message('Speichere online …');
  try{
   const payload=window.fitnessCloudExport();
   const {error}=await client.from('fitness_profiles').upsert({user_id:user.id,payload,updated_at:new Date().toISOString()},{onConflict:'user_id'});
   if(error)throw error;
   message('Online gesichert ✓');
  }catch(e){dirty=true;message('Offline/nicht gesichert – lokale Daten bleiben erhalten: '+e.message)}
  finally{saving=false;if(dirty||stamp!==revision){dirty=false;schedule()}}
 }
 function schedule(){
  revision++;
  if(!user||!ready)return;
  clearTimeout(pending);pending=setTimeout(flush,1200);
 }
 window.fitnessCloud={scheduleSave:schedule};
 async function connect(){
  const {data:{session},error}=await client.auth.getSession();
  if(error)throw error;
  const next=session?.user||null;
  if(next?.id!==user?.id){user=next;display();if(user)await hydrate();else{ready=false;window.fitnessCloudLocal();message('Nur auf diesem Gerät gespeichert')}}
 }
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
 $('cloudImportLocal').onclick=async()=>{
  if(!user)return message('Bitte zuerst anmelden.');
  let old;try{old=JSON.parse(localStorage.getItem('fitness-simple-v2'))}catch{}
  if(!old||!Array.isArray(old.exercises)||!Array.isArray(old.history))return message('Auf diesem Gerät wurden keine früheren lokalen Trainingsdaten gefunden.');
  const current=window.fitnessCloudExport();
  const localCount=old.history.length;
  if(!confirm('Lokale Trainingsdaten gefunden: '+old.exercises.length+' Übungen, '+localCount+' Einträge. Diese Daten ins Online-Konto übernehmen? Der bisherige Online-Stand wird vorher auf diesem Gerät gesichert.'))return;
  message('Übertrage frühere Trainingsdaten …');
  try{
   localStorage.setItem('fitness-cloud-before-import-'+user.id+'-'+Date.now(),JSON.stringify(current));
   const {error}=await client.from('fitness_profiles').upsert({user_id:user.id,payload:old,updated_at:new Date().toISOString()},{onConflict:'user_id'});
   if(error)throw error;
   window.fitnessCloudApply(old,user.id);
   ready=true;message('Frühere Trainingsdaten online übernommen ✓ ('+localCount+' Einträge)');
  }catch(e){message('Übernahme fehlgeschlagen: '+e.message)}
 };
 $('cloudSignOut').onclick=async()=>{
  await client.auth.signOut();user=null;ready=false;window.fitnessCloudLocal();display();
  message('Abgemeldet. Lokale Daten bleiben auf diesem Gerät erhalten.');
 };
 $('cloudRetry').onclick=()=>{if(user)hydrate();else connect()};
 client.auth.onAuthStateChange(()=>{setTimeout(()=>connect().catch(e=>message(e.message)),0)});
 window.addEventListener('online',()=>{if(user&&ready)flush()});
 display();connect().catch(e=>message('Cloud-Fehler: '+e.message));
})();
