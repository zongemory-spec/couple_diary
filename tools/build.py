from pathlib import Path
import re, json, base64, hashlib, html, os
ROOT=Path(__file__).resolve().parents[1]
site=ROOT/'site';out=ROOT/'dist';out.mkdir(exist_ok=True)
page=(site/'index.html').read_text(encoding='utf-8-sig');scripts=[]
mime={'.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml'}
def data(p):return 'data:'+mime[p.suffix]+';base64,'+base64.b64encode(p.read_bytes()).decode()
assets={p.relative_to(site).as_posix():data(p) for p in (site/'assets').iterdir() if p.is_file()};assets['icon.svg']=data(site/'icon.svg')
def embed(text):
 for name,value in assets.items():text=text.replace(name,value)
 return text
def script(m):
 name=m.group(1);code=(site/name).read_text(encoding='utf-8-sig')
 if name=='config.js':
  # Refuse accidentally embedded server credentials before creating a public artifact.
  values={field:(re.search(r'''(?:["']?'''+field+r'''["']?)\s*:\s*(["'])(.*?)\1''',code,re.S).group(2) if re.search(r'''(?:["']?'''+field+r'''["']?)\s*:\s*(["'])(.*?)\1''',code,re.S) else '') for field in ['supabaseUrl','publishableKey']}
  file_key=values['publishableKey'];file_url=values['supabaseUrl']
  if file_key or file_url:
   if not re.fullmatch(r'https://[a-z0-9-]+\.supabase\.co/?',file_url):raise ValueError('Invalid public Project URL in config.js')
   if not file_key.startswith('sb_publishable_'):
    try:
     payload=file_key.split('.')[1];role=json.loads(base64.urlsafe_b64decode(payload+'='*((4-len(payload)%4)%4)))['role']
    except Exception:role=''
    if role!='anon':raise ValueError('config.js must use a public Publishable/anon key, never a server secret')
  url=os.environ.get('SUPABASE_URL','').strip();key=os.environ.get('SUPABASE_PUBLISHABLE_KEY','').strip()
  if url or key:
   if not re.fullmatch(r'https://[a-z0-9-]+\.supabase\.co/?',url) or not key.startswith('sb_publishable_'):raise ValueError('Set a valid SUPABASE_URL and public SUPABASE_PUBLISHABLE_KEY together; never use a server secret.')
   code='window.DIARY_CONFIG='+json.dumps({'supabaseUrl':url.rstrip('/'),'publishableKey':key,'displayNames':['我','你']},ensure_ascii=False)+';'
  code='window.DIARY_SINGLE_FILE=true;\n'+code
 if re.search(r'</script',code,re.I):raise ValueError('Unexpected closing script tag in '+name)
 scripts.append(code);return '<script>'+code+'</script>'
page=re.sub(r'<script src="([^"]+)"></script>',script,page)
page=re.sub(r'<link rel="stylesheet" href="([^"]+)">',lambda m:'<style>'+embed((site/m.group(1)).read_text(encoding='utf-8-sig'))+'</style>',page)
page=embed(page)
manifest=json.loads((site/'manifest.webmanifest').read_text(encoding='utf-8-sig'));manifest['icons'][0]['src']=assets['icon.svg'];manifest.update(id='/',start_url='/',scope='/')
page=page.replace('href="manifest.webmanifest"','href="data:application/manifest+json;base64,'+base64.b64encode(json.dumps(manifest,ensure_ascii=False).encode()).decode()+'"')
hashes=' '.join("'sha256-"+base64.b64encode(hashlib.sha256(s.encode()).digest()).decode()+"'" for s in scripts)
csp="default-src 'none'; script-src "+hashes+"; style-src 'unsafe-inline'; img-src data: blob: https://*.supabase.co; connect-src https://*.supabase.co; font-src data:; manifest-src data:; object-src 'none'; base-uri 'none'; form-action 'self'"
page=page.replace('<meta charset="UTF-8">','<meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="'+html.escape(csp,quote=True)+'">',1)
if re.search(r'<script[^>]+src=|<link[^>]+rel="stylesheet"',page):raise ValueError('Unbundled assets remain')
(out/'index.html').write_text(page,encoding='utf-8')
(out/'_headers').write_text("/*\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Cache-Control: no-cache\n  Content-Security-Policy: "+csp+"; frame-ancestors 'none'\n",encoding='utf-8')
print('Built dist/index.html and dist/_headers. No backend credentials are needed to build.')
