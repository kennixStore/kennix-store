(()=>{
"use strict";
const endpoint="https://shdstohkbpvoxjtghsob.supabase.co/functions/v1/kennix-ai";
const HISTORY_KEY="kennix-ai-chat-v1";
const VOICE_KEY="kennix-ai-read-aloud-v1";
const launcher=document.createElement("button");
launcher.id="kennix-ai-launcher";
launcher.type="button";
launcher.innerHTML='<span aria-hidden="true">✦</span> KENNIX AI';
const panel=document.createElement("section");
panel.id="kennix-ai-panel";
panel.setAttribute("aria-label","KENNIX AI assistant");
panel.innerHTML=
'<header class="ka-head">'+
  '<div class="ka-brand">✦ KENNIX AI<small>YOUR STORE & EVERYDAY ASSISTANT</small></div>'+
  '<div class="ka-head-actions"><button id="ka-clear" type="button" aria-label="Clear saved conversation">Clear chat</button><button class="ka-close" type="button" aria-label="Close">×</button></div>'+
'</header>'+
'<div class="ka-body" id="ka-body"><p class="ka-intro">What would you like to explore today?</p></div>'+
'<div class="ka-compose">'+
  '<div class="ka-file" id="ka-file-name" aria-live="polite"></div>'+
  '<div class="ka-compose-row">'+
    '<button id="ka-attach" type="button" aria-label="Attach image or document" title="Attach image, PDF, TXT or CSV">＋</button>'+
    '<button id="ka-mic" type="button" aria-label="Speak your message" title="Speak your message">🎙</button>'+
    '<textarea id="ka-input" rows="1" maxlength="5000" placeholder="Ask KENNIX anything..." aria-label="Message KENNIX AI"></textarea>'+
    '<button id="ka-send" type="button" aria-label="Send message">➤</button>'+
  '</div>'+
  '<div class="ka-options"><label class="ka-read-toggle"><input id="ka-auto-read" type="checkbox"><span>Read replies aloud</span></label><button id="ka-stop-audio" type="button" disabled>Stop audio</button></div>'+
  '<input id="ka-file-input" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf,.txt,.csv,text/plain,text/csv">'+
  '<div class="ka-status" id="ka-status" role="status" aria-live="polite">Images, PDFs, TXT and CSV supported · Chat history stays on this device</div>'+
'</div>';
document.body.append(launcher,panel);

const body=panel.querySelector("#ka-body");
const input=panel.querySelector("#ka-input");
const send=panel.querySelector("#ka-send");
const fileInput=panel.querySelector("#ka-file-input");
const fileName=panel.querySelector("#ka-file-name");
const status=panel.querySelector("#ka-status");
const mic=panel.querySelector("#ka-mic");
const autoRead=panel.querySelector("#ka-auto-read");
const stopAudio=panel.querySelector("#ka-stop-audio");
let history=loadHistory();
let attachment=null;
let busy=false;
let recognition=null;
let listening=false;
let activeUtterance=null;
let activeVoiceButton=null;

try{autoRead.checked=localStorage.getItem(VOICE_KEY)==="true";}catch(_){autoRead.checked=false;}
renderHistory();

function loadHistory(){
  try{
    const parsed=JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");
    if(!Array.isArray(parsed))return [];
    return parsed.filter(m=>m&&["user","assistant"].includes(m.role)&&typeof m.content==="string")
      .map(m=>({role:m.role,content:m.content.slice(0,5000)})).slice(-12);
  }catch(_){return [];}
}
function saveHistory(){
  history=history.slice(-12);
  try{localStorage.setItem(HISTORY_KEY,JSON.stringify(history));}
  catch(_){status.textContent="This browser could not save chat history. The current chat will still work.";}
}
function scrollBottom(){body.scrollTop=body.scrollHeight;}
function showIntro(){
  const intro=document.createElement("p");
  intro.className="ka-intro";
  intro.textContent="What would you like to explore today?";
  body.append(intro);
}
function addMessage(text,role,controls){
  const bubble=document.createElement("div");
  bubble.className="ka-msg "+(role==="user"?"ka-user":"ka-assistant");
  const content=document.createElement("div");
  content.className="ka-message-text";
  content.textContent=text;
  bubble.append(content);
  if(role==="assistant"&&controls!==false){
    const actions=document.createElement("div");
    actions.className="ka-message-actions";
    const listenButton=document.createElement("button");
    listenButton.type="button";
    listenButton.className="ka-listen";
    listenButton.textContent="🔊 Listen";
    listenButton.setAttribute("aria-label","Read this answer aloud");
    listenButton.addEventListener("click",()=>speak(text,listenButton));
    actions.append(listenButton);
    bubble.append(actions);
  }
  body.append(bubble);
  scrollBottom();
  return {container:bubble,textElement:content};
}
function renderHistory(){
  if(!history.length)return;
  history.forEach(m=>addMessage(m.content,m.role));
}
function appendSources(message,sources){
  if(!Array.isArray(sources)||!sources.length)return;
  const list=document.createElement("div");
  list.className="ka-sources";
  const label=document.createElement("div");
  label.className="ka-sources-title";
  label.textContent="SOURCES";
  list.append(label);
  sources.forEach(source=>{
    if(!source||typeof source.uri!=="string"||!/^https?:\/\//i.test(source.uri))return;
    const link=document.createElement("a");
    link.href=source.uri;
    link.target="_blank";
    link.rel="noopener noreferrer";
    link.textContent=String(source.title||source.uri).slice(0,180);
    list.append(link);
  });
  if(list.children.length>1)message.container.append(list);
}
function resetVoiceButton(){
  if(activeVoiceButton){
    activeVoiceButton.textContent="🔊 Listen";
    activeVoiceButton.classList.remove("ka-speaking");
  }
  activeVoiceButton=null;
  activeUtterance=null;
  stopAudio.disabled=true;
}
function stopSpeaking(){
  if("speechSynthesis" in window)window.speechSynthesis.cancel();
  resetVoiceButton();
}
function speak(text,button){
  if(!("speechSynthesis" in window)||!("SpeechSynthesisUtterance" in window)){
    status.textContent="Audio playback is not supported by this browser.";
    return;
  }
  if(activeUtterance&&activeVoiceButton===button){
    if(window.speechSynthesis.paused){
      window.speechSynthesis.resume();
      button.textContent="⏸ Pause";
    }else if(window.speechSynthesis.speaking){
      window.speechSynthesis.pause();
      button.textContent="▶ Resume";
    }
    return;
  }
  stopSpeaking();
  const utterance=new SpeechSynthesisUtterance(text.slice(0,12000));
  utterance.lang="en-NG";
  utterance.rate=1;
  utterance.pitch=1;
  const voices=window.speechSynthesis.getVoices();
  const voice=voices.find(v=>/^en-NG$/i.test(v.lang))||
    voices.find(v=>/^en-GB/i.test(v.lang))||
    voices.find(v=>/^en-US/i.test(v.lang));
  if(voice)utterance.voice=voice;
  activeUtterance=utterance;
  activeVoiceButton=button;
  button.classList.add("ka-speaking");
  button.textContent="⏸ Pause";
  stopAudio.disabled=false;
  utterance.onend=resetVoiceButton;
  utterance.onerror=resetVoiceButton;
  window.speechSynthesis.speak(utterance);
}
function startListening(){
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){
    status.textContent="Voice typing is not available in this browser. Try the latest Chrome.";
    return;
  }
  if(listening&&recognition){recognition.stop();return;}
  const base=input.value.trim();
  let finalText="";
  let interimText="";
  recognition=new Recognition();
  recognition.lang="en-NG";
  recognition.continuous=false;
  recognition.interimResults=true;
  recognition.maxAlternatives=1;
  recognition.onstart=()=>{
    listening=true;
    mic.classList.add("ka-listening");
    mic.textContent="■";
    mic.setAttribute("aria-label","Stop voice recording");
    status.textContent="Listening… Speak now. Tap the microphone to stop.";
  };
  recognition.onresult=event=>{
    interimText="";
    for(let i=event.resultIndex;i<event.results.length;i++){
      const transcript=event.results[i][0].transcript;
      if(event.results[i].isFinal)finalText+=transcript+" ";
      else interimText+=transcript;
    }
    input.value=[base,finalText.trim(),interimText.trim()].filter(Boolean).join(" ").slice(0,5000);
  };
  recognition.onerror=event=>{
    const messages={
      "not-allowed":"Microphone permission was blocked. Allow microphone access in your browser settings.",
      "service-not-allowed":"This browser blocked voice input.",
      "no-speech":"No speech was detected. Tap the microphone and try again.",
      "network":"Voice recognition needs an active internet connection."
    };
    status.textContent=messages[event.error]||"Voice input stopped. You can type your message instead.";
  };
  recognition.onend=()=>{
    listening=false;
    mic.classList.remove("ka-listening");
    mic.textContent="🎙";
    mic.setAttribute("aria-label","Speak your message");
    input.value=[base,finalText.trim()].filter(Boolean).join(" ").slice(0,5000);
    if(finalText.trim())status.textContent="Voice captured. Review your message, then tap Send.";
  };
  try{recognition.start();}
  catch(_){status.textContent="Could not start voice input. Please try again.";}
}
function stopListening(){
  if(listening&&recognition){
    try{recognition.stop();}catch(_){}
  }
}
function readTextFile(file){
  if(typeof file.text==="function")return file.text();
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||""));
    reader.onerror=()=>reject(new Error("Could not read the text file."));
    reader.readAsText(file);
  });
}
function readBinaryFile(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result).split(",")[1]||"");
    reader.onerror=()=>reject(new Error("Could not read the attachment."));
    reader.readAsDataURL(file);
  });
}
function isTextFile(file){
  return /\.(txt|csv)$/i.test(file.name)||file.type==="text/plain"||file.type==="text/csv";
}
launcher.addEventListener("click",()=>{panel.classList.add("open");input.focus();});
panel.querySelector(".ka-close").addEventListener("click",()=>{
  stopListening();stopSpeaking();panel.classList.remove("open");
});
panel.querySelector("#ka-attach").addEventListener("click",()=>fileInput.click());
panel.querySelector("#ka-mic").addEventListener("click",startListening);
panel.querySelector("#ka-stop-audio").addEventListener("click",stopSpeaking);
panel.querySelector("#ka-auto-read").addEventListener("change",()=>{
  try{localStorage.setItem(VOICE_KEY,String(autoRead.checked));}catch(_){}
  status.textContent=autoRead.checked?"Voice replies are on. New answers will be read aloud.":"Voice replies are off. Tap Listen on any answer to hear it.";
});
panel.querySelector("#ka-clear").addEventListener("click",()=>{
  if(!window.confirm("Clear the conversation saved on this device?"))return;
  stopListening();stopSpeaking();
  history=[];
  try{localStorage.removeItem(HISTORY_KEY);}catch(_){}
  body.replaceChildren();
  showIntro();
  status.textContent="Chat cleared. A fresh conversation is ready.";
});
fileInput.addEventListener("change",()=>{
  const file=fileInput.files&&fileInput.files[0];
  if(!file){attachment=null;fileName.textContent="";return;}
  const supported=isTextFile(file)||["image/jpeg","image/png","image/webp","application/pdf"].includes(file.type)||/\.pdf$/i.test(file.name);
  if(!supported){
    status.textContent="This file type is not supported. Use JPG, PNG, WebP, PDF, TXT or CSV.";
    fileInput.value="";attachment=null;return;
  }
  if(file.size>8*1024*1024){
    status.textContent="File too large. Maximum size is 8 MB.";
    fileInput.value="";attachment=null;return;
  }
  attachment=file;
  fileName.textContent="Attached: "+file.name;
  status.textContent="Ready to analyse "+file.name+".";
});
async function submit(){
  if(busy)return;
  stopListening();
  const question=input.value.trim();
  if(!question&&!attachment)return;
  const chosen=attachment;
  const prompt=question||(chosen?"Please analyse the attached file: "+chosen.name:"");
  addMessage(prompt+(chosen?"\n📎 "+chosen.name:""),"user",false);
  input.value="";
  attachment=null;
  fileInput.value="";
  fileName.textContent="";
  history.push({role:"user",content:prompt});
  history=history.slice(-12);
  saveHistory();
  const thinking=addMessage("KENNIX AI is thinking…","assistant",false);
  busy=true;
  send.disabled=true;
  status.textContent="Connecting securely…";
  try{
    const payload={messages:history};
    if(chosen){
      if(isTextFile(chosen)){
        const text=await readTextFile(chosen);
        if(text.length>120000)throw new Error("Text and CSV files must contain no more than 120,000 characters.");
        payload.attachment={name:chosen.name,type:/\.csv$/i.test(chosen.name)||chosen.type==="text/csv"?"text/csv":"text/plain",text:text};
      }else{
        payload.attachment={name:chosen.name,type:chosen.type||"application/pdf",data:await readBinaryFile(chosen)};
      }
    }
    const controller=new AbortController();
    const requestTimer=setTimeout(()=>controller.abort(),80000);
    let response;
    try{
      response=await fetch(endpoint,{
        signal:controller.signal,
        method:"POST",
        headers:{"Content-Type":"application/json","apikey":"sb_publishable_Izj2oO2eLyzA_gghnKnxo"},
        body:JSON.stringify(payload)
      });
    }finally{clearTimeout(requestTimer);}
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"KENNIX AI is temporarily unavailable. Please try again.");
    const answer=data.reply||"I couldn't generate a response. Please try again.";
    thinking.textElement.textContent=answer;
    const listenButton=document.createElement("button");
    listenButton.type="button";
    listenButton.className="ka-listen";
    listenButton.textContent="🔊 Listen";
    listenButton.setAttribute("aria-label","Read this answer aloud");
    listenButton.addEventListener("click",()=>speak(answer,listenButton));
    const actions=document.createElement("div");
    actions.className="ka-message-actions";
    actions.append(listenButton);
    thinking.container.append(actions);
    appendSources(thinking,data.sources);
    history.push({role:"assistant",content:answer});
    history=history.slice(-12);
    saveHistory();
    status.textContent=autoRead.checked?"Reading the answer aloud…":"You’re chatting with KENNIX AI.";
    if(autoRead.checked)speak(answer,listenButton);
  }catch(error){
    thinking.textElement.textContent=error.name==="AbortError"?
      "KENNIX AI took too long to respond. Please try again.":
      (error.message||"Connection error. Please try again.");
    history.pop();
    saveHistory();
    status.textContent="Check your connection and try again.";
  }finally{
    busy=false;
    send.disabled=false;
    scrollBottom();
  }
}
send.addEventListener("click",submit);
input.addEventListener("keydown",event=>{
  if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();submit();}
});
})();