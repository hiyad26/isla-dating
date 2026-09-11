```javascript
/* ISLA chat controls
 * Loaded after the main index.html script so it can reuse the existing
 * Supabase client, current user, currentChat, $, toast(), esc(), etc.
 */
(function(){
  'use strict';

  const MUTE_KEY='isla_muted_chats';
  const BLOCK_KEY='isla_local_blocks';

  const getJSON=(key, fallback)=>{
    try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback));}
    catch(e){return fallback;}
  };
  const setJSON=(key,value)=>localStorage.setItem(key,JSON.stringify(value));

  function muted(id){ return getJSON(MUTE_KEY,[]).map(Number).includes(Number(id)); }
  function blocked(id){ return getJSON(BLOCK_KEY,[]).includes(String(id)); }
  function setMuted(id,on){
    const a=getJSON(MUTE_KEY,[]).map(Number).filter(x=>x!==Number(id));
    if(on)a.push(Number(id));
    setJSON(MUTE_KEY,a);
  }
  function setBlocked(id,on){
    const a=getJSON(BLOCK_KEY,[]).map(String).filter(x=>x!==String(id));
    if(on)a.push(String(id));
    setJSON(BLOCK_KEY,a);
  }

  function otherUserId(match){
    return match.user_one===user.id ? match.user_two : match.user_one;
  }

  async function getBlockedIds(){
    const ids=new Set(getJSON(BLOCK_KEY,[]).map(String));
    try{
      const r=await client.from('blocks').select('blocked_id').eq('blocker_id',user.id);
      if(!r.error)(r.data||[]).forEach(x=>ids.add(String(x.blocked_id)));
    }catch(e){}
    return ids;
  }

  function closeMenu(){
    const el=$('chatOptions');
    if(el)el.classList.remove('active');
  }

  function showConfirm(title,text,confirmText,onConfirm,danger=true){
    let el=$('chatConfirm');
    if(!el){
      el=document.createElement('div');
      el.id='chatConfirm';
      el.className='modal';
      el.innerHTML=`<div class="sheet" style="max-width:600px">
        <button class="close" id="chatConfirmClose" type="button">×</button>
        <h2 id="chatConfirmTitle"></h2>
        <p id="chatConfirmText" style="color:#aaa;line-height:1.55"></p>
        <div style="display:flex;gap:10px;margin-top:20px">
          <button class="secondary" id="chatConfirmCancel" type="button" style="flex:1">Cancel</button>
          <button id="chatConfirmOk" type="button" style="flex:1"></button>
        </div>
      </div>`;
      document.body.appendChild(el);
      $('chatConfirmClose').onclick=()=>el.classList.remove('active');
      $('chatConfirmCancel').onclick=()=>el.classList.remove('active');
    }
    $('chatConfirmTitle').textContent=title;
    $('chatConfirmText').textContent=text;
    $('chatConfirmOk').textContent=confirmText;
    $('chatConfirmOk').className=danger?'danger':'';
    $('chatConfirmOk').onclick=async()=>{
      const b=$('chatConfirmOk');
      b.disabled=true;
      try{await onConfirm();el.classList.remove('active');}
      finally{b.disabled=false;}
    };
    el.classList.add('active');
  }

  function openMenu(){
    if(!currentChat?.match_id)return;
    let el=$('chatOptions');
    if(!el){
      el=document.createElement('div');
      el.id='chatOptions';
      el.className='chat-options';
      el.innerHTML=`<div class="chat-options-sheet">
        <div class="chat-options-title" id="chatOptionsTitle">Conversation options</div>
        <button class="chat-option" id="chatMuteOption" type="button"></button>
        <button class="chat-option" id="chatUnmatchOption" type="button">★ Unmatch<small>Remove this match and conversation.</small></button>
        <button class="chat-option danger" id="chatBlockOption" type="button">⛔ Block<small>Stop contact and hide this member.</small></button>
        <button class="chat-option danger" id="chatReportOption" type="button">⚑ Report<small>Report this member to ISLA.</small></button>
        <button class="chat-option" id="chatCloseOption" type="button">Cancel</button>
      </div>`;
      document.body.appendChild(el);
      el.addEventListener('click',e=>{if(e.target===el)closeMenu();});
      $('chatCloseOption').onclick=closeMenu;
      $('chatMuteOption').onclick=toggleMute;
      $('chatUnmatchOption').onclick=confirmUnmatch;
      $('chatBlockOption').onclick=confirmBlock;
      $('chatReportOption').onclick=reportFlow;
    }
    $('chatOptionsTitle').textContent=`${currentChat.full_name||'Member'} · Options`;
    $('chatMuteOption').innerHTML=muted(currentChat.match_id)
      ? '🔔 Unmute<small>Turn message notifications back on.</small>'
      : '🔕 Mute<small>Silence notifications for this conversation.</small>';
    el.classList.add('active');
  }

  async function toggleMute(){
    const id=currentChat?.match_id;
    if(!id)return;
    const next=!muted(id);
    setMuted(id,next);
    closeMenu();
    toast(next?'Chat muted 🔕':'Chat unmuted 🔔');
  }

  async function confirmUnmatch(){
    const chat=currentChat;
    if(!chat)return;
    closeMenu();
    showConfirm(
      'Unmatch?',
      `You and ${chat.full_name||'this member'} will no longer be matched. The conversation will disappear from Messages.`,
      'Unmatch',
      async()=>{
        const r=await client.from('matches').delete().eq('id',chat.match_id);
        if(r.error){toast(r.error.message||'Could not unmatch');return;}
        closeChatAndReturn('Unmatched');
      },true
    );
  }

  async function confirmBlock(){
    const chat=currentChat;
    if(!chat)return;
    closeMenu();
    showConfirm(
      'Block member?',
      `${chat.full_name||'This member'} will be blocked and this conversation will be removed from your Messages view.`,
      'Block',
      async()=>{
        setBlocked(chat.id,true);
        try{
          const r=await client.from('blocks').insert({blocker_id:user.id,blocked_id:chat.id});
          if(r.error && !/duplicate|unique/i.test(r.error.message||'')){
            console.warn('Block table unavailable or insert failed:',r.error);
          }
        }catch(e){console.warn('Block persistence unavailable:',e);}
        try{
          const r=await client.from('matches').delete().eq('id',chat.match_id);
          if(r.error)console.warn('Could not remove match after block:',r.error);
        }catch(e){}
        closeChatAndReturn('Member blocked');
      },true
    );
  }

  async function reportFlow(){
    const chat=currentChat;
    if(!chat)return;
    closeMenu();
    const reason=prompt('Why are you reporting this member?\n\nExamples: harassment, spam, fake profile, inappropriate content, safety concern.');
    if(!reason || !reason.trim())return;
    try{
      const r=await client.from('reports').insert({
        reporter_id:user.id,
        reported_id:chat.id,
        match_id:chat.match_id,
        reason:reason.trim()
      });
      if(r.error){
        toast('Report could not be submitted: '+r.error.message);
        return;
      }
      toast('Report submitted. Thank you.');
    }catch(e){
      toast('Report could not be submitted.');
    }
  }

  function closeChatAndReturn(message){
    $('chat').classList.remove('active');
    currentChat=null;
    loadChats();
    toast(message);
  }

  async function loadChatsNew(){
    const box=$('chatsList');
    if(!box || !user)return;
    box.innerHTML=`<div class="item"><div><strong>Your conversations</strong><small>Loading your matches...</small></div></div>`;
    try{
      const r=await client.from('matches')
        .select('id,user_one,user_two,created_at')
        .or(`user_one.eq.${user.id},user_two.eq.${user.id}`)
        .order('created_at',{ascending:false});
      if(r.error)throw r.error;
      const blockedIds=await getBlockedIds();
      const matchRows=(r.data||[]).filter(m=>!blockedIds.has(String(otherUserId(m))));
      if(!matchRows.length){
        box.innerHTML=`<div class="item"><div><strong>No conversations yet</strong><small>Your matches will appear here.</small></div></div>`;
        if(typeof updateNotificationBadges==='function')updateNotificationBadges();
        return;
      }
      const ids=matchRows.map(otherUserId);
      const p=await client.from('profiles').select('id,full_name,island,photo_url').in('id',ids);
      if(p.error)throw p.error;
      const byId=new Map((p.data||[]).map(x=>[x.id,x]));
      box.innerHTML=matchRows.map(m=>{
        const id=otherUserId(m),x=byId.get(id);if(!x)return '';
        const unread=typeof getUnreadCount==='function'?getUnreadCount(m.id):0;
        return `<div class="item ${unread>0?'unread':''}" data-chat-id="${esc(String(id))}" data-match-id="${Number(m.id)}">
          <img class="avatar" src="${esc(x.photo_url||'')}" alt="">
          <div style="min-width:0"><strong>${esc(x.full_name||'ISLA Member')}</strong><small>${esc(x.island||'Maldives')}${muted(m.id)?' · 🔕':''}</small></div>
          ${unread>0?`<span class="unread-count">${unread>99?'99+':unread}</span>`:''}
        </div>`;
      }).join('');
      box.querySelectorAll('[data-chat-id]').forEach(el=>el.onclick=()=>openChatById(el.dataset.chatId,Number(el.dataset.matchId)));
      if(typeof updateNotificationBadges==='function')updateNotificationBadges();
    }catch(e){
      console.error(e);
      box.innerHTML=`<div class="item"><div><strong>Could not load conversations</strong><small>${esc(e.message||'Unknown error')}</small></div></div>`;
    }
  }

  async function openChatNew(p){
    if(!p?.match_id){toast('This conversation has no match ID');return;}
    currentChat=p;
    if(typeof clearUnread==='function')clearUnread(p.match_id);
    $('chat').classList.add('active');
    $('chatName').textContent=p.full_name||'ISLA Member';
    $('chatAvatar').src=p.photo_url||'';
    $('chatInput').value='';
    if(typeof hideNotificationPopup==='function')hideNotificationPopup();
    await loadChatMessagesNew();
    setTimeout(()=>$('chatInput').focus(),100);
  }

  async function openChatByIdNew(id,matchId){
    const r=await client.from('profiles').select('*').eq('id',id).maybeSingle();
    if(r.error){toast(r.error.message);return;}
    if(r.data){r.data.match_id=Number(matchId);await openChatNew(r.data);}
  }

  async function loadChatMessagesNew(){
    const box=$('chatBody');
    box.innerHTML='<p style="color:#888">Loading...</p>';
    if(!currentChat?.match_id){box.innerHTML='<p style="color:#888">This conversation is not available.</p>';return;}
    const r=await client.from('messages').select('id,match_id,sender_id,message,created_at').eq('match_id',currentChat.match_id).order('created_at',{ascending:true});
    if(r.error){box.innerHTML=`<p style="color:#888">Could not load messages: ${esc(r.error.message)}</p>`;return;}
    box.innerHTML='';
    if(!r.data?.length){box.innerHTML='<div style="text-align:center;color:#777;padding:40px 10px"><div style="font-size:35px;margin-bottom:10px">💕</div><div>Say hello!</div></div>';return;}
    (r.data||[]).forEach(m=>{
      if(typeof knownMessageIds!=='undefined')knownMessageIds.add(String(m.id));
      const d=document.createElement('div');
      d.className='bubble '+(m.sender_id===user.id?'mine':'');
      d.textContent=m.message||'';
      box.appendChild(d);
    });
    box.scrollTop=box.scrollHeight;
  }

  async function sendMessageNew(e){
    e.preventDefault();
    const text=$('chatInput').value.trim();
    if(!text||!currentChat?.match_id)return;
    const b=e.submitter||$('chatForm').querySelector('button');
    b.disabled=true;
    try{
      const r=await client.from('messages').insert({match_id:currentChat.match_id,sender_id:user.id,message:text}).select().single();
      if(r.error){toast(r.error.message||'Could not send message');return;}
      if(r.data?.id && typeof knownMessageIds!=='undefined')knownMessageIds.add(String(r.data.id));
      $('chatInput').value='';
      await loadChatMessagesNew();
    }finally{b.disabled=false;}
  }

  window.showMessageNotification=async function(message){
    if(!message||!user)return;
    if(message.sender_id===user.id)return;
    if(muted(message.match_id))return;

    let senderName='Someone',senderPhoto='';
    try{
      const m=await client.from('matches').select('id,user_one,user_two').eq('id',message.match_id).maybeSingle();
      if(!m.error&&m.data){
        const senderId=m.data.user_one===message.sender_id?m.data.user_one:m.data.user_two;
        const p=await client.from('profiles').select('full_name,photo_url').eq('id',senderId).maybeSingle();
        if(!p.error&&p.data){
          senderName=p.data.full_name||'Someone';
          senderPhoto=p.data.photo_url||'';
        }
      }
    }catch(e){}

    if($('chat')?.classList.contains('active') && currentChat?.match_id===Number(message.match_id)){
      await loadChatMessagesNew();
      return;
    }

    if(typeof addUnread==='function')addUnread(Number(message.match_id));

    const popup=$('notificationPopup');
    if(popup){
      $('notificationAvatar').src=senderPhoto||'';
      $('notificationTitle').textContent=`💬 ${senderName}`;
      $('notificationMessage').textContent=message.message||'You received a new message.';
      popup.style.display='flex';
      requestAnimationFrame(()=>popup.classList.add('show'));
      clearTimeout(window.__chatNotificationTimer);
      window.__chatNotificationTimer=setTimeout(()=>{
        if(typeof hideNotificationPopup==='function')hideNotificationPopup();
      },5000);
    }else if(typeof toast==='function'){
      toast(`💬 New message from ${senderName}`);
    }
  };

  window.loadChats=loadChatsNew;
  window.openChatById=openChatByIdNew;
  window.openChat=openChatNew;
  window.loadChatMessages=loadChatMessagesNew;

  function wire(){
    const menu=$('chatMenuBtn');
    if(menu)menu.onclick=openMenu;

    const back=$('chatBack');
    if(back)back.onclick=()=>{
      $('chat').classList.remove('active');
      currentChat=null;
      loadChatsNew();
    };

    const form=$('chatForm');
    if(form)form.onsubmit=sendMessageNew;
  }

  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',wire);
  else
    wire();

})();
```
