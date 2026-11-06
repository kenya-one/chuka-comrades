/**
 * CHUKA PREMIER LEAGUE — GOOGLE APPS SCRIPT BACKEND
 * Phase 1: complete Google Sheets + Google Drive data layer.
 *
 * Architecture:
 *   Firebase Google Auth (browser)
 *          |
 *          v
 *   Apps Script Web App (this file)
 *          |
 *      +---+-------------------+
 *      |                       |
 *   Google Sheets          Google Drive
 *   structured data        images/files
 *
 * IMPORTANT:
 * - Coaches, players and fans never edit the Sheets directly.
 * - All writes go through this Apps Script.
 * - Chairman is the only CPL admin role.
 * - Chairman and Secretary are NOT separate CPL roles.
 * - Firebase ID tokens are verified through Firebase Identity Toolkit.
 * - Drive files are private by default; public image URLs are only created
 *   for media explicitly intended for the public CPL page.
 */

const CPL = {
  spreadsheetName: 'Chuka Premier League Database',
  driveFolderName: 'CPL FILE STORAGE',
  maxImageBytes: 5 * 1024 * 1024,
  sheets: {
    Settings: ['key','value','description','updatedAt'],
    Users: ['uid','email','displayName','photoUrl','activeRole','status','createdAt','updatedAt'],
    RoleRequests: ['id','uid','email','requestedRole','teamId','message','status','reviewedBy','reviewedAt','createdAt'],
    Seasons: ['id','name','status','startDate','endDate','createdAt','updatedAt'],
    TransferWindows: ['id','seasonId','name','startAt','endAt','status','createdBy','createdAt','updatedAt'],
    Teams: ['id','seasonId','name','league','description','badgeFileId','coachUid','captainPlayerId','whatsappGroupId','status','createdAt','updatedAt'],
    Players: ['id','uid','fullName','teamId','seasonId','jerseyNumber','position','photoFileId','status','approvedBy','joinedAt','updatedAt'],
    PlayerApplications: ['id','uid','fullName','teamId','seasonId','jerseyNumber','position','message','status','reviewedBy','reviewedAt','createdAt'],
    Follows: ['uid','teamId','createdAt'],
    Fixtures: ['id','seasonId','competitionId','roundName','league','homeTeamId','awayTeamId','venue','kickoffAt','lineupDeadlineAt','refereeUid','status','createdBy','createdAt','updatedAt'],
    MatchPosters: ['id','fixtureId','teamId','fileId','imageUrl','uploadedBy','status','createdAt','removedAt','removedBy'],
    Lineups: ['id','fixtureId','teamId','submittedBy','submittedAt','isLate','startersJson','substitutesJson','goalkeeperId','captainPlayerId','lockedAt'],
    MatchReports: ['id','fixtureId','refereeUid','homeScore','awayScore','eventsJson','homeFeeStatus','awayFeeStatus','notes','status','verifiedBy','verifiedAt','createdAt','updatedAt'],
    MatchEvents: ['id','fixtureId','teamId','playerId','eventType','minute','details','createdAt'],
    Transfers: ['id','windowId','seasonId','playerId','fromTeamId','toTeamId','status','currentStep','offerExpiresAt','playerDecision','playerDecisionAt','currentCoachDecision','currentCoachDecisionAt','finalApprovedBy','finalApprovedAt','createdAt','updatedAt'],
    TransferLog: ['id','transferId','step','actorUid','actorEmail','action','note','createdAt'],
    Competitions: ['id','seasonId','name','type','status','startDate','rules','createdBy','createdAt','updatedAt'],
    CompetitionTeams: ['id','competitionId','teamId','seed','status','createdAt'],
    CompetitionRounds: ['id','competitionId','roundName','roundNumber','drawMode','createdAt'],
    CompetitionFixtures: ['id','competitionId','roundNumber','roundName','fixtureId','homeTeamId','awayTeamId','winnerTeamId','status','createdAt','updatedAt'],
    Votes: ['id','weekKey','category','nomineeId','voterUid','createdAt'],
    Awards: ['id','weekKey','category','winnerId','status','createdAt'],
    TeamCollections: ['id','teamId','seasonId','title','description','targetAmount','status','completedAt','deletionStatus','deletionRequestedAt','deletionApprovedAt','approvalCode','approvedBy','createdAt','updatedAt'],
    CollectionPayments: ['id','collectionId','payerUid','payerName','amount','paymentMethod','reference','status','createdAt'],
    Finance: ['id','teamId','seasonId','category','description','amount','currency','recordedBy','visibility','createdAt'],
    WhatsAppGroups: ['id','seasonId','teamId','groupType','inviteUrl','status','approvedBy','approvedAt','updatedBy','updatedAt'],
    News: ['id','title','body','imageFileId','imageUrl','category','status','authorUid','createdAt','updatedAt'],
    DriveFiles: ['id','fileId','folder','ownerUid','relatedRecordType','relatedRecordId','mimeType','url','visibility','createdAt'],
    Disputes: ['id','fixtureId','teamId','submittedBy','description','evidenceFileIds','status','chairmanDecision','decidedBy','decidedAt','createdAt','updatedAt'],
    AuditLog: ['id','actorUid','actorEmail','role','action','recordType','recordId','details','prevHash','entryHash','createdAt'],
    DeletionReceipts: ['id','recordType','recordId','title','teamId','totalAmount','approvalCode','approvedBy','approvedAt','createdAt']
  },
  folders: [
    'Team Badges','Player Photos','Match Posters','News Media',
    'Dispute Evidence','Receipts','League Documents'
  ],
  defaults: {
    points_win: 3,
    points_draw: 1,
    points_loss: 0,
    referee_fee_per_team: 200,
    lineup_deadline_minutes: 5,
    step_expiry_days: 7,
    max_match_posters_per_team: 1
  }
};

function setupCplSystem() {
  const props = PropertiesService.getScriptProperties();
  let ss;
  const existingId = props.getProperty('CPL_SPREADSHEET_ID');
  if (existingId) {
    try { ss = SpreadsheetApp.openById(existingId); } catch (e) {}
  }
  if (!ss) ss = SpreadsheetApp.create(CPL.spreadsheetName);
  props.setProperty('CPL_SPREADSHEET_ID', ss.getId());

  Object.keys(CPL.sheets).forEach(function(name) {
    const headers = CPL.sheets[name];
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1,1,1,headers.length).setValues([headers]);
      sh.getRange(1,1,1,headers.length).setFontWeight('bold');
      sh.setFrozenRows(1);
    } else {
      const current = sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
      const mismatch = headers.some(function(h,i){ return String(current[i] || '') !== h; });
      if (mismatch) throw new Error('Header mismatch in ' + name + '. Back up data before changing schema.');
    }
  });

  let folder;
  const folderId = props.getProperty('CPL_DRIVE_FOLDER_ID');
  if (folderId) {
    try { folder = DriveApp.getFolderById(folderId); } catch (e) {}
  }
  if (!folder) {
    folder = DriveApp.createFolder(CPL.driveFolderName);
    props.setProperty('CPL_DRIVE_FOLDER_ID', folder.getId());
  }
  CPL.folders.forEach(function(name) {
    const it = folder.getFoldersByName(name);
    if (!it.hasNext()) folder.createFolder(name);
  });

  Object.keys(CPL.defaults).forEach(function(key) {
    if (!findSetting_(key)) setSetting_(key, CPL.defaults[key], 'CPL default');
  });

  if (!activeSeason_()) {
    const id = Utilities.getUuid();
    append_('Seasons',[id,'CPL Season 2026/27','active','','',new Date(),new Date()]);
  }

  return {
    success: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    driveFolderId: folder.getId(),
    driveFolderUrl: folder.getUrl(),
    sheets: Object.keys(CPL.sheets),
    folders: CPL.folders
  };
}

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = p.action || 'bootstrap';
    let result;
    if (action === 'bootstrap') result = publicBootstrap_();
    else if (action === 'public_team') result = publicTeam_(p.teamId);
    else if (action === 'public_fixture') result = publicFixture_(p.fixtureId);
    else if (action === 'public_competitions') result = publicCompetitions_();
    else throw new Error('Unsupported public action.');
    return output_({success:true, data:result}, p.callback);
  } catch (err) {
    return output_({success:false, error:String(err.message || err)}, e && e.parameter && e.parameter.callback);
  }
}

