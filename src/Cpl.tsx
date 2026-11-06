import { useEffect, useMemo, useState, type ReactNode, type FormEvent } from "react";
import type { User } from "firebase/auth";
import {
  ArrowDown, ArrowRight, ArrowUpRight, CalendarDays, ChevronRight, CircleDot, Crown,
  Goal, Medal, Shield, Trophy, Users, Vote, RefreshCw, LogIn, CheckCircle2, Clock3,
  ClipboardList, UserPlus, Send, BarChart3, Plus
} from "lucide-react";
import { cplApi, type Bootstrap, type CplMe, type CplRole, type Fixture } from "./lib/cplApi";
import "./Cpl.css";

type Props={user:User|null;onSignIn:()=>void};

function fmtDate(value:string){const d=new Date(value);return Number.isNaN(d.getTime())?"Date TBA":d.toLocaleDateString(undefined,{day:"2-digit",month:"short",year:"numeric"});}
function fmtTime(value:string){const d=new Date(value);return Number.isNaN(d.getTime())?"Time TBA":d.toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"});}
function teamName(data:Bootstrap,id:string){return data.teams.find(t=>t.id===id)?.name||"Team TBA";}
function Logo({src,size=22}:{src?:string;size?:number}){const [bad,setBad]=useState(false);useEffect(()=>setBad(false),[src]);return src&&!bad?<img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" onError={()=>setBad(true)}/>:<Shield size={size}/>;}
function parseDetails(v?:string):Record<string,string>{try{return v?JSON.parse(v):{};}catch{return {};}}
type FixtureX=Fixture&{homeLogo?:string;awayLogo?:string};
type PublicPlayer={id:string;name:string;teamId:string;teamName:string;teamLogo?:string;league?:string;jerseyNumber?:string;position?:string;photoUrl?:string;goals:number;assists:number;isCaptain?:boolean};
const driveUrl=(id?:string,w=400)=>id?`https://lh3.googleusercontent.com/d/${id}=w${w}`:"";
function TeamTag({logo,name,id,size=22}:{logo?:string;name:string;id?:string;size?:number}){
  const inner=<><span className="cpl-teamtag-logo" style={{width:size,height:size}}><Logo src={logo} size={Math.round(size*.6)}/></span><span className="cpl-teamtag-name">{name||"Team TBA"}</span></>;
  return id?<a className="cpl-teamtag" href={`#/team/${encodeURIComponent(id)}`} onClick={e=>e.stopPropagation()}>{inner}</a>:<span className="cpl-teamtag">{inner}</span>;
}
function TeamTagById({data,id,size}:{data:Bootstrap;id:string;size?:number}){const t=data.teams.find(x=>x.id===id);return <TeamTag logo={t?.logo} name={t?.name||"Team TBA"} id={t?id:undefined} size={size}/>;}
function FixtureTags({data,id}:{data:Bootstrap;id:string}){const f=data.fixtures.find(x=>x.id===id) as FixtureX|undefined;return f?<span className="cpl-fixture-tags"><TeamTag logo={f.homeLogo} name={f.homeTeamName} id={f.homeTeamId}/> <em>vs</em> <TeamTag logo={f.awayLogo} name={f.awayTeamName} id={f.awayTeamId}/></span>:<>{id}</>;}
function Avatar({src,name,size=56}:{src?:string;name:string;size?:number}){const [bad,setBad]=useState(false);useEffect(()=>setBad(false),[src]);const initials=name.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join("").toUpperCase();return <span className="cpl-avatar" style={{width:size,height:size,fontSize:size*.36}}>{src&&!bad?<img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" onError={()=>setBad(true)}/>:initials||"?"}</span>;}
function readImage(file:File):Promise<{name:string;mimeType:string;base64:string}>{return new Promise((res,rej)=>{if(!["image/jpeg","image/png","image/webp"].includes(file.type))return rej(new Error("Choose a JPG, PNG or WEBP image."));if(file.size>5*1024*1024)return rej(new Error("Image must be 5 MB or smaller."));const rd=new FileReader();rd.onload=()=>res({name:file.name,mimeType:file.type,base64:String(rd.result||"")});rd.onerror=()=>rej(new Error("Could not read the selected image."));rd.readAsDataURL(file);});}
function DetailsFields({pd,setD,onPhoto,photoLabel}:{pd:Record<string,string>;setD:(k:string)=>(e:{target:{value:string}})=>void;onPhoto:(f?:File)=>void;photoLabel?:string}){return <>
  <label>Full name<input value={pd.fullName||""} onChange={setD("fullName")} required maxLength={80}/></label>
  <label>Phone number *<input value={pd.phone||""} onChange={setD("phone")} placeholder="07xx xxx xxx" required maxLength={20} inputMode="tel"/></label>
  <label>Date of birth *<input type="date" value={pd.dateOfBirth||""} onChange={setD("dateOfBirth")} required/></label>
  <label>Student reg. no. / National ID *<input value={pd.idNumber||""} onChange={setD("idNumber")} required maxLength={30}/></label>
  <label>Course / school<input value={pd.course||""} onChange={setD("course")} maxLength={80}/></label>
  <label>Year of study<input value={pd.yearOfStudy||""} onChange={setD("yearOfStudy")} maxLength={10}/></label>
  <label>Preferred foot<select value={pd.preferredFoot||""} onChange={setD("preferredFoot")}><option value="">Select</option><option>Right</option><option>Left</option><option>Both</option></select></label>
  <label>Height (cm)<input value={pd.heightCm||""} onChange={setD("heightCm")} inputMode="numeric" maxLength={3}/></label>
  <label>Previous club / team<input value={pd.previousClub||""} onChange={setD("previousClub")} maxLength={80}/></label>
  <label>Emergency contact name *<input value={pd.emergencyName||""} onChange={setD("emergencyName")} required maxLength={80}/></label>
  <label>Emergency contact phone *<input value={pd.emergencyPhone||""} onChange={setD("emergencyPhone")} required maxLength={20} inputMode="tel"/></label>
  <label>{photoLabel||"Passport-style photo"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>onPhoto(e.target.files?.[0])}/></label>
</>}
function PlayerProfileEditor({user,row,onRefresh}:{user:User|null;row:Record<string,string>;onRefresh:()=>Promise<void>}){
  const [pd,setPd]=useState<Record<string,string>>({...parseDetails(row.detailsJson),fullName:row.fullName||""});
  const [position,setPosition]=useState(row.position||"");
  const [photo,setPhoto]=useState<{name:string;mimeType:string;base64:string}|null>(null);
  const [busy,setBusy]=useState(false); const [notice,setNotice]=useState("");
  const photoId=parseDetails(row.detailsJson).photoFileId||row.photoFileId;
  const setD=(k:string)=>(e:{target:{value:string}})=>setPd(p=>({...p,[k]:e.target.value}));
  const save=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!user)return;setBusy(true);setNotice("");
    try{await cplApi.action(user,"player_update_details",{fullName:pd.fullName,position,details:pd,...(photo?{image:photo}:{})});setPhoto(null);setNotice("Your details were saved.");await onRefresh();}
    catch(err){setNotice(errorText(err));}finally{setBusy(false);}};
  return <form className="cpl-team-create-form cpl-player-editor" onSubmit={save}>
    <div className="cpl-player-editor-head"><Avatar src={photo?photo.base64:driveUrl(photoId)} name={pd.fullName||"Player"} size={64}/><div><strong>{pd.fullName||"Your profile"}</strong><small>Only the Chairman and your coach can see your contact details.</small></div></div>
    <DetailsFields pd={pd} setD={setD} onPhoto={async f=>{if(!f){setPhoto(null);return;}try{setPhoto(await readImage(f));setNotice("");}catch(err){setNotice(errorText(err));}}} photoLabel="Change photo"/>
    <label>Position<input value={position} onChange={e=>setPosition(e.target.value)} maxLength={30} placeholder="e.g. Midfielder"/></label>
    {notice&&<p className="cpl-team-editor-notice">{notice}</p>}
    <button type="submit" disabled={busy}>{busy?"Saving…":"Save my details"}</button>
  </form>;
}
function PlayerCard({p}:{p:PublicPlayer}){return <article className="cpl-player-card"><Avatar src={p.photoUrl} name={p.name} size={64}/><div className="cpl-player-card-body"><strong>{p.name}{p.isCaptain&&<span className="cpl-captain" title="Captain">C</span>}</strong><TeamTag logo={p.teamLogo} name={p.teamName} id={p.teamId} size={18}/><small>{p.position||"Position TBA"}{p.jerseyNumber?` · #${p.jerseyNumber}`:""}</small></div><div className="cpl-player-card-stats"><b>{p.goals}</b><small>Goals</small><b>{p.assists}</b><small>Assists</small></div></article>}
function PlayersPage({data}:{data:Bootstrap&{players?:PublicPlayer[]}|null}){
  const [q,setQ]=useState(""); const [team,setTeam]=useState(""); const [pos,setPos]=useState(""); const [sort,setSort]=useState("name");
  const all=data?.players||[];
  const positions=useMemo(()=>Array.from(new Set(all.map(p=>(p.position||"").trim()).filter(Boolean))).sort(),[all]);
  const list=useMemo(()=>{const k=q.trim().toLowerCase();return all.filter(p=>(!team||p.teamId===team)&&(!pos||(p.position||"")===pos)&&(!k||[p.name,p.teamName,p.position,p.jerseyNumber&&`#${p.jerseyNumber}`,p.jerseyNumber].some(v=>String(v||"").toLowerCase().includes(k)))).sort((a,b)=>sort==="goals"?b.goals-a.goals||a.name.localeCompare(b.name):sort==="assists"?b.assists-a.assists||a.name.localeCompare(b.name):sort==="team"?a.teamName.localeCompare(b.teamName)||a.name.localeCompare(b.name):a.name.localeCompare(b.name));},[all,q,team,pos,sort]);
  return <section className="cpl-section cpl-public-page" id="players-page">
    <a className="cpl-back" href="#top"><ArrowRight size={14} style={{transform:"rotate(180deg)"}}/> Back to home</a>
    <div className="cpl-section-heading"><div><span className="cpl-section-kicker">EVERY PLAYER</span><h2>CPL<br/><em>players.</em></h2></div><p>{all.length} registered players across {data?.teams.length||0} teams. Search by name, team, position or jersey number.</p></div>
    <div className="cpl-search-bar"><input type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search players, teams, positions…" aria-label="Search players"/>
      <select value={team} onChange={e=>setTeam(e.target.value)} aria-label="Filter by team"><option value="">All teams</option>{data?.teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
      <select value={pos} onChange={e=>setPos(e.target.value)} aria-label="Filter by position"><option value="">All positions</option>{positions.map(x=><option key={x}>{x}</option>)}</select>
      <select value={sort} onChange={e=>setSort(e.target.value)} aria-label="Sort"><option value="name">Sort: Name</option><option value="team">Sort: Team</option><option value="goals">Sort: Goals</option><option value="assists">Sort: Assists</option></select></div>
    <p className="cpl-muted">{list.length} player{list.length===1?"":"s"} shown</p>
    <div className="cpl-player-grid">{list.map(p=><PlayerCard key={p.id} p={p}/>)}</div>
    {!list.length&&<Empty text={all.length?"No players match your search.":"No players have been approved yet."}/>}
  </section>;
}
function TeamPage({id,data,user,me,onRefresh}:{id:string;data:Bootstrap|null;user:User|null;me:CplMe|null;onRefresh:()=>Promise<void>}){
  const [d,setDetail]=useState<any>(null); const [err,setErr]=useState(""); const [busy,setBusy]=useState(false); const [edit,setEdit]=useState(false);
  useEffect(()=>{let live=true;setErr("");cplApi.team(id).then(x=>{if(live)setDetail(x);}).catch(e=>{if(live)setErr(errorText(e));});return()=>{live=false;};},[id,data]);
  const pub=data?.teams.find(t=>t.id===id) as any;
  if(err)return <section className="cpl-section cpl-public-page"><a className="cpl-back" href="#top">← Back to home</a><div className="cpl-live-error">{err}</div></section>;
  if(!d)return <section className="cpl-section cpl-public-page"><a className="cpl-back" href="#top">← Back to home</a><Empty text="Loading team…"/></section>;
  const t=d.team, st=d.standing, players:PublicPlayer[]=d.players||[];
  const following=me?.follows.some(f=>f.teamId===id);
  const toggleFollow=async()=>{if(!user)return;setBusy(true);try{await cplApi.action(user,following?"unfollow_team":"follow_team",{teamId:id});await onRefresh();}finally{setBusy(false);}};
  const done:FixtureX[]=(d.fixtures||[]).filter((f:FixtureX)=>f.result), next:FixtureX[]=(d.fixtures||[]).filter((f:FixtureX)=>!f.result);
  const Row=({f}:{f:FixtureX})=><div className="cpl-result" key={f.id}><span>{fmtDate(f.kickoffAt)}</span><TeamTag logo={f.homeLogo} name={f.homeTeamName} id={f.homeTeamId}/><b>{f.result?`${f.result.homeScore} — ${f.result.awayScore}`:fmtTime(f.kickoffAt)}</b><TeamTag logo={f.awayLogo} name={f.awayTeamName} id={f.awayTeamId}/></div>;
  return <section className="cpl-section cpl-public-page" id="team-page">
    <a className="cpl-back" href="#top"><ArrowRight size={14} style={{transform:"rotate(180deg)"}}/> Back to home</a>
    <div className="cpl-team-hero"><span className="cpl-team-hero-logo"><Logo src={t.logo} size={44}/></span><div><span className="cpl-section-kicker">LEAGUE {t.league}</span><h2>{t.name}</h2><p>{t.description||"The official CPL team page."}</p>
      <div className="cpl-team-facts">{t.homeGround&&<span><b>Home ground</b>{t.homeGround}</span>}{t.foundedYear&&<span><b>Founded</b>{t.foundedYear}</span>}{t.kitColors&&<span><b>Kit colours</b>{t.kitColors}</span>}{t.coachName&&<span><b>Coach</b>{t.coachName}</span>}</div>
      <div className="cpl-hero-actions">{user&&<button className="cpl-secondary-cta" disabled={busy} onClick={toggleFollow}><Users size={15}/> {following?"Following":"Follow team"}</button>}{d.whatsappGroup&&<a className="cpl-primary-cta" href={d.whatsappGroup} target="_blank" rel="noreferrer">Join WhatsApp group</a>}{me?.isChairman&&<button className="cpl-secondary-cta" onClick={()=>setEdit(!edit)}><Shield size={15}/> {edit?"Close editor":"Admin: edit team page"}</button>}</div></div></div>
    {me?.isChairman&&edit&&pub&&<div className="cpl-dash-card"><TeamProfileEditor team={pub as EditableTeam} role="chairman" user={user} onRefresh={onRefresh}/></div>}
    {st&&<div className="cpl-kpi-grid"><Kpi label="Position" value={`#${st.position}`} icon={<Trophy size={18}/>}/><Kpi label="Played" value={st.played} icon={<CalendarDays size={18}/>}/><Kpi label="W · D · L" value={`${st.wins}·${st.draws}·${st.losses}`} icon={<BarChart3 size={18}/>}/><Kpi label="Goals F · A" value={`${st.goalsFor}·${st.goalsAgainst}`} icon={<Goal size={18}/>}/><Kpi label="Points" value={st.points} icon={<Medal size={18}/>}/></div>}
    <h3 className="cpl-page-sub">Squad ({players.length})</h3>
    <div className="cpl-player-grid">{players.map(p=><PlayerCard key={p.id} p={p}/>)}</div>{!players.length&&<Empty text="No players have been approved for this team yet."/>}
    <div className="cpl-dashboard-grid two"><DashCard title="Upcoming fixtures" icon={<CalendarDays size={18}/>}><div className="cpl-results-list">{next.length?next.map(f=><Row key={f.id} f={f}/>):<Empty text="No upcoming fixtures."/>}</div></DashCard>
    <DashCard title="Results" icon={<CheckCircle2 size={18}/>}><div className="cpl-results-list">{done.length?done.slice().reverse().map(f=><Row key={f.id} f={f}/>):<Empty text="No official results yet."/>}</div></DashCard></div>
  </section>;
}
function parseRoute():{name:"home"|"team"|"players";id?:string}{const h=typeof window==="undefined"?"":window.location.hash;if(h.startsWith("#/team/"))return{name:"team",id:decodeURIComponent(h.slice(7))};if(h==="#/players")return{name:"players"};return{name:"home"};}
function errorText(e:unknown){return e instanceof Error?e.message:"Something went wrong.";}

type EditableTeam={id:string;name:string;league?:string;description?:string;whatsappGroupId?:string;badgeFileId?:string;logo?:string;homeGround?:string;foundedYear?:string;kitColors?:string};
function TeamProfileEditor({team,role,user,onRefresh}:{team:EditableTeam;role:"chairman"|"coach";user:User|null;onRefresh:()=>Promise<void>}){
  const [name,setName]=useState(team.name||"");
  const [league,setLeague]=useState<"A"|"B">(team.league==="B"?"B":"A");
  const [description,setDescription]=useState(team.description||"");
  const [whatsappGroupId,setWhatsappGroupId]=useState(team.whatsappGroupId||"");
  const [homeGround,setHomeGround]=useState(team.homeGround||""); const [foundedYear,setFoundedYear]=useState(team.foundedYear||""); const [kitColors,setKitColors]=useState(team.kitColors||"");
  const [image,setImage]=useState<{name:string;mimeType:string;base64:string}|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  useEffect(()=>{setName(team.name||"");setLeague(team.league==="B"?"B":"A");setDescription(team.description||"");setWhatsappGroupId(team.whatsappGroupId||"");},[team.id,team.name,team.league,team.description,team.whatsappGroupId]);
  const save=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault(); if(!user)return;
    setBusy(true);setNotice("");
    try{
      const action=role==="chairman"?"chairman_update_team":"coach_save_team_profile";
      await cplApi.action(user,action,{teamId:team.id,name:name.trim(),league,description:description.trim(),whatsappGroupId:whatsappGroupId.trim(),...(role==="chairman"?{homeGround:homeGround.trim(),foundedYear:foundedYear.trim(),kitColors:kitColors.trim()}:{}),...(image?{image}:{})});
      setImage(null);setNotice("Team details saved.");await onRefresh();
    }catch(e){setNotice(errorText(e));}finally{setBusy(false);}
  };
  const chooseImage=async(file?:File)=>{
    if(!file){setImage(null);return;}
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)){setNotice("Choose a JPG, PNG or WEBP image.");return;}
    if(file.size>5*1024*1024){setNotice("Team logo must be 5 MB or smaller.");return;}
    const reader=new FileReader();
    reader.onload=()=>{const data=String(reader.result||"");setImage({name:file.name,mimeType:file.type,base64:data});setNotice("");};
    reader.onerror=()=>setNotice("Could not read the selected image.");
    reader.readAsDataURL(file);
  };
  return <form className="cpl-team-editor" onSubmit={save}>
    <div className="cpl-team-editor-head"><div className="cpl-team-editor-logo">{image?<img src={image.base64} alt="New team logo preview"/>:team.logo?<Logo src={team.logo} size={21}/>:<Shield size={21}/>}</div><div><strong>{team.name}</strong><small>{role==="chairman"?"Chairman team settings":"Coach team profile"}</small></div></div>
    {role==="chairman"&&<div className="cpl-team-editor-row"><label>Team name<input value={name} onChange={e=>setName(e.target.value)} required maxLength={80}/></label><label>League<select value={league} onChange={e=>setLeague(e.target.value as "A"|"B")}><option value="A">League A</option><option value="B">League B</option></select></label></div>}
    {role==="chairman"&&<div className="cpl-team-editor-row"><label>Home ground<input value={homeGround} onChange={e=>setHomeGround(e.target.value)} maxLength={80}/></label><label>Founded (year)<input value={foundedYear} onChange={e=>setFoundedYear(e.target.value)} maxLength={4} inputMode="numeric"/></label><label>Kit colours<input value={kitColors} onChange={e=>setKitColors(e.target.value)} maxLength={60} placeholder="e.g. Green & white"/></label></div>}
    <label>Team description<textarea value={description} onChange={e=>setDescription(e.target.value)} rows={2} maxLength={500} placeholder="Describe your team"/></label>
    <label>WhatsApp group link or ID<input value={whatsappGroupId} onChange={e=>setWhatsappGroupId(e.target.value)} placeholder="https://chat.whatsapp.com/..."/></label>
    <label>Team logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>chooseImage(e.target.files?.[0])}/><small>JPG, PNG or WEBP · maximum 5 MB</small></label>
    {notice&&<p className="cpl-team-editor-notice">{notice}</p>}
    <button type="submit" disabled={busy||!user}>{busy?"Saving…":"Save team details"}</button>
  </form>;
}

