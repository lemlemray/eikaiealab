/* 英会話ラボ：話し相手5人のデータと顔の描画（紹介ページ用。アプリ本体にも同じものが入っています） */
(() => {
const PARTNERS = [
  { id:'emma', name:'Emma', loc:'London, UK', voice:'Aoede', tts:'en-GB', color:'#d9573b',
    skin:'#f1c8a6', hair:'#6b3f22', style:'bob', iris:'#3f6f8f', shirt:'#2f5d8a', glasses:false,
    tags:['やさしい','ゆっくり','初心者向け'],
    desc:'ロンドン在住の英語講師。ゆっくり、はっきり話し、言葉に詰まっても待ってくれます。はじめての英会話に。',
    persona:'Emma, a warm and patient English teacher who lives in London. Speak with a British accent, slowly and clearly, using simple everyday words. If the learner struggles, rephrase more simply and encourage them kindly.' },
  { id:'jake', name:'Jake', loc:'San Diego, USA', voice:'Puck', tts:'en-US', color:'#e09a22',
    skin:'#e6b088', hair:'#d6a23c', style:'messy', iris:'#4f7a3a', shirt:'#f0a13a', glasses:false,
    tags:['カジュアル','スラング','元気'],
    desc:'海とサーフィンが好きなカリフォルニアの大学生。くだけた日常英語や、よく使うスラングに慣れたい人に。',
    persona:'Jake, an upbeat college student from San Diego who loves surfing and music. Speak casual American English with natural everyday slang (and briefly explain a slang word if the learner seems confused). Be energetic and funny.' },
  { id:'olivia', name:'Olivia', loc:'New York, USA', voice:'Kore', tts:'en-US', color:'#3a47d5',
    skin:'#8c5a3c', hair:'#1f1a1a', style:'bun', iris:'#3b2618', shirt:'#1f2a44', glasses:false, earrings:true,
    tags:['ビジネス','面接','会議'],
    desc:'ニューヨークのキャリアコーチ。面接、会議、プレゼンで使うきちんとした英語を練習したい人に。',
    persona:'Olivia, a professional career coach in New York. Speak clear, polished American business English. Ask thoughtful follow-up questions like a real interviewer or colleague, and model polite professional phrasing.' },
  { id:'liam', name:'Liam', loc:'Sydney, Australia', voice:'Fenrir', tts:'en-AU', color:'#2e9a73',
    skin:'#efc19e', hair:'#9a4f2a', style:'short', iris:'#4d6a86', shirt:'#2e8a69', glasses:false, beard:true,
    tags:['旅行','雑談','聞き上手'],
    desc:'シドニー出身のバックパッカー。旅や食べ物の話を広げてくれる聞き上手。気楽におしゃべりしたい人に。',
    persona:'Liam, a friendly backpacker from Sydney who has travelled across Asia. Speak relaxed Australian English. You are a great listener: react with interest, share short travel stories, and ask about the learner\'s experiences.' },
  { id:'grace', name:'Grace', loc:'Toronto, Canada', voice:'Leda', tts:'en-CA', color:'#8a55b8',
    skin:'#f4d2b6', hair:'#c9c6c2', style:'long', iris:'#5a6f5a', shirt:'#7c4fa6', glasses:true,
    tags:['本・映画','じっくり','中上級'],
    desc:'トロントの元図書館司書。本や映画、考えごとについて、じっくり深く話したい人に。',
    persona:'Grace, a retired librarian from Toronto who loves novels, films and ideas. Speak thoughtful, gentle Canadian English with a slightly richer vocabulary. Ask about opinions and reasons, and invite the learner to explain in more detail.' },
];

/* ---- 顔を描く（オリジナルのイラスト。口・目・眉を声に合わせて動かす） ---- */
function shade(hex, amt){
  const n = parseInt(hex.slice(1),16);
  const c = [n>>16, (n>>8)&255, n&255].map(v => Math.max(0, Math.min(255, Math.round(v + amt*255))));
  return '#' + c.map(v => v.toString(16).padStart(2,'0')).join('');
}
function drawFace(g, W, p, st={}){
  const open = st.open||0, wide = st.wide ?? .5, blink = st.blink ?? 1, brow = st.brow||0, bob = st.bob||0, tilt = st.tilt||0, look = st.look||0;
  g.save(); g.clearRect(0,0,W,W); g.scale(W/400, W/400);
  // 肩と服
  g.fillStyle = p.shirt;
  g.beginPath(); g.moveTo(40,400); g.bezierCurveTo(50,330,110,318,170,312); g.lineTo(230,312); g.bezierCurveTo(290,318,350,330,360,400); g.closePath(); g.fill();
  g.fillStyle = shade(p.shirt,-.08);
  g.beginPath(); g.moveTo(160,314); g.lineTo(200,368); g.lineTo(240,314); g.closePath(); g.fill();
  g.translate(200, 320 + bob); g.rotate(tilt); g.translate(-200, -320);
  // 首
  g.fillStyle = shade(p.skin,-.07);
  g.beginPath(); g.moveTo(172,262); g.lineTo(228,262); g.lineTo(232,318); g.quadraticCurveTo(200,352,168,318); g.closePath(); g.fill();
  // 後ろ髪
  g.fillStyle = p.hair;
  if(p.style === 'bob'){ g.beginPath(); g.ellipse(200,172,114,120,0,Math.PI,0); g.lineTo(314,262); g.quadraticCurveTo(314,288,288,288); g.lineTo(112,288); g.quadraticCurveTo(86,288,86,262); g.closePath(); g.fill(); }
  if(p.style === 'long'){ g.beginPath(); g.ellipse(200,176,118,124,0,Math.PI,0); g.lineTo(326,352); g.quadraticCurveTo(300,372,270,350); g.lineTo(130,350); g.quadraticCurveTo(100,372,74,352); g.closePath(); g.fill(); }
  if(p.style === 'bun'){ g.beginPath(); g.arc(200,72,38,0,Math.PI*2); g.fill(); }
  // 耳と顔
  g.fillStyle = p.skin;
  g.beginPath(); g.ellipse(110,198,14,22,0,0,Math.PI*2); g.ellipse(290,198,14,22,0,0,Math.PI*2); g.fill();
  g.beginPath(); g.ellipse(200,190,90,108,0,0,Math.PI*2); g.fill();
  if(p.earrings){ g.fillStyle = '#e2b84a'; g.beginPath(); g.arc(108,226,6,0,Math.PI*2); g.arc(292,226,6,0,Math.PI*2); g.fill(); }
  // ほお
  g.fillStyle = 'rgba(235,110,110,.16)';
  g.beginPath(); g.ellipse(148,232,18,11,0,0,Math.PI*2); g.ellipse(252,232,18,11,0,0,Math.PI*2); g.fill();
  // ひげ
  if(p.beard){
    g.fillStyle = shade(p.hair,-.05);
    g.beginPath(); g.moveTo(116,210); g.quadraticCurveTo(118,296,200,302); g.quadraticCurveTo(282,296,284,210);
    g.quadraticCurveTo(268,268,200,272); g.quadraticCurveTo(132,268,116,210); g.fill();
    g.beginPath(); g.moveTo(170,240); g.quadraticCurveTo(200,228,230,240); g.quadraticCurveTo(200,236,170,240); g.lineWidth = 7; g.strokeStyle = shade(p.hair,-.05); g.stroke();
  }
  // 前髪
  g.fillStyle = p.hair;
  g.beginPath();
  if(p.style === 'bob'){ g.moveTo(104,176); g.quadraticCurveTo(108,80,200,78); g.quadraticCurveTo(292,80,296,176); g.quadraticCurveTo(262,128,214,140); g.quadraticCurveTo(160,122,104,176); }
  else if(p.style === 'messy'){ [[132,132,32],[158,104,36],[198,92,40],[240,102,36],[268,132,32],[218,124,28],[178,120,28],[116,160,18],[284,160,18]].forEach(([x,y,r]) => { g.moveTo(x+r,y); g.arc(x,y,r,0,Math.PI*2); }); }
  else if(p.style === 'bun'){ g.moveTo(108,172); g.quadraticCurveTo(112,84,200,82); g.quadraticCurveTo(288,84,292,172); g.quadraticCurveTo(262,112,200,110); g.quadraticCurveTo(138,112,108,172); }
  else if(p.style === 'short'){ g.moveTo(110,162); g.quadraticCurveTo(114,90,200,86); g.quadraticCurveTo(286,90,290,162); g.quadraticCurveTo(272,116,214,114); g.quadraticCurveTo(150,110,110,162); }
  else if(p.style === 'long'){ g.moveTo(108,196); g.quadraticCurveTo(104,88,200,82); g.quadraticCurveTo(296,88,292,196); g.quadraticCurveTo(278,118,206,106); g.quadraticCurveTo(150,118,108,196); }
  g.fill();
  // 眉
  g.strokeStyle = shade(p.hair, p.style==='long' ? -.25 : -.1); g.lineWidth = 6; g.lineCap = 'round';
  const by = 164 - brow*7;
  g.beginPath(); g.moveTo(148,by+3); g.quadraticCurveTo(165,by-5,182,by+1); g.moveTo(218,by+1); g.quadraticCurveTo(235,by-5,252,by+3); g.stroke();
  // 目
  [165,235].forEach(cx => {
    const h = Math.max(1.2, 11*blink);
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(cx,192,15,h,0,0,Math.PI*2); g.fill();
    if(blink > .25){
      g.save(); g.beginPath(); g.ellipse(cx,192,15,h,0,0,Math.PI*2); g.clip();
      g.fillStyle = p.iris; g.beginPath(); g.arc(cx+look*4,193,8.5,0,Math.PI*2); g.fill();
      g.fillStyle = '#16120f'; g.beginPath(); g.arc(cx+look*4,193,4.2,0,Math.PI*2); g.fill();
      g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(cx+look*4+3,190,2.2,0,Math.PI*2); g.fill();
      g.restore();
    }
    g.strokeStyle = shade(p.skin,-.35); g.lineWidth = 2.4;
    g.beginPath(); g.ellipse(cx,192,15,h,0,Math.PI*1.05,Math.PI*1.95); g.stroke();
  });
  if(p.glasses){
    g.strokeStyle = '#3a3330'; g.lineWidth = 3.4;
    g.beginPath(); g.roundRect(143,176,44,32,10); g.roundRect(213,176,44,32,10); g.moveTo(187,190); g.quadraticCurveTo(200,183,213,190); g.stroke();
  }
  // 鼻
  g.strokeStyle = shade(p.skin,-.22); g.lineWidth = 3;
  g.beginPath(); g.moveTo(201,204); g.quadraticCurveTo(194,222,196,226); g.quadraticCurveTo(201,229,207,226); g.stroke();
  // 口（声の大きさ＝開き、響き＝横幅）
  const cy = 250, wh = 17 + 13*wide - 5*open, hh = 3 + 36*open;
  const lip = shade(p.skin, p.skin < '#a' ? -.2 : -.28);
  if(open < .06){
    g.strokeStyle = lip; g.lineWidth = 4;
    g.beginPath(); g.moveTo(200-wh-2,cy-2); g.quadraticCurveTo(200,cy+9,200+wh+2,cy-2); g.stroke();
  } else {
    g.save();
    g.beginPath(); g.moveTo(200-wh,cy); g.quadraticCurveTo(200,cy-hh*.35-3,200+wh,cy); g.quadraticCurveTo(200,cy+hh,200-wh,cy); g.closePath();
    g.fillStyle = '#4a1d24'; g.fill(); g.clip();
    if(open > .22){ g.fillStyle = '#fbfaf7'; g.fillRect(200-wh,cy-hh*.35-4,wh*2,Math.min(8,hh*.32)); }
    if(open > .38){ g.fillStyle = '#d4646c'; g.beginPath(); g.ellipse(200,cy+hh*.8,wh*.62,hh*.42,0,0,Math.PI*2); g.fill(); }
    g.restore();
    g.strokeStyle = lip; g.lineWidth = 3.2;
    g.beginPath(); g.moveTo(200-wh,cy); g.quadraticCurveTo(200,cy-hh*.35-3,200+wh,cy); g.quadraticCurveTo(200,cy+hh,200-wh,cy); g.closePath(); g.stroke();
  }
  g.restore();
}


window.ELFaces = { PARTNERS, drawFace };
})();
