/* Public branding is configurable; diary identity is always loaded from the signed-in backend. */
;(function(){
 const configured=Array.isArray(window.DIARY_CONFIG?.displayNames)?window.DIARY_CONFIG.displayNames:['我','你'];
 function names(users){return ['a','b'].map((id,i)=>String(users?.find(u=>u.id===id)?.name||configured[i]||['我','你'][i]).slice(0,20))}
 function emptyState(){const n=names();return {version:3,users:[{id:'a',name:n[0]},{id:'b',name:n[1]}],current:'a',bound:true,since:'2000-01-01',entries:[],products:[],notifications:[]}}
 function render(users){const n=names(users);for(const el of document.querySelectorAll('.diary-heading,.auth-eyebrow')){const cross=el.querySelector('.name-cross')?.cloneNode(true),suffix=document.createElement('small');suffix.textContent='の恋爱日记';if(cross)el.replaceChildren(document.createTextNode(n[0]+' '),cross,document.createTextNode(' '+n[1]+' '),suffix)}document.title=n.join(' × ')+' の恋爱日记'}
 window.DiaryBrand={emptyState,render};render();
})();