function Dashboard({user,me,data,onSignIn,onRefresh}:{user:User|null;me:CplMe|null;data:Bootstrap|null;onSignIn:()=>void;onRefresh:()=>Promise<void>}){
  const [busy,setBusy]=useState(""); const [message,setMessage]=useState("");
  const [selectedTeam,setSelectedTeam]=useState(me?.assignedTeams?.[0]?.id||"");
  const [selectedFixture,setSelectedFixture]=useState(me?.assignedFixtures?.[0]?.id||"");
  const [newTeamName,setNewTeamName]=useState("");
  const [newTeamLeague,setNewTeamLeague]=useState<"A"|"B">("A");
  const [newTeamDescription,setNewTeamDescription]=useState("");
  const [newTeamCoachEmail,setNewTeamCoachEmail]=useState("");
  const role: CplRole=me?.isChairman?"chairman":(me?.activeRole||"fan");
  const doAction=async(action:string,body:Record<string,unknown>={})=>{if(!user)return;setBusy(action);setMessage("");try{await cplApi.action(user,action,body);setMessage("CPL updated successfully.");await onRefresh();}catch(e){setMessage(errorText(e));}finally{setBusy("");}};
  const teamFixtures=data?.fixtures.filter(f=>selectedTeam&&(f.homeTeamId===selectedTeam||f.awayTeamId===selectedTeam))||[];
  const refereeFixtures=me?.assignedFixtures||[];
  const pendingResults=me?.pendingReports||[];
  const pendingRoles=me?.roleRequests?.filter(r=>r.status==="pending")||[];
  const pendingPlayers=me?.playerApplications?.filter(r=>r.status==="pending")||[];
  const myApplications=me?.playerApplications?.filter(a=>a.uid===me.uid)||[];
  const myRoleRequests=me?.roleRequests?.filter(r=>r.uid===me.uid)||[];
  const [appTeam,setAppTeam]=useState(""); const [appPosition,setAppPosition]=useState(""); const [appJersey,setAppJersey]=useState("");
  const [pd,setPd]=useState<Record<string,string>>({}); const [appPhoto,setAppPhoto]=useState<{name:string;mimeType:string;base64:string}|null>(null);
  const setD=(k:string)=>(e:{target:{value:string}})=>setPd(p=>({...p,[k]:e.target.value}));
  const pickPhoto=(file?:File)=>{if(!file){setAppPhoto(null);return;}if(!["image/jpeg","image/png","image/webp"].includes(file.type)){setMessage("Choose a JPG, PNG or WEBP photo.");return;}if(file.size>5*1024*1024){setMessage("Photo must be 5 MB or smaller.");return;}const rd=new FileReader();rd.onload=()=>setAppPhoto({name:file.name,mimeType:file.type,base64:String(rd.result||"")});rd.readAsDataURL(file);};

  return <section className="cpl-dashboard" id="my-cpl">
    <div className="cpl-dashboard-head">
      <div><span className="cpl-section-kicker">MY CPL</span><h2>{role==="chairman"?"Chairman control centre":role==="coach"?"Team coach dashboard":role==="player"?"Player dashboard":role==="referee"?"Referee dashboard":"Fan & supporter dashboard"}</h2><p>{user?.displayName||"CPL member"} · {user?.email||""}</p></div>
      <div className="cpl-dashboard-actions"><button onClick={()=>onRefresh()} disabled={!!busy}><RefreshCw size={15}/> Refresh</button>{!user&&<button className="cpl-primary-cta small" onClick={onSignIn}><LogIn size={15}/> Sign in</button>}</div>
    </div>
    {message&&<div className="cpl-dashboard-message">{message}</div>}

    {role==="chairman"&&<>
      <div className="cpl-kpi-grid"><Kpi label="Teams" value={data?.teams.length||0} icon={<Shield size={18}/>}/><Kpi label="Fixtures" value={data?.fixtures.length||0} icon={<CalendarDays size={18}/>}/><Kpi label="Pending results" value={pendingResults.length} icon={<Clock3 size={18}/>}/><Kpi label="Role requests" value={pendingRoles.length} icon={<UserPlus size={18}/>}/><Kpi label="Player applications" value={pendingPlayers.length} icon={<Users size={18}/>}/></div>
      <DashCard title="Team management" icon={<Shield size={18}/>}>
        <form className="cpl-team-create-form" onSubmit={async(e:FormEvent<HTMLFormElement>)=>{
          e.preventDefault();
          if(!newTeamName.trim()){setMessage("Enter the official team name.");return;}
          if(!user)return;
          setBusy("chairman_save_team");setMessage("");
          try{
            await cplApi.action(user,"chairman_save_team",{
              name:newTeamName.trim(),league:newTeamLeague,
              description:newTeamDescription.trim(),coachEmail:newTeamCoachEmail.trim()
            });
            setNewTeamName("");setNewTeamDescription("");setNewTeamCoachEmail("");
            setMessage("Team created successfully.");await onRefresh();
          }catch(e){setMessage(errorText(e));}
          finally{setBusy("");}
        }}>
          <label>Official team name<input value={newTeamName} onChange={e=>setNewTeamName(e.target.value)} placeholder="e.g. Chuka United" required maxLength={80}/></label>
          <label>League<select value={newTeamLeague} onChange={e=>setNewTeamLeague(e.target.value as "A"|"B")}><option value="A">League A</option><option value="B">League B</option></select></label>
          <label className="cpl-team-description">Team description<textarea value={newTeamDescription} onChange={e=>setNewTeamDescription(e.target.value)} placeholder="A short description (optional)" rows={3}/></label>
          <label className="cpl-team-coach">Approved coach email<input type="email" value={newTeamCoachEmail} onChange={e=>setNewTeamCoachEmail(e.target.value)} placeholder="coach@example.com (optional)"/></label>
          <button type="submit" disabled={busy==="chairman_save_team"}><Plus size={16}/>{busy==="chairman_save_team"?"Creating team…":"Add team"}</button>
        </form>
        <div className="cpl-team-admin-list">{data?.teams.length?data.teams.map(t=><details className="cpl-team-admin-item cpl-team-admin-edit" key={t.id}><summary><span className="cpl-team-admin-crest"><Logo src={t.logo} size={17}/></span><span><strong>{t.name}</strong><small>League {t.league}</small></span><span className="cpl-team-admin-status">Edit team</span></summary><TeamProfileEditor team={t} role="chairman" user={user} onRefresh={onRefresh}/></details>):<Empty text="No teams registered yet. Add the first team above."/>}</div>
      </DashCard>
      <div className="cpl-dashboard-grid two">
        <DashCard title="Role applications" icon={<UserPlus size={18}/>}><div className="cpl-admin-list">{pendingRoles.length?<>{pendingRoles.map(r=><div className="cpl-admin-row" key={r.id}><div><strong>{r.email}</strong><small>{r.requestedRole}{r.teamId?<> · <TeamTagById data={data!} id={r.teamId}/></>:null}</small></div><div><button disabled={busy===`role:${r.id}`} onClick={()=>doAction("chairman_review_role",{requestId:r.id,approve:true})}>Approve</button><button className="danger" onClick={()=>doAction("chairman_review_role",{requestId:r.id,approve:false})}>Reject</button></div></div>)}</>:<Empty text="No pending role applications."/>}</div></DashCard>
        <DashCard title="Player applications" icon={<Users size={18}/>}><div className="cpl-admin-list">{pendingPlayers.length?<>{pendingPlayers.map(r=><div className="cpl-admin-row" key={r.id}><div><strong>{r.fullName}</strong><small><TeamTagById data={data!} id={r.teamId}/> · {r.position||"Position TBA"}{r.jerseyNumber?` · #${r.jerseyNumber}`:""}</small><small>{(()=>{const d=parseDetails(r.detailsJson);return [d.phone&&`📞 ${d.phone}`,d.dateOfBirth&&`DOB ${d.dateOfBirth}`,d.idNumber&&`ID ${d.idNumber}`,d.course,d.preferredFoot&&`${d.preferredFoot} foot`,d.emergencyName&&`Emergency: ${d.emergencyName} ${d.emergencyPhone||""}`].filter(Boolean).join(" · ");})()}</small></div><div><button onClick={()=>doAction("chairman_review_player",{applicationId:r.id,approve:true})}>Approve</button><button className="danger" onClick={()=>doAction("chairman_review_player",{applicationId:r.id,approve:false})}>Reject</button></div></div>)}</>:<Empty text="No pending player applications."/>}</div></DashCard>
      </div>
      <DashCard title="Results awaiting verification" icon={<CheckCircle2 size={18}/>}><div className="cpl-admin-list">{pendingResults.length?pendingResults.map(r=><div className="cpl-admin-row" key={r.id}><div><strong><FixtureTags data={data!} id={r.fixtureId}/></strong><small>{r.homeScore} — {r.awayScore}</small></div><div><button onClick={()=>doAction("chairman_review_result",{reportId:r.id,approve:true})}>Approve result</button><button className="danger" onClick={()=>doAction("chairman_review_result",{reportId:r.id,approve:false})}>Return</button></div></div>):<Empty text="No results awaiting verification."/>}</div></DashCard>
    </>}

    {role==="coach"&&<>
      <div className="cpl-kpi-grid"><Kpi label="My teams" value={me?.assignedTeams.length||0} icon={<Shield size={18}/>}/><Kpi label="Fixtures" value={teamFixtures.length} icon={<CalendarDays size={18}/>}/><Kpi label="Players" value={(me as any)?.squad?.length||0} icon={<Users size={18}/>}/><Kpi label="Collections" value={me?.collections.length||0} icon={<BarChart3 size={18}/>}/></div>
      <DashCard title="Manage my team profile" icon={<Shield size={18}/>}>{me?.assignedTeams.length?me.assignedTeams.map(t=><TeamProfileEditor key={t.id} team={t as EditableTeam} role="coach" user={user} onRefresh={onRefresh}/>):<Empty text="No team has been assigned to your coach account yet."/>}</DashCard>
      <DashCard title="Player applications" icon={<Users size={18}/>}><div className="cpl-admin-list">{pendingPlayers.filter(r=>r.uid!==me?.uid).length?pendingPlayers.filter(r=>r.uid!==me?.uid).map(r=><div className="cpl-admin-row" key={r.id}><div><strong>{r.fullName}</strong><small><TeamTagById data={data!} id={r.teamId}/> · {r.position||"Position TBA"}</small><small>{(()=>{const d=parseDetails(r.detailsJson);return [d.phone&&`📞 ${d.phone}`,d.dateOfBirth&&`DOB ${d.dateOfBirth}`,d.preferredFoot&&`${d.preferredFoot} foot`].filter(Boolean).join(" · ");})()}</small></div><div><button onClick={()=>doAction("coach_review_player",{applicationId:r.id,approve:true})}>Approve</button><button className="danger" onClick={()=>doAction("coach_review_player",{applicationId:r.id,approve:false})}>Reject</button></div></div>):<Empty text="No pending player applications."/>}</div></DashCard>
      <DashCard title="My squad" icon={<Users size={18}/>}><div className="cpl-admin-list">{(me as any)?.squad?.length?(me as any).squad.map((p:Record<string,string>)=>{const d=parseDetails(p.detailsJson);return <div className="cpl-admin-row" key={p.id}><div><strong>{p.fullName}{p.jerseyNumber?` · #${p.jerseyNumber}`:""}</strong><small>{p.position||"Position TBA"}{d.phone?` · 📞 ${d.phone}`:""}{d.emergencyName?` · Emergency: ${d.emergencyName} ${d.emergencyPhone||""}`:""}</small></div></div>;}):<Empty text="No approved players yet."/>}</div></DashCard>
      <DashCard title="Team operations" icon={<ClipboardList size={18}/>}><select value={selectedTeam} onChange={e=>setSelectedTeam(e.target.value)}><option value="">Select team</option>{me?.assignedTeams.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select><div className="cpl-admin-list">{teamFixtures.slice(0,10).map(f=><div className="cpl-admin-row" key={f.id}><div><strong><TeamTag logo={(f as FixtureX).homeLogo} name={f.homeTeamName} id={f.homeTeamId} size={18}/> vs <TeamTag logo={(f as FixtureX).awayLogo} name={f.awayTeamName} id={f.awayTeamId} size={18}/></strong><small>{fmtDate(f.kickoffAt)} · {fmtTime(f.kickoffAt)} · {f.status}</small></div><div>{f.status!=="official"&&<button onClick={()=>doAction("coach_submit_lineup",{fixtureId:f.id,teamId:selectedTeam,starters:[],substitutes:[]})}>Save lineup</button>}</div></div>)}{!teamFixtures.length&&<Empty text="Select your team to view fixtures."/>}</div></DashCard>
      <DashCard title="Transfer an eligible player" icon={<Send size={18}/>}><p className="cpl-muted">Use the player ID from your approved squad. The backend will enforce the active transfer window and four-step approval flow.</p><div className="cpl-form-row"><input id="cpl-player-id" placeholder="Player ID"/><input id="cpl-destination-team" placeholder="Destination team ID"/><button onClick={()=>{const p=(document.getElementById("cpl-player-id") as HTMLInputElement)?.value;const t=(document.getElementById("cpl-destination-team") as HTMLInputElement)?.value;doAction("coach_request_transfer",{playerId:p,toTeamId:t});}}>Create offer</button></div></DashCard>
    </>}

    {role==="referee"&&<>
      <div className="cpl-kpi-grid"><Kpi label="Assigned matches" value={refereeFixtures.length} icon={<CalendarDays size={18}/>}/><Kpi label="Pending reports" value={pendingResults.length} icon={<Clock3 size={18}/>}/><Kpi label="Official results" value={data?.results.length||0} icon={<CheckCircle2 size={18}/>}/></div>
      <DashCard title="Submit match result" icon={<CheckCircle2 size={18}/>}><select value={selectedFixture} onChange={e=>setSelectedFixture(e.target.value)}><option value="">Select fixture</option>{refereeFixtures.map(f=><option value={f.id} key={f.id}>{fixtureLabel(data!,f.id)}</option>)}</select><div className="cpl-score-form"><input id="cpl-home-score" type="number" min="0" placeholder="Home score"/><span>—</span><input id="cpl-away-score" type="number" min="0" placeholder="Away score"/><button onClick={()=>{const hs=Number((document.getElementById("cpl-home-score") as HTMLInputElement)?.value);const as=Number((document.getElementById("cpl-away-score") as HTMLInputElement)?.value);doAction("referee_submit_result",{fixtureId:selectedFixture,homeScore:hs,awayScore:as,events:[]});}}>Submit result</button></div></DashCard>
    </>}

    {role==="player"&&<>
      <div className="cpl-kpi-grid"><Kpi label="Squad entries" value={me?.players.length||0} icon={<Users size={18}/>}/><Kpi label="Applications" value={myApplications.length} icon={<ClipboardList size={18}/>}/><Kpi label="Transfer offers" value={me?.pendingTransfers?.length||0} icon={<Send size={18}/>}/></div>
      <DashCard title="Player applications" icon={<ClipboardList size={18}/>}><div className="cpl-admin-list">{myApplications.length?myApplications.map(a=><div className="cpl-admin-row" key={a.id}><div><strong>{a.fullName}</strong><small><TeamTagById data={data!} id={a.teamId}/> · {a.status}</small></div></div>):<Empty text="You have no player applications."/>}</div></DashCard>
      {me?.players?.[0]&&<DashCard title="My player profile" icon={<Users size={18}/>}><PlayerProfileEditor key={me.players[0].id} user={user} row={me.players[0]} onRefresh={onRefresh}/></DashCard>}
      <DashCard title="Transfer offers" icon={<Send size={18}/>}><div className="cpl-admin-list">{me?.pendingTransfers?.length?me.pendingTransfers.map(t=><div className="cpl-admin-row" key={t.id}><div><strong>Transfer offer</strong><small><TeamTagById data={data!} id={t.fromTeamId}/> → <TeamTagById data={data!} id={t.toTeamId}/></small></div><div><button onClick={()=>doAction("player_transfer_decision",{transferId:t.id,accept:true})}>Accept</button><button className="danger" onClick={()=>doAction("player_transfer_decision",{transferId:t.id,accept:false})}>Decline</button></div></div>):<Empty text="No pending transfer offers."/>}</div></DashCard>
    </>}

    {role==="fan"&&<>
      <div className="cpl-kpi-grid"><Kpi label="Following" value={me?.follows.length||0} icon={<Users size={18}/>}/><Kpi label="Teams" value={data?.teams.length||0} icon={<Shield size={18}/>}/><Kpi label="Upcoming fixtures" value={data?.fixtures.filter(f=>f.status!=="official"&&f.status!=="cancelled").length||0} icon={<CalendarDays size={18}/>}/></div>
      <DashCard title="Follow a team" icon={<Users size={18}/>}><div className="cpl-follow-grid">{data?.teams.map(t=><button key={t.id} className={me?.follows.some(f=>f.teamId===t.id)?"following":""} onClick={()=>doAction(me?.follows.some(f=>f.teamId===t.id)?"unfollow_team":"follow_team",{teamId:t.id})}><span className="cpl-follow-logo"><Logo src={t.logo} size={14}/></span><span>{t.name}</span><small>{me?.follows.some(f=>f.teamId===t.id)?"Following":"Follow"}</small></button>)}</div></DashCard>
      <DashCard title="Become part of CPL" icon={<UserPlus size={18}/>}><p className="cpl-muted">You can remain a fan or request a CPL role. Applications are reviewed by the Chairman.</p>
        <form className="cpl-team-create-form" onSubmit={async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!appTeam){setMessage("Choose the team you want to play for.");return;}if(!pd.phone||!pd.dateOfBirth||!pd.idNumber||!pd.emergencyName||!pd.emergencyPhone){setMessage("Fill in phone, date of birth, ID/registration number and emergency contact.");return;}await doAction("player_apply",{teamId:appTeam,fullName:(pd.fullName||user?.displayName||"").trim(),position:appPosition,jerseyNumber:appJersey,message:"Player application",details:pd,...(appPhoto?{image:appPhoto}:{})});setAppPosition("");setAppJersey("");setPd({});setAppPhoto(null);}}>
          <label>Team<select value={appTeam} onChange={e=>setAppTeam(e.target.value)} required><option value="">Select team</option>{data?.teams.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></label>
          <label>Position<input value={appPosition} onChange={e=>setAppPosition(e.target.value)} placeholder="e.g. Midfielder" maxLength={30}/></label>
          <label>Preferred jersey no.<input value={appJersey} onChange={e=>setAppJersey(e.target.value)} placeholder="optional" maxLength={3} inputMode="numeric"/></label>
          <DetailsFields pd={{fullName:user?.displayName||"",...pd}} setD={setD} onPhoto={pickPhoto}/>
          <button type="submit" disabled={busy==="player_apply"}><UserPlus size={15}/> {busy==="player_apply"?"Sending…":"Apply as player"}</button>
        </form>
        <div className="cpl-role-buttons">{(["coach","referee"] as CplRole[]).map(r=><button key={r} disabled={myRoleRequests.some(x=>x.requestedRole===r&&x.status==="pending")} onClick={()=>doAction("request_role",{role:r,message:`I would like to join CPL as a ${r}.`})}><UserPlus size={15}/> {myRoleRequests.some(x=>x.requestedRole===r&&x.status==="pending")?`${r} request pending`:`Apply as ${r}`}</button>)}</div>
        {myApplications.filter(a=>a.status==="pending")[0]&&<details className="cpl-team-admin-item"><summary><span><strong>Edit my pending application</strong></span></summary><PlayerProfileEditor key={myApplications.filter(a=>a.status==="pending")[0].id} user={user} row={myApplications.filter(a=>a.status==="pending")[0]} onRefresh={onRefresh}/></details>}
        {myApplications.length>0&&<div className="cpl-admin-list">{myApplications.map(a=><div className="cpl-admin-row" key={a.id}><div><strong>Player application · <TeamTagById data={data!} id={a.teamId}/></strong><small>{a.status}</small></div></div>)}</div>}</DashCard>
    </>}
  </section>;
}
function Kpi({label,value,icon}:{label:string;value:number|string;icon:ReactNode}){return <div className="cpl-kpi"><span>{icon}</span><strong>{value}</strong><small>{label}</small></div>}
function DashCard({title,icon,children}:{title:string;icon:ReactNode;children:ReactNode}){return <article className="cpl-dash-card"><header><span>{icon}</span><h3>{title}</h3></header>{children}</article>}
function Empty({text}:{text:string}){return <div className="cpl-empty"><Clock3 size={17}/>{text}</div>}
function fixtureLabel(data:Bootstrap,fid:string){const f=data.fixtures.find(x=>x.id===fid);return f?`${f.homeTeamName} vs ${f.awayTeamName}`:fid;}