function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const user = verifyFirebaseUser_(req.idToken);
    const result = dispatch_(req, user);
    return output_({success:true, data:result});
  } catch (err) {
    return output_({success:false, error:String(err.message || err)});
  }
}

function output_(obj, callback) {
  const body = JSON.stringify(obj);
  if (callback) {
    if (!/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) throw new Error('Invalid callback.');
    return ContentService.createTextOutput(callback + '(' + body + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

function verifyFirebaseUser_(idToken) {
  if (!idToken) throw new Error('Authentication required. Please sign in.');
  const apiKey = PropertiesService.getScriptProperties().getProperty('FIREBASE_WEB_API_KEY');
  if (!apiKey) throw new Error('Backend setup incomplete: set FIREBASE_WEB_API_KEY.');

  const url = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(apiKey);
  const res = UrlFetchApp.fetch(url,{
    method:'post',
    contentType:'application/json',
    payload:JSON.stringify({idToken:idToken}),
    muteHttpExceptions:true
  });
  const json = JSON.parse(res.getContentText() || '{}');
  if (res.getResponseCode() !== 200 || !json.users || !json.users.length) {
    throw new Error('Your Firebase sign-in session is invalid or expired.');
  }
  const f = json.users[0];
  const user = {
    uid: f.localId,
    email: String(f.email || '').toLowerCase(),
    displayName: f.displayName || '',
    photoUrl: f.photoUrl || '',
    emailVerified: f.emailVerified === true
  };
  if (!user.emailVerified) throw new Error('Verify your email before using CPL.');
  upsertUser_(user);
  return user;
}

function dispatch_(r,u) {
  const a = String(r.action || '');
  if (a === 'cpl_me') return {me:getMe_(u)};
  if (a === 'request_role') return requestRole_(r,u);
  if (a === 'follow_team') return follow_(r,u,true);
  if (a === 'unfollow_team') return follow_(r,u,false);
  if (a === 'player_apply') return playerApply_(r,u);

  if (a === 'chairman_save_season') { requireChairman_(u); return saveSeason_(r,u); }
  if (a === 'chairman_save_transfer_window') { requireChairman_(u); return saveTransferWindow_(r,u); }
  if (a === 'chairman_save_team') { requireChairman_(u); return saveTeam_(r,u); }
  if (a === 'chairman_update_team') { requireChairman_(u); return updateTeamProfile_(r,u,true); }
  if (a === 'chairman_assign_captain') { requireChairman_(u); return assignCaptain_(r,u); }
  if (a === 'chairman_review_role') { requireChairman_(u); return reviewRole_(r,u); }
  if (a === 'chairman_review_player') { requireChairman_(u); return reviewPlayer_(r,u); }
  if (a === 'chairman_save_fixture') { requireChairman_(u); return saveFixture_(r,u); }
  if (a === 'chairman_assign_referee') { requireChairman_(u); return assignReferee_(r,u); }
  if (a === 'chairman_review_result') { requireChairman_(u); return reviewResult_(r,u); }
  if (a === 'chairman_create_competition') { requireChairman_(u); return createCompetition_(r,u); }
  if (a === 'chairman_create_cup_round') { requireChairman_(u); return createCupRound_(r,u); }
  if (a === 'chairman_add_cup_teams') { requireChairman_(u); return addCupTeams_(r,u); }
  if (a === 'chairman_save_whatsapp_group') { requireChairman_(u); return saveWhatsAppGroup_(r,u); }
  if (a === 'chairman_approve_whatsapp_group') { requireChairman_(u); return approveWhatsAppGroup_(r,u); }
  if (a === 'chairman_save_news') { requireChairman_(u); return saveNews_(r,u); }
  if (a === 'chairman_remove_poster') { requireChairman_(u); return removePoster_(r,u); }
  if (a === 'chairman_review_dispute') { requireChairman_(u); return decideDispute_(r,u); }
  if (a === 'chairman_approve_collection_deletion') { requireChairman_(u); return approveCollectionDeletion_(r,u); }
  if (a === 'chairman_approve_transfer') { requireChairman_(u); return approveFinalTransfer_(r,u); }

  if (a === 'coach_save_team_profile') { requireRole_(u,['coach']); return updateTeamProfile_(r,u,false); }
  if (a === 'coach_submit_lineup') { requireRole_(u,['coach','chairman']); return submitLineup_(r,u); }
  if (a === 'coach_upload_poster') { requireRole_(u,['coach','chairman']); return uploadMatchPoster_(r,u); }
  if (a === 'coach_create_collection') { requireRole_(u,['coach','chairman']); return createCollection_(r,u); }
  if (a === 'coach_complete_collection') { requireRole_(u,['coach','chairman']); return completeCollection_(r,u); }
  if (a === 'coach_request_transfer') { requireRole_(u,['coach']); return createTransferOffer_(r,u); }

  if (a === 'player_transfer_decision') return playerTransferDecision_(r,u);
  if (a === 'coach_release_transfer') { requireRole_(u,['coach']); return coachReleaseTransfer_(r,u); }
  if (a === 'player_apply_payment') return recordCollectionPayment_(r,u);

  if (a === 'referee_submit_result') { requireRole_(u,['referee','chairman']); return submitRefereeResult_(r,u); }
  if (a === 'submit_dispute') return submitDispute_(r,u);
  if (a === 'submit_vote') return submitVote_(r,u);
  if (a === 'save_finance') { requireRole_(u,['coach','chairman']); return saveFinance_(r,u); }

  throw new Error('Unknown CPL action: ' + a);
}

function publicBootstrap_() {
  const season = activeSeason_();
  const teams = all_('Teams').filter(x => x.status === 'active' && String(x.seasonId) === String(season.id))
    .map(function(x){ return {id:x.id,name:x.name,league:x.league,description:x.description||'',logo:publicFileUrl_(x.badgeFileId)}; });

  const fixtures = all_('Fixtures').filter(function(x){
    return x.status !== 'cancelled' && String(x.seasonId) === String(season.id);
  }).map(function(x){ return publicFixtureRow_(x); });

  const reports = all_('MatchReports').filter(x => x.status === 'official' && String(find_('Fixtures','id',x.fixtureId)?.seasonId) === String(season.id));
  return {
    season:{id:season.id,name:season.name,status:season.status,startDate:season.startDate,endDate:season.endDate},
    teams:teams,
    fixtures:fixtures,
    results:reports.map(publicReportRow_),
    competitions:publicCompetitions_(),
    standings:buildStandings_(season.id),
    topScorers:topPlayerStats_(season.id,'goals'),
    topAssists:topPlayerStats_(season.id,'assists'),
    news:all_('News').filter(x => x.status === 'published').slice(-30).reverse()
  };
}

function publicTeam_(teamId) {
  const team = find_('Teams','id',teamId);
  if (!team || team.status !== 'active') throw new Error('Team not found.');
  const players = all_('Players').filter(x => x.teamId === team.id && x.status === 'active')
    .map(function(p){ return {id:p.id,name:p.fullName,jerseyNumber:p.jerseyNumber,position:p.position,photoUrl:publicFileUrl_(p.photoFileId)}; });
  const fixtures = all_('Fixtures').filter(x => x.homeTeamId === team.id || x.awayTeamId === team.id)
    .filter(x => x.status !== 'cancelled').map(publicFixtureRow_);
  const group = findApprovedWhatsApp_(team.id,'team');
  return {team:{id:team.id,name:team.name,league:team.league,description:team.description,logo:publicFileUrl_(team.badgeFileId)},
          players,fixtures,whatsappGroup:group ? group.inviteUrl : ''};
}

function publicFixture_(fixtureId) {
  const f = find_('Fixtures','id',fixtureId);
  if (!f || f.status === 'cancelled') throw new Error('Fixture not found.');
  const posters = all_('MatchPosters').filter(x => x.fixtureId === fixtureId && x.status === 'published')
    .map(x => ({id:x.id,teamId:x.teamId,imageUrl:x.imageUrl}));
  return {fixture:publicFixtureRow_(f),posters};
}

function publicCompetitions_() {
  return all_('Competitions').filter(x => x.status !== 'archived').map(function(c){
    const teams = all_('CompetitionTeams').filter(x => x.competitionId === c.id).map(x => {
      const t = find_('Teams','id',x.teamId);
      return {id:x.teamId,name:t?t.name:'',league:t?t.league:'',seed:x.seed};
    });
    const rounds = all_('CompetitionRounds').filter(x => x.competitionId === c.id);
    const fixtures = all_('CompetitionFixtures').filter(x => x.competitionId === c.id);
    return {id:c.id,name:c.name,type:c.type,status:c.status,startDate:c.startDate,rules:c.rules,teams,rounds,fixtures};
  });
}

function publicFixtureRow_(f) {
  const home=find_('Teams','id',f.homeTeamId), away=find_('Teams','id',f.awayTeamId);
  const report=find_('MatchReports','fixtureId',f.id);
  return {id:f.id,seasonId:f.seasonId,competitionId:f.competitionId||'',roundName:f.roundName||'',
    league:f.league,homeTeamId:f.homeTeamId,awayTeamId:f.awayTeamId,
    homeTeamName:home?home.name:'',awayTeamName:away?away.name:'',
    venue:f.venue,kickoffAt:f.kickoffAt,lineupDeadlineAt:f.lineupDeadlineAt,
    refereeUid:f.refereeUid,status:f.status,
    result:report&&report.status==='official'?{homeScore:Number(report.homeScore),awayScore:Number(report.awayScore)}:null};
}

function publicReportRow_(r) {
  return {fixtureId:r.fixtureId,homeScore:Number(r.homeScore),awayScore:Number(r.awayScore),
    events:parseJson_(r.eventsJson,[]),status:r.status,verifiedAt:r.verifiedAt};
}

function getMe_(u) {
  const profile=find_('Users','uid',u.uid);
  const chairman=isChairman_(u);
  const approvedRoles=all_('RoleRequests').filter(x => x.uid===u.uid && x.status==='approved')
    .map(x => ({role:x.requestedRole,teamId:x.teamId||'',seasonId:x.seasonId||''}));
  const assignedTeams=all_('Teams').filter(x => x.coachUid===u.uid && x.status==='active');
  const teamIds=assignedTeams.map(x => x.id);
  const playerRows=all_('Players').filter(x => x.uid===u.uid && x.status==='active');
  return {
    uid:u.uid,email:u.email,displayName:u.displayName,photoUrl:u.photoUrl,
    activeRole:chairman?'chairman':(profile ? profile.activeRole : 'fan'),
    isChairman:chairman,roles:approvedRoles,
    follows:all_('Follows').filter(x => x.uid===u.uid),
    roleRequests:all_('RoleRequests').filter(x => x.uid===u.uid),
    playerApplications:chairman ? all_('PlayerApplications').filter(x=>x.status==='pending')
      : all_('PlayerApplications').filter(x=>teamIds.indexOf(x.teamId)>=0 && x.status==='pending'),
    players:playerRows,
    assignedTeams,
    assignedFixtures:chairman ? all_('Fixtures') : all_('Fixtures').filter(x=>x.refereeUid===u.uid),
    pendingReports:chairman ? all_('MatchReports').filter(x=>x.status==='pending_verification') : [],
    pendingTransfers:chairman ? all_('Transfers').filter(x=>x.status==='pending_chairman')
      : all_('Transfers').filter(x=>x.toTeamId && teamIds.indexOf(x.toTeamId)>=0 && x.status==='pending_new_coach'),
    collections:chairman ? all_('TeamCollections') : all_('TeamCollections').filter(x=>teamIds.indexOf(x.teamId)>=0),
    teamGroups:all_('WhatsAppGroups').filter(x=>x.status==='approved' && (x.groupType==='community' || x.groupType==='official' || teamIds.indexOf(x.teamId)>=0))
  };
}

function upsertUser_(u) {
  const old=find_('Users','uid',u.uid);
  if (!old) append_('Users',[u.uid,u.email,u.displayName,u.photoUrl,'fan','active',new Date(),new Date()]);
  else {
    update_('Users',old.__row,'email',u.email);
    update_('Users',old.__row,'displayName',u.displayName);
    update_('Users',old.__row,'photoUrl',u.photoUrl);
    update_('Users',old.__row,'updatedAt',new Date());
  }
}

function requestRole_(r,u) {
  const role=String(r.role||'');
  if (['player','coach','referee'].indexOf(role)<0) throw new Error('Choose Player, Team Coach or Referee.');
  if (all_('RoleRequests').some(x=>x.uid===u.uid&&x.requestedRole===role&&x.status==='pending'))
    throw new Error('You already have a pending request for this role.');
  const id=Utilities.getUuid();
  append_('RoleRequests',[id,u.uid,u.email,role,String(r.teamId||''),String(r.message||''),'pending','','',new Date()]);
  audit_(u,'role_application','RoleRequest',id,'Submitted '+role+' application');
  return {id};
}

function follow_(r,u,yes) {
  const teamId=String(r.teamId||'');
  if (!find_('Teams','id',teamId)) throw new Error('Team not found.');
  const old=all_('Follows').find(x=>x.uid===u.uid&&x.teamId===teamId);
  if (yes && !old) append_('Follows',[u.uid,teamId,new Date()]);
  if (!yes && old) deleteRow_('Follows',old.__row);
  return {follows:all_('Follows').filter(x=>x.uid===u.uid)};
}

function playerApply_(r,u) {
  const teamId=String(r.teamId||'');
  const season=activeSeason_();
  if (!String(r.fullName||u.displayName||'').trim() || !find_('Teams','id',teamId))
    throw new Error('Name and valid team are required.');
  const id=Utilities.getUuid();
  append_('PlayerApplications',[id,u.uid,String(r.fullName||u.displayName),teamId,season.id,
    String(r.jerseyNumber||''),String(r.position||''),String(r.message||''),
    'pending','','',new Date()]);
  audit_(u,'player_application','PlayerApplication',id,'');
  return {id};
}

function saveSeason_(r,u) {
  const name=String(r.name||'').trim();
  if (!name) throw new Error('Season name is required.');
  all_('Seasons').filter(x=>x.status==='active').forEach(x=>update_('Seasons',x.__row,'status','archived'));
  const id=Utilities.getUuid();
  append_('Seasons',[id,name,'active',String(r.startDate||''),String(r.endDate||''),new Date(),new Date()]);
  audit_(u,'season_created','Season',id,name);
  return {id};
}

function saveTransferWindow_(r,u) {
  const seasonId=String(r.seasonId||activeSeason_().id);
  const start=new Date(r.startAt), end=new Date(r.endAt);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) throw new Error('Valid transfer window dates are required.');
  const id=Utilities.getUuid();
  append_('TransferWindows',[id,seasonId,String(r.name||'Transfer Window'),start,end,'scheduled',u.uid,new Date(),new Date()]);
  audit_(u,'transfer_window_created','TransferWindow',id,String(r.name||''));
  return {id};
}

function saveTeam_(r,u) {
  const name = String(r.name || '').trim();
  const league = String(r.league || 'A').toUpperCase();
  if (!name || ['A','B'].indexOf(league) < 0) throw new Error('Team name and League A/B are required.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const season = activeSeason_();
    const coachEmail = String(r.coachEmail || '').toLowerCase().trim();
    let coach = null;
    let coachWasPromoted = false;
    if (coachEmail) {
      coach = all_('Users').find(x => String(x.email || '').toLowerCase().trim() === coachEmail);
      if (!coach) throw new Error('No registered CPL account found for ' + coachEmail + '. Ask the coach to sign in to CPL once before assignment.');
      if (coach.status !== 'active') throw new Error('This user account is not active.');
      const existingAssignment = all_('Teams').some(x => x.seasonId === season.id && x.coachUid === coach.uid && x.status === 'active');
      if (existingAssignment) throw new Error('This coach is already assigned to another team this season.');
      coachWasPromoted = coach.activeRole !== 'coach';
    }

    const id = Utilities.getUuid();
    const now = new Date();
    append_('Teams',[id,season.id,name,league,String(r.description||''),String(r.badgeFileId||''),coach?coach.uid:'','',String(r.whatsappGroupId||''),'active',now,now]);

    if (coach && coachWasPromoted) {
      update_('Users',coach.__row,'activeRole','coach');
      update_('Users',coach.__row,'updatedAt',now);
      const requestId = Utilities.getUuid();
      append_('RoleRequests',[requestId,coach.uid,coach.email,'coach',id,'Approved directly by the Chairman during team creation.','approved',u.email,now,now]);
      audit_(u,'coach_directly_approved','RoleRequest',requestId,'Coach: '+coach.email+'; Team: '+name);
    }
    audit_(u,'team_created','Team',id,name+(coach?'; Coach: '+coach.email:''));
    return {id:id,coachApproved:Boolean(coach),coachEmail:coach?coach.email:'',message:coach?'Team created and coach approved and assigned successfully.':'Team created successfully.'};
  } finally { lock.releaseLock(); }
}

function assignCaptain_(r,u) {
  const team=find_('Teams','id',String(r.teamId||''));
  const player=find_('Players','id',String(r.playerId||''));
  if (!team || !player || player.teamId!==team.id || player.status!=='active') throw new Error('Captain must be an active player of this team.');
  update_('Teams',team.__row,'captainPlayerId',player.id);
  audit_(u,'captain_assigned','Team',team.id,player.fullName);
  return {ok:true};
}

function reviewRole_(r,u) {
  const req=find_('RoleRequests','id',String(r.requestId||''));
  if (!req) throw new Error('Role request not found.');
  const status=r.approve===false?'rejected':'approved';
  update_('RoleRequests',req.__row,'status',status);
  update_('RoleRequests',req.__row,'reviewedBy',u.email);
  update_('RoleRequests',req.__row,'reviewedAt',new Date());
  if (status==='approved') {
    const user=find_('Users','uid',req.uid);
    if (user) update_('Users',user.__row,'activeRole',req.requestedRole);
  }
  audit_(u,'role_'+status,'RoleRequest',req.id,req.email);
  return {ok:true};
}

function reviewPlayer_(r,u) {
  const a=find_('PlayerApplications','id',String(r.applicationId||''));
  if (!a) throw new Error('Player application not found.');
  const team=find_('Teams','id',a.teamId);
  if (!team || (!isChairman_(u) && team.coachUid!==u.uid)) throw new Error('Not authorised.');
  const status=r.approve===false?'rejected':'approved';
  update_('PlayerApplications',a.__row,'status',status);
  update_('PlayerApplications',a.__row,'reviewedBy',u.email);
  update_('PlayerApplications',a.__row,'reviewedAt',new Date());
  if (status==='approved') {
    const existing=all_('Players').find(x=>x.uid===a.uid&&x.seasonId===a.seasonId&&x.status==='active');
    if (existing) throw new Error('Player already has an active squad entry.');
    append_('Players',[Utilities.getUuid(),a.uid,a.fullName,a.teamId,a.seasonId,a.jerseyNumber,a.position,'','active',u.email,new Date(),new Date()]);
  }
  audit_(u,'player_'+status,'PlayerApplication',a.id,a.fullName);
  return {ok:true};
}

function saveFixture_(r,u) {
  const seasonId=String(r.seasonId||activeSeason_().id);
  const home=String(r.homeTeamId||''), away=String(r.awayTeamId||'');
  if (!home || !away || home===away) throw new Error('Choose two different teams.');
  const ht=find_('Teams','id',home), at=find_('Teams','id',away);
  if (!ht || !at) throw new Error('Both teams must exist.');
  const competitionId=String(r.competitionId||'');
  if (!competitionId && ht.league!==at.league) throw new Error('League fixtures must stay within the same league.');
  const kickoff=new Date(r.kickoffAt);
  if (isNaN(kickoff.getTime())) throw new Error('Valid kickoff time required.');
  const deadline=new Date(kickoff.getTime()-Number(getSetting_('lineup_deadline_minutes',5))*60000);
  const id=Utilities.getUuid();
  append_('Fixtures',[id,seasonId,competitionId,String(r.roundName||''),String(r.league||ht.league),
    home,away,String(r.venue||''),kickoff,deadline,String(r.refereeUid||''),'scheduled',u.uid,new Date(),new Date()]);
  audit_(u,'fixture_created','Fixture',id,home+' vs '+away);
  return {id};
}

function assignReferee_(r,u) {
  const f=find_('Fixtures','id',String(r.fixtureId||'')); if(!f) throw new Error('Fixture not found.');
  const ref=String(r.refereeUid||'');
  const user=find_('Users','uid',ref);
  if (!user || user.activeRole!=='referee') throw new Error('Approved referee account required.');
  update_('Fixtures',f.__row,'refereeUid',ref);
  audit_(u,'referee_assigned','Fixture',f.id,user.email);
  return {ok:true};
}

function updateTeamProfile_(r,u,isChairman) {
  const team=find_('Teams','id',String(r.teamId||''));
  if (!team || (!isChairman && team.coachUid!==u.uid)) throw new Error('You are not authorised to edit this team.');
  if (isChairman) {
    if (r.name !== undefined) {
      const name=String(r.name||'').trim();
      if (!name) throw new Error('Team name is required.');
      update_('Teams',team.__row,'name',name);
    }
    if (r.league !== undefined) {
      const league=String(r.league||'').toUpperCase();
      if (['A','B'].indexOf(league)<0) throw new Error('League must be A or B.');
      update_('Teams',team.__row,'league',league);
    }
  }
  ['description','whatsappGroupId'].forEach(function(k){
    if (r[k] !== undefined) update_('Teams',team.__row,k,String(r[k]));
  });
  if (r.image && r.image.base64) {
    const saved=saveDriveImage_(r.image,'Team Logos',u.uid,'Team',team.id,true);
    update_('Teams',team.__row,'badgeFileId',saved.fileId);
  }
  update_('Teams',team.__row,'updatedAt',new Date());
  audit_(u,'team_profile_updated','Team',team.id,isChairman?'Chairman updated team profile':'Coach updated team profile');
  return {ok:true};
}

function submitLineup_(r,u) {
  const f=find_('Fixtures','id',String(r.fixtureId||''));
  const team=find_('Teams','id',String(r.teamId||''));
  if (!f || !team || team.coachUid!==u.uid) throw new Error('Not authorised for this fixture/team.');
  if (f.status==='official' || f.status==='cancelled') throw new Error('Lineup cannot be changed.');
  const now=new Date(), deadline=new Date(f.lineupDeadlineAt);
  const isLate=now>deadline;
  const existing=all_('Lineups').find(x=>x.fixtureId===f.id&&x.teamId===team.id);
  const row=[existing?existing.id:Utilities.getUuid(),f.id,team.id,u.uid,now,isLate,
    JSON.stringify(r.starters||[]),JSON.stringify(r.substitutes||[]),String(r.goalkeeperId||''),String(r.captainPlayerId||''),now];
  if(existing) replaceRow_('Lineups',existing.__row,row); else append_('Lineups',row);
  audit_(u,isLate?'late_lineup_submitted':'lineup_submitted','Lineup',f.id,team.name);
  return {late:isLate};
}

function uploadMatchPoster_(r,u) {
  const f=find_('Fixtures','id',String(r.fixtureId||'')), team=find_('Teams','id',String(r.teamId||''));
  if (!f || !team || team.coachUid!==u.uid) throw new Error('Only the assigned team coach can upload this poster.');
  if (f.status==='official') throw new Error('Posters close once the result is approved.');
  if (!r.image || !r.image.base64) throw new Error('Image is required.');
  const existing=all_('MatchPosters').find(x=>x.fixtureId===f.id&&x.teamId===team.id&&x.status==='published');
  if (existing) throw new Error('This team already has a poster for this match.');
  const saved=saveDriveImage_(r.image, 'Match Posters', u.uid, 'Fixture', f.id, true);
  const id=Utilities.getUuid();
  append_('MatchPosters',[id,f.id,team.id,saved.fileId,saved.imageUrl,u.uid,'published',new Date(),'','']);
  audit_(u,'match_poster_uploaded','MatchPoster',id,team.name);
  return saved;
}

function removePoster_(r,u) {
  const p=find_('MatchPosters','id',String(r.posterId||''));
  if (!p) throw new Error('Poster not found.');
  update_('MatchPosters',p.__row,'status','removed');
  update_('MatchPosters',p.__row,'removedAt',new Date());
  update_('MatchPosters',p.__row,'removedBy',u.uid);
  audit_(u,'match_poster_removed','MatchPoster',p.id,'');
  return {ok:true};
}

function submitRefereeResult_(r,u) {
  const f=find_('Fixtures','id',String(r.fixtureId||''));
  if (!f || (!isChairman_(u) && f.refereeUid!==u.uid)) throw new Error('You are not assigned to this fixture.');
  const lineups=all_('Lineups').filter(x=>x.fixtureId===f.id);
  if (lineups.length<2) throw new Error('Both team lineups must be confirmed before the result is submitted.');
  const homeScore=Number(r.homeScore), awayScore=Number(r.awayScore);
  if (!Number.isInteger(homeScore)||!Number.isInteger(awayScore)||homeScore<0||awayScore<0) throw new Error('Scores must be non-negative whole numbers.');
  const events=Array.isArray(r.events)?r.events:[];
  const reportId=Utilities.getUuid();
  append_('MatchReports',[reportId,f.id,u.uid,homeScore,awayScore,JSON.stringify(events),
    String(r.homeFeeStatus||'unpaid'),String(r.awayFeeStatus||'unpaid'),String(r.notes||''),
    'pending_verification','', '',new Date(),new Date()]);
  update_('Fixtures',f.__row,'status','pending_verification');
  audit_(u,'referee_result_submitted','MatchReport',reportId,'Pending Chairman approval');
  return {id:reportId};
}

function reviewResult_(r,u) {
  const report=find_('MatchReports','id',String(r.reportId||''));
  if (!report) throw new Error('Match result not found.');
  const approved=r.approve!==false;
  update_('MatchReports',report.__row,'status',approved?'official':'returned');
  update_('MatchReports',report.__row,'verifiedBy',u.uid);
  update_('MatchReports',report.__row,'verifiedAt',new Date());
  const f=find_('Fixtures','id',report.fixtureId);
  if (f) update_('Fixtures',f.__row,'status',approved?'official':'scheduled');
  if (approved) syncCompetitionWinner_(f);
  audit_(u,approved?'result_approved':'result_returned','MatchReport',report.id,String(r.note||''));
  return {ok:true};
}

function createCompetition_(r,u) {
  const seasonId=String(r.seasonId||activeSeason_().id);
  const type=String(r.type||'cup');
  if (type!=='cup') throw new Error('Current knockout competition type is cup.');
  const id=Utilities.getUuid();
  append_('Competitions',[id,seasonId,String(r.name||'CPL Cup'),type,'draft',String(r.startDate||''),String(r.rules||'Single-leg knockout; KSh 200 referee fee per team.'),u.uid,new Date(),new Date()]);
  audit_(u,'competition_created','Competition',id,String(r.name||'CPL Cup'));
  return {id};
}

function addCupTeams_(r,u) {
  const competitionId=String(r.competitionId||'');
  if (!find_('Competitions','id',competitionId)) throw new Error('Competition not found.');
  const ids=Array.isArray(r.teamIds)?r.teamIds:[];
  ids.forEach(function(teamId){
    if (!find_('CompetitionTeams','id',teamId)) {
      const exists=all_('CompetitionTeams').some(x=>x.competitionId===competitionId&&x.teamId===teamId);
      if (!exists) append_('CompetitionTeams',[Utilities.getUuid(),competitionId,teamId,'','entered',new Date()]);
    }
  });
  return {count:ids.length};
}

function createCupRound_(r,u) {
  const competitionId=String(r.competitionId||''), roundNumber=Number(r.roundNumber||1);
  if (!find_('Competitions','id',competitionId)) throw new Error('Competition not found.');
  const roundName=String(r.roundName||('Round '+roundNumber));
  append_('CompetitionRounds',[Utilities.getUuid(),competitionId,roundName,roundNumber,String(r.drawMode||'manual'),new Date()]);
  const pairs=Array.isArray(r.fixtures)?r.fixtures:[];
  pairs.forEach(function(pair){
    const fixture=saveFixture_({seasonId:r.seasonId,competitionId:competitionId,roundName:roundName,
      league:'CUP',homeTeamId:pair.homeTeamId,awayTeamId:pair.awayTeamId,venue:pair.venue,kickoffAt:pair.kickoffAt,refereeUid:pair.refereeUid},u);
    append_('CompetitionFixtures',[Utilities.getUuid(),competitionId,roundNumber,roundName,fixture.id,pair.homeTeamId,pair.awayTeamId,'','scheduled',new Date(),new Date()]);
  });
  update_('Competitions',find_('Competitions','id',competitionId).__row,'status','active');
  return {ok:true};
}

function syncCompetitionWinner_(f) {
  if (!f || !f.competitionId) return;
  const report=find_('MatchReports','fixtureId',f.id);
  if (!report || report.status!=='official') return;
  let winner=f.homeTeamId, hs=Number(report.homeScore), as=Number(report.awayScore);
  if (hs===as) return; // penalties can be added in the next result schema extension
  if (as>hs) winner=f.awayTeamId;
  const cf=all_('CompetitionFixtures').find(x=>x.fixtureId===f.id);
  if (cf) {
    update_('CompetitionFixtures',cf.__row,'winnerTeamId',winner);
    update_('CompetitionFixtures',cf.__row,'status','official');
  }
}

function saveWhatsAppGroup_(r,u) {
  const type=String(r.groupType||'');
  if (['team','community','official'].indexOf(type)<0) throw new Error('Invalid WhatsApp group type.');
  const season=activeSeason_();
  const id=Utilities.getUuid();
  append_('WhatsAppGroups',[id,season.id,String(r.teamId||''),type,String(r.inviteUrl||''),'link','pending',u.uid,'',u.uid,new Date()]);
  audit_(u,'whatsapp_group_saved','WhatsAppGroup',id,type);
  return {id};
}

function approveWhatsAppGroup_(r,u) {
  const g=find_('WhatsAppGroups','id',String(r.groupId||''));
  if (!g) throw new Error('WhatsApp group not found.');
  update_('WhatsAppGroups',g.__row,'status','approved');
  update_('WhatsAppGroups',g.__row,'approvedBy',u.uid);
  update_('WhatsAppGroups',g.__row,'approvedAt',new Date());
  audit_(u,'whatsapp_group_approved','WhatsAppGroup',g.id,'');
  return {ok:true};
}

function findApprovedWhatsApp_(teamId,type) {
  return all_('WhatsAppGroups').find(x=>x.teamId===teamId&&x.groupType===type&&x.status==='approved');
}

function saveNews_(r,u) {
  let imageFileId='', imageUrl='';
  if (r.image && r.image.base64) {
    const saved=saveDriveImage_(r.image,'News Media',u.uid,'News','');
    imageFileId=saved.fileId; imageUrl=saved.imageUrl;
  }
  const id=Utilities.getUuid();
  append_('News',[id,String(r.title||''),String(r.body||''),imageFileId,imageUrl,String(r.category||'general'),
    r.publish?'published':'draft',u.uid,new Date(),new Date()]);
  audit_(u,'news_saved','News',id,String(r.title||''));
  return {id,imageUrl};
}

function createTransferOffer_(r,u) {
  const window=openTransferWindow_();
  if (!window) throw new Error('Transfers are currently closed.');
  const toTeam=find_('Teams','id',String(r.toTeamId||''));
  const player=find_('Players','id',String(r.playerId||''));
  if (!toTeam || !player) throw new Error('Player or destination team not found.');
  if (toTeam.coachUid!==u.uid) throw new Error('Only the destination team coach can make the offer.');
  if (player.teamId===toTeam.id) throw new Error('Player is already in this team.');
  const old=all_('Transfers').find(x=>x.playerId===player.id&&x.status.indexOf('pending')===0);
  if (old) throw new Error('Player already has a pending transfer.');
  const id=Utilities.getUuid(), expiry=new Date(Math.min(Date.now()+7*86400000,new Date(window.endAt).getTime()));
  append_('Transfers',[id,window.id,player.seasonId,player.id,player.teamId,toTeam.id,'pending_player', 'player', expiry,'','','','','', '',new Date(),new Date()]);
  append_('TransferLog',[Utilities.getUuid(),id,'player',u.uid,u.email,'offer_created','',new Date()]);
  audit_(u,'transfer_offer_created','Transfer',id,player.fullName);
  return {id};
}

function playerTransferDecision_(r,u) {
  const t=find_('Transfers','id',String(r.transferId||''));
  if (!t) throw new Error('Transfer not found.');
  const p=find_('Players','id',t.playerId);
  if (!p || p.uid!==u.uid) throw new Error('Only the player can decide this offer.');
  if (new Date()>new Date(t.offerExpiresAt)) throw new Error('Transfer offer has expired.');
  const accept=r.accept===true;
  update_('Transfers',t.__row,'playerDecision',accept?'accepted':'declined');
  update_('Transfers',t.__row,'playerDecisionAt',new Date());
  update_('Transfers',t.__row,'status',accept?'pending_release':'declined');
  update_('Transfers',t.__row,'currentStep',accept?'current_coach':'closed');
  append_('TransferLog',[Utilities.getUuid(),t.id,'player',u.uid,u.email,accept?'accepted':'declined','',new Date()]);
  return {ok:true};
}

function coachReleaseTransfer_(r,u) {
  const t=find_('Transfers','id',String(r.transferId||''));
  if (!t) throw new Error('Transfer not found.');
  const from=find_('Teams','id',t.fromTeamId);
  if (!from || from.coachUid!==u.uid) throw new Error('Only the current team coach can release this player.');
  const approve=r.approve!==false;
  update_('Transfers',t.__row,'currentCoachDecision',approve?'approved':'rejected');
  update_('Transfers',t.__row,'currentCoachDecisionAt',new Date());
  update_('Transfers',t.__row,'status',approve?'pending_chairman':'rejected');
  update_('Transfers',t.__row,'currentStep',approve?'chairman':'closed');
  append_('TransferLog',[Utilities.getUuid(),t.id,'current_coach',u.uid,u.email,approve?'released':'rejected',String(r.note||''),new Date()]);
  return {ok:true};
}

function approveFinalTransfer_(r,u) {
  const t=find_('Transfers','id',String(r.transferId||''));
  if (!t) throw new Error('Transfer not found.');
  if (t.status!=='pending_chairman') throw new Error('Transfer is not awaiting Chairman approval.');
  const player=find_('Players','id',t.playerId);
  if (!player) throw new Error('Player not found.');
  update_('Transfers',t.__row,'status','approved');
  update_('Transfers',t.__row,'finalApprovedBy',u.uid);
  update_('Transfers',t.__row,'finalApprovedAt',new Date());
  update_('Transfers',t.__row,'currentStep','complete');
  update_('Players',player.__row,'teamId',t.toTeamId);
  update_('Players',player.__row,'jerseyNumber','');
  update_('Players',player.__row,'updatedAt',new Date());
  all_('Transfers').filter(x=>x.playerId===player.id&&x.id!==t.id&&String(x.status).indexOf('pending')===0)
    .forEach(x=>update_('Transfers',x.__row,'status','cancelled'));
  append_('TransferLog',[Utilities.getUuid(),t.id,'chairman',u.uid,u.email,'approved','',new Date()]);
  audit_(u,'transfer_approved','Transfer',t.id,player.fullName);
  return {ok:true};
}

/* Chairman dispatcher helper for the final transfer approval. */
function chairmanApproveTransferAction_(r,u) { return approveFinalTransfer_(r,u); }

function createCollection_(r,u) {
  const team=find_('Teams','id',String(r.teamId||''));
  if (!team || team.coachUid!==u.uid) throw new Error('Only the team coach can create this collection.');
  const id=Utilities.getUuid();
  append_('TeamCollections',[id,team.id,activeSeason_().id,String(r.title||'Collection'),String(r.description||''),
    Number(r.targetAmount||0),'open','','none','','','',new Date(),new Date()]);
  audit_(u,'collection_created','TeamCollection',id,String(r.title||''));
  return {id};
}

function recordCollectionPayment_(r,u) {
  const c=find_('TeamCollections','id',String(r.collectionId||''));
  if (!c || c.status!=='open') throw new Error('Collection is not open.');
  const amount=Number(r.amount);
  if (!isFinite(amount)||amount<=0) throw new Error('Enter a valid amount.');
  const id=Utilities.getUuid();
  append_('CollectionPayments',[id,c.id,u.uid,String(r.payerName||u.displayName),amount,String(r.paymentMethod||''),String(r.reference||''),'recorded',new Date()]);
  audit_(u,'collection_payment','CollectionPayment',id,String(amount));
  return {id};
}

function completeCollection_(r,u) {
  const c=find_('TeamCollections','id',String(r.collectionId||''));
  const team=c&&find_('Teams','id',c.teamId);
  if (!c || !team || (!isChairman_(u)&&team.coachUid!==u.uid)) throw new Error('Not authorised.');
  update_('TeamCollections',c.__row,'status','completed');
  update_('TeamCollections',c.__row,'completedAt',new Date());
  update_('TeamCollections',c.__row,'deletionStatus','pending_chairman');
  update_('TeamCollections',c.__row,'deletionRequestedAt',new Date());
  audit_(u,'collection_deletion_requested','TeamCollection',c.id,'');
  return {ok:true};
}

function approveCollectionDeletion_(r,u) {
  const c=find_('TeamCollections','id',String(r.collectionId||''));
  if (!c || c.deletionStatus!=='pending_chairman') throw new Error('Collection is not awaiting deletion approval.');
  const payments=all_('CollectionPayments').filter(x=>x.collectionId===c.id);
  const total=payments.reduce((sum,x)=>sum+Number(x.amount||0),0);
  const code='CPL-' + Utilities.getUuid().replace(/-/g,'').slice(0,12).toUpperCase();
  append_('DeletionReceipts',[Utilities.getUuid(),'TeamCollection',c.id,c.title,c.teamId,total,code,u.email,new Date(),new Date()]);
  payments.forEach(x=>deleteRow_('CollectionPayments',x.__row));
  deleteRow_('TeamCollections',c.__row);
  audit_(u,'collection_permanently_deleted','TeamCollection',c.id,'Approval '+code+'; total '+total);
  return {deleted:true,approvalCode:code};
}

function submitDispute_(r,u) {
  const id=Utilities.getUuid();
  append_('Disputes',[id,String(r.fixtureId||''),String(r.teamId||''),u.uid,String(r.description||''),
    JSON.stringify(r.evidenceFileIds||[]),'submitted','','','','',new Date(),new Date()]);
  audit_(u,'dispute_submitted','Dispute',id,'');
  return {id};
}

function decideDispute_(r,u) {
  const d=find_('Disputes','id',String(r.disputeId||''));
  if (!d) throw new Error('Dispute not found.');
  update_('Disputes',d.__row,'status','decided');
  update_('Disputes',d.__row,'chairmanDecision',String(r.decision||''));
  update_('Disputes',d.__row,'decidedBy',u.email);
  update_('Disputes',d.__row,'decidedAt',new Date());
  update_('Disputes',d.__row,'updatedAt',new Date());
  audit_(u,'dispute_decided','Dispute',d.id,String(r.decision||''));
  return {ok:true};
}

function submitVote_(r,u) {
  const week=String(r.weekKey||Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'YYYY-ww'));
  const category=String(r.category||''), nominee=String(r.nomineeId||'');
  if (['player_of_week','goal_of_week','manager_of_week'].indexOf(category)<0) throw new Error('Invalid award category.');
  if (!nominee) throw new Error('Choose a nominee.');
  if (all_('Votes').some(x=>x.weekKey===week&&x.category===category&&x.voterUid===u.uid))
    throw new Error('You have already voted in this category this week.');
  append_('Votes',[Utilities.getUuid(),week,category,nominee,u.uid,new Date()]);
  audit_(u,'vote_cast','Vote',week,category);
  return {ok:true};
}

function saveFinance_(r,u) {
  const team=find_('Teams','id',String(r.teamId||''));
  if (!team || (!isChairman_(u)&&team.coachUid!==u.uid)) throw new Error('Not authorised.');
  const amount=Number(r.amount);
  if (!isFinite(amount)||amount<=0) throw new Error('Enter a valid positive amount.');
  const id=Utilities.getUuid();
  append_('Finance',[id,team.id,activeSeason_().id,String(r.category||'other'),String(r.description||''),amount,'KSh',u.uid,String(r.visibility||'private'),new Date()]);
  audit_(u,'finance_recorded','Finance',id,String(amount));
  return {id};
}

function requireChairman_(u) {
  if (!isChairman_(u)) throw new Error('Chairman access required.');
}

function requireRole_(u,roles) {
  if (isChairman_(u) && roles.indexOf('chairman')>=0) return;
  const me=getMe_(u);
  if (roles.indexOf(me.activeRole)<0) throw new Error('Your CPL account does not have permission for this action.');
}

function isChairman_(u) {
  const list=(PropertiesService.getScriptProperties().getProperty('CPL_CHAIRMAN_EMAILS')||'')
    .toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
  return list.indexOf(String(u.email||'').toLowerCase())>=0;
}

function activeSeason_() {
  const s=all_('Seasons').find(x=>x.status==='active');
  if (s) return {id:s.id,name:s.name,status:s.status,startDate:s.startDate,endDate:s.endDate};
  const id=Utilities.getUuid();
  append_('Seasons',[id,'CPL Season 2026/27','active','','',new Date(),new Date()]);
  return {id:id,name:'CPL Season 2026/27',status:'active',startDate:'',endDate:''};
}

function openTransferWindow_() {
  const now=new Date();
  return all_('TransferWindows').find(x=>x.status!=='closed'&&new Date(x.startAt)<=now&&new Date(x.endAt)>=now) || null;
}

function buildStandings_(seasonId) {
  const teams=all_('Teams').filter(x=>x.seasonId===seasonId&&x.status==='active');
  const reports=all_('MatchReports').filter(x=>x.status==='official');
  return ['A','B'].map(function(league){
    const rows=teams.filter(t=>t.league===league).map(function(t){
      const o={teamId:t.id,team:t.name,league:t.league,played:0,wins:0,draws:0,losses:0,goalsFor:0,goalsAgainst:0,goalDifference:0,points:0};
      reports.forEach(function(r){
        const f=find_('Fixtures','id',r.fixtureId);
        if(!f||f.seasonId!==seasonId||f.competitionId||f.league!==league) return;
        if(f.homeTeamId!==t.id&&f.awayTeamId!==t.id) return;
        const hs=Number(r.homeScore),as=Number(r.awayScore);
        o.played++; o.goalsFor += f.homeTeamId===t.id?hs:as; o.goalsAgainst += f.homeTeamId===t.id?as:hs;
        if(hs===as){o.draws++;o.points+=Number(getSetting_('points_draw',1));}
        else if((hs>as&&f.homeTeamId===t.id)||(as>hs&&f.awayTeamId===t.id)){o.wins++;o.points+=Number(getSetting_('points_win',3));}
        else{o.losses++;o.points+=Number(getSetting_('points_loss',0));}
      });
      o.goalDifference=o.goalsFor-o.goalsAgainst;
      return o;
    }).sort(function(a,b){return b.points-a.points||b.goalDifference-a.goalDifference||b.goalsFor-a.goalsFor||a.team.localeCompare(b.team);});
    return {league,rows};
  });
}

function topPlayerStats_(seasonId,kind) {
  const players=all_('Players').filter(x=>x.seasonId===seasonId&&x.status==='active');
  const counts={};
  players.forEach(p=>counts[p.id]={playerId:p.id,name:p.fullName,teamId:p.teamId,value:0});
  all_('MatchReports').filter(x=>x.status==='official').forEach(function(r){
    const f=find_('Fixtures','id',r.fixtureId);
    if(!f||f.seasonId!==seasonId||f.competitionId) return;
    parseJson_(r.eventsJson,[]).forEach(function(ev){
      if(kind==='goals'&&['goal','penalty_goal','own_goal'].indexOf(ev.eventType)>=0&&counts[ev.playerId]) counts[ev.playerId].value += ev.eventType==='own_goal'?0:1;
      if(kind==='assists'&&ev.eventType==='assist'&&counts[ev.playerId]) counts[ev.playerId].value += 1;
    });
  });
  return Object.values(counts).filter(x=>x.value>0).sort((a,b)=>b.value-a.value).slice(0,20);
}

function parseJson_(value,fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch(e) { return fallback; }
}

function saveDriveImage_(image,folderName,ownerUid,recordType,recordId,publicView) {
  const mime=String(image.mimeType||'');
  if (['image/jpeg','image/png','image/webp'].indexOf(mime)<0) throw new Error('Only JPG, PNG and WEBP images are allowed.');
  const bytes=Utilities.base64Decode(String(image.base64||'').replace(/^data:image\/[^;]+;base64,/,''));
  if (bytes.length>CPL.maxImageBytes) throw new Error('Image must be 5 MB or smaller.');
  const folder=getSubfolder_(folderName);
  const safe=String(image.name||'image').replace(/[^a-zA-Z0-9._-]/g,'_');
  const file=folder.createFile(Utilities.newBlob(bytes,mime,Date.now()+'_'+safe));
  if (publicView) file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
  const fileId=file.getId();
  const url=publicView?'https://drive.google.com/thumbnail?id='+fileId+'&sz=w1600':'';
  const id=Utilities.getUuid();
  append_('DriveFiles',[id,fileId,folderName,ownerUid,recordType,recordId,mime,url,publicView?'public':'private',new Date()]);
  return {id,fileId,imageUrl:url};
}

function getSubfolder_(name) {
  const root=DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('CPL_DRIVE_FOLDER_ID'));
  const it=root.getFoldersByName(name);
  return it.hasNext()?it.next():root.createFolder(name);
}

