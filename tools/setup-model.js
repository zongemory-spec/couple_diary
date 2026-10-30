;(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('../site/cloud.js').validate);else root.DiarySetup=factory(root.DiaryCloud.validate)})(typeof globalThis!=='undefined'?globalThis:this,function(validate){
 function prepare(input,installer){
  const {base,key}=validate({supabaseUrl:String(input.url||'').trim(),publishableKey:String(input.key||'').trim()});
  const config={supabaseUrl:base,publishableKey:key,displayNames:['我','你']};
  return {config,configText:'// Public browser config only. Never put server secrets here.\nwindow.DIARY_CONFIG = '+JSON.stringify(config,null,2).replace(/</g,'\\u003c')+';\n',sql:String(installer||'')};
 }
 return {prepare};
});
