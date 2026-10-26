;(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('../site/cloud.js').validate);else root.DiarySetup=factory(root.DiaryCloud.validate)})(typeof globalThis!=='undefined'?globalThis:this,function(validate){
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 function prepare(input,installer){
  const names=[input.nameA,input.nameB].map(x=>String(x||'').trim());if(names.some(x=>!x||x.length>20))throw Error('请填写两个称呼，各不超过20个字符。');
  const a=String(input.userA||'').trim().toLowerCase(),b=String(input.userB||'').trim().toLowerCase();if(!uuid.test(a)||!uuid.test(b)||a===b)throw Error('请填写两个不同的用户UUID，不是邮箱地址或密码。');
  const date=String(input.since||''),today=new Date();const local=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||date>local)throw Error('请选择今天或过去的真实纪念日。');
  const {base,key}=validate({supabaseUrl:String(input.url||'').trim(),publishableKey:String(input.key||'').trim()});
  const config={supabaseUrl:base,publishableKey:key,displayNames:names};
  const json=JSON.stringify({a,b,names,since:date}),bytes=new TextEncoder().encode(json),encoded=btoa(Array.from(bytes,x=>String.fromCharCode(x)).join(''));
  const binding=`\n-- 个性化初始化：验证两个现有Auth用户，拒绝覆盖其他情侣的绑定。\nbegin;\ndo $diary_setup$\ndeclare d jsonb:=convert_from(decode('${encoded}','base64'),'UTF8')::jsonb; a uuid; b uuid;\nbegin\n a:=(d->>'a')::uuid;b:=(d->>'b')::uuid;\n if a=b or (select count(*) from auth.users where id in(a,b))<>2 then raise exception '请先创建两个不同的登录用户，再核对UUID';end if;\n if exists(select 1 from public.diary_members m where not((m.slot='a' and m.user_id=a) or (m.slot='b' and m.user_id=b))) then raise exception '已有其他成员绑定：请在自己的全新项目中安装，不能覆盖';end if;\n insert into public.diary_members(user_id,slot) values(a,'a'),(b,'b') on conflict(user_id) do nothing;\n update public.diary_house set body=jsonb_set(jsonb_set(body,'{users}',jsonb_build_array(jsonb_build_object('id','a','name',d->'names'->>0),jsonb_build_object('id','b','name',d->'names'->>1))),'{since}',d->'since'),revision=revision+1,updated_at=now() where id=1;\nend $diary_setup$;\ncommit;\nselect slot as member_slot from public.diary_members order by slot;\n`;
  return {config,configText:'// Public browser config. Never put passwords or server secrets here.\nwindow.DIARY_CONFIG = '+JSON.stringify(config,null,2).replace(/</g,'\\u003c')+';\n',sql:String(installer||'')+binding};
 }
 return {prepare};
});