function publicFileUrl_(fileId) {
  if (!fileId) return '';
  return 'https://drive.google.com/thumbnail?id='+encodeURIComponent(fileId)+'&sz=w800';
}

function findSetting_(key) { return all_('Settings').find(x=>x.key===key)||null; }
function getSetting_(key, fallback) { const s=findSetting_(key); return s?s.value:fallback; }
function setSetting_(key,value,description) {
  const old=findSetting_(key);
  if(old){update_('Settings',old.__row,'value',String(value));update_('Settings',old.__row,'updatedAt',new Date());}
  else append_('Settings',[key,String(value),description||'',new Date()]);
}

function ss_() {
  const id=PropertiesService.getScriptProperties().getProperty('CPL_SPREADSHEET_ID');
  if(!id) throw new Error('Run setupCplSystem() first.');
  return SpreadsheetApp.openById(id);
}
function sheet_(name) {
  const s=ss_().getSheetByName(name);
  if(!s) throw new Error('Missing sheet '+name+'. Run setupCplSystem().');
  return s;
}
function all_(name) {
  const s=sheet_(name), v=s.getDataRange().getValues();
  if(v.length<2) return [];
  return v.slice(1).map(function(row,i){
    const o={__row:i+2};
    v[0].forEach(function(h,j){o[h]=row[j] instanceof Date?row[j].toISOString():row[j];});
    return o;
  }).filter(function(o){return Object.keys(o).some(function(k){return k!=='__row'&&o[k]!=='';});});
}
function find_(name,key,value) { return all_(name).find(function(x){return String(x[key])===String(value);})||null; }
function append_(name,row) { sheet_(name).appendRow(row); }
function deleteRow_(name,row) { sheet_(name).deleteRow(row); }
function replaceRow_(name,rowIndex,row) { sheet_(name).getRange(rowIndex,1,1,row.length).setValues([row]); }
function update_(name,row,key,value) {
  const s=sheet_(name), headers=s.getRange(1,1,1,s.getLastColumn()).getValues()[0], i=headers.indexOf(key);
  if(i<0) throw new Error('Unknown field '+key+' in '+name);
  s.getRange(row,i+1).setValue(value);
}
function audit_(u,action,type,id,details) {
  const rows=all_('AuditLog');
  const prev=rows.length?rows[rows.length-1].entryHash:'GENESIS';
  const payload=[u.uid,u.email,isChairman_(u)?'chairman':getRoleForAudit_(u),action,type,id,details,prev,new Date().toISOString()].join('|');
  const hash=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,payload,Utilities.Charset.UTF_8)
    .map(function(b){return ('0'+(b&255).toString(16)).slice(-2);}).join('');
  append_('AuditLog',[Utilities.getUuid(),u.uid,u.email,isChairman_(u)?'chairman':getRoleForAudit_(u),action,type,id,details,prev,hash,new Date()]);
}
function getRoleForAudit_(u) {
  const x=find_('Users','uid',u.uid);
  return x?x.activeRole:'fan';
}