const divisions=[
  {name:"LEAGUE A",note:"The top flight",detail:"Follow the title race, fixtures, results and standings.",tone:"gold"},
  {name:"LEAGUE B",note:"The challenger division",detail:"Track every team, match and movement in the table.",tone:"silver"},
];
const features=[
  {icon:CalendarDays,title:"Fixtures & results",copy:"Follow matchdays, kick-off details and verified results."},
  {icon:Users,title:"Clubs & players",copy:"Meet the teams, discover the squads and follow your favourites."},
  {icon:Medal,title:"League standings",copy:"Track the race for the title, promotion and survival."},
  {icon:Vote,title:"Weekly awards",copy:"Have your say in Player, Goal and Manager of the Week."},
  {icon:Trophy,title:"The CPL Cup",copy:"A knockout competition bringing both divisions together."},
  {icon:Goal,title:"Stats & records",copy:"Goals, assists and season milestones."},
];

export default function Cpl({user,onSignIn}:Props){
  const [data,setData]=useState<Bootstrap|null>(null); const [me,setMe]=useState<CplMe|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [showDashboard,setShowDashboard]=useState(false); const [route,setRoute]=useState(parseRoute());
  useEffect(()=>{const h=()=>{setRoute(parseRoute());window.scrollTo(0,0);};window.addEventListener("hashchange",h);return()=>window.removeEventListener("hashchange",h);},[]);
  const load=async()=>{setError("");try{const b=await cplApi.bootstrap();setData(b);if(user)setMe(await cplApi.me(user));}catch(e){setError(errorText(e));}finally{setLoading(false);}};
  useEffect(()=>{load();},[user?.uid]);
  const goTo=(id:string)=>{const go=()=>document.getElementById(id)?.scrollIntoView({behavior:"smooth"});if(route.name!=="home"){window.location.hash="#top";window.setTimeout(go,120);}else go();};
  const upcoming=useMemo(()=>data?.fixtures.filter(f=>f.status!=="official"&&f.status!=="cancelled").sort((a,b)=>new Date(a.kickoffAt).getTime()-new Date(b.kickoffAt).getTime()).slice(0,4)||[],[data]);
  const results=useMemo(()=>data?.fixtures.filter(f=>f.result).sort((a,b)=>new Date(b.kickoffAt).getTime()-new Date(a.kickoffAt).getTime()).slice(0,4)||[],[data]);
  const topScorers=data?.topScorers||[]; const topAssists=data?.topAssists||[];
  return <main className="cpl-landing">
    <header className="cpl-site-header"><a className="cpl-brand" href="#top" aria-label="Chuka Premier League home"><img className="cpl-logo" src={`${import.meta.env.BASE_URL}cpllogo.jpeg`} alt="Chuka Premier League logo"/><span><strong>CHUKA PREMIER LEAGUE</strong><small>CHUKA COMRADES FOOTBALL</small></span></a><nav className="cpl-main-nav"><button onClick={()=>goTo("divisions")}>The league</button><button onClick={()=>goTo("match-centre")}>Match centre</button><button onClick={()=>goTo("clubs")}>Clubs</button><button onClick={()=>{window.location.hash="#/players";}}>Players</button><button onClick={()=>goTo("stats")}>Top stats</button><button onClick={()=>goTo("awards")}>Awards</button></nav><button className="cpl-login" onClick={()=>user?setShowDashboard(!showDashboard):onSignIn()}>{user?"My CPL":"Sign in"}<ArrowUpRight size={15}/></button></header>
    {showDashboard&&<Dashboard user={user} me={me} data={data} onSignIn={onSignIn} onRefresh={load}/>} 
    {route.name==="team"&&route.id&&<TeamPage id={route.id} data={data} user={user} me={me} onRefresh={load}/>}
    {route.name==="players"&&<PlayersPage data={data as any}/>}
    {route.name==="home"&&<>
    <section className="cpl-hero-full" id="top"><div className="cpl-hero-grid"/><div className="cpl-hero-content"><div className="cpl-eyebrow"><span className="cpl-live-pip"/> THE HOME OF CHUKA COMRADES FOOTBALL</div><h1>ONE CAMPUS.<br/><em>ONE LEAGUE.</em><br/>ONE CHAMPION.</h1><p className="cpl-hero-copy">The passion. The rivalries. The glory. Follow every moment of the Chuka Premier League.</p><div className="cpl-hero-actions"><button className="cpl-primary-cta" onClick={()=>goTo("divisions")}>Explore the league <ArrowRight size={17}/></button><button className="cpl-secondary-cta" onClick={()=>goTo("match-centre")}>Match centre <CircleDot size={15}/></button></div><div className="cpl-hero-meta"><span><Shield size={15}/> LEAGUE A & LEAGUE B</span><i/><span><Crown size={15}/> {data?.season.name||"CPL SEASON"}</span></div></div><div className="cpl-hero-art" aria-hidden="true"><div className="cpl-orbit orbit-one"/><div className="cpl-orbit orbit-two"/><div className="cpl-ball"><div className="cpl-ball-panel"/><div className="cpl-ball-seam"/></div><div className="cpl-hero-stamp"><img src={`${import.meta.env.BASE_URL}cpllogo.jpeg`} alt=""/></div><div className="cpl-hero-vertical">THE BEAUTIFUL GAME · CHUKA</div></div><button className="cpl-scroll-cue" onClick={()=>goTo("divisions")}><ArrowDown size={15}/> SCROLL TO EXPLORE</button><div className="cpl-hero-index">01 <span>/</span> 04</div></section>
    {error&&<div className="cpl-live-error"><strong>CPL live data:</strong> {error}</div>}
    <section className="cpl-section cpl-divisions" id="divisions"><div className="cpl-section-heading"><div><span className="cpl-section-kicker">THE COMPETITION</span><h2>Two divisions.<br/><em>One ambition.</em></h2></div><p>Every match matters. Every point counts. {data?.season.name?`Now tracking ${data.season.name}.`:"Live season data will appear here."}</p></div><div className="cpl-division-grid">{divisions.map((d,i)=><article className={`cpl-division-card ${d.tone}`} key={d.name}><div className="cpl-division-top"><span>0{i+1} / DIVISION</span><Shield size={22}/></div><div><h3>{d.name}</h3><strong>{d.note}</strong><p>{d.detail}</p>{data&&<small className="cpl-live-count">{data.teams.filter(t=>t.league===d.name.slice(-1)).length} registered teams</small>}</div><button onClick={()=>goTo("standings")}>View standings <ArrowUpRight size={16}/></button><span className="cpl-division-watermark">{i===0?"A":"B"}</span></article>)}</div></section>
    <section className="cpl-match-band" id="match-centre"><div className="cpl-match-band-inner"><div><span className="cpl-section-kicker">THE MATCH CENTRE</span><h2>Every game.<br/><em>Every moment.</em></h2><p>{loading?"Loading live fixtures…":"Official fixtures, verified results and match information from CPL."}</p></div><div className="cpl-live-fixtures"><div className="cpl-match-label"><span><i/> LIVE DATA</span><span>UPCOMING</span></div>{upcoming.length?upcoming.map(f=><FixtureCard key={f.id} f={f}/>):<Empty text="No upcoming fixtures have been published."/>}</div></div><div className="cpl-results-row"><div><span className="cpl-section-kicker">RECENT RESULTS</span>{results.length?results.map(f=><div className="cpl-result" key={f.id}><span>{fmtDate(f.kickoffAt)}</span><TeamTag logo={(f as FixtureX).homeLogo} name={f.homeTeamName} id={f.homeTeamId}/><b>{f.result?.homeScore} — {f.result?.awayScore}</b><TeamTag logo={(f as FixtureX).awayLogo} name={f.awayTeamName} id={f.awayTeamId}/></div>):<Empty text="No official results yet."/>}</div></div></section>
    <section className="cpl-section cpl-leaderboards" id="stats"><div className="cpl-section-heading"><div><span className="cpl-section-kicker">THE GOLDEN BOOT & PLAYMAKERS</span><h2>Numbers that<br/><em>make history.</em></h2></div><p>These rankings are calculated from Chairman-approved match reports, so provisional referee submissions do not alter public statistics.</p></div><div className="cpl-leaderboard-grid"><Leaderboard title="Top Scorers" kicker="THE GOLDEN BOOT" icon={<Goal size={22}/>} rows={topScorers} suffix=" goals"/><Leaderboard title="Top Assists" kicker="THE CREATIVE ENGINE" icon={<Users size={22}/>} rows={topAssists} suffix=" assists"/></div></section>
    <section className="cpl-section cpl-standings" id="standings"><div className="cpl-section-heading"><div><span className="cpl-section-kicker">THE TABLE</span><h2>League<br/><em>standings.</em></h2></div><p>Three points for a win, one for a draw, with official results driving the table.</p></div><div className="cpl-standing-grid">{(data?.standings||[]).map(group=><div className="cpl-table-card" key={group.league}><header><span>LEAGUE {group.league}</span><strong>PTS</strong></header>{group.rows.map((r,i)=><div className="cpl-table-row" key={r.teamId}><span>{i+1}</span><strong><TeamTag logo={(r as any).logo} name={r.team} id={r.teamId}/></strong><small>{r.played}P · {r.goalDifference>=0?"+":""}{r.goalDifference} GD</small><b>{r.points}</b></div>)}{!group.rows.length&&<Empty text="No teams registered."/>}</div>)}</div></section>
    <section className="cpl-section cpl-features" id="clubs"><div className="cpl-section-heading"><div><span className="cpl-section-kicker">INSIDE THE LEAGUE</span><h2>More than<br/><em>ninety minutes.</em></h2></div><p>From the touchline to the terraces, this is your home for everything happening across CPL.</p></div><div className="cpl-feature-grid">{features.map(({icon:Icon,title,copy},i)=><article className="cpl-feature" key={title}><span className="cpl-feature-number">0{i+1}</span><Icon size={24}/><h3>{title}</h3><p>{copy}</p><ChevronRight size={17} className="cpl-feature-arrow"/></article>)}</div><div className="cpl-team-grid">{(data?.teams||[]).map(t=><button key={t.id} onClick={()=>{window.location.hash=`#/team/${encodeURIComponent(t.id)}`;}} className="cpl-team-card"><span><Logo src={t.logo} size={24}/></span><strong>{t.name}</strong><small>League {t.league}</small></button>)}</div><div className="cpl-hero-actions"><a className="cpl-primary-cta" href="#/players">Browse all players <ArrowRight size={16}/></a></div></section>
    <section className="cpl-awards-strip" id="awards"><div><span className="cpl-section-kicker">THE FANS HAVE A VOICE</span><h2>Celebrate the<br/><em>ones who deliver.</em></h2><p>Weekly recognition for the players, goals and coaches who make the league special.</p></div><div className="cpl-award-list"><span><Medal size={19}/> PLAYER OF THE WEEK</span><span><Goal size={19}/> GOAL OF THE WEEK</span><span><Crown size={19}/> MANAGER OF THE WEEK</span></div></section>
    </>}
    <footer className="cpl-footer"><a className="cpl-brand" href="#top"><img className="cpl-logo" src={`${import.meta.env.BASE_URL}cpllogo.jpeg`} alt="Chuka Premier League logo"/><span><strong>CHUKA PREMIER LEAGUE</strong><small>CHUKA COMRADES FOOTBALL</small></span></a><span>BUILT FOR THE LOVE OF THE GAME.</span><button onClick={()=>goTo("top")}>BACK TO TOP ↑</button></footer>
  </main>;
}
function FixtureCard({f}:{f:Fixture}){return <article className="cpl-fixture-card"><div className="cpl-fixture-date"><span>{fmtDate(f.kickoffAt)}</span><b>{fmtTime(f.kickoffAt)}</b></div><div className="cpl-fixture-teams"><TeamTag logo={(f as FixtureX).homeLogo} name={f.homeTeamName} id={f.homeTeamId}/><span>VS</span><TeamTag logo={(f as FixtureX).awayLogo} name={f.awayTeamName} id={f.awayTeamId}/></div><small>{f.venue||"Venue TBA"} · League {f.league}</small></article>}
function Leaderboard({title,kicker,icon,rows,suffix}:{title:string;kicker:string;icon:ReactNode;rows:any[];suffix:string}){return <article className="cpl-leaderboard-card"><div className="cpl-leaderboard-heading"><span className="cpl-stat-icon">{icon}</span><div><span>{kicker}</span><h3>{title}</h3></div><Trophy className="cpl-leaderboard-trophy" size={27}/></div>{rows.length?rows.slice(0,5).map((r,i)=><div className="cpl-stat-row" key={r.playerId}><span>{String(i+1).padStart(2,"0")}</span><div><strong>{r.name}</strong><small><TeamTag logo={r.teamLogo} name={r.teamName||""} id={r.teamId} size={16}/></small></div><b>{r.value}<small>{suffix}</small></b></div>):<div className="cpl-leaderboard-empty"><span className="cpl-player-placeholder">00</span><div><strong>No verified rankings yet</strong><p>Approved match events will populate this leaderboard.</p></div><b>—</b></div>}<div className="cpl-leaderboard-foot">OFFICIAL {title.toUpperCase()} · ALL DIVISIONS</div></article>}